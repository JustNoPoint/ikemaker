'use strict';

const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { prepareGuidedSource, stableSource, assertOriginal } = require('./sff_guided_intake');
const { gridProposal } = require('./sff_sheet_intake');
const { readIndexedPng, encodeIndexedPng, chunks, LIMITS: PNG_LIMITS, sha } = require('./palette_indexed_png');
const { decodePng } = require('./palette_index_organizer_model');
const { rgbaPng, pcx8 } = require('./sff_reader');
const { approvedPolygon, cropPolygon } = require('./sff_quick_sheet_polygon');
const { pageDestinations, assertDistinctCutDestinations } = require('./sff_sheet_destinations');
const LIMITS = Object.freeze({ maximumBytes: 64 * 1024 * 1024, maximumDimension: 8192, maximumPixels: 64_000_000, maximumFrames: 4096, aggregatePixels: 64_000_000, outputBytes: 256 * 1024 * 1024 });

function bounds(width, height, sideLimit = LIMITS.maximumDimension) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width > sideLimit || height > sideLimit || width * height > LIMITS.maximumPixels) throw new Error(`The sheet exceeds ${sideLimit} pixels per side or 64 million decoded pixels.`);
}
function decodeSheet(bytes, sideLimit = LIMITS.maximumDimension) {
  const pngLimits = { ...PNG_LIMITS, maximumDimension: sideLimit, maximumBytes: LIMITS.maximumBytes, maximumPixels: LIMITS.maximumPixels, maximumInflated: 4 * LIMITS.maximumPixels + sideLimit };
  const list = chunks(bytes, pngLimits), headers = list.filter(item => item.type === 'IHDR');
  if (headers.length !== 1 || list[0] !== headers[0] || headers[0].data.length !== 13) throw new Error('The sheet PNG requires one leading IHDR.');
  const header = headers[0].data; bounds(header.readUInt32BE(0), header.readUInt32BE(4), sideLimit);
  if (header[10] || header[11] || header[12]) throw new Error('Quick sheets require noninterlaced PNG with standard compression/filtering.');
  if (header[9] === 3) return readIndexedPng(bytes, pngLimits);
  const decoded = decodePng(bytes, { maximumFileBytes: LIMITS.maximumBytes, maximumDimension: sideLimit, maximumPixels: LIMITS.maximumPixels });
  const transparency = list.filter(item => item.type === 'tRNS');
  if (transparency.length > 1) throw new Error('The sheet contains duplicate PNG transparency chunks.');
  if (transparency.length) {
    const data = transparency[0].data, count = decoded.colorType === 0 ? 1 : decoded.colorType === 2 ? 3 : 0;
    if (!count || data.length !== count * 2) throw new Error('The sheet PNG transparency key is invalid.');
    const key = Array.from({ length: count }, (_, index) => data.readUInt16BE(index * 2));
    if (key.some(value => value > 255)) throw new Error('The 8-bit sheet PNG has an invalid transparency sample.');
    for (let at = 0; at < decoded.rgba.length; at += 4) if (count === 1 ? decoded.rgba[at] === key[0] : decoded.rgba[at] === key[0] && decoded.rgba[at + 1] === key[1] && decoded.rgba[at + 2] === key[2]) decoded.rgba[at + 3] = 0;
  }
  return decoded;
}

function pcxImage(bytes) {
  if (bytes.length < 128 || bytes[0] !== 10 || ![0,1].includes(bytes[2]) || bytes[3] !== 8 || ![1,3].includes(bytes[65])) throw new Error('Quick PCX sheets require 8-bit indexed or 24-bit RGB planar PCX.');
  const width = bytes.readUInt16LE(8) - bytes.readUInt16LE(4) + 1, height = bytes.readUInt16LE(10) - bytes.readUInt16LE(6) + 1, planes = bytes[65], stride = bytes.readUInt16LE(66);
  bounds(width, height);
  if (stride < width || stride > 16384 || stride * planes * height > LIMITS.maximumBytes) throw new Error('The PCX decoded row layout exceeds the bounded sheet limit.');
  const end = planes === 1 ? bytes.length - 769 : bytes.length;
  if (end < 128 || planes === 1 && bytes[end] !== 12) throw new Error('The indexed PCX has no exact trailing 256-color palette.');
  const pixels = bytes.subarray(128, end), expected = stride * planes * height;
  let at = 0, count = 0;
  if (bytes[2] === 1) {
    while (at < pixels.length && count < expected) { const value = pixels[at++], run = (value & 192) === 192 ? value & 63 : 1; if (!run || (value & 192) === 192 && at++ >= pixels.length || count + run > expected) throw new Error('The PCX pixel run is truncated or exceeds its decoded canvas.'); count += run; }
    if (count !== expected || at !== pixels.length) throw new Error('The PCX pixel stream does not exactly match its decoded canvas.');
  } else if (pixels.length !== expected) throw new Error('The uncompressed PCX pixel stream does not match its decoded canvas.');
  const decoded = pcx8(pixels, stride * planes, height, stride * planes, bytes[2] === 1);
  if (planes === 1) {
    const indices = Buffer.alloc(width * height), palette = bytes.subarray(end + 1), colors = Array.from({ length: 256 }, (_, index) => [palette[index * 3], palette[index * 3 + 1], palette[index * 3 + 2], 255]);
    for (let row = 0; row < height; row++) decoded.copy(indices, row * width, row * stride, row * stride + width);
    return encodeIndexedPng({ width, height }, indices, colors);
  }
  const rgba = Buffer.alloc(width * height * 4);
  for (let row = 0; row < height; row++) for (let x = 0; x < width; x++) { const to = (row * width + x) * 4, from = row * stride * 3 + x; rgba[to] = decoded[from]; rgba[to + 1] = decoded[from + stride]; rgba[to + 2] = decoded[from + stride * 2]; rgba[to + 3] = 255; }
  return rgbaPng(width, height, rgba);
}
async function pcxBatch(filename, api) {
  const seal = stableSource(filename), directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-sheet-pcx-')); delete seal.bytes;
  try {
    const admitted = stableSource(filename); if (admitted.hash !== seal.hash || admitted.physical !== seal.physical || admitted.realpath !== seal.realpath) throw new Error('The selected PCX changed during admission.');
    let png = pcxImage(admitted.bytes), transparency = 'opaque-source-no-alpha', zeroUsed = null;
    if (admitted.bytes[65] === 1) {
      const image = readIndexedPng(png); zeroUsed = image.indices.includes(0);
      const selected = await api.window.showQuickPick([
        { label: 'Use palette index 0 as transparent', description: 'SFF convention; keep all RGB colors and pixel indices.', transparency: 'palette-index-0-transparent' },
        { label: 'Keep every index opaque', description: zeroUsed ? 'Index 0 is used. Choose True Color later to keep it opaque.' : 'Choose True Color later if an opaque index 0 must be retained.', transparency: 'all-indices-opaque' }
      ], { title: 'Indexed PCX background', placeHolder: 'Choose transparency explicitly; the original PCX is unchanged.' });
      if (!selected) { fs.rmSync(directory, { recursive: true, force: true }); return null; }
      if (!['palette-index-0-transparent','all-indices-opaque'].includes(selected.transparency)) throw new Error('Choose one indexed PCX background policy.');
      transparency = selected.transparency;
      if (transparency === 'palette-index-0-transparent') { image.colors[0][3] = 0; png = encodeIndexedPng(image, image.indices, image.colors); }
    }
    assertOriginal(seal);
    const converted = path.join(directory, 'pcx-sheet.png'); fs.writeFileSync(converted, png, { flag: 'wx' });
    const provenance = { kind: 'guided-image-intake', sourceFile: seal.filename, sourceByteHash: seal.hash, originalPhysical: seal.physical, originalRealpath: seal.realpath, sourceOrdinal: 0, role: 'image', sourceFrameCount: 1, pcxTransparency: transparency, pcxZeroUsed: zeroUsed };
    return { rows: [{ filename: converted, label: path.basename(filename), role: 'image', provenance }], directory, assertOriginal: () => assertOriginal(seal), dispose: () => fs.rmSync(directory, { recursive: true, force: true }) };
  } catch (error) { fs.rmSync(directory, { recursive: true, force: true }); throw error; }
}

function parseGrid(value, image) {
  const groups = String(value || '').split(';');
  if (!groups.length || groups.length > 4) throw new Error('Use width,height; optional offsetX,offsetY; gapX,gapY; columns,rows.');
  const pairs = groups.map(group => { const parts = group.split(',').map(part => part.trim()); if (parts.length !== 2 || parts.some(part => !/^\d+$/.test(part) || !Number.isSafeInteger(Number(part)))) throw new Error('Enter whole pixel pairs separated by commas; use semicolons between pairs.'); return parts.map(Number); });
  const settings = { cellWidth: pairs[0][0], cellHeight: pairs[0][1], offsetX: pairs[1]?.[0] || 0, offsetY: pairs[1]?.[1] || 0, gapX: pairs[2]?.[0] || 0, gapY: pairs[2]?.[1] || 0, ...(pairs[3] ? { columns: pairs[3][0], rows: pairs[3][1] } : {}) };
  const proposal = gridProposal(image, settings); if (proposal.frames.length > LIMITS.maximumFrames) throw new Error('Quick sheets support at most 4096 cells.'); return proposal;
}
function crop(image, cell) {
  const stride = image.indices ? 1 : 4, plane = image.indices || image.rgba, pixels = Buffer.alloc(cell.width * cell.height * stride);
  for (let row = 0; row < cell.height; row++) plane.copy(pixels, row * cell.width * stride, ((cell.y + row) * image.width + cell.x) * stride, ((cell.y + row) * image.width + cell.x + cell.width) * stride);
  return image.indices ? encodeIndexedPng(cell, pixels, image.colors) : rgbaPng(cell.width, cell.height, pixels);
}

// Limit the decoded original by area; keep the editable preview and component mask bounded separately.
async function chooseSheetRegion(api, width, height) {
  const maxSide = LIMITS.maximumDimension;
  const maxPixels = require('./sff_quick_sheet_detection').LIMITS.maximumPixels;
  const w = Math.min(width, maxSide), h = Math.min(height, maxSide, Math.floor(maxPixels / w));
  const choices = [];
  for (let y = 0; y < height; y += h) for (let x = 0; x < width; x += w) {
    const region = { x, y, width: Math.min(width - x, w), height: Math.min(height - y, h) };
    choices.push({ label: 'Region ' + (choices.length + 1), description: `(${x}, ${y}) · ${region.width} × ${region.height}`, region });
  }
  choices.push({ label: 'Choose exact bounds…', description: 'Set the edges around a whole pose or sequence.' });
  const pick = await api.window.showQuickPick(choices, { title: `Sprite sheet · ${width} × ${height}`, placeHolder: 'Choose a region at original resolution. Use exact bounds for poses crossing a region edge.' });
  if (!pick || pick.region) return pick?.region;
  const parse = value => {
    if (!/^\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*\d+\s*$/.test(value)) return;
    const [x,y,w,h] = value.split(',').map(Number);
    if(w>0 && h>0 && w<=maxSide && h<=maxSide && w*h<=maxPixels && x+w<=width && y+h<=height) return {x,y,width:w,height:h};
  };
  const value = await api.window.showInputBox({ title:'Sheet region in original pixels', prompt:'Left, top, width, height', value:`0,0,${w},${h}`, validateInput:v=>parse(v)?undefined:'Choose a region inside the sheet, up to 8192 per side and 16 million pixels.' });
  if(value===undefined)return;
  const region=parse(value);if(!region)throw Error('Invalid sheet region.');return region;
}

async function prepareQuickSheet(filename, api, { psdMode, ffmpeg, imageMagick, reviewCuts, advanced = false, targetFile, resumeDraft } = {}) {
  const extension = path.extname(filename).toLowerCase();
  if (!['.png','.psd','.pcx'].includes(extension)) throw new Error('Choose a PNG, PSD, or PCX sprite sheet.');
  if (psdMode !== undefined && !['composite','layers','raw-layers'].includes(psdMode)) throw new Error('Choose PSD composite or separate layers.');
  // Explicit layer mode still lets the user choose the exact pages, rather than
  // silently exporting every authored body/cosmetic layer.
  const guidedApi = psdMode === 'layers' ? { window: { showQuickPick: (items, options) => items.some(item => item.mode === 'layers') ? Promise.resolve({ mode: 'layers' }) : api.window.showQuickPick(items, options) } } : api;
  const selectionApi = resumeDraft ? {window:{showQuickPick:(choices,opts)=>{
    if(extension==='.pcx')return choices.find(c=>c.transparency===resumeDraft.pcxTransparency);
    if(choices.some(c=>c.mode==='composite'))return choices.find(c=>c.mode===(resumeDraft.pages[0]?.role==='composite'?'composite':'layers'));
    if(opts?.canPickMany)return choices.filter(c=>resumeDraft.pages.some(p=>p.index===c.layer.index));
    return guidedApi.window.showQuickPick(choices,opts);
  }}} : guidedApi;
  const batch = extension === '.pcx' ? await pcxBatch(filename, selectionApi) : await prepareGuidedSource(filename, selectionApi, { psdMode: psdMode === 'layers' ? undefined : psdMode, ffmpeg, imageMagick });
  if (!batch) return null;
  let retained = false;
  try {
    if (!batch.rows?.length) throw new Error('The source exposed no sheet artwork.');
    if(resumeDraft&&(!advanced||resumeDraft.canvas.sourceHash!==batch.rows[0].provenance.sourceByteHash))throw Error('The staged sheet source has changed. Start a new sheet review.');
    const pageSeals=batch.rows.map(page=>{const seal=stableSource(page.filename);delete seal.bytes;return seal;});
    const header=Buffer.alloc(24), fd=fs.openSync(batch.rows[0].filename,'r');
    try {fs.readSync(fd,header,0,header.length,0);} finally {fs.closeSync(fd);}
    const sourceWidth=header.readUInt32BE(16),sourceHeight=header.readUInt32BE(20);
    const oversized=extension==='.png' && Math.max(sourceWidth,sourceHeight)>LIMITS.maximumDimension;
    const sideLimit=oversized?65535:LIMITS.maximumDimension;
    bounds(sourceWidth,sourceHeight,sideLimit);
    const regionRequired=oversized || advanced && sourceWidth*sourceHeight>require('./sff_quick_sheet_detection').LIMITS.maximumPixels;
    const region=resumeDraft ? resumeDraft.canvas.region : regionRequired ? await chooseSheetRegion(api,sourceWidth,sourceHeight) : null;
    if(regionRequired&&!region)return null;
    if(region && (!require('./sff_quick_sheet_review').validRect(region,sourceWidth,sourceHeight)||region.width*region.height>16000000))throw Error('Saved sheet region is outside the source image.');
    const readPage=index=>{
      const fresh=stableSource(batch.rows[index].filename),seal=pageSeals[index];
      if(fresh.hash!==seal.hash||fresh.physical!==seal.physical||fresh.realpath!==seal.realpath)throw new Error('Prepared sheet artwork changed while its cuts were being reviewed. Choose the source again.');
      const image=decodeSheet(fresh.bytes,sideLimit);
      return region?decodeSheet(crop(image,region)):image;
    };
    const first=readPage(0),canvas={width:first.width,height:first.height,sourceHash:batch.rows[0].provenance.sourceByteHash,...(region?{region,sourceWidth,sourceHeight}:{})};
    if(resumeDraft && (!advanced || resumeDraft.canvas.sourceHash!==canvas.sourceHash))throw Error('The staged sheet source has changed. Start a new sheet review.');
    const mode = resumeDraft ? {mode:'detect'} : await api.window.showQuickPick([
      { label:'Detect sprite bounds',description:'Find separate artwork using an explicit background rule; review every cut.',mode:'detect' },
      { label:'Exact grid',description:'Use fixed cell dimensions, offsets, gaps and row/column order.',mode:'grid' }
    ], {title:'Prepare sprite sheet',placeHolder:'Detect variable sprite sizes, or cut an exact authored grid.'});
    if(!mode)return null;if(!['detect','grid'].includes(mode.mode))throw new Error('Choose detected bounds or exact grid.');
    let layout;
    if(mode.mode==='grid'){
    const geometry = await api.window.showInputBox({ title: `Sheet ${canvas.width}×${canvas.height}: grid geometry`, prompt: 'Cell width,height; optional offsetX,offsetY; gapX,gapY; columns,rows. Example: 64,64; 0,0; 2,2', value: `${Math.min(64,canvas.width)},${Math.min(64,canvas.height)}`, validateInput: value => { try { parseGrid(value, canvas); } catch (error) { return error.message; } } });
    if (geometry === undefined || geometry === null) return null;
    const proposed = parseGrid(geometry, canvas);
    const selected = await api.window.showQuickPick([{ label:'Across rows', description:'Left to right, then top to bottom', order:'row-major' },{ label:'Down columns', description:'Top to bottom, then left to right', order:'column-major' },{ label:'Alternating rows', description:'Reverse direction on every second row', order:'snake' }], { title:`Cell order · ${proposed.settings.rows} × ${proposed.settings.columns} (rows × columns), ${proposed.frames.length} cells`, placeHolder:proposed.warnings.length ? proposed.warnings.join(' ') : 'The same cells and order apply to every selected PSD layer.' });
    if (!selected) return null;
    if (!['row-major','column-major','snake'].includes(selected.order)) throw new Error('Choose one supported sheet cell order.');
    const gridCanvas = region ? { ...canvas, sourceHash: canvas.sourceHash + '@' + region.x + ',' + region.y } : canvas;
    layout = gridProposal(gridCanvas, { ...proposed.settings, order: selected.order });

    }
    if(mode.mode==='detect' || advanced){
      const choices=[{label:'Use alpha transparency',description:'Every nontransparent pixel is artwork. Opaque sheets form one connected area.',background:'alpha'},{label:'Use top-left exact color',description:'Ignore the exact top-left RGBA color on each selected page.',background:'top-left-color'}];
      const allIndexed=batch.rows.every(page=>{const descriptor=fs.openSync(page.filename,'r');try{const header=Buffer.alloc(26);return fs.readSync(descriptor,header,0,26,0)===26&&header[25]===3;}finally{fs.closeSync(descriptor)}});
      if(allIndexed)choices.push({label:'Use a palette index',description:'Ignore one explicit index in every selected indexed page.',background:'palette-index'});
      const savedRule=resumeDraft?.background;
      const selected=savedRule?{background:savedRule.mode}:layout?{background:'alpha'}:await api.window.showQuickPick(choices,{title:'Detection background rule',placeHolder:'This finds cut bounds only; output pixels retain their original palette and alpha.'});if(!selected)return null;
      const background={mode:selected.background};
      if(background.mode==='palette-index'){const value=savedRule?String(savedRule.index):await api.window.showInputBox({title:'Background palette index',value:'0',prompt:'Enter the exact background slot (0–255). Indices and RGB colors are preserved.',validateInput:value=>/^\d+$/.test(value)&&Number(value)<=255?undefined:'Enter one whole palette index from 0 to 255.'});if(value===undefined||value===null)return null;if(!/^\d+$/.test(value)||Number(value)>255)throw new Error('Enter one whole background palette index from 0 to 255.');background.index=Number(value);}
      const union=require('./sff_quick_sheet_detection').createUnion(canvas.width,canvas.height,background);
      for(let pageOrdinal=0;pageOrdinal<batch.rows.length;pageOrdinal++)union.add(pageOrdinal===0?first:readPage(pageOrdinal),pageOrdinal);
      const detected=union.result();batch.assertOriginal();
      const review=reviewCuts||require('./sff_quick_sheet_review').reviewQuickSheetCuts;
      const model={...detected,rectangles:layout?.frames||detected.rectangles,sourceLabel:path.basename(filename),layerCount:batch.rows.length,warnings:[...(layout?.warnings||detected.warnings),'Output pixels keep their original palette and alpha.']};
      const context={filename:path.resolve(filename),targetFile,canvas,background,pages:batch.rows.map(r=>({role:r.role,index:r.layerMetadata?.index??r.pages?.[0]??r.provenance.sourceOrdinal})),pcxTransparency:batch.rows[0].provenance.pcxTransparency};
      const reviewed=advanced?await require('./sff_sheet_drafts').reviewWithDraft(api,review,model,context,resumeDraft,()=>batch.assertOriginal()):await review(api,model);
      if(!reviewed)return null;const rectangles=Array.isArray(reviewed)?reviewed:reviewed.rectangles;
      if(!Array.isArray(rectangles))throw new Error('Sheet cut review did not return approved rectangles.');if(!rectangles.length)return null;
      if(rectangles.length>LIMITS.maximumFrames)throw new Error('Reviewed cuts exceed the 4096-frame limit.');
      const frames=rectangles.map((rectangle,ordinal)=>{const{x,y,width,height}=rectangle||{};if(![x,y,width,height].every(Number.isSafeInteger)||x<0||y<0||width<1||height<1||x+width>canvas.width||y+height>canvas.height)throw new Error('An approved sheet cut lies outside its exact source canvas.');const polygon=approvedPolygon(rectangle,canvas);const identity=rectangle.identity;if(identity!==undefined&&(!identity||![identity.group,identity.index].every(Number.isSafeInteger)||identity.group<0||identity.index<0))throw new Error('An approved sheet cut has an invalid sprite identity.');const id=rectangle.id;if(id!==undefined&&(typeof id!=='string'||!id||id.length>128))throw new Error('An approved sheet cut has an invalid id.');return{x,y,width,height,...(polygon?{polygon}:{}),...(identity?{identity:{group:identity.group,index:identity.index}}:{}),...(id?{id}:{}),ordinal,frameId:'cut-'+sha(Buffer.from(JSON.stringify([canvas.sourceHash,ordinal,x+(region?.x||0),y+(region?.y||0),width,height,polygon,identity,id]))).slice(0,20)}});
      const ids=new Set();for(const frame of frames){if(frame.id){if(ids.has(frame.id))throw new Error('Approved sheet cuts contain duplicate ids.');ids.add(frame.id);}if(frame.identity)pageDestinations(frame.identity,batch.rows.length);}
      assertDistinctCutDestinations(frames.map(frame=>({...frame,id:frame.id||frame.frameId})),batch.rows.length);
      layout={mode:'detected',settings:null,frames,background:detected.background,warnings:detected.warnings,reviewed:true,...(reviewed.draftKey?{draftKey:reviewed.draftKey}:{})};batch.assertOriginal();
    }
    const grid=layout;
    const outputPixels=grid.frames.reduce((sum,frame)=>sum+frame.width*frame.height,0)*batch.rows.length;
    if(grid.frames.length*batch.rows.length>LIMITS.maximumFrames||outputPixels>LIMITS.aggregatePixels)throw new Error('The selected layers/cuts exceed 4096 sprites or 64 million total output pixels.');
    const directory = path.join(batch.directory, 'quick-sheet-cells'); fs.mkdirSync(directory, { recursive: false });
    const rows = [], outputSeals = []; let outputBytes = 0;
    for (let pageOrdinal = 0; pageOrdinal < batch.rows.length; pageOrdinal++) {
      const page = batch.rows[pageOrdinal];assertOriginal(pageSeals[pageOrdinal]);const image = pageOrdinal === 0 ? first : readPage(pageOrdinal);
      if (image.width !== canvas.width || image.height !== canvas.height) throw new Error('Selected PSD pages do not share one exact authored canvas.');
      for (const cell of grid.frames) {
        const bytes = cropPolygon(image, cell) || crop(image, cell); outputBytes += bytes.length; if (outputBytes > LIMITS.outputBytes) throw new Error('Prepared sheet cells exceed the 256 MiB output limit.');
        const output = path.join(directory, `cell_${String(cell.ordinal).padStart(5,'0')}_page_${String(pageOrdinal).padStart(5,'0')}.png`); fs.writeFileSync(output, bytes, { flag:'wx' });
        const outputSeal = stableSource(output); delete outputSeal.bytes;
        outputSeals.push(outputSeal);
        const sheet = { canvas, mode:grid.mode==='detected'?'detected':'grid', grid: grid.settings, background:grid.background||null, reviewed:grid.reviewed===true, rectangle: { x:cell.x,y:cell.y,width:cell.width,height:cell.height }, ...(cell.polygon?{polygon:cell.polygon,sourcePolygon:cell.polygon.map(point=>({x:point.x+(region?.x||0),y:point.y+(region?.y||0)}))}:{}),...(cell.identity?{identity:pageDestinations(cell.identity,batch.rows.length)[pageOrdinal]}:{}),...(cell.id?{id:cell.id}:{}),...(grid.draftKey?{draftKey:grid.draftKey}:{}), ...(region?{sourceRectangle:{x:cell.x+region.x,y:cell.y+region.y,width:cell.width,height:cell.height}}:{}),frameOrdinal:cell.ordinal,pageOrdinal,cellId:cell.frameId,indexed:Boolean(image.indices),outputByteHash:sha(bytes) };
        rows.push({ ...page, filename:output,label:`${page.label} · cell ${cell.ordinal+1}`,ordinal:0,sequenceOrdinal:cell.ordinal,role:'sheet-cell',expectedWidth:cell.width,expectedHeight:cell.height,sourceFrameCount:grid.frames.length, provenance:{ ...page.provenance,role:'sheet-cell',sourceOrdinal:0,sourceFrameCount:grid.frames.length,layerRole:page.layerRole||null,sheet }, assertOriginal:()=>{batch.assertOriginal();assertOriginal(outputSeal);} });
      }
    }
    rows.sort((a,b)=>a.sequenceOrdinal-b.sequenceOrdinal||a.provenance.sheet.pageOrdinal-b.provenance.sheet.pageOrdinal); rows.forEach((row,ordinal)=>{row.ordinal=ordinal;row.provenance.sourceOrdinal=ordinal;});
    batch.assertOriginal(); retained = true;
    return { rows,directory:batch.directory,grid,warnings:grid.warnings,assertSourceOriginal:batch.assertOriginal,assertOriginal:()=>{batch.assertOriginal();for(const seal of outputSeals)assertOriginal(seal);},dispose:()=>batch.dispose() };
  } finally { if (!retained) batch.dispose(); }
}

module.exports = { prepareQuickSheet, LIMITS };
