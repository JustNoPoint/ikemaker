'use strict';

const baseline = require('../data/lua-api.json');
const VERIFIED_REVISION = 'fb269c975745d3effc447af4c6d74dd2988fc9ba';
const VERIFIED_BUILD = 'ikemen-go-nightly-fb269c975745-windows-x64';
const source = `https://github.com/ikemen-engine/Ikemen-GO/blob/${VERIFIED_REVISION}/src/script.go`;
// Registration and argument reads checked against this exact source revision.
// These are source-verified APIs, not a claim of runtime or whole-build coverage.
const overlay = [
  { name: 'animSetTrans', signature: 'animSetTrans(anim, trans, src, dst)', description: 'Set animation blending. trans accepts default, none, add, add1, addalpha, sub or subadd. Omit both alpha arguments to use defaults; when supplying src, also supply dst.', parameters: 'anim: Anim userdata; trans: string; src: optional integer (0–255); dst: integer required when src is supplied.', returns: 'none' },
  { name: 'textImgSetTrans', signature: 'textImgSetTrans(ts, trans, src, dst)', description: 'Set text sprite blending. default preserves the font color alpha. Omit both alpha arguments to use defaults; when supplying src, also supply dst.', parameters: 'ts: TextSprite userdata; trans: default, none, add, add1, addalpha, sub or subadd; src: optional integer (0–255); dst: integer required when src is supplied.', returns: 'none' },
  { name: 'localRandom', signature: 'localRandom(min, max)', description: 'Return instance-local randomness for visual effects. It is not synchronized across netplay or replays.', parameters: 'min: optional number; max: optional number. No arguments: [0,1); one argument: integer [1,min]; two arguments: integer [min,max].', returns: 'number' }
].map(entry => ({ ...entry, kind: 'function', category: 'Embedded functions', source: `Source-verified ${VERIFIED_REVISION.slice(0,12)}`, documentationLabel: `Source-verified Nightly ${VERIFIED_REVISION.slice(0,12)}`, url: source }));

function targetLabel(capabilities = {}) {
  const target = capabilities.target || capabilities;
  return target.commit?.slice(0,12) || target.buildId || 'IKEMEN GO 1.0';
}
function verifiedOverlayTarget(target = {}) {
  return target.buildId === VERIFIED_BUILD && target.channel === 'nightly' && target.commit === VERIFIED_REVISION && !target.customFork;
}
function luaCatalogFor(capabilities = {}) {
  const target = capabilities.target || capabilities;
  const stable = !target.commit && !target.buildId || target.commit === '81c6da71d689625e20db79586815b695da00dd6d' || target.buildId === 'ikemen-go-1.0.0-windows-x64';
  const entries = baseline.map(entry => ({ ...entry, documentationLabel: `IKEMEN 1.0 baseline · target ${targetLabel(capabilities)}${stable ? '' : ' (baseline APIs unverified on this build)'}` }));
  return verifiedOverlayTarget(target) ? [...entries, ...overlay] : entries;
}
function luaApiSignatureHelp(call, capabilities = {}) {
  const entry = luaCatalogFor(capabilities).find(entry => entry.name.toLowerCase() === String(call?.name || '').toLowerCase());
  if (!entry || entry.kind === 'hook') return undefined;
  const args = /\(([^)]*)\)/.exec(entry.signature)?.[1].split(',').map(value => value.trim()).filter(Boolean) || [];
  return { signatures: [{ label: entry.signature, documentation: `${entry.documentationLabel}. ${entry.description} Parameters: ${entry.parameters || 'none'}. Returns: ${entry.returns || 'none'}.`, parameters: args.map(label => ({ label, documentation: entry.parameters || 'See source documentation.' })) }], activeSignature: 0, activeParameter: Math.min(call.activeParameter || 0, Math.max(0,args.length-1)) };
}
function luaOverlayDefinitions(capabilities = {}) {
  if (!verifiedOverlayTarget(capabilities.target || capabilities)) return '';
  return `\n-- Source-verified additions for ${VERIFIED_REVISION}; ${source}\n` + overlay.map(entry => `---${entry.description}\n---${entry.parameters}\n${entry.name==='localRandom'?'---@param min? number\n---@param max? number\n---@return number':`---@param ${entry.name==='animSetTrans'?'anim':'ts'} userdata\n---@param trans string\n---@param src? integer\n---@param dst? integer`}\nfunction ${entry.signature} end\n`).join('\n');
}
function luaDefinitionsContent(content, capabilities = {}) {
  // LuaLS metadata globals apply to the entire workspace, not the selected
  // source's exact engine target. Keep persisted definitions stable-safe even
  // after switching targets, opening another project, or editing this file.
  const reference = luaOverlayDefinitions(capabilities).split('\n').map(line => `-- ${line}`).join('\n');
  return `${content}\n-- Selected project target at installation: ${targetLabel(capabilities)}.\n-- Active LuaLS definitions use the offline 1.0 baseline only.\n-- Exact Nightly additions below are inert reference comments; bundled IKEMaker assistance supplies them for the selected build.\n${reference}\n`;
}
module.exports = { VERIFIED_REVISION, overlay, targetLabel, luaCatalogFor, luaApiSignatureHelp, luaOverlayDefinitions, luaDefinitionsContent };
