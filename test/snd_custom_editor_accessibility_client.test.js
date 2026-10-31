'use strict';

const assert = require('assert');
const Module = require('module');
const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) { if (request === 'vscode') return {}; return originalLoad.call(this, request, parent, isMain); };
const { sndViewerControlAvailability, sndViewerAvailabilityStatus, sndGroupNavigationTarget, restoreSndGroupFocus, organizedViewerHtml } = require('../src/snd_viewer');
Module._load = originalLoad;

let state = sndViewerControlAvailability({ entryCount: 2, selected: true, selectedPosition: 0, markedCount: 0, visibleCount: 2, buildContextKnown: true, profileAvailable: false, assigned: false, manifestAvailable: false });
assert.strictEqual(state.generateAllFx.disabled, true);
assert.match(state.generateAllFx.reason, /create or open a sound profile/i);
assert.strictEqual(state.generateFx.disabled, true);
assert.match(state.generateFx.reason, /assign the loaded SND/i);
assert.strictEqual(state.createBuild.disabled, true);
assert.strictEqual(state.openManifest.disabled, true);
assert.strictEqual(state.sortManifest.disabled, true);
assert.match(state.openManifest.reason, /reviewed SndMaker build manifest/i);
assert.strictEqual(state.add.disabled, true, 'manifest editing cannot silently no-op without a manifest');
assert.strictEqual(state.replace.disabled, true, 'selection does not bypass a missing manifest');

state = sndViewerControlAvailability({ entryCount: 2, selected: true, selectedPosition: 0, markedCount: 0, visibleCount: 2, buildContextKnown: true, profileAvailable: true, assigned: true, manifestAvailable: false });
assert.strictEqual(state.createBuild.disabled, false, 'an assigned archive can create its first build workspace');
assert.strictEqual(state.openManifest.disabled, true);
assert.strictEqual(state.replace.disabled, true);
assert.match(sndViewerAvailabilityStatus({ entryCount: 2, selected: true, profileAvailable: true, assigned: true, manifestAvailable: false }), /Playback and WAV export are ready.*Create Build Workspace.*reviewed manifest/i, 'selected sounds keep truthful ready actions while naming the enabled manifest recovery path');
assert.match(sndViewerAvailabilityStatus({ entryCount: 0, selected: false, profileAvailable: false, assigned: false, manifestAvailable: false }), /no sounds.*Open or Create Profile.*Assign Loaded SND to Profile.*Create Build Workspace/i, 'an empty unconfigured archive names the actual prerequisite path instead of suggesting a disabled Add action');
assert.match(sndViewerAvailabilityStatus({ entryCount: 0, selected: false, profileAvailable: true, assigned: true, manifestAvailable: false }), /no sounds.*Create Build Workspace.*before adding/i, 'an assigned empty archive points directly to its enabled build-workspace action');

state = sndViewerControlAvailability({ entryCount: 2, selected: true, selectedPosition: 0, markedCount: 0, visibleCount: 2, buildContextKnown: true, profileAvailable: true, assigned: true, manifestAvailable: true });
for (const id of ['openManifest', 'sortManifest', 'rebuild', 'add', 'replace', 'delete']) assert.strictEqual(state[id].disabled, false, `${id} is available with the exact reviewed manifest context`);
state = sndViewerControlAvailability({ entryCount: 2, selected: true, selectedPosition: 0, markedCount: 0, visibleCount: 2, buildContextKnown: true, profileAvailable: true, assigned: true, manifestAvailable: true, duplicateIdentity: true });
assert.strictEqual(state.createBuild.disabled, true);
assert.match(state.createBuild.reason, /resolve duplicate group,index/i);

const groups = [{ group: 10 }, { group: 20 }, { group: 30 }];
assert.strictEqual(sndGroupNavigationTarget(groups, 20, 'ArrowDown'), 30);
assert.strictEqual(sndGroupNavigationTarget(groups, 20, 'ArrowUp'), 10);
assert.strictEqual(sndGroupNavigationTarget(groups, 20, 'Home'), 10);
assert.strictEqual(sndGroupNavigationTarget(groups, 20, 'End'), 30);
assert.strictEqual(sndGroupNavigationTarget(groups, 20, 'Enter'), null);

let focused = 0;
const selectedGroup = { focus() { focused += 1; } }, displaced = {};
const documentLike = { activeElement: displaced, querySelector(selector) { assert.strictEqual(selector, '[data-sound-group="1"]'); return selectedGroup; } };
assert.strictEqual(restoreSndGroupFocus(documentLike, 1, displaced), true);
documentLike.activeElement = { id: 'filter' };
assert.strictEqual(restoreSndGroupFocus(documentLike, 1, displaced), false, 'a later focus change is never stolen');
assert.strictEqual(focused, 1);

const model = {
  basename: 'voices.snd', filename: 'voices.snd', archiveFingerprint: 'A', sourceFingerprint: 'B', generation: 1, version: '2.1', entries: [
    { archiveIndex: 0, group: 1, index: 0, identity: '1,0', name: '', category: 'Voice', valid: true, sampleRate: 44100, channels: 1, bitsPerSample: 16, format: 1, durationSeconds: 0.2, dataSize: 10, duplicateOf: null, exactAudioDuplicateOf: null, pcmDuplicateOf: null, qa: { supported: true, peak: 0, clippedSamples: 0, nearClippedSamples: 0, dcOffset: 0, leadingSilenceSeconds: 0, trailingSilenceSeconds: 0 } }
  ], groups: [{ group: 1, count: 1 }], issues: [], connectedSnds: [], profile: { filename: 'sound-profile.json', characterId: 'Ryu', definition: { id: 'voice', buildManifestExists: false }, archives: [], validation: { errors: [], warnings: [] } }, mutation: { backups: true, history: true }
};
const html = organizedViewerHtml(model);
for (const fragment of ['aria-label="Filter sound groups"', 'role="listbox" aria-label="Sound groups"', 'aria-label="Filter sounds by group, index, or name"', 'role="listbox" aria-label="Sounds"', 'aria-label="Sort sound list"', 'aria-label="Selected sound audio preview"', 'aria-label="Selected sound details"', 'aria-label="Archive diagnostics"', '<label class="muted">Controller<select id="soundBridgeKind"']) assert(html.includes(fragment), `missing accessible name/relationship: ${fragment}`);
assert(html.includes('buildContextKnown:true') && html.includes('manifestAvailable:Boolean(model.profile?.definition?.buildManifestExists)'), 'the generated custom editor executes exact profile/build availability');
assert(html.includes('const sndAvailabilityText=') && html.includes("document.getElementById('sndAvailabilityStatus').textContent=sndAvailabilityText(availabilityState)"), 'the visible live status executes the same manifest-aware guidance model');
assert(html.includes("control.setAttribute('aria-description',record.reason)"), 'disabled controls expose their exact actionable reason programmatically');
assert(html.includes("button.setAttribute('role','option')") && html.includes("button.setAttribute('aria-selected'"), 'group choices expose current option semantics');
assert(html.includes("['ArrowDown','ArrowUp','Home','End']") && html.includes('restoreSndGroup(document,next,displaced)'), 'group list supports keyboard movement and guarded rerender focus restoration');
assert(html.includes('No sound groups match this filter. Clear or change the group filter.') && html.includes('No sounds match the current file, quality, mark, or text filters.'), 'empty filter projections explain how to recover');
assert(html.includes("sndHelpDialog.setAttribute('aria-labelledby','sndHelpHeading')") && html.includes("sndHelpReturnFocus?.isConnected") && html.includes('sndHelpReturnFocus.focus()'), 'the help dialog has a stable name and restores the exact invoking focus');

console.log('Custom SND editor build prerequisites, list semantics, dialog focus, labels, and empty guidance passed');
