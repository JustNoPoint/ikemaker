'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

(async () => {
  const original = Module._load, calls = { close: [], populate: [], finalize: null, warnings: [], failRefresh: false }, vscode = { window: { showErrorMessage: async message => { throw new Error(message); }, showWarningMessage: async message => calls.warnings.push(message) }, ViewColumn: { One: 1, Beside: 2 } };
  Module._load = function(request, parent, main) {
    if (request === 'vscode') return vscode;
    if (parent?.filename?.endsWith('sff_transfer_host.js') && request === './sff_browser') return { closeTransferSession: id => calls.close.push(id) };
    if (parent?.filename?.endsWith('sff_transfer_host.js') && request === './sff_viewer') return { populateSffPanel: async (...args) => { calls.populate.push(args); if(calls.failRefresh)throw new Error('panel unavailable'); return true; } };
    return original.call(this, request, parent, main);
  };
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-transfer-result-')), destination = path.join(root, 'destination.sff'); fs.writeFileSync(destination, 'verified-destination');
  try {
    const { SffTransferHost } = require('../src/sff_transfer_host'), host = new SffTransferHost(), handleRef = { id: 'destination-h' }, panel = {}, callbacks = {};
    host.handles.set(handleRef.id, { id: handleRef.id, filename: destination, panel, role: 'destination', sessionId: 'session', entityIdentity: 'character:destination', transferCallbacks: callbacks });
    host.mode = { snapshot: () => ({ active: true, session: { sessionId: 'session' }, handles: { destination: handleRef } }), finalizeAssemblyResult: (...args) => { calls.finalize = args; return { status: 'completed' }; } };
    const details = [{ id: '0,0@0', status: 'added', destinationId: '5,0', message: 'verified' }], mappings = [{ sourceId: '0,0@0' }], result = await host.recordAssemblyResult('A'.repeat(64), details, mappings);
    assert.equal(result.status, 'completed'); assert.strictEqual(calls.finalize[1], details); assert.strictEqual(calls.finalize[3], mappings); assert.match(calls.finalize[2].fingerprint, /^[a-f0-9]{64}$/); assert.equal(calls.finalize[2].fileIdentity, path.resolve(destination));
    assert.deepStrictEqual(calls.close, ['session']); assert.strictEqual(calls.populate[0][0], panel); assert.equal(calls.populate[0][2].transferPinned, true); assert.strictEqual(calls.populate[0][2].transferCallbacks, callbacks);
    calls.failRefresh=true;const retained=await host.recordAssemblyResult('B'.repeat(64),details,mappings);assert.equal(retained.status,'completed');assert.equal(retained.viewerRefresh,'failed');assert.match(calls.warnings[0],/applied and recorded.*could not refresh/i);assert.equal(calls.close.length,2);assert.equal(calls.finalize[0],'B'.repeat(64));
    console.log('SFF Transfer verified result rebases and refreshes the pinned Destination endpoint');
  } finally { Module._load = original; fs.rmSync(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
