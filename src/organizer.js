'use strict';

const { layerInfo, systemName } = require('./sff_names');

const CATEGORY_ORDER = [
  'Required and Movement', 'Guards', 'GetHits and KOs', 'Intros', 'Taunts', 'Win Poses',
  'Standing Normals', 'Crouching Normals', 'Jumping Normals', 'Command Normals', 'Throws',
  'System', 'Specials', 'Hypers', 'Community Optional', 'Temporary and Unclassified',
  'Cosmetic Layers and Parts', 'Archived', 'Other'
];

function animationCategory(group) {
  const original = Number(group), layer = layerInfo(original), value = layer.base;
  if (original >= 10000 && original < 60000 && layer.layer) return 'Cosmetic Layers and Parts';
  if (value >= 60000 && value <= 60999) return 'Archived';
  if (value >= 6500 && value <= 6999) return 'Temporary and Unclassified';
  if (value >= 7000 && value <= 7999) return 'Community Optional';
  if (value >= 5000 && value <= 5999 || value === 9010) return 'GetHits and KOs';
  if (value >= 3000 && value <= 4999) return 'Hypers';
  if (value >= 1000 && value <= 2999) return 'Specials';
  if (value >= 900 && value <= 999) return 'System';
  if (value >= 800 && value <= 899) return 'Throws';
  if (value >= 260 && value <= 295 || value >= 460 && value <= 495 || value >= 660 && value <= 795) return 'Command Normals';
  if (value >= 600 && value <= 659) return 'Jumping Normals';
  if (value >= 400 && value <= 459) return 'Crouching Normals';
  if (value >= 200 && value <= 259) return 'Standing Normals';
  if (value >= 195 && value <= 199) return 'Taunts';
  if (value >= 190 && value <= 194 || value >= 940 && value <= 949) return 'Intros';
  if (value >= 180 && value <= 189 || value >= 930 && value <= 939) return 'Win Poses';
  if (value >= 130 && value <= 159) return 'Guards';
  if (value >= 0 && value <= 179) return 'Required and Movement';
  return 'Other';
}

function soundCategory(entry) {
  const group = Number(entry.group), name = String(entry.name || '').toLowerCase(), voice = group >= 10000;
  const base = voice ? group - 10000 : group;
  if (/announc|system|menu|cursor|select|round|fight|ko\b|time over/.test(name)) return voice ? 'Voice · System and Announcer' : 'System and UI';
  if (/intro|win|victor|taunt/.test(name)) return voice ? 'Voice · Presentation' : 'Presentation Effects';
  if (/guard|block/.test(name)) return voice ? 'Voice · Guard' : 'Guard Effects';
  if (/hit|impact|spark/.test(name) && !voice) return 'Hit Effects';
  if (base >= 5000 && base <= 5999 || /hurt|gethit|pain|death|ko/.test(name)) return voice ? 'Voice · GetHits and KOs' : 'GetHit Effects';
  if (base >= 3000 && base <= 4999) return voice ? 'Voice · Hypers' : 'Hyper Effects';
  if (base >= 1000 && base <= 2999) return voice ? 'Voice · Specials' : 'Special Effects';
  if (voice) return 'Voice · Normals and General';
  if (base >= 200 && base <= 999) return 'Normal Attack Effects';
  if (base >= 0 && base <= 199) return 'Movement and Common Effects';
  return 'Other Sounds';
}

function paletteCategory(palette) {
  const role = String(palette.role || '').toLowerCase(), name = String(palette.name || '').toLowerCase();
  if (palette.group === 1 && palette.number === 0 || /master|full cs|template/.test(`${role} ${name}`)) return 'Master and Full Color Separation';
  if (/archive|unused/.test(`${role} ${name}`)) return 'Archived and Unused';
  if (/variant|costume|beard|alt/.test(`${role} ${name}`)) return 'Costumes and Variants';
  if (/favorite/.test(`${role} ${name}`)) return 'Favorites';
  if (/work|review|staged|unassigned/.test(`${role} ${name}`)) return 'Work in Progress';
  if (palette.group === 1 && palette.number >= 1) return 'Player Palettes';
  return 'Other Palettes';
}

function animationRecord(group, number = 0, customName = '') {
  const system = systemName(Number(group));
  return { category: animationCategory(group), name: customName || system.name, family: system.family || '', group: Number(group), number: Number(number) };
}

function compare(mode, a, b) {
  if (mode === 'name') return String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true, sensitivity: 'base' }) || Number(a.group) - Number(b.group) || Number(a.number) - Number(b.number);
  if (mode === 'category') return categoryRank(a.category) - categoryRank(b.category) || String(a.family || '').localeCompare(String(b.family || '')) || compare('number', a, b);
  if (mode === 'source') return Number(a.sourceOrder) - Number(b.sourceOrder);
  return Number(a.group) - Number(b.group) || Number(a.number) - Number(b.number) || Number(a.sourceOrder) - Number(b.sourceOrder);
}

function categoryRank(category) { const at = CATEGORY_ORDER.indexOf(category); return at < 0 ? CATEGORY_ORDER.length : at; }
function sorted(records, mode = 'number') { return records.slice().sort((a, b) => compare(mode, a, b)); }

function validateIdentityMapping(items, mappings) {
  const errors = [], warnings = [], existing = new Map(items.map((item) => [`${item.group},${item.number ?? item.index}`, item]));
  const destinations = new Map();
  for (const mapping of mappings || []) {
    const from = `${Number(mapping.fromGroup)},${Number(mapping.fromNumber)}`, to = `${Number(mapping.toGroup)},${Number(mapping.toNumber)}`;
    if (!existing.has(from)) errors.push(`Source identity ${from} does not exist.`);
    if (![mapping.toGroup, mapping.toNumber].every((value) => Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 65535)) errors.push(`Destination ${to} is outside 0-65535.`);
    if (destinations.has(to)) errors.push(`Multiple mappings target ${to}.`); else destinations.set(to, from);
  }
  const movedSources = new Set((mappings || []).map((mapping) => `${Number(mapping.fromGroup)},${Number(mapping.fromNumber)}`));
  for (const [to, from] of destinations) if (existing.has(to) && !movedSources.has(to) && to !== from) errors.push(`Destination ${to} is already occupied.`);
  for (const mapping of mappings || []) if (`${mapping.fromGroup},${mapping.fromNumber}` === `${mapping.toGroup},${mapping.toNumber}`) warnings.push(`Mapping ${mapping.fromGroup},${mapping.fromNumber} does not change identity.`);
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

module.exports = { CATEGORY_ORDER, animationCategory, soundCategory, paletteCategory, animationRecord, compare, sorted, validateIdentityMapping };
