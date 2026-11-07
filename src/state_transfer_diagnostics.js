'use strict';

const { hash } = require('./zss_function_catalog');
const { parseStateSource, usesCharacterCatalog } = require('./state_transfer_model');
const { stateCatalogStillCurrent, stateTransferFindings } = require('./state_transfer_catalog');

const MAX_STATE_DIAGNOSTICS = 500;

function supported(document) { return Boolean(document?.uri?.scheme === 'file' && (['zss', 'ikemen-cns'].includes(document.languageId) || /\.(?:zss|cns|cmd|st)$/i.test(document.fileName || ''))); }
function severity(vscode, value) { return value === 'error' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning; }
function diagnosticFor(vscode, document, finding) {
  const record = finding.record, startLine = Math.max(0, Math.min(record.line, document.lineCount - 1)), endLine = Math.max(startLine, Math.min(record.endLine ?? startLine, document.lineCount - 1));
  const start = Math.max(0, Math.min(record.character, document.lineAt(startLine).text.length)), end = Math.max(start, Math.min(record.endCharacter ?? start + 1, document.lineAt(endLine).text.length));
  const diagnostic = new vscode.Diagnostic(new vscode.Range(startLine, start, endLine, end), finding.message, severity(vscode, finding.severity));
  diagnostic.code = finding.code; diagnostic.source = 'IKEMEN State Integrity'; return diagnostic;
}

function registerStateTransferDiagnostics(vscode, context, getCatalog, options = {}) {
  const collection = vscode.languages.createDiagnosticCollection('ikemen-state-transfer'), delay = Number.isFinite(options.delay) ? Math.max(0, options.delay) : 250;
  const validateCatalog = options.validateCatalog || (catalog => stateCatalogStillCurrent(vscode, catalog, options.service));
  const timers = new Map(), generations = new Map(); let disposed = false;
  const keyFor = document => document.uri.toString();
  const current = (document, key, generation, version, textHash) => !disposed && generations.get(key) === generation && document.version === version && hash(document.getText()) === textHash;
  const update = async (document, scheduledGeneration) => {
    if (!supported(document) || disposed) return [];
    const key = keyFor(document), generation = scheduledGeneration === undefined ? (generations.get(key) || 0) + 1 : scheduledGeneration;
    if (scheduledGeneration === undefined) generations.set(key, generation);
    const version = document.version, text = document.getText(), textHash = hash(text), parsed = parseStateSource(text, document.fileName, document.languageId, { capabilities: options.getCapabilities?.(document.uri) });
    const publish = catalog => {
      const diagnostics = stateTransferFindings(catalog, parsed).slice(0, MAX_STATE_DIAGNOSTICS).map(finding => diagnosticFor(vscode, document, finding));
      collection.set(document.uri, diagnostics);
      return diagnostics;
    };
    if (!parsed.transfers.some(record => !record.dynamic && Number.isInteger(record.literal) && record.literal >= 0 && usesCharacterCatalog(record))) return publish(null);
    let catalog; try { catalog = await getCatalog(document); } catch (_) { catalog = null; }
    if (!current(document, key, generation, version, textHash)) return [];
    if (typeof options.ensureAuthorityWatchers === 'function') {
      let watched = options.ensureAuthorityWatchers(catalog?.authority?.functionCatalog);
      if (!watched?.ok) { collection.set(document.uri, []); return []; }
      if (watched.installed) {
        const initialRootSignature = watched.signature;
        options.invalidateAuthority?.();
        try { catalog = await getCatalog(document); } catch (_) { catalog = null; }
        if (!current(document, key, generation, version, textHash)) return [];
        watched = options.ensureAuthorityWatchers(catalog?.authority?.functionCatalog);
        if (!watched?.ok || watched.installed || watched.signature !== initialRootSignature) { collection.set(document.uri, []); return []; }
      }
    }
    let authoritative = false; try { authoritative = Boolean(catalog?.complete && await validateCatalog(catalog, document)); } catch (_) {}
    if (!current(document, key, generation, version, textHash)) return [];
    return publish(authoritative ? catalog : null);
  };
  const schedule = document => {
    if (!supported(document) || disposed) return;
    const key = keyFor(document), generation = (generations.get(key) || 0) + 1;
    generations.set(key, generation); clearTimeout(timers.get(key)); collection.delete(document.uri);
    timers.set(key, setTimeout(() => { timers.delete(key); void update(document, generation); }, delay));
  };
  const refreshOpen = excluded => { for (const document of vscode.workspace.textDocuments || []) if (supported(document) && (!excluded || document.uri.toString() !== excluded.toString())) schedule(document); };
  const retireOpen = excluded => { for (const document of vscode.workspace.textDocuments || []) if (supported(document) && (!excluded || document.uri.toString() !== excluded.toString())) collection.delete(document.uri); };
  const dependency = options.isDependency || (document => supported(document) || /\.(?:def|ini|cns|cmd|st|zss)$/i.test(document?.fileName || ''));
  const disposables = [
    vscode.workspace.onDidOpenTextDocument(document => { if (dependency(document)) refreshOpen(); else schedule(document); }),
    vscode.workspace.onDidChangeTextDocument(event => {
      if (!dependency(event.document)) return;
      if (supported(event.document)) {
        // The edited source needs fresh local diagnostics. Other open files may
        // depend on its StateDefs, so retire their claims now and rebuild them
        // once the dependency is saved instead of rescanning the whole
        // character on every keystroke.
        retireOpen(event.document.uri);
        schedule(event.document);
      } else refreshOpen();
    }),
    vscode.workspace.onDidSaveTextDocument(document => { if (dependency(document)) refreshOpen(); }),
    vscode.workspace.onDidCloseTextDocument(document => { if (supported(document)) { generations.delete(keyFor(document)); collection.delete(document.uri); } if (dependency(document)) refreshOpen(document.uri); })
  ];
  if (vscode.workspace.onDidChangeConfiguration) disposables.push(vscode.workspace.onDidChangeConfiguration(event => { if (!event?.affectsConfiguration || event.affectsConfiguration('ikemenZss')) refreshOpen(); }));
  if (typeof options.onDidInvalidate === 'function') disposables.push(options.onDidInvalidate(refreshOpen));
  const lifecycle = { dispose() {
    if (disposed) return;
    disposed = true;
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    generations.clear();
    collection.dispose();
  } };
  disposables.push(lifecycle); context.subscriptions.push(...disposables);
  for (const document of vscode.workspace.textDocuments || []) schedule(document);
  return { collection, update, schedule, refreshOpen, dispose: () => lifecycle.dispose() };
}

module.exports = { MAX_STATE_DIAGNOSTICS, diagnosticFor, registerStateTransferDiagnostics, supported };
