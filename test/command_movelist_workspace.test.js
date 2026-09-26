'use strict';

const assert = require('assert');
const Module = require('module');
const original = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'vscode') return {};
  return original.call(this, request, parent, isMain);
};
const workspace = require('../src/command_movelist_workspace');
const { workspaceExperience } = require('../src/experience_model');
Module._load = original;

const data = {
  files: { defFile: 'Ryu.def', commandFile: 'Ryu.cmd', movelistFile: 'Ryu.dat', movelists: [] },
  defaults: { time: 15, stepTime: -1, autoGreater: 1, bufferTime: 1, bufferHitpause: 1, bufferPauseend: 1, bufferShared: 1 },
  commands: [
    { name: 'x', command: 'x', time: 1, stepTime: 1, diagnostics: [] },
    { name: 'fireball', command: 'D, DF, F, x', time: 15, stepTime: 10, diagnostics: [] }
  ],
  movelistText: '', knownTimings: []
};
const output = workspace.enhanceCommandHtml(workspace.html(data));
assert(output.includes('Gameplay motions and sequences'));
assert(output.includes('Basic / raw inputs'));
assert(output.includes('hiddenCommands'));
assert(output.includes('commandSearch'));
const script = output.match(/<script>([\s\S]*)<\/script>/)[1];
assert.doesNotThrow(() => new Function(script));
assert(output.includes('Commands · Learning'));
assert(output.includes('<details open><summary><b>What am I editing?</b>'));
assert(output.includes('details class="task-recipes" open'));
assert(output.includes('Build the sequence step by step'));
assert(output.includes('class="guided-workflow"'));
assert(output.includes('[Next] Locate the character command and movelist files'));
assert(output.includes('data-workflow-action="anchor:timeline"'));
assert(output.includes("closest('[data-workflow-action]')"));
assert(!output.includes('Advanced shortcuts'));
const advanced = workspace.enhanceCommandHtml(workspace.html(data), workspaceExperience('commands', 'advanced'));
assert(advanced.includes('Commands · Advanced'));
assert(!advanced.includes('<details open><summary><b>What am I editing?</b>'));
assert(advanced.includes('details class="task-recipes"'));
assert(!advanced.includes('details class="task-recipes" open'));
assert(advanced.includes('class="guided-workflow"'));
assert(advanced.includes('Advanced shortcuts'));
assert(advanced.includes('data-workflow-action="control:applyCommand"'));

console.log('Command workspace organization tests passed');

// Source targets must follow the visible editor, even when both files exist.
const sourceData={files:{defFile:'owner.def',commandFile:'input.cmd',movelistFile:'moves.dat'},commands:[{startLine:4},{startLine:19}]};
assert.deepStrictEqual(workspace.sourceTarget(sourceData,{type:'openSource',tab:'command',index:1}),{filename:'input.cmd',line:19});
assert.deepStrictEqual(workspace.sourceTarget(sourceData,{type:'openSource',tab:'movelist',index:1}),{filename:'moves.dat',line:0});
assert.deepStrictEqual(workspace.sourceTarget(sourceData,{type:'openDef',tab:'movelist'}),{filename:'owner.def',line:0});
assert.equal(workspace.sourceTarget({...sourceData,files:{commandFile:'input.cmd'}},{type:'openSource',tab:'movelist'}).filename,undefined,'missing movelist must not open unrelated command source');
assert.equal(workspace.sourceTarget(sourceData,{type:'openSource',tab:'command',index:99}).line,0,'new command has no existing section');
const vm=require('vm'),sent=[];
const sourceHandler=script.match(/byId\('openSource'\)\.onclick=([^;]+);/)[1];
const client={ikemenNavigationSelection:()=>({tab:'movelist',file:'moves.dat'}),activeTab:'movelist',selected:1,vscode:{postMessage:m=>sent.push(m)}};
vm.runInNewContext('('+sourceHandler+')()',client);
assert.equal(sent[0].tab,'movelist');assert.equal(sent[0].index,1);

assert.equal(sent[0].navigationSelection.file,'moves.dat','native source button carries the current history selection');
