'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),childProcess=require('node:child_process');
const {validRequest}=require('./ikemeter_companion_host');
const COMMAND='ikemen.openIKeMeter';
function within(file,root){const relative=path.relative(root,file);return relative===''||relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);}
function validatePackage(launcher){
  if(typeof launcher!=='string'||!path.isAbsolute(launcher)||path.basename(launcher).toLowerCase()!=='start-ikemeter.ps1')throw new Error('Choose Start-IKeMeter.ps1 from an extracted local tester package.');
  const root=fs.realpathSync(path.dirname(launcher));
  if(fs.lstatSync(launcher).isSymbolicLink())throw new Error('A linked IKeMeter launcher is not supported.');
  const metadata=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  if(metadata.name!=='ikemeter')throw new Error('The selected launcher is not an IKeMeter tester package.');
  const manifest=fs.readFileSync(path.join(root,'SHA256SUMS.txt'),'utf8').replace(/^\uFEFF/,'').trim().split(/\r?\n/);const names=new Set();
  for(const line of manifest){const match=line.match(/^([a-f0-9]{64})  (.+)$/);if(!match)throw new Error('Invalid IKeMeter package manifest.');const file=path.resolve(root,match[2]);if(!within(file,root)||!within(fs.realpathSync(file),root)||fs.lstatSync(file).isSymbolicLink()||!fs.statSync(file).isFile())throw new Error('IKeMeter manifest leaves its package.');if(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==match[1])throw new Error('IKeMeter package changed: '+match[2]);names.add(match[2].replaceAll('\\','/'));}
  for(const name of ['Start-IKeMeter.ps1','src/app_server.js','src/session_controller.js','src/attached_nightly_driver.js','src/recover_sessions.js','app/index.html','app/app.js','app/entity_labels.js','app/styles.css'])if(!names.has(name))throw new Error('IKeMeter package is incomplete: '+name);
  return root;
}
function validateRuntime(runtime){
  if(!runtime||!path.isAbsolute(runtime))throw new Error('Choose a local IKEMEN runtime folder.');
  runtime=fs.realpathSync(runtime);
  for(const name of ['Ikemen_GO.exe','external/mods','save'])if(!fs.existsSync(path.join(runtime,name)))throw new Error('IKeMeter needs an IKEMEN runtime with Ikemen_GO.exe, external/mods and save.');
  return runtime;
}
async function resolveRuntime(vscode,seed,services={}){
  const source=seed?.scheme==='file'?seed.fsPath:vscode.window.activeTextEditor?.document?.uri?.fsPath||'';
  const configured=vscode.workspace.getConfiguration('ikemenZss',seed).get('ikemenPath','');
  const gameRoot=services.gameRoot||require('./character_context').gameRoot;
  let root=gameRoot(source)||vscode.workspace.workspaceFolders?.map(folder=>gameRoot(folder.uri.fsPath)).find(Boolean)||'';
  if(!root&&configured&&path.isAbsolute(configured))root=path.dirname(configured);
  if(root){const executable=(services.engineResolve||require('./engine_runtime').resolve)(root,configured,source);if(path.basename(executable).toLowerCase()!=='ikemen_go.exe')throw new Error('The selected engine target is not named Ikemen_GO.exe; this Meter tester cannot substitute a different executable.');return validateRuntime(path.dirname(executable));}
  const picked=await vscode.window.showOpenDialog({title:'Choose the IKEMEN runtime for IKeMeter (Connect remains explicit)',canSelectFiles:false,canSelectFolders:true,canSelectMany:false});
  return picked?.[0]?validateRuntime(picked[0].fsPath):null;
}
function resolvePowerShell7(vscode,services={}){
 const environment=services.environment||process.env;
 const configuration=vscode.workspace.getConfiguration('ikemenZss'),explicit=configuration.inspect?.('ikeMeterPowerShellPath')?.globalValue||'';
 const home=services.home||require('node:os').homedir(),programFiles=environment.ProgramFiles||'C:\\Program Files';
 const candidates=explicit?[explicit]:[
  ...String(environment.Path||environment.PATH||'').split(path.delimiter).filter(value=>path.isAbsolute(value)).map(value=>path.join(value,'pwsh.exe')),
  path.join(programFiles,'PowerShell','7','pwsh.exe'),
  path.join(home,'.cache','codex-runtimes','codex-primary-runtime','dependencies','native','powershell','pwsh.exe')
 ];
 const workspaces=vscode.workspace.workspaceFolders?.filter(folder=>folder.uri.scheme==='file').map(folder=>fs.realpathSync(folder.uri.fsPath))||[];
 for(const candidate of [...new Set(candidates)]){
  try{
   if(!path.isAbsolute(candidate)||path.basename(candidate).toLowerCase()!=='pwsh.exe'||!fs.existsSync(candidate)||fs.lstatSync(candidate).isSymbolicLink())continue;
   const executable=fs.realpathSync(candidate);if(workspaces.some(root=>within(executable,root)))continue;
   const result=(services.spawnSync||childProcess.spawnSync)(executable,['-NoProfile','-NonInteractive','-Command','$PSVersionTable.PSVersion.Major'],{encoding:'utf8',timeout:5000,windowsHide:true,env:environment});
   if(result.status===0&&/^\s*(?:[7-9]|[1-9][0-9]+)\s*$/.test(result.stdout))return executable;
  }catch{}
 }
 throw new Error('PowerShell 7 was not found outside workspace code. Set the user-only ikemenZss.ikeMeterPowerShellPath to an installed pwsh.exe.');
}
function htmlEscape(value){return String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
function client(){
 const api=acquireVsCodeApi(),pending=new Map();let sequence=0;
 window.fetch=(input,options={})=>new Promise((resolve,reject)=>{const resource=String(input),method=options.method||'GET';if(!(method==='GET'&&['/api/status','/api/history'].includes(resource)||method==='POST'&&/^\/api\/(connect|pause|step|resume|disconnect|restart)$/.test(resource))){reject(new Error('Unsupported Meter request'));return;}const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(new Error('Meter host did not respond'));},20000);pending.set(id,{resolve,reject,timer});const message={type:'ikemeterRequest',id,path:resource,method};const headers=new Headers(options.headers||{});if(method==='POST'&&headers.has('X-IKeMeter-Session'))message.authority={sessionId:headers.get('X-IKeMeter-Session'),epoch:Number(headers.get('X-IKeMeter-Epoch')),continuityRevision:Number(headers.get('X-IKeMeter-Continuity'))};api.postMessage(message);});
 addEventListener('message',event=>{const message=event.data;if(message?.type!=='ikemeterResponse'||!Number.isSafeInteger(message.id))return;const request=pending.get(message.id);if(!request)return;clearTimeout(request.timer);pending.delete(message.id);request.resolve({status:message.status,ok:message.status>=200&&message.status<300,json:async()=>message.body});});
}
function panelHtml(panel,root,runtime,vscode){
 const nonce=crypto.randomBytes(18).toString('base64'),assets=path.join(root,'app');let html=fs.readFileSync(path.join(assets,'index.html'),'utf8');
 const csp=`default-src 'none'; style-src ${panel.webview.cspSource}; script-src 'nonce-${nonce}'; img-src ${panel.webview.cspSource} data:; connect-src 'none'`;
 html=html.replace('<head>',`<head><meta http-equiv="Content-Security-Policy" content="${htmlEscape(csp)}"><script nonce="${nonce}">(${client.toString()})();</script>`);
 html=html.replace(/(href|src)="(styles\.css|entity_labels\.js|app\.js)"/g,(_,attribute,name)=>`${attribute}="${panel.webview.asWebviewUri(vscode.Uri.file(path.join(assets,name)))}"${attribute==='src'?` nonce="${nonce}"`:''}`);
 return html.replace('<main>',`<main><p role="note">Runtime: ${htmlEscape(runtime)}. Connect starts a local test game and temporarily installs Meter’s bridge and runtime lease. Closing this tab stops a connected test game; Disconnect keeps the game open.</p>`);
}
function createManager(vscode,context,services={}){
 let host=null,panel=null,opening=null,closing=null,root='',runtime='',disposed=false,requestSequence=0;
 const pending=new Map(),spawn=services.spawn||childProcess.spawn;
 const bundled=path.join(context.extensionPath,'companions','IKeMeter','Start-IKeMeter.ps1');
 async function choose(){
  const picked=await vscode.window.showOpenDialog({title:'Choose IKeMeter Start-IKeMeter.ps1 from an extracted tester package',canSelectFiles:true,canSelectFolders:false,canSelectMany:false,filters:{'IKeMeter launcher':['ps1']}});
  if(!picked?.[0])return false;validatePackage(picked[0].fsPath);
  await vscode.workspace.getConfiguration('ikemenZss').update('ikeMeterLauncher',picked[0].fsPath,vscode.ConfigurationTarget.Global);return true;
 }
 function failPending(reason){for(const entry of pending.values()){clearTimeout(entry.timer);if(entry.panel===panel)entry.panel.webview.postMessage({type:'ikemeterResponse',id:entry.id,status:503,body:{error:reason}});}pending.clear();}
 function show(){
  if(panel){panel.reveal();return panel;}
  panel=require('./viewer_group').trackViewerPanel(vscode.window.createWebviewPanel('ikemenIKeMeter','IKeMeter',vscode.ViewColumn.Active,{enableScripts:true,retainContextWhenHidden:true,localResourceRoots:[vscode.Uri.file(path.join(root,'app'))]}));
  const owner=panel;panel.webview.html=panelHtml(panel,root,runtime,vscode);
  panel.onDidDispose(()=>{if(panel===owner){panel=null;void stop();}});
  panel.webview.onDidReceiveMessage(message=>{
   if(panel!==owner||!validRequest(message)||!host?.connected||pending.size>=16)return;
   const id=++requestSequence,timer=setTimeout(()=>{const entry=pending.get(id);if(entry?.panel===owner){pending.delete(id);owner.webview.postMessage({type:'ikemeterResponse',id:message.id,status:503,body:{error:'Meter operation exceeded its bound'}});}},20000);
   pending.set(id,{panel:owner,id:message.id,timer});host.send({...message,id});
  });
  return panel;
 }
 async function start(seed){
  if(disposed)throw new Error('IKeMeter integration is stopping.');
  if(vscode.workspace.isTrusted!==true||vscode.env.remoteName||process.platform!=='win32'||vscode.workspace.workspaceFolders?.some(folder=>folder.uri.scheme!=='file'))throw new Error('IKeMeter requires a trusted local Windows workspace.');
  if(closing)await closing.promise;
  if(disposed)throw new Error('IKeMeter integration is stopping.');
  if(host?.connected){show();await vscode.window.showInformationMessage('IKeMeter is already open for '+runtime+'. Close its tab before choosing another runtime.');return true;}
  const configuration=vscode.workspace.getConfiguration('ikemenZss'),explicit=configuration.inspect?.('ikeMeterLauncher')?.globalValue||'';
  root=validatePackage(explicit||bundled);const powershell=(services.resolvePowerShell||resolvePowerShell7)(vscode);runtime=await(services.resolveRuntime||resolveRuntime)(vscode,seed);if(!runtime)return false;
  await new Promise((resolve,reject)=>{
   let ready=false,settled=false;const child=spawn(services.nodeExecutable||process.execPath,[path.join(context.extensionPath,'src','ikemeter_companion_host.js'),root,runtime,powershell],{cwd:context.extensionPath,env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},windowsHide:true,stdio:['ignore','ignore','pipe','ipc']});
   host=child;let stderr='';child.stderr?.on('data',chunk=>{stderr=(stderr+chunk).slice(-2000);});
   const timer=setTimeout(()=>finish(new Error('IKeMeter did not become ready in time')),10000);
   function finish(error){if(settled)return;settled=true;clearTimeout(timer);if(error){if(host===child)host=null;child.kill();reject(error);}else resolve();}
   child.on('message',message=>{
    if(host!==child)return;
    if(message?.type==='ikemeterReady'&&!ready){ready=true;finish();return;}
    if(message?.type==='ikemeterResponse'){const entry=pending.get(message.id);if(entry){clearTimeout(entry.timer);pending.delete(message.id);entry.panel.webview.postMessage({...message,id:entry.id});}}
   });
   child.once('error',error=>finish(error));
   child.once('exit',()=>{if(host===child){host=null;failPending('Meter host ended; reopen IKeMeter for a fresh disconnected host.');const oldPanel=panel;panel=null;oldPanel?.dispose();}if(!ready)finish(new Error(stderr.trim()||'IKeMeter ended before startup'));});
  });
  if(disposed){await stop();return false;}show();return true;
 }
 async function open(seed){
  if(opening)return opening;
  opening=start(seed).catch(async error=>{if(disposed)return false;const action=await vscode.window.showErrorMessage('IKeMeter could not open. IKEMaker stayed open. '+error.message,'Choose Launcher');if(action==='Choose Launcher'&&await choose())return start(seed);return false;}).finally(()=>{opening=null;});return opening;
 }
 async function stop(){
  if(closing)return closing.promise;
  const child=host;host=null;const oldPanel=panel;panel=null;oldPanel?.dispose();failPending('IKeMeter stopped');if(!child)return;
  const promise=new Promise(resolve=>{const timer=setTimeout(()=>{child.kill();resolve();},7000);child.once('exit',()=>{clearTimeout(timer);resolve();});if(child.connected)child.send({type:'ikemeterShutdown'});else{child.kill();clearTimeout(timer);resolve();}});
  closing={child,promise};try{await promise;}finally{if(closing?.child===child)closing=null;}
 }
 return {open,choose,stop,dispose(){disposed=true;void stop();}};
}
function register(vscode,context){const manager=createManager(vscode,context);context.subscriptions.push(manager,vscode.commands.registerCommand(COMMAND,seed=>manager.open(seed)),vscode.commands.registerCommand('ikemen.configureIKeMeter',()=>manager.choose()),vscode.commands.registerCommand('ikemen.closeIKeMeter',()=>manager.stop()));return manager;}
module.exports={COMMAND,validatePackage,validateRuntime,resolveRuntime,resolvePowerShell7,panelHtml,createManager,register};
