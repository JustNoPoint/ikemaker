'use strict';

const path = require('path');

const KEY = 'ikemaker.sffWriterPreference.v1';
const MODES = Object.freeze(['ikemaker', 'sprmake2', 'both']);
let store = null;
let current = 'ikemaker';
let updateQueue = Promise.resolve();
const panels = new Set();

function normalize(value) { return MODES.includes(String(value || '')) ? String(value) : 'ikemaker'; }
function safeOutputName(value, label = 'SFF output') {
  const name = String(value || '').trim();
  if (!name || Buffer.byteLength(name, 'utf8') > 180 || name !== path.basename(name) || /[<>:"/\\|?*\x00-\x1f]/.test(name) || !/\.sff$/i.test(name)) throw new Error(`${label} must be a safe .sff filename without folders.`);
  const stem = path.basename(name, path.extname(name));
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem)) throw new Error(`${label} uses a reserved Windows filename.`);
  return name;
}
function outputPlan(mode, destination, names = {}, exists = require('fs').existsSync) {
  const selected = normalize(mode), folder = path.resolve(destination), rows = [];
  if (selected === 'ikemaker' || selected === 'both') rows.push({ writer: 'ikemaker', filename: path.resolve(folder, safeOutputName(names.ikemaker, 'IKEMaker output')) });
  if (selected === 'sprmake2' || selected === 'both') rows.push({ writer: 'sprmake2', filename: path.resolve(folder, safeOutputName(names.sprmake2, 'SprMake2 output')) });
  const canonical = value => process.platform === 'win32' ? value.toLowerCase() : value;
  if (new Set(rows.map(row => canonical(row.filename))).size !== rows.length) throw new Error('IKEMaker and SprMake2 outputs must use distinct filenames.');
  const occupied = rows.find(row => exists(row.filename));
  if (occupied) throw new Error(`${path.basename(occupied.filename)} already exists. No output will be overwritten.`);
  return Object.freeze(rows.map(row => Object.freeze(row)));
}
function snapshot() { return Object.freeze({ mode: current, label: current === 'sprmake2' ? 'SprMake2' : current === 'both' ? 'Both writers' : 'IKEMaker' }); }
async function settledSnapshot() { await updateQueue; return snapshot(); }
async function broadcast() {
  const message = { type: 'sffWriterPreferenceState', ...snapshot() };
  await Promise.all([...panels].map(panel => Promise.resolve(panel.webview?.postMessage?.(message)).catch(() => false)));
}
function attach(panel) {
  if (!panel?.webview || typeof panel.webview.postMessage !== 'function') return { dispose() {} };
  panels.add(panel);
  Promise.resolve(panel.webview.postMessage({ type: 'sffWriterPreferenceState', ...snapshot() })).catch(() => {});
  const dispose = () => panels.delete(panel);
  const listener = panel.onDidDispose?.(dispose);
  return { dispose() { dispose(); listener?.dispose?.(); } };
}
async function handle(message, api = require('vscode')) {
  if (message?.type === 'sffWriterPreferenceReady') { await broadcast(); return true; }
  if (message?.type !== 'sffWriterPreferenceChange') return false;
  if (!MODES.includes(String(message.mode || ''))) {
    await broadcast();
    api.window?.showWarningMessage?.('Unknown SFF writer choice was ignored.');
    return true;
  }
  const next = String(message.mode);
  updateQueue = updateQueue.then(async () => {
    const prior = normalize(store?.get?.(KEY, current));
    current = prior;
    try {
      await store?.update?.(KEY, next);
      current = normalize(store?.get?.(KEY, next));
      await broadcast();
    } catch (error) {
      current = prior;
      await broadcast();
      api.window?.showWarningMessage?.(`Could not save the SFF writer choice: ${error.message}`);
    }
  });
  await updateQueue;
  return true;
}
function register(context) {
  store = context.workspaceState;
  current = normalize(store?.get?.(KEY, 'ikemaker'));
  updateQueue = Promise.resolve();
  return { dispose() { panels.clear(); store = null; current = 'ikemaker'; updateQueue = Promise.resolve(); } };
}

module.exports = { KEY, MODES, normalize, safeOutputName, outputPlan, snapshot, settledSnapshot, attach, handle, register };
