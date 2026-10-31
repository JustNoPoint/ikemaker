'use strict';

const BANK_SIZE = 256;
const BANKS = Object.freeze(['A', 'B']);

function fail(message) { throw new RangeError(message); }
function bankKey(bank) {
  if (!BANKS.includes(bank)) throw new TypeError(`bank must be A or B, received ${String(bank)}`);
  return bank;
}
function indexOf(value, allowEnd = false) {
  if (!Number.isInteger(value) || value < 0 || value > (allowEnd ? BANK_SIZE : BANK_SIZE - 1)) {
    fail(`palette index must be an integer from 0 to ${allowEnd ? BANK_SIZE : BANK_SIZE - 1}`);
  }
  return value;
}
function rgba(value) {
  if (!Array.isArray(value) || value.length !== 4 || value.some(n => !Number.isInteger(n) || n < 0 || n > 255)) {
    throw new TypeError('RGBA colors must contain exactly four integer channels from 0 to 255');
  }
  return value.slice();
}
function palette(value, label) {
  if (!Array.isArray(value) || value.length !== BANK_SIZE) {
    throw new TypeError(`${label} must contain exactly ${BANK_SIZE} RGBA colors`);
  }
  return value.map(rgba);
}
function identity(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} identity must be a non-empty string`);
  return value.trim();
}
function normalizedIndices(values, allowEmpty = false) {
  if (!Array.isArray(values)) throw new TypeError('indices must be an array');
  const result = [...new Set(values.map(value => indexOf(value)))].sort((a, b) => a - b);
  if (!allowEmpty && !result.length) throw new RangeError('at least one palette index is required');
  return result;
}
function lockedIndices(values) {
  const result = normalizedIndices(values || [], true);
  if (!result.includes(0)) result.unshift(0);
  return result;
}
function cloneSnapshot(state) {
  return {
    banks: {
      A: { id: state.banks.A.id, colors: state.banks.A.colors.map(c => c.slice()), locked: state.banks.A.locked.slice() },
      B: { id: state.banks.B.id, colors: state.banks.B.colors.map(c => c.slice()), locked: state.banks.B.locked.slice() }
    },
    selection: { bank: state.selection.bank, indices: state.selection.indices.slice(), anchor: state.selection.anchor },
    followA: state.followA
  };
}
function restore(state, snapshot) {
  return { ...cloneSnapshot(snapshot), history: state.history.slice(), gesture: null };
}
function sameSnapshot(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function checkpoint(state, next) {
  const before = cloneSnapshot(state);
  if (sameSnapshot(before, cloneSnapshot(next))) return { ...next, history: state.history.slice(), gesture: state.gesture };
  if (state.gesture) return { ...next, history: state.history.slice(), gesture: state.gesture };
  return { ...next, history: [...state.history, before], gesture: null };
}
function assertEditable(state, bank, indices) {
  bankKey(bank);
  if (bank === 'B' && state.followA) throw new Error('bank B cannot be edited while Follow A is enabled');
  const locked = new Set(state.banks[bank].locked);
  const blocked = indices.filter(i => locked.has(i));
  if (blocked.length) throw new Error(`locked palette index cannot be changed: ${blocked.join(', ')}`);
}

function createDualPaletteModel({ bankA, bankB, idA = 'A', idB = 'B', lockedA = [0], lockedB = [0], followA = false } = {}) {
  return {
    banks: {
      A: { id: identity(idA, 'bank A'), colors: palette(bankA, 'bank A'), locked: lockedIndices(lockedA) },
      B: { id: identity(idB, 'bank B'), colors: palette(bankB, 'bank B'), locked: lockedIndices(lockedB) }
    },
    selection: { bank: 'A', indices: [], anchor: null },
    followA: Boolean(followA),
    history: [],
    gesture: null
  };
}

function selectIndices(state, bank, index, modifiers = {}) {
  bankKey(bank); indexOf(index);
  const ctrl = Boolean(modifiers.ctrl || modifiers.meta);
  const shift = Boolean(modifiers.shift);
  const current = state.selection.bank === bank ? state.selection.indices : [];
  const anchor = state.selection.bank === bank ? state.selection.anchor : null;
  let indices;
  let nextAnchor = index;
  if (shift && anchor !== null) {
    const range = Array.from({ length: Math.abs(index - anchor) + 1 }, (_, offset) => Math.min(index, anchor) + offset);
    indices = ctrl ? normalizedIndices([...current, ...range]) : range;
    nextAnchor = anchor;
  } else if (ctrl) {
    indices = current.includes(index) ? current.filter(i => i !== index) : normalizedIndices([...current, index]);
  } else {
    indices = [index];
  }
  return { ...state, selection: { bank, indices, anchor: nextAnchor } };
}

function setIndexLocked(state, bank, index, locked) {
  bankKey(bank); indexOf(index);
  if (index === 0 && !locked) throw new Error('palette index 0 is permanently protected');
  const values = new Set(state.banks[bank].locked);
  locked ? values.add(index) : values.delete(index);
  const next = cloneSnapshot(state);
  next.banks[bank].locked = [...values].sort((a, b) => a - b);
  return checkpoint(state, { ...next, history: state.history, gesture: state.gesture });
}

function editColor(state, bank, index, color) {
  bankKey(bank); indexOf(index); assertEditable(state, bank, [index]);
  const next = cloneSnapshot(state);
  next.banks[bank].colors[index] = rgba(color);
  return checkpoint(state, { ...next, history: state.history, gesture: state.gesture });
}

function moveWithinBank(state, bank, indices, destination) {
  bankKey(bank); indexOf(destination, true);
  const selected = normalizedIndices(indices);
  assertEditable(state, bank, selected);
  const old = state.banks[bank].colors;
  const tagged = old.map((color, origin) => ({ color, origin }));
  const chosen = new Set(selected);
  const moving = tagged.filter(item => chosen.has(item.origin));
  const remaining = tagged.filter(item => !chosen.has(item.origin));
  const adjusted = destination - selected.filter(i => i < destination).length;
  const reordered = [...remaining.slice(0, adjusted), ...moving, ...remaining.slice(adjusted)];
  for (const locked of state.banks[bank].locked) {
    if (reordered[locked].origin !== locked) throw new Error(`move would displace locked palette index ${locked}`);
  }
  const next = cloneSnapshot(state);
  next.banks[bank].colors = reordered.map(item => item.color.slice());
  next.selection = { bank, indices: moving.map((_, offset) => adjusted + offset), anchor: adjusted };
  return checkpoint(state, { ...next, history: state.history, gesture: state.gesture });
}

function copyAcrossBanks(state, sourceBank, indices, destinationBank, destination) {
  bankKey(sourceBank); bankKey(destinationBank);
  if (sourceBank === destinationBank) throw new Error('cross-bank copy requires two different banks');
  const selected = normalizedIndices(indices);
  indexOf(destination);
  if (destination + selected.length > BANK_SIZE) fail('copied colors do not fit in the destination bank');
  const targets = selected.map((_, offset) => destination + offset);
  assertEditable(state, destinationBank, targets);
  const next = cloneSnapshot(state);
  selected.forEach((source, offset) => { next.banks[destinationBank].colors[destination + offset] = state.banks[sourceBank].colors[source].slice(); });
  next.selection = { bank: destinationBank, indices: targets, anchor: destination };
  return checkpoint(state, { ...next, history: state.history, gesture: state.gesture });
}

function cloneAToB(state) {
  assertEditable(state, 'B', Array.from({ length: BANK_SIZE - 1 }, (_, i) => i + 1));
  const next = cloneSnapshot(state);
  for (let i = 1; i < BANK_SIZE; i += 1) next.banks.B.colors[i] = state.banks.A.colors[i].slice();
  return checkpoint(state, { ...next, history: state.history, gesture: state.gesture });
}

function setFollowA(state, enabled) {
  const next = cloneSnapshot(state);
  next.followA = Boolean(enabled);
  return checkpoint(state, { ...next, history: state.history, gesture: state.gesture });
}

function previewColors(state, bank) {
  bankKey(bank);
  const source = bank === 'B' && state.followA ? state.banks.A.colors : state.banks[bank].colors;
  return source.map(color => color.slice());
}

function beginGesture(state) {
  if (state.gesture) throw new Error('a palette gesture is already active');
  return { ...state, gesture: { before: cloneSnapshot(state) } };
}
function updateGesture(state, bank, index, color) {
  if (!state.gesture) throw new Error('beginGesture must be called before updateGesture');
  return editColor(state, bank, index, color);
}
function commitGesture(state) {
  if (!state.gesture) throw new Error('no palette gesture is active');
  const before = state.gesture.before;
  const history = sameSnapshot(before, cloneSnapshot(state)) ? state.history.slice() : [...state.history, before];
  return { ...state, history, gesture: null };
}
function cancelGesture(state) {
  if (!state.gesture) throw new Error('no palette gesture is active');
  return { ...restore(state, state.gesture.before), history: state.history.slice() };
}
function undo(state) {
  if (state.gesture) throw new Error('commit or cancel the active gesture before undo');
  if (!state.history.length) return state;
  const snapshot = state.history[state.history.length - 1];
  return { ...restore(state, snapshot), history: state.history.slice(0, -1) };
}

module.exports = {
  BANK_SIZE,
  createDualPaletteModel,
  selectIndices,
  setIndexLocked,
  editColor,
  moveWithinBank,
  copyAcrossBanks,
  cloneAToB,
  setFollowA,
  previewColors,
  beginGesture,
  updateGesture,
  commitGesture,
  cancelGesture,
  undo
};
