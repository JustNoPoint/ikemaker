'use strict';

const assert = require('assert');
const { resizeScript, resizeActiveAuxiliaryWindowBy } = require('../src/windows_auxiliary_window');

const script = resizeScript(-580);
assert(script.includes("GetFileName($process.Path) -ine 'Code.exe'"), 'native resizing fails closed unless the foreground HWND belongs to Code.exe');
assert(script.includes('IsIconic') && script.includes('IsZoomed'), 'minimized or maximized windows are never resized');
assert(script.includes('+(-580)') && script.includes('0x0016'), 'the adapter changes width without moving, reordering, or activating the window');
(async () => {
  let invocation = null;
  const resized = await resizeActiveAuxiliaryWindowBy(-200, { execFile(file, args, options, callback) { invocation = { file, args, options }; callback(null); } });
  assert.strictEqual(resized, process.platform === 'win32');
  if (process.platform === 'win32') {
    assert.strictEqual(invocation.file, 'powershell.exe');
    assert.strictEqual(invocation.options.windowsHide, true, 'the resize helper cannot flash a console window');
  }
  console.log('Windows auxiliary browser resizing is bounded, hidden, and Code.exe-owned');
})().catch(error => { console.error(error); process.exitCode = 1; });
