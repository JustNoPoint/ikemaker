'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const originalLoad = Module._load;
Module._load = function patched(request, parent, main) {
  if (request === 'vscode') return { Uri: { file: fsPath => ({ fsPath }) }, workspace: { workspaceFolders: [], getConfiguration: () => ({ get: (_key, fallback) => fallback }) }, window: {}, commands: {}, env: {}, UIKind: { Web: 2 }, ProgressLocation: { Notification: 1 } };
  return originalLoad.call(this, request, parent, main);
};
const { runPaletteWorkshopBuild } = require('../src/palette_workshop_build_coordinator');
const { palettePlanLocation, readPalettePlan, completePalettePlan } = require('../src/palette_plan');
Module._load = originalLoad;

const target = path.resolve(__dirname, 'fixtures', 'palette-workshop-target.sff');
function authority(plan = {}) {
  return Object.freeze({
    target: { filename: target, exists: true, byteHash: 'a'.repeat(64), byteLength: 12 }, sffVersion: '2.1',
    planSnapshot: JSON.stringify({ version: 5, palettes: [], shifts: [], deletions: [], ...plan }),
    physicalInventory: Object.freeze({ sprites: Object.freeze([[0, 0, 0, 4, 5, 0, 0, 2, 2, 8]]), palettes: Object.freeze([[0, 1, 1, 0, 1024]]) }),
    sources: Object.freeze([]), references: Object.freeze([]), lifecycle: Object.freeze({ records: [] })
  });
}
function prepared() { return { packageRoot: path.dirname(target), targetId: 'sff-v2.1', build: { specification: { sprites: [], palettes: [] }, specificationHash: 'b'.repeat(64) } }; }
function base(overrides = {}) {
  const seen = { completes: 0, prepares: 0, executes: 0, builds: 0, revalidates: 0 };
  const options = {
    captureAuthority: () => authority({ palettes: [{ kind: 'source', group: 1, number: 2 }] }),
    assertAuthority: value => { seen.revalidates += 1; return value; },
    confirmBuild: async () => true,
    preparePackage: async ({ authority: value }) => { seen.prepares += 1; assert.deepStrictEqual(value.physicalInventory.sprites, [[0, 0, 0, 4, 5, 0, 0, 2, 2, 8]]); return prepared(); },
    compatibility: () => ({ available: true, reasons: [] }),
    executeSprMake2: async (_build, runOptions) => { seen.executes += 1; const approved = await runOptions.confirmAdoption({ candidateHash: 'c'.repeat(64) }); return approved ? { cancelled: false, adoption: { ok: true }, executionReceiptPath: 'receipt.json' } : { cancelled: true, adoption: null }; },
    buildBuiltInTest: async () => { seen.builds += 1; return { candidatePath: 'candidate.sff', receiptPath: 'candidate.json' }; },
    completePlan: () => { seen.completes += 1; return { filename: 'plan.json' }; },
    confirmAdoption: async () => true,
    ...overrides
  };
  return { options, seen };
}
async function rejected(run, pattern) { let error; try { await run(); } catch (value) { error = value; } assert(error, 'expected rejection'); assert.match(error.message, pattern); assert.strictEqual(error.paletteWorkshopResult.planRetained, true); return error; }

(async () => {
  {
    const { options, seen } = base({ captureAuthority: () => { throw new Error('No reviewed palette changes are staged'); } });
    await rejected(() => runPaletteWorkshopBuild({ sffPath: target, backend: 'sprmake2-adopt' }, options), /No reviewed/);
    assert.strictEqual(seen.prepares, 0);
  }
  {
    const { options, seen } = base({ confirmBuild: async () => false });
    const result = await runPaletteWorkshopBuild({ sffPath: target, backend: 'sprmake2-adopt' }, options);
    assert.strictEqual(result.status, 'cancelled'); assert.strictEqual(result.planRetained, true); assert.strictEqual(seen.prepares, 0);
  }
  {
    const { options, seen } = base({ preparePackage: async () => null });
    const result = await runPaletteWorkshopBuild({ sffPath: target, backend: 'sprmake2-adopt' }, options);
    assert.strictEqual(result.status, 'cancelled'); assert.strictEqual(result.planRetained, true); assert.strictEqual(seen.executes, 0); assert.strictEqual(seen.completes, 0);
  }
  {
    let release; const gate = new Promise(resolve => { release = resolve; });
    const { options } = base({ executeSprMake2: async () => { await gate; return { cancelled: true }; } });
    const first = runPaletteWorkshopBuild({ sffPath: target, backend: 'sprmake2-adopt' }, options);
    await new Promise(resolve => setImmediate(resolve));
    await rejected(() => runPaletteWorkshopBuild({ sffPath: target, backend: 'sprmake2-adopt' }, options), /already running/);
    release(); await first;
  }
  for (const stale of ['target SFF', 'palette plan', 'palette source', 'reference files', 'lifecycle registry']) {
    const { options, seen } = base({ assertAuthority: () => { throw new Error(`${stale} changed after review`); } });
    await rejected(() => runPaletteWorkshopBuild({ sffPath: target, backend: 'sprmake2-adopt' }, options), /changed after review/);
    assert.strictEqual(seen.completes, 0);
  }
  {
    let checks = 0;
    const { options, seen } = base({ assertAuthority: value => { checks += 1; if (checks === 4) throw new Error('reference files changed while adoption confirmation was open'); return value; } });
    await rejected(() => runPaletteWorkshopBuild({ sffPath: target, backend: 'sprmake2-adopt' }, options), /while adoption confirmation was open/);
    assert.strictEqual(seen.completes, 0);
  }
  {
    const { options, seen } = base({ compatibility: () => ({ available: false, reasons: ['tool unavailable or incompatible'] }) });
    await rejected(() => runPaletteWorkshopBuild({ sffPath: target, backend: 'sprmake2-adopt' }, options), /incompatible/);
    assert.strictEqual(seen.executes, 0); assert.strictEqual(seen.completes, 0);
  }
  {
    const { options, seen } = base({ executeSprMake2: async () => { throw new Error('SprMaker2 was not found'); } });
    await rejected(() => runPaletteWorkshopBuild({ sffPath: target, backend: 'sprmake2-adopt' }, options), /not found/);
    assert.strictEqual(seen.completes, 0);
  }
  for (const failure of ['strict candidate validation failed', 'active target drifted', 'fault before candidate publish']) {
    const { options, seen } = base({ executeSprMake2: async () => { throw new Error(failure); } });
    await rejected(() => runPaletteWorkshopBuild({ sffPath: target, backend: 'sprmake2-adopt' }, options), new RegExp(failure));
    assert.strictEqual(seen.completes, 0);
  }
  {
    const { options } = base({ executeSprMake2: async (_build, runOptions) => { runOptions.onAdopted({ adoption: { ok: true } }); throw new Error('execution receipt publish failed after adoption'); } });
    const error = await rejected(() => runPaletteWorkshopBuild({ sffPath: target, backend: 'sprmake2-adopt' }, options), /receipt publish failed/);
    assert.strictEqual(error.paletteWorkshopResult.status, 'adopted-cleanup-required'); assert.strictEqual(error.paletteWorkshopResult.adopted, true);
  }
  {
    const { options, seen } = base({ executeSprMake2: async () => ({ cancelled: true, adoption: null, executionReceiptPath: 'receipt.json' }) });
    const result = await runPaletteWorkshopBuild({ sffPath: target, backend: 'sprmake2-adopt' }, options);
    assert.strictEqual(result.status, 'validated-not-adopted'); assert.strictEqual(result.planRetained, true); assert.strictEqual(seen.completes, 0);
  }
  for (const boundary of ['after-adoption', 'plan-completion-write']) {
    const overrides = boundary === 'after-adoption'
      ? { afterAdoption: async () => { throw new Error(boundary); } }
      : { completePlan: () => { throw new Error(boundary); } };
    const { options } = base(overrides);
    const result = await runPaletteWorkshopBuild({ sffPath: target, backend: 'sprmake2-adopt' }, options);
    assert.strictEqual(result.status, 'adopted-cleanup-required'); assert.strictEqual(result.adopted, true); assert.strictEqual(result.planRetained, true);
  }
  {
    const reviewed = { palettes: [
      { kind: 'source', group: 1, number: 2 },
      { kind: 'source', group: 1, number: 4, insertionId: 'insert-1' },
      { kind: 'alias', group: 1, number: 5, targetGroup: 1, targetNumber: 2 }
    ], shifts: [{ id: 'insert-1', group: 1, start: 4, amount: 1 }], deletions: [{ sourceGroup: 1, sourceNumber: 3, group: 1, number: 3 }] };
    const exact = authority(reviewed); let preparedPlan;
    const { options, seen } = base({ captureAuthority: () => exact, preparePackage: async ({ authority: value }) => { preparedPlan = JSON.parse(value.planSnapshot); return prepared(); } });
    const result = await runPaletteWorkshopBuild({ sffPath: target, backend: 'sprmake2-adopt' }, options);
    assert.strictEqual(result.status, 'adopted'); assert.strictEqual(result.planRetained, false); assert.strictEqual(seen.completes, 1);
    assert.deepStrictEqual(preparedPlan, { version: 5, ...reviewed });
    assert.deepStrictEqual(exact.physicalInventory.sprites, [[0, 0, 0, 4, 5, 0, 0, 2, 2, 8]]);
  }
  {
    const { options, seen } = base();
    const result = await runPaletteWorkshopBuild({ sffPath: target, backend: 'builtin-test' }, options);
    assert.strictEqual(result.status, 'validated-test-candidate'); assert.strictEqual(result.adopted, false); assert.strictEqual(result.planRetained, true);
    assert.strictEqual(seen.builds, 1); assert.strictEqual(seen.executes, 0); assert.strictEqual(seen.completes, 0);
  }
  {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'palette-workshop-complete-'));
    try {
      const sff = path.join(root, 'target.sff'); fs.writeFileSync(sff, 'before');
      const planPath = palettePlanLocation(sff); fs.mkdirSync(path.dirname(planPath), { recursive: true });
      fs.writeFileSync(planPath, `${JSON.stringify({ version: 5, sourceSff: sff, palettes: [{ kind: 'alias', group: 1, number: 2, targetGroup: 1, targetNumber: 1 }], shifts: [], deletions: [] }, null, 2)}\n`);
      const snapshot = JSON.stringify(readPalettePlan(sff)); fs.writeFileSync(sff, 'after');
      const result = completePalettePlan(sff, snapshot, { backend: 'sprmake2-adopt' });
      assert.strictEqual(result.plan.palettes.length, 0); assert.strictEqual(result.plan.deletions.length, 0); assert.strictEqual(result.plan.lastCompletion.backend, 'sprmake2-adopt');
      assert.throws(() => completePalettePlan(sff, snapshot, {}), /plan changed before completion/);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
  await assert.rejects(() => runPaletteWorkshopBuild({ sffPath: target, backend: 'sff-v1' }, base().options), /explicit Palette Workshop backend/);
  console.log('palette_workshop_build_coordinator tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
