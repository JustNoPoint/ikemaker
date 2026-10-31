'use strict';

const assert = require('assert');
const path = require('path');
const { types: utilTypes } = require('util');
const {
  SCHEMA, MAX_ALIGNMENT_REFS, MAX_ONION_PER_SIDE, MAX_STORED_ENTRIES, EFFECTS,
  createAirAlignmentLayers, digest
} = require('../src/air_alignment_layers_model');

const airPath = path.resolve('C:/chars/Hero/Hero.air');
const source = [
  '[Begin Action 0]',
  '0, 0, 0, 0, 4',
  '0, 1, 2, -3, 5, H',
  '0, 2, 7, 8, -1, , AS128D128, 1.5, .5, 15',
  '',
  '[Begin Action 5]',
  '5, 0, -4, 6, 3',
  '5, 1, 10, 12, 2',
  '',
  '[Begin Action -1]',
  '9, 9, 1, 1, 1',
  ''
].join('\r\n');
const ref = (action, elementIndex, actionOccurrence = 0) => ({ action, actionOccurrence, elementIndex });
const request = changes => ({
  airPath, text: source, sourceFingerprint: digest(source), base: ref(0, 1),
  alignment: [ref(5, 0)], onion: { before: 1, after: 1 }, states: [], primaryKey: null,
  ...changes
});

const first = createAirAlignmentLayers(request());
assert.strictEqual(first.schema, SCHEMA);
assert.strictEqual(first.status, 'ready');
assert.strictEqual(first.layers.length, 4, 'base, one exact alignment layer, and two onion elements are projected');
assert.deepStrictEqual(first.layers.map(item => item.kind), ['base', 'alignment', 'onion', 'onion']);
assert.deepStrictEqual(first.layers.map(item => item.identity.elementIndex), [1, 0, 0, 2]);
assert.deepStrictEqual(first.layers[0].sprite, { group: 0, index: 1 });
assert.deepStrictEqual(first.layers[0].authored, { x: 2, y: -3, flags: 'H', blend: '', scaleX: 1, scaleY: 1, angle: 0, rawTime: 5 });
assert.match(first.layers[0].identity.actionSourceFingerprint, /^[A-F0-9]{64}$/);
assert.match(first.layers[0].identity.frameFingerprint, /^[A-F0-9]{64}$/);
assert.strictEqual(first.layers[0].identity.airPath, airPath);
assert.strictEqual(first.layers[0].identity.sourceFingerprint, digest(source));
assert.strictEqual(first.layers[2].relation, 'previous');
assert.strictEqual(first.layers[3].relation, 'next');
assert(Object.isFrozen(first) && Object.isFrozen(first.layers) && first.layers.every(Object.isFrozen), 'the public projection is deeply immutable');
assert.deepStrictEqual(first.effects, EFFECTS);
assert(Object.values(first.effects).every(value => value === false), 'Slice A has no edit, save, route, network, or mutation authority');

const alignmentKey = first.layers.find(item => item.kind === 'alignment').key;
const previousKey = first.layers.find(item => item.relation === 'previous').key;
const selected = createAirAlignmentLayers(request({ states: [
  { key: first.baseKey, visible: true, selected: false },
  { key: alignmentKey, visible: true, selected: true },
  { key: previousKey, visible: false, selected: true }
], primaryKey: previousKey }));
assert.strictEqual(selected.layers.find(item => item.key === previousKey).selected, true, 'selection remains independent from visibility');
assert.strictEqual(selected.layers.find(item => item.key === previousKey).visible, false);
assert.deepStrictEqual(selected.moveTargetKeys, [alignmentKey], 'hidden selected layers are not effective move targets');
assert.strictEqual(selected.primaryKey, alignmentKey, 'a hidden requested primary falls to the first visible selected non-base layer');

const baseFallback = createAirAlignmentLayers(request({ states: [
  { key: first.baseKey, visible: true, selected: false },
  { key: alignmentKey, visible: false, selected: true }
], primaryKey: alignmentKey }));
assert.deepStrictEqual(baseFallback.moveTargetKeys, [], 'deselecting every visible layer never invents a Base move target');
assert.strictEqual(baseFallback.primaryKey, first.baseKey, 'Base is the deterministic fallback when no non-base visible target remains');
assert.strictEqual(baseFallback.layers.find(item => item.key === first.baseKey).effectiveMoveTarget, false);

const duplicate = createAirAlignmentLayers(request({ alignment: [ref(5, 0), ref(5, 0), ref(0, 1)] }));
assert.strictEqual(duplicate.layers.length, 4, 'duplicate alignment references and a duplicate of Base are deduplicated');
assert.strictEqual(duplicate.omittedDuplicateReferences, 2);
const uniqueKeys = new Set(duplicate.layers.map(item => item.key)); assert.strictEqual(uniqueKeys.size, duplicate.layers.length);

const negative = createAirAlignmentLayers(request({ alignment: [ref(-1, 0)] }));
assert(negative.layers.some(item => item.identity.action === -1), 'authored negative Action IDs retain exact identity');

const removedState = createAirAlignmentLayers(request({ alignment: [], states: [{ key: alignmentKey, visible: true, selected: true }] }));
assert.deepStrictEqual(removedState.orphanStateKeys, [alignmentKey], 'state for a removed exact reference is reported for bounded cleanup and never retargeted');
assert(!removedState.layers.some(item => item.key === alignmentKey));

const changedSource = source.replace('5, 0, -4, 6, 3', '5, 0, -3, 6, 3');
assert.throws(() => createAirAlignmentLayers({ ...request(), text: changedSource }), /stale/i, 'a stale source fingerprint is rejected');
const changed = createAirAlignmentLayers({ ...request(), text: changedSource, sourceFingerprint: digest(changedSource), states: [{ key: alignmentKey, visible: true, selected: true }] });
assert(changed.orphanStateKeys.includes(alignmentKey), 'source drift changes exact frame identity instead of chasing or retargeting the stored row');

const duplicates = source + '[Begin Action 5]\r\n5, 2, 0, 0, 1\r\n';
assert.throws(() => createAirAlignmentLayers({ ...request(), text: duplicates, sourceFingerprint: digest(duplicates) }), /defined more than once/i);
const alias = source + '[Begin Action 10]\r\nCopy Action 5\r\n';
assert.throws(() => createAirAlignmentLayers({ ...request({ alignment: [ref(10, 0)] }), text: alias, sourceFingerprint: digest(alias) }), /Copy Action alias/i);
const blank = source + '[Begin Action 20]\r\n; no frames\r\n';
assert.throws(() => createAirAlignmentLayers({ ...request({ alignment: [ref(20, 0)] }), text: blank, sourceFingerprint: digest(blank) }), /no authored frame/i);
assert.throws(() => createAirAlignmentLayers(request({ alignment: [ref(5, 9)] })), /outside Action/i);
assert.throws(() => createAirAlignmentLayers(request({ alignment: [ref(5, 0, 1)] })), /no unique occurrence/i);
assert.throws(() => createAirAlignmentLayers(request({ base: null })), /base must contain/i);
assert.throws(() => createAirAlignmentLayers(request({ onion: null })), /onion before\/after/i);

assert.throws(() => createAirAlignmentLayers(request({ alignment: Array.from({ length: MAX_ALIGNMENT_REFS + 1 }, () => ref(5, 0)) })), /at most 32/i);
assert.throws(() => createAirAlignmentLayers(request({ onion: { before: MAX_ONION_PER_SIDE + 1, after: 0 } })), /from 0 to 4/i);
assert.throws(() => createAirAlignmentLayers(request({ states: Array.from({ length: MAX_STORED_ENTRIES + 1 }, (_, index) => ({ key: String(index).padStart(64, 'A').slice(-64), visible: true, selected: false })) })), /at most 64/i);
assert.throws(() => createAirAlignmentLayers(request({ airPath: 'relative.air' })), /canonical absolute path/i);

let getterRuns = 0; const accessor = request(); Object.defineProperty(accessor, 'primaryKey', { enumerable: true, get() { getterRuns += 1; return null; } });
assert.throws(() => createAirAlignmentLayers(accessor), /canonical plain data/i); assert.strictEqual(getterRuns, 0, 'accessor values are rejected without execution');
let proxyRuns = 0; const proxy = new Proxy({}, { ownKeys() { proxyRuns += 1; throw new Error('must not reflect'); }, get() { proxyRuns += 1; throw new Error('must not read'); } });
assert.throws(() => createAirAlignmentLayers(proxy), /canonical plain data/i); assert.strictEqual(proxyRuns, 0, 'root proxies are rejected without invoking traps'); assert(utilTypes.isProxy(proxy));
const cyclic = request(); cyclic.states.push(cyclic); assert.throws(() => createAirAlignmentLayers(cyclic), /canonical plain data/i);
const hiddenExtra = request(); Object.defineProperty(hiddenExtra.states, 'hidden', { value: true }); assert.throws(() => createAirAlignmentLayers(hiddenExtra), /canonical plain data/i);

console.log('AIR exact-element alignment layers are immutable, bounded, stale-safe, deduplicated, and read-only');
