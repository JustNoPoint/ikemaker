'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const navigationCalls = [];
const ownerFor = filename => filename.includes('ambiguous')
  ? [path.resolve('C:/chars/Ryu/Ryu.def'), path.resolve('C:/chars/Ken/Ken.def')]
  : filename.includes('chars') ? [path.resolve('C:/chars/Ryu/Ryu.def')] : [];
const navigation = {
  associatedDefs: ownerFor,
  async openConnected(seed, target) { navigationCalls.push({ seed: seed?.fsPath || seed, target }); }
};

const registrations = [];
let transitionResult={accepted:true,closed:true,settled:true},transitionCalls=[];
const viewerGroup={configureViewerTopology(){},preferredViewerColumn:value=>value,reserveViewerColumns(){return 0;},releaseViewerColumns(){},async closeViewerGroupForText(origin){transitionCalls.push(origin);return transitionResult;}};
const contextModels = new Map();
function modelFor(descriptor) {
  let selection = null, selectionRevision = 0;
  const identity = `${descriptor.type}:${descriptor.key}`;
  return {
    identity,
    setSelection(next) { if (JSON.stringify(selection) !== JSON.stringify(next)) { selection = next; selectionRevision += 1; } return this.snapshot(); },
    snapshot() { return { identity, selection, selectionRevision, draftLease: null }; }
  };
}
const contextRegistry = {
  registerAuthoringPanel(panel, descriptor) {
    const identity = `${descriptor.type}:${descriptor.key}`;
    const entry = { panel, descriptor, model: contextModels.get(identity) || modelFor(descriptor) };
    contextModels.set(identity, entry.model);
    registrations.push(entry);
    return entry;
  },
  getContextModel(entry) { return entry.model; }
};

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (parent?.filename?.endsWith(`${path.sep}text_editor_toolbar.js`) && request === './viewer_navigation') return navigation;
  if (parent?.filename?.endsWith(`${path.sep}text_editor_toolbar.js`) && request === './authoring_context_registry') return contextRegistry;
  if (parent?.filename?.endsWith(`${path.sep}text_editor_toolbar.js`) && request === './viewer_group') return viewerGroup;
  return originalLoad.call(this, request, parent, isMain);
};

const toolbar = require('../src/text_editor_toolbar');
const { MESSAGE_TYPE } = require('../src/universal_toolbar_webview');

function document(fileName, languageId = 'zss', text = '[State 200]') {
  let contents = text;
  const value = {
    fileName,
    languageId,
    version: 1,
    isClosed: false,
    uri: { scheme: 'file', fsPath: fileName, toString() { return `file:///${fileName.replace(/\\/g, '/')}`; } },
    getText() { return contents; },
    setText(next) { contents = next; value.version += 1; },
    saveCalls: 0,
    async save() { value.saveCalls += 1; return true; }
  };
  return value;
}

function panel() {
  const messages = [], disposals = [], viewStates = [];
  return {
    active: true,
    visible: true,
    viewColumn: 2,
    disposed: false,
    title: '',
    webview: {
      html: '', cspSource: 'test-resource:',
      onDidReceiveMessage(listener) { messages.push(listener); return { dispose() { const index = messages.indexOf(listener); if (index >= 0) messages.splice(index, 1); } }; },
      async postMessage() { return true; }
    },
    onDidDispose(listener) { disposals.push(listener); return { dispose() {} }; },
    onDidChangeViewState(listener) { viewStates.push(listener); return { dispose() { const index = viewStates.indexOf(listener); if (index >= 0) viewStates.splice(index, 1); } }; },
    reveal(column) { if(Number.isInteger(column)&&column>0)this.viewColumn=column;this.active=true; },
    dispose() { if (this.disposed) return; this.disposed = true; for (const listener of [...disposals]) listener(); },
    async emit(message) { for (const listener of [...messages]) await listener(message); },
    async activate(active = true) { this.active = active; for (const listener of [...viewStates]) await listener({ webviewPanel: this }); },
    listenerCounts() { return { messages: messages.length, disposals: disposals.length, viewStates: viewStates.length }; }
  };
}

function harness(initialDocument, settings = {}) {
  const commands = new Map(), serializers = new Map(), executed = [], panels = [], shown = [], shownOptions = [], information = [], updates = [], knownDocuments = new Map(), diagnostics = new Map(),quickPickLabels=[],inputBoxValues=[];
  if(initialDocument)knownDocuments.set(path.resolve(initialDocument.fileName).toLowerCase(),initialDocument);
  let editorListener, closeListener, configListener;
  const values = { 'textToolbar.companion.openOnEditor': false, 'textToolbar.companion.followActiveEditor': true, additionalCodeExtensions: [], ...settings };
  const vscode = {
    ViewColumn: { Beside: -2 },
    DiagnosticSeverity:{Error:0,Warning:1},
    Uri: { file(fileName) { const fsPath=path.resolve(fileName);return {scheme:'file',fsPath,toString(){return `file:///${fsPath.replace(/\\/g,'/')}`;}}; } },
    commands: {
      registerCommand(id, listener) { commands.set(id, listener); return { dispose() { commands.delete(id); } }; },
      async executeCommand(id, ...args) { executed.push({ id, args });if(id==='vscode.getEditorLayout'&&values.__editorLayout)return values.__editorLayout;if(id==='vscode.setEditorLayout'&&values.__editorLayout)values.__editorLayout=args[0]; }
    },
    window: {
      activeTextEditor: initialDocument ? { document: initialDocument, viewColumn: 1 } : null,
      onDidChangeActiveTextEditor(listener) { editorListener = listener; return { dispose() {} }; },
      registerWebviewPanelSerializer(type,value){serializers.set(type,value);return{dispose(){serializers.delete(type);}};},
      createWebviewPanel() { const created = panel(); panels.push(created); return created; },
      async showTextDocument(doc,options) { shown.push(doc);shownOptions.push(options);return {document:doc,viewColumn:options?.viewColumn}; },
      async showQuickPick(items) { const wanted=quickPickLabels.shift();return wanted===undefined?undefined:items.find(item=>item.label===wanted); },
      async showInputBox() { return inputBoxValues.shift(); },
      async showInformationMessage(message) { information.push(message); }
    },
    workspace: {
      textDocuments:[...knownDocuments.values()],
      getConfiguration() { return { get(key, fallback) { return key in values ? values[key] : fallback; },async update(){} }; },
      async openTextDocument(uri){const found=knownDocuments.get(path.resolve(uri.fsPath).toLowerCase());if(!found)throw new Error('missing test document');return found;},
      onDidCloseTextDocument(listener) { closeListener = listener; return { dispose() {} }; },
      onDidChangeConfiguration(listener) { configListener = listener; return { dispose() {} }; }
    },
    languages:{getDiagnostics(uri){return diagnostics.get(String(uri))||[];},onDidChangeDiagnostics(){return{dispose(){}};}}
  };
  const globalValues=new Map();
  const workspaceValues=new Map();
  const context = { subscriptions: [], globalState: { get(key,fallback) { return globalValues.has(key)?globalValues.get(key):fallback; }, async update(key, value) { globalValues.set(key,value);updates.push({ key, value }); } },workspaceState:{get(key,fallback){return workspaceValues.has(key)?workspaceValues.get(key):fallback;},async update(key,value){workspaceValues.set(key,value);}} };
  return {
    vscode, context, commands, serializers, executed, panels, shown, shownOptions, information, updates, values,quickPickLabels,inputBoxValues,workspaceValues,
    addDocument(doc){knownDocuments.set(path.resolve(doc.fileName).toLowerCase(),doc);vscode.workspace.textDocuments=[...knownDocuments.values()];},
    setDiagnostics(doc,values){diagnostics.set(String(doc.uri),values);},
    async change(doc) { vscode.window.activeTextEditor = doc ? { document: doc, viewColumn: 1 } : null; await editorListener(vscode.window.activeTextEditor); },
    close(doc) { closeListener(doc); },
    configure() { return configListener({ affectsConfiguration: () => true }); }
  };
}

(async () => {
  try {
    const first = document('C:/chars/Ryu/normal.zss');
    const app = harness(first);
    const api = toolbar.register(app.vscode, app.context);
    await api.ready;
    assert.strictEqual(app.panels.length, 0, 'the optional companion stays closed by default');

    const created = await app.commands.get('ikemen.textToolbar.toggleCompanion')();
    assert.strictEqual(app.panels.length, 1);
    assert(created.webview.html.includes('data-toolbar-icon-action'), 'the text companion renders the compact shared icon toolbar');
    assert(created.webview.html.includes('ikemenPrepareClose') && created.webview.html.includes('ikemenCloseState'), 'Code Navigation participates in verified character-close checks');
    assert.strictEqual(api.bound().document, first);
    assert.strictEqual(api.bound().descriptor.type, 'character');

    for(const refusal of [
      {label:'busy draft rejection',result:{accepted:false,closed:false,settled:true}},
      {label:'unresolved exact visual group',result:{accepted:false,closed:false,settled:true}}
    ]){
      const guardedDocument=document(`C:/chars/Ryu/${refusal.label.replace(/\W+/g,'_')}.zss`),guarded=harness(guardedDocument),guardedApi=toolbar.register(guarded.vscode,guarded.context);await guardedApi.ready;
      const origin={disposed:false},before={executed:guarded.executed.length,shown:guarded.shown.length,panels:guarded.panels.length};transitionResult=refusal.result;
      const refused=await guarded.commands.get('ikemen.textToolbar.resumeFromVisualViewer')({files:[guardedDocument.fileName],transitionPanel:origin});
      assert.deepStrictEqual(refused,{attached:false,aborted:true,originClosed:false},`${refusal.label} returns a truthy aborted transition so navigation cannot fall back into another layout`);
      assert.deepStrictEqual({executed:guarded.executed.length,shown:guarded.shown.length,panels:guarded.panels.length},before,`${refusal.label} does not set editor layout, open source, or attach a header`);
      assert.strictEqual(origin.disposed,false,`${refusal.label} keeps the originating viewer available`);
    }
    transitionResult={accepted:true,closed:true,settled:true};

    await created.emit({ type: MESSAGE_TYPE, slotId: 'save' });
    assert.strictEqual(first.saveCalls, 1, 'Save always belongs to the bound native document');
    await created.emit({ type: MESSAGE_TYPE, slotId: 'sprites' });
    assert.deepStrictEqual(navigationCalls.at(-1), { seed: 'C:/chars/Ryu/normal.zss', target: 'sff' });

    const beforeForged = app.executed.length;
    await created.emit({ type: MESSAGE_TYPE, slotId: 'help', forged: true });
    await created.emit({ type: 'run', id: 'command.not.registered' });
    await created.emit({ type: 'run', id: 'command.ikemen.launchGame', forged: true });
    assert.strictEqual(app.executed.length, beforeForged, 'forged toolbar and body messages fail closed');
    await created.emit({ type: MESSAGE_TYPE, slotId: 'help' });
    assert(app.executed.some(call => call.id === 'ikemen.help.open'));
    await created.emit({ type: MESSAGE_TYPE, slotId: 'viewer-browser' });
    assert.strictEqual(app.executed.at(-1).id, 'ikemen.authoringBrowser.open', 'code text routes Viewer Browser to Coding Assistance');

    api.bound().contextModel.setSelection({ surfaceId: 'another.viewer', uri: 'file:///elsewhere' });
    await created.emit({ type: MESSAGE_TYPE, slotId: 'text-source' });
    assert.strictEqual(app.shown.length, 0, 'stale shared selection cannot focus the native source');
    assert(app.information.some(message => message.includes('selection changed')));
    await created.activate(true);
    await created.emit({ type: MESSAGE_TYPE, slotId: 'text-source' });
    assert.strictEqual(app.shown.at(-1), first, 'activation reclaims the exact bound source before opening it');

    app.values['textToolbar.companion.followActiveEditor'] = false;
    const second = document('C:/chars/Ryu/special.zss');
    await app.change(second);
    assert.strictEqual(api.active().document, second);
    assert.strictEqual(api.bound().document, first, 'follow-off keeps active and bound documents separate');
    await created.emit({ type: MESSAGE_TYPE, slotId: 'save' });
    assert.strictEqual(first.saveCalls, 2);
    assert.strictEqual(second.saveCalls, 0);

    app.values['textToolbar.companion.followActiveEditor'] = true;
    api.bound().contextModel.setSelection({ surfaceId: 'another.viewer', uri: 'file:///shared-selection' });
    created.active = true;
    await app.change(second);
    assert.strictEqual(api.bound().document, second, 'follow-on rebinds to the current supported document');
    assert.strictEqual(api.bound().descriptor.type, 'character');
    assert.strictEqual(api.bound().contextModel.snapshot().selection.surfaceId, 'another.viewer', 'ordinary follow does not steal selection even when the panel active flag is briefly stale');
    await created.activate(true);
    assert.strictEqual(api.bound().contextModel.snapshot().selection.surfaceId, 'companion.text-toolbar', 'an explicit active view-state event reclaims selection');

    const airText = document('C:/chars/Ryu/Sf6Ryu.air', 'ikemen-air', '[Begin Action 0]\n0,0,0,0,1');
    await app.change(airText);
    await created.emit({ type: MESSAGE_TYPE, slotId: 'viewer-browser' });
    assert.strictEqual(app.executed.at(-1).id, 'air.browseLists', 'an AIR text header opens or focuses the AIR browser rather than toggling it closed or opening Coding Assistance');

    const unsupported = document('C:/notes/readme.md', 'markdown', '# notes');
    await app.change(unsupported);
    assert.strictEqual(api.bound().document, unsupported);
    assert.strictEqual(api.bound().classification.supported, false);
    assert.strictEqual(api.bound().descriptor.neutral, true, 'unsupported transitions drop the previous character context');
    const commandsBeforeDisabled = app.executed.length;
    await created.emit({ type: MESSAGE_TYPE, slotId: 'run' });
    assert.strictEqual(app.executed.length, commandsBeforeDisabled, 'disabled actions are recomputed at dispatch');

    const stage = document('C:/stages/grid.def', 'ikemen-def', '[BGDef]');
    created.active = false;
    await app.change(stage);
    assert.strictEqual(api.bound().descriptor.type, 'stage');
    assert.strictEqual(api.bound().descriptor.key, path.resolve(stage.fileName));
    assert.strictEqual(api.bound().contextModel.snapshot().selection, null, 'background rebind does not steal shared selection');
    await created.activate(true);
    assert.strictEqual(api.bound().contextModel.snapshot().selection.surfaceId, 'companion.text-toolbar');
    await created.emit({ type: MESSAGE_TYPE, slotId: 'stage' });
    const stageOpen = app.executed.filter(call => call.id === 'ikemen.stage.openWorkspace').at(-1);
    assert.strictEqual(stageOpen.args[0], stage.uri, 'an actual stage DEF supplies its exact bound URI');
    await created.emit({ type: MESSAGE_TYPE, slotId: 'palettes' });
    let paletteOpen = app.executed.filter(call => call.id === 'ikemen.palette.openWorkspace').at(-1);
    assert.strictEqual(paletteOpen.args[0], stage.uri, 'Stage palette access receives the exact bound DEF URI');

    const screenpack = document('C:/data/system.def', 'ikemen-def', '[Files]\nspr = system.sff');
    await app.change(screenpack);
    assert.strictEqual(api.bound().descriptor.type, 'screenpack');
    await created.emit({ type: MESSAGE_TYPE, slotId: 'palettes' });
    paletteOpen = app.executed.filter(call => call.id === 'ikemen.palette.openWorkspace').at(-1);
    assert.strictEqual(paletteOpen.args[0], screenpack.uri, 'Screenpack palette access receives the exact bound DEF URI');

    const counts = created.listenerCounts();
    app.close(screenpack);
    assert.strictEqual(created.disposed, true, 'closing the bound document closes the companion');
    assert(counts.viewStates > created.listenerCounts().viewStates, 'the companion activation listener is cleaned up');

    const optedDocument = document('C:/chars/Ryu/normal.zss');
    const opted = harness(optedDocument, { 'textToolbar.companion.openOnEditor': true });
    const optedApi = toolbar.register(opted.vscode, opted.context);
    await optedApi.ready;
    assert.strictEqual(opted.panels.length, 0, 'text headers open only through an explicit character/text workflow');
    assert.strictEqual(optedApi.active().document, optedDocument);

    const workspaceFirst=document('C:/chars/Ryu/Ryu.def','ikemen-def','[Files]\nst=normal.zss'),workspaceSecond=document('C:/chars/Ryu/normal.zss');
    workspaceFirst.isDirty=true;const nativeWorkspace=harness(workspaceFirst);nativeWorkspace.addDocument(workspaceSecond);nativeWorkspace.setDiagnostics(workspaceFirst,[{severity:1}]);
    const nativeApi=toolbar.register(nativeWorkspace.vscode,nativeWorkspace.context);await nativeApi.ready;
    let companion=await nativeWorkspace.commands.get('ikemen.textToolbar.openCompanion')({files:[workspaceFirst.fileName,workspaceSecond.fileName],viewColumn:1,context:{type:'character',key:'C:/chars/Ryu',root:'C:/chars/Ryu'}});
    assert(companion.webview.html.includes('tab-scroll-slider')&&companion.webview.html.includes('Ryu.def')&&companion.webview.html.includes('normal.zss'),'native workspace companion renders connected tabs and a viewport slider');
    assert(companion.webview.html.includes('Unsaved · 1 Warning'),'navigation status is derived from the admitted native document and VS Code diagnostics');
    assert(!companion.webview.html.includes('data-mode="cards"')&&!companion.webview.html.includes('data-mode="list"')&&!companion.webview.html.includes('Organize Cards'),'the persistent header exposes only the compact single-row text tabs');
    assert(/<body><div class="launch-controls">[\s\S]*?data-ikemaker-entity-strip[\s\S]*?<span class="viewer-dropdown-toolbar"[\s\S]*?<div class="viewer-icon-toolbar"/.test(companion.webview.html),'the shared entity strip and viewer menu stay above the invariant icon row');
    assert.strictEqual((companion.webview.html.match(/data-scroll-tabs="-1"/g)||[]).length,2,'the slider has a left-scroll arrow on each side');
    assert.strictEqual((companion.webview.html.match(/data-scroll-tabs="1"/g)||[]).length,2,'the slider has a right-scroll arrow on each side');
    companion.dispose();companion=await nativeWorkspace.commands.get('ikemen.textToolbar.openCompanion')({files:[workspaceFirst.fileName,workspaceSecond.fileName],viewColumn:1,context:{type:'character',key:'C:/chars/Ryu',root:'C:/chars/Ryu'}});
    assert(companion.webview.html.includes('role="tab"')&&companion.webview.html.includes('normal.zss'),'reopening Code Navigation restores the connected native text tabs');
    const restoreState=toolbar.serializedCompanionState({files:[workspaceFirst.fileName,workspaceSecond.fileName],selectedFile:workspaceFirst.fileName,mode:'cards',nativeColumn:2,context:{type:'character',key:'C:/chars/Ryu',label:'Ryu',root:'C:/chars/Ryu',identity:''}}),restored=panel();
    companion.dispose();await nativeWorkspace.serializers.get('ikemenTextCompanion').deserializeWebviewPanel(restored,{restore:restoreState});companion=restored;
    assert.strictEqual(restored.disposed,false,'a validated Code Navigation workspace restores into the supplied VS Code panel instead of creating a duplicate');
    assert.strictEqual(restored.viewColumn,1,'restoration moves a webview recovered in the large lower group back into the compact header group');
    assert.strictEqual(nativeWorkspace.shownOptions.at(-1).viewColumn,2,'restoration forces native text into the large work group instead of trusting stale source placement');
    assert(restored.webview.html.includes('tab-scroll-slider')&&restored.webview.html.includes('role="tab"'),'restoration recovers the admitted file set and synchronized single-row navigation');
    const rejected=panel();await nativeWorkspace.serializers.get('ikemenTextCompanion').deserializeWebviewPanel(rejected,{restore:{...restoreState,forged:true}});
    assert.strictEqual(rejected.disposed,true,'malformed restoration state is disposed without creating an orphan browser');
    await nativeWorkspace.change(workspaceSecond);
    assert.strictEqual(nativeApi.connected().index,1,'changing the genuine native editor tab synchronizes the browser selection');
    assert.strictEqual(nativeApi.bound().descriptor.key,'C:/chars/Ryu','connected tab changes retain the Character Essentials workspace owner');
    assert(companion.webview.html.includes('2 / 2 · normal.zss'),'the accessible navigation status follows native tab changes');
    const unrelated=document('C:/notes/unrelated.zss');nativeWorkspace.addDocument(unrelated);await nativeWorkspace.change(unrelated);
    assert.strictEqual(nativeApi.bound().document,workspaceSecond,'an unrelated native editor does not steal a connected character workspace');
    await nativeWorkspace.commands.get('ikemen.textToolbar.suspendForVisualViewer')();
    assert.strictEqual(companion.disposed,true,'opening a visual viewer may suspend the text-only header without losing its connected selection');
    const resumedWorkspace=await nativeWorkspace.commands.get('ikemen.textToolbar.resumeFromVisualViewer')({files:[workspaceFirst.fileName,workspaceSecond.fileName],preserveConnected:true,context:{type:'character',key:'C:/chars/Ryu',root:'C:/chars/Ryu'}});companion=resumedWorkspace.panel;
    assert.strictEqual(resumedWorkspace.attached,true,'visual-to-text restoration returns a structured attachment acknowledgement');
    assert.strictEqual(resumedWorkspace.selectedFile,path.resolve(workspaceSecond.fileName),'the attachment acknowledgement names the exact selected source');
    assert.strictEqual(nativeWorkspace.shown.at(-1),workspaceSecond,'returning from a visual viewer restores the previously selected text source directly');
    assert.strictEqual(nativeWorkspace.shownOptions.at(-1).viewColumn,2,'the restored native text tab returns beside its compact header');
    assert(companion.webview.html.includes('2 / 2 · normal.zss'),'the restored header retains the selected source instead of showing a source picker');
    const sharedRouted=document('C:/chars/template/SF6template/sf6_hit_regions.zss');nativeWorkspace.addDocument(sharedRouted);
    await nativeWorkspace.commands.get('ikemen.textToolbar.suspendForVisualViewer')();
    const resumedShared=await nativeWorkspace.commands.get('ikemen.textToolbar.resumeFromVisualViewer')({files:[sharedRouted.fileName],selectedFile:sharedRouted.fileName,preserveConnected:true,context:{type:'character',key:'C:/chars/Ryu',root:'C:/chars/Ryu',ownerDef:workspaceFirst.fileName}});companion=resumedShared.panel;
    assert.strictEqual(nativeWorkspace.shown.at(-1),sharedRouted,'an AIR-routed source becomes the exact selected native tab');
    assert(companion.webview.html.includes('Ryu.def')&&companion.webview.html.includes('normal.zss')&&companion.webview.html.includes('sf6_hit_regions.zss'),'an AIR source augments rather than destroys the retained Character Essentials tab set');
    assert(companion.webview.html.includes('3 / 3 · sf6_hit_regions.zss'),'the routed source is selected in the augmented connected header');
    assert(companion.webview.html.includes('Shared')||companion.webview.html.includes('Template'),'a routed shared/template file remains classified relative to the owning Ryu character');
    assert.strictEqual(nativeApi.bound().descriptor.root,path.resolve('C:/chars/Ryu'),'the routed shared source does not replace the character owner context');
    const shownBeforeScroll=nativeWorkspace.shown.length;await companion.emit({type:'move-connected',delta:1});
    assert.strictEqual(nativeWorkspace.shown.length,shownBeforeScroll,'tab-strip scrolling cannot open or change a native text document');
    await companion.emit({type:'select-connected',index:0});
    assert.strictEqual(nativeWorkspace.shown.at(-1),workspaceFirst,'connected arrows activate the exact native document from the synchronized index');
    assert.strictEqual(nativeWorkspace.shownOptions.at(-1).viewColumn,2,'connected navigation preserves the canonical native work group instead of replacing the companion');
    workspaceFirst.isClosed=true;nativeWorkspace.close(workspaceFirst);
    assert.strictEqual(companion.disposed,false,'closing one connected native tab keeps the navigation browser alive');
    assert.strictEqual(nativeApi.bound().document,workspaceSecond,'closing the bound connected tab safely rebinds to another admitted source');
    companion.dispose();

    const noFollowOwner=document('C:/chars/Ryu/Ryu.def','ikemen-def','[Files]\nst=normal.zss'),noFollowShared=document('C:/chars/template/SF6template/shared.zss'),noFollow=harness(noFollowOwner,{'textToolbar.companion.followActiveEditor':false});noFollow.addDocument(noFollowShared);
    const noFollowApi=toolbar.register(noFollow.vscode,noFollow.context);await noFollowApi.ready;
    let noFollowPanel=await noFollow.commands.get('ikemen.textToolbar.openCompanion')({files:[noFollowOwner.fileName],context:{type:'character',key:'C:/chars/Ryu',root:'C:/chars/Ryu'}});
    const resumedNoFollow=await noFollow.commands.get('ikemen.textToolbar.resumeFromVisualViewer')({files:[noFollowShared.fileName],selectedFile:noFollowShared.fileName,preserveConnected:true,context:{type:'character',key:'C:/chars/Ryu',root:'C:/chars/Ryu',ownerDef:noFollowOwner.fileName}});noFollowPanel=resumedNoFollow.panel;
    assert.strictEqual(noFollowApi.bound().document,noFollowShared,'an explicit AIR source route force-binds the exact header even when ordinary follow-active-editor is disabled');
    assert.strictEqual(noFollowApi.connected().files.length,2,'the one-time forced route does not discard same-owner retained tabs');
    noFollowPanel.dispose();

    const kenSource=document('C:/chars/Ken/Ken.def','ikemen-def','[Files]'),ryuRoute=document('C:/chars/Ryu/Ryu.air','ikemen-air','[Begin Action 0]'),crossOwner=harness(kenSource);crossOwner.addDocument(ryuRoute);
    const crossOwnerApi=toolbar.register(crossOwner.vscode,crossOwner.context);await crossOwnerApi.ready;
    let crossOwnerPanel=await crossOwner.commands.get('ikemen.textToolbar.openCompanion')({files:[kenSource.fileName],context:{type:'character',key:'C:/chars/Ken',root:'C:/chars/Ken',ownerDef:kenSource.fileName}});
    const resumedCrossOwner=await crossOwner.commands.get('ikemen.textToolbar.resumeFromVisualViewer')({files:[ryuRoute.fileName],selectedFile:ryuRoute.fileName,preserveConnected:true,context:{type:'character',key:'C:/chars/Ryu',root:'C:/chars/Ryu'}});crossOwnerPanel=resumedCrossOwner.panel;
    assert.deepStrictEqual(crossOwnerApi.connected().files.map(file=>file.filename),[path.resolve(ryuRoute.fileName)],'a Ryu AIR route cannot retain and relabel Ken character tabs');
    assert.strictEqual(crossOwnerApi.bound().document,ryuRoute,'the owner reset still binds the exact Ryu routed source');
    crossOwnerPanel.dispose();

    const saturated=Array.from({length:toolbar.MAX_CONNECTED_FILES},(_,index)=>`C:/chars/Ryu/file-${index}.zss`),routedAtCap='C:/chars/Ryu/routed.zss',bounded=toolbar.mergeConnectedFilePaths(saturated,[routedAtCap],routedAtCap,true);
    assert.strictEqual(bounded.length,toolbar.MAX_CONNECTED_FILES,'routed-source admission remains bounded at the connected-tab cap');
    assert(bounded.some(filename=>filename.toLowerCase()===path.resolve(routedAtCap).toLowerCase()),'the exact routed source is guaranteed a slot at saturation');
    assert(!bounded.some(filename=>filename.toLowerCase()===path.resolve(saturated.at(-1)).toLowerCase()),'one retained tab yields deterministically when the routed source needs the reserved slot');
    assert.strictEqual(toolbar.connectedOwnerIdentity(null),'','first opening has no prior text owner');
    assert.strictEqual(toolbar.sameConnectedOwner(null,{type:'character',root:'C:/chars/Ryu'}),false);
    assert.strictEqual(toolbar.sameConnectedOwner({type:'character',root:'C:/chars/Ken'},{type:'character',root:'C:/chars/Ryu'}),false,'different character owners cannot share retained tabs');
    assert.strictEqual(toolbar.sameConnectedOwner({type:'character',root:'C:/chars/Ryu',ownerDef:'C:/chars/Ryu/normal.def'},{type:'character',root:'C:/chars/Ryu',ownerDef:'C:/chars/Ryu/alternate.def'}),false,'same-folder DEF variants remain different exact text owners');
    assert.strictEqual(toolbar.sameConnectedOwner({type:'character',identity:'character\0project-a\0c:/chars/ryu/normal.def'},{type:'character',identity:'character\0project-b\0c:/chars/ryu/normal.def'}),false,'project-qualified identities cannot be collapsed by the text companion');
    const resetForOwner=toolbar.mergeConnectedFilePaths(['C:/chars/Ken/Ken.def'],['C:/chars/Ryu/Ryu.air'],'C:/chars/Ryu/Ryu.air',false);
    assert.deepStrictEqual(resetForOwner,[path.resolve('C:/chars/Ryu/Ryu.air')],'an owner change resets rather than relabels foreign retained files');

    assert(registrations.some(entry => entry.descriptor.type === 'character'));
    assert(registrations.some(entry => entry.descriptor.type === 'stage'));
    assert.strictEqual(toolbar.validBodyMessage({type:'focus-air-browser'}),true,'the exact AIR-browser return action is admitted by the strict text-header dispatcher');
    assert.strictEqual(toolbar.validBodyMessage({type:'reopen-air-browser'}),true,'the sealed AIR-browser reopen action is admitted by the strict text-header dispatcher');
    assert.strictEqual(toolbar.validBodyMessage({type:'close-air-source'}),true,'the routed AIR-source close action is admitted by the strict text-header dispatcher');
    assert.strictEqual(toolbar.validBodyMessage({type:'air-return-rendered',token:'a'.repeat(48)}),true,'the exact opaque AIR return render acknowledgement is admitted');
    assert.strictEqual(toolbar.validBodyMessage({type:'air-return-rendered',token:'a'.repeat(47)}),false,'a malformed AIR return acknowledgement is rejected');
    assert.strictEqual(toolbar.validBodyMessage({type:'air-return-rendered',token:'a'.repeat(48),filename:'forged'}),false,'an AIR return acknowledgement cannot supply client-authored source identity');
    const adoptionPanel={},adoptionRequest={filename:path.resolve('C:/chars/Ryu/common.zss').toLowerCase(),origin:path.resolve('C:/chars/Ryu/Ryu.air').toLowerCase(),panel:adoptionPanel};
    assert.strictEqual(toolbar.exactAirReturnRenderAdoption(adoptionRequest,true,'C:/chars/Ryu/common.zss',adoptionPanel,{available:true,origin:path.resolve('C:/chars/Ryu/Ryu.air')}),true,'a visible acknowledgement adopts only its exact live AIR origin');
    assert.strictEqual(toolbar.exactAirReturnRenderAdoption(adoptionRequest,true,'C:/chars/Ryu/common.zss',adoptionPanel,{available:true,origin:path.resolve('C:/chars/Ken/Ken.air')}),false,'rebinding a shared source after acknowledgement invalidates the earlier AIR-origin adoption');
    assert.strictEqual(toolbar.exactAirReturnRenderAdoption(adoptionRequest,true,'C:/chars/Ryu/common.zss',{}, {available:true,origin:path.resolve('C:/chars/Ryu/Ryu.air')}),false,'a replacement companion panel cannot adopt an older render acknowledgement');
    const routed='C:/chars/Ryu/common.zss',unrelatedSource='C:/chars/Ryu/other.zss';
    assert.strictEqual(toolbar.airBrowserControlsAvailable(routed,'zss',filename=>filename===routed?{exact:true}:null),true,'an exact routed ZSS receives AIR escape controls');
    assert.strictEqual(toolbar.airBrowserControlsAvailable(unrelatedSource,'zss',()=>null),false,'an unrelated same-character ZSS cannot inherit AIR escape controls');
    const directAirState=toolbar.airBrowserControlState('C:/chars/Ryu/Ryu.air','air',()=>null,()=>true);
    assert.deepStrictEqual(directAirState,{returnAvailable:true,closeAvailable:false,reopenAvailable:false},'a direct AIR session supports return but cannot claim routed-source close semantics');
    const directAirHtml=toolbar.companionHtml({kind:'air'},[],[],undefined,{files:[{filename:'C:/chars/Ryu/Ryu.air',label:'Ryu.air',kind:'air'}],index:0,airBrowserControls:directAirState});
    assert(directAirHtml.includes('Opened from AIR Actions Browser')&&directAirHtml.includes('← Return to AIR Browser')&&!directAirHtml.includes('class="air-browser-return" data-close-air-source'),'a direct AIR session shows the persistent Return banner only');
    const routedAirState=toolbar.airBrowserControlState('C:/chars/Ryu/Ryu.air','air',()=>({exact:true}),()=>true);
    const renderToken='b'.repeat(48),airReturnHtml=toolbar.companionHtml({kind:'air'},[],[],undefined,{files:[{filename:'C:/chars/Ryu/Ryu.air',label:'Ryu.air',kind:'air'}],index:0,airBrowserControls:routedAirState,airReturnRenderToken:renderToken});
    assert(airReturnHtml.includes('role="navigation" aria-label="AIR source return"')&&airReturnHtml.includes('data-focus-air-browser')&&airReturnHtml.includes('data-close-air-source')&&airReturnHtml.includes('Close Source &amp; Return'),'a routed AIR source exposes a dedicated visible return banner and close action');
    assert(airReturnHtml.includes(renderToken)&&airReturnHtml.includes("type:'air-return-rendered'")&&airReturnHtml.indexOf("addEventListener('click'")<airReturnHtml.indexOf("type:'air-return-rendered'"),'the host nonce is acknowledged only after the visible Return control listener is installed');
    const routedZssState=toolbar.airBrowserControlState(routed,'zss',()=>({exact:true}),()=>false);
    const routedZssHtml=toolbar.companionHtml({kind:'zss'},[],[],undefined,{files:[{filename:routed,label:'common.zss',kind:'zss'}],index:0,airBrowserControls:routedZssState});
    assert(routedZssHtml.includes('data-focus-air-browser')&&routedZssHtml.includes('data-close-air-source'),'a routed ZSS/CNS source exposes Return and Close');
    const closedOriginState=toolbar.airBrowserControlState(routed,'zss',()=>({available:false,origin:path.resolve('C:/chars/Ryu/Ryu.air')}),()=>false),closedOriginHtml=toolbar.companionHtml({kind:'zss'},[],[],undefined,{files:[{filename:routed,label:'common.zss',kind:'zss'}],index:0,airBrowserControls:closedOriginState});
    assert.deepStrictEqual(closedOriginState,{returnAvailable:false,closeAvailable:false,reopenAvailable:true},'a closed exact origin retains only its sealed reopen capability');
    assert(closedOriginHtml.includes('AIR Actions Browser closed')&&closedOriginHtml.includes('data-reopen-air-browser')&&closedOriginHtml.includes('↻ Reopen AIR Actions Browser')&&!closedOriginHtml.includes('class="air-browser-return" data-close-air-source'),'a disposed exact origin remains visibly recoverable without claiming close-and-return authority');
    assert(airReturnHtml.includes('@media(max-width:520px)')&&airReturnHtml.includes('.air-origin-actions{align-items:stretch;flex-direction:column}')&&airReturnHtml.includes('overflow-x:hidden'),'the AIR return banner stacks vertically in a narrow dock without horizontal scrolling');
    const noAirReturnHtml=toolbar.companionHtml({kind:'zss'},[],[],undefined,{files:[{filename:unrelatedSource,label:'other.zss',kind:'zss'}],index:0,airBrowserControls:{returnAvailable:false,closeAvailable:false}});
    assert(!noAirReturnHtml.includes('<button type="button" data-focus-air-browser'),'the return action is absent without a live matching browser');
    assert(!noAirReturnHtml.includes('<button type="button" class="air-browser-return" data-close-air-source'),'the close-and-return button is absent without a live matching browser');
    const retargetRoot=fs.mkdtempSync(path.join(os.tmpdir(),'text-navigation-retarget-'));
    try{
      const firstOwnerPath=path.join(retargetRoot,'first.def'),secondOwnerPath=path.join(retargetRoot,'second.def'),stageOwnerPath=path.join(retargetRoot,'stage.def'),screenpackOwnerPath=path.join(retargetRoot,'system.def'),firstSourcePath=path.join(retargetRoot,'first.zss'),secondSourcePath=path.join(retargetRoot,'second.zss');
      fs.writeFileSync(firstOwnerPath,'[Files]\ncns = first.zss\n');fs.writeFileSync(secondOwnerPath,'[Files]\ncns = second.zss\n');fs.writeFileSync(stageOwnerPath,'[BGDef]\n');fs.writeFileSync(screenpackOwnerPath,'[Files]\nspr = system.sff\n');fs.writeFileSync(firstSourcePath,'[StateDef 100]\n');fs.writeFileSync(secondSourcePath,'[StateDef 200]\n');
      const firstOwnerDocument=document(firstOwnerPath,'ikemen-def',fs.readFileSync(firstOwnerPath,'utf8')),secondOwnerDocument=document(secondOwnerPath,'ikemen-def',fs.readFileSync(secondOwnerPath,'utf8')),stageOwnerDocument=document(stageOwnerPath,'ikemen-def',fs.readFileSync(stageOwnerPath,'utf8')),screenpackOwnerDocument=document(screenpackOwnerPath,'ikemen-def',fs.readFileSync(screenpackOwnerPath,'utf8')),firstSourceDocument=document(firstSourcePath,'zss','[StateDef 100]\n; retained dirty first'),secondSourceDocument=document(secondSourcePath,'zss','[StateDef 200]\n; retained dirty second');
      firstSourceDocument.isDirty=true;secondSourceDocument.isDirty=true;
      const retargetHarness=harness(firstSourceDocument);for(const item of[firstOwnerDocument,secondOwnerDocument,stageOwnerDocument,screenpackOwnerDocument,secondSourceDocument])retargetHarness.addDocument(item);
      const initialEditor={document:firstSourceDocument,viewColumn:1,selection:{anchor:{line:3,character:2},active:{line:3,character:5}},visibleRanges:[{start:{line:2,character:0}}],revealRange(){}};retargetHarness.vscode.window.activeTextEditor=initialEditor;retargetHarness.vscode.window.visibleTextEditors=[initialEditor];const ordinaryShow=retargetHarness.vscode.window.showTextDocument;let lastRetargetEditor;
      retargetHarness.vscode.window.showTextDocument=async(doc,options)=>{await ordinaryShow(doc,options);lastRetargetEditor={document:doc,viewColumn:options.viewColumn,selection:{anchor:{line:0,character:0},active:{line:0,character:0}},visibleRanges:[],revealRange(range){this.revealed=range;}};retargetHarness.vscode.window.activeTextEditor=lastRetargetEditor;retargetHarness.vscode.window.visibleTextEditors=[lastRetargetEditor];return lastRetargetEditor;};
      const registration=toolbar.register(retargetHarness.vscode,retargetHarness.context);await registration.ready;
      let navigationPanel=await retargetHarness.commands.get('ikemen.textToolbar.openCompanion')({files:[firstSourcePath,firstOwnerPath],selectedFile:firstSourcePath,context:{type:'character',identity:'first',key:firstOwnerPath,ownerDef:firstOwnerPath,root:retargetRoot,label:'First'}});
      navigationPanel.viewColumn=1;
      retargetHarness.values.__editorLayout={orientation:1,groups:[{size:.28},{size:.72}]};await navigationPanel.emit({type:'dropdown-layout',open:true,contentHeight:620,viewportHeight:190});assert(retargetHarness.values.__editorLayout.groups[0].size>.6,'opening a text-header dropdown temporarily expands the header group instead of clipping the shared viewer menu');await navigationPanel.emit({type:'dropdown-layout',open:false,contentHeight:0,viewportHeight:620});assert.strictEqual(retargetHarness.values.__editorLayout.groups[0].size,.28,'closing the dropdown restores the exact prior header ratio');
      const nestedLayout={orientation:0,label:'root',groups:[{size:.3,label:'side-viewer'},{size:.7,label:'text-stack',groups:[{size:.24,label:'header'},{size:.76,label:'source'}]}]},nestedSnapshot=JSON.parse(JSON.stringify(nestedLayout));navigationPanel.viewColumn=2;retargetHarness.values.__editorLayout=nestedLayout;await navigationPanel.emit({type:'dropdown-layout',open:true,contentHeight:620,viewportHeight:190});assert(retargetHarness.values.__editorLayout.groups[1].groups[0].size>.6,'opening a dropdown finds and expands a header that is not the first leaf in a nested editor topology');assert.strictEqual(retargetHarness.values.__editorLayout.groups[0].label,'side-viewer','dropdown expansion preserves unrelated editor groups');await navigationPanel.emit({type:'dropdown-layout',open:false,contentHeight:0,viewportHeight:620});assert.deepStrictEqual(retargetHarness.values.__editorLayout,nestedSnapshot,'closing a dropdown restores the exact full nested editor layout');navigationPanel.viewColumn=1;
      retargetHarness.values.__editorLayout={orientation:1,groups:[{size:.28},{size:.72}]};await navigationPanel.emit({type:'dropdown-layout',open:true,contentHeight:620,viewportHeight:190});await navigationPanel.emit({type:'hide-connected',identity:path.resolve(firstOwnerPath).toLowerCase(),hidden:true,generation:0});await new Promise(resolve=>setImmediate(resolve));assert.strictEqual(retargetHarness.values.__editorLayout.groups[0].size,.28,'a rerender while a dropdown is open restores the prior header ratio');await navigationPanel.emit({type:'hide-connected',identity:path.resolve(firstOwnerPath).toLowerCase(),hidden:false,generation:0});
      await navigationPanel.emit({type:'dropdown-layout',open:true,contentHeight:620,viewportHeight:190});retargetHarness.values.__editorLayout={orientation:0,groups:[{size:.5},{size:.5}]};await navigationPanel.emit({type:'dropdown-layout',open:false,contentHeight:0,viewportHeight:620});retargetHarness.values.__editorLayout={orientation:1,groups:[{size:.4},{size:.6}]};await navigationPanel.emit({type:'dropdown-layout',open:true,contentHeight:620,viewportHeight:300});await navigationPanel.emit({type:'dropdown-layout',open:false,contentHeight:0,viewportHeight:620});assert.strictEqual(retargetHarness.values.__editorLayout.groups[0].size,.4,'a topology change clears the stale dropdown ratio before the next valid expand-and-restore cycle');
      const adapter=toolbar.createTextNavigationRetargetAdapter(registration),descriptor=(kind,identity,ownerFile)=>({kind,identity,id:identity,projectId:'test',label:identity,ownerFile});
      const firstDescriptor=descriptor('character','first',firstOwnerPath),secondDescriptor=descriptor('character','second',secondOwnerPath),transaction={from:firstDescriptor,to:secondDescriptor,fromState:null,toState:{adapterRetainedState:{'code.navigation':{selectedFile:secondSourcePath,nativeColumn:1,nativeView:{anchor:{line:5,character:1},active:{line:5,character:4},visibleStart:{line:4,character:0}},organization:{order:[secondSourcePath.toLowerCase(),secondOwnerPath.toLowerCase()],pinned:[secondSourcePath.toLowerCase()]}}}}};
      const prepared=await adapter.prepare(transaction);assert.strictEqual(prepared.ok,true);assert.deepStrictEqual(prepared.retainedState.files,[path.resolve(firstSourcePath),path.resolve(firstOwnerPath)],'retained Code Navigation state exposes the existing connected-file order');assert.strictEqual(await adapter.validate(transaction,prepared),true);await adapter.commit(transaction,prepared);
      assert.strictEqual(retargetHarness.panels.length,1,'entity retargeting reuses the same Code Navigation companion panel');assert.strictEqual(registration.bound().document,secondSourceDocument,'the exact retained destination selection opens in the native editor group');assert.strictEqual(registration.bound().descriptor.ownerDef,path.resolve(secondOwnerPath),'same-folder DEF variants retain exact owner identity');assert.deepStrictEqual(registration.connected().files.map(item=>item.filename),[path.resolve(secondSourcePath),path.resolve(secondOwnerPath)],'the destination restores its own stable connected-file order');assert.deepStrictEqual(lastRetargetEditor.selection.active,{line:5,character:4},'the destination native cursor is restored without touching the buffer');assert.deepStrictEqual(lastRetargetEditor.revealed.start,{line:4,character:0},'the retained native scroll anchor is restored in the same editor group');assert.strictEqual(fs.readFileSync(secondSourcePath,'utf8'),'[StateDef 200]\n','the retained dirty destination buffer is never silently saved');
      const shownAfterRetarget=retargetHarness.shown.length;await navigationPanel.emit({type:'select-connected',index:1});await navigationPanel.emit({type:'select-connected',index:1,generation:0});assert.strictEqual(retargetHarness.shown.length,shownAfterRetarget,'messages from the replaced navigation page cannot open a stale file after retargeting');
      const sourceIdentity=path.resolve(secondSourcePath).toLowerCase(),ownerIdentity=path.resolve(secondOwnerPath).toLowerCase();await navigationPanel.emit({type:'pin-connected',identity:sourceIdentity,pinned:false,generation:1});await navigationPanel.emit({type:'reorder-connected',identity:ownerIdentity,beforeIdentity:sourceIdentity,generation:1});assert.deepStrictEqual(registration.connected().files.map(item=>item.filename),[path.resolve(secondOwnerPath),path.resolve(secondSourcePath)],'keyboard, drag, or context-menu organization hooks reorder the retained file tabs without opening or writing sources');assert(navigationPanel.webview.html.includes('draggable="true"')&&navigationPanel.webview.html.includes('Move Left')&&navigationPanel.webview.html.includes('Unpin')||navigationPanel.webview.html.includes("?'Unpin':'Pin'"),'Code Navigation exposes drag, keyboard, and context-menu organization controls');await navigationPanel.emit({type:'hide-connected',identity:ownerIdentity,hidden:true,generation:1});assert.strictEqual(registration.connected().files.find(item=>item.filename===path.resolve(secondOwnerPath)).hidden,true,'Hide persists on the exact connected tab without closing its source');assert(navigationPanel.webview.html.includes('hidden-tab-marker')&&navigationPanel.webview.html.includes('data-hidden-identity')&&navigationPanel.webview.html.includes('1 hidden'),'a hidden tab leaves a compact, directly clickable positional recovery marker');await navigationPanel.emit({type:'unhide-all-connected',generation:1});assert(registration.connected().files.every(item=>item.hidden===false),'Unhide All restores every connected tab while retaining its order');
      await navigationPanel.emit({type:'hide-connected',identity:ownerIdentity,hidden:true,generation:1});const persistedOrganization=require('../src/entity_file_order').decodeByEntity(retargetHarness.workspaceValues.get(toolbar.ENTITY_FILE_ORDER_KEY));assert(persistedOrganization.get('character|second')?.hidden.includes(ownerIdentity),'hidden-tab state is stored under the same exact owner identity used when Code Navigation reopens');navigationPanel.dispose();navigationPanel=await retargetHarness.commands.get('ikemen.textToolbar.openCompanion')({files:[secondOwnerPath,secondSourcePath],selectedFile:secondSourcePath,context:{type:'character',identity:'second',key:secondOwnerPath,ownerDef:secondOwnerPath,root:retargetRoot,label:'Second'}});assert.strictEqual(registration.connected().files.find(item=>item.filename===path.resolve(secondOwnerPath)).hidden,true,'reopening Code Navigation restores the hidden tab from persistent owner-scoped state');assert(navigationPanel.webview.html.includes('data-hidden-identity'),'the reopened header renders the compact recovery marker immediately');await navigationPanel.emit({type:'hide-connected',identity:ownerIdentity,hidden:false,generation:1});
      let copiedPath='';retargetHarness.vscode.env={clipboard:{async writeText(value){copiedPath=value;}}};retargetHarness.vscode.workspace.asRelativePath=uri=>path.relative(retargetRoot,uri.fsPath);await navigationPanel.emit({type:'connected-tab-action',action:'copy-relative-path',identity:ownerIdentity,generation:1});assert.strictEqual(copiedPath,path.relative(retargetRoot,secondOwnerPath),'Copy Relative Path uses the exact connected source without trusting a client-supplied filename');await navigationPanel.emit({type:'connected-tab-action',action:'copy-breadcrumbs-path',identity:ownerIdentity,generation:1});assert(copiedPath.includes('second.def')&&copiedPath.includes(' › '),'Copy Breadcrumbs Path includes the entity hierarchy and exact connected source');const executedBeforeTabAction=retargetHarness.executed.length;await navigationPanel.emit({type:'connected-tab-action',action:'split-right',identity:ownerIdentity,generation:1});assert(retargetHarness.executed.slice(executedBeforeTabAction).some(item=>item.id==='workbench.action.splitEditorRight'),'Split Right operates on the exact selected native editor rather than duplicating the IKEMaker header');
      const ownerTab={input:{uri:retargetHarness.vscode.Uri.file(secondOwnerPath)},isDirty:false},sourceTab={input:{uri:retargetHarness.vscode.Uri.file(secondSourcePath)},isDirty:true},closedTabs=[],nativeTabGroup={viewColumn:1,tabs:[ownerTab,sourceTab],activeTab:ownerTab};retargetHarness.vscode.window.tabGroups={all:[nativeTabGroup],activeTabGroup:nativeTabGroup,async close(tabs,preserveFocus){closedTabs.push({tabs:[...tabs],preserveFocus});return true;}};await navigationPanel.emit({type:'connected-tab-action',action:'close-right',identity:ownerIdentity,generation:1});assert.deepStrictEqual(closedTabs.at(-1).tabs,[sourceTab],'Close to the Right targets only native tabs to the right in the selected source group');
      navigationPanel.viewColumn=1;retargetHarness.values.__editorLayout={orientation:1,groups:[{size:.28},{size:.72}]};await navigationPanel.emit({type:'dropdown-layout',open:true,contentHeight:620,viewportHeight:190});navigationPanel.dispose();await new Promise(resolve=>setImmediate(resolve));assert.strictEqual(retargetHarness.values.__editorLayout.groups[0].size,.28,'disposing the header while a dropdown is open restores the prior editor layout');navigationPanel=await retargetHarness.commands.get('ikemen.textToolbar.openCompanion')({files:[secondOwnerPath,secondSourcePath],selectedFile:secondSourcePath,context:{type:'character',identity:'second',key:secondOwnerPath,ownerDef:secondOwnerPath,root:retargetRoot,label:'Second'}});
      await adapter.rollback(transaction,prepared);assert.strictEqual(registration.bound().document,firstSourceDocument,'rollback restores the prior exact native source');assert.deepStrictEqual(registration.connected().files.map(item=>item.filename),[path.resolve(firstSourcePath),path.resolve(firstOwnerPath)]);await adapter.rollback(transaction,prepared);assert.strictEqual(registration.bound().document,firstSourceDocument,'Code Navigation rollback is idempotent');
      for(const next of[descriptor('stage','stage',stageOwnerPath),descriptor('screenpack','screenpack',screenpackOwnerPath)]){const tx={from:firstDescriptor,to:next,fromState:null,toState:null},step=await adapter.prepare(tx);assert.strictEqual(await adapter.validate(tx,step),true);await adapter.commit(tx,step);assert.strictEqual(path.resolve(registration.bound().document.fileName),path.resolve(next.ownerFile),`${next.kind} safely reuses the native text group`);await adapter.rollback(tx,step);}
      const unavailableTx={from:firstDescriptor,to:{kind:'workspace',identity:'workspace',id:'workspace',projectId:'test',label:'Workspace'},fromState:null,toState:null},unavailable=await adapter.prepare(unavailableTx);await adapter.commit(unavailableTx,unavailable);assert(navigationPanel.webview.html.includes('no connected text files'), 'an inapplicable entity renders a truthful unavailable state');assert(!navigationPanel.webview.html.includes('first.zss'),'the unavailable companion does not expose stale connected tabs');await adapter.rollback(unavailableTx,unavailable);
      const stale=await adapter.prepare(transaction);secondSourceDocument.setText('[StateDef 201]\n; changed after prepare');assert.match((await adapter.validate(transaction,stale)).reason,/changed/i,'destination dirty-buffer drift invalidates prepared navigation without retargeting');assert.strictEqual(fs.readFileSync(firstSourcePath,'utf8'),'[StateDef 100]\n','entity switching never saves the prior dirty buffer');
    }finally{fs.rmSync(retargetRoot,{recursive:true,force:true});}
    console.log('Text companion binding, exact source, strict dispatch, transactional entity retargeting, and lifecycle tests passed');
  } finally {
    Module._load = originalLoad;
  }
})().catch(error => { Module._load = originalLoad; console.error(error); process.exitCode = 1; });
