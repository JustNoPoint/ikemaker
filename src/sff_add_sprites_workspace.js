'use strict';

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const vscode = require('vscode');
const { preferredViewerColumn, trackViewerPanel } = require('./viewer_group');
const { launchControlsHtml, launchControlsClientScript, handleLaunchMessage } = require('./launch_controls');
const writerPreference = require('./sff_writer_preference');
const creator = require('./sff_creator_workspace');
const needsPaletteHandoff = require('./sff_needs_palette_handoff');

const COMMAND = 'sff.openAddSprites';
const sessions = new Map();
const json = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
const keyOf = filename => path.resolve(filename).toLowerCase();
const MAX_COMPACT_SOURCES = 4096, MAX_SOURCE_BYTES = 64 * 1024 * 1024, MAX_TOTAL_BYTES = 256 * 1024 * 1024, MAX_TOTAL_PIXELS = 268435456;
function finiteIntakeValue(value) { const number = Number(value); return Number.isSafeInteger(number) && number >= 0 && number <= 65535 ? number : undefined; }
function targetGroupOccupancy(target = {}) {
  const groups = new Map();
  for (const identity of Array.isArray(target.identities) ? target.identities : []) {
    const match = /^(\d+),(\d+)$/.exec(String(identity));
    if (!match) continue;
    const group = Number(match[1]), index = Number(match[2]);
    if (!Number.isSafeInteger(group) || group < 0 || group > 65535 || !Number.isSafeInteger(index) || index < 0 || index > 65535) continue;
    if (!groups.has(group)) groups.set(group, new Set());
    groups.get(group).add(index);
  }
  return Object.freeze(Object.fromEntries([...groups].sort(([a], [b]) => a - b).map(([group, indexes]) => [String(group), Object.freeze([...indexes].sort((a, b) => a - b))])));
}
function byteHash(filename) { return crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex').toUpperCase(); }
function createStageAuthority() { let consumed = false; return Object.freeze({ consume() { if (consumed) throw new Error('This reviewed Add Sprites request was already used. Reopen it for another batch.'); consumed = true; }, get consumed() { return consumed; } }); }
function addSpritesControlAvailability(state = {}) {
  const count = Math.max(0, Number(state.sourceCount) || 0), pending = state.pending === true, terminal = state.terminal === true;
  const common = pending ? 'Wait for the current Add Sprites action to finish.' : terminal ? 'This reviewed Add Sprites session is complete. Close and reopen it for another batch.' : '';
  const sourceReason = !count ? 'Choose at least one PNG sprite image first.' : state.nonPng ? 'Standard Add Sprites accepts PNG sources only. Choose PNG files or use Advanced SFF Creator.' : '';
  const coordinateReason = state.coordinatesValid === false ? 'Enter whole-number group, index, and axis values within the displayed limits.' : '';
  const writerReason = state.paletteChoice === 'true-color' && state.writerMode === 'both' ? 'Both writers comparison cannot yet validate True Color safely. Select IKEMaker or SprMake2 in the shared Writer control, then reopen Add Sprites.' : state.writerStale ? 'The SFF writer changed. Close and reopen Add Sprites to review the current writer.' : '';
  const trueColorReason = state.trueColor && state.paletteChoice !== 'true-color' && state.paletteChoice !== 'needs-palette'
    ? (state.targetVersion === '2.1' ? 'Choose True Color or Needs Palette for the selected true-color PNGs.' : `SFF ${state.targetVersion || ''} requires true-color PNGs to use Needs Palette.`)
    : state.paletteChoice === 'true-color' && state.targetVersion !== '2.1' ? `SFF ${state.targetVersion || ''} cannot store true-color sprites. Choose Needs Palette.` : '';
  const stageReason = common || sourceReason || coordinateReason || trueColorReason || (state.paletteChoice === 'needs-palette' ? 'Continue to Palette Workshop or Advanced SFF Creator to resolve Needs Palette.' : '') || writerReason;
  const advancedReason = common || sourceReason || coordinateReason || trueColorReason || writerReason;
  const paletteReason = common || sourceReason || (state.paletteChoice !== 'needs-palette' ? 'Choose Needs Palette before opening Palette Workshop.' : '');
  return Object.freeze({
    choose: Object.freeze({ disabled: Boolean(common), reason: common }),
    clear: Object.freeze({ disabled: Boolean(common || !count), reason: common || (!count ? 'There are no selected images to clear.' : '') }),
    stage: Object.freeze({ disabled: Boolean(stageReason), reason: stageReason }),
    advanced: Object.freeze({ disabled: Boolean(advancedReason), reason: advancedReason }),
    paletteWorkshop: Object.freeze({ disabled: Boolean(paletteReason), reason: paletteReason }),
    cancel: Object.freeze({ disabled: pending, reason: pending ? 'Wait for the current Add Sprites action to finish before closing.' : '' }),
    reviewFields: Object.freeze({ disabled: Boolean(common), reason: common })
  });
}
async function consumeStageAuthority(authority, operation) { authority.consume(); return operation(); }
function boundedPngSource(filename, pixelBudget = MAX_TOTAL_PIXELS, io = fs) {
  const absolute = path.resolve(filename), fd = io.openSync(absolute, 'r');
  try {
    const before = io.fstatSync(fd);
    if (!before.isFile() || before.size > MAX_SOURCE_BYTES) throw new Error(`${path.basename(absolute)} exceeds the 64 MiB Standard intake limit.`);
    const buffer = Buffer.allocUnsafe(before.size + 1); let offset = 0;
    while (offset < buffer.length) { const count = io.readSync(fd, buffer, offset, buffer.length - offset, offset); if (!count) break; offset += count; }
    const after = io.fstatSync(fd);
    if (offset !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.dev !== before.dev || after.ino !== before.ino) throw new Error(`${path.basename(absolute)} changed while it was being admitted. Choose it again.`);
    const admitted = buffer.subarray(0, offset);
    if (admitted.length < 33 || admitted.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || admitted.toString('ascii', 12, 16) !== 'IHDR') throw new Error(`${path.basename(absolute)} is not a valid PNG.`);
    const width = admitted.readUInt32BE(16), height = admitted.readUInt32BE(20), pixels = width * height;
    if (!width || !height || !Number.isSafeInteger(pixels) || pixels > pixelBudget) throw new Error(`${path.basename(absolute)} exceeds the remaining Standard intake decoded-pixel limit.`);
    const source = creator.sourceFromFile(absolute, {}, admitted);
    return { source, buffer: admitted, bytes: admitted.length, pixels, hash: crypto.createHash('sha256').update(admitted).digest('hex').toUpperCase() };
  } finally { io.closeSync(fd); }
}

function selectedSpriteDefaults(filename, physicalIndex) {
  const fallback = Object.freeze({ group: 0, startIndex: 0, anchor: 'center', offsetX: 0, offsetY: 0, sourcePhysicalIndex: null });
  const index = Number(physicalIndex);
  if (!Number.isSafeInteger(index) || index < 0) return fallback;
  const sprite = require('./sff_reader').readSff(path.resolve(filename)).sprites[index];
  if (!sprite || sprite.index !== index) return fallback;
  return Object.freeze({
    group: sprite.group,
    startIndex: Math.min(65535, sprite.number + 1),
    anchor: 'top-left',
    offsetX: sprite.axisX,
    offsetY: sprite.axisY,
    sourcePhysicalIndex: index
  });
}

function createEmbeddedSession(filename, api = vscode, options = {}) {
  const absolute = path.resolve(filename), target = creator.targetFromFile(absolute), capturedWriter = writerPreference.snapshot(), sourceMap = new Map();
  const targetSeal = { path: absolute, hash: target.fingerprint.toUpperCase(), bytes: fs.statSync(absolute).size, version: target.sffVersion, palettes: target.palettes.map(item => `${item.id}:${item.colorHash}`).join('|') };
  const stageAuthority = createStageAuthority();
  const defaults = selectedSpriteDefaults(absolute, options.selectedPhysicalIndex);
  const model = Object.freeze({ targetName: target.name, targetVersion: target.sffVersion, palettes: target.palettes.map(item => ({ id: item.id })), writerMode: capturedWriter.mode, writerLabel: capturedWriter.label, defaults, occupiedIndexesByGroup: targetGroupOccupancy(target) });
  const chooseFiles = async () => {
    const picked = await api.window.showOpenDialog({ title: 'Choose PNG sprite images', canSelectFiles: true, canSelectFolders: false, canSelectMany: true, filters: { 'PNG sprite images': ['png'] } });
    if (!picked) return null;
    if (picked.length > MAX_COMPACT_SOURCES) throw new Error(`Standard intake accepts at most ${MAX_COMPACT_SOURCES} images at once.`);
    const nextSourceMap = new Map(), sources = []; let totalBytes = 0, totalPixels = 0;
    for (const [index, item] of picked.entries()) {
      if (path.extname(item.fsPath).toLowerCase() !== '.png') throw new Error('Standard Add Sprites currently accepts PNG sources only.');
      const admitted = boundedPngSource(item.fsPath, MAX_TOTAL_PIXELS - totalPixels), source = admitted.source, id = `embedded-${index}-${Date.now()}`;
      totalBytes += admitted.bytes; if (totalBytes > MAX_TOTAL_BYTES) throw new Error('The selected PNG batch exceeds the 256 MiB Standard intake limit. Split it into smaller reviewed batches.');
      totalPixels += admitted.pixels; nextSourceMap.set(id, { path: item.fsPath, hash: admitted.hash, bytes: admitted.bytes, width: source.width, height: source.height, bitDepth: source.bitDepth, colorType: source.colorType });
      sources.push({ id, name: path.basename(item.fsPath), width: source.width, height: source.height, kind: 'png', indexed: source.colorType === 3 && source.bitDepth === 8 });
    }
    sourceMap.clear(); for (const [id, source] of nextSourceMap) sourceMap.set(id, source);
    return sources;
  };
  const admit = message => {
    if (writerPreference.snapshot().mode !== capturedWriter.mode) throw new Error('Writer changed in another viewer. Close and reopen Add Sprites to review the new choice.');
    const freshTarget = creator.targetFromFile(absolute);
    if (byteHash(absolute) !== targetSeal.hash || freshTarget.sffVersion !== targetSeal.version || freshTarget.palettes.map(item => `${item.id}:${item.colorHash}`).join('|') !== targetSeal.palettes) throw new Error('The target SFF changed after Add Sprites opened. Close and reopen the popup to review the current archive.');
    const ids = Array.isArray(message.sourceIds) ? message.sourceIds : [], evidence = ids.map(id => sourceMap.get(String(id))).filter(Boolean), paths = evidence.map(item => item.path);
    if (!paths.length || paths.length !== ids.length) throw new Error('Choose at least one exact PNG source again before continuing.');
    let totalBytes = 0, totalPixels = 0; const admittedBuffers = [];
    for (const sealed of evidence) {
      const fresh = boundedPngSource(sealed.path, MAX_TOTAL_PIXELS - totalPixels), source = fresh.source; totalBytes += fresh.bytes; totalPixels += fresh.pixels;
      if (totalBytes > MAX_TOTAL_BYTES || fresh.bytes !== sealed.bytes || fresh.hash !== sealed.hash || source.width !== sealed.width || source.height !== sealed.height || source.bitDepth !== sealed.bitDepth || source.colorType !== sealed.colorType) throw new Error(`${path.basename(sealed.path)} changed after selection. Choose it again.`);
      admittedBuffers.push(fresh.buffer);
    }
    const palette = String(message.palette || 'image');
    if (palette === 'true-color' && target.sffVersion !== '2.1') throw new Error(`SFF ${target.sffVersion} cannot store true-color sprites. Choose Needs Palette.`);
    if (palette === 'true-color' && capturedWriter.mode === 'both') throw new Error('Both writers comparison cannot yet validate True Color safely. Select IKEMaker or SprMake2 in the shared Writer control, then reopen Add Sprites. The writer was not changed.');
    const paletteMode = palette.startsWith('target:') ? 'target' : palette === 'needs-palette' ? 'needs-palette' : palette === 'true-color' ? 'true-color' : 'image';
    return { paths, admittedBuffers, palette, paletteMode, paletteId: paletteMode === 'target' ? palette.slice(7) : '' };
  };
  const handle = async message => {
    if (message.action === 'chooseFiles') return { type: 'files', sources: await chooseFiles() };
    if (message.action === 'cancel') { if (!stageAuthority.consumed) stageAuthority.consume(); return { type: 'close' }; }
    if (!['stage', 'buildNow', 'openAdvanced', 'paletteWorkshop'].includes(message.action)) throw new Error('Unknown Add Sprites action. Reopen the popup.');
    return consumeStageAuthority(stageAuthority, async () => {
      const admitted = admit(message);
      if (message.action === 'paletteWorkshop') {
        if (admitted.palette !== 'needs-palette') throw new Error('Palette Workshop handoff requires the reviewed Needs Palette choice.');
        const handoff = needsPaletteHandoff.create({ target: targetSeal, sources: admitted.paths.map((sourcePath, index) => ({ path: sourcePath, hash: crypto.createHash('sha256').update(admitted.admittedBuffers[index]).digest('hex').toUpperCase(), bytes: admitted.admittedBuffers[index].length, width: sourceMap.get(String(message.sourceIds[index])).width, height: sourceMap.get(String(message.sourceIds[index])).height, bitDepth: sourceMap.get(String(message.sourceIds[index])).bitDepth, colorType: sourceMap.get(String(message.sourceIds[index])).colorType })), tilingMethod: message.tilingMethod, returnContext: { command: COMMAND, targetPath: absolute } });
        await api.commands.executeCommand('ikemen.palette.openWorkspace', api.Uri.file(absolute), { kind: 'sff-needs-palette', handoff }); return { type: 'close' };
      }
      if ((message.action === 'stage' || message.action === 'buildNow') && admitted.palette === 'needs-palette') throw new Error('Continue to Palette Workshop or Advanced to resolve Needs Palette before staging or building.');
      const result = await creator.stageCompactIntake(absolute, admitted.paths, { ...message, admittedBuffers: admitted.admittedBuffers, paletteChoice: admitted.palette, paletteMode: admitted.paletteMode, paletteId: admitted.paletteId, preferredWriter: capturedWriter.mode });
      if (message.action === 'buildNow') {
        if (capturedWriter.mode !== 'ikemaker') throw new Error('Build Now writes with IKEMaker. Choose IKEMaker in the shared Writer control, or use Continue in Advanced for comparison and SprMake2 workflows.');
        const buildCompactIntakeNow = options.buildCompactIntakeNow || creator.buildCompactIntakeNow;
        const built = await buildCompactIntakeNow(result.draft);
        await api.commands.executeCommand('sff.openViewer', api.Uri.file(absolute), undefined, undefined, { refresh: true });
        return { type: 'close', built };
      }
      if (message.action === 'openAdvanced') { await api.commands.executeCommand('sff.openCreator', api.Uri.file(absolute), { preferredWriter: capturedWriter.mode, refreshDraft: true }); return { type: 'close' }; }
      return { type: 'result', ok: true, message: `${result.message} Output intent: ${capturedWriter.label}.${result.limitation ? ` ${result.limitation}` : ''} The active SFF is unchanged until the reviewed build is completed.` };
    });
  };
  return Object.freeze({ model, handle, get consumed() { return stageAuthority.consumed; } });
}

function html(model) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
:root{color-scheme:light dark}*{box-sizing:border-box}[hidden]{display:none!important}body{margin:0;background:var(--vscode-editor-background);color:var(--vscode-foreground);font:13px var(--vscode-font-family)}button,input,select{font:inherit;min-height:28px}.head{position:sticky;top:0;z-index:2;padding:8px 10px;background:var(--vscode-editor-background);border-bottom:1px solid var(--vscode-panel-border)}main{max-width:720px;margin:auto;padding:10px}.step{border:1px solid var(--vscode-panel-border);margin:8px 0;background:var(--vscode-sideBar-background)}.step>h2{font-size:13px;margin:0;padding:8px;border-bottom:1px solid var(--vscode-panel-border)}.body{padding:9px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.field{display:grid;gap:3px}.row{display:flex;flex-wrap:wrap;gap:7px;align-items:center}.anchor{display:grid;grid-template-columns:repeat(3,34px);gap:3px}.anchor label{display:grid;place-items:center;width:34px;height:34px;border:1px solid var(--vscode-panel-border)}.anchor input{margin:0}.muted{color:var(--vscode-descriptionForeground)}.error{color:var(--vscode-errorForeground)}.ok{color:var(--vscode-testing-iconPassed)}#files{max-height:150px;overflow:auto;padding-left:22px}.primary{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:0;padding:5px 12px}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}@media(max-width:520px){.grid{grid-template-columns:1fr}main{padding:6px}.actions button{flex:1 1 auto}}
</style></head><body>${launchControlsHtml('sff', { includeLayout: false })}<div class="head"><b>Add Sprites</b> <span class="muted">Short guided SFF intake</span></div><main>
<p><b>Target:</b> ${model.targetName} · SFF ${model.targetVersion}<br><b>Output:</b> <span id="writerLabel" aria-label="Selected SFF output writer">${model.writerLabel}</span> <span class="muted">Chosen in the shared SFF writer control.</span></p>
<section class="step"><h2>1 · Images</h2><div class="body"><div class="row"><button id="choose">Choose PNG files…</button><button id="clear">Clear</button></div><ul id="files" aria-label="Selected sprite images"><li class="muted">No images chosen.</li></ul><p id="formatNote" class="muted" role="status" aria-live="polite">Standard intake accepts PNG sprites. GIF timing and PSD layers will appear here only after their guided follow-ups are complete.</p></div></section>
<section class="step"><h2>2 · Group and index</h2><div class="body grid"><label class="field">Group<input id="group" type="number" min="0" max="65535" value="0"></label><label class="field">First index<input id="startIndex" type="number" min="0" max="65535" value="0"></label><label><input id="detect" type="checkbox" ${model.detect ? 'checked' : ''}> Detect group/index from filenames when available</label><fieldset><legend>Numbering</legend><label><input type="radio" name="numbering" value="consecutive" checked> 1, 2, 3…</label><br><label><input type="radio" name="numbering" value="stepped"> 10, 20, 30…</label></fieldset><label class="field">If group/index already exists<select id="collisionPolicy"><option value="stop">Stop and show the conflict</option><option value="next-free">Use the next free index</option><option value="skip">Skip that image</option><option value="replace-staged">Replace only an explicitly staged entry</option></select></label></div></section>
<section class="step"><h2>3 · Axis</h2><div class="body grid"><fieldset><legend>Anchor</legend><div class="anchor">${['top-left','top-center','top-right','center-left','center','center-right','bottom-left','bottom-center','bottom-right'].map(value => `<label title="${value}"><input aria-label="${value.replace('-', ' ')} anchor" type="radio" name="anchor" value="${value}" ${value === (model.anchor || 'center') ? 'checked' : ''}></label>`).join('')}</div></fieldset><div><label class="field">X offset<input id="offsetX" type="number" min="-32768" max="32767" value="0"></label><label class="field">Y offset<input id="offsetY" type="number" min="-32768" max="32767" value="0"></label></div></div></section>
<section class="step"><h2>4 · Palette and storage</h2><div class="body grid"><label class="field">Palette<select id="palette"><option value="image">Use image palette</option>${model.palettes.map(item => `<option value="target:${item.id}">Use matching embedded ${item.id} (exact indexes)</option>`).join('')}${model.targetVersion === '2.1' ? '<option value="true-color">True Color</option>' : ''}<option value="needs-palette">Needs Palette</option></select></label><label class="field">Crop<select id="cropMode"><option value="none">Do not crop</option><option value="before-axis">Crop before axis</option><option value="after-axis">Crop after axis</option></select></label><label><input id="reversed" type="checkbox"> Reversed (Photoshop order)</label><label><input id="share" type="checkbox"> Share exact identical sprite data</label></div><div id="needsPaletteOptions" class="grid" role="group" aria-label="Needs Palette tiling options" hidden><label class="field">Too many colors<select id="tilingMethod"><option value="single-palette">Reduce deliberately to one 256-color palette</option><option value="automatic-tiles">Tile automatically to preserve colors</option><option value="reviewed-tiles">Choose and review tile boundaries</option></select></label><p class="muted">Tiling separates the image into palette-safe sprite pieces. Automatic tiling favors the fewest pieces; reviewed tiling lets you control boundaries and alignment.</p></div><div id="paletteBranch" class="muted" role="status" aria-live="polite"></div></section>
<section class="step"><h2>5 · Review</h2><div class="body"><p id="review" class="muted" role="status" aria-live="polite">Choose images to review the batch.</p><div class="actions"><button id="stage" class="primary" disabled>Stage Add Sprites</button><button id="paletteWorkshop" disabled>Create palette in Palette Workshop…</button><button id="advanced" disabled>Advanced SFF Creator…</button><button id="cancel">Cancel</button></div><p id="status" role="status" aria-live="polite"></p></div></section>
</main><script>const vscode=acquireVsCodeApi(),initial=${json(model)},controlAvailability=(${addSpritesControlAvailability.toString()});let sources=initial.sources||[],writerMode=initial.writerMode,writerStale=false,terminal=false,pending=false;const $=id=>document.getElementById(id),escape=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));function setControlState(control,state){if(!control)return;control.disabled=Boolean(state.disabled);control.title=state.reason||'';if(state.reason)control.setAttribute('aria-description',state.reason);else control.removeAttribute('aria-description')}function coordinatesValid(){return[group.value,startIndex.value,offsetX.value,offsetY.value].every((value,index)=>{const number=Number(value),limits=index<2?[0,65535]:[-32768,32767];return Number.isSafeInteger(number)&&number>=limits[0]&&number<=limits[1]})}function render(){files.innerHTML=sources.length?sources.map(s=>'<li>'+escape(s.name)+' · '+s.width+'×'+s.height+' · '+(s.indexed?'indexed PNG8':escape(s.kind))+'</li>').join(''):'<li class="muted">No images chosen.</li>';const nonPng=sources.some(s=>s.kind!=='png'),trueColor=sources.some(s=>s.kind==='png'&&!s.indexed),choice=palette.value,is21=initial.targetVersion==='2.1';needsPaletteOptions.hidden=choice!=='needs-palette';formatNote.textContent=nonPng?'This format is not available in Standard intake yet.':trueColor?(is21?'Choose True Color to retain the source pixels, or Needs Palette to prepare indexed artwork.':'This SFF version requires true-color artwork to go through Needs Palette.'):'Indexed PNG8 sources are ready for exact review.';const availability=controlAvailability({sourceCount:sources.length,nonPng,trueColor,paletteChoice:choice,targetVersion:initial.targetVersion,coordinatesValid:coordinatesValid(),writerMode,writerStale,pending,terminal}),blocker=availability.stage.reason;review.textContent=blocker||sources.length+' image(s) will be staged at group '+group.value+', index '+startIndex.value+' using '+writerLabel.textContent+'.';for(const [id,state] of Object.entries({choose:availability.choose,clear:availability.clear,stage:availability.stage,advanced:availability.advanced,paletteWorkshop:availability.paletteWorkshop,cancel:availability.cancel}))setControlState($(id),state);for(const control of document.querySelectorAll('input,select'))setControlState(control,availability.reviewFields);paletteBranch.textContent=choice==='needs-palette'?'Next: continue to Palette Workshop with '+tilingMethod.options[tilingMethod.selectedIndex].text+'.':choice==='true-color'?'SFF 2.1 true-color intent will be retained. Writer readiness is reviewed separately; this choice will not be converted to Needs Palette.':''}function beginPending(message){if(pending||terminal)return false;pending=true;status.textContent=message;render();return true}choose.onclick=()=>{if(beginPending('Waiting for PNG selection…'))vscode.postMessage({type:'chooseFiles'})};clear.onclick=()=>{sources=[];render()};for(const id of ['group','startIndex','offsetX','offsetY','palette','cropMode','share','detect','collisionPolicy','reversed','tilingMethod'])$(id).onchange=render;document.querySelectorAll('input[name=numbering],input[name=anchor]').forEach(x=>x.onchange=render);group.value=initial.group??group.value;startIndex.value=initial.startIndex??startIndex.value;reversed.checked=initial.reversed===true;stage.onclick=()=>{if(!beginPending('Validating and staging…'))return;vscode.postMessage({type:'stage',sourceIds:sources.map(s=>s.id),group:Number(group.value),startIndex:Number(startIndex.value),numberingMode:document.querySelector('input[name=numbering]:checked').value,collisionPolicy:collisionPolicy.value,anchor:document.querySelector('input[name=anchor]:checked').value,offsetX:Number(offsetX.value),offsetY:Number(offsetY.value),cropMode:cropMode.value,palette:palette.value,shareIdentical:share.checked,reversed:reversed.checked,detect:detect.checked})};paletteWorkshop.onclick=()=>{if(beginPending('Opening Palette Workshop…'))vscode.postMessage({type:'openPaletteWorkshop',sourceIds:sources.map(s=>s.id),tilingMethod:tilingMethod.value})};advanced.onclick=()=>{if(!beginPending('Transferring this reviewed batch to Advanced…'))return;vscode.postMessage({type:'openAdvanced',sourceIds:sources.map(s=>s.id),group:Number(group.value),startIndex:Number(startIndex.value),numberingMode:document.querySelector('input[name=numbering]:checked').value,collisionPolicy:collisionPolicy.value,anchor:document.querySelector('input[name=anchor]:checked').value,offsetX:Number(offsetX.value),offsetY:Number(offsetY.value),cropMode:cropMode.value,palette:palette.value,shareIdentical:share.checked,reversed:reversed.checked,detect:detect.checked,tilingMethod:tilingMethod.value})};cancel.onclick=()=>{if(!pending)vscode.postMessage({type:'cancel'})};addEventListener('message',event=>{const m=event.data||{};if(m.type==='files'){pending=false;if(Array.isArray(m.sources))sources=m.sources;status.textContent=m.cancelled?'Image selection was cancelled. Nothing changed.':'';render()}if(m.type==='sffWriterPreferenceState'&&m.mode!==writerMode){writerStale=true;writerLabel.textContent=m.label;render()}if(m.type==='result'){pending=false;terminal=m.terminal===true;status.className=m.ok?'ok':'error';status.setAttribute('role',m.ok?'status':'alert');status.textContent=(m.message||'')+(terminal&&!m.ok?' Close this window and reopen Add Sprites to try again.':'');render()}});globalThis.ikemenIsBusy=()=>pending;globalThis.ikemenCanKeepDraft=()=>false;render();${launchControlsClientScript()}${require('./viewer_close').clientScript()}</script></body></html>`;
}

async function openAddSprites(uri, options = {}) {
  let filename = uri?.fsPath && /\.sff$/i.test(uri.fsPath) ? path.resolve(uri.fsPath) : '';
  if (!filename) {
    const picked = await vscode.window.showOpenDialog({ title: 'Choose the SFF that will receive sprites', canSelectFiles: true, canSelectFolders: false, canSelectMany: false, filters: { SFF: ['sff'] } });
    if (!picked?.[0]) return null;
    filename = path.resolve(picked[0].fsPath);
  }
  const key = keyOf(filename), existing = sessions.get(key);
  if (existing) { existing.reveal(undefined, false); return existing; }
  const target = creator.targetFromFile(filename), capturedWriter = writerPreference.snapshot();
  const panel = trackViewerPanel(vscode.window.createWebviewPanel('ikemenSffAddSprites', `Add Sprites · ${target.name}`, preferredViewerColumn(vscode.ViewColumn.Active), { enableScripts: true, retainContextWhenHidden: true }));
  sessions.set(key, panel);
  const sourceMap = new Map(), initialSources = [], writerAttachment = writerPreference.attach(panel), targetSeal = { path: filename, hash: target.fingerprint.toUpperCase(), bytes: fs.statSync(filename).size, version: target.sffVersion, palettes: target.palettes.map(item => `${item.id}:${item.colorHash}`).join('|') };
  if (Array.isArray(options.sourcePaths)) {
    if (options.sourcePaths.length > MAX_COMPACT_SOURCES) throw new Error(`Standard intake accepts at most ${MAX_COMPACT_SOURCES} images at once.`);
    let totalBytes = 0, totalPixels = 0;
    for (const [index, sourcePath] of options.sourcePaths.entries()) {
      const admitted = boundedPngSource(sourcePath, MAX_TOTAL_PIXELS - totalPixels), source = admitted.source, id = `handoff-${index}-${Date.now()}`;
      totalBytes += admitted.bytes; totalPixels += admitted.pixels;
      if (totalBytes > MAX_TOTAL_BYTES) throw new Error('The handed-off PNG batch exceeds the 256 MiB Standard intake limit.');
      sourceMap.set(id, { path: sourcePath, hash: admitted.hash, bytes: admitted.bytes, width: source.width, height: source.height, bitDepth: source.bitDepth, colorType: source.colorType });
      initialSources.push({ id, name: path.basename(sourcePath), width: source.width, height: source.height, kind: 'png', indexed: source.colorType === 3 && source.bitDepth === 8 });
    }
  }
  const stageAuthority = createStageAuthority();
  const admitReviewedBatch = message => {
    if (writerPreference.snapshot().mode !== capturedWriter.mode) throw new Error('Writer changed in another viewer. Reopen Add Sprites to capture and review the new choice.');
    const freshTarget = creator.targetFromFile(filename);
    if (byteHash(filename) !== targetSeal.hash || freshTarget.sffVersion !== targetSeal.version || freshTarget.palettes.map(item => `${item.id}:${item.colorHash}`).join('|') !== targetSeal.palettes) throw new Error('The target SFF changed after this Add Sprites review opened. Reopen the flow to review the current archive.');
    const ids = Array.isArray(message.sourceIds) ? message.sourceIds : [], evidence = ids.map(id => sourceMap.get(String(id))).filter(Boolean), paths = evidence.map(item => item.path);
    if (!paths.length || paths.length !== ids.length || paths.some(item => path.extname(item).toLowerCase() !== '.png')) throw new Error('The chosen source set is incomplete or requires the GIF/PSD follow-up.');
    let stagePixels = 0, stageBytes = 0; const admittedBuffers = [];
    for (const sealed of evidence) {
      const admitted = boundedPngSource(sealed.path, MAX_TOTAL_PIXELS - stagePixels), fresh = admitted.source;
      stagePixels += admitted.pixels; stageBytes += admitted.bytes;
      if (stageBytes > MAX_TOTAL_BYTES || admitted.bytes !== sealed.bytes || admitted.hash !== sealed.hash || fresh.width !== sealed.width || fresh.height !== sealed.height || fresh.bitDepth !== sealed.bitDepth || fresh.colorType !== sealed.colorType) throw new Error(`${path.basename(sealed.path)} changed after selection. Choose the source again.`);
      admittedBuffers.push(admitted.buffer);
    }
    const palette = String(message.palette || 'image');
    if (palette === 'true-color' && target.sffVersion !== '2.1') throw new Error(`SFF ${target.sffVersion} cannot store true-color sprites. Choose Needs Palette.`);
    if (palette === 'true-color' && capturedWriter.mode === 'both') throw new Error('Both writers comparison cannot yet validate True Color safely. Select IKEMaker or SprMake2 in the shared Writer control, then reopen Add Sprites. The writer was not changed.');
    const paletteMode = palette.startsWith('target:') ? 'target' : palette === 'needs-palette' ? 'needs-palette' : palette === 'true-color' ? 'true-color' : 'image';
    return { paths, admittedBuffers, palette, paletteMode, paletteId: paletteMode === 'target' ? palette.slice(7) : '' };
  };
  panel.webview.html = require('./webview_policy').protect(html({ targetName: target.name, targetVersion: target.sffVersion, palettes: target.palettes.map(item => ({ id: item.id })), writerMode: capturedWriter.mode, writerLabel: capturedWriter.label, sources: initialSources, group: finiteIntakeValue(options.group), startIndex: finiteIntakeValue(options.startIndex), detect:options.detect===true, reversed: options.reversed === true, anchor: ['top-left','top-center','top-right','center-left','center','center-right','bottom-left','bottom-center','bottom-right'].includes(options.anchor) ? options.anchor : 'center', occupiedIndexesByGroup: targetGroupOccupancy(target) }), panel.webview.cspSource);
  require('./viewer_close').support(panel, { readOnly: true });
  panel.webview.onDidReceiveMessage(message => Promise.resolve().then(async () => {
    if (await writerPreference.handle(message, vscode)) return;
    if (await handleLaunchMessage(message, filename, 'sff', panel)) return;
    if (message?.type === 'cancel') { panel.dispose(); return; }
    if (message?.type === 'openAdvanced') {
      await consumeStageAuthority(stageAuthority, async () => {
        const admitted = admitReviewedBatch(message);
        await creator.stageCompactIntake(filename, admitted.paths, { ...message, admittedBuffers: admitted.admittedBuffers, paletteChoice: admitted.palette, paletteMode: admitted.paletteMode, paletteId: admitted.paletteId, preferredWriter: capturedWriter.mode });
      });
      await vscode.commands.executeCommand('sff.openCreator', vscode.Uri.file(filename), { preferredWriter: capturedWriter.mode, refreshDraft: true });
      panel.dispose(); return;
    }
    if (message?.type === 'openPaletteWorkshop') { const sourceIds = Array.isArray(message.sourceIds) ? message.sourceIds : [], sources = sourceIds.map(id => sourceMap.get(String(id))).filter(Boolean), tilingMethod = ['single-palette', 'automatic-tiles', 'reviewed-tiles'].includes(message.tilingMethod) ? message.tilingMethod : 'single-palette'; if (!sources.length || sources.length !== sourceIds.length) throw new Error('Choose the exact images again before opening Needs Palette.'); const handoff = needsPaletteHandoff.create({ target: targetSeal, sources, tilingMethod, returnContext: { command: COMMAND, targetPath: filename } }); await vscode.commands.executeCommand('ikemen.palette.openWorkspace', vscode.Uri.file(filename), { kind: 'sff-needs-palette', handoff }); panel.dispose(); return; }
    if (message?.type === 'chooseFiles') {
      const picked = await vscode.window.showOpenDialog({ title: 'Choose PNG sprite images', canSelectFiles: true, canSelectFolders: false, canSelectMany: true, filters: { 'PNG sprite images': ['png'] } });
      if (!picked) { await panel.webview.postMessage({ type: 'files', sources: null, cancelled: true }); return; }
      if (picked.length > MAX_COMPACT_SOURCES) throw new Error(`Standard intake accepts at most ${MAX_COMPACT_SOURCES} images at once.`);
      const nextSourceMap = new Map(), sources = [];
      let totalBytes = 0, totalPixels = 0;
      for (const [index, item] of picked.entries()) {
        const extension = path.extname(item.fsPath).toLowerCase(), id = `picked-${index}-${Date.now()}`;
        if (extension !== '.png') throw new Error('Standard Add Sprites currently accepts PNG sources only.');
        const admitted = boundedPngSource(item.fsPath, MAX_TOTAL_PIXELS - totalPixels), source = admitted.source;
        totalBytes += admitted.bytes; if (totalBytes > MAX_TOTAL_BYTES) throw new Error('The selected PNG batch exceeds the 256 MiB Standard intake limit. Split it into smaller reviewed batches.');
        totalPixels += admitted.pixels;
        nextSourceMap.set(id, { path: item.fsPath, hash: admitted.hash, bytes: admitted.bytes, width: source.width, height: source.height, bitDepth: source.bitDepth, colorType: source.colorType }); sources.push({ id, name: path.basename(item.fsPath), width: source.width, height: source.height, kind: 'png', indexed: source.colorType === 3 && source.bitDepth === 8 });
      }
      sourceMap.clear(); for (const [id, source] of nextSourceMap) sourceMap.set(id, source);
      await panel.webview.postMessage({ type: 'files', sources }); return;
    }
    if (message?.type === 'stage') {
      stageAuthority.consume();
      if (writerPreference.snapshot().mode !== capturedWriter.mode) throw new Error('Writer changed in another viewer. Reopen Add Sprites to capture and review the new choice.');
      const freshTarget = creator.targetFromFile(filename); if (byteHash(filename) !== targetSeal.hash || freshTarget.sffVersion !== targetSeal.version || freshTarget.palettes.map(item => `${item.id}:${item.colorHash}`).join('|') !== targetSeal.palettes) throw new Error('The target SFF changed after this Add Sprites review opened. Reopen the flow to review the current archive.');
      const ids = Array.isArray(message.sourceIds) ? message.sourceIds : [], evidence = ids.map(id => sourceMap.get(String(id))).filter(Boolean), paths = evidence.map(item => item.path);
      if (paths.length !== ids.length || paths.some(item => path.extname(item).toLowerCase() !== '.png')) throw new Error('The chosen source set is incomplete or requires the GIF/PSD follow-up.');
      let stagePixels = 0, stageBytes = 0; const stageAdmissions = []; for (const sealed of evidence) { const admitted = boundedPngSource(sealed.path, MAX_TOTAL_PIXELS - stagePixels), fresh = admitted.source; stagePixels += admitted.pixels; stageBytes += admitted.bytes; if (stageBytes > MAX_TOTAL_BYTES || admitted.bytes !== sealed.bytes || admitted.hash !== sealed.hash || fresh.width !== sealed.width || fresh.height !== sealed.height || fresh.bitDepth !== sealed.bitDepth || fresh.colorType !== sealed.colorType) throw new Error(`${path.basename(sealed.path)} changed after selection. Choose the source again.`); stageAdmissions.push(admitted.buffer); }
      const palette = String(message.palette || 'image');
      if (palette === 'needs-palette') throw new Error('Resolve the palette before staging.');
      if (palette === 'true-color' && target.sffVersion !== '2.1') throw new Error(`SFF ${target.sffVersion} cannot store true-color sprites. Choose Needs Palette.`);
      if (palette === 'true-color' && capturedWriter.mode === 'both') throw new Error('Both writers comparison cannot yet validate True Color safely. Select IKEMaker or SprMake2 in the shared Writer control, then reopen Add Sprites. The writer was not changed.');
      const paletteMode = palette.startsWith('target:') ? 'target' : 'image', paletteId = paletteMode === 'target' ? palette.slice(7) : '';
      const result = await creator.stageCompactIntake(filename, paths, { ...message, admittedBuffers: stageAdmissions, paletteChoice: palette, paletteMode, paletteId, preferredWriter: capturedWriter.mode });
      await panel.webview.postMessage({ type: 'result', ok: true, terminal: true, message: `${result.message} Output intent: ${capturedWriter.label}.${result.limitation ? ` ${result.limitation}` : ''} The active SFF is unchanged until the reviewed build is completed.` });
    }
  }).catch(error => panel.webview.postMessage({ type: 'result', ok: false, terminal: stageAuthority.consumed, message: error.message })));
  panel.onDidDispose(() => { writerAttachment.dispose(); if (sessions.get(key) === panel) sessions.delete(key); });
  return panel;
}

function register(context) { context.subscriptions.push(vscode.commands.registerCommand('sff.openAddSprites', openAddSprites)); }
module.exports = { COMMAND, html, openAddSprites, register, boundedPngSource, createStageAuthority, consumeStageAuthority, selectedSpriteDefaults, createEmbeddedSession, addSpritesControlAvailability, targetGroupOccupancy };
