'use strict';

const controllerCatalog = require('../data/sctrl.json');
const { GROUPS: HITDEF_GROUPS } = require('./hitdef_model');
const { entryAvailable, enabledCapabilityIds } = require('./catalog_capability_filter');
const { controllerStringRequirement } = require('./analyzer');
const MAX_CONTACT_EXPRESSION_BYTES = 4096;
const IKEMEN_STABLE_CONTACT_FIELDS = new Set(['down.recover']);

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function hitDefMetadata(catalog = controllerCatalog) {
  return (Array.isArray(catalog) ? catalog : []).find(item => String(item?.name || '').toLowerCase() === 'hitdef') || { params: [] };
}

function valueStatus(expression) {
  if (!String(expression || '').trim()) return 'empty';
  if (/^[+-]?\d+$/.test(expression)) return 'integer';
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:\s*,\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+))*$/i.test(expression)) return 'literal';
  return 'dynamic';
}

function projectProjectileContactProperties(properties, projectileNames, capabilities = {}, catalog = controllerCatalog) {
  const projectile = projectileNames instanceof Set ? projectileNames : new Set(projectileNames || []);
  const parameters = (hitDefMetadata(catalog).params || []).map(parameter => ({ ...parameter, key: String(parameter.name || '').toLowerCase() })).filter(parameter => parameter.key && !projectile.has(parameter.key));
  const metadata = new Map(parameters.map(parameter => [parameter.key, parameter]));
  const authored = new Map();
  for (const property of properties || []) {
    const name = String(property?.normalized || '').toLowerCase();
    if (!metadata.has(name) || projectile.has(name)) continue;
    if (!authored.has(name)) authored.set(name, []);
    const rawExpression = String(property.expression || ''), oversized = Buffer.byteLength(rawExpression, 'utf8') > MAX_CONTACT_EXPRESSION_BYTES;
    authored.get(name).push({ authoredName: String(property.key || name), expression: oversized ? '' : rawExpression, oversized });
  }
  const vocabulary = new Map();
  for (const group of HITDEF_GROUPS) for (const name of group.names || []) vocabulary.set(String(name).toLowerCase(), { id: group.id, label: group.label });
  const fields = [], unresolved = [], recognizedNames = [];
  for (const parameter of parameters) {
    const occurrences = authored.get(parameter.key) || [];
    if (!occurrences.length) continue;
    recognizedNames.push(parameter.key);
    const group = vocabulary.get(parameter.key) || { id: 'other', label: 'Other documented contact options' };
    const requirements = [...new Map(occurrences.flatMap(item => [controllerStringRequirement('projectile', parameter.key, item.expression), controllerStringRequirement('hitdef', parameter.key, item.expression)]).filter(Boolean).map(item => [item.capabilityId, item])).values()];
    const directAvailable = entryAvailable(parameter, capabilities), enabled = enabledCapabilityIds(capabilities), missing = requirements.find(requirement => !enabled.has(requirement.capabilityId));
    if (!directAvailable || missing) {
      unresolved.push({ group: group.id, name: parameter.key, occurrences, status: 'capability-unavailable', capabilityId: String(missing?.capabilityId || parameter.capabilityId || ''), reason: 'This authored contact option requires a verified supporting engine capability.' });
      continue;
    }
    const status = occurrences.some(item => item.oversized) ? 'oversized' : occurrences.length > 1 ? 'duplicate' : valueStatus(occurrences[0].expression);
    const capabilityIds = [...new Set([String(parameter.capabilityId || ''), ...requirements.map(item => item.capabilityId)].filter(Boolean))];
    const stableExtension = IKEMEN_STABLE_CONTACT_FIELDS.has(parameter.key);
    fields.push({ group: group.id, name: parameter.key, authoredName: occurrences[0].authoredName, expression: occurrences.length === 1 ? occurrences[0].expression : '', occurrences, status, origin: stableExtension ? 'ikemen-extension' : capabilityIds.length ? 'capability' : 'classic', compatibilityLabel: capabilityIds.length ? `Verified capability · ${capabilityIds.join(', ')}` : stableExtension ? 'IKEMEN extension · Stable 1.0' : 'Classic MUGEN / IKEMEN' });
  }
  const groups = [...HITDEF_GROUPS.map(group => ({ id: group.id, label: group.label })), { id: 'other', label: 'Other documented contact options' }]
    .map(group => ({ ...group, fields: fields.filter(field => field.group === group.id), unresolved: unresolved.filter(field => field.group === group.id) }))
    .filter(group => group.fields.length || group.unresolved.length);
  return freeze({ schema: 'ikemaker.projectile-contact-projection', version: 1, status: 'ready', groups, fields, unresolved, recognizedNames });
}

module.exports = { MAX_CONTACT_EXPRESSION_BYTES, IKEMEN_STABLE_CONTACT_FIELDS, hitDefMetadata, valueStatus, projectProjectileContactProperties };
