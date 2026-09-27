'use strict';

const assert = require('assert');
const vm = require('vm');
const Module = require('module');
const original = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'vscode') return { ViewColumn: { Active: 1 }, window: {}, workspace: {}, languages: {} };
  return original.call(this, request, parent, isMain);
};
const { page } = require('../src/move_lab_workspace');
Module._load = original;

const html = page({ defPath:'Hero.def', context: { project: 'Game', character: 'Hero', defPath: 'Hero.def' }, files: [], sources: [], diagnostics: [], totals: { states: 0, controllers: 0, functions: 0, diagnostics: 0 }, attacks: { controllers: [{ id: 'attack-1', filename:'states.zss', index:0, sourceHash:'attack-hash', label: 'State 200 · HitDef 1', detail: 'damage 30', fileLabel: 'states.zss', line: 2 }], constantProfiles: [{ id: 'normal.slp', prefix: 'normal.sLP', moveID: 200, linkedControllerIds: ['attack-1'], sourceFilename: 'constants.zss', sourceHash: 'hash' }] } });
assert(html.includes('<b>Move Lab</b>'));
assert(html.includes('ikemenNavigationSelection'));
assert(html.includes('ikemenCanRestoreNavigation'));
assert(html.includes('ikemenPresetCapture'));
assert(html.includes('Attack / HitDef'));
assert(html.includes('Detected attack controllers'));
assert(html.includes('Constants integration'));
assert(html.includes('not a required coding style'));
assert(html.includes('data-profile'));
assert(html.includes('returnToConstants'));
assert(html.includes('data-attack'));
assert(html.includes("post('openAttack',{reference:"));
assert(html.includes('overviewReference'));
assert(html.includes('Throw Creator'));
assert(html.includes('Live diagnostics'));
assert(html.includes('Ctrl+Alt+F5'));
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(script);
console.log('Move Lab HTML tests passed');
