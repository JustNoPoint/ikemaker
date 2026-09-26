'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const zlib = require('zlib');
const model = require('./extension_update_model');

const LAST_CHECK_KEY = 'ikemen.extensionUpdates.lastCheck.v1';
const EXPECTED_IDENTITY = { publisher: 'justnopoint', name: 'ikemen-zss-tools' };

function checkedUrl(value, allowedHosts, label = 'Update URL') {
  let parsed;
  try { parsed = new URL(value); } catch (_) { throw new Error(`${label} is invalid.`); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error(`${label} must use HTTPS without embedded credentials.`);
  if (!allowedHosts.includes(parsed.hostname.toLowerCase())) throw new Error(`Untrusted update host: ${parsed.hostname || 'unknown'}.`);
  return parsed;
}

function getBuffer(url, options = {}, redirects = 0) {
  const maxBytes = options.maxBytes || 1024 * 1024;
  const allowedHosts = (options.allowedHosts || []).map((item) => String(item).toLowerCase());
  const overallTimeoutMs = options.overallTimeoutMs || 60000;
  const deadline = options.deadline || Date.now() + overallTimeoutMs;
  const requestImpl = options.request || https.get;
  if (redirects > 4) return Promise.reject(new Error('Too many update redirects.'));
  let parsed;
  try { parsed = checkedUrl(url, allowedHosts); } catch (error) { return Promise.reject(error); }
  const remaining = deadline - Date.now();
  if (remaining <= 0) return Promise.reject(new Error('Update request exceeded its overall time limit.'));
  return new Promise((resolve, reject) => {
    let settled = false;
    let request;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true; reject(new Error('Update request exceeded its overall time limit.'));
      try { request?.destroy(); } catch (_) {}
    }, remaining);
    const finish = (handler, value) => { if (settled) return; settled = true; clearTimeout(timer); handler(value); };
    const fail = (error) => finish(reject, error instanceof Error ? error : new Error(String(error)));
    try {
      request = requestImpl(parsed, { headers: { 'User-Agent': 'IKEMaker-Extension-Updater', Accept: 'application/json, application/octet-stream' } }, (response) => {
        let ended = false;
        response.on('error', fail);
        response.on('aborted', () => fail(new Error('Update response was interrupted.')));
        response.on('close', () => { if (!ended) fail(new Error('Update response closed before completion.')); });
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          ended = true; response.resume();
          let redirect;
          try { redirect = checkedUrl(new URL(response.headers.location, parsed).toString(), allowedHosts, 'Update redirect'); } catch (error) { return fail(error); }
          return getBuffer(redirect.toString(), { ...options, allowedHosts, deadline }, redirects + 1).then((value) => finish(resolve, value), fail);
        }
        if (response.statusCode < 200 || response.statusCode >= 300) { ended = true; response.resume(); return fail(new Error(`Update server returned HTTP ${response.statusCode}.`)); }
        const declared = Number(response.headers['content-length'] || 0);
        if (declared > maxBytes) { ended = true; response.resume(); return fail(new Error('Update response exceeds the configured size limit.')); }
        const chunks = []; let bytes = 0;
        response.on('data', (chunk) => {
          bytes += chunk.length;
          if (bytes > maxBytes) { fail(new Error('Update response exceeds the configured size limit.')); try { request.destroy(); } catch (_) {} }
          else chunks.push(chunk);
        });
        response.on('end', () => { ended = true; finish(resolve, Buffer.concat(chunks)); });
      });
      if (request && typeof request.setTimeout === 'function') request.setTimeout(Math.min(20000, remaining), () => { try { request.destroy(new Error('Update request timed out.')); } catch (_) {} });
      if (request && typeof request.on === 'function') request.on('error', fail);
    } catch (error) { fail(error); }
  });
}

function sha256(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); }
function safeVersion(value) { return String(value).replace(/[^0-9A-Za-z._-]/g, '_'); }

function zipEntry(buffer, wanted) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) throw new Error('Downloaded package is not a valid VSIX archive.');
  const minimum = Math.max(0, buffer.length - 65557); let eocd = -1;
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) if (buffer.readUInt32LE(offset) === 0x06054b50) { eocd = offset; break; }
  if (eocd < 0) throw new Error('Downloaded package has no valid VSIX directory.');
  const count = buffer.readUInt16LE(eocd + 10), directoryOffset = buffer.readUInt32LE(eocd + 16); let cursor = directoryOffset;
  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Downloaded package has a malformed VSIX directory.');
    const method = buffer.readUInt16LE(cursor + 10), compressedSize = buffer.readUInt32LE(cursor + 20), nameLength = buffer.readUInt16LE(cursor + 28), extraLength = buffer.readUInt16LE(cursor + 30), commentLength = buffer.readUInt16LE(cursor + 32), localOffset = buffer.readUInt32LE(cursor + 42);
    const filename = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8').replace(/\\/g, '/');
    if (filename === wanted) {
      if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('Downloaded package has a malformed VSIX entry.');
      const localName = buffer.readUInt16LE(localOffset + 26), localExtra = buffer.readUInt16LE(localOffset + 28), start = localOffset + 30 + localName + localExtra, end = start + compressedSize;
      if (end > buffer.length) throw new Error('Downloaded package has a truncated VSIX entry.');
      const payload = buffer.subarray(start, end);
      if (method === 0) return payload;
      if (method === 8) return zlib.inflateRawSync(payload);
      throw new Error('Downloaded package uses an unsupported VSIX compression method.');
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error(`Downloaded package is missing ${wanted}.`);
}

function xmlIdentity(text) {
  const tag = /<Identity\b([^>]*)\/?\s*>/i.exec(text)?.[1];
  if (!tag) throw new Error('Downloaded package has no VSIX identity.');
  const attributes = {};
  for (const match of tag.matchAll(/([A-Za-z][\w.-]*)\s*=\s*"([^"]*)"/g)) attributes[match[1].toLowerCase()] = match[2];
  return { publisher: attributes.publisher, name: attributes.id, version: attributes.version };
}

function validateVsix(buffer, expectedVersion) {
  let packageJson;
  try { packageJson = JSON.parse(zipEntry(buffer, 'extension/package.json').toString('utf8')); } catch (error) { throw new Error(`Downloaded package metadata is invalid: ${error.message}`); }
  const manifest = xmlIdentity(zipEntry(buffer, 'extension.vsixmanifest').toString('utf8'));
  const actual = { publisher: String(packageJson.publisher || ''), name: String(packageJson.name || ''), version: String(packageJson.version || '') };
  for (const key of ['publisher', 'name']) if (actual[key] !== EXPECTED_IDENTITY[key] || manifest[key] !== EXPECTED_IDENTITY[key]) throw new Error('Downloaded package is not the expected IKEMaker extension.');
  if (actual.version !== expectedVersion || manifest.version !== expectedVersion) throw new Error(`Downloaded package identity is version ${actual.version || manifest.version || 'unknown'}, not ${expectedVersion}.`);
  return actual;
}

function applicationSetting(configuration, key, fallback) {
  if (typeof configuration.inspect === 'function') {
    const inspected = configuration.inspect(key);
    if (inspected) return inspected.globalValue !== undefined ? inspected.globalValue : inspected.defaultValue !== undefined ? inspected.defaultValue : fallback;
  }
  return configuration.get(key, fallback);
}

async function verifiedFile(filename, release) {
  try {
    const bytes = await fs.promises.readFile(filename);
    if (bytes.length !== release.package.bytes || sha256(bytes) !== release.package.sha256) return false;
    validateVsix(bytes, release.version); return true;
  } catch (_) { return false; }
}

class ExtensionUpdateService {
  constructor(vscode, context, dependencies = {}) {
    this.vscode = vscode; this.context = context; this.fetch = dependencies.fetch || getBuffer; this.install = dependencies.install || ((uri) => vscode.commands.executeCommand('workbench.extensions.installExtension', uri)); this.pending = null;
  }

  configuration() {
    const source = this.vscode.workspace.getConfiguration('ikemenZss');
    const value = (key, fallback) => applicationSetting(source, `extensionUpdates.${key}`, fallback);
    return { enabled: value('enabled', true), feedUrl: String(value('feedUrl', '') || '').trim(), channel: String(value('channel', 'beta') || 'beta'), intervalHours: Math.max(1, Number(value('intervalHours', 24)) || 24), trustedAssetHosts: value('trustedAssetHosts', []) || [], maxBytes: Math.max(1, Number(value('maxDownloadMB', 128)) || 128) * 1024 * 1024 };
  }

  async discover(manual = false) {
    const config = this.configuration();
    if (!config.feedUrl) { if (manual) await this.vscode.window.showInformationMessage('IKEMaker’s beta update feed is not configured yet. No update check was performed.', 'Open Settings').then((choice) => choice === 'Open Settings' && this.vscode.commands.executeCommand('workbench.action.openSettings', 'ikemenZss.extensionUpdates')); return null; }
    let feedUrl; try { feedUrl = new URL(config.feedUrl); } catch (_) { throw new Error('IKEMaker beta update feed must be a reviewed HTTPS address.'); }
    const allowed = [...new Set([feedUrl.hostname.toLowerCase(), ...config.trustedAssetHosts.map((item) => String(item).trim().toLowerCase()).filter(Boolean)])];
    checkedUrl(feedUrl.toString(), allowed, 'IKEMaker beta update feed');
    const payload = await this.fetch(feedUrl.toString(), { maxBytes: 1024 * 1024, allowedHosts: allowed });
    const feed = model.parseFeed(payload.toString('utf8'), feedUrl.toString()), current = this.context.extension?.packageJSON?.version || require('../package.json').version;
    const release = model.selectUpdate(feed, current, this.vscode.version, config.channel);
    await this.context.globalState.update(LAST_CHECK_KEY, Date.now());
    return release ? { release, config, current, allowed, feedUrl: feedUrl.toString() } : null;
  }

  async check(manual = false) {
    if (this.pending) return this.pending;
    this.pending = (async () => {
      let accepted = false;
      try {
        const found = await this.discover(manual);
        if (!found) { if (manual && this.configuration().feedUrl) await this.vscode.window.showInformationMessage('IKEMaker is up to date for the configured beta channel.'); return null; }
        const choice = await this.vscode.window.showInformationMessage(`IKEMaker ${found.release.version} is available on the ${found.release.channel} channel.`, 'Review Update', 'Not now');
        if (choice !== 'Review Update') return found;
        accepted = true; await this.reviewAndInstall(found); return found;
      } catch (error) {
        if (accepted) await this.vscode.window.showErrorMessage(`IKEMaker update was not installed: ${error.message} Run Check for Updates to retry; an exact verified cached package will be reused when available.`);
        else if (manual) await this.vscode.window.showErrorMessage(`IKEMaker update check failed: ${error.message}`);
        return null;
      } finally { this.pending = null; }
    })();
    return this.pending;
  }

  async reviewAndInstall(found) {
    const { release, config, current, allowed, feedUrl } = found;
    const asset = model.trustedPackageUrl(release, config.trustedAssetHosts);
    const detail = [`Installed: ${current}`, `Available: ${release.version} (${release.channel})`, `Feed: ${feedUrl}`, `Package: ${asset.origin}`, `Download: ${release.package.bytes} bytes`, `SHA-256: ${release.package.sha256}`, '', 'Release notes:', ...(release.notes.length ? release.notes.map((line) => `• ${line}`) : ['• No release notes supplied.']), '', 'The package will be staged outside projects, identity/size/hash-verified, and then passed to VS Code’s normal VSIX installer. Projects and settings are not modified.'].join('\n');
    const answer = await this.vscode.window.showWarningMessage('Review IKEMaker update before installation', { modal: true, detail }, 'Download, Verify & Install');
    if (answer !== 'Download, Verify & Install') return false;
    const storage = path.join(this.context.globalStorageUri.fsPath, 'extension-updates'); await fs.promises.mkdir(storage, { recursive: true });
    const name = `ikemaker-${safeVersion(release.version)}-${safeVersion(release.channel)}.vsix`, finalPath = path.join(storage, name), partial = `${finalPath}.part`;
    try {
      await fs.promises.rm(partial, { force: true });
      if (!(await verifiedFile(finalPath, release))) {
        await fs.promises.rm(finalPath, { force: true });
        const bytes = await this.fetch(release.package.url, { maxBytes: Math.min(config.maxBytes, release.package.bytes), allowedHosts: allowed });
        if (bytes.length !== release.package.bytes) throw new Error(`Downloaded size ${bytes.length} does not match published size ${release.package.bytes}.`);
        if (sha256(bytes) !== release.package.sha256) throw new Error('Downloaded IKEMaker package hash does not match the published SHA-256.');
        validateVsix(bytes, release.version);
        await fs.promises.writeFile(partial, bytes, { flag: 'wx' }); await fs.promises.rename(partial, finalPath);
      }
      await this.install(this.vscode.Uri.file(finalPath));
      const reload = await this.vscode.window.showInformationMessage(`IKEMaker ${release.version} installed. Reload VS Code when ready to activate it.`, 'Reload Now', 'Later');
      if (reload === 'Reload Now') await this.vscode.commands.executeCommand('workbench.action.reloadWindow');
      await this.prune(storage, finalPath); return true;
    } catch (error) { try { await fs.promises.rm(partial, { force: true }); } catch (_) {} throw error; }
  }

  async prune(folder, keep) {
    const files = (await fs.promises.readdir(folder, { withFileTypes: true })).filter((item) => item.isFile() && /\.vsix$/i.test(item.name)).map((item) => path.join(folder, item.name));
    const records = await Promise.all(files.map(async (filename) => ({ filename, time: (await fs.promises.stat(filename)).mtimeMs })));
    for (const item of records.filter((item) => item.filename !== keep).sort((a, b) => b.time - a.time).slice(1)) try { await fs.promises.unlink(item.filename); } catch (_) {}
  }

  schedule() {
    const initial = this.configuration(); if (!initial.enabled || !initial.feedUrl) return;
    const last = Number(this.context.globalState.get(LAST_CHECK_KEY, 0)) || 0;
    if (Date.now() - last < initial.intervalHours * 3600000) return;
    const timer = setTimeout(() => {
      const current = this.configuration(), checked = Number(this.context.globalState.get(LAST_CHECK_KEY, 0)) || 0;
      if (current.enabled && current.feedUrl && Date.now() - checked >= current.intervalHours * 3600000) void this.check(false);
    }, 15000);
    this.context.subscriptions.push({ dispose: () => clearTimeout(timer) });
  }
}

function registerExtensionUpdater(vscode, context) {
  const service = new ExtensionUpdateService(vscode, context);
  context.subscriptions.push(vscode.commands.registerCommand('ikemen.extensionUpdates.check', () => service.check(true)), vscode.commands.registerCommand('ikemen.extensionUpdates.settings', () => vscode.commands.executeCommand('workbench.action.openSettings', 'ikemenZss.extensionUpdates')));
  service.schedule(); return service;
}

module.exports = { LAST_CHECK_KEY, EXPECTED_IDENTITY, checkedUrl, getBuffer, sha256, zipEntry, validateVsix, applicationSetting, verifiedFile, ExtensionUpdateService, registerExtensionUpdater };
