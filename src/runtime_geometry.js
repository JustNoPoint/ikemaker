'use strict';

const fs = require('fs');
const path = require('path');
const { transactionalWrite } = require('./mutation_safety');

const KINDS = new Set(['guarddist', 'attackdepth', 'depth', 'width', 'height', 'overrideclsn', 'transformclsn']);
const GROUPS = new Set(['Clsn1', 'Clsn2', 'Size']);

function safePart(value) { return String(value || '').replace(/[^a-z0-9._-]+/gi, '_').replace(/^_+|_+$/g, '') || 'air'; }
function finiteList(value, length, label) {
  if (!Array.isArray(value) || value.length !== length || value.some((item) => !Number.isFinite(Number(item)))) throw new Error(`${label} requires ${length} finite values.`);
  return value.map(Number);
}
function pair(text, name) {
  const match = new RegExp(`^\\s*${name.replace(/\./g, '\\.') }\\s*=\\s*(-?\\d+(?:\\.\\d+)?)\\s*,\\s*(-?\\d+(?:\\.\\d+)?)`, 'im').exec(String(text || ''));
  return match ? match.slice(1, 3).map(Number) : null;
}
function parseRuntimeDefaults(text) {
  return {
    guardWidth: pair(text, 'attack.dist.width'), guardHeight: pair(text, 'attack.dist.height'), guardDepth: pair(text, 'attack.dist.depth'),
    projectileGuardWidth: pair(text, 'proj.attack.dist.width'), projectileGuardHeight: pair(text, 'proj.attack.dist.height'), projectileGuardDepth: pair(text, 'proj.attack.dist.depth'),
    playerDepth: pair(text, 'depth'), attackDepth: pair(text, 'attack.depth')
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
  const filename = planLocation(airPath); if (!fs.existsSync(filename)) return { version: 1, sourceAir: path.resolve(airPath), entries: [] };
  const plan = JSON.parse(fs.readFileSync(filename, 'utf8').replace(/^\uFEFF/, ''));
  if (plan.version !== 1 || !Array.isArray(plan.entries)) throw new Error('Runtime-geometry authoring plan has an unsupported format.');
  return plan;
}
function normalize(entry) {
  const kind = String(entry.kind || '').toLowerCase(); if (!KINDS.has(kind)) throw new Error('Unknown runtime geometry kind.');
  const out = { action: Number(entry.action), element: Number(entry.element), kind };
  if (!Number.isInteger(out.action) || !Number.isInteger(out.element) || out.element < 1) throw new Error('Runtime geometry requires an action and one-based animation element.');
  if (kind === 'guarddist') out.values = finiteList(entry.values, 6, 'Guard distance');
  if (kind === 'attackdepth' || kind === 'width' || kind === 'height') out.values = finiteList(entry.values, 2, kind);
  if (kind === 'depth') out.values = finiteList(entry.values, 4, 'Depth');
  if (kind === 'transformclsn') out.values = finiteList(entry.values, 3, 'TransformClsn');
  if (kind === 'overrideclsn') {
    out.group = String(entry.group || 'Clsn2'); if (!GROUPS.has(out.group)) throw new Error('OverrideClsn group must be Clsn1, Clsn2, or Size.');
    out.index = Number(entry.index); if (!Number.isInteger(out.index)) throw new Error('OverrideClsn index must be an integer.');
    out.rect = finiteList(entry.rect, 4, 'OverrideClsn rectangle');
  }
  return out;
}
function setRuntimeEntry(airPath, entry) {
  const plan = readRuntimePlan(airPath), normalized = { ...normalize(entry), updated: new Date().toISOString() };
  plan.entries = plan.entries.filter((item) => item.action !== normalized.action || item.element !== normalized.element || item.kind !== normalized.kind);
  plan.entries.push(normalized); plan.entries.sort((a, b) => a.action - b.action || a.element - b.element || a.kind.localeCompare(b.kind));
  const filename = planLocation(airPath); transactionalWrite(fs, filename, `${JSON.stringify(plan, null, 2)}\n`, { label: 'air-runtime-geometry-plan' });
  return { filename, plan, entry: normalized };
}
function removeRuntimeEntry(airPath, action, element, kind) {
  const plan = readRuntimePlan(airPath), before = plan.entries.length;
  plan.entries = plan.entries.filter((item) => item.action !== Number(action) || item.element !== Number(element) || item.kind !== String(kind).toLowerCase());
  const filename = planLocation(airPath); if (before !== plan.entries.length) transactionalWrite(fs, filename, `${JSON.stringify(plan, null, 2)}\n`, { label: 'air-runtime-geometry-plan' });
  return { removed: before !== plan.entries.length, filename, plan };
}
function wrap(entry, body) {
  return `# Runtime geometry authored for Action ${entry.action}, element ${entry.element}.\n# Place in the owning state or an explicitly reviewed shared update hook.\nignoreHitPause if anim = ${entry.action} && animElemNo(0) = ${entry.element} {\n\t${body}\n}`;
}
function controllerSnippet(raw) {
  const entry = normalize(raw), v = entry.values;
  if (entry.kind === 'guarddist') return wrap(entry, `attackDist{width: ${v[0]}, ${v[1]}; height: ${v[2]}, ${v[3]}; depth: ${v[4]}, ${v[5]}}`);
  if (entry.kind === 'attackdepth') return `# HitDef field (Z-axis attack reach) for Action ${entry.action}, element ${entry.element}:\nattack.depth = ${v[0]}, ${v[1]}`;
  if (entry.kind === 'depth') return wrap(entry, `depth{player: ${v[0]}, ${v[1]}; edge: ${v[2]}, ${v[3]}}`);
  if (entry.kind === 'width') return wrap(entry, `width{value: ${v[0]}, ${v[1]}}`);
  if (entry.kind === 'height') return wrap(entry, `height{value: ${v[0]}, ${v[1]}}`);
  if (entry.kind === 'overrideclsn') return wrap(entry, `overrideClsn{group: ${entry.group}; index: ${entry.index}; rect: ${entry.rect.join(', ')}}`);
  if (entry.kind === 'transformclsn') return wrap(entry, `transformClsn{scale: ${v[0]}, ${v[1]}; angle: ${v[2]}}`);
  throw new Error('No controller generator exists for this runtime geometry kind.');
}

module.exports = { parseRuntimeDefaults, planLocation, readRuntimePlan, setRuntimeEntry, removeRuntimeEntry, controllerSnippet, normalize };
