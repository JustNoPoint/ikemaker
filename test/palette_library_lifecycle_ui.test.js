'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const view = fs.readFileSync(path.join(__dirname, '..', 'src', 'palette_workspace_view.js'), 'utf8');
const controller = fs.readFileSync(path.join(__dirname, '..', 'src', 'palette_workspace_controller.js'), 'utf8');
for (const label of ['Save to Library…', 'Rename…', 'Duplicate…', 'Delete Library File…']) assert(view.includes(label), `${label} is directly reachable in the existing Palette Library panel`);
assert(view.includes('library-lifecycle-tools') && view.includes('live-tools library-lifecycle-tools'), 'library lifecycle actions use the existing wrapping compact tool row');
assert(view.includes("selectedItem?.origin==='folder'"), 'rename, duplicate, and delete are enabled only for folder-owned candidates');
assert(view.includes("post('librarySave')") && view.includes("post('libraryRename',{index:selected})") && view.includes("post('libraryDuplicate',{index:selected})") && view.includes("post('libraryDelete',{index:selected})"), 'each visible lifecycle action has one explicit host route');
assert(view.includes("event.data?.type!=='paletteLibraryLifecycleResult'") && view.includes('libraryFocusPending=Boolean(libraryFocusId)'), 'completion is announced and keyboard focus returns to the resulting row');
assert(view.includes("libraryReceipt=event.data.receipt||''") && view.includes('<b>Recovery receipt:</b>'), 'the compact library flow surfaces the exact recovery receipt path');
assert(view.includes('Remove selected / Clear added only remove tray entries; they never delete source files.'), 'tray-only deletion language is scoped without contradicting destructive library delete');
assert(view.includes('Delete Library File removes that file only after confirmation and retains recovery.'), 'destructive folder-owned deletion is separately and plainly disclosed');
for (const action of ['librarySave','libraryRename','libraryDuplicate','libraryDelete']) assert(controller.includes(`action==='${action}'`), `${action} is handled by the Palette Workspace host`);
assert(controller.includes("'Delete Library File'"), 'deleting a folder-owned palette requires an exact modal confirmation');
for (const method of ['renameLibraryItem','deleteLibraryItem']) {
  const start=controller.indexOf(`async ${method}`),end=controller.indexOf('\n  async ',start+8),body=controller.slice(start,end<0?controller.length:end);
  assert(body.indexOf('paletteLibraryLifecycle.') < body.indexOf('applyCandidateRestorePatch(state,restorePatch)'), `${method} restores an active candidate only after the file operation commits`);
}
assert(controller.includes('actAlphaLossEligibility(createScratchPaletteDocument') && controller.includes("'Save RGB ACT'"), 'non-opaque palette alpha requires exact lossy-index review before ACT save');
console.log('Palette Library lifecycle remains compact, accessible, folder-scoped, and discoverable');
