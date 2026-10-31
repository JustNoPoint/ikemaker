'use strict';

const assert = require('assert');
const Module = require('module');

(async () => {
  const original = Module._load, calls = { reads: [], command: null, seed: null };
  const sourceArchive = { side: 'source' }, destinationArchive = { side: 'destination' }, panel = { id: 'assembly' };
  const vscode = {
    Uri: { file: fsPath => ({ fsPath }) }, ViewColumn: { One: 1, Beside: 2 }, window: {},
    commands: { executeCommand: async (...args) => { calls.command = args; return panel; } }
  };
  Module._load = function(request, parent, main) {
    if (request === 'vscode') return vscode;
    if (parent?.filename?.endsWith('sff_transfer_host.js') && request === './sff_assembly_workspace') return { assemblyReference: (baseFile, sourceFile) => ({ baseFile, sourceFile, baseHash: 'b'.repeat(64), sourceHash: 'a'.repeat(64), identity: 'c'.repeat(64) }) };
    if (parent?.filename?.endsWith('sff_transfer_host.js') && request === './sff_reader') return { readSff: filename => { calls.reads.push(filename); return filename.includes('source') ? sourceArchive : destinationArchive; } };
    if (parent?.filename?.endsWith('sff_transfer_host.js') && request === './sff_transfer_assembly_adapter') return { createSffTransferAssemblySeed: input => { calls.seed = input; return { schema: 'validated-seed', authority: { requestIdentity: 'd'.repeat(64) } }; } };
    return original.call(this, request, parent, main);
  };
  try {
    const { SffTransferHost } = require('../src/sff_transfer_host'), host = new SffTransferHost(), session = { schema: 'exact-session' };
    const result = await host.continueAssembly({ source: { fileIdentity: 'C:/source.sff' }, destination: { fileIdentity: 'C:/destination.sff' }, session });
    assert.equal(result.status, 'opened-advanced'); assert.equal(result.requestIdentity, 'd'.repeat(64));
    assert.strictEqual(calls.seed.session, session); assert.strictEqual(calls.seed.sourceArchive, sourceArchive); assert.strictEqual(calls.seed.destinationArchive, destinationArchive);
    assert.equal(calls.command[0], 'sff.openAssembly'); assert.equal(calls.command[1].fsPath, 'C:/destination.sff'); assert.equal(calls.command[2].preset, true); assert.equal(calls.command[2].transferSeed.schema, 'validated-seed');
    console.log('SFF Transfer host passes the exact ready review seed into Two-SFF Assembly');
  } finally { Module._load = original; }
})().catch(error => { console.error(error); process.exitCode = 1; });
