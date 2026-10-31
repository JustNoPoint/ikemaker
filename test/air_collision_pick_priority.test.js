'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '../src/air_viewer.js'), 'utf8');
function extract(name, next) {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0, `${name} exists`);
  return source.slice(start, source.indexOf(`function ${next}(`, start));
}

const state = {
  clsn1: [[-15, -80, 15, -50]],
  clsn2: [[-45, -95, 45, 0], [-20, -75, 20, -45]],
  clsn1Source: 'element',
  clsn2Source: 'default'
};
const controls = { clsn1: { checked: true }, clsn2: { checked: true }, showPush: { checked: true } };
const sandbox = {
  current: () => state,
  document: { getElementById: id => controls[id] },
  activePush: () => ({ box: [-30, -70, 30, 0], scope: 'baseline' }),
  normalized: box => box,
  zoom: 1,
  edit: null,
  lastPick: { signature: '', cycle: -1, x: 0, y: 0 }
};
vm.createContext(sandbox);
vm.runInContext(extract('boxHit', 'cyclePick'), sandbox);

let candidates = sandbox.pickCandidates([0, -60]);
assert.strictEqual(Array.from(candidates, item => `${item.kind}:${item.index}`).join(','), 'clsn1:0,clsn2:1,clsn2:0,size:0', 'an ordinary overlapping click reaches every individual AIR box before the pushbox');

candidates = sandbox.pickCandidates([-30, -70]);
assert.strictEqual(candidates[0].kind, 'size', 'an exact pushbox corner remains directly draggable');

sandbox.edit = { kind: 'clsn2', boxes: state.clsn2, scope: 'default' };
candidates = sandbox.pickCandidates([0, -60]);
assert.strictEqual(candidates[0].kind, 'clsn2', 'the collision family already being edited keeps first priority');

vm.runInContext(extract('cyclePick', 'size'), sandbox);
sandbox.edit = null;
assert.strictEqual(sandbox.cyclePick([0, -60], false).kind, 'clsn1', 'a normal click starts with the first candidate');
let picked = sandbox.cyclePick([0, -60], true);
assert.strictEqual(`${picked.kind}:${picked.index}`, 'clsn2:1', 'the second click of a double-click advances to the smaller nested Clsn2');
picked = sandbox.cyclePick([0, -60], true);
assert.strictEqual(`${picked.kind}:${picked.index}`, 'clsn2:0', 'continued double-clicks reach another overlapping box from the same Clsn2 family');
assert.strictEqual(sandbox.cyclePick([0, -60], true).kind, 'size', 'continued double-clicks reach the overlapping pushbox');
assert.strictEqual(sandbox.cyclePick([0, -60], true).kind, 'clsn1', 'overlapping candidates wrap in a cycle');
assert.strictEqual(sandbox.cyclePick([0, -60], false).kind, 'clsn1', 'a normal click restarts the overlap cycle');

console.log('AIR canvas overlap picking matches Fighter Factory double-click cycling without blocking pushbox corners');
