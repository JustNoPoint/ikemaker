'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'sff_creator_workspace.js'), 'utf8');

for (const token of [
  'Start Reviewed IKEMaker Update…',
  'Continue Review / Recovery…',
  'Detach Draft Lock (Keep Recovery Record)…',
  "beginBuild('startProductionBuiltIn')",
  "beginBuild('continueProductionBuiltIn')",
  "type:'detachProductionLifecycle'",
  "message?.type === 'startProductionBuiltIn'",
  "message?.type === 'continueProductionBuiltIn'",
  "message?.type === 'detachProductionLifecycle'",
  'productionLifecycleStarter.startCreatorBuiltInAdoption',
  'productionLifecycle.continueOperation',
  'captureTarget(fs, staged.draft.target.path)',
  'lifecycleContinuations.resume',
  'expectedRetainedDraftRevision: retained.draftRevision',
  'Detach is available only after exact draft drift is detected.',
  'Only then was its Creator draft discarded.'
]) assert(source.includes(token), `production Creator wiring is missing ${token}`);

assert(source.includes("['2.0','2.1'].includes"), 'production control must be gated to existing v2.0/v2.1 targets');
assert(source.includes('if (!staged.draft.target?.path || !route)'), 'host must independently reject unsupported/new targets');
assert(!source.includes("if (continuation.status === 'completed-draft-cleared')"), 'workspace reopen must never auto-clear a draft');

for (const legacy of [
  'Create 2 Test SFFs…',
  'IKEMaker v2.0 · Single Writer Test…',
  'SprMake2 Only · Build & Apply…',
  "message.type === 'buildBuiltInV20' || message.type === 'buildBuiltInV21'",
  "message.type === 'buildCompared'",
  "message.type === 'build'"
]) assert(source.includes(legacy), `legacy SprMake2/TEST BUILD route drifted: ${legacy}`);

assert.equal((source.match(/createWebviewPanel\('ikemenSffCreator'/g) || []).length, 1, 'production lifecycle must use the existing single Creator panel');

console.log('SFF Creator production workspace wiring exposes explicit v2.0/v2.1 start/continue/detach routes, preserves legacy routes, and never auto-clears on reopen');
