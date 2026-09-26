'use strict';

const def = require('./def_model');

function layoutBase(key) {
  const variant = /^(.*?)\.(active|selected|disabled|done)\.(font(?:\..+)?)$/.exec(key);
  if (variant) { const parsed = layoutBase(variant[1] + '.' + variant[3]); if (parsed) return { base: parsed.base, property: variant[2] + '.' + parsed.property }; }
  const fontProperty = /^(.*)\.font\.(.+)$/.exec(key);
  if (fontProperty) return { base: fontProperty[1], property: 'font.' + fontProperty[2] };
  const suffixes = ['.offset', '.pos', '.spr', '.anim', '.font', '.scale', '.facing', '.vfacing', '.layerno', '.window', '.angle', '.xshear'];
  for (const suffix of suffixes) if (key.endsWith(suffix)) return { base: key.slice(0, -suffix.length), property: suffix.slice(1) };
  if (['pos', 'offset', 'spr', 'anim', 'font', 'scale', 'facing', 'vfacing', 'layerno', 'window', 'angle', 'xshear'].includes(key)) return { base: '', property: key };
  return null;
}

function cellOverrides(selectSection) {
  if (!selectSection) return [];
  const rules = [];
  for (const entry of selectSection.entries) {
    const match = /^cell\.([*]|\d+)-([*]|\d+)\.(.+)$/i.exec(entry.normalized);
    if (!match) continue;
    rules.push({ column: match[1] === '*' ? '*' : Number(match[1]), row: match[2] === '*' ? '*' : Number(match[2]), property: match[3], value: entry.value, line: entry.line });
  }
  return rules;
}

function skippedCells(rows, columns, rules) {
  const skipped = [];
  for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) {
    const matching = rules.filter((rule) => rule.property === 'skip' && (rule.column === '*' || rule.column === column) && (rule.row === '*' || rule.row === row));
    if (matching.length && Boolean(def.number(matching[matching.length - 1].value, 0))) skipped.push([column, row]);
  }
  return skipped;
}

function screenpackModel(document) {
  const info = def.sections(document, 'Info')[0] || { entries: [] };
  const files = def.sections(document, 'Files')[0] || { entries: [] };
  const infoMap = def.sectionMap(info), fileMap = def.sectionMap(files);
  const localCoord = def.tuple(infoMap.localcoord || '320,240');
  const selectSection = def.sections(document, 'Select Info')[0] || null;
  const selectMap = def.sectionMap(selectSection);
  const cellRules = cellOverrides(selectSection);
  const selectGrid = selectSection ? {
    sectionLine: selectSection.line,
    rows: Math.max(1, Math.trunc(def.number(selectMap.rows, 1))),
    columns: Math.max(1, Math.trunc(def.number(selectMap.columns, 1))),
    position: def.tuple(selectMap.pos || '0,0'),
    cellSize: def.tuple(selectMap['cell.size'] || '27,27'),
    spacing: def.tuple(selectMap['cell.spacing'] || '0,0'),
    wrapping: Boolean(def.number(selectMap.wrapping, 0)),
    showEmptyBoxes: Boolean(def.number(selectMap.showemptyboxes, 0)),
    moveOverEmptyBoxes: Boolean(def.number(selectMap.moveoveremptyboxes, 0)),
    cellOverrides: cellRules
  } : null;
  if (selectGrid) selectGrid.skippedCells = skippedCells(selectGrid.rows, selectGrid.columns, cellRules);
  const screens = [];
  for (const section of document.sections) {
    if (!section.name || ['info', 'files', 'music'].includes(section.normalized)) continue;
    const groups = new Map();
    for (const item of section.entries) {
      const parsed = layoutBase(item.normalized);
      if (!parsed) continue;
      if (!groups.has(parsed.base)) groups.set(parsed.base, { name: parsed.base || section.normalized, base: parsed.base, properties: {}, lines: {} });
      const group = groups.get(parsed.base);
      group.properties[parsed.property] = item.value;
      group.lines[parsed.property] = item.line;
    }
    const elements = [...groups.values()].map((item) => ({
      ...item,
      position: def.tuple(item.properties.pos || item.properties.offset),
      sprite: item.properties.spr ? def.integerTuple(item.properties.spr) : null,
      animation: item.properties.anim ? Math.trunc(def.number(item.properties.anim)) : null,
      font: item.properties.font || item.properties['active.font'] || '',
      scale: def.tuple(item.properties.scale || item.properties['font.scale'] || '1,1', 2, 1),
      facing: def.number(item.properties.facing, 1),
      verticalFacing: def.number(item.properties.vfacing, 1),
      layer: def.number(item.properties.layerno, 0),
      window: item.properties.window ? def.tuple(item.properties.window, 4) : null,
      angle: def.number(item.properties.angle, 0),
      xShear: def.number(item.properties.xshear, 0)
    }));
    if (elements.length) screens.push({ name: section.name, normalized: section.normalized, line: section.line, elements });
  }
  return {
    kind: 'screenpack',
    name: def.unquote(infoMap.name || 'Untitled motif'), author: def.unquote(infoMap.author), localCoord,
    sff: def.unquote(fileMap.spr || fileMap.sff), sound: def.unquote(fileMap.snd), fight: def.unquote(fileMap.fight), select: def.unquote(fileMap.select), module: def.unquote(fileMap.module),
    fonts: Object.entries(fileMap).filter(([key]) => /^font\d+$/.test(key)).map(([key, path]) => ({ slot: Number(key.slice(4)), path: def.unquote(path) })),
    screens, selectGrid,
    source: document
  };
}

function validateScreenpack(model, archive = null) {
  const issues = [];
  if (!model.sff) issues.push({ severity: 'error', code: 'missing-sff', message: 'The Files section does not define spr.' });
  if (model.localCoord[0] <= 0 || model.localCoord[1] <= 0) issues.push({ severity: 'error', code: 'localcoord', message: 'Screenpack localcoord must be positive.' });
  for (const screen of model.screens) for (const item of screen.elements) {
    if (item.layer < -1 || item.layer > 2) issues.push({ severity: 'warning', code: 'ui-layer', line: screen.line, message: `${screen.name}: ${item.name} uses unusual UI layer ${item.layer}.` });
    const externalPortrait = item.sprite && item.sprite[0] === 9000 || /(?:^|\.)(?:face\d*|portrait)(?:\.|$)/i.test(item.name);
    if (archive && item.sprite && item.sprite[0] >= 0 && item.sprite[1] >= 0 && !externalPortrait && !archive.sprites.some((sprite) => sprite.group === item.sprite[0] && sprite.number === item.sprite[1])) issues.push({ severity: 'error', code: 'missing-sprite', line: item.lines.sprite, message: `${screen.name}: ${item.name} references missing sprite ${item.sprite.join(',')}.` });
  }
  return issues;
}

module.exports = { screenpackModel, validateScreenpack, layoutBase, cellOverrides, skippedCells };
