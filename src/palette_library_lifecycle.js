'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { hash, transactionalWrite, transactionalWriteSet } = require('./mutation_safety');

const MANIFEST = '.ikemaker-palette-library.json';
const HISTORY = path.join('.ikemen-tools', 'palette-library-history');
const SCHEMA = 'ikemaker.palette-library';
const VERSION = 1;

function rootPath(root, io = fs) {
  const resolved = path.resolve(String(root || ''));
  if (!root || !io.existsSync(resolved)) throw new Error('Choose a Palette Library folder first.');
  const stat = io.lstatSync(resolved);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('The Palette Library root must be a real folder, not a symbolic link.');
  return resolved;
}
function inside(root, target) {
  const relative = path.relative(root, target);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
function cleanName(value) {
  const name = String(value || '').trim().replace(/\.act$/i, '');
  if (!name || name.length > 120 || name === '.' || name === '..' || /[\\/:*?"<>|\u0000-\u001f]/.test(name) || /[. ]$/.test(name) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(name)) throw new Error('Use a short palette name without path separators or reserved filename characters.');
  return name;
}
function manifestFile(root) { return path.join(root, MANIFEST); }
function evidence(io, filename, required = true) {
  const target = path.resolve(filename);
  if (!io.existsSync(target)) {
    if (required) throw new Error(`The Palette Library file is missing: ${path.basename(target)}`);
    return { filename: target, exists: false, byteHash: hash(Buffer.alloc(0)), byteLength: 0 };
  }
  const stat = io.lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Palette Library entries must be regular files, not symbolic links.');
  const bytes = io.readFileSync(target);
  return { filename: target, exists: true, byteHash: hash(bytes), byteLength: bytes.length };
}
function exactPalette(root, filename, io = fs) {
  const base = rootPath(root, io), target = path.resolve(filename);
  if (!inside(base, target) || !/\.(?:act|png)$/i.test(target)) throw new Error('The palette is outside the configured Palette Library.');
  const relativeParts = path.relative(base, target).split(path.sep);
  let current = base;
  for (const part of relativeParts) {
    current = path.join(current, part);
    if (io.existsSync(current) && io.lstatSync(current).isSymbolicLink()) throw new Error('Palette Library paths cannot traverse symbolic links.');
  }
  return evidence(io, target, true);
}
function readManifest(root, io = fs) {
  const filename = manifestFile(root), observed = evidence(io, filename, false);
  if (!observed.exists) return { filename, evidence: observed, document: { schema: SCHEMA, version: VERSION, entries: {} } };
  let document;
  try { document = JSON.parse(io.readFileSync(filename, 'utf8')); } catch (_) { throw new Error('The Palette Library manifest is invalid JSON. Repair it before changing library files.'); }
  if (!document || document.schema !== SCHEMA || document.version !== VERSION || !document.entries || Array.isArray(document.entries) || typeof document.entries !== 'object') throw new Error('The Palette Library manifest has an unsupported structure.');
  return { filename, evidence: observed, document: { schema: SCHEMA, version: VERSION, entries: { ...document.entries } } };
}
function manifestBytes(document) { return Buffer.from(`${JSON.stringify(document, null, 2)}\n`, 'utf8'); }
function operation(root, kind, io = fs, now = new Date()) {
  const id = `${now.toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(8).toString('hex')}`, folder = path.join(root, HISTORY, id);
  io.mkdirSync(folder, { recursive: true });
  const receipt = path.join(folder, 'receipt.json');
  return { id, folder, receipt, write(value) { io.writeFileSync(receipt, `${JSON.stringify({ schema: 'ikemaker.palette-library-operation', version: 1, operationId: id, kind, ...value }, null, 2)}\n`, 'utf8'); } };
}
function entry(relative, displayName, metadata, now) {
  return { file: relative.replace(/\\/g, '/'), displayName, format: path.extname(relative).slice(1).toLowerCase(), createdAt: now.toISOString(), updatedAt: now.toISOString(), source: String(metadata?.source || 'palette-workshop'), group: Number.isInteger(metadata?.group) ? metadata.group : null, number: Number.isInteger(metadata?.number) ? metadata.number : null };
}
function commonWriteOptions(root, manifest, target) {
  return { label: 'palette-library-lifecycle', journal: true, aggregateJournal: true, journalRoot: root, expectedHashes: { [manifest.filename]: manifest.evidence.byteHash }, allowExisting: filename => path.resolve(filename) === path.resolve(manifest.filename) ? true : path.resolve(filename) !== path.resolve(target) };
}
function save({ root, name, bytes, metadata = {}, io = fs, now = new Date() }) {
  const base = rootPath(root, io), displayName = cleanName(name), target = path.join(base, `${displayName}.act`), manifest = readManifest(base, io);
  if (io.existsSync(target)) throw new Error('A Palette Library file already uses that name. Choose another name.');
  if (!Buffer.isBuffer(bytes) || bytes.length !== 768) throw new Error('Saving to the Palette Library requires one reviewed 256-color ACT table.');
  const relative = path.relative(base, target), next = { ...manifest.document, entries: { ...manifest.document.entries, [relative.replace(/\\/g, '/')]: entry(relative, displayName, metadata, now) } }, op = operation(base, 'save', io, now);
  op.write({ status: 'planned', target: relative.replace(/\\/g, '/'), manifestBeforeHash: manifest.evidence.byteHash });
  transactionalWriteSet(io, [[target, bytes], [manifest.filename, manifestBytes(next)]], commonWriteOptions(base, manifest, target));
  op.write({ status: 'committed', target: relative.replace(/\\/g, '/'), targetHash: hash(bytes), manifestAfterHash: hash(manifestBytes(next)) });
  return { filename: target, message: `Saved ${path.basename(target)} to the Palette Library.`, receipt: op.receipt };
}
function duplicate({ root, source, name, expected, io = fs, now = new Date() }) {
  const base = rootPath(root, io), observed = exactPalette(base, source, io);
  if (expected && (observed.byteHash !== expected.byteHash || observed.byteLength !== expected.byteLength)) throw new Error('The selected Palette Library file changed while the duplicate name was being entered.');
  const displayName = cleanName(name), target = path.join(base, `${displayName}${path.extname(observed.filename).toLowerCase()}`), manifest = readManifest(base, io);
  if (io.existsSync(target)) throw new Error('A Palette Library file already uses that name. Choose another name.');
  const bytes = io.readFileSync(observed.filename), readHash = hash(bytes), afterRead = evidence(io, observed.filename, true);
  if (bytes.length !== observed.byteLength || readHash !== observed.byteHash || afterRead.byteLength !== observed.byteLength || afterRead.byteHash !== observed.byteHash) throw new Error('The selected Palette Library file changed while it was being duplicated. Nothing was written.');
  const relative = path.relative(base, target).replace(/\\/g, '/'), sourceRelative = path.relative(base, observed.filename).replace(/\\/g, '/'), prior = manifest.document.entries[sourceRelative] || {}, next = { ...manifest.document, entries: { ...manifest.document.entries, [relative]: { ...entry(relative, displayName, { source: 'duplicate' }, now), group: prior.group ?? null, number: prior.number ?? null } } }, op = operation(base, 'duplicate', io, now);
  op.write({ status: 'planned', source: path.relative(base, observed.filename).replace(/\\/g, '/'), target: relative, sourceHash: observed.byteHash, manifestBeforeHash: manifest.evidence.byteHash });
  transactionalWriteSet(io, [[target, bytes], [manifest.filename, manifestBytes(next)]], commonWriteOptions(base, manifest, target));
  op.write({ status: 'committed', sourceHash: observed.byteHash, target: relative, targetHash: hash(bytes), manifestAfterHash: hash(manifestBytes(next)) });
  return { filename: target, message: `Duplicated ${path.basename(observed.filename)} as ${path.basename(target)}.`, receipt: op.receipt };
}
function relocate({ root, source, name = '', expected, remove = false, io = fs, now = new Date() }) {
  const base = rootPath(root, io), observed = exactPalette(base, source, io);
  if (expected && (observed.byteHash !== expected.byteHash || observed.byteLength !== expected.byteLength)) throw new Error('The selected Palette Library file changed after review. Refresh and try again.');
  const manifest = readManifest(base, io), sourceRelative = path.relative(base, observed.filename).replace(/\\/g, '/'), displayName = remove ? '' : cleanName(name), target = remove ? '' : path.join(path.dirname(observed.filename), `${displayName}${path.extname(observed.filename).toLowerCase()}`);
  if (target && path.resolve(target) !== observed.filename && io.existsSync(target)) throw new Error('A Palette Library file already uses that name. Choose another name.');
  if (target && path.resolve(target) === observed.filename) return { filename: observed.filename, message: 'The Palette Library name is unchanged.', receipt: '' };
  const op = operation(base, remove ? 'delete' : 'rename', io, now), recovery = path.join(op.folder, `original${path.extname(observed.filename).toLowerCase()}`), entries = { ...manifest.document.entries }, prior = entries[sourceRelative] || entry(sourceRelative, path.basename(observed.filename, path.extname(observed.filename)), {}, now);
  delete entries[sourceRelative];
  let targetRelative = '';
  if (target) { targetRelative = path.relative(base, target).replace(/\\/g, '/'); entries[targetRelative] = { ...prior, file: targetRelative, displayName, updatedAt: now.toISOString() }; }
  const next = { ...manifest.document, entries }, before = io.readFileSync(observed.filename);
  io.writeFileSync(recovery, before);
  op.write({ status: 'planned', source: sourceRelative, target: targetRelative, recovery: path.relative(base, recovery).replace(/\\/g, '/'), sourceHash: observed.byteHash, manifestBeforeHash: manifest.evidence.byteHash });
  const destination = remove ? recovery : target;
  try {
    if (remove) io.unlinkSync(recovery);
    io.renameSync(observed.filename, destination);
    const moved = evidence(io, destination, true);
    if (moved.byteHash !== observed.byteHash || moved.byteLength !== observed.byteLength) throw new Error('The selected Palette Library file changed while the reviewed rename/delete was committing. The file was restored and the manifest was not changed.');
    transactionalWrite(io, manifest.filename, manifestBytes(next), { label: `palette-library-${remove ? 'delete' : 'rename'}`, journal: true, journalRoot: base, expectedHash: manifest.evidence.byteHash, allowExisting: true });
  } catch (error) {
    if (error?.committed === true) {
      op.write({ status: 'committed-cleanup-warning', source: sourceRelative, target: targetRelative, recovery: path.relative(base, recovery).replace(/\\/g, '/'), sourceHash: observed.byteHash, warning: error.message, manifestAfterHash: hash(manifestBytes(next)) });
      return { filename: target || '', message: `${remove ? `Deleted ${path.basename(observed.filename)} from the Palette Library.` : `Renamed ${path.basename(observed.filename)} to ${path.basename(target)}.`} The change committed, but a cleanup recovery file was retained.`, receipt: op.receipt };
    }
    try { if (io.existsSync(destination) && !io.existsSync(observed.filename)) io.renameSync(destination, observed.filename); } catch (rollbackError) { throw new Error(`${error.message}\nRecovery was incomplete. Original bytes remain at ${destination}: ${rollbackError.message}`); }
    throw error;
  }
  op.write({ status: 'committed', source: sourceRelative, target: targetRelative, recovery: path.relative(base, recovery).replace(/\\/g, '/'), sourceHash: observed.byteHash, manifestAfterHash: hash(manifestBytes(next)) });
  return { filename: target || '', message: remove ? `Deleted ${path.basename(observed.filename)} from the Palette Library. A recoverable copy was retained.` : `Renamed ${path.basename(observed.filename)} to ${path.basename(target)}.`, receipt: op.receipt };
}
function rename(options) { return relocate({ ...options, remove: false }); }
function remove(options) { return relocate({ ...options, remove: true }); }

module.exports = { MANIFEST, HISTORY, SCHEMA, VERSION, cleanName, rootPath, exactPalette, readManifest, save, duplicate, rename, remove };
