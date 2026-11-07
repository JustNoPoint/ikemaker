'use strict';

const fs = require('fs');
const path = require('path');
const vscode = require('vscode');
const { blankSff, blankSnd } = require('./asset_templates');
const { creationPlan, parseLocalCoord } = require('./authoring_creation_plan');
const { profileChoices } = require('./authoring_creation_profiles');
const { openStageWorkspace } = require('./stage_workspace');
const { openUiWorkspace } = require('./screenpack_workspace');
const { openStoryboardWorkspace } = require('./storyboard_workspace');
const { TYPES: STORYBOARD_TYPES, storyboardTemplate } = require('./storyboard_model');
const storyboardAssignment = require('./storyboard_assignment');
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

const SOURCE_PICKER_SECTIONS = Object.freeze([
  Object.freeze({ label: 'Code and data files', items: SOURCE_FILE_TYPES }),
  Object.freeze({ label: 'Stage', items: Object.freeze([
    Object.freeze({ label: 'Stage workspace', description: 'Create a stage DEF and its connected SFF, then open the visual Stage workspace.', command: 'ikemen.stage.createNew' }),
    Object.freeze({ label: 'Stage from ordered PNG layers…', description: 'Preview and reorder PNG art, choose fighter depth, then create connected Stage DEF/SFF.', command: 'ikemen.stage.createFromPngLayers' })
  ]) }),
  Object.freeze({ label: 'UI / Screenpack', items: Object.freeze([
    Object.freeze({ label: 'Screenpack / Fight UI workspace', description: 'Create motif, fight UI, and a roster when needed, then open the visual UI workspace.', command: 'ikemen.ui.createNew' }),
    Object.freeze({ label: 'Storyboard', description: 'Create an opening, ending, credits, logo, loading, or story scene with its connected SFF.', command: 'ikemen.storyboard.create' })
  ]) })
]);

function sourcePickerItems(separatorKind = -1) {
  return SOURCE_PICKER_SECTIONS.flatMap(section => [
    { label: section.label, kind: separatorKind },
    ...section.items
  ]);
}

function sourceFileTemplate(extension) {
  if (extension === 'lua') return '-- New IKEMEN Lua source file\n-- Add code here.\n';
  return `; New IKEMEN ${extension.toUpperCase()} file\n; Add code or configuration here.\n`;
}

async function createSourceFile(extension, suggested, label) {
  const target = await chooseTarget(extension, `Create New ${label}`, suggested);
  if (!target) return { created: false, cancelled: true };
  try {
    transactionalWrite(fs, target.fsPath, sourceFileTemplate(extension), mutationOptions(target.fsPath, `create-${extension}`, { allowExisting: false }));
  } catch (error) {
    vscode.window.showErrorMessage(`Could not create ${label}: ${error.message}`);
    return { created: false, cancelled: false, filename: target.fsPath, error: error.message };
  }
  try {
    await vscode.window.showTextDocument(target, { preview: false });
  } catch (error) {
    vscode.window.showWarningMessage(`${label} was created at ${target.fsPath}, but IKEMaker could not open it. Open that exact file to continue: ${error.message}`);
    return { created: true, opened: false, filename: target.fsPath };
  }
  vscode.window.showInformationMessage(`${label} was created at ${target.fsPath}. It is open and ready to edit; no other project or asset files were created.`);
  return { created: true, opened: true, filename: target.fsPath };
}

async function createAnySourceFile() {
  const selected = await vscode.window.showQuickPick(sourcePickerItems(vscode.QuickPickItemKind?.Separator ?? -1), {
    title: 'Create IKEMEN Code, Stage, or UI',
    placeHolder: 'Choose a code/data file or a complete Stage or UI workspace.'
  });
  if (!selected) return;
  if (selected.extension) return createSourceFile(selected.extension, selected.suggested, selected.label);
  if (selected.command) return vscode.commands.executeCommand(selected.command);
}

async function createSff() {
  const selected = await vscode.window.showQuickPick([
    { label: 'SFF 2.1 (Recommended)', description: 'Native IKEMEN and MUGEN 1.1 archive.', value: '2.1' },
    { label: 'SFF 2.0', description: 'Choose only when strict MUGEN 1.0 compatibility is required.', value: '2.0' }
  ], { title: 'Choose the SFF format', placeHolder: 'Palette files can still be imported into either format.' });
  if (!selected) return { created: false, cancelled: true, step: 'format' };
  const target = await chooseTarget('sff', `Create New SFF ${selected.value}`, 'New_Character.sff');
  if (!target) return { created: false, cancelled: true, step: 'destination' };
  try {
    transactionalWrite(fs, target.fsPath, blankSff(selected.value), mutationOptions(target.fsPath, 'create-sff', { allowExisting: false }));
  } catch (error) {
    await vscode.window.showErrorMessage(`Could not create SFF ${selected.value} at ${target.fsPath}: ${error.message}. No existing SFF was replaced.`);
    return { created: false, cancelled: false, filename: target.fsPath, version: selected.value, error: error.message };
  }
  try {
    await vscode.commands.executeCommand('vscode.openWith', target, 'ikemen.sffWorkspace', { preview: false });
  } catch (error) {
    await vscode.window.showWarningMessage(`SFF ${selected.value} was created at ${target.fsPath}, but IKEMaker could not open its SFF Workspace: ${error.message}. The empty archive was kept; open that exact SFF to continue without recreating it.`);
    return { created: true, opened: false, filename: target.fsPath, version: selected.value };
  }
  await vscode.window.showInformationMessage(`SFF ${selected.value} was created at ${target.fsPath} and opened in its SFF Workspace. The archive is structurally valid and empty; no sprites, palettes, AIR, DEF, character, or project files were created. Add reviewed sprites through Add Sprites or Advanced SFF Creator.`);
  return { created: true, opened: true, filename: target.fsPath, version: selected.value };
}

function airTemplate() {
  return '; New IKEMEN animation file\n; Add the character SFF to a nearby DEF to enable visual preview.\n\n[Begin Action 0]\n0,0, 0,0, 1\n';
}

async function createAir() {
  const target = await chooseTarget('air', 'Create New AIR', 'New_Character.air');
  if (!target) return { created: false, cancelled: true };
  try {
    transactionalWrite(fs, target.fsPath, airTemplate(), mutationOptions(target.fsPath, 'create-air', { allowExisting: false }));
  } catch (error) {
    await vscode.window.showErrorMessage(`Could not create AIR at ${target.fsPath}: ${error.message}. No existing AIR was replaced.`);
    return { created: false, cancelled: false, filename: target.fsPath, error: error.message };
  }
  let textOpened = false, previewOpened = false, textError = null, previewError = null;
  try { textOpened = Boolean(await vscode.window.showTextDocument(target, { preview: false })); if (!textOpened) textError = new Error('The text editor did not open.'); } catch (error) { textError = error; }
  try { previewOpened = Boolean(await openAirPreview(target, { allowEmpty: true, preserveFocus: true })); if (!previewOpened) previewError = new Error('The AIR Viewer did not open.'); } catch (error) { previewError = error; }
  if (textOpened && previewOpened) {
    await vscode.window.showInformationMessage(`AIR was created at ${target.fsPath}. Its text editor and visual AIR Viewer are open. No SFF, DEF, character, or other project files were created; connect a nearby character SFF through its DEF when you are ready to preview real sprites.`);
  } else {
    const opened = [textOpened ? 'text editor' : '', previewOpened ? 'AIR Viewer' : ''].filter(Boolean).join(' and ') || 'neither editor';
    const failures = [textError ? `text editor: ${textError.message}` : '', previewError ? `AIR Viewer: ${previewError.message}` : ''].filter(Boolean).join('; ');
    await vscode.window.showWarningMessage(`AIR was created at ${target.fsPath}. IKEMaker opened ${opened}, but could not finish every return route (${failures}). The AIR file was kept; open that exact file to continue without recreating it.`);
  }
  return { created: true, filename: target.fsPath, textOpened, previewOpened };
}

async function createSnd() {
  const target = await chooseTarget('snd', 'Create New SND', 'New_Character.snd'); if (!target) return;
  transactionalWrite(fs, target.fsPath, blankSnd(), mutationOptions(target.fsPath, 'create-snd', { allowExisting: false })); await vscode.commands.executeCommand('vscode.openWith', target, 'ikemen.sndWorkspace', { preview: false });
}

async function chooseAuthoringCoordinates(label) {
  const selected = await vscode.window.showQuickPick(profileChoices(), { title: `${label} canvas`, placeHolder: 'Choose the coordinate system before IKEMaker creates connected files.' });
  if (!selected) return null;
  if (selected.value !== 'custom') return selected.localcoord;
  const value = await vscode.window.showInputBox({ title: `Custom ${label} canvas`, value: '320,240', prompt: 'Width,height (for example 1280,720)', validateInput: input => { try { parseLocalCoord(input); return undefined; } catch (error) { return error.message; } } });
  return value === undefined ? null : parseLocalCoord(value);
}

async function approveCreationPlan(plan) {
  const folder = path.dirname(plan.target), detail = [`Canvas: ${plan.localCoord[0]} × ${plan.localCoord[1]}`, '', 'New files:', ...plan.files.map(file => `• ${file.role}: ${path.relative(folder, file.filename) || path.basename(file.filename)}`), ...(plan.existing?.length ? ['', 'Assigned without changes:', ...plan.existing.map(file => `• ${file.role}: ${file.filename}`)] : []), '', 'New files are created together; if any write fails, the set is rolled back.'].join('\n');
  return await vscode.window.showInformationMessage(`Create ${plan.summary}?`, { modal: true, detail }, 'Create Workspace') === 'Create Workspace';
}

function writeCreationPlan(plan, label) {
  return transactionalWriteSet(fs, plan.files.map(file => [file.filename, file.content]), mutationOptions(plan.target, label, { allowExisting: false }));
}

function authorFor(target) { return vscode.workspace.getConfiguration('ikemenZss', target).get('authorName', ''); }

async function createStage() {
  const target = await chooseTarget('def', 'Create New Stage and Visual Workspace', 'New_Stage.def');
  if (!target) return { created: false, cancelled: true, step: 'destination' };
  const localCoord = await chooseAuthoringCoordinates('Stage');
  if (!localCoord) return { created: false, cancelled: true, step: 'canvas' };
  const plan = creationPlan('stage', target.fsPath, { localCoord, author: authorFor(target) });
  if (!await approveCreationPlan(plan)) return { created: false, cancelled: true, step: 'review' };
  try { writeCreationPlan(plan, 'create-stage-workspace'); }
  catch (error) {
    vscode.window.showErrorMessage(`Could not create the stage workspace at ${target.fsPath}. No reviewed connected files were replaced: ${error.message}`);
    return { created: false, cancelled: false, filename: target.fsPath, error: error.message };
  }
  const sffPath = plan.files.find(file => file.role === 'Stage sprites')?.filename || '';
  let panel;
  try { panel = await openStageWorkspace(target); }
  catch (error) {
    vscode.window.showWarningMessage(`The stage workspace was created at ${target.fsPath}${sffPath ? ` with sprites at ${sffPath}` : ''}, but IKEMaker could not open it. Open that exact stage DEF to continue: ${error.message}`);
    return { created: true, opened: false, filename: target.fsPath, sffPath, localCoord: [...localCoord] };
  }
  if (!panel) {
    vscode.window.showWarningMessage(`The stage workspace was created at ${target.fsPath}${sffPath ? ` with sprites at ${sffPath}` : ''}, but the Stage Workspace did not open. Open that exact stage DEF to continue.`);
    return { created: true, opened: false, filename: target.fsPath, sffPath, localCoord: [...localCoord] };
  }
  vscode.window.showInformationMessage(`Stage workspace created at ${target.fsPath}${sffPath ? ` with sprites at ${sffPath}` : ''}. It is open in Stage Workspace; no character, screenpack, or project files were created.`);
  return { created: true, opened: true, filename: target.fsPath, sffPath, localCoord: [...localCoord] };
}

async function createUi() {
  const target = await chooseTarget('def', 'Create New Screenpack / Fight UI Workspace', 'system.def');
  if (!target) return { created: false, cancelled: true, step: 'destination' };
  const localCoord = await chooseAuthoringCoordinates('Screenpack / Fight UI');
  if (!localCoord) return { created: false, cancelled: true, step: 'canvas' };
  const rosterPath = path.join(path.dirname(target.fsPath), 'select.def');
  let reuseSelect = false;
  try { reuseSelect = fs.existsSync(rosterPath) && fs.statSync(rosterPath).isFile(); }
  catch (error) { vscode.window.showErrorMessage(`Could not inspect roster ${rosterPath}: ${error.message}`); return { created: false, cancelled: false, filename: target.fsPath, error: error.message }; }
  const plan = creationPlan('screenpack', target.fsPath, { localCoord, author: authorFor(target), reuseSelect });
  if (!await approveCreationPlan(plan)) return { created: false, cancelled: true, step: 'review' };
  if (reuseSelect) {
    let available = false;
    try { available = fs.statSync(rosterPath).isFile(); } catch (_) { /* A removed roster invalidates the reviewed assignment. */ }
    if (!available) {
      const message = `The reviewed existing roster is no longer available: ${rosterPath}`;
      vscode.window.showErrorMessage(message);
      return { created: false, cancelled: false, filename: target.fsPath, error: message };
    }
  }
  try { writeCreationPlan(plan, 'create-ui-workspace'); }
  catch (error) {
    vscode.window.showErrorMessage(`Could not create Screenpack / Fight UI workspace at ${target.fsPath}: ${error.message}`);
    return { created: false, cancelled: false, filename: target.fsPath, error: error.message };
  }
  const files = plan.files.map(file => file.filename);
  try {
    const panel = await openUiWorkspace(target);
    if (!panel) {
      vscode.window.showWarningMessage(`Screenpack / Fight UI workspace files were created, but the visual workspace did not open. Open ${target.fsPath} to continue. Created files: ${files.join(', ')}. Assigned roster: ${rosterPath}.`);
      return { created: true, opened: false, filename: target.fsPath, files };
    }
  }
  catch (error) {
    vscode.window.showWarningMessage(`Screenpack / Fight UI workspace files were created, but IKEMaker could not open the visual workspace. Open ${target.fsPath} to continue. Created files: ${files.join(', ')}. Assigned roster: ${rosterPath}. ${error.message}`);
    return { created: true, opened: false, filename: target.fsPath, files };
  }
  vscode.window.showInformationMessage(`Screenpack / Fight UI workspace was created and opened from ${target.fsPath}. New files: ${files.join(', ')}. Assigned roster: ${rosterPath}${reuseSelect ? ' (existing; unchanged)' : ' (new; add characters and stages in Roster Manager)'}. The sprite archives contain no art; menu font 0 depends on the engine's default font resource. No game motif selection was changed. Review the active motif before launching.`);
  return { created: true, opened: true, filename: target.fsPath, files };
}

async function createStoryboard(type) {
  let selected = type && STORYBOARD_TYPES[type] ? { value: type, ...STORYBOARD_TYPES[type] } : null;
  if (!selected) selected = await vscode.window.showQuickPick(Object.entries(STORYBOARD_TYPES).map(([value, item]) => {
    const target = storyboardAssignment.assignmentTarget(value);
    const description = target ? `Can be assigned through ${target.owner} → [${target.section}] ${target.key}.` : 'Standalone/interstitial sequence; no single automatic DEF assignment target is assumed.';
    return { value, ...item, description };
  }), { title: 'Create New IKEMEN Storyboard', placeHolder: 'Choose what this sequence is for. The file stays a normal editable IKEMEN storyboard.' });
  if (!selected) return { created: false, cancelled: true, step: 'type' };
  const target = await chooseTarget('def', `Create ${selected.label}`, `${selected.stem}.def`);
  if (!target) return { created: false, cancelled: true, step: 'destination', type: selected.value };
  const localCoord = await chooseAuthoringCoordinates('Storyboard');
  if (!localCoord) return { created: false, cancelled: true, step: 'canvas', type: selected.value };
  const plan = creationPlan('storyboard', target.fsPath, { type: selected.value, localCoord, author: authorFor(target) });
  if (!await approveCreationPlan(plan)) return { created: false, cancelled: true, step: 'review', type: selected.value };
  try { writeCreationPlan(plan, `create-${selected.value}-storyboard`); }
  catch (error) {
    vscode.window.showErrorMessage(`Could not create the ${selected.label} storyboard at ${target.fsPath}. No reviewed connected files were replaced: ${error.message}`);
    return { created: false, cancelled: false, filename: target.fsPath, type: selected.value, error: error.message };
  }
  const sffPath = plan.files.find(file => file.role === 'Storyboard sprites')?.filename || '';
  try {
    const panel = await openStoryboardWorkspace(target);
    if (!panel) throw new Error('Storyboard Workspace did not open.');
  }
  catch (error) {
    vscode.window.showWarningMessage(`The ${selected.label} storyboard was created at ${target.fsPath}${sffPath ? ` with sprites at ${sffPath}` : ''}, but IKEMaker could not open it. Open that exact storyboard DEF to continue: ${error.message}`);
    return { created: true, opened: false, filename: target.fsPath, sffPath, type: selected.value, localCoord: [...localCoord] };
  }
  const assignmentTarget = storyboardAssignment.assignmentTarget(selected.value), completion = `${selected.label} storyboard created at ${target.fsPath}${sffPath ? ` with sprites at ${sffPath}` : ''}. It is open in Storyboard Workspace; no character, stage, screenpack, or project files were changed.${assignmentTarget ? ` Choose Assign Storyboard… to review an optional ${assignmentTarget.owner} assignment.` : ''}`;
  const next = await vscode.window.showInformationMessage(completion, ...(assignmentTarget ? ['Assign Storyboard…'] : []));
  let assignment;
  if (next === 'Assign Storyboard…') assignment = await assignCreatedStoryboard(target.fsPath, selected.value);
  return { created: true, opened: true, filename: target.fsPath, sffPath, type: selected.value, localCoord: [...localCoord], ...(assignment ? { assignment } : {}) };
}

async function assignCreatedStoryboard(storyboardFilename, type) {
  const target = storyboardAssignment.assignmentTarget(type); if (!target) return { assigned: false, cancelled: true, step: 'unsupported' };
  const picked = await vscode.window.showOpenDialog({ title: `Choose ${target.owner} for ${target.key}`, canSelectFiles: true, canSelectFolders: false, canSelectMany: false, filters: { 'IKEMEN DEF': ['def'] } });
  if (!picked?.length) return { assigned: false, cancelled: true, step: 'owner' };
  const ownerFilename = path.resolve(picked[0].fsPath), dirtyOwner = () => (vscode.workspace.textDocuments || []).find(document => document.uri?.scheme === 'file' && path.resolve(document.uri.fsPath).toLowerCase() === ownerFilename.toLowerCase() && document.isDirty);
  if (dirtyOwner()) { const message = 'Save or revert the selected assignment DEF before reviewing this storyboard assignment.'; await vscode.window.showErrorMessage(message); return { assigned: false, cancelled: false, error: message }; }
  let plan;
  try { plan = storyboardAssignment.createAssignmentPlan({ ownerFilename, storyboardFilename, type }); }
  catch (error) { await vscode.window.showErrorMessage(`Storyboard assignment was not prepared: ${error.message}`); return { assigned: false, cancelled: false, error: error.message }; }
  const detail = [`Owner: ${plan.ownerFilename}`, `Section: [${plan.section}]`, `Assignment: ${plan.key} = ${plan.value}`, ...(plan.enable?['Enable section: enabled = 1']:[]), '', plan.changed ? 'The exact owner file is rechecked before a transactional write. A failed commit rolls back; no separate persistent backup is created.' : 'This exact assignment is already present; no file needs to change.'].join('\n');
  const approved = await vscode.window.showWarningMessage(`${plan.changed ? 'Apply' : 'Keep'} this storyboard assignment?`, { modal: true, detail }, plan.changed ? 'Assign Storyboard' : 'Keep Existing Assignment');
  if (!approved) return { assigned: false, cancelled: true, step: 'review' };
  if (dirtyOwner()) { const message = 'The assignment DEF gained unsaved changes during review. Save or revert it, then review the assignment again.'; await vscode.window.showErrorMessage(message); return { assigned: false, cancelled: false, error: message }; }
  try {
    const result = storyboardAssignment.applyAssignment(plan, mutationOptions(plan.ownerFilename, 'assign-storyboard', { allowExisting: true, expectedHash: plan.beforeHash }));
    await vscode.window.showInformationMessage(result.changed ? `Storyboard assigned in ${result.ownerFilename}: [${result.section}] ${result.key} = ${result.value}.` : `The storyboard was already assigned in ${result.ownerFilename}; no file changed.`);
    return { assigned: true, changed: result.changed, ownerFilename: result.ownerFilename, section: result.section, key: result.key, value: result.value };
  } catch (error) {
    if (error.committed) {
      await vscode.window.showWarningMessage(`The storyboard assignment was applied, but a temporary recovery file could not be removed. Do not repeat the assignment to fix cleanup; keep the path named in this warning until cleanup is resolved. ${error.message}`);
      return { assigned: true, changed: true, ownerFilename: plan.ownerFilename, section: plan.section, key: plan.key, value: plan.value, cleanupWarning: error.message };
    }
    await vscode.window.showErrorMessage(`Storyboard assignment was not applied. The owner was not silently overwritten: ${error.message}`);
    return { assigned: false, cancelled: false, error: error.message };
  }
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
    placeHolder: 'This explicit choice controls generated content; changing explanation detail alone never does.'
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
  } catch (error) {
    vscode.window.showErrorMessage(`Could not create character: ${error.message}`);
    return { created: false, filename: plan.defPath };
  }
  try {
    if (!['inp', 'cmd'].includes(plan.inputExtension)) {
      const fileConfig = vscode.workspace.getConfiguration('files', target);
      const associations = fileConfig.get('associations', {});
      await fileConfig.update('associations', { ...associations, [`*.${plan.inputExtension}`]: 'ikemen-cns' }, vscode.ConfigurationTarget.Workspace);
    }
    await vscode.commands.executeCommand('ikemen.workbench.registerDef', vscode.Uri.file(plan.defPath));
    const next = await vscode.window.showInformationMessage(`${plan.stem} was created at ${plan.directory}. ${plan.files.size} new character files were written; no existing character, stage, screenpack, or project files were changed. Start with the dependency checklist before gameplay work.`, 'First playable attack', 'Open Checklist', 'Open DEF');
    if (next === 'First playable attack') await vscode.commands.executeCommand('ikemen.character.firstPlayableAttack', vscode.Uri.file(plan.defPath));
    if (next === 'Open Checklist') await vscode.window.showTextDocument(vscode.Uri.file(path.join(plan.directory, 'README.md')), { preview: false });
    if (next === 'Open DEF') await vscode.window.showTextDocument(vscode.Uri.file(plan.defPath), { preview: false });
    return { created: true, registered: true, filename: plan.defPath, opened: next === 'First playable attack' || next === 'Open Checklist' || next === 'Open DEF' };
  } catch (error) {
    await vscode.window.showWarningMessage(`${plan.stem} was created at ${plan.directory}, but IKEMaker could not finish registering or opening it: ${error.message}. Use Open Character and choose ${plan.defPath}; the generated files were kept.`);
    return { created: true, registered: false, filename: plan.defPath, opened: false };
  }
}

function registerAssetCreation(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('ikemen.character.firstPlayableAttack', seed => require('./first_playable_attack').firstPlayableAttack(context, seed)),
    vscode.commands.registerCommand('ikemen.character.createNew', createCharacter),
    vscode.commands.registerCommand('sff.createNew', createSff),
    vscode.commands.registerCommand('air.createNew', createAir),
    vscode.commands.registerCommand('snd.createNew', createSnd),
    vscode.commands.registerCommand('ikemen.stage.createNew', createStage),
    vscode.commands.registerCommand('ikemen.stage.createFromPngLayers', () => require('./stage_png_workspace').openPngStage(vscode)),
    vscode.commands.registerCommand('ikemen.ui.createNew', createUi),
    vscode.commands.registerCommand('ikemen.storyboard.create', createStoryboard),
    vscode.commands.registerCommand('ikemen.storyboard.createOpening', () => createStoryboard('opening')),
    vscode.commands.registerCommand('ikemen.storyboard.createEnding', () => createStoryboard('ending')),
    vscode.commands.registerCommand('ikemen.file.createNew', createAnySourceFile),
    ...SOURCE_FILE_TYPES.map((item) => vscode.commands.registerCommand(item.command, () => createSourceFile(item.extension, item.suggested, item.label)))
  );
}

module.exports = { registerAssetCreation, createCharacter, createStage, createUi, createStoryboard, assignCreatedStoryboard, createSff, createAir, airTemplate, createAnySourceFile, createSourceFile, sourceFileTemplate, sourcePickerItems, chooseAuthoringCoordinates, approveCreationPlan, SOURCE_FILE_TYPES, SOURCE_PICKER_SECTIONS };
