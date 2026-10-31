'use strict';

const assert = require('assert');
const path = require('path');
const Module = require('module');
const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return {};
  if (request === './air_viewer' && /air_docking_workspace\.js$/.test(parent?.filename || '')) return { parseAir: () => [], inferCharacterFiles: () => ({}), collisionRuntimeOptions: () => ({}), collisionRuntimeDraftEntries: () => [] };
  return originalLoad.call(this, request, parent, isMain);
};
const { buildCollisionTransformPreview, queueCollisionTransformPreview, collisionScaleInput } = require('../src/air_docking_workspace');
Module._load = originalLoad;

const airPath = path.resolve('/char/main.air'), constantsPath = path.resolve('/char/constants.cns');
const airText = '[Begin Action 200]\nClsn1: 2\nClsn1[1] = 10, 20, 20, 40\nClsn1[0] = 0, 0, 0, 0\n0,0, 0,0, 2';
let constantsText = '[Data]\nxscale = 2\nyscale = 0.5';
const airDocument = { fileName: airPath, isClosed: false, version: 4, getText: () => airText };
const constantsDocument = { fileName: constantsPath, isClosed: false, isDirty: true, version: 6, getText: () => constantsText };
const workspace = { textDocuments: [airDocument, constantsDocument], openTextDocument: async filename => path.resolve(filename) === airPath ? airDocument : constantsDocument };
const fingerprint = 'A'.repeat(64), capability = () => ({ allowIndexed: true, target: { channel: 'nightly', version: '1.0-nightly', buildId: 'verified' }, capabilityFingerprint: fingerprint, allocationDecision: { capabilityId: 'collision.air-index-allocation', enabled: true, status: 'supported', capabilityFingerprint: fingerprint } });
const services = { workspace, collisionRuntimeOptions: capability, readRuntimePlan: () => ({ entries: [] }), collisionRuntimeDraftEntries: () => [] };
const makeRecord = () => ({ panel: { active: true }, airSourceAvailable: true, data: { airPath, constantsPath }, collisionGeneration: 0, collisionEpoch: 0, transformEpoch: 0, collisionAuthorities: new Map(), consumedCollisionRoutes: new Set(), transformQueue: Promise.resolve() });

(async () => {
  const scale = await collisionScaleInput(makeRecord(), workspace);
  assert.deepStrictEqual(scale.scale, [2, 0.5]);
  assert.strictEqual(scale.source.version, 6, 'dirty/open constants are the exact scale authority');
  assert.strictEqual(scale.source.name, 'constants.cns');assert.strictEqual(scale.source.provenance, 'open dirty document');assert.strictEqual(scale.source.dirty, true);

  const record = makeRecord(), result = await buildCollisionTransformPreview(record, { action: 200, elementIndex: 0, groupKey: 'clsn1', index: 1, scale: [1.5, 0.75], angle: 30, pivotPreset: 'top-left' }, services);
  assert.strictEqual(result.projection.status, 'ready');
  assert.deepStrictEqual(result.projection.controls.pivot, [20, 10]);
  assert.strictEqual(result.projection.authority.coordinateSpace, 'character-local');
  assert.strictEqual(record.collisionAuthorities.size, 0, 'read-only previews do not replace or consume C8 source-route authority');

  let release;
  const published = [], raceRecord = makeRecord(), slowWorkspace = { textDocuments: [constantsDocument], openTextDocument: async filename => path.resolve(filename) === airPath ? new Promise(resolve => { release = () => resolve(airDocument); }) : constantsDocument }, slowServices = { ...services, workspace: slowWorkspace };
  const old = queueCollisionTransformPreview(raceRecord, { request: 1, action: 200, elementIndex: 0, groupKey: 'clsn1', index: 1, scale: [1, 1], angle: 0, pivotPreset: 'axis' }, value => published.push(value), slowServices);
  await Promise.resolve(); await Promise.resolve();
  raceRecord.transformEpoch += 1;
  release(); await old;
  assert.strictEqual(published.length, 0, 'a superseded host transform epoch cannot publish stale geometry');

  const stableRecord = makeRecord();
  const stable = await buildCollisionTransformPreview(stableRecord, { action: 200, elementIndex: 0, groupKey: 'clsn1', index: 1 }, { ...services, collisionRuntimeOptions: () => ({ ...capability(), allowIndexed: false, target: { channel: 'stable', version: '1.0' }, allocationDecision: { capabilityId: 'collision.air-index-allocation', enabled: false, status: 'unsupported', capabilityFingerprint: fingerprint } }) });
  assert.strictEqual(stable.projection.status, 'unavailable');

  raceRecord.airSourceAvailable = false;
  await assert.rejects(() => queueCollisionTransformPreview(raceRecord, { request: 2 }, () => {}, services), /removed or renamed/);
  constantsText = '[Data]\nxscale = nope';
  assert.strictEqual((await collisionScaleInput(makeRecord(), workspace)).scale, null, 'unknown scale stays explicitly unscaled rather than guessed');
  console.log('AIR docking transform preview stays exact, read-only, dirty-source aware, and race-safe');
})().catch(error => { console.error(error); process.exitCode = 1; });
