'use strict';

const fs = require('fs');
const path = require('path');
const { collectRecords } = require('./analyzer');
const { catalogStillCurrent, functionCallFindings, hash, normalized } = require('./zss_function_catalog');

const MAX_DIAGNOSTICS_PER_DOCUMENT = 500;
const MAX_AUTHORITY_WATCH_ROOTS = 64;

function severity(vscode, value) {
  return value === 'error' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning;
}

function findingDiagnostic(vscode, document, finding) {
  const record = finding.record || {}, line = Math.max(0, Math.min(record.line || 0, document.lineCount - 1));
  const width = document.lineAt(line).text.length, start = Math.max(0, Math.min(record.start || 0, width));
  const end = Math.max(start, Math.min(start + Math.max(1, String(record.name || '').length), width));
  const diagnostic = new vscode.Diagnostic(new vscode.Range(line, start, line, end), finding.message, severity(vscode, finding.severity));
  diagnostic.code = finding.code;
  diagnostic.source = 'IKEMEN ZSS Functions';
  return diagnostic;
}

function registerZssFunctionDiagnostics(vscode, context, getCatalog, getOptions = () => ({}), options = {}) {
  const delay = Number.isFinite(options.delay) ? Math.max(0, options.delay) : 250;
  const validateCatalog = options.validateCatalog || ((catalog) => catalogStillCurrent(vscode, catalog));
  const collection = vscode.languages.createDiagnosticCollection('ikemen-zss-functions');
  const timers = new Map(), generations = new Map(), rootWatchers = new Map();
  let disposed = false;
  const isZss = document => Boolean(document && document.languageId === 'zss' && document.uri?.scheme === 'file');
  const keyFor = document => document.uri.toString();
  const invalidate = document => {
    if (!isZss(document)) return;
    const key = keyFor(document);
    generations.set(key, (generations.get(key) || 0) + 1);
    clearTimeout(timers.get(key)); timers.delete(key);
  };
  const current = (document, key, generation, version, textHash) => !disposed
    && generations.get(key) === generation
    && document.version === version
    && hash(document.getText()) === textHash;
  const canonicalRoot = value => { try { return (fs.realpathSync.native || fs.realpathSync)(path.resolve(value)); } catch (_) { return ''; } };
  const authorityChanged = () => { options.invalidateAuthority?.(); options.onAuthorityChanged?.(); refreshOpenZss(); };
  const ensureAuthorityWatchers = catalog => {
    const declared = catalog?.authority?.ownership?.roots;
    if (!Array.isArray(declared)) return { ok: true, installed: 0, signature: '[]' }; // Allows isolated pure-model test catalogs; production catalogs always declare roots.
    const resolved = declared.map(canonicalRoot); if (resolved.some(value => !value)) return { ok: false, installed: 0, signature: '' };
    const roots = [...new Map(resolved.map(value => [normalized(value), value])).values()];
    const signature = JSON.stringify(roots.map(normalized).sort());
    if (!vscode.workspace.createFileSystemWatcher || !vscode.RelativePattern) return { ok: false, installed: 0, signature };
    const pending = roots.filter(root => !rootWatchers.has(normalized(root)));
    if (rootWatchers.size + pending.length > MAX_AUTHORITY_WATCH_ROOTS) return { ok: false, installed: 0, signature };
    let installed = 0;
    for (const root of pending) {
      const key = normalized(root);
      let watcher;
      try {
        watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(root, '**/*.def'));
        watcher.onDidChange(authorityChanged); watcher.onDidCreate(authorityChanged); watcher.onDidDelete(authorityChanged);
      } catch (_) { try { watcher?.dispose?.(); } catch (_) {} return { ok: false, installed, signature }; }
      rootWatchers.set(key, watcher); installed += 1;
    }
    return { ok: true, installed, signature };
  };
  const update = async (document, scheduledGeneration) => {
    if (!isZss(document) || disposed) return [];
    const key = keyFor(document), generation = scheduledGeneration === undefined ? (generations.get(key) || 0) + 1 : scheduledGeneration;
    if (scheduledGeneration === undefined) generations.set(key, generation);
    const version = document.version, text = document.getText(), textHash = hash(text);
    const records=collectRecords(text,document.fileName);
    if (!records.calls.length) { collection.set(document.uri, []); return []; }
    let catalog;
    try { catalog = await getCatalog(document); } catch (_) { catalog = null; }
    if (!current(document, key, generation, version, textHash)) return [];
    let watched = ensureAuthorityWatchers(catalog);
    if (!watched.ok) { collection.set(document.uri, []); return []; }
    if (watched.installed) {
      const initialRootSignature = watched.signature;
      // The first scan happened before these roots were watched. Invalidate it
      // and rebuild once under active coverage, closing the scan/attach gap.
      options.invalidateAuthority?.();
      try { catalog = await getCatalog(document); } catch (_) { catalog = null; }
      if (!current(document, key, generation, version, textHash)) return [];
      watched = ensureAuthorityWatchers(catalog);
      if (!watched.ok || watched.installed || watched.signature !== initialRootSignature) { collection.set(document.uri, []); return []; }
    }
    let authoritative = false;
    try { authoritative = Boolean(catalog?.complete && await validateCatalog(catalog, document)); } catch (_) { authoritative = false; }
    if (!current(document, key, generation, version, textHash)) return [];
    if (!authoritative || !catalog.entries?.some(entry => normalized(entry.filename) === normalized(document.fileName))) {
      collection.set(document.uri, []);
      return [];
    }
    let findings = [];
    try { findings = functionCallFindings(catalog, records, getOptions(document) || {}); } catch (_) {}
    if (!current(document, key, generation, version, textHash)) return [];
    const diagnostics = findings.slice(0, MAX_DIAGNOSTICS_PER_DOCUMENT).map(finding => findingDiagnostic(vscode, document, finding));
    collection.set(document.uri, diagnostics);
    return diagnostics;
  };
  const schedule = document => {
    if (!isZss(document) || disposed) return;
    const key = keyFor(document), generation = (generations.get(key) || 0) + 1;
    generations.set(key, generation); clearTimeout(timers.get(key));
    // Once any authority input changes, the previous result is no longer
    // proven. Prefer a short quiet debounce window to showing a stale error.
    collection.delete(document.uri);
    timers.set(key, setTimeout(() => { timers.delete(key); void update(document, generation); }, delay));
  };
  const refreshOpenZss = (excludedUri) => { for (const document of vscode.workspace.textDocuments || []) if (!excludedUri || document.uri.toString() !== excludedUri.toString()) schedule(document); };
  const dependency = options.isDependency || (document => isZss(document) || /\.(?:def|cns|cmd|st|inp|jnp|txt)$/i.test(document?.fileName || ''));
  const invalidateAuthority = document => { if (dependency(document)) options.invalidateAuthority?.(); };
  const disposables = [
    vscode.workspace.onDidOpenTextDocument(document => { invalidateAuthority(document); if (dependency(document)) refreshOpenZss(); else schedule(document); }),
    vscode.workspace.onDidChangeTextDocument(event => { invalidateAuthority(event.document); if (dependency(event.document)) refreshOpenZss(); }),
    vscode.workspace.onDidSaveTextDocument(document => { invalidateAuthority(document); if (dependency(document)) refreshOpenZss(); }),
    vscode.workspace.onDidCloseTextDocument(document => {
      invalidateAuthority(document);
      if (isZss(document)) { invalidate(document); generations.delete(keyFor(document)); collection.delete(document.uri); }
      if (dependency(document)) refreshOpenZss(document.uri);
    })
  ];
  if (vscode.workspace.onDidChangeConfiguration) disposables.push(vscode.workspace.onDidChangeConfiguration(event => {
    if (!event?.affectsConfiguration || event.affectsConfiguration('ikemenZss')) refreshOpenZss();
  }));
  if (typeof options.onDidInvalidate === 'function') disposables.push(options.onDidInvalidate(() => { options.invalidateAuthority?.(); refreshOpenZss(); }));
  const lifecycle = { dispose() {
    if (disposed) return;
    disposed = true;
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    generations.clear();
    for (const watcher of rootWatchers.values()) watcher.dispose?.();
    rootWatchers.clear();
    collection.dispose();
  } };
  disposables.push(lifecycle); context.subscriptions.push(...disposables);
  for (const document of vscode.workspace.textDocuments || []) schedule(document);
  return { collection, update, schedule, refreshOpenZss, ensureAuthorityWatchers, dispose: () => lifecycle.dispose() };
}

module.exports = { MAX_AUTHORITY_WATCH_ROOTS, MAX_DIAGNOSTICS_PER_DOCUMENT, findingDiagnostic, registerZssFunctionDiagnostics };
