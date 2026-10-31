'use strict';

const crypto = require('crypto');
const { resolveSffTargetBackend } = require('./sff_backend_registry');
const { validateCertificationEvidence } = require('./sff_runtime_certification');

const SFF_CAPABILITY_REPORT_VERSION = 1;
const SUPPORT_STATES = Object.freeze(['supported', 'unsupported', 'unproven']);
const DISPLAY_STATUSES = Object.freeze(['Built-in Certified', 'Built-in Experimental', 'External Ready', 'External Needs Runner', 'Unavailable']);

function canonicalize(value, label = 'value', ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${label} must contain only finite JSON numbers.`);
    return value;
  }
  if (value === undefined) return undefined;
  if (typeof value !== 'object') throw new Error(`${label} must contain only JSON values.`);
  if (ancestors.has(value)) throw new Error(`${label} must not contain circular references.`);
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) throw new Error(`${label} must contain only plain JSON objects.`);
  ancestors.add(value);
  let result;
  if (Array.isArray(value)) {
    result = value.map((item, index) => {
      const normalized = canonicalize(item, `${label}[${index}]`, ancestors);
      if (normalized === undefined) throw new Error(`${label}[${index}] must not be undefined.`);
      return normalized;
    });
  } else {
    result = Object.keys(value).sort().reduce((object, key) => {
      const normalized = canonicalize(value[key], `${label}.${key}`, ancestors);
      if (normalized !== undefined) object[key] = normalized;
      return object;
    }, {});
  }
  ancestors.delete(value);
  return result;
}

function hashCanonical(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

function passed(value) { return value === true || value === 'passed'; }

function sha256(value) { return /^[0-9a-f]{64}$/i.test(String(value || '')); }

function certificationPassed(certification, backend = null, targetId = null) {
  if (!backend || !targetId || !backend.targetIds.includes(targetId)) return false;
  return validateCertificationEvidence(backend, targetId, certification || {}).valid === true;
}

function targetProbePassed(backend, targetId, evidence) {
  const probe = evidence.targetProbe || {}, tool = evidence.tool || {};
  return passed(probe.status) && probe.targetId === targetId && probe.observedTargetId === targetId &&
    probe.backendId === backend.id && probe.adapterId === backend.adapter.id && Number(probe.adapterVersion) === Number(backend.adapter.version) &&
    sha256(probe.toolByteHash) && String(probe.toolByteHash).toLowerCase() === String(tool.byteHash).toLowerCase() &&
    sha256(probe.outputByteHash) && String(probe.validatorId || '').trim() && Number.isSafeInteger(Number(probe.validatorVersion)) && Number(probe.validatorVersion) >= 1 &&
    probe.semanticComparisonPassed === true;
}

function backendStatus(backend, evidence = {}, selectedTargetId = null) {
  const targetId = selectedTargetId || (backend.targetIds.length === 1 ? backend.targetIds[0] : null);
  if (backend.kind === 'built-in') {
    const available = backend.implemented === true && evidence.implementationAvailable !== false;
    const certified = available && certificationPassed(evidence.certification, backend, targetId);
    return deepFreeze({
      display: !available ? 'Unavailable' : certified ? 'Built-in Certified' : 'Built-in Experimental',
      availability: available ? 'available' : 'unavailable',
      certification: certified ? 'certified' : available ? 'unproven' : 'unavailable'
    });
  }

  const tool = evidence.tool || {};
  const toolHash = String(tool.byteHash || '').toLowerCase();
  const approvedHashes = backend.approvedToolHashes || [];
  if (backend.implemented !== true || tool.available !== true || !sha256(toolHash) || !String(tool.version || '').trim() || (approvedHashes.length && !approvedHashes.includes(toolHash))) {
    return deepFreeze({ display: 'Unavailable', availability: 'unavailable', certification: 'unproven' });
  }
  const targetReady = targetProbePassed(backend, targetId, evidence);
  if (backend.environment?.requiresLegacyRunner) {
    const nativeReady = passed(evidence.nativeProbe?.status) && String(evidence.nativeProbe?.toolByteHash || '').toLowerCase() === toolHash;
    const runnerReady = evidence.runner?.approved === true && passed(evidence.runner?.probeStatus) &&
      sha256(evidence.runner?.binaryHash) && sha256(evidence.runner?.sourceHash) && sha256(evidence.runner?.manifestHash);
    if (!nativeReady && !runnerReady) {
      return deepFreeze({ display: 'External Needs Runner', availability: 'needs-runner', certification: 'unproven' });
    }
    if (!targetReady) {
      return deepFreeze({ display: 'Unavailable', availability: 'unavailable', certification: 'unproven' });
    }
  } else if (!targetReady) {
    return deepFreeze({ display: 'Unavailable', availability: 'unavailable', certification: 'unproven' });
  }
  return deepFreeze({ display: 'External Ready', availability: 'available', certification: 'probe-passed' });
}

function supportState(targetState, backendState) {
  if (targetState === 'unsupported' || backendState === 'unsupported') return 'unsupported';
  if (targetState !== 'supported' || backendState !== 'supported') return 'unproven';
  return 'supported';
}

function mismatch(code, origin, feature, required, supported, disposition, detail) {
  return { code, origin, feature, required, supported, disposition, detail };
}

function createSffCapabilityReport(input = {}) {
  const { target, backend } = resolveSffTargetBackend(input);
  const evidence = canonicalize(input.evidence || {}, 'evidence');
  const status = backendStatus(backend, evidence, target.id);
  if (input.requiredFeatures !== undefined && !Array.isArray(input.requiredFeatures)) throw new Error('requiredFeatures must be an array.');
  if (input.conversions !== undefined && !Array.isArray(input.conversions)) throw new Error('conversions must be an array.');
  const requiredFeatures = [...new Set((input.requiredFeatures || []).map((value) => String(value || '').trim()).filter(Boolean))].sort();
  const features = {};
  const mismatches = [];
  for (const feature of requiredFeatures) {
    const targetState = target.capabilities[feature] || 'unproven';
    const backendState = backend.capabilities[feature] || 'unproven';
    if (!SUPPORT_STATES.includes(targetState) || !SUPPORT_STATES.includes(backendState)) throw new Error(`Invalid support state for ${feature}.`);
    const effective = supportState(targetState, backendState);
    features[feature] = { target: targetState, backend: backendState, effective };
    if (targetState !== 'supported') mismatches.push(mismatch(`TARGET_${targetState.toUpperCase()}`, 'target', feature, 'supported', targetState, 'block', `Target ${target.id} does not provide proven exact support for ${feature}.`));
    else if (backendState !== 'supported') mismatches.push(mismatch(`BACKEND_${backendState.toUpperCase()}`, 'backend', feature, 'supported', backendState, 'block', `Backend ${backend.id} does not provide proven exact support for ${feature}.`));
  }
  if (status.availability !== 'available') mismatches.push(mismatch('ENVIRONMENT_NOT_READY', 'environment', 'backend.execution', 'available', status.availability, 'block', `${backend.label} is not ready in the current environment.`));
  if (backend.kind === 'built-in' && status.certification !== 'certified') mismatches.push(mismatch('CERTIFICATION_UNPROVEN', 'certification', 'backend.output', 'certified', status.certification, 'block', `${backend.label} lacks a complete, current physical certification ledger.`));

  for (const conversion of input.conversions || []) {
    const feature = String(conversion.feature || '').trim();
    if (!feature) throw new Error('Conversion feature is required.');
    const origin = conversion.origin || 'backend';
    if (!['target', 'backend', 'environment', 'certification'].includes(origin)) throw new Error(`Invalid conversion mismatch origin ${origin}.`);
    mismatches.push(mismatch('REVIEWED_CONVERSION_REQUIRED', origin, feature, conversion.required || 'exact', conversion.supported || 'conversion-only', 'separate-reviewed-conversion', conversion.detail || `${feature} requires a separate reviewed conversion.`));
  }

  const report = {
    schema: 'ikemaker.sff-capability-report', version: SFF_CAPABILITY_REPORT_VERSION,
    targetId: target.id, backendId: backend.id, status, requiredFeatures, features, mismatches,
    exactBuildAllowed: status.availability === 'available' && mismatches.length === 0
  };
  report.snapshotHash = hashCanonical({ ...report, evidence });
  return deepFreeze(report);
}

module.exports = {
  SFF_CAPABILITY_REPORT_VERSION, SUPPORT_STATES, DISPLAY_STATUSES,
  canonicalize, hashCanonical, certificationPassed, backendStatus, createSffCapabilityReport
};
