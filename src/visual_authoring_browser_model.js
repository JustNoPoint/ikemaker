'use strict';

const crypto = require('crypto');

const MAX_ROWS = 4096;
const VIEWS = new Set(['list', 'thumbnails']);

function boundedText(value, maximum = 512) {
  const text = String(value ?? '').replace(/[\u0000-\u001f]/g, ' ').trim();
  if (Buffer.byteLength(text, 'utf8') > maximum) throw new Error('Visual browser text exceeds its bounded limit.');
  return text;
}
function opaque(parts) { return crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 32); }
function exact(value, keys) { return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0'); }

function createVisualAuthoringBrowser(rawItems, options = {}) {
  if (!Array.isArray(rawItems)) throw new Error('Visual browser rows are required.');
  const binding = opaque(['visual-authoring-browser', boundedText(options.binding || 'unbound', 2048)]), byId = new Map(), rows = [];
  for (const [ordinal, raw] of rawItems.slice(0, MAX_ROWS).entries()) {
    const identity = boundedText(raw?.identity, 1024);
    if (!identity) throw new Error(`Visual browser row ${ordinal + 1} has no exact host identity.`);
    const id = opaque([binding, identity]), actions = [];
    for (const action of raw.actions || []) {
      const actionId = boundedText(action?.id, 128), label = boundedText(action?.label, 256);
      if (!actionId || !label || actions.some(item => item.id === actionId)) continue;
      actions.push(Object.freeze({ id: actionId, label, mutating: action.mutating === true }));
    }
    const row = Object.freeze({ id, ordinal, label: boundedText(raw.label || identity), description: boundedText(raw.description || '', 1024), kind: boundedText(raw.kind || 'visual', 128), thumbnailKey: boundedText(raw.thumbnailKey || '', 256), actions: Object.freeze(actions) });
    rows.push(row); byId.set(id, Object.freeze({ identity, source: raw.source, row }));
  }
  const kinds = Object.freeze([...new Set(rows.map(row => row.kind))].sort());
  const snapshot = state => {
    const query = boundedText(state?.query || '', 256).toLocaleLowerCase(), kind = boundedText(state?.kind || '', 128), view = VIEWS.has(state?.view) ? state.view : 'list';
    const filtered = rows.filter(row => (!kind || row.kind === kind) && (!query || `${row.label} ${row.description} ${row.kind}`.toLocaleLowerCase().includes(query)));
    return Object.freeze({ binding, view, query, kind, kinds, rows:Object.freeze(filtered), total:rows.length, truncated:rawItems.length > rows.length });
  };
  const resolve = message => {
    if (!exact(message, ['type','binding','rowId','actionId']) || message.type !== 'visualBrowserAction' || message.binding !== binding) return null;
    const found = byId.get(String(message.rowId || '')), actionId = String(message.actionId || '');
    if (!found || !found.row.actions.some(action => action.id === actionId)) return null;
    return Object.freeze({ rowId:found.row.id, actionId, identity:found.identity, source:found.source, row:found.row });
  };
  return Object.freeze({ binding, snapshot, resolve });
}

module.exports = { MAX_ROWS, createVisualAuthoringBrowser };
