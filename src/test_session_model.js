'use strict';

const fs = require('fs');
const path = require('path');

const SCOPE_KINDS = Object.freeze(['universal-engine', 'shared-template', 'game-profile', 'character-family', 'character', 'move-system', 'bug-regression', 'platform-build']);

function normalizeProfile(value) { return String(value || 'default').trim().toLowerCase() || 'default'; }
function normalizeScope(scope) {
  const kind = SCOPE_KINDS.includes(scope?.kind) ? scope.kind : 'universal-engine';
  return { kind, value: String(scope?.value || (kind === 'universal-engine' ? 'ikemen-1.0' : '')).trim().toLowerCase() };
}
function normalizeTest(test, suiteId, index) {
  return {
    id: String(test?.id || `${suiteId}-test-${index + 1}`),
    name: String(test?.name || `Test ${index + 1}`),
    instruction: String(test?.instruction || ''),
    evidenceMask: Math.max(0, Number(test?.evidenceMask) || 0),
    criteria: Array.isArray(test?.criteria) ? test.criteria.map(String) : [],
    participants: String(test?.participants || '')
  };
}
function normalizeSuite(suite, index) {
  const id = String(suite?.id || `suite-${index + 1}`);
  return {
    id,
    name: String(suite?.name || id),
    description: String(suite?.description || ''),
    scope: normalizeScope(suite?.scope),
    tags: Array.isArray(suite?.tags) ? suite.tags.map(String) : [],
    tests: (Array.isArray(suite?.tests) ? suite.tests : []).map((test, testIndex) => normalizeTest(test, id, testIndex))
  };
}
function normalizeCatalog(catalog) {
  return {
    schemaVersion: 1,
    profiles: (Array.isArray(catalog?.profiles) ? catalog.profiles : []).map(profile => ({ id: normalizeProfile(profile.id), name: String(profile.name || profile.id), description: String(profile.description || '') })),
    suites: (Array.isArray(catalog?.suites) ? catalog.suites : []).map(normalizeSuite),
    diagnostics: (Array.isArray(catalog?.diagnostics) ? catalog.diagnostics : []).map((item, index) => ({ id: String(item.id || `diagnostic-${index + 1}`), name: String(item.name || item.id), function: String(item.function || ''), args: Array.isArray(item.args) ? item.args : [], help: String(item.help || '') }))
  };
}
function appliesTo(suite, profile, context = {}) {
  const scope = normalizeScope(suite.scope), selected = normalizeProfile(profile);
  if (scope.kind === 'universal-engine' || scope.kind === 'shared-template') return true;
  if (scope.kind === 'game-profile') return scope.value === selected;
  const values = Array.isArray(context[scope.kind]) ? context[scope.kind] : [context[scope.kind]];
  return values.filter(Boolean).map(value => String(value).toLowerCase()).includes(scope.value);
}
function validateCatalog(catalog) {
  const issues = [], ids = new Set();
  for (const suite of normalizeCatalog(catalog).suites) {
    if (ids.has(suite.id)) issues.push(`Duplicate suite id: ${suite.id}`); ids.add(suite.id);
    if (!suite.tests.length) issues.push(`Suite has no tests: ${suite.id}`);
    if (suite.scope.kind !== 'universal-engine' && !suite.scope.value) issues.push(`Suite scope needs a value: ${suite.id}`);
  }
  return issues;
}
function mergeCatalogs(...catalogs) {
  const normalized = catalogs.filter(Boolean).map(normalizeCatalog), profiles = new Map(), suites = new Map(), diagnostics = new Map();
  for (const catalog of normalized) {
    for (const item of catalog.profiles) profiles.set(item.id, item);
    for (const item of catalog.suites) suites.set(item.id, item);
    for (const item of catalog.diagnostics) diagnostics.set(item.id, item);
  }
  return { schemaVersion: 1, profiles: [...profiles.values()], suites: [...suites.values()], diagnostics: [...diagnostics.values()] };
}
function loadProjectCatalogs(root) {
  const directory = path.join(root, '.ikemen', 'tests');
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory).filter(name => name.toLowerCase().endsWith('.json')).sort().map(name => {
    const filename = path.join(directory, name);
    try { return { filename, catalog: JSON.parse(fs.readFileSync(filename, 'utf8')), error: '' }; }
    catch (error) { return { filename, catalog: null, error: error.message }; }
  });
}
function sessionPlan(catalog, options = {}) {
  const profile = normalizeProfile(options.profile), suiteIds = new Set(options.suiteIds || []), context = options.context || {};
  const suites = normalizeCatalog(catalog).suites.filter(suite => appliesTo(suite, profile, context) && (!suiteIds.size || suiteIds.has(suite.id)));
  return {
    schemaVersion: 1,
    id: String(options.id || `session-${Date.now()}`),
    kind: options.kind === 'diagnostic' ? 'diagnostic' : 'test',
    profile,
    character: String(options.character || ''),
    stage: String(options.stage || ''),
    createdAt: new Date().toISOString(),
    tests: suites.flatMap(suite => suite.tests.map(test => ({ ...test, suiteId: suite.id, suiteName: suite.name, scope: suite.scope }))),
    diagnostics: normalizeCatalog(catalog).diagnostics
  };
}
function legacyChecklist(text, options = {}) {
  const tests = [], defaultParticipants = String(options.participants || 'P1 and P2: current character mirror');
  let participants = defaultParticipants;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const declared = /^\s*@participants:\s*(.+)$/i.exec(raw);
    if (declared) { participants = declared[1].trim(); continue; }
    const match = /^\s*@logger-test:\s*(\d+)\|([^|]+)\|(.+)$/i.exec(raw);
    if (!match) continue;
    tests.push({ id: `${String(options.id || 'imported')}-${tests.length + 1}`, name: match[2].trim(), instruction: match[3].trim(), evidenceMask: Number(match[1]), participants });
  }
  return normalizeSuite({ id: String(options.id || 'imported-checklist'), name: String(options.name || 'Imported checklist'), description: `Imported from ${options.source || 'legacy @logger-test records'}.`, scope: options.scope || { kind: 'game-profile', value: options.profile || 'default' }, tests }, 0);
}

module.exports = { SCOPE_KINDS, normalizeProfile, normalizeScope, normalizeCatalog, normalizeSuite, appliesTo, validateCatalog, mergeCatalogs, loadProjectCatalogs, sessionPlan, legacyChecklist };
