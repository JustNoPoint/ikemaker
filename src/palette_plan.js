'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { transactionalWrite } = require('./mutation_safety');

function sha256File(filename) { return crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex').toUpperCase(); }
function safePart(value) { return String(value || '').replace(/[^a-z0-9._-]+/gi, '_').replace(/^_+|_+$/g, '') || 'archive'; }

function palettePlanLocation(sffPath) {
  const absolute = path.resolve(sffPath); let root = path.dirname(absolute), current = root;
  while (true) {
    if (fs.existsSync(path.join(current, 'Ikemen_GO.exe')) || fs.existsSync(path.join(current, 'external', 'script', 'main.lua'))) { root = current; break; }
    const parent = path.dirname(current); if (parent === current) break; current = parent;
  }
  let relative = path.relative(root, absolute); if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) relative = path.basename(absolute);
  const parts = relative.split(/[\\/]+/).map(safePart); parts[parts.length - 1] = `${safePart(path.basename(parts[parts.length - 1], path.extname(parts[parts.length - 1])))}.json`;
  return path.join(root, '.ikemen-tools', 'palette-plans', ...parts);
}

function readPalettePlan(sffPath) {
  const filename = palettePlanLocation(sffPath);
  if (!fs.existsSync(filename)) return { version: 3, sourceSff: path.resolve(sffPath), palettes: [], shifts: [] };
  const plan = JSON.parse(fs.readFileSync(filename, 'utf8').replace(/^\uFEFF/, ''));
  if (![1, 2, 3].includes(plan.version) || !Array.isArray(plan.palettes)) throw new Error('Palette build plan has an unsupported format.');
  return {
    ...plan,
    version: 3,
    shifts: Array.isArray(plan.shifts) ? plan.shifts.map((entry) => ({ ...entry, group: Number(entry.group), start: Number(entry.start), amount: Number(entry.amount) || 1 })) : [],
    palettes: plan.palettes.map((entry) => ({ kind: entry.kind || 'source', ...entry }))
  };
}

function writePalettePlan(sffPath, plan) {
  const filename = palettePlanLocation(sffPath);
  transactionalWrite(fs, filename, `${JSON.stringify({ version: 3, sourceSff: path.resolve(sffPath), palettes: plan.palettes || [], shifts: plan.shifts || [] }, null, 2)}\n`, { label: 'palette-build-plan' }); return filename;
}

function paletteId(group, number) { return `${Number(group)},${Number(number)}`; }
function validCoordinate(value) { return Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 65535; }
function applyPaletteShifts(group, number, shifts = []) { let g = Number(group), n = Number(number); for (const shift of shifts || []) if (g === Number(shift.group) && n >= Number(shift.start)) n += Number(shift.amount) || 1; return { group: g, number: n }; }
function shiftedOccupied(occupiedIds, shifts) { return (occupiedIds || []).map((id) => { const match = /^(\d+),(\d+)$/.exec(String(id)); if (!match) return String(id); const value = applyPaletteShifts(match[1], match[2], shifts); return paletteId(value.group, value.number); }); }

function assertDestination(group, number, occupiedIds, plan) {
  if (!validCoordinate(group) || !validCoordinate(number)) throw new Error('Palette group and number must be whole values from 0 through 65535.');
  const id = paletteId(group, number);
  if (occupiedIds.includes(id) || plan.palettes.some((entry) => paletteId(entry.group, entry.number) === id)) throw new Error(`Palette ID ${id} already exists or is staged.`);
  return id;
}

function stagePalette(sffPath, source, group, number, occupiedIds = [], metadata = {}) {
  const file = path.resolve(source), g = Number(group), n = Number(number);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile() || !/\.(?:act|png)$/i.test(file)) throw new Error('Staged palette source must be an existing ACT or indexed PNG file.');
  const plan = readPalettePlan(sffPath); assertDestination(g, n, shiftedOccupied(occupiedIds, plan.shifts), plan);
  const parent = metadata.variantOf && validCoordinate(metadata.variantOf.group) && validCoordinate(metadata.variantOf.number)
    ? { variantOf: { group: Number(metadata.variantOf.group), number: Number(metadata.variantOf.number) } }
    : {};
  const tableOrder = metadata.tableOrder === 'reversed' ? 'reversed' : 'index';
  plan.palettes.push({ kind: 'source', group: g, number: n, source: file, sourceSHA256: sha256File(file), name: path.basename(file), tableOrder, ...parent, stagedAt: new Date().toISOString() });
  plan.palettes.sort((a, b) => a.group - b.group || a.number - b.number); const filename = writePalettePlan(sffPath, plan);
  return { filename, plan };
}

function stagePaletteAlias(sffPath, group, number, targetGroup, targetNumber, occupiedIds = []) {
  const g = Number(group), n = Number(number), tg = Number(targetGroup), tn = Number(targetNumber), plan = readPalettePlan(sffPath);
  const effectiveOccupied = shiftedOccupied(occupiedIds, plan.shifts), id = assertDestination(g, n, effectiveOccupied, plan), target = paletteId(tg, tn);
  if (!validCoordinate(tg) || !validCoordinate(tn)) throw new Error('Alias target group and number must be whole values from 0 through 65535.');
  if (id === target) throw new Error('A palette cannot alias itself.');
  const available = new Set([...effectiveOccupied, ...plan.palettes.map((entry) => paletteId(entry.group, entry.number))]);
  if (!available.has(target)) throw new Error(`Alias target palette ${target} does not exist or is not staged.`);
  plan.palettes.push({ kind: 'alias', group: g, number: n, targetGroup: tg, targetNumber: tn, name: `Alias of ${target}`, stagedAt: new Date().toISOString() });
  plan.palettes.sort((a, b) => a.group - b.group || a.number - b.number); const filename = writePalettePlan(sffPath, plan);
  return { filename, plan };
}

function paletteInsertionPreview(sffPath, group, number, occupiedIds = []) {
  const g = Number(group), n = Number(number), plan = readPalettePlan(sffPath);
  if (!validCoordinate(g) || !validCoordinate(n) || n >= 65535) throw new Error('Insertion palette group and number must be whole values from 0 through 65534.');
  const current = shiftedOccupied(occupiedIds, plan.shifts).map((id) => id.split(',').map(Number)).concat(plan.palettes.map((entry) => [Number(entry.group), Number(entry.number)]));
  const shifted = current.filter(([pg,pn]) => pg === g && pn >= n).sort((a,b) => b[1]-a[1]).map(([pg,pn]) => ({ from: { group: pg, number: pn }, to: { group: pg, number: pn + 1 } }));
  if (shifted.some((entry) => entry.to.number > 65535)) throw new Error(`Palette group ${g} has no room to shift upward.`);
  return { group: g, number: n, shifted };
}

function stagePaletteInsertion(sffPath, source, group, number, occupiedIds = []) {
  const file = path.resolve(source), preview = paletteInsertionPreview(sffPath, group, number, occupiedIds), plan = readPalettePlan(sffPath);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile() || !/\.(?:act|png)$/i.test(file)) throw new Error('Inserted palette source must be an existing ACT or indexed PNG file.');
  for (const entry of plan.palettes) {
    if (Number(entry.group) === preview.group && Number(entry.number) >= preview.number) entry.number = Number(entry.number) + 1;
    if (entry.kind === 'alias' && Number(entry.targetGroup) === preview.group && Number(entry.targetNumber) >= preview.number) entry.targetNumber = Number(entry.targetNumber) + 1;
    if (entry.variantOf && Number(entry.variantOf.group) === preview.group && Number(entry.variantOf.number) >= preview.number) entry.variantOf.number = Number(entry.variantOf.number) + 1;
  }
  const insertionId = crypto.randomUUID();
  plan.shifts.push({ id: insertionId, group: preview.group, start: preview.number, amount: 1, stagedAt: new Date().toISOString() });
  plan.palettes.push({ kind: 'source', group: preview.group, number: preview.number, source: file, sourceSHA256: sha256File(file), name: path.basename(file), inserted: true, insertionId, stagedAt: new Date().toISOString() });
  plan.palettes.sort((a,b) => a.group-b.group || a.number-b.number);
  return { filename: writePalettePlan(sffPath, plan), plan, preview };
}

function removeStagedPalette(sffPath, group, number) {
  const plan = readPalettePlan(sffPath), before = plan.palettes.length, removed = plan.palettes.find((entry) => entry.group === Number(group) && entry.number === Number(number));
  if (removed?.inserted) {
    const shiftIndex = plan.shifts.findIndex((entry) => entry.id === removed.insertionId);
    if (shiftIndex !== plan.shifts.length - 1) throw new Error('Remove newer inserted palettes first so palette shifts can be reversed safely.');
    const shift = plan.shifts[shiftIndex]; plan.shifts.pop();
    for (const entry of plan.palettes) if (entry !== removed) {
      if (Number(entry.group) === shift.group && Number(entry.number) > shift.start) entry.number = Number(entry.number) - 1;
      if (entry.kind === 'alias' && Number(entry.targetGroup) === shift.group && Number(entry.targetNumber) > shift.start) entry.targetNumber = Number(entry.targetNumber) - 1;
      if (entry.variantOf && Number(entry.variantOf.group) === shift.group && Number(entry.variantOf.number) > shift.start) entry.variantOf.number = Number(entry.variantOf.number) - 1;
    }
  }
  plan.palettes = plan.palettes.filter((entry) => entry.group !== Number(group) || entry.number !== Number(number));
  if (plan.palettes.length === before) return { removed: false, filename: palettePlanLocation(sffPath), plan };
  return { removed: true, filename: writePalettePlan(sffPath, plan), plan };
}

function verifyPalettePlan(sffPath, occupiedIds = []) {
  const plan = readPalettePlan(sffPath);
  const entries = new Map(plan.palettes.map((entry) => [paletteId(entry.group, entry.number), entry]));
  const available = new Set([...shiftedOccupied(occupiedIds, plan.shifts), ...entries.keys()]);
  for (const entry of plan.palettes) {
    if (entry.kind === 'alias') {
      const target = paletteId(entry.targetGroup, entry.targetNumber);
      if (!available.has(target)) throw new Error(`Staged palette alias ${paletteId(entry.group, entry.number)} points to missing palette ${target}.`);
      const seen = new Set([paletteId(entry.group, entry.number)]); let current = target;
      while (entries.get(current)?.kind === 'alias') {
        if (seen.has(current)) throw new Error(`Circular staged palette alias involving ${current}.`);
        seen.add(current); const next = entries.get(current); current = paletteId(next.targetGroup, next.targetNumber);
      }
      continue;
    }
    if (!fs.existsSync(entry.source)) throw new Error(`Staged palette source is missing: ${entry.source}`);
    if (sha256File(entry.source) !== entry.sourceSHA256) throw new Error(`Staged palette changed after approval: ${entry.source}. Remove and stage it again.`);
  }
  return plan;
}

module.exports = { palettePlanLocation, readPalettePlan, stagePalette, stagePaletteAlias, stagePaletteInsertion, paletteInsertionPreview, applyPaletteShifts, removeStagedPalette, verifyPalettePlan, sha256File, paletteId };
