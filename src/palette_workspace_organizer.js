'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  decodePng, inventory, inventoryColors, paletteConstructionDraft, finalized,
  indexedPng, exportArtifacts
} = require('./palette_index_organizer_model');

function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
function semanticDraft(entries) {
  return (entries || []).slice(0, 1024).map(item => ({
    id: String(item.id || ''), category: String(item.category || 'Unassigned').slice(0, 120),
    label: String(item.label || '').slice(0, 500)
  })).filter(item => item.id);
}
function applySemanticDraft(model, draft) {
  if (!draft?.length) return model;
  const byId = new Map(draft.map(item => [item.id, item]));
  return { ...model, entries: model.entries.map(entry => byId.has(entry.id) ? { ...entry, ...byId.get(entry.id) } : entry) };
}
function sourceFingerprint(source = {}) {
  const files = source.originalFiles || source.files || [];
  if (!files.length && !source.sff) return '';
  const hash = crypto.createHash('sha256');
  hash.update(source.sourceKind === 'sff' ? `sff:${path.resolve(source.sff).toLowerCase()}:${source.paletteIndex}:${source.paletteSignature || ''}` : `png:${files.length}:`);
  for (const file of files) { hash.update(`${file.buffer.length}:`); hash.update(file.buffer); }
  return hash.digest('hex');
}
function loadPngPaths(filenames, expectedFingerprint = '') {
  if (!Array.isArray(filenames) || !filenames.length || filenames.some(filename => typeof filename !== 'string' || !fs.existsSync(filename) || !fs.statSync(filename).isFile())) return null;
  const files = filenames.map(filename => ({ path: path.resolve(filename), name: path.basename(filename), buffer: fs.readFileSync(filename) }));
  const state = { files, originalFiles: null, construction: null, sourceKind: 'png', sff: null, paletteIndex: null, paletteSignature: null };
  state.fingerprint = sourceFingerprint(state);
  if (expectedFingerprint && state.fingerprint !== expectedFingerprint) return null;
  files.forEach(file => decodePng(file.buffer));
  state.model = inventory(files);
  return state;
}
function acceptDroppedPngs(items, limit = 64 * 1024 * 1024) {
  if (!Array.isArray(items) || !items.length) throw new Error('No PNG artwork was dropped.');
  let total = 0;
  const files = items.map((item, index) => {
    const name = path.basename(String(item?.name || `Dropped_${index + 1}.png`));
    if (!/\.png$/i.test(name)) throw new Error(`${name} is not a PNG file.`);
    const buffer = Buffer.from(String(item?.base64 || ''), 'base64'); total += buffer.length;
    if (total > limit) throw new Error('Dropped PNG artwork exceeds the 64 MB safety limit. Use Open PNG artwork instead.');
    decodePng(buffer); return { path: '', name, buffer };
  });
  const state = { files, originalFiles: null, construction: null, sourceKind: 'png-memory', sff: null, paletteIndex: null, paletteSignature: null, durable: false };
  state.fingerprint = sourceFingerprint(state); state.model = inventory(files); return state;
}
function loadSffPalette(filename, paletteIndex, expectedSignature, readSff, paletteRgba) {
  if (!filename || !fs.existsSync(filename) || !Number.isInteger(Number(paletteIndex)) || Number(paletteIndex) < 0) return null;
  const archive = readSff(filename), index = Number(paletteIndex); if (!archive.palettes[index]) return null;
  const colors = paletteRgba(archive, index), signature = crypto.createHash('sha256').update(JSON.stringify(colors)).digest('hex');
  if (expectedSignature && signature !== expectedSignature) return null;
  return { files: [], originalFiles: null, construction: null, sourceKind: 'sff', sff: path.resolve(filename), paletteIndex: index, paletteSignature: signature, fingerprint: signature, model: inventoryColors(colors, path.basename(filename)), durable: true };
}
function stableReference(state = {}) {
  if (state.sourceKind === 'sff' && state.sff) return { sourceKind: 'sff', paletteIndex: state.paletteIndex, paletteSignature: state.paletteSignature };
  const files = state.originalFiles || state.files || [];
  if (!files.length || files.some(file => !file.path)) return null;
  return { sourceKind: 'png', files: files.map(file => file.path), fingerprint: sourceFingerprint({ ...state, files }), construction: state.construction ? clone(state.construction) : null };
}
function createConstructionDraft(state, options = {}) {
  if (!state?.files?.length || state.sourceKind === 'sff') throw new Error('Open PNG artwork before creating a conversion draft.');
  const originals = state.originalFiles || state.files, draft = paletteConstructionDraft(originals, options);
  return { ...state, originalFiles: originals, files: draft.files, sourceKind: 'quantized-draft', construction: { targetColors: draft.targetColors, alphaMode: draft.alphaMode, sourceColors: draft.sourceColors, resultColors: draft.resultColors }, model: inventory(draft.files) };
}
function resetConstructionDraft(state) {
  if (!state?.originalFiles) return state;
  return { ...state, files: state.originalFiles, originalFiles: null, construction: null, sourceKind: 'png', model: inventory(state.originalFiles) };
}
function validateEntries(state, entries, options = {}) {
  if (!state?.model?.safeExact) throw new Error(state?.model?.recommendation || 'The palette source is not safe to export.');
  if (!Array.isArray(entries) || entries.length !== state.model.entries.length) throw new Error('The organizer table is incomplete. Reload the source.');
  const expected = new Set(state.model.entries.map(item => item.id));
  if (entries.some(item => !expected.has(item.id))) throw new Error('The organizer table no longer matches the source.');
  return finalized(entries, options);
}
function exportWritePlan(state, entries, name, folder, options = {}) {
  validateEntries(state, entries, options);
  const safeName = String(name || 'Organized_Palette').replace(/[^A-Za-z0-9._-]+/g, '_'), root = path.join(path.resolve(folder), safeName), indexedRoot = path.join(root, 'Indexed_PNG'), out = exportArtifacts(entries, safeName, options);
  const writes = [[path.join(root, `${safeName}.json`), out.json], [path.join(root, `${safeName}.csv`), out.csv], [path.join(root, `${safeName}.act`), out.act], [path.join(root, `${safeName}_Photoshop.aco`), out.aco], [path.join(root, `${safeName}_Aseprite.gpl`), out.gpl], [path.join(root, `${safeName}_Indexed_Swatch.png`), out.swatch]];
  for (const file of state.files || []) writes.push([path.join(indexedRoot, `${path.basename(file.name, '.png')}_Indexed.png`), indexedPng(decodePng(file.buffer), entries, options)]);
  return { root, indexedRoot, writes, ordered: out.ordered };
}
function exportCollectiveContractPlan(state, entries, ignoredColorIds, name, folder, options = {}) {
  if(!Array.isArray(entries)||entries.length!==state?.model?.entries?.length)throw new Error('The organizer table is incomplete. Reload the source.');const expected=new Set(state.model.entries.map(item=>item.id));if(entries.some(item=>!expected.has(item.id)))throw new Error('The organizer table no longer matches the source.'); const ignored=new Set(ignoredColorIds||[]),included=entries.filter(entry=>!ignored.has(entry.id));if(!included.length)throw new Error('Every collective color is ignored; there is no palette contract to export.');
  const safeName=String(name||'Organized_Palette').replace(/[^A-Za-z0-9._-]+/g,'_'),root=path.join(path.resolve(folder),safeName),out=exportArtifacts(included,safeName,options),writes=[[path.join(root,`${safeName}.json`),out.json],[path.join(root,`${safeName}.csv`),out.csv],[path.join(root,`${safeName}.act`),out.act],[path.join(root,`${safeName}_Photoshop.aco`),out.aco],[path.join(root,`${safeName}_Aseprite.gpl`),out.gpl],[path.join(root,`${safeName}_Indexed_Swatch.png`),out.swatch],[path.join(root,`${safeName}_IGNORED_SOURCE_COLORS.json`),Buffer.from(`${JSON.stringify({schema:'ikemaker.palette-ignored-source-colors',version:1,ignoredColorIds:[...ignored]},null,2)}\n`)]];
  return{root,indexedRoot:null,writes,ordered:out.ordered,indexedImagesOmitted:true};
}

module.exports = { semanticDraft, applySemanticDraft, sourceFingerprint, loadPngPaths, acceptDroppedPngs, loadSffPalette, stableReference, createConstructionDraft, resetConstructionDraft, validateEntries, exportWritePlan, exportCollectiveContractPlan };
