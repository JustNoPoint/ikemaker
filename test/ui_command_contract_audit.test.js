'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..'), sourceRoot = path.join(root, 'src');
const packageJson = require('../package.json');
const sourceFiles = fs.readdirSync(sourceRoot).filter((name) => name.endsWith('.js'));
const sources = sourceFiles.map((name) => ({ name, text: fs.readFileSync(path.join(sourceRoot, name), 'utf8') }));
const allSource = sources.map((item) => item.text).join('\n');
const declared = packageJson.contributes.commands.map((item) => item.command);
const factoryCommands = new Set(['zss.createNew', 'cns.createNew', 'inp.createNew', 'cmd.createNew', 'ikemen.def.createNew', 'ikemen.lua.createNew', 'ikemen.text.createNew']);

assert.strictEqual(new Set(declared).size, declared.length, 'package.json contains duplicate command declarations');
for (const command of declared) {
  const literal = new RegExp(`registerCommand\\(\\s*['\"]${command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['\"]`);
  assert(literal.test(allSource) || factoryCommands.has(command), `${command} is contributed but not registered`);
}
for (const [menuName, entries] of Object.entries(packageJson.contributes.menus || {})) for (const item of entries) {
  assert(declared.includes(item.command), `${menuName} references undeclared command ${item.command}`);
}

const requiredCreation = ['ikemen.character.createNew', 'ikemen.stage.createNew', 'ikemen.ui.createNew', 'sff.createNew', 'air.createNew', 'snd.createNew', 'zss.createNew', 'cns.createNew', 'inp.createNew', 'cmd.createNew', 'ikemen.def.createNew', 'ikemen.lua.createNew', 'ikemen.text.createNew'];
const requiredOpen = ['ikemen.character.open', 'ikemen.stage.openWorkspace', 'ikemen.ui.openWorkspace', 'sff.openViewer', 'air.openAnimationPreview', 'snd.openViewer', 'ikemen.projectManager.open'];
for (const command of [...requiredCreation, ...requiredOpen]) assert(declared.includes(command), `missing open/create command: ${command}`);

for (const { name, text } of sources.filter((item) => /(?:viewer|workspace)\.js$/i.test(item.name))) {
  const ids = [...text.matchAll(/<button\b[^>]*\bid=["']([^"']+)["']/gi)].map((match) => match[1]);
  for (const id of new Set(ids)) {
    const occurrences = text.split(id).length - 1;
    assert(occurrences >= 2, `${name} button #${id} has no discoverable client binding`);
  }
  for (const match of text.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/gi)) {
    const tag = match[0], label = match[1].replace(/<[^>]+>/g, '').trim();
    assert(label || /\b(?:aria-label|title)=["']/i.test(tag), `${name} contains an unlabelled button`);
  }
  for (const match of text.matchAll(/vscode\.postMessage\(\{\s*type\s*:\s*["']([^"']+)/g)) {
    const type = match[1], occurrences = text.split(type).length - 1;
    const sharedHandler = text.includes('handleLaunchMessage') && sources.find(item=>item.name==='launch_controls.js').text.includes("message?.type==='"+type+"'");
    assert(occurrences >= 2 || sharedHandler, `${name} posts unhandled client message ${type}`);
  }
}

console.log('UI command, button, and open/create contract audit passed');
