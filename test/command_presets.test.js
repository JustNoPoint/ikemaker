'use strict';

const assert = require('assert');
const { PRESETS, presetText, findPreset } = require('../src/command_presets');
const { parseCommands } = require('../src/command_movelist_model');

for (const id of ['qcf-held-down', 'qcb-held-down', 'dp-held-forward', 'rdp-held-back', 'charge-capcom-bf', 'charge-down-up', 'hcf-optional-refresh', 'circle-optional-refresh', 'held-start-deadline']) assert.ok(findPreset(id), `missing ${id}`);
const qcf = findPreset('qcf-held-down'), parsed = parseCommands(presetText(qcf));
assert.strictEqual(parsed.commands.length, 2);
assert.deepStrictEqual(parsed.commands.map((item) => item.name), ['qcf_x', 'qcf_x']);
assert.deepStrictEqual(parsed.commands.map((item) => item.declaredStepTime), [10, 5]);
assert.ok(parsed.commands[1].command.startsWith('~D'));
assert.ok(presetText(findPreset('hcf-optional-refresh')).includes('JNP_motion_hcf_step'));
assert.ok(presetText(findPreset('circle-optional-refresh')).includes('JNP_motion_circle_cw_'));
assert.ok(PRESETS.every((preset) => preset.explanation));

console.log('HDBZ/native command preset tests passed');
