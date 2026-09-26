'use strict';

const assert = require('assert');
const { parseZss, displayName, cleanHeading } = require('../src/parser');
const { formatController, zssControllerName } = require('../src/sctrl');
const { commonIndent, wrapText } = require('../src/wrappers');
const {
  parseNumberSet,
  parseBoxes,
  parseSelectedClsn2,
  batchApplyClsn2,
  generateGuardProximity,
  updateGuardHelperZss
} = require('../src/air');
const { analyzeZss, collectRecords } = require('../src/analyzer');
const { extractFeatures, buildControllerCatalog, compareSnapshots, due } = require('../src/updater');
const { parseDefSourcePaths } = require('../src/updater');
const { auditFirstActiveElements } = require('../src/frame_sync');
const {
  selectedClsn2: selectedRegionClsn2,
  updateStateRegionAssignments
} = require('../src/region_assign');
const controllers = require('../data/sctrl.json');

const source = `# Functions
# Detect closest enemy fireball
[Function P2ClosestFireball()]
if p2, numHelper {}

# Standing
[StateDef 0; type: S; physics: S;]
velSet{x: 0}

# Multi-line state
[StateDef const(StateDizzy);
 type: S;
 physics: S;]
`;

const symbols = parseZss(source);
assert.strictEqual(symbols.length, 3);
assert.strictEqual(symbols[0].type, 'function');
assert.strictEqual(symbols[0].id, 'P2ClosestFireball');
assert.strictEqual(displayName(symbols[0]), 'P2ClosestFireball() — Detect closest enemy fireball');
assert.strictEqual(symbols[1].id, '0');
assert.strictEqual(symbols[1].heading, 'Standing');
assert.strictEqual(symbols[2].id, 'const(StateDizzy)');
assert.strictEqual(cleanHeading('#================'), '');
assert.ok(symbols[0].endLine < symbols[1].startLine);

console.log('parser tests passed');

assert.ok(controllers.length >= 150);
assert.strictEqual(zssControllerName('ChangeState'), 'changeState');
assert.strictEqual(zssControllerName('AllPalFX'), 'allPalFx');
assert.strictEqual(formatController({ name: 'Turn', params: [] }), 'turn{}');
assert.ok(formatController({
  name: 'ChangeState',
  params: [{ name: 'value', placeholder: 'state_no', required: true }]
}).includes('# value: state_no; # required'));
const { formatControllerSnippet } = require('../src/sctrl');
assert.ok(formatControllerSnippet({
  name: 'ChangeState',
  params: [{ name: 'value', placeholder: 'state_no', required: true }, { name: 'ctrl', placeholder: 'value', required: false }]
}, 'learning').includes('value: ${1:state_no};'));
assert.ok(formatControllerSnippet({
  name: 'ChangeState',
  params: [{ name: 'value', placeholder: 'state_no', required: true }]
}, 'learning').includes('Add optional options'));
assert.ok(!formatControllerSnippet({
  name: 'ChangeState',
  params: [{ name: 'value', placeholder: 'state_no', required: true }]
}, 'advanced').includes('Add optional options'));

console.log('state controller tests passed');

assert.strictEqual(commonIndent(['\tvelSet{x: 0}', '\tchangeAnim{value: 0}']), '\t');
assert.strictEqual(
  wrapText('velSet{x: 0}\nchangeAnim{value: 0}', 'ignoreHitPause').text,
  'ignoreHitPause {\n\tvelSet{x: 0}\n\tchangeAnim{value: 0}\n}'
);
assert.strictEqual(
  wrapText('\tvelSet{x: 0}', 'persistent(5)').text,
  '\tpersistent(5) {\n\t\tvelSet{x: 0}\n\t}'
);
assert.ok(wrapText('', 'ignoreHitPause').text.includes('ignoreHitPause {'));

console.log('wrapper tests passed');

const range = parseNumberSet('0-10 !4-6, 20');
assert.strictEqual(range(0), true);
assert.strictEqual(range(5), false);
assert.strictEqual(range(20), true);
assert.strictEqual(range(21), false);
assert.deepStrictEqual(parseBoxes('16,0,-13,-93', true), [[-13, -93, 16, 0]]);
const selectedClsn2 = `Clsn2: 3
  Clsn2[0] = -24, -36, 23, 0
  Clsn2[1] = -24, -81, 23, -36
  Clsn2[2] = -16, -97, 17, -75`;
assert.deepStrictEqual(parseSelectedClsn2(selectedClsn2), [
  [-24, -36, 23, 0],
  [-24, -81, 23, -36],
  [-16, -97, 17, -75]
]);
assert.throws(() => parseSelectedClsn2('Clsn2: 2\nClsn2[0] = -1,-2,3,4'), /declares 2/);
assert.throws(() => parseSelectedClsn2(''), /Select a Clsn2 block/);

const airSource = `[Begin Action 0]\nClsn1: 1\n Clsn1[0] = -5,-5,5,5\nClsn2: 1\n Clsn2[0] = -10,-80,10,0\n0,0, 0,0, 4\n0,1, 0,0, 4\n\n[Begin Action 20]\n20,0, 0,0, 4\n`;
const replacedAir = batchApplyClsn2(airSource, {
  actions: '0-20 !20', elements: '1', mode: 'replace', boxes: [[-13, -93, 16, 0]]
});
assert.ok(replacedAir.text.includes('Clsn1[0] = -5,-5,5,5'));
assert.ok(replacedAir.text.includes('Clsn2[0] = -13, -93, 16, 0'));
assert.strictEqual(replacedAir.changedActions.length, 1);
assert.strictEqual(replacedAir.changedElements, 1);

const labeledAir = `; Standing idle
[Begin Action 0]
0,0, 0,0, 4

; Crouching light punch
[Begin Action 200]
200,0, 0,0, 4

; Forward Jump
[Begin Action 40]
40,0, 0,0, 4
`;
const crouchOnlyAir = batchApplyClsn2(labeledAir, {
  actions: 'all', elements: 'all', mode: 'replace',
  headingFilter: 'crouch', boxes: [[-10, -40, 10, 0]]
});
assert.deepStrictEqual(crouchOnlyAir.changedActions, [200]);
assert.ok(crouchOnlyAir.text.includes('Clsn2[0] = -10, -40, 10, 0\n200,0'));
const jumpOnlyAir = batchApplyClsn2(labeledAir, {
  actions: 'all', elements: 'all', mode: 'replace',
  headingFilter: 'jump', boxes: [[-12, -80, 12, 0]]
});
assert.deepStrictEqual(jumpOnlyAir.changedActions, [40]);

const defaultAir = batchApplyClsn2(airSource, {
  actions: '0', elements: 'all', mode: 'default', boxes: [[-12, -90, 12, 0]]
});
assert.ok(defaultAir.text.includes('Clsn2Default: 1'));
assert.ok(defaultAir.text.includes('Clsn1: 1'));
assert.strictEqual((defaultAir.text.match(/Clsn2(?:Default)?\s*:/g) || []).length, 1);

const clearedAir = batchApplyClsn2(airSource, {
  actions: '0', elements: '1', mode: 'clear', boxes: []
});
assert.ok(!clearedAir.text.includes('Clsn2: 1'));
assert.ok(clearedAir.text.includes('Clsn1: 1'));

console.log('AIR collision batch tests passed');

const guardAirSource = `[Begin Action 200]\n200,0, 0,0, 3\nClsn1: 2\nClsn1[0] = 10,-80,42,-55\nClsn1[1] = 20,-55,55,-35\n200,1, 0,0, 2\n200,2, 0,0, 4\n`;
const generatedGuard = generateGuardProximity(guardAirSource, 200);
assert.strictEqual(generatedGuard.targetAction, 900200);
assert.strictEqual(generatedGuard.firstActiveElement, 2);
assert.strictEqual(generatedGuard.boxes.length, 2);
assert.ok(generatedGuard.text.includes('[Begin Action 900200]'));
assert.ok(generatedGuard.text.includes('Clsn1[1] = 20, -55, 55, -35'));
assert.ok(generatedGuard.text.includes('200,1, 0,0, 1'));
const regeneratedGuard = generateGuardProximity(generatedGuard.text, 200);
assert.strictEqual((regeneratedGuard.text.match(/\[Begin Action 900200\]/g) || []).length, 1);

const generatedZss = updateGuardHelperZss('', 200, 900200, 'normal.slp.firstActiveElement', 'JNP_');
assert.ok(generatedZss.text.includes('[Function JNP_GuardProximity_200()]'));
assert.ok(generatedZss.text.includes('clsnproxy: 1;'));
assert.ok(generatedZss.text.includes('[StateDef 909000;'));
assert.strictEqual(generatedZss.call, 'call JNP_GuardProximity_200();');
const regeneratedZss = updateGuardHelperZss(generatedZss.text, 200, 900200, 'normal.slp.firstActiveElement', 'JNP_');
assert.strictEqual((regeneratedZss.text.match(/\[StateDef 909000;/g) || []).length, 1);
assert.strictEqual((regeneratedZss.text.match(/\[Function JNP_GuardProximity_200\(\)\]/g) || []).length, 1);

console.log('AIR guard-proximity generator tests passed');

const frameSyncFiles = [
  {
    path: '/game/chars/Ryu/Constants.cns',
    text: '[Constants]\nnormal.slp.firstActiveElement = 2\nnormal.slp.idleElement = 3\n'
  },
  {
    path: '/game/chars/Ryu/Anim.air',
    text: `[Begin Action 200]
200,0, 0,0, 1
200,0, 0,0, 2
Clsn1: 1
 Clsn1[0] = 21,-86,63,-69
200,2, 0,0, 1
`
  },
  {
    path: '/game/chars/template/normals.zss',
    text: `[StateDef 200; type: S;]
call JNP_SF6_StandingLightPunch();

[Function JNP_SF6_StandingLightPunch()]
if animElemNo(0) = const(normal.slp.firstActiveElement) {
  hitDef{ground.type: High}
}
if animElemNo(0) >= const(normal.slp.idleElement) {
  map(recovery) := 1
}
`
  }
];
const frameSyncIssues = auditFirstActiveElements(frameSyncFiles);
assert.strictEqual(frameSyncIssues.length, 2);
const firstActiveIssue = frameSyncIssues.find((issue) => issue.code === 'first-active-element-mismatch');
const idleIssue = frameSyncIssues.find((issue) => issue.code === 'idle-element-mismatch');
assert.strictEqual(firstActiveIssue.action, 200);
assert.strictEqual(firstActiveIssue.actual, 2);
assert.strictEqual(firstActiveIssue.expected, 3);
assert.strictEqual(idleIssue.action, 200);
assert.strictEqual(idleIssue.actual, 3);
assert.strictEqual(idleIssue.expected, 4);
frameSyncFiles[0].text = '[Constants]\nnormal.slp.firstActiveElement = 3\nnormal.slp.idleElement = 4\n';
assert.strictEqual(auditFirstActiveElements(frameSyncFiles).length, 0);

console.log('active/recovery element synchronization tests passed');

const regionAir = `[Begin Action 200]
Clsn2: 5
 Clsn2[0] = -24,-36,23,0
 Clsn2[1] = -24,-81,23,-36
 Clsn2[2] = -24,-97,23,-75
 Clsn2[3] = 22,-97,65,-58
 Clsn2[4] = 10,-110,40,-90
200,0, 0,0, 1
`;
assert.deepStrictEqual(selectedRegionClsn2(regionAir, 6), { action: 200, index: 4 });
assert.throws(() => selectedRegionClsn2(regionAir, 0), /right-click/i);

let regionZss = `[StateDef -4]
`;
regionZss = updateStateRegionAssignments(regionZss, 200, 4, 1, 'JNP_SF6_').text;
assert.ok(regionZss.includes('JNP_SF6_SetHitReactionRegion(4, 1)'));
assert.ok(regionZss.includes('stateNo = 200'));
assert.ok(regionZss.includes('JNP_SF6_hit_reaction_region_owner_state) != stateNo'));
assert.ok(!regionZss.includes('if time = 0'));
regionZss = updateStateRegionAssignments(regionZss, 200, 5, 2, 'JNP_SF6_').text;
assert.ok(regionZss.includes('JNP_SF6_SetHitReactionRegion(5, 2)'));
assert.strictEqual((regionZss.match(/ClearHitReactionRegions/g) || []).length, 1);
regionZss = updateStateRegionAssignments(regionZss, 200, 4, null, 'JNP_SF6_').text;
assert.ok(!regionZss.includes('JNP_SF6_SetHitReactionRegion(4, 1)'));
assert.ok(regionZss.includes('JNP_SF6_SetHitReactionRegion(5, 2)'));

const scaffoldedRegions = updateStateRegionAssignments(
  '# Character normal extras\n',
  400,
  2,
  2,
  'JNP_SF6_'
);
assert.ok(scaffoldedRegions.text.includes('[StateDef -4]'));
assert.ok(scaffoldedRegions.text.includes('stateNo = 400'));
assert.ok(scaffoldedRegions.blockLine >= 0);

console.log('move-local Clsn2 hit-reaction assignment tests passed');

const unsafeZss = `
[Function SharedFunction()]
map(shared_mode) := 1
partner, posSet{x: 0}
targetState{value: 9000}
player(2), velSet{x: 0}
while map(JNP_looping) {
  enemy, lifeAdd{value: -1}
}
assertSpecial{flag: runLast}
`;
const audit = analyzeZss(unsafeZss, { mapPrefix: 'JNP_', functionPrefix: 'JNP_' });
const codes = audit.issues.map((entry) => entry.code);
assert.ok(codes.includes('map-prefix'));
assert.ok(codes.includes('function-prefix'));
assert.ok(codes.includes('targetstate-guard'));
assert.ok(codes.includes('literal-player-slot'));
assert.ok(codes.includes('cross-entity-write'));
assert.ok(codes.includes('loop-progress'));
assert.ok(codes.includes('forced-order'));

const multiplePrefixAudit = analyzeZss(`
[Function SF_Shared()]
map(DS_option) := 1
`, { mapPrefixes: ['SF_', 'DS_'], functionPrefixes: ['SF_', 'HDBZ_'] });
assert.ok(!multiplePrefixAudit.issues.some((entry) => entry.code === 'map-prefix'));
assert.ok(!multiplePrefixAudit.issues.some((entry) => entry.code === 'function-prefix'));

const noPrefixAudit = analyzeZss(`
[Function AnyAuthorName()]
map(any_map_name) := 1
`, { mapPrefixes: [], functionPrefixes: [] });
assert.ok(!noPrefixAudit.issues.some((entry) => entry.code === 'map-prefix'));
assert.ok(!noPrefixAudit.issues.some((entry) => entry.code === 'function-prefix'));

const safeZss = `
[Function JNP_Ryu_Sync()]
if teamMode = simul && numPartner {
  partner, map(JNP_sync_epoch) := gameTime
}
if numTarget {
  # @customstate controller=attacker @position-owner attacker @sync JNP_Ryu_Throw
  targetState{value: 9000}
}
`;
const safeAudit = analyzeZss(safeZss, { mapPrefix: 'JNP_', functionPrefix: 'JNP_' });
assert.ok(!safeAudit.issues.some((entry) => entry.code === 'redirect-guard'));
assert.ok(!safeAudit.issues.some((entry) => entry.code === 'targetstate-guard'));

const timeZeroAudit = analyzeZss(`
[StateDef -3]
if time = 0 { map(JNP_once) := 1 }
`);
assert.ok(timeZeroAudit.issues.some((entry) => entry.code === 'negative-time-zero' && entry.severity === 'information'));

const engineTimeZeroAudit = analyzeZss(`
[StateDef -3]
if stateNo = 52 && time = 0 { map(JNP_land) := 1 }
# @time-zero engine
if roundState = 1 && time = 0 { map(JNP_engine_event) := 1 }
`);
assert.ok(!engineTimeZeroAudit.issues.some((entry) => entry.code === 'negative-time-zero'));

const ordinaryStateTimeZeroAudit = analyzeZss(`
[StateDef 200]
if time = 0 { velSet{x: 0} }
`);
assert.ok(!ordinaryStateTimeZeroAudit.issues.some((entry) => entry.code === 'negative-time-zero'));
const records = collectRecords(safeZss, 'safe.zss');
assert.ok(records.maps.some((entry) => entry.name === 'JNP_sync_epoch' && entry.access === 'write'));
assert.ok(records.functions.some((entry) => entry.name === 'JNP_Ryu_Sync'));

console.log('ZSS safety analyzer tests passed');

const updateHtml = `<ul>
<li><a href="#changestate-changed">ChangeState (changed)</a></li>
<li><a href="#assertcommand-new">AssertCommand (new)</a></li>
<li><a href="#modifytext-ikemen-1-0-new">ModifyText [IKEMEN 1.0] (new)</a></li>
</ul>`;
assert.deepStrictEqual(extractFeatures(updateHtml), [
  'AssertCommand (new)', 'ChangeState (changed)', 'ModifyText [IKEMEN 1.0] (new)'
]);
assert.throws(() => buildControllerCatalog(updateHtml, controllers), /extraction returned only/);
const syntheticHtml = Array.from({ length: 101 }, (_, index) =>
  `<a href="#controller${index}-new">Controller${index} (new)</a>`
).join('\n');
const synthetic = buildControllerCatalog(syntheticHtml, []);
assert.strictEqual(synthetic.catalog.length, 101);
assert.strictEqual(synthetic.added.length, 101);
const previousUpdate = { checkedAt: '2026-01-01T00:00:00.000Z', sources: { release: { marker: 'a', features: [] } } };
const currentUpdate = { sources: Object.fromEntries(require('../src/updater').SOURCES.map((source) => [source.id, {
  marker: source.id === 'release' ? 'b' : 'x', features: source.id === 'release' ? ['NewThing (new)'] : []
}])) };
assert.strictEqual(compareSnapshots(previousUpdate, currentUpdate)[0].status, 'changed');
assert.strictEqual(due(previousUpdate, 7, Date.parse('2026-01-09T00:00:00.000Z')), true);

console.log('IKEMEN 1.0 update monitor tests passed');

assert.deepStrictEqual(parseDefSourcePaths(`
[Info]
name = "Ryu"
[Files]
cmd = ../template/template.jnp
cns = Constants.cns
sprite = Sprite.sff
st4 = ../template/combo_scaling.zss ; shared system
st5 = "../template/normal_functions.zss"
[Palette Keymap]
x = 1
`), [
  '../template/template.jnp',
  'Constants.cns',
  '../template/combo_scaling.zss',
  '../template/normal_functions.zss'
]);

console.log('DEF-scoped update tests passed');
