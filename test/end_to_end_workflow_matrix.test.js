'use strict';

const assert = require('assert');
const fs = require('fs');
const { OUTPUT, JSON_OUTPUT, WORKFLOWS, generate } = require('../tools/generate_end_to_end_workflow_matrix');

const REQUIRED_FAMILIES = [
  'palette.standalone-image-template',
  'palette.primary-template-intake',
  'palette.create-and-save',
  'palette.cs-expansion',
  'sff.sprite-image-intake',
  'snd.sound-intake',
  'asset.create-source',
  'character.open-create',
  'stage.open-create',
  'screenpack.open-create',
  'storyboard.open-create',
  'air.open-create-intake',
  'sff.open-create-archive',
  'code.open-create-convert',
  'project.open-create',
  'visual.layered-psd-intake'
];
const STARTED_STATUS = Object.freeze({
  'palette.standalone-image-template': 'audited',
  'palette.primary-template-intake': 'audited',
  'palette.create-and-save': 'audited',
  'palette.cs-expansion': 'audited',
  'sff.sprite-image-intake': 'audited',
  'snd.sound-intake': 'audited',
  'asset.create-source': 'audited',
  'character.open-create': 'audited',
  'stage.open-create': 'audited',
  'screenpack.open-create': 'audited',
  'storyboard.open-create': 'audited',
  'air.open-create-intake': 'audited',
  'sff.open-create-archive': 'audited',
  'code.open-create-convert': 'audited',
  'project.open-create': 'audited',
  'visual.layered-psd-intake': 'audited'
});

assert.deepStrictEqual(new Set(WORKFLOWS.map(row => row.id)), new Set(REQUIRED_FAMILIES), 'the bounded matrix must include every universal create/open/import intake family');
const standalone = WORKFLOWS.find(row => row.id === 'palette.standalone-image-template');
const primaryTemplate = WORKFLOWS.find(row => row.id === 'palette.primary-template-intake');
const createAndSave = WORKFLOWS.find(row => row.id === 'palette.create-and-save');
const csExpansion = WORKFLOWS.find(row => row.id === 'palette.cs-expansion');
const assetCreateSource = WORKFLOWS.find(row => row.id === 'asset.create-source');
const auditedOpenCreate = ['sff.sprite-image-intake','snd.sound-intake','character.open-create','stage.open-create','screenpack.open-create','storyboard.open-create','air.open-create-intake','sff.open-create-archive','code.open-create-convert','visual.layered-psd-intake'].map(id=>WORKFLOWS.find(row=>row.id===id));
assert.strictEqual(standalone.status, 'audited','the rendered final-button adapter and independently decoded host output close the bounded source workflow; physical QA remains recorded separately');
assert.strictEqual(primaryTemplate.status,'audited','both topology-changing and unchanged-topology primary-template candidates now have exact Build, Compare, explicit Adopt, and Undo evidence; physical QA remains recorded separately');
assert.strictEqual(createAndSave.status,'audited','lossless scratch save, reviewed SFF staging, embedded Bank B save/overwrite, history, cancellation, coordinator lifecycle, and exact owner return are executed; physical backend and UI QA remain recorded separately');
assert.strictEqual(csExpansion.status,'audited','the exact SFF topology route now executes through handoff, candidate Build/Compare, cancel, explicit Adopt, Undo, and exact owner return; physical QA remains recorded separately');
assert.strictEqual(assetCreateSource.status,'audited','every advertised one-file source provider executes through the reviewed writer and exact editor/recovery return; specialist connected creators are separate workflow families');
assert.match(assetCreateSource.unresolved,/All currently advertised ordinary-source forks are executed/);
for(const row of auditedOpenCreate){assert.strictEqual(row.status,'audited');assert.match(row.unresolved,/All advertised/);assert.match(row.unresolved,/PHYSICAL ONLY:/);}
const character=WORKFLOWS.find(row=>row.id==='character.open-create'),air=WORKFLOWS.find(row=>row.id==='air.open-create-intake'),snd=WORKFLOWS.find(row=>row.id==='snd.sound-intake');
assert.match(character.unresolved,/missing-common installation/);
assert(air.evidence.includes('air_save_as_transaction.test.js')&&air.evidence.includes('air_connected_switch_host.test.js')&&air.evidence.includes('air_connected_switch_composition.test.js'),'AIR retains transactional Save As plus isolated and real connected-switch evidence');
assert(snd.evidence.includes('snd_browser_drop_intake_composition.test.js'),'SND retains executed Browser-to-real-intake composition evidence');
const storyboard=WORKFLOWS.find(row=>row.id==='storyboard.open-create');assert(storyboard.evidence.includes('storyboard_assignment.test.js'),'Storyboard creation must retain executed native character/system assignment evidence');assert.match(storyboard.unresolved,/optional reviewed native assignment/);
for (const row of WORKFLOWS) assert.strictEqual(row.status, STARTED_STATUS[row.id] || 'queued', `${row.id} must retain its explicit started status or remain truthfully queued`);
for (const row of WORKFLOWS) {
  assert(row.guidance && row.destinationDisplay, `${row.id} must disclose guidance and destination audit state`);
  assert(Array.isArray(row.evidence) && row.evidence.length, `${row.id} must name its current evidence boundary`);
  assert(row.unresolved, `${row.id} must state unresolved work`);
}
assert(/exact saved path/i.test(standalone.guidance));
assert(/absolute output path/i.test(standalone.destinationDisplay));
assert(/Open|Return|same standalone Palette Workspace/i.test(standalone.returnRoute));
assert(/Cancel|Canceling/i.test(standalone.cancelRetry));
assert(/newly named PNG/i.test(standalone.expectedResult));

const result = generate();
assert.strictEqual(result.totals.workflows, REQUIRED_FAMILIES.length);
assert.strictEqual(result.totals.audited, Object.values(STARTED_STATUS).filter(status => status === 'audited').length);
assert.strictEqual(result.totals.partial, Object.values(STARTED_STATUS).filter(status => status === 'partial').length);
assert.strictEqual(result.totals.queued, REQUIRED_FAMILIES.length - Object.keys(STARTED_STATUS).length);
assert(fs.existsSync(OUTPUT) && fs.existsSync(JSON_OUTPUT));
const markdown = fs.readFileSync(OUTPUT, 'utf8');
const inventory = JSON.parse(fs.readFileSync(JSON_OUTPUT, 'utf8'));
for (const text of ['Next action / state guidance', 'Displayed destination', 'choose at next step', 'actual destination', 'Open/Return route']) assert(markdown.includes(text), `generated workflow audit must include ${text}`);
assert(markdown.includes('not proof that every distinct command entry, handler fork, or output decision'),'family grouping must not be presented as complete route enumeration');
assert.strictEqual(inventory.workflows.length, REQUIRED_FAMILIES.length);

console.log('End-to-end workflow matrix truthfully covers every universal intake family and records guidance, destination, output, return, cancellation, and unresolved evidence');
