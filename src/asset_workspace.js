'use strict';
let vscode, sequence=0, current, switching=Promise.resolve();
const panels=new Map(), pending=new Map(), snapshots=new Map();
const key=file=>String(file||'').replace(/\\/g,'/').toLowerCase();
function configure(api){vscode=api;}
function compact(){const mode=vscode?.workspace.getConfiguration('ikemenZss').get('interfaceMode');return mode?mode!=='workspace':!vscode||vscode.workspace.getConfiguration('ikemenZss').get('simpleAssetInterface',true);}
function multiple(){const mode=vscode?.workspace.getConfiguration('ikemenZss').get('interfaceMode');return mode?mode==='workspace':!vscode||vscode.workspace.getConfiguration('ikemenZss').get('multipleAssetWorkspaces',false);}
async function capture(panel){
 if(!panels.has(panel))return true;
 const id=++sequence;
 return new Promise(resolve=>{
  const timeout=setTimeout(()=>{pending.delete(id);resolve(false);},3000);
  pending.set(id,{panel,finish:result=>{clearTimeout(timeout);pending.delete(id);resolve(result);}});
  Promise.resolve(panel.webview.postMessage({type:'assetWorkspaceCapture',id})).then(sent=>{if(sent===false)pending.get(id)?.finish(false);}).catch(()=>pending.get(id)?.finish(false));
 });
}
async function beforeOpen(file){
 if(multiple())return true;
 for(const [panel,entry] of panels){if(key(file)===key(entry.file))continue;if(!await capture(panel)){vscode.window.showInformationMessage('Finish or revert the current sprite/animation edits before switching. You can also enable multiple asset workspaces in Settings.');panel.reveal(panel.viewColumn,false);return false;}}
 return true;
}
function decorate(panel,file,kind,page,explicitSelection=false){
 const firstAttachment=!panels.has(panel);
 if(firstAttachment){
  panels.set(panel,{file,kind});panel.onDidDispose(()=>{panels.delete(panel);if(current===panel)current=undefined;for(const request of [...pending.values()])if(request.panel===panel)request.finish(false);});
  panel.onDidChangeViewState?.(event=>{if(event.webviewPanel.active)current=panel;});
 }
 let cached=firstAttachment?snapshots.get(key(file)):undefined;
 if(firstAttachment)snapshots.delete(key(file));
 if(cached&&(explicitSelection||panel.pendingReference))cached={...cached,reference:undefined};
 if(cached){const data=JSON.stringify(cached).replace(/</g,'\\u003c');page=page.replace('acquireVsCodeApi()',`(()=>{const api=acquireVsCodeApi();globalThis.ikemenResumeAsset=${data};return {getState:()=>api.getState()||globalThis.ikemenResumeAsset.state,setState:value=>api.setState(value),postMessage:message=>api.postMessage(message)}})()`);}
 if(compact())page=page.replace(/(<details\b[^>]*?)\sopen(?=[\s>])/g,'$1').replace('<body>','<body data-simple-assets="true">');
 return page;
}
async function handle(message,panel){
 if(message?.type==='assetWorkspaceCaptured'){
  const request=pending.get(message.id);if(!request||request.panel!==panel)return true;
  if(message.clean===true){const entry=panels.get(panel);if(entry){const filename=key(entry.file);snapshots.delete(filename);snapshots.set(filename,{state:message.state,reference:message.reference,scroll:message.scroll,fields:message.fields});while(snapshots.size>40)snapshots.delete(snapshots.keys().next().value);}}
  request.finish(message.clean===true);return true;
 }
 if(message?.type==='assetWorkspaceOptions'){await chooseMode();return true;}
 if(message?.type!=='assetWorkspaceReady')return false;
 switching=switching.catch(()=>{}).then(()=>activate(panel));await switching;return true;
}
async function activate(panel){
 if(!panels.has(panel))return true;
 if(!multiple())for(const old of [...panels.keys()]){
  if(old===panel)continue;
  if(!await capture(old)){const replacementClean=await capture(panel);if(replacementClean)panel.dispose();old.reveal(old.viewColumn,false);vscode.window.showInformationMessage(replacementClean?'The previous asset workspace has unfinished edits or is not responding. It was kept open.':'Both asset workspaces were kept open because edits or pending work could not be safely discarded. Save or revert before switching.');return true;}
  if(panels.has(panel)){panel.reveal(old.viewColumn,false);old.dispose();}
 }
 current=panel;return true;
}
async function chooseMode(){return require('./interface_mode').choose();}
function register(context){context.subscriptions.push(vscode.commands.registerCommand('ikemen.configureAssetWorkspace',chooseMode));}
function client(){
 if(document.body.dataset.simpleAssets==='true'){
  for(const section of document.querySelectorAll('.advanced-actions')){const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Advanced tools';section.before(details);details.append(summary,section);}
  const toolbar=document.querySelector('body > header, body > .toolbar, body > .header');
  if(toolbar){const tools=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Tools & view';tools.append(summary);
   for(const id of ['experience','openSff','airSource','gifToAir','actionLog','axisLayer','exportPreview','saveAirPalette','saveAirGroupPalette','clearAirGroupPalette','palFx','openEditor','copyCall','exportMarked','chooseEditor']){const button=document.getElementById(id);if(button&&toolbar.contains(button))tools.append(button);}
   for(const id of ['proofBackground','proofColor']){const control=document.getElementById(id);if(control&&toolbar.contains(control))tools.append(control.closest('label')||control);}
   const paneButtons=toolbar.querySelector('.pane-buttons');if(paneButtons)tools.append(paneButtons);
   const description=toolbar.querySelector(':scope > div > .muted');if(description)description.textContent=description.textContent.split(' · ').slice(0,3).join(' · ');
   if(tools.children.length>1)toolbar.append(tools);
  }
 }
 addEventListener('message',event=>{const m=event.data;if(m.type!=='assetWorkspaceCapture')return;
 const clean=typeof globalThis.ikemenCanLeaveAsset==='function'&&globalThis.ikemenCanLeaveAsset();
 const fields=Object.fromEntries([...document.querySelectorAll('input[id]')].filter(e=>/search|filter/i.test(e.id)).map(e=>[e.id,e.value]));
 const scroll=[...document.querySelectorAll('[id]')].filter(e=>e.scrollTop||e.scrollLeft).map(e=>({id:e.id,top:e.scrollTop,left:e.scrollLeft}));
 vscode.postMessage({type:'assetWorkspaceCaptured',id:m.id,clean,state:vscode.getState(),reference:globalThis.ikemenNavigationSelection?.(),fields,scroll});
 });
 requestAnimationFrame(()=>{
 const saved=globalThis.ikemenResumeAsset;
 if(saved){if(saved.reference){const surface=document.querySelector('[data-toolbar-surface]')?.dataset.toolbarSurface;window.dispatchEvent(new MessageEvent('message',{data:surface==='air'?{type:'selectAction',action:saved.reference.group,frameIndex:saved.reference.frameIndex}:{type:'navigateReference',reference:saved.reference}}));}
 for(const [id,value] of Object.entries(saved.fields||{})){const e=document.getElementById(id);if(e){e.value=value;e.dispatchEvent(new Event('input'));}}
 requestAnimationFrame(()=>{for(const position of saved.scroll||[]){const e=document.getElementById(position.id);if(e){e.scrollTop=position.top;e.scrollLeft=position.left;}}});}
 vscode.postMessage({type:'assetWorkspaceReady'});
 });
}
module.exports={configure,register,compact,multiple,beforeOpen,decorate,handle,clientScript:()=>`(${client.toString()})();`};
