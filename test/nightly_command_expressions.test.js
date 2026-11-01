'use strict';

const assert = require('assert');
const model = require('../src/command_movelist_model');

const stable = { target: { channel: 'stable' }, enabledCapabilities: [] };
const nightly = { target: { channel: 'nightly' }, enabledCapabilities: ['command.nightly-expressions'] };
const contradictoryStable = { target: { channel: 'stable' }, enabledCapabilities: ['command.nightly-expressions'] };
const ownerless = { enabledCapabilities: ['command.nightly-expressions'] };
const nightlyWithoutCapability = { target: { channel: 'nightly' }, enabledCapabilities: [] };
const legacyFlag = { target: { channel: 'nightly' }, enabledCapabilities: ['command.string-expressions'] };
const source = '[Command]\nname = "broad_down"\ncommand = *D, *F, x\n';
const command = model.parseCommands(source, 'nightly.cmd').commands[0];

assert.deepStrictEqual(model.nativeInputAtoms('*D|*F'), ['*D', '*F'], 'the native parser preserves the verified star prefix as command syntax');
assert(command.steps[0].broadDirectionModifier, 'the command model exposes the broad-direction modifier for review');
assert(model.diagnosticsFor(command, [command], { capabilities: stable }).some((issue) => issue.code === 'unsupported-broad-direction' && issue.severity === 'error'), 'IKEMEN GO 1.0 gets an explicit unsupported-target error');
assert(!model.diagnosticsFor(command, [command], { capabilities: nightly }).some((issue) => issue.code === 'unsupported-broad-direction'), 'the exact supporting Nightly does not get a false unsupported error');
assert(model.diagnosticsFor(command, [command], { capabilities: nightly }).some((issue) => issue.code === 'nightly-broad-direction'), 'the supporting Nightly explains the verified non-retrigger semantics');
assert.deepStrictEqual(model.commandDocumentTargetDiagnostics(source, { capabilities: stable }, 'nightly.cmd').map((issue) => [issue.code, issue.line, issue.length]), [['unsupported-broad-direction', 2, 1]], 'native CMD diagnostics attach the stable-target error to the exact command assignment line');
assert.deepStrictEqual(model.commandDocumentTargetDiagnostics(source, { capabilities: nightly }, 'nightly.cmd'), [], 'the exact supporting Nightly clears the native-editor target error');
assert(!model.insertableInputs(stable).some((item) => item.value.startsWith('*')), 'stable projects cannot insert Nightly star inputs from the visual workspace');
assert.deepStrictEqual(model.insertableInputs(nightly).filter((item) => item.value.startsWith('*')).map((item) => item.value), ['*D', '*U', '*B', '*F'], 'the exact Nightly exposes a bounded set of broad cardinal inputs');
for (const [label, capabilities] of [['Stable plus capability', contradictoryStable], ['ownerless capability', ownerless], ['Nightly without capability', nightlyWithoutCapability], ['legacy flag', legacyFlag]]) {
  assert.strictEqual(model.nightlyCommandExpressionsEnabled(capabilities), false, `${label} cannot expose Nightly command expressions`);
  assert(!model.insertableInputs(capabilities).some(item => item.value.startsWith('*')), `${label} cannot expose Nightly insertion controls`);
  assert(model.diagnosticsFor(command, [command], { capabilities }).some(issue => issue.code === 'unsupported-broad-direction'), `${label} retains the exact target diagnostic`);
}
assert.strictEqual(model.editNativeStepModifier('~12$F+x', 'broadDirection', 'apply'), '~12*F+x', 'applying the Nightly modifier replaces the mutually exclusive legacy direction marker only on directions');
assert.strictEqual(model.editNativeStepModifier('~12*F+x', 'broadDirection', 'remove'), '~12F+x', 'removing the Nightly modifier preserves unrelated modifiers and buttons');
const conflicting = model.parseCommands('[Command]\nname="bad"\ncommand=$*D, **F\n').commands[0];
const issues = model.diagnosticsFor(conflicting, [conflicting], { capabilities: nightly });
assert(issues.some((issue) => issue.code === 'conflicting-direction-modifiers'), 'mutually exclusive $ and * prefixes are rejected');
assert(issues.some((issue) => issue.code === 'duplicate-broad-direction'), 'duplicate star prefixes are rejected');
assert.deepStrictEqual(model.commandDocumentTargetDiagnostics('[Command]\nname="bad"\ncommand=$*D, **F\n', { capabilities: nightly }, 'bad.cmd').map((issue) => issue.code).sort(), ['conflicting-direction-modifiers', 'duplicate-broad-direction'], 'native CMD diagnostics retain structural star-prefix errors even on the supporting Nightly');

console.log('Nightly command expressions remain exact-target gated and visually editable');
