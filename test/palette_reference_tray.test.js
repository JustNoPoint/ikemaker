'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { normalizePalette, parseIndexMacro, applyIndexMacro, trayHtml, trayClientScript } = require('../src/palette_reference_tray');

const colors = Array.from({ length: 256 }, (_, index) => [index, 255 - index, index % 17, index === 0 ? 0 : 255]);
assert.deepStrictEqual(parseIndexMacro('32=18\n33 <- 19\n; comment\n34 ← 20'), [
  { destination: 32, source: 18 },
  { destination: 33, source: 19 },
  { destination: 34, source: 20 }
]);
assert.throws(() => parseIndexMacro('32=18\n32=19'), /more than once/);
assert.throws(() => parseIndexMacro('256=1'), /outside 0-255/);
assert.throws(() => parseIndexMacro('copy 1'), /destination=source/);
const result = applyIndexMacro(colors, [{ destination: 32, source: 18 }]);
assert.deepStrictEqual(result[32], colors[18]);
assert.deepStrictEqual(result[31], colors[31]);
result[32][0] = 99;
assert.notStrictEqual(result[32][0], colors[18][0]);
assert.strictEqual(normalizePalette(colors).length, 256);
assert.match(trayHtml(), /Reference Palette Tray/);
assert.match(trayHtml(), /Load Palettes \/ Images/);
assert.match(trayHtml(), /Save Conversion/);
assert.match(trayClientScript(), /exportReferenceBatch/);
assert.match(trayClientScript(), /referenceMacroLoaded/);
const sffViewer = fs.readFileSync(path.join(__dirname, '..', 'src', 'sff_viewer.js'), 'utf8');
assert.match(sffViewer, /defaultUri:\s*recentFolders\.defaultUri\(vscode, PALETTE_REFERENCE_FOLDER\)/, 'Load Palettes / Images starts in the remembered folder');
assert.match(sffViewer, /await recentFolders\.rememberSelection\(PALETTE_REFERENCE_FOLDER, picked\)/, 'successful palette selections remember their source folder');

console.log('palette reference tray tests passed');
