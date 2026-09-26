'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { bundledTool, resolveProjectTool, toolchainStatus } = require('../src/bundled_tools');

function run() {
  const bundled = bundledTool('sprmake2.exe', 'win32', 'x64');
  assert.ok(bundled.endsWith(path.join('bin', 'win32-x64', 'sprmake2.exe')));
  assert.strictEqual(bundledTool('sprmake2.exe', 'linux', 'x64'), null);
  assert.ok(toolchainStatus({ platform: 'win32', arch: 'x64' }).every((item) => item.available));
  const bin = path.dirname(bundled);
  for (const dependency of [
    'Microsoft.VC90.CRT/Microsoft.VC90.CRT.manifest',
    'Microsoft.VC90.CRT/msvcr90.dll',
    'Microsoft.VC90.CRT/msvcm90.dll',
    'Elecbyte.MUGEN.libs/Elecbyte.MUGEN.libs.manifest'
  ]) assert.ok(fs.existsSync(path.join(bin, dependency)), `missing SprMaker2 runtime dependency ${dependency}`);

  if (process.platform === 'win32' && process.arch === 'x64') {
    const smoke = spawnSync(bundled, [], { cwd: os.tmpdir(), encoding: 'utf8', windowsHide: true, timeout: 5000 });
    assert.strictEqual(smoke.error, undefined, `SprMaker2 launch failed: ${smoke.error && smoke.error.message}`);
    assert.strictEqual(smoke.status, 0, `SprMaker2 launch returned ${smoke.status}: ${smoke.stderr}`);
    assert.match(`${smoke.stdout}\n${smoke.stderr}`, /SprMaker ver 2\.01beta/);
  }

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemen-tool-resolution-'));
  const nested = path.join(root, 'chars', 'test');
  const tools = path.join(root, 'tools', 'mugen-build');
  fs.mkdirSync(nested, { recursive: true });
  fs.mkdirSync(tools, { recursive: true });
  const local = path.join(tools, 'sprmake2.exe');
  fs.writeFileSync(local, 'fixture');
  assert.strictEqual(resolveProjectTool('sprmake2.exe', nested, 'sprmake2.exe', { platform: 'win32', arch: 'x64' }), local);

  const explicit = path.join(root, 'custom-sprmake2.exe');
  assert.strictEqual(resolveProjectTool(explicit, nested, 'sprmake2.exe', { platform: 'win32', arch: 'x64' }), explicit);
  fs.rmSync(root, { recursive: true, force: true });
}

module.exports = { run };
if (require.main === module) {
  run();
  console.log('Bundled builder resolution tests passed');
}
