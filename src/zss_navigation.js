'use strict';

const { collectRecords } = require('./analyzer');

function symbolsFromRecords(records) {
  return [
    ...records.functions.map((record) => ({ ...record, kind: 'function' })),
    ...records.calls.map((record) => ({ ...record, kind: 'function', declaration: false })),
    ...records.maps.map((record) => ({ ...record, kind: 'map' })),
    ...records.variables.map((record) => ({ ...record, kind: 'variable' })),
    ...records.states.map((record) => ({ ...record, kind: 'state', declaration: true })),
    ...(records.stateReferences || []).map((record) => ({ ...record, kind: 'state', declaration: false }))
  ];
}

function allSymbols(text) {
  return symbolsFromRecords(collectRecords(text));
}

function symbolLength(symbol) {
  return String(symbol.name || '').length;
}

function symbolAt(text, line, character) {
  return allSymbols(text).find((symbol) => symbol.line === line
    && character >= symbol.start
    && character <= symbol.start + symbolLength(symbol)) || null;
}

function sameSymbol(left, right) {
  return Boolean(left && right && left.kind === right.kind
    && String(left.name).toLowerCase() === String(right.name).toLowerCase());
}

function referencesFor(entries, symbol, includeDeclaration = true) {
  return entries.flatMap((entry) => (entry.records ? symbolsFromRecords(entry.records) : allSymbols(entry.text))
    .filter((candidate) => sameSymbol(candidate, symbol))
    .filter((candidate) => includeDeclaration || !candidate.declaration)
    .map((candidate) => ({ ...candidate, uri: entry.uri })));
}

function definitionsFor(entries, symbol) {
  const candidates = referencesFor(entries, symbol, true);
  if (symbol.kind === 'function' || symbol.kind === 'state') return candidates.filter((item) => item.declaration);
  if (symbol.kind === 'map' || symbol.kind === 'variable') return candidates.filter((item) => item.access === 'write');
  return [];
}

function canRename(symbol) {
  return Boolean(symbol && (symbol.kind === 'function' || symbol.kind === 'map'));
}

function validRename(symbol, value) {
  if (!canRename(symbol)) return false;
  return /^[A-Za-z_][A-Za-z0-9_.]*$/.test(String(value || ''));
}

module.exports = { symbolsFromRecords, allSymbols, symbolLength, symbolAt, sameSymbol, referencesFor, definitionsFor, canRename, validRename };
