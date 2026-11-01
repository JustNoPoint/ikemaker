'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = name => fs.readFileSync(path.join(__dirname, '..', 'src', name), 'utf8');
const toolbar = source('viewer_toolbar.js');
const sff = source('sff_viewer.js');
const air = source('air_viewer.js');
const snd = source('snd_viewer.js');

assert(toolbar.includes("['sff','air','snd'].includes(surface)"), 'SFF, AIR, and SND must share the viewer-history menu contract');
assert(toolbar.includes("`${surface}.element.undoAsset`"), 'viewer headers must route Undo to the active surface endpoint');
assert(toolbar.includes("`${surface}.element.redoAsset`"), 'viewer headers must route Redo to the active surface endpoint');
assert(toolbar.includes('Text / Input Undo'), 'text/input undo must remain an explicitly separate Edit-menu action');
assert(toolbar.includes('Undo ${surface.toUpperCase()} Viewer Change'), 'viewer undo must be clearly distinguished from text undo');

assert(toolbar.includes("special==='asset-undo'||special==='asset-redo'"), 'visible universal Undo and Redo controls must dispatch directly without hidden bridge buttons');
for (const [name, text] of [['SFF', sff], ['AIR', air], ['SND', snd]]) {
  assert(text.includes('viewerAssetHistory'), `${name} must handle its own asset-history request`);
  assert(!text.includes('id="undoAsset"') && !text.includes('id="redoAsset"'), `${name} must not require hidden Undo or Redo bridge controls`);
}

assert(sff.includes("axisHistoryPending=direction"), 'SFF undo during axis autosave must wait for the save instead of racing it');
assert(sff.includes("assetHistory.undo.push({before,after:normalized})"), 'SFF axis autosave must retain exact before and after coordinates');
assert(sff.includes("type:'assetHistoryApplied'"), 'SFF undo/redo must update the live viewer after the binary write');
assert(air.includes('requestAirViewerHistory(session,message.direction)')&&air.includes("commands.executeCommand(redo?'redo':'undo')"), 'AIR viewer history must focus and revalidate the exact bound AIR document');
assert(snd.includes('const trackWrite='), 'SND profile and manifest writes must retain reversible session snapshots');
assert(snd.includes("`snd-viewer-${direction}`"), 'SND undo/redo must use reviewed transactional writes');

console.log('Universal SFF/AIR/SND viewer undo and redo routing contract passed');
