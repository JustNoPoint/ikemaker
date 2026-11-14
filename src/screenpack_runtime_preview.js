'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const inside = (root, filename) => {
  const relative = path.relative(root, filename);
  return relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative) ? relative.replace(/\\/g, '/') : '';
};
function regularFile(filename, label, io) {
  const resolved = path.resolve(String(filename || ''));
  if (!filename || !io.existsSync(resolved) || !io.statSync(resolved).isFile()) throw new Error(`${label} was not found: ${resolved}`);
  return resolved;
}
function configuredMotif(gameRoot, io = fs) {
  const config = path.join(gameRoot, 'save', 'config.ini');
  if (!io.existsSync(config)) return { reference: '', filename: '', state: 'unknown' };
  const match = /^\s*Motif\s*=\s*([^;\r\n]+)/im.exec(io.readFileSync(config, 'utf8'));
  if (!match) return { reference: '', filename: '', state: 'default' };
  const reference = match[1].trim().replace(/^(["'])(.*)\1$/, '$2');
  const normalized = reference.replace(/[\\/]/g, path.sep);
  const candidates = [path.resolve(gameRoot, normalized), path.resolve(gameRoot, 'data', normalized)];
  const filename = candidates.find(candidate => io.existsSync(candidate)) || candidates[0];
  return { reference, filename, state: io.existsSync(filename) ? 'configured' : 'missing' };
}
function planScreenpackRuntimePreview(request, io = fs) {
  const root = path.resolve(String(request?.gameRoot || ''));
  if (!request?.gameRoot || !io.existsSync(root) || !io.statSync(root).isDirectory()) throw new Error('Choose the containing IKEMEN game root.');
  const executable = regularFile(request.executable, 'IKEMEN executable', io);
  const screenpack = regularFile(request.screenpackFilename, 'Screenpack DEF', io);
  if (path.extname(screenpack).toLowerCase() !== '.def') throw new Error('Exact Screenpack preview needs a .def file.');
  const screenpackArg = inside(root, screenpack);
  if (!screenpackArg) throw new Error('The Screenpack DEF must be inside its verified IKEMEN game root.');
  const script = regularFile(path.join(root, 'external', 'script', 'main.lua'), 'IKEMEN main Lua script', io);
  const scriptText = io.readFileSync(script, 'utf8');
  if (!/\bloadMotif\s*\(\s*(?:["']["']\s*)?\)/.test(scriptText)) throw new Error('This game main.lua does not expose the verified motif loading route. Exact preview is unavailable for this build.');
  const sourceHash = sha256(io.readFileSync(screenpack));
  if (request.expectedSourceHash && request.expectedSourceHash !== sourceHash) throw new Error('The saved Screenpack changed since preview review. Refresh it before running.');
  return Object.freeze({ executable, args: Object.freeze(['-r', screenpackArg]), cwd: root, mode: 'screenpack', screenpackFilename: screenpack, sourceHash, configured: configuredMotif(root, io), routeEvidence: Object.freeze({ status: 'local-script-confirmed', script, scriptHash: sha256(Buffer.from(scriptText, 'utf8')), runtimePlayback: 'not-tested' }) });
}
async function launchScreenpackRuntimePreview(request, options = {}) {
  const plan = planScreenpackRuntimePreview(request, options.fs || fs);
  const launch = options.runtimeLaunch || require('./ikemen_runtime_session').launch;
  const session = await launch({ executable: plan.executable, args: [...plan.args], cwd: plan.cwd, mode: plan.mode });
  return Object.freeze({ plan, session });
}

module.exports = { configuredMotif, planScreenpackRuntimePreview, launchScreenpackRuntimePreview };
