'use strict';
const vscode=require('vscode');
const controls=require('./launch_controls');
const specs=Object.freeze({stage:{title:'Stage Workspace',viewType:'ikemenStageWorkspace',surfaceId:'stage.workspace',open:'ikemen.stage.openWorkspace',create:'ikemen.stage.createNew'},screenpack:{title:'Screenpack / Fight UI Workspace',viewType:'ikemenUiWorkspace',surfaceId:'screenpack.workspace',open:'ikemen.ui.openWorkspace',create:'ikemen.ui.createNew'},storyboard:{title:'Storyboard Workspace',viewType:'ikemenStoryboardWorkspace',surfaceId:'story.storyboard',open:'ikemen.storyboard.open',create:'ikemen.storyboard.create'}});
const starts=new Map();
function completed(kind,panel){const start=starts.get(kind);if(panel&&start&&start!==panel)start.dispose();return panel;}
async function open(kind){
 const spec=specs[kind];if(!spec)throw Error('Unknown visual workspace.');
 const existing=starts.get(kind);if(existing){existing.reveal();return existing;}
 const panel=require('./viewer_group').trackViewerPanel(vscode.window.createWebviewPanel(spec.viewType,spec.title+' — Start',vscode.ViewColumn.Active,{enableScripts:true,retainContextWhenHidden:true}));starts.set(kind,panel);
 panel.onDidDispose(()=>{if(starts.get(kind)===panel)starts.delete(kind);});
 const base=require('./viewer_toolbar').legacyUniversalModel('storyboard',{enabledSlots:['new','open']}),player=require('./interface_mode').current()==='player';
 const model={...base,surfaceId:spec.surfaceId,slots:base.slots.map(slot=>slot.id==='new'?{...slot,enabled:!player,reason:player?'Switch to an authoring mode to create files.':'',dispatch:player?'':'internal:new'}:slot.id==='open'?{...slot,enabled:true,reason:'',dispatch:'internal:open'}:slot)};
 panel.webview.html=require('./webview_policy').protect(`<!doctype html><html><head><meta charset="UTF-8"><style>body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background)}main{max-width:650px;margin:40px auto;padding:20px}button{min-height:27px}main button{padding:8px 14px;margin-right:8px}</style></head><body>${controls.launchControlsHtml(kind,{universalModel:model,universalSurfaceId:spec.surfaceId,includeUniversal:true,includeLayout:false})}<main data-visual-workspace-start="${kind}"><h1>${spec.title}</h1><p>No definition is loaded. Create a new resource or choose an existing definition to begin.</p><button id="createResource" data-command="${spec.create}" ${player?'disabled title="Switch to an authoring mode to create files."':''}>Create New…</button><button id="openResource">Open Existing…</button><p role="status">Opening this start page creates no project or temporary files. Creation uses the existing destination, canvas and review steps.</p></main><script>const vscode=acquireVsCodeApi();document.getElementById('createResource').onclick=()=>vscode.postMessage({type:'visualWorkspaceStart',action:'new'});document.getElementById('openResource').onclick=()=>vscode.postMessage({type:'visualWorkspaceStart',action:'open'});globalThis.ikemenModeVisibilityChanged=({mode})=>{const player=mode==='player',button=document.getElementById('createResource');button.disabled=player;button.title=player?'Switch to an authoring mode to create files.':'';const primary=document.querySelector('[data-universal-slot="new"]');if(primary){primary.disabled=player;primary.title=button.title||'Create New';}};${controls.launchControlsClientScript()}</script></body></html>`,panel.webview.cspSource);
 require('./viewer_close').support(panel,{isBusy:()=>false});
 const runtime=require('./entity_switch_runtime').currentEntitySwitchRuntime();const header=runtime?.host.registerHeader(panel,{surfaceId:spec.surfaceId+'.start',observerOnly:true});panel.onDidDispose(()=>header?.dispose());
 let busy=false;panel.webview.onDidReceiveMessage(async message=>{
  if(starts.get(kind)!==panel)return;
  const local=message?.type==='visualWorkspaceStart'&&Object.keys(message).sort().join('|')==='action|type',universal=message?.type==='ikemaker.universal-toolbar.invoke'&&Object.keys(message).sort().join('|')==='slotId|type';
  const action=local?message.action:universal?message.slotId:'';
  if(['new','open'].includes(action)){if(busy||starts.get(kind)!==panel)return;if(action==='new'&&require('./interface_mode').current()==='player')return vscode.window.showInformationMessage('Switch to an authoring mode to create files.');busy=true;try{await vscode.commands.executeCommand(action==='new'?spec.create:spec.open,...(action==='open'?[undefined,{forcePicker:true}]:[]));}catch(error){await vscode.window.showErrorMessage('Could not open '+spec.title+': '+error.message);}finally{busy=false;}return;}
  if(await require('./shared_workspace_header').handle(message,{panel},kind))return;
  await controls.handleLaunchMessage(message,'',kind,panel);
 });return panel;
}
module.exports={open,completed,specs};
