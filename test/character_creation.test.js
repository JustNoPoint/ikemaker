'use strict';

const assert = require('assert');
const path = require('path');
const { safeStem, displayFromStem, iniText, normalizeInputExtension, normalizeSffVersion, normalizeScaffoldStyle, scaffoldChoices, createCharacterPlan, creationReview, writeCharacterPlan } = require('../src/character_creation');
const { parseSffBuffer } = require('../src/sff_reader');

assert.strictEqual(safeStem('New Character'), 'New_Character');
assert.strictEqual(displayFromStem('new_character'), 'New Character');
assert.strictEqual(iniText('A "quoted"\nauthor'), "A 'quoted' author");
assert.throws(() => safeStem('...'));
assert.strictEqual(normalizeScaffoldStyle('minimal'), 'minimal');
assert.strictEqual(normalizeScaffoldStyle('unexpected'), 'guided');
assert.deepStrictEqual(scaffoldChoices('learning').map((item) => item.value), ['guided', 'minimal']);
assert.deepStrictEqual(scaffoldChoices('advanced').map((item) => item.value), ['minimal', 'guided']);
assert.deepStrictEqual([...scaffoldChoices('learning').map((item) => item.value)].sort(), [...scaffoldChoices('advanced').map((item) => item.value)].sort());
assert.strictEqual(normalizeSffVersion('ikemen-zss', '2.0'), '2.1');
assert.strictEqual(normalizeSffVersion('mugen-cns', '2.1'), '2.1');
assert.strictEqual(normalizeInputExtension('.MFG'), 'mfg');
assert.throws(() => normalizeInputExtension('!'));

const target = path.join('C:\\game\\chars\\new_character', 'new_character.def');
const plan = createCharacterPlan(target, { displayName: 'New Fighter', author: 'Creator' });
assert.strictEqual(plan.files.size, 9);
assert.ok(plan.files.get(plan.defPath).includes('ikemenversion = 1.0'));
assert.ok(plan.files.get(plan.defPath).includes('displayname = "New Fighter"'));
assert.ok(Buffer.isBuffer(plan.files.get(path.join(plan.directory, 'new_character.sff'))));
assert.ok(Buffer.isBuffer(plan.files.get(path.join(plan.directory, 'new_character.snd'))));
assert.strictEqual(plan.style, 'guided');
assert.strictEqual(plan.sffVersion, '2.1');
assert.ok(plan.files.get(path.join(plan.directory, 'new_character.inp')).includes('name = "x"'));
assert.ok(plan.files.get(plan.defPath).includes('cmd = new_character.inp'));
assert.ok(plan.files.get(path.join(plan.directory, 'new_character.zss')).includes('[StateDef 200'));
const review = creationReview(plan);
assert.strictEqual(review.files.length, 9);
assert.ok(review.dependencies.some((item) => item.includes('Existing files are never replaced')));

const minimal = createCharacterPlan(path.join('C:\\game\\chars\\clean', 'clean.def'), { style: 'minimal' });
assert.strictEqual(minimal.style, 'minimal');
assert.ok(minimal.files.get(path.join(minimal.directory, 'clean.inp')).includes('name = "x"'));
assert.ok(!minimal.files.get(path.join(minimal.directory, 'clean.zss')).includes('[StateDef 200'));
assert.ok(minimal.files.get(path.join(minimal.directory, 'README.md')).includes('no example attack'));
assert.ok(creationReview(minimal).dependencies.some((item) => item.toLowerCase().includes('no example attack')));

const mugen = createCharacterPlan(path.join('C:\\game\\chars\\classic', 'classic.def'), { engineTarget: 'mugen-cns', style: 'guided' });
assert.strictEqual(mugen.files.size, 8);
assert.strictEqual(mugen.engineTarget, 'mugen-cns');
assert(mugen.files.get(mugen.defPath).includes('mugenversion = 1.0'));
assert.strictEqual(parseSffBuffer(mugen.files.get(path.join(mugen.directory, 'classic.sff')), 'classic.sff').header.version.join('.'), '2.0.0.0');
assert(mugen.files.get(mugen.defPath).includes('stcommon = common1.cns'));
assert(!mugen.files.get(mugen.defPath).includes('ikemenversion'));
assert(mugen.files.has(path.join(mugen.directory, 'classic_states.cns')));
assert(!mugen.files.has(path.join(mugen.directory, 'classic.zss')));
assert(!mugen.files.get(path.join(mugen.directory, 'classic.inp')).includes('\nd = d\n'));
assert(mugen.files.get(path.join(mugen.directory, 'classic.inp')).includes('name = "recovery"'));
assert(mugen.files.get(mugen.defPath).includes('cmd = classic.inp'));
assert(mugen.files.get(path.join(mugen.directory, 'classic_states.cns')).includes('[Statedef 200]'));

const mugen11 = createCharacterPlan(path.join('C:\\game\\chars\\classic11', 'classic11.def'), { engineTarget: 'mugen-cns', sffVersion: '2.1', style: 'minimal' });
assert.strictEqual(mugen11.sffVersion, '2.1');
assert(mugen11.files.get(mugen11.defPath).includes('mugenversion = 1.1'));
assert.strictEqual(parseSffBuffer(mugen11.files.get(path.join(mugen11.directory, 'classic11.sff')), 'classic11.sff').header.version.join('.'), '2.1.0.0');

const ikemenConstants = plan.files.get(path.join(plan.directory, 'new_character.cns'));
assert(ikemenConstants.includes('dizzypoints = 1000'));
assert(ikemenConstants.includes('stand.sizebox'));
assert(ikemenConstants.includes('These comments are creation-time guidance'));
assert(plan.files.get(path.join(plan.directory, 'new_character.inp')).includes('\nd = d\n'));
assert(plan.files.get(path.join(plan.directory, 'new_character.inp')).includes('name = "recovery"'));

const projectInput = createCharacterPlan(path.join('C:\\game\\chars\\hdbz', 'fighter.def'), { inputExtension: 'mfg' });
assert(projectInput.files.has(path.join(projectInput.directory, 'fighter.mfg')));
assert(projectInput.files.get(projectInput.defPath).includes('cmd = fighter.mfg'));

function fakeFs(failAfter = Infinity, existing = []) {
  const files = new Map(existing.map((name) => [name, 'existing']));
  let writes = 0;
  return {
    files,
    existsSync: (name) => files.has(name), mkdirSync: () => {},
    writeFileSync: (name, content) => { writes += 1; if (writes > failAfter) throw new Error('simulated write failure'); files.set(name, content); },
    unlinkSync: (name) => files.delete(name),
    renameSync: (from, to) => { const content = files.get(from); files.delete(from); files.set(to, content); }
  };
}

const success = fakeFs();
assert.strictEqual(writeCharacterPlan(success, plan).length, 9);
assert.strictEqual(success.files.size, 9);
const rollback = fakeFs(3);
assert.throws(() => writeCharacterPlan(rollback, plan), /simulated/);
assert.strictEqual(rollback.files.size, 0);
const first = [...plan.files.keys()][0];
const conflict = fakeFs(Infinity, [first]);
assert.throws(() => writeCharacterPlan(conflict, plan), /Nothing was created/);
assert.strictEqual(conflict.files.size, 1);

console.log('Character creation tests passed');
