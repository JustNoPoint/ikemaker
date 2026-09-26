'use strict';

const fs = require('fs');
const path = require('path');
const { parseDef, sections, value, unquote, integerTuple } = require('./def_model');
const { readSff, spriteDataUri } = require('./sff_reader');

const catalogCache = new Map();

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
  const fileExists = options.exists || fs.existsSync, readText = options.readText || (filename => fs.readFileSync(filename, 'utf8'));
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

function glyphEntries(document) {
  const section = sections(document, 'Glyphs')[0]; if (!section) return [];
  const later = document.sections.find((candidate) => candidate.line > section.line), end = later ? later.line : document.lines.length;
  const result = [];
  for (let line = section.line + 1; line < end; line += 1) {
    const raw = document.lines[line], match = raw.match(/^\s*(?:"([^"]+)"|([^=;]+?))\s*=\s*([^;]+?)(?:\s*;.*)?$/);
    if (!match) continue;
    const token = (match[1] || match[2] || '').trim();
    if (token) result.push({ token, sprite: integerTuple(match[3], 2, 0), label: commentLabel(raw, token), source: document.filename, line });
  }
  return result;
}

function loadGlyphCatalog(seed, options = {}) {
  const fileExists = options.exists || fs.existsSync, readText = options.readText || (filename => fs.readFileSync(filename, 'utf8'));
  const motifInfo = resolvedMotif(seed, options); if (motifInfo.state !== 'resolved') return { ...motifInfo, entries: [], tokens: [] };
  const baseFile = path.join(motifInfo.root, 'data', 'system.base.def'), motifDoc = parseDef(readText(motifInfo.motif), motifInfo.motif);
  const baseDoc = fileExists(baseFile) ? parseDef(readText(baseFile), baseFile) : null;
  const merged = new Map();
  if (baseDoc) for (const item of glyphEntries(baseDoc)) merged.set(item.token, { ...item, inherited: true });
  for (const item of glyphEntries(motifDoc)) merged.set(item.token, { ...item, inherited: false });
  const motifFiles = sections(motifDoc, 'Files')[0], baseFiles = baseDoc && sections(baseDoc, 'Files')[0];
  const glyphReference = value(motifFiles, 'glyphs', '') || value(baseFiles, 'glyphs', 'glyphs.sff');
  const archiveFile = resolveMotifAsset(glyphReference, motifInfo.motif, motifInfo.root, fileExists);
  const canCache = !options.readText && !options.readArchive && !options.spriteUri && !options.exists && !options.stat;
  const cacheKey = canCache ? [fileIdentity(motifInfo.motif), fileIdentity(baseDoc ? baseFile : ''), fileIdentity(archiveFile)].join('|') : '';
  if (cacheKey && catalogCache.has(cacheKey)) return catalogCache.get(cacheKey);
  let archive = null, archiveError = '';
  if (archiveFile) try { archive = (options.readArchive || readSff)(archiveFile); } catch (error) { archiveError = error.message; }
  const bySprite = archive ? new Map(archive.sprites.map((sprite) => [`${sprite.group},${sprite.number}`, sprite])) : new Map();
  const makeUri = options.spriteUri || spriteDataUri;
  const uriCache = new Map(), maxDecodedSprites = Number.isInteger(options.maxDecodedSprites) ? Math.max(0, options.maxDecodedSprites) : 128;
  const entries = [...merged.values()].map((item) => {
    const spriteKey = item.sprite.join(','), sprite = bySprite.get(spriteKey);
    if (archiveError) return { ...item, state: 'unresolved', reason: `Glyph archive preview could not be decoded: ${archiveError}` };
    if (!archiveFile) return { ...item, state: 'unresolved', reason: `Glyph archive ${glyphReference} was not found.` };
    if (!sprite) return { ...item, state: 'unresolved', reason: `Sprite ${item.sprite.join(',')} is missing from ${path.basename(archiveFile)}.` };
    if (!uriCache.has(spriteKey) && uriCache.size >= maxDecodedSprites) return { ...item, state: 'unresolved', reason: `Preview decode budget (${maxDecodedSprites} unique sprites) was reached. The source token remains editable.` };
    try {
      if (!uriCache.has(spriteKey)) uriCache.set(spriteKey, makeUri(archive, sprite));
      return { ...item, state: 'ready', src: uriCache.get(spriteKey), width: sprite.width, height: sprite.height };
    }
    catch (error) { return { ...item, state: 'unresolved', reason: error.message }; }
  });
  const result = {
    state: entries.some((item) => item.state === 'ready') ? 'ready' : 'unresolved', root: motifInfo.root, config: motifInfo.config,
    motif: motifInfo.motif, configured: motifInfo.configured, baseFile: baseDoc ? baseFile : '', glyphReference, archiveFile,
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
  const protectedRanges = []; const pattern = /<[^>]*>/g; let match;
  while ((match = pattern.exec(source))) protectedRanges.push([match.index, match.index + match[0].length]);
  const lastOpen = source.lastIndexOf('<'), lastClose = source.lastIndexOf('>');
  if (lastOpen > lastClose) protectedRanges.push([lastOpen, source.length]);
  const commentAt = source.indexOf(';'), segments = []; let textStart = 0, index = 0;
  const protectedAt = at => protectedRanges.find((range) => at >= range[0] && at < range[1]);
  const prefix = value => value === '_' || value === '^' || value === '~';
  const tokenAt = at => ordered.find((candidate) => source.startsWith(candidate, at) && !/[A-Za-z0-9]/.test(source[at + candidate.length] || ''));
  const unknownEnd = at => { let end = at + 1; while (end < source.length && /[A-Za-z0-9_^~]/.test(source[end])) end += 1; return end; };
  while (index < source.length) {
    const protectedRange = protectedAt(index); if (protectedRange) { index = protectedRange[1]; continue; }
    if (commentAt >= 0 && index >= commentAt) break;
    if (!prefix(source[index]) || /[A-Za-z0-9]/.test(source[index - 1] || '')) { index += 1; continue; }
    const chainStart = index, glyphs = []; let cursor = index, invalidEnd = -1;
    while (prefix(source[cursor])) {
      const token = tokenAt(cursor);
      if (!token) {
        if (source[cursor] === '_' && !/[A-Za-z0-9_^~]/.test(source[cursor + 1] || '')) break;
        invalidEnd = unknownEnd(cursor); break;
      }
      glyphs.push({ kind: 'glyph', token, raw: token, start: cursor, end: cursor + token.length });
      cursor += token.length;
      if (!prefix(source[cursor])) break;
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
  else if (operation === 'append') segments.push({ kind: 'glyph', raw: clean, token: clean });
  else if (operation === 'replace') segments[positions[selected]] = { kind: 'glyph', raw: clean, token: clean };
  else if (operation === 'remove') segments.splice(positions[selected], 1);
  else if (operation === 'moveLeft' && selected > 0) [segments[positions[selected - 1]].raw, segments[positions[selected]].raw] = [segments[positions[selected]].raw, segments[positions[selected - 1]].raw];
  else if (operation === 'moveRight' && selected < positions.length - 1) [segments[positions[selected]].raw, segments[positions[selected + 1]].raw] = [segments[positions[selected + 1]].raw, segments[positions[selected]].raw];
  return segments.map((item) => item.raw).join('');
}

module.exports = { gameRoot, resolvedMotif, resolveMotifAsset, glyphEntries, loadGlyphCatalog, glyphSegmentsCore, glyphSegments, glyphWarnings, editGlyph, fileIdentity };
