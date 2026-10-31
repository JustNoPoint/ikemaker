'use strict';

const fs = require('fs');
const path = require('path');
const { parseAir } = require('./air_preview_model');
const { references, mask } = require('./viewer_used_by_model');
const { textGrammar } = require('./map_registry_grammar');

function normalized(filename) { return filename ? path.resolve(filename).toLowerCase() : ''; }
function identity(kind, group, number) { return kind === 'air' ? String(group) : `${group},${number}`; }

function parsedReference(item) {
  const expression = String(item.expression || '').trim();
  const match = item.kind === 'air'
    ? /^([A-Za-z_]*)(-?\d+)$/.exec(expression)
    : /^([A-Za-z_]*)(-?\d+)\s*,\s*(-?\d+)$/.exec(expression);
  if (!match) return null;
  const authoredPrefix = match[1] || '', prefix = authoredPrefix.toLowerCase();
  return { expression, authoredPrefix, prefix, group: Number(match[2]), number: item.kind === 'air' ? undefined : Number(match[3]) };
}

function literalAssetReferences(text, filename = 'source.zss') {
  // The established reference scanner selects comment rules from the suffix.
  // Explicitly classified custom-text ZSS sources must use ZSS rules too.
  const scanName = /\.zss$/i.test(filename) ? filename : `${filename}.zss`, original = String(text || '');
  const lines = original.split(/\r?\n/), masked = mask(original, true).split(/\r?\n/).map(line => {
    const comment = line.indexOf('#'); return comment < 0 ? line : line.slice(0, comment) + ' '.repeat(line.length - comment);
  }).join('\n'), result = [];
  for (const item of references(masked, scanName)) {
    const expression = String(item.expression || '').trim();
    if (item.kind === 'air') {
      if (item.defaultPrefix || !/^-?\d+$/.test(expression)) continue;
      const source = lines[item.line] || '', character = Math.max(0, source.indexOf(expression));
      result.push({ kind: 'air', group: Number(expression), number: undefined, line: item.line, character, length: expression.length, expression, source });
      continue;
    }
    if (!['snd', 'sff'].includes(item.kind)) continue;
    const match = /^([A-Za-z_]*)\s*(-?\d+)\s*,\s*(-?\d+)$/.exec(expression);
    if (!match) continue;
    const prefix = match[1].toLowerCase();
    // S explicitly selects the character archive. An unprefixed field selects
    // it only when that field does not carry the established common-FX default.
    if (prefix && prefix !== 's') continue;
    if (!prefix && item.defaultPrefix) continue;
    const source = lines[item.line] || '', character = Math.max(0, source.indexOf(expression));
    result.push({ kind: item.kind, group: Number(match[2]), number: Number(match[3]), line: item.line, character, length: expression.length, expression, source });
  }
  return result;
}

function literalSharedAssetReferences(text, filename = 'source.zss') {
  const scanName = /\.zss$/i.test(filename) ? filename : `${filename}.zss`, original = String(text || '');
  const lines = original.split(/\r?\n/), masked = mask(original, true).split(/\r?\n/).map(line => {
    const comment = line.indexOf('#'); return comment < 0 ? line : line.slice(0, comment) + ' '.repeat(line.length - comment);
  }).join('\n'), result = [];
  for (const item of references(masked, scanName)) {
    if (!['air', 'snd'].includes(item.kind)) continue;
    const parsed = parsedReference(item); if (!parsed) continue;
    if (parsed.group < 0 || (parsed.number !== undefined && parsed.number < 0)) continue;
    const selector = parsed.prefix || (item.defaultPrefix ? 'f' : '');
    if (!selector || selector === 's') continue;
    const source = lines[item.line] || '', character = Math.max(0, source.indexOf(parsed.expression));
    result.push({ kind: item.kind, group: parsed.group, number: parsed.number, selector, authoredPrefix: parsed.authoredPrefix, implicitDefault: !parsed.prefix && Boolean(item.defaultPrefix), line: item.line, character, length: parsed.expression.length, expression: parsed.expression, source });
  }
  return result;
}

function assetReferenceContext(text, filename, lineNumber, character) {
  const original = String(text || ''), lines = original.split(/\r?\n/), source = lines[lineNumber] || '';
  const scanName = /\.zss$/i.test(filename || '') ? filename : `${filename || 'source'}.zss`, prefixText = lines.slice(0, lineNumber + 1).join('\n');
  const masked = mask(prefixText, true).split(/\r?\n/).map(line => { const at = line.indexOf('#'); return at < 0 ? line : line.slice(0, at) + ' '.repeat(line.length - at); }).join('\n');
  const candidates = references(masked, scanName).filter(item => item.line === lineNumber);
  for (const item of candidates.reverse()) {
    const expression = String(item.expression || ''), start = source.lastIndexOf(expression, Math.max(0, Number(character) || 0));
    if (start < 0 || character < start || character > start + expression.length) continue;
    const beforeCursor = source.slice(start, character).trim();
    if (item.kind === 'air') {
      const match = /^([A-Za-z_]*)(-?\d*)$/.exec(beforeCursor.replace(/\s/g, ''));
      if (!match) continue;
      const typedPrefix = match[1] || '', folded = typedPrefix.toLowerCase();
      if (folded === 's' || (!folded && !item.defaultPrefix)) return { kind: 'air', start, end: start + expression.length, prefix: beforeCursor, ownership: 'character', explicitS: folded === 's' };
      return { kind: 'air', start, end: start + expression.length, prefix: beforeCursor, ownership: 'shared', selector: folded || 'f', typedPrefix, implicitDefault: !folded && Boolean(item.defaultPrefix) };
    }
    if (!['snd', 'sff'].includes(item.kind)) continue;
    const match = /^([A-Za-z_]*)\s*(-?\d*)\s*(?:,\s*(-?\d*)?)?$/.exec(beforeCursor);
    if (!match) continue;
    const typedPrefix = match[1] || '', folded = typedPrefix.toLowerCase();
    if (folded === 's' || (!folded && !item.defaultPrefix)) return { kind: item.kind, start, end: start + expression.length, prefix: beforeCursor, ownership: 'character', explicitS: folded === 's' };
    if (item.kind !== 'snd') continue;
    return { kind: item.kind, start, end: start + expression.length, prefix: beforeCursor, ownership: 'shared', selector: folded || 'f', typedPrefix, implicitDefault: !folded && Boolean(item.defaultPrefix) };
  }
  return null;
}

function kindModel(kind, filename, values, limitation = '') {
  const entries = values || [], ids = new Set(entries.map(item => identity(kind, item.group, item.number)));
  return { kind, filename: filename || '', complete: Boolean(filename) && !limitation, limitation, entries, ids };
}

async function buildZssAssetCatalog(vscode, seed, service = require('./map_registry_service').current(), adapters = {}) {
  const filename = seed?.fsPath || seed?.fileName || (typeof seed === 'string' ? seed : '') || '';
  if (!service) return { complete: false, owner: '', limitations: ['Project ownership service is unavailable.'], kinds: {} };
  const scope = service.scope(seed), limitations = [], open = new Map((vscode.workspace.textDocuments || []).filter(document => document.fileName).map(document => [normalized(document.fileName), document]));
  if (!scope?.def) limitations.push('No owning character DEF could be resolved.');
  const defDocument = scope?.def ? open.get(normalized(scope.def)) : null;
  if (defDocument?.isDirty) limitations.push('The owning character DEF has unsaved asset assignments.');
  const assigned = new Set((scope?.scopeFiles?.assigned || []).map(normalized)), currentDocument = open.get(normalized(filename));
  const currentIsZss = currentDocument?.languageId === 'zss' || /\.zss$/i.test(filename)
    || (currentDocument && textGrammar(currentDocument, service.context) === 'zss');
  if (filename && currentIsZss && !assigned.has(normalized(filename))) limitations.push('The current ZSS file is not assigned by the resolved character DEF.');
  let assets = {};
  if (scope?.def && !defDocument?.isDirty) {
    try {
      const defText = defDocument?.getText() ?? fs.readFileSync(scope.def, 'utf8');
      assets = (adapters.resolveAssigned || require('./related_work').resolveAssigned)(scope.def, defText) || {};
    } catch (error) { limitations.push(`The character DEF could not be read: ${error.message}`); }
  }
  const readText = async asset => {
    const document = open.get(normalized(asset)) || await vscode.workspace.openTextDocument(vscode.Uri.file(asset));
    return document.getText();
  };
  const load = async (kind, asset, reader, supportsUnsavedText = false) => {
    if (limitations.length) return kindModel(kind, asset, [], limitations.join(' '));
    if (!asset) return kindModel(kind, '', [], `No assigned ${kind.toUpperCase()} file was resolved.`);
    const assetDocument = open.get(normalized(asset));
    if (assetDocument?.isDirty && !supportsUnsavedText) return kindModel(kind, asset, [], `The assigned ${kind.toUpperCase()} has unsaved changes that its binary reader cannot verify.`);
    if (!open.has(normalized(asset)) && !fs.existsSync(asset) && !adapters.allowVirtualFiles) return kindModel(kind, asset, [], `The assigned ${kind.toUpperCase()} file is missing.`);
    try { return kindModel(kind, asset, await reader(asset)); }
    catch (error) { return kindModel(kind, asset, [], `The assigned ${kind.toUpperCase()} file could not be read: ${error.message}`); }
  };
  const air = await load('air', assets.air, async asset => parseAir(await readText(asset)).map(action => ({ group: action.number, number: undefined, line: Math.max(0, Number(action.line || 1) - 1), frames: action.frames.length })), true);
  const sff = await load('sff', assets.sff, async asset => (adapters.readSff || require('./sff_reader').readSff)(asset).sprites.map(sprite => ({ group: sprite.group, number: sprite.number })));
  const snd = await load('snd', assets.snd, async asset => (adapters.readSnd || require('./snd_reader').readSnd)(asset).entries.map(entry => ({ group: entry.group, number: entry.index })));
  const sharedLimitations = [...limitations], archives = [];
  let registry = { candidates: [], fightPrefix: '', runtime: { complete: false, diagnostics: ['Runtime CommonFX discovery was not attempted.'], controlFiles: [] } };
  if (!sharedLimitations.length) {
    try {
      const readText = file => open.get(normalized(file))?.getText() ?? fs.readFileSync(file, 'utf8');
      registry = (adapters.collectRegistry || require('./viewer_archive_registry').collect)(scope.def, { readText });
      if (!registry.runtime?.complete) sharedLimitations.push(...(registry.runtime?.diagnostics || ['Runtime CommonFX discovery is incomplete.']));
      const dirtyControls = (registry.runtime?.controlFiles || []).filter(file => open.get(normalized(file))?.isDirty);
      if (dirtyControls.length) sharedLimitations.push(`Runtime CommonFX assignments have unsaved changes in ${dirtyControls.map(file => path.basename(file)).join(', ')}.`);
    } catch (error) { sharedLimitations.push(`Runtime CommonFX discovery failed: ${error.message}`); }
  }
  if (!sharedLimitations.length) {
    const cache = new Map(), loadShared = async (kind, asset) => {
      const cacheKey = `${kind}\0${normalized(asset)}`; if (cache.has(cacheKey)) return cache.get(cacheKey);
      const value = kind === 'air'
        ? await load('air', asset, async file => parseAir(await readText(file)).map(action => ({ group: action.number, number: undefined, line: Math.max(0, Number(action.line || 1) - 1), frames: action.frames.length })), true)
        : await load('snd', asset, async file => (adapters.readSnd || require('./snd_reader').readSnd)(file).entries.map(entry => ({ group: entry.group, number: entry.index })));
      cache.set(cacheKey, value); return value;
    };
    for (const candidate of (registry.candidates || []).filter(item => item.runtime)) archives.push({
      prefix: candidate.prefix, displayPrefix: candidate.displayPrefix || candidate.prefix, source: candidate.source, definition: candidate.def,
      kinds: { air: candidate.air ? await loadShared('air', candidate.air) : kindModel('air', '', [], 'This runtime CommonFX does not assign an AIR file.'), snd: candidate.snd ? await loadShared('snd', candidate.snd) : kindModel('snd', '', [], 'This runtime CommonFX does not assign an SND file.') }
    });
  }
  const shared = { complete: sharedLimitations.length === 0, limitations: sharedLimitations, fightPrefix: registry.fightPrefix || '', archives };
  return { complete: air.complete && sff.complete && snd.complete, owner: scope?.def || '', label: scope?.characterName || '', limitations, kinds: { air, sff, snd }, shared };
}

function sharedAssetSource(catalog, selector, kind) {
  const shared = catalog?.shared; if (!shared?.complete || !['air', 'snd'].includes(kind)) return null;
  let prefix = String(selector || '').toLowerCase(); if (prefix === 'f' && shared.fightPrefix) prefix = shared.fightPrefix.toLowerCase();
  const matches = (shared.archives || []).filter(archive => archive.prefix === prefix && archive.kinds?.[kind]?.filename);
  const byFile = new Map(); for (const archive of matches) if (!byFile.has(normalized(archive.kinds[kind].filename))) byFile.set(normalized(archive.kinds[kind].filename), archive);
  if (byFile.size !== 1) return null;
  const archive = [...byFile.values()][0], source = archive.kinds[kind];
  return source?.complete ? { ...source, archive, selector: String(selector || '').toLowerCase(), resolvedPrefix: prefix } : null;
}

function assetReferenceFindings(catalog, text, filename) {
  const findings = [];
  for (const reference of literalAssetReferences(text, filename)) {
    const source = catalog?.kinds?.[reference.kind];
    if (!source?.complete || source.ids.has(identity(reference.kind, reference.group, reference.number))) continue;
    const label = reference.kind === 'air' ? `Action ${reference.group}` : `${reference.kind.toUpperCase()} ${reference.group},${reference.number}`;
    findings.push({ code: reference.kind === 'air' ? 'missing-air-action' : reference.kind === 'snd' ? 'missing-sound' : 'missing-sprite', severity: 'warning', reference, message: `${label} is not present in the resolved assigned ${reference.kind.toUpperCase()} asset. The source was not changed.` });
  }
  for (const reference of literalSharedAssetReferences(text, filename)) {
    const source = sharedAssetSource(catalog, reference.selector, reference.kind);
    if (!source || source.ids.has(identity(reference.kind, reference.group, reference.number))) continue;
    const label = reference.kind === 'air' ? `Action ${reference.group}` : `SND ${reference.group},${reference.number}`;
    findings.push({ code: reference.kind === 'air' ? 'missing-commonfx-action' : 'missing-commonfx-sound', severity: 'warning', reference, message: `${label} is not present in the uniquely resolved runtime CommonFX ${reference.authoredPrefix || 'F'} archive ${path.basename(source.filename)}. The source was not changed.` });
  }
  return findings;
}

module.exports = { normalized, identity, literalAssetReferences, literalSharedAssetReferences, assetReferenceContext, buildZssAssetCatalog, sharedAssetSource, assetReferenceFindings };
