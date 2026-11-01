'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const originalLoad = Module._load;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'story-d1-life-'));

function project(name) {
  const base = path.join(root, name), data = path.join(base, 'data'), route = path.join(data, 'story', `${name}.lua`), select = path.join(data, 'select.def');
  fs.mkdirSync(path.dirname(route), { recursive: true });
  fs.writeFileSync(route, `-- ${name} route\nlaunchFight{}\n`);
  fs.writeFileSync(select, `[Characters]\nRyu/Ryu.def\n[StoryMode]\nname = ${name}\ndisplayname = ${name}\npath = data/story/${name}.lua\n`);
  return { base, data, route, select };
}

const a = project('alpha'), b = project('bravo'), c = project('charlie');
const uri = file => ({ scheme: 'file', fsPath: path.resolve(file), toString: () => `file:///${path.resolve(file).replace(/\\/g, '/')}` });
function document(file) {
  let text = fs.readFileSync(file, 'utf8'), version = 1;
  return { fileName: path.resolve(file), uri: uri(file), isDirty: false, get version() { return version; }, getText: () => text, get lineCount() { return text.split(/\r?\n/).length; }, lineAt: line => ({ text: text.split(/\r?\n/)[line] || '' }), setText(next) { text = next; version += 1; } };
}
const docs = new Map([a, b, c].flatMap(item => [[path.resolve(item.select), document(item.select)], [path.resolve(item.route), document(item.route)]]));
const changes = [], saves = [], closes = [], registrations = [], shown = [];
const contexts = new WeakMap();
function contextFor(panel) {
  if (!contexts.has(panel)) {
    let value = { identity: `project:${contexts.size || 1}`, revision: 0, selectionRevision: 0, activeSurfaceId: '', selection: null };
    contexts.set(panel, { snapshot: () => JSON.parse(JSON.stringify(value)), update: patch => { value = { ...value, ...patch, revision: value.revision + 1, selectionRevision: value.selectionRevision + (Object.hasOwn(patch, 'selection') ? 1 : 0) }; } });
  }
  return contexts.get(panel);
}
function makePanel(active) {
  const receivers = [], views = [], disposes = [], posts = [];
  let html = '';
  const webview = { cspSource: 'test:', failNextHtml: false, posts,
    onDidReceiveMessage(fn) { receivers.push(fn); return { dispose() { const i = receivers.indexOf(fn); if (i >= 0) receivers.splice(i, 1); } }; },
    postMessage(message) { posts.push(message); return Promise.resolve(true); }
  };
  Object.defineProperty(webview, 'html', { get: () => html, set(value) { if (webview.failNextHtml) { webview.failNextHtml = false; throw new Error('render failed'); } html = value; } });
  const panel = { active, disposed: false, webview,
    reveal() { panel.active = true; for (const fn of [...views]) fn({ webviewPanel: panel }); },
    dispose() { if (panel.disposed) return; panel.disposed = true; for (const fn of [...disposes]) fn(); },
    onDidChangeViewState(fn) { views.push(fn); return { dispose() { const i = views.indexOf(fn); if (i >= 0) views.splice(i, 1); } }; },
    onDidDispose(fn) { disposes.push(fn); return { dispose() { const i = disposes.indexOf(fn); if (i >= 0) disposes.splice(i, 1); } }; },
    async send(message) { for (const fn of [...receivers]) await fn(message); await new Promise(resolve => setImmediate(resolve)); }
  };
  panel.listenerCounts = () => ({ receivers: receivers.length, views: views.length, disposes: disposes.length });
  return panel;
}
const panels = [makePanel(true), makePanel(false)];
let quickPick = choices => choices[0], createIndex = 0, prepareAllowed = true, openGate = null, clipboardGate = null;
const vscode = {
  ViewColumn: { Active: 1 }, TextEditorRevealType: { InCenter: 1 }, Selection: class {}, Range: class {},
  Uri: { file: uri, parse: value => uri(value.replace(/^file:\/\/\//, '')) },
  workspace: {
    workspaceFolders: [], textDocuments: [...docs.values()], getConfiguration: () => ({ get: (_key, fallback) => fallback }),
    openTextDocument: async target => { if (openGate) await openGate; const file = path.resolve(target.fsPath); if (!fs.existsSync(file)) throw new Error('missing'); return docs.get(file) || document(file); },
    onDidChangeTextDocument(fn) { changes.push(fn); return { dispose() { const i = changes.indexOf(fn); if (i >= 0) changes.splice(i, 1); } }; },
    onDidSaveTextDocument(fn) { saves.push(fn); return { dispose() { const i = saves.indexOf(fn); if (i >= 0) saves.splice(i, 1); } }; },
    onDidCloseTextDocument(fn) { closes.push(fn); return { dispose() { const i = closes.indexOf(fn); if (i >= 0) closes.splice(i, 1); } }; }
  },
  window: {
    activeTextEditor: null, createWebviewPanel: () => panels[createIndex++], registerWebviewPanelSerializer: () => ({ dispose() {} }),
    showQuickPick: async choices => quickPick(choices), showWarningMessage: async () => undefined, showInformationMessage: async () => undefined, showErrorMessage: async () => undefined,
    showTextDocument: async doc => { shown.push(doc.fileName); return { document: doc, revealRange() {} }; }
  },
  commands: { registerCommand: () => ({ dispose() {} }), executeCommand: async () => true }, env: { clipboard: { writeText: async () => { if (clipboardGate) await clipboardGate; } } }
};

Module._load = function(request, parent, main) {
  if (request === 'vscode') return vscode;
  if (request === './authoring_context_registry') return { registerAuthoringPanel: (panel, value) => { registrations.push({ panel, value }); return { panel }; }, getContextModel: entry => contextFor(entry.panel) };
  if (request === './viewer_sessions') return { register() {} };
  if (request === './viewer_group') return { preferredViewerColumn: () => 1, trackViewerPanel: value => value, revealInViewerGroup(panel) { panel.reveal(); } };
  if (request === './webview_policy') return { protect: value => value };
  if (request === './viewer_close') return { support() {}, prepare: async () => prepareAllowed, clientScript: () => '' };
  return originalLoad.call(this, request, parent, main);
};

(async () => {
  try {
    const story = require('../src/story_dialogue_workspace');
    await story.openStoryDialogueWorkspace(uri(a.select), 'player');
    await story.openStoryDialogueWorkspace(uri(b.select), 'player');
    const ownerA = story.sessions.get(path.resolve(a.select).toLowerCase()), ownerB = story.sessions.get(path.resolve(b.select).toLowerCase());
    assert(ownerA && ownerB && ownerA !== ownerB, 'different select.def roots retain independent keyed owners');
    assert.equal(contextFor(panels[0]).snapshot().activeSurfaceId, 'story.dialogue');
    assert.equal(contextFor(panels[1]).snapshot().activeSurfaceId, '', 'background creation does not steal shared selection');

    const copyDraft = { label: 'Rival', enemy: 'Ken', phase: 'pre', group: 9100, hidebars: true, lines: [{ side: 'p1', portrait: '0', wait: '0', text: 'Ready?', soundGroup: '', soundIndex: '' }] };
    let releaseCopy; clipboardGate = new Promise(resolve => { releaseCopy = resolve; }); const copying = panels[0].send({ type: 'storyDialogue', generation: ownerA.generation, requestId: 80, operation: 'copy', draft: copyDraft }); await new Promise(resolve => setImmediate(resolve)); assert(ownerA.busy > 0 && ownerB.busy === 0, 'D2 mutation busy state is isolated per keyed owner'); releaseCopy(); await copying; clipboardGate = null; assert(!panels[1].webview.posts.some(message => message.type === 'storyMutationResult' && message.requestId === 80), 'D2 terminal remains isolated to its originating owner');

    const oldFile = ownerA.file, oldHtml = panels[0].webview.html, oldGeneration = ownerA.generation;
    assert.equal(await story.switchOwner(ownerA, b.select), false, 'key collision refuses without destroying current owner');
    assert.equal(ownerA.file, oldFile);
    assert.equal(await story.switchOwner(ownerA, path.join(root, 'missing', 'select.def')), false, 'candidate build failure retains current owner');
    prepareAllowed = false;
    assert.equal(await story.switchOwner(ownerA, c.select), false, 'Close preflight cancellation retains current owner');
    assert.equal(ownerA.file, oldFile); prepareAllowed = true;
    panels[0].webview.failNextHtml = true;
    assert.equal(await story.switchOwner(ownerA, c.select), false, 'render/bind failure rolls back transactionally');
    assert.equal(ownerA.file, oldFile); assert.equal(ownerA.generation, oldGeneration); assert.equal(panels[0].webview.html, oldHtml);

    const invokeConnected = () => panels[0].send({ type: 'ikemaker.universal-toolbar.invoke', slotId: 'connected-resources' });
    let removed = false;
    quickPick = choices => { const picked = choices.find(choice => choice.reference?.role === 'story-route') || choices[0]; if (picked.reference) { fs.unlinkSync(a.route); removed = true; } return picked; };
    let before = shown.length; await invokeConnected(); assert.equal(shown.length, before, 'removed connected source is re-resolved and never opened');
    if (removed) fs.writeFileSync(a.route, '-- alpha route\nlaunchFight{}\n');
    docs.set(path.resolve(a.route), document(a.route)); vscode.workspace.textDocuments = [...docs.values()]; await story.refresh(ownerA); panels[0].reveal(); await ownerA.queue;

    quickPick = choices => { const picked = choices.find(choice => choice.reference?.role === 'story-route') || choices[0]; if (picked.reference) contextFor(panels[0]).update({ activeSurfaceId: 'foreign.surface', selection: { surfaceId: 'foreign.surface' } }); return picked; };
    before = shown.length; await invokeConnected(); assert.equal(shown.length, before, 'foreign takeover during Connected prompt prevents commit/open');
    panels[0].reveal(); await ownerA.queue;

    let committedBeforeOpen = false;
    let overlappedRefresh = false;
    quickPick = choices => { const routeChoice = choices.find(choice => choice.reference?.role === 'story-route'); if (routeChoice && !overlappedRefresh) { overlappedRefresh = true; for (const fn of [...changes]) fn({ document: ownerA.document, contentChanges: [{}] }); } return routeChoice || choices.find(choice => choice.value === 'native') || choices[0]; };
    const originalShow = vscode.window.showTextDocument;
    vscode.window.showTextDocument = async doc => { committedBeforeOpen = ownerA.selectedReference?.role === 'story-route' && contextFor(panels[0]).snapshot().selection?.reference?.role === 'story-route'; return originalShow(doc); };
    before = shown.length; await invokeConnected(); await ownerA.queue; assert.equal(shown.length, before + 1); assert(committedBeforeOpen, 'Connected commits nav/shared selection before opening'); assert(overlappedRefresh && !ownerA.disposed, 'queued refresh overlapping Connected drains without replacing the owner');

    const childDoc = docs.get(path.resolve(a.route));
    for (const fn of [...closes]) fn(childDoc); await ownerA.queue; assert(!ownerA.disposed, 'child close refreshes rather than disposing root owner');
    const listenersBefore = changes.length + saves.length + closes.length;
    for (const fn of [...closes]) fn(ownerA.document); assert(ownerA.disposed, 'root select close disposes exact owner');
    assert(story.sessions.get(path.resolve(b.select).toLowerCase()) === ownerB, 'other keyed project remains live');
    assert(changes.length + saves.length + closes.length < listenersBefore, 'owner listeners are removed once on disposal');
    const lateHtml = panels[1].webview.html;
    let releaseOpen; openGate = new Promise(resolve => { releaseOpen = resolve; });
    const switching = story.switchOwner(ownerB, c.select); await new Promise(resolve => setImmediate(resolve)); panels[1].dispose(); openGate = null; releaseOpen();
    assert.equal(await switching, false, 'dispose during candidate build prevents switch commit');
    assert(!story.sessions.has(path.resolve(c.select).toLowerCase()), 'disposed switch cannot install a late replacement session');
    for (const fn of [...changes]) fn({ document: docs.get(path.resolve(b.route)), contentChanges: [{}] }); await new Promise(resolve => setImmediate(resolve));
    assert.equal(panels[1].webview.html, lateHtml, 'disposed owner cannot render late or resurrect');
    console.log('Story Dialogue D1 actual keyed panels cover transactional switch rollback, Connected removal/takeover/commit ordering, child/root lifecycle, and no-late disposal');
  } finally {
    Module._load = originalLoad;
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
