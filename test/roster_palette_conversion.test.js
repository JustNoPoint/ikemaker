'use strict';
const assert = require('assert');
const Module = require('module');
const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) { if (request === 'vscode') return {}; return originalLoad.call(this, request, parent, isMain); };
const { playerPaletteConversion } = require('../src/roster_palette_flow');
Module._load = originalLoad;
const colors = Array.from({ length: 256 }, (_, index) => [index, index, index, index === 0 ? 0 : 255]), source = { name: 'test.act', colors };
const flipped = playerPaletteConversion(source, { flipTable: true, preset: 'none' });
assert.deepStrictEqual(flipped.colors[0].slice(0, 3), [255, 255, 255]); assert.strictEqual(flipped.colors[0][3], 0);
assert.deepStrictEqual(flipped.colors[255].slice(0, 3), [0, 0, 0]); assert.strictEqual(flipped.colors[255][3], 255);
const inverted = playerPaletteConversion(source, { preset: 'invert' }); assert.deepStrictEqual(inverted.colors[10].slice(0, 3), [245, 245, 245]);
assert.deepStrictEqual(source.colors[10], [10, 10, 10, 255]);
console.log('roster palette conversion tests passed');

// Render the actual palette template with an adversarial filename.
const templateSource=require('fs').readFileSync(require('path').join(__dirname,'../src/roster_palette_flow.js'),'utf8'),box={};
require('vm').runInNewContext(templateSource.slice(templateSource.indexOf('function escapeName('),templateSource.indexOf('function paletteSource('))+templateSource.slice(templateSource.indexOf('function page('),templateSource.indexOf('async function openRosterPaletteFlow(')),box);
const hostile='</script><script>alert(1)</script><img src=x onerror=alert(2)>';
const protectedPage=require('../src/webview_policy').protect(box.page({character:hostile,source:{name:hostile},targets:[],after:''}));
assert(!protectedPage.includes(hostile));assert.equal((protectedPage.match(/<script /g)||[]).length,1,'only the application script receives a nonce');assert(protectedPage.includes('&lt;img'));
