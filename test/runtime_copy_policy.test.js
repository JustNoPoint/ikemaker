'use strict';
const assert = require('assert');
const { runtimeCopyAllowed } = require('../src/runtime_copy_policy');
for (const file of ['_development/tools/tool.exe', 'chars/template/development/vscode/package.json',
  'chars/template/Notes/Shared/log.txt', 'chars/Ryu/backups/prior.sff',
  'chars/template/.pnpm-store/library.js', 'chars/Ryu/Sound_sources/jab.wav',
  'Builder-Rehearsal-2026-09-13/chars/test.def', 'VSelect/app.exe',
  'archive.zip', 'Screenshot_20260924_123456_Discord.jpg']) {
  assert.equal(runtimeCopyAllowed(file), false, file);
}
for (const file of ['Ikemen_GO.exe', 'LICENSES.txt', 'data/system.def',
  'chars/Ryu/Constants.cns', 'chars/Ryu/config.txt', 'chars/Ryu/Ryu_movelist.dat',
  'chars/Ryu/Ryu_Development.sff', 'chars/template/common.zss',
  'chars/template/SF6template/Notes/SF6-sLP-Baseline-Completion-Checklist.txt',
  'external/script/main.lua', 'save/config.ini', 'font/fonts.json']) {
  assert.equal(runtimeCopyAllowed(file), true, file);
}
console.log('Runtime copy policy keeps game data and referenced notes, excludes authoring support.');
