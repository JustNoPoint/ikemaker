'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-layered-host-'));
  const psdPath = path.join(root, 'layers.psd'), sffPath = path.join(root, 'target.sff'), ownerFile = path.join(root, 'stage.def');
  fs.writeFileSync(psdPath, 'psd'); fs.writeFileSync(sffPath, 'sff'); fs.writeFileSync(ownerFile, '[Info]\nname = Test\n');
  const records = [
    { index: 0, width: 320, height: 240, name: 'Composite' },
    { index: 1, width: 320, height: 240, x: 0, y: 0, name: 'Top', visible: true, opacity: 1, compose: 'over' },
    { index: 2, width: 320, height: 240, x: 0, y: 0, name: 'Bottom', visible: true, opacity: 1, compose: 'over' }
  ];
  let receiver, disposeListener, commandGate = null, clipboardGate = null, warningGate = null, archive = { sprites: [{ group: 10, number: 20 }, { group: 10, number: 21 }] }, panelCreates = 0, lastOutputDirectory = '', ownerCurrent = true, invalidateAfterOpen = false;
  const posted = [], commands = [], clipboard = [], registeredCommands = new Map();
  const panel = {
    webview: {
      cspSource: 'test', html: '',
      postMessage(message) { posted.push(JSON.parse(JSON.stringify(message))); return true; },
      onDidReceiveMessage(callback) { receiver = callback; return { dispose() {} }; }
    },
    onDidDispose(callback) { disposeListener = callback; return { dispose() {} }; },
    dispose() { disposeListener?.(); }
  };
  const vscode = {
    ViewColumn: { Active: 1 }, Uri: { file: fsPath => ({ fsPath, scheme: 'file' }) },
    window: {
      async showOpenDialog() { if (invalidateAfterOpen) ownerCurrent = false; return [{ fsPath: psdPath }]; },
      async showQuickPick(items) { return items[0]; },
      async showInputBox(options) { return options.title.includes('group') ? '10' : '20'; },
      createWebviewPanel() { panelCreates += 1; return panel; },
      async showWarningMessage() { return warningGate ? warningGate.promise : undefined; }
    },
    commands: { registerCommand(id, handler) { registeredCommands.set(id, handler); return { dispose() {} }; }, async executeCommand(...args) { commands.push(args); if (registeredCommands.has(args[0])) return registeredCommands.get(args[0])(...args.slice(1)); if (commandGate) return commandGate.promise; } },
    env: { clipboard: { async writeText(text) { clipboard.push(text); if (clipboardGate) return clipboardGate.promise; } } },
    workspace: { textDocuments: [], getConfiguration() { return { get(_key, fallback) { return fallback; } }; } }
  };
  const originalLoad = Module._load;
  Module._load = function patched(request, parent, main) {
    if (request === 'vscode') return vscode;
    if (request === './sff_psd_intake') return {
      safeLabel: (value, fallback) => String(value || fallback).replace(/[^A-Za-z0-9_-]+/g, '_'),
      inspectPsd: () => ({ filename: psdPath, records }),
      planPsdExports: () => ({}),
      exportPsdPlan(_inspection, _plan, outputDirectory) {
        lastOutputDirectory = outputDirectory;
        fs.mkdirSync(outputDirectory, { recursive: true });
        return records.slice(1).map(record => { const filename = path.join(outputDirectory, `page-${record.index}.png`); fs.writeFileSync(filename, Buffer.from([record.index])); return { sourceOrdinal: record.index, filename }; });
      }
    };
    if (request === './sff_reader') return { readSff: () => archive };
    if (request === './viewer_group') return { preferredViewerColumn: () => 1, trackViewerPanel: value => value };
    if (request === './webview_policy') return { protect: value => value };
    return originalLoad.call(this, request, parent, main);
  };
  try {
    delete require.cache[require.resolve('../src/layered_psd_workspace')];
    const { openLayeredPsdWorkspace, register } = require('../src/layered_psd_workspace'); register({ subscriptions: [] });
    invalidateAfterOpen = true;
    assert.strictEqual(await openLayeredPsdWorkspace({ target: 'stage', ownerFile, sffPath, isCurrent: () => ownerCurrent }), null, 'a parent invalidated during the first native picker cannot launch a stale Layered PSD child');
    assert.strictEqual(panelCreates, 0, 'parent invalidation is detected before any child panel or export is created');
    invalidateAfterOpen = false; ownerCurrent = true;
    await vscode.commands.executeCommand('ikemen.layeredPsd.open', undefined, { target: 'stage', ownerFile, sffPath, isCurrent: () => ownerCurrent });
    assert.strictEqual(panelCreates, 1, 'a current owner can retry after invalidation or cancellation');
    const review = [
      { id: 'psd-layer-2', x: 0, y: 0, visible: true },
      { id: 'psd-layer-1', x: 0, y: 0, visible: true }
    ];

    commandGate = deferred();
    const staleIntake = receiver({ type: 'openSffIntake', layers: review });
    receiver({ type: 'reviewChanged' });
    commandGate.resolve(); await staleIntake; commandGate = null;
    assert.strictEqual(posted.some(message => message.type === 'intakeStarted'), false, 'review changes during SFF intake revoke pending adoption');
    assert(posted.some(message => message.type === 'reviewInvalidated'));

    await receiver({ type: 'openSffIntake', layers: review });
    assert(posted.some(message => message.type === 'intakeStarted'), 'current reviewed intake seals exact sprite identities');
    const sourceBefore = fs.readFileSync(ownerFile, 'utf8');
    warningGate = deferred();
    const staleAdoption = receiver({ type: 'verifyAdoption' });
    await new Promise(resolve => setImmediate(resolve));
    receiver({ type: 'reviewChanged' });
    warningGate.resolve('Append Reviewed Source'); await staleAdoption; warningGate = null;
    assert.strictEqual(fs.readFileSync(ownerFile, 'utf8'), sourceBefore, 'review invalidation during the modal prevents source writes');

    await receiver({ type: 'openSffIntake', layers: review });
    warningGate = deferred();
    const sourceDrift = receiver({ type:'verifyAdoption' }); await new Promise(resolve=>setImmediate(resolve));
    const externallyChanged = `${sourceBefore}; external change\n`; fs.writeFileSync(ownerFile, externallyChanged);
    warningGate.resolve('Append Reviewed Source'); await sourceDrift; warningGate = null;
    assert.strictEqual(fs.readFileSync(ownerFile,'utf8'),externallyChanged,'owner-source drift during modal review prevents adoption without overwriting external work');
    assert(posted.some(message=>/owner source changed during source review/i.test(message.message||'')));
    fs.writeFileSync(ownerFile,sourceBefore);

    warningGate = deferred();
    const dirtyDuringReview = receiver({type:'verifyAdoption'}); await new Promise(resolve=>setImmediate(resolve));
    vscode.workspace.textDocuments=[{uri:{scheme:'file',fsPath:ownerFile},isDirty:true}];
    warningGate.resolve('Append Reviewed Source'); await dirtyDuringReview; warningGate=null;
    assert.strictEqual(fs.readFileSync(ownerFile,'utf8'),sourceBefore,'a newly dirty owner editor prevents adoption');
    assert(posted.some(message=>/gained unsaved changes during source review/i.test(message.message||'')));
    vscode.workspace.textDocuments=[];

    warningGate=deferred();
    const sffDrift=receiver({type:'verifyAdoption'}); await new Promise(resolve=>setImmediate(resolve));
    archive={sprites:[{group:10,number:20}]};
    warningGate.resolve('Append Reviewed Source'); await sffDrift; warningGate=null;
    assert.strictEqual(fs.readFileSync(ownerFile,'utf8'),sourceBefore,'SFF identity drift during modal review prevents source adoption');
    assert(posted.some(message=>/target SFF changed during source review/i.test(message.message||'')));
    archive={sprites:[{group:10,number:20},{group:10,number:21}]};

    clipboardGate = deferred();
    const copying = receiver({ type: 'copyCode', code: 'reviewed code' });
    await receiver({ type: 'openFolder' });
    assert.strictEqual(commands.filter(args => args[0] === 'revealFileInOS').length, 0, 'overlapping host actions are rejected instead of racing');
    clipboardGate.resolve(); await copying; clipboardGate = null;
    assert.deepStrictEqual(clipboard, ['reviewed code']);

    commandGate = deferred();
    const messagesBeforeDispose = posted.length;
    const opening = receiver({ type: 'openFolder' });
    const incompleteOutputDirectory = lastOutputDirectory;
    panel.dispose(); commandGate.resolve(); await opening;
    assert.strictEqual(posted.length, messagesBeforeDispose + 1, 'disposal suppresses late completion posts while retaining the already-issued busy state');
    assert.strictEqual(fs.readFileSync(ownerFile, 'utf8'), sourceBefore, 'disposal never mutates the owner source');
    assert(commands.some(args => args[0] === 'sff.openAddSprites'));
    assert.strictEqual(crypto.createHash('sha256').update(fs.readFileSync(ownerFile)).digest('hex'), crypto.createHash('sha256').update(sourceBefore).digest('hex'));
    assert.strictEqual(fs.existsSync(incompleteOutputDirectory),true,'closing an incomplete or stale session retains its immutable exports for retry/recovery');
    fs.rmSync(incompleteOutputDirectory,{recursive:true,force:true});
    const panelCreatesBeforeLimit = panelCreates, originalStatSync = fs.statSync;
    fs.statSync = function oversizedExportStat(filename, ...args) { if (lastOutputDirectory && String(filename).startsWith(lastOutputDirectory)) return { size: 64 * 1024 * 1024 + 1 }; return originalStatSync.call(fs, filename, ...args); };
    try { await assert.rejects(() => openLayeredPsdWorkspace({ target:'stage', ownerFile, sffPath }), /64 MiB limit.*Flatten, crop, or split/i); }
    finally { fs.statSync = originalStatSync; }
    assert.strictEqual(panelCreates,panelCreatesBeforeLimit,'an over-limit exported payload is rejected before any webview panel is created');
    assert.strictEqual(fs.existsSync(lastOutputDirectory),false,'an over-limit exported payload removes its temporary export directory');
    console.log('Layered PSD host rejects stale intake, overlapping actions, modal invalidation, late disposal completion, and oversized exports before panel creation');
  } finally {
    Module._load = originalLoad;
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
