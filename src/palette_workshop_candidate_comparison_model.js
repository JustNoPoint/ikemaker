'use strict';

const { normalizeColors } = require('./palette_editor');

const VERSION = 1;
const LIMITS = Object.freeze({
  maximumTags: 16,
  maximumTagLength: 40,
  maximumLabelLength: 120,
  maximumGroupLabelLength: 80,
  maximumPageSize: 64,
  defaultPageSize: 32
});

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) freeze(item);
  return Object.freeze(value);
}

function boundedText(value, maximum) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum);
}

function normalizeDisplayMetadata(value = {}) {
  const tags = [], seen = new Set();
  for (const raw of Array.isArray(value.tags) ? value.tags : []) {
    const tag = boundedText(raw, LIMITS.maximumTagLength), key = tag.toLocaleLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key); tags.push(tag);
    if (tags.length >= LIMITS.maximumTags) break;
  }
  return freeze({
    authoritative: false,
    label: boundedText(value.label, LIMITS.maximumLabelLength),
    groupLabel: boundedText(value.groupLabel, LIMITS.maximumGroupLabelLength),
    tags
  });
}

function comparePalettes(beforeColors, candidateColors) {
  const before = normalizeColors(beforeColors), after = normalizeColors(candidateColors);
  const entries = before.map((color, index) => {
    const next = after[index], rgbChanged = color.slice(0, 3).some((channel, offset) => channel !== next[offset]), alphaChanged = color[3] !== next[3];
    return freeze({ index, before: color, after: next, changed: rgbChanged || alphaChanged, rgbChanged, alphaChanged });
  });
  const changedMask = entries.map(entry => entry.changed), alphaChangedMask = entries.map(entry => entry.alphaChanged), changedIndices = entries.filter(entry => entry.changed).map(entry => entry.index), alphaChangedIndices = entries.filter(entry => entry.alphaChanged).map(entry => entry.index);
  return freeze({
    entries,
    changedMask,
    alphaChangedMask,
    changedIndices,
    alphaChangedIndices,
    changedCount: changedIndices.length,
    alphaChangedCount: alphaChangedIndices.length,
    exact: changedIndices.length === 0
  });
}

function normalizeIndexQuery(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return freeze({ raw: '', index: null, valid: true });
  if (!/^\d{1,3}$/.test(raw)) return freeze({ raw: raw.slice(0, 16), index: null, valid: false });
  const index = Number(raw);
  return freeze({ raw: String(index), index: index >= 0 && index < 256 ? index : null, valid: index >= 0 && index < 256 });
}

function boundedInteger(value, fallback, minimum, maximum) {
  const number = Number(value);
  return Number.isInteger(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
}

function normalizeNavigation(comparison, options = {}) {
  if (!comparison || !Array.isArray(comparison.entries) || comparison.entries.length !== 256) throw new Error('Candidate comparison navigation requires one exact 256-entry comparison.');
  const changedOnly = Boolean(options.changedOnly), search = normalizeIndexQuery(options.indexQuery), pageSize = boundedInteger(options.pageSize, LIMITS.defaultPageSize, 1, LIMITS.maximumPageSize);
  let filteredIndices = comparison.entries.filter(entry => !changedOnly || entry.changed).map(entry => entry.index);
  if (search.raw) filteredIndices = search.valid && filteredIndices.includes(search.index) ? [search.index] : [];
  const pageCount = Math.max(1, Math.ceil(filteredIndices.length / pageSize)), requestedPage = boundedInteger(options.page, 0, 0, pageCount - 1), requestedIndex = boundedInteger(options.selectedIndex, -1, 0, 255), requestedOffset = filteredIndices.indexOf(requestedIndex);
  const page = requestedOffset >= 0 ? Math.floor(requestedOffset / pageSize) : requestedPage, start = page * pageSize, selectedIndex = requestedOffset >= 0 ? requestedIndex : (filteredIndices[start] ?? null), selectedOffset = selectedIndex === null ? -1 : filteredIndices.indexOf(selectedIndex);
  const previousIndex = selectedOffset < 0 ? null : filteredIndices[(selectedOffset - 1 + filteredIndices.length) % filteredIndices.length], nextIndex = selectedOffset < 0 ? null : filteredIndices[(selectedOffset + 1) % filteredIndices.length];
  return freeze({
    changedOnly,
    search,
    page,
    pageCount,
    pageSize,
    total: filteredIndices.length,
    filteredIndices,
    selectedIndex,
    selectedOffset,
    previousIndex,
    nextIndex,
    slider: { min: 0, max: Math.max(0, filteredIndices.length - 1), value: Math.max(0, selectedOffset), disabled: selectedOffset < 0 },
    entries: filteredIndices.slice(start, start + pageSize).map(index => comparison.entries[index])
  });
}

function buildCandidateComparison(input = {}) {
  const candidate = normalizeColors(input.candidateColors), retained = comparePalettes(input.retainedColors, candidate), embedded = comparePalettes(input.embeddedColors, candidate), baseline = input.baseline === 'embedded' ? 'embedded' : 'retained', selected = baseline === 'embedded' ? embedded : retained;
  return freeze({
    schema: 'ikemaker.palette-workshop-candidate-comparison',
    version: VERSION,
    readOnly: true,
    baseline,
    metadata: normalizeDisplayMetadata(input.metadata),
    comparisons: { retained, embedded },
    navigation: normalizeNavigation(selected, input.navigation)
  });
}

module.exports = { VERSION, LIMITS, normalizeDisplayMetadata, comparePalettes, normalizeIndexQuery, normalizeNavigation, buildCandidateComparison };
