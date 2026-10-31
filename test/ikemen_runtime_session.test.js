'use strict';

const assert = require('assert');
const runtime = require('../src/ikemen_runtime_session');

(async () => {
  runtime.resetForTests();
  let nextPid = 100, alive = new Set(), launches = [];
  const signal = (pid, value) => {
    if (!alive.has(pid)) throw Object.assign(new Error('missing'), { code: 'ESRCH' });
    if (value !== 0) alive.delete(pid);
  };
  const spawn = (executable, args, options) => {
    const pid = nextPid++; alive.add(pid); launches.push({ executable, args: [...args], options, pid });
    return { pid, unref() {}, once() {} };
  };
  const first = await runtime.launch({ executable: 'Ikemen_GO.exe', args: ['-training', '1'], cwd: 'C:\\game', mode: 'training' }, { spawn, signal });
  assert.strictEqual(first.pid, 100);
  const restarted = await runtime.restart({ spawn, signal });
  assert.strictEqual(restarted.pid, 101); assert.deepStrictEqual(restarted.args, ['-training', '1']); assert.strictEqual(restarted.mode, 'training');
await assert.rejects(() => runtime.launch({ executable: 'Ikemen_GO.exe', args: ['-loadmotif', '1', '-training', '1'], cwd: 'C:\\game', mode: 'training' }, { spawn, signal }), /crashes in menu\.lua/);
  assert(!alive.has(100) && alive.has(101), 'restart terminates the prior process before recreating the same session');
  const normal = await runtime.launch({ executable: 'Ikemen_GO.exe', args: [], cwd: 'C:\\game', mode: 'normal' }, { spawn, signal });
  assert.strictEqual(normal.pid, 102); assert(alive.has(101), 'a new launch never blocks or closes another running game window');
  alive.delete(102);
  await assert.rejects(() => runtime.restart({ spawn, signal }), /No IKEMEN session/);
  assert.strictEqual(launches.length, 3);
  console.log('IKEMEN unrestricted launch and targeted full restart tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
