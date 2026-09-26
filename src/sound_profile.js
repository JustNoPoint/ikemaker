'use strict';

const fs = require('fs');
const path = require('path');
const metadataRegistry = require('./metadata_registry');

const PROFILE_FILENAME = '.ikemen-sound-profile.json';
const ROLES = new Set(['voice', 'customVoice', 'characterFx', 'sharedFx', 'legacy']);
const RESERVED_PREFIXES = new Set(['F', 'S', 'M']);

function cleanId(value) { return String(value || '').trim().replace(/[^A-Za-z0-9_]/g, '').toUpperCase(); }
function prefixedValue(prefix, group, index) { return `${cleanId(prefix)}${Number(group)}, ${Number(index)}`; }
function template(characterId = 'CHAR') {
  const id = cleanId(characterId) || 'CHAR';
  const fileStem = String(characterId || 'CHAR').trim().replace(/[^A-Za-z0-9_-]/g, '') || 'CHAR';
  return {
    version: 1,
    characterId: id,
    characterDef: '',
    archives: [
      { id: 'fx', role: 'characterFx', prefix: `${id}FX`, snd: `${fileStem}_FX.snd`, fxDef: `${fileStem}_FX.def`, buildManifest: '' },
      { id: 'en', role: 'voice', language: 'en', default: true, prefix: `${id}EN`, snd: `voices/${fileStem}_en.snd`, fxDef: `voices/${fileStem}_en.def`, buildManifest: '' },
      { id: 'custom1', role: 'customVoice', language: 'custom', prefix: `${id}CUSTOM1`, snd: `voices/${fileStem}_custom1.snd`, fxDef: `voices/${fileStem}_custom1.def`, buildManifest: '' }
    ],
    events: []
  };
}

function locate(startPath) {
  const managed = metadataRegistry.resolve(startPath, 'sounds');
  if (managed && !managed.missing && managed.source !== managed.filename) return managed.source;
  let current = path.resolve(startPath || process.cwd());
  if (fs.existsSync(current) && fs.statSync(current).isFile()) current = path.dirname(current);
  while (true) { const candidate = path.join(current, PROFILE_FILENAME); if (fs.existsSync(candidate)) return candidate; const parent = path.dirname(current); if (parent === current) return null; current = parent; }
}

function validate(profile) {
  const errors = [], warnings = [], seenIds = new Set(), seenPrefixes = new Map(), characterId = cleanId(profile && profile.characterId);
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return { errors: ['Sound profile root must be an object.'], warnings };
  if (Number(profile.version) !== 1) errors.push('Sound profile version must be 1.');
  if (!characterId) errors.push('characterId must contain at least one letter, number, or underscore.');
  if (!Array.isArray(profile.archives) || !profile.archives.length) errors.push('At least one sound archive is required.');
  for (const archive of profile.archives || []) {
    const id = String(archive.id || '').trim(), prefix = cleanId(archive.prefix), role = String(archive.role || '');
    if (!id) errors.push('Every archive requires an id.'); else if (seenIds.has(id.toLowerCase())) errors.push(`Duplicate archive id: ${id}`); else seenIds.add(id.toLowerCase());
    if (!ROLES.has(role)) errors.push(`${id || 'Archive'} has unsupported role ${role || '(empty)'}.`);
    if (!archive.snd) errors.push(`${id || 'Archive'} requires a relative snd path.`);
    else if (path.isAbsolute(archive.snd) || path.win32.isAbsolute(archive.snd)) errors.push(`${id || 'Archive'} snd path must remain relative for portability.`);
    if (!archive.fxDef) errors.push(`${id || 'Archive'} requires a relative CommonFX def path.`);
    else if (path.isAbsolute(archive.fxDef) || path.win32.isAbsolute(archive.fxDef)) errors.push(`${id || 'Archive'} CommonFX def path must remain relative for portability.`);
    if (archive.buildManifest && (path.isAbsolute(archive.buildManifest) || path.win32.isAbsolute(archive.buildManifest))) errors.push(`${id || 'Archive'} build manifest path must remain relative for portability.`);
    if (!prefix) errors.push(`${id || 'Archive'} requires an alphanumeric prefix.`);
    else if (RESERVED_PREFIXES.has(prefix)) errors.push(`${id || 'Archive'} uses reserved prefix ${prefix}.`);
    else if (seenPrefixes.has(prefix)) errors.push(`Prefix ${prefix} is shared by ${seenPrefixes.get(prefix)} and ${id}.`);
    else { seenPrefixes.set(prefix, id); if (characterId && !prefix.startsWith(characterId)) warnings.push(`${id} prefix ${prefix} is not character-qualified with ${characterId}; CommonFX prefixes are global.`); }
    if (role === 'voice' && !archive.language) warnings.push(`${id} is a voice archive without language metadata.`);
  }
  const eventIds = new Set();
  for (const event of profile.events || []) {
    const group = Number(event.group), index = Number(event.index), identity = `${group},${index}`;
    if (!Number.isInteger(group) || !Number.isInteger(index) || group < 0 || index < 0) errors.push(`Invalid sound event ${identity}.`);
    else if (eventIds.has(identity)) errors.push(`Duplicate event contract ${identity}.`); else eventIds.add(identity);
    if (!String(event.name || '').trim()) warnings.push(`Sound event ${identity} has no readable name.`);
  }
  return { errors, warnings };
}

function read(filename) { const profile = JSON.parse(fs.readFileSync(filename, 'utf8').replace(/^\uFEFF/, '')); const result = validate(profile); if (result.errors.length) throw new Error(result.errors.join('\n')); return { filename, root: path.dirname(filename), profile, ...result }; }
function resolveArchive(root, archive) { return { ...archive, sndPath: path.resolve(root, archive.snd), fxDefPath: path.resolve(root, archive.fxDef), buildManifestPath: archive.buildManifest ? path.resolve(root, archive.buildManifest) : null }; }
function fxDefText(archive) { const snd = archive.sndPath && archive.fxDefPath ? path.relative(path.dirname(archive.fxDefPath), archive.sndPath) : path.basename(String(archive.snd || '')); return `[Info]\nprefix = ${cleanId(archive.prefix)}\n\n[Files]\nsnd = ${snd.replace(/\\/g, '/')}\n`; }
function eventMap(profile) { return new Map((profile.events || []).map((event) => [`${Number(event.group)},${Number(event.index)}`, event])); }
function setEvent(profile, group, index, values = {}) {
  if (!Array.isArray(profile.events)) profile.events = [];
  const at = profile.events.findIndex((event) => Number(event.group) === Number(group) && Number(event.index) === Number(index));
  const next = { ...(at >= 0 ? profile.events[at] : {}), group: Number(group), index: Number(index), ...values };
  if (at >= 0) profile.events[at] = next; else profile.events.push(next);
  profile.events.sort((a, b) => Number(a.group) - Number(b.group) || Number(a.index) - Number(b.index));
  return next;
}

function contractAudit(profile, loadedArchives) {
  const issues = [], contracts = eventMap(profile);
  const voices = loadedArchives.filter((item) => ['voice', 'customVoice'].includes(String((item.definition || {}).role)));
  const canonical = voices.find((item) => item.definition && item.definition.default) || voices.find((item) => item.definition && item.definition.role === 'voice') || null;
  const canonicalSet = canonical && new Set(canonical.archive.entries.filter((entry) => entry.duplicateOf === null).map((entry) => entry.identity));
  for (const item of loadedArchives) {
    const archive = item.archive || item, definition = item.definition || {}, present = new Set(archive.entries.filter((entry) => entry.duplicateOf === null).map((entry) => entry.identity));
    if (['voice', 'customVoice'].includes(definition.role)) for (const [identity, event] of contracts) if (event.role === 'voice' && !present.has(identity)) issues.push(`${definition.id || archive.filename}: missing voice event ${identity} (${event.name || 'unnamed'}).`);
    for (const entry of archive.entries) if (!contracts.has(entry.identity)) issues.push(`${definition.id || archive.filename}: ${entry.identity} is not named in the profile.`);
    if (canonicalSet && ['voice', 'customVoice'].includes(definition.role) && item !== canonical) {
      for (const identity of canonicalSet) if (!present.has(identity)) issues.push(`${definition.id || archive.filename}: missing ${identity} required by default voice archive ${canonical.definition.id}.`);
      for (const identity of present) if (!canonicalSet.has(identity)) issues.push(`${definition.id || archive.filename}: extra ${identity} is absent from default voice archive ${canonical.definition.id}.`);
    }
  }
  return issues;
}

function sndMakerText(outputPath, entries) {
  const lines = [String(outputPath)];
  for (const entry of entries) lines.push(String(entry.source), String(Number(entry.group)), String(Number(entry.index)));
  return `${lines.join('\r\n')}\r\n`;
}

module.exports = { PROFILE_FILENAME, ROLES, RESERVED_PREFIXES, cleanId, prefixedValue, template, locate, validate, read, resolveArchive, fxDefText, eventMap, setEvent, contractAudit, sndMakerText };
