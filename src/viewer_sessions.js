'use strict';
const path = require('path');
const records = new Map(), pending = new Map();
let sequence = 0;
// Only routes that accept an explicit source and acknowledge selection restoration.
const COMMANDS = Object.freeze({production_workflow:'ikemen.productionWorkflow.open',select_def:'ikemen.selectDef.openWorkspace',character_health:'ikemen.characterHealth.open',character_dependency:'ikemen.characterDependencies.open',test_session:'ikemen.testSessions.open',project_manager:'ikemen.projectManager.open',mutation_history:'ikemen.mutations.openHistory',cns_converter:'ikemen.cnsConverter.open',menu_modes:'ikemen.menuModes.openCreator',story_dialogue:'ikemen.storyDialogue.openCreator',palette_index_organizer:'ikemen.paletteOrganizer.open',artist_intake:'ikemen.artistIntake.open',sff_assembly:'sff.openAssembly',move_lab:'ikemen.moveLab.open',spatial_composer:'ikemen.explodComposer.open',helper:'ikemen.helperLab.open',throw_creator:'ikemen.throwCreator.open',hitdef:'ikemen.hitDef.openEditor',palfx_editor:'zss.openPalFxEditor',screenpack:'ikemen.ui.openWorkspace',sff:'sff.openViewer', air:'air.openAnimationPreview', snd:'snd.openViewer', move_constants:'ikemen.moveConstants.open', code_structure:'ikemen.codeStructure.openWorkspace', command_movelist:'ikemen.commandMovelist.openEditor', stage:'ikemen.stage.openWorkspace', storyboard:'ikemen.storyboard.open'});
const HISTORY_KINDS = Object.freeze({production_workflow:'workflow',select_def:'roster',character_health:'health',character_dependency:'connections',test_session:'tests',project_manager:'project_manager',mutation_history:'mutation_history',cns_converter:'cns_converter',menu_modes:'menu_modes',story_dialogue:'story_dialogue',palette_index_organizer:'palette_index_organizer',artist_intake:'artist_intake',sff_assembly:'sff_assembly',move_lab:'move_lab',spatial_composer:'spatial_composer',helper:'helper',throw_creator:'throw_creator',hitdef:'hitdef',palfx_editor:'palfx_editor',screenpack:'screenpack',sff:'sff',air:'air',snd:'snd',move_constants:'constants',code_structure:'code',command_movelist:'commands',stage:'stage',storyboard:'storyboard'});
const key = file => path.resolve(file).toLowerCase();
function register(panel, seed, kind, explicit = false) {
  const file = seed?.fsPath || seed;
  if (['palette_index_organizer','hitdef'].includes(kind) && !explicit) return;
  if (!panel?.webview || typeof file !== 'string' || !COMMANDS[kind]) return;
  const first = !records.has(panel);
  records.set(panel, {file,kind});
  if (!first) return;
  panel.webview.onDidReceiveMessage(message => {
    if (message?.type !== 'ikemenPresetState') return;
    const request = pending.get(message.id);
    if (request?.panel === panel) request.finish({reference:message.reference});
  });
  panel.onDidDispose(() => {
    records.delete(panel);
    for (const request of [...pending.values()]) if (request.panel === panel) request.finish(null);
  });
}
async function capture() {
  // One deadline for the whole layout; a stalled viewer cannot delay every other viewer.
  return Promise.all([...records].map(async ([panel, record]) => {
    const response = await new Promise(resolve => {
      const id = ++sequence, timer = setTimeout(() => finish(null), 1500);
      function finish(value) { clearTimeout(timer); pending.delete(id); resolve(value); }
      pending.set(id, {panel,finish});
      Promise.resolve().then(() => panel.webview.postMessage({type:'ikemenPresetCapture',id})).then(sent => {if(sent === false) finish(null);}).catch(() => finish(null));
    });
    if (!records.has(panel) || records.get(panel) !== record) throw Error('A viewer changed while saving the layout. Try saving the preset again.');
    if (!response) throw Error('A viewer did not respond. The previous preset was kept; wait for the viewer to finish loading and try again.');
    const context=require('./viewer_navigation').archiveContext(record.file);
    const archiveContext=context?{ownerDef:context.ownerDef,prefix:context.prefix,manual:context.record?.source==='Archive selected manually'}:undefined;
    return {...record,group:panel.viewColumn||1,active:!!panel.active,preview:false,reference:response.reference,archiveContext};
  }));
}
function find(file,kind) { return [...records].find(([,record]) => key(record.file) === key(file) && record.kind === kind)?.[0]; }
function updateSource(panel,file) {const record=records.get(panel);if(record&&key(record.file)!==key(file))records.set(panel,{...record,file});}
function unregister(panel) {records.delete(panel);for(const request of [...pending.values()])if(request.panel===panel)request.finish(null);}
module.exports = {COMMANDS,HISTORY_KINDS,register,capture,find,updateSource,unregister,has:panel=>records.has(panel)};
