'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const requests = [], posts = [], commands = [];
const historyByFile = new Map();
const sndViewer = {
  sndViewerHistoryState(filename) { return historyByFile.get(path.resolve(filename)) || { available:false, undo:false, redo:false, reason:'Open the exact SND Viewer to use its edit history.' }; },
  async requestSndViewerHistory(filename, direction) { requests.push({ filename:path.resolve(filename), direction }); return true; }
};
let receive = null;
const panel = {
  title:'', viewColumn:2,
  webview:{html:'',onDidReceiveMessage(listener){receive=listener;return{dispose(){}}},postMessage(message){posts.push(message);return true}},
  reveal(){},dispose(){},onDidDispose(){return{dispose(){}}},onDidChangeViewState(){return{dispose(){}}}
};
const vscode={ViewColumn:{Beside:2},commands:{async executeCommand(command){commands.push(command)}},Uri:{file(fsPath){return{fsPath}}},window:{}};
const original=Module._load;
Module._load=function(request,parent,main){
  if(request==='vscode')return vscode;
  if(request==='./snd_viewer'&&parent?.filename?.endsWith('snd_browser.js'))return sndViewer;
  if(request==='./viewer_navigation'&&parent?.filename?.endsWith('snd_browser.js'))return{associatedDefs(){return[]}};
  if(request==='./authoring_context_registry'&&parent?.filename?.endsWith('snd_browser.js'))return{registerAuthoringPanel(){}};
  if(request==='./entity_switch_runtime'&&parent?.filename?.endsWith('snd_browser.js'))return{attachEntitySurface(){}};
  return original.call(this,request,parent,main);
};

(async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'snd-browser-history-'));
  try{
    const browser=require('../src/snd_browser'),filename=path.join(root,'owner.snd');
    fs.writeFileSync(filename,'history owner');
    historyByFile.set(path.resolve(filename),{available:true,undo:true,redo:false,reason:''});
    const archive={filename,buffer:Buffer.alloc(0),entries:[]};
    const record=await browser.attach(panel,filename,archive,{});
    assert.strictEqual(typeof receive,'function');
    assert(panel.webview.html.includes('id="browserUndo" aria-describedby="historyStatus"'));
    assert(panel.webview.html.includes('id="historyStatus"')&&panel.webview.html.includes("function syncHistory()"),'history controls expose a visible live availability reason');
    await receive({type:'documentUndo'});await receive({type:'documentRedo'});
    assert.deepStrictEqual(requests,[{filename:path.resolve(filename),direction:'undo'},{filename:path.resolve(filename),direction:'redo'}],'browser history routes to the exact SND Viewer owner, never the active native editor');
    assert.deepStrictEqual(commands,[],'browser history never dispatches unbound global undo/redo');
    browser.updateHistoryState(filename,{available:true,undo:false,redo:true});
    assert.deepStrictEqual(posts.at(-1),{type:'historyState',value:{available:true,undo:false,redo:true,reason:''}},'viewer history availability updates the exact live browser');
    browser.suspendRecord(record,{label:'Unavailable',kind:'character'},'No SND applies.');
    await receive({type:'documentUndo'});
    assert.strictEqual(requests.length,2,'an unavailable browser cannot mutate history through a late or forged message');
    console.log('SND browser Undo/Redo use exact viewer-owned history with live reasons and reject unavailable late messages');
  }finally{Module._load=original;fs.rmSync(root,{recursive:true,force:true});}
})().catch(error=>{Module._load=original;console.error(error);process.exitCode=1});
