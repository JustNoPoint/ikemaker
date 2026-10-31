'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { collectRecords } = require('./analyzer');
const { textGrammar } = require('./map_registry_grammar');
const { parseDef, sections, value, unquote } = require('./def_model');

function normalized(filename) { return filename ? path.resolve(filename).toLowerCase() : ''; }
function hash(text) { return crypto.createHash('sha256').update(String(text || '')).digest('hex'); }

const DEFAULT_LIMITS = Object.freeze({ files: 256, fileBytes: 2 * 1024 * 1024, totalBytes: 16 * 1024 * 1024, records: 100000, ownerDefs: 4096, ownerFiles: 100000, ownerDirectories: 20000, ownerDepth: 16 });
let ownerCacheGeneration = 0, ownerDomainScans = 0;
const ownerDomainCache = new Map();

function invalidateFunctionOwnerCache() { ownerCacheGeneration += 1; ownerDomainCache.clear(); }
function functionOwnerCacheStats() { return { generation: ownerCacheGeneration, domainScans: ownerDomainScans, entries: ownerDomainCache.size }; }
function resetFunctionOwnerCacheForTests() { ownerCacheGeneration = 0; ownerDomainScans = 0; ownerDomainCache.clear(); }

function limitsFor(vscode, overrides = {}) {
  let configured = DEFAULT_LIMITS.files;
  try { configured = Number(vscode.workspace.getConfiguration('ikemenZss').get('maxAuditFiles', DEFAULT_LIMITS.files)); } catch (_) {}
  return {
    files: Math.max(1, Math.min(DEFAULT_LIMITS.files, Number(overrides.files || configured) || DEFAULT_LIMITS.files)),
    fileBytes: Math.max(1024, Number(overrides.fileBytes) || DEFAULT_LIMITS.fileBytes),
    totalBytes: Math.max(1024, Number(overrides.totalBytes) || DEFAULT_LIMITS.totalBytes),
    records: Math.max(100, Number(overrides.records) || DEFAULT_LIMITS.records),
    ownerDefs: Math.max(1, Number(overrides.ownerDefs) || DEFAULT_LIMITS.ownerDefs),
    ownerFiles: Math.max(10, Number(overrides.ownerFiles) || DEFAULT_LIMITS.ownerFiles),
    ownerDirectories: Math.max(10, Number(overrides.ownerDirectories) || DEFAULT_LIMITS.ownerDirectories),
    ownerDepth: Math.max(2, Number(overrides.ownerDepth) || DEFAULT_LIMITS.ownerDepth)
  };
}

function openDocuments(vscode) {
  const output = new Map();
  for (const document of vscode.workspace.textDocuments || []) if (document.fileName) {
    output.set(normalized(document.fileName), document);
    const real = canonical(document.fileName); if (real) output.set(normalized(real), document);
  }
  return output;
}

function snapshot(document, text, filename) {
  return { filename: path.resolve(filename), version: Number.isInteger(document?.version) ? document.version : null, dirty: Boolean(document?.isDirty), hash: hash(text), bytes: Buffer.byteLength(text, 'utf8') };
}

async function readSnapshot(vscode, filename, open = openDocuments(vscode)) {
  const document = open.get(normalized(filename));
  if (document) { const text = document.getText(); return { document, text, snapshot: snapshot(document, text, filename) }; }
  const text = await fs.promises.readFile(filename, 'utf8');
  return { document: null, text, snapshot: snapshot(null, text, filename) };
}

function parsedAssignedCode(def, text) {
  try {
    const source = typeof text === 'string' ? text : fs.readFileSync(def, 'utf8');
    const document = parseDef(source, def), files = sections(document, 'files')[0], output = [];
    if (!files) return { ok: true, code: output, hash: hash(source) };
    const resolve = entry => entry ? path.resolve(path.dirname(def), unquote(entry)) : '';
    for (const entry of files.entries || []) {
      if (!/^st(?:common|\d*)$/i.test(entry.key || '')) continue;
      const filename = require('./character_dependency_model').assignedPath(def, entry.value, entry.key); if (filename) output.push(filename);
    }
    for (const entry of [value(files, 'cmd', ''), value(files, 'cns', '')]) { const filename = resolve(entry); if (filename) output.push(filename); }
    return { ok: true, code: [...new Set(output.map(item => path.resolve(item)))], hash: hash(source) };
  } catch (error) { return { ok: false, code: [], hash: '', error }; }
}

function assignedCode(def, text) { return parsedAssignedCode(def, text).code; }

function defAssigns(def, target, text) {
  return assignedCode(def, text).some(value => normalized(value) === normalized(target));
}

function canonical(filename) {
  try { return (fs.realpathSync.native || fs.realpathSync)(filename); } catch (_) { return ''; }
}

function authorityRoots(vscode, filename, scope) {
  const roots = new Map(), failures = [], add = value => {
    if (!value) return;
    let candidate = path.resolve(value);
    try { if (fs.statSync(candidate).isFile()) candidate = path.dirname(candidate); } catch (_) { failures.push(`Declared ownership root cannot be read: ${candidate}`); return; }
    const game = require('./character_context').gameRoot(candidate);
    if (game && (normalized(candidate) === normalized(game) || normalized(candidate).startsWith(`${normalized(game)}${path.sep}`)) && fs.existsSync(path.join(game, 'chars'))) candidate = path.join(game, 'chars');
    const real = canonical(candidate); if (real) roots.set(normalized(real), real); else failures.push(`Declared ownership root cannot be resolved: ${candidate}`);
  };
  add(require('./character_context').gameRoot(filename));
  add(require('./character_context').gameRoot(scope?.def || ''));
  add(scope?.root); add(scope?.templateBase);
  for (const value of scope?.projectRoots || []) add(value);
  for (const folder of vscode.workspace.workspaceFolders || []) add(folder.uri?.fsPath);
  for (const document of vscode.workspace.textDocuments || []) if (/\.def$/i.test(document.fileName || '')) { add(document.fileName); add(require('./character_context').gameRoot(document.fileName)); }
  let folder = path.dirname(path.resolve(filename));
  for (let level = 0; level < 5; level += 1) {
    try { if (fs.readdirSync(folder).some(value => /\.def$/i.test(value))) add(folder); } catch (_) {}
    const parent = path.dirname(folder); if (parent === folder) break; folder = parent;
  }
  const minimal = [...roots.values()].sort((a, b) => a.length - b.length).filter((candidate, index, values) => !values.slice(0, index).some(parent => normalized(candidate).startsWith(`${normalized(parent)}${path.sep}`)));
  return { roots: minimal, failures };
}

function scanDefRoot(root, limits) {
  const defs = [], visited = new Set(), base = canonical(root);
  if (!base) return { defs, complete: false, files: 0, directories: 0, reason: `Declared ownership root cannot be read: ${root}` };
  const stack = [{ folder: base, depth: 0 }]; let files = 0, directories = 0;
  const ignored = new Set(['.git', '.ikemen-tools', '.pnpm-store', 'node_modules', 'backup', 'backups', 'archive', 'archives', '_backup', 'development', '_development', 'test', 'tests', 'test-fixtures', 'fixtures', 'reference', 'offline', 'dist', 'out', 'output', 'outputs', 'build', 'tmp', 'temp']);
  while (stack.length) {
    const current = stack.pop(), real = canonical(current.folder);
    if (!real) return { defs, complete: false, files, directories, reason: `Ownership directory cannot be read: ${current.folder}` };
    const key = normalized(real); if (visited.has(key)) continue; visited.add(key);
    if (++directories > limits.ownerDirectories) return { defs, complete: false, files, directories, reason: 'The ownership directory bound was reached.' };
    let entries; try { entries = fs.readdirSync(real, { withFileTypes: true }); } catch (_) { return { defs, complete: false, files, directories, reason: `Ownership directory cannot be read: ${real}` }; }
    for (const entry of entries) {
      const full = path.join(real, entry.name);
      if (ignored.has(entry.name.toLowerCase()) && (entry.isDirectory() || entry.isSymbolicLink())) continue;
      if (entry.isSymbolicLink()) {
        const linked = canonical(full);
        if (!linked || !(normalized(linked) === normalized(base) || normalized(linked).startsWith(`${normalized(base)}${path.sep}`))) return { defs, complete: false, files, directories, reason: `Ownership traversal encountered an unresolved or external symbolic link: ${full}` };
        if (current.depth >= limits.ownerDepth) return { defs, complete: false, files, directories, reason: `The ownership depth bound (${limits.ownerDepth}) was reached.` };
        stack.push({ folder: linked, depth: current.depth + 1 }); continue;
      }
      if (entry.isDirectory()) {
        if (current.depth >= limits.ownerDepth) return { defs, complete: false, files, directories, reason: `The ownership depth bound (${limits.ownerDepth}) was reached.` };
        stack.push({ folder: full, depth: current.depth + 1 });
      } else if (entry.isFile() && /\.def$/i.test(entry.name)) {
        if (++files > limits.ownerFiles) return { defs, complete: false, files, directories, reason: 'The ownership file bound was reached.' };
        if (defs.length >= limits.ownerDefs) return { defs, complete: false, files, directories, reason: 'The ownership DEF bound was reached.' };
        defs.push(full);
      }
    }
  }
  return { defs, complete: true, files, directories };
}

async function indexedDomainDefs(vscode, roots, limits) {
  const generation = ownerCacheGeneration;
  const key = JSON.stringify({ generation, roots: roots.map(normalized).sort(), ownerDefs: limits.ownerDefs, ownerFiles: limits.ownerFiles, ownerDirectories: limits.ownerDirectories, ownerDepth: limits.ownerDepth });
  if (ownerDomainCache.has(key)) return ownerDomainCache.get(key);
  const pending = (async () => {
    ownerDomainScans += 1;
    const defs = new Map(), add = value => { if (value && /\.def$/i.test(value)) { const resolved = canonical(value) || path.resolve(value); defs.set(normalized(resolved), resolved); } };
    let remainingFiles = limits.ownerFiles, remainingDirectories = limits.ownerDirectories, remainingDefs = limits.ownerDefs;
    for (const root of roots) {
      const scanned = scanDefRoot(root, { ...limits, ownerFiles: remainingFiles, ownerDirectories: remainingDirectories, ownerDefs: remainingDefs });
      if (!scanned.complete) return { complete: false, defs: [...defs.values()], reason: scanned.reason };
      for (const value of scanned.defs) add(value);
      remainingFiles -= scanned.files; remainingDirectories -= scanned.directories; remainingDefs = limits.ownerDefs - defs.size;
      if (remainingFiles < 0 || remainingDirectories < 0 || remainingDefs < 0) return { complete: false, defs: [...defs.values()], reason: 'The cumulative ownership-domain bound was reached.' };
    }
    if (typeof vscode.workspace.findFiles === 'function') {
      const found = await vscode.workspace.findFiles('**/*.def', '**/{.git,node_modules,backups,archive,archives}/**', limits.ownerDefs + 1);
      if (found.length > limits.ownerDefs) return { complete: false, defs: [...defs.values()], reason: `The ${limits.ownerDefs}-DEF workspace ownership bound was reached.` };
      for (const uri of found) add(uri.fsPath);
      if (defs.size > limits.ownerDefs) return { complete: false, defs: [...defs.values()], reason: 'The ownership DEF bound was reached.' };
    }
    const assignments = new Map(), hashes = new Map();
    for (const filename of defs.values()) {
      const parsed = parsedAssignedCode(filename);
      if (!parsed.ok) return { complete: false, defs: [...defs.values()], reason: `An indexed DEF could not be read: ${filename}` };
      hashes.set(normalized(filename), parsed.hash);
      for (const assigned of parsed.code) {
        const target = normalized(assigned); if (!assignments.has(target)) assignments.set(target, []);
        assignments.get(target).push(filename);
      }
    }
    if (generation !== ownerCacheGeneration) return { complete: false, defs: [...defs.values()], reason: 'The ownership index changed while it was being built.' };
    return { complete: true, defs: [...defs.values()], assignments, hashes, generation };
  })();
  ownerDomainCache.set(key, pending);
  return pending;
}

async function exactFunctionOwner(vscode, filename, preliminaryScope, limits) {
  if (!filename) return { owner: '', complete: false, reason: 'No source file was supplied for ownership resolution.' };
  const target = path.resolve(filename);
  if (/\.def$/i.test(target)) return { owner: path.resolve(target), complete: true, candidates: [path.resolve(target)] };
  const allDefs = new Map(), add = value => { if (value && /\.def$/i.test(value)) { const resolved = canonical(value) || path.resolve(value); allDefs.set(normalized(resolved), resolved); } };
  const domain = authorityRoots(vscode, target, preliminaryScope), roots = domain.roots;
  if (domain.failures.length) return { owner: '', complete: false, candidates: [], roots, reason: domain.failures[0] };
  if (roots.length > limits.ownerDefs) return { owner: '', complete: false, candidates: [], roots, reason: 'The ownership root bound was reached.' };
  const indexed = await indexedDomainDefs(vscode, roots, limits);
  if (!indexed.complete) return { owner: '', complete: false, candidates: [], roots, reason: indexed.reason };
  for (const value of indexed.defs) add(value);
  if (preliminaryScope?.def) add(preliminaryScope.def);
  const open = openDocuments(vscode), dirty = [];
  for (const document of vscode.workspace.textDocuments || []) if (/\.def$/i.test(document.fileName || '')) add(document.fileName);
  if (allDefs.size > limits.ownerDefs) return { owner: '', complete: false, candidates: [], roots, reason: 'The ownership DEF bound was reached.' };
  const owners = new Map((indexed.assignments?.get(normalized(target)) || []).map(value => [normalized(value), value]));
  for (const [key, candidate] of owners) {
    const document = open.get(key);
    if (!document) {
      const parsed = parsedAssignedCode(candidate);
      if (!parsed.ok || parsed.hash !== indexed.hashes?.get(key)) return { owner: '', complete: false, candidates: [...owners.values()], roots, reason: `An assigning DEF changed before ownership publication: ${candidate}` };
    }
  }
  for (const candidate of allDefs.values()) {
    const key = normalized(candidate), document = open.get(key);
    if (!document) {
      if (!indexed.hashes?.has(key)) { const parsed = parsedAssignedCode(candidate); if (!parsed.ok) return { owner: '', complete: false, candidates: [...owners.values()], roots, reason: `A declared DEF could not be read: ${candidate}` }; if (parsed.code.some(value => normalized(value) === normalized(target))) owners.set(key, candidate); }
      continue;
    }
    const live = parsedAssignedCode(candidate, document.getText()), assignsLive = live.code.some(value => normalized(value) === normalized(target)), assignedOnDisk = owners.has(key);
    if (!live.ok || (document.isDirty && (assignsLive || assignedOnDisk))) dirty.push(candidate);
    owners.delete(key); if (assignsLive) owners.set(key, candidate);
  }
  const candidates = [...owners.values()];
  if (dirty.length) return { owner: '', complete: false, candidates, roots, dirty, reason: 'A dirty open character DEF can change ownership of this code file.' };
  if (candidates.length !== 1) return { owner: '', complete: false, candidates, reason: candidates.length ? `${candidates.length} character DEFs assign this shared code file.` : 'No character DEF assigns this code file.' };
  return { owner: candidates[0], complete: true, candidates, roots };
}

async function buildZssFunctionCatalog(vscode, seed, service = require('./map_registry_service').current(), limitOverrides = {}) {
  const filename = seed?.fsPath || seed?.fileName || (typeof seed === 'string' ? seed : '') || '';
  if (!service) return { complete: false, owner: '', entries: [], limitations: ['Project ownership service is unavailable.'] };
  const limits = limitsFor(vscode, limitOverrides), preliminaryScope = service.scope(seed);
  const ownership = await exactFunctionOwner(vscode, filename, preliminaryScope, limits);
  const scope = ownership.owner ? service.scope(vscode.Uri.file(ownership.owner)) : preliminaryScope;
  const limitations = [];
  if (!ownership.complete || !ownership.owner) limitations.push(ownership.reason || 'No unique owning character DEF could be resolved.');
  if (!scope?.def || (ownership.owner && normalized(scope.def) !== normalized(ownership.owner))) limitations.push('No owning character DEF could be resolved.');
  const open = openDocuments(vscode);
  const defDocument = ownership.owner ? open.get(normalized(ownership.owner)) : null;
  if (defDocument?.isDirty) limitations.push('The owning character DEF has unsaved file assignments.');
  if (scope?.missingDependencies?.length) limitations.push(`${scope.missingDependencies.length} assigned code file(s) are missing.`);
  if (scope?.unsupportedDependencies?.length) limitations.push(`${scope.unsupportedDependencies.length} assigned code file(s) use an unsupported grammar.`);
  const assignedCandidates = [...new Map((scope?.scopeFiles?.assigned || []).map(value => [normalized(value), path.resolve(value)])).values()];
  if (assignedCandidates.length > limits.files) limitations.push(`The assigned code file limit (${limits.files}) was exceeded.`);
  const currentDocument = open.get(normalized(filename));
  const currentGrammar=currentDocument?.languageId||(/\.zss$/i.test(filename)?'zss':/\.(?:cns|st|cmd)$/i.test(filename)?'ikemen-cns':'')||(currentDocument&&textGrammar(currentDocument,service.context)),currentIsCode=['zss','ikemen-cns'].includes(currentGrammar);
  if (currentIsCode && !assignedCandidates.some(value => normalized(value) === normalized(filename))) limitations.push('The current code file is not assigned by the resolved character DEF.');
  let ownerSnapshot = null, ownerSource = null;
  if (ownership.owner) {
    try { const loadedOwner = await readSnapshot(vscode, ownership.owner, open); ownerSnapshot = loadedOwner.snapshot; ownerSource = loadedOwner; }
    catch (error) { limitations.push('The owning character DEF could not be read.'); }
  }
  const entries = [], failures = [], dependencySnapshots = [];
  const assigned = [];
  let totalBytes = 0, recordCount = 0;
  if (ownerSource) {
    totalBytes += ownerSource.snapshot.bytes;
    if (ownerSource.snapshot.bytes > limits.fileBytes) limitations.push(`${path.basename(ownership.owner)} exceeds the per-file owner-DEF limit.`);
    else {
      const records = collectRecords(ownerSource.text, ownership.owner);
      recordCount += (records.maps?.length || 0) + (records.constants?.length || 0);
      entries.push({ uri: ownerSource.document?.uri || vscode.Uri.file(ownership.owner), filename: ownership.owner, version: ownerSource.snapshot.version, dirty: ownerSource.snapshot.dirty, hash: ownerSource.snapshot.hash, bytes: ownerSource.snapshot.bytes, records, text: ownerSource.text, sourceKind: 'owner-def' });
    }
  }
  for (const assignedFile of assignedCandidates.slice(0, limits.files)) {
    try {
      const loaded = await readSnapshot(vscode, assignedFile, open), { document, text } = loaded, bytes = loaded.snapshot.bytes;
      dependencySnapshots.push(loaded.snapshot);
      totalBytes += bytes;
      if (bytes > limits.fileBytes) { limitations.push(`${path.basename(assignedFile)} exceeds the per-file assigned-code limit.`); continue; }
      if (totalBytes > limits.totalBytes) { limitations.push('The assigned-code byte limit was exceeded.'); break; }
      const classified = document || { fileName: assignedFile, uri: vscode.Uri.file(assignedFile), languageId: '' };
      const grammar=textGrammar(classified,service.context);if(!['zss','ikemen-cns'].includes(grammar))continue;
      assigned.push(assignedFile);
      const records = collectRecords(text, assignedFile);
      recordCount += (records.functions?.length || 0) + (records.calls?.length || 0) + (records.maps?.length || 0) + (records.constants?.length || 0) + (records.resources?.length || 0);
      if (recordCount > limits.records) { limitations.push('The assigned ZSS symbol/call limit was exceeded.'); break; }
      entries.push({ uri: document?.uri || vscode.Uri.file(assignedFile), filename: assignedFile, version: loaded.snapshot.version, dirty: loaded.snapshot.dirty, hash: loaded.snapshot.hash, bytes, records, text, grammar });
    } catch (error) { failures.push({ filename: assignedFile, reason: error.message }); }
  }
  if (failures.length) limitations.push(`${failures.length} assigned code file(s) could not be read.`);
  for (const dependency of [ownership.owner, ...assignedCandidates].filter(Boolean)) service.watchDependency?.(dependency);
  return {
    complete: Boolean(ownership.owner) && limitations.length === 0,
    owner: ownership.owner || '', label: scope?.characterName || path.basename(path.dirname(ownership.owner || filename || '.')),
    assigned, entries, failures, limitations,
    authority: { owner: ownerSnapshot, target: path.resolve(filename), ownership, dependencies: dependencySnapshots, assignedCandidates: assignedCandidates.map(normalized).sort(), limits, totalBytes, recordCount },
    detail: limitations.length ? limitations.join(' ') : `${entries.length} assigned ZSS file(s) indexed for ${path.basename(ownership.owner)}.`
  };
}

async function catalogStillCurrent(vscode, catalog, service = require('./map_registry_service').current()) {
  if (!catalog?.complete || !catalog.owner || !catalog.authority?.owner || !service) return false;
  let scope;
  try { scope = service.scope(vscode.Uri.file(catalog.owner)); } catch (_) { return false; }
  if (!scope?.def || normalized(scope.def) !== normalized(catalog.owner) || scope.missingDependencies?.length || scope.unsupportedDependencies?.length) return false;
  const ownership = await exactFunctionOwner(vscode, catalog.authority.target, scope, catalog.authority.limits || DEFAULT_LIMITS);
  if (!ownership.complete || normalized(ownership.owner) !== normalized(catalog.owner)) return false;
  const assignedNow = [...new Set((scope.scopeFiles?.assigned || []).map(normalized))].sort();
  if (assignedNow.length !== catalog.authority.assignedCandidates.length || assignedNow.some((value, index) => value !== catalog.authority.assignedCandidates[index])) return false;
  const open = openDocuments(vscode);
  try {
    const owner = await readSnapshot(vscode, catalog.owner, open);
    if (owner.snapshot.dirty || owner.snapshot.hash !== catalog.authority.owner.hash || owner.snapshot.version !== catalog.authority.owner.version) return false;
    for (const dependency of catalog.authority.dependencies || []) {
      const current = await readSnapshot(vscode, dependency.filename, open), expectedVersion = Number.isInteger(dependency.version) ? dependency.version : null;
      if (current.snapshot.hash !== dependency.hash || current.snapshot.version !== expectedVersion || current.snapshot.dirty !== dependency.dirty) return false;
    }
  } catch (_) { return false; }
  return true;
}

function functionCallFindings(catalog, records, options = {}) {
  if (!catalog?.complete) return [];
  const declarations = catalog.entries.flatMap(entry => entry.records.functions.map(record => ({ ...record, filename: entry.filename, uri: entry.uri }))), findings = [];
  const ownedPrefixes = (options.ownedPrefixes || []).map(value => String(value).toLowerCase()).filter(Boolean);
  for (const call of records.calls || []) {
    const candidates = declarations.filter(declaration => declaration.name.toLowerCase() === call.name.toLowerCase());
    if (!candidates.length) {
      const owned = ownedPrefixes.some(prefix => call.name.toLowerCase().startsWith(prefix));
      if (owned) findings.push({ code: 'missing-function', severity: 'error', record: call, candidates: [], message: `Owned function ${call.name} is called but has no declaration in the complete assigned-character ZSS catalog.` });
    } else if (candidates.length > 1) {
      const files=new Map();for(const candidate of candidates){const key=normalized(candidate.filename||candidate.uri?.fsPath||'');files.set(key,(files.get(key)||0)+1);}const sameFileDuplicate=[...files.values()].some(count=>count>1);
      findings.push({ code: sameFileDuplicate?'duplicate-function':'ambiguous-function', severity: sameFileDuplicate?'error':'warning', record: call, candidates, message: sameFileDuplicate?`Function ${call.name} is declared more than once in the same assigned source. The engine keeps the first loaded declaration; remove or rename the duplicate.`:`Function ${call.name} has ${candidates.length} declarations across assigned sources. The engine uses the first compiled declaration, but the active one is not proven because exact compile order is unresolved; IKEMaker will not project an arity or inferred value contract.` });
    } else if (candidates[0].arity !== call.arity) {
      findings.push({ code: 'function-arity', severity: 'error', record: call, candidates, message: `${call.name} is called with ${call.arity} argument(s); its assigned declaration expects ${candidates[0].arity}.` });
    }
  }
  return findings;
}

module.exports = { DEFAULT_LIMITS, buildZssFunctionCatalog, catalogStillCurrent, exactFunctionOwner, functionCallFindings, functionOwnerCacheStats, hash, invalidateFunctionOwnerCache, normalized, resetFunctionOwnerCacheForTests };
