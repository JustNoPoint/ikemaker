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
const { prepareGuidedSource } = require('./sff_guided_intake');

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
  const sourceReason = !count ? 'Choose images or a sprite sheet first.' : state.nonPng ? 'Standard Add Sprites accepts PNG sources only. Choose PNG files or use Advanced SFF Creator.' : '';
  const guidedReason = String(state.guidedProblem || '');
  const coordinateReason = state.coordinatesValid === false ? 'Enter whole-number group, index, and axis values within the displayed limits.' : '';
  const writerReason = state.paletteChoice === 'true-color' && state.writerMode === 'both' ? 'Both writers comparison cannot yet validate True Color safely. Select IKEMaker or SprMake2 in Output above.' : state.writerStale ? 'The shared writer changed elsewhere. Review shared writer or choose Output above; selected images and review choices are retained.' : '';
  const trueColorReason = state.trueColor && state.paletteChoice !== 'true-color' && state.paletteChoice !== 'needs-palette' && !String(state.paletteChoice).startsWith('master:') && !state.exactImageEligible
    ? (state.targetVersion === '2.1' ? 'Choose True Color or Needs Palette for the selected true-color PNGs.' : `SFF ${state.targetVersion || ''} requires true-color PNGs to use Needs Palette.`)
    : state.paletteChoice === 'true-color' && state.targetVersion !== '2.1' ? `SFF ${state.targetVersion || ''} cannot store true-color sprites. Choose Needs Palette.` : '';
  const stageReason = common || sourceReason || coordinateReason || guidedReason || trueColorReason || (state.paletteChoice === 'needs-palette' ? 'Continue to Palette Workshop or Advanced SFF Creator to resolve Needs Palette.' : '') || writerReason;
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

async function chooseGuidedBatch(api, sourcePaths = null, sheet = false, reviewCuts) {
  let picked;
  if (sourcePaths) {
    picked = sourcePaths.map(fsPath => ({ fsPath }));
  } else {
    picked = await api.window.showOpenDialog({
      title: sheet ? 'Choose a sprite sheet' : 'Choose PNG, GIF or PSD sprite sources',
      canSelectFiles: true, canSelectFolders: false, canSelectMany: !sheet,
      filters: sheet ? { 'Sprite sheets': ['png', 'psd', 'pcx'] } : { 'Sprite sources': ['png', 'gif', 'psd'] }
    });
  }
  if (!picked) return null;
  if (picked.length > MAX_COMPACT_SOURCES) throw new Error(`Guided intake accepts at most ${MAX_COMPACT_SOURCES} source files.`);
  if (picked.reduce((sum, item) => sum + fs.statSync(item.fsPath).size, 0) > MAX_TOTAL_BYTES) throw new Error('The selected source batch exceeds the 256 MiB guided intake limit.');
  const psdCount = picked.filter(item => /\.psd$/i.test(item.fsPath)).length;
  const psdChoice = psdCount && !sheet ? await api.window.showQuickPick([{ label: 'Flattened composites', description: `One authored composite per PSD (${psdCount} documents).`, mode: 'composite' }, { label: 'Separate body / cosmetic layers…', description: 'Isolated raw pages on the original canvas, not the merged appearance; review every selected page.', mode: 'layers' }, { label: 'Isolated raw layers (ignore layer appearance)…', description: 'Intentionally ignore layer visibility, opacity and blend settings; preserve stored pixel alpha instead of merged appearance.', mode: 'raw-layers' }], { title: `How should the ${psdCount} PSD document(s) enter this batch?` }) : null;
  if (psdCount && !sheet && !psdChoice) return null;
  const records = new Map(), sources = [], batches = []; let totalBytes = 0, totalPixels = 0, psdOrdinal = 0;
  try {
    for (const item of picked) {
      const documentOrdinal = /\.psd$/i.test(item.fsPath) ? psdOrdinal++ : null;
      const configuration = api.workspace?.getConfiguration?.('ikemenZss');
      const prepare = sheet ? require('./sff_quick_sheet_intake').prepareQuickSheet : prepareGuidedSource;
      const batch = await prepare(item.fsPath, api, { reviewCuts, psdMode: psdChoice?.mode, ffmpeg: configuration?.get('ffmpegPath', 'ffmpeg') || 'ffmpeg', imageMagick: configuration?.get('imageMagickPath', 'magick') || 'magick' });
      if (!batch) { for (const owned of batches) owned.dispose(); return null; }
      batches.push(batch);
      for (const row of batch.rows) {
        const sequenceOrdinal = sheet ? row.sequenceOrdinal : documentOrdinal;
        if (sources.length >= MAX_COMPACT_SOURCES) throw new Error('The extracted batch exceeds the 4096-image guided intake limit.');
        const admitted = boundedPngSource(row.filename, MAX_TOTAL_PIXELS - totalPixels), source = admitted.source, id = `guided-${crypto.randomUUID()}`;
        totalBytes += admitted.bytes; totalPixels += admitted.pixels;
        if (totalBytes > MAX_TOTAL_BYTES) throw new Error('The extracted PNG batch exceeds the 256 MiB guided intake limit.');
        records.set(id, { path: row.filename, hash: admitted.hash, bytes: admitted.bytes, width: source.width, height: source.height, bitDepth: source.bitDepth, colorType: source.colorType, originalProof: batch.assertSourceOriginal || row.assertOriginal, provenance: {...row.provenance,sequenceOrdinal} });
        sources.push({ id, name: row.label + (row.layerRole ? ` · ${row.layerRole}` : ''), width: source.width, height: source.height, kind: 'png', indexed: source.colorType === 3 && source.bitDepth === 8, role: row.role, sourceKey: `${row.provenance.sourceFile}:${row.provenance.sourceByteHash}`, sourceFrameCount: row.provenance.sourceFrameCount, sourceOrdinal: row.provenance.sourceOrdinal, layerRole: row.layerRole || null, sequenceOrdinal, imagePalette: require('./sff_exact_image_palette').imagePaletteAvailability(admitted.buffer), layerMetadata: row.layerMetadata || null, delayMs: row.delayMs ?? null, timingAvailable: row.timingAvailable ?? null });
      }
    }
    if (['layers', 'raw-layers'].includes(psdChoice?.mode)) {
      const separate = sources.filter(item => item.role === 'separate-layer'), supported = item => { const layer = item.layerMetadata; return layer.metadataKnown?.visibility && layer.metadataKnown?.opacity && layer.metadataKnown?.blend && layer.visible !== false && layer.opacity === 1 && (!layer.compose || ['normal', 'over'].includes(layer.compose)); };
      const selected = await api.window.showQuickPick(separate.map(item => ({ label: item.name, description: `${item.width}×${item.height} canvas; page ${item.layerMetadata.index}; offset ${item.layerMetadata.x},${item.layerMetadata.y}; ${item.layerMetadata.metadataKnown?.visibility ? (item.layerMetadata.visible ? 'visible' : 'hidden') : 'visibility unknown'}; opacity ${item.layerMetadata.metadataKnown?.opacity ? item.layerMetadata.opacity : 'unknown'}; blend ${item.layerMetadata.compose || 'unknown'}`, picked: psdChoice.mode === 'raw-layers' || supported(item), item })), { title: `Review ${separate.length} separate pages across ${psdCount} PSDs`, canPickMany: true, placeHolder: 'Keep the body/cosmetic pages you intend; unselected and absent pages are not invented.' });
      if (!selected?.length) { for (const batch of batches) batch.dispose(); return null; }
      if (psdChoice.mode !== 'raw-layers' && selected.some(choice => !supported(choice.item))) throw new Error('A selected PSD layer has unknown or unsupported visibility, opacity or blend settings that isolated import cannot reproduce. Deselect it or choose flattened composites.');
      const keep = new Set(selected.map(choice => choice.item.id));
      for (let at = sources.length - 1; at >= 0; at--) if (sources[at].role === 'separate-layer' && !keep.has(sources[at].id)) { records.delete(sources[at].id); sources.splice(at, 1); }
    }
    return { records, sources, batches, dispose() { for (const batch of batches) batch.dispose(); } };
  } catch (error) { for (const batch of batches) batch.dispose(); throw error; }
}

function createEmbeddedSession(filename, api = vscode, options = {}) {
  const absolute = path.resolve(filename), target = creator.targetFromFile(absolute), sourceMap = new Map();
  let capturedWriter = writerPreference.snapshot();
  const targetSeal = { path: absolute, hash: target.fingerprint.toUpperCase(), bytes: fs.statSync(absolute).size, version: target.sffVersion, palettes: target.palettes.map(item => `${item.id}:${item.colorHash}`).join('|') };
  let stageAuthority = createStageAuthority(); let ownedSelection = null, disposed = false, operationPending = false, completedQuick = null, reviewedMaster = null;
  const cutLifetime = new AbortController();
  const reviewCuts = options.reviewCuts || ((api, model) => require('./sff_quick_sheet_review').reviewQuickSheetCuts(api, model, options.sheetPanel?.(), cutLifetime.signal));
  const masterKey=message=>JSON.stringify([message.palette,message.sourceIds]);
  const defaults = selectedSpriteDefaults(absolute, options.selectedPhysicalIndex);
  const writeAvailability=Object.fromEntries(writerPreference.MODES.map(mode=>[mode,require('./sff_quick_write_availability').quickWriteAvailability(target,mode)]));
  const model = Object.freeze({ targetName: target.name, targetPath:absolute, targetVersion: target.sffVersion, writeAvailability, palettes: target.palettes.map(item => ({ id: item.id })), writerMode: capturedWriter.mode, writerLabel: capturedWriter.label, defaults, occupiedIndexesByGroup: targetGroupOccupancy(target) });
  const chooseFiles = async (paths = null, sheet = false) => {
    const batch = await chooseGuidedBatch(api, paths, sheet, reviewCuts); if (!batch) return null;
    if (disposed) { batch.dispose(); throw new Error('The Add Sprites owner closed during selection. Nothing was staged.'); }
    ownedSelection?.dispose(); reviewedMaster?.admission.dispose();reviewedMaster=null;ownedSelection = batch;
    sourceMap.clear(); for (const [id, source] of batch.records) sourceMap.set(id, source);
    return batch.sources;
  };
  const admit = message => {
    if (writerPreference.snapshot().mode !== capturedWriter.mode) throw new Error('Writer changed in another viewer. Close and reopen Add Sprites to review the new choice.');
    const freshTarget = creator.targetFromFile(absolute);
    if (byteHash(absolute) !== targetSeal.hash || freshTarget.sffVersion !== targetSeal.version || freshTarget.palettes.map(item => `${item.id}:${item.colorHash}`).join('|') !== targetSeal.palettes) throw new Error('The target SFF changed after Add Sprites opened. Close and reopen the popup to review the current archive.');
    const ids = Array.isArray(message.sourceIds) ? message.sourceIds : [], evidence = ids.map(id => sourceMap.get(String(id))).filter(Boolean), paths = evidence.map(item => item.path);
    if (!paths.length || paths.length !== ids.length) throw new Error('Choose at least one exact PNG source again before continuing.');
    let totalBytes = 0, totalPixels = 0; const admittedBuffers = [], verifiedProofs = new Set();
    for (const sealed of evidence) {
      if (sealed.originalProof && !verifiedProofs.has(sealed.originalProof)) {
        sealed.originalProof();
        verifiedProofs.add(sealed.originalProof);
      }
      const fresh = boundedPngSource(sealed.path, MAX_TOTAL_PIXELS - totalPixels), source = fresh.source; totalBytes += fresh.bytes; totalPixels += fresh.pixels;
      if (totalBytes > MAX_TOTAL_BYTES || fresh.bytes !== sealed.bytes || fresh.hash !== sealed.hash || source.width !== sealed.width || source.height !== sealed.height || source.bitDepth !== sealed.bitDepth || source.colorType !== sealed.colorType) throw new Error(`${path.basename(sealed.path)} changed after selection. Choose it again.`);
      admittedBuffers.push(fresh.buffer);
    }
    const palette = String(message.palette || 'image');
    if (palette === 'true-color' && target.sffVersion !== '2.1') throw new Error(`SFF ${target.sffVersion} cannot store true-color sprites. Choose Needs Palette.`);
    if (palette === 'true-color' && capturedWriter.mode === 'both') throw new Error('Both writers comparison cannot yet validate True Color safely. Select IKEMaker or SprMake2 in Output above. The writer was not changed.');
    const paletteMode = palette.startsWith('target:') || palette.startsWith('master:') ? 'target' : palette === 'needs-palette' ? 'needs-palette' : palette === 'true-color' ? 'true-color' : 'image';
    return { paths, admittedBuffers, sourceProvenance: evidence.map(item => item.provenance || null), palette, paletteMode, paletteId: paletteMode === 'target' ? palette.slice(7) : '' };
  };
  const handle = async message => {
    if (disposed) throw new Error('The Add Sprites owner closed. Reopen it.');
    if(['preflightMaster','reviewMaster'].includes(message.action)){
      if(operationPending||stageAuthority.consumed)throw Error('Wait for the current review before checking the master palette.');
      const admission=admit(message),master=require('./sff_master_intake'),archive=require('./sff_reader').readSff(absolute),palette=archive.palettes.filter(item=>`${item.group},${item.number}`===admission.palette.slice(7));
      if(!admission.palette.startsWith('master:')||palette.length!==1)throw Error('Choose one exact master palette.');
      const plan=master.analyzeExactMaster(admission.admittedBuffers,require('./sff_reader').paletteRgba(archive,palette[0].index));
      if(plan.unmatched.length)return{type:'masterState',requestId:message.requestId,enabled:false,needsReview:false,reason:`${plan.unmatched.length} used colors do not exactly match this master. Choose image palette, Needs Palette or True Color; no nearest mapping was performed.`};
      if(message.action==='reviewMaster'){
        operationPending=true;try{const mapped=await master.prepareMasterAdmission(api,absolute,admission,()=>admit(message));if(mapped){reviewedMaster?.admission.dispose();reviewedMaster={key:masterKey(message),admission:mapped};}}finally{operationPending=false;}
      }
      const needsReview=plan.ambiguities.length>0&&reviewedMaster?.key!==masterKey(message);
      return{type:'masterState',requestId:message.requestId,enabled:!needsReview,needsReview,reason:needsReview?'Used colors match multiple master indexes. Review master indexes before Write SFF.':'Exact master mapping checked; no color approximation.'};
    }
    if(message.action==='changeWriter'){
      if(operationPending||stageAuthority.consumed)throw new Error('Wait for the current Add Sprites review or build to finish before changing its writer.');
      if(!writerPreference.MODES.includes(message.mode))throw new Error('Choose IKEMaker, SprMake2 or Both.');
      const recheck=()=>{if(disposed)throw new Error('The Add Sprites owner closed.');const current=creator.targetFromFile(absolute);if(byteHash(absolute)!==targetSeal.hash||current.sffVersion!==targetSeal.version||current.palettes.map(item=>`${item.id}:${item.colorHash}`).join('|')!==targetSeal.palettes)throw new Error('The target SFF changed. Reopen Add Sprites before reviewing a different writer.');for(const source of sourceMap.values()){source.originalProof?.();if(byteHash(source.path)!==source.hash.toUpperCase())throw new Error('A selected source changed. Choose the source again before changing its writer.');}};
      operationPending=true;
      try{recheck();await writerPreference.handle({type:'sffWriterPreferenceChange',mode:message.mode},api);const chosen=await writerPreference.settledSnapshot();recheck();if(chosen.mode!==message.mode)throw new Error('The shared writer changed again. Review its current choice.');capturedWriter=chosen;return{type:'writer',...chosen};}finally{operationPending=false;}
    }
    if (message.action === 'chooseFiles' || message.action === 'chooseSheet') {if(operationPending || stageAuthority.consumed)throw new Error('Wait for the current Add Sprites review.');operationPending=true;try{return { type: 'files', sources: await chooseFiles(null, message.action === 'chooseSheet') }}finally{operationPending=false;}}
    if(message.action==='reviewAir'){if(!completedQuick)throw Error('Write and verify the SFF before reviewing optional AIR.');if(operationPending)return{type:'airPending'};operationPending=true;try{const result=await require('./sff_guided_gif_air').dispatchGuidedGifAirHandoff(api,completedQuick.staged,{enabled:true,verifiedBuild:completedQuick.built,...(()=>{const assigned=require('./sff_assigned_air').airSources(absolute,{api});return assigned.assigned&&assigned.files.length===1?{assignedAirPath:assigned.files[0].filename}:{}})()});return{type:'airResult',...result};}finally{operationPending=false;}}
    if (message.action === 'cancel') {if(operationPending)return{type:'busy',message:'The current write or review is still running. Close is disabled until its outcome is known.'};if (!stageAuthority.consumed) stageAuthority.consume(); ownedSelection?.dispose();reviewedMaster?.admission.dispose();reviewedMaster=null; ownedSelection = null; return { type: 'close' }; }
    if (!['stage', 'buildNow', 'openAdvanced', 'paletteWorkshop'].includes(message.action)) throw new Error('Unknown Add Sprites action. Reopen the popup.');
    if (operationPending) throw new Error('Wait for the current Add Sprites review to finish.');
    if (stageAuthority.consumed) return consumeStageAuthority(stageAuthority, async () => {});
    operationPending = true; let mapped = null;
    try {
      if (String(message.palette).startsWith('master:')) {
        admit(message);
        if(reviewedMaster?.key===masterKey(message)){mapped=reviewedMaster.admission;reviewedMaster=null;}
        else mapped = await require('./sff_master_intake').prepareMasterAdmission(api, absolute, admit(message), () => { if (disposed) throw new Error('The Add Sprites owner closed during palette review.'); admit(message); }, {interactive:message.action!=='buildNow'});
        if (!mapped) return { type:'result', ok:false, terminal:false, message:'Master index selection was cancelled. The selected batch is unchanged.' };
      }
      if(!mapped&&(!message.palette||message.palette==='image'))mapped=require('./sff_exact_image_palette').prepareImagePaletteAdmission(admit(message),capturedWriter.mode);
      return await consumeStageAuthority(stageAuthority, async () => {
      const admitted = mapped || admit(message);
      if (message.action === 'paletteWorkshop') {
        if (admitted.palette !== 'needs-palette') throw new Error('Palette Workshop handoff requires the reviewed Needs Palette choice.');
        const handoff = needsPaletteHandoff.create({ target: targetSeal, sources: creator.retainGuidedSources(admitted.paths.map((sourcePath, index) => ({ path: sourcePath, hash: crypto.createHash('sha256').update(admitted.admittedBuffers[index]).digest('hex').toUpperCase(), bytes: admitted.admittedBuffers[index].length, width: sourceMap.get(String(message.sourceIds[index])).width, height: sourceMap.get(String(message.sourceIds[index])).height, bitDepth: sourceMap.get(String(message.sourceIds[index])).bitDepth, colorType: sourceMap.get(String(message.sourceIds[index])).colorType, provenance: sourceMap.get(String(message.sourceIds[index])).provenance }))), tilingMethod: message.tilingMethod, returnContext: { command: COMMAND, targetPath: absolute } });
        await api.commands.executeCommand('ikemen.palette.openWorkspace', api.Uri.file(absolute), { kind: 'sff-needs-palette', handoff }); ownedSelection?.dispose(); ownedSelection = null; return { type: 'close' };
      }
      if ((message.action === 'stage' || message.action === 'buildNow') && admitted.palette === 'needs-palette') throw new Error('Continue to Palette Workshop or Advanced to resolve Needs Palette before staging or building.');
      const result = await creator.stageCompactIntake(absolute, admitted.paths, { ...message, quickWrite:message.action==='buildNow', admittedBuffers: admitted.admittedBuffers, sourceProvenance: admitted.sourceProvenance, paletteChoice: admitted.palette, paletteMode: admitted.paletteMode, paletteId: admitted.paletteId, preferredWriter: capturedWriter.mode });
      if (message.action === 'buildNow') {
        const built = await creator.buildCompactIntakeNow(result.draft, {api,writerMode:capturedWriter.mode,assertCurrent:()=>{if(disposed)throw Error('The Quick Add owner closed before the write could commit.');options.assertCurrent?.();}});
        ownedSelection?.dispose();ownedSelection=null;
        completedQuick={staged:result,built};const requested=result.draft.configuration.gifAirAfterBuild===true,airPlan=require('./sff_guided_gif_air').planGuidedGifAirHandoff({...result,plan:{...result.plan,ready:built.finalReady}}),gifAirAvailable=requested&&built.verified===true&&airPlan.available;return {type:'written',built,gifAirAvailable,gifAirReason:requested&&!gifAirAvailable?(airPlan.reason||'The current written target proof is unavailable; AIR was not changed.'):''};
      }
      ownedSelection?.dispose(); ownedSelection = null;
      if (message.action === 'openAdvanced') { await api.commands.executeCommand('sff.openCreator', api.Uri.file(absolute), { preferredWriter: capturedWriter.mode, refreshDraft: true }); return { type: 'close' }; }
      return { type: 'result', ok: true, message: `${result.message} Output intent: ${capturedWriter.label}.${result.limitation ? ` ${result.limitation}` : ''} The active SFF is unchanged until the reviewed build is completed.` };
      });
    } catch(error){let unchanged=false;try{unchanged=byteHash(absolute)===targetSeal.hash}catch(_){}if(message.action==='buildNow'&&unchanged&&!disposed&&error.quickWrite?.targetWritten!==true){stageAuthority=createStageAuthority();return{type:'result',ok:false,terminal:false,message:error.message};}throw error;}finally { mapped?.dispose(); operationPending = false; }
  };
  return Object.freeze({ model, handle, seedSources: chooseFiles, dispose() { disposed = true; cutLifetime.abort(); ownedSelection?.dispose();reviewedMaster?.admission.dispose();reviewedMaster=null; ownedSelection = null; }, get consumed() { return stageAuthority.consumed; },get written(){return completedQuick?.built||null} });
}

function html(model) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
${require('./sff_quick_sheet_review').styles()}
:root{color-scheme:light dark}*{box-sizing:border-box}[hidden]{display:none!important}body{margin:0;background:var(--vscode-editor-background);color:var(--vscode-foreground);font:13px var(--vscode-font-family)}button,input,select{font:inherit;min-height:28px}.head{position:sticky;top:0;z-index:2;padding:8px 10px;background:var(--vscode-editor-background);border-bottom:1px solid var(--vscode-panel-border)}main{max-width:720px;margin:auto;padding:10px}.step{border:1px solid var(--vscode-panel-border);margin:8px 0;background:var(--vscode-sideBar-background)}.step>h2{font-size:13px;margin:0;padding:8px;border-bottom:1px solid var(--vscode-panel-border)}.body{padding:9px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.field{display:grid;gap:3px}.row{display:flex;flex-wrap:wrap;gap:7px;align-items:center}.anchor{display:grid;grid-template-columns:repeat(3,34px);gap:3px}.anchor label{display:grid;place-items:center;width:34px;height:34px;border:1px solid var(--vscode-panel-border)}.anchor input{margin:0}.muted{color:var(--vscode-descriptionForeground)}.error{color:var(--vscode-errorForeground)}.ok{color:var(--vscode-testing-iconPassed)}#files{max-height:150px;overflow:auto;padding-left:22px}.primary{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:0;padding:5px 12px}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}@media(max-width:520px){.grid{grid-template-columns:1fr}main{padding:6px}.actions button{flex:1 1 auto}}
</style></head><body>${launchControlsHtml('sff', { includeLayout: false })}<div class="head"><b>Add Sprites</b> <span class="muted">Short guided SFF intake</span></div><main>
<p><b>Target:</b> ${model.targetName} · SFF ${model.targetVersion}<br><span id="writerLabel" hidden>${model.writerLabel}</span></p>
<section class="step"><h2>1 · Images</h2><div class="body"><div class="row"><button id="choose">Choose PNG / GIF / PSD…</button><button id="chooseSheet" title="Slice a PNG, PSD or PCX sheet into sprites">Sprite Sheet…</button><button id="clear">Clear</button><label>Output <select id="intakeWriter" aria-label="Add Sprites output writer"><option value="ikemaker">IKEMaker</option><option value="sprmake2">SprMake2</option><option value="both">Both</option></select></label><button id="intakeWriterRefresh" hidden>Review shared writer</button></div><ul id="files" aria-label="Selected sprite images"><li class="muted">No images chosen.</li></ul><p id="formatNote" class="muted" role="status" aria-live="polite">Standard intake accepts PNG sprites. GIF timing and PSD layers will appear here only after their guided follow-ups are complete.</p></div></section>
<section class="step"><h2>2 · Group and index</h2><div class="body grid"><label class="field">Group<input id="group" type="number" min="0" max="65535" value="0"></label><label class="field">First index<input id="startIndex" type="number" min="0" max="65535" value="0"></label><label><input id="detect" type="checkbox" ${model.detect ? 'checked' : ''}> Detect group/index from filenames when available</label><fieldset><legend>Numbering</legend><label><input type="radio" name="numbering" value="consecutive" checked> 1, 2, 3…</label><br><label><input type="radio" name="numbering" value="stepped"> 10, 20, 30…</label></fieldset><label class="field">If group/index already exists<select id="collisionPolicy"><option value="stop">Stop and show the conflict</option><option value="next-free">Use the next free index</option><option value="skip">Skip that image</option><option value="replace-staged">Replace only an explicitly staged entry</option></select></label></div></section>
<section class="step"><h2>3 · Axis</h2><div class="body grid"><fieldset><legend>Anchor</legend><div class="anchor">${['top-left','top-center','top-right','center-left','center','center-right','bottom-left','bottom-center','bottom-right'].map(value => `<label title="${value}"><input aria-label="${value.replace('-', ' ')} anchor" type="radio" name="anchor" value="${value}" ${value === (model.anchor || 'center') ? 'checked' : ''}></label>`).join('')}</div></fieldset><div><label class="field">X offset<input id="offsetX" type="number" min="-32768" max="32767" value="0"></label><label class="field">Y offset<input id="offsetY" type="number" min="-32768" max="32767" value="0"></label></div></div></section>
${require('./sff_guided_controls').html('guided')}<section class="step"><h2>4 · Palette and storage</h2><div class="body grid"><label class="field">Palette<select id="palette"><option value="image">Use image palette</option>${model.palettes.map(item => `<option value="target:${item.id}">Use matching embedded ${item.id} (exact indexes)</option><option value="master:${item.id}">Map exact source colors to master ${item.id}…</option>`).join('')}${model.targetVersion === '2.1' ? '<option value="true-color">True Color</option>' : ''}<option value="needs-palette">Needs Palette</option></select></label><label class="field">Crop<select id="cropMode"><option value="none">Do not crop</option><option value="before-axis">Crop before axis</option><option value="after-axis">Crop after axis</option></select></label><label><input id="reversed" type="checkbox"> Reversed (Photoshop order)</label><label><input id="share" type="checkbox"> Share exact identical sprite data</label></div><div id="needsPaletteOptions" class="grid" role="group" aria-label="Needs Palette tiling options" hidden><label class="field">Too many colors<select id="tilingMethod"><option value="single-palette">Reduce deliberately to one 256-color palette</option><option value="automatic-tiles">Tile automatically to preserve colors</option><option value="reviewed-tiles">Choose and review tile boundaries</option></select></label><p class="muted">Tiling separates the image into palette-safe sprite pieces. Automatic tiling favors the fewest pieces; reviewed tiling lets you control boundaries and alignment.</p></div><label><input id="optimize" type="checkbox"> Try smaller-only lossless PNG8 compression (IKEMaker / Both)</label><button id="masterReview" hidden>Review master indexes…</button><div id="paletteBranch" class="muted" role="status" aria-live="polite"></div></section>
<section class="step"><h2>5 · Review</h2><div class="body"><p id="review" class="muted" role="status" aria-live="polite">Choose images to review the batch.</p><div class="actions"><button id="buildNow" class="primary" disabled>Write SFF</button><button id="stage" disabled>Stage Add Sprites</button><button id="paletteWorkshop" disabled>Create palette in Palette Workshop…</button><details id="moreSffTools" ${require('./interface_mode').current()==='workspace'?'open':''}><summary>More SFF tools</summary><button id="advanced" disabled>Full SFF Creator…</button></details><button id="reviewAir" hidden>Create/Review AIR from GIF…</button><button id="cancel">Cancel</button></div><p id="status" role="status" aria-live="polite"></p></div></section>
</main><script>const vscode=acquireVsCodeApi(),initial=${json(model)},controlAvailability=(${addSpritesControlAvailability.toString()});${require('./sff_guided_controls').clientScript()}${require('./sff_quick_sheet_review').clientScript()}let masterRequest=0,masterState={enabled:false,needsReview:false},written=false,airAvailable=false,sources=initial.sources||[],writerMode=initial.writerMode,writerStale=false,terminal=false,pending=false;const $=id=>document.getElementById(id),status=$('status'),escape=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));function setControlState(control,state){if(!control)return;control.disabled=Boolean(state.disabled);control.title=state.reason||'';if(state.reason)control.setAttribute('aria-description',state.reason);else control.removeAttribute('aria-description')}function coordinatesValid(){return[group.value,startIndex.value,offsetX.value,offsetY.value].every((value,index)=>{if(String(value).trim()==='')return false;const number=Number(value),limits=index<2?[0,65535]:[-32768,32767];return Number.isSafeInteger(number)&&number>=limits[0]&&number<=limits[1]})}function render(){guidedIntakeRefresh('guided',sources,group.value);files.innerHTML=sources.length?sources.map(s=>'<li>'+escape(s.name)+' · '+s.width+'×'+s.height+' · '+(s.indexed?'indexed PNG8':escape(s.kind))+'</li>').join(''):'<li class="muted">No images chosen.</li>';const nonPng=sources.some(s=>s.kind!=='png'),trueColor=sources.some(s=>s.kind==='png'&&!s.indexed),choice=palette.value,is21=initial.targetVersion==='2.1';needsPaletteOptions.hidden=choice!=='needs-palette';formatNote.textContent=choice.startsWith('master:')?'Exact master mapping selected; missing colors and used-index ambiguity are checked before Write SFF.':choice==='image'&&sources.length&&sources.every(item=>(item.imagePalette?item.imagePalette.available:item.indexed))?'Use image palette preserves exact visible RGBA and alpha; new indexed artwork reserves transparent index 0 (up to 255 visible colors).':nonPng?'This format is not available in Standard intake yet.':trueColor?(is21?'Choose True Color to retain the source pixels, or Needs Palette to prepare indexed artwork.':'This SFF version requires true-color artwork to go through Needs Palette.'):'Indexed PNG8 sources are ready for exact review.';const availability=controlAvailability({sourceCount:sources.length,nonPng,trueColor,exactImageEligible:choice==='image'&&sources.every(item=>(item.imagePalette?item.imagePalette.available:item.indexed))&&!(writerMode!=='ikemaker'&&sources.some(item=>item.imagePalette?.partialAlpha)),paletteChoice:choice,targetVersion:initial.targetVersion,coordinatesValid:coordinatesValid(),guidedProblem:guidedIntakeProblem('guided',sources,group.value),writerMode,writerStale,pending,terminal}),blocker=availability.stage.reason;review.textContent=blocker||sources.length+' image(s) will be staged at group '+group.value+', index '+startIndex.value+' using '+writerLabel.textContent+'.';if(guidedRuntimeGroupWarning(group.value))review.textContent+=' '+guidedRuntimeGroupWarning(group.value);for(const [id,state] of Object.entries({choose:availability.choose,chooseSheet:availability.choose,clear:availability.clear,stage:availability.stage,buildNow:availability.stage,advanced:availability.advanced,paletteWorkshop:availability.paletteWorkshop,cancel:availability.cancel}))setControlState($(id),state);for(const control of document.querySelectorAll('input,select'))setControlState(control,availability.reviewFields);intakeWriterRefresh.hidden=!writerStale;const output=initial.writeAvailability?.[writerMode],batchReason=choice==='image'&&sources.some(item=>item.imagePalette?.available===false)?sources.find(item=>item.imagePalette?.available===false).imagePalette.reason:choice==='true-color'&&output?.trueColor===false?'This writer cannot preserve this True Color batch. Choose IKEMaker or exact indexed image palette.':sources.some(item=>item.imagePalette?.partialAlpha)&&output?.partialAlpha===false?'This writer cannot preserve partial alpha. Choose IKEMaker; alpha was not discarded.':choice.startsWith('master:')&&!masterState.enabled?(masterState.reason||'Checking exact master mapping before Write SFF…'):'',writeReason=batchReason||(output?.enabled===false?output.reason:optimize.checked&&writerMode==='sprmake2'?'PNG8 optimization applies to IKEMaker or Both. Choose that writer or disable the option.':'');if(writeReason){buildNow.disabled=true;buildNow.title=writeReason;review.textContent+=' '+writeReason;}else if(output?.label)review.textContent+=' '+output.label;masterReview.hidden=!choice.startsWith('master:')||!masterState.needsReview;masterReview.disabled=pending||terminal;reviewAir.hidden=!written||!airAvailable;reviewAir.disabled=!written||!airAvailable||pending;paletteBranch.textContent=choice==='needs-palette'?'Next: continue to Palette Workshop with '+tilingMethod.options[tilingMethod.selectedIndex].text+'.':choice==='true-color'?'SFF 2.1 true-color intent will be retained. Writer readiness is reviewed separately; this choice will not be converted to Needs Palette.':''}intakeWriter.value=writerMode;intakeWriter.onchange=()=>{if(beginPending('Updating shared writer; keeping this batch…'))vscode.postMessage({type:'changeWriter',mode:intakeWriter.value})};intakeWriterRefresh.onclick=intakeWriter.onchange;function beginPending(message){if(pending||terminal)return false;pending=true;status.textContent=message;render();return true}choose.onclick=()=>{if(beginPending('Preparing selected images in temporary storage…'))vscode.postMessage({type:'chooseFiles'})};chooseSheet.onclick=()=>{if(beginPending('Preparing sprite sheet…'))vscode.postMessage({type:'chooseSheet'})};clear.onclick=()=>{sources=[];masterRequest++;masterState={enabled:false,needsReview:false};render()};for(const id of ['group','startIndex','offsetX','offsetY','palette','cropMode','share','detect','collisionPolicy','reversed','tilingMethod','optimize','guidedPsdGroups','guidedCosmeticGroup','guidedGifAir','guidedGifAction'])$(id).onchange=render;document.querySelectorAll('input[name=numbering],input[name=anchor]').forEach(x=>x.onchange=render);group.value=initial.group??group.value;startIndex.value=initial.startIndex??startIndex.value;reversed.checked=initial.reversed===true;function stageQuick(type){if(!beginPending('Validating and staging…'))return;vscode.postMessage({...guidedIntakeOptions('guided'),png8Optimization:optimize.checked?'zlib9-smaller-only':'none',type,sourceIds:sources.map(s=>s.id),group:Number(group.value),startIndex:Number(startIndex.value),numberingMode:document.querySelector('input[name=numbering]:checked').value,collisionPolicy:collisionPolicy.value,anchor:document.querySelector('input[name=anchor]:checked').value,offsetX:Number(offsetX.value),offsetY:Number(offsetY.value),cropMode:cropMode.value,palette:palette.value,shareIdentical:share.checked,reversed:reversed.checked,detect:detect.checked})};stage.onclick=()=>stageQuick('stage');buildNow.onclick=()=>stageQuick('buildNow');paletteWorkshop.onclick=()=>{if(beginPending('Opening Palette Workshop…'))vscode.postMessage({type:'openPaletteWorkshop',sourceIds:sources.map(s=>s.id),tilingMethod:tilingMethod.value})};advanced.onclick=()=>{if(!beginPending('Transferring this reviewed batch to Advanced…'))return;vscode.postMessage({...guidedIntakeOptions('guided'),png8Optimization:optimize.checked?'zlib9-smaller-only':'none',type:'openAdvanced',sourceIds:sources.map(s=>s.id),group:Number(group.value),startIndex:Number(startIndex.value),numberingMode:document.querySelector('input[name=numbering]:checked').value,collisionPolicy:collisionPolicy.value,anchor:document.querySelector('input[name=anchor]:checked').value,offsetX:Number(offsetX.value),offsetY:Number(offsetY.value),cropMode:cropMode.value,palette:palette.value,shareIdentical:share.checked,reversed:reversed.checked,detect:detect.checked,tilingMethod:tilingMethod.value})};reviewAir.onclick=()=>{if(pending)return;pending=true;status.textContent='Reviewing optional AIR; SFF already written…';render();vscode.postMessage({type:'reviewAir'})};cancel.onclick=()=>{if(!pending)vscode.postMessage({type:'cancel'})};function preflightMaster(interactive=false){masterRequest++;if(!palette.value.startsWith('master:')||!sources.length){masterState={enabled:false,needsReview:false};render();return}masterState={enabled:false,needsReview:false};if(interactive)pending=true;const requestId=++masterRequest;render();vscode.postMessage({...guidedIntakeOptions('guided'),type:interactive?'reviewMaster':'preflightMaster',requestId,sourceIds:sources.map(s=>s.id),palette:palette.value})}palette.onchange=()=>preflightMaster();masterReview.onclick=()=>preflightMaster(true);addEventListener('message',event=>{const m=event.data||{};if(m.type==='written'){pending=false;terminal=true;written=true;airAvailable=m.gifAirAvailable===true;status.textContent=m.built.message+(m.built.warning?' '+m.built.warning:'')+(m.gifAirReason?' Optional AIR unavailable: '+m.gifAirReason:'');render()}if(m.type==='masterState'&&m.requestId===masterRequest){pending=false;masterState=m;render()}if(m.type==='airResult'){pending=false;status.textContent=m.applied?'SFF and separately reviewed AIR are updated.':'SFF is updated; optional AIR was not changed.';render()}if(m.type==='files'){pending=false;if(Array.isArray(m.sources)){sources=m.sources;masterRequest++;masterState={enabled:false,needsReview:false};}status.textContent=m.cancelled?'Image selection was cancelled. Nothing changed.':'Prepared in temporary storage; source files unchanged.';render();if(Array.isArray(m.sources)&&palette.value.startsWith('master:'))preflightMaster()}if(m.type==='sffWriterPreferenceState'&&m.mode!==writerMode){writerStale=true;intakeWriter.value=m.mode;render()}if(m.type==='writer'){pending=false;writerStale=false;writerMode=m.mode;writerLabel.textContent=m.label;intakeWriter.value=m.mode;status.textContent='Writer updated; selected images and review choices retained.';render()}if(m.type==='result'){pending=false;terminal=m.terminal===true;status.className=m.ok?'ok':'error';status.setAttribute('role',m.ok?'status':'alert');status.textContent=(m.message||'')+(terminal&&!m.ok?' Close this window and reopen Add Sprites to try again.':'');render()}});globalThis.ikemenModeVisibilityChanged=next=>{const more=$('moreSffTools');if(more)more.open=next.mode==='workspace';};globalThis.ikemenIsBusy=()=>pending;globalThis.ikemenCanKeepDraft=()=>false;render();${launchControlsClientScript()}${require('./viewer_close').clientScript()}</script></body></html>`;
}

async function openAddSprites(uri, options = {}) {
  let filename = uri?.fsPath && /\.sff$/i.test(uri.fsPath) ? path.resolve(uri.fsPath) : '';
  if (!filename) {
    const picked = await vscode.window.showOpenDialog({ title: 'Choose the SFF that will receive sprites', canSelectFiles: true, canSelectFolders: false, canSelectMany: false, filters: { SFF: ['sff'] } });
    if (!picked?.[0]) return null; filename = path.resolve(picked[0].fsPath);
  }
  const key = keyOf(filename), existing = sessions.get(key);
  if (existing) { require('./first_attack_sprite_intake').bind(existing,filename,options.firstAttackAdmission);existing.reveal(undefined, false); return existing; }
  const session = createEmbeddedSession(filename, vscode, { ...options, sheetPanel: () => panel });
  const panel = trackViewerPanel(vscode.window.createWebviewPanel('ikemenSffAddSprites', 'Add Sprites · '+session.model.targetName, preferredViewerColumn(vscode.ViewColumn.Active), { enableScripts: true, retainContextWhenHidden: true }));
  sessions.set(key, panel); require('./first_attack_sprite_intake').bind(panel,filename,options.firstAttackAdmission);const writerAttachment = writerPreference.attach(panel);
  panel.onDidDispose(() => { session.dispose(); writerAttachment.dispose(); if (sessions.get(key) === panel) sessions.delete(key); });
  try {
    const sources = Array.isArray(options.sourcePaths) ? await session.seedSources(options.sourcePaths) : [];
    panel.webview.html = require('./webview_policy').protect(html({ ...session.model, sources, group: finiteIntakeValue(options.group) ?? session.model.defaults.group, startIndex: finiteIntakeValue(options.startIndex) ?? session.model.defaults.startIndex, detect: options.detect === true, reversed: options.reversed === true, anchor: options.anchor || session.model.defaults.anchor }), panel.webview.cspSource);
  } catch (error) { panel.dispose(); throw error; }
  require('./viewer_close').support(panel, { readOnly: true });
  panel.webview.onDidReceiveMessage(message => Promise.resolve().then(async () => {
    if (await writerPreference.handle(message, vscode)) return;
    if (await handleLaunchMessage(message, filename, 'sff', panel)) return;
    const action = message.type === 'openPaletteWorkshop' ? 'paletteWorkshop' : message.type;
    if (!['chooseFiles', 'chooseSheet', 'changeWriter', 'reviewAir', 'preflightMaster', 'reviewMaster', 'cancel', 'stage', 'buildNow', 'openAdvanced', 'paletteWorkshop'].includes(action)) return;
    const response = await session.handle({ ...message, action, ...(action === 'paletteWorkshop' ? {palette:'needs-palette'} : {}) });
    if(response.type==='written')await require('./first_attack_sprite_intake').completed(panel,filename,response.built);
    if (response.type === 'files') await panel.webview.postMessage({ type:'files', sources:response.sources, cancelled:response.sources === null });
    else if (response.type === 'close') {const written=session.written;panel.dispose();if(written)await vscode.commands.executeCommand('sff.openViewer',vscode.Uri.file(filename),undefined,undefined,{refresh:true});}
    else await panel.webview.postMessage({ ...response, terminal:response.terminal ?? session.consumed });
  }).catch(error => panel.webview.postMessage(['preflightMaster','reviewMaster'].includes(message.type)?{type:'masterState',requestId:message.requestId,enabled:false,needsReview:true,reason:error.message}:message.type==='reviewAir'?{type:'airResult',applied:false,message:error.message}:{ type:'result', ok:false, terminal:session.consumed, message:error.message })));
  return panel;
}

function register(context) { context.subscriptions.push(vscode.commands.registerCommand('sff.openAddSprites', openAddSprites)); }
module.exports = { COMMAND, html, openAddSprites, register, boundedPngSource, createStageAuthority, consumeStageAuthority, selectedSpriteDefaults, createEmbeddedSession, addSpritesControlAvailability, targetGroupOccupancy, chooseGuidedBatch };
