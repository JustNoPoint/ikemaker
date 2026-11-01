'use strict';

const fs = require('fs');
const path = require('path');
const { SURFACES, byViewType } = require('../src/viewer_surface_registry');
const { SLOTS, DIMENSIONS, SPECIALIST_ACTION_IDS } = require('../src/viewer_toolbar_contract');
const { CAPABILITIES } = require('../src/viewer_source_capability');
const { buildActionCatalog, publicCommandCatalog } = require('../src/viewer_action_registry');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'src');
const REPORT = path.join(ROOT, 'data', 'viewer-contract-audit.json');
const BUILTIN_COMMANDS = new Set(['undo', 'redo', 'actions.find', 'editor.action.startFindReplaceAction']);

function sorted(values) { return [...new Set(values)].sort((a, b) => a.localeCompare(b)); }
function sourceFiles() { return fs.readdirSync(SOURCE).filter((name) => name.endsWith('.js')).sort(); }
function literal(argument, constants) {
  const value = String(argument || '').trim(), quoted = value.match(/^(['"`])([^'"`]+)\1$/);
  if (quoted) return quoted[2];
  return constants.get(value) || '';
}

function constantsIn(text) {
  const constants = new Map();
  for (const match of text.matchAll(/\bconst\s+([A-Z][A-Z0-9_]*)\s*=\s*(['"`])([^'"`]+)\2/g)) constants.set(match[1], match[3]);
  return constants;
}

function dynamicPanelViewTypes(ownerModule, expression) {
  if (ownerModule !== 'visual_authoring_browser_service.js' || String(expression).trim() !== 'specification.viewType') return [];
  const companion = fs.readFileSync(path.join(SOURCE, 'visual_authoring_browser_companion.js'), 'utf8'), constants = constantsIn(companion);
  const handoff = companion.match(/\bcreatePanel\(\s*\{\s*viewType\s*:\s*([A-Z][A-Z0-9_]*)\b/), viewType = handoff ? literal(handoff[1], constants) : '';
  if (!viewType) throw new Error('Visual Authoring Browser panel factory no longer has one statically reviewable VIEW_TYPE handoff.');
  return [{ viewType, discovery: 'createWebviewPanel-factory' }];
}

function discoveredSourceSurfaces() {
  const found = [];
  for (const ownerModule of sourceFiles()) {
    const text = fs.readFileSync(path.join(SOURCE, ownerModule), 'utf8'), constants = constantsIn(text);
    for (const match of text.matchAll(/createWebviewPanel\(\s*([^,\r\n]+)/g)) {
      const viewType = literal(match[1], constants);
      if (viewType) found.push({ viewType, ownerModule, discovery: 'createWebviewPanel' });
      else {
        const dynamic = dynamicPanelViewTypes(ownerModule, match[1]);
        if (!dynamic.length) throw new Error(`Unresolved createWebviewPanel view type in ${ownerModule}: ${match[1].trim()}`);
        for (const item of dynamic) found.push({ ...item, ownerModule });
      }
    }
    for (const api of ['registerWebviewViewProvider', 'createTreeView', 'registerTreeDataProvider', 'registerCustomEditorProvider']) {
      const expression = new RegExp(`${api}\\(\\s*([^,\\r\\n\\)]+)`, 'g');
      for (const match of text.matchAll(expression)) {
        const viewType = literal(match[1], constants);
        if (viewType) found.push({ viewType, ownerModule, discovery: api });
      }
    }
    if (ownerModule === 'docking_prototype.js') {
      for (const match of text.matchAll(/\{\s*id:\s*(['"])(ikemen\.dockingPrototype\.[^'"]+)\1/g)) {
        found.push({ viewType: match[2], ownerModule, discovery: 'dynamic-webview-provider' });
      }
    }
  }
  return found;
}

function packageSurfaces(packageJson) {
  const found = [];
  for (const views of Object.values(packageJson.contributes?.views || {})) for (const view of views) {
    found.push({ viewType: view.id, ownerModule: 'package.json', discovery: view.type === 'webview' ? 'contributed-webview' : 'contributed-tree-view' });
  }
  for (const editor of packageJson.contributes?.customEditors || []) found.push({ viewType: editor.viewType, ownerModule: 'package.json', discovery: 'custom-editor' });
  return found;
}

function discoverSurfaces(packageJson = require('../package.json')) {
  const grouped = new Map();
  for (const item of [...discoveredSourceSurfaces(), ...packageSurfaces(packageJson)]) {
    const current = grouped.get(item.viewType) || { viewType: item.viewType, owners: [], discoveries: [] };
    current.owners.push(item.ownerModule); current.discoveries.push(item.discovery); grouped.set(item.viewType, current);
  }
  return [...grouped.values()].map((item) => ({ ...item, owners: sorted(item.owners), discoveries: sorted(item.discoveries) })).sort((a, b) => a.viewType.localeCompare(b.viewType));
}

function hubActions(text) {
  const actions = [];
  for (const match of text.matchAll(/new HubItem\(\s*(['"`])([^'"`]*?)\1\s*,\s*null\s*,\s*(['"`])([^'"`]+)\3/g)) actions.push({ label: match[2], command: match[4] });
  return actions.sort((a, b) => a.command.localeCompare(b.command) || a.label.localeCompare(b.label));
}

function toolbarCommands(text) {
  const block = text.match(/const MENU_COMMANDS\s*=\s*Object\.freeze\(new Set\(\[([\s\S]*?)\]\)\);/);
  if (!block) throw new Error('Could not locate viewer toolbar MENU_COMMANDS.');
  return sorted([...block[1].matchAll(/(['"])([^'"]+)\1/g)].map((match) => match[2]));
}

function menuCommands(packageJson) {
  const commands = [];
  for (const entries of Object.values(packageJson.contributes?.menus || {})) for (const item of entries) if (item.command) commands.push(item.command);
  return sorted(commands);
}

function sourceClosure(ownerModules) {
  const visited = new Set(), queue = ownerModules.filter((name) => name.endsWith('.js'));
  while (queue.length) {
    const name = queue.shift();
    if (visited.has(name)) continue;
    const filename = path.join(SOURCE, name);
    if (!fs.existsSync(filename)) continue;
    visited.add(name);
    const text = fs.readFileSync(filename, 'utf8');
    for (const match of text.matchAll(/require\(\s*['"]\.\/([^'"]+)['"]\s*\)/g)) {
      const dependency = `${match[1].replace(/\.js$/, '')}.js`;
      if (!visited.has(dependency)) queue.push(dependency);
    }
  }
  return [...visited].sort();
}

function cohesionInventory() {
  const persistent = SURFACES.filter((surface) => surface.kind !== 'transient' && !['tree-view', 'navigation'].includes(surface.kind));
  return persistent.map((surface) => {
    const inspectedModules = sourceClosure(surface.ownerModules);
    const source = inspectedModules.map((name) => fs.readFileSync(path.join(SOURCE, name), 'utf8')).join('\n');
    const sharedEvidence = /\b(?:renderUniversalToolbar|launchControlsHtml)\s*\(/.test(source);
    return {
      surfaceId: surface.id,
      viewTypes: surface.viewTypes,
      lifecycle: surface.lifecycle,
      toolbarPolicy: surface.toolbarPolicy,
      chromePolicy: surface.chromePolicy,
      chromeReason: surface.chromeReason,
      inspectedModules,
      sharedEvidence,
      status: surface.chromePolicy === 'shared' ? (sharedEvidence ? 'shared' : 'missing') : surface.chromePolicy
    };
  });
}

const TOOLBAR_SURFACES = Object.freeze(['sff', 'air', 'snd', 'move_constants', 'stage', 'screenpack']);

function toolbarActionRecords() {
  const toolbar = require('../src/viewer_toolbar'), records = [], menuActionIds = new Set(), iconActionIds = new Set();
  for (const surface of TOOLBAR_SURFACES) {
    for (const group of toolbar.menuDefinitions(surface)) for (const item of group.items || []) {
      if (!item || item.separator) continue;
      let kind = 'shared-proxy', owner = 'shared', dispatch = item.action || item.id;
      if (item.targetSurface) { owner = item.targetSurface; dispatch = item.targetAction; }
      else if (item.command) { kind = 'command'; owner = `command:${item.command}`; dispatch = item.command; }
      else if (item.element) { kind = 'element'; owner = surface; dispatch = item.element; }
      else if (item.selector) { kind = 'selector'; owner = surface; dispatch = item.selector; }
      else if (item.special) { kind = 'special'; owner = item.id.startsWith('shared.') ? 'shared' : surface; dispatch = item.special; }
      records.push({ id: item.id, kind, owner, dispatch, exposures: ['toolbarMenu', 'actionSearch'] });
      menuActionIds.add(item.id);
    }
    for (const row of toolbar.iconDefinitions(surface)) for (const item of row || []) if (item?.actionId) {
      iconActionIds.add(item.actionId);
      const matching = records.find((record) => record.id === item.actionId);
      if (matching) records.push({ ...matching, exposures: ['quickSlot'] });
    }
  }
  return { records, menuActionIds: sorted(menuActionIds), iconActionIds: sorted(iconActionIds) };
}

function actionAudit(packageJson = require('../package.json')) {
  const declared = new Set((packageJson.contributes?.commands || []).map((item) => item.command));
  const publicCatalog=publicCommandCatalog(packageJson);
  const tools = publicCatalog.actions.map(item=>({label:item.label,command:item.command}));
  const toolCommands = new Set(tools.map((item) => item.command));
  const toolbar = new Set(require('../src/viewer_toolbar').MENU_COMMANDS);
  const menus = new Set(menuCommands(packageJson));
  const ids = sorted(new Set([...declared, ...toolCommands, ...toolbar, ...menus]));
  const records = ids.map((id) => {
    const exposures = [];
    if (toolCommands.has(id)) exposures.push('toolsTree');
    if (toolbar.has(id)) exposures.push('toolbarMenu', 'actionSearch');
    if (menus.has(id)) exposures.push('sidebar');
    return { id, kind: 'command', owner: declared.has(id) ? 'package-command' : (BUILTIN_COMMANDS.has(id) || /^(?:workbench|editor)\./.test(id) ? 'vscode' : 'legacy-runtime'), dispatch: id, exposures };
  });
  const commandCatalog = buildActionCatalog(records), toolbarActions = toolbarActionRecords();
  const actionCatalog = buildActionCatalog(toolbarActions.records);
  const parity = tools.map((item) => ({
    command: item.command,
    label: item.label,
    status: toolbar.has(item.command) ? 'covered' : (declared.has(item.command) ? 'planned' : 'excluded'),
    reason: toolbar.has(item.command) ? '' : (declared.has(item.command) ? 'Supported Tools action is not yet exposed through the shared toolbar/Actions registry.' : 'Tools entry is not a contributed IKEMaker command and requires explicit legacy review.')
  }));
  const orphanToolbarCommands = sorted([...toolbar].filter((id) => !declared.has(id) && !BUILTIN_COMMANDS.has(id) && !/^(?:workbench|editor)\./.test(id) && !id.startsWith('ikeminer.')));
  const menuActionIds = new Set(toolbarActions.menuActionIds);
  const orphanActionIds = toolbarActions.iconActionIds.filter((id) => !menuActionIds.has(id));
  const bodySpecialistActionIds = toolbarActions.iconActionIds.filter((id) => SPECIALIST_ACTION_IDS.includes(id));
  const plannedSpecialistPlacementViolations = SLOTS.flatMap((slot) => [slot.id, slot.actionId]).filter((id) => SPECIALIST_ACTION_IDS.includes(id));
  const unclassifiedSpecialistPlacementViolations = toolbarActions.iconActionIds.filter((id) => /^(?:snd\.(?:element|special)\.)/.test(id) && !SPECIALIST_ACTION_IDS.includes(id));
  return {
    commandCatalog,
    actionCatalog,
    parity,
    counts: { declared: declared.size, toolsEntries: tools.length, toolbarCommands: toolbar.size, packageMenuCommands: menus.size, menuActionIds: toolbarActions.menuActionIds.length, iconActionIds: toolbarActions.iconActionIds.length },
    orphanToolbarCommands,
    orphanActionIds,
    plannedSpecialistPlacementViolations,
    bodySpecialistActionIds,
    unclassifiedSpecialistPlacementViolations,
    toolbarOnly: sorted([...toolbar].filter((id) => !toolCommands.has(id)))
  };
}

function createReport(packageJson = require('../package.json')) {
  const registered = byViewType(), discovered = discoverSurfaces(packageJson), actions = actionAudit(packageJson), cohesion = cohesionInventory();
  const surfaceCoverage = discovered.map((item) => {
    const surface = registered.get(item.viewType);
    const ownerMismatches = surface ? item.owners.filter((owner) => !surface.ownerModules.includes(owner)) : [];
    return {
      ...item,
      status: surface ? (surface.toolbarPolicy === 'excluded' ? 'excluded' : surface.toolbarPolicy) : 'unregistered',
      surfaceId: surface?.id || '',
      reason: surface ? (surface.exclusionReason || surface.migrationReason) : 'Discovered persistent surface has no registry entry.',
      ownerMismatches
    };
  });
  const ownerMismatches = surfaceCoverage.filter((item) => item.ownerMismatches.length).map((item) => ({ viewType: item.viewType, surfaceId: item.surfaceId, owners: item.ownerMismatches }));
  const discoveredTypes = new Set(discovered.map((item) => item.viewType));
  const undiscoveredRegistryEntries = SURFACES.filter((surface) => surface.viewTypes.every((viewType) => !discoveredTypes.has(viewType))).map((surface) => surface.id).sort();
  return {
    schemaVersion: 1,
    scope: 'Stage 1 read-only inventory; planned findings are migration debt, not completed UI claims.',
    toolbar: { dimensions: DIMENSIONS, slots: SLOTS },
    sourceCapabilities: Object.values(CAPABILITIES),
    registeredSurfaces: SURFACES,
    surfaceCoverage,
    ownerMismatches,
    undiscoveredRegistryEntries,
    cohesion: {
      surfaces: cohesion,
      missingSharedChrome: cohesion.filter((item) => item.status === 'missing').map((item) => item.surfaceId),
      deferred: cohesion.filter((item) => item.status === 'deferred').map((item) => ({ surfaceId: item.surfaceId, reason: item.chromeReason })),
      legacyToolbarCommand: {
        status: 'host-only-restoration-alias',
        emittedByProductionClient: false,
        decision: 'Retain only for exact restored-old-webview compatibility; remove after saved webview compatibility is intentionally retired.'
      }
    },
    actions,
    summary: {
      discoveredSurfaceTypes: discovered.length,
      registeredSurfaceTypes: registered.size,
      unregisteredSurfaceTypes: surfaceCoverage.filter((item) => item.status === 'unregistered').length,
      plannedSurfaceTypes: surfaceCoverage.filter((item) => item.status === 'planned').length,
      excludedSurfaceTypes: surfaceCoverage.filter((item) => item.status === 'excluded').length,
      ownerMismatches: ownerMismatches.length,
      sharedChromeSurfaces: cohesion.filter((item) => item.status === 'shared').length,
      deferredChromeSurfaces: cohesion.filter((item) => item.status === 'deferred').length,
      missingSharedChromeSurfaces: cohesion.filter((item) => item.status === 'missing').length,
      commandIds: actions.commandCatalog.length,
      actionIds: actions.actionCatalog.length,
      iconActionIds: actions.counts.iconActionIds,
      specialistPrimaryPlacementViolations: actions.plannedSpecialistPlacementViolations.length,
      bodySpecialistActionIds: actions.bodySpecialistActionIds.length,
      toolsCovered: actions.parity.filter((item) => item.status === 'covered').length,
      toolsPlanned: actions.parity.filter((item) => item.status === 'planned').length,
      toolsExcluded: actions.parity.filter((item) => item.status === 'excluded').length
    }
  };
}

function stableJson(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function writeReport(filename = REPORT) { const text = stableJson(createReport()); fs.writeFileSync(filename, text, 'utf8'); return text; }

if (require.main === module) {
  const text = writeReport(process.argv[2] ? path.resolve(process.argv[2]) : REPORT);
  process.stdout.write(`Viewer contract audit written (${Buffer.byteLength(text)} bytes).\n`);
}

module.exports = { ROOT, REPORT, dynamicPanelViewTypes, discoverSurfaces, hubActions, toolbarCommands, toolbarActionRecords, actionAudit, cohesionInventory, createReport, stableJson, writeReport };
