'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'story_dialogue_workspace.js'), 'utf8');
assert(!source.includes("[['saveSelect','Save select.def'") && !source.includes("message.type === 'saveSelect' || message.type === 'saveInserted'"), 'Story D2 removes duplicate body Save controls and receiver aliases');
assert(source.includes("save: async () => { active(); return withBusy(() => saveSelected(owner)); }"), 'the universal Save slot owns Story source saving and exposes in-flight Close truth');
assert(source.includes('selectedSavableDocument(owner)') && source.includes("selected.reference.role === 'inserted-dialogue'"), 'Save resolves only the navigator-selected proven select/inserted document');
assert(source.includes('const next = owner.queue.then'), 'Save and dialogue mutations remain serialized by the owner queue');
assert(source.includes('vscode.workspace.applyEdit(edit)') && source.includes('target.document.getText() !== expected'), 'Dialogue insertion uses one checked WorkspaceEdit and verifies its exact poststate');
console.log('Story D2 universal exact-source Save and serialized WorkspaceEdit ownership contract passed');
