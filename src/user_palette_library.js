'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parseDef, sections, sectionMap, unquote } = require('./def_model');
const { paletteAct } = require('./sff_reader');
const { normalizeColors } = require('./palette_editor');

function safeId(value, fallback = 'palette') {
  const clean = String(value || '').trim().replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '');
  return clean || fallback;
}

function samePath(left, right) { return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase(); }

function characterPaletteContext(sffPath, gameRoot = '') {
  const archive = path.resolve(sffPath), stop = gameRoot ? path.resolve(gameRoot) : path.parse(archive).root;
  let folder = path.dirname(archive), match = null;
  while (true) {
    let names = [];
    try { names = fs.readdirSync(folder).filter((name) => /\.def$/i.test(name)); } catch (_) {}
    for (const name of names) {
      const defPath = path.join(folder, name), document = parseDef(fs.readFileSync(defPath, 'utf8'), defPath), files = sectionMap(sections(document, 'Files')[0]);
      if (!files.sprite) continue;
      const referenced = path.resolve(path.dirname(defPath), unquote(files.sprite));
      if (samePath(referenced, archive)) { match = { defPath, document, files }; break; }
    }
    if (match || samePath(folder, stop)) break;
    const parent = path.dirname(folder); if (parent === folder || (gameRoot && path.relative(stop, parent).startsWith('..'))) break; folder = parent;
  }
  if (!match) return { sffPath: archive, gameRoot: gameRoot || path.dirname(archive), characterId: safeId(path.basename(archive, path.extname(archive))), defPath: '', defaultAct: '', slots: [], runtimeSlots: [] };
  const info = sectionMap(sections(match.document, 'Info')[0]), slots = [];
  for (const [key, raw] of Object.entries(match.files)) {
    const found = /^pal(\d+)$/i.exec(key); if (!found) continue;
    const target = path.resolve(path.dirname(match.defPath), unquote(raw));
    slots.push({ number: Number(found[1]), key: `pal${Number(found[1])}`, raw: unquote(raw), path: target, exists: fs.existsSync(target), userCandidate: /(?:^|[\\/_-])(?:custom|user)(?:[\\/_.-]|$)/i.test(unquote(raw)) });
  }
  slots.sort((a, b) => a.number - b.number);
  return {
    sffPath: archive,
    gameRoot: gameRoot || path.dirname(match.defPath),
    characterId: safeId(path.basename(match.defPath, path.extname(match.defPath))),
    displayName: unquote(info.displayname || info.name || path.basename(match.defPath, path.extname(match.defPath))),
    defPath: match.defPath,
    defaultAct: (slots.find((slot) => slot.number === 1) || {}).path || '',
    slots,
    runtimeSlots: slots.filter((slot) => slot.userCandidate)
  };
}

function libraryRoot(gameRoot, characterId) {
  return path.join(path.resolve(gameRoot), 'save', 'palettes', safeId(characterId, 'character'));
}

function paletteFolder(gameRoot, characterId, paletteId) {
  return path.join(libraryRoot(gameRoot, characterId), safeId(paletteId));
}

function listUserPalettes(gameRoot, characterId) {
  const root = libraryRoot(gameRoot, characterId), output = [];
  if (!fs.existsSync(root)) return output;
  for (const entry of fs.readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const folder = path.join(root, entry.name), metadataPath = path.join(folder, 'palette.json'), actPath = path.join(folder, 'palette.act');
    if (!fs.existsSync(actPath)) continue;
    let metadata = { id: entry.name, name: entry.name, formatVersion: 1 };
    if (fs.existsSync(metadataPath)) { try { metadata = { ...metadata, ...JSON.parse(fs.readFileSync(metadataPath, 'utf8')) }; } catch (_) { metadata.warning = 'Metadata could not be read.'; } }
    output.push({ ...metadata, folder, metadataPath, actPath });
  }
  return output;
}

function userPaletteWrites(options) {
  const colors = normalizeColors(options.colors), now = options.now || new Date(), id = safeId(options.id || options.name), folder = paletteFolder(options.gameRoot, options.characterId, id);
  const metadata = {
    formatVersion: 1,
    id,
    name: String(options.name || id).trim(),
    characterId: safeId(options.characterId, 'character'),
    parent: options.parent || null,
    sourceFingerprint: crypto.createHash('sha256').update(paletteAct(colors)).digest('hex'),
    created: options.created || now.toISOString(),
    modified: now.toISOString(),
    components: { root: 'palette.act' },
    runtime: options.runtime || null
  };
  return { id, folder, metadata, writes: [[path.join(folder, 'palette.act'), paletteAct(colors)], [path.join(folder, 'palette.json'), `${JSON.stringify(metadata, null, 2)}\n`]] };
}

function safeUserPalette(gameRoot, characterId, paletteId) {
  const root = libraryRoot(gameRoot, characterId), folder = paletteFolder(gameRoot, characterId, paletteId), relative = path.relative(root, folder);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('The user palette is outside this character library.');
  const actPath = path.join(folder, 'palette.act'); if (!fs.existsSync(actPath)) throw new Error('The selected user palette no longer exists.');
  return { folder, actPath, metadataPath: path.join(folder, 'palette.json') };
}

module.exports = { safeId, characterPaletteContext, libraryRoot, paletteFolder, listUserPalettes, userPaletteWrites, safeUserPalette };
