'use strict';

const fs = require('fs');
const path = require('path');
const { parseDef, sections, sectionMap, tuple, integerTuple, unquote } = require('./def_model');
const { screenpackModel } = require('./screenpack_model');
const { readSff, spriteDataUri } = require('./sff_reader');
const { embeddedActions } = require('./def_actions');

const portraitCache = new Map();

function gameRoot(filename) {
  let current = path.dirname(filename);
  for (let depth = 0; depth < 12; depth += 1) {
    // Packaged games often rename the engine executable. Prefer the nearest
    // folder that owns a roster and character tree so an embedded game is not
    // accidentally resolved against a parent IKEMEN installation.
    if (fs.existsSync(path.join(current, 'chars'))
      && (fs.existsSync(path.join(current, 'data', 'select.def')) || fs.existsSync(path.join(current, 'data', 'system.def')))) return current;
    if (fs.existsSync(path.join(current, 'Ikemen_GO.exe')) || fs.existsSync(path.join(current, 'data', 'system.base.def'))) return current;
    const parent = path.dirname(current); if (parent === current) break; current = parent;
  }
  return null;
}
function resolveAsset(reference, filename) {
  if (!reference) return null;
  const cleaned = String(reference).replace(/[\\/]/g, path.sep), root = gameRoot(filename), candidates = [path.resolve(path.dirname(filename), cleaned)];
  if (root) candidates.push(path.resolve(root, cleaned), path.resolve(root, 'data', cleaned));
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

function rosterCells(model) {
  const cells = [];
  let slot = null;
  for (const entry of model.entries.filter((item) => item.section === 'characters')) {
    if (entry.kind === 'slot-start') {
      slot = { id: `slot-${entry.line}`, kind: 'slot', line: entry.line, endLine: entry.line, name: 'Slot', members: [], draggable: false, hidden: '' };
    } else if (entry.kind === 'slot-end') {
      if (slot) { slot.endLine = entry.line; slot.name = slot.members.length ? `${slot.members[0].name} + ${Math.max(0, slot.members.length - 1)} alternate${slot.members.length === 2 ? '' : 's'}` : 'Empty slot'; cells.push(slot); }
      slot = null;
    } else if (entry.kind === 'character') {
      if (slot || entry.inSlot) {
        if (!slot) slot = { id: `slot-member-${entry.line}`, kind: 'slot', line: entry.line, endLine: entry.line, name: 'Recovered slot', members: [], draggable: false };
        slot.members.push(entry);
        if (slot.members.length === 1) slot.hidden = entry.hidden;
        slot.endLine = entry.line;
      } else if (String(entry.exclude || '0') !== '1') cells.push({ id: `line-${entry.line}`, kind: 'character', line: entry.line, endLine: entry.line, name: entry.name, members: [entry], draggable: true, hidden: entry.hidden });
    }
  }
  if (slot) { slot.name = slot.members.length ? `${slot.members[0].name} + ${Math.max(0, slot.members.length - 1)} alternate${slot.members.length === 2 ? '' : 's'}` : 'Unclosed slot'; cells.push(slot); }
  return cells;
}

function specialCharacter(reference) {
  return /^(?:randomselect|random|blank|empty|none)$/i.test(String(reference || '').trim());
}

function resolveCharacterDef(selectFile, reference) {
  const root = gameRoot(selectFile);
  if (!root || !reference || specialCharacter(reference) || /\.zip(?:\/|$)/i.test(reference)) return '';
  const clean = String(reference).trim().replace(/^['"]|['"]$/g, '').replace(/[\\/]/g, path.sep);
  const relative = clean.replace(new RegExp(`^chars${path.sep.replace('\\', '\\\\')}`, 'i'), '');
  const candidates = [];
  if (path.isAbsolute(clean)) candidates.push(clean);
  candidates.push(path.join(root, 'chars', relative));
  if (!/\.def$/i.test(relative)) {
    candidates.push(path.join(root, 'chars', relative, `${path.basename(relative)}.def`));
    candidates.push(path.join(root, 'chars', `${relative}.def`));
  }
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile() && /\.def$/i.test(candidate)) return candidate;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      const preferred = path.join(candidate, `${path.basename(candidate)}.def`);
      if (fs.existsSync(preferred)) return preferred;
      const first = fs.readdirSync(candidate).find((name) => /\.def$/i.test(name));
      if (first) return path.join(candidate, first);
    }
  }
  return '';
}

function portraitFor(selectFile, entry, portraitSpec) {
  if (!entry) return { state: 'missing', detail: 'Empty slot' };
  if (specialCharacter(entry.name)) return { state: 'special', detail: entry.name };
  const defPath = resolveCharacterDef(selectFile, entry.name);
  if (!defPath) return { state: 'missing', detail: 'Character DEF not found' };
  try {
    const character = parseDef(fs.readFileSync(defPath, 'utf8'), defPath), files = sections(character, 'Files')[0], info = sections(character, 'Info')[0], fileValues = sectionMap(files), infoValues = sectionMap(info);
    const sffReference = unquote(fileValues.sprite || fileValues.sff || ''), baseSffPath = sffReference ? path.resolve(path.dirname(defPath), sffReference.replace(/[\\/]/g, path.sep)) : '';
    const preloadPath = path.join(path.dirname(defPath), `${path.basename(defPath, path.extname(defPath))}_preload.sff`);
    let sffPath = fs.existsSync(preloadPath) ? preloadPath : baseSffPath;
    if (!sffPath || !fs.existsSync(sffPath)) return { state: 'missing', detail: 'Assigned SFF not found', defPath };
    const stamp = fs.statSync(sffPath).mtimeMs, key = `${sffPath.toLowerCase()}|${stamp}|${portraitSpec.sprite.join(',')}`;
    if (portraitCache.has(key)) return { ...portraitCache.get(key), defPath };
    let archive = readSff(sffPath), sprite = archive.sprites.find((item) => item.group === portraitSpec.sprite[0] && item.number === portraitSpec.sprite[1]);
    if (!sprite && sffPath === preloadPath && baseSffPath && fs.existsSync(baseSffPath)) {
      sffPath = baseSffPath; archive = readSff(sffPath); sprite = archive.sprites.find((item) => item.group === portraitSpec.sprite[0] && item.number === portraitSpec.sprite[1]);
    }
    if (!sprite) return { state: 'missing', detail: `Missing portrait ${portraitSpec.sprite.join(',')}`, defPath, sffPath };
    const result = { state: 'ready', detail: unquote(infoValues.displayname || infoValues.name || entry.name), src: spriteDataUri(archive, sprite), width: sprite.width, height: sprite.height, axisX: sprite.axisX, axisY: sprite.axisY, localCoord: tuple(infoValues.localcoord || '320,240'), portraitScale: Number(infoValues.portraitscale) || 1, sffPath, preload: sffPath === preloadPath };
    portraitCache.set(key, result);
    return { ...result, defPath };
  } catch (error) { return { state: 'warning', detail: error.message, defPath }; }
}

function stagePortraitFor(selectFile, entry, portraitSpec) {
  const reference = entry?.positional?.[0] || entry?.name || '';
  if (!reference) return { state: 'missing', detail: 'Stage path is empty' };
  if (/\.zip(?:\/|$)/i.test(reference)) return { state: 'archive', detail: 'Zipped stage (portrait is resolved by IKEMEN at runtime)', reference };
  const stagePath = resolveAsset(reference, selectFile);
  if (!stagePath || !fs.existsSync(stagePath)) return { state: 'missing', detail: 'Stage DEF not found', reference };
  try {
    const stage = parseDef(fs.readFileSync(stagePath, 'utf8'), stagePath), info = sectionMap(sections(stage, 'Info')[0]), bgdef = sectionMap(sections(stage, 'BGDef')[0]);
    const sffReference = unquote(bgdef.spr || ''), sffPath = sffReference ? resolveAsset(sffReference, stagePath) : '';
    if (!sffPath || !fs.existsSync(sffPath)) return { state: 'missing', detail: 'Stage SFF not found', stagePath };
    const stamp = fs.statSync(sffPath).mtimeMs, requested = portraitSpec && portraitSpec.sprite && portraitSpec.sprite[0] >= 0 ? portraitSpec.sprite : null, key = `stage|${sffPath.toLowerCase()}|${stamp}|${requested ? requested.join(',') : 'auto'}`;
    if (portraitCache.has(key)) return { ...portraitCache.get(key), stagePath };
    const archive = readSff(sffPath); let sprite = requested && archive.sprites.find((item) => item.group === requested[0] && item.number === requested[1]), generated = false;
    if (!sprite) {
      const animations = embeddedActions(fs.readFileSync(stagePath, 'utf8')), references = stage.sections.filter((section) => /^bg\s+/i.test(section.name)).map((section) => { const map = sectionMap(section); if (map.spriteno) return integerTuple(map.spriteno); const action = Number(map.actionno); return Number.isInteger(action) ? animations[action]?.sprite : null; }).filter(Boolean);
      const candidates = references.map((id) => archive.sprites.find((item) => item.group === id[0] && item.number === id[1])).filter(Boolean); sprite = candidates.sort((a, b) => b.width * b.height - a.width * a.height)[0]; generated = Boolean(sprite);
    }
    if (!sprite) return { state: 'missing', detail: requested ? `Missing stage portrait ${requested.join(',')} and no static background preview was available` : 'No static stage background preview was available', stagePath, sffPath };
    const result = { state: generated ? 'generated' : 'ready', detail: unquote(info.displayname || info.name || path.basename(stagePath, path.extname(stagePath))), src: spriteDataUri(archive, sprite), width: sprite.width, height: sprite.height, axisX: sprite.axisX, axisY: sprite.axisY, sffPath, generated };
    portraitCache.set(key, result); return { ...result, stagePath };
  } catch (error) { return { state: 'warning', detail: error.message, stagePath }; }
}

function motifPreview(motifFile) {
  if (!motifFile || !fs.existsSync(motifFile)) return { state: 'missing', detail: 'Active motif could not be located.' };
  try {
    const text = fs.readFileSync(motifFile, 'utf8'), document = parseDef(text, motifFile), model = screenpackModel(document), select = sections(document, 'Select Info')[0], values = sectionMap(select), animations = embeddedActions(text);
    if (!model.selectGrid) return { state: 'warning', detail: 'The motif has no [Select Info] grid.', motifFile };
    const portraitSpec = { sprite: integerTuple(values['portrait.spr'] || '9000,0'), offset: tuple(values['portrait.offset'] || '0,0'), scale: tuple(values['portrait.scale'] || '1,1', 2, 1) };
    const faceSpecs = {
      p1: { sprite: integerTuple(values['p1.face.spr'] || '9000,1'), offset: tuple(values['p1.face.offset'] || '0,0'), scale: tuple(values['p1.face.scale'] || '1,1', 2, 1), facing: Number(values['p1.face.facing']) || 1 },
      p2: { sprite: integerTuple(values['p2.face.spr'] || '9000,1'), offset: tuple(values['p2.face.offset'] || `${model.localCoord[0]},0`), scale: tuple(values['p2.face.scale'] || '1,1', 2, 1), facing: Number(values['p2.face.facing']) || -1 }
    };
    const stagePortraitSpec = { sprite: integerTuple(values['stage.portrait.spr'] || '-1,0'), offset: tuple(values['stage.portrait.offset'] || '0,0'), scale: tuple(values['stage.portrait.scale'] || '1,1', 2, 1) };
    let archive = null;
    if (model.sff) { const sffPath = resolveAsset(model.sff, motifFile); if (fs.existsSync(sffPath)) archive = readSff(sffPath); }
    const backgroundDef = sections(document, 'SelectBGDef')[0], backgroundValues = sectionMap(backgroundDef), backgroundArchivePath = backgroundValues.spr ? resolveAsset(unquote(backgroundValues.spr), motifFile) : '';
    let backgroundArchive = archive;
    if (backgroundArchivePath && fs.existsSync(backgroundArchivePath)) backgroundArchive = readSff(backgroundArchivePath);
    const backgrounds = document.sections.filter((section) => /^selectbg(?:\s+.*)?$/i.test(section.name)).map((section, order) => {
      const map = sectionMap(section), action = map.actionno !== undefined ? Math.trunc(Number(map.actionno)) : null, animation = action !== null ? animations[action] : null;
      const representative = animation?.frames?.find((frame) => frame.sprite[0] >= 0 && frame.sprite[1] >= 0) || animation;
      return { order, name: section.name.replace(/^selectbg\s*/i, ''), type: String(map.type || 'normal').toLowerCase(), layer: Number(map.layerno) || 0, action, sprite: map.spriteno ? integerTuple(map.spriteno) : representative?.sprite || null, frameOffset: representative?.offset || [0, 0], start: tuple(map.start || '0,0'), scale: tuple(map.scale || '1,1', 2, 1), tile: integerTuple(map.tile || '0,0'), tileSpacing: tuple(map.tilespacing || '0,0'), window: map.window ? tuple(map.window, 4) : null, trans: String(map.trans || 'none').toLowerCase(), alpha: tuple(map.alpha || '256,0') };
    });
    const selectScreens = model.screens.filter((screen) => /select/i.test(screen.normalized));
    const elements = selectScreens.flatMap((screen) => screen.elements.map((item) => {
      const animation = item.animation !== null && animations[item.animation], representative = animation?.frames?.find((frame) => frame.sprite[0] >= 0 && frame.sprite[1] >= 0) || animation, sprite = item.sprite || representative?.sprite || null;
      return { ...item, screen: screen.name, sprite, frameOffset: representative?.offset || [0, 0] };
    }));
    const images = {}, spriteInfo = {};
    if (archive) for (const item of elements) {
      if (!item.sprite || item.sprite[0] === 9000) continue;
      const key = item.sprite.join(','); if (images[key]) continue;
      const sprite = archive.sprites.find((candidate) => candidate.group === item.sprite[0] && candidate.number === item.sprite[1]);
      if (!sprite) continue;
      try { images[key] = spriteDataUri(archive, sprite); spriteInfo[key] = { width: sprite.width, height: sprite.height, axisX: sprite.axisX, axisY: sprite.axisY }; } catch (_) {}
    }
    if (backgroundArchive) for (const item of backgrounds) {
      if (!item.sprite) continue; const key = item.sprite.join(','); if (images[key]) continue;
      const sprite = backgroundArchive.sprites.find((candidate) => candidate.group === item.sprite[0] && candidate.number === item.sprite[1]); if (!sprite) continue;
      try { images[key] = spriteDataUri(backgroundArchive, sprite); spriteInfo[key] = { width: sprite.width, height: sprite.height, axisX: sprite.axisX, axisY: sprite.axisY }; } catch (_) {}
    }
    return { state: 'ready', detail: path.relative(gameRoot(motifFile) || path.dirname(motifFile), motifFile), localCoord: model.localCoord, grid: model.selectGrid, portraitSpec, faceSpecs, stagePortraitSpec, backgrounds, elements, images, spriteInfo };
  } catch (error) { return { state: 'warning', detail: error.message, motifFile }; }
}

function rosterPreview(selectFile, model, motif) {
  const cells = rosterCells(model), portraitSpec = motif.portraitSpec || { sprite: [9000, 0], offset: [0, 0], scale: [1, 1] };
  const portraits = {}, largePortraits = {}, stagePortraits = {};
  for (const cell of cells) {
    const entry = cell.members[0];
    const portrait = portraitFor(selectFile, entry, portraitSpec);
    if (portrait.state === 'ready') {
      const characterWidth = Number(portrait.localCoord?.[0]) || 320, motifWidth = Number(motif.localCoord?.[0]) || 320;
      const resolutionScale = portrait.preload ? 1 : (Number(portrait.portraitScale) || 1) * motifWidth / characterWidth;
      portraits[cell.id] = { ...portrait, width: portrait.width * resolutionScale, height: portrait.height * resolutionScale, axisX: portrait.axisX * resolutionScale, axisY: portrait.axisY * resolutionScale, resolutionScale };
    } else portraits[cell.id] = portrait;
    if (motif.faceSpecs && entry) {
      const p1 = portraitFor(selectFile, entry, motif.faceSpecs.p1);
      const p2 = motif.faceSpecs.p2.sprite.join(',') === motif.faceSpecs.p1.sprite.join(',') ? p1 : portraitFor(selectFile, entry, motif.faceSpecs.p2);
      largePortraits[cell.id] = { p1, p2 };
    }
  }
  for (const entry of model.stages) stagePortraits[String(entry.line)] = stagePortraitFor(selectFile, entry, motif.stagePortraitSpec);
  return { cells, portraits, largePortraits, stagePortraits };
}

function reorderCharacterLines(text, orderedLines) {
  const newline = String(text).includes('\r\n') ? '\r\n' : '\n';
  const model = require('./select_def_model').parseSelectDef(text), targets = model.characters.filter((entry) => !entry.inSlot && String(entry.exclude || '0') !== '1').sort((a, b) => a.line - b.line), expected = targets.map((entry) => entry.line), received = (orderedLines || []).map(Number);
  if (received.length !== expected.length || [...received].sort((a, b) => a - b).some((line, index) => line !== [...expected].sort((a, b) => a - b)[index])) throw new Error('Roster changed while the preview order was pending. Refresh and try again.');
  const source = new Map(targets.map((entry) => [entry.line, entry.raw])), lines = model.lines.slice();
  targets.forEach((target, index) => { lines[target.line] = source.get(received[index]); });
  return lines.join(newline);
}

module.exports = { rosterCells, resolveCharacterDef, portraitFor, stagePortraitFor, motifPreview, rosterPreview, reorderCharacterLines, specialCharacter, gameRoot, resolveAsset };
