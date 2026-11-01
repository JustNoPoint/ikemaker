'use strict';

const assert = require('assert');
const { enabledCapabilityIds, entryAvailable, filterEntry, filterAvailable } = require('../src/catalog_capability_filter');

const stable = { enabledCapabilities: [] };
const nightly = { enabledCapabilities: ['zss.run-state'] };
const entries = [{ name: 'ChangeState' }, { name: 'RunState', capabilityId: 'zss.run-state' }];

assert.deepStrictEqual([...enabledCapabilityIds(nightly)], ['zss.run-state']);
assert.strictEqual(entryAvailable(entries[0], stable), true);
assert.strictEqual(entryAvailable(entries[1], stable), false);
assert.strictEqual(entryAvailable(entries[1], nightly), true);
assert.deepStrictEqual(filterAvailable(entries, stable).map((entry) => entry.name), ['ChangeState']);
assert.deepStrictEqual(filterAvailable(entries, { capabilities: { 'zss.run-state': { enabled: true } } }).map((entry) => entry.name), ['ChangeState', 'RunState']);
const controller = { name: 'TransformClsn', params: [{ name: 'scale' }, { name: 'index', capabilityId: 'collision.indexed-controls' }] };
assert.deepStrictEqual(filterEntry(controller, stable).params.map((entry) => entry.name), ['scale']);
assert.deepStrictEqual(filterEntry(controller, { enabledCapabilities: ['collision.indexed-controls'] }).params.map((entry) => entry.name), ['scale', 'index']);
assert.strictEqual(controller.params.length, 2, 'catalog records remain immutable inputs');
const augmented = { name: 'SoundVar', description: 'Returns a channel property.', capabilityAugmentations: [{ capabilityId: 'audio.sample-rate-query', descriptionAppend: 'sampleRate is supported.' }] };
assert.strictEqual(filterEntry(augmented, stable).description, 'Returns a channel property.');
assert.strictEqual(filterEntry(augmented, { enabledCapabilities: ['audio.sample-rate-query'] }).description, 'Returns a channel property. sampleRate is supported.');
assert.strictEqual(augmented.description, 'Returns a channel property.', 'capability enrichment never mutates the bundled catalog');
const typed={name:'Physics',returnType:'boolean int',capabilityAugmentations:[{capabilityId:'zss.runtime-strings',returnType:'string when bare; boolean int when compared'}]};
assert.strictEqual(filterAvailable([typed],{enabledCapabilities:['zss.runtime-strings']})[0].returnType,'string when bare; boolean int when compared');
assert.strictEqual(filterAvailable([typed],{enabledCapabilities:[]})[0].returnType,'boolean int');
const parameterAugmented={name:'Helper',params:[{name:'name',placeholder:'quoted name',capabilityAugmentations:[{capabilityId:'zss.runtime-strings',placeholder:'string expression',descriptionAppend:'May be evaluated at runtime.'}]}]};
assert.strictEqual(filterEntry(parameterAugmented,stable).params[0].placeholder,'quoted name');
const dynamicParameter=filterEntry(parameterAugmented,{enabledCapabilities:['zss.runtime-strings']}).params[0];assert.strictEqual(dynamicParameter.placeholder,'string expression');assert(dynamicParameter.description.includes('evaluated at runtime'));
assert.strictEqual(parameterAugmented.params[0].placeholder,'quoted name','nested capability enrichment preserves immutable catalog inputs');
console.log('Catalog capability filtering keeps target-specific syntax out of unsupported projects');
