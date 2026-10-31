'use strict';

const fs = require('fs');
const path = require('path');
const { parseDef, sections, value, unquote } = require('./def_model');
const { gameRoot } = require('./character_context');
const { buildZssFunctionCatalog, catalogStillCurrent, hash, normalized } = require('./zss_function_catalog');
const { parseStateSource, STATE_TRANSFER_PROVENANCE, usesCharacterCatalog } = require('./state_transfer_model');
const { adjacentDocumentation } = require('./analyzer');

const DEFAULT_STATE_LIMITS = Object.freeze({ files: 256, fileBytes: 2 * 1024 * 1024, totalBytes: 16 * 1024 * 1024, records: 100000 });

function openDocuments(vscode) {
  return new Map((vscode.workspace.textDocuments || []).filter(document => document?.fileName).map(document => [normalized(document.fileName), document]));
}

async function readSource(vscode, filename, open = openDocuments(vscode)) {
  const document = open.get(normalized(filename));
  const text = document ? document.getText() : await fs.promises.readFile(filename, 'utf8');
  return {
    filename: path.resolve(filename), document, text,
    snapshot: { filename: path.resolve(filename), version: Number.isInteger(document?.version) ? document.version : null, dirty: Boolean(document?.isDirty), hash: hash(text), bytes: Buffer.byteLength(text, 'utf8') }
  };
}

async function dependencySnapshot(vscode, filename, open = openDocuments(vscode)) {
  const document = open.get(normalized(filename));
  if (document) return (await readSource(vscode, filename, open)).snapshot;
  try { return (await readSource(vscode, filename, open)).snapshot; }
  catch (_) { return { filename: path.resolve(filename), exists: false, version: null, dirty: false, hash: '', bytes: 0 }; }
}

function resolveCharacterStateFiles(definition, text, routing = {}, open = new Map()) {
  const parsed = parseDef(text, definition), files = sections(parsed, 'files')[0];
  if (!files) return { files: [], missing: [], candidates: [], limitations: ['The owning DEF has no [Files] section.'] };
  const characterDirectory = path.dirname(definition), root = routing.root || '', motifDirectory = routing.motif ? path.dirname(routing.motif) : '';
  const stateDirectories = [characterDirectory, root, motifDirectory, root && path.join(root, 'data')].filter(Boolean);
  const commandDirectories = [characterDirectory, root, root && path.join(root, 'data')].filter(Boolean);
  const ordered = [], missing = [], candidates = [], limitations = [], add = (filename, role, directories) => {
    if (!filename) { limitations.push(`The ${role} state assignment could not be resolved.`); return; }
    const result = resolveEngineState(unquote(filename), directories, open); candidates.push(...result.candidates);
    if (!result.filename) { missing.push(...result.candidates); limitations.push(`The assigned ${role} state file is missing: ${filename}`); return; }
    if (!ordered.some(item => normalized(item.filename) === normalized(result.filename))) ordered.push({ filename: result.filename, role });
  };
  const natural = (left, right) => String(left.key).localeCompare(String(right.key), undefined, { numeric: true, sensitivity: 'base' });
  for (const entry of (files.entries || []).filter(entry => /^st\d*$/i.test(entry.key || '')).sort(natural)) add(entry.value || '', entry.key, stateDirectories);
  const command = value(files, 'cmd', '');
  if (command) add(command, 'cmd', commandDirectories);
  const commonEntry = (files.entries || []).find(entry => /^stcommon$/i.test(entry.key || ''));
  if (commonEntry) add(commonEntry.value, 'stcommon', stateDirectories);
  return { files: ordered, missing, candidates, limitations };
}

function splitIniValues(input) {
  return String(input || '').split(',').map(value => unquote(value.trim())).filter(Boolean);
}

function resolveEngineState(filename, searchDirectories, open = new Map()) {
  const candidates = [];
  const add = value => { if (value && !candidates.some(candidate => normalized(candidate) === normalized(value))) candidates.push(path.resolve(value)); };
  const bases = path.isAbsolute(filename) ? [filename] : (searchDirectories || []).map(directory => path.join(directory, filename));
  for (const value of bases) add(value);
  if (!/\.zss$/i.test(filename)) for (const value of bases) add(`${value}.zss`);
  return { filename: candidates.find(candidate => open.has(normalized(candidate)) || fs.existsSync(candidate)) || '', candidates };
}

function commonEntries(text, filename) {
  const result = new Map();
  for (const common of sections(parseDef(text, filename), 'common')) for (const entry of common.entries || []) {
    if (/^states\d*$/i.test(entry.key || '') && !result.has(entry.normalized)) result.set(entry.normalized, { ...entry });
  }
  return result;
}

function resolveEngineCommonStates(defaultConfig, defaultText, userConfig, userText, searchDirectories, open = new Map()) {
  const merged = commonEntries(defaultText, defaultConfig);
  for (const [key, entry] of commonEntries(userText, userConfig)) merged.set(key, entry);
  const files = [], missing = [], candidates = [], limitations = [];
  const ordered = [...merged.values()].sort((left, right) => String(left.key).localeCompare(String(right.key), undefined, { numeric: true, sensitivity: 'base' }));
  for (const entry of ordered) {
    if (!/^states/i.test(entry.key || '')) continue;
    for (const assigned of splitIniValues(entry.value)) {
      const resolved = resolveEngineState(assigned, searchDirectories, open), filename = resolved.filename;
      candidates.push(...resolved.candidates);
      if (!filename) { missing.push(...resolved.candidates); limitations.push(`The runtime common-state assignment is missing: ${assigned}`); }
      else if (!files.some(item => normalized(item.filename) === normalized(filename))) files.push({ filename, role: `config:${entry.key}` });
    }
  }
  return { files, missing: [...new Set(missing.map(item => path.resolve(item)))], candidates: [...new Set(candidates.map(item => path.resolve(item)))], limitations };
}

function configValue(defaultText, defaultFile, userText, userFile, sectionName, key) {
  const read = (text, file) => {
    const wanted = String(key).toLowerCase();
    for (const section of sections(parseDef(text || '', file), sectionName)) for (const item of section.entries || []) if (item.normalized === wanted) return item.value;
    return '';
  };
  return unquote(read(userText, userFile) || read(defaultText, defaultFile));
}

function firstExisting(candidates, open) { return candidates.find(candidate => open.has(normalized(candidate)) || fs.existsSync(candidate)) || ''; }

function defaultConfigCandidates(root, target, overrides = {}) {
  const candidates = [], add = value => { if (value && !candidates.some(item => normalized(item) === normalized(value))) candidates.push(path.resolve(value)); };
  add(path.join(root, 'resources', 'defaultConfig.ini'));
  try {
    const engineRuntime = require('./engine_runtime');
    const binding = engineRuntime.targetFor(root, target), certification = overrides.engineDefaultConfigCertification || {};
    if (overrides.engineDefaultConfig && certification.certified === true && certification.buildId === binding.target.buildId && certification.executableSha256 && certification.executableSha256 === binding.target.executableSha256) add(overrides.engineDefaultConfig);
  } catch (_) {}
  return candidates;
}

function stateLimits(base, overrides = {}) {
  const inherited = base?.authority?.limits || {};
  return {
    files: Math.max(1, Number(overrides.files || inherited.files) || DEFAULT_STATE_LIMITS.files),
    fileBytes: Math.max(1024, Number(overrides.fileBytes || inherited.fileBytes) || DEFAULT_STATE_LIMITS.fileBytes),
    totalBytes: Math.max(1024, Number(overrides.totalBytes || inherited.totalBytes) || DEFAULT_STATE_LIMITS.totalBytes),
    records: Math.max(100, Number(overrides.records || inherited.records) || DEFAULT_STATE_LIMITS.records)
  };
}

async function buildStateTransferCatalog(vscode, seed, service = require('./map_registry_service').current(), overrides = {}) {
  const target = seed?.fsPath || seed?.fileName || (typeof seed === 'string' ? seed : '');
  const base = await buildZssFunctionCatalog(vscode, seed?.uri || seed, service, overrides), limits = stateLimits(base, overrides), limitations = [...(base.limitations || [])];
  if (!base.owner) return { complete: false, owner: '', entries: [], definitions: [], limitations, provenance: STATE_TRANSFER_PROVENANCE, authority: { functionCatalog: base, target: path.resolve(target || '.') } };
  const open = openDocuments(vscode), snapshots = [], entries = [], definitions = [];
  let owner;
  try { owner = await readSource(vscode, base.owner, open); }
  catch (_) { limitations.push('The owning character DEF could not be read for state load order.'); }
  if (owner?.snapshot.dirty) limitations.push('The owning character DEF has unsaved state assignments.');
  let ordered = [], runtimeOrdered = [], missingWatchTargets = [], resolutionCandidates = [];
  const root = gameRoot(base.owner), userConfig = root ? path.resolve(root, 'save', 'config.ini') : '';
  if (!root) limitations.push('The selected character game root is unknown; runtime common-state authority cannot be proven.');
  let defaultConfig = '', defaultText = '', userText = '', runtimeCandidates = resolutionCandidates, motif = '', fight = '';
  if (root) {
    const defaults = defaultConfigCandidates(root, target, overrides); defaultConfig = firstExisting(defaults, open);
    runtimeCandidates.push(...defaults, userConfig);
    if (!defaultConfig) limitations.push('The selected engine defaultConfig.ini resource could not be proven; runtime common-state diagnostics are suppressed.');
    else try { const loaded = await readSource(vscode, defaultConfig, open); snapshots.push(loaded.snapshot); defaultText = loaded.text; if (loaded.snapshot.dirty) limitations.push('The selected engine defaultConfig.ini has unsaved changes.'); } catch (_) { limitations.push('The selected engine defaultConfig.ini could not be read.'); }
    if (userConfig && (open.has(normalized(userConfig)) || fs.existsSync(userConfig))) try { const loaded = await readSource(vscode, userConfig, open); snapshots.push(loaded.snapshot); userText = loaded.text; if (loaded.snapshot.dirty) limitations.push('The runtime config.ini has unsaved common-state assignments.'); } catch (_) { limitations.push('The runtime config.ini could not be read.'); }
    if (defaultText) {
      const motifName = configValue(defaultText, defaultConfig, userText, userConfig, 'config', 'motif');
      const motifCandidates = motifName ? [path.resolve(root, motifName), path.resolve(root, 'data', motifName)] : [];
      motif = firstExisting(motifCandidates, open); runtimeCandidates.push(...motifCandidates);
      if (!motif) limitations.push('The selected motif DEF could not be resolved from the effective engine configuration.');
      if (motif) try {
        const loaded = await readSource(vscode, motif, open); snapshots.push(loaded.snapshot); if (loaded.snapshot.dirty) limitations.push('The selected motif DEF has unsaved file routing.');
        const fightName = unquote(value(sections(parseDef(loaded.text, motif), 'files')[0], 'fight', ''));
        const fightCandidates = fightName ? [path.resolve(path.dirname(motif), fightName), path.resolve(root, fightName), path.resolve(root, 'data', fightName)] : [];
        fight = firstExisting(fightCandidates, open); runtimeCandidates.push(...fightCandidates);
        if (!fight) limitations.push('The selected fight DEF could not be resolved from the motif.');
        else { const fightLoaded = await readSource(vscode, fight, open); snapshots.push(fightLoaded.snapshot); if (fightLoaded.snapshot.dirty) limitations.push('The selected fight DEF has unsaved file routing.'); }
      } catch (_) { limitations.push('The selected motif or fight DEF could not be read.'); }
      if (motif && fight) {
        const searchDirectories = [path.dirname(base.owner), path.dirname(motif), path.dirname(fight), root, path.join(root, 'data')];
        const common = resolveEngineCommonStates(defaultConfig, defaultText, userConfig, userText, searchDirectories, open);
        runtimeOrdered.push(...common.files); missingWatchTargets.push(...common.missing); runtimeCandidates.push(...common.candidates); limitations.push(...common.limitations);
      }
    }
  }
  if (owner) {
    const character = resolveCharacterStateFiles(base.owner, owner.text, { root, motif }, open);
    ordered.push(...character.files); missingWatchTargets.push(...character.missing); resolutionCandidates.push(...character.candidates); runtimeCandidates.push(...character.candidates); limitations.push(...character.limitations);
  }
  ordered.push(...runtimeOrdered);
  ordered = ordered.filter((item, index, values) => values.findIndex(value => normalized(value.filename) === normalized(item.filename)) === index);
  if (ordered.length > limits.files) limitations.push(`The runtime state-file limit (${limits.files}) was exceeded.`);
  let totalBytes = 0, recordCount = 0;
  for (let order = 0; order < ordered.length && order < limits.files; order += 1) {
    const source = ordered[order];
    try {
      const loaded = await readSource(vscode, source.filename, open); snapshots.push(loaded.snapshot);
      totalBytes += loaded.snapshot.bytes;
      if (loaded.snapshot.bytes > limits.fileBytes) { limitations.push(`${path.basename(source.filename)} exceeds the per-file state-source limit.`); continue; }
      if (totalBytes > limits.totalBytes) { limitations.push('The runtime state-source byte limit was exceeded.'); break; }
      const languageId = loaded.document?.languageId || (/\.zss$/i.test(source.filename) ? 'zss' : 'ikemen-cns'), parsed = parseStateSource(loaded.text, source.filename, languageId, { capabilities: overrides.capabilities });
      recordCount += parsed.declarations.length + parsed.transfers.length;
      if (recordCount > limits.records) { limitations.push('The runtime state record limit was exceeded.'); break; }
      const entry = { ...source, order, uri: loaded.document?.uri || vscode.Uri.file(source.filename), version: loaded.snapshot.version, dirty: loaded.snapshot.dirty, hash: loaded.snapshot.hash, bytes: loaded.snapshot.bytes, text: loaded.text, grammar: parsed.grammar, declarations: parsed.declarations, transfers: parsed.transfers };
      entries.push(entry);
      const sourceLines=loaded.text.split(/\r?\n/);
      for (const declaration of parsed.declarations) if (!declaration.dynamic) {
        const documentation=adjacentDocumentation(sourceLines,declaration.line,{commentMarker:parsed.grammar==='cns'?';':'#'}).documentation;
        definitions.push({ ...declaration, value: declaration.value, filename: source.filename, uri: entry.uri, order, role: source.role, grammar: parsed.grammar,documentation });
      }
    } catch (_) { limitations.push(`An assigned runtime state file could not be read: ${source.filename}`); }
  }
  const active = new Map();
  for (const definition of definitions) if (definition.value >= 0 && !active.has(definition.value)) active.set(definition.value, definition);
  const allCandidateTargets = [...new Map(runtimeCandidates.filter(Boolean).map(item => [normalized(item), path.resolve(item)])).values()], candidateLimit = limits.files * 4;
  if (allCandidateTargets.length > candidateLimit) limitations.push(`The runtime precedence-candidate bound (${candidateLimit}) was exceeded.`);
  const candidateTargets = allCandidateTargets.slice(0, candidateLimit);
  for (const candidate of candidateTargets) if (!snapshots.some(item => normalized(item.filename) === normalized(candidate))) snapshots.push(await dependencySnapshot(vscode, candidate, open));
  const watchTargets = [...new Map([...candidateTargets, ...ordered.map(item => item.filename), ...missingWatchTargets].filter(Boolean).map(item => [normalized(item), path.resolve(item)])).values()];
  if (watchTargets.length > limits.files * 2) limitations.push('The runtime state dependency-watch bound was exceeded.');
  for (const dependency of watchTargets.slice(0, limits.files * 2)) service?.watchDependency?.(dependency);
  return {
    complete: Boolean(base.complete) && limitations.length === 0,
    owner: base.owner,
    entries, definitions, active,
    limitations,
    provenance: STATE_TRANSFER_PROVENANCE,
    authority: { functionCatalog: base, target: path.resolve(target), root: root || '', defaultConfig, userConfig,
      defaultConfigProvenance: defaultConfig ? { filename: defaultConfig, hash: snapshots.find(item => normalized(item.filename) === normalized(defaultConfig))?.hash || '', kind: normalized(defaultConfig) === normalized(path.join(root || '.', 'resources', 'defaultConfig.ini')) ? 'runtime-resource' : 'certified-selected-artifact' } : null,
      dependencies: snapshots, limits, totalBytes, recordCount, ordered: ordered.map(item => ({ filename: normalized(item.filename), role: item.role })) },
    detail: limitations.length ? limitations.join(' ') : `${definitions.length} StateDef declaration(s) indexed in exact runtime compile order.`
  };
}

async function stateCatalogStillCurrent(vscode, catalog, service = require('./map_registry_service').current()) {
  if (!catalog?.complete || !catalog.authority?.functionCatalog || !await catalogStillCurrent(vscode, catalog.authority.functionCatalog, service)) return false;
  const open = openDocuments(vscode);
  try {
    for (const expected of catalog.authority.dependencies || []) {
      const current = await dependencySnapshot(vscode, expected.filename, open), version = Number.isInteger(expected.version) ? expected.version : null;
      if (Boolean(current.exists === false) !== Boolean(expected.exists === false) || current.hash !== expected.hash || current.version !== version || current.dirty !== expected.dirty) return false;
    }
  } catch (_) { return false; }
  return true;
}

function duplicateDeclarationFindings(parsed) {
  const groups = new Map(), findings = [];
  for (const declaration of parsed.declarations || []) if (!declaration.dynamic) {
    if (!groups.has(declaration.value)) groups.set(declaration.value, []);
    groups.get(declaration.value).push(declaration);
  }
  for (const [state, records] of groups) if (records.length > 1) for (const record of records) findings.push({
    code: 'duplicate-statedef', severity: parsed.grammar === 'zss' ? 'error' : 'warning', record,
    message: `StateDef ${state} is declared ${records.length} times in this ${parsed.grammar.toUpperCase()} file; runtime selection depends on declaration order.`
  });
  return findings;
}

function stateTransferFindings(catalog, parsed) {
  const findings = duplicateDeclarationFindings(parsed);
  for (const record of parsed.transfers || []) {
    if (!['changestate', 'targetstate', 'selfstate', 'runstate', 'helper'].includes(record.kind) || record.dynamic || !Number.isInteger(record.literal)) continue;
    if (record.literal < 0 && !['helper','runstate'].includes(record.kind)) findings.push({ code: 'negative-state-transfer', severity: 'error', record, message: `${record.controller} transfers to ${record.literal}; IKEMEN clamps state-change destinations below zero and logs the invalid transfer.` });
    else if (record.literal>=0&&catalog?.complete && usesCharacterCatalog(record) && !(catalog.definitions || []).some(definition => definition.value === record.literal)) findings.push({ code: 'missing-state', severity: 'error', record, message: record.kind==='helper'?`Helper starts in StateDef ${record.literal}, which is absent from the complete runtime state catalog for this character.`:`${record.controller} references StateDef ${record.literal}, which is absent from the complete runtime state catalog for this character.` });
  }
  return findings;
}

function definitionsForState(catalog, value) { return catalog?.complete ? (catalog.definitions || []).filter(definition => definition.value === value) : []; }
function referencesForState(catalog, value) {
  if (!catalog?.complete) return [];
  return (catalog.entries || []).flatMap(entry => (entry.transfers || []).filter(record => !record.dynamic && record.literal === value && usesCharacterCatalog(record)).map(record => ({ ...record, filename: entry.filename, uri: entry.uri })));
}

module.exports = { DEFAULT_STATE_LIMITS, buildStateTransferCatalog, definitionsForState, duplicateDeclarationFindings, referencesForState, resolveCharacterStateFiles, resolveEngineCommonStates, stateCatalogStillCurrent, stateTransferFindings };
