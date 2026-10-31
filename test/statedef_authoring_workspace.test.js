'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const workspace = require('../src/statedef_authoring_workspace');

assert.strictEqual(workspace.supported({ languageId: 'zss', fileName: 'main.zss' }), true);
assert.strictEqual(workspace.supported({ languageId: 'ikemen-cns', fileName: 'main.cns' }), true);
assert.strictEqual(workspace.supported({ languageId: 'ikemen-cns', fileName: 'common.st' }), true);
assert.strictEqual(workspace.supported({ languageId: 'ikemen-cns', fileName: 'commands.cmd' }), false, 'the command palette cannot place a StateDef inside a CMD file');
assert.strictEqual(workspace.suggestedStateNumber('[StateDef 200]\n', 14), 201);
assert.strictEqual(workspace.suggestedStateNumber('; file heading\n[StateDef 200]\n[StateDef 310]\n', 0), 311, 'before the first declaration, the next highest nonnegative state is proposed');
assert.strictEqual(workspace.suggestedStateNumber('[StateDef -2]\n', 14), 200, 'global hooks do not produce a negative or zero ordinary-state proposal');

const current = { fileName: path.resolve('main.zss'), languageId: 'zss', getText: () => '[StateDef 200]\n' };
const sources = workspace.exactSources(current, { entries: [
  { filename: path.resolve('main.zss'), grammar: 'zss', text: '[StateDef 199]\n' },
  { filename: path.resolve('other.cns'), grammar: 'cns', text: '[StateDef 300]\n' }
] });
assert.strictEqual(sources.length, 2, 'the open source wins over the catalog copy and assigned sources remain available for duplicate checks');
assert.strictEqual(sources[0].text, '[StateDef 200]\n');

const root = path.resolve(__dirname, '..'), pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert(pkg.activationEvents.includes('onCommand:ikemen.statedef.create'));
assert(pkg.contributes.commands.some(item => item.command === 'ikemen.statedef.create' && /Create New StateDef/.test(item.title)));
assert(pkg.contributes.menus['ikemen.text.edit'].some(item => item.command === 'ikemen.statedef.create' && /cns/.test(item.when) && /st/.test(item.when)));
assert(fs.readFileSync(path.join(root, 'src', 'extension.js'), 'utf8').includes("require('./statedef_authoring_workspace').register(vscode, context"));
assert(fs.readFileSync(path.join(root, 'src', 'text_editor_toolbar.js'), 'utf8').includes("command: 'ikemen.statedef.create'"));

console.log('Guided StateDef host routing, safe defaults, duplicate-source precedence, and coding-header exposure tests passed');
