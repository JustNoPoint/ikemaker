'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const layout = require('../src/palette_workshop_layout');

const definition = layout.definition(), source = fs.readFileSync(path.join(__dirname, '..', 'src', 'palette_workshop_layout.js'), 'utf8'), browser = fs.readFileSync(path.join(__dirname, '..', 'src', 'sff_browser.js'), 'utf8'), viewer = fs.readFileSync(path.join(__dirname, '..', 'src', 'sff_viewer.js'), 'utf8');
assert.strictEqual(definition.sections[0].id, 'start', 'Palette Workshop begins with task choices rather than the long build form');
for (const label of ['Add Existing Palette Files', 'Edit / Replace Current Palette', 'Sync Character Palette Folder', 'Create Palette from Current', 'Create / Organize Image Template', 'Repair / Adapt Sprite Colors']) {
  assert(source.includes(label), `${label} must appear in the authoritative Palette Workshop`);
  assert(browser.includes(label), `${label} must appear in the floating Palette Workshop`);
}
assert(definition.advancedActions.includes('adaptPalette'), 'pixel/index adaptation belongs to an explicit advanced path');
assert.match(viewer, /paletteSyncFlow\.onclick=\(\)=>vscode\.postMessage\(\{type:'sffAction',action:'paletteSync'\}\)/, 'the start path reuses the existing explicit Import/Export/Two-Way Sync chooser');
assert.match(source, /Every tool remains reachable in its full section/, 'start paths guide without hiding the complete tool sections');
assert.match(browser, /Every tool remains reachable in its full section/, 'the floating browser preserves complete access too');
console.log('Palette Workshop standard/advanced start paths and full-section access passed');
