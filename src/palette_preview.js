'use strict';

const fs = require('fs');
const path = require('path');
const { transactionalWrite } = require('./mutation_safety');

function cleanValue(value) { return String(value || '').replace(/\s*;.*$/, '').trim().replace(/^['"]|['"]$/g, ''); }

function defCandidates(assetPath) {
  const found = [];
  let directory = path.dirname(assetPath);
  for (let depth = 0; depth < 4; depth += 1) {
    if (!fs.existsSync(directory)) break;
    for (const name of fs.readdirSync(directory)) if (/\.def$/i.test(name)) found.push(path.join(directory, name));
    const parent = path.dirname(directory); if (parent === directory) break; directory = parent;
  }
  return found;
}

function characterDefForSff(sffPath) {
  const wanted = path.resolve(sffPath).toLowerCase();
  for (const filename of defCandidates(sffPath)) {
    const text = fs.readFileSync(filename, 'utf8'), match = /^\s*sprite\s*=\s*(.+?)\s*$/im.exec(text);
    if (!match) continue;
    const resolved = path.resolve(path.dirname(filename), cleanValue(match[1])).toLowerCase();
    if (resolved === wanted) return { filename, text };
  }
  return null;
}

function paletteIndexById(archive, group, number) {
  const palette = (archive.palettes || []).find((item) => item.group === Number(group) && item.number === Number(number));
  return palette ? palette.index : null;
}

function assignedDefault(archive, sffPath, knownDef) {
  const character = knownDef || characterDefForSff(sffPath);
  let number = 1;
  if (character) {
    const match = /^\s*pal\.defaults\s*=\s*(.+?)\s*$/im.exec(character.text);
    const first = match && cleanValue(match[1]).split(',').map((item) => Number(item.trim())).find((item) => Number.isInteger(item) && item >= 0);
    if (Number.isInteger(first)) number = first;
  }
  let index = paletteIndexById(archive, 1, number);
  if (index === null) index = paletteIndexById(archive, 1, 1);
  if (index === null && archive.palettes && archive.palettes.length) index = archive.palettes[0].index;
  const palette = Number.isInteger(index) ? archive.palettes[index] : null;
  return { index: Number.isInteger(index) ? index : null, group: palette ? palette.group : 1, number: palette ? palette.number : number, defPath: character && character.filename || null };
}

function storage(sffPath, knownDef) {
  const character = knownDef || characterDefForSff(sffPath), root = character ? path.dirname(character.filename) : path.dirname(sffPath);
  return { root, filename: path.join(root, '.ikemen-tools', 'palette-preview.json'), key: path.relative(root, sffPath).replace(/\\/g, '/') };
}

function readStore(location) {
  let data = { version: 1, archives: {} };
  if (fs.existsSync(location.filename)) { try { data = JSON.parse(fs.readFileSync(location.filename, 'utf8')); } catch (_) {} }
  if (!data.archives || typeof data.archives !== 'object') data.archives = {};
  return data;
}

function idToIndex(archive, value, fallback) {
  if (!value || !Number.isInteger(Number(value.group)) || !Number.isInteger(Number(value.number))) return fallback;
  const index = paletteIndexById(archive, Number(value.group), Number(value.number)); return index === null ? fallback : index;
}

function previewPreferences(archive, sffPath, screen, knownDef) {
  const assigned = assignedDefault(archive, sffPath, knownDef), location = storage(sffPath, knownDef), data = readStore(location), record = data.archives[location.key] || {}, screens = record.screens || {}, groups = record.groups || {};
  const screenIndex = idToIndex(archive, screens[screen], assigned.index), groupIndices = {};
  for (const [group, value] of Object.entries(groups)) groupIndices[group] = idToIndex(archive, value, screenIndex);
  return { assignedDefault: assigned, screen, screenPaletteIndex: screenIndex, groupPaletteIndices: groupIndices, file: location.filename };
}

function savePreviewPreference(archive, sffPath, screen, scope, paletteIndex, spriteGroup, knownDef) {
  const palette = archive.palettes && archive.palettes[Number(paletteIndex)];
  if (!palette) throw new Error('The selected preview palette does not exist in this SFF.');
  const location = storage(sffPath, knownDef), data = readStore(location), record = data.archives[location.key] || (data.archives[location.key] = { screens: {}, groups: {} });
  if (!record.screens) record.screens = {}; if (!record.groups) record.groups = {};
  const value = { group: palette.group, number: palette.number };
  if (scope === 'screen') record.screens[screen] = value;
  else if (scope === 'group') record.groups[String(Number(spriteGroup))] = value;
  else throw new Error('Unknown palette preview scope.');
  transactionalWrite(fs, location.filename, `${JSON.stringify(data, null, 2)}\n`, { label: 'palette-preview-preference' });
  return previewPreferences(archive, sffPath, screen, knownDef);
}

function clearGroupPreviewPreference(archive, sffPath, screen, spriteGroup, knownDef) {
  const location = storage(sffPath, knownDef), data = readStore(location), record = data.archives[location.key];
  if (record && record.groups) delete record.groups[String(Number(spriteGroup))];
  transactionalWrite(fs, location.filename, `${JSON.stringify(data, null, 2)}\n`, { label: 'palette-preview-preference' });
  return previewPreferences(archive, sffPath, screen, knownDef);
}

module.exports = { characterDefForSff, paletteIndexById, assignedDefault, previewPreferences, savePreviewPreference, clearGroupPreviewPreference };
