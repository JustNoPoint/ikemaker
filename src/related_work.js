'use strict';

const fs = require('fs');
const path = require('path');
const vscode = require('vscode');
const { parseDef, sections, value, unquote } = require('./def_model');
const { nearestCharacterDef, chooseCharacterDef } = require('./character_picker');
const { gameRoot } = require('./character_context');

const SCREEN_LABELS = Object.freeze({
  character: 'Character', sff: 'SFF', air: 'AIR', snd: 'SND', palette: 'Palette', palfx: 'PalFX',
  commands: 'Commands', code: 'Code', constants: 'Move Data', connections: 'Connections', roster: 'Roster',
  menus: 'Menus', story: 'Story', stage: 'Stage', screenpack: 'Screenpack', workflow: 'Workflow', tests: 'Tests',
  recovery: 'Recovery', health: 'Character Health', converter: 'CNS → ZSS', throws: 'Throw Creator', moves: 'Move Lab', explods: 'Explod Composer', position: 'Position & Camera', helpers: 'Helper Lab'
});

function exists(filename) { return Boolean(filename && fs.existsSync(filename)); }
function fileSeed(seed) { return seed?.fsPath || (typeof seed === 'string' ? seed : '') || vscode.window.activeTextEditor?.document?.fileName || ''; }
function resolveAssigned(defPath, text) {
  const result = { def: defPath, code: [] };
  if (!exists(defPath)) return result;
  try {
    const document = parseDef(typeof text==='string'?text:fs.readFileSync(defPath, 'utf8'), defPath), files = sections(document, 'files')[0];
    if (!files) return result;
    const resolve = (entry) => entry ? path.resolve(path.dirname(defPath), unquote(entry)) : '';
    result.sff = resolve(value(files, 'sprite', value(files, 'sff', '')));
    result.air = resolve(value(files, 'anim', value(files, 'air', '')));
    result.snd = resolve(value(files, 'sound', ''));
    result.commands = resolve(value(files, 'cmd', ''));
    result.constants = resolve(value(files, 'cns', ''));
    result.movelist = resolve(value(files, 'movelist', ''));
    for (const entry of files.entries || []) {
      if (!/^st(?:common|\d*)$/i.test(entry.key || '')) continue;
      const filename = require('./character_dependency_model').assignedPath(defPath, entry.value, entry.key); if (filename) result.code.push(filename);
    }
    for (const filename of [result.commands, result.constants]) if (filename && !result.code.includes(filename)) result.code.push(filename);
  } catch (_) {}
  return result;
}

function firstExisting(...filenames) { return filenames.find(exists) || ''; }
function gameFiles(root) {
  if (!root) return {};
  const data = path.join(root, 'data');
  return { select: firstExisting(path.join(data, 'select.def'), path.join(root, 'select.def')), system: firstExisting(path.join(data, 'system.def'), path.join(root, 'system.def')) };
}

function relatedWorkHtml() {
  return '<button class="ikemen-related-work" data-ikemen-related title="Open source files and visual workspaces connected to this screen">Related Work…</button>';
}

function relatedWorkClientScript(kind = '') {
  return `for(const button of document.querySelectorAll('[data-ikemen-related]'))button.onclick=()=>vscode.postMessage({type:'ikemenRelatedWork',kind:${JSON.stringify(kind)}});`;
}

function separator(label) { return { label, kind: vscode.QuickPickItemKind.Separator }; }
function item(label, description, target, filename = '') { return { label, description, target, filename }; }
function currentItems(kind, seed, assets, root) {
  const entries = [], files = gameFiles(root), add = (entry) => { if (entry && !entries.some((current) => current.target === entry.target && current.filename === entry.filename)) entries.push(entry); };
  if (exists(seed) && fs.statSync(seed).isFile()) add(item('$(file-code) Open current source file', seed, 'source', seed));
  if (assets.def) {
    entries.push(separator('Character authoring'));
    add(item('$(home) Character work session', 'Choose a focused set of connected character tools', 'character', assets.def));
    add(item('$(dashboard) Move Lab', 'Moves, throws, assets, code, diagnostics, tests, and recovery in one shell', 'moves', assets.def));
    add(item('$(type-hierarchy) Character connection tree', 'DEF assignments, code relationships, and missing dependencies', 'connections', assets.def));
    add(item('$(symbol-structure) Visual code structure', 'Open a connected ZSS, CNS, CMD, or DEF file as a visual tree', 'code', assets.code.find(exists) || assets.def));
    add(item('$(replace-all) CNS → ZSS converter', 'Review and convert one CNS state file or every CNS state file assigned by this character', 'converter', assets.code.find((file) => /\.cns$/i.test(file)) || assets.def));
    add(item('$(list-tree) Commands and movelist', 'Inputs, timing, buffers, and displayed move text', 'commands', assets.def));
    add(item('$(settings-gear) Move constants', 'Attack data with AIR, collision, and reaction preview', 'constants', assets.def));
    add(item('$(combine) Throw Creator', 'Coordinate P1/P2 timing, binds, interaction events, parts, and reviewed native code', 'throws', assets.def));
    add(item('$(sparkle) Explod Composer', 'Place and animate character-, world-, or screen-anchored effects', 'explods', assets.def));
    add(item('$(move) Position & Camera', 'Place fighters and targets, author binds, velocity, bounds, and reviewed camera-sensitive code', 'position', assets.def));
    add(item('$(type-hierarchy-sub) Helper Lab', 'Create helpers, trace nested helper trees, and review map data flow', 'helpers', assets.def));
    entries.push(separator('Character assets'));
    if (exists(assets.sff)) add(item('$(symbol-color) SFF sprite workspace', assets.sff, 'sff', assets.sff));
    if (exists(assets.air)) add(item('$(play) AIR animation workspace', assets.air, 'air', assets.air));
    if (exists(assets.snd)) add(item('$(unmute) SND sound workspace', assets.snd, 'snd', assets.snd));
    add(item('$(symbol-color) Sprite and palette import', 'Preflight indexed images, then continue into the SFF', 'palette', assets.sff || assets.def));
    add(item('$(paintcan) PalFX and true-color FX', 'Build reusable PalFX and layered true-color effects', 'palfx', assets.def));
    entries.push(separator('Debug and testing'));
    add(item('$(beaker) Test and diagnostic suite', 'Run applicable project and character tests', 'tests', assets.def));
    add(item('$(shield) Character health and cleanup', 'Audit shadowed parameters, unknown options, AIR blocks, and missing files', 'health', assets.def));
    entries.push(separator('Production'));
    add(item('$(checklist) Production workflow', 'Tickets, subtasks, review, evidence, and signoff', 'workflow', assets.def));
  }
  if (root) {
    entries.push(separator('Game and presentation'));
    add(item('$(person-add) Roster manager', 'select.def, portraits, stages, order, and player setup', 'roster', files.select || root));
    add(item('$(menu) Menu and mode editor', 'Player menus, custom modes, and creator recipes', 'menus', files.system || files.select || root));
    add(item('$(comment-discussion) Story and dialogue', 'Routes, dialogue, portraits, and story launch data', 'story', files.select || root));
    add(item('$(layout) Screenpack and fight UI', 'Motif-backed screen and UI composition', 'screenpack', files.system || root));
    add(item('$(map) Stage workspace', 'Stage layers, camera, parallax, and stage rig', 'stage', root));
    entries.push(separator('Safety'));
    add(item('$(history) Recovery center', 'Review backups and restore transactional edits', 'recovery', root));
  }
  const preferred = {
    sff: ['air', 'palette', 'palfx', 'code', 'connections', 'tests'], air: ['sff', 'constants', 'code', 'connections', 'tests'],
    snd: ['code', 'connections', 'tests'], palette: ['sff', 'palfx', 'character'], palfx: ['sff', 'air', 'code'],
    commands: ['code', 'constants', 'air', 'connections', 'tests'], code: ['connections', 'converter', 'air', 'constants', 'commands', 'tests'],
    constants: ['air', 'sff', 'throws', 'explods', 'position', 'helpers', 'code', 'tests'], throws: ['air', 'sff', 'explods', 'position', 'helpers', 'constants', 'code', 'tests'], explods: ['air', 'sff', 'palfx', 'position', 'throws', 'helpers'], position: ['air', 'throws', 'explods', 'helpers', 'stage'], helpers: ['code', 'connections', 'position', 'explods', 'air', 'tests'], connections: ['code', 'sff', 'air', 'snd', 'helpers', 'workflow'],
    roster: ['screenpack', 'menus', 'story', 'stage'], menus: ['roster', 'screenpack', 'story', 'code'], story: ['roster', 'screenpack', 'snd'],
    stage: ['screenpack', 'roster', 'code', 'tests'], screenpack: ['roster', 'menus', 'story', 'code'], workflow: ['tests', 'connections', 'character'],
    tests: ['workflow', 'connections', 'character', 'health'], recovery: ['character', 'workflow'], health: ['code', 'air', 'connections', 'tests', 'recovery']
  }[kind] || [];
  for (const entry of entries) if (entry.target) entry.alwaysShow = preferred.includes(entry.target);
  return entries;
}

async function chooseCodeFile(assets) {
  const files = assets.code.filter(exists);
  if (files.length <= 1) return files[0] || assets.def;
  const picked = await vscode.window.showQuickPick(files.map((filename) => ({ label: path.basename(filename), description: filename, filename })), { title: 'Choose connected code file', matchOnDescription: true });
  return picked?.filename || '';
}

const TARGET_COMMANDS = {
    character: 'ikemen.workbench.registerDef', moves: 'ikemen.moveLab.open', connections: 'ikemen.characterDependencies.open', code: 'ikemen.codeStructure.openWorkspace',
    commands: 'ikemen.commandMovelist.openEditor', constants: 'ikemen.moveConstants.open', throws: 'ikemen.throwCreator.open', explods: 'ikemen.explodComposer.open', position: 'ikemen.positionCamera.open', helpers: 'ikemen.helperLab.open', sff: 'sff.openViewer', air: 'air.openAnimationPreview',
    snd: 'snd.openViewer', palette: 'ikemen.paletteImport.open', palfx: 'zss.openPalFxEditor', workflow: 'ikemen.productionWorkflow.open',
    tests: 'ikemen.testSessions.open', health: 'ikemen.characterHealth.open', converter: 'ikemen.cnsConverter.open', roster: 'ikemen.selectDef.openWorkspace', menus: 'ikemen.menuModes.openCreator',
    story: 'ikemen.storyDialogue.openCreator', screenpack: 'ikemen.ui.openWorkspace', stage: 'ikemen.stage.openWorkspace', recovery: 'ikemen.mutations.openHistory'
  };
function commandForTarget(target){if(require('./interface_mode').current()==='player'){if(target==='menus')return 'ikemen.menuModes.openPlayer';if(target==='story')return 'ikemen.storyDialogue.openPlayer';}return TARGET_COMMANDS[target];}
async function executeTarget(choice, assets, root) {
  let filename = choice.filename;
  if (choice.target === 'source') return vscode.window.showTextDocument(await vscode.workspace.openTextDocument(vscode.Uri.file(filename)), { preview: false });
  if (choice.target === 'code') filename = await chooseCodeFile(assets);
  const uri = filename && exists(filename) ? vscode.Uri.file(filename) : undefined;

  const command = commandForTarget(choice.target);
  if (command) return vscode.commands.executeCommand(command, uri || (root ? vscode.Uri.file(root) : undefined));
}

async function openRelatedWork(seed, kind = '') {
  const start=fileSeed(seed),navigation=require('./viewer_navigation'),owner=await navigation.resolveOwner(start,false);
  if(!owner)return;
  const {def,inherited}=owner,root=gameRoot(start||def),assets=resolveAssigned(def);
  if(inherited)for(const target of ['sff','air','snd'])assets[target]=inherited.record[target]||'';
  let items=currentItems(kind,start,assets,root).filter(item=>!item.target||!commandForTarget(item.target)||require('./interface_capabilities').allows(commandForTarget(item.target)));
  items=items.filter((item,index)=>item.target||items.slice(index+1).some(next=>next.target));
  if (!items.some((entry) => entry.target)) {
    const pickedDef = await chooseCharacterDef(seed?.fsPath ? seed : undefined, { title: 'Choose context for Related Work' });
    if (!pickedDef) return;
    return openRelatedWork(vscode.Uri.file(pickedDef), kind);
  }
  const picked = await vscode.window.showQuickPick(items, { title: `${SCREEN_LABELS[kind] || 'IKEMEN'} — Related Work`, placeHolder: 'Open a connected source file, visual editor, or production screen', matchOnDescription: true });
  if(['sff','air','snd'].includes(picked?.target))return navigation.openConnected(start,picked.target,undefined,undefined,undefined,owner);
  if (picked?.target) return executeTarget(picked, assets, root);
}

async function handleRelatedWorkMessage(message, seed, defaultKind = '') {
  if (!message || message.type !== 'ikemenRelatedWork') return false;
  await openRelatedWork(seed?.fsPath ? seed : (seed ? vscode.Uri.file(seed) : undefined), message.kind || defaultKind);
  return true;
}

function registerRelatedWork(context) {
  context.subscriptions.push(vscode.commands.registerCommand('ikemen.relatedWork.open', (uri, kind) => openRelatedWork(uri, kind)));
}

module.exports = { SCREEN_LABELS, resolveAssigned, gameFiles, relatedWorkHtml, relatedWorkClientScript, currentItems, openRelatedWork, handleRelatedWorkMessage, registerRelatedWork };
