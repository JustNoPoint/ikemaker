'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const vscode = { workspace: { textDocuments: [], getWorkspaceFolder: () => undefined }, Uri: { file: fsPath => ({ fsPath }) } };
const original = Module._load;
Module._load = function(request, parent, isMain) { return request === 'vscode' ? vscode : original.call(this, request, parent, isMain); };
const workspace = require('../src/command_movelist_workspace');
const { validateCommandInputSourceAuthority } = require('../src/command_input_reference_authority');
Module._load = original;

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-command-connections-'));
try {
  const defFile = path.join(root, 'Hero.def'), stateFile = path.join(root, 'state.zss'), commandFile = path.join(root, 'Hero.cmd');
  fs.writeFileSync(defFile, '[Files]\ncmd = Hero.cmd\nst = state.zss\n');
  fs.writeFileSync(commandFile, '[Command]\nname = "fireball"\ncommand = D, DF, F, x\n\n[State 0]\ntype = AssertCommand\nname = "fireball"\n');
  fs.writeFileSync(stateFile, 'State 200 {\n AssertCommand { name: "fireball"; }\n if Command = "fireball" {}\n AssertInput { flag: x; }\n}\n');
  const data = { files: { defFile, commandFile, movelistFile: '', movelists: [] }, commands: [{ name: 'fireball' }] };
  const nightlyCapabilities = { target: { channel: 'nightly' }, enabledCapabilities: ['command.nightly-expressions'] };
  const stableContradictory = { target: { channel: 'stable' }, enabledCapabilities: ['command.nightly-expressions'] };
  const ownerlessCapability = { enabledCapabilities: ['command.nightly-expressions'] };
  const nightlyWithoutCapability = { target: { channel: 'nightly' }, enabledCapabilities: [] };
  const legacyCapability = { target: { channel: 'nightly' }, enabledCapabilities: ['command.string-expressions'] };
  const exactPayload = workspace.payload(defFile, { capabilities: nightlyCapabilities });
  assert(exactPayload.nightlyCommandExpressionsEnabled && exactPayload.insertableInputs.some(item => item.value === '*D'), 'exact Nightly payload exposes verified broad-direction controls');
  assert(workspace.enhanceCommandHtml(workspace.html(exactPayload), undefined, { nightlyCommandExpressionsEnabled: exactPayload.nightlyCommandExpressionsEnabled }).includes('Nightly broad direction (*)'), 'exact Nightly UI renders the verified modifier');
  for (const [label, capabilities] of [['Stable plus capability', stableContradictory], ['ownerless capability', ownerlessCapability], ['Nightly without capability', nightlyWithoutCapability], ['legacy flag', legacyCapability]]) {
    const guarded = workspace.payload(defFile, { capabilities });
    assert.strictEqual(guarded.nightlyCommandExpressionsEnabled, false, `${label} remains hidden in the editor payload`);
    assert(!guarded.insertableInputs.some(item => item.value.startsWith('*')), `${label} cannot insert Nightly broad directions`);
    assert(!workspace.enhanceCommandHtml(workspace.html(guarded), undefined, { nightlyCommandExpressionsEnabled: guarded.nightlyCommandExpressionsEnabled }).includes('Nightly broad direction (*)'), `${label} does not render the Nightly modifier UI`);
  }
  const built = workspace.buildCommandConnections(data, 4, nightlyCapabilities, item => item.id.slice(0, 48));
  assert.strictEqual(built.snapshot.public.available, true);
  assert(built.snapshot.public.occurrences.some(item => item.relation === 'command-assert' && item.status === 'exact'));
  assert(built.snapshot.public.occurrences.some(item => item.relation === 'command-query' && item.status === 'exact'));
  assert(built.snapshot.public.occurrences.some(item => item.file === 'Hero.cmd' && item.relation === 'command-assert' && item.status === 'exact'), 'state controllers authored in the assigned CMD participate in the same connector index');
  const routed = built.snapshot.public.occurrences.find(item => item.route), authority = built.snapshot.authorities.get(routed.route);
  assert(validateCommandInputSourceAuthority(authority, built.context), 'the exact unchanged assigned source revalidates');
  fs.appendFileSync(defFile, '\n; ownership changed\n');
  for (const [label, capabilities, expected] of [
    ['stable target', stableContradictory, false],
    ['legacy string flag', legacyCapability, false],
    ['ownerless capability', ownerlessCapability, false],
    ['nightly without capability', nightlyWithoutCapability, false],
    ['exact Nightly capability', nightlyCapabilities, true]
  ]) assert.strictEqual(workspace.commandConnectionContext(data, 4, capabilities).nightly, expected, label);
  const reassigned = workspace.commandConnectionContext(data, 4, nightlyCapabilities);
  assert.strictEqual(validateCommandInputSourceAuthority(authority, reassigned), null, 'a changed DEF ownership fingerprint invalidates the exact route even when the source span is unchanged');
  fs.appendFileSync(authority.sourcePath, '\n; changed\n');
  const changed = workspace.commandConnectionContext(data, 4, nightlyCapabilities);
  assert.strictEqual(validateCommandInputSourceAuthority(authority, changed), null, 'a changed assigned source invalidates the exact route');
  const page = workspace.enhanceCommandHtml(workspace.html({ ...data, defaults: {}, movelistText: '', initialCommandIndex: 0, knownTimings: [], presets: [], insertableInputs: [], sequenceRecipes: [], glyphCatalog: { state: 'unresolved', entries: [], tokens: [] }, connections: built.snapshot.public }));
  for (const id of ['connectionsTab','connectionsWorkspace','connectionScope','connectionRelation','connectionStatus','connectionFilter','refreshConnections','connectionList','openGlyphMapping','openGlyphArchive']) assert(page.includes(`id="${id}"`));
  assert(page.includes('.glyph-source-actions{display:flex;flex-wrap:wrap'), 'glyph source actions wrap instead of forcing a narrow browser wider');
  assert(page.includes('@media(max-width:560px)') && page.includes('.glyph-source-actions{display:grid;grid-template-columns:1fr}'), 'glyph source actions stack vertically in narrow docked browsers');
  assert(page.includes('Command / SelfCommand'));
  const commandSlot = workspace.commandMovelistToolbarModel({ ...data, selectedSourceReference: { kind: 'command' } }).slots.find(slot => slot.id === 'commands');
  assert.strictEqual(commandSlot.enabled, true);
  assert.strictEqual(commandSlot.dispatch, 'internal:commands');
  assert(workspace.commandConnectionsClientBridge().includes('toolbarShowConnections'));
  const navigationSelection = { tab: 'command', file: commandFile, command: { name: 'fireball', command: 'D, DF, F, x', time: 15, steptime: -1, autogreater: 1, bufferTime: 1, bufferHitpause: 1, bufferPauseend: 1, bufferShared: 1 }, view: 'connections', connectionFilters: { scope: 'all', relation: 'command-query', status: 'exact', query: 'fire' }, connectionScrollTop: 80 };
  assert.strictEqual(workspace.validLegacyNavigationSelection(navigationSelection), true, 'shared viewer history accepts a bounded compact connections-view selection');
  assert.strictEqual(workspace.validLegacyNavigationSelection({ ...navigationSelection, connectionFilters: { ...navigationSelection.connectionFilters, query: 'x'.repeat(257) } }), false, 'oversized restored filters fail closed');
  assert(page.includes("navigationSelection:globalThis.ikemenNavigationSelection?.()"), 'exact opens carry the compact connections view into shared viewer history');
  console.log('Command/input compact connector workspace tests passed');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
