'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assignment = require('../src/storyboard_assignment');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-storyboard-assignment-'));
try {
  const storyboard = path.join(root, 'story', 'intro.def'); fs.mkdirSync(path.dirname(storyboard)); fs.writeFileSync(storyboard, '[SceneDef]\nspr = intro.sff\n');
  const cases = [
    ['opening', 'chars/hero/hero.def', '[Arcade]\nintro.storyboard = old.def\n', 'Arcade', 'intro.storyboard'],
    ['ending', 'chars/hero/hero-ending.def', '[Arcade]\nending.storyboard = old.def\n', 'Arcade', 'ending.storyboard'],
    ['logo', 'data/logo-system.def', '[Files]\nspr = system.sff\n', 'Files', 'logo.storyboard'],
    ['gameintro', 'data/intro-system.def', '[Files]\nspr = system.sff\n', 'Files', 'intro.storyboard'],
    ['loading', 'data/loading-system.def', '[VS Screen]\nloading.wait.anim = 0\n', 'VS Screen', 'loading.storyboard'],
    ['gameover', 'data/gameover-system.def', '[Game Over Screen]\nenabled = 1\n', 'Game Over Screen', 'storyboard'],
    ['credits', 'data/credits-system.def', '[End Credits]\nenabled = 1\n', 'End Credits', 'storyboard']
  ];
  for (const [type, relativeOwner, text, section, key] of cases) {
    const owner = path.join(root, relativeOwner); fs.mkdirSync(path.dirname(owner), { recursive: true }); fs.writeFileSync(owner, text);
    const plan = assignment.createAssignmentPlan({ type, ownerFilename: owner, storyboardFilename: storyboard });
    assert.strictEqual(plan.section, section); assert.strictEqual(plan.key, key); assert.strictEqual(plan.value, path.relative(path.dirname(owner), storyboard).replace(/\\/g, '/'));
    const result = assignment.applyAssignment(plan, { journal: false }); assert(result.changed);
    const saved = fs.readFileSync(owner, 'utf8'); assert(saved.includes(`${key} = ${plan.value}`), `${type} writes its exact native assignment`);
  }
  const bomOwner = path.join(root, 'chars', 'bom.def'), bom = Buffer.concat([Buffer.from([0xef,0xbb,0xbf]), Buffer.from('[Arcade]\r\nintro.storyboard = old.def\r\n')]); fs.writeFileSync(bomOwner, bom);
  const bomPlan = assignment.createAssignmentPlan({ type: 'opening', ownerFilename: bomOwner, storyboardFilename: storyboard }); assignment.applyAssignment(bomPlan, { journal: false }); const bomSaved = fs.readFileSync(bomOwner); assert.deepStrictEqual([...bomSaved.subarray(0,3)], [0xef,0xbb,0xbf]); assert(bomSaved.toString('utf8').includes('\r\n'));
  const staleOwner = path.join(root, 'chars', 'stale.def'); fs.writeFileSync(staleOwner, '[Arcade]\nintro.storyboard = old.def\n'); const stale = assignment.createAssignmentPlan({ type: 'opening', ownerFilename: staleOwner, storyboardFilename: storyboard }); fs.appendFileSync(staleOwner, '; changed\n'); assert.throws(() => assignment.applyAssignment(stale, { journal: false }), /changed after it was loaded/);
  const duplicateOwner = path.join(root, 'chars', 'duplicate.def'); fs.writeFileSync(duplicateOwner, '[Arcade]\n\n[Arcade]\n'); assert.throws(() => assignment.createAssignmentPlan({ type: 'opening', ownerFilename: duplicateOwner, storyboardFilename: storyboard }), /more than one/);
  assert.strictEqual(assignment.assignmentTarget('interstitial'), null, 'a between-fight scene has no falsely implied single assignment owner');
  console.log('Storyboard assignment maps every supported purpose to its native DEF key, preserves text form, and rejects stale or ambiguous owners');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
