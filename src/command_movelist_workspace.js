'use strict';

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { parseDef, sections, value, unquote } = require('./def_model');
const {
  parseCommands, diagnosticsFor, commandBlock, replaceCommandBlock,
  parseMovelistAssignments, movelistPreview, changeMovelistSnippet
} = require('./command_movelist_model');
const { owningCharacterDefs } = require('./character_context');
const { chooseCharacterDef } = require('./character_picker');
const { PRESETS, presetText, findPreset } = require('./command_presets');
const { mode } = require('./experience');
const { workspaceExperience } = require('./experience_model');
const { workflowFor, workflowHtml, advancedActionBarHtml, taskRecipesHtml, workflowClientScript } = require('./guided_workflows');
const { launchControlsHtml, launchControlsClientScript, handleLaunchMessage } = require('./launch_controls');
const { registerCharacterToolPanel } = require('./authoring_context_registry');
const { preferredViewerColumn, trackViewerPanel } = require('./viewer_group');

const handlers = new WeakMap();
const openPanels = new Map();
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
function resolveFrom(owner, relative) { return relative ? path.resolve(path.dirname(owner), unquote(relative)) : ''; }

function nearestCharacterDef(filename) {
  let directory = exists(filename) ? path.dirname(filename) : filename;
  for (let depth = 0; directory && depth < 5; depth += 1) {
    if (fs.existsSync(directory)) {
      const defs = fs.readdirSync(directory).filter((name) => /\.def$/i.test(name)).map((name) => path.join(directory, name));
      const character = defs.find((candidate) => {
        try { const document = parseDef(fs.readFileSync(candidate, 'utf8'), candidate); return sections(document, 'files').some((section) => value(section, 'cmd', '')); } catch (_) { return false; }
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

function payload(seed) {
  const files = contextFiles(seed), commandText = exists(files.commandFile) ? fs.readFileSync(files.commandFile, 'utf8') : '';
  const commandDocument = parseCommands(commandText, files.commandFile);
  const commands = commandDocument.commands.map((command, index) => ({
    ...command, entries: undefined, diagnostics: diagnosticsFor(command, commandDocument.commands), index
  }));
  const movelistText = exists(files.movelistFile) ? fs.readFileSync(files.movelistFile, 'utf8') : '';
  return {
    files, defaults: commandDocument.defaults, commands, movelistText,
    movelistPreview: movelistPreview(movelistText),
    knownTimings: [
      { label: 'Double direction reference', sequence: 'U, U', stepTime: 5 },
      { label: 'Special-window reference', sequence: 'D, D', stepTime: 10 },
      { label: 'Long sequence reference', sequence: 'x, x, F, a, z', stepTime: 17 },
      { label: '360 / 720 reference', sequence: 'direction chain', stepTime: 20 }
    ], presets: PRESETS
  };
}

function html(data) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
  :root{color-scheme:dark;--panel:#191d24;--line:#39424e;--accent:#39cad1;--muted:#9aa8b7;--warn:#e7bd4a;--bad:#ff7171;--good:#83da83}*{box-sizing:border-box}body{margin:0;background:#101319;color:#e7edf4;font:12px var(--vscode-font-family,Segoe UI);overflow:hidden}.app{height:100vh;display:grid;grid-template-rows:auto minmax(0,1fr) 28px;min-width:0}.bar{display:flex;flex-wrap:wrap;max-height:40vh;overflow:auto;align-items:center;gap:7px;padding:7px 10px;background:var(--panel);border-bottom:1px solid var(--line)}button,input,textarea,select{font:inherit;color:inherit;background:#252b34;border:1px solid #4a5664;border-radius:3px;padding:6px}button.active{background:#12505a;border-color:var(--accent)}.spacer{flex:1}.workspace{display:grid;grid-template-columns:260px minmax(0,1fr) 350px;min-height:0}.workspace>*{min-width:0;min-height:0}.bar>*{min-width:0;max-width:100%}.bar>.launch-controls{flex:1 0 100%}.pane{overflow:auto;padding:10px;background:var(--panel)}.left{border-right:1px solid var(--line)}.right{border-left:1px solid var(--line)}.center{overflow:auto;padding:14px}h2,h3{margin:5px 0 9px;font-size:12px;text-transform:uppercase;letter-spacing:.07em}.item{padding:7px;border-bottom:1px solid #2d343d;cursor:pointer}.item.active{background:#164a52}.item small,.muted{color:var(--muted)}.grid{display:grid;grid-template-columns:140px minmax(0,1fr);gap:8px;align-items:center}.grid input,.grid textarea{width:100%}.sequence{font:15px var(--vscode-editor-font-family,monospace)}.timeline-summary{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:12px}.timeline-summary output{font-weight:700;color:var(--accent)}.timeline{display:flex;gap:8px;align-items:center;overflow:auto;padding:12px 4px}.step{min-width:145px;padding:8px;border:1px solid #526171;background:#202730;text-align:left}.step input{width:100%;margin:4px 0}.step .life{display:grid;grid-template-columns:1fr 58px;gap:4px;align-items:center;color:var(--muted);font-size:10px}.step .remove{width:100%;padding:3px;color:var(--muted)}.arrow{display:flex;align-items:center;color:var(--accent)}.help{padding:8px;margin:7px 0;background:#151a20;border:1px solid var(--line);line-height:1.4}.issue{padding:7px;margin:5px 0;border-left:3px solid #738399;background:#222832}.issue.error{border-color:var(--bad)}.issue.warning{border-color:var(--warn)}.issue.suggestion{border-color:var(--good)}.native{white-space:pre-wrap;font:12px var(--vscode-editor-font-family,monospace);background:#0d1117;padding:10px;border:1px solid var(--line)}#movelistEditor{width:100%;height:48vh;font:12px var(--vscode-editor-font-family,monospace)}.preview-row{display:grid;grid-template-columns:40px 1fr;gap:6px;padding:3px;border-bottom:1px solid #29313a}.glyph{display:inline-block;padding:2px 5px;margin:1px;background:#164a52;border:1px solid #28717a}.status{padding:5px 10px;background:var(--panel);border-top:1px solid var(--line);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.hidden{display:none}@media(max-width:1100px){.workspace{display:block;overflow:auto}.workspace.hidden{display:none}.left{max-height:240px}.center,.right{overflow:visible}.grid input,.grid select{min-width:0}}@media(max-width:480px){.grid{grid-template-columns:minmax(0,1fr)}.center{padding:10px}.left .command-tools{grid-template-columns:minmax(0,1fr)}.timeline-summary .spacer{display:none}}
  </style></head><body><div class="app"><header class="bar"><b>Command & Movelist</b><button id="commandTab" class="active">Command definitions</button><button id="movelistTab">Displayed movelist</button><span class="spacer"></span><button id="openSource">Open source</button><button id="openDef">Open character DEF</button></header><div class="workspace" id="commandWorkspace"><aside class="pane left"><h2>Native commands</h2><button id="addCommand">+ Add command</button><div id="commands"></div><h3>Researched references</h3><div id="references"></div></aside><main class="center"><h2 id="commandTitle">Command</h2><div class="grid"><label title="Case-sensitive name used by command triggers and state code.">Name</label><input id="name" title="Case-sensitive command name."><label title="Comma-separated native IKEMEN input symbols.">Native sequence</label><input id="sequence" class="sequence" title="Edit directly or use the step boxes below."><label title="Maximum frames allowed from the first completed step through the full command. IKEMEN 1.0 expects at least 1.">Whole-command time</label><input id="time" type="number" min="1" title="Native command.time. Minimum 1 in IKEMEN 1.0."><label title="Frames that each completed step remains active while waiting for the next. -1 inherits Whole-command time.">Step-to-step time</label><input id="steptime" type="number" min="-1" title="Native steptime. -1 inherits command.time; it does not mean unlimited."><label title="IKEMEN normally expands repeated directions such as F,F into F, >~F, >F. Disable this to keep the sequence exactly as authored.">Autogreater</label><select id="autogreater" title="Controls automatic repeated-direction expansion."><option value="1">Enabled</option><option value="0">Disabled</option></select><label title="Frames the completed command remains valid. Native range is 1–30.">Buffer time</label><input id="bufferTime" type="number" min="1" max="30" title="Native buffer.time: completed-command lifetime."><label title="If No, an already completed command does not remain buffered through hitpause.">Buffer during hitpause</label><select id="bufferHitpause" title="Native buffer.hitpause."><option value="1">Yes</option><option value="0">No</option></select><label title="If No, the command does not remain buffered during a Pause/SuperPause endcmdbuftime window.">Buffer through pause end</label><select id="bufferPauseend" title="Native buffer.pauseend."><option value="1">Yes</option><option value="0">No</option></select><label title="If No, this buffer is not reset when another same-named command completes.">Share buffer</label><select id="bufferShared" title="Native buffer.shared."><option value="1">Yes</option><option value="0">No</option></select></div><div class="timeline-summary"><h3>Editable step timeline</h3><span class="spacer"></span><span>Whole command window:</span><output id="wholeTime">0 frames</output><button id="addStep">+ Step</button></div><div class="timeline" id="timeline"></div><div class="help"><b>Native timing note:</b> IKEMEN stores one <code>steptime</code> for every transition, not a separate value per step. Editing any “next-step life” box updates all of them. The final box edits <code>buffer.time</code>. In IKEMEN 1.0, <code>steptime = -1</code> inherits the whole-command time; it is not an unlimited command window.</div><button id="applyCommand">Apply reviewed command</button></main><aside class="pane right"><h2>Diagnostics</h2><div id="issues"></div><h3>Native syntax</h3><pre class="native" id="native"></pre><h3>Symbols</h3><div class="muted">/ hold or charge · ~ release · + simultaneous · | alternative · &gt; exact/consecutive · B/F facing-relative · L/R absolute · N neutral</div><h3>Field help</h3><div class="help">Hover any field name or input for its native meaning. Autogreater is IKEMEN's automatic expansion of repeated directions; for example, <code>F, F</code> becomes <code>F, &gt;~F, &gt;F</code>.</div></aside></div><div class="workspace hidden" id="movelistWorkspace"><aside class="pane left"><h2>Assigned lists</h2><div id="movelistAssignments"></div><h3>Native switching</h3><button id="copyChangeMovelist">Copy ChangeMovelist example</button><p class="muted">The character DEF can assign movelist, movelist1, movelist2, and later slots. ChangeMovelist selects the active native list.</p></aside><main class="center"><h2>Displayed move text</h2><textarea id="movelistEditor"></textarea><div><button id="saveMovelist">Apply reviewed movelist</button><button id="refreshPreview">Refresh preview</button></div></main><aside class="pane right"><h2>Glyph/token preview</h2><div id="movelistPreview"></div></aside></div><footer class="status" id="status"></footer></div><script>
  const vscode=acquireVsCodeApi(),data=${json(data)};let selected=0,activeTab="command";
  const byId=id=>document.getElementById(id),esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function number(id,fallback){const result=Number(byId(id).value);return Number.isFinite(result)?result:fallback}
  function selectedCommand(){return data.commands[selected]||null}
  function values(){return{name:byId('name').value,command:byId('sequence').value,time:number('time',15),steptime:number('steptime',-1),autogreater:number('autogreater',1),bufferTime:number('bufferTime',1),bufferHitpause:number('bufferHitpause',1),bufferPauseend:number('bufferPauseend',1),bufferShared:number('bufferShared',1)}}
  function block(v){return '[Command]\\nname = "'+v.name.replace(/"/g,'')+'"\\ncommand = '+v.command+'\\ntime = '+v.time+'\\nsteptime = '+v.steptime+'\\nautogreater = '+v.autogreater+'\\nbuffer.time = '+v.bufferTime+'\\nbuffer.hitpause = '+v.bufferHitpause+'\\nbuffer.pauseend = '+v.bufferPauseend+'\\nbuffer.shared = '+v.bufferShared}
  function list(){byId('commands').innerHTML=data.commands.length?data.commands.map((c,i)=>'<div class="item '+(i===selected?'active':'')+'" data-index="'+i+'"><b>'+esc(c.name||'(unnamed)')+'</b><br><small>'+esc(c.command||'(empty)')+' · '+c.time+'f total / '+c.stepTime+'f steps</small></div>').join(''):'<p class="muted">No [Command] blocks found. Add the first native command here.</p>';document.querySelectorAll('#commands .item').forEach(row=>row.onclick=()=>{selected=Number(row.dataset.index);list();inspect()})}
  function timeline(){const v=values(),steps=v.command.split(',').map(x=>x.trim()).filter(Boolean),gap=v.steptime===-1?v.time:v.steptime;byId('wholeTime').textContent=v.time+' frame'+(v.time===1?'':'s');byId('timeline').innerHTML=steps.length?steps.map((step,i)=>'<div class="step"><small>Step '+(i+1)+'</small><input class="stepToken" data-index="'+i+'" value="'+esc(step)+'" title="Native symbols for this step"><div class="life"><span>'+(i<steps.length-1?'Next-step life':'Completed buffer')+'</span><input class="stepLife" data-kind="'+(i<steps.length-1?'step':'buffer')+'" type="number" min="'+(i<steps.length-1?'-1':'1')+'" max="'+(i<steps.length-1?'999':'30')+'" value="'+(i<steps.length-1?v.steptime:v.bufferTime)+'" title="'+(i<steps.length-1?'Native steptime shared by every transition. -1 inherits whole-command time.':'Native buffer.time after the command completes.')+'"></div><button class="remove" data-remove="'+i+'" title="Remove this input step">Remove</button></div>'+(i<steps.length-1?'<div class="arrow" title="Current effective next-step window: '+gap+' frames">→</div>':'')).join(''):'<span class="muted">Enter a sequence or add the first step.</span>';document.querySelectorAll('.stepToken').forEach(input=>input.onchange=()=>{const next=[...steps];next[Number(input.dataset.index)]=input.value.trim();byId('sequence').value=next.filter(Boolean).join(', ');timeline()});document.querySelectorAll('.stepLife').forEach(input=>input.onchange=()=>{if(input.dataset.kind==='step')byId('steptime').value=input.value;else byId('bufferTime').value=input.value;timeline()});document.querySelectorAll('[data-remove]').forEach(button=>button.onclick=()=>{const next=[...steps];next.splice(Number(button.dataset.remove),1);byId('sequence').value=next.join(', ');timeline()});byId('native').textContent=block(v)}
  function inspect(){const c=selectedCommand(),d=data.defaults;if(c){byId('commandTitle').textContent=c.name||'Unnamed command';byId('name').value=c.name;byId('sequence').value=c.command;byId('time').value=c.time;byId('steptime').value=c.declaredStepTime;byId('autogreater').value=c.autoGreater;byId('bufferTime').value=c.bufferTime;byId('bufferHitpause').value=c.bufferHitpause;byId('bufferPauseend').value=c.bufferPauseend;byId('bufferShared').value=c.bufferShared;byId('issues').innerHTML=c.diagnostics.length?c.diagnostics.map(x=>'<div class="issue '+x.severity+'"><b>'+esc(x.severity.toUpperCase())+'</b><br>'+esc(x.message)+'</div>').join(''):'<div class="issue suggestion">No model-level issues.</div>'}else{byId('commandTitle').textContent='New command';byId('name').value='qcf_x';byId('sequence').value='D, DF, F, x';byId('time').value=d.time;byId('steptime').value=d.stepTime;byId('autogreater').value=d.autoGreater;byId('bufferTime').value=d.bufferTime;byId('bufferHitpause').value=d.bufferHitpause;byId('bufferPauseend').value=d.bufferPauseend;byId('bufferShared').value=d.bufferShared;byId('issues').innerHTML='<div class="issue">New command is not written until you review and apply it.</div>'}timeline()}
  ['name','sequence','time','steptime','autogreater','bufferTime','bufferHitpause','bufferPauseend','bufferShared'].forEach(id=>byId(id).oninput=timeline);
  byId('addStep').onclick=()=>{const current=byId('sequence').value.trim();byId('sequence').value=current?current+', ?':'?';timeline()};
  byId('applyCommand').onclick=()=>vscode.postMessage({type:'saveCommand',index:selectedCommand()?selected:-1,values:values()});byId('addCommand').onclick=()=>{selected=data.commands.length;inspect()};
  function showTab(kind){activeTab=kind;const command=kind==='command';byId('commandWorkspace').classList.toggle('hidden',!command);byId('movelistWorkspace').classList.toggle('hidden',command);byId('commandTab').classList.toggle('active',command);byId('movelistTab').classList.toggle('active',!command)}byId('commandTab').onclick=()=>showTab('command');byId('movelistTab').onclick=()=>showTab('movelist');
  function previewMovelist(){const lines=byId('movelistEditor').value.split(/\\r?\\n/);byId('movelistPreview').innerHTML=lines.map((raw,i)=>{const visible=raw.replace(/<#[0-9a-f]{6}>|<\\/>/gi,'').replace(/_([A-Z0-9]+)_?/g,'[$1]').replace(/\\^([A-Za-z0-9]+)/g,'[$1]');const glyphs=[...raw.matchAll(/_([A-Z0-9]+)_?|\\^([A-Za-z0-9]+)/g)].map(m=>'<span class="glyph">'+esc(m[1]||m[2])+'</span>').join('');return '<div class="preview-row"><small>'+(i+1)+'</small><div>'+esc(visible)+'<br>'+glyphs+'</div></div>'}).join('')}
  byId('movelistEditor').value=data.movelistText;previewMovelist();byId('refreshPreview').onclick=previewMovelist;byId('saveMovelist').onclick=()=>vscode.postMessage({type:'saveMovelist',text:byId('movelistEditor').value});
  byId('movelistAssignments').innerHTML=data.files.movelists.length?data.files.movelists.map(m=>'<div class="item"><b>Slot '+m.slot+'</b><br><small>'+esc(m.value)+'</small></div>').join(''):'<p class="muted">No native movelist assignment found in the character DEF.</p>';
  byId('copyChangeMovelist').onclick=()=>vscode.postMessage({type:'copyChangeMovelist',slot:data.files.movelists[1]?.slot||1});byId('openSource').onclick=()=>vscode.postMessage({type:'openSource',tab:activeTab,index:selected,navigationSelection:globalThis.ikemenNavigationSelection()});byId('openDef').onclick=()=>vscode.postMessage({type:'openDef',navigationSelection:globalThis.ikemenNavigationSelection()});
  byId('references').innerHTML=(data.presets||[]).map(x=>'<div class="item"><b>'+esc(x.label)+'</b><br><small>'+esc(x.category)+' · '+esc(x.explanation)+'</small><br><button data-preset="'+esc(x.id)+'">'+(x.kind==='native'?'Insert native definition'+(x.blocks.length>1?'s':''):'Copy mapped skeleton')+'</button></div>').join('')+data.knownTimings.map(x=>'<div class="item"><b>'+esc(x.label)+'</b><br><small>'+esc(x.sequence)+' · steptime '+x.stepTime+'</small></div>').join('');document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=e=>{e.stopPropagation();vscode.postMessage({type:'insertPreset',id:b.dataset.preset})});byId('status').textContent='Commands: '+(data.files.commandFile||'not found')+' | Movelist: '+(data.files.movelistFile||'not found');vscode.setState({seed:data.files.defFile||data.files.commandFile||data.files.movelistFile});list();inspect();
  </script></body></html>`;
}

function sourceTarget(data, message) {
  if (message.type === 'openDef') return { filename:data.files.defFile, line:0 };
  if (message.tab === 'movelist') return { filename:data.files.movelistFile, line:0 };
  const command = Number.isInteger(message.index) ? data.commands[message.index] : undefined;
  return { filename:data.files.commandFile, line:command?.startLine || 0 };
}

async function replaceDocument(filename, text, label) {
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filename));
  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), text);
  if (!await vscode.workspace.applyEdit(edit)) throw new Error(`VS Code could not apply the ${label} edit.`);
  await document.save();
}

function enhanceCommandHtml(page, experience = workspaceExperience('commands', 'learning'), workflowContext = {}) {
  const css = `.command-tools{display:grid;grid-template-columns:1fr 104px;gap:5px;margin:7px 0}.command-tools input,.command-tools select{min-width:0;width:100%}.command-group{border:1px solid var(--line);margin:7px 0;background:#15191f}.command-group summary{cursor:pointer;padding:7px;font-weight:700;color:var(--accent);user-select:none}.command-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;align-items:center}.command-row .hide-command{padding:3px 6px;color:var(--muted)}.empty-group{padding:7px;color:var(--muted)}`;
  const oldSidebar = '<h2>Native commands</h2><button id="addCommand">+ Add command</button><div id="commands"></div>';
  const newSidebar = '<h2>Native commands</h2><button id="addCommand">+ Add command</button><div class="command-tools"><input id="commandSearch" placeholder="Search name or sequence" title="Filter every command group"><select id="commandView" title="Choose which command families are listed"><option value="organized">Organized</option><option value="gameplay">Gameplay sequences only</option><option value="basic">Basic / raw only</option><option value="all">All, source order</option><option value="hidden">Hidden only</option></select></div><div class="muted">Motions and multi-step sequences appear first. Basic inputs stay collapsed. Hiding affects only this editor.</div><div id="commands"></div>';
  const organizer = `
  const restoredCommandState=vscode.getState()||{},hiddenCommands=new Set(restoredCommandState.hiddenCommands||[]);if(Number.isInteger(restoredCommandState.selected)&&restoredCommandState.selected>=0&&restoredCommandState.selected<data.commands.length)selected=restoredCommandState.selected;
  byId('commandSearch').value=restoredCommandState.commandSearch||'';byId('commandView').value=restoredCommandState.commandView||'organized';
  function commandKey(c){return String(c.name||'')+'\\u001f'+String(c.command||'')}
  function commandFamily(c){return String(c.command||'').split(',').map(x=>x.trim()).filter(Boolean).length>1?'gameplay':'basic'}
  function saveCommandState(){vscode.setState({...(vscode.getState()||{}),seed:data.files.defFile||data.files.commandFile||data.files.movelistFile,hiddenCommands:[...hiddenCommands],commandSearch:byId('commandSearch').value,commandView:byId('commandView').value,selected:selected})}
  function commandRow(entry,restore){const c=entry.c,i=entry.i;return '<div class="item '+(i===selected?'active':'')+'" data-index="'+i+'"><div class="command-row"><div><b>'+esc(c.name||'(unnamed)')+'</b><br><small>'+esc(c.command||'(empty)')+' · '+c.time+'f total / '+c.stepTime+'f steps</small></div><button class="hide-command" data-command="'+i+'" title="'+(restore?'Return this command to its organized group':'Hide this command from the normal list')+'">'+(restore?'Restore':'Hide')+'</button></div></div>'}
  function commandGroup(label,entries,open,restore){if(!entries.length)return'';return '<details class="command-group" '+(open?'open':'')+'><summary>'+esc(label)+' ('+entries.length+')</summary>'+entries.map(entry=>commandRow(entry,restore)).join('')+'</details>'}
  function organizedList(){const query=byId('commandSearch').value.trim().toLowerCase(),view=byId('commandView').value,all=data.commands.map((c,i)=>({c,i,hidden:hiddenCommands.has(commandKey(c)),family:commandFamily(c)})).filter(entry=>!query||(String(entry.c.name||'')+' '+String(entry.c.command||'')).toLowerCase().includes(query));let content='';if(view==='all')content=all.map(entry=>commandRow(entry,entry.hidden)).join('');else if(view==='hidden')content=commandGroup('Hidden commands',all.filter(entry=>entry.hidden),true,true);else{const visible=all.filter(entry=>!entry.hidden);if(view!=='basic')content+=commandGroup('Gameplay motions and sequences',visible.filter(entry=>entry.family==='gameplay'),true,false);if(view!=='gameplay')content+=commandGroup('Basic / raw inputs',visible.filter(entry=>entry.family==='basic'),view==='basic'||Boolean(query),false);if(view==='organized')content+=commandGroup('Hidden commands',all.filter(entry=>entry.hidden),false,true)}byId('commands').innerHTML=content||'<div class="empty-group">No commands match this view.</div>';document.querySelectorAll('#commands .item').forEach(row=>row.onclick=e=>{if(e.target.closest('.hide-command'))return;selected=Number(row.dataset.index);saveCommandState();organizedList();inspect()});document.querySelectorAll('.hide-command').forEach(button=>button.onclick=e=>{e.stopPropagation();const c=data.commands[Number(button.dataset.command)],key=commandKey(c);if(hiddenCommands.has(key))hiddenCommands.delete(key);else hiddenCommands.add(key);saveCommandState();organizedList()})}
  list=organizedList;byId('commandSearch').oninput=()=>{saveCommandState();list()};byId('commandView').onchange=()=>{saveCommandState();list()};
  `;
  return page
    .replace('</style>', `${css}</style>`)
    .replace('<b>Command & Movelist</b>', `<b>Command & Movelist</b><span title="Change this with IKEMEN: Configure Learning / Advanced Experience">${experience.label}</span>`)
    .replace('</header>', `${launchControlsHtml('command_movelist')}</header>`)
    .replace(oldSidebar, newSidebar)
    .replace('<aside class="pane right"><h2>Diagnostics</h2>', `<aside class="pane right"><details ${experience.guidanceOpen ? 'open' : ''}><summary><b>What am I editing?</b></summary><p class="muted"><b>${experience.title}.</b> ${experience.guidance}</p>${workflowHtml(workflowFor('commands', workflowContext))}</details>${taskRecipesHtml('commands', experience)}${advancedActionBarHtml('commands', experience)}<h2>Diagnostics</h2>`)
    .replace("byId('references').innerHTML=", `${organizer}byId('references').innerHTML=`)
    .replace("vscode.setState({seed:data.files.defFile||data.files.commandFile||data.files.movelistFile});list();inspect();", 'saveCommandState();list();inspect();')
    .replace('</script></body>', `${require('./command_movelist_navigation').clientScript()}${launchControlsClientScript()}${workflowClientScript()}</script></body>`);
}

async function populate(panel, seed) {
  if (!rememberPanel(panel, seed)) return;
  const data = payload(seed), experience = workspaceExperience('commands', mode('zss', vscode.Uri.file(seed))), workflowContext = { commands: data.commands.length, errors: data.commands.reduce((total, command) => total + (command.diagnostics || []).filter((item) => item.severity === 'error').length, 0), commandFile: data.files.commandFile, movelistFile: data.files.movelistFile }; if (data.files.defFile) registerCharacterToolPanel(panel, data.files.defFile, path.basename(path.dirname(data.files.defFile)), [data.files.commandFile, data.files.movelistFile]); panel.webview.options = { enableScripts: true }; panel.title = 'Command & Movelist'; panel.webview.html = require('./webview_policy').protect(enhanceCommandHtml(html(data), experience, workflowContext), panel.webview.cspSource);
  const old = handlers.get(panel); if (old) old.dispose();
  const handler = panel.webview.onDidReceiveMessage(async (message) => {
    try {
      if (await handleLaunchMessage(message, seed, 'commands', panel)) return;
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
        await replaceDocument(data.files.commandFile, `${current}${current && !current.endsWith('\n') ? '\n' : ''}\n${text}\n`, 'command preset'); await populate(panel, seed); return;
      }
      if (message.type === 'saveMovelist') {
        if (!exists(data.files.movelistFile)) throw new Error('No assigned movelist file is available. Add movelist = file.dat to the character DEF first.');
        const answer = await vscode.window.showWarningMessage(`Apply the reviewed displayed-movelist text to ${path.basename(data.files.movelistFile)}?`, { modal: true }, 'Apply Movelist');
        if (answer !== 'Apply Movelist') return;
        await replaceDocument(data.files.movelistFile, String(message.text || ''), 'movelist'); await populate(panel, seed); return;
      }
      if (message.type === 'saveCommand') {
        if (!data.files.commandFile) throw new Error('No command file is assigned by the character DEF.');
        const document = parseCommands(exists(data.files.commandFile) ? fs.readFileSync(data.files.commandFile, 'utf8') : '', data.files.commandFile);
        const nextBlock = commandBlock(message.values || {}), current = document.commands[Number(message.index)];
        const answer = await vscode.window.showWarningMessage(`${current ? 'Replace' : 'Add'} the reviewed native command in ${path.basename(data.files.commandFile)}?`, { modal: true }, current ? 'Replace Command' : 'Add Command');
        if (!answer) return;
        const next = current ? replaceCommandBlock(document, current, nextBlock) : `${document.text}${document.text && !document.text.endsWith('\n') ? '\n' : ''}\n${nextBlock}\n`;
        await replaceDocument(data.files.commandFile, next, 'command'); await populate(panel, seed);
      }
    } catch (error) { vscode.window.showErrorMessage(`Command & Movelist: ${error.message}`); }
  });
  handlers.set(panel, handler);
}

async function openCommandMovelistWorkspace(uri) {
  let seed = uri && uri.fsPath || vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri.fsPath;
  if (!seed) seed = await chooseCharacterDef(undefined, { title: 'Command & Movelist — Character' });
  if (!seed) return;
  const preferred = vscode.workspace.getConfiguration('ikemenZss').get('defaultTrainingCharacter', '');
  const owners = owningCharacterDefs(seed, preferred);
  if (owners.length === 1) seed = owners[0];
  else if (owners.length > 1) {
    const selected = await vscode.window.showQuickPick(owners.map((filename) => ({ label: path.basename(filename, '.def'), description: filename, filename })), { title: 'Choose the character whose commands and movelist you want to edit', matchOnDescription: true });
    if (!selected) return; seed = selected.filename;
  }
  const existing = openPanels.get(panelKey(seed));
  if (existing) { existing.reveal(existing.viewColumn, false); return existing; }
  const panel = trackViewerPanel(vscode.window.createWebviewPanel('ikemenCommandMovelist', 'Command & Movelist', preferredViewerColumn(vscode.ViewColumn.Active), { enableScripts: true, retainContextWhenHidden: true }));
  await populate(panel, seed);
  return panel;
}

function registerCommandMovelistWorkspace(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('ikemen.commandMovelist.openEditor', openCommandMovelistWorkspace),
    vscode.window.registerWebviewPanelSerializer('ikemenCommandMovelist', { async deserializeWebviewPanel(panel, state) { if (!state || !state.seed || !exists(state.seed)) { panel.dispose(); return; } await populate(panel, state.seed); } })
  );
}

module.exports = { registerCommandMovelistWorkspace, openCommandMovelistWorkspace, contextFiles, payload, html, enhanceCommandHtml, nearestCharacterDef, sourceTarget };
