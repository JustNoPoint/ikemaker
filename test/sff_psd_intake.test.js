'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseIdentifyOutput, planPsdExports, collectTimelineSequence, safeLabel } = require('../src/sff_psd_intake');

const records = parseIdentifyOutput([
  '0\t200\t263\t0\t0\tComposite',
  '1\t180\t240\t10\t23\tRyu Base',
  '2\t72\t46\t64\t31\tBeard',
  '3\t90\t80\t50\t20\tAura FX',
  '4\t200\t263\t0\t0\tFrame 0001',
  '5\t200\t263\t0\t0\tFrame 0002',
  ''
].join('\n'));
assert.strictEqual(records.length, 6);
const metadata = parseIdentifyOutput('0\t64\t64\t0\t0\tComposite\ttrue\t255\tover\n1\t32\t32\t4\t5\tGlow\tfalse\t128\tmultiply\n');
assert.strictEqual(metadata[1].visible, false);
assert.ok(Math.abs(metadata[1].opacity - (128 / 255)) < 0.0001);
assert.strictEqual(metadata[1].compose, 'multiply');
assert.deepStrictEqual(planPsdExports(records, 'composite').exports.map(item => item.role), ['composite']);
assert.deepStrictEqual(planPsdExports(records, 'base').exports.map(item => item.label), ['Ryu Base']);
const variants = planPsdExports(records, 'base-with-overlays');
assert.deepStrictEqual(variants.exports.map(item => item.label), ['Ryu Base', 'Ryu Base + Beard', 'Ryu Base + Aura FX']);
assert.deepStrictEqual(variants.exports[1].pages.map(page => page.index), [1, 2], 'the Ryu beard route composites the authored base plus beard overlay on the PSD canvas');
assert.deepStrictEqual(planPsdExports(records, 'timeline').exports.map(item => item.sourceOrdinal), [4, 5]);
assert.deepStrictEqual(planPsdExports(records, 'layers').exports.map(item => item.sourceOrdinal), [1, 2, 3]);
const separated = planPsdExports(records, 'base-and-layer1');
assert.deepStrictEqual(separated.exports.map(item => item.role), ['base', 'layer-1']);
assert.deepStrictEqual(separated.exports.map(item => item.pages.map(page => page.index)), [[1], [2]], 'body and Layer 1 remain separate SFF sources');
const optionalBeard = planPsdExports(records, 'base-and-optional-layer1');
assert.deepStrictEqual(optionalBeard.exports.map(item => item.pages[0].index), [1, 2], 'a strictly labelled Beard page is accepted');
const ryuLayerNames = parseIdentifyOutput('0\t200\t263\t0\t0\tComposite\n1\t180\t240\t10\t23\tLayer 1\n2\t72\t46\t64\t31\tLayer 2\n');
assert.deepStrictEqual(planPsdExports(ryuLayerNames, 'base-and-optional-layer1').exports.map(item => item.pages[0].index), [1, 2], 'the reviewed Ryu Layer 1 body / Layer 2 beard convention is accepted');
const ryuZeroBasedLayerNames = parseIdentifyOutput('0\t200\t263\t0\t0\tComposite\n1\t180\t240\t10\t23\tLayer 0\n2\t72\t46\t64\t31\tLayer 1\n');
assert.deepStrictEqual(planPsdExports(ryuZeroBasedLayerNames, 'base-and-optional-layer1').exports.map(item => item.pages[0].index), [1, 2], 'the reviewed older Ryu Layer 0 body / Layer 1 beard convention is accepted');
const bodyOnly = parseIdentifyOutput('0\t200\t263\t0\t0\tComposite\n1\t180\t240\t10\t23\tLayer 1\n');
assert.deepStrictEqual(planPsdExports(bodyOnly, 'base-and-optional-layer1').exports.map(item => item.role), ['base'], 'a body-only PSD stays sparse');
const referenceOnly = parseIdentifyOutput('0\t200\t263\t0\t0\tComposite\n1\t180\t240\t10\t23\tLayer 1\n2\t200\t263\t0\t0\tREFERENCE\n');
assert.deepStrictEqual(planPsdExports(referenceOnly, 'base-and-optional-layer1').exports.map(item => item.role), ['base'], 'a reference page is not mistaken for beard artwork');
const unrelatedLayer = parseIdentifyOutput('0\t200\t263\t0\t0\tComposite\n1\t180\t240\t10\t23\tLayer 1\n2\t90\t80\t50\t20\tAura FX\n');
assert.deepStrictEqual(planPsdExports(unrelatedLayer, 'base-and-optional-layer1').exports.map(item => item.role), ['base'], 'an unrelated extra page is not mistaken for beard artwork');
assert.strictEqual(safeLabel('Ryu Base + Beard', 'frame'), 'Ryu_Base_Beard');
assert.throws(() => parseIdentifyOutput(''), /flattened composite/);
assert.throws(() => planPsdExports(records.slice(0, 4), 'timeline'), /No explicitly named timeline/);
const sequenceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-psd-timeline-'));
try {
  for (const name of ['Ryu_10.png', 'Ryu_2.PNG', 'Ryu_1.png']) fs.writeFileSync(path.join(sequenceRoot, name), name);
  fs.writeFileSync(path.join(sequenceRoot, 'notes.txt'), 'ignored');
  assert.deepStrictEqual(collectTimelineSequence(sequenceRoot).map(item => item.name), ['Ryu_1.png', 'Ryu_2.PNG', 'Ryu_10.png']);
} finally { fs.rmSync(sequenceRoot, { recursive: true, force: true }); }
console.log('PSD SFF intake preserves Ryu-style base/overlay geometry and explicit timeline frame order');
