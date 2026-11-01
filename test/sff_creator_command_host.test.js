'use strict';

const assert = require('assert');
const fs = require('fs');
const Module = require('module');

const original = Module._load;
Module._load = function (request, parent, main) {
  if (request === 'vscode') return { Uri: { file: fsPath => ({ fsPath, toString: () => `file:///${fsPath}` }), parse: value => ({ fsPath: value.replace(/^file:\/\/\//, '') }) }, ViewColumn: { Active: 1 }, workspace: { workspaceFolders: [], getConfiguration: () => ({ get: (_key, fallback) => fallback }) }, window: {} };
  return original.call(this, request, parent, main);
};
const creator = require('../src/sff_creator_workspace');
Module._load = original;
const { builtInFormatForHostMessage } = require('../src/sff_creator_builtin_lifecycle');

const page = creator.html({ draft: creator.defaultDraft(), plan: { rows: [], ready: [], conflicts: [], skipped: [], sprMake2Limitations: [], builtInLimitations: [] }, applyState: { enabled: false, reason: 'test' } });
assert(page.includes('id="buildV20"') && page.includes("beginBuild('buildBuiltInV20')"), 'command host exposes the explicit built-in v2.0 route');
assert(page.includes('id="buildV21"') && page.includes("beginBuild('buildBuiltInV21')"), 'command host exposes the explicit built-in v2.1 route');
assert(page.includes('id="buildSprMake2"') && page.includes("buildSprMake2.onclick=()=>beginBuild('build')"), 'SprMake2 remains a distinct route');
assert(page.includes('id="compareBoth"') && page.includes("type:'compareBoth'"), 'comparison remains a distinct non-adoption route');
assert(page.includes('id="apply"') && page.includes("type:'apply'"), 'package/text workflow remains present');
assert(!page.includes("beginBuild('buildBuiltInV1')") && !page.includes('IKEMaker v1 · Build'), 'no SFF v1 built-in route is exposed');
assert.strictEqual(builtInFormatForHostMessage('buildBuiltInV20'), 'sff-v2.0');
assert.strictEqual(builtInFormatForHostMessage('buildBuiltInV21'), 'sff-v2.1');
for (const message of ['build', 'buildCompared', 'compareBoth', 'apply', 'buildBuiltInV1', 'unknown']) assert.strictEqual(builtInFormatForHostMessage(message), null, `${message} must not fall through to a built-in route`);

const source = fs.readFileSync(require.resolve('../src/sff_creator_workspace'), 'utf8');
assert(page.includes('Build Two Test Candidates') && page.includes('IKEMaker v2.0 · Single Writer Test') && page.includes('TEST BUILD ONLY · No Adoption'), 'both explicit candidate-only controls explain their non-adoption boundary and writer count');
assert(page.includes('buildV21.disabled=base||sprBlocked||builtBlocked;buildV20.disabled=base||builtBlocked'), 'v2.1 requires both compatible writers while v2.0 remains a built-in-only test route');
assert(source.includes("message.type === 'buildBuiltInV20' || message.type === 'buildBuiltInV21'"), 'both explicit test-build messages enter one bounded host branch');
const branch = source.slice(source.indexOf("if (message.type === 'buildBuiltInV20'"), source.indexOf("if (message.type === 'buildCompared'"));
assert(branch.includes('createReviewedPackage') && branch.includes('createCreatorDualV21TestBuild') && branch.includes('createCreatorTestBuild') && branch.includes('The active SFF and reviewed draft were unchanged.'), 'the host re-stages, packages, routes v2.1 to a retained pair and v2.0 to one writer, and reports retained state');
assert(!branch.includes('startCreatorBuiltInAdoption') && !branch.includes('drafts.discard') && !branch.includes('pendingChanges.current().remove'), 'a test build cannot invoke lifecycle adoption or discard the draft');

console.log('sff_creator_command_host.test.js: all tests passed');
