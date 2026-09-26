'use strict';

const engineRegistry = require('./engine_registry_model');
const CURRENT_SCHEMA = 4;
const OWNERSHIP = ['universal', 'game', 'character', 'tooling-generated'];
const VALIDATION_LEVELS = ['error', 'warning', 'convention', 'suggestion'];
const DISTRIBUTION_INTENTS = ['hobby', 'commercial', 'undecided'];
const CONTENT_BASES = ['original', 'licensed', 'fan-project', 'mixed'];
const WORK_PROJECT_TYPES = ['character', 'stage', 'screenpack', 'game-system', 'assets', 'tooling', 'other'];
const DEFAULT_JOB_CLASSES = ['Director', 'Coder', 'Animator', 'CS', 'Palette', 'Sound', 'Voice', 'QA', 'Stage', 'Screenpack'];

function clean(value) { return String(value == null ? '' : value).trim(); }
function unique(values) { return [...new Set((values || []).map(clean).filter(Boolean))]; }

function migrate(raw = {}) {
  const source = raw && typeof raw === 'object' ? JSON.parse(JSON.stringify(raw)) : {};
  const from = Number(source.schemaVersion) || 1;
  if (from > CURRENT_SCHEMA) throw new Error(`Project registry schema ${from} is newer than this extension supports (${CURRENT_SCHEMA}).`);
  if (from < 2) {
    source.projects = Array.isArray(source.projects) ? source.projects : source.games || [];
    source.characters = Array.isArray(source.characters) ? source.characters : [];
    source.assets = source.assets && typeof source.assets === 'object' ? source.assets : {};
    source.validation = source.validation && typeof source.validation === 'object' ? source.validation : {};
    source.schemaVersion = 2;
    delete source.games;
  }
  if (from < 3) {
    source.workProjects = Array.isArray(source.workProjects) ? source.workProjects : [];
    source.teams = Array.isArray(source.teams) ? source.teams : [];
    source.schemaVersion = 3;
  }
  if (from < 4) source.schemaVersion = 4;
  return source;
}

function normalizeProject(item = {}) {
  return {
    id: clean(item.id).toLowerCase(), name: clean(item.name || item.id), roots: unique(item.roots),
    workflowProfile: clean(item.workflowProfile), sourceAuthority: clean(item.sourceAuthority),
    completionModel: clean(item.completionModel),
    distributionIntent: DISTRIBUTION_INTENTS.includes(clean(item.distributionIntent).toLowerCase()) ? clean(item.distributionIntent).toLowerCase() : 'undecided',
    contentBasis: CONTENT_BASES.includes(clean(item.contentBasis).toLowerCase()) ? clean(item.contentBasis).toLowerCase() : 'mixed',
    sourceResearch: Boolean(item.sourceResearch), ownership: 'game',
    engineTarget: engineRegistry.normalizeTarget(item.engineTarget),
    engineAdoptionHistory: Array.isArray(item.engineAdoptionHistory) ? item.engineAdoptionHistory.map((entry) => ({
      adoptedAt: clean(entry.adoptedAt) || null,
      previousTarget: engineRegistry.normalizeTarget(entry.previousTarget),
      newTarget: engineRegistry.normalizeTarget(entry.newTarget),
      catalogRevision: Math.max(0, Number(entry.catalogRevision) || 0),
      migrationRecord: clean(entry.migrationRecord), verificationSummary: clean(entry.verificationSummary)
    })) : []
  };
}

function normalizeCharacter(item = {}) {
  return {
    id: clean(item.id).toLowerCase(), name: clean(item.name || item.id), projectId: clean(item.projectId).toLowerCase(),
    def: clean(item.def), aliases: unique(item.aliases), baseline: clean(item.baseline), ownership: 'character'
  };
}

function normalizeMember(member = {}, index = 0) {
  const name = clean(member.name) || `Member ${index + 1}`;
  const handle = (clean(member.handle) || name.replace(/\s+/g, '')).replace(/^@/, '');
  return {
    id: clean(member.id).toLowerCase() || handle.toLowerCase(), name, handle,
    jobClasses: unique(member.jobClasses || member.roles).filter(Boolean),
    active: member.active !== false
  };
}

function normalizeTeam(item = {}, index = 0) {
  return {
    id: clean(item.id).toLowerCase() || `team-${index + 1}`,
    name: clean(item.name || item.id) || `Team ${index + 1}`,
    jobClasses: unique(item.jobClasses || item.roles || DEFAULT_JOB_CLASSES),
    members: (item.members || item.team || []).map(normalizeMember)
  };
}

function normalizeWorkProject(item = {}, index = 0) {
  const type = clean(item.type).toLowerCase();
  return {
    id: clean(item.id).toLowerCase() || `work-${index + 1}`,
    name: clean(item.name || item.id) || `Work Project ${index + 1}`,
    root: clean(item.root),
    type: WORK_PROJECT_TYPES.includes(type) ? type : 'other',
    gameId: clean(item.gameId || (Array.isArray(item.gameIds) ? item.gameIds[0] : '')).toLowerCase(),
    teamId: clean(item.teamId).toLowerCase(),
    archived: Boolean(item.archived)
  };
}

function normalize(raw = {}) {
  const value = migrate(raw);
  return {
    schemaVersion: CURRENT_SCHEMA,
    registryVersion: Math.max(1, Number(value.registryVersion) || 1),
    name: clean(value.name || 'IKEMEN Project Registry'),
    projects: (value.projects || []).map(normalizeProject).filter((item) => item.id),
    workProjects: (value.workProjects || []).map(normalizeWorkProject).filter((item) => item.id),
    teams: (value.teams || []).map(normalizeTeam).filter((item) => item.id),
    characters: (value.characters || []).map(normalizeCharacter).filter((item) => item.id),
    aliases: value.aliases && typeof value.aliases === 'object' ? value.aliases : {},
    assets: value.assets && typeof value.assets === 'object' ? value.assets : {},
    requirements: value.requirements && typeof value.requirements === 'object' ? value.requirements : {},
    sffBuildProfiles: value.sffBuildProfiles && typeof value.sffBuildProfiles === 'object' ? value.sffBuildProfiles : {},
    appearances: value.appearances && typeof value.appearances === 'object' ? value.appearances : {},
    palettes: value.palettes && typeof value.palettes === 'object' ? value.palettes : {},
    sounds: value.sounds && typeof value.sounds === 'object' ? value.sounds : {},
    attacks: value.attacks && typeof value.attacks === 'object' ? value.attacks : {},
    workflow: value.workflow && typeof value.workflow === 'object' ? value.workflow : {},
    validation: {
      enabledLevels: unique(value.validation?.enabledLevels || VALIDATION_LEVELS).filter((item) => VALIDATION_LEVELS.includes(item)),
      disabledConventionRules: unique(value.validation?.disabledConventionRules)
    }
  };
}

function validate(raw = {}) {
  const registry = normalize(raw), issues = [];
  const duplicates = (items, label) => {
    const seen = new Set();
    for (const item of items) { if (seen.has(item.id)) issues.push({ level: 'error', code: `duplicate-${label}`, message: `Duplicate ${label} id: ${item.id}` }); seen.add(item.id); }
  };
  duplicates(registry.projects, 'project'); duplicates(registry.characters, 'character');
  duplicates(registry.workProjects, 'work-project'); duplicates(registry.teams, 'team');
  const projects = new Set(registry.projects.map((item) => item.id));
  const teams = new Set(registry.teams.map((item) => item.id));
  for (const character of registry.characters) if (character.projectId && !projects.has(character.projectId)) issues.push({ level: 'warning', code: 'missing-character-project', message: `${character.name} refers to unknown project ${character.projectId}.` });
  for (const item of raw.workProjects || []) if (Array.isArray(item.gameIds) && item.gameIds.filter(Boolean).length > 1) issues.push({ level: 'error', code: 'multiple-work-project-games', message: `${clean(item.name || item.id) || 'A work project'} assigns more than one game. Only one game may be authoritative.` });
  for (const item of registry.workProjects) {
    if (item.gameId && !projects.has(item.gameId)) issues.push({ level: 'warning', code: 'missing-work-project-game', message: `${item.name} refers to unknown game ${item.gameId}.` });
    if (item.teamId && !teams.has(item.teamId)) issues.push({ level: 'warning', code: 'missing-work-project-team', message: `${item.name} refers to unknown team ${item.teamId}.` });
  }
  for (const team of registry.teams) {
    const handles = new Set();
    for (const member of team.members) {
      const handle = member.handle.toLowerCase();
      if (handles.has(handle)) issues.push({ level: 'error', code: 'duplicate-team-handle', message: `${team.name} has duplicate handle @${member.handle}.` });
      handles.add(handle);
    }
  }
  if (!registry.validation.enabledLevels.length) issues.push({ level: 'warning', code: 'validation-disabled', message: 'Every validation level is disabled.' });
  return { registry, issues };
}

function createDefault() {
  return normalize({ name: 'IKEMEN Project Registry', projects: [
    { id: 'universal', name: 'Universal Template', roots: ['.', 'chars/template'], completionModel: 'Reusable mechanisms only; no game policy.' },
    { id: 'sf6', name: 'SF6', roots: ['SF6template', 'chars/template/SF6template'], sourceAuthority: 'Street Fighter 6 with documented deviations.', completionModel: 'Source reproduction, evidence, deviations, QA, and owner signoff.' },
    { id: 'dsvssf', name: 'DS vs. SF', roots: ['DStemplate', 'chars/template/DStemplate'], sourceAuthority: 'Vampire Savior systems; DS restoration and SF what-if reimagining.', completionModel: 'Vampire Savior parity review plus owner signoff.' },
    { id: 'ds4', name: 'DS4', roots: ['DS4template', 'chars/template/DS4template'], sourceAuthority: 'Vampire Savior foundation with approved sequel deviations.', completionModel: 'Foundation-complete then DS4 design-complete.' },
    { id: 'hdbz', name: 'HDBZ', roots: ['HDBZ', 'chars/HDBZ', 'chars/template/templateZ2'], sourceAuthority: 'Finished vanilla HDBZ MUGEN behavior.', completionModel: 'Close conversion plus documented widescreen/system deviations.' }
  ] });
}

// New public workspaces start neutral. createDefault remains the non-persistent
// inference catalog used when older workspaces have not created metadata yet.
function createStarter() {
  return normalize({ name: 'IKEMEN Project Registry', projects: [
    { id: 'universal', name: 'Universal Template', roots: ['.'], completionModel: 'Reusable mechanisms only; no game policy.' }
  ] });
}

module.exports = { CURRENT_SCHEMA, OWNERSHIP, VALIDATION_LEVELS, DISTRIBUTION_INTENTS, CONTENT_BASES, WORK_PROJECT_TYPES, DEFAULT_JOB_CLASSES, migrate, normalize, normalizeProject, normalizeWorkProject, normalizeTeam, normalizeMember, validate, createDefault, createStarter };
