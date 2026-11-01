'use strict';

const { assetReferenceFindings } = require('./zss_asset_catalog');

function severity(vscode, value) {
  return value === 'error' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning;
}

function findingDiagnostic(vscode, document, finding) {
  const reference = finding.reference, line = Math.max(0, Math.min(reference.line, document.lineCount - 1));
  const width = document.lineAt(line).text.length, start = Math.max(0, Math.min(reference.character || 0, width));
  const end = Math.max(start, Math.min(start + Math.max(1, reference.length || 1), width));
  const diagnostic = new vscode.Diagnostic(new vscode.Range(line, start, line, end), finding.message, severity(vscode, finding.severity));
  diagnostic.code = finding.code;
  diagnostic.source = 'IKEMEN ZSS Assets';
  return diagnostic;
}

function registerZssAssetDiagnostics(vscode, context, getCatalog, delay = 250) {
  const collection = vscode.languages.createDiagnosticCollection('ikemen-zss-assets'), timers = new Map(), generations = new Map();
  const keyFor = document => document.uri.toString();
  const update = async (document, scheduledGeneration) => {
    if (!document || document.languageId !== 'zss' || document.uri.scheme !== 'file') return;
    const key = keyFor(document), generation = scheduledGeneration === undefined ? (generations.get(key) || 0) + 1 : scheduledGeneration, version = document.version;
    if (scheduledGeneration === undefined) generations.set(key, generation);
    let catalog;
    try { catalog = await getCatalog(document); }
    catch (_) { catalog = { kinds: {} }; }
    // Catalog resolution reads multiple files. Never publish a result derived
    // from text that changed while those reads were in flight.
    if (generations.get(key) !== generation || document.version !== version) return;
    const diagnostics = assetReferenceFindings(catalog, document.getText(), document.fileName)
      .map(finding => findingDiagnostic(vscode, document, finding));
    collection.set(document.uri, diagnostics);
  };
  const schedule = document => {
    if (!document || document.languageId !== 'zss' || document.uri.scheme !== 'file') return;
    const key = keyFor(document), generation = (generations.get(key) || 0) + 1;
    generations.set(key, generation); clearTimeout(timers.get(key));
    timers.set(key, setTimeout(() => { timers.delete(key); void update(document, generation); }, delay));
  };
  const refreshOpenZss = () => { for (const document of vscode.workspace.textDocuments || []) schedule(document); };
  const isAssetDependency = document => /\.(?:air|sff|snd|def|ini)$/i.test(document?.fileName || '');
  context.subscriptions.push(
    collection,
    vscode.workspace.onDidOpenTextDocument(document => schedule(document)),
    vscode.workspace.onDidChangeTextDocument(event => {
      if (event.document.languageId === 'zss') schedule(event.document);
      else if (isAssetDependency(event.document)) refreshOpenZss();
    }),
    vscode.workspace.onDidSaveTextDocument(document => {
      if (document.languageId === 'zss') schedule(document);
      if (isAssetDependency(document)) refreshOpenZss();
    }),
    vscode.workspace.onDidCloseTextDocument(document => {
      const key = keyFor(document); clearTimeout(timers.get(key)); timers.delete(key); generations.delete(key); collection.delete(document.uri);
      if (isAssetDependency(document)) refreshOpenZss();
    })
  );
  for (const document of vscode.workspace.textDocuments || []) schedule(document);
  return { collection, update, schedule };
}

module.exports = { findingDiagnostic, registerZssAssetDiagnostics };
