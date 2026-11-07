'use strict';

const path = require('path');
const { trackViewerPanel } = require('./viewer_group');
const { createAuthoringContext, contextIdentity, normalized, uniqueFiles } = require('./authoring_context_model');

const panels = new Set();
const bindings = new WeakMap();
const closingContexts = new Set();
const sharedContexts = new Map();
const registryListeners = new Set();
let current = null;

function registrySnapshot(){return Object.freeze(openContexts().map(entry=>Object.freeze({...entry,files:Object.freeze([...(entry.files||[])])})));}
function publishRegistry(){const snapshot=registrySnapshot();for(const listener of [...registryListeners]){try{listener(snapshot);}catch{}}return snapshot;}

function inside(filename, root) { const file = normalized(filename), base = normalized(root); return file === base || file.startsWith(`${base}${path.sep}`); }

function entryFrom(panel, snapshot) {
  return { panel, identity: snapshot.identity, type: snapshot.type, key: snapshot.key, label: snapshot.label, root: snapshot.root, files: [...snapshot.files], selection: snapshot.selection, selectionRevision: snapshot.selectionRevision, activeSurfaceId: snapshot.activeSurfaceId, revision: snapshot.revision, draftLease: snapshot.draftLease };
}

function syncEntry(entry, snapshot) {
  const ownerDef=entry.ownerDef||'';Object.assign(entry, entryFrom(entry.panel, snapshot));entry.ownerDef=ownerDef;
  return entry;
}

function modelChanges(context) {
  const changes = {};
  for (const key of ['label', 'root', 'selection', 'activeSurfaceId']) if (Object.prototype.hasOwnProperty.call(context, key)) changes[key] = context[key];
  return changes;
}

function recomputeFiles(record) {
  record.model.setConnectedFiles(uniqueFiles([...record.bindings].flatMap((binding) => binding.files)));
}

function detachBinding(binding) {
  const record = binding.record;
  binding.subscription?.dispose();
  record.bindings.delete(binding);
  if (!record.bindings.size) { sharedContexts.delete(record.model.identity); record.model.dispose(); }
  else recomputeFiles(record);
}

function attachBinding(binding, context) {
  const identity = contextIdentity(context);
  let record = sharedContexts.get(identity);
  if (!record) {
    const model = createAuthoringContext({ ...context, files: [] });
    record = { model, bindings: new Set() };
    sharedContexts.set(identity, record);
  } else record.model.update(modelChanges(context));
  binding.model = record.model;
  binding.record = record;
  binding.ownerDef=typeof context.ownerDef==='string'&&path.isAbsolute(context.ownerDef)&&path.extname(context.ownerDef).toLowerCase()==='.def'?path.resolve(context.ownerDef):'';
  binding.entry.ownerDef=binding.ownerDef;
  binding.files = uniqueFiles(context.files || context.connectedFiles);
  record.bindings.add(binding);
  binding.subscription = record.model.subscribe((snapshot) => {syncEntry(binding.entry, snapshot);if(panels.has(binding.entry))publishRegistry();});
  recomputeFiles(record);
  syncEntry(binding.entry, record.model.snapshot());
}

function registerAuthoringPanel(panel, context, options = {}) {
  if(options.visualViewer !== false)trackViewerPanel(panel);
  const existing = bindings.get(panel);
  if (existing) {
    panels.delete(existing.entry);
    if (existing.model.identity !== contextIdentity(context)) { detachBinding(existing); attachBinding(existing, context); }
    else {
      existing.ownerDef=typeof context.ownerDef==='string'&&path.isAbsolute(context.ownerDef)&&path.extname(context.ownerDef).toLowerCase()==='.def'?path.resolve(context.ownerDef):'';existing.entry.ownerDef=existing.ownerDef;
      existing.files = uniqueFiles(context.files || context.connectedFiles);
      existing.model.update(modelChanges(context));
      recomputeFiles(existing.record);
    }
    panels.add(existing.entry);
    if (panel.active) current = existing.entry;
    publishRegistry();
    return existing.entry;
  }
  const entry = { panel }, binding = { entry, model: null, record: null, files: [], subscription: null };
  attachBinding(binding, context);
  bindings.set(panel, binding);
  panels.add(entry);
  if (panel.active) current = entry;
  panel.onDidChangeViewState((event) => { if (event.webviewPanel.active && panels.has(entry)) {current = entry;publishRegistry();} });
  panel.onDidDispose(() => {
    panels.delete(entry); bindings.delete(panel); detachBinding(binding);
    if (current === entry) current = [...panels].reverse().find((candidate) => candidate.panel?.active) || [...panels].at(-1) || null;
    publishRegistry();
  });
  publishRegistry();
  return entry;
}

function registerCharacterToolPanel(panel, defPath, label, files = []) {
  const root = path.dirname(path.resolve(defPath));
  return registerAuthoringPanel(panel, { type: 'character', key: path.resolve(defPath), label: label || path.basename(root), root, ownerDef:path.resolve(defPath), files: [defPath, ...files] });
}

function openContexts() {
  const seen = new Set(), result = [];
  for (const entry of panels) {
    const identity = entry.identity || `${entry.type}\0${entry.key}`;
    if (seen.has(identity)) continue;
    seen.add(identity); result.push(entry);
  }
  return result;
}
function subscribeRegistry(listener){if(typeof listener!=='function')throw new TypeError('An authoring registry listener must be a function.');registryListeners.add(listener);listener(registrySnapshot());let active=true;return{dispose(){if(active){active=false;registryListeners.delete(listener);}}};}

function currentContext() { return current; }
function contextOwnsFile(context, filename) { return context.files.some((item) => normalized(item) === normalized(filename)) || Boolean(context.root && inside(filename, context.root)); }
function matchingPanels(context) { return [...panels].filter((entry) => {
  if (entry.type !== context.type) return false;
  if (context.ownerDef || entry.ownerDef) return Boolean(context.ownerDef && entry.ownerDef) && normalized(entry.ownerDef) === normalized(context.ownerDef);
  return entry.key === context.key;
}); }
function hasPanel(panel) { return [...panels].some((entry) => entry.panel === panel); }
function disposeContextPanels(context) { const found = matchingPanels(context); for (const entry of found) { try { entry.panel.dispose(); } catch (_) {} } return found.length; }

function beginContextClose(context) {
  closingContexts.add(context);
  return () => closingContexts.delete(context);
}

function isClosingFile(filename) {
  return Boolean(filename) && [...closingContexts].some((context) => contextOwnsFile(context, filename));
}

function isClosingOwner(ownerDef) {
  if (!ownerDef || !path.isAbsolute(ownerDef)) return false;
  const wanted = normalized(ownerDef);
  return [...closingContexts].some((context) => context.type === 'character' && context.ownerDef && normalized(context.ownerDef) === wanted);
}

function contextModel(context) {
  if (!context) return null;
  if (typeof context.snapshot === 'function' && typeof context.acquireDraftLease === 'function') return context;
  return bindings.get(context.panel)?.model || null;
}
function getContextModel(context) { return contextModel(context); }

function contextSnapshot(context) {
  const model = contextModel(context);
  if (model) return Object.freeze({...model.snapshot(),ownerDef:context?.ownerDef||bindings.get(context?.panel)?.ownerDef||''});
  return createAuthoringContext(context || {}).snapshot();
}

function acquireContextDraftLease(context, owner) { return contextModel(context)?.acquireDraftLease(owner) || null; }
function releaseContextDraftLease(context, token) { return contextModel(context)?.releaseDraftLease(token) || false; }
function subscribeContext(context, listener) { return contextModel(context)?.subscribe(listener) || { dispose() {} }; }
function updateContext(context, changes) { const model = contextModel(context); return model ? model.update(changes) : null; }
function setContextSelection(context, selection) { return updateContext(context, { selection }); }
function setContextActiveSurface(context, activeSurfaceId) { return updateContext(context, { activeSurfaceId }); }

module.exports = { normalized, inside, registerAuthoringPanel, registerCharacterToolPanel, openContexts, subscribeRegistry, currentContext, contextOwnsFile, matchingPanels, hasPanel, disposeContextPanels, beginContextClose, isClosingFile, isClosingOwner, contextSnapshot, getContextModel, acquireContextDraftLease, releaseContextDraftLease, subscribeContext, updateContext, setContextSelection, setContextActiveSurface };
