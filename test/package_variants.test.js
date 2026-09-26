'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-package-variants-'));
const vsix = path.join(folder, 'ikemaker.vsix'), lua = path.join(folder, 'lua.vsix');
fs.writeFileSync(vsix, 'ikemaker fixture');
fs.writeFileSync(lua, 'lua fixture');

function run(script, name, includeLua) {
  const output = path.join(folder, name);
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'tools', script), '-OutputPath', output, '-VsixPath', vsix, '-LuaVsixPath', lua];
  if (includeLua) args.push('-IncludeLuaLanguageServer');
  const result = spawnSync('powershell.exe', args, { encoding: 'utf8' });
  assert.strictEqual(result.status, 0, `${script} failed: ${result.stdout}\n${result.stderr}`);
  const inspect = spawnSync('powershell.exe', ['-NoProfile', '-Command', `Add-Type -AssemblyName System.IO.Compression.FileSystem; $z=[IO.Compression.ZipFile]::OpenRead('${output.replace(/'/g, "''")}'); try { $z.Entries.FullName } finally { $z.Dispose() }`], { encoding: 'utf8' });
  assert.strictEqual(inspect.status, 0, inspect.stderr);
  return inspect.stdout.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
}

try {
  for (const [script, prefix] of [['package-offline.ps1', 'offline'], ['package-online-bootstrap.ps1', 'online']]) {
    const standard = run(script, `${prefix}.zip`, false), companion = run(script, `${prefix}-with-lua.zip`, true);
    assert(!standard.includes('Lua-Language-Server.vsix'), `${script} default package unexpectedly contains LuaLS`);
    assert(!standard.includes('licenses/Lua-Language-Server-LICENSE.txt'), `${script} default package unexpectedly contains LuaLS licensing payload`);
    assert(companion.includes('Lua-Language-Server.vsix'), `${script} companion package is missing LuaLS`);
    assert(companion.includes('licenses/Lua-Language-Server-LICENSE.txt'), `${script} companion package is missing the LuaLS license`);
  }
} finally { fs.rmSync(folder, { recursive: true, force: true }); }

console.log('Default packages exclude LuaLS while explicitly labeled companion variants include it');
