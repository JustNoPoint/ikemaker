'use strict';

const bundledControllers = require('../data/sctrl.json');
const bundledTriggers = require('../data/triggers.json');
const {normalizeTriggerCatalog} = require('./trigger_catalog_normalization');
const {zssControllerName} = require('./sctrl');

// Keep stable references for providers registered before the scheduled update.
const controllers = [], triggers = [];
const controllerByName = new Map(), triggerByName = new Map();

function withBundled(bundled, cached) {
  const saved = Array.isArray(cached) ? cached.filter(entry => typeof entry?.name === 'string' && entry.name.trim()) : [];
  return require('./upstream_catalog_discovery').merge(saved, [], bundled).catalog;
}

function apply(controllerRows, triggerRows) {
  const nextControllers = withBundled(bundledControllers, controllerRows);
  const nextTriggers = normalizeTriggerCatalog(withBundled(bundledTriggers, triggerRows));
  controllers.splice(0, controllers.length, ...nextControllers);
  triggers.splice(0, triggers.length, ...nextTriggers);
  controllerByName.clear();
  triggerByName.clear();
  for (const entry of controllers) {
    controllerByName.set(entry.name.toLowerCase(), entry);
    controllerByName.set(zssControllerName(entry.name).toLowerCase(), entry);
  }
  for (const entry of triggers) triggerByName.set(entry.name.toLowerCase(), entry);
}

apply();
module.exports = {controllers, triggers, controllerByName, triggerByName, apply};
