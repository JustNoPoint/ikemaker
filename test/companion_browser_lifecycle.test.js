'use strict';

const assert = require('assert');
const { createBrowserReadinessController, waitForWorkbenchRestoreSettled } = require('../src/companion_browser_lifecycle');

(async () => {
  const readiness = createBrowserReadinessController({ timeoutMs: 250 });
  readiness.arm();
  const first = readiness.wait();
  assert.strictEqual(readiness.signal({ type: 'other' }), false);
  assert.strictEqual(readiness.signal({ type: 'companionBrowserReady' }), true);
  assert.strictEqual(await first, true, 'browser movement waits for the original renderer to announce readiness');
  readiness.arm();
  const second = readiness.wait();
  readiness.signal({ type: 'companionBrowserReady' });
  assert.strictEqual(await second, true, 'a renderer rehydrated after moving announces readiness independently');
  readiness.dispose();

  let listener = null, disposed = 0;
  const event = callback => { listener = callback; return { dispose() { disposed += 1; } }; };
  const started = Date.now(), waiting = waitForWorkbenchRestoreSettled({ window: { tabGroups: { onDidChangeTabs: event }, onDidChangeActiveTextEditor: event } }, { quietMs: 50, minimumWaitMs: 50, maximumWaitMs: 500 });
  setTimeout(() => listener?.(), 25);
  assert.strictEqual(await waiting, 'quiet');
  assert(Date.now() - started >= 70, 'a late startup topology change renews the quiet window so the browser restores last');
  assert.strictEqual(disposed, 2, 'startup listeners are always released');
  console.log('Companion browsers wait for renderer readiness and quiet startup topology before restoring');
})().catch(error => { console.error(error); process.exitCode = 1; });
