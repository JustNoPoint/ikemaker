'use strict';

const fs = require('node:fs');
const path = require('node:path');

const WITH_HEADER = 'connected-text-with-header';
const WITHOUT_HEADER = 'connected-text-without-header';
const VIEWERS_ONLY = 'connected-viewers-only';
const textOnlySources = new Set();
const openingTextSources = new Map();
const OPEN_MODES = [
  { id: WITH_HEADER, label: 'All text files — with header', description: 'Connected text in native editors with IKEMaker Code Navigation' },
  { id: WITHOUT_HEADER, label: 'All text files — without header', description: 'Connected text in native editors only' },
  { id: VIEWERS_ONLY, label: 'All viewers', description: 'Connected visual workspaces and assigned asset viewers only' }
];

async function chooseOpenMode(api, name, modes = OPEN_MODES) {
  return (await api.window.showQuickPick(modes, {
    title: name + ' — Choose what to work on',
    placeHolder: 'Choose how to open this resource'
  }))?.id;
}

const BINARY_EXTENSIONS = new Set(['.sff', '.snd', '.act', '.png', '.pcx', '.bmp', '.gif', '.jpg', '.jpeg', '.webp', '.psd', '.wav', '.mp3', '.ogg', '.flac', '.mid', '.midi', '.mp4', '.webm', '.avi', '.ttf', '.otf', '.woff', '.woff2', '.zip', '.7z', '.exe', '.dll']);
const BINARY_ROLES = /^(?:sff|snd|sprite|spr|sound|palette|pal\d*|music|video)$/i;

function textSample(filename) {
  const file = fs.openSync(filename, 'r');
  try {
    const bytes = Buffer.alloc(8192);
    const sample = bytes.subarray(0, fs.readSync(file, bytes, 0, bytes.length, 0));
    if (sample[0] === 0xff && sample[1] === 0xfe || sample[0] === 0xfe && sample[1] === 0xff) return true;
    return !sample.some(byte => byte < 32 && ![9, 10, 12, 13].includes(byte));
  } finally {
    fs.closeSync(file);
  }
}

function availableSources(resources) {
  const files = new Map();
  for (const { filename, role } of resources) {
    if (!filename || !path.isAbsolute(filename) || BINARY_ROLES.test(role || '') || (role === 'unassigned' && BINARY_EXTENSIONS.has(path.extname(filename).toLowerCase()))) continue;
    try {
      const key = identity(fs.realpathSync(filename));
      if (files.has(key) || !fs.statSync(filename).isFile() || !textSample(filename)) continue;
      files.set(key, { filename: path.resolve(filename), role });
    } catch (_) {}
  }
  return [...files.values()];
}

function identity(filename) {
  const absolute = path.resolve(filename);
  return process.platform === 'win32' ? absolute.toLowerCase() : absolute;
}

async function openConnectedText(api, mode, owner, resources, options = {}) {
  const sources = availableSources(resources);
  if (options.cancelled?.()) return;
  if (!sources.length) {
    api.window.showWarningMessage('No connected text files are available.');
    return;
  }
  const files = sources.map(item => item.filename);
  const withHeader = mode === WITH_HEADER;
  const context = { ...owner, files };
  const column = options.column || api.window.activeTextEditor?.viewColumn || api.window.tabGroups?.activeTabGroup?.viewColumn || api.ViewColumn.One;
  if (!withHeader) await api.commands.executeCommand('ikemen.textToolbar.suppressForSources', context);
  const opened = [], failed = [];
  try {
    const prepared = withHeader
      ? await require('./authoring_workspace').attachedCodeColumns(sources[0].filename, { isCurrent: () => !options.cancelled?.() })
      : null;
    const target = prepared || { editorColumn: column };
    for (const source of sources) {
      if (options.cancelled?.()) return;
      try {
        let document = await api.workspace.openTextDocument(api.Uri.file(source.filename));
        if (options.prepareDocument) document = await options.prepareDocument(document, source);
        if (options.cancelled?.()) return;
        const key = identity(source.filename);
        openingTextSources.set(key, (openingTextSources.get(key) || 0) + 1);
        try {
          const editor = await api.window.showTextDocument(document, { viewColumn: target.editorColumn, preview: false });
          if (editor && !options.cancelled?.()) {
            textOnlySources.add(key);
            opened.push({ document, filename: source.filename });
          } else if (!editor) failed.push(path.basename(source.filename));
        } finally {
          const remaining = openingTextSources.get(key) - 1;
          if (remaining) openingTextSources.set(key, remaining);
          else openingTextSources.delete(key);
        }
      } catch (_) { failed.push(path.basename(source.filename)); }
    }
    if (!opened.length || options.cancelled?.()) {
      if (failed.length) api.window.showWarningMessage('Could not open connected text files: ' + failed.join(', '));
      return;
    }
    await api.window.showTextDocument(opened[0].document, { viewColumn: target.editorColumn, preview: false });
    if (failed.length) api.window.showWarningMessage('Could not open connected text files: ' + failed.join(', '));
    if (prepared && !options.cancelled?.()) {
      const openedFiles = opened.map(item => item.filename);
      await api.commands.executeCommand('ikemen.textToolbar.openCompanion', {
        files: openedFiles, selectedFile: openedFiles[0], viewColumn: target.editorColumn, headerColumn: target.headerColumn,
        scopedLayout: target.scopedLayout === true, context: { ...context, files: openedFiles }
      });
    } else if (withHeader && !options.cancelled?.()) {
      api.window.showWarningMessage('The connected text files are open. Code Navigation could not attach to the current editor layout.');
    }
    return opened.map(item => item.filename);
  } finally {
    if (!withHeader && opened.length < files.length) {
      const openedFiles = new Set(opened.map(item => item.filename));
      await api.commands.executeCommand('ikemen.textToolbar.releaseClosedSources', files.filter(file => !openedFiles.has(file)));
    }
  }
}

function entityContext(type, filename, label = path.basename(filename)) {
  return { type, key: filename, ownerFile: filename, root: path.dirname(filename), label };
}

function readResourceText(api, filename) {
  return api.workspace.textDocuments?.find(document => !document.isClosed && document.fileName && identity(document.fileName) === identity(filename))?.getText()
    ?? fs.readFileSync(filename, 'utf8');
}

function characterResources(defPath, options = {}) {
  const readAssignments = options.readAssignments || require('./character_dependency_model').readCharacterAssignments;
  const resources = [], visited = new Set();
  const visit = (filename, assignments) => {
    if (visited.has(identity(filename))) return;
    visited.add(identity(filename));
    resources.push({ filename, role: 'source' });
    for (const [key, files] of Object.entries(assignments || readAssignments(filename).assignments)) {
      for (const file of files) {
        const extension = path.extname(file).toLowerCase();
        const role = /^(?:sprite|sff)$/.test(key) ? 'sff' : /^(?:sound|snd)$/.test(key) ? 'snd'
          : /^(?:anim|air)$/.test(key) ? 'air' : /^pal\d*$/.test(key) ? 'palette'
          : /^(?:intro|ending)\.storyboard$/.test(key) ? 'storyboard' : key;
        resources.push({ filename: file, role, ownerDef: filename });
        if (role === 'storyboard') resources.push(...storyboardResources(file, options.readText));
        else if (extension === '.def' && !['sff', 'snd', 'palette'].includes(role)) {
          visit(file);
        }
      }
    }
  };
  visit(defPath, options.assignments);
  for (const filename of options.addedFiles || []) {
    const role = ({ '.air': 'air', '.sff': 'sff', '.snd': 'snd', '.act': 'palette' })[path.extname(filename).toLowerCase()] || 'unassigned';
    resources.push({ filename, role });
  }
  return resources;
}

function storyboardResources(filename, readText = file => fs.readFileSync(file, 'utf8')) {
  const resources = [{ filename, role: 'source' }];
  try {
    const model = require('./storyboard_model').storyboardModel(require('./def_model').parseDef(readText(filename), filename));
    const resolve = require('./storyboard_resource_path').resolveStoryboardResource;
    const add = (value, role) => {
      const target = resolve(filename, value, role);
      if (target.available) resources.push({ filename: target.filename, role });
    };
    add(model.sff, 'sff');
    add(model.snd, 'snd');
    for (const value of Object.values(model.fonts || {})) add(value, 'font');
  } catch (_) {}
  return resources;
}

async function openConnectedViewers(api, resources, options = {}) {
  const viewers = new Map();
  for (const resource of resources) {
    const { filename, role, ownerDef, uiOwner } = resource;
    if (!filename || !path.isAbsolute(filename) || !['air', 'sff', 'snd', 'palette', 'storyboard', 'screenpack', 'stage'].includes(role)) continue;
    const binding = role === 'air' ? ownerDef || uiOwner : '';
    const key = identity(filename) + '\0' + role + (binding ? '\0' + identity(binding) : '');
    if (!viewers.has(key)) viewers.set(key, { ...resource, ownerDefs: new Set() });
    if (ownerDef) viewers.get(key).ownerDefs.add(ownerDef);
  }

  let opened = 0;
  const failed = [];
  for (const { filename, role, ownerDefs, uiOwner } of viewers.values()) {
    if (options.cancelled?.()) return;
    try { if (!fs.statSync(filename).isFile()) continue; } catch (_) { continue; }
    const uri = api.Uri.file(filename), column = options.column;
    textOnlySources.delete(identity(filename));
    const session = { assetOpenMode: 'new', reuseOpenAsset: true, keepTextHeader: true, ownerDefs: [...ownerDefs], preserveFocus: false };
    try {
      let panel;
      if (role === 'air') panel = await api.commands.executeCommand('air.openAnimationPreview', uri, { ...session, viewerColumn: column, ...(uiOwner ? { uiOwner } : {}) });
      if (role === 'sff') panel = await api.commands.executeCommand('sff.openViewer', uri, column, undefined, session);
      if (role === 'snd') panel = await api.commands.executeCommand('snd.openViewer', uri, column, undefined, undefined, session);
      if (role === 'palette') panel = await api.commands.executeCommand('ikemen.palette.openWorkspace', uri, { assignedAct: true, ...session });
      if (role === 'storyboard') panel = await api.commands.executeCommand('ikemen.storyboard.open', uri, { keepTextHeader: true });
      if (role === 'screenpack') panel = await api.commands.executeCommand('ikemen.ui.openWorkspace', uri, { keepTextHeader: true });
      if (role === 'stage') panel = await api.commands.executeCommand('ikemen.stage.openWorkspace', uri, { keepTextHeader: true });
      if (panel) opened++;
      else failed.push(path.basename(filename));
    } catch (_) { failed.push(path.basename(filename)); }
  }
  if (failed.length) api.window.showWarningMessage('Could not open connected viewers: ' + failed.join(', '));
  return opened;
}

function isTextOnlySource(filename, context) {
  if (!filename) return false;
  const key = identity(filename);
  return textOnlySources.has(key) || openingTextSources.has(key)
    || Boolean(context?.workspaceState?.get('ikemen.textToolbar.headerlessOpenSources.v1', [])?.includes(path.resolve(filename).toLowerCase()));
}

function releaseClosedSources(api, filenames) {
  const open = new Set((api.window.tabGroups?.all || [])
    .flatMap(group => group.tabs || []).filter(tab => !tab.input?.viewType && tab.input?.uri?.scheme === 'file')
    .map(tab => identity(tab.input.uri.fsPath)));
  for (const filename of filenames) {
    if (!filename) continue;
    const key = identity(filename);
    if (!open.has(key)) textOnlySources.delete(key);
  }
}

module.exports = {
  OPEN_MODES, WITH_HEADER, WITHOUT_HEADER, VIEWERS_ONLY, chooseOpenMode, availableSources, openConnectedText, entityContext,
  openConnectedViewers, characterResources, storyboardResources, readResourceText, isTextOnlySource, releaseClosedSources
};
