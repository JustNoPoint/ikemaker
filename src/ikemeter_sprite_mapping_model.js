'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { TextDecoder } = require('node:util');
const { parseCnsStructure } = require('./code_structure_model');
const { parseDef, sections, unquote } = require('./def_model');
const { assignedPath } = require('./character_dependency_model');
const { parseSffBuffer } = require('./sff_reader');
const writer = require('./reviewed_workspace_patch_writer');
const { PINNED_ENGINE_SHA256 } = require('./ikemeter_telemetry_model');

const MAX_SFF = 128 * 1024 * 1024;
const MAX_DEF = 4 * 1024 * 1024;
const MAX_FOLDER_ENTRIES = 256;
const PEER_PROBE_BYTES = 8192;
const MAX_PEER_BYTES = 16 * 1024 * 1024;
const MAX_CHOICES = 150;
const STATE_FILE = /^st\d*$/i;
const CODE_FILE = /^(?:st(?:\d*|common)|cmd|command|cns|constants|common)$/i;
const LONE_CR = /\r(?!\n)/;
const DIGEST = /^[a-f0-9]{64}$/;
const OWN_STATE_RELATION = 'pinned-state-owner-slot-equals-root-slot';
const STALE = 'The source, DEF or SFF changed after the preview. Nothing was applied.';

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function samePath(left, right) {
  return typeof left === 'string' && typeof right === 'string' && path.relative(left, right) === '';
}

function inside(root, filename) {
  const relative = path.relative(root, filename);
  return relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

function directFile(root, filename) {
  check(inside(root, filename), 'An assigned file leaves the mapped project.');
  let component = root;
  for (const segment of path.relative(root, filename).split(path.sep)) {
    check(!/[:\0]/.test(segment), 'An assigned file path is unsupported.');
    component = path.join(component, segment);
    check(!fs.lstatSync(component).isSymbolicLink(), 'Linked project locations cannot be verified.');
  }
  const resolved = fs.realpathSync.native(filename);
  check(inside(root, resolved) && samePath(resolved, filename), 'The target leaves the mapped project.');
  const info = fs.statSync(resolved);
  check(info.isFile() && info.nlink === 1, 'Use an ordinary file with one local path.');
  return resolved;
}

function stamp(stats) {
  return [stats.dev, stats.ino, stats.size, stats.mtimeNs, stats.ctimeNs, stats.nlink].join(':');
}

function boundedFile(root, filename, limit, prefixOnly = false) {
  const resolved = directFile(root, filename);
  const fd = fs.openSync(resolved, 'r');
  try {
    const before = fs.fstatSync(fd, { bigint: true });
    check(before.isFile() && before.nlink === 1n && (prefixOnly || before.size <= BigInt(limit)), 'A project file exceeds the review limit or is unavailable.');
    const size = Number(before.size);
    const bytes = Buffer.allocUnsafe(Math.min(size, limit));
    let offset = 0;
    while (offset < bytes.length) {
      const count = fs.readSync(fd, bytes, offset, bytes.length - offset);
      check(count > 0, 'A project file changed during inspection.');
      offset += count;
    }
    check(stamp(before) === stamp(fs.fstatSync(fd, { bigint: true })) &&
      stamp(before) === stamp(fs.statSync(directFile(root, filename), { bigint: true })),
    'A project file changed during inspection.');
    return { filename: resolved, bytes, size, hash: prefixOnly ? undefined : sha256(bytes) };
  } finally {
    fs.closeSync(fd);
  }
}

function utf8(bytes) {
  let content;
  try {
    content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new Error('Sprite mapping review requires UTF-8 source and DEF files.');
  }
  check(!content.includes('\0'), 'Sprite mapping review requires UTF-8 source and DEF files.');
  check(!LONE_CR.test(content), 'A lone carriage return makes the source line endings incompatible with exact navigation.');
  return content;
}

function eolVariants(content) {
  const lf = content.replace(/\r\n/g, '\n');
  return new Set([content, lf, lf.replace(/\n/g, '\r\n')]);
}

function mappingRoot(vscode, mapping) {
  check(vscode.workspace.isTrusted === true && !vscode.env?.remoteName &&
    vscode.workspace.workspaceFolders?.some(folder => folder.uri.scheme === 'file' &&
      samePath(folder.uri.fsPath, mapping?.workspacePath)),
  'The mapped project must still be open in a trusted local workspace.');
  const root = fs.realpathSync.native(mapping.workspacePath);
  check(samePath(root, mapping.root), 'The mapped project root changed. Import the findings again.');
  return root;
}

function observedFile(root, entry, limit) {
  check(typeof entry?.path === 'string' && DIGEST.test(entry.sha256) &&
    entry.path.split('/').every(part => part && part !== '.' && part !== '..' && !/[\\:\0]/.test(part)),
  'The capture needs an exact project location and file fingerprint.');
  const file = boundedFile(root, path.resolve(root, ...entry.path.split('/')), limit);
  check(file.hash === entry.sha256, 'A project file differs from the capture. Collect fresh evidence.');
  return file;
}

function evidenceIssue(finding, runtime) {
  if (finding?.locator?.type !== 'source' || finding.attribution !== 'exact' || !finding.actions?.includes('navigate')) {
    return 'An exact controller destination location is required.';
  }
  const owner = finding.locator.ownerDef;
  if (!owner || !Number.isSafeInteger(owner.player) || owner.player < 1 || owner.player > 4) return 'The source finding needs its own verified owner DEF and player.';
  if (runtime?.relation !== OWN_STATE_RELATION || runtime.engineSha256 !== PINNED_ENGINE_SHA256 ||
      Object.keys(runtime).length !== 3 || !Number.isSafeInteger(runtime.slot) || runtime.slot < 1 || runtime.slot > 4) {
    return 'A linked capture must establish the source owner’s own-state relationship for the pinned engine.';
  }
  if (runtime.slot !== owner.player) return 'The sampled state owner slot does not match this source owner.';
  if (finding.locator.range?.start?.line !== finding.locator.range?.end?.line) return 'The captured destination must be on one line.';
  return '';
}

function resolvedAssignment(def, entry) {
  const raw = unquote(entry.value);
  check(raw && !/[\0\r\n]/.test(raw), 'The DEF contains an uncertain file assignment.');
  const local = path.resolve(path.dirname(def), raw.replace(/[\\/]/g, path.sep));
  return CODE_FILE.test(entry.normalized) ? (assignedPath(def, entry.value, entry.normalized) || local) : local;
}

function cleanPaths(vscode, filenames) {
  for (const document of vscode.workspace.textDocuments || []) {
    if (document.uri?.scheme !== 'file' || document.isClosed || !document.isDirty) continue;
    const opened = document.uri.fsPath;
    const matches = candidate => filenames.some(filename => samePath(candidate, filename));
    let resolved;
    try { resolved = fs.realpathSync.native(opened); } catch { /* An unsaved file may lack a disk path. */ }
    check(!matches(opened) && !matches(resolved), 'Save or revert pending changes to the source, DEF or SFF before review.');
  }
}

function hasFilesMarker(bytes) {
  // Inspect the ASCII section name ahead of decoding, including possible
  // wide-character text. Binary files without this marker cannot assign states.
  return /\[\s*files\s*\]/i.test(bytes.toString('latin1').replace(/\0/g, ''));
}

function binaryPeer(bytes) {
  if (hasFilesMarker(bytes)) return false;
  const prefix = bytes.subarray(0, 12).toString('latin1');
  return prefix.startsWith('ElecbyteSpr\0') || prefix.startsWith('ElecbyteSnd\0') ||
    prefix.startsWith('\x89PNG\r\n\x1a\n') || prefix.startsWith('GIF87a') || prefix.startsWith('GIF89a') ||
    prefix.startsWith('\xff\xd8\xff') || prefix.startsWith('RIFF') && ['WEBP', 'WAVE', 'AVI '].includes(prefix.slice(8));
}

function peerDefs(vscode, root, owner, source) {
  const folder = path.dirname(owner);
  const directory = fs.opendirSync(folder);
  let count = 0;
  let budget = MAX_PEER_BYTES;
  const limitMessage = 'The character folder exceeds the ownership review limit.';
  try {
    for (let item = directory.readSync(); item; item = directory.readSync()) {
      check(++count <= MAX_FOLDER_ENTRIES, limitMessage);
      if (item.isDirectory()) continue;
      const filename = path.join(folder, item.name);
      if (samePath(filename, owner)) continue;
      check(item.isFile(), 'A neighboring file has uncertain DEF ownership.');
      check(budget > 0, limitMessage);
      const probe = boundedFile(root, filename, Math.min(PEER_PROBE_BYTES, budget), true);
      budget -= probe.bytes.length;
      if (binaryPeer(probe.bytes)) continue;
      let bytes = probe.bytes;
      if (probe.size > probe.bytes.length) {
        check(probe.size <= budget && probe.size <= MAX_DEF, limitMessage);
        bytes = boundedFile(root, filename, Math.min(budget, MAX_DEF)).bytes;
        budget -= bytes.length;
      }
      if (!hasFilesMarker(bytes)) continue;
      cleanPaths(vscode, [filename]);
      let peerText;
      try {
        peerText = utf8(bytes);
      } catch {
        throw new Error('A neighboring DEF could not be read for ownership review. Check its encoding and line endings.');
      }
      const files = sections(parseDef(peerText, filename), 'files');
      for (const entry of files.flatMap(section => section.entries).filter(entry => CODE_FILE.test(entry.normalized))) {
        const assigned = resolvedAssignment(filename, entry);
        let real;
        try { real = fs.realpathSync.native(assigned); } catch (error) { if (error.code !== 'ENOENT') throw error; }
        check(!samePath(assigned, source) && !samePath(real, source), 'Another DEF in the character folder assigns this state file.');
      }
    }
  } finally {
    directory.closeSync();
  }
}

function ownerArchive(vscode, root, owner, source) {
  const files = sections(parseDef(utf8(owner.bytes), owner.filename), 'files');
  check(files.length === 1, 'The owner DEF needs one [Files] section.');
  const code = files[0].entries.filter(entry => CODE_FILE.test(entry.normalized));
  const assignedToSource = code.filter(entry => {
    const resolved = resolvedAssignment(owner.filename, entry);
    if (samePath(resolved, source)) return true;
    try {
      return samePath(fs.realpathSync.native(resolved), source);
    } catch (error) {
      if (error.code === 'ENOENT') return false;
      throw error;
    }
  });
  check(assignedToSource.length === 1 && STATE_FILE.test(assignedToSource[0].normalized) &&
    code.filter(entry => entry.normalized === assignedToSource[0].normalized).length === 1 &&
    samePath(directFile(root, resolvedAssignment(owner.filename, assignedToSource[0])), source),
  'The owner DEF must assign this source through one unambiguous st or stN entry.');
  peerDefs(vscode, root, owner.filename, source);
  const sprite = files[0].entries.filter(entry => /^(?:sprite|sff)$/i.test(entry.normalized));
  check(sprite.length === 1 && sprite[0].normalized === 'sprite', 'The owner DEF needs one sprite assignment.');
  const filename = resolvedAssignment(owner.filename, sprite[0]);
  return boundedFile(root, filename, MAX_SFF);
}

function coordinate(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= 65535;
}

function pairKey(group, number) {
  return group + ',' + number;
}

function literalPair(raw, key) {
  const match = /^([\t ]*(?:dest|source)[\t ]*=[\t ]*)(\d+)([\t ]*,[\t ]*)(\d+)[\t ]*(?:;.*)?$/i.exec(raw || '');
  const group = Number(match?.[2]);
  const number = Number(match?.[4]);
  check(match && coordinate(group) && coordinate(number), 'Use a literal pair of nonnegative SFF coordinates for ' + key + '.');
  return {
    group, number, key: pairKey(group, number), groupText: match[2], numberText: match[4],
    column: match[1].length, before: match[2] + match[3] + match[4], separator: match[3]
  };
}

function exactController(text, range) {
  check(!LONE_CR.test(text), 'A lone carriage return makes the source line endings incompatible with exact navigation.');
  const lines = text.split(/\r?\n/);
  const line = range?.start?.line;
  check(Number.isSafeInteger(line) && line >= 0 && line < lines.length && line === range.end?.line,
    'The capture must point to one destination line.');
  const outline = parseCnsStructure(text);
  const matches = outline.children.filter(state => state.kind === 'state').flatMap(state =>
    state.children.filter(item => item.kind === 'controller' && line > item.startLine && line <= item.endLine)
      .map(item => ({ state, item })));
  check(matches.length === 1, 'The destination must belong to one CNS controller in a StateDef.');
  const { state, item } = matches[0];
  const code = raw => raw.replace(/;.*/, '').trim();
  check(/^\[\s*statedef[\t ]+-?\d+[\t ]*\]$/i.test(code(lines[state.startLine])) &&
    /^\[\s*state[\t ]+[^\[\]]+\]$/i.test(code(lines[item.startLine])),
  'The state and controller headers must be exact CNS sections.');
  for (let index = state.startLine + 1; index < item.startLine; index++) {
    const candidate = code(lines[index]);
    if (candidate.startsWith('[')) {
      check(/^\[\s*state[\t ]+[^\[\]]+\]$/i.test(candidate), 'An intervening section makes state ownership uncertain.');
    }
  }
  const parameters = new Map();
  for (let index = item.startLine + 1; index <= item.endLine; index++) {
    const raw = lines[index];
    const value = code(raw);
    if (!value) continue;
    const assignment = /^([a-z_][a-z0-9_.]*)[\t ]*=[\t ]*(.*)$/i.exec(value);
    check(assignment, 'The controller contains an unsupported parameter line.');
    const key = assignment[1].toLowerCase();
    // The CNS compiler accumulates trigger clauses with the same key.
    if (/^trigger(?:all|[0-9]+)$/.test(key)) continue;
    check(!parameters.has(key), 'The controller repeats a parameter.');
    parameters.set(key, { raw, index, value: assignment[2].trim() });
  }
  check(parameters.get('type')?.value.toLowerCase() === 'remapsprite', 'The controller needs a literal RemapSprite type.');
  check([...parameters.keys()].every(key => ['type', 'source', 'dest', 'reset', 'ignorehitpause', 'persistent'].includes(key)),
    'The controller uses a parameter outside literal sprite mapping review.');
  check(!parameters.has('reset') || /^[01]$/.test(parameters.get('reset').value), 'The controller needs a literal reset of 0 or 1.');
  const source = literalPair(parameters.get('source')?.raw, 'source');
  const dest = literalPair(parameters.get('dest')?.raw, 'dest');
  const { start, end } = range;
  check(line === parameters.get('dest')?.index && Number.isSafeInteger(start.character) && Number.isSafeInteger(end.character) &&
    start.character >= 0 && start.character <= dest.column && end.character >= dest.column + dest.before.length &&
    end.character <= lines[line].length, 'The captured range must cover the destination pair on that line.');

  let lineOffset = 0;
  const breaks = /\r?\n/g;
  for (let index = 0; index < line; index++) {
    breaks.exec(text);
    lineOffset = breaks.lastIndex;
  }
  const from = lineOffset + dest.column;
  return { line: item.startLine, source, dest, start: from, end: from + dest.before.length };
}

function coordinates(archive) {
  const entries = new Map();
  for (const sprite of archive.sprites) {
    if (!coordinate(sprite.group) || !coordinate(sprite.number)) continue;
    const key = pairKey(sprite.group, sprite.number);
    const existing = entries.get(key);
    if (existing) existing.count++;
    else entries.set(key, { group: sprite.group, number: sprite.number, count: 1 });
  }
  return entries;
}

function requireSprite(entries, key) {
  check(entries.get(key)?.count === 1, 'Sprite ' + key + ' must occur exactly once in the owner’s assigned SFF.');
}

function spriteChoices(entries, query) {
  const term = query.replace(/\s+/g, '');
  const items = [];
  let exceedsLimit = false;
  for (const [key, entry] of entries) {
    if (!key.includes(term)) continue;
    if (items.length === MAX_CHOICES) {
      exceedsLimit = true;
      break;
    }
    items.push({
      label: key, description: entry.count === 1 ? '' : 'Unavailable · repeated coordinates',
      key, available: entry.count === 1
    });
  }
  return { items, exceedsLimit };
}

function verifyFiles(vscode, request, parseArchive = parseSffBuffer, expected) {
  const issue = evidenceIssue(request.finding, request.runtime);
  check(!issue, issue);
  check(DIGEST.test(request.importSha256) && request.isCurrent() === true, 'The linked capture or project mapping changed.');
  const root = mappingRoot(vscode, request.mapping);
  const locator = request.finding.locator;
  const source = observedFile(root, locator, writer.MAX_SOURCE_BYTES);
  const owner = observedFile(root, locator.ownerDef, MAX_DEF);
  const sff = ownerArchive(vscode, root, owner, source.filename);
  cleanPaths(vscode, [source.filename, owner.filename, sff.filename]);
  check(vscode.workspace.getConfiguration('files', vscode.Uri.file(source.filename)).get('autoSave', 'off') === 'off',
  'Turn off source Auto Save before reviewing an unsaved mapping edit.');
  if (expected) {
    for (const [name, file] of Object.entries({ source, owner, sff })) {
      check(file.hash === expected[name].hash && samePath(file.filename, expected[name].filename), STALE);
    }
  }
  const content = utf8(source.bytes);
  // Validate the raw capture's logical UTF-8 line range before opening an editor.
  exactController(content.replace(/^\uFEFF/, ''), locator.range);
  let entries;
  try {
    entries = coordinates(parseArchive(sff.bytes, sff.filename));
  } catch {
    throw new Error('The owner’s assigned SFF could not be read.');
  }
  return {
    source: { filename: source.filename, hash: source.hash },
    owner: { filename: owner.filename, hash: owner.hash },
    sff: { filename: sff.filename, hash: sff.hash },
    content, entries
  };
}

function verifyDocument(file, document, range, expectedVersion) {
  check(document?.uri?.scheme === 'file' && samePath(document.uri.fsPath, file.source.filename) &&
    !document.isClosed && document.isDirty === false &&
    Number.isSafeInteger(document.version) && document.version >= 0 &&
    (expectedVersion === undefined || document.version === expectedVersion),
  'The source document must be open at its reviewed clean version.');
  const text = document.getText();
  check(Buffer.byteLength(text, 'utf8') <= writer.MAX_SOURCE_BYTES &&
    eolVariants(file.content.replace(/^\uFEFF/, '')).has(text.replace(/^\uFEFF/, '')) &&
    (file.content.startsWith('\uFEFF') || !text.startsWith('\uFEFF')),
  'The editor text differs from the verified source file.');
  const controller = exactController(text, range);
  requireSprite(file.entries, controller.source.key);
  requireSprite(file.entries, controller.dest.key);
  return { text, controller };
}

function replacementPlan(file, document, verified, chosen) {
  const { text, controller } = verified;
  const { start, end, dest } = controller;
  requireSprite(file.entries, chosen);
  if (chosen === dest.key) return null;
  const pair = file.entries.get(chosen);
  const group = dest.group === pair.group ? dest.groupText : String(pair.group);
  const number = dest.number === pair.number ? dest.numberText : String(pair.number);
  const replacement = group + dest.separator + number;
  const after = text.slice(0, start) + replacement + text.slice(end);
  check(Buffer.byteLength(after, 'utf8') <= writer.MAX_SOURCE_BYTES, 'The sprite mapping preview exceeds the source limit.');
  const operation = Object.freeze({
    schema: writer.SCHEMA, version: 1, policy: 'replace', sourcePath: file.source.filename,
    sourceWasOpen: true, sourceWasDirty: false, documentVersion: document.version,
    start, end, before: dest.before, replacement, beforeHash: writer.hash(text), afterHash: writer.hash(after)
  });
  writer.validateOperation(operation);
  return { operation, after };
}

module.exports = {
  evidenceIssue, verifyFiles, verifyDocument, replacementPlan, spriteChoices, exactController, OWN_STATE_RELATION, STALE, samePath
};
