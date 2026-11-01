'use strict';

const fs = require('fs');
const path = require('path');
const { transactionalWrite } = require('./mutation_safety');

const NAMES = ['stand', 'crouch', 'air', 'down'];
function safePart(value) { return String(value || '').replace(/[^a-z0-9._-]+/gi, '_').replace(/^_+|_+$/g, '') || 'air'; }
function validateRect(rect) {
  if (!Array.isArray(rect) || rect.length !== 4 || rect.some((value) => !Number.isFinite(Number(value)))) throw new Error('A push box requires four finite coordinates.');
  return rect.map(Number);
}

function parseSizeboxes(text) {
  const source = String(text || ''), lines = source.split(/\r?\n/), value = (name) => {
    const pattern = new RegExp(`^\\s*${name.replace(/\./g, '\\.')}\\s*=\\s*(-?\\d+(?:\\.\\d+)?)`, 'i');
    for (let index = 0; index < lines.length; index += 1) { const match = pattern.exec(lines[index]); if (match) return { value: Number(match[1]), line: index + 1 }; }
    return null;
  };
  const front = value('ground.front'), back = value('ground.back'), airFront = value('air.front'), airBack = value('air.back'), height = value('height');
  const stand = [back ? -back.value : -16, height ? -height.value : -60, front ? front.value : 16, 0], air = [airBack ? -airBack.value : -12, stand[1], airFront ? airFront.value : 12, stand[3]];
  const legacyLines = [front, back, airFront, airBack, height].filter(Boolean).map((item) => item.line), provenance = legacyLines.length ? 'legacy fallback' : 'engine default';
  const boxes = {
    stand: { box: [...stand], line: legacyLines[0] || null, provenance }, crouch: { box: [...stand], line: legacyLines[0] || null, provenance },
    air: { box: [...air], line: legacyLines[0] || null, provenance }, down: { box: [...stand], line: legacyLines[0] || null, provenance }
  };
  lines.forEach((line, index) => {
    const match = /^\s*(stand|crouch|air|down)\.sizebox\s*=\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/i.exec(line);
    if (match) boxes[match[1].toLowerCase()] = { box: match.slice(2, 6).map(Number), line: index + 1, provenance: 'native sizebox' };
  });
  return boxes;
}

function updateSizebox(text, name, rect) {
  const key = String(name || '').toLowerCase(); if (!NAMES.includes(key)) throw new Error('Sizebox name must be stand, crouch, air, or down.');
  const box = validateRect(rect), lines = String(text).split(/\r?\n/), eol = /\r\n/.test(text) ? '\r\n' : '\n', regex = new RegExp(`^(\\s*)${key}\\.sizebox\\s*=.*?(\\s*;.*)?$`, 'i');
  const index = lines.findIndex((line) => regex.test(line));
  if (index >= 0) { const match = regex.exec(lines[index]); lines[index] = `${match[1]}${key}.sizebox = ${box.join(', ')}${match[2] || ''}`; }
  else {
    const size = lines.findIndex((line) => /^\s*\[\s*Size\s*\]\s*$/i.test(line)); if (size < 0) throw new Error('The constants file has no [Size] section.');
    lines.splice(size + 1, 0, `${key}.sizebox = ${box.join(', ')}`);
  }
  return lines.join(eol);
}

function planLocation(airPath) {
  const absolute = path.resolve(airPath); let root = path.dirname(absolute), current = root;
  while (true) { if (fs.existsSync(path.join(current, 'Ikemen_GO.exe')) || fs.existsSync(path.join(current, 'external', 'script', 'main.lua'))) { root = current; break; } const parent = path.dirname(current); if (parent === current) break; current = parent; }
  let relative = path.relative(root, absolute); if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) relative = path.basename(absolute);
  const parts = relative.split(/[\\/]+/).map(safePart); parts[parts.length - 1] = `${safePart(path.basename(parts[parts.length - 1], path.extname(parts[parts.length - 1])))}.json`;
  return path.join(root, '.ikemen-tools', 'air-pushboxes', ...parts);
}

function readPushboxPlan(airPath) {
  const filename = planLocation(airPath); if (!fs.existsSync(filename)) return { version: 1, sourceAir: path.resolve(airPath), overrides: [] };
  const plan = JSON.parse(fs.readFileSync(filename, 'utf8').replace(/^\uFEFF/, '')); if (plan.version !== 1 || !Array.isArray(plan.overrides)) throw new Error('Push-box authoring plan has an unsupported format.'); return plan;
}

function setFrameOverride(airPath, action, element, rect) {
  const plan = readPushboxPlan(airPath), entry = { action: Number(action), element: Number(element), rect: validateRect(rect), updated: new Date().toISOString() };
  if (!Number.isInteger(entry.action) || !Number.isInteger(entry.element) || entry.element < 1) throw new Error('Per-frame push override requires an action and one-based animation element.');
  plan.overrides = plan.overrides.filter((item) => item.action !== entry.action || item.element !== entry.element); plan.overrides.push(entry); plan.overrides.sort((a, b) => a.action - b.action || a.element - b.element);
  const filename = planLocation(airPath); transactionalWrite(fs, filename, `${JSON.stringify(plan, null, 2)}\n`, { label: 'air-pushbox-plan' }); return { filename, plan, entry };
}

function removeFrameOverride(airPath, action, element) {
  const plan = readPushboxPlan(airPath), before = plan.overrides.length; plan.overrides = plan.overrides.filter((item) => item.action !== Number(action) || item.element !== Number(element));
  const filename = planLocation(airPath); if (plan.overrides.length !== before) transactionalWrite(fs, filename, `${JSON.stringify(plan, null, 2)}\n`, { label: 'air-pushbox-plan' });
  return { removed: plan.overrides.length !== before, filename, plan };
}

function controllerSnippet(entry) {
  const safe = { action: Number(entry.action), element: Number(entry.element), rect: validateRect(entry.rect) };
  return `# Per-frame Size override authored visually for Action ${safe.action}, element ${safe.element}.\n# Place this block in the owning state or an explicitly reviewed shared update hook.\nignoreHitPause if anim = ${safe.action} && animElemNo(0) = ${safe.element} {\n\toverrideClsn{group: Size; index: 0; rect: ${safe.rect.join(', ')}}\n}`;
}

module.exports = { parseSizeboxes, updateSizebox, planLocation, readPushboxPlan, setFrameOverride, removeFrameOverride, controllerSnippet };
