'use strict';

const DEFAULT_PALFX = Object.freeze({
  time: -1, add: [0, 0, 0], mul: [256, 256, 256], sinAdd: [0, 0, 0, 1],
  sinMul: [0, 0, 0, 1], sinColor: [0, 1], sinHue: [0, 1], color: 256,
  hue: 0, invertAll: 0, invertBlend: 0
});

function finite(value, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function integer(value, fallback = 0) { return Math.trunc(finite(value, fallback)); }
function tuple(value, size, fallback) {
  const source = Array.isArray(value) ? value : [];
  return Array.from({ length: size }, (_, index) => integer(source[index], fallback[index]));
}

function normalizePalFx(value = {}) {
  return {
    time: integer(value.time, DEFAULT_PALFX.time),
    add: tuple(value.add, 3, DEFAULT_PALFX.add),
    mul: tuple(value.mul, 3, DEFAULT_PALFX.mul),
    sinAdd: tuple(value.sinAdd || value.sinadd, 4, DEFAULT_PALFX.sinAdd),
    sinMul: tuple(value.sinMul || value.sinmul, 4, DEFAULT_PALFX.sinMul),
    sinColor: tuple(value.sinColor || value.sincolor, 2, DEFAULT_PALFX.sinColor),
    sinHue: tuple(value.sinHue || value.sinhue, 2, DEFAULT_PALFX.sinHue),
    color: finite(value.color, DEFAULT_PALFX.color), hue: finite(value.hue, DEFAULT_PALFX.hue),
    invertAll: integer(value.invertAll ?? value.invertall, 0) ? 1 : 0,
    invertBlend: integer(value.invertBlend ?? value.invertblend, 0)
  };
}

function normalizeLayer(value = {}, index = 0) {
  const trans = ['none', 'add', 'addalpha', 'sub'].includes(String(value.trans || '').toLowerCase()) ? String(value.trans).toLowerCase() : (index ? 'addalpha' : 'none');
  return {
    name: String(value.name || (index ? `Overlay ${index}` : 'Base FX')).trim(), enabled: value.enabled !== false,
    anim: integer(value.anim, 0), idOffset: integer(value.idOffset, index), sprPriority: integer(value.sprPriority, index),
    trans, alpha: tuple(value.alpha, 2, trans === 'addalpha' ? [128, 128] : [256, 0]), palfx: normalizePalFx(value.palfx)
  };
}

function normalizeProfile(value = {}) {
  const sourceLayers = Array.isArray(value.layers) && value.layers.length ? value.layers.slice(0, 5) : [{}];
  const sourceSelection = value.selection && typeof value.selection === 'object' ? value.selection : {};
  const category = ['character-color', 'color-variant', 'fx-color'].includes(String(sourceSelection.category || '').toLowerCase())
    ? String(sourceSelection.category).toLowerCase() : 'fx-color';
  return {
    formatVersion: 2, name: String(value.name || 'True-Color FX').trim(), baseId: integer(value.baseId, 910000),
    anim: integer(value.anim, 0), pos: tuple(value.pos, 2, [0, 0]), postype: String(value.postype || 'p1'),
    bindtime: integer(value.bindtime, -1), removetime: integer(value.removetime, -2),
    selection: {
      category,
      parentColorId: String(sourceSelection.parentColorId || '').trim(),
      visibleByDefault: sourceSelection.visibleByDefault !== false,
      order: Math.max(0, integer(sourceSelection.order, 0))
    },
    layers: sourceLayers.map((layer, index) => normalizeLayer({ ...layer, anim: layer.anim === undefined ? integer(value.anim, 0) : layer.anim }, index))
  };
}

function cloneLayer(profile, index) {
  const normalized = normalizeProfile(profile); if (normalized.layers.length >= 5) throw new Error('True-color FX profiles support one base plus four overlay layers.');
  const source = normalized.layers[integer(index, 0)]; if (!source) throw new Error('The selected FX layer does not exist.');
  normalized.layers.push(normalizeLayer({ ...source, name: `Overlay ${normalized.layers.length}`, idOffset: normalized.layers.length, sprPriority: source.sprPriority + 1, palfx: { ...source.palfx, add: [...source.palfx.add], mul: [...source.palfx.mul], sinAdd: [...source.palfx.sinAdd], sinMul: [...source.palfx.sinMul], sinColor: [...source.palfx.sinColor], sinHue: [...source.palfx.sinHue] } }, normalized.layers.length));
  return normalized;
}

function palFxLines(palfx, indent = '  ') {
  const fx = normalizePalFx(palfx), lines = [`${indent}palfx.time: ${fx.time};`, `${indent}palfx.add: ${fx.add.join(', ')};`, `${indent}palfx.mul: ${fx.mul.join(', ')};`];
  if (fx.sinAdd.some((value, index) => index < 3 && value !== 0)) lines.push(`${indent}palfx.sinadd: ${fx.sinAdd.join(', ')};`);
  if (fx.sinMul.some((value, index) => index < 3 && value !== 0)) lines.push(`${indent}palfx.sinmul: ${fx.sinMul.join(', ')};`);
  if (fx.sinColor[0] !== 0) lines.push(`${indent}palfx.sincolor: ${fx.sinColor.join(', ')};`);
  if (fx.sinHue[0] !== 0) lines.push(`${indent}palfx.sinhue: ${fx.sinHue.join(', ')};`);
  if (fx.color !== 256) lines.push(`${indent}palfx.color: ${fx.color};`);
  if (fx.hue !== 0) lines.push(`${indent}palfx.hue: ${fx.hue};`);
  if (fx.invertAll) lines.push(`${indent}palfx.invertall: 1;`);
  if (fx.invertBlend) lines.push(`${indent}palfx.invertblend: ${fx.invertBlend};`);
  return lines;
}

function explodLayerZss(profile, layer, index) {
  const p = normalizeProfile(profile), item = normalizeLayer(layer, index), lines = [
    `# ${item.name}`, 'explod{', `  id: ${p.baseId + item.idOffset};`, `  anim: ${item.anim};`, `  postype: ${p.postype};`,
    `  pos: ${p.pos.join(', ')};`, `  bindtime: ${p.bindtime};`, `  removetime: ${p.removetime};`, `  sprpriority: ${item.sprPriority};`, '  ownpal: 1;'
  ];
  if (item.trans !== 'none') lines.push(`  trans: ${item.trans};`);
  if (item.trans === 'addalpha') lines.push(`  alpha: ${item.alpha.join(', ')};`);
  lines.push(...palFxLines(item.palfx), '}'); return lines.join('\n');
}

function composerZss(profile) {
  const normalized = normalizeProfile(profile), layers = normalized.layers.map((layer, index) => ({ layer, index })).filter((item) => item.layer.enabled);
  return `${layers.map((item) => explodLayerZss(normalized, item.layer, item.index)).join('\n\n')}\n`;
}

function modifyLayerZss(profile, layerIndex) {
  const p = normalizeProfile(profile), index = integer(layerIndex, 0), layer = p.layers[index]; if (!layer) throw new Error('The selected FX layer does not exist.');
  const lines = ['modifyExplod{', `  id: ${p.baseId + layer.idOffset};`, `  sprpriority: ${layer.sprPriority};`];
  if (layer.trans !== 'none') lines.push(`  trans: ${layer.trans};`);
  if (layer.trans === 'addalpha') lines.push(`  alpha: ${layer.alpha.join(', ')};`);
  lines.push(...palFxLines(layer.palfx), '}'); return `${lines.join('\n')}\n`;
}

module.exports = { DEFAULT_PALFX, normalizePalFx, normalizeLayer, normalizeProfile, cloneLayer, palFxLines, explodLayerZss, composerZss, modifyLayerZss };
