'use strict';

const assert = require('assert');
const Module = require('module');
const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) { if (request === 'vscode') return {}; return originalLoad.call(this, request, parent, isMain); };
const { sndViewerControlAvailability, restoreSndSoundFocus, sndConnectedArchiveAvailability, organizedViewerHtml } = require('../src/snd_viewer');
Module._load = originalLoad;

let state = sndViewerControlAvailability({ entryCount: 0, selected: false, markedCount: 0, visibleCount: 0, rangeValid: false });
assert.strictEqual(state.sndReplace.disabled, true);
assert.match(state.sndReplace.reason, /no sounds/i);
assert.strictEqual(state.sndDelete.disabled, true);
assert.match(state.markVisibleSounds.reason, /add WAV sources/i);
assert.strictEqual(Object.prototype.hasOwnProperty.call(state, 'sndAdd'), false, 'archive-wide Add remains available for an empty SND');

state = sndViewerControlAvailability({ entryCount: 2, selected: false, selectedPosition: -1, markedCount: 0, visibleCount: 2, rangeValid: false, rangeAny: false });
assert.strictEqual(state.soundExactJump.disabled, false, 'exact group/index navigation does not require a prior selection');
assert.strictEqual(state.sndPrevious.disabled, true, 'relative navigation still requires an exact current occurrence');

state = sndViewerControlAvailability({ entryCount: 2, selected: true, selectedPosition: 0, markedCount: 0, visibleCount: 2, rangeValid: false, rangeAny: false });
assert.strictEqual(state.sndReplace.disabled, false, 'selection enables exact sound replacement');
assert.strictEqual(state.sndPlay.disabled, false, 'selection enables playback');
assert.strictEqual(state.sndPrevious.disabled, true, 'previous is disabled at the first physical occurrence instead of becoming a no-op');
assert.strictEqual(state.sndNext.disabled, false, 'next is available before the last physical occurrence');
assert.strictEqual(state.exportMarked.disabled, true, 'batch export still requires marks');
assert.match(state.exportMarked.reason, /mark one or more/i);
assert.strictEqual(state.sndExportRange.disabled, true, 'range export still requires a valid range');
assert.match(state.sndExportRange.reason, /valid A–B range/i);
assert.strictEqual(state.sndRangeClear.disabled, true, 'clear range is disabled until at least one marker exists');
assert.strictEqual(state.sndRangeLoop.disabled, true, 'range loop is disabled until the range is valid');

state = sndViewerControlAvailability({ entryCount: 2, selected: true, selectedPosition: 1, markedCount: 2, visibleCount: 2, rangeValid: true, rangeAny: true });
assert.strictEqual(state.sndDelete.disabled, false, 'marked sounds enable reviewed deletion');
assert.strictEqual(state.exportMarked.disabled, false, 'marks enable batch export');
assert.strictEqual(state.sndExportRange.disabled, false, 'a selected sound and valid range enable range export');
assert.strictEqual(state.sndPrevious.disabled, false, 'previous is available after the first physical occurrence');
assert.strictEqual(state.sndNext.disabled, true, 'next is disabled at the last physical occurrence instead of becoming a no-op');
assert.strictEqual(state.sndRangeClear.disabled, false, 'an existing range marker enables clear');
assert.strictEqual(state.sndRangeLoop.disabled, false, 'a valid range enables range looping');

let focused = 0;
const focusTarget = { focus() { focused += 1; } };
const displacedFocus = {}, focusDocument = { activeElement: displacedFocus, querySelector(selector) { assert.strictEqual(selector, '[data-sound-archive-index="7"]'); return focusTarget; } };
assert.strictEqual(restoreSndSoundFocus(focusDocument, 7, displacedFocus), true);
assert.strictEqual(focused, 1, 'rerender focus returns to the exact physical archive occurrence');
assert.strictEqual(restoreSndSoundFocus({ querySelector() { return null; } }, 7), false, 'missing filtered rows do not steal focus');
focusDocument.activeElement = { id: 'unrelated-control' };
assert.strictEqual(restoreSndSoundFocus(focusDocument, 7, displacedFocus), false, 'an unrelated focus change before restoration is never stolen');
assert.strictEqual(focused, 1);

const connected = [{ id: 'main', label: 'Main SND', current: true }, { id: 'voice', label: 'Voice SND', current: false }];
let connectedState = sndConnectedArchiveAvailability(connected, 'main', false);
assert.strictEqual(connectedState.open.disabled, true, 'Open is not an enabled no-op for the current connected SND');
assert.match(connectedState.open.reason, /already open/i);
connectedState = sndConnectedArchiveAvailability(connected, 'voice', false);
assert.strictEqual(connectedState.open.disabled, false, 'choosing a different connected SND enables explicit Open');
assert.match(connectedState.status, /choose Open/i, 'selection is a review step rather than an immediate file switch');
connectedState = sndConnectedArchiveAvailability(connected, 'voice', true);
assert.strictEqual(connectedState.open.disabled, true);
assert.strictEqual(connectedState.previous.disabled, true, 'connected navigation is blocked while the exact open request is pending');
assert.match(connectedState.open.reason, /finish opening/i);

const model = { basename: 'empty.snd', filename: 'empty.snd', version: '2.1', entries: [], groups: [], issues: [], connectedSnds: [], profile: {} };
const html = organizedViewerHtml(model);
assert(html.includes('id="sndAvailabilityStatus"') && html.includes('aria-live="polite"'), 'disabled reasons have one visible polite status owner');
assert(html.includes('id="soundSelectionStatus" class="muted" role="status" aria-live="polite"'), 'selection changes are announced');
assert(html.includes('id="soundFormatStatus" class="muted" role="status" aria-live="polite"'), 'selected format changes are announced');
assert(html.includes('id="sndArchiveStatus" class="muted" role="status" aria-live="polite"'), 'connected archive state is announced');
assert(html.includes('const sndAvailabilityFor=') && html.includes('function refreshSndControlAvailability()'), 'generated client executes the same availability model');
assert(html.includes('const restoreSndEntryFocus=') && html.includes('restoreSndEntryFocus(document,e.archiveIndex,displacedFocus)'), 'generated selection rerender restores only the initiating exact row while focus is unchanged');
assert(html.includes("control.setAttribute('aria-describedby','sndAvailabilityStatus')"), 'disabled controls reference the actionable reason owner');
assert(html.includes('sndArchiveSelect.onchange=syncConnectedSndControls'), 'connected-file selection reviews availability without opening immediately');
assert(html.includes('sndArchiveOpen.onclick=()=>openConnectedSndAt'), 'the named Open control is the explicit selected-file commit');

const viewerSource = require('fs').readFileSync(require.resolve('../src/snd_viewer'), 'utf8');
const deleteBranch = viewerSource.slice(viewerSource.indexOf("if (message.type === 'delete')"), viewerSource.indexOf("if (message.type === 'scanReferences')"));
assert(deleteBranch.indexOf('chooseSndBatchScope') >= 0 && deleteBranch.indexOf('chooseSndBatchScope') < deleteBranch.indexOf("if (message.type === 'replace')"), 'marked deletion reaches exact scope review without an unrelated current-selection gate');
assert(deleteBranch.slice(deleteBranch.indexOf("if (message.type === 'replace')")).includes("if (!Number.isInteger(group) || !Number.isInteger(index)) throw new Error('Select a sound first.')"), 'replacement retains its exact selected-sound requirement');

console.log('SND Viewer executable availability, live guidance, and exact focus restoration passed');
