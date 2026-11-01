'use strict';

const fs = require('fs');
const path = require('path');
const { transactionalWrite } = require('./mutation_safety');

const KINDS = new Set(['guarddist', 'attackdepth', 'depth', 'width', 'height', 'overrideclsn', 'transformclsn']);
const GROUPS = new Set(['Clsn1', 'Clsn2', 'Size', 'Dummy']);

function safePart(value) { return String(value || '').replace(/[^a-z0-9._-]+/gi, '_').replace(/^_+|_+$/g, '') || 'air'; }
function finiteList(value, length, label) {
  if (!Array.isArray(value) || value.length !== length || value.some((item) => !Number.isFinite(Number(item)))) throw new Error(`${label} requires ${length} finite values.`);
  return value.map(Number);
}
function pair(text, name) {
  const match = new RegExp(`^\\s*${name.replace(/\./g, '\\.') }\\s*=\\s*(-?\\d+(?:\\.\\d+)?)\\s*,\\s*(-?\\d+(?:\\.\\d+)?)`, 'im').exec(String(text || ''));
  return match ? match.slice(1, 3).map(Number) : null;
}
function scalar(text, name) {
  const match = new RegExp(`^\\s*${name.replace(/\./g, '\\.') }\\s*=\\s*(-?\\d+(?:\\.\\d+)?)`, 'im').exec(String(text || ''));
  return match ? Number(match[1]) : null;
}
function parseRuntimeDefaults(text) {
  return {
    guardWidth: pair(text, 'attack.dist.width'), guardHeight: pair(text, 'attack.dist.height'), guardDepth: pair(text, 'attack.dist.depth'),
    projectileGuardWidth: pair(text, 'proj.attack.dist.width'), projectileGuardHeight: pair(text, 'proj.attack.dist.height'), projectileGuardDepth: pair(text, 'proj.attack.dist.depth'),
    playerDepth: pair(text, 'depth'), attackDepth: pair(text, 'attack.depth'),
    pushFactor: scalar(text, 'pushfactor'), weight: scalar(text, 'weight'), xscale: scalar(text, 'xscale'), yscale: scalar(text, 'yscale')
  };
}
function planLocation(airPath) {
  const absolute = path.resolve(airPath); let root = path.dirname(absolute), current = root;
  while (true) {
    if (fs.existsSync(path.join(current, 'Ikemen_GO.exe')) || fs.existsSync(path.join(current, 'external', 'script', 'main.lua'))) { root = current; break; }
    const parent = path.dirname(current); if (parent === current) break; current = parent;
  }
  let relative = path.relative(root, absolute); if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) relative = path.basename(absolute);
  const parts = relative.split(/[\\/]+/).map(safePart); parts[parts.length - 1] = `${safePart(path.basename(parts[parts.length - 1], path.extname(parts[parts.length - 1])))}.json`;
  return path.join(root, '.ikemen-tools', 'air-runtime-geometry', ...parts);
}
function readRuntimePlan(airPath) {
  const filename = planLocation(airPath); if (!fs.existsSync(filename)) return { version: 2, sourceAir: path.resolve(airPath), entries: [] };
  const plan = JSON.parse(fs.readFileSync(filename, 'utf8').replace(/^\uFEFF/, ''));
  if (![1, 2].includes(plan.version) || !Array.isArray(plan.entries)) throw new Error('Runtime-geometry authoring plan has an unsupported format.');
  if (plan.version === 1) return {
    ...plan, version: 2, migratedFromVersion: 1,
    entries: plan.entries.map((entry) => entry.kind === 'transformclsn'
      ? { ...entry, group: null, index: null, pivot: [0, 0], needsReview: true, migrationNote: 'Legacy TransformClsn plan did not identify a collision group or authored index.' }
      : entry)
  };
  return plan;
}
function normalize(entry, options = {}) {
  const kind = String(entry.kind || '').toLowerCase(); if (!KINDS.has(kind)) throw new Error('Unknown runtime geometry kind.');
  const out = { action: Number(entry.action), element: Number(entry.element), kind };
  if (!Number.isInteger(out.action) || !Number.isInteger(out.element) || out.element < 1) throw new Error('Runtime geometry requires an action and one-based animation element.');
  out.sourceFingerprint = String(entry.sourceFingerprint || options.sourceFingerprint || '');
  out.capabilityFingerprint = String(entry.capabilityFingerprint || options.capabilityFingerprint || '');
  out.targetBuildId = String(entry.targetBuildId || options.targetBuildId || '');
  if (kind === 'guarddist') out.values = finiteList(entry.values, 6, 'Guard distance');
  if (kind === 'attackdepth' || kind === 'width' || kind === 'height') out.values = finiteList(entry.values, 2, kind);
  if (kind === 'depth') out.values = finiteList(entry.values, 4, 'Depth');
  if (kind === 'transformclsn') {
    if (entry.needsReview || entry.group === null || entry.index === null) throw new Error('This legacy TransformClsn plan must be reviewed and assigned an exact group and index before it can be changed or copied.');
    out.group = String(entry.group || 'Clsn2'); if (!GROUPS.has(out.group)) throw new Error('TransformClsn group must be Clsn1, Clsn2, Size, or Dummy.');
    if (out.group === 'Dummy' && options.allowDummy !== true) throw new Error('Dummy collision requires the project Nightly engine target.');
    out.index = Number(entry.index); if (!Number.isInteger(out.index) || out.index < -1) throw new Error('TransformClsn index must be -1 for all boxes or a non-negative authored index.');
    if (out.index >= 0 && options.allowIndexed === false) throw new Error('Per-index TransformClsn requires a verified supporting engine target.');
    const legacy = finiteList(entry.values || [1, 1, 0], 3, 'TransformClsn');
    out.scale = finiteList(entry.scale || legacy.slice(0, 2), 2, 'TransformClsn scale');
    out.angle = Number(entry.angle ?? legacy[2]); if (!Number.isFinite(out.angle)) throw new Error('TransformClsn angle must be finite.');
    out.pivot = finiteList(entry.pivot || [0, 0], 2, 'TransformClsn pivot');
    if ((out.pivot[0] !== 0 || out.pivot[1] !== 0) && options.allowPivot === false) throw new Error('TransformClsn pivot requires a verified supporting engine target.');
    out.values = [out.scale[0], out.scale[1], out.angle];
    out.axis = 'character';
  }
  if (kind === 'overrideclsn') {
    out.group = String(entry.group || 'Clsn2'); if (!GROUPS.has(out.group)) throw new Error('OverrideClsn group must be Clsn1, Clsn2, Size, or Dummy.');
    if (out.group === 'Dummy' && options.allowDummy !== true) throw new Error('Dummy collision requires the project Nightly engine target.');
    out.index = Number(entry.index); if (!Number.isInteger(out.index)) throw new Error('OverrideClsn index must be an integer.');
    out.rect = finiteList(entry.rect, 4, 'OverrideClsn rectangle');
  }
  return out;
}
function setRuntimeEntry(airPath, entry, options = {}) {
  const plan = readRuntimePlan(airPath), normalized = { ...normalize(entry, options), updated: new Date().toISOString() };
  const identity = (item) => ['overrideclsn', 'transformclsn'].includes(item.kind) ? `${item.kind}:${item.group}:${item.index}` : item.kind;
  plan.entries = plan.entries.filter((item) => item.action !== normalized.action || item.element !== normalized.element || identity(item) !== identity(normalized));
  plan.entries.push(normalized); plan.entries.sort((a, b) => a.action - b.action || a.element - b.element || a.kind.localeCompare(b.kind) || String(a.group || '').localeCompare(String(b.group || '')) || Number(a.index || 0) - Number(b.index || 0));
  const filename = planLocation(airPath); transactionalWrite(fs, filename, `${JSON.stringify(plan, null, 2)}\n`, { label: 'air-runtime-geometry-plan' });
  return { filename, plan, entry: normalized };
}
function removeRuntimeEntry(airPath, action, element, kind, group = null, index = null) {
  const plan = readRuntimePlan(airPath), before = plan.entries.length;
  const normalizedKind = String(kind).toLowerCase(), exact = ['overrideclsn', 'transformclsn'].includes(normalizedKind) && group !== null && Number.isInteger(Number(index));
  plan.entries = plan.entries.filter((item) => item.action !== Number(action) || item.element !== Number(element) || item.kind !== normalizedKind || (exact && (item.group !== String(group) || item.index !== Number(index))));
  const filename = planLocation(airPath); if (before !== plan.entries.length) transactionalWrite(fs, filename, `${JSON.stringify(plan, null, 2)}\n`, { label: 'air-runtime-geometry-plan' });
  return { removed: before !== plan.entries.length, filename, plan };
}
function wrap(entry, body) {
  return `# Runtime geometry authored for Action ${entry.action}, element ${entry.element}.\n# Place in the owning state or an explicitly reviewed shared update hook.\nignoreHitPause if anim = ${entry.action} && animElemNo(0) = ${entry.element} {\n\t${body}\n}`;
}
function controllerSnippet(raw, options = {}) {
  const entry = normalize(raw, options), v = entry.values;
  if (raw.sourceFingerprint && options.sourceFingerprint && raw.sourceFingerprint !== options.sourceFingerprint) throw new Error('The AIR source changed after this runtime geometry plan was saved. Review and save the plan again before copying code.');
  if (raw.capabilityFingerprint && options.capabilityFingerprint && raw.capabilityFingerprint !== options.capabilityFingerprint) throw new Error('The engine target or collision capabilities changed after this plan was saved. Review it again before copying code.');
  if (entry.kind === 'guarddist') return wrap(entry, `attackDist{width: ${v[0]}, ${v[1]}; height: ${v[2]}, ${v[3]}; depth: ${v[4]}, ${v[5]}}`);
  if (entry.kind === 'attackdepth') return `# HitDef field (Z-axis attack reach) for Action ${entry.action}, element ${entry.element}:\nattack.depth = ${v[0]}, ${v[1]}`;
  if (entry.kind === 'depth') return wrap(entry, `depth{player: ${v[0]}, ${v[1]}; edge: ${v[2]}, ${v[3]}}`);
  if (entry.kind === 'width') return wrap(entry, `width{value: ${v[0]}, ${v[1]}}`);
  if (entry.kind === 'height') return wrap(entry, `height{value: ${v[0]}, ${v[1]}}`);
  if (entry.kind === 'overrideclsn') return wrap(entry, `overrideClsn{group: ${entry.group}; index: ${entry.index}; rect: ${entry.rect.join(', ')}}`);
  if (entry.kind === 'transformclsn') {
    const fields = [`group: ${entry.group}`];
    if (options.allowIndexed !== false) fields.push(`index: ${entry.index}`);
    fields.push(`scale: ${entry.scale[0]}, ${entry.scale[1]}`, `angle: ${entry.angle}`);
    if (options.allowPivot !== false) fields.push(`pivot: ${entry.pivot[0]}, ${entry.pivot[1]}`);
    return wrap(entry, `transformClsn{${fields.join('; ')}}`);
  }
  throw new Error('No controller generator exists for this runtime geometry kind.');
}

module.exports = { parseRuntimeDefaults, planLocation, readRuntimePlan, setRuntimeEntry, removeRuntimeEntry, controllerSnippet, normalize };
