'use strict';

const childProcess = require('child_process');

let active = null;

function alive(pid, signal = process.kill) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { signal(pid, 0); return true; } catch (_) { return false; }
}

function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function stop(session, options = {}) {
  if (!session || !alive(session.pid, options.signal || process.kill)) return;
  const signal = options.signal || process.kill;
  try { signal(session.pid, 'SIGTERM'); } catch (_) {}
  for (let i = 0; i < 30 && alive(session.pid, signal); i += 1) await wait(50);
  if (alive(session.pid, signal) && process.platform === 'win32') {
    const killer = (options.spawn || childProcess.spawn)('taskkill', ['/PID', String(session.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    await new Promise(resolve => { killer.once?.('exit', resolve); killer.once?.('error', resolve); setTimeout(resolve, 2000); });
  }
  if (alive(session.pid, signal)) throw new Error('IKEMEN is still running and could not be restarted safely. Close it, then launch it again from IKEMaker.');
}

function spawnSession(spec, options = {}) {
  if (spec.mode === 'training') require('./training_launch_args').assertSafeTrainingArgs(spec.args);
  const child = (options.spawn || childProcess.spawn)(spec.executable, spec.args, { cwd: spec.cwd, detached: true, stdio: 'ignore', windowsHide: false });
  if (!Number.isInteger(child.pid) || child.pid <= 0) throw new Error('IKEMEN did not return a usable process identifier.');
  child.unref?.();
  active = { ...spec, args: [...spec.args], pid: child.pid };
  child.once?.('exit', () => { if (active?.pid === child.pid) active = null; });
  return { ...active, args: [...active.args] };
}

async function launch(spec, options = {}) {
  return spawnSession(spec, options);
}

async function restart(options = {}) {
  if (!active || !alive(active.pid, options.signal || process.kill)) {
    active = null;
    throw new Error('No IKEMEN session launched by IKEMaker is currently running. Start Normal, Infinite Quick VS, or Training first.');
  }
  const spec = { executable: active.executable, args: [...active.args], cwd: active.cwd, mode: active.mode };
  await stop(active, options);
  return spawnSession(spec, options);
}

function snapshot() { return active ? { ...active, args: [...active.args] } : null; }
function resetForTests() { active = null; }

module.exports = { alive, launch, restart, snapshot, resetForTests };
