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
  fs.writeFileSync(path.join(folder, 'code.cmd'), '@echo off\necho %*>>"%~dp0calls.txt"\necho %*| findstr /I "Lua-Language-Server" >nul && if "%FAIL_LUA%"=="1" exit /b 9\nexit /b 0\n');
  return folder;
}

function environment(folder, failLua = false) { return { ...process.env, PATH: `${folder};${process.env.PATH}`, FAIL_LUA: failLua ? '1' : '0' }; }
function runOffline(folder, failLua = false) { return spawnSync('cmd.exe', ['/d', '/c', path.join(folder, 'Install IKEMEN Creator Tools.cmd')], { cwd: folder, env: environment(folder, failLua), input: '\r\n\r\n', encoding: 'utf8' }); }
function runOnline(folder, failLua = false) { return spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(folder, 'Install-IKEMaker-Online.ps1')], { cwd: folder, env: environment(folder, failLua), encoding: 'utf8' }); }

for (const runner of [runOffline, runOnline]) {
  let folder = fixture(); let result = runner(folder, false);
  assert.strictEqual(result.status, 0, `${runner.name} complete setup must succeed: ${result.stdout} ${result.stderr}`); fs.rmSync(folder, { recursive: true, force: true });

  folder = fixture(); fs.rmSync(path.join(folder, 'Lua-Language-Server.vsix')); result = runner(folder, false);
  assert.strictEqual(result.status, 4, `${runner.name} missing companion must return partial status`); assert.match(`${result.stdout}\n${result.stderr}`, /incomplete/i); assert.match(`${result.stdout}\n${result.stderr}`, /Install from VSIX/i); fs.rmSync(folder, { recursive: true, force: true });

  folder = fixture(); result = runner(folder, true);
  assert.strictEqual(result.status, 4, `${runner.name} failed companion must return partial status`); assert.match(`${result.stdout}\n${result.stderr}`, /incomplete/i); assert.match(`${result.stdout}\n${result.stderr}`, /Install from VSIX/i); fs.rmSync(folder, { recursive: true, force: true });
}

console.log('Offline and online installers report complete, missing-Lua and failed-Lua outcomes without touching live VS Code');
