'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const commands = new Map(), panels = [], stored = {}, registrations = [], closeSupport = new Map();
function panel() { const receivers = [], disposers = [], messages = []; const value = { webview: { cspSource: 'test', html: '', onDidReceiveMessage(fn) { receivers.push(fn); }, postMessage(message) { messages.push(message); return true; } }, onDidDispose(fn) { disposers.push(fn); }, reveal() {}, dispose() { disposers.forEach(fn => fn()); }, receivers, messages }; panels.push(value); return value; }
const vscode = { ViewColumn: { Active: 1 }, Uri: { file: fsPath => ({ fsPath }) }, workspace: { getConfiguration: () => ({ get: (_key, fallback) => fallback }) }, commands: { registerCommand(id, fn) { commands.set(id, fn); return {}; }, executeCommand: async () => undefined }, window: { createWebviewPanel: panel, showErrorMessage(message) { throw new Error(message); }, showWarningMessage() {} } };
const archives = new Map();
const archive = (filename, group, bytes = '') => ({ filename, buffer: Buffer.from(bytes), header: { literalDataOffset: 0 }, version: [2, 1, 0, 0], palettes: [], sprites: [{ index: 0, group, number: 0, axisX: 1, axisY: 2, width: 3, height: 4, paletteIndex: 0, format: 0, colorDepth: 32, dataOffset: 0, dataSize: 1 }] });
const original = Module._load;
Module._load = function(request, parent, main) {
  if (request === 'vscode') return vscode;
  if (request === './sff_reader' && /sff_assembly_workspace/.test(parent?.filename || '')) return { readSff: filename => archives.get(path.resolve(filename)), friendlyVersion: () => '2.1', spritePng: () => Buffer.from('png') };
  if (request === './viewer_group' && /sff_assembly_workspace/.test(parent?.filename || '')) return { preferredViewerColumn: () => 2, trackViewerPanel: value => value };
  if (request === './viewer_close' && /sff_assembly_workspace/.test(parent?.filename || '')) return { support(value, support) { closeSupport.set(value, support); } };
  if (request === './viewer_sessions' && /sff_assembly_workspace/.test(parent?.filename || '')) return { register: (value, file, kind) => registrations.push({ value, file, kind }) };
  if (request === './webview_policy' && /sff_assembly_workspace/.test(parent?.filename || '')) return { protect: value => value };
  return original.call(this, request, parent, main);
};
const workspace = require('../src/sff_assembly_workspace');
const storage = { get(key, fallback) { return stored[key] ?? fallback; }, async update(key, value) { stored[key] = value; } };
workspace.registerSffAssembly({ workspaceState: storage, subscriptions: [] });

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-sff-assembly-'));
  try {
    const base = path.join(root, 'base.sff'), source = path.join(root, 'source.sff'); fs.writeFileSync(base, 'base-a'); fs.writeFileSync(source, 'source-a'); archives.set(path.resolve(base), archive(base, 0, 'base-a')); archives.set(path.resolve(source), archive(source, 10, 'source-a'));
    const reference = workspace.assemblyReference(base, source), open = commands.get('sff.openAssembly');
    const first = await open(vscode.Uri.file(base), { preset: true, reference });
    assert(first); assert.strictEqual(registrations.at(-1).kind, 'sff_assembly'); assert(closeSupport.has(first)); assert.match(first.webview.html, /Discard recovered plan/);
    const draft = { operations: [{ selection: { indices: [0] }, targetGroup: 0, mode: 'replace', preserveDestinationAxis: true, label: 'replace: 1 sprite(s) → 0' }], selected: [0], mode: 'replace', preserveDestinationAxis: true };
    first.receivers[0]({ type: 'assemblyDraft', identity: reference.identity, revision: 1, draft }); await new Promise(resolve => setImmediate(resolve)); await closeSupport.get(first).keepDraft(); first.dispose();
    const reopened = await open(vscode.Uri.file(base), { preset: true, reference }); assert.match(reopened.webview.html, /"mode":"replace"/); assert.match(reopened.webview.html, /Recovered the plan for these exact SFF files/);
    reopened.receivers[0]({ type: 'discardAssemblyDraft', identity: reference.identity }); await new Promise(resolve => setImmediate(resolve)); reopened.dispose();
    const clean = await open(vscode.Uri.file(base), { preset: true, reference }); assert.doesNotMatch(clean.webview.html, /"recoveredDraft":\{"operations":\[/); clean.dispose();
    const transfer = require('../src/asset_transfer_session'), organization = require('../src/sff_view_organization'), adapter = require('../src/sff_transfer_assembly_adapter'), sourceArchive = archives.get(path.resolve(source)), baseArchive = archives.get(path.resolve(base)), row = organization.snapshot(sourceArchive).rows[0], endpoint = (role, filename, fingerprint) => ({ kind: 'sff', entityIdentity: `${role}-entity`, fileIdentity: filename, fingerprint, label: role });
    let transferSession = transfer.createTransferSession({ kind: 'sff', sessionId: 'assembly-handoff', source: endpoint('source', source, reference.sourceHash), destination: endpoint('destination', base, reference.baseHash) });
    transferSession = transfer.setTransferSelection(transferSession, 'source', [{ id: `${row.identity}@${row.physicalIndex}`, physicalIndex: row.physicalIndex, label: 'reviewed physical sprite', contentFingerprint: row.evidence, metadataFingerprint: row.topology }]);
    const request = transfer.createTransferRequest(transferSession, { method: 'copy-selected' }); transferSession = transfer.stageTransferReview(transferSession, request, { status: 'ready', reviewFingerprint: request.requestIdentity, summary: 'ready' });
    const transferSeed = adapter.createSffTransferAssemblySeed({ reference, session: transferSession, sourceArchive, destinationArchive: baseArchive }), seeded = await open(vscode.Uri.file(base), { preset: true, reference, transferSeed });
    assert.match(seeded.webview.html, /Reviewed Transfer selection/); assert.match(seeded.webview.html, /sourceSelection/); assert.match(seeded.webview.html, /identity conflicts, linked sprites, palette compatibility, insertion order, and Apply still require review/i); assert.match(seeded.webview.html, /Review Transfer decisions/); assert.match(seeded.webview.html, /Prepare \/ Apply reviewed Transfer/); seeded.dispose();
    await assert.rejects(() => open(vscode.Uri.file(base), { preset: true, reference, transferSeed: { ...transferSeed, placementRequired: false } }), /placement requirement/);
    fs.writeFileSync(source, 'source-b'); const before = panels.length; assert.strictEqual(await open(vscode.Uri.file(base), { preset: true, reference }), undefined); assert.strictEqual(panels.length, before);
    const malformed = workspace.safeAssemblyDraft({ operations: [{ selection: { indices: [0, 99] }, targetGroup: 0, mode: 'replace' }], selected: [0, 99] }, archives.get(path.resolve(base)), archives.get(path.resolve(source)));
    assert.strictEqual(malformed, null, 'malformed recovered plans fail closed instead of being silently rewritten');
    assert.deepStrictEqual(workspace.safeAssemblyDraft(draft, archives.get(path.resolve(base)), archives.get(path.resolve(source))), draft);
    console.log('SFF Assembly source-bound drafts and typed preset restoration passed');
  } finally { Module._load = original; fs.rmSync(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
