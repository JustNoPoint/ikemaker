'use strict';

const path = require('path');
const { adapt } = require('./universal_toolbar_adapter');
const {
  MESSAGE_TYPE, renderUniversalToolbar, universalToolbarStyle,
  universalToolbarClientScript, createUniversalToolbarDispatcher
} = require('./universal_toolbar_webview');
const { preferredViewerColumn, trackViewerPanel, revealInViewerGroup } = require('./viewer_group');
const { createShaderWorkshopSession, renderShaderWorkshopHtml } = require('./shader_workshop_workspace');
const { createShaderPreviewSourceBridge } = require('./shader_preview_source_bridge');
const { createPreviewFramePacket, createShaderRenderContract, withGeneration } = require('./shader_render_contract');
const { rendererClientScript } = require('./shader_webgl_renderer');

const COMMAND = 'ikemen.shader.openWorkshop';
const SURFACE = 'shader.workspace';
const VIEW_TYPE = 'ikemenShaderWorkshop';
let active = null;

function sameFile(left, right) {
  const normalize = value => path.resolve(String(value || '')).replaceAll('\\', '/').toLowerCase();
  return Boolean(left && right) && normalize(left) === normalize(right);
}

function liveDocument(vscode, filename) {
  return (vscode.workspace?.textDocuments || []).find(document => !document.isClosed && sameFile(document.fileName, filename)) || null;
}

function capability(enabled, dispatch, reason) {
  return enabled ? { enabled: true, dispatch } : { enabled: false, reason };
}

function toolbarModel() {
  return adapt(SURFACE, {
    'universal.close': capability(true, 'close'),
    'universal.help': capability(true, 'help'),
    'universal.settings': capability(true, 'settings')
  });
}

function exactMessage(message, keys) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) return false;
  const actual = Object.keys(message).sort(), expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function sourceOptions(value) {
  if (!value || typeof value !== 'object') return null;
  if (value.kind === 'sff') return {
    kind: 'sff', sffPath: String(value.sffPath || ''), selection: value.selection,
    paletteOverride: value.paletteOverride ?? null
  };
  if (value.kind === 'air') return {
    kind: 'air', sffPath: String(value.sffPath || ''), airPath: String(value.airPath || ''),
    actionNumber: value.actionNumber, paletteForGroup: value.paletteForGroup ?? null,
    spriteSelection: value.spriteSelection ?? null
  };
  return null;
}

function captureSource(owner, supplied) {
  const options = sourceOptions(supplied);
  if (!options) return false;
  const captured = options.kind === 'sff'
    ? owner.bridge.fromSff(options.sffPath, options.selection, options.paletteOverride)
    : owner.bridge.fromAir(options.sffPath, options.airPath, options.actionNumber, options.paletteForGroup, options.spriteSelection);
  owner.source = captured.source;
  owner.paletteOverride = options.kind === 'sff' ? options.paletteOverride : options.paletteForGroup;
  owner.session.setPreview(captured.preview);
  owner.panel.title = `Shader Workshop · ${path.basename(options.kind === 'sff' ? options.sffPath : options.airPath)}`;
  return true;
}

function render(owner) {
  const snapshot = owner.session.snapshot(), model = toolbarModel();
  let rendererScript = '', rendererError = '';
  if (snapshot.preview.frames.length) {
    try {
      const contract = withGeneration(createShaderRenderContract(snapshot.project, snapshot.preview, snapshot.previewFrame), snapshot.generation);
      rendererScript = rendererClientScript(contract);
      owner.contract = contract;
    } catch (error) { owner.contract = null; rendererError = String(error.message || error).slice(0, 512); }
  } else owner.contract = null;
  owner.panel.webview.html = renderShaderWorkshopHtml(snapshot, {
    resourceSource: owner.panel.webview.cspSource,
    toolbarHtml: renderUniversalToolbar(model, { surfaceId: SURFACE, label: 'IKEMaker universal actions' }),
    toolbarStyle: universalToolbarStyle(),
    toolbarClient: universalToolbarClientScript({ vscodeVariable: 'vscode' }),
    rendererScript, rendererError
  });
}

function previewPacket(owner, frame) {
  if (!owner.source) throw new Error('Choose an SFF sprite or AIR action before requesting preview frames.');
  const refreshed = owner.bridge.refresh(owner.source, owner.paletteOverride);
  const snapshot = owner.session.snapshot();
  owner.source = refreshed.source;
  return createPreviewFramePacket(refreshed.preview, frame, snapshot.generation);
}

function createToolbarDispatcher(vscode, owner) {
  const execute = command => async () => vscode.commands.executeCommand(command);
  return createUniversalToolbarDispatcher({
    handlersBySurface: { [SURFACE]: {
      close: async () => owner.panel.dispose(),
      help: execute('ikemen.help.open'),
      settings: execute('ikemen.openExtensionSettings')
    } },
    getToolbar: async () => toolbarModel()
  });
}

async function handleMessage(vscode, owner, message) {
  if (message?.type === MESSAGE_TYPE) return owner.toolbar.dispatch(SURFACE, message);
  if (message?.type === 'request-preview-frame') {
    if (!exactMessage(message, ['type', 'generation', 'frame']) || message.generation !== owner.session.snapshot().generation || !Number.isSafeInteger(message.frame)) return false;
    const packet = previewPacket(owner, message.frame);
    return owner.panel.webview.postMessage(packet);
  }
  if (message?.type === 'select-preview-frame') {
    if (!exactMessage(message, ['type', 'generation', 'frame']) || message.generation !== owner.session.snapshot().generation) return false;
    return Boolean(owner.session.rememberPreviewFrame(message.frame));
  }
  const changed = owner.session.handleMessage(message);
  if (!changed) return false;
  render(owner);
  return true;
}

function createOwner(vscode, context) {
  const panel = trackViewerPanel(vscode.window.createWebviewPanel(
    VIEW_TYPE, 'Shader Workshop', preferredViewerColumn(vscode.ViewColumn.Beside),
    { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [] }
  ));
  const owner = {
    panel, session: createShaderWorkshopSession({ id: 'shader-workshop', name: 'Shader Workshop' }),
    bridge: createShaderPreviewSourceBridge({ getLiveDocument: filename => liveDocument(vscode, filename) }),
    source: null, paletteOverride: null, contract: null, disposed: false, subscriptions: []
  };
  owner.toolbar = createToolbarDispatcher(vscode, owner);
  const received = panel.webview.onDidReceiveMessage(message => handleMessage(vscode, owner, message).catch(error => {
    if (!owner.disposed) vscode.window.showErrorMessage(`Shader Workshop: ${error.message}`);
  }));
  if (received) owner.subscriptions.push(received);
  panel.onDidDispose(() => {
    owner.disposed = true;
    for (const subscription of owner.subscriptions.splice(0)) try { subscription.dispose?.(); } catch (_) {}
    if (active === owner) active = null;
  });
  render(owner);
  return owner;
}

async function openShaderWorkshop(vscode, context, options = null) {
  let owner = active;
  if (!owner || owner.disposed) owner = active = createOwner(vscode, context);
  if (options) {
    captureSource(owner, options);
    render(owner);
  }
  revealInViewerGroup(owner.panel, false, vscode.ViewColumn.Beside);
  return owner.panel;
}

function registerShaderWorkshop(context, suppliedVscode = null) {
  const vscode = suppliedVscode || require('vscode');
  const registration = vscode.commands.registerCommand('ikemen.shader.openWorkshop', options => openShaderWorkshop(vscode, context, options));
  context.subscriptions.push(registration);
  return registration;
}

function resetShaderWorkshopForTests() {
  try { active?.panel?.dispose?.(); } catch (_) {}
  active = null;
}

module.exports = {
  COMMAND, SURFACE, VIEW_TYPE, toolbarModel, sourceOptions, exactMessage,
  openShaderWorkshop, registerShaderWorkshop, resetShaderWorkshopForTests, renderWorkshopOwner: render
};
