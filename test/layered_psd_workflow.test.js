'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-layered-workflow-'));
  const psdPath = path.join(root, 'layers.psd'), sffPath = path.join(root, 'target.sff'), ownerFile = path.join(root, 'stage.def');
  fs.writeFileSync(psdPath, 'psd'); fs.writeFileSync(sffPath, 'sff'); fs.writeFileSync(ownerFile, '[Info]\nname = Layered Test\n');
  const records = [{ index: 0, width: 320, height: 240, name: 'Composite' }, { index: 1, width: 320, height: 240, name: 'Back', visible: true, opacity: 1, compose: 'over' }, { index: 2, width: 320, height: 240, name: 'Front', visible: true, opacity: 1, compose: 'over' }];
  let openResult, quickResult, inputResults = [], receiver, outputDirectory;
  const panels = [], posts = [], commands = [];
  const panel = () => { let dispose; const value = { webview: { cspSource: 'test', html: '', postMessage(message) { posts.push(JSON.parse(JSON.stringify(message))); return true; }, onDidReceiveMessage(callback) { receiver = callback; return { dispose() {} }; } }, onDidDispose(callback) { dispose = callback; return { dispose() {} }; }, dispose() { dispose?.(); } }; panels.push(value); return value; };
  const vscode = {
    ViewColumn: { Active: 1 }, Uri: { file: fsPath => ({ fsPath, scheme: 'file' }) },
    window: {
      async showOpenDialog() { return openResult; }, async showQuickPick() { return quickResult; }, async showInputBox() { return inputResults.shift(); },
      createWebviewPanel() { return panel(); }, async showWarningMessage() { return 'Append Reviewed Source'; }
    },
    commands: { async executeCommand(...args) { commands.push(args); } }, env: { clipboard: { async writeText() {} } },
    workspace: { textDocuments: [], getConfiguration() { return { get(_key, fallback) { return fallback; } }; } }
  };
  const originalLoad = Module._load;
  Module._load = function patched(request, parent, main) {
    if (request === 'vscode') return vscode;
    if (request === './sff_psd_intake') return {
      safeLabel: value => String(value || 'layer').replace(/[^A-Za-z0-9_-]+/g, '_'), inspectPsd: () => ({ filename: psdPath, records }), planPsdExports: () => ({}),
      exportPsdPlan(_inspection, _plan, directory) { outputDirectory=directory;fs.mkdirSync(directory, { recursive: true }); return records.slice(1).map(record => { const filename = path.join(directory, `page-${record.index}.png`); fs.writeFileSync(filename, Buffer.from([record.index])); return { sourceOrdinal: record.index, filename }; }); }
    };
    if (request === './sff_reader') return { readSff: () => ({ sprites: [{ group: 10, number: 20 }, { group: 10, number: 21 }] }) };
    if (request === './viewer_group') return { preferredViewerColumn: () => 1, trackViewerPanel: value => value };
    if (request === './webview_policy') return { protect: value => value };
    return originalLoad.call(this, request, parent, main);
  };
  try {
    delete require.cache[require.resolve('../src/layered_psd_workspace')];
    const { openLayeredPsdWorkspace } = require('../src/layered_psd_workspace');
    openResult = undefined; assert.strictEqual(await openLayeredPsdWorkspace({ target: 'stage', ownerFile, sffPath }), null);
    openResult = [{ fsPath: psdPath }]; quickResult = undefined; assert.strictEqual(await openLayeredPsdWorkspace({ target: 'stage', ownerFile, sffPath }), null);
    quickResult = { value: 'top-first' }; inputResults = [undefined]; assert.strictEqual(await openLayeredPsdWorkspace({ target: 'stage', ownerFile, sffPath }), null);
    inputResults = ['10', undefined]; assert.strictEqual(await openLayeredPsdWorkspace({ target: 'stage', ownerFile, sffPath }), null);
    assert.strictEqual(panels.length, 0, 'cancelling the PSD, direction, group, or index step creates no review panel or output workflow');

    inputResults = ['10', '20']; const opened = await openLayeredPsdWorkspace({ target: 'stage', ownerFile, sffPath, origin: [0, 0] }); assert(opened);
    const review = [{ id: 'psd-layer-2', x: 0, y: 0, visible: true }, { id: 'psd-layer-1', x: 0, y: 0, visible: true }];
    await receiver({ type: 'openSffIntake', layers: review });
    const intake = commands.find(entry => entry[0] === 'sff.openAddSprites'); assert(intake, 'the sealed review reaches the reviewed SFF intake');
    assert.strictEqual(intake[1].fsPath, sffPath); assert.deepStrictEqual({ group: intake[2].group, startIndex: intake[2].startIndex, reversed: intake[2].reversed }, { group: 10, startIndex: 20, reversed: false });
    assert(posts.some(message => message.type === 'intakeStarted' && message.message.includes(sffPath)), 'intake guidance names the exact destination SFF');
    await receiver({ type: 'verifyAdoption' });
    const adopted = fs.readFileSync(ownerFile, 'utf8'); assert.match(adopted, /\[BG /); assert.match(adopted, /spriteno = 10,20/); assert.match(adopted, /spriteno = 10,21/);
    assert(posts.some(message => message.type === 'adoptionComplete' && message.message.includes(sffPath) && message.message.includes(ownerFile)), 'completion names both exact adopted destinations');
    await receiver({ type: 'openOwner' });
    const ownerOpen = commands.find(entry => entry[0] === 'vscode.open'); assert(ownerOpen); assert.strictEqual(ownerOpen[1].fsPath, ownerFile, 'the explicit return route opens the exact owner source');
    assert.strictEqual(fs.existsSync(outputDirectory),true,'completed temporary exports remain available while the review workspace is open');
    opened.dispose();
    assert.strictEqual(fs.existsSync(outputDirectory),false,'closing a successfully adopted workspace removes its completed temporary export session');

    const editedOwner = path.join(root, 'stage-edited.def'); fs.writeFileSync(editedOwner, '[Info]\nname = Edited Review\n'); inputResults = ['10', '20'];
    const edited = await openLayeredPsdWorkspace({ target: 'stage', ownerFile: editedOwner, sffPath, origin: [0, 0] }), editedOutput = outputDirectory; await receiver({ type: 'openSffIntake', layers: review }); await receiver({ type: 'verifyAdoption' }); await receiver({ type: 'reviewChanged' }); edited.dispose();
    assert.strictEqual(fs.existsSync(editedOutput),true,'editing a completed review starts unfinished work and retains its exports on close');

    const reintakeOwner = path.join(root, 'stage-reintake.def'); fs.writeFileSync(reintakeOwner, '[Info]\nname = New Intake\n'); inputResults = ['10', '20'];
    const reintake = await openLayeredPsdWorkspace({ target: 'stage', ownerFile: reintakeOwner, sffPath, origin: [0, 0] }), reintakeOutput = outputDirectory; await receiver({ type: 'openSffIntake', layers: review }); await receiver({ type: 'verifyAdoption' }); await receiver({ type: 'openSffIntake', layers: review }); reintake.dispose();
    assert.strictEqual(fs.existsSync(reintakeOutput),true,'starting another intake after completion invalidates cleanup and retains exports needed by the unfinished intake');
    console.log('Layered PSD workflow proves cancellation, exact SFF handoff, transactional owner adoption, destinations, return, and generation-bound cleanup');
  } finally { Module._load = originalLoad; fs.rmSync(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
