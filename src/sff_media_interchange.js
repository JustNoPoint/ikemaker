'use strict';

const path = require('path');
const crypto = require('crypto');
const manifest = require('./media_editor_manifest');
const reader = require('./sff_reader');
const { readIndexedPng8 } = require('./sff_png8_source');
const { parsePaletteText, writePaletteText } = require('./palette_text_format');
const { pixelPlane, encodedPlane } = require('./sff_sprite_transforms');
const { decodePng } = require('./palette_index_organizer_model');
const { rewriteArchiveRows } = require('./sff_direct_delete');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const id = entry => entry.group + ',' + (entry.number ?? entry.index);
const sourceKey = file => path.resolve(file).toLowerCase();
const MAX_FILES = 4096, MAX_BYTES = 256 * 1024 * 1024, MAX_PIXELS = 16000000;

function exportArchive(archive) {
  if (archive.sprites.length + archive.palettes.length > MAX_FILES) throw new Error('Manifest export is limited to 4096 entries.');
  for(const [kind,table]of [['sprite',archive.sprites],['palette',archive.palettes]]){
    const identities=new Set();for(const row of table){if(identities.has(id(row)))throw new Error(`Manifest export cannot represent repeated ${kind} identity ${id(row)}. Resolve duplicate identities before exporting.`);identities.add(id(row));}
  }
  const files = new Map(), entries = [];
  for (const palette of archive.palettes) {
    const owner = reader.resolvedPalette(archive, palette.index);
    if (!owner) throw new Error('A palette links to missing data.');
    const file = `palette-${owner.index}-${owner.group}-${owner.number}.rgba`;
    if (!files.has(file)) files.set(file, writePaletteText(reader.paletteRgba(archive, owner.index).slice(0, owner.colors), 'rgba'));
    entries.push({type:'palette', group:palette.group, index:palette.number, file});
  }
  let pixels = 0;
  for (const sprite of archive.sprites) {
    const owner = reader.resolvedSprite(archive, sprite);
    pixels += owner.width * owner.height;
    if (pixels > MAX_PIXELS) throw new Error('Manifest export is limited to 16 million decoded pixels.');
    const file = `sprite-${owner.index}-${owner.group}-${owner.number}.png`;
    if (!files.has(file)) {
      const plane = pixelPlane(archive, owner);
      files.set(file, plane.channels === 1
        ? reader.indexedSourcePng(plane.width, plane.height, plane.pixels, reader.paletteRgba(archive, owner.paletteIndex))
        : reader.spritePng(archive, owner));
    }
    const palette = archive.palettes[sprite.paletteIndex];
    entries.push({type:'sprite',group:sprite.group,index:sprite.number,file,axis:{x:sprite.axisX,y:sprite.axisY},...(palette?{palette:{group:palette.group,index:palette.number}}:{})});
  }
  files.set('manifest.txt', Buffer.from(manifest.write(entries)));
  if ([...files.values()].reduce((sum, bytes) => sum + bytes.length, 0) > MAX_BYTES) throw new Error('Manifest export exceeds 256 MB.');
  return {files, entries};
}

function archiveRows(archive, kind) {
  const palettes = kind === 'palette';
  return (palettes ? archive.palettes : archive.sprites).map(row => ({...row, newIndex:row.index,
    data:row.dataSize ? Buffer.from(archive.buffer.subarray(palettes ? archive.header.literalDataOffset + row.dataOffset : row.dataOffset,
      (palettes ? archive.header.literalDataOffset + row.dataOffset : row.dataOffset) + row.dataSize)) : null}));
}

// An unlisted image/palette sharing an imported owner retains its old data.
// Reuse an unchanged earlier owner where possible, otherwise materialize once.
function preserveUnlisted(archive, rows, touched, kind, changes) {
  const originals = kind === 'palette' ? archive.palettes : archive.sprites;
  const originalRows = archiveRows(archive, kind);
  const preserved = new Map();
  for (const original of originals) {
    if (touched.has(original.index) || original.dataSize) continue;
    let ancestor = originals[original.link], affected = false;
    const seen = new Set();
    while (ancestor) {
      if (seen.has(ancestor.index)) throw new Error('Circular original archive link.');
      seen.add(ancestor.index);
      if (touched.has(ancestor.index)) affected = true;
      if (ancestor.dataSize) break;
      ancestor = originals[ancestor.link];
    }
    if (!ancestor) throw new Error('Original archive has a missing shared owner.');
    if (!affected) continue;
    const row = rows[original.index];
    if (!touched.has(ancestor.index)) row.link = ancestor.index;
    else if (preserved.has(ancestor.index)) row.link = preserved.get(ancestor.index);
    else {
      const owner = originalRows[ancestor.index];
      row.data = owner.data; row.dataSize = owner.dataSize; row.link = 0;
      if (kind === 'sprite') for (const key of ['format','colorDepth','width','height','flags']) row[key] = owner[key];
      else row.colors = owner.colors;
      preserved.set(ancestor.index, original.index);
    }
    changes.push({type:kind,identity:id(original),action:row.data?'preserve shared data independently':'retarget unchanged shared data'});
  }
}

function planImport(archive, text, manifestFile, loadFile) {
  if (archive.header.legacy) throw new Error('Convert SFF v1 to v2 before importing a sprite/palette manifest.');
  const parsed = manifest.read(text);
  if (parsed.errors.length) throw new Error(parsed.errors.join('\n'));
  const entries = parsed.entries.filter(entry => ['sprite','palette'].includes(entry.type));
  if (!entries.length || entries.length > MAX_FILES) throw new Error('Import requires 1–4096 sprite/palette entries.');
  const rows = archiveRows(archive,'sprite'), palettes = archiveRows(archive,'palette');
  const spriteIds = new Map(rows.map((row,index) => [id(row),index]));
  const paletteIds = new Map(palettes.map((row,index) => [id(row),index]));
  const files = new Map(), changes = [], touchedSprites = new Set(), touchedPalettes = new Set(), identities = new Set();
  let bytes = 0, pixels = 0;
  for (const entry of entries) {
    if (![entry.group,entry.index].every(value=>Number.isInteger(value)&&value>=0&&value<=65535)) throw new Error('SFF identities must be from 0 through 65535.');
    const identity = entry.type+':'+id(entry);
    if (identities.has(identity)) throw new Error('Repeated manifest identity '+identity+'.');
    identities.add(identity);
    entry.sourceFile = path.resolve(path.dirname(manifestFile),entry.file);
    entry.sourceKey = sourceKey(entry.sourceFile);
    if (!files.has(entry.sourceKey)) {
      const data = loadFile(entry.sourceFile);
      if (!Buffer.isBuffer(data) || data.length > 16*1024*1024) throw new Error('Each imported source must be at most 16 MB.');
      bytes += data.length;
      if (bytes > MAX_BYTES) throw new Error('Imported sources exceed 256 MB.');
      files.set(entry.sourceKey,{file:entry.sourceFile,data:Buffer.from(data),hash:sha(data)});
    }
    const table = entry.type==='palette'?palettes:rows, lookup=entry.type==='palette'?paletteIds:spriteIds;
    let index = lookup.get(id(entry));
    const action = index===undefined?'add':'replace';
    if(index===undefined) {index=table.length;lookup.set(id(entry),index);table.push({index,newIndex:index,group:entry.group,number:entry.index});}
    entry.physicalIndex=index;
    (entry.type==='palette'?touchedPalettes:touchedSprites).add(index);
    changes.push({type:entry.type,identity:id(entry),action,physicalIndex:index,file:entry.file,axis:entry.axis,palette:entry.palette});
  }
  preserveUnlisted(archive,rows,touchedSprites,'sprite',changes);
  preserveUnlisted(archive,palettes,touchedPalettes,'palette',changes);
  const sharedPalette = new Map(), sharedImage = new Map();
  for (const entry of entries.filter(entry=>entry.type==='palette').sort((a,b)=>a.physicalIndex-b.physicalIndex)) {
    const data=files.get(entry.sourceKey).data;
    const colors = /\.png$/i.test(entry.file) ? require('./palette_library').pngPaletteRgba(data,{padTo256:false}) : parsePaletteText(data);
    const row=palettes[entry.physicalIndex];
    Object.assign(row,{colors:colors.length,link:0,data:Buffer.from(colors.flat()),dataSize:colors.length*4});
    if(sharedPalette.has(entry.sourceKey)) {row.data=null;row.dataSize=0;row.link=sharedPalette.get(entry.sourceKey);}
    else sharedPalette.set(entry.sourceKey,entry.physicalIndex);
  }
  for (const entry of entries.filter(entry=>entry.type==='sprite').sort((a,b)=>a.physicalIndex-b.physicalIndex)) {
    const row=rows[entry.physicalIndex], data=files.get(entry.sourceKey).data;
    if (data.length<33 || !data.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))) throw new Error('Sprite sources must be PNG files.');
    const width=data.readUInt32BE(16),height=data.readUInt32BE(20),colorType=data[25];
    pixels+=width*height;
    if(!width||!height||width>8192||height>8192||width*height>1000000||pixels>MAX_PIXELS)throw new Error('Imported PNG limits: 8192 per dimension, one million pixels per image, 16 million total.');
    if(data[24]!==8||![2,3,6].includes(colorType))throw new Error('Use noninterlaced 8-bit indexed, RGB24 or RGBA32 PNG sources.');
    if(colorType===2)for(let at=8;at+12<=data.length;){const size=data.readUInt32BE(at);if(size>data.length-at-12)throw new Error('PNG chunk exceeds its source.');if(data.toString('ascii',at+4,at+8)==='tRNS')throw new Error('RGB PNG transparency must be converted to RGBA32 before import.');at+=size+12;}
    let plane;
    if(colorType===3){const indexed=readIndexedPng8(data,{maxPixels:1000000});plane={width,height,pixels:indexed.indices,channels:1,colorDepth:8};}
    else {if(reader.friendlyVersion(archive.header.version)!=='2.1')throw new Error('Truecolor PNG import needs SFF 2.1.');const decoded=decodePng(data,{maximumPixels:1000000,maximumDimension:8192});plane={width,height,pixels:Buffer.from(decoded.rgba),channels:4,colorDepth:colorType===2?24:32};}
    const axis=entry.axis||{x:Number.isInteger(row.axisX)?row.axisX:0,y:Number.isInteger(row.axisY)?row.axisY:0};
    if(![axis.x,axis.y].every(value=>Number.isInteger(value)&&value>=-32768&&value<=32767))throw new Error('Sprite axes must be signed 16-bit coordinates.');
    const paletteIndex=entry.palette?paletteIds.get(id(entry.palette)):(row.paletteIndex??0);
    if(!Number.isInteger(paletteIndex)||(!palettes[paletteIndex]&&(entry.palette||plane.channels===1)))throw new Error('Sprite '+id(entry)+' needs an existing or imported palette assignment.');
    // Embedded colors are display evidence only. Explicit manifest palette IDs
    // retain index semantics; no color matching or automatic remap takes place.
    const colors = colorType===3 ? readIndexedPng8(data,{maxPixels:1000000}).colors : null;
    const encoded=encodedPlane(plane,plane.channels===1&&reader.friendlyVersion(archive.header.version)==='2.1'?colors:null);
    Object.assign(row,encoded,{width,height,axisX:axis.x,axisY:axis.y,paletteIndex,flags:0,link:0,dataSize:encoded.data.length});
    if(sharedImage.has(entry.sourceKey)){row.data=null;row.dataSize=0;row.link=sharedImage.get(entry.sourceKey);}
    else sharedImage.set(entry.sourceKey,entry.physicalIndex);
  }
  const built=rewriteArchiveRows(archive,rows,palettes);
  for(const change of changes){
    if(!Number.isInteger(change.physicalIndex))continue;
    if(change.type==='sprite'){
      const row=built.archive.sprites[change.physicalIndex],palette=built.archive.palettes[row.paletteIndex];
      change.axis={x:row.axisX,y:row.axisY};
      change.palette=palette?{group:palette.group,index:palette.number}:null;
      change.image=`${row.width}×${row.height} · ${row.colorDepth}-bit · ${row.dataSize?'independent image':'image link to physical '+row.link}`;
    }else{
      const row=built.archive.palettes[change.physicalIndex];
      change.paletteStorage=`${row.colors} colors · ${row.dataSize?'independent palette':'palette link to physical '+row.link}`;
      const before=archive.palettes[change.physicalIndex]?reader.paletteRgba(archive,change.physicalIndex):[],after=reader.paletteRgba(built.archive,change.physicalIndex);
      change.colorChanges=[];
      for(let index=0;index<Math.max(before.length,row.colors);index++)if(JSON.stringify(before[index])!==JSON.stringify(after[index]))change.colorChanges.push({index,before:before[index]||null,after:index<row.colors?after[index]:null});
    }
  }
  // Verify exact palette bytes/counts/ownership as well as decoded sprite data.
  for(let index=0;index<palettes.length;index++){
    const expected=palettes[index],actual=built.archive.palettes[index];
    if(actual.colors!==expected.colors||actual.link!==expected.link||Boolean(actual.dataSize)!==Boolean(expected.data))throw new Error('Palette ownership verification failed.');
    if(expected.data&&!reader.paletteRgba(built.archive,index).slice(0,expected.colors).flat().every((value,at)=>value===expected.data[at]))throw new Error('Palette bytes changed during import.');
  }
  return {...built,sourceHash:sha(archive.buffer),manifestHash:sha(Buffer.from(text)),manifestFile,files:[...files.values()].map(({file,hash})=>({file,hash})),changes,
    ignored:parsed.entries.length-entries.length,summary:{sprites:touchedSprites.size,palettes:touchedPalettes.size,sharedImages:entries.filter(entry=>entry.type==='sprite').length-sharedImage.size,sharedPalettes:entries.filter(entry=>entry.type==='palette').length-sharedPalette.size}};
}

function validateSources(plan, loadFile) {
  if(sha(loadFile(plan.manifestFile))!==plan.manifestHash)throw new Error('The manifest changed after review. Review the import again.');
  for(const source of plan.files)if(sha(loadFile(source.file))!==source.hash)throw new Error('An imported source changed after review: '+source.file);
}

module.exports={exportArchive,planImport,validateSources};
