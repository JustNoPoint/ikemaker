'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  GLYPH_LIMITS, gameRoot, resolvedMotif, resolveMotifAsset, glyphAssetAuthority, preflightSffBuffer, loadGlyphCatalog, glyphSegments, glyphWarnings, editGlyph, movelistColorTags, replaceMovelistColorTag, movelistVisualSegments, editMovelistLines, movelistLiteralMatches, replaceMovelistLiteral, replaceMovelistGlyphToken, movelistGlyphOccurrences
} = require('../src/movelist_glyph_model');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-glyphs-'));
const mkdir = relative => fs.mkdirSync(path.join(root, relative), { recursive: true });
const write = (relative, text = '') => { const filename = path.join(root, relative); mkdir(path.dirname(relative)); fs.writeFileSync(filename, text); return filename; };
const archiveInfo = () => ({ signatureValid: true, major: 2, size: 1024, spriteCount: 6, paletteCount: 1 });

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
  archiveInfo,
  readArchive: filename => ({ filename, sprites: [
    { group: 1, number: 0, width: 8, height: 9 },
    { group: 2, number: 0, width: 18, height: 9 },
    { group: 4, number: 0, width: 10, height: 9 },
    { group: 5, number: 0, width: 10, height: 9 }
  ] }),
  spriteUri: (_archive, sprite) => `data:image/png;base64,${Buffer.from(`${sprite.group},${sprite.number}`).toString('base64')}`
});
assert.strictEqual(catalog.state, 'ready');
assert.strictEqual(catalog.archiveFile, archiveFile);
assert.strictEqual(catalog.entries.find(item => item.token === '^P').sprite.join(','), '4,0', 'motif mapping overrides bundled default reference');
assert.strictEqual(catalog.entries.find(item => item.token === '^P').inherited, false);
assert.strictEqual(catalog.entries.find(item => item.token === '_QDF').inherited, true);
assert(catalog.entries.find(item => item.token === '_D').src.startsWith('data:image/png;base64,'));
assert(catalog.entries.find(item => item.token === '_=').src.startsWith('data:image/png;base64,'), 'quoted glyph keys containing equals are parsed as one token');
assert.strictEqual(catalog.mappingFile, motif, 'the effective motif override is exposed as the exact mapping source');
assert.strictEqual(glyphAssetAuthority(path.join(root, 'chars/Ryu/Ryu.def')).archiveFile, archiveFile, 'lightweight glyph authority resolves the exact configured archive without decoding it');

const tokens = ['_D', '_QDF', '^P'];
const source = 'Hadoken <span data="_D">(hold)</span>  _QDF + ^P';
const segments = glyphSegments(source, tokens);
assert.deepStrictEqual(segments.filter(item => item.kind === 'glyph').map(item => item.token), ['_QDF', '^P'], 'markup is protected and longest loaded token wins');
assert.strictEqual(segments.map(item => item.raw).join(''), source, 'no-op parse is byte exact');
assert.strictEqual(glyphSegments('ordinary Down and Punch words', tokens).filter(item => item.kind === 'glyph').length, 0, 'ordinary text is never invented into glyphs');
assert.strictEqual(glyphSegments('_DUMMY ; _D', tokens).filter(item => item.kind === 'glyph').length, 0, 'known prefixes inside unknown tokens and comments remain ordinary source text');
assert.strictEqual(glyphSegments('word_QDF <tag attr="_D"', tokens).filter(item => item.kind === 'glyph').length, 0, 'glyph-looking ordinary text and unfinished markup remain protected source');
assert.deepStrictEqual(glyphSegments('<custom value="a;b"> _QDF', tokens).filter(item => item.kind === 'glyph').map(item => item.token), ['_QDF'], 'a semicolon inside protected custom markup does not hide later glyphs as a false comment');
assert.deepStrictEqual(glyphSegments('<custom text="_QDF > ^P"> _D', tokens).filter(item => item.kind === 'glyph').map(item => item.token), ['_D'], 'greater-than signs and glyph-looking text inside quoted custom markup remain protected');
assert.deepStrictEqual(glyphSegments('Caption "_QDF; ^P" and \'_DOWN\' _D', tokens).filter(item => item.kind === 'glyph').map(item => item.token), ['_D'], 'standalone quoted custom text protects glyph-looking tokens and semicolons without hiding later real glyphs');
assert.deepStrictEqual(glyphSegments('_QDF^P', tokens).filter(item => item.kind === 'glyph').map(item => item.token), ['_QDF', '^P'], 'adjacent loaded glyphs remain separate editable tokens');
const neutralSource='[_F_/Neutral]_+^LP_+^LK',neutralSegments=glyphSegments(neutralSource,['_F','_+','^LP','^LK']);
assert.strictEqual(neutralSegments.map(item=>item.raw).join(''),neutralSource,'a glyph terminator remains byte-exact in source');
assert.strictEqual(neutralSegments.find(item=>item.kind==='glyph'&&item.token==='_F').raw,'_F_','the optional trailing underscore terminates the glyph instead of appearing before /Neutral');
assert(neutralSegments.some(item=>item.kind==='text'&&item.raw.includes('/Neutral')),'the Neutral label remains ordinary visible text');
const colored='<#f0f000>:System Mechanics:</> _F_ <#bebebe>(Hold)</>',colorTags=movelistColorTags(colored);
assert.deepStrictEqual(colorTags.map(item=>[item.hex,item.red,item.green,item.blue]),[['f0f000',240,240,0],['bebebe',190,190,190]],'six-digit movelist tags expose exact RGB values for a friendly editor');
assert.strictEqual(replaceMovelistColorTag(colored,1,'#112233'),'<#f0f000>:System Mechanics:</> _F_ <#112233>(Hold)</>','changing one text color preserves all other source bytes');
const visualColorSegments=movelistVisualSegments(colored,['_F']);
assert.strictEqual(visualColorSegments.map(item=>item.raw).join(''),colored,'styled preview segmentation remains byte-exact');
assert(visualColorSegments.some(item=>item.kind==='text'&&item.raw===':System Mechanics:'&&item.color==='#f0f000'),'text receives the active engine RGB color');
assert(visualColorSegments.some(item=>item.kind==='glyph'&&item.token==='_F'&&!item.color),'glyphs remain image-driven after the prior color is closed');
const customTokenSegments = glyphSegments('Do %Punch @QCF now', [...tokens, '%Punch', '@QCF']);
assert.deepStrictEqual(customTokenSegments.filter(item => item.kind === 'glyph').map(item => item.token), ['%Punch', '@QCF'], 'configured motif glyphs remain editable even when their author uses a custom prefix');
assert.strictEqual(glyphSegments('word%Punches', [...tokens, '%Punch']).filter(item => item.kind === 'glyph').length, 0, 'custom-prefix glyphs are not exposed from inside ordinary words');
assert.deepStrictEqual(glyphWarnings('^LP+^LK', { state: 'ready', entries: [
  { token: '^LP', state: 'ready' }, { token: '^LK', state: 'ready' }
] }), [], 'a plus separator is not consumed into a glyph warning');
const protectedUnknown = glyphSegments('_D_UNKNOWN', tokens);
assert.strictEqual(protectedUnknown.filter(item => item.kind === 'glyph').length, 0, 'a known prefix does not expose an editable glyph inside an unknown chain');
assert.deepStrictEqual(protectedUnknown.filter(item => item.kind === 'unknown').map(item => item.raw), ['_D_UNKNOWN'], 'the complete unknown chain remains protected as one source span');
assert.deepStrictEqual(glyphWarnings('_D_UNKNOWN', catalog).map(item => item.token), ['_D_UNKNOWN'], 'rendering and diagnostics consume the same unknown-chain lexical result');
assert.strictEqual(editGlyph('Text only', tokens, 'append', 0, '_D'), 'Text only _D');
assert.strictEqual(editGlyph('_D / ^P', tokens, 'moveRight', 0), '^P / _D', 'reorder swaps token contents while preserving separators');
assert.strictEqual(editGlyph('_D + ^P / _QDF', tokens, 'moveFirst', 2), '_QDF + _D / ^P', 'move-to-start rotates only glyph contents across existing separators');
assert.strictEqual(editGlyph('_D + ^P / _QDF', tokens, 'moveLast', 0), '^P + _QDF / _D', 'move-to-end rotates only glyph contents across existing separators');
assert.strictEqual(editGlyph('<#ffffff>_D</> + ^P note', tokens, 'remove', 0), '<#ffffff></> + ^P note', 'remove preserves surrounding markup and text exactly');
assert.strictEqual(editGlyph('_D + ^P', tokens, 'replace', 1, '_QDF'), '_D + _QDF');
assert.strictEqual(editGlyph('_D + ^P', tokens, 'insertBefore', 1, '_QDF'), '_D + _QDF^P');
assert.strictEqual(editGlyph('_D + ^P', tokens, 'duplicate', 0), '_D_D + ^P', 'duplicate preserves the exact selected configured glyph token');
const mixedLines = 'Normal _D\r\nSpecial _QDF\nNote ^P';
assert.strictEqual(editMovelistLines(mixedLines, 'moveDown', 0), 'Special _QDF\r\nNormal _D\nNote ^P', 'line reorder swaps only content and preserves positional mixed line endings');
assert.strictEqual(editMovelistLines(mixedLines, 'moveFirst', 2), 'Note ^P\r\nNormal _D\nSpecial _QDF', 'move-to-start preserves positional mixed line endings');
assert.strictEqual(editMovelistLines(mixedLines, 'moveLast', 0), 'Special _QDF\r\nNote ^P\nNormal _D', 'move-to-end preserves positional mixed line endings');
assert.strictEqual(editMovelistLines(mixedLines, 'duplicate', 1), 'Normal _D\r\nSpecial _QDF\nSpecial _QDF\nNote ^P', 'line duplication follows the selected local line-ending convention');
assert.strictEqual(editMovelistLines('First\rSecond', 'insertBefore', 1, '\n'), 'First\r\rSecond', 'line insertion follows the nearest authored CR convention');
assert.strictEqual(editMovelistLines('First\r\nSecond', 'insertAfter', 1, '\n'), 'First\r\nSecond\r\n', 'insertion after a final line preserves the file no-newline convention on the new final line');
assert.strictEqual(editMovelistLines('First\r\nSecond\nThird', 'pasteBefore', 1, '\n', '<#ff00ff>:Copied:</> _QDF'), 'First\r\n<#ff00ff>:Copied:</> _QDF\nSecond\nThird', 'exact line paste keeps custom text and follows the selected line\'s local LF convention');
assert.strictEqual(editMovelistLines('First\rSecond', 'pasteAfter', 1, '\n', ''), 'First\rSecond\r', 'an intentionally empty copied line remains pasteable and follows the local CR convention');
assert.strictEqual(editMovelistLines('First\r\nSecond', 'remove', 1), 'First', 'removing the final no-newline line does not invent a trailing newline');
const replaceSource='Special _QDF\r\nspecial text\n<#ff00ff>Special</> _QDF\rFinal';
assert.deepStrictEqual(movelistLiteralMatches(replaceSource,'special').map(match=>[match.line,match.start]),[[0,0],[1,0],[2,9]],'literal finder reports line-local positions across mixed line endings');
assert.deepStrictEqual(movelistLiteralMatches(replaceSource,'Special',true).map(match=>match.line),[0,2],'match-case mode excludes differently cased text');
assert.strictEqual(replaceMovelistLiteral(replaceSource,'_QDF','^P',{all:true}).text,'Special ^P\r\nspecial text\n<#ff00ff>Special</> ^P\rFinal','replace-all changes only exact literal spans and preserves every mixed line ending');
const oneReplacement=replaceMovelistLiteral(replaceSource,'special','Move',{index:1});assert.strictEqual(oneReplacement.text,'Special _QDF\r\nMove text\n<#ff00ff>Special</> _QDF\rFinal');assert.strictEqual(oneReplacement.count,1);assert.strictEqual(oneReplacement.total,3,'replace-current exposes total matches without changing the others');
const lineReplacement=replaceMovelistLiteral(replaceSource,'special','Move',{line:2});assert.strictEqual(lineReplacement.text,'Special _QDF\r\nspecial text\n<#ff00ff>Move</> _QDF\rFinal');assert.strictEqual(lineReplacement.count,1);assert.strictEqual(lineReplacement.total,3,'selected-line literal replacement changes every match on only the requested line while preserving mixed endings');
assert.strictEqual(replaceMovelistLiteral(replaceSource,'special','Move',{line:3}).text,replaceSource,'a selected line without matches is a byte-exact no-op');
assert.strictEqual(replaceMovelistLiteral(replaceSource,'','x',{all:true}).text,replaceSource,'an empty query is always a byte-exact no-op');
const glyphReplaceSource='Move _QDF_QDF\r\n"_QDF" <tag value="_QDF"> _QDF ; _QDF\nword_QDF _D';
const glyphReplacement=replaceMovelistGlyphToken(glyphReplaceSource,'_QDF','^P',tokens);
assert.strictEqual(glyphReplacement.text,'Move ^P^P\r\n"_QDF" <tag value="_QDF"> ^P ; _QDF\nword_QDF _D','glyph-only replacement changes configured tokens but protects quoted text, markup, comments, and ordinary word suffixes');
assert.strictEqual(glyphReplacement.count,3);
assert.deepStrictEqual(glyphReplacement.lines,[0,1],'glyph-only replacement reports exact affected zero-based lines without changing line endings');
const lineGlyphReplacement=replaceMovelistGlyphToken(glyphReplaceSource,'_QDF','^P',tokens,{line:1});
assert.strictEqual(lineGlyphReplacement.text,'Move _QDF_QDF\r\n"_QDF" <tag value="_QDF"> ^P ; _QDF\nword_QDF _D','line-scoped glyph replacement changes only parsed configured tokens on the explicitly selected line');
assert.deepStrictEqual(lineGlyphReplacement.lines,[1]);
assert.strictEqual(replaceMovelistGlyphToken(glyphReplaceSource,'_QDF','_QDF',tokens).text,glyphReplaceSource,'same-token glyph replacement is byte-exact no-op');
assert.deepStrictEqual(movelistGlyphOccurrences(glyphReplaceSource,'_QDF',tokens).map(item=>[item.line,item.glyph,item.start]),[[0,0,5],[0,1,9],[1,0,26]],'same-glyph navigation indexes only parsed configured glyphs while protecting quotes, markup, comments, and ordinary words');

let decoded = 0;
const budgeted = loadGlyphCatalog(path.join(root, 'chars/Ryu/Ryu.def'), {
  archiveInfo,
  maxDecodedSprites: 1,
  readArchive: filename => ({ filename, sprites: [
    { group: 1, number: 0, width: 8, height: 9 }, { group: 2, number: 0, width: 18, height: 9 },
    { group: 4, number: 0, width: 10, height: 9 }, { group: 5, number: 0, width: 10, height: 9 }
  ] }),
  spriteUri: () => { decoded += 1; return 'data:image/png;base64,AA=='; }
});
assert.strictEqual(decoded, 1, 'glyph preview decoding has a hard unique-sprite budget');
assert.strictEqual(budgeted.entries.find(item => item.token === '_DOWN').state, 'ready', 'duplicate mappings reuse one decoded sprite even after the budget is reached');
assert(budgeted.entries.some(item => /decode budget/.test(item.reason || '')), 'budgeted mappings stay visible as unresolved instead of stalling the editor');
const warnings = glyphWarnings('_D\n_UNKNOWN\n^MISSING\n; _COMMENT\n<tag attr="_MARKUP">', catalog);
assert.deepStrictEqual(warnings.map(item => item.token), ['_UNKNOWN', '^MISSING'], 'missing-looking glyph references warn by line while comments and markup attributes remain protected');
const missingCatalog = { state: 'ready', entries: [{ token: '_D', state: 'unresolved', sprite: [99,0], reason: 'Sprite 99,0 is missing from glyphs.sff.' }] };
assert.strictEqual(glyphWarnings('_D', missingCatalog)[0].kind, 'missing-sprite', 'engine missing-sprite references are distinguished from preview failures');
const decoderFailure = loadGlyphCatalog(path.join(root, 'chars/Ryu/Ryu.def'), {
  archiveInfo,
  readArchive: () => { throw new Error('unsupported SFF compression'); }
});
assert(decoderFailure.entries.every(item => item.state === 'unresolved' && /could not be decoded/.test(item.reason || '')), 'an archive decoder failure is recorded consistently for every mapped glyph');
assert.strictEqual(glyphWarnings('_D', decoderFailure)[0].kind, 'preview-unavailable', 'an archive decoder failure never masquerades as a confirmed missing engine sprite');
assert.strictEqual(glyphWarnings('_D', { state: 'unresolved', reason: 'Choose a game folder.', entries: [] })[0].kind, 'preview-context', 'unresolved project context never masquerades as an engine glyph failure');

let archiveReads = 0;
const oversizedArchive = loadGlyphCatalog(path.join(root, 'chars/Ryu/Ryu.def'), {
  stat: filename => ({ size: filename === archiveFile ? GLYPH_LIMITS.archiveBytes + 1 : fs.statSync(filename).size, mtimeMs: 1, isFile: () => true }),
  archiveInfo: () => ({ signatureValid: true, major: 2, size: GLYPH_LIMITS.archiveBytes + 1, spriteCount: 0, paletteCount: 0 }),
  readArchive: () => { archiveReads += 1; return { sprites: [] }; }
});
assert.strictEqual(archiveReads, 0, 'an oversized glyph SFF is rejected before archive parsing');
assert(oversizedArchive.entries.every(item => item.state === 'unresolved' && /64 MiB/.test(item.reason || '')));
let uriReads = 0;
const oversizedSprite = loadGlyphCatalog(path.join(root, 'chars/Ryu/Ryu.def'), {
  archiveInfo,
  readArchive: filename => ({ filename, sprites: [{ group: 1, number: 0, width: GLYPH_LIMITS.spriteDimension + 1, height: 1 }] }),
  spriteUri: () => { uriReads += 1; return 'data:image/png;base64,AA=='; }
});
assert.strictEqual(uriReads, 0, 'unsafe glyph dimensions are rejected before PNG encoding');
assert(/safe decode budget/.test(oversizedSprite.entries.find(item => item.token === '_D').reason || ''));
assert.throws(() => loadGlyphCatalog(path.join(root, 'chars/Ryu/Ryu.def'), {
  archiveInfo,
  readText: filename => filename === motif ? '[Files]\nglyphs = custom-glyphs.sff\n\n[Glyphs]\n' + Array.from({ length: GLYPH_LIMITS.mappingRows + 1 }, (_, index) => `_T${index} = 1,0`).join('\n') : fs.readFileSync(filename, 'utf8'),
  readArchive: () => ({ sprites: [] })
}), /4,096-row mapping limit/);

const repeatedPreview = 'data:image/png;base64,' + 'A'.repeat(4000);
const repeatedCatalog = loadGlyphCatalog(path.join(root, 'chars/Ryu/Ryu.def'), {
  archiveInfo,
  limits: { previewBytes: 9000 },
  readText: filename => filename === motif ? '[Files]\nglyphs = custom-glyphs.sff\n\n[Glyphs]\n' + Array.from({ length: 20 }, (_, index) => `_R${index} = 1,0`).join('\n') : fs.readFileSync(filename, 'utf8'),
  readArchive: filename => ({ filename, sprites: [{ group: 1, number: 0, width: 1, height: 1 }] }),
  spriteUri: () => repeatedPreview
});
assert.strictEqual(repeatedCatalog.entries.filter(item => item.state === 'ready').length, 2, 'repeated mappings are charged for every serialized src, not only once per decoded sprite');
assert(repeatedCatalog.entries.some(item => /display budget/.test(item.reason || '')));
assert(repeatedCatalog.entries.reduce((total, item) => total + Buffer.byteLength(item.src || '', 'utf8'), 0) <= 9000, 'public preview payload stays within its declared aggregate budget');

const sff2Header = (sprites, palettes = 0, bytes = 64) => { const buffer = Buffer.alloc(bytes); buffer.write('ElecbyteSpr\0', 0, 'latin1'); buffer[15] = 2; if (bytes >= 64) { buffer.writeUInt32LE(sprites, 40); buffer.writeUInt32LE(palettes, 48); } return buffer; };
assert.throws(() => preflightSffBuffer(sff2Header(GLYPH_LIMITS.archiveSprites + 1), 'glyphs.sff'), /declares more than/);
let parseCalls = 0;
const declaredTooMany = loadGlyphCatalog(path.join(root, 'chars/Ryu/Ryu.def'), {
  readFile: () => sff2Header(GLYPH_LIMITS.archiveSprites + 1),
  parseArchive: () => { parseCalls += 1; return { sprites: [] }; }
});
assert.strictEqual(parseCalls, 0, 'declared SFF sprite counts are rejected before the full parser runs');
assert(declaredTooMany.entries.every(item => /declares more than/.test(item.reason || '')));
const grewAfterStat = loadGlyphCatalog(path.join(root, 'chars/Ryu/Ryu.def'), {
  limits: { archiveBytes: 64 },
  readFile: () => sff2Header(0, 0, 65),
  parseArchive: () => { parseCalls += 1; return { sprites: [] }; }
});
assert(grewAfterStat.entries.every(item => /exceeds the 0 MiB/.test(item.reason || '')), 'actual bytes are checked after the stat preflight to reject file growth');
const boundaryArchive = loadGlyphCatalog(path.join(root, 'chars/Ryu/Ryu.def'), {
  readFile: () => sff2Header(GLYPH_LIMITS.archiveSprites, GLYPH_LIMITS.archivePalettes),
  parseArchive: () => { parseCalls += 1; return { sprites: [] }; }
});
assert.strictEqual(parseCalls, 1, 'declared sprite/palette boundary is admitted to the full parser exactly once');
assert(boundaryArchive.entries.every(item => /missing from/.test(item.reason || '')));
for (const [label, info] of [
  ['negative evidence', { signatureValid: true, major: 2, size: -1, spriteCount: -1, paletteCount: -1 }],
  ['unsupported major', { signatureValid: true, major: 3, size: 64, spriteCount: 0, paletteCount: 0 }],
  ['truncated major header', { signatureValid: true, major: 2, size: 63, spriteCount: 0, paletteCount: 0 }]
]) {
  let injectedReads = 0;
  const rejected = loadGlyphCatalog(path.join(root, 'chars/Ryu/Ryu.def'), { archiveInfo: () => info, readArchive: () => { injectedReads += 1; return { sprites: [] }; } });
  assert.strictEqual(injectedReads, 0, `${label} is rejected before the injected full reader`);
  assert(rejected.entries.every(item => /supported SFF major/.test(item.reason || '')), `${label} produces truthful unresolved entries`);
}

fs.rmSync(root, { recursive: true, force: true });
console.log('Movelist glyph model tests passed');
