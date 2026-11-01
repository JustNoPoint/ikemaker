'use strict';

const assert = require('assert');
const path = require('path');
const Module = require('module');
const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return {};
  return originalLoad.call(this, request, parent, isMain);
};
const { shaderSffCommandOptions } = require('../src/sff_viewer');
const { shaderAirCommandOptions } = require('../src/air_viewer');
const { menuDefinitions } = require('../src/viewer_toolbar');
Module._load = originalLoad;

const trustedSff = path.resolve('C:/game/chars/Ryu/Sf6Ryu.sff'), trustedAir = path.resolve('C:/game/chars/Ryu/Sf6Ryu.air');
const archive = {
  sprites: [{ index: 0, group: 1, number: 0, paletteIndex: 0 }, { index: 1, group: 200, number: 3, paletteIndex: 1 }],
  palettes: [{ index: 0, group: 1, number: 0 }, { index: 1, group: 1, number: 1 }]
};
const forgedSffMessage = { selectedIndex: 1, path: 'C:/evil.sff', group: 999, number: 999, palettePhysicalIndex: 999 };
const sff = shaderSffCommandOptions(trustedSff, archive, forgedSffMessage.selectedIndex);
assert.strictEqual(sff.sffPath, trustedSff);
assert.deepStrictEqual(sff.selection, { physicalIndex: 1, group: 200, number: 3, palettePhysicalIndex: 1 });
assert(!JSON.stringify(sff).includes('evil') && !JSON.stringify(sff).includes('999'), 'SFF handoff ignores client-supplied paths and identities');

const sprite = { index: 1, group: 200, number: 3 }, session = { sffPath: trustedSff, airPath: trustedAir, byKey: new Map([['200,3', sprite]]) };
const airText = '[Begin Action 400]\n200, 3, 0, 0, 4\n';
const forgedAirMessage = { action: 400, frameIndex: 0, airPath: 'C:/evil.air', sffPath: 'C:/evil.sff', group: 999, number: 999 };
const air = shaderAirCommandOptions(session, airText, forgedAirMessage.action, forgedAirMessage.frameIndex);
assert.strictEqual(air.sffPath, trustedSff); assert.strictEqual(air.airPath, trustedAir); assert.strictEqual(air.actionNumber, 400);
assert.deepStrictEqual(air.spriteSelection, { physicalIndex: 1, group: 200, number: 3 });
assert(!JSON.stringify(air).includes('evil') && !JSON.stringify(air).includes('999'), 'AIR handoff derives exact paths and sprite identity from the live host session');
assert.throws(() => shaderAirCommandOptions(session, airText, 401, 0), /no longer exists/);
const sffSprites = menuDefinitions('sff').find(group => group.label === 'Sprites').items;
const airAnimations = menuDefinitions('air').find(group => group.label === 'Animations').items;
assert(sffSprites.some(item => item.action === 'shaderPreview'), 'SFF Shader Workshop handoff is available in the Sprites dropdown');
assert(airAnimations.some(item => item.element === 'shaderWorkshop'), 'AIR Shader Workshop handoff is available in the Animations dropdown');

console.log('SFF and AIR Shader Workshop handoffs derive exact source identities in the host and ignore forged client fields');
