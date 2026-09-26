'use strict';

const path = require('path');

function slash(value) { return path.resolve(String(value || '.')).replace(/\\/g, '/'); }
function within(filename, root) { const file = `${slash(filename).toLowerCase()}/`, base = `${slash(root).toLowerCase().replace(/\/$/, '')}/`; return file.startsWith(base); }
function relativeTo(filename, root) { return within(filename, root) ? slash(filename).slice(slash(root).length).replace(/^\//, '') : ''; }

function matchedProject(filename, workspaceRoot, registry) {
  const candidates = [];
  for (const project of registry.projects || []) for (const root of project.roots || []) {
    const absolute = path.isAbsolute(root) ? root : path.resolve(registry.__root || workspaceRoot, root);
    if (within(filename, absolute)) candidates.push({ project, root: absolute, length: slash(absolute).length });
  }
  candidates.sort((a, b) => b.length - a.length);
  return candidates[0] || null;
}

function inferredProject(filename) {
  const normalized = slash(filename).toLowerCase();
  if (normalized.includes('/sf6template/') || normalized.includes('/sf6-test-project/')) return { id: 'sf6', name: 'SF6' };
  if (normalized.includes('/dstemplate/')) return { id: 'dsvssf', name: 'DS vs. SF' };
  if (normalized.includes('/ds4template/')) return { id: 'ds4', name: 'DS4' };
  if (normalized.includes('/hdbz') || normalized.includes('/templatez2/')) return { id: 'hdbz', name: 'HDBZ' };
  return { id: 'universal', name: 'Universal Template' };
}

function inferCharacter(filename, workspaceRoot, registry, projectId) {
  const normalized = slash(filename).toLowerCase();
  const configured = (registry.characters || []).find((item) => {
    const def = item.def && (path.isAbsolute(item.def) ? item.def : path.resolve(registry.__root || workspaceRoot, item.def));
    return def && within(filename, path.dirname(def));
  });
  if (configured) return { id: configured.id, name: configured.name, projectId: configured.projectId, source: 'registry' };
  const marker = '/chars/', index = normalized.lastIndexOf(marker);
  if (index >= 0) { const rest = slash(filename).slice(index + marker.length), name = rest.split('/')[0]; if (name && name.toLowerCase() !== 'template') return { id: name.toLowerCase(), name, source: 'path' }; }
  return null;
}

function configuredValue(filename, workspaceRoot, rules) {
  if (!rules || typeof rules !== 'object' || Array.isArray(rules)) return '';
  const relative = relativeTo(filename, workspaceRoot).toLowerCase(), candidates = Object.entries(rules).map(([prefix, ownership]) => ({ prefix: String(prefix).replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase(), ownership: String(ownership) })).filter((item) => relative === item.prefix || relative.startsWith(`${item.prefix.replace(/\/$/, '')}/`)).sort((a, b) => b.prefix.length - a.prefix.length);
  return candidates[0]?.ownership || '';
}
function configuredOwnership(filename, workspaceRoot, registry) { return configuredValue(filename, registry?.__root || workspaceRoot, registry?.assets?.ownership); }
function configuredProject(filename, workspaceRoot, registry) { const id = configuredValue(filename, registry?.__root || workspaceRoot, registry?.assets?.projects).toLowerCase(); return (registry?.projects || []).find((item) => item.id === id) || null; }
function ownershipFor(filename, workspaceRoot, project, character, registry) {
  const configured = configuredOwnership(filename, workspaceRoot, registry); if (configured) return configured;
  const normalized = slash(filename).toLowerCase(), relative = relativeTo(filename, workspaceRoot).toLowerCase();
  if (normalized.includes('/.ikemen-tools/') || normalized.includes('/development/') || normalized.includes('/tools/') || normalized.includes('/outputs/') || /(^|\/)generated(\/|$)/.test(relative)) return 'tooling-generated';
  if (character) return 'character';
  if (project && project.id !== 'universal') return 'game';
  return 'universal';
}

function assetType(filename) {
  const ext = path.extname(filename).toLowerCase();
  return ({ '.sff': 'Sprites', '.air': 'Animations', '.snd': 'Sound', '.act': 'Palette', '.zss': 'Code', '.cns': 'Constants', '.inp': 'Commands', '.cmd': 'Legacy Commands', '.jnp': 'Commands', '.def': 'Definition', '.lua': 'Lua', '.md': 'Documentation', '.json': 'Metadata' })[ext] || (ext ? ext.slice(1).toUpperCase() : 'Folder');
}

function contextFor(filename, workspaceRoot, registry) {
  const match = matchedProject(filename, workspaceRoot, registry), inferred = inferredProject(filename);
  // The default registry owns "." as Universal so shared template files have a
  // safe fallback. That broad root must not hide a more specific game identity
  // that is evident from the path when a game has not created its registry yet.
  let project = configuredProject(filename, workspaceRoot, registry)
    || (match && match.project.id !== 'universal' ? match.project : null)
    || (inferred.id !== 'universal' ? inferred : null)
    || (match ? match.project : inferred);
  const character = inferCharacter(filename, workspaceRoot, registry, project.id);
  if (character?.projectId) project = (registry.projects || []).find((item) => item.id === character.projectId) || project;
  return { project, character, engineTarget: require('./engine_registry_model').normalizeTarget(project?.engineTarget), ownership: ownershipFor(filename, workspaceRoot, project, character, registry), assetType: assetType(filename), filename: path.basename(filename), relativePath: relativeTo(filename, workspaceRoot) || filename };
}

function label(context) { return [context.project?.name || 'Unknown project', context.character?.name || 'Shared', context.assetType, context.filename].filter(Boolean).join(' › '); }

module.exports = { within, relativeTo, matchedProject, inferredProject, inferCharacter, configuredOwnership, configuredProject, ownershipFor, assetType, contextFor, label };
