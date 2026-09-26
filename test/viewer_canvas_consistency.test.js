'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, 'src', name), 'utf8');
const theme = {
  background: '#132033',
  grid: '#34475e',
  axis: '#5cb6ff'
};

const coordinateViewers = [
  'air_viewer.js',
  'move_constants_workspace.js',
  'hitdef_workspace.js',
  'move_lab_workspace.js',
  'helper_workspace.js',
  'throw_creator_workspace.js',
  'spatial_composer_workspace.js',
  'viewer_animation_comparison.js'
];

for (const filename of coordinateViewers) {
  const source = read(filename);
  for (const [role, color] of Object.entries(theme)) {
    assert(source.includes(color), `${filename} must use the shared ${role} color ${color}`);
  }
}

const air = read('air_viewer.js');
assert(air.includes("dark:'#132033'"), 'AIR Dark proof mode must use the standard viewer canvas background');
assert(air.includes("ctx.strokeStyle='#34475e'"), 'AIR grid must use the standard grid color');
assert(air.includes("ctx.strokeStyle='#5cb6ff'"), 'AIR axes must use the standard axis color');

const spatial = read('spatial_composer_workspace.js');
assert(spatial.includes('x.moveTo(0,i*h/10+pan.y)'), 'Spatial Composer must draw horizontal as well as vertical grid lines');

const hitdef = read('hitdef_workspace.js');
assert(hitdef.includes("ctx.strokeStyle='#34475e';for(let x=gx"), 'Universal HitDef must render the standard full grid');

console.log('viewer_canvas_consistency.test.js passed');
