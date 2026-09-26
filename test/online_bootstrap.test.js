'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const ps = fs.readFileSync(path.join(root, 'offline', 'Install-IKEMaker-Online.ps1'), 'utf8');
const cmd = fs.readFileSync(path.join(root, 'offline', 'Install IKEMaker Online.cmd'), 'utf8');
const packager = fs.readFileSync(path.join(root, 'tools', 'package-online-bootstrap.ps1'), 'utf8');

assert(ps.includes('https://update.code.visualstudio.com/latest/win32-x64-user/stable'));
assert(ps.includes('Get-AuthenticodeSignature'));
assert(ps.includes("$signature.Status -ne 'Valid'"));
assert(ps.includes("O=Microsoft Corporation"));
assert(ps.indexOf('Get-AuthenticodeSignature') < ps.indexOf('Start-Process -FilePath $installer'));
assert(ps.includes('--install-extension $ikemakerVsix --force'));
assert(cmd.includes('Install-IKEMaker-Online.ps1'));
for (const file of ['IKEMEN-Creator-Tools.vsix', 'Lua-Language-Server.vsix', 'BETA-NOTES.txt', 'BETA-TEST-CHECKLIST.txt', 'THIRD-PARTY-NOTICES.md', 'SHA256SUMS.txt']) assert(packager.includes(file));

console.log('Online VS Code bootstrap tests passed');
