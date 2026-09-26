'use strict';

const path = require('path');
const CURRENT_SCHEMA = 2;

function clean(value) { return String(value == null ? '' : value).trim(); }
function normalizeFile(item = {}) {
  const file = clean(item.file || item.path); if (!file) return null;
  return { file, kind:['text','auto',...Object.keys(require('./viewer_sessions').COMMANDS)].includes(item.kind)?item.kind:'auto',reference:item.reference&&typeof item.reference==='object'?JSON.parse(JSON.stringify(item.reference)):undefined, archiveContext:item.archiveContext&&typeof item.archiveContext==='object'?JSON.parse(JSON.stringify(item.archiveContext)):undefined, group: Math.max(1, Math.min(9, Math.floor(Number(item.group)) || 1)), active: Boolean(item.active), preview: Boolean(item.preview) };
}
function normalizePreset(raw = {}) {
  return { schemaVersion: CURRENT_SCHEMA, id: clean(raw.id || raw.name).toLowerCase().replace(/[^a-z0-9_.-]+/g, '-'), name: clean(raw.name || raw.id || 'Workspace'), files: (raw.files || []).map(normalizeFile).filter(Boolean), context: raw.context && typeof raw.context === 'object' ? raw.context : {}, createdAt: clean(raw.createdAt), updatedAt: clean(raw.updatedAt) };
}
function normalizeStore(raw = {}) {
  const presets = (raw.presets || []).map(normalizePreset).filter((item) => item.id), seen = new Set();
  return { schemaVersion: CURRENT_SCHEMA, presets: presets.filter((item) => seen.has(item.id) ? false : (seen.add(item.id), true)) };
}
function mapPaths(item, convert) {
  const result={...item,file:convert(item.file)};
  if(item.reference?.file)result.reference={...item.reference,file:convert(item.reference.file)};
  if(Array.isArray(item.reference?.extraFiles))result.reference={...result.reference,extraFiles:item.reference.extraFiles.map(convert)};
  if(Array.isArray(item.reference?.findings))result.reference={...result.reference,findings:item.reference.findings.map(finding=>({...finding,file:convert(finding.file)}))};
  if(item.archiveContext?.ownerDef)result.archiveContext={...item.archiveContext,ownerDef:convert(item.archiveContext.ownerDef)};
  return result;
}
function relativeFiles(preset, root) {
  const relative=file=>path.isAbsolute(file)?path.relative(root,file).replace(/\\/g,'/'):file;
  return normalizePreset({...preset,files:preset.files.map(item=>mapPaths(item,relative))});
}
function resolveFiles(preset, root) {
  const absolute=file=>path.isAbsolute(file)?file:path.resolve(root,file);
  return normalizePreset({...preset,files:preset.files.map(item=>mapPaths(item,absolute))});
}
function upsert(store, preset) { const value = normalizeStore(store), next = normalizePreset(preset); return { ...value, presets: [...value.presets.filter((item) => item.id !== next.id), next] }; }
function remove(store, id) { const value = normalizeStore(store); return { ...value, presets: value.presets.filter((item) => item.id !== id) }; }

module.exports = { CURRENT_SCHEMA, normalizeFile, normalizePreset, normalizeStore, relativeFiles, resolveFiles, upsert, remove };
