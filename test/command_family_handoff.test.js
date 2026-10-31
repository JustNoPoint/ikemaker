'use strict';

const assert = require('assert');
const Module = require('module');
const original = Module._load;
const notices = [];
const vscode = { workspace: { textDocuments: [], getConfiguration: () => ({ get: (_name, fallback) => fallback }) }, window: { showInformationMessage: async message => notices.push(message) }, Uri: { file: fsPath => ({ fsPath }) }, ViewColumn: { Active: 1 } };
Module._load = function (request, parent, main) { if (request === 'vscode') return vscode; return original.call(this, request, parent, main); };
const workspace = require('../src/command_movelist_workspace');
Module._load = original;

const authority = { schema: 'ikemaker.command-usage-route', version: 1, defPath: 'C:/Game/Hero/Hero.def', defHash: 'def', commandPath: 'C:/Game/Hero/Hero.cmd', commandHash: 'cmd', commandVersion: null, commandName: 'fireball', familyCount: 2, familyIdentity: 'family' };
const exact = { defPath: authority.defPath, defText: 'def', defDirty: false, commandPath: authority.commandPath, commandText: 'cmd', commandHash: 'cmd', commandVersion: null, commandAvailable: true };
const authorityModule = require('../src/command_usage_authority');
const originalValidate = authorityModule.validateCommandFamilyTarget;

async function run() {
  const posted = [], order = [], panel = { webview: { postMessage: async message => { posted.push(message); return true; } } }, owner = { disposed: false, loadedCommandFingerprint: 'cmd', loadedCommandFile: authority.commandPath, clientDraft: { dirty: false }, commandReference: { command: { name: 'other' } } };
  // The workspace captured the validator at load time, so use an exact real-shaped target through a narrow module reload shim.
  const services = { targetContext: () => exact, beforeOpen: () => order.push('before'), afterOpen: () => order.push('after'), openWorkspace: async () => { order.push('open'); return panel; }, sessionFor: () => owner };
  // Replace only the target validator dependency for this host sequencing test; pure validation is covered separately.
  const source = require('fs').readFileSync(require('path').join(__dirname, '../src/command_movelist_workspace.js'), 'utf8');
  assert(source.includes('validateCommandFamilyTarget(authority, target)'), 'target adoption is independently revalidated');
  authorityModule.validateCommandFamilyTarget = (_authority, candidate) => candidate?.commandHash === 'cmd';
  delete require.cache[require.resolve('../src/command_movelist_workspace')];
  Module._load = function (request, parent, main) { if (request === 'vscode') return vscode; return original.call(this, request, parent, main); };
  const isolated = require('../src/command_movelist_workspace'); Module._load = original;
  const result = await isolated.adoptCommandFamilyAuthority(authority, services);
  assert.deepStrictEqual(order, ['before', 'open', 'after']);
  assert.deepStrictEqual(posted, [{ type: 'commandSourceLine', file: authority.commandPath, referenceName: 'fireball', occurrence: 0, familyCount: 2 }]);
  assert.strictEqual(result.dispatched, true);

  posted.length = 0; owner.clientDraft.dirty = true;
  const kept = await isolated.adoptCommandFamilyAuthority(authority, services);
  assert.strictEqual(kept.dispatched, false); assert.strictEqual(kept.reason, 'unapplied-command-draft'); assert.strictEqual(posted.length, 0); assert.match(notices.at(-1), /kept unchanged/i);

  owner.clientDraft.dirty = false; let reads = 0;
  await assert.rejects(() => isolated.adoptCommandFamilyAuthority(authority, { ...services, targetContext: () => (++reads < 3 ? exact : { ...exact, commandHash: 'drift' }) }), /changed while/i);
  authorityModule.validateCommandFamilyTarget = originalValidate;
  delete require.cache[require.resolve('../src/command_movelist_workspace')];
  console.log('Command-family target adoption preserves drafts and revalidates around workspace opening');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
