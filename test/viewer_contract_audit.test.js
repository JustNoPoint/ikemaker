'use strict';

const assert = require('assert');
const fs = require('fs');
const { REPORT, createReport, stableJson, dynamicPanelViewTypes } = require('../tools/audit_viewer_contracts');

const report = createReport(), serialized = stableJson(report);
assert.strictEqual(report.schemaVersion, 1);
assert.strictEqual(report.summary.unregisteredSurfaceTypes, 0, 'every discovered persistent/native viewer surface must be registered or excluded');
assert.strictEqual(report.summary.ownerMismatches, 0, 'every discovered implementation/package owner must be declared');
assert.deepStrictEqual(report.ownerMismatches, [], 'owner mismatch details must remain empty');
assert.deepStrictEqual(report.undiscoveredRegistryEntries, [], 'registry entries must correspond to a discovered runtime/package surface');
assert(report.summary.discoveredSurfaceTypes >= 50, 'audit must inspect the complete viewer set, not the former hand-maintained sample');
assert(report.surfaceCoverage.every((item) => ['planned', 'required', 'excluded'].includes(item.status)), 'surface coverage may not silently omit or invent status');
assert(report.surfaceCoverage.every((item) => item.surfaceId && item.reason), 'every discovered surface needs identity and migration/exclusion reason');
assert.deepStrictEqual(dynamicPanelViewTypes('visual_authoring_browser_service.js','specification.viewType'),[{viewType:'ikemenVisualAuthoringBrowser',discovery:'createWebviewPanel-factory'}],'the reusable visual-browser panel factory must resolve through its exact companion VIEW_TYPE handoff');
assert.strictEqual(report.surfaceCoverage.find(item=>item.viewType==='ikemenVisualAuthoringBrowser')?.surfaceId,'companion.visual-authoring-browser','the shared Stage/Screenpack/Storyboard browser must remain in the all-surface inventory');
assert.deepStrictEqual(report.actions.orphanActionIds, [], 'every quick icon must resolve to a canonical menu action ID');
assert(!/[A-Z]:\\|\/Users\//i.test(serialized), 'generated report must not contain machine-specific absolute paths');
assert.strictEqual(fs.readFileSync(REPORT, 'utf8'), serialized, 'checked-in viewer contract report must match deterministic regeneration byte-for-byte');
assert.strictEqual(stableJson(createReport()), serialized, 'audit generation must be deterministic');

console.log('Generated viewer contract audit tests passed');
