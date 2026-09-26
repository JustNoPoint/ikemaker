'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const runtime = require('../src/test_session_runtime');

const text = runtime.runtimeLua({ id: 'sample', kind: 'test', profile: 'sf6', character: 'chars/Ryu/Ryu.def', stage: 'stages/stage0.def', createdAt: 'now', tests: [{ id: 'hit', name: 'Hit', instruction: "Hit P2's guard", evidenceMask: 3, suiteName: 'Base' }], diagnostics: [{ id: 'debug-next', name: 'Debug', function: 'toggleDebugDisplay', help: 'Cycle.' }] });
assert.ok(text.includes("os.remove(bootstrapPath)"));
assert.ok(text.includes("containsMask(state.lastMask, mask)"));
assert.ok(text.includes("pcall(toggleDebugDisplay, nil, false)"));
assert.ok(text.includes("F10 Pass"));
assert.ok(!text.includes('JNP_training_hit_class_override'));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-session-'));
const installed = runtime.installSession(root, { id: 'sample', kind: 'test', profile: 'sf6', character: 'chars/Ryu/Ryu.def', stage: 'stages/stage0.def', createdAt: 'now', tests: [], diagnostics: [] });
assert.ok(fs.existsSync(installed.modulePath));
assert.ok(fs.existsSync(installed.recordPath));
assert.ok(fs.existsSync(path.join(root, 'save', 'logs')));
runtime.removeBootstrap(root);
assert.ok(!fs.existsSync(installed.modulePath));
fs.rmSync(root, { recursive: true, force: true });
console.log('test_session_runtime tests passed');
