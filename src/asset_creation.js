'use strict';

const fs = require('fs');
const path = require('path');
const vscode = require('vscode');
const { blankSff, blankSnd } = require('./asset_templates');
const { stageDef, screenpackDef, fightDef } = require('./workspace_templates');
const { openStageWorkspace } = require('./stage_workspace');
const { openUiWorkspace } = require('./screenpack_workspace');
const { openStoryboardWorkspace } = require('./storyboard_workspace');
const { TYPES: STORYBOARD_TYPES, storyboardTemplate } = require('./storyboard_model');
const { openAirPreview } = require('./air_viewer');
const { scaffoldChoices, createCharacterPlan, creationReview, writeCharacterPlan } = require('./character_creation');
const { commonStatus, commonCopyPlan } = require('./common_creation');
const { transactionalWrite, transactionalWriteSet, optionsFromConfig } = require('./mutation_safety');
const { mode } = require('./experience');

function mutationOptions(filename, label, overrides = {}) {
  return optionsFromConfig(vscode, filename, label, { journalRoot: path.dirname(filename), ...overrides });
}

function defaultFolder() {
  const active = vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri;
  if (active && active.scheme === 'file') return vscode.Uri.file(path.dirname(active.fsPath));
  const folder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0]; return folder && folder.uri;
}

async function chooseTarget(extension, title, suggested) {
  const folder = defaultFolder(), defaultUri = folder ? vscode.Uri.joinPath(folder, suggested) : undefined;
  return vscode.window.showSaveDialog({ title, defaultUri, filters: { [`IKEMEN ${extension.toUpperCase()}`]: [extension] } });
}

const SOURCE_FILE_TYPES = Object.freeze([
  { label: 'ZSS state/code file', extension: 'zss', suggested: 'New_Code.zss', command: 'zss.createNew' },
  { label: 'CNS state/constants file', extension: 'cns', suggested: 'New_Code.cns', command: 'cns.createNew' },
  { label: 'INP character input file', extension: 'inp', suggested: 'New_Commands.inp', command: 'inp.createNew' },
  { label: 'Legacy CMD command file', extension: 'cmd', suggested: 'Legacy_Commands.cmd', command: 'cmd.createNew' },
  { label: 'DEF definition/configuration file', extension: 'def', suggested: 'New_Definition.def', command: 'ikemen.def.createNew' },
  { label: 'Lua source file', extension: 'lua', suggested: 'New_Script.lua', command: 'ikemen.lua.createNew' },
  { label: 'Text data/notes file', extension: 'txt', suggested: 'New_Data.txt', command: 'ikemen.text.createNew' }
]);

function sourceFileTemplate(extension) {
  if (extension === 'lua') return '-- New IKEMEN Lua source file\n-- Add code here.\n';
  return `; New IKEMEN ${extension.toUpperCase()} file\n; Add code or configuration here.\n`;
}

async function createSourceFile(extension, suggested, label) {
  const target = await chooseTarget(extension, `Create New ${label}`, suggested); if (!target) return;
  try {
    transactionalWrite(fs, target.fsPath, sourceFileTemplate(extension), mutationOptions(target.fsPath, `create-${extension}`, { allowExisting: false }));
    await vscode.window.showTextDocument(target, { preview: false });
  } catch (error) {
    vscode.window.showErrorMessage(`Could not create ${label}: ${error.message}`);
  }
}

async function createAnySourceFile() {
  const selected = await vscode.window.showQuickPick(SOURCE_FILE_TYPES, {
    title: 'Create an individual IKEMEN file',
    placeHolder: 'Choose the file type. You will choose its name and save location next.'
  });
  if (selected) await createSourceFile(selected.extension, selected.suggested, selected.label);
}

async function createSff() {
  const selected = await vscode.window.showQuickPick([
    { label: 'SFF 2.1 (Recommended)', description: 'Native IKEMEN and MUGEN 1.1 archive.', value: '2.1' },
    { label: 'SFF 2.0', description: 'Choose only when strict MUGEN 1.0 compatibility is required.', value: '2.0' }
  ], { title: 'Choose the SFF format', placeHolder: 'Palette files can still be imported into either format.' });
  if (!selected) return;
  const target = await chooseTarget('sff', `Create New SFF ${selected.value}`, 'New_Character.sff'); if (!target) return;
  transactionalWrite(fs, target.fsPath, blankSff(selected.value), mutationOptions(target.fsPath, 'create-sff', { allowExisting: false })); await vscode.commands.executeCommand('vscode.openWith', target, 'ikemen.sffWorkspace', { preview: false });
}

async function createAir() {
  const target = await chooseTarget('air', 'Create New AIR', 'New_Character.air'); if (!target) return;
  const content = '; New IKEMEN animation file\n; Add the character SFF to a nearby DEF to enable visual preview.\n\n[Begin Action 0]\n0,0, 0,0, 1\n';
  transactionalWrite(fs, target.fsPath, content, mutationOptions(target.fsPath, 'create-air', { allowExisting: false })); await vscode.window.showTextDocument(target, { preview: false }); await openAirPreview(target, { allowEmpty: true, preserveFocus: true });
}

async function createSnd() {
  const target = await chooseTarget('snd', 'Create New SND', 'New_Character.snd'); if (!target) return;
  transactionalWrite(fs, target.fsPath, blankSnd(), mutationOptions(target.fsPath, 'create-snd', { allowExisting: false })); await vscode.commands.executeCommand('vscode.openWith', target, 'ikemen.sndWorkspace', { preview: false });
}

async function createStage() {
  const target = await chooseTarget('def', 'Create New Stage and Visual Workspace', 'New_Stage.def'); if (!target) return;
  const base = path.basename(target.fsPath, '.def'), sff = `${base}.sff`, sffPath = path.join(path.dirname(target.fsPath), sff);
  try { transactionalWriteSet(fs, [[target.fsPath, stageDef(base.replace(/_/g, ' '), sff)], [sffPath, blankSff()]], mutationOptions(target.fsPath, 'create-stage-workspace', { allowExisting: false })); await openStageWorkspace(target); }
  catch (error) { vscode.window.showErrorMessage(`Could not create stage workspace: ${error.message}`); }
}

async function createUi() {
  const target = await chooseTarget('def', 'Create New Screenpack / Fight UI Workspace', 'system.def');
  if (!target) return; const directory = path.dirname(target.fsPath), systemName = path.basename(target.fsPath);
  const files = { 'system.def': screenpackDef(), 'fight.def': fightDef(), 'system.sff': blankSff(), 'fight.sff': blankSff() };
  if (systemName.toLowerCase() !== 'system.def') { files[systemName] = files['system.def']; delete files['system.def']; }
  try { transactionalWriteSet(fs, Object.entries(files).map(([name, content]) => [path.join(directory, name), content]), mutationOptions(target.fsPath, 'create-ui-workspace', { allowExisting: false })); await openUiWorkspace(vscode.Uri.file(path.join(directory, systemName))); }
  catch (error) { vscode.window.showErrorMessage(`Could not create UI workspace: ${error.message}`); }
}

async function createStoryboard(type) {
  let selected = type && STORYBOARD_TYPES[type] ? { value: type, ...STORYBOARD_TYPES[type] } : null;
  if (!selected) selected = await vscode.window.showQuickPick(Object.entries(STORYBOARD_TYPES).map(([value, item]) => ({ value, ...item, description: value === 'opening' || value === 'ending' ? 'Can be assigned from a character DEF.' : 'Can be assigned from a screenpack or Story Mode route.' })), { title: 'Create New IKEMEN Storyboard', placeHolder: 'Choose what this sequence is for. The file stays a normal editable IKEMEN storyboard.' });
  if (!selected) return;
  const target = await chooseTarget('def', `Create ${selected.label}`, `${selected.stem}.def`); if (!target) return;
  const base = path.basename(target.fsPath, '.def'), sffName = `${base}.sff`, sffPath = path.join(path.dirname(target.fsPath), sffName);
  const displayName = base.replace(/[_-]+/g, ' ');
  try {
    transactionalWriteSet(fs, [[target.fsPath, storyboardTemplate(selected.value, displayName, sffName)], [sffPath, blankSff()]], mutationOptions(target.fsPath, `create-${selected.value}-storyboard`, { allowExisting: false }));
    await openStoryboardWorkspace(target);
  } catch (error) { vscode.window.showErrorMessage(`Could not create storyboard: ${error.message}`); }
}

async function createCharacter() {
  const target = await chooseTarget('def', 'Create New Character', 'New_Character.def');
  if (!target) return;
  const engineChoice = await vscode.window.showQuickPick([
    { label: 'IKEMEN 1.0 character using ZSS', description: 'Native ZSS states, IKEMEN constants, D/W buttons, and IKEMEN common files.', value: 'ikemen-zss' },
    { label: 'MUGEN 1.0-compatible character using CNS', description: 'CNS states, MUGEN constants and commands, and common1.cns.', value: 'mugen-cns' }
  ], { title: 'Choose the character engine and code format', placeHolder: 'This choice controls every generated file.' });
  if (!engineChoice) return;
  let sffVersion = '2.1';
  if (engineChoice.value === 'mugen-cns') {
    const sffChoice = await vscode.window.showQuickPick([
      { label: 'SFF 2.0 · MUGEN 1.0 (Recommended)', description: 'Use for strict MUGEN 1.0 compatibility.', value: '2.0' },
      { label: 'SFF 2.1 · MUGEN 1.1', description: 'Uses the newer archive and targets MUGEN 1.1; not strict MUGEN 1.0.', value: '2.1' }
    ], { title: 'Choose the MUGEN SFF target', placeHolder: 'This also sets the generated DEF mugenversion.' });
    if (!sffChoice) return;
    sffVersion = sffChoice.value;
  }
  const common = commonStatus(target.fsPath, engineChoice.value);
  if (!common.root) {
    const answer = await vscode.window.showErrorMessage('The character is not being saved inside a game’s chars folder, so IKEMaker cannot validate its common files.', { modal: true, detail: 'Choose a location such as GAME/chars/Character/Character.def, or continue knowing the common-state contract remains unresolved.' }, 'Create Character Anyway');
    if (answer !== 'Create Character Anyway') return;
  } else if (common.missing.length) {
    const missing = common.missing.map((item) => item.name).join(', ');
    const answer = await vscode.window.showErrorMessage(`${common.engineLabel} common files were not found.`, { modal: true, detail: `Missing from ${path.join(common.root, 'data')}: ${missing}\n\nIKEMaker can generate the project common set by copying verified files from another installation of the same engine. Existing common files are never overwritten.` }, 'Generate Commons from Engine…', 'Create Character Anyway');
    if (answer === 'Generate Commons from Engine…') {
      const selected = await vscode.window.showOpenDialog({ title: `Choose a ${common.engineLabel} installation or its data folder`, canSelectFiles: false, canSelectFolders: true, canSelectMany: false });
      if (!selected?.length) return;
      try {
        const plan = commonCopyPlan(common.root, selected[0].fsPath, engineChoice.value);
        transactionalWriteSet(fs, [...plan.files.entries()], mutationOptions(path.join(plan.targetData, '.ikemaker-common-install'), `install-${engineChoice.value}-commons`, { allowExisting: false }));
        vscode.window.showInformationMessage(`Installed ${plan.files.size} ${common.engineLabel} common file(s) into ${plan.targetData}.`);
      } catch (error) { return vscode.window.showErrorMessage(`Could not install common files: ${error.message}`); }
    } else if (answer !== 'Create Character Anyway') return;
  }
  const displayName = await vscode.window.showInputBox({
    title: 'Character display name',
    value: path.basename(target.fsPath, '.def').replace(/[_-]+/g, ' '),
    validateInput: (value) => value.trim() ? undefined : 'Enter the name shown in IKEMEN.'
  });
  if (displayName === undefined) return;
  const inputChoice = await vscode.window.showQuickPick([
    { label: '.inp — Neutral input file (Recommended)', description: 'Clear role without using Windows’ executable .cmd extension.', value: 'inp' },
    { label: 'Project-specific extension…', description: 'For example HDBZ uses .mfg.', value: 'custom' },
    { label: '.cmd — Legacy compatibility', description: 'Supported for existing projects; not recommended for new files on Windows.', value: 'cmd' }
  ], { title: 'Choose the character input-file extension' });
  if (!inputChoice) return;
  let inputExtension = inputChoice.value;
  if (inputExtension === 'custom') {
    inputExtension = await vscode.window.showInputBox({
      title: 'Project-specific input extension',
      prompt: 'Enter the extension without a dot, such as mfg.',
      validateInput: (value) => /^[A-Za-z0-9][A-Za-z0-9_-]{1,15}$/.test(value.trim()) ? undefined : 'Use 2–16 letters, numbers, underscores, or hyphens.'
    });
    if (!inputExtension) return;
  }
  const experience = mode('assets', target);
  const styles = scaffoldChoices(experience).map((choice) => ({ ...choice, label: `${choice.label}${choice.recommended ? ' (Recommended for current experience)' : ''}` }));
  const selectedStyle = await vscode.window.showQuickPick(styles, {
    title: 'Choose the character scaffold',
    placeHolder: 'This explicit choice controls generated content; changing Learning / Advanced mode alone never does.'
  });
  if (!selectedStyle) return;
  const author = vscode.workspace.getConfiguration('ikemenZss', target).get('authorName', '');
  const plan = createCharacterPlan(target.fsPath, { displayName: displayName.trim(), author, style: selectedStyle.value, engineTarget: engineChoice.value, sffVersion, inputExtension });
  const review = creationReview(plan);
  const answer = await vscode.window.showInformationMessage(
    `Create ${plan.stem} with the ${review.title.toLowerCase()}?`,
    { modal: true, detail: `Files\n${review.files.join('\n')}\n\nRequired first review\n${review.dependencies.map((item) => `• ${item}`).join('\n')}` },
    'Create Character'
  );
  if (answer !== 'Create Character') return;
  try {
    writeCharacterPlan(fs, plan, mutationOptions(target.fsPath, 'create-character', { allowExisting: false }));
    if (!['inp', 'cmd'].includes(plan.inputExtension)) {
      const fileConfig = vscode.workspace.getConfiguration('files', target);
      const associations = fileConfig.get('associations', {});
      await fileConfig.update('associations', { ...associations, [`*.${plan.inputExtension}`]: 'ikemen-cns' }, vscode.ConfigurationTarget.Workspace);
    }
    await vscode.commands.executeCommand('ikemen.workbench.registerDef', vscode.Uri.file(plan.defPath));
    const next = await vscode.window.showInformationMessage(`${plan.stem} was created. Start with the dependency checklist before gameplay work.`, 'Open Checklist', 'Open DEF');
    if (next === 'Open Checklist') await vscode.window.showTextDocument(vscode.Uri.file(path.join(plan.directory, 'README.md')), { preview: false });
    if (next === 'Open DEF') await vscode.window.showTextDocument(vscode.Uri.file(plan.defPath), { preview: false });
  } catch (error) {
    vscode.window.showErrorMessage(`Could not create character: ${error.message}`);
  }
}

function registerAssetCreation(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('ikemen.character.createNew', createCharacter),
    vscode.commands.registerCommand('sff.createNew', createSff),
    vscode.commands.registerCommand('air.createNew', createAir),
    vscode.commands.registerCommand('snd.createNew', createSnd),
    vscode.commands.registerCommand('ikemen.stage.createNew', createStage),
    vscode.commands.registerCommand('ikemen.ui.createNew', createUi),
    vscode.commands.registerCommand('ikemen.storyboard.create', createStoryboard),
    vscode.commands.registerCommand('ikemen.storyboard.createOpening', () => createStoryboard('opening')),
    vscode.commands.registerCommand('ikemen.storyboard.createEnding', () => createStoryboard('ending')),
    vscode.commands.registerCommand('ikemen.file.createNew', createAnySourceFile),
    ...SOURCE_FILE_TYPES.map((item) => vscode.commands.registerCommand(item.command, () => createSourceFile(item.extension, item.suggested, item.label)))
  );
}

module.exports = { registerAssetCreation, createCharacter, createStage, createUi, createStoryboard, createAnySourceFile, createSourceFile, sourceFileTemplate, SOURCE_FILE_TYPES };
