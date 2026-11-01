'use strict';

const assert = require('assert');
const toolbar = require('../src/viewer_toolbar');

const item = command => ({ command });
const editor = (isEmpty, options = {}) => ({
  document: {
    isClosed: options.closed === true,
    isReadonly: options.readonly === true,
    uri: { scheme: options.scheme || 'file' },
    fileName: 'C:/chars/Ryu/states.zss'
  },
  selection: { isEmpty }
});
const api = (activeTextEditor, writable = true) => ({
  window: { activeTextEditor },
  workspace: { fs: { isWritableFileSystem: () => writable } }
});
const availability = (command, activeTextEditor, writable = true) => toolbar.resolveActionAvailability(item(command), { surface:'code', seed:'C:/chars/Ryu/Ryu.def', vscode:api(activeTextEditor,writable), active:true });

for (const command of ['editor.action.clipboardPasteAction','zss.toggleLineComment']) {
  assert.strictEqual(availability(command,editor(true)).enabled,true,`${command} works at an empty cursor`);
}
for (const command of ['editor.action.clipboardCutAction','editor.action.clipboardCopyAction']) {
  assert.strictEqual(availability(command,editor(true)).enabled,true,`${command} retains native empty-selection line behavior/settings`);
}
for (const command of ['zss.wrap.if','cns.scaleSelectedSizebox']) {
  const empty=availability(command,editor(true));assert.strictEqual(empty.enabled,false);assert.match(empty.reason,/Select text/);
  assert.strictEqual(availability(command,editor(false)).enabled,true,`${command} enables with a real selection`);
}
for (const command of ['editor.action.clipboardPasteAction','editor.action.clipboardCutAction','zss.toggleLineComment','zss.wrap.if']) {
  const readonly=availability(command,editor(false,{readonly:true}),true);assert.strictEqual(readonly.enabled,false);assert.match(readonly.reason,/read-only/);
  const schemeReadonly=availability(command,editor(false),false);assert.strictEqual(schemeReadonly.enabled,false);assert.match(schemeReadonly.reason,/read-only/);
}
assert.strictEqual(availability('editor.action.clipboardCopyAction',editor(false,{readonly:true}),false).enabled,true,'copy remains valid in a read-only editor');
for (const current of [undefined,editor(false,{closed:true})]) {
  const missing=availability('editor.action.clipboardPasteAction',current);assert.strictEqual(missing.enabled,false);assert.match(missing.reason,/Focus a compatible text editor/);
}
assert.strictEqual(toolbar.resolveActionAvailability(item('editor.action.clipboardPasteAction'),{surface:'code',seed:'',vscode:api(editor(true)),active:false}).enabled,false,'an inactive viewer cannot dispatch even a cursor-valid action');
const inactivePanel={active:false};
assert.strictEqual(toolbar.surfaceIsActive('code',inactivePanel,api(editor(true)),'C:/chars/Ryu/states.zss'),true,'the attached code header remains active while its exact native text editor has focus');
assert.strictEqual(toolbar.surfaceIsActive('code',inactivePanel,api(editor(true)),'C:/chars/Ken/states.zss'),false,'another native file cannot activate this code header');
assert.strictEqual(toolbar.surfaceIsActive('sff',inactivePanel,api(editor(true)),'C:/chars/Ryu/states.zss'),false,'visual viewers still require their own active panel');

const entries=surface=>toolbar.menuDefinitions(surface).flatMap(group=>group.items.filter(entry=>!entry.separator));
for(const surface of ['palette','air','sff','snd','stage','code'])for(const command of ['sff.createNew','air.createNew','snd.createNew']){
  const entry=entries(surface).find(candidate=>candidate.command===command);
  assert(entry,`${surface} exposes the context-free ${command} route`);
  const owner=command.split('.')[0],result=toolbar.resolveActionAvailability(entry,{surface,seed:'',vscode:api(undefined),active:true});assert.strictEqual(result.enabled,true,`${command} remains available through its owner, code exception, or reviewed cross-surface Build shortcut on ${surface}`);if(surface!==owner&&surface!=='code')assert.strictEqual(entry.crossSurface,true);
}
for(const [surface,command] of [['palette','sff.createNew'],['air','snd.createNew'],['stage','air.createNew']]){const owner=command.split('.')[0],result=toolbar.resolveActionAvailability({command},{surface,seed:'',vscode:api(undefined),active:true});assert.strictEqual(result.enabled,false,`an unmarked direct ${command} cannot bypass ${owner} ownership from ${surface}`);assert.match(result.reason,new RegExp(`connected ${owner.toUpperCase()} viewer`));}
for(const command of ['ikemen.character.createNew','ikemen.character.open']){
  const entry=entries('palette').find(candidate=>candidate.command===command);
  assert(entry);assert.strictEqual(toolbar.resolveActionAvailability(entry,{surface:'palette',seed:'',vscode:api(undefined),active:true}).enabled,true,`${command} owns its own destination/file chooser`);
}
for(const command of ['ikemen.engineMigration.installRetained','zss.updates.checkNow','ikemen.extensionUpdates.restoreBackup']){
  const entry=entries('sff').find(candidate=>candidate.command===command);
  assert(entry,`${command} remains visible in Build`);
  const result=toolbar.resolveActionAvailability(entry,{surface:'sff',seed:'',vscode:api(undefined),active:true});
  assert.strictEqual(result.enabled,true,`${command} owns its own picker or retained-data check and must not require an SFF or text cursor`);
  assert.strictEqual(entry.availability,'context-free',`${command} is classified truthfully for every viewer context`);
}
for(const command of ['ikemen.launchTrainingConfigured','ikemen.updates.configureFrequency','ikemen.configureAssetWorkspace']){
  const entry=entries('sff').find(candidate=>candidate.command===command);
  assert(entry,`${command} remains available from More`);
  assert.strictEqual(toolbar.resolveActionAvailability(entry,{surface:'sff',seed:'',vscode:api(undefined),active:true}).enabled,true,`${command} owns its setup flow and is available without an asset seed`);
}
const crossMutation=entries('palette').find(entry=>entry.targetSurface==='sff'&&entry.targetAction==='command.sff.createProjectBuildProfile');
assert(crossMutation,'the actual Palette union contains a guarded SFF mutation handoff');
const unseededCross=toolbar.resolveActionAvailability(crossMutation,{surface:'palette',seed:'',vscode:api(undefined),active:true});assert.strictEqual(unseededCross.enabled,false);assert.match(unseededCross.reason,/Open or select a compatible project file/);
assert.strictEqual(toolbar.resolveActionAvailability(crossMutation,{surface:'palette',seed:'C:/chars/Ryu/Ryu.def',vscode:api(undefined),active:true}).enabled,true,'seeded cross-surface mutation handoff remains available');

const client=toolbar.clientScript();
assert(!client.includes('message.actions.length!==actionById.size'),'one stale or surface-specific action count cannot disable the entire viewer menu');
assert(client.includes('const seen=new Set(),validated=[]')&&client.includes('validated.push(state)'),'availability updates validate and apply each known action independently');
assert(client.includes('if(!exact(state')&&client.includes(')continue;seen.add(state.actionId)'),'malformed or unknown action states stay disabled without discarding valid sibling actions');
assert(!client.includes('button.hidden=!state.enabled'),'unavailable actions remain visible so users can inspect what they require');
assert(client.includes("if(!state.enabled)button.title=state.reason"),'disabled menu actions expose their exact requirement on hover');
assert(client.includes("button.setAttribute('aria-disabled',state.enabled?'false':'true')"),'grey menu actions remain focusable while exposing semantic disabled state');
assert(client.includes("event.stopImmediatePropagation()"),'aria-disabled menu actions cannot execute through pointer or keyboard activation');
assert(toolbar.style().includes('.viewer-dropdown button[aria-disabled="true"]')&&toolbar.style().includes('cursor:help'),'grey menu actions preserve their visual state and advertise hover help');

for(const command of ['ikemen.quickLaunch.openSetup','ikemen.updates.checkAll','ikemen.workspaceSetup.change']){
  const entry=entries('sff').find(candidate=>candidate.command===command);
  assert(entry&&entry.catalog,`${command} is present through the public command catalog`);
  assert.strictEqual(entry.availability,'command-owned',`${command} delegates its own setup and prerequisite handling`);
  assert.strictEqual(toolbar.resolveActionAvailability(entry,{surface:'sff',seed:'',vscode:api(undefined),active:true}).enabled,true,`${command} is selectable instead of showing a generic unproven state`);
}
for(const surface of ['sff','air','snd','code'])for(const entry of entries(surface)){
  const result=toolbar.resolveActionAvailability(entry,{surface,seed:'C:/chars/Ryu/current.def',vscode:api(undefined),active:true});
  if(!result.enabled)assert(!/not registered for toolbar use/.test(result.reason),`${surface} ${entry.label} must expose an actionable prerequisite instead of an internal classification failure`);
}

console.log('Shared toolbar availability preserves text safety, direct asset ownership, context-free choosers, and seeded cross-surface mutation ownership');
