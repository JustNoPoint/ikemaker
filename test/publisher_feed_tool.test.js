'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function storedZip(entries) {
  const locals = [], centrals = []; let offset = 0;
  for (const [name, value] of Object.entries(entries)) {
    const filename = Buffer.from(name), data = Buffer.from(value), local = Buffer.alloc(30), central = Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(filename.length, 26);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(filename.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, filename, data); centrals.push(central, filename); offset += local.length + filename.length + data.length;
  }
  const directory = Buffer.concat(centrals), eocd = Buffer.alloc(22), count = Object.keys(entries).length;
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(count, 8); eocd.writeUInt16LE(count, 10); eocd.writeUInt32LE(directory.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, eocd]);
}

function vsix(version, publisher = 'justnopoint') { return storedZip({ 'extension/package.json': JSON.stringify({ publisher, name: 'ikemen-zss-tools', version }), 'extension.vsixmanifest': `<PackageManifest><Metadata><Identity Publisher="${publisher}" Id="ikemen-zss-tools" Version="${version}" /></Metadata></PackageManifest>` }); }

const root = path.resolve(__dirname, '..'), currentVersion = require('../package.json').version, script = path.join(root, 'tools', 'create-extension-update-feed.ps1'), folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-feed-test-'));
function run(name, bytes) {
  const input = path.join(folder, `${name}.vsix`), output = path.join(folder, `${name}.json`); fs.writeFileSync(input, bytes);
  const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-VsixPath', input, '-PackageUrl', `https://github.com/JustNoPoint/ikemaker/releases/download/v${currentVersion}/${name}.vsix`, '-OutputPath', output], { encoding: 'utf8' });
  return { result, output };
}

let item = run('correct', vsix(currentVersion));
assert.strictEqual(item.result.status, 0, `${item.result.stdout} ${item.result.stderr}`);
const feed = JSON.parse(fs.readFileSync(item.output, 'utf8'));
assert.strictEqual(feed.releases[0].version, currentVersion); assert.strictEqual(feed.releases[0].package.bytes, fs.statSync(path.join(folder, 'correct.vsix')).size); assert.match(feed.releases[0].package.sha256, /^[a-f0-9]{64}$/);

item = run('wrong-version', vsix('0.77.9')); assert.notStrictEqual(item.result.status, 0); assert.match(`${item.result.stdout}\n${item.result.stderr}`, /version mismatch/i);
item = run('wrong-id', vsix(currentVersion, 'other')); assert.notStrictEqual(item.result.status, 0); assert.match(`${item.result.stdout}\n${item.result.stderr}`, /not the expected/i);
item = run('malformed', Buffer.from('not a zip')); assert.notStrictEqual(item.result.status, 0);

fs.rmSync(folder, { recursive: true, force: true });
console.log('Publisher feed tool derives identity/version/hash/size from the supplied VSIX and rejects mismatches');
