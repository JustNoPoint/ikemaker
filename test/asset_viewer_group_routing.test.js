'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = (name) => fs.readFileSync(path.join(__dirname, '..', 'src', name), 'utf8');
const workbenches = source('character_workbenches.js');
const air = source('air_viewer.js');
const sff = source('sff_viewer.js');
const snd = source('snd_viewer.js');
const navigation = source('viewer_navigation.js');

assert(workbenches.includes('const viewerColumn = assetColumn || column'), 'character sessions must route archives through the one character editor group');
assert(workbenches.includes('let assetColumn = column'), 'character startup must not create a second visual editor group');
assert(workbenches.includes('if (Number.isInteger(resolved) && resolved > 0) assetColumn = resolved;'), 'resolved viewer tabs retain the common character editor-group anchor');
assert(!workbenches.includes('function viewerColumnFor('), 'character startup must not contain an automatic beside-group router');
assert(!workbenches.includes("executeCommand('workbench.action.newGroupRight')"), 'character sessions must not leave a pre-created empty editor group');
assert(workbenches.includes("categoryFor(filename, profile) === 'Code'"), 'Character essentials must include connected ZSS/CNS/CMD source files');
assert(workbenches.includes('profile = refreshedProfile(profile);'), 'saved character openings must refresh renamed DEF assignments before routing files');
assert(workbenches.includes("selected.has('essentials') || selected.has('animation')"), 'character essentials and animation sessions must open the AIR viewer directly');
assert(workbenches.includes("if (allCode && air) await vscode.commands.executeCommand('air.openAnimationPreview'"), 'Open All Character Code must open the assigned AIR viewer directly');
assert(workbenches.includes('viewerColumn: assetColumn'), 'Coding, AIR, SFF and SND openings must share the character-session editor-group anchor');
assert(workbenches.includes('Character startup is deliberately single-group'), 'the one-group startup policy must remain explicit at the routing boundary');
for (const [name, text] of [['AIR', air], ['SFF', sff], ['SND', snd]]) {
  assert(text.includes("executeCommand('ikemen.textToolbar.suspendForVisualViewer')"), `${name} must remove the text-only companion before occupying the visual workspace`);
}
assert(air.includes('airViewerColumn(options.sourceColumn, options.viewerColumn)'), 'AIR must accept the character session asset-group anchor while rejecting an unrequested AIR text source column');
assert(air.includes('Number.isInteger(options.viewerColumn) && options.viewerColumn > 0'), 'an explicit character-session column must move a reused AIR panel into the cohesive group');
assert(air.includes('sourceColumn: editor.viewColumn'), 'AIR auto-open must receive the AIR text editor column');
assert(air.includes("!(group.tabs || []).length"), 'AIR auto-open must reuse an existing empty visual group');
assert(air.includes('empty?.viewColumn || vscode.ViewColumn.Beside'), 'the first AIR viewer must reuse an empty group or open beside source');
assert(air.includes("executeCommand('ikemen.textToolbar.resumeFromVisualViewer'") && air.includes('transitionPanel:session.panel'), 'AIR source buttons restore the canonical header-over-editor text workspace and close the originating visual group safely');
assert(navigation.includes("executeCommand('ikemen.textToolbar.resumeFromVisualViewer'") && navigation.includes('transitionPanel:fromPoint.panel'), 'viewer toolbar Text Editor and Back to Source routes restore one focused text workspace instead of adding side-by-side groups');
assert(navigation.includes('openSource(origin,point)'), 'Back to Source retains the originating viewer panel needed for the guarded layout transition');
for (const [name, text, map] of [['SFF', sff, 'sffPanelsByFile'], ['SND', snd, 'sndPanelsByFile']]) {
  assert(text.includes(`const ${map} = new Map()`) || text.includes(`const ${map} = createPanelBindingRegistry(`), `${name} must track one viewer per archive`);
  assert(text.includes(`${map}.get(panelKey(filename))`), `${name} command opens must reuse an existing viewer`);
  assert(text.includes('preferredViewerColumn(vscode.ViewColumn.Beside)'), `${name} direct-file opens must use the shared viewer group`);
  assert(text.includes('Number.isInteger('), `${name} must honor an explicit character-session editor column when reusing a viewer`);
  assert(text.includes('panel.dispose(); existing.reveal(existing.viewColumn || target, false)'), `${name} custom editors must reuse the existing archive without moving its tab`);
}

console.log('Asset viewer-group routing tests passed');
