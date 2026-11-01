'use strict';
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), Module = require('module');
const original = Module._load;
class Range { constructor(startLine, startCharacter, endLine, endCharacter) { Object.assign(this, { startLine, startCharacter, endLine, endCharacter }); } }
class Selection extends Range {}
Module._load = function (request, parent, main) { if (request === 'vscode') return { Range, Selection, ViewColumn: { Active: 1 }, workspace: { textDocuments: [] }, window: {} }; return original.call(this, request, parent, main); };
const viewer = require('../src/air_viewer'); Module._load = original;

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemen-air-uses-'));
  try {
    const defPath = path.join(root, 'Hero.def'), airPath = path.join(root, 'Hero.air'), sourcePath = path.join(root, 'states.cns');
    const defText = '[Files]\nanim = Hero.air\nst = states.cns\n', airText = '[Begin Action 200]\n0,0,0,0,1\n'; let sourceText = '[StateDef 200]\nanim = 200\n';
    fs.writeFileSync(defPath, defText); fs.writeFileSync(airPath, airText); fs.writeFileSync(sourcePath, sourceText);
    const airDocument = { fileName: airPath, isClosed: false, isDirty: false, version: 1, getText: () => airText }, sourceDocument = { fileName: sourcePath, isClosed: false, isDirty: false, version: 1, getText: () => sourceText };
    const documents = [airDocument, sourceDocument], warnings = [], reveals = [], editors = [];
    const session = { defPath, airPath, panel: { active: true, viewColumn: 2 }, selectedAction: 200, disposed: false };
    const services = { openDocuments: documents, openTextDocument: async filename => documents.find(item => path.resolve(item.fileName) === path.resolve(filename)), showSourceWithEscape: async (_session, document, options) => { reveals.push({ document, options }); session.panel.active = false; const editor={document,selection:null,revealRange:value=>{editor.revealed=value}};editors.push(editor);return editor; }, showWarningMessage: message => warnings.push(message) };
    const projection = viewer.decorateExactActionUses(session, airText, services); assert.strictEqual(projection.items.length, 1); const route = projection.items[0].route;
    await viewer.openExactActionUseRoute(session, route, services); assert.strictEqual(reveals.length, 1); assert.strictEqual(reveals[0].options.selection.startLine,1,'the exact deep-line escape route exists before the native editor first renders');assert.strictEqual(editors[0].selection.startLine,1);assert.strictEqual(editors[0].revealed.startLine,1);assert.strictEqual(warnings.length,0,'expected webview deactivation after showing the native editor is not treated as authority drift');
    await viewer.openExactActionUseRoute(session, route, services); assert.match(warnings.at(-1), /already used/);

    viewer.decorateExactActionUses(session, airText, services); const staleRoute = session.exactUsageModel.items[0].route; sourceText = sourceText.replace('anim = 200', 'anim = 201'); await viewer.openExactActionUseRoute(session, staleRoute, services); assert.match(warnings.at(-1), /changed/); assert.strictEqual(reveals.length, 1);
    session.panel.active=true;sourceText = '[StateDef 200]\nanim = 200\n'; viewer.decorateExactActionUses(session, airText, services); const raceRoute = session.exactUsageModel.items[0].route;
    const raceServices = { ...services, openTextDocument: async filename => { sourceText = sourceText.replace('anim = 200', 'anim = 201'); return documents.find(item => path.resolve(item.fileName) === path.resolve(filename)); } };
    await viewer.openExactActionUseRoute(session, raceRoute, raceServices); assert.match(warnings.at(-1), /changed/); assert.strictEqual(reveals.length, 1, 'source mutation during open cannot reveal stale code');
    session.panel.active=true;sourceText='[StateDef 200]\nanim = 200\n';viewer.decorateExactActionUses(session,airText,services);const showRaceRoute=session.exactUsageModel.items[0].route;const showRaceServices={...services,showSourceWithEscape:async(_session,document,options)=>{reveals.push({document,options});sourceText=sourceText.replace('anim = 200','anim = 201');const editor={document,selection:null};editors.push(editor);return editor;}};await viewer.openExactActionUseRoute(session,showRaceRoute,showRaceServices);assert.match(warnings.at(-1),/changed during navigation/);assert.strictEqual(editors.at(-1).selection,null,'source drift during show cannot retain an authoritative editor selection after the post-show recheck');
    sourceText = '[StateDef 200]\nanim = 200\n'; session.panel.active=true;viewer.decorateExactActionUses(session, airText, services); const inactiveRoute = session.exactUsageModel.items[0].route; session.panel.active = false; await viewer.openExactActionUseRoute(session, inactiveRoute, services); assert.match(warnings.at(-1), /changed/); assert.strictEqual(reveals.length, 2);
    assert.strictEqual(typeof services.applyEdit, 'undefined');
    console.log('air_action_usage_host tests passed');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
