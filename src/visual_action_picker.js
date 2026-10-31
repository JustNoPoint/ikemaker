'use strict';

const MAX_ACTIONS = 8192;

function parseActionNumber(value) {
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text)) return null;
  const number = Number(text);
  return Number.isSafeInteger(number) && number >= 0 && number <= 2147483647 ? number : null;
}

function projectEmbeddedActions(actions, maximum = MAX_ACTIONS) {
  const limit = Math.max(1, Math.min(MAX_ACTIONS, Number(maximum) || MAX_ACTIONS)), rows = [];
  for (const [key, action] of Object.entries(actions || {})) {
    const number = parseActionNumber(key);
    if (number === null || !action || !Array.isArray(action.frames)) continue;
    const first = action.frames[0], sprite = Array.isArray(first?.sprite) && first.sprite.length === 2 ? first.sprite.map(Number) : null;
    const offset = Array.isArray(first?.offset) && first.offset.length === 2 ? first.offset.map(Number) : null;
    const metadata = sprite && sprite.every(Number.isFinite)
      ? `first sprite ${sprite.join(',')}${offset?.every(Number.isFinite) ? ` · offset ${offset.join(',')}` : ''}${Number.isFinite(first.time) ? ` · ${first.time} tick${first.time === 1 ? '' : 's'}` : ''}`
      : 'no parsed sprite frame';
    rows.push(Object.freeze({
      number,
      key: String(number),
      label: `Action ${number}`,
      description: `${action.frames.length} parsed frame${action.frames.length === 1 ? '' : 's'} · ${metadata}`,
      detail: Number.isSafeInteger(action.line) ? `Begin Action source line ${action.line + 1}` : 'Embedded Begin Action'
    }));
  }
  rows.sort((left, right) => left.number - right.number);
  return Object.freeze({ rows: Object.freeze(rows.slice(0, limit)), total: rows.length, truncated: rows.length > limit });
}

async function manualAction(vscode, options) {
  const value = await vscode.window.showInputBox({
    title: options.title || 'Animation number',
    value: parseActionNumber(options.value) === null ? '0' : String(parseActionNumber(options.value)),
    prompt: options.prompt || 'Enter a non-negative Begin Action number.',
    validateInput: candidate => parseActionNumber(candidate) === null ? 'Enter a whole number from 0 to 2147483647.' : undefined
  });
  const number = value === undefined ? null : parseActionNumber(value);
  return value === undefined ? undefined : number === null ? undefined : String(number);
}

async function pickEmbeddedAction(vscode, actions, options = {}) {
  const projection = projectEmbeddedActions(actions, options.maximum);
  if (!projection.rows.length) return manualAction(vscode, options);
  const suggested = parseActionNumber(options.value), rows = [...projection.rows];
  if (suggested !== null) rows.sort((left, right) => Number(right.number === suggested) - Number(left.number === suggested) || left.number - right.number);
  const items = rows.map(row => ({ ...row, picked: row.number === suggested }));
  items.push({ label: '$(edit) Enter animation number manually…', description: 'Reference an action not shown in this bounded list.', manual: true });
  const picked = await vscode.window.showQuickPick(items, {
    title: options.title || 'Choose embedded Begin Action',
    placeHolder: projection.truncated ? `Showing ${projection.rows.length} of ${projection.total} embedded actions. Search or choose manual entry.` : `Choose one of ${projection.total} embedded actions.`,
    matchOnDescription: true,
    matchOnDetail: true
  });
  if (!picked) return undefined;
  return picked.manual ? manualAction(vscode, options) : picked.key;
}

module.exports = { MAX_ACTIONS, parseActionNumber, projectEmbeddedActions, pickEmbeddedAction };
