'use strict';

const assert = require('assert');
const crypto = require('crypto');
const path = require('path');
const { test } = require('node:test');
const { parseStateSource } = require('../src/state_transfer_model');
const { parseCollisionReferences } = require('../src/collision_reference_authority');
const { PINNED_SOURCE_COMMIT, MAX_SOURCE_BYTES, MAX_TOTAL_SOURCE_BYTES, MAX_STATES, MAX_CONTROLLERS, createAirRuntimeCollisionControllerReplacementPlan } = require('../src/air_runtime_collision_controller_edit_plan');

const sha = value => crypto.createHash('sha256').update(String(value), 'utf8').digest('hex').toUpperCase();
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; }
function fixture(text, options = {}) {
  const filename = path.resolve(options.filename || 'C:/chars/Hero/runtime.zss'), records = parseCollisionReferences(text, 'zss'), record = records[options.record || 0], declaration = parseStateSource(text, filename, 'zss').declarations.find(item => item.value === (options.stateNumber ?? 200));
  if (!record || !declaration) throw new Error('Invalid fixture.');
  const sourceHash = sha(text), capability = freeze({ target: options.target || 'nightly', decision: options.decision || 'supported', fingerprint: options.fingerprint || 'A'.repeat(64), indexed: options.indexed !== false, dummy: options.dummy !== false }), snapshot = freeze({ inventoryComplete: true, clean: true, assignedSources: [filename], sources: [{ available: true, dirty: false, filename, syntax: 'zss', text, sourceHash, version: options.version ?? 7 }] }), destination = freeze({ sourcePath: filename, sourceHash, sourceVersion: options.version ?? 7, stateNumber: options.stateNumber ?? 200, stateLine: declaration.line, stateCharacter: declaration.character, stateExpression: declaration.expression, controller: { kind: record.label, start: record.controllerStart, end: record.controllerEnd, controllerHash: sha(text.slice(record.controllerStart, record.controllerEnd)) } });
  return { capability, snapshot, destination, record };
}
function plan(text, draft, options = {}) { const evidence = fixture(text, options); return createAirRuntimeCollisionControllerReplacementPlan({ sourceCommit: options.sourceCommit || PINNED_SOURCE_COMMIT, capability: evidence.capability, snapshot: evidence.snapshot, destination: evidence.destination, draft: freeze(draft) }); }
function apply(text, result) { return text.slice(0, result.replacement.start) + result.replacement.text + text.slice(result.replacement.end); }

test('replaces exact OverrideClsn and TransformClsn bodies while preserving every outside byte', () => {
  for (const sample of [
    { text: '[StateDef 200]\n\tOverrideClsn { group: Clsn1; index: 0; rect: 4, 6, -2, -8; }\n# tail\n', draft: { kind: 'OverrideClsn', group: 2, index: -1, rect: [-5, -6, 7, 8] }, fields: ['group: Clsn2;', 'index: -1;', 'rect: -5, -6, 7, 8;'] },
    { text: '[StateDef 200]\r\n  TransformClsn {\r\n    scale: 1;\r\n    pivot: 4;\r\n  }', draft: { kind: 'TransformClsn', group: -1, index: 0, scale: [-2, 0], angle: 45.5, pivot: [3, -4] }, fields: ['group: All;', 'index: 0;', 'scale: -2, 0;', 'angle: 45.5;', 'pivot: 3, -4;'] }
  ]) {
    const result = plan(sample.text, sample.draft); assert.strictEqual(result.status, 'ready'); assert.strictEqual(result.preview.eol, sample.text.includes('\r\n') ? 'CRLF' : 'LF'); assert.ok(sample.fields.every(field => result.replacement.text.includes(field)));
    const proposed = apply(sample.text, result); assert.strictEqual(proposed.slice(0, result.replacement.start), sample.text.slice(0, result.replacement.start)); assert.strictEqual(proposed.slice(result.replacement.start + result.replacement.text.length), sample.text.slice(result.replacement.end)); assert.strictEqual(sha(proposed), result.hashes.after); assert.ok(result.preview.diff.length > 0);
  }
});

test('supports every pinned group and emits reset-only bodies for None', () => {
  const text = '[StateDef 200]\nOverrideClsn { group: Clsn1; rect: 0,0,1,1; }\n';
  for (const [group, label] of [[-1, 'All'], [0, 'None'], [1, 'Clsn1'], [2, 'Clsn2'], [3, 'Size'], [4, 'Dummy']]) {
    const result = plan(text, { kind: 'OverrideClsn', group, index: 99, rect: [3, 4, 1, 2] }); assert.strictEqual(result.status, 'ready'); assert.ok(result.replacement.text.includes(`group: ${label};`));
    if (group === 0) { assert.ok(!result.replacement.text.includes('index:')); assert.ok(!result.replacement.text.includes('rect:')); } else assert.ok(result.replacement.text.includes('rect: 1, 2, 3, 4;'));
  }
});

test('normalizes omitted and partial source arity and detects semantic no-op without reformatting', () => {
  const override = '[StateDef 200]\nOverrideClsn { rect: 4, 3; }\n', reset = plan(override, { kind: 'OverrideClsn', group: 0, index: 999, rect: [9, 9, 9, 9] }); assert.strictEqual(reset.status, 'no-op'); assert.strictEqual(reset.hashes.before, reset.hashes.after); assert.strictEqual(reset.replacement, null);
  const transform = '[StateDef 200]\nTransformClsn { group: All; scale: 2; angle: -0; pivot: 4; }\n', same = plan(transform, { kind: 'TransformClsn', group: -1, index: -1, scale: [2, 1], angle: 0, pivot: [4, 0] }); assert.strictEqual(same.status, 'no-op'); assert.strictEqual(same.before.angle, 0);
});

test('accepts case-insensitive symbolic source groups but rejects numeric authored group literals', () => {
  assert.strictEqual(plan('[StateDef 200]\nOverrideClsn { group: cLsN1; rect: 0,0,1,1; }\n', { kind: 'OverrideClsn', group: 1, index: 0, rect: [0, 0, 2, 2] }).status, 'ready');
  assert.strictEqual(plan('[StateDef 200]\nTransformClsn { group: aLl; scale: 1,1; }\n', { kind: 'TransformClsn', group: -1, index: -1, scale: [2, 1], angle: 0, pivot: [0, 0] }).status, 'ready');
  for (const [kind, field, draft] of [
    ['OverrideClsn', 'group: 1; rect: 0,0,1,1;', { kind: 'OverrideClsn', group: 1, index: 0, rect: [0, 0, 2, 2] }],
    ['OverrideClsn', 'group: 0;', { kind: 'OverrideClsn', group: 0, index: 0, rect: [0, 0, 0, 0] }],
    ['TransformClsn', 'group: -1; scale: 1,1;', { kind: 'TransformClsn', group: -1, index: -1, scale: [2, 1], angle: 0, pivot: [0, 0] }],
    ['TransformClsn', 'group: 0;', { kind: 'TransformClsn', group: 0, index: -1, scale: [1, 1], angle: 0, pivot: [0, 0] }]
  ]) assert.strictEqual(plan(`[StateDef 200]\n${kind} { ${field} }\n`, draft).status, 'conflict');
});

test('accepts negative, zero, fractional scale and normalized rect, angle, pivot values', () => {
  const text = '[StateDef 200]\nTransformClsn { scale: 1,1; }\n', result = plan(text, { kind: 'TransformClsn', group: 1, index: -1, scale: [-0.25, 0], angle: -360.5, pivot: [1e-7, -2.5] }); assert.strictEqual(result.status, 'ready'); assert.ok(result.replacement.text.includes('scale: -0.25, 0;')); assert.ok(result.replacement.text.includes('pivot: 0.0000001, -2.5;'));
});

test('binds one exact duplicate-kind occurrence rather than rejecting its sibling', () => {
  const text = '[StateDef 200]\nOverrideClsn { group: Clsn1; rect: 0,0,1,1; }\nOverrideClsn { group: Clsn2; rect: 2,2,3,3; }\n', result = plan(text, { kind: 'OverrideClsn', group: 3, index: 0, rect: [-1, -2, 4, 5] }, { record: 1 }); assert.strictEqual(result.status, 'ready'); const proposed = apply(text, result); assert.ok(proposed.includes('OverrideClsn { group: Clsn1; rect: 0,0,1,1; }')); assert.ok(proposed.includes('group: Size;'));
});

test('accepts exact dirty open-document text as authority and rejects inconsistent clean metadata', () => {
  const text = '[StateDef 200]\nOverrideClsn { group: Clsn1; rect: 0,0,1,1; }\n', evidence = fixture(text), dirtySnapshot = freeze({ ...evidence.snapshot, clean: false, sources: [{ ...evidence.snapshot.sources[0], dirty: true }] }), draft = freeze({ kind: 'OverrideClsn', group: 2, index: 0, rect: [0, 0, 2, 2] });
  const input = { sourceCommit: PINNED_SOURCE_COMMIT, capability: evidence.capability, snapshot: dirtySnapshot, destination: evidence.destination, draft }; assert.strictEqual(createAirRuntimeCollisionControllerReplacementPlan(input).status, 'ready');
  const inconsistent = freeze({ ...dirtySnapshot, clean: true }); assert.strictEqual(createAirRuntimeCollisionControllerReplacementPlan({ ...input, snapshot: inconsistent }).status, 'conflict');
});

test('fails closed for Stable, unknown, mismatched commit semantics, malformed fingerprints, and unsupported Dummy', () => {
  const text = '[StateDef 200]\nOverrideClsn { rect: 0,0,1,1; }\n', draft = { kind: 'OverrideClsn', group: 1, index: 0, rect: [0, 0, 2, 2] };
  assert.strictEqual(plan(text, draft, { target: 'stable', indexed: false }).status, 'unavailable'); assert.strictEqual(plan(text, draft, { decision: 'unknown' }).status, 'unavailable'); assert.strictEqual(plan(text, draft, { sourceCommit: '0'.repeat(40) }).status, 'unavailable'); assert.strictEqual(plan(text, { ...draft, group: 4 }, { dummy: false }).status, 'unavailable');
  const evidence = fixture(text); for (const fingerprint of ['abc', 'a'.repeat(64)]) assert.throws(() => createAirRuntimeCollisionControllerReplacementPlan({ sourceCommit: PINNED_SOURCE_COMMIT, capability: freeze({ ...evidence.capability, fingerprint }), snapshot: evidence.snapshot, destination: evidence.destination, draft: freeze(draft) }), /capability/i);
});

test('rejects stale source authority and unsupported ownership/structure as conflicts', () => {
  const base = '[StateDef 200]\nOverrideClsn { rect: 0,0,1,1; }\n', draft = freeze({ kind: 'OverrideClsn', group: 1, index: 0, rect: [0, 0, 2, 2] }), evidence = fixture(base);
  const withInput = (changes = {}) => createAirRuntimeCollisionControllerReplacementPlan({ sourceCommit: PINNED_SOURCE_COMMIT, capability: evidence.capability, snapshot: changes.snapshot || evidence.snapshot, destination: changes.destination || evidence.destination, draft });
  assert.strictEqual(withInput({ destination: freeze({ ...evidence.destination, sourceHash: 'F'.repeat(64) }) }).status, 'conflict');
  assert.strictEqual(withInput({ destination: freeze({ ...evidence.destination, sourceVersion: 8 }) }).status, 'conflict');
  assert.strictEqual(withInput({ destination: freeze({ ...evidence.destination, controller: { ...evidence.destination.controller, start: evidence.destination.controller.start + 1 } }) }).status, 'conflict');
  assert.strictEqual(withInput({ destination: freeze({ ...evidence.destination, controller: { ...evidence.destination.controller, controllerHash: 'F'.repeat(64) } }) }).status, 'conflict');
  const staleSource = freeze({ ...evidence.snapshot, sources: [{ ...evidence.snapshot.sources[0], sourceHash: 'E'.repeat(64) }] }); assert.strictEqual(withInput({ snapshot: staleSource }).status, 'conflict');
  const cnsPath = path.resolve('C:/chars/Hero/runtime.cns'), cnsSnapshot = freeze({ inventoryComplete: true, clean: true, assignedSources: [cnsPath], sources: [{ ...evidence.snapshot.sources[0], filename: cnsPath, syntax: 'cns' }] }), cnsDestination = freeze({ ...evidence.destination, sourcePath: cnsPath }); assert.strictEqual(withInput({ snapshot: cnsSnapshot, destination: cnsDestination }).status, 'conflict');
  for (const text of [
    '[StateDef -2]\nOverrideClsn { rect: 0,0,1,1; }\n',
    '[StateDef 200]\n@customstate\nOverrideClsn { rect: 0,0,1,1; }\n',
    '[StateDef 200]\nif time { OverrideClsn { rect: 0,0,1,1; } }\n',
    '[StateDef 200]\nroot, OverrideClsn { rect: 0,0,1,1; }\n',
    '[StateDef 200]\nOverrideClsn { rect: map(x),0,1,1; }\n',
    '[StateDef 200]\nOverrideClsn { rect: 0,0,1,1; rect: 1,1,2,2; }\n',
    '[StateDef 200]\nOverrideClsn { rect: 0,0,1,1; redirectid: 2; }\n',
    '[StateDef 200]\nOverrideClsn { rect: 0,0,1,1; # keep\n }\n',
    '[StateDef 200]\nOverrideClsn { rect: 0,0,1,1; mystery: 2; }\n'
  ]) assert.strictEqual(plan(text, { kind: 'OverrideClsn', group: 1, index: 0, rect: [0, 0, 2, 2] }, { stateNumber: text.includes('-2') ? -2 : 200 }).status, 'conflict', text);
  const incomplete = '[StateDef 200]\nOverrideClsn { rect: 0,0,1,1;\n'; assert.strictEqual(plan(incomplete, { kind: 'OverrideClsn', group: 1, index: 0, rect: [0, 0, 2, 2] }).status, 'conflict');
});

test('rejects every relative path authority without deriving identity from cwd', () => {
  const text = '[StateDef 200]\nOverrideClsn { rect: 0,0,1,1; }\n', evidence = fixture(text), draft = freeze({ kind: 'OverrideClsn', group: 1, index: 0, rect: [0, 0, 2, 2] }), run = (snapshot, destination) => createAirRuntimeCollisionControllerReplacementPlan({ sourceCommit: PINNED_SOURCE_COMMIT, capability: evidence.capability, snapshot, destination, draft });
  assert.notStrictEqual(run(evidence.snapshot, freeze({ ...evidence.destination, sourcePath: 'relative.zss' })).status, 'ready');
  assert.notStrictEqual(run(freeze({ ...evidence.snapshot, sources: [{ ...evidence.snapshot.sources[0], filename: 'relative.zss' }] }), evidence.destination).status, 'ready');
  assert.notStrictEqual(run(freeze({ ...evidence.snapshot, assignedSources: ['relative.zss'] }), evidence.destination).status, 'ready');
});

test('rejects Function and out-of-StateDef controller ownership', () => {
  const text = '[StateDef 200]\nNull { }\n\nFunction Shared() {\nOverrideClsn { rect: 0,0,1,1; }\n}\n'; assert.strictEqual(plan(text, { kind: 'OverrideClsn', group: 1, index: 0, rect: [0, 0, 2, 2] }).status, 'conflict');
});

test('rejects duplicate StateDef identity and malformed/incomplete controller bodies', () => {
  const duplicate = '[StateDef 200]\nOverrideClsn { rect: 0,0,1,1; }\n[StateDef 200]\nnull { }\n', evidence = fixture(duplicate); assert.strictEqual(createAirRuntimeCollisionControllerReplacementPlan({ sourceCommit: PINNED_SOURCE_COMMIT, capability: evidence.capability, snapshot: evidence.snapshot, destination: evidence.destination, draft: freeze({ kind: 'OverrideClsn', group: 1, index: 0, rect: [0, 0, 2, 2] }) }).status, 'conflict');
});

test('rejects invented translation and hostile noncanonical inputs', () => {
  const text = '[StateDef 200]\nTransformClsn { scale: 1,1; }\n', evidence = fixture(text), good = { sourceCommit: PINNED_SOURCE_COMMIT, capability: evidence.capability, snapshot: evidence.snapshot, destination: evidence.destination, draft: freeze({ kind: 'TransformClsn', group: 1, index: 0, scale: [1, 1], angle: 0, pivot: [0, 0] }) };
  assert.throws(() => createAirRuntimeCollisionControllerReplacementPlan({ ...good, draft: freeze({ ...good.draft, translation: [1, 2] }) }), /no translation/i);
  const accessor = {}; Object.defineProperty(accessor, 'kind', { get() { throw new Error('coerced'); }, enumerable: true }); assert.throws(() => createAirRuntimeCollisionControllerReplacementPlan({ ...good, draft: accessor }), /canonical plain data/i);
  const proxy = new Proxy({}, { ownKeys() { throw new Error('reflected'); } }); assert.throws(() => createAirRuntimeCollisionControllerReplacementPlan({ ...good, draft: proxy }), /canonical plain data/i);
  assert.throws(() => createAirRuntimeCollisionControllerReplacementPlan({ ...good, draft: freeze({ ...good.draft, scale: [Infinity, 1] }) }), /canonical plain data/i);
  assert.throws(() => createAirRuntimeCollisionControllerReplacementPlan({ ...good, extra: true }), /contain only/i);
  const sparse = []; sparse.length = 2; sparse[1] = 1; assert.throws(() => createAirRuntimeCollisionControllerReplacementPlan({ ...good, draft: freeze({ ...good.draft, scale: sparse }) }), /canonical plain data/i);
});

test('enforces the complete assigned-source count cap without bypassing mixed syntax inventory', () => {
  const text = '[StateDef 200]\nOverrideClsn { rect: 0,0,1,1; }\n', evidence = fixture(text), assignedSources = [], sources = [];
  for (let index = 0; index < 129; index += 1) { const filename = path.resolve(`C:/chars/Hero/source-${index}.zss`), sourceText = index === 0 ? text : ''; assignedSources.push(filename); sources.push({ available: true, dirty: false, filename, syntax: 'zss', text: sourceText, sourceHash: sha(sourceText), version: null }); }
  const snapshot = freeze({ inventoryComplete: true, clean: true, assignedSources, sources }), destination = freeze({ ...evidence.destination, sourcePath: assignedSources[0], sourceVersion: null });
  assert.strictEqual(createAirRuntimeCollisionControllerReplacementPlan({ sourceCommit: PINNED_SOURCE_COMMIT, capability: evidence.capability, snapshot, destination, draft: freeze({ kind: 'OverrideClsn', group: 1, index: 0, rect: [0, 0, 2, 2] }) }).status, 'conflict');
});

test('enforces source-byte, total-byte, StateDef, controller, diff, and output caps', () => {
  const text = '[StateDef 200]\nOverrideClsn { rect: 0,0,1,1; }\n', evidence = fixture(text), draft = freeze({ kind: 'OverrideClsn', group: 1, index: 0, rect: [0, 0, 2, 2] }), run = (snapshot, destination = evidence.destination) => createAirRuntimeCollisionControllerReplacementPlan({ sourceCommit: PINNED_SOURCE_COMMIT, capability: evidence.capability, snapshot, destination, draft });
  const oversized = 'x'.repeat(MAX_SOURCE_BYTES + 1), extraPath = path.resolve('C:/chars/Hero/oversized.zss'), perSource = freeze({ inventoryComplete: true, clean: true, assignedSources: [...evidence.snapshot.assignedSources, extraPath], sources: [...evidence.snapshot.sources, { available: true, dirty: false, filename: extraPath, syntax: 'zss', text: oversized, sourceHash: sha(oversized), version: null }] }); assert.strictEqual(run(perSource).status, 'conflict');
  const chunk = 'x'.repeat(MAX_SOURCE_BYTES), chunkHash = sha(chunk), totalAssigned = [...evidence.snapshot.assignedSources], totalSources = [...evidence.snapshot.sources]; for (let index = 0; index < Math.ceil(MAX_TOTAL_SOURCE_BYTES / MAX_SOURCE_BYTES); index += 1) { const filename = path.resolve(`C:/chars/Hero/total-${index}.zss`); totalAssigned.push(filename); totalSources.push({ available: true, dirty: false, filename, syntax: 'zss', text: chunk, sourceHash: chunkHash, version: null }); } assert.strictEqual(run(freeze({ inventoryComplete: true, clean: true, assignedSources: totalAssigned, sources: totalSources })).status, 'conflict');
  const states = `${text}${Array.from({ length: MAX_STATES }, (_, index) => `[StateDef ${index + 1000}]\nNull { }\n`).join('')}`; assert.strictEqual(plan(states, draft).status, 'conflict');
  const controllers = `[StateDef 200]\n${Array.from({ length: MAX_CONTROLLERS + 1 }, () => 'OverrideClsn { rect: 0,0,1,1; }').join('\n')}\n`; assert.strictEqual(plan(controllers, draft).status, 'conflict');
  const wide = `[StateDef 200]\n${' '.repeat(40000)}OverrideClsn { rect: 0,0,1,1; }\n`; assert.throws(() => plan(wide, draft), /diff.*exceeds/i);
  const longPath = `C:\\${'a'.repeat(70000)}.zss`, longEvidence = fixture(text), longSnapshot = freeze({ ...longEvidence.snapshot, assignedSources: [longPath], sources: [{ ...longEvidence.snapshot.sources[0], filename: longPath }] }), longDestination = freeze({ ...longEvidence.destination, sourcePath: longPath }); assert.throws(() => createAirRuntimeCollisionControllerReplacementPlan({ sourceCommit: PINNED_SOURCE_COMMIT, capability: longEvidence.capability, snapshot: longSnapshot, destination: longDestination, draft }), /output.*exceeds/i);
});

test('is deterministic, deeply frozen, caller-immutable, hash-sensitive, and side-effect free', () => {
  const text = '[StateDef 200]\nOverrideClsn { group: Clsn1; rect: 0,0,1,1; }\n', evidence = fixture(text), draft = freeze({ kind: 'OverrideClsn', group: 2, index: -1, rect: [-2, -3, 4, 5] }), input = { sourceCommit: PINNED_SOURCE_COMMIT, capability: evidence.capability, snapshot: evidence.snapshot, destination: evidence.destination, draft }, before = JSON.stringify(input), left = createAirRuntimeCollisionControllerReplacementPlan(input), right = createAirRuntimeCollisionControllerReplacementPlan(input);
  assert.strictEqual(left.planHash, right.planHash); assert.strictEqual(JSON.stringify(input), before); assert.ok(Object.isFrozen(left) && Object.isFrozen(left.replacement)); assert.deepStrictEqual(left.effects, { filesystem: false, editor: false, clipboard: false, command: false, route: false, mutationAuthority: false, network: false }); assert.notStrictEqual(left.planHash, plan(text, { ...draft, index: 0 }).planHash);
});
