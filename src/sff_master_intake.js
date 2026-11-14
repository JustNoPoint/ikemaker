'use strict';
const { decodePng } = require('./palette_index_organizer_model');
const { encodeIndexed } = require('./sff_palette_remap');
const key = rgba => rgba.join(',');
function analyzeExactMaster(buffers, colors) {
  if (!Array.isArray(colors) || colors.length !== 256 || colors.some(row => !Array.isArray(row) || row.length !== 4) || colors[0][3] !== 0) throw Error('The indexing master must contain 256 RGBA entries with transparent index 0.');
  const candidates = new Map(), used = new Map();
  colors.forEach((rgba, index) => { if (index && rgba[3] > 0) { const id = key(rgba); if (!candidates.has(id)) candidates.set(id, []); candidates.get(id).push(index); } });
  const images = buffers.map(buffer => decodePng(buffer));
  images.forEach((image, imageIndex) => { for (let at = 0; at < image.rgba.length; at += 4) {
    const rgba = [...image.rgba.subarray(at, at + 4)]; if (!rgba[3]) continue;
    const id = key(rgba); if (!used.has(id)) used.set(id, { rgba, pixels: 0, images: new Set(), candidates: candidates.get(id) || [] });
    const row = used.get(id); row.pixels++; row.images.add(imageIndex);
  } });
  const rows = [...used].map(([id, row]) => ({ id, ...row, images: [...row.images] }));
  return { images, colors, rows, ambiguities: rows.filter(row => row.candidates.length > 1), unmatched: rows.filter(row => !row.candidates.length) };
}
function materializeExactMaster(plan, decisions = {}) {
  if (plan.unmatched.length) throw Error(`${plan.unmatched.length} used source color(s) do not exactly match the master. No nearest-color remap was performed. Choose Needs Palette for deliberate color review or True Color to preserve the source.`);
  const assigned = new Map();
  for (const row of plan.rows) {
    const index = row.candidates.length === 1 ? row.candidates[0] : decisions[row.id];
    if (!Number.isInteger(index) || !row.candidates.includes(index)) throw Error(`Choose the intended master index for used color ${row.id}; eligible indexes: ${row.candidates.join(', ')}.`);
    assigned.set(row.id, index);
  }
  return plan.images.map(image => {
    const indices = Buffer.alloc(image.width * image.height);
    for (let at = 0, pixel = 0; at < image.rgba.length; at += 4, pixel++) indices[pixel] = image.rgba[at + 3] ? assigned.get(key([...image.rgba.subarray(at, at + 4)])) : 0;
    return encodeIndexed(image.width, image.height, indices, plan.colors);
  });
}
async function reviewExactMaster(api, buffers, colors, paletteId, options = {}) {
  const plan = analyzeExactMaster(buffers, colors), decisions = {};
  if (plan.unmatched.length) { materializeExactMaster(plan); }
  if(options.interactive===false&&plan.ambiguities.length)throw Error('Used colors match multiple master indexes. Review the master index choices before Write SFF; no index was guessed and nothing was written.');
  for (const row of plan.ambiguities) {
    const selected = await api.window.showQuickPick(row.candidates.map(index => ({ label: `Master index ${index}`, description: `RGBA ${row.id}; ${row.pixels} pixel(s) in ${row.images.length} image(s); apply this exact-color choice across this batch`, index })), { title: `Palette ${paletteId}: choose the intended index for this used color`, placeHolder: 'Equal RGB does not prove the intended color-separation role. Cancel leaves the batch unchanged.' });
    if (!selected) return null;
    decisions[row.id] = selected.index;
  }
  return { buffers: materializeExactMaster(plan, decisions), decisions, usedColors: plan.rows.length, ambiguousColors: plan.ambiguities.length };
}
async function prepareMasterAdmission(api, targetFilename, admission, assertCurrent, options = {}) {
  const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto'), reader = require('./sff_reader');
  const paletteId = admission.palette.slice(7), archive = reader.readSff(targetFilename), matches = archive.palettes.filter(row => `${row.group},${row.number}` === paletteId);
  if (matches.length !== 1) throw Error('The selected master must resolve to exactly one embedded palette.');
  const colors = reader.paletteRgba(archive, matches[0].index), mapped = await reviewExactMaster(api, admission.admittedBuffers, colors, paletteId, options);
  if (!mapped) return null;
  assertCurrent();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-master-intake-'));
  try {
    const paths = mapped.buffers.map((buffer, index) => { const filename = path.join(directory, `mapped_${String(index).padStart(5, '0')}.png`); fs.writeFileSync(filename, buffer, {flag:'wx'}); return filename; });
    return { ...admission, paths, admittedBuffers: mapped.buffers, paletteMode: 'target', paletteId, sourceProvenance: admission.sourceProvenance.map(row => ({ ...row, exactMaster: { id: paletteId, colorHash: crypto.createHash('sha256').update(JSON.stringify(colors)).digest('hex'), decisions: mapped.decisions } })), dispose() { fs.rmSync(directory, {recursive:true,force:true}); } };
  } catch (error) { fs.rmSync(directory, {recursive:true,force:true}); throw error; }
}
module.exports = { analyzeExactMaster, materializeExactMaster, reviewExactMaster, prepareMasterAdmission };
