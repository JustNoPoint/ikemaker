'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { transactionalWrite } = require('./mutation_safety');
const { pngPaletteRgba } = require('./palette_library');
const { readAct } = require('./act_palette_order');

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
  if (!fs.existsSync(filename)) return { version: 4, sourceSff: path.resolve(sffPath), palettes: [], shifts: [] };
  const plan = JSON.parse(fs.readFileSync(filename, 'utf8').replace(/^\uFEFF/, ''));
  if (![1, 2, 3, 4].includes(plan.version) || !Array.isArray(plan.palettes)) throw new Error('Palette build plan has an unsupported format.');
  return {
    ...plan,
    version: 4,
    shifts: Array.isArray(plan.shifts) ? plan.shifts.map((entry) => ({ ...entry, group: Number(entry.group), start: Number(entry.start), amount: Number(entry.amount) || 1 })) : [],
    palettes: plan.palettes.map((entry) => ({ kind: entry.kind || 'source', ...entry }))
  };
}

function writePalettePlan(sffPath, plan) {
  const filename = palettePlanLocation(sffPath);
  transactionalWrite(fs, filename, `${JSON.stringify({ ...plan, version: 4, sourceSff: path.resolve(sffPath), palettes: plan.palettes || [], shifts: plan.shifts || [] }, null, 2)}\n`, { label: 'palette-build-plan' }); return filename;
}

function paletteId(group, number) { return `${Number(group)},${Number(number)}`; }
function validCoordinate(value) { return Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 65535; }
function applyPaletteShifts(group, number, shifts = []) { let g = Number(group), n = Number(number); for (const shift of shifts || []) if (g === Number(shift.group) && n >= Number(shift.start)) n += Number(shift.amount) || 1; return { group: g, number: n }; }
function shiftedOccupied(occupiedIds, shifts) { return (occupiedIds || []).map((id) => { const match = /^(\d+),(\d+)$/.exec(String(id)); if (!match) return String(id); const value = applyPaletteShifts(match[1], match[2], shifts); return paletteId(value.group, value.number); }); }

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function paletteColorSignature(colors) {
  if (!Array.isArray(colors) || colors.length !== 256) throw new Error('Duplicate comparison requires exactly 256 normalized RGBA colors.');
  return crypto.createHash('sha256').update(Buffer.from(colors.flatMap((color, index) => [0, 1, 2, 3].map((channel) => {
    const value = Number(color && color[channel]);
    return Number.isFinite(value) ? Math.max(0, Math.min(255, Math.round(value))) : (channel === 3 && index !== 0 ? 255 : 0);
  })))).digest('hex').toUpperCase();
}

function duplicatePaletteClusters(existing = [], incoming = []) {
  const groups = new Map();
  for (const item of [...existing.map((entry) => ({ ...entry, incoming: false })), ...incoming.map((entry) => ({ ...entry, incoming: true }))]) {
    const signature = paletteColorSignature(item.colors), key = `${Number(item.group)}:${signature}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ ...item, signature, colors: undefined });
  }
  return [...groups.values()].filter((cluster) => cluster.length > 1 && cluster.some((item) => item.incoming));
}

function stagedPaletteColorInventory(plan, embedded = []) {
  const inventory = embedded.map((item) => ({ ...item })), colors = new Map(inventory.map((item) => [paletteId(item.group, item.number), item.colors])), entries = new Map((plan.palettes || []).map((entry) => [paletteId(entry.group, entry.number), entry]));
  for (const entry of (plan.palettes || []).filter((item) => item.kind !== 'alias')) { const data = fs.readFileSync(entry.source), value = /\.png$/i.test(entry.source) ? pngPaletteRgba(data) : readAct(data, entry.tableOrder); colors.set(paletteId(entry.group, entry.number), value); inventory.push({ label: `Staged ${entry.name}`, group: entry.group, number: entry.number, colors: value }); }
  function resolve(entry, seen = new Set()) { const id = paletteId(entry.group, entry.number); if (colors.has(id)) return colors.get(id); if (seen.has(id)) return null; seen.add(id); const targetId = paletteId(entry.targetGroup, entry.targetNumber), target = entries.get(targetId), value = colors.get(targetId) || (target?.kind === 'alias' ? resolve(target, seen) : null); if (value) colors.set(id, value); return value; }
  for (const entry of (plan.palettes || []).filter((item) => item.kind === 'alias')) { const value = resolve(entry); if (value) inventory.push({ label: `Staged alias ${entry.group},${entry.number}`, group: entry.group, number: entry.number, colors: value }); }
  return inventory;
}

function batchPalettePreflight(sffPath, request = {}) {
  const plan = readPalettePlan(sffPath), group = Number(request.group), incoming = Array.isArray(request.incoming) ? request.incoming : [];
  if (!validCoordinate(group)) throw new Error('Palette group must be a whole value from 0 through 65535.');
  if (!incoming.length) throw new Error('Choose at least one palette to add.');
  const normalized = incoming.map((entry, index) => {
    const source = path.resolve(String(entry.source || ''));
    if (!fs.existsSync(source) || !fs.statSync(source).isFile() || !/\.(?:act|png)$/i.test(source)) throw new Error(`Palette ${index + 1} must be an existing ACT or indexed PNG file.`);
    const tableOrder = /\.png$/i.test(source) ? 'index' : (entry.tableOrder === 'reversed' ? 'reversed' : 'index'), data = fs.readFileSync(source), colors = /\.png$/i.test(source) ? pngPaletteRgba(data) : readAct(data, tableOrder);
    return { kind: 'source', source, sourceSHA256: sha256File(source), name: entry.name || path.basename(source), tableOrder, colors, colorSignature: paletteColorSignature(colors), sourceOrder: index };
  });
  const occupied = shiftedOccupied(request.occupiedIds || [], plan.shifts).map((id) => id.split(',').map(Number));
  const staged = plan.palettes.map((entry) => [Number(entry.group), Number(entry.number)]);
  const current = [...occupied, ...staged], mode = request.mode === 'insert' ? 'insert' : 'append';
  const groupNumbers = current.filter(([g]) => g === group).map(([, number]) => number);
  const start = mode === 'insert' ? Number(request.beforeNumber) : (groupNumbers.length ? Math.max(...groupNumbers) + 1 : 0);
  if (!validCoordinate(start)) throw new Error('The first palette number must be a whole value from 0 through 65535.');
  const lastIncoming = start + normalized.length - 1;
  if (lastIncoming > 65535) throw new Error(`The ${normalized.length}-palette batch does not fit in group ${group}.`);
  const shifted = mode === 'insert' ? current.filter(([g, number]) => g === group && number >= start).sort((a, b) => a[1] - b[1]).map(([g, number]) => ({ from: { group: g, number }, to: { group: g, number: number + normalized.length } })) : [];
  if (shifted.some((entry) => entry.to.number > 65535)) throw new Error(`Palette group ${group} has no room to shift upward by ${normalized.length}.`);
  const assigned = normalized.map((entry, index) => ({ ...entry, group, number: start + index }));
  const assignedIds = new Set(assigned.map((entry) => paletteId(entry.group, entry.number)));
  if (assignedIds.size !== assigned.length) throw new Error('The incoming palette batch contains duplicate destination IDs.');
  if (mode === 'append') {
    const occupiedSet = new Set(current.map(([g, number]) => paletteId(g, number)));
    const conflict = [...assignedIds].find((id) => occupiedSet.has(id));
    if (conflict) throw new Error(`Palette ID ${conflict} already exists or is staged.`);
  }
  const existingColors = Array.isArray(request.existingColors) ? request.existingColors : [];
  const duplicateInput = assigned.filter((entry) => Array.isArray(entry.colors)).map((entry) => ({ label: entry.name, group: entry.group, number: entry.number, colors: entry.colors, sourceOrder: entry.sourceOrder }));
  const duplicates = duplicatePaletteClusters(existingColors, duplicateInput);
  const publicAssigned = assigned.map(({ colors, ...entry }) => entry);
  return Object.freeze({
    version: 1, mode, group, start, amount: normalized.length, assigned: publicAssigned, shifted, duplicates,
    planSnapshot: JSON.stringify(plan), sourceSffSHA256: sha256File(sffPath), reviewedAt: new Date().toISOString()
  });
}

function stagePaletteBatch(sffPath, preflight) {
  if (!preflight || preflight.version !== 1 || !Array.isArray(preflight.assigned) || !preflight.assigned.length) throw new Error('A reviewed palette batch preflight is required.');
  if (sha256File(sffPath) !== preflight.sourceSffSHA256) throw new Error('The source SFF changed after batch review. Review the palette batch again.');
  const current = readPalettePlan(sffPath);
  if (JSON.stringify(current) !== preflight.planSnapshot) throw new Error('The staged palette plan changed after batch review. Review the palette batch again.');
  for (const entry of preflight.assigned) { if (!fs.existsSync(entry.source) || sha256File(entry.source) !== entry.sourceSHA256) throw new Error(`Palette source changed after batch review: ${entry.source}`); const data = fs.readFileSync(entry.source), colors = /\.png$/i.test(entry.source) ? pngPaletteRgba(data) : readAct(data, entry.tableOrder); if (paletteColorSignature(colors) !== entry.colorSignature) throw new Error(`Palette colors changed after batch review: ${entry.source}`); }
  const plan = clone(current), insertionId = preflight.mode === 'insert' ? crypto.randomUUID() : null;
  if (preflight.mode === 'insert') {
    for (const entry of plan.palettes) {
      if (Number(entry.group) === preflight.group && Number(entry.number) >= preflight.start) entry.number = Number(entry.number) + preflight.amount;
      if (entry.kind === 'alias' && Number(entry.targetGroup) === preflight.group && Number(entry.targetNumber) >= preflight.start) entry.targetNumber = Number(entry.targetNumber) + preflight.amount;
      if (entry.variantOf && Number(entry.variantOf.group) === preflight.group && Number(entry.variantOf.number) >= preflight.start) entry.variantOf.number = Number(entry.variantOf.number) + preflight.amount;
    }
    plan.shifts.push({ id: insertionId, group: preflight.group, start: preflight.start, amount: preflight.amount, stagedAt: new Date().toISOString() });
  }
  for (const entry of preflight.assigned) plan.palettes.push({ ...entry, inserted: preflight.mode === 'insert', insertionId, stagedAt: new Date().toISOString() });
  plan.palettes.sort((a, b) => a.group - b.group || a.number - b.number);
  plan.sourceSffSHA256 = preflight.sourceSffSHA256;
  return { filename: writePalettePlan(sffPath, plan), plan };
}

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
    const siblings = plan.palettes.filter((entry) => entry.insertionId && entry.insertionId === removed.insertionId);
    if (siblings.length > 1) throw new Error('This palette belongs to an inserted batch. Remove the entire batch so its reviewed shift remains coherent.');
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

function removeStagedBatch(sffPath, insertionId) {
  const plan = readPalettePlan(sffPath), shiftIndex = plan.shifts.findIndex((entry) => entry.id === insertionId);
  if (shiftIndex < 0) return { removed: 0, filename: palettePlanLocation(sffPath), plan };
  if (shiftIndex !== plan.shifts.length - 1) throw new Error('Remove newer inserted batches first so palette shifts can be reversed safely.');
  const shift = plan.shifts[shiftIndex], removed = plan.palettes.filter((entry) => entry.insertionId === insertionId);
  if (!removed.length) throw new Error('The inserted batch no longer has staged palette entries. Review the plan before continuing.');
  plan.shifts.pop();
  plan.palettes = plan.palettes.filter((entry) => entry.insertionId !== insertionId);
  for (const entry of plan.palettes) {
    if (Number(entry.group) === shift.group && Number(entry.number) >= shift.start + shift.amount) entry.number = Number(entry.number) - shift.amount;
    if (entry.kind === 'alias' && Number(entry.targetGroup) === shift.group && Number(entry.targetNumber) >= shift.start + shift.amount) entry.targetNumber = Number(entry.targetNumber) - shift.amount;
    if (entry.variantOf && Number(entry.variantOf.group) === shift.group && Number(entry.variantOf.number) >= shift.start + shift.amount) entry.variantOf.number = Number(entry.variantOf.number) - shift.amount;
  }
  return { removed: removed.length, filename: writePalettePlan(sffPath, plan), plan };
}

function verifyPalettePlan(sffPath, occupiedIds = []) {
  const plan = readPalettePlan(sffPath);
  if (plan.sourceSffSHA256 && sha256File(sffPath) !== plan.sourceSffSHA256) throw new Error('The source SFF changed after its palette batch was staged. Review and restage the batch before building.');
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

module.exports = { palettePlanLocation, readPalettePlan, stagePalette, stagePaletteAlias, stagePaletteInsertion, paletteInsertionPreview, batchPalettePreflight, stagePaletteBatch, duplicatePaletteClusters, stagedPaletteColorInventory, paletteColorSignature, applyPaletteShifts, removeStagedPalette, removeStagedBatch, verifyPalettePlan, sha256File, paletteId };
