'use strict';

const assert = require('assert');
const path = require('path');
const { AuthoringContextModel } = require('../src/authoring_context_model');
const { createAuthoringShellModel, sourceProjection, openFullTextIntent, classifyDocument, CODE_KINDS, COMMAND_KINDS, LAUNCH_KINDS } = require('../src/authoring_shell_model');

const file = path.resolve('test/fixtures/fighter.zss');
const document = { fileName: file, languageId: 'zss', uri: { scheme: 'file', fsPath: file, toString: () => `file://${file}` }, isClosed: false, getText: () => 'function demo() {\n}\n' };
const context = new AuthoringContextModel({ type: 'character', key: path.dirname(file), files: [file], activeSurfaceId: 'code.structure' });
const route = { filename: file, identity: 'exact-document', fingerprint: 'abc', version: '7', access: 'external-editor', mutationOwner: 'native-text-editor', contextId: context.identity, selectionRevision: 0 };
const shell = createAuthoringShellModel({
  context, document, exactRoute: route, view: { mode: 'split' }, destinations: [{ id: 'source', label: 'Focused Source' }],
  toolbarProjection: { contractId: 'universal-v1', surfaceId: 'code.structure', slots: [] }
});
assert(Object.isFrozen(shell) && Object.isFrozen(shell.source));
assert.strictEqual(shell.classification.kind, 'zss');
assert.strictEqual(shell.presentation.mode, 'split');
assert.strictEqual(shell.navigation.tabs[0].id, 'source');
assert.strictEqual(shell.source.kind, 'code-structure');
assert.strictEqual(shell.openFullText.type, 'open-full-text');
assert.strictEqual(shell.openFullText.filename, file);

const command = { fileName: path.resolve('fighter.cmd'), getText: () => '[Command]\nname="punch"\ncommand=x\n' };
assert.strictEqual(sourceProjection(command, { kind: 'cmd' }).commands[0].name, 'punch', 'command files reuse the command/movelist model');
for (const kind of CODE_KINDS) assert.strictEqual(sourceProjection({ fileName:path.resolve(`fighter.${kind}`), getText:()=>'' }, { kind }).kind, 'code-structure', `${kind} uses the shared code structure projection`);
for (const kind of COMMAND_KINDS) assert.strictEqual(sourceProjection({ fileName:path.resolve(`fighter.${kind}`), getText:()=>'' }, { kind }).kind, 'command-movelist', `${kind} uses the shared command/movelist projection`);
for (const kind of ['air', 'def']) {
  const projection = sourceProjection({ fileName: path.resolve(`fighter.${kind}`), getText: () => 'source' }, { kind, role: 'character' });
  assert.strictEqual(projection.kind, 'launch-card');
  assert.strictEqual(projection.editable, true, `${kind.toUpperCase()} keeps its visual launch card while exposing an integrated editable source pane`);
  assert.strictEqual(projection.text, 'source');
  assert.strictEqual(projection.sourceDocument.text, 'source');
  assert.strictEqual(projection.sourceDocument.integratedEditor, true);
}
assert.deepStrictEqual(LAUNCH_KINDS, ['air','def']);
const classified = (name, languageId = 'plaintext', configuration = { get:(_key,fallback)=>fallback }) => classifyDocument({ fileName:path.resolve(name), languageId, uri:{ scheme:'file', fsPath:path.resolve(name) }, isClosed:false, getText:()=>'' }, { configuration });
for (const [name, language] of [['fighter.zss','zss'],['fighter.cns','ikemen-cns'],['fighter.st','ikemen-cns'],['fighter.lua','lua'],['fighter.cmd','plaintext'],['fighter.inp','plaintext'],['fighter.jnp','plaintext'],['fighter.dat','plaintext'],['fighter.air','ikemen-air'],['fighter.def','ikemen-def']]) assert.strictEqual(classified(name,language).supported,true, `${name} participates in explicit Coding Viewer routing`);
assert.strictEqual(classified('notes.txt').supported,false,'ordinary TXT remains native-only');
assert.strictEqual(classified('authored.txt','plaintext',{get:(key,fallback)=>key==='additionalCodeExtensions'?['txt']:fallback}).supported,true,'configured TXT can opt into the Coding Viewer');
assert.strictEqual(openFullTextIntent({ available: false, reason: 'stale' }).available, false);
console.log('Authoring shell composes context, Visual/Source/Split, navigation, toolbar, exact routes, native text intent and pure source projections');
