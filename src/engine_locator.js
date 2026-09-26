'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const registryModel = require('./engine_registry_model');

function rootExecutables(root) {
  if (!root || !fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.exe$/i.test(entry.name))
    .map((entry) => path.join(root, entry.name));
}

function enginePath(root, configured = '') {
  if (configured) return path.isAbsolute(configured) ? path.resolve(configured) : path.resolve(root, configured);
  const standard = path.join(root, 'Ikemen_GO.exe');
  if (fs.existsSync(standard)) return standard;
  const executables = rootExecutables(root);
  const named = executables.filter((filename) => /(ikemen|hdbz|mugen)/i.test(path.basename(filename)) && !/(sprmaker|sndmaker|tool|config)/i.test(path.basename(filename)));
  if (named.length === 1) return named[0];
  if (executables.length === 1) return executables[0];
  return standard;
}

function sha256(filename) { return crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex'); }
function targetEnginePath(root, configured, targetRaw, installedRaw) {
  const target = registryModel.normalizeTarget(targetRaw), installed = registryModel.normalizeInstalledRegistry(installedRaw);
  const exact = installed.builds.find((item) => target.installationId && item.id === target.installationId)
    || installed.builds.find((item) => target.executableSha256 && item.buildId === target.buildId && item.executableSha256 === target.executableSha256);
  if (exact) {
    if (exact.buildId !== target.buildId) throw new Error(`The registered installation ID belongs to ${exact.buildId}, not the project's pinned build ${target.buildId}. Re-adopt or re-register the intended artifact.`);
    if (target.executableSha256 && exact.executableSha256 !== target.executableSha256) throw new Error(`The registered installation does not match the project's pinned executable hash. Re-adopt or re-register the intended artifact.`);
    if (target.artifactSha256 && exact.artifactSha256 !== target.artifactSha256) throw new Error(`The registered installation does not match the project's pinned package hash. Re-adopt or re-register the intended artifact.`);
    if (!fs.existsSync(exact.executable)) throw new Error(`The registered ${target.version || target.buildId} executable is missing: ${exact.executable}`);
    if (exact.executableSha256 && sha256(exact.executable) !== exact.executableSha256) throw new Error(`The registered ${target.version || target.buildId} executable changed after verification. Re-register it before launch.`);
    return exact.executable;
  }
  if (target.buildId !== registryModel.STABLE_BUILD_ID || target.installationId || target.executableSha256) throw new Error(`Project target ${target.version || target.buildId} is not registered as the exact adopted artifact. IKEMaker will not substitute the global engine path.`);
  // Backward compatibility: pre-registry projects already target stable 1.0 in
  // memory, so their established configured/root executable remains usable.
  return enginePath(root, configured);
}

module.exports = { rootExecutables, enginePath, sha256, targetEnginePath };
