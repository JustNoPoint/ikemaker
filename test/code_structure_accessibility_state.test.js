'use strict';

const assert = require('assert');
const {
  codeStructureControlAvailability,
  codeStructureTreeFocusIndex,
  codeStructureAccessibilityClientScript,
  clientModel,
  html
} = require('../src/code_structure_workspace');

let state = codeStructureControlAvailability({ nodeCount: 0, collapsibleCount: 0, selected: false, focusActive: false, fileCount: 0, fileIndex: -1 });
for (const id of ['focusSelected','showAll','collapse','reveal','filePrevious','fileNext','fileSlider','fileSelect']) {
  assert.strictEqual(state[id].disabled, true, `${id} is unavailable in an empty workspace`);
  assert(state[id].reason, `${id} has an actionable empty-state reason`);
}
state = codeStructureControlAvailability({ nodeCount: 4, collapsibleCount: 1, expandedCollapsibleCount: 1, selected: true, focusActive: true, fileCount: 3, fileIndex: 1 });
for (const id of ['focusSelected','showAll','collapse','reveal','filePrevious','fileNext','fileSlider','fileSelect']) assert.strictEqual(state[id].disabled, false, `${id} enables in its valid state`);
assert.strictEqual(codeStructureControlAvailability({ nodeCount: 4, collapsibleCount: 1, expandedCollapsibleCount: 0 }).collapse.reason, 'All displayed structure branches are already collapsed.');
assert.strictEqual(codeStructureControlAvailability({ selected: true, selectedFocused: true }).focusSelected.reason, 'The selected structure branch is already focused.');
assert.strictEqual(codeStructureControlAvailability({ fileCount: 3, fileIndex: 0 }).filePrevious.reason, 'Already at the first connected code file.');
assert.strictEqual(codeStructureControlAvailability({ fileCount: 3, fileIndex: 2 }).fileNext.reason, 'Already at the last connected code file.');
assert.strictEqual(codeStructureTreeFocusIndex(0, 'ArrowUp', 3), 2);
assert.strictEqual(codeStructureTreeFocusIndex(2, 'ArrowDown', 3), 0);
assert.strictEqual(codeStructureTreeFocusIndex(1, 'Home', 3), 0);
assert.strictEqual(codeStructureTreeFocusIndex(1, 'End', 3), 2);
assert.strictEqual(codeStructureTreeFocusIndex(0, 'ArrowDown', 0), -1);

const source = '[StateDef 200]\nHitDef {\n attr: S, NA;\n}\n';
const document = { languageId: 'zss', fileName: 'access.zss', uri: { toString: () => 'file:///access.zss' }, getText: () => source };
const page = html(clientModel(document));
for (const contract of [
  'aria-label="Search code structure"',
  'aria-label="Filter code structure blocks"',
  'aria-label="Previous connected code file"',
  'aria-label="Next connected code file"',
  'role="listbox" aria-label="Code structure blocks"',
  'role="status" aria-live="polite"',
  'aria-label="Selected block source context"',
  'This controller option is already present in the selected block.',
  '@media(max-width:520px)',
  "['ArrowUp','ArrowDown','Home','End','Enter',' ']"
]) assert(page.includes(contract), `missing Code Structure accessibility contract: ${contract}`);
const client = codeStructureAccessibilityClientScript();
assert(client.includes('refreshStructureAccessibility()'));
assert(client.includes("for(const id of ['focusSelected','showAll','collapse','reveal','filePrevious','fileNext','fileSlider','fileSelect'])"));
assert(client.includes("row.setAttribute('role','option')"));
assert(client.includes("button.setAttribute('aria-pressed'"));
assert(client.includes('Already viewing this connected code file.'));

console.log('Code Structure actionable states, keyboard tree, labels, statuses, and narrow contract passed');
