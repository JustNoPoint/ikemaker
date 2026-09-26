'use strict';

const engine = require('./engine_registry_model');
const coverage = require('../data/engine-consumer-coverage.json');

const MESSAGES = {
  unknown: 'No verified compatibility evidence is recorded for this feature.',
  unsupported: 'This feature is not supported by the project engine target.',
  unverified: 'The feature is observed for this engine build but is not locally verified.',
  conflicting: 'Compatibility sources disagree. Review the recorded evidence before use.',
  removed: 'This feature was removed from the project engine target.',
  fallback: 'A verified compatibility fallback is available for this project target.',
  supported: 'This feature is supported by the project engine target.',
  changed: 'This feature is supported, but its behavior changed for the project engine target.',
  deprecated: 'This feature is supported but deprecated for the project engine target.'
};

function decision(catalog, target, capabilityId, options = {}) {
  const result = engine.capabilityStatus(catalog, target, capabilityId, options.projectId), status = result.status;
  const enabled = ['supported', 'fallback', 'changed', 'deprecated'].includes(status);
  return { ...result, enabled, visible: enabled || Boolean(options.showOtherVersions), message: MESSAGES[status] || MESSAGES.unknown,
    requirement: result.capability?.buildIds?.length ? `Requires: ${result.capability.buildIds.join(', ')}` : '' };
}
function assertAllowed(catalog, target, capabilityId) {
  const result = decision(catalog, target, capabilityId, { showOtherVersions: true });
  if (!result.enabled) throw new Error(`${result.message}${result.requirement ? ` ${result.requirement}` : ''}`);
  return result;
}
function consumer(name) { return coverage.consumers[name] || { status: 'unknown', note: 'This consumer has not declared engine-target coverage.' }; }
function diagnostic(status) { return MESSAGES[status] || MESSAGES.unknown; }

module.exports = { MESSAGES, decision, assertAllowed, consumer, diagnostic };
