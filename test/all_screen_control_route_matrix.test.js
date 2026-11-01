'use strict';

const assert = require('assert');
const { SURFACES } = require('../src/viewer_surface_registry');
const { generate, BEHAVIOR_EVIDENCE, CONTROL_ROUTES, sourceControlInventory } = require('../tools/generate_all_screen_control_route_matrix');

const report = generate();
const surfaceSection = report.split('## Surface matrix')[1] || '';
for (const surface of SURFACES) {
  const marker = `| ${surface.id} |`;
  assert.strictEqual(surfaceSection.split(marker).length - 1, 1, `${surface.id} must appear exactly once in the surface matrix`);
}
assert.strictEqual(surfaceSection.split('\n').filter(line => SURFACES.some(surface => line.startsWith(`| ${surface.id} |`))).length, SURFACES.length, 'every registered surface must have a surface-matrix row');
for (const id of Object.keys(BEHAVIOR_EVIDENCE)) assert(SURFACES.some(surface => surface.id === id), `${id} evidence must name a registered surface`);
assert(CONTROL_ROUTES.length > 0, 'the matrix must carry concrete control-level routes, not only surface narratives');
const inventory = sourceControlInventory();
assert.strictEqual(inventory.bySurface.length, SURFACES.length, 'structured inventory must retain every registered surface, including zero-static-control surfaces');
assert.strictEqual(inventory.totals.controls, inventory.controls.length);
assert(inventory.totals.uniqueImplementations <= inventory.totals.controls, 'surface aliases must collapse to a bounded source-implementation count');
assert.strictEqual(inventory.totals.pendingInteractive + inventory.totals.pendingPresentation, inventory.totals.pending, 'every pending candidate must be triaged as interactive/pointer or presentation review');
assert.strictEqual(new Set(inventory.controls.map(row=>`${row.surface}\0${row.control}`)).size, inventory.controls.length, 'structured control candidates must be unique per surface');
assert.strictEqual(inventory.totals.pending, 0, 'every currently discovered bounded control candidate must have a truthful route classification; this remains distinct from physical QA');
assert.strictEqual(inventory.totals.audited, CONTROL_ROUTES.length, 'every manually audited route must project exactly once into the structured inventory');
for(const row of inventory.controls){assert(Array.isArray(row.sourceLocations)&&Array.isArray(row.sharedImplementationSurfaces));assert(row.disposition,'every candidate needs a triage disposition')}
for (const row of CONTROL_ROUTES) {
  assert(SURFACES.some(surface => surface.id === row.surface), `${row.control} must name a registered surface`);
  for (const field of ['control','label','owner','destination','context','availability','reason','evidence']) assert(String(row[field] || '').trim(), `${row.surface}/${row.control} requires ${field}`);
  assert(report.includes(`| ${row.surface} | ${row.control} |`), `${row.surface}/${row.control} must appear in generated control inventory`);
}
for (const phrase of ['not a completion claim','keyboard-reachable reason','Workspace, Simple, and Player','Independent New Dev review']) assert(report.includes(phrase), `matrix must preserve audit boundary: ${phrase}`);
assert(BEHAVIOR_EVIDENCE['custom-editor.sff'].includes('separate custom-editor.sff control rows explicitly trace') && BEHAVIOR_EVIDENCE['custom-editor.sff'].includes('not inferred from shared chrome alone'), 'custom SFF body coverage must be stated as explicit route evidence, not inferred from its shared implementation');
assert(BEHAVIOR_EVIDENCE['custom-editor.snd'].includes('separate custom-editor.snd control rows explicitly trace') && BEHAVIOR_EVIDENCE['custom-editor.snd'].includes('not inferred from shared chrome alone'), 'custom SND body coverage must be stated as explicit route evidence, not left as a shared-toolbar-only gap');
assert(BEHAVIOR_EVIDENCE['custom-editor.sff'].includes('QA remain pending') && BEHAVIOR_EVIDENCE['custom-editor.snd'].includes('QA remain pending'), 'custom-editor software evidence must retain its unperformed physical QA boundary');
assert(report.includes('combined duplicate-access creation list') && report.includes('master palette image'), 'the reviewed Build recommendation must preserve duplicate specialist access and the bounded creator list');
console.log(`All-screen matrix covers ${SURFACES.length} registered surfaces and ${CONTROL_ROUTES.length} audited controls without overstating inventory as behavior proof`);
