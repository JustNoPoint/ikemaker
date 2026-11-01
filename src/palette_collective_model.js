'use strict';

const crypto = require('crypto');
const path = require('path');
const zlib = require('zlib');
const { decodePng } = require('./palette_index_organizer_model');

// Full character source sets commonly contain hundreds of small sprites. Keep
// the real byte and decoded-pixel memory guards, but do not reject an otherwise
// safe set merely because it has more than 256 files.
const LIMITS = Object.freeze({ maximumImages: 4096, maximumFileBytes: 32 * 1024 * 1024, maximumTotalBytes: 256 * 1024 * 1024, maximumPixels: 256_000_000, maximumDimension: 8192, contactPageSize: 48, thumbnailDimension: 192, maximumRegionReviewColors: 4096, maximumRegionMasks: 256 });
const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const canonical = filename => path.resolve(filename);
const pathKey = filename => process.platform === 'win32' ? canonical(filename).toLowerCase() : canonical(filename);
const rgbaId = rgba => `${rgba[0]},${rgba[1]},${rgba[2]},${rgba[3]}`;
function stable(value) { if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`; if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`; return JSON.stringify(value); }

function normalizeFiles(files, limits = LIMITS) {
  if (!Array.isArray(files) || !files.length) throw new Error('Choose at least one PNG image.');
  if (files.length > limits.maximumImages) throw new Error(`Palette collective exceeds the ${limits.maximumImages}-image limit.`);
  const seen = new Set(); let bytes = 0, pixels = 0;
  return files.map((file, order) => {
    const filename = canonical(file.filename || file.path || ''), key = pathKey(filename), buffer = file.buffer;
    if (!/\.png$/i.test(filename) || !Buffer.isBuffer(buffer)) throw new Error('Palette collective accepts durable PNG files only.');
    if (seen.has(key)) throw new Error(`Duplicate collective image: ${filename}`); seen.add(key);
    if (buffer.length > limits.maximumFileBytes) throw new Error(`${path.basename(filename)} exceeds the ${limits.maximumFileBytes}-byte limit.`);
    bytes += buffer.length; if (bytes > limits.maximumTotalBytes) throw new Error(`Palette collective exceeds the ${limits.maximumTotalBytes}-byte encoded limit.`);
    const decoded = decodePng(buffer, { maximumFileBytes: limits.maximumFileBytes, maximumPixels: limits.maximumPixels, maximumDimension: limits.maximumDimension });
    pixels += decoded.width * decoded.height; if (pixels > limits.maximumPixels) throw new Error(`Palette collective exceeds the ${limits.maximumPixels.toLocaleString()}-pixel decoded limit.`);
    const byteHash = sha(buffer), imageId = sha(Buffer.from(`${key}\0${byteHash}`));
    return { imageId, filename, name: path.basename(filename), byteHash, byteLength: buffer.length, modifiedTimeMs:Number(file.modifiedTimeMs)||0, width: decoded.width, height: decoded.height, order, buffer, decoded };
  });
}
function buildCollective(files, limits = LIMITS) {
  const images = normalizeFiles(files, limits), colors = new Map();
  for (const image of images) { const local = new Map(); for (let at = 0; at < image.decoded.rgba.length; at += 4) { const id = rgbaId(image.decoded.rgba.subarray(at, at + 4)); local.set(id, (local.get(id) || 0) + 1); } image.colorCounts = [...local].map(([colorId, count]) => ({ colorId, count })); for (const [colorId, count] of local) { if (!colors.has(colorId)) colors.set(colorId, { colorId, rgba: colorId.split(',').map(Number), count: 0, images: [] }); const item = colors.get(colorId); item.count += count; item.images.push({ imageId: image.imageId, count }); } }
  const entries = [...colors.values()], evidence = images.map(({ imageId, filename, byteHash, byteLength, modifiedTimeMs, width, height, order }) => ({ imageId, filename, byteHash, byteLength, modifiedTimeMs, width, height, order }));
  const inventoryEvidence=evidence.map(({imageId,filename,byteHash,byteLength,width,height,order})=>({imageId,filename,byteHash,byteLength,width,height,order})),inventoryHash = sha(Buffer.from(stable({ evidence:inventoryEvidence, entries: entries.map(({ colorId, count, images }) => ({ colorId, count, images })) })));
  return { schema: 'ikemaker.palette-collective', version: 1, evidence, entries, inventoryHash, imageCount: images.length, totalPixels: images.reduce((n, x) => n + x.width * x.height, 0), images };
}
function missedColorAudit(baselineColorIds = [], collective) { const baseline = new Set(baselineColorIds), current = new Set(collective.entries.map(item => item.colorId)), added = [...current].filter(id => !baseline.has(id)), missing = [...baseline].filter(id => !current.has(id)); return { baselineHash: sha(Buffer.from([...baseline].sort().join('\n'))), inventoryHash: collective.inventoryHash, added, missing, clean: added.length === 0 }; }
function reviewGate(collective, state = {}) { const dispositions = state.dispositions || {}, invalid = Object.entries(dispositions).filter(([, value]) => !['include','ignore','replace-proposed'].includes(value)).map(([id]) => id), audit = state.audit || { added: [] }, continuationBlocked=Boolean(state.regionContinuationWarning), ready = Boolean(state.contactReviewed) && state.reviewedInventoryHash === collective.inventoryHash && !audit.added?.length && !invalid.length&&!continuationBlocked; return { ready, unreviewedImages: [], invalidDispositions: invalid, continuationBlocked, reason: ready ? '' : continuationBlocked?'Resolve the new colors found inside a retained cleanup region before organizing.':'Acknowledge the exact imported batch and any newly discovered colors before organizing.' }; }
function thumbnail(decoded, maximum = LIMITS.thumbnailDimension) { const scale = Math.min(1, maximum / decoded.width, maximum / decoded.height), width = Math.max(1, Math.round(decoded.width * scale)), height = Math.max(1, Math.round(decoded.height * scale)), rgba = Buffer.alloc(width * height * 4); for (let y=0;y<height;y++)for(let x=0;x<width;x++){const sx=Math.min(decoded.width-1,Math.floor(x/scale)),sy=Math.min(decoded.height-1,Math.floor(y/scale)),from=(sy*decoded.width+sx)*4,to=(y*width+x)*4;decoded.rgba.copy(rgba,to,from,from+4);} return { width, height, rgba }; }
function highlightRgba(decoded, selectedColorId, maximum = LIMITS.thumbnailDimension, focusMode = 'none') { const out = thumbnail(decoded, maximum), selected = String(selectedColorId || ''), mode=['darken','lighten','none'].includes(focusMode)?focusMode:'none'; let matches = 0; for (let at=0;at<out.rgba.length;at+=4) { const id=rgbaId(out.rgba.subarray(at,at+4)); if (selected && id===selected) { matches++; continue; } if(selected&&mode==='darken'){out.rgba[at]=Math.round(out.rgba[at]*0.22);out.rgba[at+1]=Math.round(out.rgba[at+1]*0.22);out.rgba[at+2]=Math.round(out.rgba[at+2]*0.22);out.rgba[at+3]=Math.max(40,Math.round(out.rgba[at+3]*0.35));}else if(selected&&mode==='lighten'){out.rgba[at]=Math.round(out.rgba[at]+(255-out.rgba[at])*.72);out.rgba[at+1]=Math.round(out.rgba[at+1]+(255-out.rgba[at+1])*.72);out.rgba[at+2]=Math.round(out.rgba[at+2]+(255-out.rgba[at+2])*.72);out.rgba[at+3]=Math.max(80,Math.round(out.rgba[at+3]*.55));} } return { ...out, matches }; }
function previewRgba(decoded,{ignoredColorIds=[],regions=[],selectedColorId='',maximum=LIMITS.thumbnailDimension,focusMode='none'}={}){
  if(!decoded||!Number.isInteger(decoded.width)||!Number.isInteger(decoded.height)||!Buffer.isBuffer(decoded.rgba))throw new Error('Preview rendering requires exact RGBA pixels.');
  const scale=Math.min(1,maximum/decoded.width,maximum/decoded.height),width=Math.max(1,Math.round(decoded.width*scale)),height=Math.max(1,Math.round(decoded.height*scale)),rgba=Buffer.alloc(width*height*4),ignored=new Set((ignoredColorIds||[]).map(String)),masks=(regions||[]).map(raw=>{const spec=raw?.rect?raw:{rect:raw},rect=normalizedRegions(decoded,[spec.rect])[0];if(!rect)return null;const fill=String(spec.fillColorId||'').split(',').map(Number),valid=fill.length===4&&fill.every(value=>Number.isInteger(value)&&value>=0&&value<=255);return{...rect,fill:valid?fill:[0,0,0,0]}}).filter(Boolean),selected=String(selectedColorId||''),mode=['darken','lighten','none'].includes(focusMode)?focusMode:'none';let matches=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const sx=Math.min(decoded.width-1,Math.floor(x/scale)),sy=Math.min(decoded.height-1,Math.floor(y/scale)),from=(sy*decoded.width+sx)*4,to=(y*width+x)*4,source=[decoded.rgba[from],decoded.rgba[from+1],decoded.rgba[from+2],decoded.rgba[from+3]],mask=masks.find(item=>sx>=item.x&&sx<item.right&&sy>=item.y&&sy<item.bottom),pixel=mask?mask.fill:ignored.has(rgbaId(source))?[0,0,0,0]:source;rgba[to]=pixel[0];rgba[to+1]=pixel[1];rgba[to+2]=pixel[2];rgba[to+3]=pixel[3];const id=rgbaId(rgba.subarray(to,to+4));if(selected&&id===selected){matches++;continue}if(selected&&mode==='darken'){rgba[to]=Math.round(rgba[to]*.22);rgba[to+1]=Math.round(rgba[to+1]*.22);rgba[to+2]=Math.round(rgba[to+2]*.22);rgba[to+3]=Math.max(40,Math.round(rgba[to+3]*.35))}else if(selected&&mode==='lighten'){rgba[to]=Math.round(rgba[to]+(255-rgba[to])*.72);rgba[to+1]=Math.round(rgba[to+1]+(255-rgba[to+1])*.72);rgba[to+2]=Math.round(rgba[to+2]+(255-rgba[to+2])*.72);rgba[to+3]=Math.max(80,Math.round(rgba[to+3]*.55))}}
  return{width,height,rgba,matches};
}
let crcTable;
function crc32(buffer){if(!crcTable)crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0});let c=0xffffffff;for(const byte of buffer)c=crcTable[(c^byte)&255]^(c>>>8);return(c^0xffffffff)>>>0;}
function chunk(type,data){const name=Buffer.from(type),len=Buffer.alloc(4),crc=Buffer.alloc(4);len.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([name,data])));return Buffer.concat([len,name,data,crc]);}
function encodeRgbaPng(width,height,rgba){if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||!Buffer.isBuffer(rgba)||rgba.length!==width*height*4)throw new Error('Invalid RGBA image.');const raw=Buffer.alloc((width*4+1)*height);for(let y=0;y<height;y++)rgba.copy(raw,y*(width*4+1)+1,y*width*4,(y+1)*width*4);const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=6;return Buffer.concat([PNG_SIGNATURE,chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);}
function replacementProposal(collective, input = {}) { const from=String(input.fromColorId||''),raw=String(input.toColorId||''),channels=raw.split(',').map(value=>Number(value)),to=channels.join(','),selected=new Set(input.imageIds||[]);if(from===to||!collective.entries.some(x=>x.colorId===from)||channels.length!==4||channels.some(value=>!Number.isInteger(value)||value<0||value>255))throw new Error('Choose distinct exact source and replacement RGBA colors with channels from 0 through 255.');const images=collective.images.filter(image=>selected.has(image.imageId)).map(image=>({imageId:image.imageId,filename:image.filename,sourceHash:image.byteHash,pixelCount:image.colorCounts.find(x=>x.colorId===from)?.count||0})).filter(x=>x.pixelCount);if(!images.length)throw new Error('The selected exact color does not occur in the selected images.');const body={schema:'ikemaker.palette-copy-proposal',version:1,inventoryHash:collective.inventoryHash,fromColorId:from,toColorId:to,images};return{...body,proposalHash:sha(Buffer.from(stable(body)))}; }
function applyReplacement(decoded,fromColorId,toColorId){const rgba=Buffer.from(decoded.rgba),to=toColorId.split(',').map(Number);let changed=0;for(let at=0;at<rgba.length;at+=4)if(rgbaId(rgba.subarray(at,at+4))===fromColorId){for(let c=0;c<4;c++)rgba[at+c]=Math.max(0,Math.min(255,to[c]));changed++;}return{width:decoded.width,height:decoded.height,rgba,changed,pixelHash:sha(rgba)};}
function normalizedRegions(decoded,regions=[]){return(regions||[]).map(raw=>{const x=Math.max(0,Math.min(decoded.width,Math.floor(Number(raw.x)||0))),y=Math.max(0,Math.min(decoded.height,Math.floor(Number(raw.y)||0))),right=Math.max(x,Math.min(decoded.width,Math.ceil((Number(raw.x)||0)+(Number(raw.width)||0)))),bottom=Math.max(y,Math.min(decoded.height,Math.ceil((Number(raw.y)||0)+(Number(raw.height)||0))));return{x,y,right,bottom}}).filter(item=>item.right>item.x&&item.bottom>item.y)}
function colorIdsOutsideRegions(decoded,regions=[]){const masks=normalizedRegions(decoded,regions),colors=new Set();for(let y=0;y<decoded.height;y++)for(let x=0;x<decoded.width;x++){if(masks.some(mask=>x>=mask.x&&x<mask.right&&y>=mask.y&&y<mask.bottom))continue;const at=(y*decoded.width+x)*4;colors.add(rgbaId(decoded.rgba.subarray(at,at+4)))}return colors}
function regionColorCounts(decoded,region){const masks=normalizedRegions(decoded,[region]);if(!masks.length)return[];const rect=masks[0],counts=new Map();for(let y=rect.y;y<rect.bottom;y++)for(let x=rect.x;x<rect.right;x++){const at=(y*decoded.width+x)*4,id=rgbaId(decoded.rgba.subarray(at,at+4));counts.set(id,(counts.get(id)||0)+1)}return[...counts].map(([colorId,count])=>({colorId,count,rgba:colorId.split(',').map(Number)})).sort((a,b)=>b.count-a.count||a.colorId.localeCompare(b.colorId))}
function regionRowIntervals(decoded,regions=[]){
  const rows=new Map();
  for(const rect of normalizedRegions(decoded,regions))for(let y=rect.y;y<rect.bottom;y++){const ranges=rows.get(y)||[];ranges.push([rect.x,rect.right]);rows.set(y,ranges)}
  for(const [y,ranges] of rows){ranges.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);const merged=[];for(const range of ranges){const last=merged.at(-1);if(last&&range[0]<=last[1])last[1]=Math.max(last[1],range[1]);else merged.push(range.slice())}rows.set(y,merged)}
  return rows;
}
function colorCountsOutsideRegions(image,regions=[],ignoredColorIds=[]){
  const ignored=new Set([...(ignoredColorIds||[])].map(String)),counts=new Map((image?.colorCounts||[]).filter(item=>!ignored.has(String(item.colorId))).map(item=>[String(item.colorId),Number(item.count)||0])),rows=regionRowIntervals(image.decoded,(regions||[]).map(item=>item?.rect||item));
  for(const [y,ranges] of rows)for(const [from,to] of ranges)for(let x=from;x<to;x++){const at=(y*image.width+x)*4,id=rgbaId(image.decoded.rgba.subarray(at,at+4));if(ignored.has(id)||!counts.has(id))continue;const remaining=(counts.get(id)||0)-1;if(remaining>0)counts.set(id,remaining);else counts.delete(id)}
  return counts;
}
function regionExclusionReview(collective,input={}){
  if(collective?.schema!=='ikemaker.palette-collective'||collective?.version!==1||!Array.isArray(collective.images))throw new Error('Region exclusion requires an exact palette collective.');
  const imageId=String(input.imageId||''),image=collective.images.find(item=>item.imageId===imageId),fillColorId=String(input.fillColorId||''),fillRgba=fillColorId.split(',').map(Number);
  if(!image)throw new Error('The selected template image is no longer available.');
  if(fillRgba.length!==4||fillRgba.some(value=>!Number.isInteger(value)||value<0||value>255))throw new Error('Choose one exact cleanup fill color before selecting an area.');
  const raw=input.rect||{};if(![raw.x,raw.y,raw.width,raw.height].every(value=>Number.isFinite(Number(value)))||Number(raw.width)<=0||Number(raw.height)<=0)throw new Error('Drag a non-empty rectangle over the unwanted image region.');
  const x=Math.max(0,Math.min(image.width-1,Math.floor(Number(raw.x)))),y=Math.max(0,Math.min(image.height-1,Math.floor(Number(raw.y)))),right=Math.max(x+1,Math.min(image.width,Math.ceil(Number(raw.x)+Number(raw.width)))),bottom=Math.max(y+1,Math.min(image.height,Math.ceil(Number(raw.y)+Number(raw.height)))),rect={x,y,width:right-x,height:bottom-y};
  const prior=(input.priorRegions||[]).filter(item=>item&&item.inventoryHash===collective.inventoryHash),byImage=new Map(),totals=new Map(collective.entries.map(entry=>[entry.colorId,entry.count]));
  // The collective already owns exact aggregate counts. Subtract only pixels covered by
  // earlier masks instead of rescanning every pixel in every source image. This keeps a
  // small region review responsive even when the contact sheet contains thousands of sprites.
  for(const source of collective.images){const sourcePrior=prior.filter(region=>region.scope==='all-images'||region.imageId===source.imageId).map(region=>region.rect);if(!sourcePrior.length)continue;const rows=regionRowIntervals(source.decoded,sourcePrior);byImage.set(source.imageId,rows);for(const [py,ranges] of rows)for(const [from,to] of ranges)for(let px=from;px<to;px++){const at=(py*source.width+px)*4,id=rgbaId(source.decoded.rgba.subarray(at,at+4));totals.set(id,Math.max(0,(totals.get(id)||0)-1))}}
  const counts=new Map(),affectedImageIds=[];for(const source of collective.images){const selected=normalizedRegions(source.decoded,[rect])[0];if(!selected)continue;const selectedMasks=byImage.get(source.imageId)||new Map();let affected=false;for(let py=selected.y;py<selected.bottom;py++){const ranges=selectedMasks.get(py)||[];for(let px=selected.x;px<selected.right;px++){if(ranges.some(range=>px>=range[0]&&px<range[1]))continue;const at=(py*source.width+px)*4,id=rgbaId(source.decoded.rgba.subarray(at,at+4));counts.set(id,(counts.get(id)||0)+1);if(id!==fillColorId)affected=true}}if(affected)affectedImageIds.push(source.imageId)}
  counts.delete(fillColorId);
  if(!counts.size)throw new Error('The selected region contains only the chosen cleanup fill color. Nothing else needs removal.');
  if(counts.size>LIMITS.maximumRegionReviewColors)throw new Error(`The selected region contains more than ${LIMITS.maximumRegionReviewColors.toLocaleString()} exact colors. Select a smaller unwanted area.`);
  const rows=[...counts].map(([colorId,regionPixelCount])=>{const totalPixelCount=totals.get(colorId)||0,outsidePixelCount=Math.max(0,totalPixelCount-regionPixelCount),rgba=colorId.split(',').map(Number);return{colorId,rgba,regionPixelCount,totalPixelCount,outsidePixelCount,defaultSelected:rgba[3]!==0&&outsidePixelCount===0}}).sort((a,b)=>b.regionPixelCount-a.regionPixelCount||a.colorId.localeCompare(b.colorId));
  const body={schema:'ikemaker.template-region-exclusion-review',version:2,scope:'all-images',inventoryHash:collective.inventoryHash,priorMaskHash:sha(Buffer.from(stable(prior.map(item=>({scope:item.scope||'image',imageId:item.imageId,rect:item.rect,fillColorId:item.fillColorId||'',reviewHash:item.reviewHash}))))),fillColorId,imageId,imageName:`${collective.images.length} imported sprites`,sourceImageName:image.name,rect,affectedImageIds,affectedImageCount:affectedImageIds.length,rows};
  return{...body,reviewHash:sha(Buffer.from(stable(body)))};
}
function excludeColorsRgba(decoded,ignoredColorIds=[],regions=[]){
  if(!decoded||!Number.isInteger(decoded.width)||!Number.isInteger(decoded.height)||!Buffer.isBuffer(decoded.rgba)||decoded.rgba.length!==decoded.width*decoded.height*4)throw new Error('Color exclusion requires an exact RGBA image.');
  const ignored=new Set((ignoredColorIds||[]).map(String)),rgba=Buffer.from(decoded.rgba);let changed=0;
  for(let at=0;at<rgba.length;at+=4)if(ignored.has(rgbaId(rgba.subarray(at,at+4)))){rgba[at]=0;rgba[at+1]=0;rgba[at+2]=0;rgba[at+3]=0;changed++}
  for(const raw of regions||[]){const spec=raw?.rect?raw:{rect:raw},rect=normalizedRegions(decoded,[spec.rect])[0];if(!rect)continue;const fill=String(spec.fillColorId||'').split(',').map(Number),validFill=fill.length===4&&fill.every(value=>Number.isInteger(value)&&value>=0&&value<=255),replacement=validFill?fill:[0,0,0,0];for(let py=rect.y;py<rect.bottom;py++)for(let px=rect.x;px<rect.right;px++){const at=(py*decoded.width+px)*4;if(rgba[at]!==replacement[0]||rgba[at+1]!==replacement[1]||rgba[at+2]!==replacement[2]||rgba[at+3]!==replacement[3])changed++;for(let channel=0;channel<4;channel++)rgba[at+channel]=replacement[channel]}}
  return{width:decoded.width,height:decoded.height,rgba,changed,pixelHash:sha(rgba)};
}
function templateSprite(decoded,options={}){
  if(!decoded||!Number.isInteger(decoded.width)||!Number.isInteger(decoded.height)||!Buffer.isBuffer(decoded.rgba))throw new Error('Template sprite preparation requires decoded image pixels.');
  const mode=options.backgroundMode==='color'?'color':'index',backgroundIndex=Math.max(0,Math.min(255,Number(options.backgroundIndex)||0)),backgroundColorId=String(options.backgroundColorId||''),rgba=Buffer.from(options.rgba||decoded.rgba);let left=decoded.width,top=decoded.height,right=-1,bottom=-1;
  for(let y=0;y<decoded.height;y++)for(let x=0;x<decoded.width;x++){const pixel=y*decoded.width+x,at=pixel*4,isBackground=mode==='index'&&Buffer.isBuffer(decoded.indices)?decoded.indices[pixel]===backgroundIndex:mode==='color'&&rgbaId(rgba.subarray(at,at+4))===backgroundColorId;if(isBackground)rgba[at+3]=0;if(rgba[at+3]){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y)}}
  if(right<left||bottom<top)return{width:1,height:1,rgba:Buffer.alloc(4),sourceRect:{x:0,y:0,width:1,height:1},empty:true};
  const width=right-left+1,height=bottom-top+1,out=Buffer.alloc(width*height*4);for(let y=0;y<height;y++)rgba.copy(out,y*width*4,((top+y)*decoded.width+left)*4,((top+y)*decoded.width+left+width)*4);
  return{width,height,rgba:out,sourceRect:{x:left,y:top,width,height},empty:false};
}
function organizerHandoff(collective,state={}){const gate=reviewGate(collective,state);if(!gate.ready)throw new Error(gate.reason);const ignored=new Set(Object.entries(state.dispositions||{}).filter(([,v])=>v==='ignore').map(([id])=>id)),excludedRegions=(state.excludedRegions||[]).filter(item=>item.inventoryHash===collective.inventoryHash&&(item.scope==='all-images'||collective.images.some(image=>image.imageId===item.imageId))).map(item=>({inventoryHash:item.inventoryHash,scope:item.scope||'image',imageId:item.imageId,imageName:item.imageName,rect:{...item.rect},fillColorId:item.fillColorId||'',colorIds:[...(item.colorIds||[])],reviewHash:item.reviewHash}));return{inventoryHash:collective.inventoryHash,evidence:collective.evidence,entries:collective.entries.map(item=>({...item,templateDisposition:ignored.has(item.colorId)||item.colorId===state.cleanupFillColorId?'ignore':'include'})),cleanupFillColorId:String(state.cleanupFillColorId||''),ignoredColorIds:[...ignored],excludedRegions,indexedImageExportAllowed:ignored.size===0&&!excludedRegions.length};}

// Choose a compact, reproducible set of representative images whose combined
// pixels cover every requested color.  This is intentionally source-agnostic:
// callers may build the collective from normal folder PNGs or from durable PNG
// snapshots extracted from an SFF.  The model never guesses exclusions and
// reports colors that cannot be covered by the eligible source set.
function selectCoverageImages(collective, options = {}) {
  if (collective?.schema !== 'ikemaker.palette-collective' || collective?.version !== 1 || !Array.isArray(collective.images) || !Array.isArray(collective.entries)) throw new Error('Color coverage selection requires an exact palette collective.');
  const colorOrder = new Map(collective.entries.map((entry, index) => [entry.colorId, index]));
  const knownImages = new Map(collective.images.map(image => [image.imageId, image]));
  const knownColors = new Set(colorOrder.keys());
  const rawContexts = options.imageContexts || {};
  const contextFor = imageId => {
    const raw = rawContexts instanceof Map ? rawContexts.get(imageId) : rawContexts[imageId];
    if (!raw || typeof raw !== 'object') return null;
    const context = {};
    if (raw.sourceKind !== undefined) context.sourceKind = String(raw.sourceKind);
    if (raw.group !== undefined) context.group = raw.group;
    if (raw.number !== undefined) context.number = raw.number;
    if (raw.physicalIndex !== undefined) context.physicalIndex = raw.physicalIndex;
    if (raw.paletteId !== undefined) context.paletteId = String(raw.paletteId);
    return context;
  };
  const groupFor = imageId => { const context = contextFor(imageId); return context?.group === undefined ? '' : String(context.group); };
  const ignored = new Set((options.ignoredColorIds || []).map(String));
  const requested = options.requiredColorIds === undefined ? collective.entries.map(entry => entry.colorId) : [...new Set((options.requiredColorIds || []).map(String))];
  const unknownColors = requested.filter(colorId => !knownColors.has(colorId));
  if (unknownColors.length) throw new Error(`Coverage request contains ${unknownColors.length} color(s) outside the exact collective.`);
  const required = requested.filter(colorId => !ignored.has(colorId));
  const requiredSet = new Set(required);
  const rejectedImages = new Set([...(options.excludedImageIds || []), ...(options.rejectedImageIds || [])].map(String));
  const rejectedGroups = new Set((options.rejectedGroupIds || []).map(String));
  const eligibleInput = options.eligibleImageIds === undefined ? collective.images.map(image => image.imageId) : [...new Set((options.eligibleImageIds || []).map(String))];
  const requestedPinned=[...(options.pinnedImageIds || []),...(options.manualImageIds || []),...(options.showcaseImageIds || [])];
  const invalidImages = [...eligibleInput, ...requestedPinned].filter(imageId => !knownImages.has(String(imageId)));
  if (invalidImages.length) throw new Error('Coverage selection references an image outside the exact collective.');
  const rejected = collective.images.map(image => rejectedImages.has(image.imageId) ? { imageId:image.imageId, reason:'image' } : rejectedGroups.has(groupFor(image.imageId)) ? { imageId:image.imageId, reason:'group', groupId:groupFor(image.imageId) } : null).filter(Boolean);
  const rejectedIds = new Set(rejected.map(item => item.imageId));
  const eligible = eligibleInput.map(String).filter(imageId => !rejectedIds.has(imageId));
  const eligibleSet = new Set(eligible);
  const pinned = [...new Set(requestedPinned.map(String))];
  if (pinned.some(imageId => !eligibleSet.has(imageId))) throw new Error('A pinned coverage image is not eligible for selection.');
  const colorCounts = new Map(collective.images.map(image => [image.imageId, new Map(image.colorCounts.filter(item => requiredSet.has(item.colorId)).map(item => [item.colorId, item.count]))]));
  const colorStats = new Map(required.map(colorId => { const occurrences=eligible.map(imageId=>colorCounts.get(imageId)?.get(colorId)||0).filter(count=>count>0);return[colorId,{availableImageCount:occurrences.length,bestAvailablePixelCount:occurrences.length?Math.max(...occurrences):0}]}));
  const covered = new Set(), rows = [];
  const contributionFor = imageId => [...(colorCounts.get(imageId)?.keys() || [])].filter(colorId => !covered.has(colorId)).sort((a, b) => colorOrder.get(a) - colorOrder.get(b)).map(colorId => { const pixelCount=colorCounts.get(imageId).get(colorId),stats=colorStats.get(colorId),representationRatio=stats.bestAvailablePixelCount?pixelCount/stats.bestAvailablePixelCount:0,rarityWeight=stats.availableImageCount?1/stats.availableImageCount:0;return{colorId,pixelCount,availableImageCount:stats.availableImageCount,bestAvailablePixelCount:stats.bestAvailablePixelCount,representationRatio,rarityWeight,weightedRepresentation:representationRatio*rarityWeight} });
  const add = (imageId, reason) => {
    const image = knownImages.get(imageId), contributions = contributionFor(imageId), context=contextFor(imageId), targetPaletteId=options.targetPaletteId===undefined?'':String(options.targetPaletteId), sourcePaletteId=context?.paletteId||'', crossPalette=Boolean(targetPaletteId&&sourcePaletteId&&targetPaletteId!==sourcePaletteId);
    for (const item of contributions) covered.add(item.colorId);
    rows.push({ imageId, filename: image.filename, name: image.name, order: image.order, width: image.width, height: image.height, pixelArea: image.width * image.height, reason, context, paletteRelationship:crossPalette?'reviewed-expansion-candidate':targetPaletteId&&sourcePaletteId?'target-palette':'unknown', requiresPaletteReview:crossPalette, contributionColorIds: contributions.map(item=>item.colorId), contributionCount: contributions.length, contributionPixels:contributions.reduce((sum,item)=>sum+item.pixelCount,0), representationScore:Number(contributions.reduce((sum,item)=>sum+item.weightedRepresentation,0).toFixed(12)), contributions });
  };
  for (const imageId of pinned) add(imageId, 'manual-showcase');
  const remaining = new Set(eligible.filter(imageId => !pinned.includes(imageId)));
  while (covered.size < required.length) {
    let winner = null;
    for (const imageId of remaining) {
      const image = knownImages.get(imageId), contributions=contributionFor(imageId), representationScore=contributions.reduce((sum,item)=>sum+item.weightedRepresentation,0), contributionPixels=contributions.reduce((sum,item)=>sum+item.pixelCount,0), candidate = { imageId, gain: contributions.length, representationScore, contributionPixels, pixelArea: image.width * image.height, order: image.order, filename: image.filename };
      if (!winner || candidate.gain > winner.gain || candidate.gain === winner.gain && candidate.representationScore > winner.representationScore || candidate.gain === winner.gain && candidate.representationScore === winner.representationScore && candidate.contributionPixels > winner.contributionPixels || candidate.gain === winner.gain && candidate.representationScore === winner.representationScore && candidate.contributionPixels === winner.contributionPixels && candidate.pixelArea < winner.pixelArea || candidate.gain === winner.gain && candidate.representationScore === winner.representationScore && candidate.contributionPixels === winner.contributionPixels && candidate.pixelArea === winner.pixelArea && candidate.order < winner.order || candidate.gain === winner.gain && candidate.representationScore === winner.representationScore && candidate.contributionPixels === winner.contributionPixels && candidate.pixelArea === winner.pixelArea && candidate.order === winner.order && candidate.filename.localeCompare(winner.filename) < 0) winner = candidate;
    }
    if (!winner || winner.gain === 0) break;
    remaining.delete(winner.imageId);
    add(winner.imageId, 'automatic');
  }
  const missingColorIds = required.filter(colorId => !covered.has(colorId));
  const crossPaletteSelections=rows.filter(row=>row.requiresPaletteReview).map(row=>({imageId:row.imageId,context:row.context,contributionColorIds:row.contributionColorIds}));
  const body = { schema: 'ikemaker.palette-coverage-selection', version: 2, inventoryHash: collective.inventoryHash, targetPaletteId:options.targetPaletteId===undefined?'':String(options.targetPaletteId), requiredColorIds: required, ignoredColorIds: [...ignored].filter(colorId => knownColors.has(colorId)).sort((a, b) => colorOrder.get(a) - colorOrder.get(b)), eligibleImageIds: eligible, rejectedImageIds:[...rejectedImages].filter(imageId=>knownImages.has(imageId)), rejectedGroupIds:[...rejectedGroups], rejections:rejected, pinnedImageIds: pinned, selectedImageIds: rows.map(row => row.imageId), missingColorIds, crossPaletteSelections, rows };
  return { ...body, complete: missingColorIds.length === 0, coveredColorCount: covered.size, requiredColorCount: required.length, requiresPaletteExpansionReview:crossPaletteSelections.length>0, selectionHash: sha(Buffer.from(stable(body))) };
}

module.exports={LIMITS,sha,stable,rgbaId,normalizeFiles,buildCollective,missedColorAudit,reviewGate,thumbnail,highlightRgba,previewRgba,encodeRgbaPng,replacementProposal,applyReplacement,colorIdsOutsideRegions,colorCountsOutsideRegions,regionColorCounts,regionExclusionReview,excludeColorsRgba,templateSprite,organizerHandoff,selectCoverageImages};
