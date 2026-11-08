'use strict';

const { VIEW_TYPE, createVisualAuthoringBrowserCompanion } = require('./visual_authoring_browser_companion');

const COMMAND = 'ikemen.visualBrowser.open';
let activeHost = null;

function exactOpenRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join('\0') !== ['ownerKey','surface'].sort().join('\0')) return null;
  if (typeof value.surface !== 'string' || !value.surface || Buffer.byteLength(value.surface,'utf8') > 32 || /[\u0000-\u001f]/.test(value.surface)) return null;
  if (typeof value.ownerKey !== 'string' || !value.ownerKey || Buffer.byteLength(value.ownerKey,'utf8') > 2048 || /[\u0000-\u001f]/.test(value.ownerKey)) return null;
  return Object.freeze({ surface:value.surface, ownerKey:value.ownerKey });
}

function createVisualAuthoringBrowserHost(api, context, options = {}) {
  if (!api?.window?.createWebviewPanel || !api?.commands?.registerCommand || !api?.window?.registerWebviewPanelSerializer) throw new Error('Visual browser host requires the VS Code panel, command, and serializer APIs.');
  const trackViewerPanel=options.trackViewerPanel||require('./viewer_group').trackViewerPanel,protect=options.protectHtml||require('./webview_policy').protect,resizeNative=options.resizeNative||require('./windows_auxiliary_window').resizeActiveAuxiliaryWindowBy;
  const createPanel=specification=>{
    const viewColumn=specification.dockBeside?(api.ViewColumn.Beside??-2):(options.viewColumn??api.ViewColumn.Active);
    const placement=specification.preserveFocus?{viewColumn,preserveFocus:true}:viewColumn;
    return trackViewerPanel(api.window.createWebviewPanel(specification.viewType,specification.title,placement,{enableScripts:true,retainContextWhenHidden:true}));
  };
  const companion=createVisualAuthoringBrowserCompanion({
    createPanel,commands:api.commands,storage:context.workspaceState,api,resizeNative,
    restoreStageOwner:async filename=>{
      if(!require('path').isAbsolute(filename)||!/\.def$/i.test(filename)||!require('fs').existsSync(filename))return false;
      const runtime=require('./entity_switch_runtime').currentEntitySwitchRuntime();
      if(runtime&&api.window.tabGroups&&await require('./entity_viewer_focus').focusLoadedEditor(runtime,{kind:'stage',ownerFile:filename},()=>!runtime.disposed))return true;
      await api.commands.executeCommand('ikemen.stage.openWorkspace',api.Uri.file(filename),{restoreBrowserOwner:true});
      return true;
    },
    protectHtml:(html,webview)=>protect(html,webview?.cspSource||''),
    waitForRestoreSettled:options.waitForRestoreSettled,
    readinessFactory:options.readinessFactory,
    minimumWidthFactory:options.minimumWidthFactory
  });
  const open=request=>{const clean=exactOpenRequest(request);if(!clean)return api.window.showInformationMessage?.('Open a Stage, Screenpack/UI, or Storyboard visual editor before opening its browser.');return companion.openOrFocus(clean.surface,clean.ownerKey);};
  // Keep the contributed identifier literal here so the release command-contract audit can
  // prove that package.json and the production registration cannot drift apart.
  const command=api.commands.registerCommand('ikemen.visualBrowser.open',open),serializer=api.window.registerWebviewPanelSerializer(VIEW_TYPE,{async deserializeWebviewPanel(panel,state){trackViewerPanel(panel);
    // Owner recovery and floating placement can wait on the restored iframe.
    // Release the serializer so VS Code can mount it.
    void companion.restore(state,panel).catch(error=>{panel.dispose?.();api.window.showWarningMessage?.(`The visual browser could not be restored: ${error?.message||error}`);});}});
  const host=Object.freeze({
    command:COMMAND,viewType:VIEW_TYPE,
    registerOwner:owner=>companion.registerOwner(owner),
    detachOwner:(surface,ownerKey)=>companion.detachOwner(surface,ownerKey),
    publish:(surface,ownerKey)=>companion.publish(ownerKey,surface),
    open:(surface,ownerKey)=>open({surface,ownerKey}),
    openDefault:(surface,ownerKey)=>companion.openDefault(surface,ownerKey),
    toggle:(surface,ownerKey,ownerPanel)=>companion.toggle(surface,ownerKey,ownerPanel),
    snapshot:(surface,ownerKey)=>companion.snapshot(surface,ownerKey),
    dispose(){command?.dispose?.();serializer?.dispose?.();companion.dispose();if(activeHost===host)activeHost=null;}
  });
  context.subscriptions.push(host);
  return host;
}

function register(context, api = require('vscode'), options = {}) {
  if (activeHost) return activeHost;
  activeHost=createVisualAuthoringBrowserHost(api,context,options);
  return activeHost;
}
function current() { if(!activeHost)throw new Error('The shared visual browser service has not been registered by extension activation.');return activeHost; }
function tryCurrent() { return activeHost; }
function registerOwner(owner) { return current().registerOwner(owner); }
function detachOwner(surface,ownerKey) { return current().detachOwner(surface,ownerKey); }
function publish(surface,ownerKey) { return current().publish(surface,ownerKey); }
function open(surface,ownerKey) { return current().open(surface,ownerKey); }
function openDefault(surface,ownerKey) { return current().openDefault(surface,ownerKey); }

module.exports={COMMAND,VIEW_TYPE,exactOpenRequest,createVisualAuthoringBrowserHost,register,current,tryCurrent,registerOwner,detachOwner,publish,open,openDefault};
