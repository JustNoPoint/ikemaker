'use strict';

const crypto = require('crypto');
const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseDef, sections, unquote, setSectionEntry } = require('./def_model');

const PREFIX = '.ikemaker-writer-test-';
const RECEIPT_ROOT = path.join(os.tmpdir(), 'ikemaker-sff-writer-runs');
const MAX_SFF_BYTES = 1024 * 1024 * 1024;
const MAX_OWNER_DEFS = 256;
const MAX_OWNER_DEF_BYTES = 2 * 1024 * 1024;
const MAX_OWNER_DEF_TOTAL_BYTES = 8 * 1024 * 1024;
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const key = filename => process.platform === 'win32' ? path.resolve(filename).toLowerCase() : path.resolve(filename);
const inside = (parent, filename) => { const relative = path.relative(path.resolve(parent), path.resolve(filename)); return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative); };
const forward = value => value.split(path.sep).join('/');

function directFile(filename, label, maximumBytes = MAX_SFF_BYTES) {
  const absolute = path.resolve(filename), stat = fs.lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 0 || stat.size > maximumBytes) throw new Error(`${label} must be a direct local file no larger than ${maximumBytes} bytes.`);
  const bytes = fs.readFileSync(absolute), after = fs.lstatSync(absolute);
  if (!after.isFile() || after.isSymbolicLink() || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || bytes.length !== stat.size) throw new Error(`${label} changed while the comparison run was being prepared.`);
  return { absolute, bytes, byteHash: hash(bytes) };
}

function assignedSprite(document) {
  const files = sections(document, 'files');
  if (files.length !== 1) throw new Error('The owner DEF must have exactly one [Files] section for a writer comparison run.');
  const entries = files[0].entries.filter(item => item.normalized === 'sprite');
  if (entries.length !== 1) throw new Error('The owner DEF must have exactly one [Files] sprite assignment for a writer comparison run.');
  const literal = unquote(entries[0].value);
  if (!literal || /[%$]/.test(literal)) throw new Error('The owner DEF sprite assignment must be one direct relative file path.');
  return { section: files[0], entry: entries[0], literal };
}

function resolveOwnerDef(targetSff, io = fs) {
  const target = path.resolve(targetSff), folder = path.dirname(target), targetKey = key(target), matches = [];
  const candidates = io.readdirSync(folder, { withFileTypes: true }).filter(entry => entry.isFile() && path.extname(entry.name).toLowerCase() === '.def' && !entry.name.startsWith(PREFIX));
  if (candidates.length > MAX_OWNER_DEFS) throw new Error(`The character folder contains more than ${MAX_OWNER_DEFS} sibling DEF files; owner discovery was stopped.`);
  let totalBytes = 0;
  for (const entry of candidates) {
    const filename = path.join(folder, entry.name), stat = io.lstatSync(filename);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_OWNER_DEF_BYTES) continue;
    totalBytes += stat.size; if (totalBytes > MAX_OWNER_DEF_TOTAL_BYTES) throw new Error('Sibling DEF owner discovery exceeded its bounded read limit.');
    const bytes = io.readFileSync(filename), after = io.lstatSync(filename);
    if (!after.isFile() || after.isSymbolicLink() || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || bytes.length !== stat.size) throw new Error(`${entry.name} changed during owner discovery.`);
    const hasBom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf, body = hasBom ? bytes.subarray(3) : bytes, text = body.toString('utf8');
    if (!Buffer.from(text, 'utf8').equals(body)) throw new Error(`${entry.name} is not exact UTF-8. Save it as UTF-8 before running the writer comparison.`);
    const document = parseDef(text, filename);
    let assignment; try { assignment = assignedSprite(document); } catch (_) { continue; }
    const assigned = path.resolve(folder, assignment.literal.replace(/[\\/]+/g, path.sep));
    if (key(assigned) === targetKey) matches.push({ filename, bytes, document, assignment, hasBom });
  }
  if (!matches.length) throw new Error(`No clean sibling character DEF uniquely assigns ${path.basename(target)} in [Files] sprite.`);
  if (matches.length !== 1) throw new Error(`More than one sibling character DEF assigns ${path.basename(target)}. Choose an unambiguous character before running the comparison.`);
  return matches[0];
}

function writeExclusive(filename, bytes, io = fs) {
  const descriptor = io.openSync(filename, 'wx');
  try { io.writeFileSync(descriptor, bytes); } finally { io.closeSync(descriptor); }
}

function receiptPath(id) { return path.join(RECEIPT_ROOT, `${id}.json`); }
function saveReceipt(receipt, io = fs) {
  io.mkdirSync(RECEIPT_ROOT, { recursive: true });
  const filename = receiptPath(receipt.id), temporary = `${filename}.${process.pid}.tmp`;
  io.writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  io.renameSync(temporary, filename);
  return filename;
}

function validOwnedFile(record) {
  return record && typeof record.path === 'string' && typeof record.hash === 'string' && /^[a-f0-9]{64}$/.test(record.hash) && path.basename(record.path).startsWith(PREFIX);
}

function cleanupReceipt(receipt, options = {}) {
  const io = options.fs || fs, warn = options.warn || (() => {}), retained = [];
  if (!receipt || receipt.version !== 1 || !Array.isArray(receipt.files) || !receipt.files.every(validOwnedFile)) return { cleaned: false, retained: ['invalid receipt'] };
  for (const record of receipt.files) {
    try {
      if (!inside(receipt.characterFolder, record.path) || !io.existsSync(record.path)) continue;
      const stat = io.lstatSync(record.path);
      if (!stat.isFile() || stat.isSymbolicLink() || hash(io.readFileSync(record.path)) !== record.hash) { retained.push(record.path); continue; }
      io.unlinkSync(record.path);
    } catch (_) { retained.push(record.path); }
  }
  if (retained.length) warn(`IKEMaker retained ${retained.length} comparison-run file(s) because their identity changed. Review them manually in ${receipt.characterFolder}.`);
  try { if (!retained.length && receipt.receiptPath && io.existsSync(receipt.receiptPath)) io.unlinkSync(receipt.receiptPath); } catch (_) {}
  return { cleaned: retained.length === 0, retained };
}

function cleanupPrepared(prepared, options = {}) { return cleanupReceipt({ version: 1, ...prepared }, options); }

function alive(pid, signal = process.kill) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { signal(pid, 0); return true; } catch (_) { return false; }
}

function superviseReceipt(receipt, options = {}) {
  const signal = options.signal || process.kill, interval = options.setInterval || setInterval, clear = options.clearInterval || clearInterval;
  if (!alive(receipt.pid, signal)) return cleanupReceipt(receipt, options);
  const timer = interval(() => { if (!alive(receipt.pid, signal)) { clear(timer); cleanupReceipt(receipt, options); } }, 1500);
  timer.unref?.(); return { cleaned: false, watching: true, timer };
}

function recover(options = {}) {
  const io = options.fs || fs;
  if (!io.existsSync(RECEIPT_ROOT)) return [];
  const results = [];
  for (const name of io.readdirSync(RECEIPT_ROOT)) {
    if (!name.endsWith('.json')) continue;
    const filename = path.join(RECEIPT_ROOT, name);
    try {
      const receipt = JSON.parse(io.readFileSync(filename, 'utf8')); receipt.receiptPath = filename;
      results.push(superviseReceipt(receipt, options));
    } catch (_) { options.warn?.(`IKEMaker could not verify the stale comparison-run receipt ${filename}; it was left untouched.`); }
  }
  return results;
}

function prepare(input, options = {}) {
  const io = options.fs || fs, target = directFile(input.targetSff, 'active character SFF'), builtIn = directFile(input.builtInPath, 'IKEMaker candidate'), sprMake2 = directFile(input.sprMake2Path, 'SprMake2 candidate');
  if (!/^[a-f0-9]{64}$/i.test(String(input.targetHash || '')) || target.byteHash !== String(input.targetHash).toLowerCase()) throw new Error('The active character SFF changed after the writer comparison was created.');
  if (builtIn.byteHash !== input.builtInHash || builtIn.bytes.length !== input.builtInSize) throw new Error('The IKEMaker comparison candidate no longer matches its report.');
  if (sprMake2.byteHash !== input.sprMake2Hash || sprMake2.bytes.length !== input.sprMake2Size) throw new Error('The SprMake2 comparison candidate no longer matches its report.');
  const owner = resolveOwnerDef(target.absolute, io), ownerStat = io.lstatSync(owner.filename);
  if (!ownerStat.isFile() || ownerStat.isSymbolicLink()) throw new Error('The owner DEF must be a direct saved file.');
  const id = `${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}`, stem = `${PREFIX}${id}`;
  const builtInSff = path.join(path.dirname(owner.filename), `${stem}-p1-ikemaker.sff`), sprMake2Sff = path.join(path.dirname(owner.filename), `${stem}-p2-sprmake2.sff`);
  const p1Def = path.join(path.dirname(owner.filename), `${stem}-p1.def`), p2Def = path.join(path.dirname(owner.filename), `${stem}-p2.def`);
  const rewrite = sffName => { const body = Buffer.from(setSectionEntry(owner.document, owner.assignment.section.line, owner.assignment.entry.key, sffName), 'utf8'); return owner.hasBom ? Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), body]) : body; };
  const files = [[builtInSff, builtIn.bytes], [sprMake2Sff, sprMake2.bytes], [p1Def, rewrite(path.basename(builtInSff))], [p2Def, rewrite(path.basename(sprMake2Sff))],];
  const created = [];
  try {
    for (const [filename, bytes] of files) { writeExclusive(filename, bytes, io); created.push({ path: filename, hash: hash(bytes) }); }
    for (const record of created) if (hash(directFile(record.path, path.basename(record.path)).bytes) !== record.hash) throw new Error(`Temporary comparison file failed verification: ${path.basename(record.path)}`);
  } catch (error) {
    for (const record of created.reverse()) try { if (io.existsSync(record.path) && hash(io.readFileSync(record.path)) === record.hash) io.unlinkSync(record.path); } catch (_) {}
    throw error;
  }
  return { id, targetHash: target.byteHash, ownerDef: owner.filename, ownerDefHash: hash(owner.bytes), characterFolder: path.dirname(owner.filename), p1Def, p2Def, files: created };
}

async function launch(prepared, input, options = {}) {
  const io = options.fs || fs, spawn = options.spawn || childProcess.spawn, gameRoot = path.resolve(input.gameRoot), executable = path.resolve(input.executable);
  const args = ['-loadmotif', '-time', '-1', '-rounds', '1', '-tmode1', '0', '-tmode2', '0', '-s', input.stage, '-p1', forward(path.relative(gameRoot, prepared.p1Def)), '-p2', forward(path.relative(gameRoot, prepared.p2Def))];
  let child;
  try {
    if (!inside(gameRoot, prepared.p1Def) || !inside(gameRoot, prepared.p2Def)) throw new Error('Comparison character aliases must remain inside the selected IKEMEN game.');
    if (!io.existsSync(executable)) throw new Error(`IKEMEN executable was not found: ${executable}`);
    child = spawn(executable, args, { cwd: gameRoot, detached: false, stdio: 'ignore', windowsHide: false });
  }
  catch (error) { cleanupReceipt({ version: 1, ...prepared }, options); throw error; }
  if (!Number.isSafeInteger(child?.pid) || child.pid <= 0) { cleanupPrepared(prepared, options); throw new Error('IKEMEN did not return a usable process identifier.'); }
  const receipt = { version: 1, id: prepared.id, pid: child.pid, createdAt: new Date().toISOString(), characterFolder: prepared.characterFolder, files: prepared.files, args };
  let settled = false, startError = null; const finish = error => { if (settled) return; settled = true; if (error instanceof Error) startError = error; const result = cleanupReceipt(receipt, options); options.onExit?.(result, error instanceof Error ? error : null); };
  child.once?.('error', finish); child.once?.('exit', finish);
  await new Promise((resolve, reject) => {
    if (settled) return reject(startError || new Error('IKEMEN exited before the comparison run started.'));
    const remove = () => { child.removeListener?.('spawn', admitted); child.removeListener?.('error', failed); child.removeListener?.('exit', ended); };
    const admitted = () => { remove(); resolve(); }, failed = error => { remove(); reject(error); }, ended = () => { remove(); reject(startError || new Error('IKEMEN exited before the comparison run started.')); };
    child.once?.('spawn', admitted); child.once?.('error', failed); child.once?.('exit', ended);
    if (options.assumeSpawned === true) queueMicrotask(admitted);
  }).catch(error => { finish(error); throw error; });
  try { receipt.receiptPath = saveReceipt(receipt, io); }
  catch (error) { options.warn?.(`IKEMaker could not save the crash-recovery receipt (${error.message}). The normal character is still unchanged; temporary aliases will be removed when this IKEMEN process exits.`); }
  if (settled) { cleanupReceipt(receipt, options); throw startError || new Error('IKEMEN exited before the comparison run was admitted.'); }
  return { pid: child.pid, args: [...args], receiptPath: receipt.receiptPath, isActive: () => !settled };
}

module.exports = { PREFIX, RECEIPT_ROOT, assignedSprite, resolveOwnerDef, prepare, launch, cleanupReceipt, cleanupPrepared, recover, alive };
