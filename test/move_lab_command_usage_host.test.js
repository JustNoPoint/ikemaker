'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '../src/move_constants_workspace.js'), 'utf8');
const body = source.slice(source.indexOf('async function openCommandUsageRoute('), source.indexOf('function validProjectileEditValues('));

async function scenario({ route = 'a'.repeat(48), active = true, current = true, disposed = false, generation = 7, snapshots = 3, failBefore = false, failAfter = false } = {}) {
  const warnings = [], authority = { route, generation: 7, commandName: 'fireball', familyCount: 2 }, record = { kind: 'command-usage', authority }, owner = { disposed, panel: { active }, projectileGeneration: generation, projectileRoutes: new Map([[route, record]]), projectileConsumedRoutes: new Set() };
  let valid = true, calls = 0, before = 0, after = 0;
  const queue = Array.from({ length: snapshots }, () => ({ authority }));
  const sandbox = { currentCommandUsageRoute: () => valid ? (queue.shift() || null) : null, vscode: { window: { showWarningMessage: message => warnings.push(message) } }, require };
  vm.runInNewContext(body, sandbox);
  const adoptCommandFamily = async (_authority, hooks) => { calls += 1; before += 1; hooks.beforeOpen(); if (failBefore) valid = false; if (failAfter) valid = false; after += 1; hooks.afterOpen(); return { dispatched: true }; };
  const result = await sandbox.openCommandUsageRoute(owner, route, { isCurrent: () => current, adoptCommandFamily });
  return { result, warnings, owner, calls, before, after, invoke: () => sandbox.openCommandUsageRoute(owner, route, { isCurrent: () => current, adoptCommandFamily }) };
}

(async () => {
  const good = await scenario(); assert.strictEqual(good.result.dispatched, true); assert.strictEqual(good.calls, 1);
  await good.invoke(); assert.strictEqual(good.calls, 1, 'one-use command-family route cannot replay');
  for (const options of [{ active: false }, { current: false }, { disposed: true }, { generation: 8 }, { route: 'short' }, { snapshots: 0 }, { failBefore: true }, { failAfter: true }]) {
    const denied = await scenario(options); assert.strictEqual(denied.result?.dispatched, undefined, 'inactive, forged, stale, or raced command authority never reaches adoption');
  }
  console.log('Move Lab command-family host consumes one-use routes and rechecks authority around target opening');
})().catch(error => { console.error(error); process.exitCode = 1; });
