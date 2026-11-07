'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// A PID is only a reason to refuse cleanup, never authority to terminate.
function processMayExist(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return true;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code !== 'ESRCH'; }
}
function plain(file, directory = false) {
  const stat = fs.lstatSync(file);
  if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile())) throw new Error(`Unsafe cleanup path: ${file}`);
}
function canonicalRuntime(runtime) { return fs.realpathSync(runtime); }
function acquireRuntimeLease(runtime, options = {}) {
  runtime = canonicalRuntime(runtime);
  const alive = options.alive || processMayExist;
  const guard = path.join(runtime, '.ikemeter-recovery.guard');
  const file = path.join(runtime, '.ikemeter-owner.json');
  // The guard is intentionally never reclaimed automatically after a crash.
  fs.mkdirSync(guard);
  let token;
  try {
    if (fs.existsSync(file)) {
      plain(file);
      const prior = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (prior.version !== 1 || typeof prior.token !== 'string' || alive(prior.pid)) throw new Error('IKeMeter runtime is owned or its owner cannot be verified absent');
      fs.unlinkSync(file);
    }
    token = crypto.randomUUID();
    fs.writeFileSync(file, JSON.stringify({version:1, pid:process.pid, token}), {flag:'wx', mode:0o600});
  } finally { fs.rmdirSync(guard); }
  let released = false;
  return { runtime, token, release() {
    if (released) return;
    fs.mkdirSync(guard);
    try {
      plain(file);
      const current = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (current.token !== token || current.pid !== process.pid) throw new Error('Runtime lease ownership changed');
      fs.unlinkSync(file); released = true;
    } finally { fs.rmdirSync(guard); }
  }};
}
function installedBridgeBytes(source, sessionId) {
  if (typeof sessionId !== 'string' || !/^[A-Za-z0-9-]+$/.test(sessionId)) throw new Error('Invalid bridge session binding');
  return Buffer.concat([Buffer.from(`-- IKeMeter session ${sessionId}\n`),source]);
}
function writeManifest(file, payload, options = {}) {
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  const rename=options.rename||fs.renameSync;
  const pause=options.pause||((ms)=>Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,ms));
  const attempts=options.attempts??4;
  // Exclusive creation refuses preexisting files and symlinks. Each synchronous
  // update completes before another child callback can update the manifest.
  fs.writeFileSync(temporary, JSON.stringify(payload), {flag:'wx',mode:0o600});
  for(let attempt=0;attempt<attempts;attempt++){
    try{rename(temporary,file);return;}
    catch(error){
      if(!['EPERM','EBUSY','EACCES'].includes(error.code)||attempt+1===attempts){
        // Preserve both the last committed manifest and this failed new snapshot.
        error.message=`Recovery manifest commit failed; retained temporary snapshot: ${error.message}`;
        throw error;
      }
      pause(25); // At most 75 ms total; no unbounded callback retry.
    }
  }
}

function recoverSessions(root, lease, options = {}) {
  const alive = options.alive || processMayExist;
  const remove = options.remove || ((file) => fs.unlinkSync(file));
  const legacy = path.join(root,'.runtime','sessions');
  const roots=[...new Set([legacy,...(options.additionalSessionRoots||[])].map(value=>path.resolve(value)))];
  const failures = [];
  const approved = [];

  const bridge = path.join(lease.runtime,'external','mods','ikemeter_bridge.lua');
  const bridgeSource = fs.readFileSync(path.join(root,'bridge','ikemeter_bridge.lua'));
  for(const sessions of roots){
  try{fs.lstatSync(sessions);plain(path.dirname(sessions),true);plain(sessions,true);}catch(error){if(error.code!=='ENOENT')failures.push(error.message);continue;}
  for (const entry of fs.readdirSync(sessions,{withFileTypes:true})) {
    const directory = path.join(sessions,entry.name);
    // Ignore regular diagnostic files; reject links rather than following them.
    if (entry.isSymbolicLink()) { failures.push(`${entry.name}: linked session directory`); continue; }
    if (!entry.isDirectory()) continue;
    const file = path.join(directory,'recovery.json');
    if (!fs.existsSync(file)) {
      // A torn first write cannot authorize any cleanup.
      if (fs.existsSync(path.join(directory,'recovery.json.next'))||fs.readdirSync(directory).some(name=>/^recovery\.json\..+\.tmp$/.test(name))) failures.push(`${entry.name}: incomplete recovery manifest`);
      continue;
    }
    try {
      plain(directory,true); plain(file);
      const plan = JSON.parse(fs.readFileSync(file,'utf8'));
      if (typeof plan.runtime !== 'string') throw new Error('invalid runtime');
      if (path.resolve(plan.runtime) !== lease.runtime) continue;
      if(fs.readdirSync(directory).some(name=>/^recovery\.json\..+\.tmp$/.test(name)))throw new Error('failed newer recovery snapshot retained; manual inspection required');
      if (plan.spawnPending !== false) throw new Error('process launch was interrupted; manual inspection required');
      if (plan.version !== 2 || plan.sessionId !== entry.name || !Number.isSafeInteger(plan.ownerPid) || plan.ownerPid <= 0 || !Array.isArray(plan.childPids)) throw new Error('unverified recovery manifest');
      const expected = { config:path.join(directory,'bridge.conf'),sessionFile:path.join(directory,'session.json'),sampleStop:path.join(directory,'sample-stop'),bridgeTarget:bridge };
      for (const [key,value] of Object.entries(expected)) if (plan[key] !== value) throw new Error(`untrusted ${key}`);
      const pids = [plan.ownerPid,...plan.childPids];
      if (plan.gamePid !== null) pids.push(plan.gamePid);
      if (pids.some((pid)=>alive(pid))) throw new Error('recorded process may still be alive; manual inspection required');
      // Pin the physical parent as well as the lexical path (reject junctions).
      plain(path.join(lease.runtime,'external'),true); plain(path.join(lease.runtime,'external','mods'),true);
      if (fs.existsSync(bridge)) {
        plain(bridge);
        const expectedBytes=installedBridgeBytes(bridgeSource,plan.sessionId);
        if (plan.bridgeOwned !== true || plan.bridgeSha256 !== crypto.createHash('sha256').update(expectedBytes).digest('hex')) throw new Error('bridge ownership was not committed');
        if (!fs.readFileSync(bridge).equals(expectedBytes)) throw new Error('bridge bytes changed; retaining recovery record');
      }
      const targets = [bridge,expected.config,`${expected.config}.status`,expected.sessionFile,expected.sampleStop];
      // Validate all targets before deleting any of them.
      for (const target of targets) if (fs.existsSync(target)) plain(target);
      approved.push({file,targets,name:entry.name});
    } catch (error) { failures.push(`${entry.name}: ${error.message}`); }
  }
  }
  // An unsafe record may describe the bridge currently installed. Validate all
  // matching sessions before changing any shared runtime file.
  if (failures.length) return failures;
  for (const {file,targets,name} of approved) {
    try {
      for (const target of targets) if (fs.existsSync(target)) remove(target);
      remove(file); // Keep evidence until every authorized cleanup succeeded.
    } catch (error) { failures.push(`${name}: ${error.message}`); break; }
  }
  return failures;
}
module.exports = {processMayExist,acquireRuntimeLease,writeManifest,recoverSessions,installedBridgeBytes};

if (require.main === module) {
  process.stderr.write('Recovery runs only while the application holds its runtime lease. Start with Start-IKeMeter.ps1.\n');
  process.exitCode = 1;
}
