'use strict';

const assert = require('assert');
const Module = require('module');

const original = Module._load;
Module._load = function patched(request, parent, main) {
  if (request === 'vscode') return {};
  return original.call(this, request, parent, main);
};
const { FILE_TYPES, quoteCommand, normalizeCustomExtension, registryPlan, removePlan } = require('../src/windows_file_associations');
Module._load = original;

assert(FILE_TYPES.some((type) => type.extension === '.sff' && type.recommended));
assert(FILE_TYPES.some((type) => type.extension === '.snd' && type.shared));
assert(FILE_TYPES.some((type) => type.extension === '.inp' && type.recommended));
assert(FILE_TYPES.some((type) => type.extension === '.cmd' && type.dangerous));
assert.strictEqual(quoteCommand('C:\\VS Code\\Code.exe'), '"C:\\VS Code\\Code.exe" --reuse-window "%1"');

const plan = registryPlan('C:\\VS Code\\Code.exe', ['.zss', '.snd', '.cmd', '.unknown', '.zss']);
assert.deepStrictEqual(plan.selected, ['.zss', '.snd', '.cmd']);
assert.deepStrictEqual(plan.defaultCapable, ['.zss', '.snd']);
assert(plan.commands.some((args) => args.includes('.zss') && args.includes('IKEMaker.File')));
assert(plan.commands.some((args) => args.join(' ').includes('SystemFileAssociations\\.cmd\\shell\\IKEMaker')));
assert(!plan.commands.some((args) => args.join(' ').includes('Capabilities\\FileAssociations') && args.includes('.cmd')));
assert(removePlan().some((args) => args.join(' ').includes('SystemFileAssociations\\.cmd\\shell\\IKEMaker')));
assert.strictEqual(normalizeCustomExtension('mfg'), '.mfg');
assert.strictEqual(normalizeCustomExtension('.HDBZ'), '.hdbz');
assert.strictEqual(normalizeCustomExtension('!bad'), '');
assert(registryPlan('C:\\VS Code\\Code.exe', ['.mfg'], { allowCustom: true }).selected.includes('.mfg'));
assert(removePlan(['.mfg']).some((args) => args.join(' ').includes('SystemFileAssociations\\.mfg\\shell\\IKEMaker')));

console.log('Windows file-association tests passed');
