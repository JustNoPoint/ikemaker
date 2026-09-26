'use strict';

const SHA256 = /^[a-f0-9]{64}$/i;
const VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

function parseVersion(value) {
  const match = VERSION.exec(String(value || '').trim());
  return match ? { raw: match[0], parts: match.slice(1, 4).map(Number), prerelease: match[4] || '' } : null;
}

function compareVersions(left, right) {
  const a = parseVersion(left), b = parseVersion(right); if (!a || !b) throw new Error('IKEMaker update versions must use three-part semantic versions.');
  for (let i = 0; i < 3; i += 1) if (a.parts[i] !== b.parts[i]) return a.parts[i] < b.parts[i] ? -1 : 1;
  if (a.prerelease === b.prerelease) return 0;
  if (!a.prerelease) return 1; if (!b.prerelease) return -1;
  return a.prerelease.localeCompare(b.prerelease, undefined, { numeric: true });
}

function httpsUrl(value, label) {
  let parsed; try { parsed = new URL(String(value || '')); } catch (_) { throw new Error(`${label} must be a valid HTTPS URL.`); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error(`${label} must be an HTTPS URL without embedded credentials.`);
  return parsed;
}

function normalizeRelease(raw, feedUrl) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Each update release must be an object.');
  const version = parseVersion(raw.version); if (!version) throw new Error('Update release version is invalid.');
  const channel = String(raw.channel || '').trim().toLowerCase(); if (!/^[a-z0-9][a-z0-9._-]*$/.test(channel)) throw new Error(`Update ${version.raw} has an invalid channel.`);
  const packageInfo = raw.package;
  if (!packageInfo || typeof packageInfo !== 'object') throw new Error(`Update ${version.raw} has no package.`);
  const url = httpsUrl(packageInfo.url, `Package URL for ${version.raw}`).toString();
  const sha256 = String(packageInfo.sha256 || '').toLowerCase(); if (!SHA256.test(sha256)) throw new Error(`Update ${version.raw} has an invalid SHA-256.`);
  const bytes = Number(packageInfo.bytes); if (!Number.isSafeInteger(bytes) || bytes <= 0) throw new Error(`Update ${version.raw} has an invalid package size.`);
  const notes = Array.isArray(raw.notes) ? raw.notes.map(String).filter(Boolean).slice(0, 30) : String(raw.notes || '').split(/\r?\n/).filter(Boolean).slice(0, 30);
  const compatibleEditor = raw.compatibleEditor && typeof raw.compatibleEditor === 'object' ? { min: String(raw.compatibleEditor.min || ''), max: String(raw.compatibleEditor.max || '') } : { min: '', max: '' };
  if (compatibleEditor.min && !parseVersion(compatibleEditor.min)) throw new Error(`Update ${version.raw} has an invalid minimum editor version.`);
  if (compatibleEditor.max && !parseVersion(compatibleEditor.max)) throw new Error(`Update ${version.raw} has an invalid maximum editor version.`);
  return { version: version.raw, channel, publishedAt: String(raw.publishedAt || ''), notes, compatibleEditor, package: { url, sha256, bytes }, feedUrl };
}

function parseFeed(text, feedUrl) {
  const source = httpsUrl(feedUrl, 'IKEMaker update feed').toString();
  let raw; try { raw = JSON.parse(String(text)); } catch (_) { throw new Error('IKEMaker update feed is not valid JSON.'); }
  if (raw?.schemaVersion !== 1 || raw?.productId !== 'ikemaker' || !Array.isArray(raw.releases)) throw new Error('IKEMaker update feed identity/schema is invalid.');
  return { schemaVersion: 1, productId: 'ikemaker', releases: raw.releases.map((item) => normalizeRelease(item, source)) };
}

function editorCompatible(release, editorVersion) {
  const editor = parseVersion(editorVersion); if (!editor) return false;
  if (release.compatibleEditor.min && compareVersions(editor.raw, release.compatibleEditor.min) < 0) return false;
  if (release.compatibleEditor.max && compareVersions(editor.raw, release.compatibleEditor.max) > 0) return false;
  return true;
}

function selectUpdate(feed, currentVersion, editorVersion, channel = 'beta') {
  if (!parseVersion(currentVersion)) throw new Error('Installed IKEMaker version is invalid.');
  return feed.releases.filter((item) => item.channel === channel && compareVersions(item.version, currentVersion) > 0 && editorCompatible(item, editorVersion)).sort((a, b) => compareVersions(b.version, a.version))[0] || null;
}

function trustedPackageUrl(release, allowedHosts = []) {
  const feed = httpsUrl(release.feedUrl, 'IKEMaker update feed'), asset = httpsUrl(release.package.url, 'IKEMaker package');
  const allowed = new Set([feed.host.toLowerCase(), ...allowedHosts.map((item) => String(item).trim().toLowerCase()).filter(Boolean)]);
  if (!allowed.has(asset.host.toLowerCase())) throw new Error(`Package host ${asset.host} is not trusted for this update feed.`);
  return asset;
}

module.exports = { parseVersion, compareVersions, parseFeed, editorCompatible, selectUpdate, trustedPackageUrl };
