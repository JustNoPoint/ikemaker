'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const triggers = require('../data/triggers.json');
const { hoverModel } = require('../src/language_intelligence');
const { pickerItems } = require('../src/trigger_expression_picker');

const debugMode = triggers.find(entry => entry.name === 'DebugMode');
assert(debugMode, 'DebugMode must remain in the trigger catalog');
assert.strictEqual(debugMode.kind, 'trigger', 'DebugMode must remain classified as a trigger');
assert.match(debugMode.arguments, /\broundreset\b/i, 'trigger help must list the engine-accepted roundreset argument');
assert.doesNotMatch(debugMode.arguments, /roundrestarted/i, 'trigger help must not list the rejected upstream spelling');
assert.match(debugMode.description, /not be used as reliable gameplay logic/i, 'trigger help must preserve the debug-only gameplay warning');

const hover = hoverModel({ word: 'DebugMode', text: 'trigger1 = DebugMode(roundreset)', line: 0, languageId: 'cns', experience: 'learning', triggers });
assert(hover && /roundreset/i.test(hover.summary + ' ' + hover.explanation), 'hover must surface the corrected accepted argument');
assert.match(hover.summary, /does not accept[^.]*roundrestarted|roundrestarted[^.]*not accepted/i, 'hover may name the upstream spelling only as rejected');
const picker = pickerItems(triggers).find(item => item.label === 'DebugMode');
assert(picker && /roundreset/i.test(picker.detail), 'trigger insertion review must surface the corrected accepted argument');
assert.strictEqual(picker.entry.kind, 'trigger');

for (const relative of [
  'data/offline-docs/reference/wiki-source/Triggers-(new).md',
  'data/offline-docs/reference/wiki/Triggers-(new).html',
  'data/offline-docs/reference/merged/triggers.html'
]) {
  const source = fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
  assert.match(source, /\broundreset\b/i, `${relative} must contain the source-correct argument`);
  assert(/roundrestarted/i.test(source) && /not accepted/i.test(source), `${relative} must explain the upstream mismatch rather than silently erase its history`);
}

const evidence = fs.readFileSync(path.join(__dirname, '../data/DebugMode-RoundReset-Source-Correction.md'), 'utf8');
for (const revision of ['81c6da71d689625e20db79586815b695da00dd6d', 'ee4791bcd5e2f4bcb16ef9d584e001fb4a7eedfc']) assert(evidence.includes(revision), `missing pinned engine evidence ${revision}`);
assert.match(evidence, /OC_ex2_debugmode_roundreset/, 'evidence must record the compiler opcode emitted for roundreset');
assert.match(evidence, /sys\.roundResetFlg/, 'evidence must record the runtime state read by the opcode');
assert.match(evidence, /No dedicated DebugMode argument-value completion or validator existed/i);

console.log('DebugMode roundreset source correction tests passed');
