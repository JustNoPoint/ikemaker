'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { hash } = require('../src/mutation_safety');
const { TARGETS: PROJECTILE_EDIT_TARGETS } = require('../src/projectile_edit_draft');

const source = fs.readFileSync(path.join(__dirname, '../src/move_constants_workspace.js'), 'utf8');
const body = source.slice(source.indexOf('function validProjectileEditValues('), source.indexOf('async function handle('));

class Range { constructor(start, end) { this.start = start; this.end = end; } }
class WorkspaceEdit { constructor() { this.replacements = []; } replace(uri, range, text) { this.replacements.push({ uri, range, text }); } }

function makeScenario(mode = 'success') {
  const token = 'a'.repeat(48), warnings = [], messages = [], edits = [];
  const before = 'projectile { projanim: 600; velocity: 4, 0; }';
  const after = 'projectile { projanim: 601; velocity: 5, 0; }';
  const preview = { status: 'ready', draftId: 'draft', previewId: 'preview', expectedSourceHash: hash(after), before, after, replacements: [
    { target: 'projanim', authoredName: 'projanim', start: 23, end: 26, before: '600', after: '601' },
    { target: 'velocity', authoredName: 'velocity', start: 38, end: 42, before: '4, 0', after: '5, 0' }
  ] };
  let text = before, version = 1, active = true, openCount = 0;
  const document = { fileName: 'shot.zss', uri: { fsPath: 'shot.zss' }, get version() { return version; }, getText: () => text, positionAt: offset => ({ offset }) };
  const component = { kind: 'projectile', filename: 'shot.zss', stableId: 'shot', startLine: 0, reference: { id: 'shot' }, rangeHash: hash(after) };
  const owner = { disposed: false, panel: { get active() { return active; }, webview: { postMessage: message => { messages.push(message); return true; } } }, assets: { defPath: 'Hero.def' }, projectileGeneration: 4, projectileEditAuthorities: new Map(), projectileEditPreviews: new Map([['shot', { draftId: 'draft', preview, token }]]), displaySelection: { kind: 'direct', componentReference: component.reference } };
  const record = { token, reference: component.reference, stableId: 'shot', generation: 4 };
  owner.projectileEditAuthorities.set(token, record);
  const current = { component, sourceText: before, draft: { draftId: 'draft', sourceHash: hash(before), controllerHash: hash(before) }, assigned: {}, context: {}, model: { specialistComponents: [component] } };
  const sandbox = {
    session: owner, Buffer, Object, Map, Set, JSON, PROJECTILE_EDIT_TARGETS,
    plainMessage: value => Boolean(value && typeof value === 'object' && !Array.isArray(value)),
    currentProjectileEdit: async () => {
      if (!active) return null;
      if (mode === 'stale' || mode === 'stale-preview') return null;
      return current;
    },
    previewProjectileEdit: () => mode === 'invalid-preview' ? null : mode === 'no-op-preview' ? { status: 'no-op', draftId: 'draft', replacements: [], before, after: before } : preview,
    sameProjectileEditAuthority: (_record, candidate, candidatePreview) => Boolean(candidate && candidatePreview && mode !== 'authority-fail'),
    shellModelFor: async () => ({ specialistComponents: [{ ...component, rangeHash: mode === 'refresh-miss' ? 'different' : hash(after) }] }),
    validComponentReference: reference => reference?.id === 'shot' ? component : null,
    decorateProjectileModel() {}, claimContextSelection() {}, selectionEnvelope() {}, sameJson: (left, right) => JSON.stringify(left) === JSON.stringify(right), identity: value => path.resolve(value).toLowerCase(), hash,
    vscode: {
      Uri: { file: fsPath => ({ fsPath }) }, Range, WorkspaceEdit,
      workspace: {
        openTextDocument: async () => { openCount += 1; if (mode === 'inactive-during-open' && openCount === 1) active = false; return document; },
        applyEdit: async edit => {
          edits.push(edit);
          if (mode === 'false') return false;
          if (mode === 'throw') throw new Error('simulated');
          for (const replacement of [...edit.replacements].sort((a, b) => b.range.start.offset - a.range.start.offset)) text = text.slice(0, replacement.range.start.offset) + (mode === 'wrong' ? 'WRONG' : replacement.text) + text.slice(replacement.range.end.offset);
          version += 1;if(mode==='inactive-during-apply')active=false;return true;
        }
      },
      window: { showWarningMessage: message => warnings.push(message), showInformationMessage: message => messages.push({ type: 'info', message }) }
    }
  };
  vm.runInNewContext(body, sandbox);
  return { sandbox, owner, token, warnings, messages, edits, document, text: () => text, setActive: value => { active = value; } };
}

(async () => {
  const good = makeScenario();
  await good.sandbox.applyExactProjectileEdit(good.owner, good.token);
  assert.strictEqual(good.edits.length, 1, 'Apply uses one native WorkspaceEdit/Undo unit');
  assert.strictEqual(good.edits[0].replacements.length, 2, 'all reviewed replacements share the transaction');
  assert.strictEqual(good.text(), 'projectile { projanim: 601; velocity: 5, 0; }');
  assert(!good.owner.projectileEditPreviews.has('shot'), 'verified success clears the preview');
  const afterReplay = good.edits.length;
  await good.sandbox.applyExactProjectileEdit(good.owner, good.token);
  assert.strictEqual(good.edits.length, afterReplay, 'consumed Apply authority cannot replay');

  for (const mode of ['false', 'throw', 'wrong', 'authority-fail', 'stale', 'inactive-during-open']) {
    const scenario = makeScenario(mode);
    await scenario.sandbox.applyExactProjectileEdit(scenario.owner, scenario.token);
    assert(scenario.owner.projectileEditPreviews.has('shot'), `${mode} retains the reviewed preview`);
    assert.strictEqual(scenario.owner.projectileEditAuthorities.has(scenario.token), false, `${mode} still consumes the single-use token`);
    if (['authority-fail', 'stale', 'inactive-during-open'].includes(mode)) assert.strictEqual(scenario.edits.length, 0, `${mode} fails before a native edit`);
  }

  const inactiveCommit = makeScenario('inactive-during-apply');
  await inactiveCommit.sandbox.applyExactProjectileEdit(inactiveCommit.owner, inactiveCommit.token);
  assert.strictEqual(inactiveCommit.text(), 'projectile { projanim: 601; velocity: 5, 0; }');
  assert(!inactiveCommit.owner.projectileEditPreviews.has('shot'), 'a verified commit is cleared even if the panel becomes inactive during applyEdit');
  assert(!inactiveCommit.warnings.some(message => /retained/.test(message)), 'a verified commit is never mislabeled as a retained failure');

  const refreshMiss = makeScenario('refresh-miss');
  await refreshMiss.sandbox.applyExactProjectileEdit(refreshMiss.owner, refreshMiss.token);
  assert(!refreshMiss.owner.projectileEditPreviews.has('shot'), 'a verified commit stays committed when refreshed identity cannot be recovered');
  assert(refreshMiss.warnings.some(message => /applied exactly.*could not be identified uniquely/i.test(message)));
  assert(!refreshMiss.warnings.some(message => /preview was retained/i.test(message)));

  for (const mode of ['invalid-preview', 'no-op-preview', 'stale-preview']) {
    const scenario = makeScenario(mode);
    await scenario.sandbox.previewExactProjectileEdit(scenario.owner, { id: 'shot' }, { projanim: mode === 'no-op-preview' ? '600' : 'not-a-literal' });
    assert(!scenario.owner.projectileEditAuthorities.has(scenario.token), `${mode} revokes the previous Apply authority before review`);
    assert.strictEqual(scenario.owner.projectileEditPreviews.get('shot').token, '', `${mode} keeps prior comparison only as non-applicable review`);
  }

  const forged = makeScenario();
  await forged.sandbox.applyExactProjectileEdit(forged.owner, 'b'.repeat(48));
  assert.strictEqual(forged.edits.length, 0);
  assert(forged.owner.projectileEditPreviews.has('shot'));
  assert(forged.sandbox.validProjectileEditValues({ projanim: '601', velocity: '5, 0' }));
  assert(forged.sandbox.validProjectileEditValues({ projedgebound: '-40', projstagebound: '400', projheightbound: '-240, 0' }));
  assert(forged.sandbox.validProjectileEditValues({ projshadow: '-1', supermovetime: '-1', pausemovetime: '0', ownpal: '2', remappal: '1, 2', 'afterimage.time': '8' }));
  assert(forged.sandbox.validProjectileEditValues({ damage: '60, 5', pausetime: '8, 12', 'guard.pausetime': '7, 10' }));
  assert(forged.sandbox.validProjectileEditValues({ 'ground.slidetime': '12', 'ground.hittime': '14', 'guard.slidetime': '10', 'guard.hittime': '12', 'air.hittime': '18' }));
  assert(forged.sandbox.validProjectileEditValues({ 'ground.velocity': '-4, 0', 'guard.velocity': '-3', 'air.velocity': '-4, -7', yaccel: '.35' }));
  assert(forged.sandbox.validProjectileEditValues({ 'guard.ctrltime': '10', 'airguard.ctrltime': '12', 'air.juggle': '4', numhits: '2' }));
  assert(forged.sandbox.validProjectileEditValues({ 'airguard.velocity': '-3, -6', 'ground.cornerpush.veloff': '-4', 'air.cornerpush.veloff': '-3', 'down.cornerpush.veloff': '-2', 'guard.cornerpush.veloff': '-1', 'airguard.cornerpush.veloff': '-.5' }));
  assert(forged.sandbox.validProjectileEditValues({ hitonce: '2', kill: '-1', 'guard.kill': '3', 'fall.kill': '4', fall: '5', 'air.fall': '6', forcenofall: '7', 'fall.recover': '8', 'down.bounce': '9' }));
  assert(!forged.sandbox.validProjectileEditValues({ 'down.recover': '1' }));
  assert(forged.sandbox.validProjectileEditValues({ 'fall.xvelocity': '-2.5', 'fall.yvelocity': '-6', 'down.velocity': '-3, -4', 'fall.recovertime': '30', 'fall.damage': '10', 'down.hittime': '20' }));
  assert(!forged.sandbox.validProjectileEditValues({ 'fall.zvelocity': '1' }));
  assert(!forged.sandbox.validProjectileEditValues({ 'down.recovertime': '20' }));
  assert(forged.sandbox.validProjectileEditValues({ mindist: '-30, -20', maxdist: '40, 50', snap: '5, -10', p1sprpriority: '3', p2sprpriority: '-2', p1stateno: '5000', p2stateno: '5100' }));
  assert(forged.sandbox.validProjectileEditValues({ p1facing: '-1', p1getp2facing: '2', p2facing: '-3', p2getp1state: '4', forcestand: '-5' }));
  assert(!forged.sandbox.validProjectileEditValues({ forcecrouch: '1' }));
  assert(!forged.sandbox.validProjectileEditValues({ teamside: '1' }));
  assert(forged.sandbox.validProjectileEditValues({ attr: 'S, NA', hitflag: 'MAF+', guardflag: 'HL', affectteam: 'E' }));
  assert(forged.sandbox.validProjectileEditValues({ animtype: 'Light', 'air.animtype': 'Medium', 'fall.animtype': 'DiagUp', 'ground.type': 'High', 'air.type': 'Trip' }));
  assert(forged.sandbox.validProjectileEditValues({ priority: '4, Hit', id: '100', chainid: '-1', nochainid: '200, -1' }));
  assert(forged.sandbox.validProjectileEditValues({ getpower: '100', givepower: '-50, 25' }));
  assert(forged.sandbox.validProjectileEditValues({ sparkno: 'S7000', 'guard.sparkno': '-1', sparkxy: '-10, 20', hitsound: 'S1, 0', guardsound: '2, -1' }));
  assert(!forged.sandbox.validProjectileEditValues({ groups: 'forged presentation route' }),'webview grouping cannot expand host mutation authority');
  assert(!forged.sandbox.validProjectileEditValues({ evil: '1' }));
  assert(!forged.sandbox.validProjectileEditValues({ projanim: 601 }));
  console.log('Move Lab guarded Projectile host consumes exact authority, uses one native Undo edit, verifies output, and retains failed previews');
})().catch(error => { console.error(error); process.exitCode = 1; });
