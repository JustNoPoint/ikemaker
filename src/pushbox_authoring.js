'use strict';

const fs = require('fs');
const path = require('path');
const { transactionalWrite } = require('./mutation_safety');
const { readSizeNumber, stripSizeboxScaleMarker, formatNumber } = require('./sizebox');
const { parseAir } = require('./air_preview_model');
const { sourceFingerprint } = require('./air_batch_scope');
const { parseDef, unquote } = require('./def_model');

const NAMES = ['stand', 'crouch', 'air', 'down'];
const LOCAL_SIZE = /^\[([a-z]+(?:-[a-z]+)?)\.size\](?:.*\])?$/i;
function safePart(value) { return String(value || '').replace(/[^a-z0-9._-]+/gi, '_').replace(/^_+|_+$/g, '') || 'air'; }
function validateRect(rect) {
  if (!Array.isArray(rect) || rect.length !== 4 || rect.some(value => typeof value !== 'number' || !Number.isFinite(Math.fround(value)))) throw new Error('A push box requires four finite coordinates.');
  return rect.map(Number);
}

function readConfiguredLanguage(text) {
  const entries = parseDef(text).sections.filter(section => section.name === 'Config').flatMap(section => section.entries);
  const language = entries.find(entry => entry.key === 'Language');
  return language ? unquote(language.value) : '';
}

function sizeSection(text, language = '') {
  const lines = String(text || '').split(/\r?\n/), keys = new Map();
  const heading = lines.findIndex(line => {
    const header = line.split(';', 1)[0].trim();
    return /^\[size\](?:.*\])?$/i.test(header) || Boolean(language && LOCAL_SIZE.exec(header)?.[1].toLowerCase() === language);
  });
  const candidateLines = heading < 0 ? lines : lines.slice(0, heading);
  const localizedLines = language ? [] : candidateLines.flatMap((line, index) => LOCAL_SIZE.test(line.split(';', 1)[0].trim()) ? [index + 1] : []);
  if (heading < 0) return { heading, keys, localizedLines };
  for (let index = heading + 1; index < lines.length; index += 1) {
    const clean = lines[index].split(';', 1)[0].trim();
    if (clean.startsWith('[')) break;
    const name = /^[^= \t]+(?=[= \t])/.exec(clean)?.[0].toLowerCase();
    if (!name) continue;
    const prior = keys.get(name);
    if (prior) {
      prior.duplicates.push(index + 1);
      continue;
    }
    const assignment = clean.indexOf('=');
    keys.set(name, { index, duplicates: [], value: assignment >= 0 ? clean.slice(assignment + 1).trim() : '' });
  }
  return { heading, keys, localizedLines };
}

function parseSizeboxes(text, { language = '' } = {}) {
  const { keys, localizedLines } = sizeSection(text, language);
  // RC2, RC4, 1.0.0 and pinned Nightly 6a093924 initialize and load Size
  // in this order. The height.* variants are disabled in those sources.
  const ground = ['ground.back', 'height', 'ground.front', null];
  const air = ['air.back', 'height', 'air.front', null];
  return Object.fromEntries(NAMES.map(pose => {
    const isAir = pose === 'air', box = isAir ? [-12, -60, 12, 0] : [-16, -60, 16, 0];
    const legacy = (isAir ? air : ground).map(name => keys.get(name));
    const native = keys.get(`${pose}.sizebox`);
    const nativeFields = native?.value.split(',').slice(0, 4) || [];
    const legacyLines = new Set(), unsupportedLines = new Set();
    let nativeCount = 0;
    for (let index = 0; index < box.length; index += 1) {
      const nativeField = nativeFields[index]?.trim(), nativeValue = readSizeNumber(nativeField);
      if (nativeValue !== undefined) {
        box[index] = nativeValue;
        nativeCount += 1;
        continue;
      }
      if (nativeField) unsupportedLines.add(native.index + 1);
      const legacyField = legacy[index]?.value.split(',', 1)[0].trim(), legacyValue = readSizeNumber(legacyField);
      if (legacyField && legacyValue === undefined) unsupportedLines.add(legacy[index].index + 1);
      if (legacyValue !== undefined) {
        box[index] = index < 2 ? -legacyValue || 0 : legacyValue;
        legacyLines.add(legacy[index].index + 1);
      }
    }
    const provenance = localizedLines.length ? 'localized size constants need a language' : unsupportedLines.size ? 'unresolved size constants' : nativeCount === 4 ? 'native sizebox' : nativeCount ? 'partial native sizebox' : legacyLines.size ? 'legacy fallback' : 'engine default';
    return [pose, { box, line: native ? native.index + 1 : [...legacyLines][0] || null, provenance, duplicateLines: native?.duplicates || [], unsupportedLines: [...unsupportedLines], localizedLines }];
  }));
}

function updateSizebox(text, name, rect, { language = '' } = {}) {
  const key = String(name || '').toLowerCase();
  if (!NAMES.includes(key)) throw new Error('Sizebox name must be stand, crouch, air, or down.');
  const box = validateRect(rect);
  const { heading, keys, localizedLines } = sizeSection(text, language);
  if (localizedLines.length) throw new Error('Resolve the engine language before editing the localized [Size] constants.');
  if (heading < 0) throw new Error('The constants file has no [Size] section.');
  const current = keys.get(`${key}.sizebox`), value = box.map(formatNumber).join(', ');
  const parts = String(text).split(/(\r?\n)/);
  if (!current) {
    const position = heading * 2 + 1, newline = parts[position] || (/\r\n/.test(text) ? '\r\n' : '\n');
    parts.splice(position, 0, newline, `${key}.sizebox = ${value}`);
  }
  else {
    const original = parts[current.index * 2], beforeComment = original.split(';', 1)[0];
    const prefix = /^(\s*(?:stand|crouch|air|down)\.sizebox\s*=\s*)/i.exec(beforeComment)?.[1] || `${original.match(/^\s*/)[0]}${key}.sizebox = `;
    const currentBox = current.value.split(',').map(readSizeNumber);
    if (currentBox.length === 4 && box.every((coordinate, index) => coordinate === currentBox[index])) return String(text);
    const comment = stripSizeboxScaleMarker(original.slice(beforeComment.length));
    const spacing = comment ? beforeComment.match(/\s*$/)[0] : '';
    parts[current.index * 2] = `${prefix}${value}${spacing}${comment}`;
  }
  return parts.join('');
}

function planLocation(airPath) {
  const absolute = path.resolve(airPath); let root = path.dirname(absolute), current = root;
  while (true) { if (fs.existsSync(path.join(current, 'Ikemen_GO.exe')) || fs.existsSync(path.join(current, 'external', 'script', 'main.lua'))) { root = current; break; } const parent = path.dirname(current); if (parent === current) break; current = parent; }
  let relative = path.relative(root, absolute); if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) relative = path.basename(absolute);
  const parts = relative.split(/[\\/]+/).map(safePart); parts[parts.length - 1] = `${safePart(path.basename(parts[parts.length - 1], path.extname(parts[parts.length - 1])))}.json`;
  return path.join(root, '.ikemen-tools', 'air-pushboxes', ...parts);
}

function resourceIdentity(filename) {
  if (!filename) return '';
  const absolute = path.resolve(filename);
  return process.platform === 'win32' ? absolute.toLowerCase() : absolute;
}

function pushboxFrameContext(text, options = {}) {
  const actions = options.actions || parseAir(text), actionsByNumber = new Map();
  for (const action of actions) actionsByNumber.set(action.number, actionsByNumber.has(action.number) ? null : action);
  const lines = String(text).split(/\r?\n/);
  return {
    ownerDef: resourceIdentity(options.ownerDef),
    ownerAmbiguous: options.ownerAmbiguous === true,
    sourceFingerprint: options.sourceFingerprint || sourceFingerprint(text),
    constantsFingerprint: options.constantsFingerprint || '',
    capabilityFingerprint: options.capabilityFingerprint || '',
    targetBuildId: options.targetBuildId || '',
    frameFingerprint(action, element) {
      if (!Number.isSafeInteger(action) || !Number.isSafeInteger(element) || element < 1) return '';
      const source = actionsByNumber.get(action), frame = source?.frames[element - 1];
      if (!frame || source.readOnly || frame.readOnly) return '';
      return sourceFingerprint(JSON.stringify([action, element, source.line, frame.line, lines[frame.line - 1]]));
    }
  };
}

function readPushboxPlan(airPath) {
  const filename = planLocation(airPath);
  if (!fs.existsSync(filename)) return { version: 2, sourceAir: path.resolve(airPath), overrides: [] };
  const plan = JSON.parse(fs.readFileSync(filename, 'utf8').replace(/^\uFEFF/, ''));
  if (![1, 2].includes(plan.version) || !Array.isArray(plan.overrides)) throw new Error('Push-box authoring plan has an unsupported format.');
  if (resourceIdentity(plan.sourceAir) !== resourceIdentity(airPath)) throw new Error('This push-box sidecar belongs to a different AIR file.');
  if (plan.version === 1) return { ...plan, version: 2, overrides: plan.overrides.map(entry => ({ ...entry, unbound: true })) };
  return plan;
}

function recipeReviewReason(entry, context) {
  if (context.ownerAmbiguous) return 'Choose a character owner to review this draft.';
  if (entry.unbound || !entry.frameFingerprint || !entry.sourceFingerprint) return 'Legacy draft needs a new review of its AIR element and owner.';
  if (entry.ownerDef !== context.ownerDef) return 'This draft belongs to another character owner.';
  if (entry.sourceFingerprint !== context.sourceFingerprint || entry.frameFingerprint !== context.frameFingerprint(entry.action, entry.element)) return 'The AIR revision changed. Review the element and save a new draft before copying.';
  if (entry.constantsFingerprint !== context.constantsFingerprint) return 'The character constants changed. Review the box and save a new draft before copying.';
  if (entry.capabilityFingerprint !== context.capabilityFingerprint || entry.targetBuildId !== context.targetBuildId) return 'The engine target changed. Review the box and save a new draft before copying.';
  try { validateRect(entry.rect); } catch (error) { return error.message; }
  return '';
}

function pushboxRecipeRevision(entry) {
  return sourceFingerprint(JSON.stringify([entry.ownerDef, entry.sourceFingerprint, entry.frameFingerprint, entry.constantsFingerprint, entry.capabilityFingerprint, entry.targetBuildId, entry.rect, entry.updated]));
}

function projectPushboxPlan(plan, context) {
  const scoped = plan.overrides.filter(entry => entry.unbound || !context.ownerAmbiguous && entry.ownerDef === context.ownerDef);
  const counts = new Map();
  for (const entry of scoped.filter(item => !item.unbound)) {
    const key = `${entry.action}:${entry.element}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return scoped.map(entry => {
    const reason = !entry.unbound && counts.get(`${entry.action}:${entry.element}`) > 1
      ? 'Several drafts have this binding. Review the matching drafts before copying.'
      : recipeReviewReason(entry, context);
    return { action: entry.action, element: entry.element, unbound: entry.unbound === true, rect: entry.rect, status: reason ? 'review' : 'draft', reason, revision: pushboxRecipeRevision(entry) };
  });
}

function setFrameOverride(airPath, action, element, rect, context) {
  const plan = readPushboxPlan(airPath);
  if (context.ownerAmbiguous) throw new Error('Choose a character owner before saving a push-box draft.');
  const number = Number(action), slot = Number(element), frameFingerprint = context.frameFingerprint(number, slot);
  if (!Number.isSafeInteger(number) || !Number.isSafeInteger(slot) || slot < 1 || !frameFingerprint) throw new Error('Select one exact authored AIR element before saving a push-box draft.');
  const { ownerDef, sourceFingerprint, constantsFingerprint, capabilityFingerprint, targetBuildId } = context;
  const entry = { action: number, element: slot, rect: validateRect(rect), ownerDef, sourceFingerprint, frameFingerprint, constantsFingerprint, capabilityFingerprint, targetBuildId, updated: new Date().toISOString() };
  plan.overrides = plan.overrides.filter(item => item.action !== number || item.element !== slot || item.unbound || item.ownerDef !== ownerDef);
  plan.overrides.push(entry);
  plan.overrides.sort((a, b) => a.action - b.action || a.element - b.element);
  const filename = planLocation(airPath);
  transactionalWrite(fs, filename, `${JSON.stringify(plan, null, 2)}\n`, { label: 'air-pushbox-plan' });
  return { filename, plan, entry };
}

function removeFrameOverride(airPath, action, element, context, unbound = false) {
  if (context.ownerAmbiguous) throw new Error('Choose a character owner before removing a push-box draft.');
  const plan = readPushboxPlan(airPath), before = plan.overrides.length;
  plan.overrides = plan.overrides.filter(item => item.action !== Number(action) || item.element !== Number(element)
    || (unbound ? !item.unbound : item.unbound || item.ownerDef !== context.ownerDef));
  const filename = planLocation(airPath);
  if (plan.overrides.length !== before) transactionalWrite(fs, filename, `${JSON.stringify(plan, null, 2)}\n`, { label: 'air-pushbox-plan' });
  return { removed: plan.overrides.length !== before, filename, plan };
}

function controllerSnippet(entry, context) {
  const reason = recipeReviewReason(entry, context);
  if (reason) throw new Error(reason);
  const rect = validateRect(entry.rect).map(formatNumber).join(', ');
  return `# Per-frame Size draft for Action ${entry.action}, element ${entry.element}.\n# Review placement in the owning state or a shared update hook.\nignoreHitPause if anim = ${entry.action} && animElemNo(0) = ${entry.element} {\n\toverrideClsn{group: Size; index: 0; rect: ${rect}}\n}`;
}

module.exports = { parseSizeboxes, updateSizebox, readConfiguredLanguage, planLocation, readPushboxPlan, pushboxFrameContext, pushboxRecipeRevision, projectPushboxPlan, setFrameOverride, removeFrameOverride, controllerSnippet };
