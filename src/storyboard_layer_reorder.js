'use strict';

const { parseDef } = require('./def_model');

const MAX_FAMILIES = 512;
const MAX_LAYER_INDEX = 999999;

function exactScene(document, line) {
  const section = document.sections.find(item => item.line === Number(line));
  if (!section || !/^scene\s+\d+$/i.test(section.name)) throw new Error('The selected storyboard scene no longer exists.');
  return section;
}
function familyIndex(entry) {
  const match = /^layer(\d+)\.(.+)$/i.exec(entry.normalized);
  if (!match || !match[2]) return null;
  const index = Number(match[1]);
  return Number.isSafeInteger(index) && index >= 0 && index <= MAX_LAYER_INDEX ? index : null;
}
function layerFamilyIndices(text, sceneLine) {
  const section = exactScene(parseDef(text), sceneLine), indices = new Set();
  for (const entry of section.entries) { const index = familyIndex(entry); if (index !== null) indices.add(index); }
  if (indices.size > MAX_FAMILIES) throw new Error(`A scene may reorder at most ${MAX_FAMILIES} layer families at once.`);
  return [...indices].sort((left, right) => left - right);
}
function moveStable(order, selected, target, placement) {
  const chosen = new Set(selected), moving = order.filter(index => chosen.has(index));
  if (!moving.length || chosen.has(target)) return [...order];
  const remaining = order.filter(index => !chosen.has(index)), at = remaining.indexOf(target);
  if (at < 0) throw new Error('The drop target layer is no longer present.');
  remaining.splice(at + (placement === 'after' ? 1 : 0), 0, ...moving);
  return remaining;
}
function replaceLayerIndex(raw, from, to) {
  const equals = raw.indexOf('=');
  if (equals < 0) throw new Error('A parsed layer property no longer has an equals sign.');
  const left = raw.slice(0, equals), match = /^(\s*layer)(\d+)(\.)/i.exec(left);
  if (!match || Number(match[2]) !== from) throw new Error('A layer property cannot be renamed without changing its raw formatting.');
  const digits = String(to).padStart(match[2].length, '0');
  return `${left.slice(0, match.index + match[1].length)}${digits}${left.slice(match.index + match[1].length + match[2].length)}${raw.slice(equals)}`;
}
function reorderLayerFamilies(text, sceneLine, sourceIndices, targetIndex, placement) {
  if (!Array.isArray(sourceIndices) || !sourceIndices.length || sourceIndices.length > MAX_FAMILIES || new Set(sourceIndices).size !== sourceIndices.length || !sourceIndices.every(index => Number.isSafeInteger(index) && index >= 0 && index <= MAX_LAYER_INDEX)) throw new Error('Choose between 1 and 512 distinct current layer families.');
  if (!Number.isSafeInteger(targetIndex) || targetIndex < 0 || targetIndex > MAX_LAYER_INDEX || !['before','after'].includes(placement)) throw new Error('Choose a current layer and a before/after drop position.');
  const document = parseDef(text), section = exactScene(document, sceneLine), order = layerFamilyIndices(text, sceneLine), available = new Set(order);
  if (sourceIndices.some(index => !available.has(index)) || !available.has(targetIndex)) throw new Error('One or more layer families changed before the reorder.');
  const desired = moveStable(order, sourceIndices, targetIndex, placement);
  if (desired.every((index, ordinal) => index === order[ordinal])) return { text: String(text), changed: false, order, desired, mapping: Object.freeze({}) };
  const source=String(text),bom=source.startsWith('\uFEFF')?'\uFEFF':'',body=bom?source.slice(1):source,endings=body.match(/\r\n|\n/g)||[],lines=body.split(/\r\n|\n/);
  if(lines.length!==document.lines.length)throw new Error('The storyboard uses unsupported line endings; no reorder was applied.');
  const mapping = new Map(desired.map((oldIndex, ordinal) => [oldIndex, order[ordinal]]));
  for (const entry of section.entries) {
    const oldIndex = familyIndex(entry); if (oldIndex === null) continue;
    const nextIndex = mapping.get(oldIndex); if (!Number.isSafeInteger(nextIndex)) throw new Error(`Layer ${oldIndex} was not included in the complete reorder permutation.`);
    lines[entry.line] = replaceLayerIndex(lines[entry.line], oldIndex, nextIndex);
  }
  return { text: bom + lines.map((line,index)=>line+(endings[index]||'')).join(''), changed: true, order, desired, mapping: Object.freeze(Object.fromEntries(mapping)) };
}

module.exports = { MAX_FAMILIES, MAX_LAYER_INDEX, layerFamilyIndices, moveStable, replaceLayerIndex, reorderLayerFamilies };
