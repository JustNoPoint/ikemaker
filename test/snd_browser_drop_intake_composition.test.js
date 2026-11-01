'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const vm = require('vm');

function wav(sample = 1) {
  const out = Buffer.alloc(46);
  out.write('RIFF'); out.writeUInt32LE(38, 4); out.write('WAVEfmt ', 8);
  out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22);
  out.writeUInt32LE(8000, 24); out.writeUInt32LE(16000, 28); out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34);
  out.write('data', 36); out.writeUInt32LE(2, 40); out.writeInt16LE(sample, 44);
  return out;
}

function snd(group, index) {
  const data = wav(), header = Buffer.alloc(24), chunk = Buffer.alloc(16 + data.length);
  header.write('ElecbyteSnd\0', 0, 'binary'); header.writeUInt16LE(1, 12); header.writeUInt32LE(1, 16); header.writeUInt32LE(24, 20);
  chunk.writeUInt32LE(0, 0); chunk.writeUInt32LE(data.length, 4); chunk.writeInt32LE(group, 8); chunk.writeInt32LE(index, 12); data.copy(chunk, 16);
  return Buffer.concat([header, chunk]);
}

function makePanel() {
  const messages = [], listeners = new Set(), disposals = [];
  return {
    active: true, viewColumn: 2, viewerReady: false, messages,
    reveal() {}, onDidChangeViewState() { return { dispose() {} }; },
    onDidDispose(listener) { disposals.push(listener); return { dispose() {} }; },
    dispose() { for (const listener of disposals) listener(); },
    webview: {
      cspSource: 'test', html: '', options: {},
      onDidReceiveMessage(listener) { listeners.add(listener); return { dispose() { listeners.delete(listener); } }; },
      async postMessage(message) { messages.push(message); return true; }
    },
    async receive(message) { return Promise.all([...listeners].map(listener => listener(message))); }
  };
}

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-snd-drop-composition-'));
  const sndPath = path.join(root, 'Hero.snd'), manifestPath = path.join(root, '.ikemen-tools', 'sound-build', 'Hero', 'build.txt');
  const firstWav = path.join(root, 'first.wav'), secondWav = path.join(root, 'second.wav');
  const originalSnd = snd(200, 3);
  fs.writeFileSync(sndPath, originalSnd);
  fs.writeFileSync(firstWav, wav(11)); fs.writeFileSync(secondWav, wav(22));

  const destinationDefaults = [], information = [];
  const vscode = {
    UIKind: { Web: 2 }, ProgressLocation: { Notification: 15 },
    env: { uiKind: 1, clipboard: { async writeText() {} } },
    Uri: { file: fsPath => ({ fsPath }) }, ViewColumn: { One: 1, Beside: 2 },
    workspace: { textDocuments: [], workspaceFolders: [], getConfiguration: () => ({ get: (_key, fallback) => fallback, async update() {} }), async openTextDocument() { return {}; } },
    window: {
      async showQuickPick(items) { return items.find(item => item.kind === 'choose') || items[0]; },
      async showOpenDialog(options) { return /manifest/i.test(options.title || '') ? [{ fsPath: manifestPath }] : undefined; },
      async showInputBox(options) { destinationDefaults.push(options.value); return options.value; },
      async showWarningMessage() { return undefined; },
      async showInformationMessage(message) { information.push(message); },
      showErrorMessage(message) { throw new Error(message); },
      async showSaveDialog() { return undefined; }, async showTextDocument() { return {}; },
      async withProgress(_options, task) { return task({ report() {} }, { isCancellationRequested: false }); }
    },
    commands: { async executeCommand() { return false; } }
  };

  const originalLoad = Module._load;
  let realIntake;
  Module._load = function patched(request, parent, isMain) {
    if (request === 'vscode') return vscode;
    if (request === './snd_intake_workspace' && /snd_viewer\.js$/.test(parent?.filename || '') && realIntake) return { open: options => realIntake.open(options, vscode) };
    if (request === './snd_browser' && /snd_viewer\.js$/.test(parent?.filename || '')) return { updateHistoryState() { return true; } };
    if (request === './asset_workspace') return { decorate: (_panel, _filename, _kind, html) => html, beforeOpen: async () => true, clientScript: () => '' };
    if (request === './launch_controls') return { launchControlsHtml: () => '', launchControlsClientScript: () => '', handleLaunchMessage: async () => false };
    if (request === './character_view_policy') return { characterLabel: filename => path.basename(filename, '.snd'), reusableViewColumn: (_items, fallback) => fallback, registerCharacterPanel: () => ({}), rebindCharacterPanel: () => true, addCharacterPanelOwner: () => true, characterPanelOwners: () => [] };
    if (request === './viewer_group') return { preferredViewerColumn: value => value, trackViewerPanel: value => value };
    if (request === './viewer_navigation') return { associatedDefs: () => [] };
    if (request === './authoring_context_registry') return { registerAuthoringPanel() {}, isClosingFile: () => false, isClosingOwner: () => false };
    if (request === './entity_switch_runtime') return { attachEntitySurface() {} };
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    realIntake = require('../src/snd_intake_workspace');
    const viewer = require('../src/snd_viewer'), browser = require('../src/snd_browser'), { readSnd } = require('../src/snd_reader');
    const viewerPanel = makePanel(), browserPanel = makePanel();
    const owner = await viewer.populate(viewerPanel, sndPath, { standalone: true });
    assert(owner, 'the authoritative SND Viewer opens before browser forwarding');
    await browser.attach(browserPanel, sndPath, readSnd(sndPath));
    const clientLine = fs.readFileSync(require.resolve('../src/snd_viewer'), 'utf8').split(/\r?\n/).find(line => line.includes("m.type==='forwardedDesktopDrop'"));
    assert(clientLine, 'the production forwarded-drop client bridge remains executable');
    let clientHandler, selected = { archiveIndex: 0 }, clientPosts = [];
    const client = { window: { addEventListener(_type, handler) { clientHandler = handler; } }, model: { generation: owner.generation, sourceFingerprint: owner.sourceFingerprint }, selected, vscode: { postMessage(message) { clientPosts.push(message); } }, connectedAirs: [], connectedAirPending: '', renderConnectedAirs() {}, saveAirView() {}, Array, Object };
    vm.runInNewContext(clientLine, client, { filename: 'snd-forwarded-drop-client.js' });
    const bridge = (message, selection) => { client.selected = selection; clientPosts = []; client.vscode.postMessage = value => clientPosts.push(value); clientHandler({ data: message }); assert.strictEqual(clientPosts.length, 1, 'the production client emits one intake request'); return clientPosts[0]; };

    await browserPanel.receive({ type: 'forwardDesktopDrop', paths: [firstWav] });
    assert.deepStrictEqual(viewerPanel.pendingDesktopDrop, [firstWav], 'a browser drop waits for the existing viewer readiness handshake');
    await viewerPanel.receive({ type: 'viewerNavigationReady' });
    const forwarded = viewerPanel.messages.find(message => message.type === 'forwardedDesktopDrop');
    assert(forwarded && forwarded.paths[0] === firstWav, 'viewer readiness forwards the preserved browser drop to the client');
    await viewerPanel.receive(bridge(forwarded, { archiveIndex: 0 }));
    assert.strictEqual(destinationDefaults[0], '200,4', 'a selected sound seeds the same group and next index');
    assert.deepStrictEqual(require('../src/sound_build').read(manifestPath).entries.map(entry => [entry.group, entry.index]), [[200, 3], [200, 4]], 'the automatic private workspace preserves the current SND and adds the reviewed intake');
    const afterFirstBuild=fs.readFileSync(sndPath);assert(!afterFirstBuild.equals(originalSnd), 'accepted intake directly rebuilds the current SND');
    assert.deepStrictEqual(readSnd(sndPath).entries.map(entry=>[entry.group,entry.index]),[[200,3],[200,4]],'the refreshed current SND contains the original and added sound');

    const beforeCancelManifest = fs.readFileSync(manifestPath);
    await browserPanel.receive({ type: 'forwardDesktopDrop', paths: [secondWav] });
    const immediate = viewerPanel.messages.filter(message => message.type === 'forwardedDesktopDrop').at(-1);
    await viewerPanel.receive(bridge(immediate, null));
    assert.strictEqual(destinationDefaults[1], '0,0', 'no selected sound seeds the documented 0,0 default');
    assert(!fs.readFileSync(manifestPath).equals(beforeCancelManifest), 'the second accepted intake updates the private manifest without a redundant final popup');
    assert.deepStrictEqual(readSnd(sndPath).entries.map(entry=>[entry.group,entry.index]),[[200,3],[200,4],[0,0]],'the second direct build refreshes the same current SND');
    console.log('SND browser drop composes through viewer readiness into direct current-SND builds with selected and empty defaults');
  } finally {
    Module._load = originalLoad;
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
