'use strict';

const fs = require('fs');
const path = require('path');

function bundledTool(filename, platform = process.platform, arch = process.arch) {
  if (platform !== 'win32' || arch !== 'x64') return null;
  return path.resolve(__dirname, '..', 'bin', 'win32-x64', filename);
}

function startDirectory(start) {
  const resolved = path.resolve(start || process.cwd());
  try { return fs.statSync(resolved).isDirectory() ? resolved : path.dirname(resolved); }
  catch (_) { return path.extname(resolved) ? path.dirname(resolved) : resolved; }
}

function resolveProjectTool(configured, start, filename, options = {}) {
  if (configured && path.isAbsolute(configured)) return configured;

  let current = startDirectory(start);
  while (true) {
    for (const relative of [
      path.join('Development', 'EngineSupport', 'tools', 'mugen-build', filename),
      path.join('_development', 'tools', 'mugen-build', filename),
      path.join('tools', 'mugen-build', filename)
    ]) {
      const candidate = path.join(current, relative);
      if (fs.existsSync(candidate)) return candidate;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  const packaged = bundledTool(filename, options.platform || process.platform, options.arch || process.arch);
  if (packaged && fs.existsSync(packaged)) return packaged;
  return configured || filename;
}

function toolchainStatus(options = {}) {
  return ['sprmake2.exe', 'sndmaker.exe', 'sff2png.exe'].map((filename) => {
    const location = bundledTool(filename, options.platform || process.platform, options.arch || process.arch);
    return { filename, location, available: Boolean(location && fs.existsSync(location)) };
  });
}

module.exports = { bundledTool, resolveProjectTool, toolchainStatus };
