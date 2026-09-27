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
assert(menus.includes("message.type === 'saveSystem' || message.type === 'saveSelect'"), 'Menu & Modes must save system.def and select.def independently');
assert(menus.includes('if (!await vscode.workspace.applyEdit(edit))'), 'Menu writes must reject a failed WorkspaceEdit');
assert(structure.includes("message.type === 'saveCode'") && structure.includes('session.document'), 'Visual Code Structure must save its bound source document');
assert(structure.includes('if (!await vscode.workspace.applyEdit(edit))'), 'Visual Code Structure must reject a failed insertion');
assert(story.includes('owner.lastInsertedDocument = editor.document'), 'Story & Dialogue must retain the exact successful insertion target');
assert(story.includes("message.type === 'saveSelect' || message.type === 'saveInserted'"), 'Story & Dialogue must expose separate exact-target saves');
assert(story.includes('if (!applied)'), 'Story & Dialogue must reject a failed editor insertion');
console.log('Visual editor exact-source save contracts passed');
