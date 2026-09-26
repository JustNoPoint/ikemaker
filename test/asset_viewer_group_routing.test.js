'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = (name) => fs.readFileSync(path.join(__dirname, '..', 'src', name), 'utf8');
const workbenches = source('character_workbenches.js');
const air = source('air_viewer.js');
const sff = source('sff_viewer.js');
const snd = source('snd_viewer.js');

assert(workbenches.includes("const viewerColumn = viewerColumnFor(column)"), 'character sessions must route archives away from their source-code group');
assert(!workbenches.includes("executeCommand('sff.openViewer', vscode.Uri.file(filename), column)"), 'SFF must not inherit the source-code column');
assert(!workbenches.includes("executeCommand('snd.openViewer', vscode.Uri.file(filename), column)"), 'SND must not inherit the source-code column');
assert(!workbenches.includes("executeCommand('workbench.action.newGroupRight')"), 'character sessions must not leave a pre-created empty editor group');
assert(workbenches.includes("categoryFor(filename, profile) === 'Code'"), 'Character essentials must include connected ZSS/CNS/CMD source files');
assert(workbenches.includes("!(group.tabs || []).length"), 'character sessions must reuse an existing empty group for viewers');
assert(air.includes('airViewerColumn(options.sourceColumn)'), 'AIR auto-open must reject the AIR text source column as its visual destination');
assert(air.includes('sourceColumn: editor.viewColumn'), 'AIR auto-open must receive the AIR text editor column');
assert(air.includes("!(group.tabs || []).length"), 'AIR auto-open must reuse an existing empty visual group');
assert(air.includes('empty?.viewColumn || vscode.ViewColumn.Beside'), 'the first AIR viewer must reuse an empty group or open beside source');
for (const [name, text, map] of [['SFF', sff, 'sffPanelsByFile'], ['SND', snd, 'sndPanelsByFile']]) {
  assert(text.includes(`const ${map} = new Map()`), `${name} must track one viewer per archive`);
  assert(text.includes(`${map}.get(panelKey(filename))`), `${name} command opens must reuse an existing viewer`);
  assert(text.includes('preferredViewerColumn(vscode.ViewColumn.Beside)'), `${name} direct-file opens must use the shared viewer group`);
  assert(text.includes('panel.dispose(); existing.reveal(existing.viewColumn || target, false)'), `${name} custom editors must reuse the existing archive without moving its tab`);
}

console.log('Asset viewer-group routing tests passed');
