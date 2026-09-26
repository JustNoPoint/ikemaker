'use strict';

const assert = require('assert');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const fs = require('fs');
const os = require('os');
const path = require('path');
const model = require('../src/extension_update_model');
const { checkedUrl, getBuffer, validateVsix, ExtensionUpdateService } = require('../src/extension_updater');

const feedUrl = 'https://raw.githubusercontent.com/JustNoPoint/ikemaker/main/updates/beta.json';
const packageUrl = 'https://github.com/JustNoPoint/ikemaker/releases/download/v0.78.1/ikemaker-0.78.1.vsix';

function storedZip(entries) {
  const locals = [], centrals = []; let offset = 0;
  for (const [name, value] of Object.entries(entries)) {
    const filename = Buffer.from(name), data = Buffer.from(value), local = Buffer.alloc(30), central = Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(filename.length, 26);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(filename.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, filename, data); centrals.push(central, filename); offset += local.length + filename.length + data.length;
  }
  const directory = Buffer.concat(centrals), eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(Object.keys(entries).length, 8); eocd.writeUInt16LE(Object.keys(entries).length, 10); eocd.writeUInt32LE(directory.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, eocd]);
}

function vsix(version = '0.78.1', identity = {}) {
  const publisher = identity.publisher || 'justnopoint', name = identity.name || 'ikemen-zss-tools';
  return storedZip({
    'extension/package.json': JSON.stringify({ publisher, name, version }),
    'extension.vsixmanifest': `<?xml version="1.0"?><PackageManifest><Metadata><Identity Publisher="${publisher}" Id="${name}" Version="${version}" /></Metadata></PackageManifest>`
  });
}

function releaseFeed(packageBytes = vsix(), version = '0.78.1', packageHash) {
  const hash = packageHash || crypto.createHash('sha256').update(packageBytes).digest('hex');
  return Buffer.from(JSON.stringify({ schemaVersion: 1, productId: 'ikemaker', releases: [{ version, channel: 'beta', compatibleEditor: { min: '1.85.0', max: '' }, notes: ['Focused beta'], package: { url: packageUrl, sha256: hash, bytes: packageBytes.length } }] }));
}

function harness(overrides = {}) {
  const messages = { info: [], errors: [], warnings: [] }, choices = [...(overrides.choices || [])];
  const defaults = Object.assign({ enabled: true, feedUrl, channel: 'beta', intervalHours: 24, trustedAssetHosts: ['github.com'], maxDownloadMB: 10 }, overrides.defaults || {});
  const globals = Object.assign({}, overrides.globals || {}), workspaceValues = Object.assign({}, overrides.workspaceValues || {});
  const source = {
    get: (key, fallback) => { const short = key.replace(/^extensionUpdates\./, ''); return workspaceValues[short] ?? globals[short] ?? defaults[short] ?? fallback; },
    inspect: (key) => { const short = key.replace(/^extensionUpdates\./, ''); return { key, defaultValue: defaults[short], globalValue: globals[short], workspaceValue: workspaceValues[short] }; }
  };
  const vscode = {
    version: '1.95.0', Uri: { file: (fsPath) => ({ fsPath }) }, workspace: { getConfiguration: () => source },
    window: {
      showInformationMessage: async (message) => { messages.info.push(message); return choices.shift(); },
      showWarningMessage: async (message) => { messages.warnings.push(message); return choices.shift(); },
      showErrorMessage: async (message) => { messages.errors.push(message); return choices.shift(); }
    }, commands: { executeCommand: async () => undefined }
  };
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-update-test-')), state = new Map();
  const context = { extension: { packageJSON: { version: '0.78.0' } }, globalStorageUri: { fsPath: root }, subscriptions: [], globalState: { get: (key, fallback) => state.has(key) ? state.get(key) : fallback, update: async (key, value) => state.set(key, value) } };
  return { vscode, context, messages, choices, root, defaults, globals, workspaceValues };
}

function requestStub(handler) {
  return (url, _options, callback) => {
    const request = new EventEmitter(); request.setTimeout = () => {}; request.destroy = (error) => error && request.emit('error', error);
    process.nextTick(() => handler(url, callback, request)); return request;
  };
}

function response(statusCode, headers = {}) { const value = new EventEmitter(); value.statusCode = statusCode; value.headers = headers; value.resume = () => {}; return value; }

(async () => {
  const packageBytes = vsix();
  assert.deepStrictEqual(validateVsix(packageBytes, '0.78.1'), { publisher: 'justnopoint', name: 'ikemen-zss-tools', version: '0.78.1' });
  assert.throws(() => validateVsix(vsix('0.78.2'), '0.78.1'), /not 0\.78\.1/);
  assert.throws(() => validateVsix(vsix('0.78.1', { publisher: 'other' }), '0.78.1'), /not the expected/);
  assert.throws(() => validateVsix(Buffer.from('not zip'), '0.78.1'), /not a valid VSIX/);

  assert(model.selectUpdate(model.parseFeed(releaseFeed().toString(), feedUrl), '0.78.0', '1.95.0', 'beta'));
  assert.strictEqual(model.selectUpdate(model.parseFeed(releaseFeed(vsix('0.78.0'), '0.78.0').toString(), feedUrl), '0.78.0', '1.95.0', 'beta'), null);
  assert.throws(() => checkedUrl('https://user:pass@github.com/file', ['github.com']), /credentials/);
  let requests = 0;
  await assert.rejects(getBuffer('https://user:pass@github.com/file', { allowedHosts: ['github.com'], request: () => { requests += 1; } }), /credentials/);
  assert.strictEqual(requests, 0, 'credential-bearing initial URL must make no request');
  const redirectRequest = requestStub((_url, callback) => { requests += 1; const res = response(302, { location: 'https://user:pass@github.com/file' }); callback(res); });
  requests = 0; await assert.rejects(getBuffer('https://github.com/start', { allowedHosts: ['github.com'], request: redirectRequest }), /credentials/); assert.strictEqual(requests, 1, 'credential-bearing redirect must not be requested');

  let first = true;
  const interrupted = requestStub((_url, callback) => { const res = response(200); callback(res); process.nextTick(() => { if (first) { first = false; res.emit('data', Buffer.from('half')); res.emit('aborted'); } else { res.emit('data', Buffer.from('ok')); res.emit('end'); res.emit('close'); } }); });
  await assert.rejects(getBuffer('https://github.com/file', { allowedHosts: ['github.com'], request: interrupted }), /interrupted/);
  assert.strictEqual((await getBuffer('https://github.com/file', { allowedHosts: ['github.com'], request: interrupted })).toString(), 'ok', 'later request must run after an interrupted response');

  {
    const h = harness({ workspaceValues: { feedUrl: 'https://evil.example/feed.json', trustedAssetHosts: ['evil.example'] } });
    const config = new ExtensionUpdateService(h.vscode, h.context).configuration();
    assert.strictEqual(config.feedUrl, feedUrl); assert.deepStrictEqual(config.trustedAssetHosts, ['github.com']);
    fs.rmSync(h.root, { recursive: true, force: true });
  }
  {
    const h = harness(); const service = new ExtensionUpdateService(h.vscode, h.context, { fetch: async () => releaseFeed(vsix('0.78.0'), '0.78.0') });
    await service.check(true); assert(h.messages.info.some((text) => /up to date/.test(text))); fs.rmSync(h.root, { recursive: true, force: true });
  }
  {
    const h = harness({ choices: ['Not now'] }); let calls = 0;
    const service = new ExtensionUpdateService(h.vscode, h.context, { fetch: async () => { calls += 1; return releaseFeed(); }, install: async () => { throw new Error('must not install'); } });
    await service.check(true); assert.strictEqual(calls, 1, 'declining must not download'); fs.rmSync(h.root, { recursive: true, force: true });
  }
  {
    const h = harness({ choices: ['Review Update', 'Download, Verify & Install'] }); let calls = 0;
    const service = new ExtensionUpdateService(h.vscode, h.context, { fetch: async () => (++calls === 1 ? releaseFeed(packageBytes, '0.78.1', '0'.repeat(64)) : packageBytes) });
    await service.check(false); assert(h.messages.errors.some((text) => /hash/.test(text)), 'accepted automatic update failure must be visible'); fs.rmSync(h.root, { recursive: true, force: true });
  }
  {
    const h = harness(); const service = new ExtensionUpdateService(h.vscode, h.context, { fetch: async () => { throw new Error('offline'); } });
    await service.check(true); assert(h.messages.errors.some((text) => /offline/.test(text))); fs.rmSync(h.root, { recursive: true, force: true });
  }
  {
    const h = harness({ choices: ['Review Update', 'Download, Verify & Install'] }); let packageFetches = 0, installs = 0;
    const fetch = async (url) => url === feedUrl ? releaseFeed(packageBytes) : (packageFetches += 1, packageBytes);
    const failed = new ExtensionUpdateService(h.vscode, h.context, { fetch, install: async () => { installs += 1; throw new Error('installer interrupted'); } });
    await failed.check(false); assert.strictEqual(packageFetches, 1); assert(h.messages.errors.some((text) => /interrupted/.test(text)));
    h.choices.push('Review Update', 'Download, Verify & Install', 'Later');
    const retry = new ExtensionUpdateService(h.vscode, h.context, { fetch, install: async () => { installs += 1; } });
    await retry.check(true); assert.strictEqual(packageFetches, 1, 'retry must reuse the identity/hash-verified staged VSIX'); assert.strictEqual(installs, 2);
    fs.rmSync(h.root, { recursive: true, force: true });
  }
  {
    const h = harness(); let callback, checks = 0; const originalSetTimeout = global.setTimeout;
    global.setTimeout = (fn) => { callback = fn; return 1; };
    try { const service = new ExtensionUpdateService(h.vscode, h.context); service.check = async () => { checks += 1; }; service.schedule(); h.globals.enabled = false; callback(); assert.strictEqual(checks, 0, 'disabling must cancel the queued startup check'); }
    finally { global.setTimeout = originalSetTimeout; fs.rmSync(h.root, { recursive: true, force: true }); }
  }
  console.log('IKEMaker extension updater tests passed');
})().catch((error) => { console.error(error); process.exit(1); });
