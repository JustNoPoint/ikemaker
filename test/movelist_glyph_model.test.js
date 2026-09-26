'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  gameRoot, resolvedMotif, resolveMotifAsset, loadGlyphCatalog, glyphSegments, glyphWarnings, editGlyph
} = require('../src/movelist_glyph_model');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-glyphs-'));
const mkdir = relative => fs.mkdirSync(path.join(root, relative), { recursive: true });
const write = (relative, text = '') => { const filename = path.join(root, relative); mkdir(path.dirname(relative)); fs.writeFileSync(filename, text); return filename; };

mkdir('chars/Ryu');
mkdir('data/custom');
write('save/config.ini', '[Config]\nMotif = data/custom/system.def\n');
write('data/system.base.def', '[Files]\nglyphs = glyphs.sff\n\n[Glyphs]\n_D = 1,0 ; Down\n_QDF = 2,0 ; Quarter circle forward\n^P = 3,0 ; Any punch\n"_=" = 5,0 ; Squatting\n_DOWN = 1,0 ; Down alias\n');
const motif = write('data/custom/system.def', '[Files]\nglyphs = custom-glyphs.sff\n\n[Glyphs]\n^P = 4,0 ; Motif punch\n');
const archiveFile = write('data/custom/custom-glyphs.sff', 'test archive');

assert.strictEqual(gameRoot(path.join(root, 'chars/Ryu/Ryu.def')), root);
const motifInfo = resolvedMotif(path.join(root, 'chars/Ryu/Ryu.def'));
assert.strictEqual(motifInfo.motif, motif, 'configured motif wins over conventional defaults');
write('save/config.ini', '[Config]\nMotif = data/missing/system.def\n');
assert.strictEqual(resolvedMotif(path.join(root, 'chars/Ryu/Ryu.def')).state, 'unresolved', 'a broken explicit motif never falls back to a different installed screenpack');
write('save/config.ini', '[Config]\nMotif = data/custom/system.def\n');
assert.strictEqual(resolveMotifAsset('custom-glyphs.sff', motif, root), archiveFile, 'motif directory has first asset priority');
const rootAsset = write('root-only.sff');
assert.strictEqual(resolveMotifAsset('root-only.sff', motif, root), rootAsset, 'game root has second asset priority');
const dataAsset = write('data/data-only.sff');
assert.strictEqual(resolveMotifAsset('data-only.sff', motif, root), dataAsset, 'data directory has third asset priority');
assert.strictEqual(resolvedMotif(path.join(os.tmpdir(), 'not-an-ikemen-project', 'Ryu.def')).state, 'unresolved', 'unanchored files are not guessed into another project');
assert.strictEqual(resolvedMotif(path.join(os.tmpdir(), 'shared-character', 'Ryu.def'), { root }).motif, motif, 'an explicitly selected game root resolves an out-of-root shared character');

const catalog = loadGlyphCatalog(path.join(root, 'chars/Ryu/Ryu.def'), {
  readArchive: filename => ({ filename, sprites: [
    { group: 1, number: 0, width: 8, height: 9 },
    { group: 2, number: 0, width: 18, height: 9 },
    { group: 4, number: 0, width: 10, height: 9 },
    { group: 5, number: 0, width: 10, height: 9 }
  ] }),
  spriteUri: (_archive, sprite) => `data:test/${sprite.group},${sprite.number}`
});
assert.strictEqual(catalog.state, 'ready');
assert.strictEqual(catalog.archiveFile, archiveFile);
assert.strictEqual(catalog.entries.find(item => item.token === '^P').sprite.join(','), '4,0', 'motif mapping overrides bundled default reference');
assert.strictEqual(catalog.entries.find(item => item.token === '^P').inherited, false);
assert.strictEqual(catalog.entries.find(item => item.token === '_QDF').inherited, true);
assert.strictEqual(catalog.entries.find(item => item.token === '_D').src, 'data:test/1,0');
assert.strictEqual(catalog.entries.find(item => item.token === '_=').src, 'data:test/5,0', 'quoted glyph keys containing equals are parsed as one token');

const tokens = ['_D', '_QDF', '^P'];
const source = 'Hadoken <span data="_D">(hold)</span>  _QDF + ^P';
const segments = glyphSegments(source, tokens);
assert.deepStrictEqual(segments.filter(item => item.kind === 'glyph').map(item => item.token), ['_QDF', '^P'], 'markup is protected and longest loaded token wins');
assert.strictEqual(segments.map(item => item.raw).join(''), source, 'no-op parse is byte exact');
assert.strictEqual(glyphSegments('ordinary Down and Punch words', tokens).filter(item => item.kind === 'glyph').length, 0, 'ordinary text is never invented into glyphs');
assert.strictEqual(glyphSegments('_DUMMY ; _D', tokens).filter(item => item.kind === 'glyph').length, 0, 'known prefixes inside unknown tokens and comments remain ordinary source text');
assert.strictEqual(glyphSegments('word_QDF <tag attr="_D"', tokens).filter(item => item.kind === 'glyph').length, 0, 'glyph-looking ordinary text and unfinished markup remain protected source');
assert.deepStrictEqual(glyphSegments('_QDF^P', tokens).filter(item => item.kind === 'glyph').map(item => item.token), ['_QDF', '^P'], 'adjacent loaded glyphs remain separate editable tokens');
assert.deepStrictEqual(glyphWarnings('^LP+^LK', { state: 'ready', entries: [
  { token: '^LP', state: 'ready' }, { token: '^LK', state: 'ready' }
] }), [], 'a plus separator is not consumed into a glyph warning');
const protectedUnknown = glyphSegments('_D_UNKNOWN', tokens);
assert.strictEqual(protectedUnknown.filter(item => item.kind === 'glyph').length, 0, 'a known prefix does not expose an editable glyph inside an unknown chain');
assert.deepStrictEqual(protectedUnknown.filter(item => item.kind === 'unknown').map(item => item.raw), ['_D_UNKNOWN'], 'the complete unknown chain remains protected as one source span');
assert.deepStrictEqual(glyphWarnings('_D_UNKNOWN', catalog).map(item => item.token), ['_D_UNKNOWN'], 'rendering and diagnostics consume the same unknown-chain lexical result');
assert.strictEqual(editGlyph('Text only', tokens, 'append', 0, '_D'), 'Text only _D');
assert.strictEqual(editGlyph('_D / ^P', tokens, 'moveRight', 0), '^P / _D', 'reorder swaps token contents while preserving separators');
assert.strictEqual(editGlyph('<#ffffff>_D</> + ^P note', tokens, 'remove', 0), '<#ffffff></> + ^P note', 'remove preserves surrounding markup and text exactly');
assert.strictEqual(editGlyph('_D + ^P', tokens, 'replace', 1, '_QDF'), '_D + _QDF');
assert.strictEqual(editGlyph('_D + ^P', tokens, 'insertBefore', 1, '_QDF'), '_D + _QDF^P');

let decoded = 0;
const budgeted = loadGlyphCatalog(path.join(root, 'chars/Ryu/Ryu.def'), {
  maxDecodedSprites: 1,
  readArchive: filename => ({ filename, sprites: [
    { group: 1, number: 0, width: 8, height: 9 }, { group: 2, number: 0, width: 18, height: 9 },
    { group: 4, number: 0, width: 10, height: 9 }, { group: 5, number: 0, width: 10, height: 9 }
  ] }),
  spriteUri: () => { decoded += 1; return 'data:test'; }
});
assert.strictEqual(decoded, 1, 'glyph preview decoding has a hard unique-sprite budget');
assert.strictEqual(budgeted.entries.find(item => item.token === '_DOWN').state, 'ready', 'duplicate mappings reuse one decoded sprite even after the budget is reached');
assert(budgeted.entries.some(item => /decode budget/.test(item.reason || '')), 'budgeted mappings stay visible as unresolved instead of stalling the editor');
const warnings = glyphWarnings('_D\n_UNKNOWN\n^MISSING\n; _COMMENT\n<tag attr="_MARKUP">', catalog);
assert.deepStrictEqual(warnings.map(item => item.token), ['_UNKNOWN', '^MISSING'], 'missing-looking glyph references warn by line while comments and markup attributes remain protected');
const missingCatalog = { state: 'ready', entries: [{ token: '_D', state: 'unresolved', sprite: [99,0], reason: 'Sprite 99,0 is missing from glyphs.sff.' }] };
assert.strictEqual(glyphWarnings('_D', missingCatalog)[0].kind, 'missing-sprite', 'engine missing-sprite references are distinguished from preview failures');
const decoderFailure = loadGlyphCatalog(path.join(root, 'chars/Ryu/Ryu.def'), {
  readArchive: () => { throw new Error('unsupported SFF compression'); }
});
assert(decoderFailure.entries.every(item => item.state === 'unresolved' && /could not be decoded/.test(item.reason || '')), 'an archive decoder failure is recorded consistently for every mapped glyph');
assert.strictEqual(glyphWarnings('_D', decoderFailure)[0].kind, 'preview-unavailable', 'an archive decoder failure never masquerades as a confirmed missing engine sprite');
assert.strictEqual(glyphWarnings('_D', { state: 'unresolved', reason: 'Choose a game folder.', entries: [] })[0].kind, 'preview-context', 'unresolved project context never masquerades as an engine glyph failure');

fs.rmSync(root, { recursive: true, force: true });
console.log('Movelist glyph model tests passed');
