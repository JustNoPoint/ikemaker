'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { registerAuthoringWorkspace, openAuthoringBrowser, openCodingViewer, serializedAssistanceState, parseAssistanceState, boundedPersonalDiscoveryPin } = require('../src/authoring_workspace');
const authoringContexts = require('../src/authoring_context_registry');
const personalExamples=require('../src/personal_examples');
const resumeContextApi=require('../src/resume_context');
const { MESSAGE_TYPE } = require('../src/universal_toolbar_webview');

const commands = new Map(), serializers = new Map(), panels = [], shown = [], notices = [], warnings = [], executed = [], recoveryCopies = [];
const globalValues = new Map(), workspaceValues = new Map();
const recoveryRecords=()=>workspaceValues.get('ikemaker.authoringDraftRecovery.v1')?.records||{};
let documentChange,documentSave,documentClose,diagnosticsChange;
let presentation = 'integrated';
let quickPickMode = 'first';
let quickPickAction = 'open', clipboardText = '', applyEdits = 0;
let quickPickLabels = [], inputBoxValues = [], failCardHandsPersistence = false;
let blockedDraftUpdate = null, notifyDraftUpdate = null;
let blockTargetOpenAfter=0,blockedTargetOpen=null,notifyTargetOpen=null,showBoundary=null;
const fixtureRoot=fs.mkdtempSync(path.join(os.tmpdir(),'ikemaker-authoring-workspace-'));fs.mkdirSync(path.join(fixtureRoot,'ken'),{recursive:true});
const filename = path.join(fixtureRoot, 'normal.zss'), secondFilename = path.join(fixtureRoot, 'special.zss'), airFilename = path.join(fixtureRoot, 'anim.air'), ownerFilename=path.join(fixtureRoot,'Ryu.def'), otherOwnerFilename=path.join(fixtureRoot,'Wrong.def'), kenFilename=path.join(fixtureRoot,'ken','ken.zss');
fs.writeFileSync(filename,'[State 200]\nlet x = 1\n');fs.writeFileSync(secondFilename,'[State 210]\nlet y = 3\n');fs.writeFileSync(airFilename,'[Begin Action 0]\n0,0, 0,0, 1\n');fs.writeFileSync(ownerFilename,'[Files]\n');fs.writeFileSync(otherOwnerFilename,'[Files]\n');fs.writeFileSync(kenFilename,'[State 900]\nlet kenOnly = 1\n');
function uri(fsPath) { return { fsPath, scheme: 'file', toString() { return `file:///${fsPath.replace(/\\/g, '/')}`; } }; }
let saves = 0;
function makeDocument(fileName, text) { return { uri:uri(fileName), fileName, languageId:'zss', isClosed:false, isDirty:false, version:1, text, getText(){return this.text;}, positionAt(offset){return{line:0,character:offset,offset};}, async save(){saves+=1;this.isDirty=false;return true;} }; }
const document = makeDocument(filename, '[State 200]\nlet x = 1\n');let secondDocument = makeDocument(secondFilename, '[State 210]\nlet y = 3\n');
const kenDocument=makeDocument(kenFilename,'[State 900]\nlet kenOnly = 1\n');
const airDocument = makeDocument(airFilename, '[Begin Action 0]\n0,0, 0,0, 1\n'); airDocument.languageId = 'ikemen-air';
const documents = new Map([[String(document.uri), document], [String(secondDocument.uri), secondDocument], [String(airDocument.uri), airDocument], [String(kenDocument.uri),kenDocument]]);
const diagnostics=new Map();

class WorkspaceEdit { replace(target, range, value) { this.target = target; this.range = range; this.value = value; } }
class Range { constructor(start, end) { this.start = start; this.end = end; } }
class Position { constructor(line, character) { this.line = line; this.character = character; } }
class Selection { constructor(start, end) { this.start = start; this.end = end; this.active = end; } }
function disposable() { return { dispose() {} }; }
function panel(type) {
  const receive = [], dispose = [], view = [];
  const value = {
    type, title: '', active: true, viewColumn: 2, reveal() {},
    webview: { cspSource: 'vscode-webview:', html: '', onDidReceiveMessage(fn) { receive.push(fn); return disposable(); }, async postMessage() { return true; } },
    onDidDispose(fn) { dispose.push(fn); return disposable(); }, onDidChangeViewState(fn) { view.push(fn); return disposable(); },
    async receive(message) { for (const fn of receive) await fn(message); },
    disposed: false,
    dispose() { this.disposed = true; for (const fn of dispose.splice(0)) fn(); }
  };
  return value;
}
async function liveEdit(target, text) {
  const revision = Number(/let editRevision=(\d+)/.exec(target.webview.html)?.[1] || 0) + 1;
  const generation = Number(/editGeneration=(\d+)/.exec(target.webview.html)?.[1] || 0);
  return target.receive({ type:'edit-source', text, revision, generation });
}

const vscode = {
  Uri: { file: uri, parse(value) { return uri(value.replace(/^file:\/\/\//, '').replace(/\//g, path.sep)); } },
  ViewColumn: { Active: -1, Beside: -2 }, WorkspaceEdit, Range, Position, Selection,
  workspace: {
    textDocuments: [document, secondDocument, airDocument, kenDocument],
    getConfiguration() { return { get(_key, fallback) { return fallback; }, inspect(key) { return key === 'authoring.presentation' ? { globalValue: presentation } : {}; }, async update(key, value) { if (key === 'authoring.presentation') presentation = value; } }; },
    async openTextDocument(target) { if(target&&typeof target==='object'&&typeof target.content==='string'){const recovered=makeDocument(path.resolve('untitled',`recovery-${recoveryCopies.length}.txt`),target.content);recovered.languageId=target.language||'plaintext';recoveryCopies.push(recovered);return recovered;} let found = documents.get(String(target)); assert(found, `unknown document ${String(target)}`);if(found===secondDocument&&blockTargetOpenAfter>0&&--blockTargetOpenAfter===0&&blockedTargetOpen){notifyTargetOpen?.();notifyTargetOpen=null;const wait=blockedTargetOpen;blockedTargetOpen=null;await wait;}if(found.isClosed){const replacement=makeDocument(found.fileName,found.text);replacement.version=found.version;replacement.isDirty=found.isDirty;documents.set(String(replacement.uri),replacement);const at=vscode.workspace.textDocuments.indexOf(found);if(at>=0)vscode.workspace.textDocuments[at]=replacement;if(found===secondDocument)secondDocument=replacement;found=replacement;} return found; },
    async applyEdit(edit) { applyEdits += 1; const target = documents.get(String(edit.target)); assert(target); target.text = edit.value; target.version += 1; target.isDirty = true; return true; },
    onDidChangeTextDocument(listener) { documentChange = listener; return disposable(); },onDidSaveTextDocument(listener){documentSave=listener;return disposable();},onDidCloseTextDocument(listener){documentClose=listener;return disposable();}
  },
  window: {
    activeTextEditor: { document },
    createWebviewPanel(type) { const value = panel(type); panels.push(value); return value; },
    registerWebviewPanelSerializer(type, serializer) { serializers.set(type, serializer); return disposable(); },
    async showTextDocument(doc) { shown.push(doc);if(showBoundary)await showBoundary(doc);return { document: doc, revealRange() {}, selection: null }; },
    async showQuickPick(items) { if(quickPickLabels.length){const wanted=quickPickLabels.shift();if(wanted===null)return undefined;return items.find(item=>item.label===wanted);} if(quickPickMode==='cancel')return undefined; return items.some(item=>item.value)?(items.find(item=>item.value===quickPickAction)||items[0]):items[0]; },
    async showInputBox() { if(!inputBoxValues.length)return undefined;const value=inputBoxValues.shift();return typeof value==='function'?value():value; },
    async showWarningMessage(message, _options, action) { warnings.push(message); return action; },
    showInformationMessage(message) { notices.push(message); }
  },
  commands: {
    registerCommand(id, callback) { commands.set(id, callback); return disposable(); },
    async executeCommand(id, ...args) { const callback = commands.get(id); if (callback) return callback(...args); executed.push({ id, args }); }
  },
  env:{clipboard:{async writeText(value){clipboardText=value;}}},languages:{getDiagnostics(target){return diagnostics.get(String(target))||[];},onDidChangeDiagnostics(listener){diagnosticsChange=listener;return disposable();}}
};
const context = {
  subscriptions: [],
  globalState: { get(key, fallback) { return globalValues.has(key) ? globalValues.get(key) : fallback; }, async update(key, value) { if (value === undefined) globalValues.delete(key); else globalValues.set(key, value); } },
  workspaceState: { get(key, fallback) { return workspaceValues.has(key) ? workspaceValues.get(key) : fallback; }, async update(key, value) { if(key==='ikemaker.authoringCardHands.v1'&&failCardHandsPersistence){failCardHandsPersistence=false;throw new Error('card storage unavailable');} if (key === 'ikemaker.authoringDraftRecovery.v1' && blockedDraftUpdate) { const wait = blockedDraftUpdate; blockedDraftUpdate = null; notifyDraftUpdate?.(); notifyDraftUpdate = null; await wait; } workspaceValues.set(key, value); } }
};
Object.preventExtensions(context);

(async () => {
  workspaceValues.set('ikemaker.authoringDraftRecovery.v1',{schema:'ikemaker.authoring-recovery',version:1,records:{
    [String(document.uri)]:{uri:String(document.uri),filename:document.fileName,language:'zss',text:'[State 200]\nlet silently_adopted = 1\n',fingerprint:'same-baseline-fixture',version:document.version,appliedUnsaved:false,reason:'fixture',conflict:false,revision:1},
    mismatchFilename:{uri:String(secondDocument.uri),filename:document.fileName,language:'zss',text:'mismatch',fingerprint:'mismatch',version:1,appliedUnsaved:false,reason:'fixture',conflict:true,revision:2},
    mismatchUri:{uri:String(document.uri),filename:secondDocument.fileName,language:'zss',text:'mismatch',fingerprint:'mismatch',version:1,appliedUnsaved:false,reason:'fixture',conflict:true,revision:3},
    missingIdentity:{uri:'',filename:secondDocument.fileName,language:'zss',text:'mismatch',fingerprint:'mismatch',version:1,appliedUnsaved:false,reason:'fixture',conflict:true,revision:4},
    [String(airDocument.uri)]:{uri:String(airDocument.uri),filename:airDocument.fileName,language:'ikemen-air',text:airDocument.text,fingerprint:'air-conflict',version:1,appliedUnsaved:false,reason:'fixture',conflict:true,revision:5}
  }});
  registerAuthoringWorkspace(vscode, context, {
    'code-navigator': async () => ({ items: [{ id: 'state-200', label: 'State 200', source: { filename: 'special.zss', line: 0 } }] }),
    'project-data': async () => ({ items: [] }),
    controllers: async () => ({ items: [{ label: 'HitDef' }] })
  });
  assert(commands.has('ikemen.authoringWorkspace.open'));
  assert(commands.has('ikemen.authoringWorkspace.choosePresentation'));
  assert(commands.has('ikemen.authoringBrowser.open'));
  assert(serializers.has('ikemenAuthoringWorkspace'));
  assert(serializers.has('ikemenAuthoringBrowser'));
  assert.strictEqual(panels.length, 0, 'coding/browser panels must never auto-open during activation');
  await commands.get('ikemen.authoringWorkspace.choosePresentation')();
  assert.strictEqual(presentation, 'native', 'the presentation picker writes the same Settings authority shown to users');
  presentation = 'integrated';
  assert.strictEqual(globalValues.has('ikemaker.authoringPresentationPreference'), false, 'a hidden global-state override cannot mask a later Settings change');

  const legacyOpen=target=>openCodingViewer(target,{forceIntegrated:true,legacyIntegrated:true});
  const coding = await legacyOpen(document.uri);
  const settleStatus=async()=>{await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));};
  assert.strictEqual(coding.type, 'ikemenAuthoringWorkspace');
  assert.strictEqual((coding.webview.html.match(/data-universal-slot=/g) || []).length, 29);
  assert.strictEqual((coding.webview.html.match(/acquireVsCodeApi\(\)/g) || []).length, 1);
  assert(coding.webview.html.includes('Visual'));
  assert(coding.webview.html.includes('Source'));
  assert(coding.webview.html.includes('Split'));
  assert(coding.webview.html.includes('data-view-mode="source"'), 'a new Coding Viewer immediately exposes the editable source surface');
  assert(coding.webview.html.includes('Open Full Text'));
  assert(!coding.webview.html.includes('command.workbench.action.files.save"')&&!coding.webview.html.includes('command.workbench.action.files.saveAs"'),'the code Project dropdown cannot bypass the exact universal Save owner');
  assert(coding.webview.html.includes('normal.zss · Recovery'),'only the normalized exact recovery snapshot marks its matching destination');
  assert(!coding.webview.html.includes('special.zss · Recovery'),'URI/filename mismatches and missing recovery identity fail closed');
  assert(coding.webview.html.includes('anim.air · Conflict · Recovery'),'an exact inactive recovery record retains its conflict metadata');
  secondDocument.isDirty=true;documentChange({document:secondDocument});await settleStatus();assert(coding.webview.html.includes('special.zss · Unsaved'),'inactive connected-document changes refresh destination status without navigating');assert(coding.webview.html.includes('special.zss: Unsaved'),'inactive dirty transitions use the bounded polite destination announcement');
  secondDocument.isDirty=false;documentSave(secondDocument);await settleStatus();assert(!coding.webview.html.includes('special.zss · Unsaved'),'inactive save clears the informational unsaved status');assert(coding.webview.html.includes('special.zss: Status cleared'),'inactive save clearing is announced politely');
  const beforeUnrelatedDiagnostic=coding.webview.html;diagnosticsChange({uris:[uri(path.join(fixtureRoot,'unrelated.zss'))]});await settleStatus();assert.strictEqual(coding.webview.html,beforeUnrelatedDiagnostic,'unrelated diagnostic events are ignored');
  diagnostics.set(String(secondDocument.uri),[{severity:0}]);diagnosticsChange({uris:[secondDocument.uri]});await settleStatus();assert(coding.webview.html.includes('special.zss · 1 error'),'exact connected diagnostics refresh with bounded visible text');assert(coding.webview.html.includes('special.zss: 1 error'),'inactive diagnostic transitions are announced');diagnostics.set(String(secondDocument.uri),[]);diagnosticsChange({uris:[secondDocument.uri]});await settleStatus();assert(!coding.webview.html.includes('special.zss · 1 error'),'diagnostic clear refreshes the same destination');
  assert.strictEqual(panels.length, 1);
  const beforeRecoverySave=document.text, beforeRecoveryApply=applyEdits; await coding.receive({type:MESSAGE_TYPE,slotId:'save'});
  assert.strictEqual(document.text,beforeRecoverySave,'opening and saving never silently adopts retained recovery text'); assert.strictEqual(applyEdits,beforeRecoveryApply); assert(recoveryRecords()[String(document.uri)],'ordinary Save does not dismiss retained recovery'); saves=0;

  const initialGeneration=Number(/editGeneration=(\d+)/.exec(coding.webview.html)?.[1]||0), normalId=path.resolve(filename).toLowerCase();
  await coding.receive({type:'remember-source-view',generation:initialGeneration,documentId:normalId,selectionStart:3,selectionEnd:8,selectionDirection:'forward',scrollTop:72,scrollLeft:2,focused:true});
  await coding.receive({type:'set-view-mode',mode:'split'});
  assert(coding.webview.html.includes('"selectionStart":3')&&coding.webview.html.includes('"scrollTop":72'),'host-rendered presentation state survives a safe rerender');
  await coding.receive({type:'remember-source-view',generation:initialGeneration,documentId:'forged',selectionStart:0,selectionEnd:0,selectionDirection:'none',scrollTop:0,scrollLeft:0,focused:false});
  await coding.receive({type:'set-view-mode',mode:'source'});
  assert(coding.webview.html.includes('"selectionStart":3'),'wrong-document presentation reports fail closed');
  const specialId=path.resolve(secondFilename).toLowerCase(),closedSecond=secondDocument;secondDocument.isClosed=true;documentClose(secondDocument);await settleStatus();assert(coding.webview.html.includes('special.zss · Closed'),'closed remains informational while the exact file is available');assert(coding.webview.html.includes('special.zss: Closed'),'inactive close is announced politely');
  await coding.receive({type:'activate-navigation',id:specialId});assert.notStrictEqual(secondDocument,closedSecond,'activating a closed destination reopens and replaces the stale TextDocument reference');assert(!coding.webview.html.includes('special.zss · Closed'),'successful exact reopen clears Closed');
  assert(coding.title.includes('special.zss')&&coding.webview.html.includes(`revealNavigationId=${JSON.stringify(specialId)}`)&&coding.webview.html.includes(`focusNavigationId=${JSON.stringify(specialId)}`),'keyboard activation reveals and focuses the host-confirmed destination after rerender');
  await coding.receive({type:'activate-navigation',id:'schema-valid-but-unknown'});
  await coding.receive({type:'set-view-mode',mode:'source'});
  assert(coding.webview.html.includes('focusNavigationId=""'),'a failed keyboard activation cannot leak its focus request into a later successful render');
  await coding.receive({type:'activate-navigation',id:normalId}); assert(coding.title.includes('normal.zss'));
  const unavailableSafety={title:coding.title,currentText:document.text,currentVersion:document.version,currentDirty:document.isDirty,secondText:secondDocument.text,secondVersion:secondDocument.version,secondDirty:secondDocument.isDirty,applyEdits,saves,cards:workspaceValues.get('ikemaker.authoringCardHands.v1'),recovery:workspaceValues.get('ikemaker.authoringDraftRecovery.v1')};fs.unlinkSync(secondFilename);await coding.receive({type:'activate-navigation',id:specialId});
  assert.deepStrictEqual({title:coding.title,currentText:document.text,currentVersion:document.version,currentDirty:document.isDirty,secondText:secondDocument.text,secondVersion:secondDocument.version,secondDirty:secondDocument.isDirty,applyEdits,saves,cards:workspaceValues.get('ikemaker.authoringCardHands.v1'),recovery:workspaceValues.get('ikemaker.authoringDraftRecovery.v1')},unavailableSafety,'a missing destination fails before current/source/card/recovery/save state changes');assert(coding.webview.html.includes('Unavailable')&&coding.webview.html.includes('current tab was not changed'),'unavailable status warns and uses the existing polite destination announcement');fs.writeFileSync(secondFilename,secondDocument.text);
  const ordinarySecondText=secondDocument.text,shownBeforeNativeRequired=shown.length,closedNativeSecond=secondDocument;secondDocument.text='x'.repeat(4*1024*1024+1);secondDocument.isClosed=true;documentClose(secondDocument);await settleStatus();await coding.receive({type:'activate-navigation',id:specialId});assert.notStrictEqual(secondDocument,closedNativeSecond,'a closed native-required source replaces its stale connected TextDocument only after guarded native open succeeds');assert(coding.title.includes('normal.zss')&&shown.length===shownBeforeNativeRequired+1&&shown.at(-1)===secondDocument,'an oversized connected source opens only the exact guarded native document and leaves integrated navigation unchanged');assert(coding.webview.html.includes('Native editor required')&&!coding.webview.html.includes('special.zss · Closed'));secondDocument.text=ordinarySecondText;
  await coding.receive({type:'select-navigation',id:specialId}); assert(coding.title.includes('special.zss')&&coding.webview.html.includes(`revealNavigationId=${JSON.stringify(specialId)}`)&&coding.webview.html.includes('focusNavigationId=""'),'click selection reveals the host-confirmed document without moving keyboard focus');
  await coding.receive({type:'select-navigation',index:0}); assert(coding.title.includes('normal.zss')&&coding.webview.html.includes(`revealNavigationId=${JSON.stringify(normalId)}`)&&coding.webview.html.includes('focusNavigationId=""'),'slider selection reveals the same exact connected document without moving keyboard focus');
  await coding.receive({type:'next-navigation'}); assert(coding.title.includes('special.zss')&&coding.webview.html.includes(`revealNavigationId=${JSON.stringify(specialId)}`)&&coding.webview.html.includes('focusNavigationId=""'),'arrow selection reveals the host-confirmed connected document without moving keyboard focus');
  await coding.receive({type:'previous-navigation'}); assert(coding.title.includes('normal.zss')&&coding.webview.html.includes(`revealNavigationId=${JSON.stringify(normalId)}`));

  const beforeOrganization={documents:[document,secondDocument,airDocument].map((item)=>({object:item,text:item.text,version:item.version,isDirty:item.isDirty})),applyEdits,saves,deletes:executed.filter((entry)=>entry.id==='workbench.action.deleteFile').length};
  const assertOrganizationSafe=(label)=>{assert.deepStrictEqual({documents:[document,secondDocument,airDocument].map((item)=>({object:item,text:item.text,version:item.version,isDirty:item.isDirty})),applyEdits,saves,deletes:executed.filter((entry)=>entry.id==='workbench.action.deleteFile').length},beforeOrganization,`${label} preserves every exact native document and performs no source/save/delete mutation`);assert(coding.webview.html.includes('"selectionStart":3')&&coding.webview.html.includes('"scrollTop":72')&&coding.webview.html.includes('"focused":true'),`${label} preserves caret, scroll and focus state`);};
  quickPickLabels=['Create hand','Create hand'];inputBoxValues=['Favorites','Secondary'];await Promise.all([coding.receive({type:'organize-navigation'}),coding.receive({type:'organize-navigation'})]);
  assertOrganizationSafe('create hands');
  assert(coding.webview.html.includes('Organize tabs…'),'organization remains in the invariant header');
  const beforeNestedCancel=coding.webview.html;quickPickLabels=['Rename hand',null];await coding.receive({type:'organize-navigation'});assert.strictEqual(coding.webview.html,beforeNestedCancel,'nested cancellation is a no-op');assertOrganizationSafe('nested cancellation');
  quickPickLabels=['Assign file','normal.zss','Favorites'];await coding.receive({type:'organize-navigation'});
  await coding.receive({type:'set-navigation-mode',mode:'cards'});
  assertOrganizationSafe('assignment and mode change');
  assert(coding.webview.html.indexOf('Favorites')<coding.webview.html.indexOf('Secondary'));
  quickPickLabels=['Collapse or expand hand','Favorites'];await coding.receive({type:'organize-navigation'});
  assert(coding.webview.html.includes('aria-expanded="true"')&&coding.webview.html.includes('1 of 3 · normal.zss'),'a collapsed hand containing the current file remains effectively expanded without altering canonical navigation');
  await coding.receive({type:'select-navigation',id:specialId});assert(coding.webview.html.includes('aria-expanded="false"'),'a collapsed inactive hand becomes compact');
  await coding.receive({type:'activate-navigation',id:normalId});assert(coding.webview.html.includes('aria-expanded="true"')&&coding.webview.html.includes(`focusNavigationId=${JSON.stringify(normalId)}`),'canonical keyboard activation can enter a hidden hand and restores its current focused destination');
  const storedAfterCollapse=workspaceValues.get('ikemaker.authoringCardHands.v1'),favoriteId=storedAfterCollapse.contexts[0].hands.find((hand)=>hand.label==='Favorites').id, beforeForgedToggle=coding.webview.html;
  await coding.receive({type:'toggle-navigation-hand',id:'hand-'+ 'f'.repeat(31)});assert.strictEqual(coding.webview.html,beforeForgedToggle,'forged hand toggle IDs fail closed');
  await coding.receive({type:'toggle-navigation-hand',id:favoriteId});assert(!workspaceValues.get('ikemaker.authoringCardHands.v1').contexts[0].collapsedHandIds.includes(favoriteId),'the inline heading toggle updates exact host-owned metadata');
  await coding.receive({type:'toggle-navigation-hand',id:favoriteId});assert(workspaceValues.get('ikemaker.authoringCardHands.v1').contexts[0].collapsedHandIds.includes(favoriteId));
  assertOrganizationSafe('collapse and direct heading toggles');
  quickPickLabels=['Reorder hands','Secondary','Move earlier'];await coding.receive({type:'organize-navigation'});
  assertOrganizationSafe('hand reorder');
  assert.deepStrictEqual([...coding.webview.html.matchAll(/<h3[^>]*><button[^>]*>([^<]+)<span class="destination-hand-summary"/g)].map((match)=>match[1]).slice(0,2),['Secondary','Favorites'],'hand reorder changes Cards order');
  quickPickLabels=['Reorder files','special.zss','Move earlier'];await coding.receive({type:'organize-navigation'});
  assertOrganizationSafe('file reorder');
  assert(coding.webview.html.includes('2 of 3 · normal.zss'),'file reorder changes the canonical slider order');
  await coding.receive({type:'previous-navigation'});assert(coding.title.includes('special.zss'),'arrows consume the reordered canonical file order');
  await coding.receive({type:'next-navigation'});assert(coding.title.includes('normal.zss'));
  quickPickLabels=['Reorder files','normal.zss','Move earlier'];await coding.receive({type:'organize-navigation'});
  assertOrganizationSafe('second file reorder');
  const beforeRejectedOrganization=coding.webview.html, persistedHands=workspaceValues.get('ikemaker.authoringCardHands.v1');failCardHandsPersistence=true;quickPickLabels=['Rename hand','Favorites'];inputBoxValues=['Broken name'];await coding.receive({type:'organize-navigation'});
  assert.strictEqual(coding.webview.html,beforeRejectedOrganization);assert.strictEqual(workspaceValues.get('ikemaker.authoringCardHands.v1'),persistedHands);assert(warnings.some(message=>message.includes('Could not save Coding Viewer tab organization')),'persistence failure is reported and retains prior model');
  assertOrganizationSafe('rejected persistence');
  quickPickLabels=['Delete hand','Secondary'];await coding.receive({type:'organize-navigation'});
  assert(coding.webview.html.includes('1 of 3 · normal.zss')&&!coding.webview.html.includes('Secondary'),'deleting a hand deletes metadata only');
  assertOrganizationSafe('hand deletion');

  await liveEdit(coding, '[State 200]\nlet x = 2\n');
  assert(document.text.includes('x = 2') && document.isDirty, 'typing edits the exact native document and marks it dirty immediately');
  assert.strictEqual(recoveryRecords()[String(document.uri)], undefined, 'acknowledged live typing no longer remains an unapplied draft');
  await coding.receive({ type: MESSAGE_TYPE, slotId: 'save' });
  assert(document.text.includes('x = 2'));
  assert.strictEqual(saves, 1);
  assert.strictEqual(recoveryRecords()[String(document.uri)], undefined);
  assert.strictEqual(await legacyOpen(document.uri), coding, 'same exact document must reuse its coding panel');

  const normalSave = document.save;
  document.save = async function () { saves += 1; this.isDirty = true; return false; };
  await liveEdit(coding, '[State 200]\nlet x = 4\n');
  await coding.receive({ type: MESSAGE_TYPE, slotId: 'save' });
  assert(recoveryRecords()[String(document.uri)], 'failed native saves must retain recovery');
  assert(warnings.some((message) => message.includes('recovery draft was kept')));
  document.save = normalSave;
  await coding.receive({ type: MESSAGE_TYPE, slotId: 'save' });
  assert.strictEqual(recoveryRecords()[String(document.uri)], undefined, 'recovery clears only after a verified native save');

  await coding.receive({ type: MESSAGE_TYPE, slotId: 'help', command: 'workbench.action.deleteFile' });
  await coding.receive({ type: MESSAGE_TYPE, slotId: 'help' });
  assert(!executed.some((entry) => entry.id === 'workbench.action.deleteFile'));
  assert(executed.some((entry) => entry.id === 'ikemen.help.open'));

  await coding.receive({ type: 'next-navigation' });
  assert(coding.title.includes('special.zss'));
  assert(coding.webview.html.includes('2 of 3 · special.zss'));
  assert(coding.webview.html.includes('let y = 3'));
  await Promise.all([coding.receive({ type:'set-view-mode', mode:'split' }), coding.receive({ type:MESSAGE_TYPE, slotId:'help' })]);
  const routedHelp = executed.filter((entry) => entry.id === 'ikemen.help.open').at(-1);
  assert.strictEqual(String(routedHelp.args[0]), String(secondDocument.uri), 'universal commands use the currently navigated document and serialize with body actions');
  assert.strictEqual(await legacyOpen(secondDocument.uri), coding, 'every connected tab reuses the same shell');
  await coding.receive({ type: 'previous-navigation' });
  assert(coding.title.includes('normal.zss'));
  assert(coding.webview.html.includes('1 of 3 · normal.zss'));
  assert(coding.webview.html.includes('"selectionStart":3')&&coding.webview.html.includes('"scrollTop":72'),'A→B→A navigation restores the first file presentation state');

  document.text = '[State 200]\nlet external = 7\n'; document.version += 1;
  await documentChange({ document });
  assert(coding.webview.html.includes('let external = 7'), 'clean integrated views rebase after an exact native document change');
  let releaseDraftUpdate, reportDraftUpdate;
  blockedDraftUpdate = new Promise((resolve) => { releaseDraftUpdate = resolve; });
  const draftUpdateStarted = new Promise((resolve) => { reportDraftUpdate = resolve; });
  notifyDraftUpdate = reportDraftUpdate;
  const queuedEdit = liveEdit(coding, '[State 200]\nlet local = 8\n');
  await draftUpdateStarted;
  document.text = '[State 200]\nlet external = 9\n'; document.version += 1;
  const queuedExternalChange = documentChange({ document });
  releaseDraftUpdate();
  await Promise.all([queuedEdit, queuedExternalChange]);
  assert(coding.webview.html.includes('native source changed'), 'dirty integrated drafts display a native-edit conflict instead of being overwritten');
  await liveEdit(coding, '[State 200]\nlet local after conflict = 10\n');
  assert(coding.webview.html.includes('source changed'), 'continued typing cannot clear an unresolved native-edit conflict');
  await coding.receive({ type: 'apply-source' });
  assert(document.text.includes('external = 9'), 'a stale integrated draft cannot overwrite the externally changed native source');
  assert(coding.webview.html.includes('native source changed') || coding.webview.html.includes('changed'), 'the stale apply remains visibly blocked');

  await coding.receive({ type: MESSAGE_TYPE, slotId:'recovery' });
  assert.strictEqual(recoveryCopies.length,1,'Recovery opens retained conflict text as a separate document');
  assert(recoveryCopies[0].text.includes('local after conflict = 10'),'the newest retained local text remains accessible');
  assert(document.text.includes('external = 9'),'opening recovery never overwrites the changed source');
  assert(notices.some(message=>message.includes('separate unsaved copy')&&message.includes('not overwritten')));
  const recoverySourceBytes=document.text, recoveryApplyCount=applyEdits, recoverySaveCount=saves;
  quickPickAction='compare'; await coding.receive({type:MESSAGE_TYPE,slotId:'recovery'});
  const diff=executed.filter(item=>item.id==='vscode.diff').at(-1); assert(diff,'Compare invokes VS Code diff'); assert.strictEqual(String(diff.args[1]),String(document.uri),'Compare uses the exact current source URI');
  quickPickAction='copy'; await coding.receive({type:MESSAGE_TYPE,slotId:'recovery'}); assert(clipboardText.includes('local after conflict = 10'));
  await coding.receive({type:'recovery-action',id:'forged',action:'remove'});
  assert.deepStrictEqual({text:document.text,applyEdits,saves},{text:recoverySourceBytes,applyEdits:recoveryApplyCount,saves:recoverySaveCount},'open/compare/copy and forged recovery messages never edit or save source');
  quickPickAction='remove'; await coding.receive({type:MESSAGE_TYPE,slotId:'recovery'});await settleStatus();assert.strictEqual(document.text,recoverySourceBytes,'confirmed recovery deletion changes only the recovery record');assert(!coding.webview.html.includes('normal.zss · Recovery'),'post-success recovery-store notification clears status without a source mutation');
  quickPickAction='open';

  const beforeRejectedMode = coding.webview.html;
  await coding.receive({ type:'set-navigation-mode', mode:'list' });
  await coding.receive({ type:'set-view-mode', mode:'source', forged:true });
  await coding.receive({ type:'select-navigation', index:0, id:'forged' });
  await coding.receive({ type:'activate-navigation', id:'schema-valid-but-unknown' });
  await coding.receive({ type:'select-navigation', id:'schema-valid-but-unknown' });
  assert.strictEqual(coding.webview.html, beforeRejectedMode, 'List and malformed code-viewer messages fail closed without rerendering');

  await coding.receive({ type: 'select-navigation', id: path.resolve(airFilename).toLowerCase() });
  assert(coding.title.includes('anim.air'));
  assert(coding.webview.html.includes('Open AIR Animation Preview'));
  assert(!coding.webview.html.includes('aria-label="Source editor" readonly'), 'AIR source is directly editable inside the Coding Viewer');
  await coding.receive({ type: 'launch-visual', command: 'workbench.action.deleteFile', filename: airFilename, kind: 'air', role: 'character' });
  await coding.receive({ type: 'launch-visual', command: 'air.openAnimationPreview', filename: airFilename, kind: 'air', role: 'character' });
  assert(!executed.some((entry) => entry.id === 'workbench.action.deleteFile'));
  assert(executed.some((entry) => entry.id === 'air.openAnimationPreview' && String(entry.args[0]) === String(airDocument.uri)));

  presentation = 'native';
  const shownBeforeNative = shown.length, panelsBeforeNative = panels.length, explicitlyIntegrated = await legacyOpen(secondDocument.uri);
  assert.strictEqual(shown.length, shownBeforeNative); assert.strictEqual(explicitlyIntegrated, coding, 'Open Coding Viewer is an explicit integrated-editor request and reuses the connected owner even when ordinary character files prefer Native');
  assert.strictEqual(panels.length, panelsBeforeNative);
  presentation = 'ask'; quickPickMode = 'cancel';
  const shownBeforeCancel = shown.length; assert.strictEqual(await legacyOpen(document.uri), coding);
  assert.strictEqual(shown.length, shownBeforeCancel, 'Open Coding Viewer reuses its integrated owner without falling through to an ordinary text tab');
  presentation = 'integrated'; quickPickMode = 'first';

  await coding.receive({ type: 'open-full-text', line: 0 });
  assert.strictEqual(shown.at(-1), document, 'Open Full Text must follow navigation and route to the exact currently displayed native document');
  assert.strictEqual(panels.length, 1, 'authoring browser remains manual-open only');
  const browser = await commands.get('ikemen.authoringBrowser.open')();
  assert.strictEqual(browser.type, 'ikemenAuthoringBrowser');
  assert.strictEqual(panels.length, 2);
  assert(browser.webview.html.includes('Code Navigator'));
  assert.strictEqual((browser.webview.html.match(/data-universal-slot=/g)||[]).length,0,'Coding Assistance shares the toolbar already owned by the paired navigation/editor surface');
  assert.strictEqual((browser.webview.html.match(/acquireVsCodeApi\(\)/g)||[]).length,1);
  const browserCommandCount=executed.length;
  await browser.receive({type:MESSAGE_TYPE,slotId:'project',command:'workbench.action.deleteFile'});assert.strictEqual(executed.length,browserCommandCount,'assistance rejects duplicate or forged toolbar traffic');
  await browser.receive({type:MESSAGE_TYPE,slotId:'help'});assert.strictEqual(executed.length,browserCommandCount,'the shared toolbar remains exclusively owned by Code Navigation');
  const browserSourceRows = [...browser.webview.html.matchAll(/data-message="open-source-intent" data-provider-id="code-navigator" data-row-id="([^"]+)"/g)];
  assert(browserSourceRows.length >= 2, 'browser must expose context-bound exact source actions');
  const staleBrowserGeneration=Number(/const generation=(\d+)/.exec(browser.webview.html)?.[1]||0), titleBeforeStale=coding.title;
  secondDocument.text='[State 210]\nlet shifted = 1\nlet y = 3\n';secondDocument.version+=1;
  await browser.receive({type:'open-source-intent',generation:staleBrowserGeneration,providerId:'code-navigator',rowId:browserSourceRows.at(-1)[1]});
  assert.strictEqual(coding.title,titleBeforeStale,'a source change makes an old browser route fail without moving the grouped Coding Viewer');
  assert(notices.some(message=>message.includes('result is stale')),'stale browser routes explain that the index refreshed');
  let refreshedRows=[...browser.webview.html.matchAll(/data-message="open-source-intent" data-provider-id="code-navigator" data-row-id="([^"]+)"/g)], browserGeneration=Number(/const generation=(\d+)/.exec(browser.webview.html)?.[1]||0);
  let releaseRace,reportRace;blockedDraftUpdate=new Promise(resolve=>{releaseRace=resolve});const raceQueued=new Promise(resolve=>{reportRace=resolve});notifyDraftUpdate=reportRace;
  const blockingEdit=liveEdit(coding,'[State 200]\nlet route_queue = 1\n');await raceQueued;
  const pendingRoute=browser.receive({type:'open-source-intent',generation:browserGeneration,providerId:'code-navigator',rowId:refreshedRows.at(-1)[1]});
  secondDocument.text='[State 210]\nlet changed_during_route = 1\nlet y = 3\n';secondDocument.version+=1;releaseRace();await Promise.all([blockingEdit,pendingRoute]);
  assert(coding.title.includes('normal.zss'),'a document edit while exact navigation waits in the Coding Viewer queue leaves the current tab unchanged');
  await browser.receive({type:'refresh',generation:Number(/const generation=(\d+)/.exec(browser.webview.html)?.[1]||0)});
  refreshedRows=[...browser.webview.html.matchAll(/data-message="open-source-intent" data-provider-id="code-navigator" data-row-id="([^"]+)"/g)];browserGeneration=Number(/const generation=(\d+)/.exec(browser.webview.html)?.[1]||0);
  let releaseTargetOpen,reportTargetOpen;blockTargetOpenAfter=2;blockedTargetOpen=new Promise(resolve=>{releaseTargetOpen=resolve});const targetOpenStarted=new Promise(resolve=>{reportTargetOpen=resolve});notifyTargetOpen=reportTargetOpen;
  const draftRaceRoute=browser.receive({type:'open-source-intent',generation:browserGeneration,providerId:'code-navigator',rowId:refreshedRows.at(-1)[1]});await targetOpenStarted;
  secondDocument.text='[State 210]\nlet changed_while_draft_opened = 1\n';secondDocument.version+=1;releaseTargetOpen();await draftRaceRoute;
  assert(coding.title.includes('normal.zss'),'a target edit during draft preparation rolls navigation back before the visible tab or caret changes');
  await browser.receive({type:'refresh',generation:Number(/const generation=(\d+)/.exec(browser.webview.html)?.[1]||0)});
  refreshedRows=[...browser.webview.html.matchAll(/data-message="open-source-intent" data-provider-id="code-navigator" data-row-id="([^"]+)"/g)];browserGeneration=Number(/const generation=(\d+)/.exec(browser.webview.html)?.[1]||0);
  const beforeExternalAuthorize=coding.webview.html,beforeExternalShown=shown.length,originalByteLength=Buffer.byteLength;
  showBoundary=async()=>{secondDocument.version+=1;};Buffer.byteLength=(value,...args)=>value===secondDocument.text?4*1024*1024+1:originalByteLength(value,...args);try{await browser.receive({type:'open-source-intent',generation:browserGeneration,providerId:'code-navigator',rowId:refreshedRows.at(-1)[1]});}finally{Buffer.byteLength=originalByteLength;showBoundary=null;}
  assert.strictEqual(shown.length,beforeExternalShown+1,'the external-authority race reaches the exact guarded native show boundary');assert.strictEqual(coding.webview.html,beforeExternalAuthorize,'a caller authorization change during exact native show commits no announcement, render, navigation, or connected-document state');
  const shownAfterExternalAuthorize=shown.length;
  await browser.receive({type:'refresh',generation:Number(/const generation=(\d+)/.exec(browser.webview.html)?.[1]||0)});refreshedRows=[...browser.webview.html.matchAll(/data-message="open-source-intent" data-provider-id="code-navigator" data-row-id="([^"]+)"/g)];browserGeneration=Number(/const generation=(\d+)/.exec(browser.webview.html)?.[1]||0);
  await browser.receive({ type: 'open-source-intent', generation:browserGeneration, providerId: 'code-navigator', rowId: refreshedRows.at(-1)[1] });
  assert.strictEqual(shown.length,shownAfterExternalAuthorize,'the later successful browser source handoff stays inside the grouped Coding Viewer instead of opening a separate native tab');
  assert(coding.title.includes('special.zss'),'browser source handoff selects the exact connected source in the existing grouped Coding Viewer');
  const rebound=await openAuthoringBrowser({type:'character',key:path.dirname(kenFilename),root:path.dirname(kenFilename),label:'Ken',identity:`character:${path.dirname(kenFilename)}`,files:[kenFilename]});
  assert.strictEqual(rebound,browser,'opening another character rebinds the singleton browser instead of creating a duplicate window');
  assert(rebound.webview.html.includes('ken.zss')&&!rebound.webview.html.includes('normal.zss'),'the rebound browser exposes only the new character context');
  const personalPin=personalExamples.createPin({owner:ownerFilename,filename,text:document.text,line:0,label:'Pinned current setup'}),wrongPin=personalExamples.createPin({owner:otherOwnerFilename,filename,text:document.text,line:0,label:'Wrong owner pin'});let personalStore=personalExamples.putPin({},personalPin);personalStore=personalExamples.putPin(personalStore,wrongPin);workspaceValues.set(personalExamples.STORE_KEY,personalStore);
  assert.strictEqual(boundedPersonalDiscoveryPin({...personalPin,parameters:[{id:'oversized',kind:'state',label:'x',original:'0',ranges:Array.from({length:65},(_,index)=>({start:index,end:index+1}))}]},ownerFilename),null,'oversized parameter/range metadata is rejected before normalization');assert.strictEqual(boundedPersonalDiscoveryPin({...personalPin,unexpected:{payload:'x'.repeat(200000)}},ownerFilename),null,'unrecognized oversized pin metadata is rejected without traversal');
  await openAuthoringBrowser({type:'character',key:path.dirname(filename),root:path.dirname(filename),ownerDef:ownerFilename,label:'Original',identity:`character:${ownerFilename}`,files:[otherOwnerFilename,ownerFilename,filename,secondFilename,airFilename]});
  assert(browser.webview.html.includes('Pinned current setup')&&!browser.webview.html.includes('Wrong owner pin'),'Coding Assistance uses the exact owner DEF authority even when another connected DEF appears first');
  assert.strictEqual(authoringContexts.currentContext().ownerDef,ownerFilename,'the browser registry retains the exact owning DEF instead of inferring it from connected-file order');
  vscode.window.activeTextEditor={document,selection:{active:{line:0}},viewColumn:1};
  const beforeResumeActions={text:document.text,version:document.version,isDirty:document.isDirty,applyEdits,saves};inputBoxValues=['Return to current setup'];
  await browser.receive({type:'mark-resume-context',generation:Number(/const generation=(\d+)/.exec(browser.webview.html)?.[1]||0)});
  const storedResume=workspaceValues.get(resumeContextApi.STORE_KEY),storedMarker=Object.values(storedResume?.byOwner||{}).find(marker=>path.resolve(marker.owner).toLowerCase()===path.resolve(ownerFilename).toLowerCase());
  assert(storedMarker&&storedMarker.label==='Return to current setup','Mark Current Block persists one exact owner-scoped marker through fresh-read workspace storage');
  assert(browser.webview.html.includes('Return to current setup')&&browser.webview.html.includes('Marked source block is unchanged.'),'the existing Coding Assistance surface reports the resolved marker without another window');
  await browser.receive({type:'resume-context',generation:Number(/const generation=(\d+)/.exec(browser.webview.html)?.[1]||0)});
  assert(coding.title.includes('normal.zss'),'Resume routes the exact verified source into the existing grouped Coding Viewer');
  await browser.receive({type:'clear-resume-context',generation:Number(/const generation=(\d+)/.exec(browser.webview.html)?.[1]||0)});
  assert(!Object.values(workspaceValues.get(resumeContextApi.STORE_KEY)?.byOwner||{}).some(marker=>path.resolve(marker.owner).toLowerCase()===path.resolve(ownerFilename).toLowerCase())&&!browser.webview.html.includes('Return to current setup'),'Clear removes only the exact owner marker and refreshes the same assistance surface');
  assert.deepStrictEqual({text:document.text,version:document.version,isDirty:document.isDirty,applyEdits,saves},beforeResumeActions,'Mark, Resume, and Clear do not edit or save project source');
  const raceText=document.text;inputBoxValues=[()=>{document.text=`${raceText}\n# changed during marker prompt`;document.version+=1;return 'Stale source';}];await browser.receive({type:'mark-resume-context',generation:Number(/const generation=(\d+)/.exec(browser.webview.html)?.[1]||0)});document.text=raceText;document.version+=1;
  assert(!Object.values(workspaceValues.get(resumeContextApi.STORE_KEY)?.byOwner||{}).length,'a source edit during the label prompt cannot persist the pre-prompt block');
  vscode.window.activeTextEditor={document,selection:{active:{line:0,character:0}},viewColumn:1};inputBoxValues=[()=>{vscode.window.activeTextEditor={document:secondDocument,selection:{active:{line:0,character:0}},viewColumn:1};return 'Wrong editor';}];await browser.receive({type:'mark-resume-context',generation:Number(/const generation=(\d+)/.exec(browser.webview.html)?.[1]||0)});
  assert(!Object.values(workspaceValues.get(resumeContextApi.STORE_KEY)?.byOwner||{}).length,'switching editors during the label prompt cannot persist a marker for the abandoned editor');
  const caretEditor={document,selection:{active:{line:0,character:0}},viewColumn:1};vscode.window.activeTextEditor=caretEditor;inputBoxValues=[()=>{caretEditor.selection={active:{line:1,character:0}};return 'Moved caret';}];await browser.receive({type:'mark-resume-context',generation:Number(/const generation=(\d+)/.exec(browser.webview.html)?.[1]||0)});
  assert(!Object.values(workspaceValues.get(resumeContextApi.STORE_KEY)?.byOwner||{}).length&&notices.filter(message=>message.includes('editor, source, or caret changed')).length>=3,'source, editor, and caret prompt races all fail visibly without persistence');
  document.text='[StateDef 200]\nif 1 {\n  ChangeState {\n    value: 201;\n  }\n}\n';document.version+=1;vscode.window.activeTextEditor={document,selection:{active:{line:2}},viewColumn:1};
  diagnostics.set(String(document.uri),Array.from({length:2049},(_,index)=>({range:{start:{line:index===2048?2:99},end:{line:index===2048?2:99}},severity:1,code:`bounded-${index}`,message:index===2048?'Relevant diagnostic beyond intake bound':'outside'})));
  assert(commands.has('ikemen.authoring.explainCurrentBlock'));await commands.get('ikemen.authoring.explainCurrentBlock')();assert(browser.webview.html.includes('Explain Current Block')&&browser.webview.html.includes('Why might this not run?'),'the shared command captures the active connected native block inside Coding Assistance');
  assert(browser.webview.html.includes('review incomplete')&&browser.webview.html.includes('additional native Problems were omitted')&&!browser.webview.html.includes('No confirmed local blocker'),'diagnostics beyond the bounded intake cannot be misreported as a clean block');diagnostics.delete(String(document.uri));
  const explanationGeneration=Number(/const generation=(\d+)/.exec(browser.webview.html)?.[1]||0),explanationRoute=/data-message="open-block-explanation-source" data-route-id="([^"]+)"/.exec(browser.webview.html)?.[1];assert(explanationRoute,'the explanation exposes only a host-issued exact source route');
  document.text+='\n# changed after explanation\n';document.version+=1;const beforeStaleExplanationTitle=coding.title;await browser.receive({type:'open-block-explanation-source',generation:explanationGeneration,routeId:explanationRoute});assert.strictEqual(coding.title,beforeStaleExplanationTitle,'a stale explanation source route cannot navigate after the native source changes');assert(notices.some(message=>message.includes('result is stale')),'stale explanation routes reuse the truthful exact-source warning');
  browser.dispose();
  assert.strictEqual(await legacyOpen(airDocument.uri),coding,'closing the floating browser does not close its Coding Viewer context');
  let reopenedBrowser=await commands.get('ikemen.authoringBrowser.open')();assert.notStrictEqual(reopenedBrowser,browser,'the manually closed browser can be explicitly reopened');
  const assistanceContext=authoringContexts.currentContext(),assistanceState=serializedAssistanceState({type:assistanceContext.type,key:assistanceContext.key,root:assistanceContext.root,label:assistanceContext.label,ownerDef:assistanceContext.ownerDef,files:assistanceContext.files});
  assert(parseAssistanceState(assistanceState)?.context.files.length===3,'Coding Assistance emits and validates its exact bounded context');
  assert.strictEqual(parseAssistanceState({...assistanceState,forged:true}),null,'Coding Assistance rejects forged restore envelopes');
  const ownedAssistanceState=serializedAssistanceState({type:'character',key:path.dirname(filename),root:path.dirname(filename),label:'Original',ownerDef:ownerFilename,files:[otherOwnerFilename,ownerFilename,filename,secondFilename,airFilename]}),parsedOwnedAssistance=parseAssistanceState(ownedAssistanceState);
  assert.strictEqual(parsedOwnedAssistance?.context.ownerDef,ownerFilename,'Coding Assistance preserves an exact admitted DEF owner through serialization and restoration');
  const {ownerDef:_legacyOwner,...legacyAssistanceContext}=ownedAssistanceState.context,legacyAssistanceState={...ownedAssistanceState,context:legacyAssistanceContext};
  assert.strictEqual(parseAssistanceState(legacyAssistanceState)?.context.ownerDef,'','legacy restore envelopes remain readable but cannot acquire inferred personal-example ownership');
  assert.strictEqual(parseAssistanceState({...ownedAssistanceState,context:{...ownedAssistanceState.context,ownerDef:kenFilename}}),null,'a restored DEF owner outside the admitted file set fails closed');
  reopenedBrowser.dispose();const restoredAssistance=panel('ikemenAuthoringBrowser');await serializers.get('ikemenAuthoringBrowser').deserializeWebviewPanel(restoredAssistance,{restore:assistanceState});reopenedBrowser=restoredAssistance;
  assert.strictEqual(restoredAssistance.disposed,false,'Coding Assistance restores into the supplied VS Code panel without opening a duplicate');
  assert(restoredAssistance.webview.html.includes('Coding Assistance')&&restoredAssistance.webview.html.includes('restore:persistedRestore'),'restored Coding Assistance retains its exact context envelope');
  const rejectedAssistance=panel('ikemenAuthoringBrowser');await serializers.get('ikemenAuthoringBrowser').deserializeWebviewPanel(rejectedAssistance,{restore:{...assistanceState,forged:true}});assert(rejectedAssistance.disposed,'malformed Coding Assistance restoration fails closed');
  const groupedRestore=panel('ikemenAuthoringWorkspace');
  await serializers.get('ikemenAuthoringWorkspace').deserializeWebviewPanel(groupedRestore,{schema:'ikemaker.code-viewer-state',version:1,uri:String(document.uri),grouped:true});
  assert(groupedRestore.disposed,'a grouped character viewer is not silently restored as one file');
  assert(notices.some(message=>message.includes('Reopen Character Essentials')&&message.includes('partial one-file viewer')),'grouped restore gives a truthful recovery route');
  const handsBeforeStale=workspaceValues.get('ikemaker.authoringCardHands.v1'),kenCoding=await legacyOpen(kenDocument.uri);quickPickLabels=['Create hand'];inputBoxValues=[()=>{kenCoding.dispose();return 'Stale hand';}];await kenCoding.receive({type:'organize-navigation'});
  assert.strictEqual(workspaceValues.get('ikemaker.authoringCardHands.v1'),handsBeforeStale,'disposing during a nested organization prompt aborts stale metadata');
  assert(authoringContexts.disposeContextPanels(authoringContexts.currentContext()) >= 2, 'closing the authoring context also closes its floating browser');const disposedHtml=coding.webview.html;documentSave(document);diagnosticsChange({uris:[document.uri]});await settleStatus();assert.strictEqual(coding.webview.html,disposedHtml,'disposed status callbacks are generation-safe no-ops');
  const reopenedCoding=await legacyOpen(document.uri);
  assert(reopenedCoding.webview.html.includes('Favorites')&&!reopenedCoding.webview.html.includes('Broken name')&&!reopenedCoding.webview.html.includes('Secondary'),'reopen restores only successfully persisted hand metadata');
  assert(reopenedCoding!==coding&&reopenedCoding.webview.html.includes('data-mode="cards"'),'disposing the exact panel and creating a genuinely new one restores the persisted Cards presentation mode');
  const reopenedRecord=workspaceValues.get('ikemaker.authoringCardHands.v1').contexts.find((entry)=>entry.hands.some((hand)=>hand.label==='Favorites'));
  const reopenedNormalPosition=reopenedRecord.fileOrder.indexOf(normalId)+1;
  assert(reopenedRecord.collapsedHandIds.includes(reopenedRecord.hands.find((hand)=>hand.label==='Favorites').id)&&reopenedCoding.webview.html.includes(`${reopenedNormalPosition} of 3 · normal.zss`),'cold reopen preserves collapse metadata and canonical file order');
  console.log('Coding Viewer activation is explicit, reuses exact documents, saves through WorkspaceEdit/native save, retains drafts and keeps the browser manual');
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(()=>fs.rmSync(fixtureRoot,{recursive:true,force:true}));
