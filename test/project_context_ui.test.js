'use strict';

const assert = require('assert');
const Module = require('module');
const fs = require('fs');
const os = require('os');
const path = require('path');

const air = { scheme: 'file', fsPath: 'C:\\game\\chars\\Ryu\\Anim.air' };
const webview = { scheme: 'ikemen-view', fsPath: '' };
const vscode = {
  window: {
    activeTextEditor: null,
    tabGroups: {
      activeTabGroup: { activeTab: { input: { uri: webview } } },
      all: [
        { activeTab: { input: { uri: air } }, tabs: [] },
        { activeTab: { input: { uri: webview } }, tabs: [] }
      ]
    },
    visibleTextEditors: []
  },
  workspace: {}
};

const original = Module._load;
Module._load = function patched(request, parent, main) {
  if (request === 'vscode') return vscode;
  return original.call(this, request, parent, main);
};
const { activeUri, safeId, relativeRoot, writeRegistry } = require('../src/project_context_ui');
Module._load = original;
const registryEvents = require('../src/project_registry_events');
const { hash } = require('../src/mutation_safety');

assert.strictEqual(activeUri(), air, 'a visual workspace must fall back to the active file tab in another editor group');
vscode.window.tabGroups.all = [];
vscode.window.visibleTextEditors = [{ document: { uri: air } }];
assert.strictEqual(activeUri(), air, 'a restored visual workspace must fall back to a visible source editor');
vscode.window.activeTextEditor = { document: { uri: air } };
assert.strictEqual(activeUri(), air, 'the active text editor remains authoritative');
assert.strictEqual(safeId('My New Game!'), 'my-new-game');
assert.strictEqual(relativeRoot('C:\\game\\.ikemen\\project-registry.json', 'C:\\game'), '.');

const root=fs.mkdtempSync(path.join(os.tmpdir(),'ikemaker-project-context-write-')),filename=path.join(root,'.ikemen','project-registry.json'),events=[];
try {
  const subscription=registryEvents.onDidChangeProjectRegistry(event=>events.push(event));
  writeRegistry(filename,{schemaVersion:1,projects:[]},'test-registry-write');
  const savedBytes=fs.readFileSync(filename),savedHash=hash(savedBytes);
  assert.throws(()=>writeRegistry(filename,{schemaVersion:1,projects:[{id:'stale'}]},'stale-registry-write','0'.repeat(64)),/changed after it was loaded and was not overwritten/);
  assert.deepStrictEqual(fs.readFileSync(filename),savedBytes,'the production writer rejects a stale registry hash without changing current bytes');
  assert.strictEqual(events.length,1,'a rejected stale write publishes no registry-change event');
  const originalRename=fs.renameSync;let injected=false;
  fs.renameSync=function(source,destination){if(!injected&&path.resolve(destination)===path.resolve(filename)&&/\.tmp$/i.test(source)){injected=true;throw new Error('injected registry install failure')}return originalRename.apply(this,arguments)};
  try{assert.throws(()=>writeRegistry(filename,{schemaVersion:1,projects:[{id:'rollback'}]},'rollback-registry-write',savedHash),/injected registry install failure/)}finally{fs.renameSync=originalRename}
  assert.deepStrictEqual(fs.readFileSync(filename),savedBytes,'a failed production install restores the exact prior registry bytes from its temporary rollback file');
  assert(!fs.readdirSync(path.dirname(filename)).some(name=>/\.tmp$|\.rollback$/.test(name)),'temporary transaction files are cleaned after rollback');
  subscription.dispose();
  assert.strictEqual(events.length,1,'a successful authoritative registry write publishes one capability-change event');
  assert.strictEqual(events[0].filename,path.resolve(filename));
  assert.strictEqual(events[0].reason,'test-registry-write');
} finally { fs.rmSync(root,{recursive:true,force:true}); }

console.log('Project context UI tests passed');
