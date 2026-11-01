'use strict';

const metadataRegistry = require('./metadata_registry');
const projectContext = require('./project_context_model');

function supportsDummyCollision(target = {}) {
  const channel = String(target.channel || '').trim().toLowerCase();
  const version = String(target.version || '').trim().toLowerCase();
  return channel === 'nightly' || version === 'nightly';
}

function availabilityForFile(filename) {
  try {
    const registryFile = metadataRegistry.find(filename);
    if (!registryFile) return { enabled: false, projectId: '', target: null, reason: 'No project engine target is assigned.' };
    const loaded = metadataRegistry.read(registryFile);
    const context = projectContext.contextFor(filename, loaded.root, loaded.registry);
    const enabled = supportsDummyCollision(context.engineTarget);
    return {
      enabled,
      projectId: context.project?.id || '',
      target: context.engineTarget,
      reason: enabled ? 'Dummy collision is available for this project Nightly target.' : 'Dummy collision requires a project assigned to IKEMEN Nightly.'
    };
  } catch (error) {
    return { enabled: false, projectId: '', target: null, reason: `Project engine target could not be verified: ${error.message}` };
  }
}

module.exports = { supportsDummyCollision, availabilityForFile };
