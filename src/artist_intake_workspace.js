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

function json(value) { return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026'); }
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
function safeDraft(value) {
  if (!value || typeof value !== 'object') return null;
  const assignments = Array.isArray(value.assignments) ? value.assignments.slice(0, 2000).map(item => ({
    indices: Array.isArray(item?.indices) ? [...new Set(item.indices.filter(Number.isInteger).filter(index => index >= 0).slice(0, 10000))] : [],
    category: String(item?.category || '').slice(0, 80), name: String(item?.name || '').slice(0, 200), group: Number(item?.group) || 0,
    startIndex: Number(item?.startIndex) || 0, axisX: Number(item?.axisX) || 0, axisY: Number(item?.axisY) || 0
  })).filter(item => item.indices.length) : [];
  const fields = value.fields && typeof value.fields === 'object' ? {
    category: String(value.fields.category || '').slice(0, 80), name: String(value.fields.name || '').slice(0, 200), group: Number(value.fields.group) || 0,
    start: Number(value.fields.start) || 0, axisX: Number(value.fields.axisX) || 0, axisY: Number(value.fields.axisY) || 0
  } : null;
  return { assignments, selected: Array.isArray(value.selected) ? [...new Set(value.selected.filter(Number.isInteger).filter(index => index >= 0).slice(0, 10000))] : [], fields };
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
:root{color-scheme:light dark}*{box-sizing:border-box}body{margin:0;background:var(--vscode-editor-background);color:var(--vscode-foreground);font:13px var(--vscode-font-family)}header{display:flex;flex-wrap:wrap;gap:7px;align-items:center;padding:8px 12px;border-bottom:1px solid var(--vscode-panel-border);position:sticky;top:0;background:var(--vscode-editor-background);z-index:3}button,input,select{font:inherit}button{padding:6px 9px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:0;cursor:pointer}main{display:grid;grid-template-columns:minmax(0,1fr) 320px;min-height:calc(100vh - 48px)}section,aside{min-width:0;padding:12px;overflow:auto}header button{max-width:100%;white-space:normal}button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:2px solid var(--vscode-focusBorder);outline-offset:2px}.assignment{overflow-wrap:anywhere}@media(max-width:700px){main{grid-template-columns:minmax(0,1fr)}header{position:static}aside{border-top:1px solid var(--vscode-panel-border)}}.frames{display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:7px}.frame{border:2px solid var(--vscode-panel-border);padding:5px;background:var(--vscode-sideBar-background);text-align:center}.frame.selected{border-color:var(--vscode-focusBorder)}.frame img{width:100%;height:86px;object-fit:contain;background-image:linear-gradient(45deg,#333 25%,transparent 25%),linear-gradient(-45deg,#333 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#333 75%),linear-gradient(-45deg,transparent 75%,#333 75%);background-size:16px 16px}.field{display:grid;gap:3px;margin:8px 0}.field input,.field select{width:100%;padding:5px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border)}.assignment{border:1px solid var(--vscode-panel-border);padding:8px;margin:7px 0}.muted{color:var(--vscode-descriptionForeground)}details{margin:10px 0}</style></head><body><header><b>Artist Intake</b><button data-source="gif">Open GIF…</button><button data-source="sheet">Open Sprite Sheet…</button><button data-source="folder">Open Frame Folder…</button><button id="package">Create Temporary SFF Package…</button><button id="discardDraft" hidden>Discard recovered assignments</button><span id="draftStatus" role="status" aria-live="polite"></span>${launchControlsHtml('artist_intake')}</header><main><section><p class="muted">Artist names are preserved as provenance. IKEMaker names and groups are coder-side metadata and never rename the artist's originals.</p><div class="frames" id="frames"></div></section><aside><b>Assign selected frames</b><label class="field">Category<select id="category">${CATEGORIES.map(x=>`<option>${x}</option>`).join('')}</select></label><label class="field">IKEMaker sequence name<input id="name" placeholder="Special 00"></label><label class="field">SFF group<input id="group" type="number" value="0"></label><label class="field">First image index<input id="start" type="number" value="0"></label><label class="field">Axis X<input id="axisX" type="number" value="0"></label><label class="field">Axis Y<input id="axisY" type="number" value="0"></label><button id="assign">Assign selection</button><button id="all">Select all</button><button id="none">Clear</button><div id="assignments"></div><details><summary>What does the temporary SFF do?</summary><p>It creates a reviewed manifest, extracted working PNGs, provisional AIR timing, provenance, and a SprMaker2 package. Timing from GIFs remains reference-only. Nothing edits the artist's source.</p></details></aside></main><script>
const vscode=acquireVsCodeApi();let model=${json(model)};const categoryGroups=${json(CATEGORY_GROUPS)};let selected=new Set(),assignments=[],revision=0,storedRevision=0,restoring=false;const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const paletteOrganizer=document.createElement('button');paletteOrganizer.textContent='Organize Palette Indexes…';paletteOrganizer.title='Build a semantic CS/index contract from PNG artwork';paletteOrganizer.onclick=()=>vscode.postMessage({type:'paletteOrganizer'});document.querySelector('header').insertBefore(paletteOrganizer,document.getElementById('package'));
const fields=()=>({category:category.value,name:document.getElementById('name').value,group:+group.value,start:+start.value,axisX:+axisX.value,axisY:+axisY.value});
function snapshot(){return{assignments,selected:[...selected],fields:fields()}}
function stage(){if(restoring||!model.identity)return;revision++;vscode.postMessage({type:'artistDraft',identity:model.identity,revision,draft:snapshot()})}
function applyDraft(draft,selectAll=false){restoring=true;assignments=Array.isArray(draft?.assignments)?draft.assignments:[];selected=new Set(Array.isArray(draft?.selected)?draft.selected.filter(i=>i>=0&&i<model.frames.length):(selectAll?model.frames.map((_,i)=>i):[]));if(draft?.fields){category.value=draft.fields.category||category.value;document.getElementById('name').value=draft.fields.name||'';group.value=draft.fields.group??0;start.value=draft.fields.start??0;axisX.value=draft.fields.axisX??0;axisY.value=draft.fields.axisY??0}document.getElementById('discardDraft').hidden=!draft;document.getElementById('draftStatus').textContent=draft?'Recovered assignments for this exact source.':'';restoring=false}
function render(){document.getElementById('frames').innerHTML=model.frames.length?model.frames.map((f,i)=>'<button class="frame '+(selected.has(i)?'selected':'')+'" data-i="'+i+'"><img src="'+f.uri+'"><br>'+esc(f.sourceLabel)+(f.delayMs?' · '+f.delayMs+' ms':'')+(f.duplicateOf!==null?'<br>Duplicate of frame '+f.duplicateOf:'')+'</button>').join(''):'<p>Open a GIF, sprite sheet, or PNG frame folder to begin.</p>';document.querySelectorAll('.frame').forEach(b=>b.onclick=()=>{const i=+b.dataset.i;selected.has(i)?selected.delete(i):selected.add(i);render();stage()});document.getElementById('assignments').innerHTML=assignments.map((a,i)=>'<div class="assignment"><b>'+esc(a.name||a.category)+'</b><br>'+a.indices.length+' frame(s) → '+a.group+','+a.startIndex+'<br><button data-remove="'+i+'">Remove</button></div>').join('');document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{assignments.splice(+b.dataset.remove,1);render();stage()})}
document.querySelectorAll('[data-source]').forEach(b=>b.onclick=()=>vscode.postMessage({type:'source',kind:b.dataset.source}));document.getElementById('all').onclick=()=>{selected=new Set(model.frames.map((_,i)=>i));render();stage()};document.getElementById('none').onclick=()=>{selected.clear();render();stage()};document.getElementById('category').onchange=()=>{const c=category.value,n=assignments.filter(a=>a.category===c).length;document.getElementById('name').value=c+' '+String(n).padStart(2,'0');group.value=(categoryGroups[c]||0)+((c==='Special'||c==='Hyper')?n*10:n);stage()};document.getElementById('assign').onclick=()=>{if(!selected.size)return;assignments.push({indices:[...selected],category:category.value,name:document.getElementById('name').value,group:+group.value,startIndex:+start.value,axisX:+axisX.value,axisY:+axisY.value});selected.clear();render();stage()};for(const id of ['name','group','start','axisX','axisY'])document.getElementById(id).oninput=stage;document.getElementById('package').onclick=()=>vscode.postMessage({type:'package',assignments});document.getElementById('discardDraft').onclick=()=>vscode.postMessage({type:'discardArtistDraft',identity:model.identity});addEventListener('message',e=>{const data=e.data||{};if(data.type==='model'){model=data.model;revision=storedRevision=0;applyDraft(model.recoveredDraft,true);render()}if(data.type==='artistDraftStored')storedRevision=Math.max(storedRevision,data.revision||0);if(data.type==='artistDraftDiscarded'){applyDraft(null,false);assignments=[];selected.clear();render()}if(data.type==='ikemenPresetCapture')vscode.postMessage({type:'ikemenPresetState',id:data.id,reference:model.reference||null})});applyDraft(model.recoveredDraft,false);render();globalThis.ikemenNavigationSelection=()=>model.reference||null;globalThis.ikemenCanRestoreNavigation=ref=>!!ref&&ref.identity===model.identity;globalThis.ikemenRestoreNavigation=()=>true;globalThis.ikemenIsBusy=()=>storedRevision<revision;globalThis.ikemenHasUnappliedEdits=()=>assignments.length>0;globalThis.ikemenCanKeepDraft=()=>!!model.identity&&storedRevision>=revision;${launchControlsClientScript()}</script></body></html>`; }

function timingHtml(model) {
  return html(model)
    .replace('provisional AIR timing, provenance, and a SprMaker2 package', 'source provenance and a SprMaker2 package')
    .replace('Timing from GIFs remains reference-only.', 'No AIR file is created or changed; the destination/template AIR remains authoritative.')
    .replace('Nothing edits the artist\'s source.</p>', 'Nothing edits the artist\'s source. For provisional CS work, the artist-facing result is only the temporary SFF with its organized palette embedded. Manifests and build evidence stay internal; ACT, ACO, GPL, swatches, CSV, and full palette packs wait for approval or an explicit export request.</p>');
}

async function createPackage(model, assignments) {
  if (!model.frames.length || !assignments.length) return vscode.window.showWarningMessage('Open source frames and assign at least one sequence first.');
  const packageKind = await vscode.window.showQuickPick([
    { label: 'CS working SFF — one shared palette', description: 'Recommended for color separation. Every indexed sprite uses one reviewed 256-color table.', shared: true },
    { label: 'General sprite intake — preserve source palettes', description: 'Use only when the images intentionally own different palettes.', shared: false }
  ], { title: 'What kind of temporary SFF are you creating?', placeHolder: 'CS work must use one shared palette so edits apply across every sprite.' });
  if (!packageKind) return;
  let sharedPalettePath = '';
  if (packageKind.shared) {
    const palette = await vscode.window.showOpenDialog({ title: 'Choose the reviewed 256-color table for every sprite', canSelectFiles: true, canSelectFolders: false, canSelectMany: false, filters: { 'Indexed palette': ['png', 'act'] } });
    if (!palette?.[0]) return;
    sharedPalettePath = palette[0].fsPath;
    const paletteData = fs.readFileSync(sharedPalettePath);
    // Reject invalid input before asking for a destination or creating any files.
    if (/\.png$/i.test(sharedPalettePath) && (paletteData.length < 33 || paletteData.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || paletteData.toString('ascii', 12, 16) !== 'IHDR' || paletteData[25] !== 3)) throw new Error('The shared palette PNG must be indexed. Choose a reviewed indexed PNG or 256-color ACT.');
    const colors = /\.act$/i.test(sharedPalettePath) ? actRgba(paletteData) : /\.png$/i.test(sharedPalettePath) ? pngPaletteRgba(paletteData) : null;
    if (!Array.isArray(colors) || colors.length !== 256) throw new Error('Choose a reviewed 256-color ACT or indexed PNG for the shared palette.');
  }
  const picked = await vscode.window.showOpenDialog({ title: 'Choose a parent folder for the temporary SFF intake package', canSelectFiles: false, canSelectFolders: true, canSelectMany: false }); if (!picked?.[0]) return;
  const enteredName = await vscode.window.showInputBox({ title: 'Temporary intake name', value: path.parse(model.artistSource || 'artist-intake').name });
  if (enteredName === undefined) return;
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
  const reference = modelReference(model), recoveredDraft = reference ? safeDraft(formDrafts.read(draftKey(reference.identity))) : null;
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
  const owner = { panel: null, model, identity: sourceIdentity(model), busy: 0, disposed: false };
  const panel = owner.panel = trackViewerPanel(vscode.window.createWebviewPanel('ikemenArtistIntake', 'Artist Intake · Temporary SFF', preferredViewerColumn(vscode.ViewColumn.Active), { enableScripts: true, retainContextWhenHidden: true }));
  function bind(next) {
    if (owner.identity && sessions.get(owner.identity) === owner) sessions.delete(owner.identity);
    owner.model = model = next; owner.identity = sourceIdentity(next); seed = next.sourceFiles[0] || seed;
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
  panel.webview.onDidReceiveMessage((message) => {
    owner.busy++;
    Promise.resolve().then(async () => {
      if (owner.disposed) return;
      if (await handleLaunchMessage(message, seed, 'sff', panel)) return;
      if (message.type === 'source') {
        const next = message.kind === 'gif' ? await chooseGif() : message.kind === 'sheet' ? await chooseSheet() : await chooseFolder();
        if (next && !owner.disposed) panel.webview.postMessage({ type: 'model', model: bind(next) });
        return;
      }
      if (message.type === 'artistDraft') {
        if (!owner.identity || message.identity !== owner.identity) throw new Error('The assignment draft does not match the current artwork.');
        const draft = safeDraft(message.draft), frameCount = model.frames.length;
        if (!draft || draft.assignments.some(item => item.indices.some(index => index >= frameCount)) || draft.selected.some(index => index >= frameCount)) throw new Error('The assignment draft contains frames that are not in the current artwork.');
        await formDrafts.stage(draftKey(owner.identity), draft);
        if (!owner.disposed) panel.webview.postMessage({ type: 'artistDraftStored', revision: message.revision });
        return;
      }
      if (message.type === 'discardArtistDraft') {
        if (owner.identity && message.identity === owner.identity) await formDrafts.discard(draftKey(owner.identity));
        if (!owner.disposed) panel.webview.postMessage({ type: 'artistDraftDiscarded' });
        return;
      }
      if (message.type === 'paletteOrganizer') await vscode.commands.executeCommand('ikemen.paletteOrganizer.open');
      if (message.type === 'package') await createPackage(model, message.assignments || []);
    }).catch(error => vscode.window.showErrorMessage(`Artist intake failed: ${error.message}`)).finally(() => owner.busy--);
  });
  panel.onDidDispose(() => { owner.disposed = true; if (owner.identity && sessions.get(owner.identity) === owner) sessions.delete(owner.identity); });
  return panel;
}
function registerArtistIntake(context) {
  formDrafts = new FormDrafts(context.workspaceState, 'ikemaker.artistIntakeDrafts.v1');
  context.subscriptions.push(vscode.commands.registerCommand('ikemen.artistIntake.open', (uri, options) => openArtistIntake(uri, options)));
}

module.exports = { registerArtistIntake, openArtistIntake, createPackage, html: timingHtml, sourceIdentity, safeDraft, restoreModel, clientModel };
