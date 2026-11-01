'use strict';

const assert = require('assert');
const { sourceMessageAllowed,transferMessageAllowed } = require('../src/sff_transfer_policy');

for (const type of ['sffRetainedState','sffSelection','viewerNavigationReady','quickSpritePosition','palette','thumbnails','animationImages','sprite','spritePaletteColors']) assert.strictEqual(sourceMessageAllowed({ type }), true, type);
for (const command of ['sff.transfer.copySelected','sff.transfer.swapSides','sff.transfer.openBrowser','sff.transfer.changeSource','sff.transfer.changeDestination','sff.transfer.exit','sff.transfer.continueAssembly']) assert.strictEqual(sourceMessageAllowed({ type:'command', command }), true, command);
for (const message of [
  null, {}, { type:'command', command:'sff.openCreator' }, { type:'command', command:'workbench.action.files.save' },
  { type:'saveAxes' }, { type:'viewerAssetHistory' }, { type:'reviewUpdate' }, { type:'setAxis' },
  { type:'sffAction', action:'deleteSprite' }, { type:'savePaletteEdits' }, { type:'replacePalette' },
  { type:'exportAct' }, { type:'openLayerBrowser' }
]) assert.strictEqual(sourceMessageAllowed(message), false, JSON.stringify(message));

const endpoint={transferPinned:true,transferRole:'destination'},mutation={type:'saveAxes'};
assert.equal(transferMessageAllowed(endpoint,mutation),true,'the current destination may use its normal mutation authority');
endpoint.transferRole='source';
assert.equal(transferMessageAllowed(endpoint,mutation),false,'after Swap, the same live owner immediately becomes read-only');
assert.equal(transferMessageAllowed(endpoint,{type:'sffSelection'}),true,'the swapped source retains selection authority');
endpoint.transferRole='destination';
assert.equal(transferMessageAllowed(endpoint,mutation),true,'swapping back restores destination authority');

console.log('SFF Transfer source endpoint policy allows navigation/review only and rejects mutation routes');
