'use strict';
const {randomUUID}=require('node:crypto'),path=require('node:path');
const drawers=new WeakMap();
function createDrawer(parent,vscode,sourcePath){drawers.get(parent)?.dispose();const previousOptions=parent.webview.options;const id=randomUUID(),messages=new Set(),closed=new Set();let disposed=false,html='',lastModel;
 const send=payload=>!disposed&&parent.webview.postMessage(payload);
 const panel={webview:{cspSource:parent.webview.cspSource,asWebviewUri:uri=>parent.webview.asWebviewUri(uri),postMessage:async payload=>{if(payload.type==='voiceSplitModel')lastModel=payload;else if(payload.type==='voiceDragTicket'&&lastModel?.revision===payload.revision)lastModel={...lastModel,voiceDragTicket:payload.ticket};return send({type:'voiceDrawerMessage',id,payload});},onDidReceiveMessage:fn=>{messages.add(fn);return{dispose:()=>messages.delete(fn)};}},onDidDispose:fn=>{closed.add(fn);return{dispose:()=>closed.delete(fn)};},dispose(){if(disposed)return;disposed=true;receiver.dispose();parentClosed.dispose();if(drawers.get(parent)===panel){drawers.delete(parent);parent.webview.options=previousOptions;}void parent.webview.postMessage({type:'voiceDrawerClose',id});for(const fn of closed)fn();}};
 Object.defineProperty(panel.webview,'html',{set:value=>{html=value;void send({type:'voiceDrawerOpen',id,html});},get:()=>html});
 const receiver=parent.webview.onDidReceiveMessage(message=>{if(disposed)return;if(message.type==='voiceDrawerReady'){if(html)void send({type:'voiceDrawerOpen',id,html});return;}if(message.type==='voiceDrawerMessage'&&message.id===id){if(message.payload?.type==='ready'&&lastModel){void send({type:'voiceDrawerMessage',id,payload:lastModel});return;}for(const fn of messages)void fn(message.payload);}}),parentClosed=parent.onDidDispose(()=>panel.dispose());
 const roots=previousOptions?.localResourceRoots||vscode.workspace?.workspaceFolders?.map(folder=>folder.uri)||[];
 let voiceOptions={localResourceRoots:[vscode.Uri.file(path.dirname(sourcePath))]};
 Object.defineProperty(panel.webview,'options',{
   get:()=>voiceOptions,
   set:options=>{
     if(disposed)return;
     voiceOptions=options;
     const combined=new Map([...roots,...(options.localResourceRoots||[])].map(uri=>[uri.fsPath,uri]));
     parent.webview.options={...parent.webview.options,localResourceRoots:[...combined.values()]};
   }
 });
 panel.webview.options=voiceOptions;
 drawers.set(parent,panel);return panel;
}
module.exports={createDrawer};
