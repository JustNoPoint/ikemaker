'use strict';
const controls=require('./launch_controls');
const SHARED=new Set(['viewerToolbarReady','viewerToolbarAction','viewerToolbarCommand','viewerToolbarCrossSurface','viewerToolbarSave','viewerToolbarActivityReady','viewerToolbarActivitySave','viewerHistory','viewerBackToSource','viewerUsedBy','viewerSelectionChanged','ikemenRelatedWork','ikemenViewer','ikemenModeReady','assetWorkspaceOptions']);
function html(surface,model){
 const layout=['stage','screenpack'].includes(surface)?`<style>body:has(>.shared-workspace-header){height:100vh;display:flex;flex-direction:column;overflow:hidden}.shared-workspace-header~.app{height:auto!important;flex:1;min-height:0}</style>`:'';
 const scope=surface==='select_def'?'<div class="muted" data-roster-project-scope>Roster stays bound to the select.def shown below when switching entities; open another select.def explicitly to change its project.</div>':'';
 return `${layout}<style>body:has(>.shared-workspace-header){margin:0}.shared-workspace-header{font:13px var(--vscode-font-family,Segoe UI,sans-serif)}</style><div class="shared-workspace-header" data-workspace-kind="${surface}">${controls.launchControlsHtml(surface,{universalModel:model,universalSurfaceId:model.surfaceId,includeUniversal:true,includeLayout:false})}${scope}</div>`;
}
function clientScript(bridge='vscode'){return '(function(vscode){if(!document.querySelector?.(".shared-workspace-header")){'+require('./viewer_close').clientScript()+'return;}'+controls.launchControlsClientScript({navigationRestore:false})+'})('+bridge+');';}
const observerHeaders=new WeakMap();
function attachObserver(panel,surfaceId){
 const existing=observerHeaders.get(panel);if(existing)return existing;
 const runtime=require('./entity_switch_runtime').currentEntitySwitchRuntime();if(!runtime)return null;
 // Fixed-owner workspaces observe global entity navigation; they do not rebind
 // source identity or transfer drafts when the global entity changes.
 const header=runtime.host.registerHeader(panel,{surfaceId,observerOnly:true});
 const lease={dispose(){if(observerHeaders.get(panel)!==lease)return;observerHeaders.delete(panel);header.dispose();}};
 observerHeaders.set(panel,lease);panel.onDidDispose?.(()=>lease.dispose());return lease;
}
function attachProjectRoster(panel){
 const runtime=require('./entity_switch_runtime').currentEntitySwitchRuntime();if(!runtime)return;
 // Project-level editor: never claim the active entity or rebind source/drafts.
 // Independent headers do not block the actual viewers' safe retarget adapters.
 const header=runtime.host.registerHeader(panel,{surfaceId:'screenpack.roster',observerOnly:true});
 panel.onDidDispose(()=>header.dispose());
}
async function handle(message,owner,surface){
 if(message?.type==='ikemenBrowserShortcut'&&Object.keys(message).length===1){if(['stage','screenpack','storyboard'].includes(surface)){const service=require('./visual_authoring_browser_service').tryCurrent();if(service&&owner.panel?.active===true)return service.toggle(surface,owner.visualBrowserOwnerKey||owner.filename,owner.panel);return true;}return require('./viewer_browser_shortcut').handle(message,owner.filename||owner.document?.fileName,surface,owner.panel);}
 if(message?.type===require('./universal_toolbar_webview').MESSAGE_TYPE&&message.slotId==='viewer-browser'&&['stage','screenpack','storyboard'].includes(surface)){const service=require('./visual_authoring_browser_service').tryCurrent();if(!service||owner.panel?.active!==true)return true;const ownerKey=owner.visualBrowserOwnerKey||owner.filename;if(surface==='stage'&&!owner.visualBrowserRegistration||surface==='screenpack'&&!owner.visualBrowserRegistration)return false;await service.open(surface,ownerKey);return true;}
 if(!SHARED.has(message?.type))return false;
 if(owner.disposed)return true;
 if(message?.type==='viewerToolbarReady'){const toolbar=require('./viewer_toolbar');if(toolbar.handleCommand)await toolbar.handleCommand(message,owner.filename||owner.document?.fileName,owner.panel);await toolbar.handle(message,owner.panel);return true;}
 return controls.handleLaunchMessage(message,owner.filename||owner.document?.fileName,surface==='select_def'?'roster':surface,owner.panel);
}
module.exports={html,clientScript,handle,attachProjectRoster,attachObserver,isSharedMessage:message=>SHARED.has(message?.type)};
