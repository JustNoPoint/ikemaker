'use strict';

const assert=require('assert');
const Module=require('module');
const originalLoad=Module._load;
let receiver,disposed,warning='',releaseUpdate,updateCount=0;
const commands=new Map(),messages=[],panel={title:'',webview:{html:'',cspSource:'test',onDidReceiveMessage(callback){receiver=message=>callback({generation:panel.ikemenAuthoringGeneration,...message});},postMessage:async message=>{messages.push(message);return true;}},onDidDispose(callback){disposed=callback;},reveal(){},dispose(){disposed?.();}};
const state={favorites:[]},vscode={ViewColumn:{Active:1},Uri:{file:fsPath=>({fsPath})},ConfigurationTarget:{Global:1},commands:{registerCommand(id,callback){commands.set(id,callback);return{};},executeCommand:async()=>{}},workspace:{textDocuments:[],getConfiguration:()=>({get:(_key,fallback)=>fallback}),openTextDocument:async()=>{throw new Error('not used');}},window:{activeTextEditor:null,createWebviewPanel:()=>panel,showWarningMessage:value=>{warning=value;},showErrorMessage:value=>{warning=value;},showInformationMessage:async()=>undefined}};
const context={globalState:{get:(key,fallback)=>key.includes('Favorites')?[...state.favorites]:fallback,update:async(_key,value)=>{updateCount+=1;await new Promise(resolve=>{releaseUpdate=()=>{state.favorites=[...value];resolve();};});}},subscriptions:[]};
Module._load=function(request,parent,isMain){
  if(request==='vscode')return vscode;
  if(parent?.filename.endsWith('authoring_library.js')&&request==='./viewer_group')return{preferredViewerColumn:()=>1,trackViewerPanel:value=>value};
  if(parent?.filename.endsWith('authoring_library.js')&&request==='./webview_policy')return{protect:value=>value};
  return originalLoad.call(this,request,parent,isMain);
};
const library=require('../src/authoring_library');library.register(vscode,context,{capabilities:async()=>({nightlyStringsEnabled:false,enabledCapabilities:[]})});

(async()=>{
  await commands.get('ikemen.authoring.openRecipes')();
  const html=panel.webview.html;
  assert(html.includes('role="tablist"')&&html.includes('role="tab"')&&html.includes('aria-selected="true" tabindex="0" data-view="recipes"'));
  assert(html.includes("event.key==='ArrowRight'")&&html.includes("event.key==='Home'")&&html.includes("event.key==='End'"),'section tabs expose roving keyboard navigation');
  assert(html.includes('role="tabpanel" aria-labelledby="view-recipes"')&&html.includes('id="libraryStatus"')&&html.includes('aria-live="polite"'));
  assert(html.includes('setTimeout(()=>vscode.postMessage({type:\'search\'')&&html.includes('vscode.getState()')&&html.includes("focus==='search'")&&html.includes('window.scrollTo'),'search is debounced and restores its caret and scroll position after a result render');
  assert(html.includes('libraryGeneration=')&&panel.ikemenAuthoringGeneration?.length===32,'every rendered page receives an opaque host-bound generation');
  assert(html.includes('clearTimeout(searchTimer);vscode.setState({view:button.dataset.view'),'section changes cancel old search debounce and restore focus in the destination section');
  assert(html.includes('#symbol-string-role')&&html.includes('[data-compare-symbol-name]')&&html.includes('restoreCatalogAction')&&html.includes('restoreSymbolAction'),'busy and exact focus recovery cover catalog and specialist symbol actions');
  assert(html.includes('*{box-sizing:border-box}')&&html.includes('@media(max-width:520px)')&&html.includes('minmax(min(300px,100%),1fr)'),'narrow layout wraps without fixed-width overflow');

  await receiver({type:'search',view:'recipes',query:'no-result-query-that-cannot-match'});
  assert(panel.webview.html.includes('No entries match this search.'),'empty non-symbol searches explain the result');
  const beforeForged=updateCount;await receiver({type:'favorite',id:'example.sf6'});assert.strictEqual(updateCount,beforeForged,'a valid but non-rendered catalog ID cannot be favorited from stale/forged markup');assert.match(warning,/no longer available/i);

  await receiver({type:'search',view:'recipes',query:'normal basic'});
  assert(panel.ikemenAuthoringRenderedItemIds.has('standard.recipe.normal.basic'));
  const first=receiver({type:'favorite',id:'standard.recipe.normal.basic'});await new Promise(resolve=>setImmediate(resolve));
  const second=await receiver({type:'favorite',id:'standard.recipe.normal.basic'});assert.strictEqual(second,false,'a duplicate body action is rejected while the first is pending');assert.strictEqual(updateCount,beforeForged+1);assert(messages.some(message=>message.type==='libraryBusy'&&/Wait for the current/.test(message.status)),'duplicate action receives an actionable busy reason');
  releaseUpdate();await first;assert.deepStrictEqual(state.favorites,['standard.recipe.normal.basic']);assert(panel.webview.html.includes('value="normal basic"'),'favorite rerender preserves the active query');
  const concurrentA=library.toggleFavorite('example.sf6'),concurrentB=library.toggleFavorite('example.ds');await new Promise(resolve=>setImmediate(resolve));releaseUpdate();await new Promise(resolve=>setImmediate(resolve));releaseUpdate();await Promise.all([concurrentA,concurrentB]);assert.deepStrictEqual(state.favorites,['standard.recipe.normal.basic','example.sf6','example.ds'],'serialized favorite mutations retain both concurrent choices');
  console.log('Authoring Library tabs, search focus, narrow layout, action authority, and busy guidance are accessible');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{Module._load=originalLoad;});
