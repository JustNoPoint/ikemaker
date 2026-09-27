'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const panels = [], registrations = [], close = new Map(), commands = [], warnings = [];
function makePanel() { const receivers = [], disposers = [], messages = []; const panel = { webview: { cspSource: 'test', html: '', onDidReceiveMessage(fn) { receivers.push(fn); }, postMessage(message) { messages.push(message); return true; } }, onDidDispose(fn) { disposers.push(fn); }, reveal() {}, dispose() { disposers.forEach(fn => fn()); }, receivers, messages }; panels.push(panel); return panel; }
const vscode = { ViewColumn: { Active: 1 }, Uri: { file: fsPath => ({ fsPath }) }, workspace: { textDocuments: [], asRelativePath: value => value }, languages: { getDiagnostics: () => [], onDidChangeDiagnostics: () => ({}) }, commands: { executeCommand: async (...args) => { commands.push(args); } }, window: { activeTextEditor: null, createWebviewPanel: makePanel, showWarningMessage(message) { warnings.push(message); }, showErrorMessage(message) { throw new Error(message); } } };
const original = Module._load;
Module._load = function(request, parent, main) {
  if (request === 'vscode') return vscode;
  if (request === './character_picker' && /move_lab_workspace/.test(parent?.filename || '')) return { nearestCharacterDef: value => /\.def$/i.test(value) && fs.existsSync(value) ? value : '', chooseCharacterDef: async () => '' };
  if (request === './viewer_group' && /move_lab_workspace/.test(parent?.filename || '')) return { preferredViewerColumn: () => 2, trackViewerPanel: value => value };
  if (request === './authoring_context_registry' && /move_lab_workspace/.test(parent?.filename || '')) return { registerCharacterToolPanel() {} };
  if (request === './webview_policy' && /move_lab_workspace/.test(parent?.filename || '')) return { protect: value => value };
  if (request === './viewer_sessions' && /move_lab_workspace/.test(parent?.filename || '')) return { register: (panel, file, kind) => registrations.push({ panel, file, kind }) };
  if (request === './viewer_close' && /move_lab_workspace/.test(parent?.filename || '')) return { support: (panel, value) => close.set(panel, value) };
  return original.call(this, request, parent, main);
};
const workspace = require('../src/move_lab_workspace');
const sharedContext = require('../src/move_lab_context');

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-move-sessions-'));
  try {
    const make = name => { const folder = path.join(root, name); fs.mkdirSync(folder); const def = path.join(folder, `${name}.def`); fs.writeFileSync(def, `[Info]\nname=${name}\n[Files]\nst=states.zss\ncns=constants.zss\n`); fs.writeFileSync(path.join(folder, 'states.zss'), '[StateDef 200]\nhitDef { damage: 10; }\n'); fs.writeFileSync(path.join(folder, 'constants.zss'), '[Constants]\nnormal.sLP.moveID = 200\n'); return def; };
    const a = make('A'), b = make('B'), c = make('C');
    const first = await workspace.openMoveLab(vscode.Uri.file(a)), second = await workspace.openMoveLab(vscode.Uri.file(b));
    assert(first && second && first !== second, 'different characters keep separate Move Lab panels'); assert.strictEqual(registrations.filter(item => item.kind === 'move_lab').length, 2); assert(close.has(first) && close.has(second));
    assert.strictEqual(await workspace.openMoveLab(vscode.Uri.file(a)), first, 'same character reuses its owned panel');
    const displayed=workspace.model(a).attacks.constantProfiles[0],displayedReference=workspace.constantsReferenceFor(displayed,a,{overviewReference:{defPath:a,mode:'attack'}});
    await first.receivers[0]({ type: 'openProfile', reference: displayedReference });
    const routed = commands.at(-1); assert.strictEqual(routed[0], 'ikemen.moveConstants.open'); assert.strictEqual(routed[1].fsPath, a); assert.strictEqual(routed[2].reference.profileId, 'normal.slp'); assert.strictEqual(routed[2].reference.prefix, 'normal.sLP'); assert.strictEqual(path.basename(routed[2].reference.sourceFilename), 'constants.zss'); assert(routed[2].reference.sourceHash);
    assert.strictEqual(routed[2].reference.overviewReference.mode,'attack');
    const constantsFile=path.join(path.dirname(a),'constants.zss'),beforeConstants=fs.readFileSync(constantsFile,'utf8'),beforeCommands=commands.length;fs.writeFileSync(constantsFile,'; changed\n'+beforeConstants);await first.receivers[0]({type:'openProfile',reference:displayedReference});assert.strictEqual(commands.length,beforeCommands,'a click from an older displayed constants snapshot cannot bless the new source');assert(warnings.at(-1).includes('constants profile changed'));fs.writeFileSync(constantsFile,beforeConstants);
    sharedContext.remember(a,{kind:'constants',reference:routed[2].reference});await workspace.openMoveLab(vscode.Uri.file(a));assert.strictEqual(commands.at(-1)[0],'ikemen.moveConstants.open','generic Move Lab resumes the last valid constants integration');
    const afterResume=commands.length;sharedContext.remember(b,{kind:'constants',reference:{...routed[2].reference,defPath:b}});assert.strictEqual(await workspace.openMoveLab(vscode.Uri.file(b)),second);assert.strictEqual(commands.length,afterResume,'a different character with no valid retained profile stays in discovery');assert.strictEqual(sharedContext.current(b),null);
    await first.receivers[0]({ type: 'returnToConstants', reference: routed[2].reference }); assert.strictEqual(commands.at(-1)[2].reference.profileId, 'normal.slp');
    await first.receivers[0]({ type: 'returnToConstants', reference: { ...routed[2].reference, sourceHash: 'stale' } }); assert(warnings.at(-1).includes('changed'));
    await first.receivers[0]({ type: 'openProfile', reference: { ...displayedReference, profileId:'missing' } }); assert(warnings.at(-1).includes('changed'));
    const attack=workspace.model(a).attacks.controllers[0];fs.writeFileSync(path.join(path.dirname(a),'states.zss'),'; inserted\n[StateDef 200]\nhitDef { damage: 10; }\n');const commandCount=commands.length;await first.receivers[0]({type:'openAttack',reference:attack});assert.strictEqual(commands.length,commandCount);assert(warnings.at(-1).includes('HitDef changed'));
    const reference = { defPath: a, mode: 'throw' }; assert.strictEqual(await workspace.openMoveLab(vscode.Uri.file(a), { preset: true, reference }), first); assert(first.messages.some(message => message.type === 'viewerHistoryRestore' && message.reference.mode === 'throw'));
    const before = panels.length; assert.strictEqual(await workspace.openMoveLab(vscode.Uri.file(c), { preset: true, reference: { defPath: c, mode: 'not-a-mode' } }), undefined); assert.strictEqual(panels.length, before, 'invalid preset is rejected before panel creation');
    first.dispose(); second.dispose();
    assert(workspace.validMoveReference({ defPath: c, mode: 'overview' }, { visual: { actions: [] } }, c));
    const profile={id:'normal.slp',prefix:'normal.sLP',sourceFilename:path.join(path.dirname(c),'constants.zss'),sourceHash:'one'},data={attacks:{constantProfiles:[profile]},visual:{actions:[]}};
    const exact=workspace.constantsReferenceFor(profile,c); assert(workspace.validConstantsReference(exact,data,c)); assert(!workspace.validConstantsReference({...exact,sourceHash:'stale'},data,c));
    assert(workspace.validMoveReference({defPath:c,mode:'overview',returnTo:exact},data,c)); assert(!workspace.validMoveReference({defPath:c,mode:'overview',returnTo:{...exact,profileId:'other'}},data,c));
    console.log('Move Lab character ownership and typed selection restoration passed');
  } finally { Module._load = original; fs.rmSync(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
