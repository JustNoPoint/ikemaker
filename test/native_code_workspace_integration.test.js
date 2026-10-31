'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL, fileURLToPath } = require('url');
const textToolbar = require('../src/text_editor_toolbar');
const { fittedHeaderRatio, attachedTextLayout } = require('../src/text_editor_layout');
const { registerAuthoringWorkspace, openCharacterCodingSet, attachedLayoutShape } = require('../src/authoring_workspace');
const { notifyProjectRegistryChanged } = require('../src/project_registry_events');
const { notifyEngineCapabilitiesChanged } = require('../src/engine_capability_events');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-native-code-workspace-'));
const defFile = path.join(root, 'Hero.def'), stateFile = path.join(root, 'normal.zss');
fs.writeFileSync(defFile, '[Info]\nname = "Hero"\n[Files]\nst = normal.zss\n');
fs.writeFileSync(stateFile, '[StateDef 200; type: S; moveType: A; physics: S]\n');

function uri(filename) { const fsPath=path.resolve(filename);return{fsPath,scheme:'file',toString(){return pathToFileURL(fsPath).toString();}}; }
function document(filename, languageId) { return { fileName:path.resolve(filename),uri:uri(filename),languageId,version:1,isClosed:false,isDirty:false,getText(){return fs.readFileSync(this.fileName,'utf8');},async save(){this.isDirty=false;return true;} }; }
const defDocument=document(defFile,'ikemen-def'),stateDocument=document(stateFile,'zss'),documents=new Map([[String(defDocument.uri),defDocument],[String(stateDocument.uri),stateDocument]]);
function disposable(){return{dispose(){}};}
function makePanel(type,title,column){const messages=[],disposals=[],views=[],resolvedColumn=column===-2?2:column===-1?1:column;return{type,title,viewColumn:resolvedColumn,active:true,disposed:false,webview:{cspSource:'test:',html:'',onDidReceiveMessage(listener){messages.push(listener);return disposable();},async postMessage(){return true;}},onDidDispose(listener){disposals.push(listener);return disposable();},onDidChangeViewState(listener){views.push(listener);return disposable();},reveal(next){if(Number.isInteger(next)&&next>0)this.viewColumn=next;this.active=true;},dispose(){if(this.disposed)return;this.disposed=true;for(const listener of disposals.splice(0))listener();},async receive(message){for(const listener of messages)await listener(message);}};}

const commands=new Map(),commandCalls=[],panels=[],shown=[],activeListeners=[],changeListeners=[],saveListeners=[],closeListeners=[],diagnosticListeners=[],diagnostics=new Map();
const values=new Map(),workspaceValues=new Map();
let controllerRefreshes=0,capabilityRefreshes=0,presentation,quickPicks=0,nightlyStringsEnabled=false,headerOnlyLayout=false,editorLayout;
const vscode={
  Uri:{file:uri,parse:value=>uri(fileURLToPath(value))},ViewColumn:{Active:-1,Beside:-2},ConfigurationTarget:{Global:1},DiagnosticSeverity:{Error:0,Warning:1},
  workspace:{
    textDocuments:[defDocument,stateDocument],workspaceFolders:[{uri:uri(root)}],
    getConfiguration(){return{get(key,fallback){if(key==='textToolbar.companion.followActiveEditor')return true;if(key==='textToolbar.headerOnlyLayout')return headerOnlyLayout;if(key==='additionalCodeExtensions')return[];return fallback;},inspect(key){return key==='authoring.presentation'?{globalValue:presentation}:{};},async update(key,value){if(key==='authoring.presentation')presentation=value;}};},
    async openTextDocument(target){const found=documents.get(String(target));if(!found)throw new Error(`Unknown document ${String(target)}`);return found;},
    onDidChangeTextDocument(listener){changeListeners.push(listener);return disposable();},onDidSaveTextDocument(listener){saveListeners.push(listener);return disposable();},onDidCloseTextDocument(listener){closeListeners.push(listener);return disposable();},onDidChangeConfiguration(){return disposable();}
  },
  window:{
    activeTextEditor:{document:defDocument,viewColumn:1},
    onDidChangeActiveTextEditor(listener){activeListeners.push(listener);return disposable();},
    createWebviewPanel(type,title,column){const activePanel=panels.find(panel=>panel.active&&!panel.disposed),resolved=column===-2?(activePanel?.viewColumn||this.activeTextEditor?.viewColumn||1)+1:column;const created=makePanel(type,title,resolved);for(const panel of panels)panel.active=false;panels.push(created);return created;},
    registerWebviewPanelSerializer(){return disposable();},
    async showTextDocument(doc,options={}){const editor={document:doc,viewColumn:Number.isInteger(options.viewColumn)?options.viewColumn:1,revealRange(){}};this.activeTextEditor=editor;shown.push({doc,options});for(const listener of activeListeners)await listener(editor);return editor;},
    async showQuickPick(items){quickPicks+=1;return items[0];},showInformationMessage(){},showWarningMessage(){}
  },
  commands:{registerCommand(id,callback){commands.set(id,callback);return disposable();},async executeCommand(id,...args){commandCalls.push({id,args});if(id==='vscode.getEditorLayout')return editorLayout;if(id==='vscode.setEditorLayout'){editorLayout=args[0];return;}const callback=commands.get(id);return callback?callback(...args):undefined;}},
  languages:{getDiagnostics(target){return diagnostics.get(String(target))||[];},onDidChangeDiagnostics(listener){diagnosticListeners.push(listener);return disposable();}},env:{clipboard:{async writeText(){}}}
};
const context={subscriptions:[],globalState:{get(key,fallback){return values.has(key)?values.get(key):fallback;},async update(key,value){values.set(key,value);}},workspaceState:{get(key,fallback){return workspaceValues.has(key)?workspaceValues.get(key):fallback;},async update(key,value){workspaceValues.set(key,value);}}};

(async()=>{try{
  assert.strictEqual(attachedLayoutShape({orientation:1,groups:[{size:.28},{size:.72}]}),true,'28/72 stacked rows are a valid seeded text composite');
  assert.strictEqual(attachedLayoutShape({orientation:1,groups:[{size:.17},{size:.83}]}),true,'a compact measured header retains the protected stacked topology');
  assert.strictEqual(attachedLayoutShape({orientation:1,groups:[{size:.72},{size:.28}]}),false,'a structurally valid but size-inverted layout must be repaired');
  assert.strictEqual(attachedLayoutShape({orientation:0,groups:[{size:.28},{size:.72}]}),false,'the live left/right regression cannot masquerade as the attached text header');
  assert.strictEqual(attachedLayoutShape({orientation:1,groups:[{size:.2,groups:[{}]},{size:.8}]}),false,'nested groups cannot masquerade as the protected two-row text topology');
  const tallFit=fittedHeaderRatio({orientation:1,groups:[{size:.28},{size:.72}]},{contentHeight:180,viewportHeight:300});
  assert(tallFit<.2,'a tall empty header compacts near its measured content instead of keeping 28%');
  const shortFit=fittedHeaderRatio({orientation:1,groups:[{size:.17},{size:.83}]},{contentHeight:190,viewportHeight:120});
  assert(shortFit>.28&&shortFit<=.34,'a short viewport expands enough to prevent clipped tabs while retaining a bounded native editor');
  assert.deepStrictEqual(attachedTextLayout(tallFit),{orientation:1,groups:[{size:tallFit},{size:1-tallFit}]},'the fitted layout preserves group 1 as header and group 2 as the native editor');
  const toolbarApi=textToolbar.register(vscode,context);await toolbarApi.ready;
  registerAuthoringWorkspace(vscode,context,{controllers:async()=>{controllerRefreshes+=1;return{items:[]};},capabilities:async()=>{capabilityRefreshes+=1;return{nightlyStringsEnabled,target:{buildId:nightlyStringsEnabled?'verified-nightly':'ikemen-go-1.0'}};}});
  const descriptor={origin:'character-essentials',taskId:'native-code-workspace',sessionId:defFile,files:[defFile,stateFile],context:{type:'character',key:root,label:'Hero',root,files:[defFile,stateFile]}};
  const result=await openCharacterCodingSet(descriptor);
  let live=panels.filter(panel=>!panel.disposed),navigation=live.find(panel=>panel.type==='ikemenTextCompanion'),assistance=live.find(panel=>panel.type==='ikemenAuthoringBrowser');
  assert(navigation,'Integrated Character Essentials opens the Code Navigation Browser');
  assert.strictEqual(assistance,undefined,'Coding Assistance does not auto-open as another startup pane');
  assert.strictEqual(navigation.viewColumn,1,'Code Navigation occupies the attached upper header row');
  assert.strictEqual(live.filter(panel=>panel.type==='ikemenAuthoringWorkspace').length,0,'the default Integrated route no longer opens the inferior webview text editor');
  assert.strictEqual(result,navigation,'the completed workspace resolves to its attached header');
  assert.strictEqual(result.assetViewColumn,2,'asset viewers are routed into the lower editor row');
  const layoutCall=commandCalls.find(call=>call.id==='vscode.setEditorLayout');assert.deepStrictEqual(layoutCall?.args?.[0],{orientation:1,groups:[{size:0.28},{size:0.72}]},'the text header has room for its text-specific navigator while the native editor remains the larger stacked group');
  headerOnlyLayout=true;
  const fitCallsBefore=commandCalls.filter(call=>call.id==='vscode.setEditorLayout').length;
  await navigation.receive({type:'fit-header-height',contentHeight:180,viewportHeight:300});
  assert(editorLayout.groups[0].size<.2&&editorLayout.groups[1].size>.8,'the live companion compacts its upper row to measured content while preserving the native editor below');
  const fittedLayout=editorLayout;
  await navigation.receive({type:'fit-header-height',contentHeight:300,viewportHeight:180});
  assert.strictEqual(commandCalls.filter(call=>call.id==='vscode.setEditorLayout').length,fitCallsBefore+1,'only the first stable measurement may fit the header, so later rendering cannot fight user resizing');
  assert.strictEqual(editorLayout,fittedLayout,'a later measurement leaves the fitted or manually resized layout untouched');
  assert.strictEqual(quickPicks,0,'character startup no longer asks for a multi-pane presentation');
  assert.strictEqual(presentation,undefined,'the retired presentation setting is not written');
  assert(shown.some(entry=>entry.doc===defDocument)&&shown.some(entry=>entry.doc===stateDocument),'both exact admitted files open as native VS Code documents');
  assert(shown.every(entry=>entry.options.viewColumn===2),'all native text tabs remain in the lower editor row');
  assert.strictEqual(shown.at(-1).doc,defDocument,'the authoritative first source is restored after admitting the native tab set');
  assert(navigation.webview.html.includes('viewer-icon-toolbar'),'the invariant compact shared toolbar belongs to navigation');
  assert(!navigation.webview.html.includes('data-mode="cards"')&&!navigation.webview.html.includes('data-mode="list"')&&navigation.webview.html.includes('role="tab"'),'Code Navigation uses one compact synchronized tab strip');
  assert(/<body><div class="launch-controls">[\s\S]*?<span class="viewer-dropdown-toolbar"[\s\S]*?<div class="viewer-icon-toolbar"/.test(navigation.webview.html),'the shared entity/header controls and dropdown toolbar remain above the invariant icon row');
  assert(!navigation.webview.html.includes('<textarea')&&!navigation.webview.html.includes('Apply to Native Document')&&!navigation.webview.html.includes('Discard draft'),'no parallel text editor or draft controls remain in navigation');
  assistance=await commands.get('ikemen.authoringBrowser.open')();live=panels.filter(panel=>!panel.disposed);
  assert(assistance&&assistance.type==='ikemenAuthoringBrowser','Coding Assistance opens only through its explicit browser action');
  assert.strictEqual(assistance.viewColumn,2,'the explicit Coding Assistance browser opens as a lower-row tab, not another layout pane');
  assert(assistance.webview.html.includes('Code Navigator')&&assistance.webview.html.includes('Project Data Map')&&assistance.webview.html.includes('Recipe Discovery')&&assistance.webview.html.includes('Similar Code')&&assistance.webview.html.includes('Controllers')&&assistance.webview.html.includes('Problems'),'the second browser owns the coding-assistance screens');
  assert.strictEqual((assistance.webview.html.match(/data-universal-slot=/g)||[]).length,0,'Coding Assistance does not duplicate the shared toolbar owned by Code Navigation');
  assert.strictEqual(capabilityRefreshes,1,'the three code-derived assistance providers share one bounded parse and capability projection');
  const initialRefreshes=controllerRefreshes;diagnostics.set(String(stateDocument.uri),[{severity:1,message:'Unknown command reference',source:'IKEMaker',range:{start:{line:0}}}]);
  for(const listener of diagnosticListeners){listener({uris:[stateDocument.uri]});listener({uris:[stateDocument.uri]});listener({uris:[stateDocument.uri]});}
  await new Promise(resolve=>setTimeout(resolve,240));
  assert.strictEqual(controllerRefreshes,initialRefreshes,'rapid native diagnostic events refresh Problems without rebuilding unrelated controller catalogs');
  assert.strictEqual(capabilityRefreshes,1,'diagnostic-only refreshes do not rebuild code-derived provider models');
  assert(assistance.webview.html.includes('Warning: Unknown command reference')&&assistance.webview.html.includes('normal.zss:1'),'Problems exposes exact native diagnostics and source lines');
  for(const listener of changeListeners){listener({document:stateDocument});listener({document:stateDocument});listener({document:stateDocument});}
  await new Promise(resolve=>setTimeout(resolve,240));
  assert.strictEqual(capabilityRefreshes,1,'native typing never rebuilds the full-project assistance projection');
  assert.strictEqual(controllerRefreshes,initialRefreshes,'code edits do not rebuild the static controller catalog');
  for(const listener of saveListeners)listener(stateDocument);
  await new Promise(resolve=>setTimeout(resolve,140));
  assert.strictEqual(capabilityRefreshes,2,'saving a connected code file refreshes one shared code-derived assistance projection');
  assert.strictEqual(controllerRefreshes,initialRefreshes,'save refreshes do not rebuild the static controller catalog');
  assert(!assistance.webview.html.includes('Typed String Map'),'stable 1.0 hides Nightly-only string recipes in the live Coding Assistance browser');
  assert(assistance.webview.html.includes('ikemen-go-1.0')&&assistance.webview.html.includes('Nightly string tools hidden'),'Coding Assistance visibly explains the active 1.0 capability gate');
  nightlyStringsEnabled=true;
  assert.strictEqual(notifyProjectRegistryChanged(path.join(root,'.ikemen','project-registry.json'),'adopt-exact-nightly'),true);
  await new Promise(resolve=>setTimeout(resolve,140));
  assert.strictEqual(capabilityRefreshes,3,'an adopted engine-profile change immediately refreshes the capability-derived browser projection');
  assert.strictEqual(controllerRefreshes,initialRefreshes,'engine-profile changes do not rebuild the static controller catalog');
  assert(assistance.webview.html.includes('Typed String Map'),'an explicitly verified supporting Nightly exposes its string recipe');
  assert(assistance.webview.html.includes('verified-nightly')&&assistance.webview.html.includes('Nightly string tools enabled'),'the live capability status changes with the exact supporting Nightly');
  nightlyStringsEnabled=false;
  for(const listener of saveListeners)listener({fileName:path.join(root,'.ikemen','project-registry.json')});
  await new Promise(resolve=>setTimeout(resolve,140));
  assert.strictEqual(capabilityRefreshes,4,'a manually saved project registry also refreshes capability-derived browser content');
  assert(!assistance.webview.html.includes('Typed String Map'),'returning to 1.0 removes the Nightly string recipe without reopening the browser');
  nightlyStringsEnabled=true;notifyEngineCapabilitiesChanged('engine-knowledge-promoted');
  await new Promise(resolve=>setTimeout(resolve,140));
  assert.strictEqual(capabilityRefreshes,5,'promoted engine knowledge invalidates the live capability projection');
  assert(assistance.webview.html.includes('Typed String Map'),'newly verified exact-build capability evidence reaches the open browser');
  nightlyStringsEnabled=false;notifyEngineCapabilitiesChanged('engine-evidence-revoked');
  await new Promise(resolve=>setTimeout(resolve,140));
  assert.strictEqual(capabilityRefreshes,6,'revoked or conflicting engine evidence also invalidates the live capability projection');
  assert(!assistance.webview.html.includes('Typed String Map'),'revoked capability evidence removes stale Nightly string authoring immediately');
  const assistanceGeneration=Number((assistance.webview.html.match(/const generation=(\d+)/)||[])[1]);
  await assistance.receive({type:'open-engine-targets',generation:assistanceGeneration});
  const engineTargetCall=commandCalls.filter(call=>call.id==='ikemen.engineRegistry.open').at(-1);
  assert(engineTargetCall&&engineTargetCall.args[0].fsPath===defFile,'the compact status opens reviewed Engine Targets for the exact connected character source');
  assert.strictEqual(toolbarApi.bound().document,defDocument,'toolbar actions remain bound to the exact active native document');
  assert(navigation.webview.html.includes('data-toolbar-action-id="command.ikemen.mutations.openHistory"'),'the shared recovery action is available in the attached code header');
  await navigation.receive({type:'ikemaker.universal-toolbar.invoke',slotId:'recovery'});
  const recoveryCall=commandCalls.filter(call=>call.id==='ikemen.mutations.openHistory').at(-1);
  assert(recoveryCall&&recoveryCall.args[0]===defDocument.uri,'Recovery receives the exact native document bound to the navigation browser');
  navigation.dispose();assistance.dispose();const panelCount=panels.length,shownCount=shown.length;
  const nativeResult=await openCharacterCodingSet({...descriptor,taskId:'native-only-preference'});
  assert(nativeResult&&nativeResult.type==='ikemenTextCompanion','every character coding open rebuilds the one attached header rather than consulting a pane setting');
  assert.strictEqual(panels.length,panelCount+1,'reopening creates only the one attached header panel');
  assert.strictEqual(shown.length,shownCount+3,'reopening places the two exact native documents below and restores the authoritative first tab');
  const beforePublic=panels.length,publicResult=await commands.get('ikemen.authoringWorkspace.open')(stateDocument.uri),publicPanels=panels.slice(beforePublic).filter(panel=>!panel.disposed);
  assert(publicResult&&publicResult.type==='ikemenTextCompanion','the explicit Open Coding Viewer command resolves to the attached header/native-editor composite');
  assert.deepStrictEqual(publicPanels.map(panel=>panel.type),[],'the public command reuses the current attached header instead of opening more panes');
  assert.strictEqual(publicPanels.some(panel=>panel.type==='ikemenAuthoringWorkspace'),false,'the public command cannot reopen the retired webview editor');
  console.log('Native coding workspace keeps one attached header above exact editor and viewer tabs, with assistance explicit');
}finally{for(const panel of panels)panel.dispose();fs.rmSync(root,{recursive:true,force:true});}})().catch(error=>{console.error(error);process.exitCode=1;});
