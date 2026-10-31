'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const view = fs.readFileSync(path.join(__dirname, '..', 'src', 'palette_workspace_view.js'), 'utf8');
const controller = fs.readFileSync(path.join(__dirname, '..', 'src', 'palette_workspace_controller.js'), 'utf8');
const session = fs.readFileSync(path.join(__dirname, '..', 'src', 'palette_workspace_session.js'), 'utf8');

for (const phrase of ['Compact palette numbers', 'Preview exact mapping', 'Build Candidate', 'Compare Candidate', 'Apply Verified Compaction', 'Undo', 'Keep these gaps', 'Exact old → new mapping']) assert(view.includes(phrase), phrase);
assert(view.includes("activeTier==='standard'&&activeMode==='batch'"));
assert(view.includes("activeTier==='advanced'&&activeMode==='modify'&&activeStep==='remap'"));
assert(view.includes('grid-template-columns:repeat(auto-fit,minmax(120px,1fr))'));
assert(view.includes('role="status" aria-live="polite"'));
for (const action of ['slotCompactionPreview','slotCompactionBuild','slotCompactionCompare','slotCompactionAdopt','slotCompactionUndo']) assert(controller.includes(action), action);
assert(controller.includes('this.revokeSlotCompaction(target)'));
assert(controller.includes('SOURCE_REFERENCE_REVIEW_REQUIRED'));
assert(controller.includes('rows.slice(0,200)'));
assert(session.includes('slotCompactionState'));
assert(session.includes("?\'interrupted\':prior"));
assert(!/reviewToken/.test(view.match(/function renderSlotCompaction\(\)[\s\S]*?function renderPlanBuild/)[0]));
assert(view.includes('actionToken:state.actionToken'));
assert(view.includes('omittedRowCount'));

console.log('palette slot compaction UI tests passed');
