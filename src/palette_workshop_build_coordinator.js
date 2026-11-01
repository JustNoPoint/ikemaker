'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { readSff } = require('./sff_reader');
const { palettePlanLocation, readPalettePlan, verifyPalettePlan, completePalettePlan } = require('./palette_plan');
const { referenceFiles } = require('./palette_reference_audit');
const { lifecycleRegistrySnapshot } = require('./sff_placeholder_lifecycle');
const { sprMake2Compatibility, executeGeneratedBuild } = require('./sff_commands');
const { createCreatorTestBuild } = require('./sff_creator_test_build');

const running = new Map();
function sha(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function targetKey(filename) { const value = path.resolve(filename); return process.platform === 'win32' ? value.toLowerCase() : value; }
function rootFor(filename) { let current = path.dirname(path.resolve(filename)); while (true) { if (fs.existsSync(path.join(current, 'Ikemen_GO.exe')) || fs.existsSync(path.join(current, 'external', 'script', 'main.lua'))) return current; const parent = path.dirname(current); if (parent === current) return path.dirname(path.resolve(filename)); current = parent; } }
function fileEvidence(filename) { const exists = fs.existsSync(filename), bytes = exists ? fs.readFileSync(filename) : Buffer.alloc(0); return { filename: path.resolve(filename), exists, byteHash: sha(bytes), byteLength: bytes.length }; }
function referenceEvidence(filename) { return referenceFiles(rootFor(filename)).map(file => ({ filename: path.resolve(file.filename), byteHash: sha(Buffer.from(file.text)) })).sort((a, b) => a.filename.localeCompare(b.filename)); }
function sourceEvidence(plan) { return (plan.palettes || []).filter(item => item.kind !== 'alias').map(item => fileEvidence(item.source)).sort((a, b) => a.filename.localeCompare(b.filename)); }
function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }

function capturePaletteBuildAuthority(filename) {
  const sff = path.resolve(filename || '');
  if (!fs.existsSync(sff) || !fs.statSync(sff).isFile()) throw new Error('Palette Workshop build requires one existing SFF target.');
  const archive = readSff(sff), version = archive.header?.version || [];
  if (archive.header?.legacy || Number(version[0]) !== 2 || ![0, 1].includes(Number(version[1]))) throw new Error('Palette Workshop mutation supports existing SFF v2.0 or v2.1 archives only. SFF v1 remains read/export-only.');
  const planPath = palettePlanLocation(sff);
  if (!fs.existsSync(planPath)) throw new Error('No reviewed palette changes are staged for this SFF.');
  const plan = readPalettePlan(sff);
  if (!(plan.palettes?.length || plan.deletions?.length)) throw new Error('No reviewed palette changes are staged for this SFF.');
  verifyPalettePlan(sff, archive.palettes.map(palette => `${palette.group},${palette.number}`));
  return Object.freeze({
    schema: 'ikemaker.palette-workshop-build-authority', version: 1, target: fileEvidence(sff), sffVersion: `${Number(version[0])}.${Number(version[1])}`,
    physicalInventory: Object.freeze({ sprites: archive.sprites.map(sprite => [sprite.index, sprite.group, sprite.number, sprite.axisX, sprite.axisY, sprite.paletteIndex, sprite.link, sprite.width, sprite.height, sprite.colorDepth]), palettes: archive.palettes.map(palette => [palette.index, palette.group, palette.number, palette.link, palette.dataSize]) }),
    planPath, planFile: fileEvidence(planPath), planSnapshot: JSON.stringify(plan), sources: Object.freeze(sourceEvidence(plan)), references: Object.freeze(referenceEvidence(sff)), lifecycle: Object.freeze(lifecycleRegistrySnapshot(sff))
  });
}

function assertPaletteBuildAuthority(authority) {
  const current = capturePaletteBuildAuthority(authority.target.filename);
  for (const field of ['target', 'planFile', 'planSnapshot', 'sources', 'references', 'lifecycle', 'physicalInventory']) if (!same(current[field], authority[field])) throw new Error(`Palette Workshop build authority changed after review (${field}). Nothing was adopted and the staged plan was retained.`);
  return current;
}

function state(status, extra = {}) { return Object.freeze({ schema: 'ikemaker.palette-workshop-build-result', version: 1, status, ...extra }); }

async function runPaletteWorkshopBuild(input = {}, options = {}) {
  const filename = path.resolve(input.sffPath || ''), key = targetKey(filename), backend = String(input.backend || '');
  if (!['sprmake2-adopt', 'builtin-test'].includes(backend)) { const error = new Error('Choose an explicit Palette Workshop backend. No fallback is allowed.'); error.paletteWorkshopResult = state('failed', { backend, adopted: false, planRetained: true, message: error.message }); throw error; }
  if (running.has(key)) { const error = new Error(`A Palette Workshop build is already running for this target: ${filename}`); error.paletteWorkshopResult = state('busy', { backend, adopted: false, planRetained: true, message: error.message }); throw error; }
  const token = Object.freeze({ key }); running.set(key, token);
  const deps = {
    capture: options.captureAuthority || capturePaletteBuildAuthority,
    revalidate: options.assertAuthority || assertPaletteBuildAuthority,
    prepare: options.preparePackage,
    compatibility: options.compatibility || sprMake2Compatibility,
    execute: options.executeSprMake2 || executeGeneratedBuild,
    buildTest: options.buildBuiltInTest || createCreatorTestBuild,
    complete: options.completePlan || completePalettePlan
  };
  let adopted = false;
  try {
    const authority = deps.capture(filename);
    if (typeof options.onState === 'function') await options.onState(state('reviewed', { backend, authority }));
    if (typeof options.confirmBuild === 'function' && await options.confirmBuild({ backend, authority }) !== true) return state('cancelled', { backend, adopted: false, planRetained: true });
    if (typeof deps.prepare !== 'function') throw new Error('Palette Workshop has no palette-only package preparer.');
    const prepared = await deps.prepare({ filename, backend, authority });
    if (!prepared) return state('cancelled', { backend, adopted: false, planRetained: true });
    deps.revalidate(authority);
    if (backend === 'builtin-test') {
      const built = await deps.buildTest({ packageRoot: prepared.packageRoot, build: prepared.build, targetId: prepared.targetId || `sff-v${authority.sffVersion}` });
      deps.revalidate(authority);
      return state('validated-test-candidate', { backend, adopted: false, planRetained: true, candidatePath: built.candidatePath, receiptPath: built.receiptPath });
    }
    const compatibility = deps.compatibility(prepared.build.specification);
    if (!compatibility?.available) throw new Error(`SprMake2 is incompatible with the reviewed palette plan: ${(compatibility?.reasons || []).join('; ')}`);
    deps.revalidate(authority);
    const executed = await deps.execute(prepared.build, { onAdopted: () => { adopted = true; }, confirmAdoption: async evidence => {
      deps.revalidate(authority);
      if (typeof options.confirmAdoption !== 'function') return false;
      const approved = await options.confirmAdoption({ ...evidence, backend, authority }) === true;
      if (approved) deps.revalidate(authority);
      return approved;
    } });
    if (!executed || executed.cancelled || !executed.adoption) return state('validated-not-adopted', { backend, adopted: false, planRetained: true, executionReceiptPath: executed?.executionReceiptPath || null });
    adopted = true;
    let completed;
    try {
      if (typeof options.afterAdoption === 'function') await options.afterAdoption({ authority, executed });
      completed = deps.complete(filename, authority.planSnapshot, { backend, specificationHash: prepared.build.specificationHash, executionReceiptPath: executed.executionReceiptPath || null });
    } catch (error) {
      return state('adopted-cleanup-required', { backend, adopted: true, planRetained: true, message: error.message, executionReceiptPath: executed.executionReceiptPath || null });
    }
    return state('adopted', { backend, adopted: true, planRetained: false, planPath: completed.filename, executionReceiptPath: executed.executionReceiptPath || null });
  } catch (error) {
    error.paletteWorkshopResult = state(adopted ? 'adopted-cleanup-required' : 'failed', { backend, adopted, planRetained: true, message: error.message });
    throw error;
  } finally { if (running.get(key) === token) running.delete(key); }
}

module.exports = { capturePaletteBuildAuthority, assertPaletteBuildAuthority, runPaletteWorkshopBuild };
