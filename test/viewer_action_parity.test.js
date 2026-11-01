'use strict';

const assert = require('assert');
const { normalizedAction, buildActionCatalog } = require('../src/viewer_action_registry');
const { actionAudit } = require('../tools/audit_viewer_contracts');

const audit = actionAudit();
assert(audit.counts.toolsEntries > 150, 'IKEMaker Tools audit must cover the complete tree');
assert(audit.counts.toolbarCommands > 100, 'toolbar audit must cover categorized commands');
assert.deepStrictEqual(audit.orphanToolbarCommands, [], 'toolbar commands must resolve to contributed, built-in, or explicitly supported external commands');
assert.deepStrictEqual(audit.orphanActionIds, [], 'quick icons must resolve to real canonical menu action IDs');
assert.deepStrictEqual(audit.unclassifiedSpecialistPlacementViolations, [], 'new specialist upper-strip actions must be classified before landing');
assert.deepStrictEqual(audit.plannedSpecialistPlacementViolations, [], 'specialist actions must never enter the fixed universal primary strip');
for (const id of ['snd.element.add', 'snd.element.delete', 'snd.element.replace', 'snd.element.export', 'snd.special.audio-play', 'snd.special.audio-loop', 'snd.special.audio-pause', 'snd.element.stop']) {
  assert(audit.bodySpecialistActionIds.includes(id), `${id} stays contained in the SND body quick-action row`);
}
for (const kind of ['command', 'shared-proxy', 'element', 'selector', 'special']) assert(audit.actionCatalog.some((item) => item.kind === kind), `canonical action catalog must include ${kind} actions`);
assert(audit.actionCatalog.some((item) => item.exposures.includes('quickSlot')), 'canonical action catalog must include quick-icon exposure');
assert(audit.parity.every((item) => ['covered', 'planned', 'excluded'].includes(item.status)), 'every visible Tools entry needs a parity classification');
assert(audit.parity.every((item) => item.status === 'covered' || item.reason), 'non-covered Tools entries require an explicit reason');
assert(audit.parity.some((item) => item.command === 'sff.openBrowser'), 'legacy SFF comparison browser must remain visible in the audit until reviewed retirement');
assert(!audit.parity.some((item) => item.command === 'air.openDockingWorkspaceExperimental'), 'legacy AIR Experimental alias stays registered but out of user-facing action parity');

assert.throws(() => normalizedAction({ id: 'x', owner: 'test', kind: 'unknown' }), /Unsupported/);
assert.throws(() => buildActionCatalog([
  { id: 'same', owner: 'one', dispatch: 'one', kind: 'command' },
  { id: 'same', owner: 'two', dispatch: 'two', kind: 'command' }
]), /Conflicting/);
const merged = buildActionCatalog([
  { id: 'same', owner: 'one', dispatch: 'one', kind: 'command', exposures: ['toolsTree'] },
  { id: 'same', owner: 'one', dispatch: 'one', kind: 'command', exposures: ['toolbarMenu', 'actionSearch'] }
]);
assert.deepStrictEqual(merged[0].exposures, ['actionSearch', 'toolbarMenu', 'toolsTree']);

console.log('Viewer action and IKEMaker Tools parity tests passed');
