'use strict';
const assert = require('assert');
const path = require('path');
const { connectedAssetInventory } = require('../src/connected_asset_inventory');
const root = path.resolve('/character'), owner = path.join(root, 'Ryu.def'), files = new Set(['Ryu.air', 'fx.air', 'fx.sff', 'Ryu.snd', 'common.snd'].map(name => path.join(root, name)));
const services = { fs: { existsSync: file => files.has(path.resolve(file)) }, resolveAssigned: () => ({ air: path.join(root, 'Ryu.air'), snd: path.join(root, 'Ryu.snd') }), archiveRegistry: () => ({ candidates: [{ prefix: 'f', displayPrefix: 'FightFX', air: path.join(root, 'fx.air'), sff: path.join(root, 'fx.sff'), snd: path.join(root, 'common.snd') }, { prefix: 'dup', air: path.join(root, 'fx.air'), sff: path.join(root, 'fx.sff'), snd: path.join(root, 'common.snd') }] }) };
for (const kind of ['air', 'snd']) {
  const current = path.join(root, kind === 'air' ? 'Ryu.air' : 'Ryu.snd'), inventory = connectedAssetInventory(current, [owner], kind, services);
  assert.strictEqual(inventory.length, 2);
  assert.strictEqual(inventory.filter(item => item.current).length, 1);
  assert(inventory.every(item => new RegExp(`^${kind}-[a-f0-9]{24}$`).test(item.id)));
  assert(inventory.every(item => item.available === true && ['primary','shared'].includes(item.bindingKind)), 'owned inventory rows retain an exact primary/shared binding');
}
const ambiguousServices = { ...services, archiveRegistry: () => ({ candidates: [{ prefix: 'one', air: path.join(root, 'fx.air'), sff: path.join(root, 'one.sff') }, { prefix: 'two', air: path.join(root, 'fx.air'), sff: path.join(root, 'two.sff') }] }), fs: { existsSync: file => files.has(path.resolve(file)) || /(?:one|two)\.sff$/i.test(file) } };
const ambiguous = connectedAssetInventory(path.join(root, 'Ryu.air'), [owner], 'air', ambiguousServices).find(item => item.filename === path.join(root, 'fx.air'));
assert(ambiguous && ambiguous.available === false && ambiguous.ambiguous && /more than one sprite archive/i.test(ambiguous.reason), 'one AIR bound to different SFF archives is retained only as an actionable unavailable choice');
assert.strictEqual(connectedAssetInventory(path.join(root, 'Ryu.air'), [], 'air', services).length, 1, 'standalone viewers expose only themselves');
console.log('connected AIR/SND asset inventory tests passed');
