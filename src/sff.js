'use strict';

const path = require('path');
const { transformationItem } = require('./sff_names');

const HYPER_FAMILIES = [
  { name: 'Fireball', base: 3000, aliases: ['fireball', 'hadouken', 'shinkuhadouken'] },
  { name: 'DP', base: 3100, aliases: ['dp', 'shoryu', 'shoryuken', 'shinshoryu', 'shinshoryuken', 'shinsho'] },
  { name: 'AirborneAdvance', base: 3200, aliases: ['airborneadvance', 'tatsu', 'tigerknee', 'blankaball', 'psychocrusher'] },
  { name: 'GroundedAdvance', base: 3300, aliases: ['groundedadvance', 'donkeykick', 'joudan', 'joudansokutogeri'] },
  { name: 'StationaryBurst', base: 3400, aliases: ['stationaryburst', 'hashogeki', 'hasho'] },
  { name: 'ResourceInstall', base: 3500, aliases: ['resourceinstall', 'resourcecharge', 'install', 'denjincharge', 'stockcharge'] },
  { name: 'DiveAttack', base: 3600, aliases: ['diveattack', 'divekick', 'divepunch'] },
  { name: 'CommandGrab', base: 3700, aliases: ['commandgrab', 'specialthrow', 'commandthrow', '360'] },
  { name: 'BodyShift', base: 3800, aliases: ['bodyshift', 'physicalshift', 'specialmovement'] },
  { name: 'Teleport', base: 3900, aliases: ['teleport', 'warp', 'vanishteleport'] },
  { name: 'FloatAerialControl', base: 4000, aliases: ['float', 'hover', 'yogafloat', 'aerialcontrol', 'floataerialcontrol'] },
  { name: 'CommandDash', base: 4100, aliases: ['commanddash', 'specialdash', 'rekkadash'] },
  { name: 'CounterAttack', base: 4200, aliases: ['counterattack', 'counterhigh', 'countermid', 'counterlow'] },
  { name: 'SustainedAttack', base: 4300, aliases: ['sustainedattack', 'hundredhandslap', 'lightninglegs', 'electricity', 'lariat'] }
];

function compactToken(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function aliasEntries(registry, scopes) {
  const aliases = registry && registry.aliases ? registry.aliases : registry || {};
  const entries = [];
  for (const scope of scopes) {
    const values = aliases[scope] || {};
    for (const [canonical, names] of Object.entries(values)) {
      entries.push([compactToken(canonical), canonical]);
      for (const name of Array.isArray(names) ? names : [names]) entries.push([compactToken(name), canonical]);
    }
  }
  return entries.filter(([name]) => name);
}

function resolveAlias(value, registry, scopes) {
  const wanted = compactToken(value);
  if (!wanted) return String(value || '');
  const found = aliasEntries(registry, scopes).find(([name]) => name === wanted);
  return found ? found[1] : String(value || '');
}

function hyperFamily(row, registry = {}) {
  const explicit = [row.FunctionalFamily, row.MoveFamily, row.ClassificationFamily]
    .map((value) => compactToken(resolveAlias(value, registry, ['families']))).find(Boolean);
  const sequence = compactToken(row.CanonicalSequenceKey || row.NormalizedAnimation || row.OriginalRelativePath);
  return HYPER_FAMILIES.find((family) =>
    compactToken(family.name) === explicit || family.aliases.includes(explicit) ||
    family.aliases.some((alias) => sequence.includes(alias)) ||
    aliasEntries(registry, ['families']).some(([alias, canonical]) =>
      compactToken(canonical) === compactToken(family.name) && sequence.includes(alias))) || null;
}

function isExplicitHyper(row) {
  return /\b(?:super|hyper)\b/i.test([
    row.Category, row.MoveClass, row.ClassificationRule, row.AssetCategory
  ].filter(Boolean).join(' '));
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const source = String(text || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += char;
  }
  if (field.length || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows.shift();
  return rows.filter((entry) => entry.some((value) => value !== '')).map((entry) =>
    Object.fromEntries(headers.map((header, index) => [header, entry[index] || '']))
  );
}

function csvCell(value) {
  const text = value === undefined || value === null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function stringifyCsv(rows) {
  if (!rows.length) return '';
  const headers = [];
  for (const row of rows) for (const key of Object.keys(row)) if (!headers.includes(key)) headers.push(key);
  return `${headers.map(csvCell).join(',')}\r\n${rows.map((row) => headers.map((key) => csvCell(row[key])).join(',')).join('\r\n')}\r\n`;
}

function normalizedSequence(stem, registry = {}) {
  let value = String(stem || '')
    .trim()
    .replace(/^Ryu\s+2026\s+CvS[_\s-]*/i, '')
    .replace(/[_\s-]+/g, ' ')
    .replace(/\bst\s+HKf\b/i, 'st fHK')
    .replace(/\bHKf\b/i, 'fHK')
    .trim();
  value = resolveAlias(value, registry, ['sequences']);
  const tokenScopes = ['contexts', 'strengths', 'attackTypes', 'directions', 'phases', 'categories', 'families'];
  value = value.split(/\s+/).map((token) => resolveAlias(token, registry, tokenScopes)).join(' ')
    .replace(/\b([LMH])\s+([PK])\b/g, '$1$2');
  return value
    .replace(/ /g, '_')
    .replace(/^st_/, 'st ')
    .replace(/^cr_/, 'cr ')
    .replace(/^j_/, 'j ');
}

function parseSpriteName(filename, registry = {}) {
  const stem = path.basename(filename, path.extname(filename));
  const match = /^(.*?)[_\s-](\d+)$/.exec(stem);
  return match
    ? { sequence: normalizedSequence(match[1], registry), index: Number(match[2]), stem }
    : { sequence: normalizedSequence(stem, registry), index: null, stem };
}

function rowNumber(row, key) {
  const value = Number(row[key]);
  return Number.isInteger(value) ? value : null;
}

function validateManifest(rows, options = {}) {
  const issues = [];
  const identities = new Map();
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const label = row.OriginalRelativePath || `row ${index + 2}`;
    const group = rowNumber(row, 'ComputedGroup');
    const image = rowNumber(row, 'ImageIndex');
    const layer = rowNumber(row, 'LayerNumber') || 0;
    const hasForm = Object.prototype.hasOwnProperty.call(row, 'FormNumber');
    const form = rowNumber(row, 'FormNumber') || 0;
    if (options.requireApproved !== false && row.ReviewStatus !== 'APPROVED') issues.push(`${label}: row is not APPROVED`);
    if (group === null || image === null) issues.push(`${label}: group or image index is unresolved`);
    if (group !== null && (group < 0 || group > 65535)) issues.push(`${label}: group is outside 0-65535`);
    if (image !== null && (image < 0 || image > 65535)) issues.push(`${label}: index is outside 0-65535`);
    if (layer < 0 || layer > 4) issues.push(`${label}: layer must be 0-4`);
    if (hasForm && (form < 0 || form > 4)) issues.push(`${label}: transformation form must be 0-4`);
    if (hasForm && image !== null) {
      const sourceItem = rowNumber(row, 'SourceImageIndex');
      if (sourceItem === null || sourceItem < 0 || sourceItem > 9999) issues.push(`${label}: base transformation item must be 0-9999`);
      else if (image !== transformationItem(sourceItem, form)) issues.push(`${label}: Form ${form} item must be base item ${sourceItem} + ${form * 10000}`);
    }
    if (layer > 0) {
      const base = rowNumber(row, 'BaseGroup');
      if (base === null || group !== base + layer * 10000) issues.push(`${label}: invalid layer-bank group`);
    }
    if (layer === 0 && group !== null) {
      const family = hyperFamily(row, options.aliasRegistry || {});
      const hyper = isExplicitHyper(row) || (group >= 3000 && group <= 4999);
      if (hyper && (group < 3000 || group > 4999)) {
        issues.push(`${label}: Hyper animation content must remain within groups 3000-4999`);
      }
      if (hyper && family) {
        if (group < family.base || group > family.base + 99) {
          issues.push(`${label}: ${family.name} Hyper must use ${family.base}-${family.base + 99}`);
        } else if ((group - family.base) % 10 !== 0) {
          issues.push(`${label}: Hyper sequences use ten-group slots; matching air versions use ground +50`);
        }
      } else if (hyper && group < 4400) {
        issues.push(`${label}: Hyper in 3000-4399 needs a recognized FunctionalFamily or alias`);
      }
    }
    if (group !== null && image !== null) {
      const identity = `${group},${image}`;
      if (identities.has(identity)) issues.push(`${label}: duplicate SFF identity ${identity}`);
      else identities.set(identity, label);
    }
  }
  return issues;
}

function layerFolderNumber(folderName) {
  const match = /^layer([1-4])$/i.exec(String(folderName || '').trim());
  return match ? Number(match[1]) : null;
}

function formFolderNumber(folderName) {
  const match = /^form\s*([1-4])(?:\b|[_ -])/i.exec(`${String(folderName || '').trim()} `);
  return match ? Number(match[1]) : null;
}

function inferLayerRole(name) {
  const value = compactToken(name);
  if (/part.*back|back.*part/.test(value)) return { role: 'PartBack', syncLayer: '-1' };
  if (/part.*front|front.*part/.test(value)) return { role: 'PartFront', syncLayer: '1' };
  if (/cosmetic|beard|mask|costume/.test(value)) return { role: 'Cosmetic', syncLayer: '1' };
  return { role: 'Review', syncLayer: '' };
}

function baseKey(row) {
  return `${String(row.CanonicalSequenceKey || '').toLowerCase()}\0${row.SourceImageIndex || row.ImageIndex}`;
}

function makeLayerRows(baseRows, layerFiles, layerNumber, aliasRegistry = {}, layerMetadata = {}) {
  if (!Number.isInteger(layerNumber) || layerNumber < 1 || layerNumber > 4) throw new Error('Layer number must be 1-4.');
  const base = new Map(baseRows.filter((row) => Number(row.LayerNumber || 0) === 0).map((row) => [baseKey(row), row]));
  const created = [];
  const unmatched = [];
  for (const file of layerFiles) {
    const parsed = parseSpriteName(file.name, aliasRegistry);
    const key = `${parsed.sequence.toLowerCase()}\0${parsed.index === null ? '' : parsed.index}`;
    const match = base.get(key);
    if (!match) { unmatched.push(file.name); continue; }
    const baseGroup = Number(match.BaseGroup);
    created.push({
      ...match,
      OriginalRelativePath: `Layer${layerNumber}${path.sep}${file.name}`,
      SourceAbsolutePath: file.fullPath,
      LayerNumber: String(layerNumber),
      LayerRole: String(layerMetadata.role || 'Review'),
      SuggestedSyncLayer: layerMetadata.syncLayer === undefined ? '' : String(layerMetadata.syncLayer),
      LayerOwner: String(layerMetadata.owner || 'Review'),
      ComputedGroup: String(baseGroup + layerNumber * 10000),
      CanonicalOutputFilename: `${String(baseGroup + layerNumber * 10000).padStart(5, '0')}_${String(match.ImageIndex).padStart(5, '0')}.png`,
      AssetStatus: 'layer',
      SourceSHA256: file.hash,
      BaseSourceSHA256: match.SourceSHA256,
      ReviewStatus: 'REVIEW',
      ReviewReason: `Layer ${layerNumber} matched to approved base identity; review before build.`,
      RedundancyStatus: file.hash === match.SourceSHA256 ? 'CANDIDATE_EXACT' : '',
      RedundancyBaseHash: match.SourceSHA256,
      RedundancyLayerHash: file.hash
    });
  }
  return { created, unmatched };
}

function redundancyCandidates(rows) {
  const baseHashes = new Map(rows.filter((row) => Number(row.LayerNumber || 0) === 0)
    .map((row) => [`${row.BaseGroup}\0${row.ImageIndex}`, row.SourceSHA256]));
  return rows.filter((row) => Number(row.LayerNumber || 0) > 0).filter((row) => {
    const currentBaseHash = baseHashes.get(`${row.BaseGroup}\0${row.ImageIndex}`) || row.BaseSourceSHA256;
    if (row.RedundancyStatus === 'DISMISSED' &&
        row.RedundancyBaseHash === currentBaseHash &&
        row.RedundancyLayerHash === row.SourceSHA256) return false;
    if (row.RedundancyStatus === 'DISMISSED') return true;
    return row.RedundancyStatus === 'CANDIDATE_MANUAL' ||
      (row.SourceSHA256 && currentBaseHash && row.SourceSHA256 === currentBaseHash);
  });
}

function manualLayerRows(rows) {
  return rows.filter((row) => Number(row.LayerNumber || 0) > 0 &&
    ['PartFront', 'PartBack', 'Review'].includes(String(row.LayerRole || 'Review')) &&
    String(row.ReviewStatus || '').toUpperCase() !== 'APPROVED');
}

function applyManualLayerDecision(rows, identities, decision) {
  const wanted = new Set(identities), owner = String(decision.owner || ''), syncLayer = Number(decision.syncLayer);
  if (!['P1', 'P2', 'Helper', 'Projectile'].includes(owner)) throw new Error('Layer owner must be P1, P2, Helper, or Projectile.');
  if (!Number.isInteger(syncLayer) || syncLayer === 0) throw new Error('A reviewed interaction part needs a nonzero synchronized layer.');
  let updated = 0;
  const next = rows.map((row) => {
    const identity = `${row.ComputedGroup},${row.ImageIndex}`;
    if (!wanted.has(identity) || !manualLayerRows([row]).length) return row;
    updated += 1;
    return { ...row, LayerOwner: owner, SuggestedSyncLayer: String(syncLayer), RuntimeLayerReview: 'HUMAN_CONFIRMED', ReviewStatus: 'APPROVED', ReviewReason: `Human-confirmed ${row.LayerRole} ordering relative to ${owner} at synclayer ${syncLayer}.` };
  });
  return { rows: next, updated };
}

module.exports = {
  parseCsv,
  stringifyCsv,
  parseSpriteName,
  validateManifest,
  layerFolderNumber,
  formFolderNumber,
  inferLayerRole,
  makeLayerRows,
  redundancyCandidates,
  manualLayerRows,
  applyManualLayerDecision,
  HYPER_FAMILIES,
  hyperFamily,
  resolveAlias,
  normalizedSequence
};
