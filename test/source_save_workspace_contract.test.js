'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const read = (name) => fs.readFileSync(path.join(__dirname, '..', 'src', name), 'utf8');
const air = read('air_viewer.js'), hitdef = read('hitdef_workspace.js'), menus = read('menu_modes_workspace.js'), structure = read('code_structure_workspace.js'), story = read('story_dialogue_workspace.js');

assert(air.includes("message.type === 'saveAir'") && air.includes('saveSourceDocument(document'), 'AIR Save must target its host-opened document');
assert(air.includes('Previous Animation') && air.includes('Next Animation') && air.includes('◀ Frame') && air.includes('Frame ▶'), 'AIR action and frame navigation must be labeled separately');
assert(air.includes('not saved to disk yet'), 'AIR Apply wording must distinguish open-document edits from disk saves');
assert(hitdef.includes("message.type==='saveCode'") && hitdef.includes('owner.uri'), 'HitDef Save must retain the exact source URI');
assert(hitdef.includes('not saved to disk yet'), 'HitDef Apply wording must identify unsaved document changes');
assert(!menus.includes("message.type === 'saveSystem'") && !menus.includes("message.type === 'saveSelect'") && !menus.includes('id="save-system"') && !menus.includes('id="save-select"'), 'Menu & Modes must retire duplicate per-file body Save authority');
assert(menus.includes("save,'text-source':openExact") && menus.includes("capture?.reference.sourceRole==='select'?owner.selectDocument:owner.systemDocument") && menus.includes('await document.save()'), 'Menu & Modes universal Save must target only the navigator-selected, host-bound dirty document');
assert(menus.includes('if (!await vscode.workspace.applyEdit(edit))'), 'Menu writes must reject a failed WorkspaceEdit');
assert(structure.includes("message.type === 'saveCode'") && structure.includes('session.document'), 'Visual Code Structure must save its bound source document');
assert(structure.includes('if (!await vscode.workspace.applyEdit(edit))'), 'Visual Code Structure must reject a failed insertion');
assert(story.includes('owner.lastInsertedDocument = target.document'), 'Story & Dialogue must retain the exact successful insertion target');
assert(!story.includes("message.type === 'saveSelect' || message.type === 'saveInserted'") && !story.includes("[['saveSelect','Save select.def'"), 'Story & Dialogue must retire duplicate body Save authority');
assert(story.includes("save: async () => { active(); return withBusy(() => saveSelected(owner)); }") && story.includes('await document.save()'), 'Story & Dialogue universal Save must target only the navigator-selected proven dirty document under busy Close authority');
assert(story.includes('vscode.workspace.applyEdit(edit)') && story.includes('target.document.getText() !== expected'), 'Story & Dialogue insertion must reject a failed or wrong-poststate WorkspaceEdit');
console.log('Visual editor exact-source save contracts passed');
