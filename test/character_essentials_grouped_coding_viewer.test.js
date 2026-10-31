'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL, fileURLToPath } = require('url');
const { registerAuthoringWorkspace, openCharacterCodingSet, validateCharacterCodingDescriptor } = require('../src/authoring_workspace');
const contexts = require('../src/authoring_context_registry');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-essential-code-')), nested = path.join(root, 'states', 'nested');
fs.mkdirSync(nested, { recursive:true });
const files = {
  def:path.join(root,'Hero.def'), zss:path.join(root,'normal.zss'), cns:path.join(nested,'special.cns'),
  cmd:path.join(root,'Hero.cmd'), air:path.join(root,'Hero.air'), txt:path.join(root,'configured.txt'),
  md:path.join(root,'notes.md'), lua:path.join(nested,'helper.lua'), altdef:path.join(root,'Alt.def'), missing:path.join(root,'gone.zss')
};
fs.writeFileSync(files.def, '[Info]\nname=Hero\n[Files]\nst=normal.zss\n');
fs.writeFileSync(files.zss, '[State 100]\nlet x = 1\n'); fs.writeFileSync(files.cns, '[Statedef 200]\ntype=S\n');
fs.writeFileSync(files.cmd, '[Command]\nname="x"\ncommand=x\n'); fs.writeFileSync(files.air, '[Begin Action 0]\n0,0,0,0,1\n');
fs.writeFileSync(files.txt, '[State 300]\n'); fs.writeFileSync(files.md, '# notes\n'); fs.writeFileSync(files.lua, 'return {}\n');
fs.writeFileSync(files.altdef,'[Info]\nname=Alt\n[Files]\nst=normal.zss\n');
const secondRoot=fs.mkdtempSync(path.join(os.tmpdir(),'ikemaker-essential-code-b-')),secondDef=path.join(secondRoot,'Other.def');fs.writeFileSync(secondDef,'[Info]\nname=Other\n');

const commands=new Map(), serializers=new Map(), panels=[], shown=[], warnings=[], notices=[], updates=[];
let presentation, quickPicks=0, openBoundary=null, showBoundary=null, deactivateOnShow=false, failPreferenceWrite=false, throwPrompt=false, revealedRanges=0, quickPickLabels=[], inputBoxValues=[];
function uri(filename){const fsPath=path.resolve(filename);return{fsPath,scheme:'file',toString:()=>pathToFileURL(fsPath).toString()};}
function document(filename){const value={fileName:path.resolve(filename),uri:uri(filename),languageId:path.extname(filename).slice(1),version:1,isDirty:false,isClosed:false,text:fs.readFileSync(filename,'utf8'),getText(){return this.text;},positionAt(offset){return{line:0,character:offset};},save:async()=>true};return value;}
const documents=new Map(Object.values(files).filter(fs.existsSync).map(filename=>[uri(filename).toString(),document(filename)]));
documents.set(uri(secondDef).toString(),document(secondDef));
function disposable(){return{dispose(){}};}
async function liveEdit(target,text){const revision=Number(/let editRevision=(\d+)/.exec(target.webview.html)?.[1]||0)+1,generation=Number(/editGeneration=(\d+)/.exec(target.webview.html)?.[1]||0);return target.receive({type:'edit-source',text,revision,generation});}
function makePanel(type){const receive=[],dispose=[],view=[];return{type,active:true,disposed:false,title:'',viewColumn:2,revealed:0,webview:{cspSource:'test:',html:'',onDidReceiveMessage(fn){receive.push(fn);return disposable();},postMessage:async()=>true},onDidDispose(fn){dispose.push(fn);return disposable();},onDidChangeViewState(fn){view.push(fn);return disposable();},reveal(){this.revealed++;this.active=true;for(const fn of view)fn({webviewPanel:this});},async receive(message){for(const fn of receive)await fn(message);},dispose(){this.disposed=true;for(const fn of dispose.splice(0))fn();}};}
class Position{constructor(line,character){this.line=line;this.character=character;}} class Range{constructor(a,b){this.start=a;this.end=b;}} class Selection{constructor(a,b){this.start=a;this.end=b;}}
const vscode={
  Uri:{file:uri,parse:value=>uri(fileURLToPath(value))},ViewColumn:{Active:-1,Beside:-2},Position,Range,Selection,WorkspaceEdit:class{replace(uri,range,text){this.uri=uri;this.range=range;this.text=text;}},ConfigurationTarget:{Global:1},
  workspace:{textDocuments:[...documents.values()],getConfiguration(){return{get(key,fallback){return key==='additionalCodeExtensions'?['txt']:fallback;},inspect(key){return key==='authoring.presentation'?{globalValue:presentation}:{};},async update(_key,value){if(failPreferenceWrite){failPreferenceWrite=false;throw new Error('settings unavailable');}presentation=value;updates.push(value);}};},async openTextDocument(target){if(openBoundary)await openBoundary(target);const found=documents.get(String(target));if(!found)throw new Error('missing');if(found.isClosed)found.isClosed=false;return found;},onDidChangeTextDocument(){return disposable();},async applyEdit(edit){const found=documents.get(String(edit.uri));if(!found)return false;found.text=edit.text;found.version+=1;found.isDirty=true;return true;}},
  window:{activeTextEditor:null,createWebviewPanel(type){const panel=makePanel(type);panels.push(panel);return panel;},registerWebviewPanelSerializer(type,value){serializers.set(type,value);return disposable();},async showTextDocument(doc){shown.push(doc.fileName);if(showBoundary)return showBoundary(doc);if(deactivateOnShow)for(const panel of panels)panel.active=false;return{document:doc,revealRange(){revealedRanges++;}};},async showQuickPick(items){quickPicks++;if(throwPrompt){throwPrompt=false;throw new Error('prompt unavailable');}if(quickPickLabels.length){const label=quickPickLabels.shift();return label===null?undefined:items.find((item)=>item.label===label);}return items[0];},async showInputBox(){if(!inputBoxValues.length)return undefined;const value=inputBoxValues.shift();return typeof value==='function'?value():value;},showWarningMessage(message){warnings.push(message);},showInformationMessage(message){notices.push(message);}},
  commands:{registerCommand(id,fn){commands.set(id,fn);return disposable();},executeCommand:async()=>true}
};
const state=new Map(),context={subscriptions:[],globalState:{get:()=>undefined,update:async()=>{}},workspaceState:{get:(key,fallback)=>state.has(key)?state.get(key):fallback,update:async(key,value)=>state.set(key,value)}};
function request(taskId,_sessionId,list){return{origin:'character-essentials',taskId,sessionId:files.def,files:list,context:{type:'character',key:root,label:'Hero',root,files:list}};}

(async()=>{try{
  registerAuthoringWorkspace(vscode,context);
  // Retain exhaustive coverage for the recoverable legacy webview while the
  // default Integrated route is exercised separately as a native workspace.
  const open=(_uri,options)=>openCharacterCodingSet(options,{legacyIntegrated:true});
  const initial=[files.def,files.zss,files.cns,files.cmd,files.air,files.txt,files.md];
  assert.strictEqual(validateCharacterCodingDescriptor(request('duplicate','duplicate',[files.def,files.def])),null,'duplicate or aliased host files fail closed');
  assert.strictEqual(validateCharacterCodingDescriptor(request('missing','missing',[files.def,files.missing])),null,'missing host files fail closed');
  assert.strictEqual(validateCharacterCodingDescriptor(request('x'.repeat(129),'oversize',[files.def])),null,'oversized descriptor fields fail closed');
  assert.strictEqual(validateCharacterCodingDescriptor(request('owner-authority','owner-authority',initial)).context.ownerDef,files.def,'validated Character Essentials propagates the exact session DEF as pin-owner authority');
  const panel=await open(uri(files.def),request('character-essentials','hero-session',initial));
  assert(panel&&panel.type==='ikemenAuthoringWorkspace','the first-run Integrated choice opens one Coding Viewer');
	  assert.strictEqual(quickPicks,0,'Character Essentials no longer asks for a pane presentation');assert.strictEqual(presentation,undefined);assert.deepStrictEqual(updates,[]);
  assert.strictEqual(panels.length,1);assert(shown.includes(files.md),'unsupported Markdown falls back to the native editor');
	  const beforeRepeatedPrompts=quickPicks;assert.strictEqual(await open(uri(files.def),request('repeated','repeated',initial)),panel);assert.strictEqual(quickPicks,beforeRepeatedPrompts,'repeated grouped opens remain prompt-free');
	  assert.strictEqual(await openCharacterCodingSet(request('forced-integrated','forced-integrated',initial),{forceIntegrated:true,legacyIntegrated:true}),panel);
  assert(panel.webview.html.includes('data-view-mode="source"'),'new Character Essentials Coding Viewers open on the directly editable Source surface');
  assert.strictEqual(await open(uri(files.def),request('invalid','invalid',[files.def,files.missing])),undefined,'a forged host descriptor containing a missing file is rejected');
  assert(panel.webview.html.includes('Hero.def')&&panel.webview.html.includes('special.cns')&&panel.webview.html.includes('Hero.air'));
  const publicOpen=commands.get('ikemen.authoringWorkspace.open'),panelCount=panels.length;assert.strictEqual(await publicOpen(uri(files.zss),{origin:'character-essentials',files:[files.zss]}),panel);assert.strictEqual(panels.length,panelCount,'a public open reuses the exact active uniquely mapped character owner without accepting spoofed grouping data');
  panel.active=false;assert.strictEqual(await publicOpen(uri(files.cns)),panel);assert(panel.active&&panel.webview.html.includes('Statedef 200'),'an inactive sole mapped owner is revealed, reclaims exact context, and selects the requested file without duplication');assert.strictEqual(panels.length,panelCount);
  const normalReveal=panel.reveal;panel.active=false;panel.reveal=()=>{panel.active=false;};const reclaimCount=panels.length;assert.strictEqual(await publicOpen(uri(files.air)),null);assert.strictEqual(panels.length,reclaimCount,'failed inactive-owner reclaim fails closed without a duplicate panel');panel.reveal=normalReveal;panel.reveal();await new Promise(resolve=>setImmediate(resolve));
  await panel.receive({type:'select-navigation',id:path.resolve(files.zss).toLowerCase()});assert(panel.webview.html.includes('State 100'),'ZSS/CNS/ST sources project through Code Structure');
  await panel.receive({type:'select-navigation',id:path.resolve(files.cmd).toLowerCase()});assert(panel.webview.html.includes('name=&quot;x&quot;')||panel.webview.html.includes('x'),'CMD/INP/JNP/DAT sources project through Command Movelist');
  await panel.receive({type:'select-navigation',id:path.resolve(files.def).toLowerCase()});assert(panel.webview.html.includes('Open Character Dependencies'),'DEF uses an exact launch card rather than a second text implementation');
  await panel.receive({type:'select-navigation',id:path.resolve(files.air).toLowerCase()});
  assert(panel.webview.html.includes('Open AIR Animation Preview'),'AIR retains its exact visual-workspace launch card');
  assert(!panel.webview.html.includes('aria-label="Source editor" readonly'),'AIR is also directly editable in the integrated Source pane');
  await panel.receive({type:'select-navigation',id:path.resolve(files.def).toLowerCase()});
  await panel.receive({type:'set-navigation-mode',mode:'cards'});await panel.receive({type:'next-navigation'});
  assert(panel.webview.html.includes('data-mode="cards"')&&panel.webview.html.includes('2 of 6'),'cards and arrow navigation operate on the admitted nested set');
  const same=await Promise.all([open(uri(files.zss),request('character-all-code','hero-session',initial)),open(uri(files.cns),request('character-essentials','hero-session',initial))]);
  assert(same.every(value=>value===panel)&&panels.length===1,'repeated and concurrent grouped opens reuse one panel');
  const snapshot=contexts.currentContext();assert(snapshot.type==='character'&&snapshot.files.some(file=>path.resolve(file)===path.resolve(files.cns)),'the grouped panel contributes one exact character context');
  const altRequest={origin:'character-essentials',taskId:'alt-owner',sessionId:files.altdef,files:[files.altdef,files.zss],context:{type:'character',key:root,label:'Alt',root,files:[files.altdef,files.zss]}},altPanel=await open(uri(files.altdef),altRequest);
  assert(altPanel&&altPanel!==panel,'same-folder DEF variants retain distinct grouped panels and exact character contexts');
  panel.reveal();await new Promise(resolve=>setImmediate(resolve));let releaseOldPrompt,reportOldPrompt;const oldPromptBlocked=new Promise(resolve=>{releaseOldPrompt=resolve;}),oldPromptStarted=new Promise(resolve=>{reportOldPrompt=resolve;});
  quickPickLabels=['Create hand'];inputBoxValues=[()=>{reportOldPrompt();return oldPromptBlocked.then(()=> 'Stale hand');}];const staleOrganization=panel.receive({type:'organize-navigation'});await oldPromptStarted;
  altPanel.reveal();await new Promise(resolve=>setImmediate(resolve));quickPickLabels=['Create hand'];inputBoxValues=['Newer hand'];await altPanel.receive({type:'organize-navigation'});releaseOldPrompt();await staleOrganization;
  const organizedContexts=state.get('ikemaker.authoringCardHands.v1').contexts;
  assert(organizedContexts.some((entry)=>entry.hands.some((hand)=>hand.label==='Newer hand'))&&organizedContexts.some((entry)=>entry.hands.some((hand)=>hand.label==='Stale hand')),'same-folder DEF variants retain independent tab organizations instead of creating a false same-context CAS conflict');
  altPanel.dispose();panel.reveal();await new Promise(resolve=>setImmediate(resolve));
  const secondRequest={origin:'character-essentials',taskId:'character-essentials',sessionId:secondDef,files:[secondDef,files.zss],context:{type:'character',key:secondRoot,label:'Other',root:secondRoot,files:[secondDef,files.zss]}};
  const second=await open(uri(secondDef),secondRequest);assert(second&&second!==panel&&panels.filter((item)=>!item.disposed).length===2,'characters sharing a common file retain distinct keyed panels');
  panel.active=false;second.active=false;const ambiguousCount=panels.length;assert.strictEqual(await publicOpen(uri(files.zss)),null);assert.strictEqual(panels.length,ambiguousCount,'a shared file with no exact active character owner fails closed instead of creating or cross-merging a panel');
  second.active=false;panel.active=false;const beforeBackground=panel.webview.html;await panel.receive({type:'select-navigation',id:path.resolve(files.air).toLowerCase()});assert.strictEqual(panel.webview.html,beforeBackground,'background navigation cannot claim or change grouped selection');
  panel.reveal();await new Promise(resolve=>setImmediate(resolve));await panel.receive({type:'select-navigation',id:path.resolve(files.air).toLowerCase()});assert(panel.webview.html.includes('Open AIR Animation Preview'),'explicit activation reclaims exact source authority');
  const cnsDocument=documents.get(uri(files.cns).toString()),beforeRace=panel.webview.html,beforeRaceWarnings=warnings.length;cnsDocument.isClosed=true;openBoundary=async()=>{panel.active=false;contexts.setContextSelection(contexts.currentContext(),{surfaceId:'foreign',uri:'foreign:'});};await panel.receive({type:'select-navigation',id:path.resolve(files.cns).toLowerCase()});openBoundary=null;assert.strictEqual(panel.webview.html,beforeRace,'context takeover while reopening a closed destination cannot commit late navigation');assert.strictEqual(warnings.length,beforeRaceWarnings,'stale closed-document authority aborts silently instead of claiming unavailability');cnsDocument.isClosed=false;panel.reveal();await new Promise(resolve=>setImmediate(resolve));await panel.receive({type:'select-navigation',id:path.resolve(files.cns).toLowerCase()});assert(panel.webview.html.includes('Statedef 200'),'activation reclaim permits a fresh exact retry');
  await panel.receive({type:'select-navigation',id:path.resolve(files.zss).toLowerCase()});const ordinaryCns=cnsDocument.text,beforeNativeRace=panel.webview.html,beforeNativeWarnings=warnings.length,beforeNativeShown=shown.length;cnsDocument.text='x'.repeat(4*1024*1024+1);showBoundary=async doc=>{panel.active=false;contexts.setContextSelection(contexts.currentContext(),{surfaceId:'foreign',uri:'foreign:'});return{document:doc,revealRange(){revealedRanges++;}};};await panel.receive({type:'select-navigation',id:path.resolve(files.cns).toLowerCase()});showBoundary=null;assert.strictEqual(panel.webview.html,beforeNativeRace,'context takeover while the native editor is opening cannot commit connected/current/navigation state');assert.strictEqual(warnings.length,beforeNativeWarnings,'stale native-show authority aborts silently');assert.strictEqual(shown.length,beforeNativeShown+1,'the guarded native attempt reaches only the exact requested document');panel.reveal();await new Promise(resolve=>setImmediate(resolve));
  cnsDocument.isClosed=true;deactivateOnShow=true;const beforeExpectedNative=shown.length;await panel.receive({type:'select-navigation',id:path.resolve(files.cns).toLowerCase()});deactivateOnShow=false;assert.strictEqual(shown.length,beforeExpectedNative+1,'an exact native reveal is accepted even when VS Code normally deactivates the webview');assert(!panel.webview.html.includes('special.cns · Closed'),'the successful exact native reveal commits the reopened reference and clears Closed');cnsDocument.text=ordinaryCns;panel.reveal();await new Promise(resolve=>setImmediate(resolve));
  const beforeSource=shown.length,sourceRace=panel.receive({type:'open-full-text'});await Promise.resolve();panel.active=false;contexts.setContextSelection(contexts.currentContext(),{surfaceId:'foreign',uri:'foreign:'});await sourceRace;assert.strictEqual(shown.length,beforeSource,'final-await selection takeover prevents a late native source open');panel.reveal();await new Promise(resolve=>setImmediate(resolve));await panel.receive({type:'open-full-text'});assert.strictEqual(shown.length,beforeSource+1,'reclaimed exact source authority permits retry');
  const revealBefore=revealedRanges;showBoundary=async()=>({document:documents.get(uri(files.def).toString()),revealRange(){revealedRanges++;}});await panel.receive({type:'open-full-text',line:0});showBoundary=null;assert.strictEqual(revealedRanges,revealBefore,'a wrong editor returned by showTextDocument receives no late line selection or success navigation');
  panel.reveal();await new Promise(resolve=>setImmediate(resolve));showBoundary=async doc=>{panel.active=false;contexts.setContextSelection(contexts.currentContext(),{surfaceId:'foreign',uri:'foreign:'});return{document:doc,revealRange(){revealedRanges++;}};};await panel.receive({type:'open-full-text',line:0});showBoundary=null;assert.strictEqual(revealedRanges,revealBefore,'takeover inside showTextDocument prevents late selection/reveal');panel.reveal();await new Promise(resolve=>setImmediate(resolve));await panel.receive({type:'open-full-text',line:0});assert.strictEqual(revealedRanges,revealBefore+1,'fresh exact source retry succeeds');
  await panel.receive({type:'select-navigation',id:path.resolve(files.zss).toLowerCase()});await liveEdit(panel,'[State 100]\nlet dirty=1\n');
  documents.get(uri(files.lua).toString()).isDirty=true;const merged=await open(uri(files.lua),request('character-essentials','hero-session',[...initial,files.lua]));
  assert.strictEqual(merged,panel);assert(panel.webview.html.includes('helper.lua · Unsaved'),'newly merged files receive current status before the first render');assert(documents.get(uri(files.zss).toString()).isDirty,'safe additions preserve the live native dirty document');documents.get(uri(files.lua).toString()).isDirty=false;
	  const beforeReduced=shown.length,beforeReducedPanels=panels.length,beforeReducedPrompts=quickPicks;await open(uri(files.def),request('character-essentials','reduced-session',[files.def,files.zss]));
	  assert.strictEqual(shown.length,beforeReduced,'the attached grouped surface does not duplicate admitted sources in extra native groups');
	  assert.strictEqual(panels.length,beforeReducedPanels,'a reduced descriptor reuses the one attached grouped surface');
	  await open(uri(files.zss),request('character-all-code','reduced-session',[files.def,files.zss]));
	  assert.strictEqual(quickPicks,beforeReducedPrompts,'all repeated presentation routes remain prompt-free');
	  await open(uri(files.def),request('character-essentials','next-open',[files.def]));
  assert(panel.title.includes('Hero.def')&&!panel.webview.html.includes(`data-id="${path.resolve(files.lua).toLowerCase()}"`),'a reduced grouped descriptor authoritatively removes stale tabs and deterministically selects the first surviving file');
  assert(documents.get(uri(files.zss).toString()).isDirty,'removing the active grouped tab preserves its native dirty source without saving or deleting it');
  await open(uri(files.def),request('character-essentials','hero-session',initial));assert(panel.webview.html.includes('special.cns'),'reopening the full descriptor rebuilds the connected set without creating a second grouped window');
  assert.strictEqual(panels.filter(item=>item.type==='ikemenAuthoringBrowser').length,0,'grouped opens never auto-open Authoring Browser');
  const beforeSpoof=panels.length;await publicOpen(uri(files.def),request('spoof','spoof',[files.def,files.zss]));assert.strictEqual(panels.length,beforeSpoof,'the public single-file command ignores grouped descriptors and reuses the active exact owner');
  second.dispose();panel.reveal();await new Promise(resolve=>setImmediate(resolve));assert.strictEqual(await publicOpen(uri(files.zss)),panel,'disposing one shared owner removes only its mapping');const reopened=await open(uri(secondDef),secondRequest);assert(reopened&&reopened!==second,'the disposed character can reopen independently');const disposeReveal=revealedRanges;showBoundary=async doc=>{reopened.dispose();return{document:doc,revealRange(){revealedRanges++;}};};await reopened.receive({type:'open-full-text',line:0});showBoundary=null;assert.strictEqual(revealedRanges,disposeReveal,'disposal inside showTextDocument prevents late navigation and success');
	  const ordinary=await publicOpen(uri(secondDef));assert(ordinary&&ordinary!==reopened,'disposed owner mappings are removed so the ordinary single-file fallback may open cleanly');ordinary.dispose?.();
  panel.dispose();const concurrent=await Promise.all([open(uri(files.def),request('character-essentials','concurrent-a',initial)),open(uri(secondDef),secondRequest)]);assert(concurrent[0]&&concurrent[1]&&concurrent[0]!==concurrent[1],'truly concurrent character opens sharing a file remain isolated by exact session identity');
  console.log('Character Essentials opens one preference-aware grouped Coding Viewer with exact assets, fallback, context, reuse and dirty-draft safety');
}finally{for(const panel of panels)try{panel.dispose();}catch(_){}fs.rmSync(root,{recursive:true,force:true});fs.rmSync(secondRoot,{recursive:true,force:true});}})().catch(error=>{console.error(error);process.exitCode=1;});
