'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const controls = {
  'air_docking_workspace.js': {
    assistRefPrev: 'Previous reference frame', assistRefNext: 'Next reference frame',
    assistTargetPrev: 'Previous target frame', assistTargetNext: 'Next target frame'
  },
  'air_viewer.js': { panLeft: 'Pan preview left', panRight: 'Pan preview right' },
  'helper_workspace.js': { previewPrevious: 'Previous projectile frame', previewNext: 'Next projectile frame' },
  'hitdef_workspace.js': { prevFrame: 'Previous preview frame', nextFrame: 'Next preview frame' },
  'menu_modes_workspace.js': { menuModesPrev: 'Previous source record', menuModesNext: 'Next source record' },
  'move_lab_workspace.js': { movePrev: 'Previous preview tick', moveNext: 'Next preview tick' },
  'spatial_composer_workspace.js': { prev: 'Previous preview tick', next: 'Next preview tick' },
  'select_def_workspace.js': { zoomOut: 'Zoom preview out', zoomIn: 'Zoom preview in' },
  'sff_browser.js': {
    groupNarrow: 'Narrow groups pane', groupWide: 'Widen groups pane',
    spriteNarrow: 'Narrow sprites pane', spriteWide: 'Widen sprites pane'
  }
};

const escapeRegex = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
for (const [filename, expected] of Object.entries(controls)) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', filename), 'utf8');
  for (const [id, label] of Object.entries(expected)) {
    const button = source.match(new RegExp(`<button\\b[^>]*id="${escapeRegex(id)}"[^>]*>`))?.[0] || '';
    assert(button, `${filename} is missing ${id}`);
    assert(button.includes(`aria-label="${label}"`), `${filename}/${id} is missing its concise accessible name`);
    assert(button.includes(`title="${label}"`), `${filename}/${id} is missing its matching pointer tooltip`);
  }
}

const throwSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'throw_creator_workspace.js'), 'utf8');
const removeEvent = throwSource.match(/<button\b[^>]*data-remove-event[^>]*>/)?.[0] || '';
assert(/aria-label="Remove (?:[^" ]+ )?event"/.test(removeEvent), 'Throw Creator remove-event control has an accessible name');
assert(removeEvent.includes('title="Remove event"'), 'Throw Creator remove-event control has a pointer tooltip');

console.log('Icon-only authoring and viewer controls expose concise accessible names and matching tooltips');
