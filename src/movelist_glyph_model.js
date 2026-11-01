'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parseDef, sections, value, unquote, integerTuple } = require('./def_model');
const { parseSffBuffer, spriteDataUri } = require('./sff_reader');

const catalogCache = new Map();
const GLYPH_LIMITS = Object.freeze({
  textBytes: 1024 * 1024,
  mappingRows: 4096,
  tokenBytes: 256,
  mappingBytes: 1024 * 1024,
  archiveBytes: 64 * 1024 * 1024,
  archiveSprites: 16384,
  archivePalettes: 4096,
  spriteDimension: 4096,
  spritePixels: 4 * 1024 * 1024,
  decodedPixels: 16 * 1024 * 1024,
  previewBytes: 8 * 1024 * 1024
});

function byteLength(value) { return Buffer.byteLength(String(value ?? ''), 'utf8'); }
function injectedFileInfo(filename, options = {}) {
  if (options.stat) return options.stat(filename);
  if (options.readText || options.readArchive || options.exists) return null;
  return fs.statSync(filename);
}
function boundedText(filename, options = {}) {
  const limit = Number.isInteger(options.maxTextBytes) ? options.maxTextBytes : GLYPH_LIMITS.textBytes;
  const info = injectedFileInfo(filename, options);
  if (info && (!info.isFile?.() || info.size > limit)) throw new Error(`${path.basename(filename)} is not a regular text file of at most ${Math.floor(limit / 1024)} KiB.`);
  const text = (options.readText || (file => fs.readFileSync(file, 'utf8')))(filename);
  if (byteLength(text) > limit) throw new Error(`${path.basename(filename)} exceeds the ${Math.floor(limit / 1024)} KiB glyph-source limit.`);
  return text;
}
function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function preflightSffBuffer(buffer, filename, limits = GLYPH_LIMITS) {
  if (!Buffer.isBuffer(buffer) || buffer.length > limits.archiveBytes) throw new Error(`${path.basename(filename)} exceeds the ${Math.floor(limits.archiveBytes / (1024 * 1024))} MiB glyph-SFF limit.`);
  if (buffer.length < 16 || buffer.subarray(0, 12).toString('latin1') !== 'ElecbyteSpr\0') throw new Error('Unrecognized glyph SFF signature.');
  const major = buffer[15]; let spriteCount = 0, paletteCount = 0;
  if (major === 1) { if (buffer.length < 32) throw new Error('Glyph SFF v1 header is truncated.'); spriteCount = buffer.readUInt32LE(20); }
  else if (major === 2) { if (buffer.length < 64) throw new Error('Glyph SFF v2 header is truncated.'); spriteCount = buffer.readUInt32LE(40); paletteCount = buffer.readUInt32LE(48); }
  else throw new Error(`Glyph SFF v${major} is not supported.`);
  if (spriteCount > limits.archiveSprites || paletteCount > limits.archivePalettes) throw new Error(`Glyph SFF declares more than ${limits.archiveSprites.toLocaleString()} sprites or ${limits.archivePalettes.toLocaleString()} palettes.`);
  return { spriteCount, paletteCount, bytes: buffer.length, major };
}
function validateInjectedArchiveInfo(info, filename, limits = GLYPH_LIMITS) {
  if (!info || info.signatureValid !== true || ![1, 2].includes(info.major) || !Number.isSafeInteger(info.size) || info.size < (info.major === 1 ? 32 : 64) || !Number.isSafeInteger(info.spriteCount) || info.spriteCount < 0 || !Number.isSafeInteger(info.paletteCount) || info.paletteCount < 0) throw new Error('Injected glyph archive readers require a supported SFF major plus nonnegative bounded byte, sprite, palette, and signature preflight evidence.');
  if (info.size > limits.archiveBytes) throw new Error(`${path.basename(filename)} exceeds the ${Math.floor(limits.archiveBytes / (1024 * 1024))} MiB glyph-SFF limit.`);
  if (info.spriteCount > limits.archiveSprites || info.paletteCount > limits.archivePalettes) throw new Error(`Glyph SFF declares more than ${limits.archiveSprites.toLocaleString()} sprites or ${limits.archivePalettes.toLocaleString()} palettes.`);
}

function glyphAssetAuthority(seed, options = {}) {
  const fileExists = options.exists || fs.existsSync, motifInfo = resolvedMotif(seed, options);
  if (motifInfo.state !== 'resolved') return { ...motifInfo, mappingFile: '', archiveFile: '', assignmentIdentity: '' };
  const baseFile = path.join(motifInfo.root, 'data', 'system.base.def'), configText = fileExists(motifInfo.config) ? boundedText(motifInfo.config, options) : '', motifText = boundedText(motifInfo.motif, options), baseText = fileExists(baseFile) ? boundedText(baseFile, options) : '';
  const motifDoc = parseDef(motifText, motifInfo.motif), baseDoc = baseText ? parseDef(baseText, baseFile) : null, motifEntries = glyphEntries(motifDoc), baseEntries = baseDoc ? glyphEntries(baseDoc) : [];
  const motifFiles = sections(motifDoc, 'Files')[0], baseFiles = baseDoc && sections(baseDoc, 'Files')[0], glyphReference = value(motifFiles, 'glyphs', '') || value(baseFiles, 'glyphs', 'glyphs.sff');
  const archiveFile = resolveMotifAsset(glyphReference, motifInfo.motif, motifInfo.root, fileExists), mappingFile = motifEntries.length ? motifInfo.motif : baseEntries.length ? baseFile : motifInfo.motif;
  const assignmentIdentity = hash(JSON.stringify({ root: path.resolve(motifInfo.root).toLowerCase(), config: path.resolve(motifInfo.config).toLowerCase(), configHash: hash(configText), motif: path.resolve(motifInfo.motif).toLowerCase(), motifHash: hash(motifText), baseFile: baseText ? path.resolve(baseFile).toLowerCase() : '', baseHash: hash(baseText), glyphReference, archiveFile: archiveFile ? path.resolve(archiveFile).toLowerCase() : '', mappingFile: path.resolve(mappingFile).toLowerCase() }));
  return { state: 'resolved', root: motifInfo.root, config: motifInfo.config, motif: motifInfo.motif, baseFile: baseText ? baseFile : '', mappingFile, glyphReference, archiveFile, assignmentIdentity };
}

function gameRoot(seed, fileExists = fs.existsSync) {
  let current = path.extname(seed || '') ? path.dirname(seed) : seed;
  for (let depth = 0; current && depth < 12; depth += 1) {
    if (fileExists(path.join(current, 'save', 'config.ini')) && fileExists(path.join(current, 'data'))) return current;
    if (fileExists(path.join(current, 'Ikemen_GO.exe'))) return current;
    const parent = path.dirname(current); if (parent === current) break; current = parent;
  }
  return '';
}

function firstExisting(candidates, fileExists = fs.existsSync) { return candidates.find((filename) => filename && fileExists(filename)) || ''; }

function resolvedMotif(seed, options = {}) {
  const fileExists = options.exists || fs.existsSync, readText = filename => boundedText(filename, options);
  const root = Object.prototype.hasOwnProperty.call(options, 'root') ? options.root : gameRoot(seed, fileExists);
  if (!root) return { state: 'unresolved', reason: 'No unambiguous IKEMEN game root could be resolved from this character.', root: '' };
  const config = path.join(root, 'save', 'config.ini'); let configured = '';
  if (fileExists(config)) {
    const document = parseDef(readText(config), config), section = sections(document, 'Config')[0];
    configured = section ? unquote(value(section, 'Motif', '')) : '';
  }
  const configuredPath = configured ? path.resolve(root, configured) : '';
  if (configured && !fileExists(configuredPath)) return { state: 'unresolved', reason: `Configured motif was not found: ${configured}`, root, config, configured };
  const motif = configuredPath || firstExisting([path.join(root, 'data', 'system.def'), path.join(root, 'data', 'ikemen1', 'system.def')], fileExists);
  if (!motif) return { state: 'unresolved', reason: configured ? `Configured motif was not found: ${configured}` : 'No configured motif system.def was found.', root, config, configured };
  return { state: 'resolved', root, config, configured, motif };
}

function resolveMotifAsset(reference, motif, root, fileExists = fs.existsSync) {
  const clean = unquote(reference);
  if (!clean) return '';
  return firstExisting([path.resolve(path.dirname(motif), clean), path.resolve(root, clean), path.resolve(root, 'data', clean)], fileExists);
}

function fileIdentity(filename, stat = fs.statSync) {
  if (!filename) return 'missing';
  try { const info = stat(filename); return `${path.resolve(filename).toLowerCase()}:${info.size}:${info.mtimeMs}`; }
  catch (_) { return `${path.resolve(filename).toLowerCase()}:missing`; }
}

function commentLabel(raw, fallback) {
  const index = String(raw || '').indexOf(';');
  return index >= 0 && raw.slice(index + 1).trim() ? raw.slice(index + 1).trim() : fallback;
}

function glyphEntries(document, limits = GLYPH_LIMITS) {
  const section = sections(document, 'Glyphs')[0]; if (!section) return [];
  const later = document.sections.find((candidate) => candidate.line > section.line), end = later ? later.line : document.lines.length;
  const result = []; let mappingBytes = 0;
  for (let line = section.line + 1; line < end; line += 1) {
    const raw = document.lines[line], match = raw.match(/^\s*(?:"([^"]+)"|([^=;]+?))\s*=\s*([^;]+?)(?:\s*;.*)?$/);
    if (!match) continue;
    const token = (match[1] || match[2] || '').trim();
    if (!token) continue;
    if (result.length >= limits.mappingRows) throw new Error(`[Glyphs] exceeds the ${limits.mappingRows.toLocaleString()}-row mapping limit.`);
    if (byteLength(token) > limits.tokenBytes) throw new Error(`A [Glyphs] token exceeds the ${limits.tokenBytes}-byte limit.`);
    mappingBytes += byteLength(raw);
    if (mappingBytes > limits.mappingBytes) throw new Error(`[Glyphs] mappings exceed the ${Math.floor(limits.mappingBytes / 1024)} KiB limit.`);
    result.push({ token, sprite: integerTuple(match[3], 2, 0), label: commentLabel(raw, token), source: document.filename, line });
  }
  return result;
}

function loadGlyphCatalog(seed, options = {}) {
  const fileExists = options.exists || fs.existsSync, readText = filename => boundedText(filename, options), limits = { ...GLYPH_LIMITS, ...(options.limits || {}) };
  const motifInfo = resolvedMotif(seed, options); if (motifInfo.state !== 'resolved') return { ...motifInfo, entries: [], tokens: [] };
  const baseFile = path.join(motifInfo.root, 'data', 'system.base.def'), motifDoc = parseDef(readText(motifInfo.motif), motifInfo.motif);
  const baseDoc = fileExists(baseFile) ? parseDef(readText(baseFile), baseFile) : null;
  const merged = new Map(), baseEntries = baseDoc ? glyphEntries(baseDoc, limits) : [], motifEntries = glyphEntries(motifDoc, limits);
  for (const item of baseEntries) merged.set(item.token, { ...item, inherited: true });
  for (const item of motifEntries) merged.set(item.token, { ...item, inherited: false });
  const mappingFile = motifEntries.length ? motifInfo.motif : baseEntries.length ? baseFile : motifInfo.motif;
  const motifFiles = sections(motifDoc, 'Files')[0], baseFiles = baseDoc && sections(baseDoc, 'Files')[0];
  const glyphReference = value(motifFiles, 'glyphs', '') || value(baseFiles, 'glyphs', 'glyphs.sff');
  const archiveFile = resolveMotifAsset(glyphReference, motifInfo.motif, motifInfo.root, fileExists);
  const canCache = !options.readText && !options.readArchive && !options.readFile && !options.parseArchive && !options.archiveInfo && !options.spriteUri && !options.exists && !options.stat && !options.limits;
  const cacheKey = canCache ? [fileIdentity(motifInfo.motif), fileIdentity(baseDoc ? baseFile : ''), fileIdentity(archiveFile)].join('|') : '';
  if (cacheKey && catalogCache.has(cacheKey)) return catalogCache.get(cacheKey);
  let archive = null, archiveError = '';
  if (archiveFile) try {
    const info = injectedFileInfo(archiveFile, options);
    if (info && (!info.isFile?.() || info.size > limits.archiveBytes)) throw new Error(`${path.basename(archiveFile)} is not a regular SFF file of at most ${Math.floor(limits.archiveBytes / (1024 * 1024))} MiB.`);
    if (options.readArchive) { validateInjectedArchiveInfo(options.archiveInfo?.(archiveFile), archiveFile, limits); archive = options.readArchive(archiveFile); }
    else {
      const buffer = (options.readFile || fs.readFileSync)(archiveFile);
      preflightSffBuffer(buffer, archiveFile, limits);
      archive = (options.parseArchive || parseSffBuffer)(buffer, archiveFile);
    }
    if (!archive || !Array.isArray(archive.sprites) || archive.sprites.length > limits.archiveSprites || (archive.palettes !== undefined && (!Array.isArray(archive.palettes) || archive.palettes.length > limits.archivePalettes))) throw new Error(`Glyph SFF contains more than ${limits.archiveSprites.toLocaleString()} sprites / ${limits.archivePalettes.toLocaleString()} palettes or has an invalid entry table.`);
  } catch (error) { archiveError = error.message; }
  const bySprite = archive ? new Map(archive.sprites.map((sprite) => [`${sprite.group},${sprite.number}`, sprite])) : new Map();
  const makeUri = options.spriteUri || spriteDataUri;
  const uriCache = new Map(), maxDecodedSprites = Number.isInteger(options.maxDecodedSprites) ? Math.max(0, options.maxDecodedSprites) : 128; let decodedPixels = 0, publicPreviewBytes = 0;
  const entries = [...merged.values()].map((item) => {
    const spriteKey = item.sprite.join(','), sprite = bySprite.get(spriteKey);
    if (archiveError) return { ...item, state: 'unresolved', reason: `Glyph archive preview could not be decoded: ${archiveError}` };
    if (!archiveFile) return { ...item, state: 'unresolved', reason: `Glyph archive ${glyphReference} was not found.` };
    if (!sprite) return { ...item, state: 'unresolved', reason: `Sprite ${item.sprite.join(',')} is missing from ${path.basename(archiveFile)}.` };
    if (!uriCache.has(spriteKey) && uriCache.size >= maxDecodedSprites) return { ...item, state: 'unresolved', reason: `Preview decode budget (${maxDecodedSprites} unique sprites) was reached. The source token remains editable.` };
    try {
      if (!uriCache.has(spriteKey)) {
        const width = Number(sprite.width), height = Number(sprite.height), pixels = width * height;
        if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || width > limits.spriteDimension || height > limits.spriteDimension || pixels > limits.spritePixels || decodedPixels + pixels > limits.decodedPixels) throw new Error('Glyph preview dimensions exceed the safe decode budget. The source token remains editable.');
        const uri = String(makeUri(archive, sprite) || ''), uriBytes = byteLength(uri);
        if (!uri.startsWith('data:image/png;base64,') || uriBytes > limits.previewBytes) throw new Error('Glyph preview payload exceeds the safe display budget. The source token remains editable.');
        decodedPixels += pixels; uriCache.set(spriteKey, uri);
      }
      const uri = uriCache.get(spriteKey), emittedBytes = byteLength(uri);
      if (publicPreviewBytes + emittedBytes > limits.previewBytes) throw new Error('Glyph preview payload exceeds the safe display budget. The source token remains editable.');
      publicPreviewBytes += emittedBytes;
      return { ...item, state: 'ready', src: uri, width: sprite.width, height: sprite.height };
    }
    catch (error) { return { ...item, state: 'unresolved', reason: error.message }; }
  });
  const result = {
    state: entries.some((item) => item.state === 'ready') ? 'ready' : 'unresolved', root: motifInfo.root, config: motifInfo.config,
    motif: motifInfo.motif, configured: motifInfo.configured, baseFile: baseDoc ? baseFile : '', mappingFile, glyphReference, archiveFile,
    archiveError, entries, tokens: entries.map((item) => item.token).sort((a, b) => b.length - a.length || a.localeCompare(b))
  };
  if (cacheKey) {
    catalogCache.set(cacheKey, result);
    while (catalogCache.size > 8) catalogCache.delete(catalogCache.keys().next().value);
  }
  return result;
}

function glyphSegmentsCore(line, tokens) {
  const source = String(line || ''), ordered = [...new Set(tokens || [])].filter(Boolean).sort((a, b) => b.length - a.length || a.localeCompare(b));
  const protectedRanges = [];
  for (let start = source.indexOf('<'); start >= 0; start = source.indexOf('<', start + 1)) {
    let quote = '', end = start + 1;
    for (; end < source.length; end += 1) {
      const character = source[end];
      if (quote) { if (character === quote && source[end - 1] !== '\\') quote = ''; continue; }
      if (character === '"' || character === "'") { quote = character; continue; }
      if (character === '>') { end += 1; break; }
    }
    protectedRanges.push([start, Math.min(end, source.length)]);
    start = Math.max(start, end - 1);
  }
  for (let start = 0; start < source.length; start += 1) {
    const existing = protectedRanges.find((range) => start >= range[0] && start < range[1]);
    if (existing) { start = existing[1] - 1; continue; }
    const quote = source[start]; if (quote !== '"' && quote !== "'") continue;
    let end = start + 1;
    for (; end < source.length; end += 1) {
      if (source[end] !== quote) continue;
      let slashes = 0; for (let at = end - 1; at > start && source[at] === '\\'; at -= 1) slashes += 1;
      if (slashes % 2 === 0) { end += 1; break; }
    }
    protectedRanges.push([start, Math.min(end, source.length)]); start = Math.max(start, end - 1);
  }
  protectedRanges.sort((a, b) => a[0] - b[0]);
  const protectedAt = at => protectedRanges.find((range) => at >= range[0] && at < range[1]);
  let commentAt = -1; for (let at = source.indexOf(';'); at >= 0; at = source.indexOf(';', at + 1)) if (!protectedAt(at)) { commentAt = at; break; }
  const segments = []; let textStart = 0, index = 0;
  const prefix = value => value === '_' || value === '^' || value === '~';
  const tokenAt = at => ordered.find((candidate) => source.startsWith(candidate, at) && !/[A-Za-z0-9]/.test(source[at + candidate.length] || ''));
  const unknownEnd = at => { let end = at + 1; while (end < source.length && /[A-Za-z0-9_^~]/.test(source[end])) end += 1; return end; };
  while (index < source.length) {
    const protectedRange = protectedAt(index); if (protectedRange) { index = protectedRange[1]; continue; }
    if (commentAt >= 0 && index >= commentAt) break;
    const loadedAtStart = tokenAt(index);
    if ((!loadedAtStart && !prefix(source[index])) || /[A-Za-z0-9]/.test(source[index - 1] || '')) { index += 1; continue; }
    const chainStart = index, glyphs = []; let cursor = index, invalidEnd = -1;
    while (cursor < source.length) {
      const token = tokenAt(cursor);
      if (!token) {
        if (!prefix(source[cursor])) break;
        if (source[cursor] === '_' && !/[A-Za-z0-9_^~]/.test(source[cursor + 1] || '')) break;
        invalidEnd = unknownEnd(cursor); break;
      }
      let end = cursor + token.length;
      if (source[end] === '_' && !tokenAt(end) && !/[A-Za-z0-9_^~]/.test(source[end + 1] || '')) end += 1;
      glyphs.push({ kind: 'glyph', token, raw: source.slice(cursor, end), start: cursor, end });
      cursor = end;
      if (!tokenAt(cursor) && !prefix(source[cursor])) break;
    }
    if (invalidEnd >= 0) {
      if (textStart < chainStart) segments.push({ kind: 'text', raw: source.slice(textStart, chainStart), start: textStart, end: chainStart });
      segments.push({ kind: 'unknown', raw: source.slice(chainStart, invalidEnd), token: source.slice(chainStart, invalidEnd), start: chainStart, end: invalidEnd });
      index = invalidEnd; textStart = index; continue;
    }
    if (!glyphs.length) { index += 1; continue; }
    if (textStart < chainStart) segments.push({ kind: 'text', raw: source.slice(textStart, chainStart), start: textStart, end: chainStart });
    segments.push(...glyphs); index = cursor; textStart = cursor;
  }
  if (textStart < source.length || !segments.length) segments.push({ kind: 'text', raw: source.slice(textStart), start: textStart, end: source.length });
  return segments;
}

function movelistColorTags(line) {
  const source = String(line || ''), tags = [];
  for (const match of source.matchAll(/<#([0-9a-f]{6})>/gi)) {
    const hex = match[1].toLowerCase();
    tags.push({ index: tags.length, start: match.index, end: match.index + match[0].length, raw: match[0], hex, red: parseInt(hex.slice(0, 2), 16), green: parseInt(hex.slice(2, 4), 16), blue: parseInt(hex.slice(4, 6), 16) });
  }
  return tags;
}

function replaceMovelistColorTag(line, tagIndex, color) {
  const source = String(line || ''), tags = movelistColorTags(source), tag = tags[Number(tagIndex)], match = String(color || '').trim().match(/^#?([0-9a-f]{6})$/i);
  if (!tag || !match) return source;
  return source.slice(0, tag.start) + `<#${match[1].toLowerCase()}>` + source.slice(tag.end);
}

function movelistVisualSegments(line, tokens) {
  const output = []; let color = '';
  for (const part of glyphSegmentsCore(line, tokens)) {
    if (part.kind !== 'text') { output.push({ ...part, color }); continue; }
    let cursor = 0;
    for (const match of part.raw.matchAll(/<#([0-9a-f]{6})>|<\/>/gi)) {
      if (match.index > cursor) output.push({ kind: 'text', raw: part.raw.slice(cursor, match.index), color, start: part.start + cursor, end: part.start + match.index });
      if (match[1]) { color = `#${match[1].toLowerCase()}`; output.push({ kind: 'color-open', raw: match[0], color, start: part.start + match.index, end: part.start + match.index + match[0].length }); }
      else { output.push({ kind: 'color-close', raw: match[0], color: '', start: part.start + match.index, end: part.start + match.index + match[0].length }); color = ''; }
      cursor = match.index + match[0].length;
    }
    if (cursor < part.raw.length) output.push({ kind: 'text', raw: part.raw.slice(cursor), color, start: part.start + cursor, end: part.end });
  }
  return output;
}

function glyphSegments(line, tokens) { return glyphSegmentsCore(line, tokens); }

function glyphWarnings(text, catalog = {}) {
  if (catalog.state === 'unresolved' && !(catalog.entries || []).length) return [{ kind: 'preview-context', line: 0, start: 0, end: 0, token: '', message: catalog.reason || catalog.archiveError || 'Glyph preview context is unresolved. This does not prove the movelist contains a missing engine glyph.' }];
  const known = new Map((catalog.entries || []).map((item) => [item.token, item])), tokens = [...known.keys()], issues = [], lines = String(text || '').split(/\r\n|\r|\n/);
  lines.forEach((line, lineIndex) => {
    for (const segment of glyphSegmentsCore(line, tokens)) {
      if (segment.kind === 'text') continue;
      const item = segment.kind === 'glyph' ? known.get(segment.token) : null;
      if (item?.state === 'ready') continue;
      let kind = 'unmapped-token', message = `${segment.token} is not mapped by the resolved [Glyphs] table. IKEMEN may stop loading later movelist content when a referenced glyph is missing.`;
      if (item) {
        if (/sprite .* missing/i.test(item.reason || '')) { kind = 'missing-sprite'; message = `${segment.token} maps to missing sprite ${(item.sprite || []).join(',')}. IKEMEN may stop loading later movelist content.`; }
        else if (/archive .* was not found/i.test(item.reason || '')) { kind = 'missing-archive'; message = `${segment.token} is mapped, but glyph archive ${catalog.glyphReference || ''} is missing. IKEMEN may stop loading movelist content.`; }
        else { kind = 'preview-unavailable'; message = `${segment.token} is mapped, but its preview is unavailable: ${item.reason || 'unknown preview failure'}. This does not by itself prove an engine loading failure.`; }
      }
      issues.push({ kind, line: lineIndex, start: segment.start, end: segment.end, token: segment.token, message });
    }
  });
  return issues;
}

function editGlyph(line, tokens, operation, glyphIndex, token = '') {
  const segments = glyphSegments(line, tokens), positions = segments.map((item, index) => item.kind === 'glyph' ? index : -1).filter((index) => index >= 0);
  const selected = Math.max(0, Math.min(Number(glyphIndex) || 0, Math.max(positions.length - 1, 0))), clean = String(token || '');
  if (!positions.length) {
    if (operation === 'insertBefore' || operation === 'insertAfter' || operation === 'append') {
      if (segments.length === 1 && segments[0].kind === 'text' && /[A-Za-z0-9]$/.test(segments[0].raw)) segments[0].raw += ' ';
      segments.push({ kind: 'glyph', raw: clean, token: clean });
    }
  } else if (operation === 'insertBefore') segments.splice(positions[selected], 0, { kind: 'glyph', raw: clean, token: clean });
  else if (operation === 'insertAfter') segments.splice(positions[selected] + 1, 0, { kind: 'glyph', raw: clean, token: clean });
  else if (operation === 'duplicate') segments.splice(positions[selected] + 1, 0, { ...segments[positions[selected]] });
  else if (operation === 'append') segments.push({ kind: 'glyph', raw: clean, token: clean });
  else if (operation === 'replace') segments[positions[selected]] = { kind: 'glyph', raw: clean, token: clean };
  else if (operation === 'remove') segments.splice(positions[selected], 1);
  else if (operation === 'moveLeft' && selected > 0) [segments[positions[selected - 1]].raw, segments[positions[selected]].raw] = [segments[positions[selected]].raw, segments[positions[selected - 1]].raw];
  else if (operation === 'moveRight' && selected < positions.length - 1) [segments[positions[selected]].raw, segments[positions[selected + 1]].raw] = [segments[positions[selected + 1]].raw, segments[positions[selected]].raw];
  else if ((operation === 'moveFirst' && selected > 0) || (operation === 'moveLast' && selected < positions.length - 1)) {
    const values = positions.map(position => segments[position].raw), [moved] = values.splice(selected, 1);
    values.splice(operation === 'moveFirst' ? 0 : values.length, 0, moved);
    positions.forEach((position, index) => { segments[position].raw = values[index]; });
  }
  return segments.map((item) => item.raw).join('');
}

function movelistLineRecords(text) {
  const source = String(text ?? ''), records = []; let at = 0;
  for (const match of source.matchAll(/\r\n|\r|\n/g)) {
    records.push({ body: source.slice(at, match.index), eol: match[0] });
    at = match.index + match[0].length;
  }
  records.push({ body: source.slice(at), eol: '' });
  return records;
}

function movelistLiteralMatches(text, query, caseSensitive = false) {
  const source = String(text ?? ''), needle = String(query ?? '');
  if (!needle) return [];
  const foldedNeedle = caseSensitive ? needle : needle.toLowerCase(), matches = []; let absolute = 0;
  for (const [line, record] of movelistLineRecords(source).entries()) {
    for (let start = 0; start <= record.body.length - needle.length;) {
      const candidate = record.body.slice(start, start + needle.length), equal = (caseSensitive ? candidate : candidate.toLowerCase()) === foldedNeedle;
      if (equal) { matches.push({ line, start, end: start + needle.length, absoluteStart: absolute + start, absoluteEnd: absolute + start + needle.length }); start += Math.max(needle.length, 1); }
      else start += 1;
    }
    absolute += record.body.length + record.eol.length;
  }
  return matches;
}

function replaceMovelistLiteral(text, query, replacement, options = {}) {
  const source = String(text ?? ''), matches = movelistLiteralMatches(source, query, Boolean(options.caseSensitive));
  const selected = Number.isInteger(options.line)
    ? matches.filter(match => match.line === options.line)
    : options.all
      ? matches
      : Number.isInteger(options.index) && options.index >= 0 && options.index < matches.length
        ? [matches[options.index]]
        : [];
  let next = source;
  for (const match of [...selected].reverse()) next = next.slice(0, match.absoluteStart) + String(replacement ?? '') + next.slice(match.absoluteEnd);
  return { text: next, count: selected.length, total: matches.length, matches };
}

function replaceMovelistGlyphToken(text, fromToken, toToken, tokens, options = {}) {
  const source = String(text ?? ''), from = String(fromToken || ''), to = String(toToken || '');
  const known = [...new Set(tokens || [])].filter(Boolean);
  if (!from || !to || from === to || !known.includes(from) || !known.includes(to)) return { text: source, count: 0, lines: [] };
  const records = movelistLineRecords(source), changedLines = [], onlyLine = Number.isInteger(options.line) ? options.line : -1; let count = 0;
  for (const [line, record] of records.entries()) {
    if (onlyLine >= 0 && line !== onlyLine) continue;
    const segments = glyphSegmentsCore(record.body, known); let changed = false;
    for (const segment of segments) {
      if (segment.kind !== 'glyph' || segment.token !== from) continue;
      segment.raw = to; segment.token = to; count += 1; changed = true;
    }
    if (changed) { record.body = segments.map(segment => segment.raw).join(''); changedLines.push(line); }
  }
  return { text: records.map(record => record.body + record.eol).join(''), count, lines: changedLines };
}

function movelistGlyphOccurrences(text, token, tokens) {
  const wanted = String(token || ''), known = [...new Set(tokens || [])].filter(Boolean), occurrences = [];
  if (!wanted || !known.includes(wanted)) return occurrences;
  for (const [line, record] of movelistLineRecords(text).entries()) {
    let glyph = 0;
    for (const segment of glyphSegmentsCore(record.body, known)) {
      if (segment.kind !== 'glyph') continue;
      if (segment.token === wanted) occurrences.push({ line, glyph, start: segment.start, end: segment.end, token: segment.token });
      glyph += 1;
    }
  }
  return occurrences;
}

function editMovelistLines(text, operation, lineIndex, fallbackEol = '\n', lineBody = '') {
  const records = movelistLineRecords(text), selected = Math.max(0, Math.min(Number(lineIndex) || 0, records.length - 1));
  const localEol = records[selected].eol || records[selected - 1]?.eol || records[selected + 1]?.eol || (fallbackEol === '\r\n' || fallbackEol === '\r' ? fallbackEol : '\n');
  if (operation === 'moveUp' && selected > 0) [records[selected - 1].body, records[selected].body] = [records[selected].body, records[selected - 1].body];
  else if (operation === 'moveDown' && selected < records.length - 1) [records[selected].body, records[selected + 1].body] = [records[selected + 1].body, records[selected].body];
  else if ((operation === 'moveFirst' && selected > 0) || (operation === 'moveLast' && selected < records.length - 1)) {
    const bodies = records.map(record => record.body), [moved] = bodies.splice(selected, 1);
    bodies.splice(operation === 'moveFirst' ? 0 : bodies.length, 0, moved);
    records.forEach((record, position) => { record.body = bodies[position]; });
  }
  else if (operation === 'insertBefore' || operation === 'pasteBefore') records.splice(selected, 0, { body: operation === 'pasteBefore' ? String(lineBody) : '', eol: localEol });
  else if (operation === 'insertAfter' || operation === 'duplicate' || operation === 'pasteAfter') {
    const body = operation === 'duplicate' ? records[selected].body : operation === 'pasteAfter' ? String(lineBody) : '';
    if (!records[selected].eol) records[selected].eol = localEol;
    records.splice(selected + 1, 0, { body, eol: selected + 1 === records.length ? '' : localEol });
  } else if (operation === 'remove') {
    if (records.length === 1) return '';
    const removedFinal = selected === records.length - 1 && !records[selected].eol;
    records.splice(selected, 1);
    if (removedFinal && records.length) records[records.length - 1].eol = '';
  }
  return records.map((item) => item.body + item.eol).join('');
}

module.exports = { GLYPH_LIMITS, gameRoot, resolvedMotif, resolveMotifAsset, glyphEntries, glyphAssetAuthority, preflightSffBuffer, loadGlyphCatalog, glyphSegmentsCore, glyphSegments, glyphWarnings, editGlyph, movelistColorTags, replaceMovelistColorTag, movelistVisualSegments, movelistLineRecords, movelistLiteralMatches, replaceMovelistLiteral, replaceMovelistGlyphToken, movelistGlyphOccurrences, editMovelistLines, fileIdentity };
