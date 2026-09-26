'use strict';

const path = require('path');
const fs = require('fs');
const model = require('./map_registry_model');
const { textGrammar, supportedNative } = require('./map_registry_grammar');

let singleton;

function resolveCharacterDef(filename, authoring, picker, contextRegistry) {
  const explicitDef = /\.def$/i.test(filename || '') && picker.isCharacterDef(filename) ? path.resolve(filename) : '';
  const nearestDef = picker.nearestCharacterDef(filename);
  const authoringDef = authoring?.files?.find((item) => /\.def$/i.test(item) && picker.isCharacterDef(item));
  const normalizedFilename = filename ? path.resolve(filename).toLowerCase() : '';
  const authoringOwnsSeed = Boolean(authoringDef && normalizedFilename && (
    (authoring.files || []).some((item) => path.resolve(item).toLowerCase() === normalizedFilename)
    || (authoring.root && contextRegistry.inside(filename, authoring.root))
  ));
  return { def: explicitDef || nearestDef || (authoringOwnsSeed ? authoringDef : ''), authoringOwnsSeed };
}

function descendantBoundaries(root, configuredRoots = []) {
  const base = path.resolve(root || '').toLowerCase(), prefix = `${base}${path.sep}`;
  return [...new Set(configuredRoots.filter(Boolean).map((item) => path.resolve(item)).filter((item) => {
    const candidate = item.toLowerCase();
    return candidate !== base && candidate.startsWith(prefix);
  }))];
}

class MapRegistryService {
  constructor(vscode, context) {
    this.vscode = vscode;
    this.context = context;
    this.cache = new Map();
    this.listeners = new Set();
    this.dependencyWatchers = new Map();
    this.generation = 0;
  }

  key(seed) {
    const uri = seed?.fsPath ? seed : this.vscode.window.activeTextEditor?.document?.uri;
    return this.vscode.workspace.getWorkspaceFolder(uri)?.uri?.fsPath || this.vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || '';
  }

  invalidate(filename) {
    this.generation += 1;
    // Project results can include assigned code outside their character root,
    // and a DEF edit can replace that dependency set. Conservative global
    // invalidation prevents a warm cache from hiding either change.
    this.cache.clear();
    for (const listener of this.listeners) listener();
  }

  onDidChange(listener) { this.listeners.add(listener); return { dispose: () => this.listeners.delete(listener) }; }

  watchDependency(filename) {
    if (!filename || !this.vscode.workspace.createFileSystemWatcher) return;
    const key = path.resolve(filename).toLowerCase(); if (this.dependencyWatchers.has(key)) return;
    const watcher = this.vscode.workspace.createFileSystemWatcher(new this.vscode.RelativePattern(path.dirname(filename), path.basename(filename)));
    watcher.onDidChange((uri) => this.invalidate(uri)); watcher.onDidCreate((uri) => this.invalidate(uri)); watcher.onDidDelete((uri) => this.invalidate(uri));
    this.dependencyWatchers.set(key, watcher); this.context?.subscriptions?.push(watcher);
  }

  eligible(filename) {
    const uri = this.vscode.Uri.file(filename);
    return Boolean(supportedNative(filename) || textGrammar({ fileName: filename, uri, languageId: '' }, this.context));
  }

  directCodeFiles(root) {
    if (!root || !fs.existsSync(root)) return [];
    try { return fs.readdirSync(root, { withFileTypes: true }).filter((item) => item.isFile()).map((item) => path.join(root, item.name)).filter((item) => this.eligible(item)); } catch (_) { return []; }
  }

  recursiveCodeFiles(root, options = {}) {
    const output = [], skipped = [], depth = Number.isInteger(options.depth) ? options.depth : 5;
    const excluded = new Set(['.git', '.ikemen-tools', '.pnpm-store', 'node_modules', 'dist', 'out', 'output', 'outputs', 'build', 'backup', 'backups', '_backup', 'archive', 'archives', 'tmp', 'temp', 'test', 'tests', 'test-fixtures', 'fixtures', 'development', '_development', 'reference', 'offline']);
    const boundaries = new Set((options.boundaries || []).filter(Boolean).map((item) => path.resolve(item).toLowerCase()));
    const isBoundary = (folder, level) => {
      if (!level) return false;
      const resolved = path.resolve(folder).toLowerCase();
      return boundaries.has(resolved)
        || fs.existsSync(path.join(folder, 'Ikemen_GO.exe'))
        || fs.existsSync(path.join(folder, 'external', 'script', 'main.lua'))
        || fs.existsSync(path.join(folder, '.ikemen', 'project-registry.json'));
    };
    const walk = (folder, level) => {
      if (!folder || !fs.existsSync(folder)) return;
      if (level > depth) { skipped.push({ path: folder, reason: 'depth limit' }); return; }
      if (isBoundary(folder, level)) { skipped.push({ path: folder, reason: 'nested project boundary' }); return; }
      let items; try { items = fs.readdirSync(folder, { withFileTypes: true }); } catch (error) { skipped.push({ path: folder, reason: `unreadable: ${error.message}` }); return; }
      for (const item of items) {
        const filename = path.join(folder, item.name);
        if (item.isDirectory()) {
          const normalized = item.name.toLowerCase();
          if (excluded.has(normalized) || normalized.startsWith('_backup_') || normalized.startsWith('backup_') || normalized.startsWith('archive_') || normalized.startsWith('.ikemaker-accidental-copy-quarantine')) continue;
          walk(filename, level + 1);
        }
        else if (item.isFile() && this.eligible(filename)) output.push(filename);
      }
    };
    walk(root, 0); return { files: output, skipped };
  }

  scope(seed) {
    const filename = seed?.fsPath || (typeof seed === 'string' ? seed : '') || this.vscode.window.activeTextEditor?.document?.fileName || '';
    const workspaceRoot = this.key(seed), authoring = require('./authoring_context_registry').currentContext();
    const projectInfo = (probe) => {
      try {
        const metadata = require('./metadata_registry'), registryFile = metadata.find(probe);
        if (!registryFile) return null;
        const loaded = metadata.read(registryFile);
        const context = require('./project_context_model').contextFor(probe, loaded.root, loaded.registry);
        return { loaded, project: context.project || null, character: context.character || null };
      } catch (_) { return null; }
    };
    const gameFor = (item) => ({ sf6: 'SF6', dsvssf: 'DvS', dvs: 'DvS', ds4: 'DS4', hdbz: 'HDBZ' })[String(item?.id || '').toLowerCase()] || '';
    const picker = require('./character_picker');
    // An explicit DEF or an unambiguous DEF beside the requested seed always
    // outranks a retained visual panel. A panel may supply context only for a
    // file it actually owns; it must never redirect another character scan.
    const { def, authoringOwnsSeed } = resolveCharacterDef(filename, authoring, picker, require('./authoring_context_registry'));
    if (def) {
      const assets = require('./related_work').resolveAssigned(def), assignedAll = [...new Set(assets.code || [])];
      const missingDependencies = assignedAll.filter((item) => item && !fs.existsSync(item));
      const unsupportedDependencies = assignedAll.filter((item) => item && fs.existsSync(item) && !this.eligible(item));
      const dependencies = assignedAll.filter((item) => item && fs.existsSync(item) && this.eligible(item));
      const info = projectInfo(def), activeProject = info?.project, characterRoot = path.dirname(def), templateBase = info?.loaded?.root || '';
      const projectRoots = (activeProject?.roots || []).map((item) => path.isAbsolute(item) ? item : path.resolve(templateBase, item)).filter((item) => fs.existsSync(item));
      const configuredRoots = (info?.loaded?.registry?.projects || []).flatMap((project) => (project.roots || []).map((item) => path.isAbsolute(item) ? item : path.resolve(templateBase, item))).filter((item) => fs.existsSync(item));
      const currentFile = filename && this.eligible(filename) ? path.resolve(filename) : (authoringOwnsSeed ? (authoring?.files || []).find((item) => this.eligible(item)) : '') || dependencies[0] || '';
      const characterDiscovery = this.recursiveCodeFiles(characterRoot, { boundaries: descendantBoundaries(characterRoot, configuredRoots) });
      const characterFiles = characterDiscovery.files;
      const universalFiles = this.directCodeFiles(templateBase);
      const gameDiscoveries = projectRoots.map((root) => this.recursiveCodeFiles(root, { boundaries: descendantBoundaries(root, configuredRoots) }));
      const gameTemplateFiles = gameDiscoveries.flatMap((item) => item.files);
      const discoverySkips = [...characterDiscovery.skipped, ...gameDiscoveries.flatMap((item) => item.skipped)];
      const templateFiles = [...new Set([...universalFiles, ...gameTemplateFiles].map((item) => path.resolve(item)))];
      const union = (...sets) => [...new Set(sets.flat().filter(Boolean).map((item) => path.resolve(item)))];
      const scopeFiles = {
        current: union(currentFile), character: union(characterFiles), template: union(templateFiles),
        assigned: union(dependencies), available: union(currentFile, characterFiles, templateFiles, dependencies)
      };
      const characterName = info?.character?.name || path.basename(characterRoot), label = activeProject?.name || characterName;
      return {
        root: characterRoot, def, dependencies, missingDependencies, unsupportedDependencies, discoverySkips,
        label, characterName, projectId: activeProject?.id || '', game: gameFor(activeProject), resolved: Boolean(gameFor(activeProject)), identity: def,
        templateBase, projectRoots, currentFile, scopeFiles
      };
    }
    return { root: workspaceRoot, dependencies: [], missingDependencies: [], unsupportedDependencies: [], discoverySkips: [], label: 'workspace fallback', characterName: '', projectId: '', game: '', resolved: false, identity: filename || workspaceRoot, currentFile: filename, scopeFiles: { current: [], character: [], template: [], assigned: [], available: [] } };
  }

  async scan(seed, options = {}) {
    const scope = this.scope(seed), root = scope.root;
    if (!root) return { root: '', entries: [], occurrences: [], complete: true, files: 0, limit: 0, detail: 'Open a project folder to collect maps.' };
    const dependencyIdentity = Object.entries(scope.scopeFiles || {}).map(([id, files]) => `${id}:${files.map((item) => path.resolve(item).toLowerCase()).sort().join('|')}`).join('\0');
    const cacheKey = [path.resolve(root).toLowerCase(), path.resolve(scope.identity || root).toLowerCase(), scope.projectId || '', dependencyIdentity].join('\0');
    if (!options.refresh && this.cache.has(cacheKey)) return this.cache.get(cacheKey);
    const limit = Math.max(1, Number(this.vscode.workspace.getConfiguration('ikemenZss').get('maxAuditFiles', 1000)) || 1000);
    const generation = this.generation;
    const prioritized = [scope.scopeFiles?.assigned || [], scope.scopeFiles?.current || [], scope.scopeFiles?.character || [], scope.scopeFiles?.template || [], scope.scopeFiles?.available || []].flat();
    const allFiles = [...new Set(prioritized.filter((item) => item && fs.existsSync(item) && this.eligible(item)).map((item) => path.resolve(item)))];
    for (const filename of [...allFiles, scope.def].filter(Boolean)) this.watchDependency(filename);
    const selected = allFiles.slice(0, limit).map((item) => this.vscode.Uri.file(item));
    const open = new Map((this.vscode.workspace.textDocuments || []).map((document) => [path.resolve(document.fileName).toLowerCase(), document]));
    const occurrences = [], indexedFiles = [], readFailures = [];
    for (const uri of selected) {
      try {
        const document = open.get(path.resolve(uri.fsPath).toLowerCase()) || await this.vscode.workspace.openTextDocument(uri);
        const language = textGrammar(document, this.context);
        if (!language) { readFailures.push({ path: uri.fsPath, reason: 'unsupported text grammar' }); continue; }
        occurrences.push(...model.occurrences(document.getText(), uri.fsPath, language)); indexedFiles.push(path.resolve(uri.fsPath));
      } catch (error) { readFailures.push({ path: uri.fsPath, reason: error.message }); }
    }
    const allEntries = model.aggregate(occurrences, { applicability: scope.resolved ? `Resolved project: ${scope.label}` : 'Unresolved workspace fallback' });
    // Confirmed Author > Game namespaces are filtered to the active game.
    // Unnamespaced entries remain available only when they were actually found
    // in this project's resolved files/dependencies and therefore represent
    // shared or legacy project code.
    const filtered = scope.resolved ? allEntries.filter((entry) => !entry.namespaceConfirmed || entry.game.toLowerCase() === scope.game.toLowerCase()) : [];
    const membership = Object.fromEntries(Object.entries(scope.scopeFiles || {}).map(([id, files]) => [id, new Set(files.map((item) => path.resolve(item).toLowerCase()))]));
    const badgeLabel = { current: 'Current', character: scope.characterName || 'Character', template: 'Template', assigned: 'Assigned', available: 'Available' };
    const entries = filtered.map((entry) => {
      const scopeIds = Object.entries(membership).filter(([, files]) => entry.files.some((file) => files.has(path.resolve(file).toLowerCase()))).map(([id]) => id);
      const sourceBadges = [...new Set(scopeIds.filter((id) => id !== 'available').map((id) => badgeLabel[id]))];
      const scopedOccurrences = entry.occurrences.map((occurrence) => ({ ...occurrence, scopeIds: Object.entries(membership).filter(([, files]) => files.has(path.resolve(occurrence.filename).toLowerCase())).map(([id]) => id) }));
      return { ...entry, occurrences: scopedOccurrences, scopeIds, sourceBadges, assigned: scopeIds.includes('assigned') };
    });
    const indexedSet = new Set(indexedFiles.map((item) => item.toLowerCase()));
    const scopeDefs = [
      { id: 'current', label: scope.currentFile ? `Current File · ${path.basename(scope.currentFile)}` : 'Current File', description: scope.currentFile || 'No captured code file' },
      { id: 'character', label: `${scope.characterName || 'Character'} Files`, description: scope.root },
      { id: 'template', label: 'Template Files', description: 'Universal shared files plus the active game template' },
      { id: 'assigned', label: 'Assigned Runtime Files', description: `${scope.dependencies.length} resolved assignment(s)${scope.missingDependencies?.length ? `; ${scope.missingDependencies.length} missing` : ''}`, default: true },
      { id: 'available', label: `All Available · ${scope.characterName || scope.label}`, description: 'Character, template, assigned, and current-file union' }
    ].map((item) => ({
      ...item,
      discoveredFileCount: membership[item.id]?.size || 0,
      fileCount: [...(membership[item.id] || [])].filter((filename) => indexedSet.has(filename)).length,
      mapCount: new Set(entries.filter((entry) => entry.scopeIds.includes(item.id)).map((entry) => entry.name.toLowerCase())).size
    }));
    const scopeDetail = scope.resolved ? `Project: ${scope.label} (${scope.game}).` : 'Project/game unresolved; choose or configure a project before maps can be inserted or completed.';
    const limitations = [];
    if (allFiles.length > limit) limitations.push(`The ${limit}-file audit limit was reached; ${allFiles.length - limit} eligible file(s) were not indexed.`);
    if (scope.missingDependencies?.length) limitations.push(`${scope.missingDependencies.length} assigned code file(s) are missing.`);
    if (scope.unsupportedDependencies?.length) limitations.push(`${scope.unsupportedDependencies.length} assigned file(s) use an unsupported or unselected text grammar.`);
    if (scope.discoverySkips?.length) limitations.push(`${scope.discoverySkips.length} folder(s) were skipped at an ownership or traversal boundary.`);
    if (readFailures.length) limitations.push(`${readFailures.length} selected file(s) could not be indexed.`);
    const complete = scope.resolved && !limitations.length;
    const limitation = limitations.length ? limitations.join(' ') : `${indexedFiles.length} code file(s) indexed.`;
    const result = { cacheKey, root, def: scope.def, currentFile: scope.currentFile, characterName: scope.characterName, projectId: scope.projectId, game: scope.game, occurrences, entries, scopes: scopeDefs, defaultScope: 'assigned', complete, partial: !complete, files: indexedFiles.length, discoveredFiles: allFiles.length, indexedFiles, missingFiles: scope.missingDependencies || [], unsupportedFiles: scope.unsupportedDependencies || [], discoverySkips: scope.discoverySkips || [], readFailures, limit, scannedAt: Date.now(), detail: `${scopeDetail} ${limitation}` };
    if (generation !== this.generation) return this.scan(seed, { refresh: true });
    this.cache.set(cacheKey, result);
    return result;
  }

  async entry(name, seed, scopeId = '') {
    const registry = await this.scan(seed);
    return registry.entries.find((item) => (!scopeId || item.scopeIds.includes(scopeId)) && item.name.toLowerCase() === String(name || '').toLowerCase());
  }
}

function initialize(vscode, context) {
  if (!singleton) singleton = new MapRegistryService(vscode, context);
  return singleton;
}

function current() { return singleton; }

module.exports = { MapRegistryService, resolveCharacterDef, descendantBoundaries, initialize, current };
