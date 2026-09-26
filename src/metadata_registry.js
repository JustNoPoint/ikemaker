'use strict';

const fs = require('fs');
const path = require('path');
const projectRegistry = require('./project_registry');

const REGISTRY_PARTS = ['.ikemen', 'project-registry.json'];
const LEGACY_NAMES = {
  aliases: '.ikemen-sff-aliases.json',
  requirements: '.ikemen-character-requirements.json',
  sffBuildProfiles: '.ikemen-sff-build-profile.json',
  sounds: '.ikemen-sound-profile.json',
  palettes: 'palette-preview.json',
  workflow: 'workflow-settings.json'
};
function find(startPath) {
  let current = path.resolve(startPath || process.cwd());
  try { if (fs.statSync(current).isFile()) current = path.dirname(current); } catch (_) {}
  while (true) {
    const candidates = [path.join(current, ...REGISTRY_PARTS), path.join(current, 'chars', 'template', ...REGISTRY_PARTS)];
    for (const candidate of candidates) if (fs.existsSync(candidate)) return candidate;
    // A workspace can contain more than one complete IKEMEN game (for example,
    // a disposable SF6 project nested inside an HDBZ test copy). Metadata must
    // never leak across that boundary. Check the game root's own registry
    // locations above, then stop instead of inheriting a parent game's registry.
    if (fs.existsSync(path.join(current, 'Ikemen_GO.exe')) || fs.existsSync(path.join(current, 'external', 'script', 'main.lua'))) return null;
    const parent = path.dirname(current); if (parent === current) return null; current = parent;
  }
}
function read(filename) { const raw = JSON.parse(fs.readFileSync(filename, 'utf8').replace(/^\uFEFF/, '')), root = path.dirname(path.dirname(filename)), validated = projectRegistry.validate(raw); Object.defineProperty(validated.registry, '__root', { value: root, enumerable: false }); return { filename, root, ...validated }; }
function selection(domain, selector = {}) {
  if (!domain || typeof domain !== 'object' || Array.isArray(domain)) return domain;
  const character = selector.characterId && domain.characters && domain.characters[selector.characterId];
  const project = selector.projectId && domain.projects && domain.projects[selector.projectId];
  return character !== undefined ? character : project !== undefined ? project : domain.default !== undefined ? domain.default : ('$ref' in domain ? domain : null);
}
function resolve(startPath, name, selector = {}) {
  const filename = find(startPath); if (!filename) return null;
  const loaded = read(filename), chosen = selection(loaded.registry[name], selector); if (chosen == null) return null;
  if (chosen && typeof chosen === 'object' && typeof chosen.$ref === 'string') {
    const source = path.resolve(loaded.root, chosen.$ref); if (!fs.existsSync(source)) return { ...loaded, name, source, missing: true, value: null };
    return { ...loaded, name, source, missing: false, value: JSON.parse(fs.readFileSync(source, 'utf8').replace(/^\uFEFF/, '')) };
  }
  return { ...loaded, name, source: filename, missing: false, value: chosen };
}
function relativeReference(registryFilename, source) { return path.relative(path.dirname(path.dirname(registryFilename)), source).replace(/\\/g, '/'); }
function indexLegacySources(registryFilename, rawRegistry, filenames = []) {
  const registry = projectRegistry.normalize(rawRegistry), indexed = [], conflicts = [];
  for (const [domain, basename] of Object.entries(LEGACY_NAMES)) {
    const matches = filenames.filter((item) => path.basename(item).toLowerCase() === basename.toLowerCase()); if (!matches.length) continue;
    if (matches.length > 1) { conflicts.push({ domain, files: matches, reason: 'More than one candidate requires character/project classification.' }); continue; }
    const current = registry[domain];
    if (current && Object.keys(current).length) { conflicts.push({ domain, files: matches, reason: 'Registry domain already has authoritative content.' }); continue; }
    registry[domain] = { default: { $ref: relativeReference(registryFilename, matches[0]) } }; indexed.push({ domain, file: matches[0] });
  }
  return { registry, indexed, conflicts };
}

module.exports = { REGISTRY_PARTS, LEGACY_NAMES, find, read, selection, resolve, relativeReference, indexLegacySources };
