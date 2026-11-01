'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-character-create-'));
const game = path.join(root, 'game'), chars = path.join(game, 'chars'), data = path.join(game, 'data');
fs.mkdirSync(chars, { recursive: true }); fs.mkdirSync(data, { recursive: true });
fs.writeFileSync(path.join(data, 'common1.cns.zss'), '# common states\n');
fs.writeFileSync(path.join(data, 'common.cmd'), '; common commands\n');

const saveAnswers = [], pickAnswers = [], inputAnswers = [], informationAnswers = [], errorAnswers = [], openAnswers = [];
const information = [], warnings = [], errors = [], commands = [], opened = [];
let registerFailure = null;
const uri = filename => ({ scheme: 'file', fsPath: path.resolve(filename) });
const vscode = {
  Uri: { file: uri, joinPath: (base, child) => uri(path.join(base.fsPath, child)) },
  ConfigurationTarget: { Workspace: 2, WorkspaceFolder: 3 },
  window: {
    activeTextEditor: null,
    showSaveDialog: async () => saveAnswers.shift(),
    showOpenDialog: async () => openAnswers.shift(),
    showQuickPick: async () => pickAnswers.shift(),
    showInputBox: async () => inputAnswers.shift(),
    showInformationMessage: async message => { information.push(message); return informationAnswers.shift(); },
    showWarningMessage: async message => { warnings.push(message); return undefined; },
    showErrorMessage: async message => { errors.push(message); return errorAnswers.shift(); },
    showTextDocument: async target => { opened.push(target.fsPath); return { document: { uri: target } }; }
  },
  workspace: {
    workspaceFolders: [{ uri: uri(game) }],
    getConfiguration: section => ({
      get: (key, fallback) => section === 'ikemenZss' && key === 'authorName' ? 'Workflow Tester' : fallback,
      update: async () => undefined
    })
  },
  commands: { executeCommand: async (command, target) => { commands.push({ command, target: target?.fsPath || '' }); if (registerFailure && command === 'ikemen.workbench.registerDef') throw registerFailure; } }
};

const originalLoad = Module._load;
Module._load = function patched(request, parent, main) {
  if (request === 'vscode') return vscode;
  if (request === './stage_workspace') return { openStageWorkspace: async () => undefined };
  if (request === './screenpack_workspace') return { openUiWorkspace: async () => undefined };
  if (request === './storyboard_workspace') return { openStoryboardWorkspace: async () => undefined };
  if (request === './air_viewer') return { openAirPreview: async () => undefined };
  if (request === './experience') return { mode: () => 'learning' };
  return originalLoad.call(this, request, parent, main);
};

const engine = { label: 'IKEMEN 1.0 character using ZSS', value: 'ikemen-zss' };
const input = { label: '.inp', value: 'inp' };
const style = { label: 'Guided starter', value: 'guided' };
function target(name) { return path.join(chars, name, `${name}.def`); }
function filesUnder(name) { const folder = path.dirname(target(name)); return fs.existsSync(folder) ? fs.readdirSync(folder).sort() : []; }
async function run(name, { save = true, picks = [], inputs = [], infos = [] } = {}) {
  saveAnswers.push(save ? uri(target(name)) : undefined); pickAnswers.push(...picks); inputAnswers.push(...inputs); informationAnswers.push(...infos);
  return createCharacter();
}

let createCharacter;
(async () => {
  try {
    ({ createCharacter } = require('../src/asset_creation'));

    assert.strictEqual(await run('CancelDestination', { save: false }), undefined);
    assert.deepStrictEqual(filesUnder('CancelDestination'), [], 'canceling the destination creates no character folder or files');

    assert.strictEqual(await run('CancelEngine', { picks: [undefined] }), undefined);
    assert.deepStrictEqual(filesUnder('CancelEngine'), [], 'canceling engine selection creates no files');

    assert.strictEqual(await run('CancelName', { picks: [engine], inputs: [undefined] }), undefined);
    assert.deepStrictEqual(filesUnder('CancelName'), [], 'canceling the display name creates no files');

    assert.strictEqual(await run('CancelInput', { picks: [engine, undefined], inputs: ['Cancel Input'] }), undefined);
    assert.deepStrictEqual(filesUnder('CancelInput'), [], 'canceling the input extension creates no files');

    assert.strictEqual(await run('CancelStyle', { picks: [engine, input, undefined], inputs: ['Cancel Style'] }), undefined);
    assert.deepStrictEqual(filesUnder('CancelStyle'), [], 'canceling the scaffold creates no files');

    assert.strictEqual(await run('CancelReview', { picks: [engine, input, style], inputs: ['Cancel Review'], infos: [undefined] }), undefined);
    assert.deepStrictEqual(filesUnder('CancelReview'), [], 'canceling final review creates no files');

    const externalEngine=path.join(root,'external-engine'),externalData=path.join(externalEngine,'data');fs.mkdirSync(externalData,{recursive:true});
    fs.writeFileSync(path.join(externalData,'common1.cns.zss'),'# reviewed external common states\n');fs.writeFileSync(path.join(externalData,'common.cmd'),'; reviewed external common commands\n');
    fs.rmSync(path.join(data,'common1.cns.zss'));fs.rmSync(path.join(data,'common.cmd'));
    errorAnswers.push('Generate Commons from Engine…');openAnswers.push([uri(externalEngine)]);
    const installed=await run('InstalledCommons',{picks:[engine,input,style],inputs:['Installed Commons'],infos:[undefined,'Create Character','Open DEF']});
    assert.deepStrictEqual(installed,{created:true,registered:true,filename:target('InstalledCommons'),opened:true});
    assert.strictEqual(fs.readFileSync(path.join(data,'common1.cns.zss'),'utf8'),'# reviewed external common states\n');
    assert.strictEqual(fs.readFileSync(path.join(data,'common.cmd'),'utf8'),'; reviewed external common commands\n');
    assert(information.some(message=>/Installed 2 .* common file\(s\)/.test(message)),'the reviewed common-file install reports its exact bounded result before character creation');

    const exact = await run('ExactHero', { picks: [engine, input, style], inputs: ['Exact Hero'], infos: ['Create Character', 'Open DEF'] });
    assert.deepStrictEqual(exact, { created: true, registered: true, filename: target('ExactHero'), opened: true });
    const expected = ['ExactHero.air','ExactHero.cns','ExactHero.def','ExactHero.inp','ExactHero.sff','ExactHero.snd','ExactHero.zss','ExactHero_movelist.dat','README.md'];
    assert.deepStrictEqual(filesUnder('ExactHero'), expected, 'creation writes exactly the reviewed character file set');
    assert(fs.readFileSync(target('ExactHero'), 'utf8').includes('displayname = "Exact Hero"'));
    assert(commands.some(item => item.command === 'ikemen.workbench.registerDef' && item.target === target('ExactHero')), 'completion registers the exact created DEF');
    assert.strictEqual(opened.at(-1), target('ExactHero'), 'Open DEF returns to the exact created character source');
    assert(information.at(-1).includes(path.dirname(target('ExactHero'))) && /9 new character files/.test(information.at(-1)) && /no existing character, stage, screenpack, or project files were changed/i.test(information.at(-1)), 'completion names the exact destination and bounded output scope');

    const conflictTarget = target('ConflictHero'); fs.mkdirSync(path.dirname(conflictTarget), { recursive: true }); fs.writeFileSync(conflictTarget, 'preserve me');
    const conflict = await run('ConflictHero', { picks: [engine, input, style], inputs: ['Conflict Hero'], infos: ['Create Character'] });
    assert.deepStrictEqual(conflict, { created: false, filename: conflictTarget });
    assert.strictEqual(fs.readFileSync(conflictTarget, 'utf8'), 'preserve me');
    assert.deepStrictEqual(filesUnder('ConflictHero'), ['ConflictHero.def'], 'a conflict creates none of the remaining character files');
    assert(/Nothing was created/.test(errors.at(-1)), 'the conflict reports the no-overwrite boundary');

    registerFailure = new Error('registry unavailable');
    const recovery = await run('OpenLater', { picks: [engine, input, style], inputs: ['Open Later'], infos: ['Create Character'] });
    assert.deepStrictEqual(recovery, { created: true, registered: false, filename: target('OpenLater'), opened: false });
    assert.deepStrictEqual(filesUnder('OpenLater'), ['OpenLater.air','OpenLater.cns','OpenLater.def','OpenLater.inp','OpenLater.sff','OpenLater.snd','OpenLater.zss','OpenLater_movelist.dat','README.md']);
    assert(warnings.at(-1).includes(target('OpenLater')) && /was created/.test(warnings.at(-1)) && /Use Open Character/.test(warnings.at(-1)), 'post-write registration failure preserves output and gives the exact recovery route');

    console.log('Character creation proves prompt cancellation, exact file output, no-overwrite, registration/open return, and post-write recovery');
  } finally {
    Module._load = originalLoad;
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
