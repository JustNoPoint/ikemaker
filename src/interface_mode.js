'use strict';
const KEY='ikemaker.modeChoice.v1';
const MODES=[
 {label:'Player',value:'player',description:'Play, organize, and customize palettes',detail:'Roster, characters, stages, stories, player options, and focused palette customization. The smallest interface, without code or general asset-authoring tools.'},
 {label:'Simple',value:'simple',description:'Play, organize and create',detail:'Everything in Player, plus simplified creation and editing. Essential controls and one asset viewer at a time.'},
 {label:'Workspace',value:'workspace',description:'The complete toolset',detail:'Everything in Simple, plus advanced authoring, multiple viewers and split layouts.'}
];
let api,context,choosing,home,homeGeneration=0,homeAction=null,homeActionSerial=0;
function configure(vscode,extensionContext){api=vscode;context=extensionContext;}
function current(){
 if(!api)return 'simple';
 const config=api.workspace.getConfiguration('ikemenZss'),value=config.get('interfaceMode');
 const explicit=config.inspect?.('interfaceMode');
 const legacy=['multipleAssetWorkspaces','simpleAssetInterface'].some(name=>{const setting=config.inspect?.(name);return setting?.globalValue!==undefined||setting?.workspaceValue!==undefined;});
 if(MODES.some(mode=>mode.value===value)&&(!legacy||explicit?.globalValue!==undefined||explicit?.workspaceValue!==undefined))return value;
 return config.get('multipleAssetWorkspaces',false)||!config.get('simpleAssetInterface',true)?'workspace':'simple';
}
async function publish(){await api.commands.executeCommand('setContext','ikemen.interfaceMode',current());if(home){homeGeneration++;home.webview.html=homeHtml(homeGeneration);}await require('./mode_visibility').publish(current());}
async function refresh(){if(api)await publish();}
async function apply(value){
 if(!MODES.some(mode=>mode.value===value))throw Error('Unknown IKEMaker mode.');
 const config=api.workspace.getConfiguration('ikemenZss'),target=config.inspect('interfaceMode')?.workspaceValue!==undefined?api.ConfigurationTarget.Workspace:api.ConfigurationTarget.Global;
 await config.update('interfaceMode',value,target);
 await context.globalState.update(KEY,{chosen:true,mode:value});await publish();
}
async function choose(firstRun=false){
 if(choosing)return choosing;
 choosing=(async()=>{
  if(firstRun)await context.globalState.update(KEY,{offered:true});
  const chosen=await api.window.showQuickPick(MODES,{title:firstRun?'Welcome to IKEMaker — choose your mode':'IKEMaker — change mode',placeHolder:'Change anytime: IKEMaker Home → Change mode, or Command Palette → IKEMaker: Change Mode. Esc decides later.',matchOnDescription:true,matchOnDetail:true,ignoreFocusOut:true});
  if(!chosen)return false;
  await apply(chosen.value);showHome();
  api.window.showInformationMessage(chosen.label+' selected. Change it anytime from IKEMaker Home → Change mode or the IKEMaker: Change Mode command. Existing tabs and unfinished work stay open; open viewer controls update without clearing forms. Layout changes wait until open dialogs close.');return true;
 })().finally(()=>{choosing=null;});return choosing;
}
async function onboard(existingKeys){
 const config=api.workspace.getConfiguration('ikemenZss'),explicit=config.inspect('interfaceMode');
 if(context.globalState.get(KEY)?.chosen||explicit?.globalValue!==undefined||explicit?.workspaceValue!==undefined){await publish();return false;}
 if(context.globalState.get(KEY)?.offered)return choose(true);
 const legacy=['multipleAssetWorkspaces','simpleAssetInterface'].some(name=>{const setting=config.inspect(name);return setting?.globalValue!==undefined||setting?.workspaceValue!==undefined;});
 const existing=(existingKeys||context.globalState.keys?.()||[]).some(key=>key!==KEY);
 if(legacy||existing){await apply(current());return false;}
 return choose(true);
}
const HOME_ACTIONS=[
  ['ikemen.selectDef.openWorkspace','Characters & Stages','Arrange your roster and stage choices.'],
  ['ikemen.palette.openWorkspace','Palette Workspace','Preview, create, edit, import, export, add, insert, or replace character, stage, screenpack, and fight UI palettes without opening code tools.'],
 ['ikemen.storyDialogue.openPlayer','Stories','View player story routes.'],
 ['ikemen.launchGame','Play','Launch your game.'],
 ['ikemen.character.open','Open Character','Open a character to work on.'],
 ['ikemen.commandMovelist.openEditor','Commands & Movelist','Edit character input definitions and the displayed pause-menu movelist.'],
 ['ikemen.file.createNew','Create Something','Start a new asset or project item.'],
 ['ikemen.productionWorkflow.open','Production Workflow','Coordinate project work and feedback.']
];
function homeActions(mode=current()){return HOME_ACTIONS.filter(([command])=>require('./interface_capabilities').allows(command,mode));}
function homeAllowedCommands(){const setup=current()==='workspace'?['ikemen.workspaceSetup.change','ikemen.workspaceSetup.showAll','ikemen.workspaceSetup.pin']:[];return new Set(['ikemen.changeMode',...setup,...homeActions().map(([command])=>command)]);}
function homeHtml(generation=homeGeneration){return require('./webview_policy').protect(homeMarkup(generation));}
function homeMarkup(generation=homeGeneration){
 const mode=current(),name=MODES.find(item=>item.value===mode).label;
 const actions=homeActions(mode);
 const setup=require('./workspace_setup'),workspace=setup.current(),setupBlock=mode==='workspace'?'<section class="setup"><div><b>Workspace Setup</b><p data-workspace-setup-summary>'+setup.summary(workspace)+'</p><small>'+(workspace.configured?'This project’s tools are focused without removing capabilities.':'This existing project keeps the complete Workspace until you choose a focus.')+'</small></div><div><button data-command="ikemen.workspaceSetup.change">Change Workspace Setup…</button> <button data-command="ikemen.workspaceSetup.showAll">'+(workspace.showAll?'Use Saved Focus':'Show All Tools')+'</button> <button data-command="ikemen.workspaceSetup.pin">Pin Additional Tool…</button></div></section>':'';
 return '<!doctype html><html><head><meta charset="utf-8"><style>body{font:14px var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);padding:24px;max-width:900px;margin:auto}header,.setup{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}.setup{padding:14px;border:1px solid var(--vscode-focusBorder);margin:14px 0}.setup p{margin:4px 0}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}article{padding:20px;border:1px solid var(--vscode-panel-border)}button{font:inherit;padding:9px;color:var(--vscode-button-foreground);background:var(--vscode-button-background);border:0;cursor:pointer}button:focus-visible{outline:2px solid var(--vscode-focusBorder);outline-offset:3px}p{line-height:1.5}</style></head><body><header><h1>IKEMaker · '+name+'</h1><button data-command="ikemen.changeMode">Change mode…</button></header><p>'+MODES.find(item=>item.value===mode).detail+'</p><p>You can change modes here at any time. Your files and unfinished work stay intact.</p>'+setupBlock+'<p id="homeStatus" role="status" aria-live="polite">IKEMaker Home controls are ready.</p><main class="cards">'+actions.map(([command,label,detail])=>'<article><button data-command="'+command+'">'+label+'</button><p>'+detail+'</p></article>').join('')+'</main><script>const vscode=acquireVsCodeApi(),generation='+Number(generation)+',saved=vscode.getState?.()||{},buttons=[...document.querySelectorAll("[data-command]")],status=document.getElementById("homeStatus");let busy=false;function setBusy(value,message=""){busy=Boolean(value);for(const button of buttons){button.disabled=busy;button.title=busy?"Wait for the current Home action to finish.":"Open "+button.textContent.trim()+"."}status.textContent=message||(busy?"IKEMaker Home action in progress…":"IKEMaker Home controls are ready.")}for(const button of buttons)button.onclick=()=>{if(busy)return;vscode.setState({...vscode.getState?.(),focusCommand:button.dataset.command});setBusy(true,"Starting "+button.textContent.trim()+"…");vscode.postMessage({command:button.dataset.command,generation})};addEventListener("message",event=>{if(event.data?.type==="homeBusy"&&event.data.generation===generation)setBusy(event.data.busy,event.data.status)});queueMicrotask(()=>buttons.find(button=>button.dataset.command===saved.focusCommand)?.focus());</script></body></html>';
}
function showHome(){
 if(home){home.reveal();return;}
 home=api.window.createWebviewPanel('ikemenHome','IKEMaker Home',api.ViewColumn.Active,{enableScripts:true});
 const panel=home;homeGeneration++;panel.webview.html=homeHtml(homeGeneration);panel.onDidDispose(()=>{if(home===panel)home=null;});
 panel.webview.onDidReceiveMessage(async message=>{const generation=homeGeneration,allowed=homeAllowedCommands();if(!message||Object.keys(message).length!==2||!allowed.has(message.command)||message.generation!==generation)return;if(homeAction){await panel.webview.postMessage?.({type:'homeBusy',generation,busy:true,status:'Wait for the current Home action to finish.'});return;}const action={panel,generation,command:message.command,token:++homeActionSerial};homeAction=action;try{await panel.webview.postMessage?.({type:'homeBusy',generation,busy:true,status:'IKEMaker Home action in progress…'});if(home!==panel||homeGeneration!==generation||homeAction!==action||!homeAllowedCommands().has(action.command))return;await api.commands.executeCommand(action.command);}catch(error){api.window.showErrorMessage?.(`IKEMaker Home: ${error.message||error}`);}finally{const completed=homeAction===action;if(completed)homeAction=null;const readyPanel=completed&&!homeAction?home:null,readyGeneration=homeGeneration;if(readyPanel)await readyPanel.webview.postMessage?.({type:'homeBusy',generation:readyGeneration,busy:false,status:'IKEMaker Home controls are ready.'});}});
}
function register(vscode,extensionContext){configure(vscode,extensionContext);context.subscriptions.push(api.commands.registerCommand('ikemen.changeMode',()=>choose()),api.commands.registerCommand('ikemen.openHome',showHome),api.workspace.onDidChangeConfiguration(event=>{if(event.affectsConfiguration('ikemenZss.interfaceMode'))publish().catch(()=>{});}));}
module.exports={MODES,current,configure,register,choose,apply,onboard,homeHtml,refresh};
