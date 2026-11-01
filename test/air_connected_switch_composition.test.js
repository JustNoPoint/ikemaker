'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

function panel() {
  const listeners = new Set(), disposals = [];
  return { active: true, visible: true, viewColumn: 3, reveal() {}, onDidChangeViewState() { return { dispose() {} }; }, onDidDispose(listener) { disposals.push(listener); return { dispose() {} }; }, dispose() { this.disposed = true; for (const listener of disposals) listener(); }, webview: { cspSource: 'test', html: '', options: {}, onDidReceiveMessage(listener) { listeners.add(listener); return { dispose() { listeners.delete(listener); } }; }, async postMessage() { return true; } } };
}

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-connected-air-'));
  const owner = path.join(root, 'Hero.def'), primaryAir = path.join(root, 'Hero.air'), primarySff = path.join(root, 'Hero.sff');
  const sharedDef = path.join(root, 'effects.def'), sharedAir = path.join(root, 'effects.air'), sharedSff = path.join(root, 'effects.sff');
  const secondDef = path.join(root, 'effects-other.def'), secondSff = path.join(root, 'effects-other.sff');
  const { blankSff } = require('../src/asset_templates');
  fs.writeFileSync(primaryAir, '[Begin Action 0]\n0,0,0,0,1\n'); fs.writeFileSync(sharedAir, '[Begin Action 7000]\n0,0,0,0,1\n');
  fs.writeFileSync(primarySff, blankSff('2.1')); fs.writeFileSync(sharedSff, blankSff('2.1')); fs.writeFileSync(secondSff, blankSff('2.1'));
  fs.writeFileSync(sharedDef, '[Info]\nprefix = HEROFX\n[Files]\nair = effects.air\nsff = effects.sff\n');
  fs.writeFileSync(secondDef, '[Info]\nprefix = HEROALT\n[Files]\nair = effects.air\nsff = effects-other.sff\n');
  fs.writeFileSync(owner, '[Info]\nname = Hero\n[Files]\nanim = Hero.air\nsprite = Hero.sff\nfx = effects.def\n');
  const originalBytes = new Map([owner, primaryAir, primarySff, sharedDef, sharedAir, sharedSff, secondDef, secondSff].map(filename => [filename, fs.readFileSync(filename)]));

  const documents = new Map(), created = [], warnings = [];
  const document = filename => { const exact = path.resolve(filename); if (!documents.has(exact)) documents.set(exact, { fileName: exact, isClosed: false, isDirty: false, version: 1, getText: () => fs.readFileSync(exact, 'utf8') }); return documents.get(exact); };
  let viewer, lastOpened, beforeConnectedOpen;
  const vscode = {
    Uri: { file: fsPath => ({ fsPath: path.resolve(fsPath) }) }, ViewColumn: { One: 1, Beside: 2 }, UIKind: { Web: 2 },
    env: { uiKind: 1, clipboard: { async writeText() {} } },
    workspace: { textDocuments: [], workspaceFolders: [], getConfiguration: () => ({ get: (_key, fallback) => fallback }), async openTextDocument(target) { const value = document(target.fsPath || target); if (!this.textDocuments.includes(value)) this.textDocuments.push(value); return value; } },
    window: { activeTextEditor: null, visibleTextEditors: [], tabGroups: { all: [], activeTabGroup: { viewColumn: 1 } }, createWebviewPanel() { const value = panel(); created.push(value); return value; }, showWarningMessage(message) { warnings.push(message); }, showInformationMessage() {}, showErrorMessage(message) { throw new Error(message); } },
    commands: { async executeCommand(command, ...args) { if (command === 'ikemen.textToolbar.suspendForVisualViewer') return false; if (command === 'air.openAnimationPreview') { if(beforeConnectedOpen)await beforeConnectedOpen();lastOpened = await viewer.openAirPreview(...args); return lastOpened; } return false; } }
  };

  const originalLoad = Module._load;
  Module._load = function patched(request, parent, isMain) {
    if (request === 'vscode') return vscode;
    if (request === './asset_workspace') return { decorate: (_panel, _filename, _kind, html) => html, beforeOpen: async () => true, multiple: () => true, clientScript: () => '' };
    if (request === './launch_controls') return { launchControlsHtml: () => '', launchControlsClientScript: () => '', handleLaunchMessage: async () => false };
    if (request === './character_view_policy') return { characterLabel: filename => path.basename(filename, '.air'), reusableViewColumn: () => 0, sourceColumnFor: () => 1, registerCharacterPanel: () => ({}), addCharacterPanelOwner: () => true, characterPanelOwners: (_panel, fallback) => fallback || [], rebindCharacterPanel: () => true };
    if (request === './viewer_group') return { preferredViewerColumn: value => value, restoredAssetColumn: () => 0, trackViewerPanel: value => value };
    if (request === './viewer_close') return { support() {} };
    if (request === './entity_switch_runtime') return { attachEntitySurface() {} };
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    viewer = require('../src/air_viewer');
    const { connectedAssetInventory } = require('../src/connected_asset_inventory');
    const inventory = connectedAssetInventory(primaryAir, [owner], 'air'), shared = inventory.find(item => path.resolve(item.filename) === path.resolve(sharedAir));
    assert(shared && shared.bindingKind === 'shared' && shared.sffPath === sharedSff && shared.available, 'real inventory retains the shared AIR definition and exact sprite archive');
    const primarySession = { airPath: primaryAir, ownerDefs: [owner], panel: { viewColumn: 3 } };
    assert.strictEqual(await viewer.openConnectedAir({ id: shared.id }, primarySession, vscode, () => false), true, 'the real connected selector opens a shared/Fx AIR');
    assert(lastOpened && lastOpened.airPath === sharedAir && lastOpened.sffPath === sharedSff, 'the real preview consumer accepts the revalidated shared binding and uses its matching SFF');
    const retainedState = viewer.clientModel(lastOpened, fs.readFileSync(sharedAir, 'utf8'));
    assert(retainedState.connectedAirBinding && retainedState.connectedAirBinding.targetId === shared.id, 'shared binding is retained in serialized viewer state');
    lastOpened.panel.dispose();
    const restoredPanel = panel(), restored = await viewer.deserializeAirPanel(restoredPanel, retainedState);
    assert(restored && restored.airPath === sharedAir && restored.sffPath === sharedSff && restored.connectedAirBinding.targetId === shared.id, 'serialized restoration revalidates and restores the exact shared AIR/SFF binding');
    restored.panel.dispose();

    fs.writeFileSync(sharedDef, '[Info]\nprefix = HEROFX\n[Files]\nair = changed.air\nsff = effects.sff\n');
    const changedPanel = panel(), warningCountBeforeChanged = warnings.length;
    assert.strictEqual(await viewer.deserializeAirPanel(changedPanel, retainedState), undefined);
    assert(changedPanel.disposed && warnings.length === warningCountBeforeChanged + 1 && /no longer assigns/i.test(warnings.at(-1)), 'changed shared definition fails serialized restoration once with actionable guidance');
    fs.writeFileSync(sharedDef, originalBytes.get(sharedDef));

    fs.rmSync(owner);
    const deletedOwnerPanel=panel(),warningCountBeforeDeletedOwner=warnings.length;
    assert.strictEqual(await viewer.deserializeAirPanel(deletedOwnerPanel,retainedState),undefined);
    assert(deletedOwnerPanel.disposed&&warnings.length===warningCountBeforeDeletedOwner+1&&/no longer assigns/i.test(warnings.at(-1)),'deleted owner fails serialized restoration with one owned warning instead of an ENOENT crash');
    fs.writeFileSync(owner,originalBytes.get(owner));

    const dirtyOwner = { ...document(owner), isDirty: true, getText: () => '[Info]\nname = Hero\n[Files]\nanim = Hero.air\nsprite = Hero.sff\n' };
    vscode.workspace.textDocuments.push(dirtyOwner);
    const beforeDirtyCreates = created.length;
    assert.strictEqual(await viewer.openConnectedAir({ id: shared.id }, primarySession, vscode, () => false), false, 'dirty owner assignment removal revokes the shared target at click time');
    assert.strictEqual(created.length, beforeDirtyCreates);
    vscode.workspace.textDocuments.splice(vscode.workspace.textDocuments.indexOf(dirtyOwner), 1);

    fs.rmSync(sharedSff);
    const missingSff = connectedAssetInventory(primaryAir, [owner], 'air').find(item => path.resolve(item.filename) === path.resolve(sharedAir));
    assert(missingSff && missingSff.available === false && /missing sprite archive/i.test(missingSff.reason));
    assert.strictEqual(await viewer.openConnectedAir({ id: missingSff.id }, primarySession, vscode, () => false), false, 'a shared AIR with a missing declared SFF cannot open an empty guessed canvas');
    const missingRestorePanel=panel();assert.strictEqual(await viewer.deserializeAirPanel(missingRestorePanel,retainedState),undefined);assert(missingRestorePanel.disposed,'serialized shared AIR restore also fails closed while its declared SFF is missing');
    fs.writeFileSync(sharedSff, originalBytes.get(sharedSff));

    const warningCountBeforeRace = warnings.length;
    beforeConnectedOpen = async () => fs.writeFileSync(sharedDef, '[Info]\nprefix = HEROFX\n[Files]\nair = changed.air\nsff = effects.sff\n');
    assert.strictEqual(await viewer.openConnectedAir({ id: shared.id }, primarySession, vscode, () => false), false);
    beforeConnectedOpen = null; fs.writeFileSync(sharedDef, originalBytes.get(sharedDef));
    assert.strictEqual(warnings.length, warningCountBeforeRace + 1, 'a click-to-open assignment race produces one owner-level warning rather than duplicate nested warnings');
    assert.match(warnings.at(-1), /current AIR viewer was left unchanged/i);

    const reverseInventory = connectedAssetInventory(sharedAir, [owner], 'air'), primary = reverseInventory.find(item => path.resolve(item.filename) === path.resolve(primaryAir));
    assert(primary && primary.bindingKind === 'primary');
    assert.strictEqual(await viewer.openConnectedAir({ id: primary.id }, { airPath: sharedAir, ownerDefs: [owner], panel: { viewColumn: 3 } }, vscode, () => false), true, 'shared-to-primary switching retains the same exact owner');

    fs.writeFileSync(owner, '[Info]\nname = Hero\n[Files]\nanim = Hero.air\nsprite = Hero.sff\nfx = effects.def, effects-other.def\n');
    const ambiguous = connectedAssetInventory(primaryAir, [owner], 'air').find(item => path.resolve(item.filename) === path.resolve(sharedAir));
    assert(ambiguous && ambiguous.available === false && ambiguous.ambiguous && /more than one sprite archive/i.test(ambiguous.reason), 'one AIR connected to different SFF files is explicitly unavailable');
    const beforeCreates = created.length;
    assert.strictEqual(await viewer.openConnectedAir({ id: ambiguous.id }, primarySession, vscode, () => false), false);
    assert.strictEqual(created.length, beforeCreates, 'ambiguous shared ownership never opens a guessed viewer');
    assert.match(warnings.at(-1), /more than one sprite archive/i);
    const ambiguousRestorePanel=panel();assert.strictEqual(await viewer.deserializeAirPanel(ambiguousRestorePanel,retainedState),undefined);assert(ambiguousRestorePanel.disposed,'serialized shared AIR restore fails closed after the owner becomes ambiguous');

    fs.writeFileSync(owner, originalBytes.get(owner));
    for (const [filename, bytes] of originalBytes) assert(fs.readFileSync(filename).equals(bytes), `${path.basename(filename)} remains byte-identical`);
    console.log('Real connected AIR inventory opens shared/Fx and primary AIR files with their exact SFF bindings, rejects ambiguous ownership, and writes nothing');
  } finally {
    Module._load = originalLoad;
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
