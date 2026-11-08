'use strict';

const fs = require('fs');
const path = require('path');
const { parseDef, sections, value, unquote } = require('./def_model');
const { assignedPath: resolveCharacterAssignment } = require('./character_dependency_model');
const { hash } = require('./mutation_safety');

const MAX_OWNER_BYTES = 4 * 1024 * 1024;
const TEXT_EXTENSIONS = new Set(['.def','.air','.cns','.st','.zss','.cmd','.inp','.jnp','.dat','.lua','.txt']);

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) freeze(item);
  return Object.freeze(value);
}

function unique(values) {
  const seen = new Set(), result = [];
  for (const value of values) {
    if (!value) continue;
    const exact = path.resolve(value), key = exact.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key); result.push(exact);
  }
  return result;
}

function readOwner(ownerFile, fileSystem, readOwnerText) {
  if (typeof ownerFile !== 'string' || !path.isAbsolute(ownerFile)) throw new TypeError('An entity target requires an absolute ownerFile.');
  const exact = path.resolve(ownerFile), stat = fileSystem.statSync(exact);
  if (!stat.isFile()) throw new Error('The entity owner is not a file.');
  if (stat.size > MAX_OWNER_BYTES) throw new RangeError(`The entity owner exceeds ${MAX_OWNER_BYTES} bytes.`);
  const supplied=typeof readOwnerText==='function'?readOwnerText(exact):null,text=typeof supplied==='string'?supplied:typeof supplied?.text==='string'?supplied.text:fileSystem.readFileSync(exact,'utf8');
  if(Buffer.byteLength(text,'utf8')>MAX_OWNER_BYTES)throw new RangeError(`The entity owner exceeds ${MAX_OWNER_BYTES} bytes.`);
  return { exact, stat, text, documentVersion:Number.isSafeInteger(supplied?.version)?supplied.version:null, open:typeof supplied==='string'||typeof supplied?.text==='string' };
}

function assignedPath(root, raw) {
  const clean = unquote(String(raw || '')).trim();
  return clean ? path.resolve(root, clean) : '';
}

function characterTargets(owner, fileSystem) {
  const document = parseDef(owner.text, owner.exact), files = sections(document, 'files')[0], root = path.dirname(owner.exact);
  if (!files) return { sff:'', air:'', snd:'', code:[owner.exact] };
  const get = (...names) => {
    for (const name of names) { const raw = value(files, name, ''); if (raw) return assignedPath(root, raw); }
    return '';
  };
  const sff = get('sprite','sff'), air = get('anim','air'), snd = get('sound','snd'), code = [owner.exact, air];
  for (const entry of files.entries || []) {
    if (!/^(?:cns|st(?:common|\d*)?|cmd|movelist|lua)$/i.test(entry.key || '')) continue;
    const filename = resolveCharacterAssignment(owner.exact, entry.value, entry.key, fileSystem);
    if (TEXT_EXTENSIONS.has(path.extname(filename).toLowerCase())) code.push(filename);
  }
  return { sff, air, snd, code:unique(code) };
}

function availability(filename, expected, fileSystem) {
  if (!filename) return freeze({ available:false, filename:'', reason:'No file is assigned by this exact entity owner.' });
  if (path.extname(filename).toLowerCase() !== expected) return freeze({ available:false, filename, reason:`The exact owner assignment is not a ${expected.slice(1).toUpperCase()} file.` });
  try {
    const stat = fileSystem.statSync(filename);
    if (!stat.isFile()) return freeze({ available:false, filename, reason:'The assigned resource is not a file.' });
    return freeze({ available:true, filename, size:stat.size, modifiedMs:Math.trunc(stat.mtimeMs) });
  } catch (_) { return freeze({ available:false, filename, reason:'The exact assigned resource is missing or unreadable.' }); }
}

function resolveEntityTargets(descriptor, services = {}) {
  const fileSystem = services.fs || fs, kind = String(descriptor?.kind || descriptor?.type || '').toLowerCase();
  if (!['character','stage','screenpack','storyboard','workspace'].includes(kind)) throw new TypeError('Unsupported entity kind.');
  if (kind === 'workspace') return freeze({ identity:String(descriptor?.identity || descriptor?.id || ''), kind, ownerFile:'', ownerRevision:null, sff:availability('', '.sff', fileSystem), air:availability('', '.air', fileSystem), snd:availability('', '.snd', fileSystem), code:[], stage:availability('', '.def', fileSystem), screenpack:availability('', '.def', fileSystem) });
  const owner = readOwner(descriptor.ownerFile, fileSystem, services.readOwnerText), identity = String(descriptor.identity || descriptor.id || `${kind}\0${owner.exact.toLowerCase()}`), ownerRevision = freeze({ size:Buffer.byteLength(owner.text,'utf8'), modifiedMs:Math.trunc(owner.stat.mtimeMs), sourceHash:hash(owner.text), open:owner.open, documentVersion:owner.documentVersion });
  if (kind === 'stage' || kind === 'screenpack' || kind === 'storyboard') {
    const own = availability(owner.exact, '.def', fileSystem);
    return freeze({ identity, kind, ownerFile:owner.exact, ownerRevision, sff:availability('', '.sff', fileSystem), air:availability('', '.air', fileSystem), snd:availability('', '.snd', fileSystem), code:[owner.exact], stage:kind === 'stage' ? own : availability('', '.def', fileSystem), screenpack:kind === 'screenpack' ? own : availability('', '.def', fileSystem) });
  }
  const assigned = characterTargets(owner, fileSystem);
  return freeze({ identity, kind, ownerFile:owner.exact, ownerRevision, sff:availability(assigned.sff, '.sff', fileSystem), air:availability(assigned.air, '.air', fileSystem), snd:availability(assigned.snd, '.snd', fileSystem), code:assigned.code.map(filename => freeze({ filename, available:fileSystem.existsSync(filename) })), stage:availability('', '.def', fileSystem), screenpack:availability('', '.def', fileSystem) });
}

function targetsStillCurrent(projection, services = {}) {
  if (!projection || !projection.ownerFile || !projection.ownerRevision) return projection?.kind === 'workspace';
  try {
    const fileSystem=services.fs||fs,owner=readOwner(projection.ownerFile,fileSystem,services.readOwnerText);
    return owner.stat.isFile()&&Buffer.byteLength(owner.text,'utf8')===projection.ownerRevision.size&&hash(owner.text)===projection.ownerRevision.sourceHash&&(projection.ownerRevision.open||Math.trunc(owner.stat.mtimeMs)===projection.ownerRevision.modifiedMs);
  } catch (_) { return false; }
}

module.exports = { MAX_OWNER_BYTES, TEXT_EXTENSIONS, resolveEntityTargets, targetsStillCurrent };
