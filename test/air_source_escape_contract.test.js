'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const originalLoad = Module._load;
let activeEditorChanged, documentClosed;
const contexts = [];
const sourceStatus = { visible: false, show() { this.visible = true; }, hide() { this.visible = false; }, dispose() {} };
const closeStatus = { visible: false, show() { this.visible = true; }, hide() { this.visible = false; }, dispose() {} };
let statusIndex = 0;
const vscode = {
  ViewColumn: { Active: -1, Beside: -2 }, StatusBarAlignment: { Left: 1 },
  commands: { executeCommand: async (...args) => { if (args[0] === 'setContext') contexts.push(args.slice(1)); } },
  window: { activeTextEditor: null, visibleTextEditors: [], createStatusBarItem() { return statusIndex++ ? closeStatus : sourceStatus; }, onDidChangeActiveTextEditor(listener) { activeEditorChanged = listener; return { dispose() {} }; } },
  workspace: { onDidCloseTextDocument(listener) { documentClosed = listener; return { dispose() {} }; } }
};
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return vscode;
  if (request === './air_viewer' && /air_docking_workspace\.js$/.test(parent?.filename || '')) return { parseAir: () => [], inferCharacterFiles: () => ({}), collisionRuntimeOptions: () => ({}), collisionRuntimeDraftEntries: () => [] };
  return originalLoad.call(this, request, parent, isMain);
};
const air = require('../src/air_docking_workspace');
const { sessions, key, onDidChangeSourceHandoff } = require('../src/air_browser_sessions');
const { beginContextClose } = require('../src/authoring_context_registry');
Module._load = originalLoad;

const airPath = path.resolve('C:/chars/Ryu/Ryu.air'), document = { fileName: airPath };
assert.strictEqual(air.sourceDestinationColumn({ panel: { viewColumn: 1 } }, document, { window: { visibleTextEditors: [] }, ViewColumn: vscode.ViewColumn }), -2, 'column-one browser routes source to an explicit beside group');
assert.strictEqual(air.sourceDestinationColumn({ panel: { viewColumn: 2 } }, document, { window: { visibleTextEditors: [{ document, viewColumn: 3 }] }, ViewColumn: vscode.ViewColumn }), 3, 'an exact already-visible source outside the browser group is reused');
assert.strictEqual(air.sourceDestinationColumn({ panel: { viewColumn: 2 } }, document, { window: { visibleTextEditors: [{ document, viewColumn: 2 }] }, ViewColumn: vscode.ViewColumn }), 1, 'the browser group itself is never reused as the source destination');
const topologyBrowserPanel = { viewColumn: 2, title: 'AIR Actions Browser', visible: true };
const topologyCompanionPanel = { viewColumn: 3, title: 'IKEMaker Code Navigation', visible: true };
const topologyBrowserTab = { label: 'AIR Actions Browser', input: { viewType: air.VIEW_TYPE } };
const topologySourceTab = { label: 'Ryu.air', input: { uri: { fsPath: airPath } } };
const topologyCompanionTab = { label: 'IKEMaker Code Navigation', input: { viewType: 'ikemenTextCompanion' } };
const topologyBrowserGroup = { viewColumn: 2, tabs: [topologyBrowserTab], activeTab: topologyBrowserTab };
const topologySourceGroup = { viewColumn: 1, tabs: [topologySourceTab], activeTab: topologySourceTab };
const topologyCompanionGroup = { viewColumn: 3, tabs: [topologyCompanionTab], activeTab: topologyCompanionTab };
assert.strictEqual(air.airSourceTopology({ panel: topologyBrowserPanel }, document, topologyCompanionPanel, { tabGroups: { all: [topologyBrowserGroup, topologySourceGroup, topologyCompanionGroup] } }).safe, true, 'the exact browser, source, and return strip in distinct source/header groups form a safe topology');
const replacedBrowserGroup = { viewColumn: 2, tabs: [...topologyBrowserGroup.tabs, ...topologySourceGroup.tabs], activeTab: topologyBrowserTab };
assert.match(air.airSourceTopology({ panel: topologyBrowserPanel }, document, null, { tabGroups: { all: [replacedBrowserGroup] } }).reason, /replace the browser/i, 'a source tab in the exact browser group is rejected even when its editor reports a different local column');
assert.match(air.airSourceTopology({ panel: topologyBrowserPanel }, document, topologyCompanionPanel, { tabGroups: { all: [topologyBrowserGroup, topologySourceGroup] } }).reason, /return strip is not visible/i, 'a render acknowledgement cannot substitute for the exact companion tab in the live topology');
const hiddenCompanionGroup = { ...topologyCompanionGroup, tabs: [topologyCompanionTab, { label: 'Other', input: { viewType: 'other' } }] };
hiddenCompanionGroup.activeTab = hiddenCompanionGroup.tabs[1];
assert.match(air.airSourceTopology({ panel: topologyBrowserPanel }, document, topologyCompanionPanel, { tabGroups: { all: [topologyBrowserGroup, topologySourceGroup, hiddenCompanionGroup] } }).reason, /exists but is not the visible tab/i, 'a hidden companion tab cannot satisfy the visible escape contract');
const canonicalHeaderGroup = { viewColumn: 3, tabs: [topologyBrowserTab, topologyCompanionTab], activeTab: topologyCompanionTab };
assert.strictEqual(air.airSourceTopology({ panel: { ...topologyBrowserPanel, viewColumn: 3, visible: false } }, document, topologyCompanionPanel, { tabGroups: { all: [canonicalHeaderGroup, topologySourceGroup] } }).safe, true, 'the canonical two-group layout accepts a visible companion return strip with the retained AIR browser hidden behind it');

(async () => {
  const withHeader = services => ({ attachTextHeader: async options => ({ attached: true, selectedFile: options.selectedFile, airReturnRendered: true }), ...services });
  const registrations = [];
  vscode.commands.registerCommand = (name, handler) => { registrations.push({ name, handler }); return { dispose() {} }; };
  vscode.window.registerWebviewPanelSerializer = () => ({ dispose() {} });
  vscode.workspace.onDidChangeTextDocument = vscode.workspace.onDidSaveTextDocument = vscode.workspace.onDidDeleteFiles = vscode.workspace.onDidRenameFiles = () => ({ dispose() {} });
  air.register({ subscriptions: [] });
  assert.strictEqual(sourceStatus.command, 'air.focusActionsBrowser');
  assert.strictEqual(sourceStatus.text, '$(arrow-left) AIR Browser');
  assert.strictEqual(sourceStatus.accessibilityInformation.label, 'Return to AIR Actions Browser');
  assert.strictEqual(closeStatus.command, 'air.closeSourceAndReturn');
  assert.strictEqual(closeStatus.text, '$(close) Source');
  assert.strictEqual(closeStatus.accessibilityInformation.label, 'Close routed source and return to AIR Actions Browser');
  assert(registrations.some(item => item.name === 'air.closeSourceAndReturn'), 'the close-and-return command is registered');
  assert(registrations.some(item => item.name === 'air.reopenActionsBrowser'), 'the exact-origin reopen command is registered');
  let shown;
  const selection = { exact: true };
  const initialRouteSource = { data: { airPath }, panel: { viewColumn: 2 } };
  sessions.set(key(airPath), initialRouteSource);
  await air.showSourceBeside(initialRouteSource, document, { selection }, withHeader({ ViewColumn: vscode.ViewColumn, window: { visibleTextEditors: [], showTextDocument: async (doc, options) => {
    assert(air.sourceHandoffRecord(doc.fileName), 'the exact return route exists before the native source editor first renders');
    shown = { doc, options };
    return { document: doc, viewColumn: 1 };
  } } }));
  assert.strictEqual(shown.options.viewColumn, 1);
  assert.strictEqual(shown.options.selection, selection, 'exact route selection survives the beside handoff');
  assert.strictEqual(shown.options.preview, false);
  const headerCommands = [];
  await air.showSourceBeside(initialRouteSource, document, {}, { ViewColumn: vscode.ViewColumn, commands: { executeCommand: async (...args) => { headerCommands.push(args); return args[0] === 'ikemen.textToolbar.resumeFromVisualViewer' ? { attached: true, selectedFile: args[1].selectedFile, airReturnRendered: true } : undefined; } }, window: { visibleTextEditors: [], showTextDocument: async doc => ({ document: doc, viewColumn: 1 }) } });
  const headerCommand = headerCommands.find(args => args[0] === 'ikemen.textToolbar.resumeFromVisualViewer');
  assert(headerCommand, 'the source handoff requires the universal Code Navigation text header');
  assert.deepStrictEqual(headerCommand[1].files, [path.resolve(document.fileName)], 'the header is bound only to the exact routed source');
  assert.strictEqual(headerCommand[1].context.root, path.resolve('C:/chars/Ryu'), 'the routed header retains the owning character context');
  assert.strictEqual(headerCommand[1].preserveConnected, true, 'the AIR handoff augments rather than replaces retained character tabs');
  assert.strictEqual(headerCommand[1].selectedFile, path.resolve(document.fileName), 'the exact routed source becomes the selected retained tab');
  const sharedSource = { fileName: path.resolve('C:/chars/template/SF6template/sf6_hit_regions.zss') }, sharedCommands = [];
  await air.showSourceBeside({ ...initialRouteSource, referenceContext: { defPath: path.resolve('C:/chars/Ryu/Ryu.def') } }, sharedSource, {}, { ViewColumn: vscode.ViewColumn, commands: { executeCommand: async (...args) => { sharedCommands.push(args); return args[0] === 'ikemen.textToolbar.resumeFromVisualViewer' ? { attached: true, selectedFile: args[1].selectedFile, airReturnRendered: true } : undefined; } }, window: { visibleTextEditors: [], showTextDocument: async doc => ({ document: doc, viewColumn: 1 }) } });
  const sharedHeader = sharedCommands.find(args => args[0] === 'ikemen.textToolbar.resumeFromVisualViewer')[1];
  assert.strictEqual(sharedHeader.context.root, path.resolve('C:/chars/Ryu'), 'a shared/template source retains the AIR owner instead of becoming its own character');
  assert.deepStrictEqual(sharedHeader.files, [path.resolve(sharedSource.fileName)], 'the shared source route remains exact while ownership stays with the AIR character');
  let headerFailureReveal = 0;
  const headerFailureRecord = { data: { airPath }, panel: { viewColumn: 2, reveal: () => { headerFailureReveal += 1; } } };
  const headerWarnings=[];
  const headerFallback=await air.showSourceBeside(headerFailureRecord, document, {}, { attachTextHeader: async () => false, reportSourceFallback:message=>headerWarnings.push(message), ViewColumn: vscode.ViewColumn, window: { visibleTextEditors: [], showTextDocument: async doc => ({ document: doc, viewColumn: 1 }) } });
  assert.strictEqual(headerFallback.document,document,'a failed optional header leaves the exact native source open');
  assert.match(headerWarnings.at(-1),/did not confirm its visible Return control/i);
  assert.strictEqual(air.sourceHandoffDetails(document.fileName)?.available,true,'a successfully opened source retains exact fallback authority when the header cannot attach');
  assert.strictEqual(headerFailureReveal, 1, 'header attachment failure never covers the source by re-revealing the AIR browser');
  let mismatchedHeaderReveal = 0;
  const mismatchedHeaderRecord = { data: { airPath }, panel: { viewColumn: 2, reveal: () => { mismatchedHeaderReveal += 1; } } };
  const mismatchWarnings=[];
  const mismatchFallback=await air.showSourceBeside(mismatchedHeaderRecord, document, {}, { attachTextHeader: async () => ({ attached: true, selectedFile: path.resolve('C:/chars/Ken/Ken.air'), airReturnRendered: true }), reportSourceFallback:message=>mismatchWarnings.push(message), ViewColumn: vscode.ViewColumn, window: { visibleTextEditors: [], showTextDocument: async doc => ({ document: doc, viewColumn: 1 }) } });
  assert.strictEqual(mismatchFallback.document,document,'an inexact optional header cannot displace the exact native source');
  assert.match(mismatchWarnings.at(-1),/did not confirm its visible Return control/i);
  assert.strictEqual(air.sourceHandoffDetails(document.fileName)?.available,true,'an inexact header acknowledgement leaves the exact fallback return authority intact');
  assert.strictEqual(mismatchedHeaderReveal, 1, 'an inexact header acknowledgement does not cover the source');
  air.forgetSourceHandoffs(initialRouteSource);
  air.forgetSourceHandoffs(headerFailureRecord);
  air.forgetSourceHandoffs(mismatchedHeaderRecord);
  sessions.delete(key(airPath));
  await assert.rejects(() => air.showSourceBeside({ panel: { viewColumn: 2 } }, document, {}, { ViewColumn: vscode.ViewColumn, window: { visibleTextEditors: [], showTextDocument: async doc => ({ document: doc, viewColumn: 2 }) } }), /separate editor group/i, 'a host that ignores the separate destination cannot silently replace the browser');
  for (const invalidColumn of [undefined,0,-2]) await assert.rejects(() => air.showSourceBeside({ panel: { viewColumn: 2 } }, document, {}, { ViewColumn: vscode.ViewColumn, window: { visibleTextEditors: [], showTextDocument: async doc => ({ document: doc, viewColumn: invalidColumn }) } }), /separate editor group/i, 'an unconfirmed destination fails closed');
  const degradedAirPath=path.resolve('C:/chars/Degraded/Degraded.air'),degradedSource={fileName:path.resolve('C:/chars/Degraded/shared.zss')},degraded={airSourceAvailable:true,data:{airPath:degradedAirPath},panel:{viewColumn:2,reveal(){}}};sessions.set(key(degradedAirPath),degraded);contexts.length=0;sourceStatus.visible=false;closeStatus.visible=false;
  await assert.rejects(()=>air.showSourceBeside(degraded,degradedSource,{}, {ViewColumn:vscode.ViewColumn,window:{visibleTextEditors:[],showTextDocument:async doc=>({document:doc,viewColumn:2})}}),/separate editor group/i);
  assert.deepStrictEqual(contexts.at(-1),['ikemen.airSourceReturnAvailable',true],'the exact keyboard/title context is published before degraded layout validation can throw');
  assert.strictEqual(sourceStatus.visible,true);assert.strictEqual(closeStatus.visible,true,'both native status escape controls remain visible in the degraded editor');
  const wrongDocument={fileName:path.resolve('C:/chars/Degraded/wrong.zss')};contexts.length=0;
  await assert.rejects(()=>air.showSourceBeside(degraded,degradedSource,{}, {ViewColumn:vscode.ViewColumn,window:{visibleTextEditors:[],showTextDocument:async()=>({document:wrongDocument,viewColumn:1})}}),/different editor/i);
  assert.deepStrictEqual(contexts.at(-1),['ikemen.airSourceReturnAvailable',false],'a wrong returned editor never receives forged AIR return authority');
  air.forgetSourceHandoffs(degraded);sessions.delete(key(degradedAirPath));

  let sameGroupReveal = 0;
  const sameGroupPanel = { ...topologyBrowserPanel, reveal() { sameGroupReveal += 1; } };
  const sameGroupWindow = {
    visibleTextEditors: [],
    tabGroups: { all: [topologyBrowserGroup] },
    showTextDocument: async doc => {
      sameGroupWindow.tabGroups.all = [replacedBrowserGroup];
      return { document: doc, viewColumn: 1 };
    }
  };
  const sameGroupWarnings=[];
  const sameGroupSource=await air.showSourceBeside({ data: { airPath }, panel: sameGroupPanel }, document, {}, { reportSourceFallback:message=>sameGroupWarnings.push(message), ViewColumn: vscode.ViewColumn, commands: { executeCommand: async () => undefined }, window: sameGroupWindow });
  assert.strictEqual(sameGroupSource.document,document,'a degraded same-group topology still leaves the requested source visible');
  assert.match(sameGroupWarnings.at(-1),/replace the browser/i);
  assert.strictEqual(sameGroupReveal, 1, 'topology degradation never re-reveals the browser over an opened source');

  const safePanel = { ...topologyBrowserPanel, reveal() {} }, safeWindow = { visibleTextEditors: [], tabGroups: { all: [topologyBrowserGroup] } };
  safeWindow.showTextDocument = async doc => { safeWindow.tabGroups.all = [topologyBrowserGroup, topologySourceGroup]; return { document: doc, viewColumn: 1 }; };
  await air.showSourceBeside({ data: { airPath }, panel: safePanel }, document, {}, {
    ViewColumn: vscode.ViewColumn,
    commands: { executeCommand: async () => undefined },
    window: safeWindow,
    attachTextHeader: async options => {
      safeWindow.tabGroups.all = [topologyBrowserGroup, topologySourceGroup, topologyCompanionGroup];
      return { attached: true, selectedFile: options.selectedFile, airReturnRendered: true, panel: topologyCompanionPanel };
    }
  });

  const sequence = [], floated = { floating: true, data: { airPath }, panel: { viewColumn: 1, reveal: () => sequence.push('reveal'), webview: { postMessage: async message => sequence.push(message.type + ':' + message.floating) } } };
  await air.showSourceBeside(floated, document, {}, withHeader({ ViewColumn: vscode.ViewColumn, commands: { executeCommand: async command => sequence.push(command) }, window: { visibleTextEditors: [], showTextDocument: async doc => { sequence.push('show'); return {document:doc,viewColumn:2}; } } }));
  assert.deepStrictEqual(sequence, ['reveal','workbench.action.disableWindowAlwaysOnTop','workbench.action.restoreEditorsToMainWindow','windowMoved:false','reveal','show'], 'a floated browser is restored to the main window before the exact source opens');
  assert.strictEqual(floated.floating, false, 'the successful source handoff records that the browser returned to the main window');

  const staleSequence = [], manuallyDetached = { floating: false, data: { airPath }, panel: { viewColumn: 1, reveal: () => staleSequence.push('reveal'), webview: { postMessage: async message => staleSequence.push(message.type + ':' + message.floating) } } };
  await air.showSourceBeside(manuallyDetached, document, {}, withHeader({ ViewColumn: vscode.ViewColumn, commands: { executeCommand: async command => staleSequence.push(command) }, window: { visibleTextEditors: [], showTextDocument: async doc => { staleSequence.push('show'); return { document: doc, viewColumn: 2 }; } } }));
  assert.deepStrictEqual(staleSequence, ['reveal', 'show'], 'a manually detached or stale-flag browser opens the source locally beside its own focused panel');
  assert(!staleSequence.some(item => String(item).includes('MainWindow')) && !staleSequence.includes('workbench.action.disableWindowAlwaysOnTop'), 'a non-owned browser never switches windows, moves unrelated windows, or changes always-on-top');
  assert.strictEqual(manuallyDetached.floating, false);

  let openedAfterFailedRestore = false;
  const stranded = { floating: true, data: { airPath }, panel: { viewColumn: 1, reveal() {}, webview: { postMessage: async () => undefined } } };
  await assert.rejects(() => air.showSourceBeside(stranded, document, {}, { ViewColumn: vscode.ViewColumn, commands: { executeCommand: async command => { if (command === 'workbench.action.restoreEditorsToMainWindow') throw new Error('blocked'); } }, window: { visibleTextEditors: [], showTextDocument: async () => { openedAfterFailedRestore = true; } } }), /no source (?:document or )?editor was opened/i);
  assert.strictEqual(openedAfterFailedRestore, false, 'restore failure cannot open a source into the auxiliary browser window');
  assert.strictEqual(stranded.floating, true, 'restore failure retains the live floating browser state');
  let openedAfterStaleFailedRestore = false, staleFailureReveal = 0;
  const staleStranded = { floating: false, data: { airPath }, panel: { viewColumn: 1, reveal() { staleFailureReveal += 1; }, webview: { postMessage: async () => undefined } } };
  await assert.rejects(() => air.showSourceBeside(staleStranded, document, {}, { ViewColumn: vscode.ViewColumn, commands: { executeCommand: async () => { throw new Error('cross-window commands must not run'); } }, window: { visibleTextEditors: [], showTextDocument: async () => { openedAfterStaleFailedRestore = true; throw new Error('local open failed'); } } }), /local open failed/i);
  assert.strictEqual(openedAfterStaleFailedRestore, true, 'a stale detached-state source attempt remains local to the revealed browser window');
  assert.strictEqual(staleFailureReveal, 1, 'local source-open failure leaves the exact AIR browser visible for recovery');
  let openedWithCodeLensDisabled = false;
  const codeLensOffRecord = { data: { airPath }, panel: { viewColumn: 1, reveal() {} } };
  await air.showSourceBeside(codeLensOffRecord, document, {}, { attachTextHeader: async options => ({ attached: true, selectedFile: options.selectedFile, airReturnRendered: true }), workspace: { getConfiguration: () => ({ get: () => false }) }, window: { visibleTextEditors: [], showTextDocument: async doc => { openedWithCodeLensDisabled = true; return { document: doc, viewColumn: 2 }; } } });
  assert.strictEqual(openedWithCodeLensDisabled, true, 'disabled CodeLens is allowed when the required universal text header attaches');
  let disabledHeaderFailureReveal = 0;
  const codeLensOffFailure = { data: { airPath }, panel: { viewColumn: 1, reveal: () => { disabledHeaderFailureReveal += 1; } } };
  const disabledWarnings=[];
  const disabledFallback=await air.showSourceBeside(codeLensOffFailure, document, {}, { attachTextHeader: async () => false, reportSourceFallback:message=>disabledWarnings.push(message), workspace: { getConfiguration: () => ({ get: () => false }) }, window: { visibleTextEditors: [], showTextDocument: async doc => ({ document: doc, viewColumn: 2 }) } });
  assert.strictEqual(disabledFallback.document,document,'native source remains usable when both CodeLens and the optional header are unavailable');
  assert.match(disabledWarnings.at(-1),/did not confirm its visible Return control/i);
  assert.strictEqual(disabledHeaderFailureReveal, 1,'header failure with CodeLens disabled does not cover the source');

  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'air_docking_workspace.js'), 'utf8');
  assert(source.includes('record.floating = state.floating === true'), 'restored auxiliary AIR browsers retain their host-side floating state so source routing returns them before opening text');
  assert(source.includes('registerAirSourceEscapeProvider'), 'AIR registration installs a native-editor escape surface that does not depend on auxiliary-window chrome');
  const directSourceHandler = source.slice(source.indexOf("if (messageType === 'source')"), source.indexOf("if (messageType === 'thumbs')"));
  assert(!directSourceHandler.includes('assertSourceCanOpen(record)'), 'the browser source action allows the shared handoff to restore a floating browser before opening text');
  assert(!source.includes("executeCommand('workbench.action.switchToMainWindow')"), 'AIR source handoff never switches away from the exact revealed browser and guesses across physical windows');
  for (const route of ['openCharacterContextRoute', 'openReferenceRoute', 'openCollisionSourceRoute', 'openHitRegionSourceRoute']) {
    const start = source.indexOf(`async function ${route}`), end = source.indexOf('\n}', start);
    assert(start >= 0 && source.slice(start, end + 2).includes('showSourceBeside('), `${route} uses the shared non-browser source handoff`);
  }
  assert(source.includes("if (messageType === 'source')") && source.includes('return showSourceBeside(record, document'), 'the main Open AIR Source action uses the same handoff');
  assert(source.includes('Open AIR Source Beside') && source.includes('Close Browser'), 'the browser exposes clear source and exit actions');
  assert(source.includes("source.onclick=()=>{publishBrowserState();persist();"), 'source handoff captures browser state before navigation');
  const mainViewerSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'air_viewer.js'), 'utf8');
  for (const route of ['openExactActionUseRoute', 'revealAirLine', 'revealSourceLine']) {
    const start = mainViewerSource.indexOf(`async function ${route}`), end = mainViewerSource.indexOf('\n}', start);
    assert(start >= 0 && mainViewerSource.slice(start, end + 2).includes('showSourceWithAirEscape('), `main AIR viewer ${route} uses the shared escape handoff instead of replacing its viewer`);
  }

  let reveals = 0;
  const live = { airSourceAvailable: true, data: { airPath }, panel: { viewColumn: 4, visible: false, reveal(column, preserveFocus) { reveals += 1; assert.strictEqual(column, 4); assert.strictEqual(preserveFocus, false); } } };
  sessions.set(key(airPath), live);
  assert.strictEqual(air.focusActionsBrowser(airPath), true);
  assert.strictEqual(reveals, 1, 'a live hidden browser is the primary exact return case');
  const routedSource = { fileName: path.resolve('C:/chars/Ryu/common.zss') };
  const handoffChanges = [];
  const handoffListener = onDidChangeSourceHandoff(change => handoffChanges.push(change));
  let existingHeaderHasControls = false;
  const headerListener = onDidChangeSourceHandoff(change => {
    if (change.filename === key(routedSource.fileName)) existingHeaderHasControls = Boolean(air.sourceHandoffRecord(routedSource.fileName));
  });
  await air.showSourceBeside(live, routedSource, { selection: { start: { line: 899 } } }, withHeader({ ViewColumn: vscode.ViewColumn, window: { visibleTextEditors: [], showTextDocument: async doc => {
    assert.strictEqual(existingHeaderHasControls, true, 'the exact escape controls exist before the native source editor first renders');
    return { document: doc, viewColumn: 1 };
  } } }));
  assert.deepStrictEqual(handoffChanges.at(-1), { filename: key(routedSource.fileName), available: true }, 'the pre-activation handoff explicitly notifies native source controls');
  assert.strictEqual(existingHeaderHasControls, true, 'the source header retains its escape path after activation');
  assert.strictEqual(air.sourceHandoffDetails(routedSource.fileName).line, 899, 'the exact handoff retains the revealed source line for the in-editor controls');
  const otherAirPath = path.resolve('C:/chars/Ken/Ken.air'), other = { airSourceAvailable: true, data: { airPath: otherAirPath }, panel: { viewColumn: 2, reveal() {} } };
  sessions.set(key(otherAirPath), other);
  await assert.rejects(() => air.showSourceBeside(other, routedSource, { selection: { start: { line: 4 } } }, { ViewColumn: vscode.ViewColumn, window: { visibleTextEditors: [], showTextDocument: async () => { throw new Error('host open failed'); } } }), /host open failed/);
  assert.strictEqual(air.sourceHandoffDetails(routedSource.fileName).record, live, 'a failed replacement restores the prior exact browser origin');
  assert.strictEqual(air.sourceHandoffDetails(routedSource.fileName).line, 899, 'a failed replacement restores the prior deep line');
  await assert.rejects(() => air.showSourceBeside(other, routedSource, { selection: { start: { line: 5 } } }, { ViewColumn: vscode.ViewColumn, window: { visibleTextEditors: [], showTextDocument: async doc => ({ document: doc, viewColumn: 2 }) } }), /separate editor group/i);
  assert.strictEqual(air.sourceHandoffDetails(routedSource.fileName).record, other, 'a source that did open keeps its newest exact browser origin even when destination topology is degraded');
  assert.strictEqual(air.sourceHandoffDetails(routedSource.fileName).line, 5, 'the degraded opened source retains its newest exact line');
  const newestAirPath = path.resolve('C:/chars/Sean/Sean.air'), newest = { airSourceAvailable: true, data: { airPath: newestAirPath }, panel: { viewColumn: 3, reveal() {} } };
  sessions.set(key(newestAirPath), newest);
  let rejectEarlier;
  const earlier = air.showSourceBeside(other, routedSource, { selection: { start: { line: 6 } } }, { ViewColumn: vscode.ViewColumn, window: { visibleTextEditors: [], showTextDocument: () => new Promise((_, reject) => { rejectEarlier = reject; }) } });
  await Promise.resolve();
  await air.showSourceBeside(newest, routedSource, { selection: { start: { line: 777 } } }, withHeader({ ViewColumn: vscode.ViewColumn, window: { visibleTextEditors: [], showTextDocument: async doc => ({ document: doc, viewColumn: 1 }) } }));
  rejectEarlier(new Error('earlier open failed late'));
  await assert.rejects(() => earlier, /earlier open failed late/);
  assert.strictEqual(air.sourceHandoffDetails(routedSource.fileName).record, newest, 'a late failure cannot erase a newer successful source handoff');
  assert.strictEqual(air.sourceHandoffDetails(routedSource.fileName).line, 777, 'a late failure cannot restore an older deep-line route over a newer one');
  await air.showSourceBeside(live, routedSource, { selection: { start: { line: 899 } } }, withHeader({ ViewColumn: vscode.ViewColumn, window: { visibleTextEditors: [], showTextDocument: async doc => ({ document: doc, viewColumn: 1 }) } }));
  sessions.delete(key(newestAirPath));
  sessions.delete(key(otherAirPath));
  assert.deepStrictEqual(contexts.at(-1), ['ikemen.airSourceReturnAvailable', true], 'a successful routed source exposes the exact editor-title return action');
  assert.strictEqual(sourceStatus.visible, true, 'a routed source also exposes a persistent narrow-window return control');
  assert.strictEqual(closeStatus.visible, true, 'a routed source exposes a separate compact close-and-return control');
  const revealsBeforeCancelledClose = reveals;
  const cancelledCloseWindow = { activeTextEditor: { document: routedSource } };
  assert.strictEqual(await air.closeSourceAndReturn(routedSource.fileName, { window: cancelledCloseWindow, commands: { executeCommand: async () => undefined } }), false, 'a cancelled dirty-editor close does not pretend the routed source closed');
  assert.strictEqual(reveals, revealsBeforeCancelledClose, 'a cancelled close keeps focus on the source instead of moving to the browser');
  const closeWindow = { activeTextEditor: { document: routedSource } }, closeCommands = [];
  assert.strictEqual(await air.closeSourceAndReturn(routedSource.fileName, { window: closeWindow, commands: { executeCommand: async command => { closeCommands.push(command); closeWindow.activeTextEditor = null; documentClosed(routedSource); } } }), true);
  assert.deepStrictEqual(closeCommands, ['workbench.action.closeActiveEditor'], 'close-and-return closes only the active routed source');
  assert.strictEqual(reveals, revealsBeforeCancelledClose + 1, 'close-and-return restores focus to the exact existing browser');
  documentClosed(routedSource);
  await Promise.resolve();
  assert.strictEqual(reveals, revealsBeforeCancelledClose + 1, 'a delayed document-close event cannot focus the browser twice');
  assert.strictEqual(sourceStatus.visible, false);
  assert.strictEqual(closeStatus.visible, false);
  assert.strictEqual(air.sourceHandoffDetails(routedSource.fileName), null, 'successful close-and-return clears the closed source route');
  await air.showSourceBeside(live, routedSource, { selection: { start: { line: 899 } } }, withHeader({ ViewColumn: vscode.ViewColumn, window: { visibleTextEditors: [], showTextDocument: async doc => ({ document: doc, viewColumn: 1 }) } }));
  const revealsBeforeReturnCommand = reveals;
  assert.strictEqual(air.focusActionsBrowser(routedSource.fileName), true, 'an open routed ZSS/CNS source returns to its exact live AIR origin');
  assert.strictEqual(reveals, revealsBeforeReturnCommand + 1);
  const manuallyClosedSource = { fileName: path.resolve('C:/chars/Ryu/manual-close.zss') };
  await air.showSourceBeside(live, manuallyClosedSource, { selection: { start: { line: 12 } } }, withHeader({ ViewColumn: vscode.ViewColumn, window: { visibleTextEditors: [], showTextDocument: async doc => ({ document: doc, viewColumn: 1 }) } }));
  const revealsBeforeManualClose = reveals;
  documentClosed(manuallyClosedSource);
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.strictEqual(reveals, revealsBeforeManualClose, 'manually closing an exact routed source never reopens or refocuses its AIR browser');
  assert.strictEqual(air.sourceHandoffDetails(manuallyClosedSource.fileName), null, 'manual source close clears the exact route after capturing its live origin');
  const nativeCloseAllSource = { fileName: path.resolve('C:/chars/Ryu/native-close-all.zss') };
  await air.showSourceBeside(live, nativeCloseAllSource, {}, withHeader({ ViewColumn: vscode.ViewColumn, window: { visibleTextEditors: [], showTextDocument: async doc => ({ document: doc, viewColumn: 1 }) } }));
  const revealsBeforeNativeCloseAll = reveals;
  documentClosed(nativeCloseAllSource);
  documentClosed({ fileName: path.resolve('C:/chars/Ryu/another-open-source.zss') });
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.strictEqual(reveals, revealsBeforeNativeCloseAll, 'a native multi-document Close All burst does not reopen the AIR browser');
  const closingSource = { fileName: path.resolve('C:/chars/Ryu/close-all.zss') };
  await air.showSourceBeside(live, closingSource, {}, withHeader({ ViewColumn: vscode.ViewColumn, window: { visibleTextEditors: [], showTextDocument: async doc => ({ document: doc, viewColumn: 1 }) } }));
  const finishContextClose = beginContextClose({ root: path.resolve('C:/chars/Ryu'), files: [closingSource.fileName] });
  const revealsBeforeContextClose = reveals;
  documentClosed(closingSource);
  finishContextClose();
  await Promise.resolve();
  assert.strictEqual(reveals, revealsBeforeContextClose, 'Close All / workbench context shutdown does not reopen an AIR browser');
  air.forgetSourceHandoffs(live);
  await Promise.resolve();
  assert.deepStrictEqual(handoffChanges.at(-1), { filename: key(routedSource.fileName), available: false }, 'origin invalidation explicitly removes controls without another editor-focus event');
  assert.strictEqual(existingHeaderHasControls, false, 'the same lifecycle signal replaces stale live controls in the existing header');
  assert.deepStrictEqual({ available: air.sourceHandoffDetails(routedSource.fileName).available, origin: air.sourceHandoffDetails(routedSource.fileName).origin }, { available: false, origin: key(airPath) }, 'origin disposal retains only the exact bounded AIR identity for a safe reopen banner');
  assert.strictEqual(sourceStatus.visible, false, 'invalidating the origin immediately hides the return control');
  assert.strictEqual(closeStatus.visible, false, 'invalidating the origin immediately hides the close-and-return control');
  assert.deepStrictEqual(contexts.at(-1), ['ikemen.airSourceReturnAvailable', false], 'invalidating the origin immediately clears the editor-title return action');
  assert.strictEqual(air.focusActionsBrowser(routedSource.fileName), false, 'an invalidated origin cannot be treated as a live return destination');
  assert.strictEqual(sessions.get(key(airPath)), live, 'the disposal-order regression observes unavailable source controls even before the later session-removal callback runs');
  activeEditorChanged({ document: { fileName: path.resolve('C:/other/unrelated.zss') } });
  await Promise.resolve();
  assert.deepStrictEqual(contexts.at(-1), ['ikemen.airSourceReturnAvailable', false], 'an unrelated active editor clears the return action');
  assert.strictEqual(sourceStatus.visible, false, 'the persistent return control is hidden outside the exact routed source');
  documentClosed(routedSource);
  await Promise.resolve();
  assert.strictEqual(air.focusActionsBrowser(routedSource.fileName), false, 'closing a routed source removes its origin handoff');
  assert.strictEqual(air.sourceHandoffDetails(routedSource.fileName), null, 'closing the routed source clears its retained exact-origin tombstone');
  assert.strictEqual(air.focusActionsBrowser(path.resolve('C:/chars/Ken/Ken.air')), false, 'return command never focuses a different AIR browser');
  sessions.clear();
  handoffListener.dispose();
  headerListener.dispose();
  console.log('AIR source handoffs preserve the browser and provide an exact return path');
})().catch(error => { console.error(error); process.exitCode = 1; });
