'use strict';

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { CATEGORIES, CATEGORY_GROUPS, safeName, imageDimensions, sheetCells, manifestRows, recipe } = require('./artist_intake_model');
const { stringifyCsv } = require('./sff');
const { createBuildPackage } = require('./sff_commands');
const { readSff, actRgba } = require('./sff_reader');
const { pngPaletteRgba } = require('./palette_library');
const { auditSharedPaletteArchive } = require('./palette_index_organizer_model');
const { DEFAULT_PROFILE } = require('./sff_build_profile');
const { preferredViewerColumn, trackViewerPanel } = require('./viewer_group');
const { launchControlsHtml, launchControlsClientScript, handleLaunchMessage } = require('./launch_controls');
const { transactionalWriteSet, transactionalWrite, beginExternalMutation } = require('./mutation_safety');
const { FormDrafts } = require('./form_drafts');

let formDrafts = new FormDrafts();
const sessions = new Map();
const ARTIST_MESSAGE_TYPES = new Set(['source', 'artistDraft', 'discardArtistDraft', 'paletteOrganizer', 'package']);
const MAX_ASSIGNMENTS = 2000, MAX_SELECTION = 10000, MAX_REVISION = 1000000000;

function json(value) { return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026'); }
function plainObject(value) { return Boolean(value) && typeof value === 'object' && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null); }
function exactObject(value, keys) { return plainObject(value) && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort()); }
function boundedInteger(value, minimum, maximum) { return Number.isInteger(value) && value >= minimum && value <= maximum; }
function ffmpeg(args) {
  const executable = vscode.workspace.getConfiguration('ikemenZss').get('ffmpegPath', 'ffmpeg');
  const result = spawnSync(executable, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { windowsHide: true, encoding: 'utf8' });
  if (result.error || result.status !== 0) throw result.error || new Error(result.stderr || `FFmpeg exited with ${result.status}.`);
}
function pngs(folder) { return fs.readdirSync(folder).filter((name) => /\.png$/i.test(name)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map((name, artistFrame) => ({ filename: path.join(folder, name), relativePath: name, artistFrame, sourceLabel: name, selected: true })); }
function tempFolder() { const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-artist-intake-')); return folder; }
function thumbs(frames) { const seen = new Map(); return frames.map((frame, index) => { const data = fs.readFileSync(frame.filename), digest = crypto.createHash('sha256').update(data).digest('hex'), duplicateOf = seen.has(digest) ? seen.get(digest) : null; if (!seen.has(digest)) seen.set(digest, index); return { ...frame, index, duplicateOf, uri: `data:image/png;base64,${data.toString('base64')}` }; }); }
function sourceIdentity(model) {
  if (!model?.sourceType || !Array.isArray(model.sourceFiles) || !model.sourceFiles.length) return '';
  const hash = crypto.createHash('sha256');
  hash.update(String(model.sourceType)); hash.update('\0'); hash.update(JSON.stringify(model.sheet || null));
  for (const filename of model.sourceFiles) {
    const absolute = path.resolve(filename);
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) return '';
    const data = fs.readFileSync(absolute);
    hash.update('\0'); hash.update(absolute.toLowerCase()); hash.update('\0'); hash.update(String(data.length)); hash.update('\0'); hash.update(data);
  }
  return hash.digest('hex');
}
function draftKey(identity) { return identity ? `artist-intake:${identity}` : ''; }
function validIdentity(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
function normalizeAssignments(value, frameCount = Number.MAX_SAFE_INTEGER) {
  if (!Array.isArray(value) || value.length > MAX_ASSIGNMENTS || !boundedInteger(frameCount, 0, Number.MAX_SAFE_INTEGER)) return null;
  const occupied = new Set(), result = [];
  for (const item of value) {
    if (!exactObject(item, ['indices', 'category', 'name', 'group', 'startIndex', 'axisX', 'axisY']) || !Array.isArray(item.indices) || !item.indices.length || item.indices.length > MAX_SELECTION) return null;
    if (!CATEGORIES.includes(item.category) || typeof item.name !== 'string' || item.name.length > 200 || !boundedInteger(item.group, 0, 65535) || !boundedInteger(item.startIndex, 0, 65535) || !boundedInteger(item.axisX, -32768, 32767) || !boundedInteger(item.axisY, -32768, 32767)) return null;
    const indices = [], seen = new Set();
    for (const index of item.indices) {
      if (!boundedInteger(index, 0, frameCount - 1) || seen.has(index)) return null;
      seen.add(index); indices.push(index);
    }
    if (item.startIndex + indices.length - 1 > 65535) return null;
    for (let offset = 0; offset < indices.length; offset++) {
      const key = `${item.group},${item.startIndex + offset}`;
      if (occupied.has(key)) return null;
      occupied.add(key);
    }
    result.push({ indices, category: item.category, name: item.name, group: item.group, startIndex: item.startIndex, axisX: item.axisX, axisY: item.axisY });
  }
  return result;
}
function validDraftPayload(value, frameCount) {
  if (!exactObject(value, ['assignments', 'selected', 'fields']) || !Array.isArray(value.selected) || value.selected.length > MAX_SELECTION || !exactObject(value.fields, ['category', 'name', 'group', 'start', 'axisX', 'axisY'])) return false;
  const assignments = normalizeAssignments(value.assignments, frameCount); if (!assignments) return false;
  if (!CATEGORIES.includes(value.fields.category) || typeof value.fields.name !== 'string' || value.fields.name.length > 200 || !boundedInteger(value.fields.group, 0, 65535) || !boundedInteger(value.fields.start, 0, 65535) || !boundedInteger(value.fields.axisX, -32768, 32767) || !boundedInteger(value.fields.axisY, -32768, 32767)) return false;
  const selected = new Set();
  for (const index of value.selected) { if (!boundedInteger(index, 0, frameCount - 1) || selected.has(index)) return false; selected.add(index); }
  return true;
}
function validArtistMessage(message, frameCount = Number.MAX_SAFE_INTEGER) {
  if (!plainObject(message) || !ARTIST_MESSAGE_TYPES.has(message.type)) return false;
  if (message.type === 'source') return exactObject(message, ['type', 'kind']) && ['gif', 'sheet', 'folder'].includes(message.kind);
  if (message.type === 'paletteOrganizer') return exactObject(message, ['type']);
  if (message.type === 'discardArtistDraft') return exactObject(message, ['type', 'identity']) && validIdentity(message.identity);
  if (message.type === 'artistDraft') return exactObject(message, ['type', 'identity', 'revision', 'draft']) && validIdentity(message.identity) && boundedInteger(message.revision, 1, MAX_REVISION) && validDraftPayload(message.draft, frameCount);
  return exactObject(message, ['type', 'identity', 'revision', 'assignments']) && validIdentity(message.identity) && boundedInteger(message.revision, 0, MAX_REVISION) && Boolean(normalizeAssignments(message.assignments, frameCount)?.length);
}
function safeDraft(value, frameCount = Number.MAX_SAFE_INTEGER) {
  if (!validDraftPayload(value, frameCount)) return null;
  return {
    assignments: normalizeAssignments(value.assignments, frameCount),
    selected: [...value.selected],
    fields: { category: value.fields.category, name: value.fields.name, group: value.fields.group, start: value.fields.start, axisX: value.fields.axisX, axisY: value.fields.axisY }
  };
}
function modelReference(model) { const identity = sourceIdentity(model); return identity ? { sourceType: model.sourceType, sourceFiles: model.sourceFiles.map(filename => path.resolve(filename)), sheet: model.sheet || null, identity } : null; }
function loadGif(filename) {
  if (!filename || !fs.existsSync(filename)) return null;
  const folder = tempFolder(); ffmpeg(['-i', filename, '-vsync', '0', path.join(folder, 'frame_%05d.png')]);
  return { sourceType: 'gif', sourceFiles: [path.resolve(filename)], frames: thumbs(pngs(folder)), artistSource: path.basename(filename) };
}
function loadSheet(filename, sheet) {
  if (!filename || !fs.existsSync(filename) || !sheet || !Number.isInteger(sheet.cellWidth) || !Number.isInteger(sheet.cellHeight) || sheet.cellWidth < 1 || sheet.cellHeight < 1) return null;
  const dimensions = imageDimensions(fs.readFileSync(filename), '.png');
  if ((sheet.width && sheet.width !== dimensions.width) || (sheet.height && sheet.height !== dimensions.height)) return null;
  const normalized = { ...dimensions, cellWidth: sheet.cellWidth, cellHeight: sheet.cellHeight }, cells = sheetCells(dimensions, normalized), folder = tempFolder();
  for (const cell of cells) ffmpeg(['-i', filename, '-vf', `crop=${cell.width}:${cell.height}:${cell.x}:${cell.y}`, '-frames:v', '1', path.join(folder, `frame_${String(cell.ordinal).padStart(5, '0')}.png`)]);
  return { sourceType: 'sheet', sourceFiles: [path.resolve(filename)], frames: thumbs(pngs(folder)), artistSource: path.basename(filename), sheet: normalized };
}
function loadFolder(folder) {
  if (!folder || !fs.existsSync(folder)) return null;
  const frames = pngs(folder); if (!frames.length) return null;
  return { sourceType: 'folder', sourceFiles: frames.map(frame => frame.filename), frames: thumbs(frames), artistSource: path.basename(folder) };
}
function restoreModel(reference) {
  if (!reference || !Array.isArray(reference.sourceFiles) || !reference.sourceFiles.length) return null;
  const model = reference.sourceType === 'gif' ? loadGif(reference.sourceFiles[0]) : reference.sourceType === 'sheet' ? loadSheet(reference.sourceFiles[0], reference.sheet) : reference.sourceType === 'folder' ? loadFolder(path.dirname(reference.sourceFiles[0])) : null;
  return model && sourceIdentity(model) === reference.identity ? model : null;
}

async function chooseGif() {
  const picked = await vscode.window.showOpenDialog({ title: 'Choose an animation GIF', canSelectMany: false, filters: { 'Animation GIF': ['gif'] } });
  if (!picked?.[0]) return null;
  return loadGif(picked[0].fsPath);
}
async function numberInput(title, value) { const answer = await vscode.window.showInputBox({ title, value: String(value), validateInput: (text) => /^\d+$/.test(text) && Number(text) > 0 ? null : 'Enter a positive whole number.' }); return answer === undefined ? null : Number(answer); }
async function chooseSheet() {
  const picked = await vscode.window.showOpenDialog({ title: 'Choose a PNG sprite sheet', canSelectMany: false, filters: { 'PNG sprite sheet': ['png'] } });
  if (!picked?.[0]) return null;
  const dimensions = imageDimensions(fs.readFileSync(picked[0].fsPath), '.png');
  const cellWidth = await numberInput(`Cell width (sheet is ${dimensions.width} × ${dimensions.height})`, Math.min(128, dimensions.width)); if (!cellWidth) return null;
  const cellHeight = await numberInput('Cell height', Math.min(128, dimensions.height)); if (!cellHeight) return null;
  return loadSheet(picked[0].fsPath, { ...dimensions, cellWidth, cellHeight });
}
async function chooseFolder() {
  const picked = await vscode.window.showOpenDialog({ title: 'Choose a folder of PNG frames', canSelectFiles: false, canSelectFolders: true, canSelectMany: false });
  if (!picked?.[0]) return null;
  const model = loadFolder(picked[0].fsPath); if (!model) throw new Error('That folder contains no PNG frames.');
  return model;
}

function html(model) { return `<!doctype html><html><head><meta charset="utf-8"><style>
:root{color-scheme:light dark}*{box-sizing:border-box}body{margin:0;background:var(--vscode-editor-background);color:var(--vscode-foreground);font:13px var(--vscode-font-family)}header{display:flex;flex-wrap:wrap;gap:7px;align-items:center;padding:8px 12px;border-bottom:1px solid var(--vscode-panel-border);position:sticky;top:0;background:var(--vscode-editor-background);z-index:3}button,input,select{font:inherit}button{padding:6px 9px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:0;cursor:pointer}button:disabled{cursor:not-allowed;opacity:.58}main{display:grid;grid-template-columns:minmax(0,1fr) minmax(260px,320px);min-height:calc(100vh - 48px)}section,aside{min-width:0;padding:12px;overflow:auto}header button{max-width:100%;white-space:normal}button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:2px solid var(--vscode-focusBorder);outline-offset:2px}.assignment{overflow-wrap:anywhere}@media(max-width:700px){main{grid-template-columns:minmax(0,1fr)}header{position:static}aside{border-top:1px solid var(--vscode-panel-border)}}.frames{display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:7px}.frame{border:2px solid var(--vscode-panel-border);padding:5px;background:var(--vscode-sideBar-background);text-align:center}.frame.selected,.frame[aria-pressed="true"]{border-color:var(--vscode-focusBorder);box-shadow:inset 0 0 0 1px var(--vscode-focusBorder)}.frame img{width:100%;height:86px;object-fit:contain;background-image:linear-gradient(45deg,#333 25%,transparent 25%),linear-gradient(-45deg,#333 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#333 75%),linear-gradient(-45deg,transparent 75%,#333 75%);background-size:16px 16px}.field{display:grid;gap:3px;margin:8px 0}.field input,.field select{width:100%;padding:5px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border)}.assignment{border:1px solid var(--vscode-panel-border);padding:8px;margin:7px 0}.muted{color:var(--vscode-descriptionForeground)}.status{flex:1 1 220px;min-width:0;overflow-wrap:anywhere}details{margin:10px 0}</style></head><body><header><b>Artist Intake</b><button data-source="gif">Open GIF…</button><button data-source="sheet">Open Sprite Sheet…</button><button data-source="folder">Open Frame Folder…</button><button id="package">Create Temporary SFF Package…</button><button id="discardDraft" hidden>Discard recovered assignments</button><span id="draftStatus" class="status" role="status" aria-live="polite"></span><span id="actionStatus" class="status muted" role="status" aria-live="polite">Choose GIF, sprite sheet, or frame folder.</span>${launchControlsHtml('artist_intake')}</header><main><section aria-labelledby="sourceFramesHeading"><h2 id="sourceFramesHeading">Source frames</h2><p class="muted">Artist names are preserved as provenance. IKEMaker names and groups are coder-side metadata and never rename the artist's originals.</p><div class="frames" id="frames" role="group" aria-label="Source frame selection"></div></section><aside aria-labelledby="assignmentHeading"><h2 id="assignmentHeading">Assign selected frames</h2><label class="field">Category<select id="category">${CATEGORIES.map(x=>`<option>${x}</option>`).join('')}</select></label><label class="field">IKEMaker sequence name<input id="name" placeholder="Special 00" maxlength="200"></label><label class="field">SFF group<input id="group" type="number" min="0" max="65535" value="0"></label><label class="field">First image index<input id="start" type="number" min="0" max="65535" value="0"></label><label class="field">Axis X<input id="axisX" type="number" min="-32768" max="32767" value="0"></label><label class="field">Axis Y<input id="axisY" type="number" min="-32768" max="32767" value="0"></label><button id="assign">Assign selection</button><button id="all">Select all</button><button id="none">Clear selection</button><div id="assignments" role="list" aria-label="Assigned sequences"></div><details><summary>What does the temporary SFF do?</summary><p>It creates a reviewed manifest, extracted working PNGs, provisional AIR timing, provenance, and a SprMaker2 package. Timing from GIFs remains reference-only. Nothing edits the artist's source.</p></details></aside></main><script>
const vscode=acquireVsCodeApi();let model=${json(model)};const categoryGroups=${json(CATEGORY_GROUPS)};let selected=new Set(),assignments=[],revision=0,storedRevision=0,restoring=false,hostBusy=false;const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const byId=id=>document.getElementById(id);const category=byId('category'),group=byId('group'),start=byId('start'),axisX=byId('axisX'),axisY=byId('axisY');const paletteOrganizer=document.createElement('button');paletteOrganizer.dataset=paletteOrganizer.dataset||{};paletteOrganizer.id='paletteOrganizer';paletteOrganizer.textContent='Organize Palette Indexes…';paletteOrganizer.dataset.readyTitle='Build a semantic CS/index contract from PNG artwork';paletteOrganizer.title=paletteOrganizer.dataset.readyTitle;paletteOrganizer.onclick=()=>{beginHostAction('Opening Palette Organizer…');vscode.postMessage({type:'paletteOrganizer'})};document.querySelector('header').insertBefore(paletteOrganizer,byId('package'));
function snapshot(){return{assignments:assignments.map(a=>({...a,indices:[...a.indices]})),selected:[...selected],fields:{category:category.value,name:byId('name').value,group:+group.value,start:+start.value,axisX:+axisX.value,axisY:+axisY.value}}}
function applyDraft(draft,selectAll=false){restoring=true;assignments=Array.isArray(draft?.assignments)?draft.assignments:[];selected=new Set(Array.isArray(draft?.selected)?draft.selected.filter(i=>i>=0&&i<(model.frames||[]).length):(selectAll?(model.frames||[]).map((_,i)=>i):[]));if(draft?.fields){category.value=draft.fields.category;byId('name').value=draft.fields.name;group.value=draft.fields.group;start.value=draft.fields.start;axisX.value=draft.fields.axisX;axisY.value=draft.fields.axisY}else if(selectAll){const c=category.value||'Required';category.value=c;byId('name').value=c+' 00';group.value=categoryGroups[c]||0;start.value=0;axisX.value=0;axisY.value=0}byId('discardDraft').hidden=!draft;byId('draftStatus').textContent=draft?'Recovered assignments for this exact source.':'';restoring=false}
function reason(control,disabled,text){control.dataset=control.dataset||{};control.dataset.baseLabel=control.dataset.baseLabel||control.getAttribute?.('aria-label')||control.closest?.('label')?.textContent?.trim()||control.textContent?.trim()||control.id||'Control';control.disabled=Boolean(disabled);control.title=disabled?text:(control.dataset.readyTitle||'');control.setAttribute?.('aria-label',disabled?control.dataset.baseLabel+'. '+text:control.dataset.baseLabel)}
function syncControls(){const frames=model.frames||[],hasFrames=frames.length>0,hasSelection=selected.size>0,allSelected=hasFrames&&selected.size===frames.length,pending=storedRevision<revision,wait='Wait for the current Artist Intake action to finish.';for(const button of document.querySelectorAll('[data-source]'))reason(button,hostBusy,wait);reason(paletteOrganizer,hostBusy,wait);reason(byId('assign'),hostBusy||!hasSelection,hostBusy?wait:'Select one or more source frames first.');reason(byId('all'),hostBusy||!hasFrames||allSelected,hostBusy?wait:!hasFrames?'Open source frames first.':'All source frames are already selected.');reason(byId('none'),hostBusy||!hasSelection,hostBusy?wait:'No source frames are selected.');reason(byId('package'),hostBusy||!hasFrames||!assignments.length||pending,hostBusy?wait:!hasFrames?'Open source frames first.':!assignments.length?'Assign at least one sequence first.':'Wait for the assignment draft to finish saving.');reason(byId('discardDraft'),hostBusy,wait);for(const field of document.querySelectorAll('aside input,aside select'))reason(field,hostBusy,wait);for(const button of document.querySelectorAll('.frame,[data-remove]'))reason(button,hostBusy,wait)}
function stage(){if(restoring||!model.identity)return;revision++;vscode.postMessage({type:'artistDraft',identity:model.identity,revision,draft:snapshot()});syncControls()}
function frameLabel(f,i){return 'Frame '+(i+1)+': '+String(f.sourceLabel||'unnamed')+(f.delayMs?', '+f.delayMs+' milliseconds':'')+(Number.isInteger(f.duplicateOf)?', duplicate of frame '+(f.duplicateOf+1):'')+(selected.has(i)?', selected':', not selected')}
function render(focusIndex){const frames=model.frames||[],activeIndex=Number.isInteger(focusIndex)?focusIndex:(selected.size?[...selected][0]:0);byId('frames').innerHTML=frames.length?frames.map((f,i)=>'<button type="button" class="frame '+(selected.has(i)?'selected':'')+'" data-i="'+i+'" tabindex="'+(i===activeIndex?'0':'-1')+'" aria-pressed="'+(selected.has(i)?'true':'false')+'" aria-label="'+esc(frameLabel(f,i))+'"><img src="'+esc(f.uri)+'" alt=""><br>'+esc(f.sourceLabel)+(f.delayMs?' · '+f.delayMs+' ms':'')+(Number.isInteger(f.duplicateOf)?'<br>Duplicate of frame '+(f.duplicateOf+1):'')+'</button>').join(''):'<p>Open a GIF, sprite sheet, or PNG frame folder to begin.</p>';const frameButtons=[...document.querySelectorAll('.frame')];frameButtons.forEach((b,position)=>{b.onclick=()=>{const i=+b.dataset.i;selected.has(i)?selected.delete(i):selected.add(i);render(i);stage()};b.onkeydown=event=>{const delta=event.key==='ArrowRight'||event.key==='ArrowDown'?1:event.key==='ArrowLeft'||event.key==='ArrowUp'?-1:0;let next=event.key==='Home'?0:event.key==='End'?frameButtons.length-1:delta?Math.max(0,Math.min(frameButtons.length-1,position+delta)):-1;if(next<0)return;event.preventDefault();for(const item of frameButtons)item.tabIndex=-1;frameButtons[next].tabIndex=0;frameButtons[next].focus()}});byId('assignments').innerHTML=assignments.length?assignments.map((a,i)=>'<div class="assignment" role="listitem"><b>'+esc(a.name||a.category)+'</b><br>'+a.indices.length+' frame(s) → '+a.group+','+a.startIndex+'<br><button type="button" data-remove="'+i+'" aria-label="Remove '+esc(a.name||a.category)+' assignment">Remove</button></div>').join(''):'<p class="muted">No sequences assigned yet.</p>';document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{assignments.splice(+b.dataset.remove,1);render();stage();byId('assign').focus()});syncControls();if(Number.isInteger(focusIndex))document.querySelector('.frame[data-i="'+focusIndex+'"]')?.focus()}
function pendingAssignment(){const candidate={indices:[...selected],category:category.value,name:byId('name').value,group:+group.value,startIndex:+start.value,axisX:+axisX.value,axisY:+axisY.value},integer=(value,min,max)=>Number.isInteger(value)&&value>=min&&value<=max;if(!candidate.indices.length)return{problem:'Select one or more source frames first.',focus:'frames'};if(!categoryGroups.hasOwnProperty(candidate.category))return{problem:'Choose a listed assignment category.',focus:'category'};if(!integer(candidate.group,0,65535))return{problem:'SFF group must be a whole number from 0 to 65535.',focus:'group'};if(!integer(candidate.startIndex,0,65535)||candidate.startIndex+candidate.indices.length-1>65535)return{problem:'Choose a first image index whose full sequence stays within 0 to 65535.',focus:'start'};if(!integer(candidate.axisX,-32768,32767)||!integer(candidate.axisY,-32768,32767))return{problem:'Axis values must be whole numbers from -32768 to 32767.',focus:'axisX'};const occupied=new Set();for(const assignment of assignments)for(let offset=0;offset<assignment.indices.length;offset++)occupied.add(assignment.group+','+(assignment.startIndex+offset));for(let offset=0;offset<candidate.indices.length;offset++)if(occupied.has(candidate.group+','+(candidate.startIndex+offset)))return{problem:'That SFF group/index range overlaps an assigned sequence. Change the group or first image index.',focus:'group'};return{candidate}}
function beginHostAction(text){hostBusy=true;byId('actionStatus').textContent=text;syncControls()}
document.querySelectorAll('[data-source]').forEach(b=>b.onclick=()=>{beginHostAction('Choosing '+b.textContent.replace('…','')+'…');vscode.postMessage({type:'source',kind:b.dataset.source})});
byId('all').onclick=()=>{selected=new Set((model.frames||[]).map((_,i)=>i));render(0);stage()};
byId('none').onclick=()=>{selected.clear();render();stage()};
category.onchange=()=>{const c=category.value,n=assignments.filter(a=>a.category===c).length;byId('name').value=c+' '+String(n).padStart(2,'0');group.value=(categoryGroups[c]||0)+((c==='Special'||c==='Hyper')?n*10:n);stage()};
byId('assign').onclick=()=>{const review=pendingAssignment();if(review.problem){byId('actionStatus').textContent=review.problem;byId(review.focus)?.focus();return}assignments.push(review.candidate);selected.clear();byId('actionStatus').textContent='Sequence assigned. Add another selection or create the temporary package.';render();stage()};
for(const id of ['name','group','start','axisX','axisY'])byId(id).oninput=stage;
byId('package').onclick=()=>{beginHostAction('Preparing the reviewed temporary SFF package…');vscode.postMessage({type:'package',identity:model.identity,revision,assignments:snapshot().assignments})};
byId('discardDraft').onclick=()=>{beginHostAction('Discarding the recovered assignment draft…');vscode.postMessage({type:'discardArtistDraft',identity:model.identity})};
addEventListener('message',e=>{const data=e.data||{};if(data.type==='model'){model=data.model;revision=storedRevision=0;hostBusy=false;applyDraft(model.recoveredDraft,true);byId('actionStatus').textContent='Source loaded. Review the selected frames and assign a sequence.';render()}if(data.type==='artistDraftStored'&&data.identity===model.identity){storedRevision=Math.max(storedRevision,data.revision||0);syncControls()}if(data.type==='artistDraftDiscarded'&&data.identity===model.identity){hostBusy=false;applyDraft(null,false);assignments=[];selected.clear();byId('actionStatus').textContent='Recovered assignments discarded.';render()}if(data.type==='artistActionState'){hostBusy=Boolean(data.busy);byId('actionStatus').textContent=data.status||'';syncControls()}if(data.type==='ikemenPresetCapture')vscode.postMessage({type:'ikemenPresetState',id:data.id,reference:model.reference||null})});
applyDraft(model.recoveredDraft,Boolean((model.frames||[]).length));render();globalThis.ikemenNavigationSelection=()=>model.reference||null;globalThis.ikemenCanRestoreNavigation=ref=>!!ref&&ref.identity===model.identity;globalThis.ikemenRestoreNavigation=()=>true;globalThis.ikemenIsBusy=()=>hostBusy||storedRevision<revision;globalThis.ikemenHasUnappliedEdits=()=>assignments.length>0;globalThis.ikemenCanKeepDraft=()=>!!model.identity&&storedRevision>=revision;${launchControlsClientScript()}</script></body></html>`; }

function timingHtml(model) {
  return html(model)
    .replace('provisional AIR timing, provenance, and a SprMaker2 package', 'source provenance and a SprMaker2 package')
    .replace('Timing from GIFs remains reference-only.', 'No AIR file is created or changed; the destination/template AIR remains authoritative.')
    .replace('Nothing edits the artist\'s source.</p>', 'Nothing edits the artist\'s source. For provisional CS work, the artist-facing result is only the temporary SFF with its organized palette embedded. Manifests and build evidence stay internal; ACT, ACO, GPL, swatches, CSV, and full palette packs wait for approval or an explicit export request.</p>');
}

async function createPackage(model, assignments, options = {}) {
  const checkCurrent = typeof options.checkCurrent === 'function' ? options.checkCurrent : () => true;
  const assertCurrent = () => { if (!checkCurrent()) throw new Error('The artwork changed while the package was being prepared. Review the current source and try again.'); };
  assertCurrent();
  const reviewedAssignments = normalizeAssignments(assignments, model?.frames?.length || 0);
  if (!reviewedAssignments || reviewedAssignments.length !== assignments?.length) throw new Error('Review the assignments: a frame, SFF coordinate, axis, or category is invalid or duplicated.');
  assignments = reviewedAssignments;
  if (!model.frames.length || !assignments.length) return vscode.window.showWarningMessage('Open source frames and assign at least one sequence first.');
  const packageKind = await vscode.window.showQuickPick([
    { label: 'CS working SFF — one shared palette', description: 'Recommended for color separation. Every indexed sprite uses one reviewed 256-color table.', shared: true },
    { label: 'General sprite intake — preserve source palettes', description: 'Use only when the images intentionally own different palettes.', shared: false }
  ], { title: 'What kind of temporary SFF are you creating?', placeHolder: 'CS work must use one shared palette so edits apply across every sprite.' });
  if (!packageKind) return;
  assertCurrent();
  let sharedPalettePath = '';
  if (packageKind.shared) {
    const palette = await vscode.window.showOpenDialog({ title: 'Choose the reviewed 256-color table for every sprite', canSelectFiles: true, canSelectFolders: false, canSelectMany: false, filters: { 'Indexed palette': ['png', 'act'] } });
    if (!palette?.[0]) return;
    assertCurrent();
    sharedPalettePath = palette[0].fsPath;
    const paletteData = fs.readFileSync(sharedPalettePath);
    // Reject invalid input before asking for a destination or creating any files.
    if (/\.png$/i.test(sharedPalettePath) && (paletteData.length < 33 || paletteData.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || paletteData.toString('ascii', 12, 16) !== 'IHDR' || paletteData[25] !== 3)) throw new Error('The shared palette PNG must be indexed. Choose a reviewed indexed PNG or 256-color ACT.');
    const colors = /\.act$/i.test(sharedPalettePath) ? actRgba(paletteData) : /\.png$/i.test(sharedPalettePath) ? pngPaletteRgba(paletteData) : null;
    if (!Array.isArray(colors) || colors.length !== 256) throw new Error('Choose a reviewed 256-color ACT or indexed PNG for the shared palette.');
  }
  const picked = await vscode.window.showOpenDialog({ title: 'Choose a parent folder for the temporary SFF intake package', canSelectFiles: false, canSelectFolders: true, canSelectMany: false }); if (!picked?.[0]) return;
  assertCurrent();
  const enteredName = await vscode.window.showInputBox({ title: 'Temporary intake name', value: path.parse(model.artistSource || 'artist-intake').name });
  if (enteredName === undefined) return;
  assertCurrent();
  const name = safeName(enteredName || 'artist-intake');
  const root = path.join(picked[0].fsPath, `${name}-intake`), sprites = path.join(root, 'sprites'), source = path.join(root, 'source');
  const rows = [], writes = [];
  for (const assignment of assignments) {
    const frames = assignment.indices.map((index, offset) => { const original = model.frames[index], filename = `${String(assignment.group).padStart(5,'0')}_${String(assignment.startIndex + offset).padStart(5,'0')}.png`, data = fs.readFileSync(original.filename); writes.push([path.join(sprites, filename), data]); return { ...original, data, filename: path.join('sprites', filename), relativePath: path.join('sprites', filename), index: assignment.startIndex + offset }; });
    const assigned = manifestRows(frames, { ...assignment, artistSource: model.artistSource }).map((row, offset) => ({ ...row, SourceSHA256: crypto.createHash('sha256').update(frames[offset].data).digest('hex').toUpperCase(), ReviewStatus: 'APPROVED', ReviewReason: 'Explicitly assigned in Artist Intake. AIR data is intentionally outside this SFF-only package.' }));
    rows.push(...assigned);
  }
  for (const [index, filename] of (model.sourceFiles || []).entries()) if (fs.existsSync(filename)) writes.push([path.join(source, `${String(index).padStart(5, '0')}_${path.basename(filename)}`), fs.readFileSync(filename)]);
  const manifest = path.join(root, 'manifest.csv'); writes.push([manifest, stringifyCsv(rows)], [path.join(root, 'artist-intake.json'), `${JSON.stringify({ version: 1, scope: 'SFF_ONLY', airPolicy: 'PRESERVE_EXISTING_UNCHANGED', palettePolicy: sharedPalettePath ? 'ONE_SHARED_TABLE_0_0' : 'SOURCE_PNG_PALETTES', sharedPaletteSource: sharedPalettePath || null, sourceType: model.sourceType, artistSource: model.artistSource, assignments, sourceFiles: (model.sourceFiles || []).map((filename) => path.basename(filename)) }, null, 2)}\n`], [path.join(root, 'import-recipe.json'), `${JSON.stringify(recipe({ sourceType: model.sourceType, sheet: model.sheet }), null, 2)}\n`]);
  assertCurrent();
  transactionalWriteSet(fs, writes, { label: 'artist-intake-package', allowExisting: false, backup: false, journal: false });
  const outputSff = path.join(root, `${name}-temporary.sff`), outputDirectory = path.join(root, 'build');
  const build = await createBuildPackage({ sourceRoot: root, manifestPath: manifest, outputDirectory, outputSff, sharedPalettePath: sharedPalettePath || undefined, sharedPaletteId: '0,0', buildProfile: { ...DEFAULT_PROFILE, profileName: 'Artist Intake / temporary review' } });
  const answer = await vscode.window.showInformationMessage(`Temporary SFF package created with ${rows.length} sprites${sharedPalettePath ? ' and one shared palette' : ''}.`, 'Build temporary SFF', 'Open manifest', 'Open build.cmd'); if (answer === 'Build temporary SFF') await runSprMaker(build, outputDirectory, outputSff, root, 'artist-intake-sff', Boolean(sharedPalettePath)); if (answer === 'Open manifest') vscode.window.showTextDocument(vscode.Uri.file(manifest)); if (answer === 'Open build.cmd') vscode.window.showTextDocument(vscode.Uri.file(build.batchPath));
}

async function runSprMaker(build, outputDirectory, outputSff, root, label, requireSharedPalette = false) {
  if (!fs.existsSync(build.sprmake)) return vscode.window.showErrorMessage(`SprMaker2 was not found: ${build.sprmake}`);
  const guard = beginExternalMutation(fs, outputSff, { label, journalRoot: root, backup: false });
  const result = spawnSync(build.sprmake, [build.definitionPath], { cwd: outputDirectory, windowsHide: true, encoding: 'utf8' });
  transactionalWrite(fs, path.join(outputDirectory, 'sprmake2.log'), `${result.stdout || ''}${result.stderr || ''}`, { label: `${label}-log`, journalRoot: root, backup: false });
  if (result.error || result.status !== 0 || !fs.existsSync(outputSff)) { guard.rollback(); throw result.error || new Error(`SprMaker2 failed with exit code ${result.status}. Review sprmake2.log.`); }
  if (requireSharedPalette) {
    const audit = auditSharedPaletteArchive(readSff(outputSff));
    if (!audit.ok) { guard.rollback(); throw new Error(`CS working SFF validation failed: ${audit.issues.join(' ')}`); }
  }
  guard.complete(); await vscode.window.showInformationMessage(`Temporary SFF created: ${outputSff}`);
}

function clientModel(model) {
  const reference = modelReference(model), recoveredDraft = reference ? safeDraft(formDrafts.read(draftKey(reference.identity)), model.frames.length) : null;
  return { ...model, identity: reference?.identity || '', reference, recoveredDraft };
}
async function openArtistIntake(uri, options = {}) {
  const reference = options?.preset ? options.reference : null;
  if (reference?.identity && sessions.has(reference.identity)) {
    const existing = sessions.get(reference.identity);
    if (sourceIdentity(existing.model) !== reference.identity) return;
    existing.panel.reveal(undefined, false); return existing.panel;
  }
  let model = reference ? restoreModel(reference) : null;
  if (options?.preset && !model) return;
  model ||= { sourceType: '', sourceFiles: [], frames: [], artistSource: '' };
  let seed = model.sourceFiles[0] || uri?.fsPath || vscode.window.activeTextEditor?.document?.fileName || '';
  const owner = { panel: null, model, identity: sourceIdentity(model), busy: 0, disposed: false, exclusive: false, generation: 0, storedRevision: 0, pendingDrafts: 0, draftQueue: Promise.resolve() };
  const panel = owner.panel = trackViewerPanel(vscode.window.createWebviewPanel('ikemenArtistIntake', 'Artist Intake · Temporary SFF', preferredViewerColumn(vscode.ViewColumn.Active), { enableScripts: true, retainContextWhenHidden: true }));
  function bind(next) {
    if (owner.identity && sessions.get(owner.identity) === owner) sessions.delete(owner.identity);
    owner.model = model = next; owner.identity = sourceIdentity(next); owner.generation++; owner.storedRevision = 0; seed = next.sourceFiles[0] || seed;
    if (owner.identity) {
      sessions.set(owner.identity, owner);
      const registry = require('./viewer_sessions');
      if (registry.has(panel)) registry.updateSource(panel, seed); else registry.register(panel, seed, 'artist_intake', true);
    }
    return clientModel(next);
  }
  const initial = bind(model);
  panel.webview.html = require('./webview_policy').protect(timingHtml(initial), panel.webview.cspSource);
  require('./viewer_close').support(panel, { isBusy: () => owner.busy > 0, keepDraft: () => formDrafts.flush() });
  const post = (message) => { if (!owner.disposed) panel.webview.postMessage(message); };
  const actionState = (busy, status) => post({ type: 'artistActionState', busy: Boolean(busy), status: String(status || '') });
  async function runExclusive(label, task) {
    if (owner.exclusive) { actionState(true, `Finish the current Artist Intake action before ${label.toLowerCase()}.`); return; }
    owner.exclusive = true; owner.busy++; actionState(true, `${label}…`);
    try {
      const status = await task();
      actionState(false, status || `${label} closed.`);
    } catch (error) {
      actionState(false, `Could not ${label.toLowerCase()}: ${error.message}`);
      throw error;
    } finally { owner.busy--; owner.exclusive = false; }
  }
  panel.webview.onDidReceiveMessage((message) => {
    Promise.resolve().then(async () => {
      if (owner.disposed) return;
      if (!ARTIST_MESSAGE_TYPES.has(message?.type)) { await handleLaunchMessage(message, seed, 'sff', panel); return; }
      if (!validArtistMessage(message, model.frames.length)) throw new Error('Review the current frame selection, category, numeric bounds, and duplicate SFF coordinates, then try again.');
      if (message.type === 'source') {
        await runExclusive(`Choose ${message.kind === 'gif' ? 'a GIF' : message.kind === 'sheet' ? 'a sprite sheet' : 'a frame folder'}`, async () => {
          const generation = owner.generation;
          const next = message.kind === 'gif' ? await chooseGif() : message.kind === 'sheet' ? await chooseSheet() : await chooseFolder();
          if (owner.disposed || generation !== owner.generation) return 'The source choice was superseded.';
          if (!next) return 'Source selection cancelled; the current artwork is unchanged.';
          post({ type: 'model', model: bind(next) });
          return `Loaded ${next.frames.length} source frame${next.frames.length === 1 ? '' : 's'}.`;
        });
        return;
      }
      if (message.type === 'artistDraft') {
        if (owner.exclusive) throw new Error('Finish the current Artist Intake action before changing assignments.');
        if (!owner.identity || message.identity !== owner.identity) throw new Error('The assignment draft does not match the current artwork.');
        const identity = owner.identity, generation = owner.generation, draft = safeDraft(message.draft);
        owner.busy++; owner.pendingDrafts++;
        owner.draftQueue = owner.draftQueue.then(async () => {
          if (owner.disposed || owner.identity !== identity || owner.generation !== generation || message.revision <= owner.storedRevision) return;
          await formDrafts.stage(draftKey(identity), draft);
          if (owner.disposed || owner.identity !== identity || owner.generation !== generation) return;
          owner.storedRevision = message.revision;
          post({ type: 'artistDraftStored', identity, revision: message.revision });
        }).catch(error => vscode.window.showErrorMessage(`Artist intake failed: ${error.message}`)).finally(() => { owner.pendingDrafts--; owner.busy--; });
        return;
      }
      if (message.type === 'discardArtistDraft') {
        if (!owner.identity || message.identity !== owner.identity) throw new Error('The recovered assignment draft does not match the current artwork.');
        await runExclusive('Discard the recovered assignment draft', async () => {
          const identity = owner.identity, generation = owner.generation;
          await owner.draftQueue;
          if (owner.disposed || owner.identity !== identity || owner.generation !== generation) return 'The draft discard was superseded.';
          await formDrafts.discard(draftKey(identity));
          if (owner.disposed || owner.identity !== identity || owner.generation !== generation) return 'The draft discard was superseded.';
          owner.storedRevision = 0; post({ type: 'artistDraftDiscarded', identity });
          return 'Recovered assignments discarded.';
        });
        return;
      }
      if (message.type === 'paletteOrganizer') {
        await runExclusive('Open Palette Organizer', async () => { await vscode.commands.executeCommand('ikemen.paletteOrganizer.open'); return 'Palette Organizer opened.'; });
        return;
      }
      if (message.type === 'package') {
        if (!owner.identity || message.identity !== owner.identity || message.revision !== owner.storedRevision || owner.pendingDrafts) throw new Error('Save the current assignments before creating the package.');
        const assignments = normalizeAssignments(message.assignments, model.frames.length);
        if (!assignments?.length) throw new Error('Assign at least one valid sequence before creating the package.');
        await runExclusive('Create the temporary SFF package', async () => {
          const identity = owner.identity, generation = owner.generation, revision = owner.storedRevision, current = model;
          const checkCurrent = () => !owner.disposed && owner.identity === identity && owner.generation === generation && owner.storedRevision === revision && owner.pendingDrafts === 0 && sourceIdentity(current) === identity;
          await createPackage(current, assignments, { checkCurrent });
          return 'Temporary SFF package workflow closed.';
        });
      }
    }).catch(error => {
      if (ARTIST_MESSAGE_TYPES.has(message?.type) && !owner.exclusive) actionState(false, `Artist Intake could not continue: ${error.message}`);
      vscode.window.showErrorMessage(`Artist intake failed: ${error.message}`);
    });
  });
  panel.onDidDispose(() => { owner.disposed = true; if (owner.identity && sessions.get(owner.identity) === owner) sessions.delete(owner.identity); });
  return panel;
}
function registerArtistIntake(context) {
  formDrafts = new FormDrafts(context.workspaceState, 'ikemaker.artistIntakeDrafts.v1');
  context.subscriptions.push(vscode.commands.registerCommand('ikemen.artistIntake.open', (uri, options) => openArtistIntake(uri, options)));
}

module.exports = { registerArtistIntake, openArtistIntake, createPackage, html: timingHtml, sourceIdentity, safeDraft, restoreModel, clientModel, normalizeAssignments, validArtistMessage };
