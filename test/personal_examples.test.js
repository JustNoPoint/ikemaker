'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const examples = require('../src/personal_examples');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-examples-'));
try {
  const charA = path.join(root, 'chars', 'A'), charB = path.join(root, 'chars', 'B'), sharedFolder = path.join(root, 'shared');
  fs.mkdirSync(charA, { recursive: true }); fs.mkdirSync(charB, { recursive: true }); fs.mkdirSync(sharedFolder, { recursive: true });
  const ownerA = path.join(charA, 'A.def'), ownerB = path.join(charB, 'B.def'), local = path.join(charA, 'states.zss'), shared = path.join(sharedFolder, 'common.zss');
  fs.writeFileSync(ownerA, '[Files]\n'); fs.writeFileSync(ownerB, '[Files]\n');
  const source = '[StateDef 200]\nif time = 0 {\n  velSet{x: 0}\n}\n\n[Function JNP_Test() ret]\nlet ret = 1;\n';
  fs.writeFileSync(local, source); fs.writeFileSync(shared, '[Function Shared_Test() ret]\nlet ret = 1;\n');

  const block = examples.blockAt(source, 1, local);
  assert.strictEqual(block.kind, 'condition'); assert.strictEqual(block.startLine, 1); assert.strictEqual(block.endLine, 4);
  const pin = examples.createPin({ owner: ownerA, filename: local, text: source, line: 1, label: 'Stop movement' });
  assert.strictEqual(pin.scope, 'character'); assert.strictEqual(pin.label, 'Stop movement');
  assert.strictEqual(examples.editorLanguage(local), 'zss'); assert.strictEqual(examples.editorLanguage(path.join(charA, 'values.cns')), 'ikemen-cns');
  assert.deepStrictEqual(examples.normalizePin(pin).parameters, [], 'older bookmarks acquire an empty backward-compatible parameter list');
  const occurrences = examples.exactOccurrences(pin.text, '0');
  const parameterized = examples.withParameter(pin, { kind: 'state', label: 'Return state', original: '0', ranges: [occurrences[0]] });
  const adapted = examples.adaptationPlan(parameterized, { [parameterized.parameters[0].id]: '20' });
  assert.strictEqual(adapted.text, pin.text.slice(0, occurrences[0].start) + '20' + pin.text.slice(occurrences[0].end));
  assert.strictEqual(adapted.text.replace('20', '0'), pin.text, 'only the explicitly selected exact range changes');
  const dependencies=examples.adaptationDependencies('call Commit(1);\nchangeState{value: 20}\nplaySnd{value: 2, 4}');
  assert(dependencies.summary.includes('functions: Commit')&&dependencies.summary.includes('states: 20')&&dependencies.summary.includes('sounds: 2, 4'),'adaptation previews expose literal dependencies for expert review');
  assert.throws(() => examples.withParameter(parameterized, { kind: 'animation', label: 'Overlap', original: '0', ranges: [occurrences[0]] }), /overlap/);
  assert.throws(() => examples.withParameter(pin, { kind: 'state', label: 'Wrong bytes', original: '7', ranges: [occurrences[0]] }), /no longer matches/);
  assert.throws(() => examples.adaptationPlan(parameterized, { [parameterized.parameters[0].id]: '1\n2' }), /one explicit value/);
  const mixed = '[StateDef 1]\r\nif time = 0 {\n\tcustom.field : keep ;\r\n}\r\n';
  const mixedPin = examples.createPin({ owner: ownerA, filename: local, text: mixed, line: 1, label: 'Mixed bytes' });
  assert.strictEqual(mixedPin.text, 'if time = 0 {\n\tcustom.field : keep ;\r\n}', 'new example pins retain custom spacing and mixed line endings byte-for-byte');
  const sharedPin = examples.createPin({ owner: ownerA, filename: shared, text: fs.readFileSync(shared, 'utf8'), line: 1, label: 'Shared helper' });
  assert.strictEqual(sharedPin.scope, 'shared');

  let store = examples.putPin({}, pin); store = examples.putPin(store, sharedPin); store = examples.putPin(store, { ...pin, label: 'Updated label' });
  assert.strictEqual(examples.pinsFor(store, ownerA).length, 2, 'pinning the same exact block updates instead of duplicating it');
  assert.strictEqual(examples.pinsFor(store, ownerA).find(item => item.id === pin.id).label, 'Updated label');
  assert.deepStrictEqual(examples.pinsFor(store, ownerB), [], 'personal examples remain isolated by character/project owner');
  assert.strictEqual(examples.resolvePin(pin, { allowedFiles: [local, shared] }).status, 'current');
  assert.strictEqual(examples.resolvePin(sharedPin, { allowedFiles: [local] }).status, 'unlinked', 'shared sources require an explicit current link');

  fs.writeFileSync(local, '# moved down\n' + source);
  const moved = examples.resolvePin(pin, { allowedFiles: [local, shared] });
  assert.strictEqual(moved.status, 'moved'); assert.strictEqual(moved.resolvedStartLine, pin.startLine + 1);
  fs.writeFileSync(local, ('# moved down\n' + source).replace('velSet{x: 0}', 'velSet{x: 1}'));
  const changed = examples.resolvePin(pin, { allowedFiles: [local, shared] });
  assert.strictEqual(changed.status, 'changed'); assert.strictEqual(changed.resolvedStartLine, pin.startLine + 1);

  store = examples.renamePin(store, ownerA, pin.id, 'Freeze start');
  assert.strictEqual(examples.pinsFor(store, ownerA).find(item => item.id === pin.id).label, 'Freeze start');
  const replacement = examples.createPin({ owner: ownerA, filename: local, text: fs.readFileSync(local, 'utf8'), line: 2, label: 'Freeze start' });
  store = examples.replacePin(store, ownerA, pin.id, replacement);
  assert.strictEqual(examples.pinsFor(store, ownerA).find(item => item.id === pin.id).fingerprint, replacement.fingerprint);
  store = examples.removePin(store, ownerA, sharedPin.id);
  assert.strictEqual(examples.pinsFor(store, ownerA).length, 1);

  const plain = path.join(charA, 'notes.txt'), paragraph = 'alpha\nbeta';
  fs.writeFileSync(plain, paragraph + '\n');
  const ambiguousPin = examples.createPin({ owner: ownerA, filename: plain, text: paragraph, line: 0, label: 'Repeated' });
  fs.writeFileSync(plain, '# shifted\n\n' + paragraph + '\n\n' + paragraph + '\n');
  assert.strictEqual(examples.resolvePin(ambiguousPin, { allowedFiles: [plain] }).status, 'ambiguous');
  fs.unlinkSync(local);
  assert.strictEqual(examples.resolvePin(pin, { allowedFiles: [local] }).status, 'missing');

  const restored = examples.normalizeStore(JSON.parse(JSON.stringify(store)));
  assert.strictEqual(examples.pinsFor(restored, ownerA).length, 1, 'workspace-state data survives serialization');
  console.log('Personal example shelf identity, persistence, isolation and source-state tests passed');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
