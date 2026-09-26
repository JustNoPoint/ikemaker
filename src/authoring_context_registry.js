'use strict';

const path = require('path');
const { trackViewerPanel } = require('./viewer_group');

const panels = new Set();
const closingContexts = new Set();
let current = null;

function normalized(value) { return path.resolve(value || '.').toLowerCase(); }
function inside(filename, root) { const file = normalized(filename), base = normalized(root); return file === base || file.startsWith(`${base}${path.sep}`); }

function registerAuthoringPanel(panel, context) {
  trackViewerPanel(panel);
  for (const previous of [...panels]) if (previous.panel === panel) panels.delete(previous);
  const entry = {
    panel,
    type: String(context.type || 'workspace'),
    key: normalized(context.key || context.root || context.files?.[0]),
    label: String(context.label || context.type || 'Authoring workspace'),
    root: context.root ? path.resolve(context.root) : '',
    files: [...new Set((context.files || []).filter(Boolean).map((item) => path.resolve(item)))]
  };
  panels.add(entry);
  if (panel.active) current = entry;
  panel.onDidChangeViewState((event) => { if (event.webviewPanel.active && panels.has(entry)) current = entry; });
  panel.onDidDispose(() => { panels.delete(entry); if (current === entry) current = null; });
  return entry;
}

function registerCharacterToolPanel(panel, defPath, label, files = []) {
  const root = path.dirname(path.resolve(defPath));
  return registerAuthoringPanel(panel, { type: 'character', key: root, label: label || path.basename(root), root, files: [defPath, ...files] });
}

function openContexts() {
  const seen = new Set(), result = [];
  for (const entry of panels) {
    const identity = `${entry.type}\0${entry.key}`;
    if (seen.has(identity)) continue;
    seen.add(identity); result.push(entry);
  }
  return result;
}

function currentContext() { return current; }
function contextOwnsFile(context, filename) { return context.files.some((item) => normalized(item) === normalized(filename)) || Boolean(context.root && inside(filename, context.root)); }
function matchingPanels(context) { return [...panels].filter((entry) => entry.type === context.type && entry.key === context.key); }
function disposeContextPanels(context) { const found = matchingPanels(context); for (const entry of found) { try { entry.panel.dispose(); } catch (_) {} } return found.length; }

function beginContextClose(context) {
  closingContexts.add(context);
  return () => closingContexts.delete(context);
}

function isClosingFile(filename) {
  return Boolean(filename) && [...closingContexts].some((context) => contextOwnsFile(context, filename));
}

module.exports = { normalized, inside, registerAuthoringPanel, registerCharacterToolPanel, openContexts, currentContext, contextOwnsFile, matchingPanels, disposeContextPanels, beginContextClose, isClosingFile };
