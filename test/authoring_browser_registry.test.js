'use strict';

const assert = require('assert');
const {
  PROVIDER_IDS, PROVIDER_CONTRACTS, createBrowserRegistry, selectionIntent, openSourceIntent
} = require('../src/authoring_browser_registry');

(async () => {
  assert.deepStrictEqual(PROVIDER_IDS, ['code-navigator', 'project-data', 'recipes', 'similar-code', 'controllers', 'problems']);
  assert.deepStrictEqual(PROVIDER_CONTRACTS.map((contract) => contract.id), PROVIDER_IDS);
  assert(PROVIDER_CONTRACTS.every((contract) => contract.readOnly && contract.autoOpen === false));
  assert(PROVIDER_CONTRACTS.every((contract) => Object.isFrozen(contract) && contract.operations.includes('refresh') && contract.operations.includes('selection-intent') && contract.operations.includes('open-source-intent')));

  const source = { rows: [{ id: 'state-200', label: 'State 200' }] }, contexts = [];
  const registry = createBrowserRegistry({
    'code-navigator': { refresh: async (context) => { contexts.push(context); return source; } },
    'project-data': { read: () => ({ files: 3 }) },
    recipes: { read: () => ({ items:[] }) },
    'similar-code': { read: () => ({ items:[] }) },
    controllers: { refresh: () => { throw new Error('controller index unavailable'); } },
    problems: { read: () => ({ items:[] }) }
  });
  assert.strictEqual(registry.autoOpen, false);
  assert.deepStrictEqual(Object.keys(registry).sort(), ['autoOpen','contracts','openSourceIntent','refresh','refreshProviders','selectionIntent'].sort());
  const context = { owner: { id: 'ryu' } }, result = await registry.refresh(context);
  context.owner.id = 'mutated'; source.rows[0].label = 'mutated';
  assert.strictEqual(contexts[0].owner.id, 'ryu', 'providers receive a defensive read-only snapshot');
  assert(Object.isFrozen(contexts[0]) && Object.isFrozen(contexts[0].owner));
  assert.strictEqual(result.providers[0].data.rows[0].label, 'State 200', 'returned provider data is defensively copied');
  assert(Object.isFrozen(result) && Object.isFrozen(result.providers) && Object.isFrozen(result.providers[0].data.rows[0]));
  assert.deepStrictEqual(result.providers.map((entry) => entry.status), ['ready','ready','ready','ready','failed','ready']);
  assert.deepStrictEqual(result.failures, [{ providerId:'controllers', message:'controller index unavailable' }], 'one failure does not discard successful providers');
  const problemsOnly=await registry.refreshProviders(context,['problems']);
  assert.deepStrictEqual(problemsOnly.providers.map(entry=>entry.id),['problems'],'targeted refresh does not invoke or return unrelated providers');
  assert.deepStrictEqual(problemsOnly.failures,[],'an unrelated failed provider cannot contaminate a targeted refresh');

  assert.deepStrictEqual(selectionIntent('controllers', { id:'HitDef' }), { type:'selection', providerId:'controllers', selection:{id:'HitDef'} });
  assert.deepStrictEqual(openSourceIntent('code-navigator', { filename:'states.zss', line:12 }), { type:'open-source', providerId:'code-navigator', source:{filename:'states.zss',line:12} });
  assert(Object.isFrozen(registry.selectionIntent('project-data', { id:'hero.def' }).selection));
  assert.throws(() => selectionIntent('other', {}), /Unknown/);
  assert.throws(() => createBrowserRegistry({ controllers: { refresh() {}, save() {} } }), /mutation methods are forbidden/);
  assert.throws(() => createBrowserRegistry({ controllers: { select() {} } }), /only refresh\/read/);
  assert.throws(() => createBrowserRegistry({ other: { refresh() {} } }), /Unknown/);
  const invalidDto = await createBrowserRegistry({ controllers: { refresh: () => ({ bad() {} }) } }).refresh();
  assert.strictEqual(invalidDto.providers.find((entry) => entry.id === 'controllers').status, 'failed', 'invalid DTOs are isolated to their provider');
  const oversizedDto = await createBrowserRegistry({
    'code-navigator':{read:()=>({items:[{id:'safe',label:'Safe'}]})},
    controllers:{read:()=>({items:Array.from({length:5000},(_,index)=>({id:String(index),label:'x'}))})}
  }).refresh();
  assert.strictEqual(oversizedDto.providers.find(entry=>entry.id==='code-navigator').status,'ready');
  assert.strictEqual(oversizedDto.providers.find(entry=>entry.id==='controllers').status,'failed','a provider that exceeds shared node bounds fails in isolation');

  const missing = await createBrowserRegistry().refresh();
  assert.strictEqual(missing.failures.length, 6);
  assert.deepStrictEqual(missing.providers.map((entry) => entry.id), PROVIDER_IDS);
  console.log('Authoring browser exact providers, immutable DTOs, intents, no-mutation boundary and partial failure isolation passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
