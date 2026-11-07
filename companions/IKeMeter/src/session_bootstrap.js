'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function currentUserSid() {
  const text = execFileSync('whoami.exe', ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8', windowsHide: true }).trim();
  const fields = text.match(/"([^"]*)"/g)?.map((value) => value.slice(1, -1)) || [];
  const sid = fields.find((value) => /^S-1-/.test(value));
  if (!sid) throw new Error('Unable to resolve the current Windows user SID');
  return sid;
}

function restrictDirectory(directory, sid) {
  execFileSync('icacls.exe', [directory, '/inheritance:r', '/grant:r', `*${sid}:(OI)(CI)F`], {
    encoding: 'utf8', windowsHide: true,
  });
}

function restrictFile(file, sid) {
  execFileSync('icacls.exe', [file, '/inheritance:r', '/grant:r', `*${sid}:F`], {
    encoding: 'utf8', windowsHide: true,
  });
}

function createSessionBootstrap(root) {
  if(root===undefined)root=require('./session_storage').prepareSessionStorage().sessions;
  const sid = currentUserSid();
  const sessionId = crypto.randomUUID();
  const directory = path.join(root, sessionId);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  restrictDirectory(directory, sid);
  const bootstrap = {
    protocolMajor: 1,
    protocolMinor: 0,
    sessionId,
    epoch: 1,
    key: crypto.randomBytes(32).toString('base64url'),
    createdAt: new Date().toISOString(),
  };
  const file = path.join(directory, 'session.json');
  fs.writeFileSync(file, JSON.stringify(bootstrap), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  return { directory, file, sid, bootstrap };
}

module.exports = { createSessionBootstrap, currentUserSid, restrictDirectory, restrictFile };
