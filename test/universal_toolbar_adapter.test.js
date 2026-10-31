'use strict';

const assert = require('assert');
const { SLOTS, SPECIALIST_ACTION_IDS } = require('../src/viewer_toolbar_contract');
const { SURFACES } = require('../src/viewer_surface_registry');
const { adapt } = require('../src/universal_toolbar_adapter');

for (const surface of SURFACES.filter(item => item.toolbarPolicy !== 'excluded')) {
  const model = adapt(surface.id, { 'universal.text-source': { enabled: true, dispatch: 'source.open' } });
  assert.strictEqual(model.contractId, 'universal-v1');
  assert.strictEqual(model.slots.length, SLOTS.length); assert.deepStrictEqual(model.slots.map(item => item.actionId), SLOTS.map(item => item.actionId));
  assert.strictEqual(model.dimensions.width, 27); assert.strictEqual(model.dimensions.horizontalScroll, false);
  const source = model.slots.find(item => item.id === 'text-source'), connected = model.slots.find(item => item.id === 'connected-resources');
  assert(!source.enabled); assert(source.sourceCapabilityId); assert(!source.connectedResources);
  assert(!connected.enabled); assert(connected.connectedResources); assert.strictEqual(connected.sourceCapabilityId, '');
  assert(model.slots.filter(item => !item.enabled).every(item => item.reason), 'disabled slots retain position and explain unavailability');
}
assert(adapt('air.viewer', {}).slots.find(item => item.id === 'restart').enabled, 'Restart IKEMEN is a universal host action on every participating surface');
assert(adapt('air.viewer', {}).slots.find(item => item.id === 'updates').enabled, 'the combined Updates action is available in every participating header');
assert(!adapt('air.viewer', {}).slots.find(item => item.id === 'auto-save').enabled, 'windows without a real save owner show Auto Save as unavailable instead of pretending to persist data');
const savePolicy=adapt('air.viewer',{'universal.save':{enabled:true,dispatch:'internal:save'},'universal.auto-save':{enabled:true,dispatch:'internal:auto-save'}},{autoSaveEnabled:true});
assert.strictEqual(savePolicy.slots.find(item=>item.id==='save').reason,'Save is unavailable because Auto Save is on.','Auto Save disables manual Save with the exact shared explanation');
assert.strictEqual(savePolicy.slots.find(item=>item.id==='auto-save').pressed,true,'the shared Auto Save control exposes its current state');
const implemented = { 'planned.exact-document': { id: 'planned.exact-document', status: 'implemented', identity: 'exact-document', resolverId: 'air-source' } };
const enabled = adapt('air.viewer', { 'universal.text-source': { enabled: true, dispatch: 'source.open', capabilityId: 'planned.exact-document', resolverId: 'air-source', routeKind: 'exact-document' } }, { capabilities: implemented, resolverIds: ['air-source'] });
assert(enabled.slots.find(item => item.id === 'text-source').enabled, 'implemented matching exact-source evidence enables Text / Source');
assert(!adapt('air.viewer', { 'universal.text-source': { enabled: true, dispatch: 'source.open', capabilityId: 'planned.exact-document', resolverId: 'air-source', routeKind: 'connected-only' } }, { capabilities: implemented, resolverIds: ['air-source'] }).slots.find(item => item.id === 'text-source').enabled, 'Connected Resources cannot satisfy Text / Source');
assert(!adapt('air.viewer', { 'universal.open': { enabled: true } }).slots.find(item => item.id === 'open').enabled, 'enabled slots require concrete dispatch');
assert.throws(() => adapt('snd.viewer', { [SPECIALIST_ACTION_IDS[0]]: { enabled: true } }), /viewer body/);
assert.throws(() => adapt('snd.viewer', { 'universal.open': { enabled: true, dispatch: SPECIALIST_ACTION_IDS[0] } }), /viewer body/);
assert.throws(() => adapt('snd.viewer', { 'universal.open': { enabled: true, dispatch: ` ${SPECIALIST_ACTION_IDS[0]} ` } }), /viewer body/);
assert(!adapt('air.viewer', { 'universal.connected-resources': { enabled: true, dispatch: 'resources.open' } }).slots.find(item => item.id === 'connected-resources').enabled);
assert(!adapt('air.viewer', { 'universal.connected-resources': { enabled: true, dispatch: 'resources.open', routeKind: 'exact-document' } }).slots.find(item => item.id === 'connected-resources').enabled);
assert(adapt('air.viewer', { 'universal.connected-resources': { enabled: true, dispatch: 'resources.open', routeKind: 'connected-resources' } }).slots.find(item => item.id === 'connected-resources').enabled);
assert.throws(() => adapt('navigation.tools', {}), /does not participate/);
assert.throws(() => adapt('missing', {}), /Unknown/);
console.log('Universal toolbar adapter invariants and specialist-control separation passed');
