'use strict';

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parseDef, sections, value, unquote } = require('./def_model');
const {
  parseCommands, diagnosticsFor, commandBlock, replaceCommandBlock, patchCommandBlock,
  parseMovelistAssignments, movelistPreview, changeMovelistSnippet, INSERTABLE_INPUTS,
  commandStepLayout, replaceStepCores, editCommandSteps
} = require('./command_movelist_model');
const { owningCharacterDefs, gameRoot: characterGameRoot } = require('./character_context');
const { chooseCharacterDef } = require('./character_picker');
const { PRESETS, presetText, findPreset, upsertCustomPreset, removeCustomPreset } = require('./command_presets');
const { mode } = require('./experience');
const { workspaceExperience } = require('./experience_model');
const { workflowFor, workflowHtml, advancedActionBarHtml, taskRecipesHtml, workflowClientScript } = require('./guided_workflows');
const { launchControlsHtml, launchControlsClientScript, handleLaunchMessage } = require('./launch_controls');
const { registerCharacterToolPanel } = require('./authoring_context_registry');
const { preferredViewerColumn, trackViewerPanel } = require('./viewer_group');
const { loadGlyphCatalog, glyphSegmentsCore, glyphWarnings } = require('./movelist_glyph_model');
const { commandValues } = require('./command_movelist_navigation');

const handlers = new WeakMap();
const openPanels = new Map();
const glyphRootOverrides = new WeakMap();
let extensionContext;
function presetScopeKey(seed) {
  const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(seed));
  return `commandPresets:${path.resolve(folder ? folder.uri.fsPath : path.dirname(seed)).toLowerCase()}`;
}
function customPresets(seed) {
  if (!extensionContext || !extensionContext.workspaceState || typeof extensionContext.workspaceState.get !== 'function') return [];
  return (extensionContext.workspaceState.get(presetScopeKey(seed), []) || []).map((preset) => ({
    ...preset, kind: 'native', category: 'Custom · this workspace', custom: true,
    explanation: 'User-saved complete native definition set. Built-in presets remain unchanged.',
    previewText: preset.text
  }));
}
function panelKey(seed) { return path.resolve(seed).toLowerCase(); }
function rememberPanel(panel, seed) {
  const key = panelKey(seed), existing = openPanels.get(key);
  if (existing && existing !== panel) { panel.dispose(); return false; }
  if (!existing) {
    openPanels.set(key, panel);
    panel.onDidDispose(() => { if (openPanels.get(key) === panel) openPanels.delete(key); });
  }
  return true;
}

function json(value) { return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026'); }
function exists(filename) { return filename && fs.existsSync(filename) && fs.statSync(filename).isFile(); }
function hashText(text) { return crypto.createHash('sha256').update(String(text || '')).digest('hex'); }
function openDocument(filename) { return (vscode.workspace.textDocuments || []).find((document) => path.resolve(document.fileName || document.uri?.fsPath || '').toLowerCase() === path.resolve(filename || '').toLowerCase()); }
function currentText(filename) { const document = openDocument(filename); return document ? document.getText() : exists(filename) ? fs.readFileSync(filename, 'utf8') : ''; }
function resolveFrom(owner, relative) { return relative ? path.resolve(path.dirname(owner), unquote(relative)) : ''; }

function nearestCharacterDef(filename) {
  let directory = exists(filename) ? path.dirname(filename) : filename;
  const extension = path.extname(filename || '').toLowerCase();
  const commandTarget = ['.cmd', '.inp', '.jnp'].includes(extension) ? path.resolve(filename).toLowerCase() : '';
  const movelistTarget = extension === '.dat' ? path.resolve(filename).toLowerCase() : '';
  for (let depth = 0; directory && depth < 5; depth += 1) {
    if (fs.existsSync(directory)) {
      const defs = fs.readdirSync(directory).filter((name) => /\.def$/i.test(name)).map((name) => path.join(directory, name));
      const character = defs.find((candidate) => {
        try { const document = parseDef(fs.readFileSync(candidate, 'utf8'), candidate); return sections(document, 'files').some((section) => { const command = value(section, 'cmd', ''), movelist = value(section, 'movelist', ''); if (commandTarget) return command && resolveFrom(candidate, command).toLowerCase() === commandTarget; if (movelistTarget) return movelist && resolveFrom(candidate, movelist).toLowerCase() === movelistTarget; return Boolean(command); }); } catch (_) { return false; }
      });
      if (character) return character;
    }
    const parent = path.dirname(directory); if (parent === directory) break; directory = parent;
  }
  return '';
}

function contextFiles(seed, readText = file => fs.readFileSync(file, 'utf8')) {
  const extension = path.extname(seed || '').toLowerCase();
  let defFile = extension === '.def' ? seed : nearestCharacterDef(seed);
  let commandFile = ['.inp', '.cmd', '.jnp'].includes(extension) ? seed : '';
  let movelistFile = extension === '.dat' ? seed : '';
  let movelists = [];
  if (exists(defFile)) {
    const document = parseDef(readText(defFile), defFile), files = sections(document, 'files')[0];
    if (!commandFile && files) commandFile = resolveFrom(defFile, value(files, 'cmd', ''));
    movelists = parseMovelistAssignments(document.text, defFile);
    if (!movelistFile) movelistFile = (movelists.find((item) => item.slot === 0) || movelists[0] || {}).resolved || '';
  }
  return { defFile, commandFile, movelistFile, movelists };
}

function payload(seed, options = {}) {
  const files = contextFiles(seed), commandText = currentText(files.commandFile);
  const commandDocument = parseCommands(commandText, files.commandFile);
  const commands = commandDocument.commands.map((command, index) => ({
    ...command, entries: undefined, diagnostics: diagnosticsFor(command, commandDocument.commands), index
  }));
  const initialCommandIndex = options.commandFile && path.resolve(options.commandFile).toLowerCase() === path.resolve(files.commandFile || '').toLowerCase()
    ? commands.findIndex(command => Number(options.line) >= command.startLine && Number(options.line) < command.endLine) : -1;
  const movelistText = currentText(files.movelistFile);
  let glyphCatalog;
  const glyphRoot = Object.prototype.hasOwnProperty.call(options, 'glyphRoot') ? options.glyphRoot : typeof characterGameRoot === 'function' ? characterGameRoot(files.defFile || files.movelistFile || seed) : '';
  try { glyphCatalog = loadGlyphCatalog(files.defFile || files.movelistFile || seed, { root: glyphRoot }); }
  catch (error) { glyphCatalog = { state: 'unresolved', reason: error.message, entries: [], tokens: [] }; }
  return {
    files, defaults: commandDocument.defaults, commands, movelistText, initialCommandIndex,
    movelistEol: movelistText.includes('\r\n') ? '\r\n' : '\n', glyphCatalog,
    commandFingerprint: hashText(commandText), movelistFingerprint: hashText(movelistText),
    movelistPreview: movelistPreview(movelistText),
    knownTimings: [
      { label: 'Double direction reference', sequence: 'U, U', stepTime: 5 },
      { label: 'Special-window reference', sequence: 'D, D', stepTime: 10 },
      { label: 'Long sequence reference', sequence: 'x, x, F, a, z', stepTime: 17 },
      { label: '360 / 720 reference', sequence: 'direction chain', stepTime: 20 }
    ], insertableInputs: INSERTABLE_INPUTS,
    presets: [...PRESETS.map((preset) => ({ ...preset, previewText: presetText(preset), custom: false })), ...customPresets(seed)]
  };
}

function html(data) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
  .movelist-tabs,.glyph-tools{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:10px 0}.glyph-tools select{min-width:260px}.preview-row.selected{background:#17363c}.preview-row.issue-line{border-left:3px solid var(--warn)}.preview-line{min-height:30px;white-space:pre-wrap;text-align:left;width:100%}.glyph{display:inline-flex;align-items:center;justify-content:center;min-height:25px;vertical-align:middle}.glyph.selected{outline:2px solid var(--warn)}.glyph img{display:block;max-height:30px;width:auto}.glyph.unresolved{border-color:var(--bad);color:var(--bad)}.source-path{word-break:break-all}
  :root{color-scheme:dark;--panel:#191d24;--line:#39424e;--accent:#39cad1;--muted:#9aa8b7;--warn:#e7bd4a;--bad:#ff7171;--good:#83da83}*{box-sizing:border-box}body{margin:0;background:#101319;color:#e7edf4;font:12px var(--vscode-font-family,Segoe UI);overflow:hidden}.app{height:100vh;display:grid;grid-template-rows:auto minmax(0,1fr) 28px;min-width:0}.bar{display:flex;flex-wrap:wrap;max-height:40vh;overflow:auto;align-items:center;gap:7px;padding:7px 10px;background:var(--panel);border-bottom:1px solid var(--line)}button,input,textarea,select{font:inherit;color:inherit;background:#252b34;border:1px solid #4a5664;border-radius:3px;padding:6px}button.active{background:#12505a;border-color:var(--accent)}.spacer{flex:1}.workspace{display:grid;grid-template-columns:260px minmax(0,1fr) 350px;min-height:0}.workspace>*{min-width:0;min-height:0}.bar>*{min-width:0;max-width:100%}.bar>.launch-controls{flex:1 0 100%}.pane{overflow:auto;padding:10px;background:var(--panel)}.left{border-right:1px solid var(--line)}.right{border-left:1px solid var(--line)}.center{overflow:auto;padding:14px}h2,h3{margin:5px 0 9px;font-size:12px;text-transform:uppercase;letter-spacing:.07em}.item{padding:7px;border-bottom:1px solid #2d343d;cursor:pointer}.item.active{background:#164a52}.item small,.muted{color:var(--muted)}.grid{display:grid;grid-template-columns:140px minmax(0,1fr);gap:8px;align-items:center}.grid input,.grid textarea{width:100%}.sequence{font:15px var(--vscode-editor-font-family,monospace)}.timeline-summary,.step-tools{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:12px}.timeline-summary output{font-weight:700;color:var(--accent)}.step-tools select{min-width:260px}.timeline{display:flex;gap:8px;align-items:center;overflow:auto;padding:12px 4px}.step{min-width:165px;padding:8px;border:1px solid #526171;background:#202730;text-align:left}.step.selected{border:2px solid var(--accent);background:#17363c}.step input{width:100%;margin:4px 0}.step .life{display:grid;grid-template-columns:1fr 58px;gap:4px;align-items:center;color:var(--muted);font-size:10px}.arrow{display:flex;align-items:center;color:var(--accent)}.help{padding:8px;margin:7px 0;background:#151a20;border:1px solid var(--line);line-height:1.4}.issue{padding:7px;margin:5px 0;border-left:3px solid #738399;background:#222832}.issue.error{border-color:var(--bad)}.issue.warning{border-color:var(--warn)}.issue.suggestion{border-color:var(--good)}.native{white-space:pre-wrap;font:12px var(--vscode-editor-font-family,monospace);background:#0d1117;padding:10px;border:1px solid var(--line)}#presetDraft{width:100%;min-height:150px}.preset-draft{border:1px solid var(--accent);padding:10px;margin:10px 0;background:#121a20}#movelistEditor{width:100%;height:48vh;font:12px var(--vscode-editor-font-family,monospace)}.preview-row{display:grid;grid-template-columns:40px 1fr;gap:6px;padding:3px;border-bottom:1px solid #29313a}.glyph{display:inline-block;padding:2px 5px;margin:1px;background:#164a52;border:1px solid #28717a}.status{padding:5px 10px;background:var(--panel);border-top:1px solid var(--line);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.hidden{display:none}@media(max-width:1100px){.workspace{display:block;overflow:auto}.workspace.hidden{display:none}.left{max-height:240px}.center,.right{overflow:visible}.grid input,.grid select{min-width:0}}@media(max-width:480px){.grid{grid-template-columns:minmax(0,1fr)}.center{padding:10px}.left .command-tools{grid-template-columns:minmax(0,1fr)}.timeline-summary .spacer{display:none}.step-tools select{min-width:0;width:100%}}
  </style></head><body><div class="app"><header class="bar"><b>Command & Movelist</b><button id="commandTab" class="active">Command definitions</button><button id="movelistTab">Displayed movelist</button><span class="spacer"></span><button id="openSource">Open source</button><button id="openDef">Open character DEF</button></header><div class="workspace" id="commandWorkspace"><aside class="pane left"><h2>Native commands</h2><button id="addCommand">+ Add command</button><div id="commands"></div><h3>Command presets</h3><p class="muted">Choose a preset, edit its complete definition set if desired, then apply it explicitly.</p><div id="references"></div></aside><main class="center"><h2 id="commandTitle">Command</h2><div id="presetPanel" class="preset-draft hidden"><h3 id="presetTitle">Preset draft</h3><p class="muted">This draft may contain paired same-named definitions. Editing it does not change the character until Apply.</p><textarea id="presetDraft" class="native"></textarea><div><button id="applyPreset">Apply preset definition set</button><button id="saveCustomPreset">Save as Preset</button><button id="closePreset">Close preset draft</button></div><p class="muted">Custom presets stay in this VS Code workspace and do not create files in the character or game folders.</p></div><div class="grid"><label title="Case-sensitive name used by command triggers and state code.">Name</label><input id="name" title="Case-sensitive command name."><label title="Comma-separated native IKEMEN input symbols.">Native sequence</label><input id="sequence" class="sequence" title="Edit directly or use the step boxes below."><label title="Maximum frames allowed from the first completed step through the full command. IKEMEN 1.0 expects at least 1.">Whole-command time</label><input id="time" type="number" min="1" title="Native command.time. Minimum 1 in IKEMEN 1.0."><label title="Frames that each completed step remains active while waiting for the next. -1 inherits Whole-command time.">Step-to-step time</label><input id="steptime" type="number" min="-1" title="Native steptime. -1 inherits command.time; it does not mean unlimited."><label title="IKEMEN normally expands repeated directions such as F,F into F, >~F, >F. Disable this to keep the sequence exactly as authored.">Autogreater</label><select id="autogreater" title="Controls automatic repeated-direction expansion."><option value="1">Enabled</option><option value="0">Disabled</option></select><label title="Frames the completed command remains valid. Native range is 1–30.">Buffer time</label><input id="bufferTime" type="number" min="1" max="30" title="Native buffer.time: completed-command lifetime."><label title="If No, an already completed command does not remain buffered through hitpause.">Buffer during hitpause</label><select id="bufferHitpause" title="Native buffer.hitpause."><option value="1">Yes</option><option value="0">No</option></select><label title="If No, the command does not remain buffered during a Pause/SuperPause endcmdbuftime window.">Buffer through pause end</label><select id="bufferPauseend" title="Native buffer.pauseend."><option value="1">Yes</option><option value="0">No</option></select><label title="If No, this buffer is not reset when another same-named command completes.">Share buffer</label><select id="bufferShared" title="Native buffer.shared."><option value="1">Yes</option><option value="0">No</option></select></div><div class="timeline-summary"><h3>Editable input timeline</h3><span class="spacer"></span><span>Whole command window:</span><output id="wholeTime">0 frames</output></div><div class="step-tools"><select id="inputChoice" aria-label="Input to insert"></select><button id="addStep">+ Add Input Step</button><button id="insertBefore">Insert Before</button><button id="insertAfter">Insert After</button><button id="duplicateStep">Duplicate</button><button id="moveStepLeft">Move Left</button><button id="moveStepRight">Move Right</button><button id="removeStep">Remove</button></div><p class="muted">L/R are absolute screen directions. B/F are relative to the character's facing. The choice changes only the step you insert.</p><div class="timeline" id="timeline" aria-label="Editable input steps"></div><div class="help"><b>Native timing note:</b> IKEMEN stores one <code>steptime</code> for every transition, not a separate value per step. Editing any “next-step life” box updates all of them. The final box edits <code>buffer.time</code>. In IKEMEN 1.0, <code>steptime = -1</code> inherits the whole-command time; it is not an unlimited command window.</div><button id="applyCommand">Apply reviewed command</button></main><aside class="pane right"><h2>Diagnostics</h2><div id="issues"></div><h3>Native syntax</h3><pre class="native" id="native"></pre><h3>Symbols</h3><div class="muted">/ hold or charge · ~ release · + simultaneous · | alternative · &gt; exact/consecutive · B/F facing-relative · L/R absolute · N neutral</div><h3>Field help</h3><div class="help">Hover any field name or input for its native meaning. Autogreater is IKEMEN's automatic expansion of repeated directions; for example, <code>F, F</code> becomes <code>F, &gt;~F, &gt;F</code>.</div></aside></div><div class="workspace hidden" id="movelistWorkspace"><aside class="pane left"><h2>Assigned lists</h2><div id="movelistAssignments"></div><h3>Native switching</h3><button id="copyChangeMovelist">Copy ChangeMovelist example</button><p class="muted">The character DEF can assign movelist, movelist1, movelist2, and later slots. ChangeMovelist selects the active native list.</p></aside><main class="center"><h2>Displayed move text</h2><textarea id="movelistEditor"></textarea><div><button id="saveMovelist">Apply reviewed movelist</button><button id="refreshPreview">Refresh preview</button></div></main><aside class="pane right"><h2>Glyph/token preview</h2><div id="movelistPreview"></div></aside></div><footer class="status" id="status"></footer></div><script>
  ${commandStepLayout.toString()}
  ${replaceStepCores.toString()}
  ${editCommandSteps.toString()}
  const vscode=acquireVsCodeApi(),data=${json(data)};let selected=data.initialCommandIndex>=0?data.initialCommandIndex:0,selectedStep=0,activeTab="command",presetId='',orphanDraft=false;
  const byId=id=>document.getElementById(id),esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const restoredUi=vscode.getState()||{},commandDrafts=restoredUi.commandDrafts||{},presetDrafts=restoredUi.presetDrafts||{};
  function number(id,fallback){const result=Number(byId(id).value);return Number.isFinite(result)?result:fallback}
  function selectedCommand(){return data.commands[selected]||null}
  function values(){return{name:byId('name').value,command:byId('sequence').value,time:number('time',15),steptime:number('steptime',-1),autogreater:number('autogreater',1),bufferTime:number('bufferTime',1),bufferHitpause:number('bufferHitpause',1),bufferPauseend:number('bufferPauseend',1),bufferShared:number('bufferShared',1)}}
  function block(v){return '[Command]\\nname = "'+v.name.replace(/"/g,'')+'"\\ncommand = '+v.command+'\\ntime = '+v.time+'\\nsteptime = '+v.steptime+'\\nautogreater = '+v.autogreater+'\\nbuffer.time = '+v.bufferTime+'\\nbuffer.hitpause = '+v.bufferHitpause+'\\nbuffer.pauseend = '+v.bufferPauseend+'\\nbuffer.shared = '+v.bufferShared}
  function commandSourceSignature(c){return JSON.stringify([c.name,c.command,c.time,c.declaredStepTime,c.autoGreater,c.bufferTime,c.bufferHitpause,c.bufferPauseend,c.bufferShared])}
  function commandDraftKey(index=selected){const c=data.commands[index];if(!c)return'new';const signature=commandSourceSignature(c),occurrence=data.commands.slice(0,index).filter(item=>commandSourceSignature(item)===signature).length;return'existing:'+signature+':'+occurrence}
  function persistUi(extra={}){const activeCommandKey=commandDraftKey(),activeCommandDraft=commandDrafts[activeCommandKey];vscode.setState({...vscode.getState(),seed:data.files.defFile||data.files.commandFile||data.files.movelistFile,commandDrafts,presetDrafts,selected,selectedStep,activeCommandKey,activeCommandDraft,activeTab,presetId,presetOpen:!byId('presetPanel').classList.contains('hidden'),movelistDraft:byId('movelistEditor')?.value,...extra})}
  function restoreCommandSelection(){const key=restoredUi.activeCommandKey;if(!key)return;if(key==='new'&&restoredUi.activeCommandDraft){commandDrafts.new=restoredUi.activeCommandDraft;selected=data.commands.length;selectedStep=restoredUi.activeCommandDraft.selectedStep||0;return}const index=data.commands.findIndex((item,i)=>commandDraftKey(i)===key);if(index>=0){selected=index;selectedStep=restoredUi.activeCommandDraft?.selectedStep||0;return}if(restoredUi.activeCommandDraft){commandDrafts.new=restoredUi.activeCommandDraft;selected=data.commands.length;selectedStep=restoredUi.activeCommandDraft.selectedStep||0;orphanDraft=true}}
  function storeCommandDraft(){if(byId('name'))commandDrafts[commandDraftKey()]={values:values(),selectedStep}}
  function selectCommand(index){storeCommandDraft();selected=Number(index);selectedStep=commandDrafts[commandDraftKey()]?.selectedStep||0;persistUi();list();inspect(true)}
  function list(){byId('commands').innerHTML=data.commands.length?data.commands.map((c,i)=>'<div class="item '+(i===selected?'active':'')+'" data-index="'+i+'"><b>'+esc(c.name||'(unnamed)')+'</b><br><small>'+esc(c.command||'(empty)')+' · '+c.time+'f total / '+c.stepTime+'f steps</small></div>').join(''):'<p class="muted">No [Command] blocks found. Add the first native command here.</p>';document.querySelectorAll('#commands .item').forEach(row=>row.onclick=()=>selectCommand(row.dataset.index))}
  function steps(){return byId('sequence').value.split(',').map(x=>x.trim()).filter(Boolean)}
  function editSteps(operation,token){const before=steps(),next=editCommandSteps(byId('sequence').value,operation,selectedStep,token);if(next===byId('sequence').value)return;byId('sequence').value=next;if(operation==='moveLeft'&&selectedStep>0)selectedStep--;else if(operation==='moveRight'&&selectedStep<before.length-1)selectedStep++;else if(operation==='insertAfter'||operation==='duplicate')selectedStep=Math.min(selectedStep+1,Math.max(steps().length-1,0));else if(operation==='remove')selectedStep=Math.min(selectedStep,Math.max(steps().length-1,0));timeline(true)}
  function timeline(focusSelected=false){const v=values(),items=steps(),gap=v.steptime===-1?v.time:v.steptime;selectedStep=Math.min(selectedStep,Math.max(items.length-1,0));byId('wholeTime').textContent=v.time+' frame'+(v.time===1?'':'s');byId('timeline').innerHTML=items.length?items.map((step,i)=>'<div class="step '+(i===selectedStep?'selected':'')+'" data-step="'+i+'" tabindex="0" aria-label="Step '+(i+1)+(i===selectedStep?', selected':'')+'"><small>Step '+(i+1)+(i===selectedStep?' · selected':'')+'</small><input class="stepToken" data-index="'+i+'" value="'+esc(step)+'" title="Native symbols for this step"><div class="life"><span>'+(i<items.length-1?'Next-step life':'Completed buffer')+'</span><input class="stepLife" data-kind="'+(i<items.length-1?'step':'buffer')+'" type="number" min="'+(i<items.length-1?'-1':'1')+'" max="'+(i<items.length-1?'999':'30')+'" value="'+(i<items.length-1?v.steptime:v.bufferTime)+'" title="'+(i<items.length-1?'Native steptime shared by every transition. -1 inherits whole-command time.':'Native buffer.time after the command completes.')+'"></div></div>'+(i<items.length-1?'<div class="arrow" title="Current effective next-step window: '+gap+' frames">→</div>':'')).join(''):'<span class="muted">Choose an input and press Add Input Step.</span>';document.querySelectorAll('[data-step]').forEach(card=>{card.onclick=e=>{if(e.target.classList.contains('stepLife')||e.target.classList.contains('stepToken'))return;selectedStep=Number(card.dataset.step);timeline()};card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectedStep=Number(card.dataset.step);timeline(true)}}});document.querySelectorAll('.stepToken').forEach(input=>{input.onfocus=()=>{selectedStep=Number(input.dataset.index);document.querySelectorAll('.step').forEach((card,i)=>card.classList.toggle('selected',i===selectedStep))};input.onchange=()=>{const operation=input.value.trim()?'replace':'remove';byId('sequence').value=editCommandSteps(byId('sequence').value,operation,Number(input.dataset.index),input.value);selectedStep=Math.min(Number(input.dataset.index),Math.max(steps().length-1,0));timeline()}});document.querySelectorAll('.stepLife').forEach(input=>input.onchange=()=>{if(input.dataset.kind==='step')byId('steptime').value=input.value;else byId('bufferTime').value=input.value;timeline()});byId('native').textContent=block(v);if(focusSelected){const card=document.querySelector('[data-step="'+selectedStep+'"]');if(card){card.scrollIntoView({block:'nearest',inline:'center'});const input=card.querySelector('.stepToken');if(input)input.focus()}}}
  function fill(v){byId('name').value=v.name;byId('sequence').value=v.command;byId('time').value=v.time;byId('steptime').value=v.steptime;byId('autogreater').value=v.autogreater;byId('bufferTime').value=v.bufferTime;byId('bufferHitpause').value=v.bufferHitpause;byId('bufferPauseend').value=v.bufferPauseend;byId('bufferShared').value=v.bufferShared}
  function inspect(restoreDraft=false){const c=selectedCommand(),d=data.defaults,draft=restoreDraft&&commandDrafts[commandDraftKey()];if(c){byId('commandTitle').textContent=c.name||'Unnamed command';fill(draft?.values||{name:c.name,command:c.command,time:c.time,steptime:c.declaredStepTime,autogreater:c.autoGreater,bufferTime:c.bufferTime,bufferHitpause:c.bufferHitpause,bufferPauseend:c.bufferPauseend,bufferShared:c.bufferShared});byId('issues').innerHTML=c.diagnostics.length?c.diagnostics.map(x=>'<div class="issue '+x.severity+'"><b>'+esc(x.severity.toUpperCase())+'</b><br>'+esc(x.message)+'</div>').join(''):'<div class="issue suggestion">No model-level issues.</div>'}else{byId('commandTitle').textContent='New command';fill(draft?.values||{name:'qcf_x',command:'D, DF, F, x',time:d.time,steptime:d.stepTime,autogreater:d.autoGreater,bufferTime:d.bufferTime,bufferHitpause:d.bufferHitpause,bufferPauseend:d.bufferPauseend,bufferShared:d.bufferShared});byId('issues').innerHTML='<div class="issue">New command is not written until you review and apply it.</div>'}if(draft)selectedStep=draft.selectedStep||0;timeline()}
  ['name','sequence','time','steptime','autogreater','bufferTime','bufferHitpause','bufferPauseend','bufferShared'].forEach(id=>byId(id).oninput=()=>{timeline();storeCommandDraft();persistUi()});
  const drawTimeline=timeline;timeline=function(focusSelected=false){drawTimeline(focusSelected);const items=steps(),v=values();byId('duplicateStep').disabled=!items.length;byId('removeStep').disabled=!items.length;byId('moveStepLeft').disabled=!items.length||selectedStep===0;byId('moveStepRight').disabled=!items.length||selectedStep===items.length-1;byId('applyCommand').disabled=!v.name.trim()||!v.command.trim();storeCommandDraft();persistUi()};
  const drawInspect=inspect;inspect=function(restoreDraft=false){drawInspect(restoreDraft);if(orphanDraft&&!selectedCommand())byId('issues').innerHTML='<div class="issue warning"><b>Recovered draft</b><br>The original source command changed or moved. Your draft is preserved as a pending new command so it cannot overwrite the wrong definition.</div>'};
  byId('timeline').addEventListener('keydown',event=>{if(event.target!==event.currentTarget&&event.target.closest('input,textarea,select,button'))event.stopPropagation()},true);byId('timeline').addEventListener('focusin',event=>{const input=event.target.closest('.stepToken');if(!input)return;selectedStep=Number(input.dataset.index);document.querySelectorAll('.step').forEach((card,index)=>card.classList.toggle('selected',index===selectedStep));const items=steps();byId('moveStepLeft').disabled=selectedStep===0;byId('moveStepRight').disabled=selectedStep===items.length-1;storeCommandDraft();persistUi()});
  byId('inputChoice').innerHTML=(data.insertableInputs||[]).map(x=>'<option value="'+esc(x.value)+'">'+esc(x.value+' — '+x.label.replace(/^.*? — /,''))+'</option>').join('');
  byId('addStep').onclick=()=>editSteps('insertAfter',byId('inputChoice').value);byId('insertBefore').onclick=()=>editSteps('insertBefore',byId('inputChoice').value);byId('insertAfter').onclick=()=>editSteps('insertAfter',byId('inputChoice').value);byId('duplicateStep').onclick=()=>editSteps('duplicate');byId('moveStepLeft').onclick=()=>editSteps('moveLeft');byId('moveStepRight').onclick=()=>editSteps('moveRight');byId('removeStep').onclick=()=>editSteps('remove');
  byId('applyCommand').onclick=()=>{storeCommandDraft();persistUi();vscode.postMessage({type:'saveCommand',index:selectedCommand()?selected:-1,values:values()})};const saveCurrentPreset=document.createElement('button');saveCurrentPreset.id='saveCurrentPreset';saveCurrentPreset.textContent='Save as Preset';saveCurrentPreset.title='Save this current command draft to the workspace command pool without applying it to the character';byId('applyCommand').after(saveCurrentPreset);saveCurrentPreset.onclick=()=>{storeCommandDraft();persistUi();vscode.postMessage({type:'saveCustomPreset',id:'',text:block(values())})};byId('addCommand').onclick=()=>selectCommand(data.commands.length);
  function showTab(kind){activeTab=kind;const command=kind==='command';byId('commandWorkspace').classList.toggle('hidden',!command);byId('movelistWorkspace').classList.toggle('hidden',command);byId('commandTab').classList.toggle('active',command);byId('movelistTab').classList.toggle('active',!command);persistUi()}byId('commandTab').onclick=()=>showTab('command');byId('movelistTab').onclick=()=>showTab('movelist');
  function previewMovelist(){const lines=byId('movelistEditor').value.split(/\\r?\\n/);byId('movelistPreview').innerHTML=lines.map((raw,i)=>{const visible=raw.replace(/<#[0-9a-f]{6}>|<\\/>/gi,'').replace(/_([A-Z0-9]+)_?/g,'[$1]').replace(/\\^([A-Za-z0-9]+)/g,'[$1]');const glyphs=[...raw.matchAll(/_([A-Z0-9]+)_?|\\^([A-Za-z0-9]+)/g)].map(m=>'<span class="glyph">'+esc(m[1]||m[2])+'</span>').join('');return '<div class="preview-row"><small>'+(i+1)+'</small><div>'+esc(visible)+'<br>'+glyphs+'</div></div>'}).join('')}
  byId('movelistEditor').value=Object.hasOwn(restoredUi,'movelistDraft')?restoredUi.movelistDraft:data.movelistText;previewMovelist();byId('movelistEditor').oninput=()=>{previewMovelist();persistUi()};byId('refreshPreview').onclick=previewMovelist;byId('saveMovelist').onclick=()=>{persistUi();vscode.postMessage({type:'saveMovelist',text:byId('movelistEditor').value})};
  byId('movelistAssignments').innerHTML=data.files.movelists.length?data.files.movelists.map(m=>'<div class="item"><b>Slot '+m.slot+'</b><br><small>'+esc(m.value)+'</small></div>').join(''):'<p class="muted">No native movelist assignment found in the character DEF.</p>';
  byId('copyChangeMovelist').onclick=()=>vscode.postMessage({type:'copyChangeMovelist',slot:data.files.movelists[1]?.slot||1});byId('openSource').onclick=()=>vscode.postMessage({type:'openSource',tab:activeTab,index:selected,navigationSelection:globalThis.ikemenNavigationSelection()});byId('openDef').onclick=()=>vscode.postMessage({type:'openDef',navigationSelection:globalThis.ikemenNavigationSelection()});
  function storePresetDraft(){if(presetId)presetDrafts[presetId]=byId('presetDraft').value}
  function renderReferences(){byId('references').innerHTML=(data.presets||[]).map(x=>'<div class="item"><b>'+esc(x.label)+'</b><br><small>'+esc(x.category)+' · '+esc(x.explanation)+'</small><br><button data-preset="'+esc(x.id)+'">'+(x.kind==='native'?'Choose and preview'+((x.blocks&&x.blocks.length>1)?' paired definitions':' definition'):'Copy mapped skeleton')+'</button>'+(x.custom?' <button data-delete-preset="'+esc(x.id)+'" title="Delete this workspace preset">Delete</button>':'')+'</div>').join('')+data.knownTimings.map(x=>'<div class="item"><b>'+esc(x.label)+'</b><br><small>'+esc(x.sequence)+' · steptime '+x.stepTime+'</small></div>').join('');document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=e=>{e.stopPropagation();storePresetDraft();const preset=(data.presets||[]).find(x=>x.id===b.dataset.preset);if(!preset)return;if(preset.kind!=='native'){persistUi();vscode.postMessage({type:'insertPreset',id:preset.id});return}presetId=preset.id;byId('presetTitle').textContent=preset.label+' — preset draft';byId('presetDraft').value=Object.hasOwn(presetDrafts,preset.id)?presetDrafts[preset.id]:preset.previewText;byId('presetPanel').classList.remove('hidden');persistUi();byId('presetDraft').focus();byId('presetPanel').scrollIntoView({block:'nearest'})});document.querySelectorAll('[data-delete-preset]').forEach(b=>b.onclick=e=>{e.stopPropagation();storePresetDraft();persistUi();vscode.postMessage({type:'deleteCustomPreset',id:b.dataset.deletePreset})})}
  byId('presetDraft').oninput=()=>{storePresetDraft();persistUi()};byId('applyPreset').onclick=()=>{storePresetDraft();persistUi();vscode.postMessage({type:'applyPresetDraft',id:presetId,text:byId('presetDraft').value})};byId('saveCustomPreset').onclick=()=>{storePresetDraft();persistUi();vscode.postMessage({type:'saveCustomPreset',id:presetId,text:byId('presetDraft').value})};byId('closePreset').onclick=()=>{storePresetDraft();presetId='';byId('presetPanel').classList.add('hidden');persistUi()};window.addEventListener('message',event=>{if(event.data.type==='customPresetsUpdated'){data.presets=data.presets.filter(x=>!x.custom).concat(event.data.presets||[]);if(event.data.removedId===presetId){presetId='';byId('presetPanel').classList.add('hidden')}renderReferences();persistUi()}});byId('status').textContent='Commands: '+(data.files.commandFile||'not found')+' | Movelist: '+(data.files.movelistFile||'not found');renderReferences();if(restoredUi.presetId&&(data.presets||[]).some(x=>x.id===restoredUi.presetId)){const preset=data.presets.find(x=>x.id===restoredUi.presetId);presetId=preset.id;byId('presetTitle').textContent=preset.label+' — preset draft';byId('presetDraft').value=Object.hasOwn(presetDrafts,preset.id)?presetDrafts[preset.id]:preset.previewText;byId('presetPanel').classList.toggle('hidden',!restoredUi.presetOpen)}if(restoredUi.activeTab)showTab(restoredUi.activeTab);list();inspect(true);persistUi();
  </script></body></html>`;
}

function sourceTarget(data, message) {
  if (message.type === 'openDef') return { filename:data.files.defFile, line:0 };
  if (message.tab === 'movelist') return { filename:data.files.movelistFile, line:0 };
  const command = Number.isInteger(message.index) ? data.commands[message.index] : undefined;
  return { filename:data.files.commandFile, line:command?.startLine || 0 };
}

async function replaceDocument(filename, text, label, expectedFingerprint) {
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filename));
  if (document.isDirty) throw new Error(`Save or discard the existing unsaved ${path.basename(filename)} edits before applying the ${label}.`);
  if (expectedFingerprint && hashText(document.getText()) !== expectedFingerprint) throw new Error(`${path.basename(filename)} changed while the ${label} was being reviewed. Refresh and try again; the draft was retained.`);
  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), text);
  if (!await vscode.workspace.applyEdit(edit)) throw new Error(`VS Code could not apply the ${label} edit.`);
  await document.save();
}

function enhanceCommandHtml(page, experience = workspaceExperience('commands', 'learning'), workflowContext = {}) {
  const css = `.command-tools{display:grid;grid-template-columns:1fr 104px;gap:5px;margin:7px 0}.command-tools input,.command-tools select{min-width:0;width:100%}.command-group{border:1px solid var(--line);margin:7px 0;background:#15191f}.command-group summary{cursor:pointer;padding:7px;font-weight:700;color:var(--accent);user-select:none}.command-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;align-items:center}.command-row .hide-command{padding:3px 6px;color:var(--muted)}.empty-group{padding:7px;color:var(--muted)}`;
  const oldSidebar = '<h2>Native commands</h2><button id="addCommand">+ Add command</button><div id="commands"></div>';
  const newSidebar = '<h2>Native commands</h2><button id="addCommand">+ Add command</button><div class="command-tools"><input id="commandSearch" placeholder="Search name or sequence" title="Filter every command group"><select id="commandView" title="Choose which command families are listed"><option value="organized">Organized</option><option value="gameplay">Gameplay sequences only</option><option value="basic">Basic / raw only</option><option value="all">All, source order</option><option value="hidden">Hidden only</option></select></div><div class="muted">Motions and multi-step sequences appear first. Basic inputs stay collapsed. Hiding affects only this editor.</div><div id="commands"></div>';
  const oldMovelist = '<div class="workspace hidden" id="movelistWorkspace"><aside class="pane left"><h2>Assigned lists</h2><div id="movelistAssignments"></div><h3>Native switching</h3><button id="copyChangeMovelist">Copy ChangeMovelist example</button><p class="muted">The character DEF can assign movelist, movelist1, movelist2, and later slots. ChangeMovelist selects the active native list.</p></aside><main class="center"><h2>Displayed move text</h2><textarea id="movelistEditor"></textarea><div><button id="saveMovelist">Apply reviewed movelist</button><button id="refreshPreview">Refresh preview</button></div></main><aside class="pane right"><h2>Glyph/token preview</h2><div id="movelistPreview"></div></aside></div>';
  const newMovelist = '<div class="workspace hidden" id="movelistWorkspace"><aside class="pane left"><h2>Assigned lists</h2><div id="movelistAssignments"></div><h3>Native switching</h3><button id="copyChangeMovelist">Copy ChangeMovelist example</button><p class="muted">The character DEF can assign movelist, movelist1, movelist2, and later slots. ChangeMovelist selects the active native list.</p><h3>Glyph source</h3><div id="glyphSource" class="muted source-path"></div></aside><main class="center"><h2>Displayed move text</h2><div class="movelist-tabs"><button id="movelistSourceTab" class="active">Source</button><button id="movelistVisualTab">Visual Editor</button></div><section id="movelistSourcePane"><textarea id="movelistEditor" aria-label="Displayed movelist source"></textarea></section><section id="movelistVisualPane" class="hidden"><div class="glyph-tools"><select id="glyphChoice" aria-label="Glyph to insert"></select><button id="appendGlyph">Append Glyph</button><button id="glyphBefore">Insert Before</button><button id="glyphAfter">Insert After</button><button id="replaceGlyph">Replace</button><button id="removeGlyph">Remove</button><button id="glyphLeft">Move Left</button><button id="glyphRight">Move Right</button></div><p class="muted">Select a line and glyph. Loaded compound motions remain one glyph. Text, color tags, separators, and unsupported tokens stay untouched and remain editable in Source.</p><div id="movelistVisual" aria-label="Visual displayed movelist editor"></div></section><div><button id="saveMovelist">Apply reviewed movelist</button><button id="refreshPreview" class="hidden">Refresh preview</button></div></main><aside class="pane right"><h2>Glyph preview</h2><div id="movelistPreview"></div></aside></div>';
  const glyphEditor = `
  ${glyphSegmentsCore.toString()}
  ${glyphWarnings.toString()}
  let selectedMovelistLine=Number(restoredUi.selectedMovelistLine)||0,selectedGlyph=Number(restoredUi.selectedGlyph)||0,movelistMode=restoredUi.movelistMode||'source',movelistDraft=Object.hasOwn(restoredUi,'movelistDraft')?restoredUi.movelistDraft:data.movelistText,issueCursor=-1;
  const glyphCatalog=data.glyphCatalog||{state:'unresolved',reason:'No glyph catalog was loaded.',entries:[],tokens:[]},glyphEntries=glyphCatalog.entries||[],glyphTokens=glyphCatalog.tokens||[],glyphByToken=new Map(glyphEntries.map(item=>[item.token,item]));
  const sourceEol=data.movelistEol||'\\n',basePersistUi=persistUi;persistUi=function(extra={}){basePersistUi({movelistDraft,selectedMovelistLine,selectedGlyph,movelistMode,...extra})};
  const glyphParts=(line)=>glyphSegmentsCore(line,glyphTokens);
  function glyphHtml(part,index,interactive=false){if(part.kind!=='glyph')return'<span>'+esc(part.raw)+'</span>';const item=glyphByToken.get(part.token),title=part.token+' — '+(item?.label||'unresolved glyph'),content=item?.src?'<img src="'+esc(item.src)+'" alt="'+esc(title)+'" title="'+esc(title)+'">':'<span title="'+esc(item?.reason||'Glyph asset unresolved')+'">'+esc(part.token)+' · unresolved</span>';return'<button class="glyph '+(item?.src?'':'unresolved')+' '+(interactive&&index===selectedGlyph?'selected':'')+'" data-glyph="'+index+'" aria-label="'+esc(title)+'" title="'+esc(title)+'">'+content+'</button>'}
  function lineRecords(text){const source=String(text??''),records=[];let at=0;for(const match of source.matchAll(/\\r\\n|\\r|\\n/g)){records.push({body:source.slice(at,match.index),eol:match[0]});at=match.index+match[0].length}records.push({body:source.slice(at),eol:''});return records}
  function currentGlyphIssues(){return glyphWarnings(movelistDraft,glyphCatalog)}
  function renderGlyphWarnings(){const issues=currentGlyphIssues(),engine=issues.filter(item=>item.kind==='missing-sprite'||item.kind==='missing-archive'||item.kind==='unmapped-token');byId('glyphWarningStatus').textContent=issues.length?(engine.length?engine.length+' possible engine glyph reference warning(s); IKEMEN may stop before later movelist lines.':'Glyph preview context warning: '+issues[0].message):'No missing glyph references detected in the current draft.';byId('nextGlyphIssue').disabled=!issues.length;for(const issue of issues)document.querySelectorAll('[data-movelist-line="'+issue.line+'"]').forEach(row=>{row.classList.add('issue-line');row.title=issue.message})}
  function nextGlyphIssue(){const issues=currentGlyphIssues();if(!issues.length)return;issueCursor=(issueCursor+1)%issues.length;const issue=issues[issueCursor];selectedMovelistLine=issue.line;selectedGlyph=0;if(movelistMode==='source'){const lines=byId('movelistEditor').value.split('\\n'),start=lines.slice(0,issue.line).reduce((total,line)=>total+line.length+1,0)+issue.start;byId('movelistEditor').focus();byId('movelistEditor').setSelectionRange?.(start,start+Math.max(issue.end-issue.start,1))}else previewMovelist(true);byId('glyphWarningStatus').textContent=issue.message;persistUi()}
  function setMovelistDraft(text,focus=false){movelistDraft=String(text??'');byId('movelistEditor').value=movelistDraft.replace(/\\r\\n|\\r/g,'\\n');previewMovelist(focus);persistUi()}
  function editMovelistGlyph(operation){const lines=lineRecords(movelistDraft);selectedMovelistLine=Math.max(0,Math.min(selectedMovelistLine,lines.length-1));const parts=glyphParts(lines[selectedMovelistLine].body),positions=parts.map((part,index)=>part.kind==='glyph'?index:-1).filter(index=>index>=0),token=byId('glyphChoice').value,index=Math.max(0,Math.min(selectedGlyph,Math.max(positions.length-1,0)));if(!positions.length){if(['append','before','after'].includes(operation)&&token)parts.push({kind:'glyph',raw:token,token})}else if(operation==='before'&&token)parts.splice(positions[index],0,{kind:'glyph',raw:token,token});else if(operation==='after'&&token)parts.splice(positions[index]+1,0,{kind:'glyph',raw:token,token});else if(operation==='append'&&token)parts.push({kind:'glyph',raw:token,token});else if(operation==='replace'&&token)parts[positions[index]]={kind:'glyph',raw:token,token};else if(operation==='remove')parts.splice(positions[index],1);else if(operation==='left'&&index>0)[parts[positions[index-1]].raw,parts[positions[index]].raw]=[parts[positions[index]].raw,parts[positions[index-1]].raw];else if(operation==='right'&&index<positions.length-1)[parts[positions[index]].raw,parts[positions[index+1]].raw]=[parts[positions[index+1]].raw,parts[positions[index]].raw];if(operation==='left'&&index>0)selectedGlyph--;if(operation==='right'&&index<positions.length-1)selectedGlyph++;if(operation==='remove')selectedGlyph=Math.min(index,Math.max(positions.length-2,0));lines[selectedMovelistLine].body=parts.map(part=>part.raw).join('');setMovelistDraft(lines.map(line=>line.body+line.eol).join(''),true)}
  function restoreMovelistFocus(count){const root=movelistMode==='visual'?byId('movelistVisual'):byId('movelistPreview'),line='[data-movelist-line="'+selectedMovelistLine+'"]',target=count?root.querySelector(line+' [data-glyph="'+selectedGlyph+'"]'):root.querySelector(line);target?.focus()}
  previewMovelist=function(focus=false){const lines=lineRecords(movelistDraft);selectedMovelistLine=Math.min(selectedMovelistLine,Math.max(lines.length-1,0));const selectedCount=glyphParts(lines[selectedMovelistLine].body).filter(part=>part.kind==='glyph').length;selectedGlyph=Math.min(selectedGlyph,Math.max(selectedCount-1,0));const rows=lines.map((line,lineIndex)=>{let glyphIndex=0;const content=glyphParts(line.body).map(part=>part.kind==='glyph'?glyphHtml(part,glyphIndex++,lineIndex===selectedMovelistLine):'<span>'+esc(part.raw)+'</span>').join('');return'<div class="preview-row '+(lineIndex===selectedMovelistLine?'selected':'')+'"><small>'+(lineIndex+1)+'</small><div class="preview-line" role="button" tabindex="0" data-movelist-line="'+lineIndex+'">'+(content||'<span class="muted">Empty line — select to append a glyph</span>')+'</div></div>'}).join(''),previewScroll=byId('movelistPreview').scrollTop,visualScroll=byId('movelistVisual').scrollTop;byId('movelistPreview').innerHTML=rows;byId('movelistVisual').innerHTML=rows;byId('movelistPreview').scrollTop=previewScroll;byId('movelistVisual').scrollTop=visualScroll;document.querySelectorAll('[data-movelist-line]').forEach(row=>{const choose=event=>{selectedMovelistLine=Number(row.dataset.movelistLine);const glyph=event.target.closest?.('[data-glyph]');if(glyph)selectedGlyph=Number(glyph.dataset.glyph);else selectedGlyph=0;previewMovelist(true);persistUi()};row.onclick=choose;row.onkeydown=event=>{if((event.key==='Enter'||event.key===' ')&&event.target===row){event.preventDefault();choose(event)}}});byId('glyphBefore').disabled=!selectedCount;byId('glyphAfter').disabled=!selectedCount;byId('replaceGlyph').disabled=!selectedCount;byId('removeGlyph').disabled=!selectedCount;byId('glyphLeft').disabled=!selectedCount||selectedGlyph===0;byId('glyphRight').disabled=!selectedCount||selectedGlyph>=selectedCount-1;if(focus)restoreMovelistFocus(selectedCount)};
  const baseGlyphPreview=previewMovelist;previewMovelist=function(focus=false){baseGlyphPreview(focus);renderGlyphWarnings()};
  function showMovelistMode(mode){movelistMode=mode;const source=mode==='source';byId('movelistSourcePane').classList.toggle('hidden',!source);byId('movelistVisualPane').classList.toggle('hidden',source);byId('movelistSourceTab').classList.toggle('active',source);byId('movelistVisualTab').classList.toggle('active',!source);previewMovelist();persistUi()}
  byId('glyphChoice').innerHTML=glyphEntries.map(item=>'<option value="'+esc(item.token)+'">'+esc(item.token+' — '+(item.label||(item.sprite||[]).join(','))+(item.state==='ready'?'':' (unresolved)'))+'</option>').join('');byId('glyphSource').innerHTML=glyphCatalog.state==='unresolved'?'<span class="issue warning">'+esc(glyphCatalog.reason||glyphCatalog.archiveError||'Configured glyph assets could not be resolved.')+'</span>':'Motif: '+esc(glyphCatalog.motif)+'<br>Archive: '+esc(glyphCatalog.archiveFile)+'<br>'+(glyphCatalog.baseFile?'Default mappings: '+esc(glyphCatalog.baseFile):'No bundled default mapping reference found.');const chooseGlyphRoot=document.createElement('button');chooseGlyphRoot.id='chooseGlyphRoot';chooseGlyphRoot.textContent='Choose game folder…';chooseGlyphRoot.title='Use an explicit IKEMEN game folder for this preview';chooseGlyphRoot.onclick=()=>vscode.postMessage({type:'chooseGlyphRoot'});byId('glyphSource').after(chooseGlyphRoot);
  const glyphWarningStatus=document.createElement('div');glyphWarningStatus.id='glyphWarningStatus';glyphWarningStatus.className='issue';glyphWarningStatus.setAttribute('role','status');chooseGlyphRoot.after(glyphWarningStatus);const nextGlyphIssueButton=document.createElement('button');nextGlyphIssueButton.id='nextGlyphIssue';nextGlyphIssueButton.textContent='Next glyph warning';nextGlyphIssueButton.onclick=nextGlyphIssue;glyphWarningStatus.after(nextGlyphIssueButton);
  const baseEditMovelistGlyph=editMovelistGlyph;editMovelistGlyph=function(operation){if(['append','before','after'].includes(operation)){const lines=lineRecords(movelistDraft),line=lines[Math.max(0,Math.min(selectedMovelistLine,lines.length-1))];if(line&&!glyphParts(line.body).some(part=>part.kind==='glyph')&&/[A-Za-z0-9]$/.test(line.body)){line.body+=' ';movelistDraft=lines.map(item=>item.body+item.eol).join('')}}baseEditMovelistGlyph(operation)};
  setMovelistDraft(movelistDraft);byId('movelistEditor').oninput=()=>{movelistDraft=byId('movelistEditor').value.replace(/\\n/g,sourceEol);previewMovelist();persistUi()};byId('movelistSourceTab').onclick=()=>showMovelistMode('source');byId('movelistVisualTab').onclick=()=>showMovelistMode('visual');byId('appendGlyph').onclick=()=>editMovelistGlyph('append');byId('glyphBefore').onclick=()=>editMovelistGlyph('before');byId('glyphAfter').onclick=()=>editMovelistGlyph('after');byId('replaceGlyph').onclick=()=>editMovelistGlyph('replace');byId('removeGlyph').onclick=()=>editMovelistGlyph('remove');byId('glyphLeft').onclick=()=>editMovelistGlyph('left');byId('glyphRight').onclick=()=>editMovelistGlyph('right');byId('saveMovelist').onclick=()=>{persistUi();vscode.postMessage({type:'saveMovelist',text:movelistDraft})};showMovelistMode(movelistMode);
  `;
  const organizer = `
  const restoredCommandState=vscode.getState()||{},hiddenCommands=new Set(restoredCommandState.hiddenCommands||[]);if(Number.isInteger(restoredCommandState.selected)&&restoredCommandState.selected>=0&&restoredCommandState.selected<=data.commands.length)selected=restoredCommandState.selected;
  byId('commandSearch').value=restoredCommandState.commandSearch||'';byId('commandView').value=restoredCommandState.commandView||'organized';
  function commandKey(c){return String(c.name||'')+'\\u001f'+String(c.command||'')}
  function commandFamily(c){return String(c.command||'').split(',').map(x=>x.trim()).filter(Boolean).length>1?'gameplay':'basic'}
  function saveCommandState(){vscode.setState({...(vscode.getState()||{}),seed:data.files.defFile||data.files.commandFile||data.files.movelistFile,hiddenCommands:[...hiddenCommands],commandSearch:byId('commandSearch').value,commandView:byId('commandView').value,selected:selected})}
  function commandRow(entry,restore){const c=entry.c,i=entry.i;return '<div class="item '+(i===selected?'active':'')+'" data-index="'+i+'"><div class="command-row"><div><b>'+esc(c.name||'(unnamed)')+'</b><br><small>'+esc(c.command||'(empty)')+' · '+c.time+'f total / '+c.stepTime+'f steps</small></div><button class="hide-command" data-command="'+i+'" title="'+(restore?'Return this command to its organized group':'Hide this command from the normal list')+'">'+(restore?'Restore':'Hide')+'</button></div></div>'}
  function commandGroup(label,entries,open,restore){if(!entries.length)return'';return '<details class="command-group" '+(open?'open':'')+'><summary>'+esc(label)+' ('+entries.length+')</summary>'+entries.map(entry=>commandRow(entry,restore)).join('')+'</details>'}
  function organizedList(){const query=byId('commandSearch').value.trim().toLowerCase(),view=byId('commandView').value,all=data.commands.map((c,i)=>({c,i,hidden:hiddenCommands.has(commandKey(c)),family:commandFamily(c)})).filter(entry=>!query||(String(entry.c.name||'')+' '+String(entry.c.command||'')).toLowerCase().includes(query));let content='';if(view==='all')content=all.map(entry=>commandRow(entry,entry.hidden)).join('');else if(view==='hidden')content=commandGroup('Hidden commands',all.filter(entry=>entry.hidden),true,true);else{const visible=all.filter(entry=>!entry.hidden);if(view!=='basic')content+=commandGroup('Gameplay motions and sequences',visible.filter(entry=>entry.family==='gameplay'),true,false);if(view!=='gameplay')content+=commandGroup('Basic / raw inputs',visible.filter(entry=>entry.family==='basic'),view==='basic'||Boolean(query),false);if(view==='organized')content+=commandGroup('Hidden commands',all.filter(entry=>entry.hidden),false,true)}byId('commands').innerHTML=content||'<div class="empty-group">No commands match this view.</div>';document.querySelectorAll('#commands .item').forEach(row=>row.onclick=e=>{if(e.target.closest('.hide-command'))return;selectCommand(Number(row.dataset.index))});document.querySelectorAll('.hide-command').forEach(button=>button.onclick=e=>{e.stopPropagation();const c=data.commands[Number(button.dataset.command)],key=commandKey(c);if(hiddenCommands.has(key))hiddenCommands.delete(key);else hiddenCommands.add(key);saveCommandState();organizedList()})}
  list=organizedList;restoreCommandSelection();byId('commandSearch').oninput=()=>{saveCommandState();list()};byId('commandView').onchange=()=>{saveCommandState();list()};
  `;
  return page
    .replace('</style>', `${css}</style>`)
    .replace('<b>Command & Movelist</b>', `<b>Command & Movelist</b><span title="Change this with IKEMEN: Configure Learning / Advanced Experience">${experience.label}</span>`)
    .replace('</header>', `${launchControlsHtml('command_movelist')}</header>`)
    .replace(oldSidebar, newSidebar)
    .replace(oldMovelist, newMovelist)
    .replace('<aside class="pane right"><h2>Diagnostics</h2>', `<aside class="pane right"><details ${experience.guidanceOpen ? 'open' : ''}><summary><b>What am I editing?</b></summary><p class="muted"><b>${experience.title}.</b> ${experience.guidance}</p>${workflowHtml(workflowFor('commands', workflowContext))}</details>${taskRecipesHtml('commands', experience)}${advancedActionBarHtml('commands', experience)}<h2>Diagnostics</h2>`)
    .replace("  function renderReferences(){", `${organizer}  function renderReferences(){`)
    .replace("vscode.setState({seed:data.files.defFile||data.files.commandFile||data.files.movelistFile});list();inspect();", 'restoreCommandSelection();saveCommandState();list();inspect(true);')
    .replace('</script></body>', `${glyphEditor}${require('./command_movelist_navigation').clientScript()}${launchControlsClientScript()}${workflowClientScript()}</script></body>`);
}

async function populate(panel, seed, options = {}) {
  if (!rememberPanel(panel, seed)) return;
  const detectedGlyphRoot = typeof characterGameRoot === 'function' ? characterGameRoot(seed) : '', data = payload(seed, { glyphRoot: glyphRootOverrides.get(panel) || detectedGlyphRoot, commandFile: options.commandFile, line: options.line }), experience = workspaceExperience('commands', mode('zss', vscode.Uri.file(seed))), workflowContext = { commands: data.commands.length, errors: data.commands.reduce((total, command) => total + (command.diagnostics || []).filter((item) => item.severity === 'error').length, 0), commandFile: data.files.commandFile, movelistFile: data.files.movelistFile }; if (data.files.defFile) registerCharacterToolPanel(panel, data.files.defFile, path.basename(path.dirname(data.files.defFile)), [data.files.commandFile, data.files.movelistFile]); panel.webview.options = { enableScripts: true }; panel.title = 'Command & Movelist'; panel.webview.html = require('./webview_policy').protect(enhanceCommandHtml(html(data), experience, workflowContext), panel.webview.cspSource);
  const old = handlers.get(panel); if (old) old.dispose();
  const handler = panel.webview.onDidReceiveMessage(async (message) => {
    try {
      if (await handleLaunchMessage(message, seed, 'commands', panel)) return;
      if (message.type === 'chooseGlyphRoot') {
        const chosen = await vscode.window.showOpenDialog({ title: 'Choose the IKEMEN game folder for movelist glyphs', canSelectFiles: false, canSelectFolders: true, canSelectMany: false, defaultUri: vscode.Uri.file(glyphRootOverrides.get(panel) || detectedGlyphRoot || path.dirname(seed)) });
        if (!chosen?.[0]) return;
        glyphRootOverrides.set(panel, chosen[0].fsPath); await populate(panel, seed); return;
      }
      if (message.type === 'openSource' || message.type === 'openDef') {
        const target = sourceTarget(data, message);
        if (target && exists(target.filename)) {
          const navigation = require('./viewer_navigation');
          await navigation.openViewerSource(target.filename, target.line, navigation.currentPoint(seed, 'commands', message, panel));
        } else await vscode.window.showInformationMessage('No source file is assigned for this view.');
        return;
      }
      if (message.type === 'copyChangeMovelist') { await vscode.env.clipboard.writeText(changeMovelistSnippet(message.slot)); return vscode.window.showInformationMessage('Native ChangeMovelist example copied.'); }
      if (message.type === 'insertPreset') {
        const preset = findPreset(message.id); if (!preset) throw new Error('That command preset is no longer available.');
        const text = presetText(preset);
        if (preset.kind !== 'native') { await vscode.env.clipboard.writeText(text); return vscode.window.showInformationMessage(`${preset.label} skeleton copied. Review the offline guide before placing it in the owning ZSS update hook.`); }
        if (!data.files.commandFile) throw new Error('No command file is assigned by the character DEF.');
        const answer = await vscode.window.showWarningMessage(`Add ${preset.blocks.length} reviewed native definition(s) for “${preset.label}” to ${path.basename(data.files.commandFile)}?`, { modal: true }, 'Insert Preset');
        if (answer !== 'Insert Preset') return;
        const current = exists(data.files.commandFile) ? fs.readFileSync(data.files.commandFile, 'utf8') : '';
        await replaceDocument(data.files.commandFile, `${current}${current && !current.endsWith('\n') ? '\n' : ''}\n${text}\n`, 'command preset', data.commandFingerprint); await populate(panel, seed); return;
      }
      if (message.type === 'applyPresetDraft') {
        const preset = data.presets.find((item) => item.id === message.id); if (!preset || preset.kind !== 'native') throw new Error('That native command preset is no longer available.');
        if (!data.files.commandFile) throw new Error('No command file is assigned by the character DEF.');
        const draft = String(message.text || '').trim(), parsedDraft = parseCommands(draft, 'preset-draft');
        if (!parsedDraft.commands.length) throw new Error('The preset draft contains no [Command] definitions.');
        if (parsedDraft.commands.some((command) => !command.name || !command.command)) throw new Error('Every preset definition needs both a name and a command sequence.');
        if (hashText(currentText(data.files.commandFile)) !== data.commandFingerprint || openDocument(data.files.commandFile)?.isDirty) throw new Error('The command file changed or has unsaved edits. Save or discard those source edits before applying the preset; the draft was retained.');
        const current = exists(data.files.commandFile) ? fs.readFileSync(data.files.commandFile, 'utf8') : '';
        const existing = parseCommands(current, data.files.commandFile).commands;
        const existingNames = new Set(existing.map((command) => command.name.toLowerCase()));
        const collisions = [...new Set(parsedDraft.commands.map((command) => command.name).filter((name) => existingNames.has(name.toLowerCase())))];
        const warning = collisions.length ? ` Existing command name(s): ${collisions.join(', ')}. Same-named definitions can be intentional, but review their combined behavior.` : '';
        const answer = await vscode.window.showWarningMessage(`Apply ${parsedDraft.commands.length} reviewed definition(s) from “${preset.label}” to ${path.basename(data.files.commandFile)}?${warning}`, { modal: true }, 'Apply Preset');
        if (answer !== 'Apply Preset') return;
        await replaceDocument(data.files.commandFile, `${current}${current && !current.endsWith('\n') ? '\n' : ''}\n${draft}\n`, 'command preset', data.commandFingerprint); await populate(panel, seed); return;
      }
      if (message.type === 'saveCustomPreset') {
        if (!extensionContext) throw new Error('Workspace preset storage is not available.');
        const draft = String(message.text || '').trim(), parsedDraft = parseCommands(draft, 'preset-draft');
        if (!parsedDraft.commands.length || parsedDraft.commands.some((command) => !command.name || !command.command)) throw new Error('A saved preset needs at least one complete [Command] definition.');
        const current = customPresets(seed), editing = current.find((item) => item.id === message.id);
        const label = await vscode.window.showInputBox({ title: editing ? 'Rename or update workspace command preset' : 'Save command preset to this workspace', prompt: 'Preset name', value: editing ? editing.label : '', validateInput: (input) => input.trim() ? undefined : 'Enter a preset name.' });
        if (label === undefined) return;
        const name = label.trim(), sameName = current.find((item) => item.id !== editing?.id && item.label.toLowerCase() === name.toLowerCase());
        if (sameName) {
          const replace = await vscode.window.showWarningMessage(`Replace the workspace preset “${sameName.label}”?`, { modal: true }, 'Replace Preset');
          if (replace !== 'Replace Preset') return;
        }
        const stored = upsertCustomPreset(current.map(({ id, label: itemLabel, text }) => ({ id, label: itemLabel, text })), { id: editing?.id || sameName?.id || `custom:${Date.now().toString(36)}`, label: name, text: draft });
        await extensionContext.workspaceState.update(presetScopeKey(seed), stored);
        await panel.webview.postMessage({ type: 'customPresetsUpdated', presets: customPresets(seed) }); return;
      }
      if (message.type === 'deleteCustomPreset') {
        if (!extensionContext) throw new Error('Workspace preset storage is not available.');
        const current = customPresets(seed), target = current.find((item) => item.id === message.id);
        if (!target) throw new Error('That custom preset is no longer available.');
        const answer = await vscode.window.showWarningMessage(`Delete the workspace preset “${target.label}”? Built-in presets are not affected.`, { modal: true }, 'Delete Preset');
        if (answer !== 'Delete Preset') return;
        await extensionContext.workspaceState.update(presetScopeKey(seed), removeCustomPreset(current.map(({ id, label, text }) => ({ id, label, text })), target.id));
        await panel.webview.postMessage({ type: 'customPresetsUpdated', presets: customPresets(seed), removedId: target.id }); return;
      }
      if (message.type === 'saveMovelist') {
        if (!exists(data.files.movelistFile)) throw new Error('No assigned movelist file is available. Add movelist = file.dat to the character DEF first.');
        const draftText = String(message.text || ''), warnings = glyphWarnings(draftText, data.glyphCatalog), engineWarnings = warnings.filter((item) => item.kind === 'missing-sprite' || item.kind === 'missing-archive' || item.kind === 'unmapped-token');
        const detail = engineWarnings.length ? `${engineWarnings.length} possible missing engine glyph reference(s) remain. Reported engine behavior may stop loading later movelist content. Review is advised; IKEMaker will not rewrite or block your source.` : warnings.length ? `Glyph preview/context advisory: ${warnings[0].message}` : 'No missing glyph references were detected by the current resolved mapping.';
        const answer = await vscode.window.showWarningMessage(`Apply the reviewed displayed-movelist text to ${path.basename(data.files.movelistFile)}?`, { modal: true, detail }, 'Apply Movelist');
        if (answer !== 'Apply Movelist') return;
        if (hashText(currentText(data.files.movelistFile)) !== data.movelistFingerprint || openDocument(data.files.movelistFile)?.isDirty) throw new Error('The displayed movelist changed or has unsaved source edits. Save or discard those edits before applying; the visual draft was retained.');
        await replaceDocument(data.files.movelistFile, draftText, 'movelist', data.movelistFingerprint); await populate(panel, seed); return;
      }
      if (message.type === 'saveCommand') {
        if (!data.files.commandFile) throw new Error('No command file is assigned by the character DEF.');
        if (hashText(currentText(data.files.commandFile)) !== data.commandFingerprint || openDocument(data.files.commandFile)?.isDirty) throw new Error('The command file changed or has unsaved source edits. Save or discard those edits before applying this command; the draft was retained.');
        const document = parseCommands(exists(data.files.commandFile) ? fs.readFileSync(data.files.commandFile, 'utf8') : '', data.files.commandFile);
        const nextBlock = commandBlock(message.values || {}), current = document.commands[Number(message.index)];
        const answer = await vscode.window.showWarningMessage(`${current ? 'Replace' : 'Add'} the reviewed native command in ${path.basename(data.files.commandFile)}?`, { modal: true }, current ? 'Replace Command' : 'Add Command');
        if (!answer) return;
        const next = current ? patchCommandBlock(document, current, message.values || {}) : `${document.text}${document.text && !document.text.endsWith('\n') ? '\n' : ''}\n${nextBlock}\n`;
        await replaceDocument(data.files.commandFile, next, 'command', data.commandFingerprint); await populate(panel, seed);
      }
    } catch (error) { vscode.window.showErrorMessage(`Command & Movelist: ${error.message}`); }
  });
  handlers.set(panel, handler);
}

async function openCommandMovelistWorkspace(uri) {
  let seed = uri && uri.fsPath || vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri.fsPath;
  if (!seed) seed = await chooseCharacterDef(undefined, { title: 'Command & Movelist — Character' });
  if (!seed) return;
  const invokedFile = path.resolve(seed), editor = vscode.window.activeTextEditor;
  const sourceSelection = editor && editor.document && path.resolve(editor.document.uri.fsPath || editor.document.fileName || '').toLowerCase() === invokedFile.toLowerCase()
    && ['.cmd', '.inp', '.jnp'].includes(path.extname(invokedFile).toLowerCase())
    ? (() => { const line = Number(editor.selection?.active?.line) || 0, parsed = parseCommands(editor.document.getText(), invokedFile), command = parsed.commands.find(item => line >= item.startLine && line < item.endLine); if (!command) return { commandFile: invokedFile, line }; const signature = JSON.stringify(commandValues(command)), occurrence = parsed.commands.slice(0, parsed.commands.indexOf(command)).filter(item => JSON.stringify(commandValues(item)) === signature).length; return { commandFile: invokedFile, line, command: commandValues(command), occurrence }; })() : {};
  const preferred = vscode.workspace.getConfiguration('ikemenZss').get('defaultTrainingCharacter', '');
  const owners = owningCharacterDefs(seed, preferred);
  if (owners.length === 1) seed = owners[0];
  else if (owners.length > 1) {
    const selected = await vscode.window.showQuickPick(owners.map((filename) => ({ label: path.basename(filename, '.def'), description: filename, filename })), { title: 'Choose the character whose commands and movelist you want to edit', matchOnDescription: true });
    if (!selected) return; seed = selected.filename;
  }
  const existing = openPanels.get(panelKey(seed));
  if (existing) { existing.reveal(existing.viewColumn, false); if (sourceSelection.commandFile) await existing.webview.postMessage({ type: 'commandSourceLine', ...sourceSelection }); return existing; }
  const panel = trackViewerPanel(vscode.window.createWebviewPanel('ikemenCommandMovelist', 'Command & Movelist', preferredViewerColumn(vscode.ViewColumn.Active), { enableScripts: true, retainContextWhenHidden: true }));
  await populate(panel, seed, sourceSelection);
  return panel;
}

function registerCommandMovelistWorkspace(context) {
  extensionContext = context;
  context.subscriptions.push(
    vscode.commands.registerCommand('ikemen.commandMovelist.openEditor', openCommandMovelistWorkspace),
    vscode.window.registerWebviewPanelSerializer('ikemenCommandMovelist', { async deserializeWebviewPanel(panel, state) { if (!state || !state.seed || !exists(state.seed)) { panel.dispose(); return; } await populate(panel, state.seed); } })
  );
}

module.exports = { registerCommandMovelistWorkspace, openCommandMovelistWorkspace, contextFiles, payload, html, enhanceCommandHtml, nearestCharacterDef, sourceTarget };
