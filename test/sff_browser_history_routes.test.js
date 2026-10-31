'use strict';

const assert=require('assert'),fs=require('fs'),Module=require('module'),vm=require('vm');
const original=Module._load;Module._load=function(request,parent,main){if(request==='vscode')return{};return original.call(this,request,parent,main)};
const browser=require('../src/sff_browser');Module._load=original;

(async()=>{
  const model={filename:'C:/chars/Test/Test.sff',title:'Test.sff',palettes:[],animations:[],sprites:[],history:{available:false,undo:false,redo:false,reason:'Open the exact SFF Viewer.'}};
  const html=browser.page(model),script=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)][0][1],sync=script.match(/function syncHistory\(\)\{[^\n]+\}/);
  assert(html.includes('id="browserUndo" aria-describedby="historyStatus"')&&html.includes('id="historyStatus" class="muted" role="status" aria-live="polite"'),'SFF browser history controls expose visible live reasons');
  assert(sync,'actual SFF history availability transition must be extractable from production client');
  const browserUndoEl={disabled:false,title:''},browserRedoEl={disabled:false,title:''},historyStatusEl={textContent:''},context={model:{transfer:null},history:model.history,browserUndoEl,browserRedoEl,historyStatusEl};vm.createContext(context);vm.runInContext(sync[0]+';syncHistory()',context);assert.strictEqual(browserUndoEl.disabled,true);assert.strictEqual(browserRedoEl.disabled,true);assert.match(historyStatusEl.textContent,/Open the exact SFF Viewer/);context.history={available:true,undo:true,redo:false,reason:''};vm.runInContext('syncHistory()',context);assert.strictEqual(browserUndoEl.disabled,false);assert.strictEqual(browserRedoEl.disabled,true);assert.match(historyStatusEl.textContent,/Undo available/);
  const calls=[],viewer={requestSffViewerHistory(filename,direction){calls.push({filename,direction});return true}},record={filename:model.filename,transferPinned:false,disposed:false,unavailable:false};
  assert.strictEqual(await browser.requestBrowserHistory(record,'undo',viewer),true);assert.deepStrictEqual(calls,[{filename:model.filename,direction:'undo'}],'ordinary history reaches the exact SFF Viewer owner');
  for(const blocked of [{...record,transferPinned:true},{...record,disposed:true},{...record,unavailable:true}])assert.strictEqual(await browser.requestBrowserHistory(blocked,'redo',viewer),false);
  assert.strictEqual(calls.length,1,'Transfer, disposed, and unavailable browser records cannot reach viewer history');
  const source=fs.readFileSync(require.resolve('../src/sff_browser'),'utf8');assert(!source.includes("executeCommand('undo')")&&!source.includes("executeCommand('redo')"),'SFF browser no longer invokes unbound global history');
  console.log('SFF browser Undo/Redo use exact viewer-owned history with live reasons and reject unavailable records');
})().catch(error=>{console.error(error);process.exitCode=1});
