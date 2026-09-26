'use strict';

const fs = require('fs');
const path = require('path');
const { parseDef, sections, value, unquote } = require('../src/def_model');
const { readSff, friendlyVersion } = require('../src/sff_reader');
const { parseAirInventory } = require('../src/requirements');

function resolveEntry(folder, files, key) { const entry = unquote(value(files, key, '')); return entry ? path.resolve(folder, entry.replace(/[\\/]/g, path.sep)) : ''; }
function audit(defPath) {
  const filename = path.resolve(defPath), folder = path.dirname(filename), text = fs.readFileSync(filename, 'utf8'), document = parseDef(text, filename), files = sections(document, 'Files')[0];
  if (!files) throw new Error('Character DEF has no [Files] section.');
  const keys = ['sprite', 'anim', 'sound', 'cmd', 'cns', 'st', 'st1', 'st2', 'st3', 'st4', 'st5', 'st6', 'st7', 'st8', 'st9', 'fx'];
  const assets = keys.map((key) => ({ key, filename: resolveEntry(folder, files, key) })).filter((item) => item.filename).map((item) => ({ ...item, exists: fs.existsSync(item.filename), bytes: fs.existsSync(item.filename) ? fs.statSync(item.filename).size : 0 }));
  const sprite = assets.find((item) => item.key === 'sprite' && item.exists), anim = assets.find((item) => item.key === 'anim' && item.exists);
  let sff = null, air = null;
  if (sprite) { const archive = readSff(sprite.filename); sff = { version: friendlyVersion(archive.header.version), rawVersion: archive.header.version, sprites: archive.sprites.length, palettes: archive.palettes.length, duplicateIds: archive.sprites.length - new Set(archive.sprites.map((item) => `${item.group},${item.number}`)).size }; }
  if (anim) { const actions = parseAirInventory(fs.readFileSync(anim.filename, 'utf8')); air = { actions: actions.size, emptyActions: [...actions.values()].filter((item) => !item.frames.length).map((item) => item.number) }; }
  const manualGates = ['Source/deviation ledger review', 'Visual SFF/AIR alignment and palette review', 'Live IKEMEN behavior and logger tests', 'Reusable lesson packet', 'JustNoPoint/JNP owner sign-off'];
  return { schemaVersion: 1, characterDef: filename, assets, sff, air, findings: assets.filter((item) => !item.exists).map((item) => ({ level: 'error', message: `Missing ${item.key}: ${item.filename}` })), manualGates };
}

if (require.main === module) {
  try { if (!process.argv[2]) throw new Error('Usage: node tools/baseline-rehearsal-audit.js <character.def>'); console.log(JSON.stringify(audit(process.argv[2]), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { audit };
