'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..'), source = path.join(root, 'offline');

function fixture() {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-installer-test-'));
  for (const name of ['Install IKEMEN Creator Tools.cmd', 'Install-IKEMaker-Online.ps1']) fs.copyFileSync(path.join(source, name), path.join(folder, name));
  fs.writeFileSync(path.join(folder, 'IKEMEN-Creator-Tools.vsix'), 'fixture');
  fs.writeFileSync(path.join(folder, 'Lua-Language-Server.vsix'), 'fixture');
  fs.writeFileSync(path.join(folder, 'code.cmd'), '@echo off\necho %*>>"%~dp0calls.txt"\necho %*| findstr /I "Lua-Language-Server" >nul\nif not errorlevel 1 if "%FAIL_LUA%"=="1" exit /b 9\nexit /b 0\n');
  return folder;
}

function environment(folder, failLua = false) { return { ...process.env, PATH: `${folder};${process.env.PATH}`, FAIL_LUA: failLua ? '1' : '0' }; }
function runOffline(folder, installLua = false, failLua = false) { return spawnSync('cmd.exe', ['/d', '/c', path.join(folder, 'Install IKEMEN Creator Tools.cmd')], { cwd: folder, env: environment(folder, failLua), input: `${installLua ? 'y' : 'n'}\r\n\r\n`, encoding: 'utf8' }); }
function runOnline(folder, installLua = false, failLua = false) { const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(folder, 'Install-IKEMaker-Online.ps1')]; if (installLua) args.push('-InstallLuaLanguageServer'); return spawnSync('powershell.exe', args, { cwd: folder, env: environment(folder, failLua), encoding: 'utf8' }); }
function calls(folder) { return fs.existsSync(path.join(folder, 'calls.txt')) ? fs.readFileSync(path.join(folder, 'calls.txt'), 'utf8') : ''; }

for (const runner of [runOffline, runOnline]) {
  let folder = fixture(); let result = runner(folder, false, false);
  assert.strictEqual(result.status, 0, `${runner.name} default setup must succeed: ${result.stdout} ${result.stderr}`);
  assert(!/Lua-Language-Server/i.test(calls(folder)), `${runner.name} default setup must not request LuaLS installation`); fs.rmSync(folder, { recursive: true, force: true });

  folder = fixture(); result = runner(folder, true, false);
  assert.strictEqual(result.status, 0, `${runner.name} selected companion setup must succeed: ${result.stdout} ${result.stderr}`);
  assert(/Lua-Language-Server/i.test(calls(folder)), `${runner.name} selected companion must request LuaLS installation`); fs.rmSync(folder, { recursive: true, force: true });

  folder = fixture(); result = runner(folder, true, true);
  assert.strictEqual(result.status, 4, `${runner.name} failed selected companion must return partial status: ${result.stdout}\n${result.stderr}`); assert.match(`${result.stdout}\n${result.stderr}`, /IKEMaker installed/i); assert.match(`${result.stdout}\n${result.stderr}`, /optional Lua companion/i); fs.rmSync(folder, { recursive: true, force: true });

  folder = fixture(); fs.rmSync(path.join(folder, 'Lua-Language-Server.vsix')); result = runner(folder, false, false);
  assert.strictEqual(result.status, 0, `${runner.name} no-Lua package must be a complete successful install`); assert(!/Lua-Language-Server/i.test(calls(folder))); fs.rmSync(folder, { recursive: true, force: true });
}

let folder = fixture(); fs.rmSync(path.join(folder, 'Lua-Language-Server.vsix')); const selectedMissing = runOnline(folder, true, false);
assert.strictEqual(selectedMissing.status, 4, 'explicitly selecting a missing optional companion must return partial status'); fs.rmSync(folder, { recursive: true, force: true });

console.log('Offline and online installers keep LuaLS optional and report selected companion failures without touching live VS Code');
