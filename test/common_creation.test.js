'use strict';

const assert = require('assert');
const path = require('path');
const { commonRequirements, findGameRootForCharacter, commonStatus, commonCopyPlan } = require('../src/common_creation');

assert.deepStrictEqual(commonRequirements('mugen-cns'), ['common1.cns']);
assert.deepStrictEqual(commonRequirements('ikemen-zss'), ['common1.cns.zss', 'common.cmd']);
const defPath = path.join('C:\\Games\\Fight', 'chars', 'NewFighter', 'NewFighter.def');
assert.strictEqual(findGameRootForCharacter(defPath), path.resolve('C:\\Games\\Fight'));

function fakeFs(entries) {
  const files = new Map(Object.entries(entries).map(([name, value]) => [path.resolve(name), Buffer.from(value)]));
  return { existsSync: (name) => files.has(path.resolve(name)), readFileSync: (name) => files.get(path.resolve(name)) };
}
const target = path.resolve('C:\\Games\\Fight'), source = path.resolve('D:\\Engines\\Ikemen');
const io = fakeFs({
  [path.join(source, 'data', 'common1.cns.zss')]: 'states',
  [path.join(source, 'data', 'common.cmd')]: 'commands'
});
const status = commonStatus(defPath, 'ikemen-zss', io);
assert.strictEqual(status.missing.length, 2);
const copy = commonCopyPlan(target, source, 'ikemen-zss', io);
assert.strictEqual(copy.files.size, 2);
assert.strictEqual(copy.files.get(path.join(target, 'data', 'common.cmd')).toString(), 'commands');
assert.throws(() => commonCopyPlan(target, path.join(source, 'data'), 'mugen-cns', io), /common1\.cns/);

console.log('Character common-file contract tests passed');
