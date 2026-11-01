'use strict';

const assert = require('assert');
const model = require('../src/palette_workshop_candidate_comparison_model');

const palette = factory => Array.from({ length: 256 }, (_value, index) => factory(index));
const base = palette(index => [index, 255 - index, index % 17, index === 0 ? 0 : 255]);

const unchanged = model.comparePalettes(base, base);
assert.strictEqual(unchanged.exact, true);
assert.strictEqual(unchanged.changedCount, 0);
assert.deepStrictEqual(unchanged.changedIndices, []);
assert(unchanged.changedMask.every(value => value === false));

const allChanged = palette(index => [(index + 1) % 256, index, 255 - index, index === 0 ? 255 : 0]);
const complete = model.comparePalettes(base, allChanged);
assert.strictEqual(complete.changedCount, 256);
assert.strictEqual(complete.alphaChangedCount, 256);
assert.deepStrictEqual(complete.entries[0].before, [0, 255, 0, 0]);
assert.deepStrictEqual(complete.entries[0].after, [1, 0, 255, 255]);
assert.strictEqual(complete.entries[0].alphaChanged, true);

const alphaOnly = base.map(color => color.slice());
alphaOnly[0][3] = 255; alphaOnly[42][3] = 0;
const alphaComparison = model.comparePalettes(base, alphaOnly);
assert.deepStrictEqual(alphaComparison.changedIndices, [0, 42]);
assert.deepStrictEqual(alphaComparison.alphaChangedIndices, [0, 42]);
assert.strictEqual(alphaComparison.entries[0].rgbChanged, false, 'transparent-entry alpha changes remain distinct from RGB changes');

const changedNavigation = model.normalizeNavigation(alphaComparison, { changedOnly: true, page: 99, pageSize: 1, selectedIndex: 42 });
assert.strictEqual(changedNavigation.page, 1, 'page is clamped to the bounded filtered result');
assert.strictEqual(changedNavigation.pageCount, 2);
assert.strictEqual(changedNavigation.selectedIndex, 42);
assert.strictEqual(changedNavigation.previousIndex, 0);
assert.strictEqual(changedNavigation.nextIndex, 0);
assert.strictEqual(changedNavigation.slider.value, 1);
assert.strictEqual(changedNavigation.entries[0].index, 42);
const pagedNavigation = model.normalizeNavigation(complete, { page: 3, pageSize: 16 });
assert.strictEqual(pagedNavigation.page, 3);
assert.strictEqual(pagedNavigation.selectedIndex, 48, 'a page change selects the first visible exact index');
const selectedNavigation = model.normalizeNavigation(complete, { page: 0, pageSize: 16, selectedIndex: 70 });
assert.strictEqual(selectedNavigation.page, 4, 'an exact slider/arrow selection keeps its containing page visible');
assert.strictEqual(selectedNavigation.entries[0].index, 64);

const exactSearch = model.normalizeNavigation(complete, { indexQuery: '007', pageSize: 200, selectedIndex: 7 });
assert.deepStrictEqual(exactSearch.filteredIndices, [7]);
assert.strictEqual(exactSearch.search.raw, '7');
assert.strictEqual(exactSearch.pageSize, model.LIMITS.maximumPageSize);
const invalidSearch = model.normalizeNavigation(complete, { indexQuery: '7.5' });
assert.strictEqual(invalidSearch.search.valid, false);
assert.strictEqual(invalidSearch.total, 0);
assert.strictEqual(invalidSearch.selectedIndex, null);
assert.strictEqual(invalidSearch.slider.disabled, true);

const metadata = model.normalizeDisplayMetadata({ label: `  Candidate\n${'x'.repeat(200)}  `, groupLabel: '  Base colors  ', tags: ['Blue', 'blue', '', ...Array.from({ length: 30 }, (_value, index) => ` tag-${index} `)] });
assert.strictEqual(metadata.authoritative, false);
assert(metadata.label.length <= model.LIMITS.maximumLabelLength);
assert.strictEqual(metadata.groupLabel, 'Base colors');
assert.strictEqual(metadata.tags[0], 'Blue');
assert.strictEqual(metadata.tags.length, model.LIMITS.maximumTags);

const retained = base.map(color => color.slice()), embedded = base.map(color => color.slice()), candidate = base.map(color => color.slice());
retained[2] = [9, 9, 9, 255]; embedded[3] = [8, 8, 8, 255]; candidate[4] = [7, 7, 7, 255];
const originalCandidate = JSON.stringify(candidate), built = model.buildCandidateComparison({ candidateColors: candidate, retainedColors: retained, embeddedColors: embedded, baseline: 'embedded', metadata: { label: 'Alt 01', tags: ['warm'] }, navigation: { changedOnly: true } });
assert.strictEqual(built.readOnly, true);
assert.strictEqual(built.baseline, 'embedded');
assert.deepStrictEqual(built.comparisons.retained.changedIndices, [2, 4]);
assert.deepStrictEqual(built.comparisons.embedded.changedIndices, [3, 4]);
assert.deepStrictEqual(built.navigation.filteredIndices, [3, 4]);
assert.strictEqual(built.metadata.label, 'Alt 01');
assert.strictEqual(JSON.stringify(candidate), originalCandidate, 'comparison never mutates supplied palettes');
assert(Object.isFrozen(built) && Object.isFrozen(built.comparisons.retained.entries[0]));

assert.throws(() => model.comparePalettes(base.slice(0, 255), base), /exactly 256/);
assert.throws(() => model.normalizeNavigation({ entries: [] }), /256-entry comparison/);

console.log('Palette Workshop candidate comparison model tests passed');
