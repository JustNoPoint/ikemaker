'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseSizeboxes, updateSizebox, readPushboxPlan, setFrameOverride, removeFrameOverride, controllerSnippet } = require('../src/pushbox_authoring');

const source = '[Size]\r\nstand.sizebox = -15, -60, 16, 0 ; keep\r\n';
assert.deepStrictEqual(parseSizeboxes(source).stand.box, [-15, -60, 16, 0]);
assert(updateSizebox(source, 'stand', [-17, -81, 20, 0]).includes('stand.sizebox = -17, -81, 20, 0 ; keep'));
assert(updateSizebox(source, 'air', [-20, -99, 15, -42]).includes('air.sizebox = -20, -99, 15, -42'));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pushbox-plan-'));
try {
  fs.writeFileSync(path.join(root, 'Ikemen_GO.exe'), ''); const air = path.join(root, 'chars', 'Test', 'Anim.air'); fs.mkdirSync(path.dirname(air), { recursive: true }); fs.writeFileSync(air, '');
  setFrameOverride(air, 200, 2, [-10, -20, 10, 0]); assert.strictEqual(readPushboxPlan(air).overrides.length, 1);
  assert(controllerSnippet(readPushboxPlan(air).overrides[0]).includes('group: Size'));
  assert(removeFrameOverride(air, 200, 2).removed); assert.strictEqual(readPushboxPlan(air).overrides.length, 0);
} finally { fs.rmSync(root, { recursive: true, force: true }); }
console.log('push-box authoring tests passed');
