'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { canonicalize } = require('./sff_build_specification');

const ROUTES = Object.freeze({
  'sff-v2.0': Object.freeze({ targetId: 'sff-v2.0', backendId: 'ikemaker-builtin-sff-v2.0', adapterId: 'builtin-v20-raw8' }),
  'sff-v2.1': Object.freeze({ targetId: 'sff-v2.1', backendId: 'ikemaker-builtin-sff-v21-png8-prerelease', adapterId: 'builtin-v21-png8' })
});
const activeDispatches = new Set();

function sha(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function canonicalBytes(value) { return Buffer.from(`${JSON.stringify(canonicalize(value, 'built-in route envelope'))}\n`); }
function draftRevision(draft) { return sha(canonicalBytes(draft)); }
function targetKey(filename) { return process.platform === 'win32' ? path.resolve(filename).toLowerCase() : path.resolve(filename); }
function exactTarget(captured, expected) {
  return captured && captured.exists === true && expected && expected.exists === true
    && targetKey(captured.filename) === targetKey(expected.filename)
    && String(captured.hash || '').toLowerCase() === String(expected.hash || '').toLowerCase();
}
function fail(message) { throw new Error(`Built-in SFF lifecycle: ${message}`); }
function builtInFormatForHostMessage(type) {
  if (type === 'buildBuiltInV20') return 'sff-v2.0';
  if (type === 'buildBuiltInV21') return 'sff-v2.1';
  return null;
}

function defaultRuntime() {
  try { return require('./sff_creator_builtin_lifecycle_runtime'); }
  catch (_) { return null; }
}

function createCreatorBuiltInLifecycleCoordinator(dependencies = {}) {
  const readFile = dependencies.readFile || (filename => fs.readFileSync(filename));
  const captureTarget = dependencies.captureTarget;
  const startLifecycle = dependencies.startLifecycle;
  const verifyCompleted = dependencies.verifyCompleted;
  const retainContinuation = dependencies.retainContinuation || (async () => {});
  if (typeof captureTarget !== 'function' || typeof startLifecycle !== 'function' || typeof verifyCompleted !== 'function') fail('the lifecycle runtime is not installed. The reviewed draft was retained.');
  if (typeof retainContinuation !== 'function') fail('the lifecycle continuation retainer is invalid.');

  async function startCreatorBuiltInAdoption(input, ui = {}) {
    const route = ROUTES[input?.formatId];
    if (!route) fail('only explicit SFF v2.0 and v2.1 routes are supported.');
    if (!input?.build?.specificationPath || !input?.build?.specificationHash) fail('an immutable reviewed specification artifact is required.');
    if (!input?.targetSnapshot?.exists || !input?.targetSnapshot?.filename) fail('built-in adoption currently requires an existing active SFF archive.');
    if (typeof input.getCurrentDraft !== 'function') fail('a live draft revision reader is required.');
    const key = `${targetKey(input.targetSnapshot.filename)}\0${route.targetId}`;
    if (activeDispatches.has(key)) return Object.freeze({ status: 'dispatch-already-running', resetDraft: false });

    const specificationPath = path.resolve(input.build.specificationPath);
    const specificationBytes = Buffer.from(readFile(specificationPath));
    const specificationArtifactByteHash = sha(specificationBytes);
    const parsed = JSON.parse(specificationBytes.toString('utf8'));
    if (parsed.specificationHash !== input.build.specificationHash) fail('the reviewed specification semantic hash drifted.');
    const reviewedDraftRevision = String(input.draftRevision || '');
    if (!reviewedDraftRevision || draftRevision(input.getCurrentDraft()) !== reviewedDraftRevision) fail('the Creator draft changed before route review.');
    const reviewedTarget = captureTarget(input.targetSnapshot.filename);
    if (!exactTarget(reviewedTarget, input.targetSnapshot)) fail('the active SFF changed before route review.');

    const envelopeCore = {
      schema: 'ikemaker.sff-creator-built-in-route-envelope', version: 1,
      route, specificationHash: input.build.specificationHash,
      specificationArtifactByteHash, specificationPath,
      draftRevision: reviewedDraftRevision,
      target: { path: path.resolve(input.targetSnapshot.filename), byteHash: String(input.targetSnapshot.hash).toLowerCase() }
    };
    const routeEnvelopeHash = sha(canonicalBytes(envelopeCore));
    const routeEnvelope = Object.freeze({ ...envelopeCore, routeEnvelopeHash });
    const confirmed = typeof ui.confirm === 'function' ? await ui.confirm(routeEnvelope) : false;
    if (!confirmed) return Object.freeze({ status: 'cancelled', resetDraft: false, routeEnvelope });

    // The second read is intentional: neither the reviewed specification, draft,
    // nor active archive may change between confirmation and dispatch.
    const finalSpecificationBytes = Buffer.from(readFile(specificationPath));
    if (!finalSpecificationBytes.equals(specificationBytes) || sha(finalSpecificationBytes) !== specificationArtifactByteHash) fail('the reviewed specification changed immediately before dispatch.');
    if (draftRevision(input.getCurrentDraft()) !== reviewedDraftRevision) fail('the Creator draft changed immediately before dispatch.');
    if (!exactTarget(captureTarget(input.targetSnapshot.filename), input.targetSnapshot)) fail('the active SFF changed immediately before dispatch.');

    activeDispatches.add(key);
    try {
      const started = await startLifecycle(Object.freeze({
        workspaceRoot: path.resolve(input.workspaceRoot),
        packageRoot: path.resolve(input.packageRoot),
        build: input.build,
        specificationArtifactBytes: Buffer.from(specificationBytes),
        specificationArtifactByteHash,
        specificationHash: input.build.specificationHash,
        routeEnvelope,
        routeEnvelopeArtifactBytes: canonicalBytes(routeEnvelope),
        expectedRouteEnvelopeHash: routeEnvelopeHash
      }));
      if (!started || started.status !== 'completed' || !started.completedLocator) {
        if (started?.continuationLocator) {
          if (typeof input.draftKey !== 'string' || !input.draftKey) fail('a draftKey is required to retain an incomplete lifecycle continuation.');
          await retainContinuation({ draftKey: input.draftKey, draftRevision: reviewedDraftRevision, locator: started.continuationLocator, binding: { specificationHash: input.build.specificationHash, routeEnvelopeHash, targetId: route.targetId, backendId: route.backendId, adapterId: route.adapterId } });
        }
        return Object.freeze({ status: started?.status || 'lifecycle-incomplete', resetDraft: false, operationId: started?.operationId || null, result: started || null });
      }
      const completed = await verifyCompleted(started.completedLocator);
      const expectedTarget = targetKey(input.targetSnapshot.filename);
      const valid = completed?.status === 'verified'
        && completed.lifecycleState === 'Completed'
        && completed.operationId === started.operationId
        && completed.specificationHash === input.build.specificationHash
        && completed.routeEnvelopeHash === routeEnvelopeHash
        && completed.targetId === route.targetId
        && completed.backendId === route.backendId
        && completed.adapterId === route.adapterId
        && typeof completed.activePath === 'string'
        && targetKey(completed.activePath) === expectedTarget;
      if (!valid) fail('saved Completed evidence did not independently match the operation, specification, route, and active target.');
      return Object.freeze({ status: 'completed-verified', resetDraft: true, operationId: started.operationId, completed });
    } finally { activeDispatches.delete(key); }
  }

  return Object.freeze({ startCreatorBuiltInAdoption });
}

async function startCreatorBuiltInAdoption(input, ui) {
  const runtime = defaultRuntime();
  return createCreatorBuiltInLifecycleCoordinator(runtime || {}).startCreatorBuiltInAdoption(input, ui);
}

module.exports = { ROUTES, builtInFormatForHostMessage, createCreatorBuiltInLifecycleCoordinator, draftRevision, startCreatorBuiltInAdoption };
