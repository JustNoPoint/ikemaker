'use strict';

const path = require('path');
const { hash } = require('./mutation_safety');
const { parseCodeStructure, flatten } = require('./code_structure_model');
const { maskSource } = require('./state_transfer_model');
const { matchingParenthesis, argumentSpans, parseCollisionQueryReferences } = require('./collision_query_reference_authority');
const { parseCollisionOverlapReferences } = require('./collision_overlap_reference_authority');
const { SF6_HIT_REGION_PROVIDER } = require('./sf6_hit_region_provider');

const MAX_SOURCES = 256;
const MAX_SOURCE_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_BYTES = 16 * 1024 * 1024;
const MAX_EVIDENCE = 128;
const MAX_DIAGNOSTICS = 32;
const MAX_CALL_DEPTH = 4;
const ROUTE = /^[0-9a-f]{48}$/;
const HASH = /^[0-9a-f]{64}$/i;
const EFFECTS = Object.freeze({ filesystem: false, editor: false, clipboard: false, command: false, route: false, mutationAuthority: false, network: false, runtimeSimulation: false });

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function canonical(value) { return path.resolve(String(value || '')).toLowerCase(); }
function functionName(signature) { return /^([A-Za-z_][A-Za-z0-9_.]*)/.exec(String(signature || '').trim())?.[1] || ''; }
function lineAt(text, offset) { return text.slice(0, offset).split(/\r?\n/).length - 1; }
function exactInteger(text) { const value = String(text || '').trim(); return /^(?:0|[1-9]\d*)$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null; }
function selectedIdentity(value = {}) {
  const groupKey = String(value.groupKey || '').toLowerCase();
  if (!['clsn1', 'clsn2'].includes(groupKey)) throw new Error('Selected hit-region evidence requires Clsn1 or Clsn2.');
  const required = ['action', 'elementIndex', 'effectiveSlot'];
  for (const key of required) if (!Number.isSafeInteger(value[key]) || value[key] < 0) throw new Error(`Selected hit-region ${key} must be a non-negative safe integer.`);
  const airPath = path.resolve(String(value.airPath || '.')), airHash = String(value.airHash || '').toLowerCase();
  if (!HASH.test(airHash)) throw new Error('Selected hit-region AIR hash must be an exact SHA-256 digest.');
  const authoredLabel = value.authoredLabel === null || value.authoredLabel === undefined ? null : Number(value.authoredLabel);
  if (authoredLabel !== null && (!Number.isSafeInteger(authoredLabel) || authoredLabel < 0)) throw new Error('Selected hit-region authored label must be null or a non-negative safe integer.');
  return freeze({ airPath, airHash, action: value.action, actionOccurrence: Number.isSafeInteger(value.actionOccurrence) && value.actionOccurrence >= 0 ? value.actionOccurrence : 0, elementIndex: value.elementIndex, groupKey, effectiveSlot: value.effectiveSlot, authoredLabel, ownership: String(value.ownership || 'unresolved').slice(0, 96) });
}
function selectedContext(input = {}) {
  const rawSlots = input.availableSlots, rawRuntime = input.runtimeContext;
  let availableSlots = null, runtimeContext = null;
  if (rawSlots && rawSlots.authoritative === true && Array.isArray(rawSlots.filledSlots) && rawSlots.filledSlots.length <= 512 && rawSlots.filledSlots.every(item => Number.isSafeInteger(item) && item >= 0)) {
    const filledSlots = [...new Set(rawSlots.filledSlots)].sort((a, b) => a - b);
    availableSlots = freeze({ authoritative: true, profile: String(rawSlots.profile || '').slice(0, 64), filledSlots, count: filledSlots.length, maximum: filledSlots.length ? filledSlots[filledSlots.length - 1] : -1 });
  }
  if (rawRuntime && typeof rawRuntime === 'object') {
    const count = key => Number.isSafeInteger(rawRuntime[key]) && rawRuntime[key] >= 0 ? rawRuntime[key] : 0;
    runtimeContext = freeze({ saved: count('saved'), recovery: count('recovery'), override: count('override'), transform: count('transform'), omitted: count('omitted') });
  }
  return freeze({ availableSlots, runtimeContext });
}
function diagnosticCollector() {
  const rows = [], seen = new Set(); let omitted = 0;
  return { add(value) { const row = freeze({ kind: String(value.kind || 'context'), severity: ['info', 'warning'].includes(value.severity) ? value.severity : 'info', status: String(value.status || 'context'), message: String(value.message || '').slice(0, 512) }), key = `${row.kind}\0${row.status}\0${row.message}`; if (seen.has(key)) return; seen.add(key); if (rows.length < MAX_DIAGNOSTICS) rows.push(row); else omitted += 1; }, rows, omitted: () => omitted };
}
function normalizeSources(input = {}) {
  if (input.inventoryComplete !== true) return { available: false, reason: 'The assigned source inventory is incomplete.' };
  if (!Array.isArray(input.assignedSources) || !Array.isArray(input.sources) || input.assignedSources.length !== input.sources.length) return { available: false, reason: 'The assigned source inventory does not match its source snapshots.' };
  if (input.sources.length > MAX_SOURCES) return { available: false, reason: `The assigned source inventory exceeds the ${MAX_SOURCES}-file evidence limit.` };
  let total = 0; const seen = new Set(), sources = [];
  for (let index = 0; index < input.sources.length; index += 1) {
    const source = input.sources[index] || {}, filename = path.resolve(String(source.filename || '.')), key = canonical(filename), text = String(source.text ?? ''), bytes = Buffer.byteLength(text, 'utf8'), sourceHash = String(source.sourceHash || '').toLowerCase();
    if (canonical(input.assignedSources[index]) !== key) return { available: false, reason: 'An assigned source path no longer matches its source snapshot.' };
    if (seen.has(key)) return { available: false, reason: 'The assigned source inventory contains a duplicate path.' };
    if (source.available !== true) return { available: false, reason: `${path.basename(filename)} is unavailable.` };
    if (!HASH.test(sourceHash) || sourceHash !== hash(text)) return { available: false, reason: `${path.basename(filename)} has stale or malformed source-hash evidence.` };
    if (bytes > MAX_SOURCE_BYTES || (total += bytes) > MAX_TOTAL_BYTES) return { available: false, reason: 'The assigned source inventory exceeds the bounded UTF-8 evidence limit.' };
    seen.add(key); sources.push(freeze({ filename, text, sourceHash, syntax: source.syntax === 'zss' || /\.zss$/i.test(filename) ? 'zss' : 'cns', version: Number.isSafeInteger(source.version) ? source.version : null, dirty: source.dirty === true, available: true }));
  }
  return { available: true, reason: '', sources: freeze(sources), inventoryHash: hash(JSON.stringify(sources.map(item => ({ filename: canonical(item.filename), sourceHash: item.sourceHash, syntax: item.syntax })))) };
}
function owners(source) {
  if (source.syntax !== 'zss') return [];
  return flatten(parseCodeStructure(source.text, 'zss', source.filename)).filter(item => item.depth === 0 && ['state', 'function'].includes(item.kind)).map(item => ({ kind: item.kind, name: item.kind === 'function' ? functionName(item.signature) : String(item.signature || '').trim(), signature: String(item.signature || ''), startLine: item.startLine, endLine: item.endLine }));
}
function ownerAt(items, line) { return items.find(item => line >= item.startLine && line <= item.endLine) || null; }
function scopeFor(owner, managedState = null) {
  if (Number.isSafeInteger(managedState)) return freeze({ kind: 'state-gated-global', label: `State ${managedState} assignment in StateDef -4`, state: managedState });
  if (!owner) return freeze({ kind: 'unresolved', label: 'Unproven source scope' });
  if (owner.kind === 'function') return freeze({ kind: 'shared-function', label: `Function ${owner.name || owner.signature || '?'}` });
  const number = /^-?\d+$/.test(owner.signature) ? Number(owner.signature) : null;
  return freeze({ kind: Number.isSafeInteger(number) && number < 0 ? 'global-state' : 'state', label: `StateDef ${owner.signature || '?'}`, ...(Number.isSafeInteger(number) ? { state: number } : {}) });
}
function managedStateAt(text, line, provider = SF6_HIT_REGION_PROVIDER) {
  const lines = text.split(/\r?\n/); let active = null;
  for (let index = 0; index <= line && index < lines.length; index += 1) {
    const begin = provider.managedRegionBegin.exec(lines[index]);
    if (begin) active = Number(begin[1]);
    if (provider.managedRegionEnd.test(lines[index])) active = null;
  }
  return active;
}
function exactStateLink(input, selected, state, inventoryHash) {
  return Number.isSafeInteger(state) && (input.actionStateLinks || []).some(item => item && item.status === 'proven' && item.action === selected.action && item.state === state && String(item.airHash || '').toLowerCase() === selected.airHash && String(item.inventoryHash || '').toLowerCase() === inventoryHash);
}
function evidenceCollector(input, selected) {
  const rows = []; let omitted = 0;
  function add(value) {
    const source = value.source ? freeze({ filename: path.resolve(value.source.filename), sourceHash: value.source.sourceHash, version: value.source.version, dirty: value.source.dirty, start: value.start, end: value.end, line: value.line }) : null;
    const id = hash(JSON.stringify({ kind: value.kind, status: value.status, meaning: value.meaning || '', source: source && { filename: canonical(source.filename), sourceHash: source.sourceHash, start: source.start, end: source.end }, selected }));
    let route = '', noRouteReason = source ? 'No source-route issuer was supplied.' : 'This summary has no exact source span.';
    if (source && typeof input.routeFor === 'function') {
      const issued = String(input.routeFor(freeze({ id, kind: value.kind, source, selected })) || '');
      if (ROUTE.test(issued)) { route = issued; noRouteReason = ''; } else noRouteReason = 'An exact source route could not be issued.';
    }
    const row = freeze({ id, kind: value.kind, status: value.status, scope: value.scope, meaning: value.meaning || '', explanation: value.explanation || '', source, route, noRouteReason });
    if (rows.length < MAX_EVIDENCE) rows.push(row); else omitted += 1;
    return row;
  }
  return { rows, add, omitted: () => omitted };
}
function assignmentOccurrences(source, symbol) {
  const masked = maskSource(source.text, source.syntax), pattern = new RegExp(`\\bmap\\s*\\(\\s*${symbol}\\s*\\)\\s*:=\\s*([^;\\r\\n]+)`, 'gi'), output = [];
  for (let match = pattern.exec(masked); match; match = pattern.exec(masked)) {
    const rawStart = match.index + match[0].indexOf(match[1]), raw = source.text.slice(rawStart, rawStart + match[1].length), leading = raw.length - raw.trimStart().length, trailing = raw.length - raw.trimEnd().length;
    output.push({ start: rawStart + leading, end: rawStart + raw.length - trailing, line: lineAt(source.text, match.index), expression: raw.trim(), literal: exactInteger(raw) });
  }
  return output;
}
function callOccurrences(source, name) {
  const masked = maskSource(source.text, source.syntax), pattern = new RegExp(`\\bcall\\s+${name}\\s*\\(`, 'gi'), output = [];
  for (let match = pattern.exec(masked); match; match = pattern.exec(masked)) {
    const open = masked.indexOf('(', match.index), close = matchingParenthesis(masked, open); if (close < 0) continue;
    const args = argumentSpans(source.text, masked, open, close).map(item => ({ ...item, expression: source.text.slice(item.start, item.end).trim() }));
    output.push({ start: match.index, end: close + 1, line: lineAt(source.text, match.index), args }); pattern.lastIndex = close + 1;
  }
  return output;
}
function callInventory(sources, ownerTables) {
  const incoming = new Map();
  for (const source of sources.filter(item => item.syntax === 'zss')) {
    const masked = maskSource(source.text, 'zss'), pattern = /\bcall\s+([A-Za-z_][A-Za-z0-9_.]*)\s*\(/gi, table = ownerTables.get(source.filename) || [];
    for (let match = pattern.exec(masked); match; match = pattern.exec(masked)) {
      const open = masked.indexOf('(', match.index), close = matchingParenthesis(masked, open); if (close < 0) continue;
      const record = { name: match[1], source, start: match.index, end: close + 1, line: lineAt(source.text, match.index), owner: ownerAt(table, lineAt(source.text, match.index)) };
      const key = match[1].toLowerCase(), bucket = incoming.get(key) || []; if (bucket.length < MAX_EVIDENCE) bucket.push(record); incoming.set(key, bucket); pattern.lastIndex = close + 1;
    }
  }
  return incoming;
}
function unavailableModel(selected, reason) {
  return freeze({ schema: 'ikemaker.selected-box-hit-region-evidence', version: 1, complete: false, reason, selectedBox: selected, sourceMeaning: freeze({ status: 'unresolved', name: '', reason }), scope: freeze({ kind: 'unresolved', label: 'Evidence unavailable' }), runtimeStatus: freeze({ status: 'unresolved', reason: 'No runtime execution or result is claimed.' }), meanings: freeze([]), evidence: freeze([]), diagnostics: freeze([]), omissions: freeze({ evidence: 0, diagnostics: 0 }), inventoryHash: '', modelHash: hash(JSON.stringify({ selected, reason })), effects: EFFECTS });
}
function buildSelectedBoxHitRegionEvidence(input = {}) {
  const selected = selectedIdentity(input.selectedBox), normalized = normalizeSources(input);
  if (!normalized.available) return unavailableModel(selected, normalized.reason);
  const { sources, inventoryHash } = normalized, context = selectedContext(input), collector = evidenceCollector(input, selected), diagnostic = diagnosticCollector(), ownerTables = new Map(sources.map(source => [source.filename, owners(source)])), meanings = [], regionCandidates = [], unresolvedConfig = [], assignedIndexes = [];
  const provider = SF6_HIT_REGION_PROVIDER;
  for (const definition of selected.groupKey === 'clsn2' ? provider.configurations : []) {
    const occurrences = sources.flatMap(source => assignmentOccurrences(source, definition.symbol).map(item => ({ source, ...item })));
    const exact = occurrences.length === 1 && occurrences[0].literal !== null;
    if (!exact && occurrences.length) unresolvedConfig.push(definition.name);
    for (const item of occurrences) {
      const status = exact ? 'source-proven' : 'unresolved', scope = freeze({ kind: 'character-config', label: 'Character-wide SF6 configuration' });
      const row = collector.add({ kind: 'sf6-config-map', status, scope, meaning: exact ? `${definition.name} index ${item.literal}` : `${definition.name} index unresolved`, explanation: exact ? 'One literal assigned-source map write configures this project meaning; runtime initialization and later writes are not proven.' : occurrences.length > 1 ? 'Multiple assigned-source writers prevent one selected index from being proven.' : 'The configured index expression is dynamic.', source: item.source, start: item.start, end: item.end, line: item.line });
      if (exact) assignedIndexes.push({ index: item.literal, label: definition.name, kind: 'configured' });
      if (exact && selected.groupKey === 'clsn2' && item.literal === selected.effectiveSlot) regionCandidates.push({ name: definition.name, value: definition.value, status, scope, precedence: 1, evidenceId: row.id });
    }
  }
  for (const spec of provider.assignments) for (const source of sources.filter(item => item.syntax === 'zss')) {
    const table = ownerTables.get(source.filename) || [];
    for (const call of callOccurrences(source, spec.name)) {
      const index = exactInteger(call.args[0]?.expression), value = exactInteger(call.args[1]?.expression);
      if (selected.groupKey !== 'clsn2' || index !== null && index !== selected.effectiveSlot) continue;
      const owner = ownerAt(table, call.line), managedState = managedStateAt(source.text, call.line, provider), scope = scopeFor(owner, managedState), linked = exactStateLink(input, selected, Number.isSafeInteger(managedState) ? managedState : scope.state, inventoryHash), applies = index === selected.effectiveSlot, literal = index !== null && value !== null, status = literal && applies && linked ? 'source-proven' : literal && applies ? 'candidate' : 'unresolved';
      if (index !== null && linked) assignedIndexes.push({ index, label: spec.name, kind: 'assigned' });
      const meaning = literal ? spec.semantic(value) : '';
      const row = collector.add({ kind: spec.kind, status, scope, meaning: meaning || `${spec.name} arguments unresolved`, explanation: !literal ? 'A dynamic or malformed argument cannot be assigned to the selected box.' : !applies ? `This literal assignment targets Clsn2[${index}], not the selected box.` : linked ? 'The literal assignment and selected Action/State link are source-proven; execution remains runtime-unresolved.' : 'The literal assignment exists, but selected Action ownership is not source-proven.', source, start: call.start, end: call.end, line: call.line });
      if (literal && applies && meaning) {
        const entry = { name: meaning, value, status, scope, evidenceId: row.id, category: spec.category, precedence: spec.category === 'region' ? 2 : 0 };
        meanings.push(entry); if (spec.category === 'region') regionCandidates.push(entry);
      }
    }
  }
  const dynamicFunctions = new Set();
  for (const source of sources.filter(item => item.syntax === 'zss')) {
    const table = ownerTables.get(source.filename) || [];
    for (const query of parseCollisionQueryReferences(source.text, 'zss')) {
      if (query.queryGroup !== selected.groupKey) continue;
      const indexField = query.fields.find(item => item.key === 'index'), literal = exactInteger(indexField?.expression), applies = literal === null || literal === selected.effectiveSlot;
      if (!applies) continue;
      const owner = ownerAt(table, query.controllerLine), scope = scopeFor(owner);
      collector.add({ kind: 'clsnvar-read', status: 'candidate', scope, meaning: '', explanation: literal === null ? `Dynamic ${indexField?.expression || 'index'} may read the selected effective slot; its runtime value is not proven.` : 'This literal ClsnVar index reads the selected effective slot when this scope executes; its value is not simulated.', source, start: query.callStart, end: query.callEnd, line: query.controllerLine });
      if (owner?.kind === 'function' && owner.name) dynamicFunctions.add(owner.name.toLowerCase());
    }
    for (const overlap of parseCollisionOverlapReferences(source.text, 'zss')) {
      if (overlap.ownerGroup !== selected.groupKey) continue;
      const owner = ownerAt(table, overlap.controllerLine), scope = scopeFor(owner);
      const valid = overlap.available === true;
      collector.add({ kind: 'clsnoverlap-read', status: valid ? 'candidate' : 'unresolved', scope, meaning: '', explanation: valid ? `ClsnOverlap checks the effective ${overlap.ownerGroup === 'clsn1' ? 'Clsn1' : 'Clsn2'} group as a whole against another player's ${overlap.targetGroup || 'unresolved group'}. It is not index-specific and does not prove that the selected slot overlaps at runtime.` : `This ClsnOverlap call is unavailable as semantic evidence: ${overlap.reason || 'the call could not be resolved exactly.'}`, source, start: overlap.callStart, end: overlap.callEnd, line: overlap.controllerLine });
      if (valid && owner?.kind === 'function' && owner.name) dynamicFunctions.add(owner.name.toLowerCase());
    }
  }
  const incomingCalls = callInventory(sources, ownerTables);
  if (dynamicFunctions.size) {
    const queue = [...dynamicFunctions].map(name => ({ name, depth: 0 })), seen = new Set(dynamicFunctions);
    while (queue.length) {
      const current = queue.shift(); if (current.depth >= MAX_CALL_DEPTH) continue;
      for (const call of incomingCalls.get(current.name) || []) {
        const source = call.source, scope = scopeFor(call.owner);
        collector.add({ kind: 'function-call-chain', status: 'candidate', scope, meaning: '', explanation: `${scope.label} calls ${call.name}, which reaches selected-group collision-query evidence through a bounded source call chain; runtime execution and selected index remain unresolved.`, source, start: call.start, end: call.end, line: call.line });
        if (call.owner?.kind === 'function' && call.owner.name) { const caller = call.owner.name.toLowerCase(); if (!seen.has(caller)) { seen.add(caller); queue.push({ name: caller, depth: current.depth + 1 }); } }
      }
    }
  }
  let sourceMeaning, scope;
  if (selected.groupKey === 'clsn1') {
    sourceMeaning = freeze({ status: 'unresolved', name: '', reason: 'SF6 hurt-region names apply only to Clsn2; Clsn1 may appear only as a dynamic attack-box candidate.' }); scope = freeze({ kind: 'selected-box', label: 'Selected Clsn1 effective slot' });
  } else {
    const top = regionCandidates.length ? Math.max(...regionCandidates.map(item => item.precedence || 0)) : -1, preferred = regionCandidates.filter(item => (item.precedence || 0) === top), names = [...new Set(preferred.map(item => item.name))], blocked = unresolvedConfig.length > 0 && top <= 1;
    if (preferred.length && names.length === 1 && !blocked) { sourceMeaning = freeze({ status: preferred.every(item => item.status === 'source-proven') ? 'source-proven' : 'candidate', name: names[0], reason: preferred.every(item => item.status === 'source-proven') ? 'One bounded assigned-source meaning matches this effective Clsn2 slot.' : 'A matching authored meaning exists, but selected Action ownership is not source-proven.' }); scope = preferred[0].scope; }
    else if (preferred.length || blocked) { sourceMeaning = freeze({ status: 'unresolved', name: '', reason: blocked ? `Configured region evidence is dynamic, duplicated, or conflicting (${unresolvedConfig.join(', ')}).` : 'Conflicting source meanings target the selected effective Clsn2 slot.' }); scope = freeze({ kind: 'unresolved', label: 'Conflicting or dynamic source meaning' }); }
    else { sourceMeaning = freeze({ status: 'unresolved', name: '', reason: 'No named hit-region assignment targets this effective Clsn2 slot.' }); scope = freeze({ kind: 'selected-box', label: 'Selected Clsn2 effective slot' }); }
  }
  const uniqueMeanings = [], seenMeanings = new Set();
  for (const item of [...regionCandidates, ...meanings.filter(value => value.category === 'immunity')]) { const key = `${item.category || 'region'}\0${item.name}\0${item.evidenceId}`; if (!seenMeanings.has(key)) { seenMeanings.add(key); uniqueMeanings.push(freeze({ category: item.category || 'region', name: item.name, value: item.value, status: item.status, scope: item.scope, evidenceId: item.evidenceId })); } }
  if (selected.authoredLabel !== null && selected.authoredLabel !== selected.effectiveSlot) diagnostic.add({ kind: 'label-slot-mismatch', severity: 'warning', status: 'source-layout', message: `Authored label ${selected.authoredLabel} resolves to effective slot ${selected.effectiveSlot} for this target.` });
  if (/default|inherit/i.test(selected.ownership)) diagnostic.add({ kind: 'inherited-ownership', severity: 'info', status: 'context', message: `This frame uses ${selected.ownership} collision ownership; editing may materialize or affect shared/default boxes.` });
  if (context.availableSlots) for (const item of assignedIndexes) if (!context.availableSlots.filledSlots.includes(item.index)) diagnostic.add({ kind: 'index-outside-effective-slots', severity: 'warning', status: 'source-layout', message: `${item.kind === 'configured' ? 'Configured' : 'Assigned'} ${item.label} index ${item.index} is not among this frame's available effective slots (${context.availableSlots.filledSlots.join(', ') || 'none'}).` });
  const runtime = context.runtimeContext, runtimeTotal = runtime ? runtime.saved + runtime.recovery + runtime.override + runtime.transform : 0;
  if (runtimeTotal) diagnostic.add({ kind: 'runtime-plan-presence', severity: 'warning', status: 'runtime-unresolved', message: `Saved/recovery runtime plans are present (saved ${runtime.saved}, recovery ${runtime.recovery}, OverrideClsn ${runtime.override}, TransformClsn ${runtime.transform}); this static meaning is not a live-runtime result.` });
  const evidence = freeze(collector.rows), diagnostics = freeze(diagnostic.rows), omissions = freeze({ evidence: collector.omitted(), diagnostics: diagnostic.omitted() }), reasonParts = [];
  if (omissions.evidence) reasonParts.push(`${omissions.evidence} evidence row(s) were omitted by the ${MAX_EVIDENCE}-row bound.`); if (omissions.diagnostics) reasonParts.push(`${omissions.diagnostics} diagnostic row(s) were omitted by the ${MAX_DIAGNOSTICS}-row bound.`); const reason = reasonParts.join(' ');
  const model = { schema: 'ikemaker.selected-box-hit-region-evidence', version: 1, complete: true, reason, selectedBox: selected, sourceMeaning, scope, runtimeStatus: freeze({ status: 'unresolved', reason: 'Static source evidence does not prove that a scope executes, an effective slot exists at that tick, an overlap occurs, or a hit result is produced.' }), meanings: freeze(uniqueMeanings), evidence, diagnostics, omissions, inventoryHash, effects: EFFECTS };
  model.modelHash = hash(JSON.stringify({ ...model, modelHash: undefined }));
  return freeze(model);
}

module.exports = { MAX_SOURCES, MAX_SOURCE_BYTES, MAX_TOTAL_BYTES, MAX_EVIDENCE, MAX_DIAGNOSTICS, MAX_CALL_DEPTH, buildSelectedBoxHitRegionEvidence };
