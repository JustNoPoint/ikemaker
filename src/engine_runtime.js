'use strict';

const path = require('path');
const locator = require('./engine_locator');
const projectContext = require('./project_context_ui');
const contextModel = require('./project_context_model');
const engineModel = require('./engine_registry_model');

const INSTALLED_ENGINE_KEY = 'ikemenZss.installedEngineRegistry.v1';
let extensionContext = null;
function initialize(context) { extensionContext = context; }
function targetFor(root, sourcePath = '') {
  const loaded = projectContext.readRegistry(root);
  const probe = sourcePath || path.join(root, 'data', 'system.def');
  const context = contextModel.contextFor(probe, root, loaded.registry);
  return { target: engineModel.normalizeTarget(context.engineTarget), project: context.project, loaded };
}
function resolve(root, configured = '', sourcePath = '') {
  const binding = targetFor(root, sourcePath);
  const installed = extensionContext?.globalState.get(INSTALLED_ENGINE_KEY, {}) || {};
  return locator.targetEnginePath(root, configured, binding.target, installed);
}

module.exports = { INSTALLED_ENGINE_KEY, initialize, targetFor, resolve };
