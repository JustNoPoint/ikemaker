'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  analyzeLegacyCode, analyzeAir, buildCharacterHealthModel, addHealthFiles, createRepairPlan, nearestKey
} = require('../src/character_health_model');

const legacy = `[Statedef 200]\n[State 999, Hit]\ntype = HitDef\ntrigger1 = time = 0\ntrigger1 = movehit = 0\ndamage = 40\ndamage = 40\npausetime = 4, 8\npausetime = 9, 9\nguard.pausetim = 3, 7\n`;
const legacyFindings = analyzeLegacyCode(legacy, 'test.cns');
assert.ok(legacyFindings.some((item) => item.code === 'state-header-mismatch' && item.safe));
assert.ok(legacyFindings.some((item) => item.code === 'exact-duplicate-parameter' && item.key === 'damage'));
const shadowed = legacyFindings.find((item) => item.code === 'shadowed-parameter' && item.key === 'pausetime');
assert.strictEqual(shadowed.effectiveValue, '4, 8');
assert.ok(legacyFindings.some((item) => item.code === 'unknown-controller-parameter' && item.suggestion === 'guard.pausetime'));
assert.ok(legacyFindings.some((item) => item.suggestion === 'guard.pausetime' && item.fix.replacement.includes('guard.pausetime = 3, 7')));
assert.ok(!legacyFindings.some((item) => /^trigger/.test(item.key || '') && /duplicate/.test(item.code)));
assert.strictEqual(nearestKey('guard.pausetim', new Set(['damage', 'guard.pausetime'])), 'guard.pausetime');
assert.ok(!analyzeLegacyCode('[Statedef 1]\n[State 1]\ntype = PlaySnd\nvolume = 200\n', 'compat.cns').some((item) => item.code === 'unknown-controller-parameter'));

const air = `[Begin Action 0]\n0,0,0,0,1\n[Begin Action 0]\n0,0,0,0,1\n[Begin Action 5]\n; intentionally invisible\n[Begin Action 6]\n0, 0, 0\n`;
const airFindings = analyzeAir(air, 'test.air');
assert.ok(airFindings.some((item) => item.code === 'exact-duplicate-action' && item.safe));
assert.ok(airFindings.some((item) => item.code === 'empty-action' && item.action === 5 && !item.fix));
assert.ok(airFindings.some((item) => item.code === 'malformed-air-element' && item.action === 6));

const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-health-'));
try {
  const def = path.join(folder, 'Test.def'), cns = path.join(folder, 'Test.cns'), animation = path.join(folder, 'Test.air');
  fs.writeFileSync(def, '[Info]\nname = Test\n[Files]\ncns = Test.cns\nanim = Test.air\nsprite = missing.sff\nstcommon = common1.cns\n');
  fs.writeFileSync(cns, legacy); fs.writeFileSync(animation, air);
  const model = buildCharacterHealthModel(def);
  assert.ok(model.findings.some((item) => item.code === 'missing-dependency'));
  assert.ok(!model.findings.some((item) => item.code === 'missing-dependency' && /common1\.cns$/i.test(item.file)));
  assert.ok(model.counts.safe >= 3);
  const extra = path.join(folder, 'Unassigned.cmd'); fs.writeFileSync(extra, '[Command]\nname = "x"\ncommand = x\ntiem = 4\n'); addHealthFiles(model, [extra]);
  assert.ok(model.files.some((item) => item.filename === extra && item.extra));
  assert.ok(model.findings.some((item) => item.file === extra && item.code === 'unknown-command-parameter'));
  const selected = model.findings.filter((item) => item.safe && item.fix).map((item) => item.id), plan = createRepairPlan(model, selected, 'comment');
  assert.ok(plan.writes.length >= 2);
  assert.ok(plan.writes.some((item) => item.after.includes('IKEMaker cleanup review')));
  const deletePlan = createRepairPlan(model, selected, 'delete');
  assert.ok(deletePlan.writes.some((item) => !item.after.includes('damage = 40\ndamage = 40')));
} finally { fs.rmSync(folder, { recursive: true, force: true }); }

console.log('character health model tests passed');
