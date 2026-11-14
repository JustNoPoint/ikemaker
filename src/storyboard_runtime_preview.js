'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DIRECT_ROUTE = /getCommandLineValue\s*\(\s*["']-storyboard["']\s*\)[\s\S]*?main\.f_storyboard\s*\(\s*getCommandLineValue\s*\(\s*["']-storyboard["']\s*\)\s*\)/;
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function regularFile(filename, label, io) {
  const resolved = path.resolve(String(filename || ''));
  if (!filename || !io.existsSync(resolved)) throw new Error(`${label} was not found: ${resolved}`);
  const stat = io.statSync(resolved);
  if (!stat.isFile()) throw new Error(`${label} must be a regular file.`);
  return resolved;
}
function planStoryboardRuntimePreview(request, io = fs) {
  const root = path.resolve(String(request?.gameRoot || ''));
  if (!request?.gameRoot || !io.existsSync(root) || !io.statSync(root).isDirectory()) throw new Error('Choose an IKEMEN game root.');
  const executable = regularFile(request.executable, 'IKEMEN executable', io);
  const storyboard = regularFile(request.storyboardFilename, 'Storyboard DEF', io);
  if (path.extname(storyboard).toLowerCase() !== '.def') throw new Error('The direct storyboard preview needs a .def file.');
  const script = regularFile(path.join(root, 'external', 'script', 'main.lua'), 'IKEMEN main Lua script', io);
  const scriptText = io.readFileSync(script, 'utf8');
  if (!DIRECT_ROUTE.test(scriptText)) throw new Error('This game main.lua does not expose the verified -storyboard direct preview route.');
  const bytes = io.readFileSync(storyboard), sourceHash = sha256(bytes);
  if (request.expectedSourceHash && request.expectedSourceHash !== sourceHash) throw new Error('The saved storyboard changed since preview review. Refresh it before running.');
  const relative = path.relative(root, storyboard), insideRoot = relative && !relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative);
  const storyArg = insideRoot ? relative.replace(/\\/g, '/') : storyboard;
  return Object.freeze({ executable, args: Object.freeze(['-storyboard', storyArg]), cwd: root, mode: 'storyboard', storyboardFilename: storyboard, sourceHash, routeEvidence: Object.freeze({ status: 'local-script-confirmed', script, scriptHash: sha256(Buffer.from(scriptText, 'utf8')), runtimePlayback: 'not-tested' }) });
}
async function launchStoryboardRuntimePreview(request, options = {}) {
  const io = options.fs || fs, launch = options.runtimeLaunch || require('./ikemen_runtime_session').launch;
  const plan = planStoryboardRuntimePreview(request, io);
  const session = await launch({ executable: plan.executable, args: [...plan.args], cwd: plan.cwd, mode: plan.mode });
  return Object.freeze({ plan, session });
}

module.exports = { planStoryboardRuntimePreview, launchStoryboardRuntimePreview };
