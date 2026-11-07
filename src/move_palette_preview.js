'use strict';

const fs = require('fs');
const path = require('path');
const { spriteDataUri, actRgba } = require('./sff_reader');
const { assignedDefault } = require('./palette_preview');
const { parseStateDefaultAnimation } = require('./state_animation_authority');

function characterPaletteAssignment(archive, sffPath, knownDef) {
  const embedded = assignedDefault(archive, sffPath, knownDef);
  const defaults = /^\s*pal\.defaults\s*=\s*([^;\r\n]+)/im.exec(String(knownDef?.text || ''));
  const defaultSlot = Number(defaults?.[1]?.split(',')[0]?.trim() || 1);
  const lines = String(knownDef?.text || '').split(/\r?\n/);
  let section = '', actPath = '';
  for (const raw of lines) {
    const clean = raw.replace(/;.*$/, '').trim(), heading = /^\[\s*([^\]]+)\s*\]$/.exec(clean);
    if (heading) { section = heading[1].trim().toLowerCase(); continue; }
    if (section !== 'files') continue;
    const assignment = /^pal(\d+)\s*=\s*(.+)$/i.exec(clean);
    if (assignment && Number(assignment[1]) === defaultSlot) { actPath = assignment[2].trim().replace(/^['"]|['"]$/g, ''); break; }
  }
  if (!actPath || !knownDef?.filename) return { ...embedded, source: 'embedded', override: embedded.index };
  const filename = path.resolve(path.dirname(knownDef.filename), actPath);
  try {
    const stat = fs.statSync(filename);
    if (!stat.isFile() || ![768, 772].includes(stat.size)) throw new Error('assigned ACT is missing or has an invalid size');
    return { ...embedded, group: 1, number: defaultSlot, source: 'act', filename, override: actRgba(fs.readFileSync(filename)) };
  } catch (error) {
    return { ...embedded, source: 'embedded', override: embedded.index, issue: `Assigned pal${defaultSlot} ACT could not be read: ${error.message}` };
  }
}

function spritePreviewPair(archive, sprite, characterPaletteOverride, encode = spriteDataUri) {
  const src = encode(archive, sprite, null);
  const indexed = [5, 8].includes(Number(sprite.colorDepth)) || Boolean(sprite.legacy);
  const different = indexed && (Array.isArray(characterPaletteOverride) || Number.isInteger(characterPaletteOverride) && characterPaletteOverride >= 0 && characterPaletteOverride !== sprite.paletteIndex);
  let characterPaletteSrc = src;
  if (different) try { characterPaletteSrc = encode(archive, sprite, characterPaletteOverride); } catch (_) { /* Keep the sprite's valid palette visible. */ }
  return { src, characterPaletteSrc, width: sprite.width, height: sprite.height, axisX: sprite.axisX, axisY: sprite.axisY };
}

function exactStateAnimation(component) {
  let parsed = parseStateDefaultAnimation(component);
  const legacySt = !parsed.available && component.syntax === 'zss' && /\.st$/i.test(component.filename || '') && /^\s*\[\s*statedef\b/i.test(component.text || '');
  if (legacySt) parsed = parseStateDefaultAnimation({ ...component, syntax: 'cns' });
  return { ...parsed, sourceLanguage: legacySt && parsed.available ? 'cns' : component.syntax };
}

function directActionImages(components, actions, archive, characterPaletteOverride, limit = 160, encode = spriteDataUri) {
  const byAction = new Map(), images = {}, cache = new Map();
  for (const action of actions || []) {
    const bucket = byAction.get(action.number) || [];
    bucket.push(action); byAction.set(action.number, bucket);
  }
  let truncated = 0, produced = 0;
  for (const component of components || []) {
    if (component.kind !== 'state' || !component.id) continue;
    const parsed = exactStateAnimation(component);
    const candidates = parsed.available ? byAction.get(parsed.action) : null;
    if (!candidates || candidates.length !== 1 || !candidates[0].frames?.length) continue;
    const first = candidates[0].frames[0], sprite = archive.sprites.find(item => item.group === first.group && item.number === first.index);
    if (!sprite) continue;
    if (produced >= limit) { truncated += 1; continue; }
    try {
      if (!cache.has(parsed.action)) cache.set(parsed.action, { ...spritePreviewPair(archive, sprite, characterPaletteOverride, encode), actionNumber: parsed.action });
      images[component.id] = cache.get(parsed.action); produced += 1;
    } catch (_) { /* A missing sprite codec leaves this card without a thumbnail. */ }
  }
  return { images, truncated };
}

module.exports = { characterPaletteAssignment, spritePreviewPair, exactStateAnimation, directActionImages };
