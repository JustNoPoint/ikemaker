'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const packageJson = require('../package.json');
assert(packageJson.extensionPack.includes('sumneko.lua'));

const library = fs.readFileSync(path.join(root, 'data', 'luals', 'ikemen-1.0.lua'), 'utf8');
assert(library.startsWith('---@meta IKEMEN_GO_1_0'));
assert(library.includes('function addChar('));
assert(library.includes('function hook.add('));
assert(!library.includes('kind = "hook"'));

const license = fs.readFileSync(path.join(root, 'third_party', 'Lua-Language-Server-LICENSE.txt'), 'utf8');
for (const permission of ['use, copy, modify, merge, publish, distribute, sublicense, and/or sell', 'copyright notice and this permission notice']) assert(license.includes(permission));
const luaVsix = path.join(root, 'third_party', 'Lua-Language-Server-3.19.1-win32-x64.vsix');
if (!fs.existsSync(luaVsix)) {
  const buildNotes = fs.readFileSync(path.join(root, 'SOURCE-BUILD.md'), 'utf8');
  const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  assert(buildNotes.includes('11080310'));
  assert(buildNotes.includes('C0A7489AD58358DDF2590F6782C94FA9308076B73AAA30B456932373B0D8CB28'));
  assert(gitignore.split(/\r?\n/).includes('*.vsix'));
}

const installer = fs.readFileSync(path.join(root, 'offline', 'Install IKEMEN Creator Tools.cmd'), 'utf8');
assert(installer.includes('Lua-Language-Server.vsix'));
assert(installer.indexOf('Lua-Language-Server.vsix') < installer.indexOf('Installing IKEMEN Creator Tools'));

console.log('Lua redistribution, public-source provenance and integration tests passed');
