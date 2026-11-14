'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {parseDef,sections,sectionMap,tuple,unquote}=require('./def_model');
const R=require('./sff_reader');
const {decodePng}=require('./palette_index_organizer_model');
const LIMIT=32*1024*1024,PIXELS=4000000;
function readBounded(file){const st=fs.statSync(file);if(!st.isFile()||st.size>LIMIT)throw Error('Font asset exceeds the 32 MB limit.');return fs.readFileSync(file);}
function dims(w,h){if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||w*h>PIXELS)throw Error('Font image exceeds the 4 million pixel limit.');}
function uri(png){return 'data:image/png;base64,'+png.toString('base64');}
function pair(value,fallback){const a=Array.isArray(value)?value:tuple(value||fallback.join(','));return [Number(a[0])||0,Number(a[1])||0];}
function resolveFont(ref,owner,root){return [path.resolve(path.dirname(owner),ref),root&&path.resolve(root,'data',ref),root&&path.resolve(root,ref),root&&path.resolve(root,'font',ref)].filter(Boolean).find(p=>{try{return fs.statSync(p).isFile();}catch{return false;}});}
function parseLegacyFnt(buffer,options={}){
 if(buffer.length<32||buffer.toString('latin1',0,12)!=='ElecbyteFnt\0')throw Error('Invalid legacy FNT signature.');
 const po=buffer.readUInt32LE(16),pl=buffer.readUInt32LE(20),to=buffer.readUInt32LE(24),tl=buffer.readUInt32LE(28);
 if(pl<897||po<32||po+pl>buffer.length||to<32||to+tl>buffer.length||tl>1024*1024)throw Error('Invalid FNT image or definition bounds.');
 const pcx=buffer.subarray(po,po+pl);if(pcx[0]!==10||pcx[3]!==8||pcx[65]!==1||pcx[2]>1)throw Error('FNT requires an 8-bit single-plane PCX.');
 const width=pcx.readUInt16LE(8)-pcx.readUInt16LE(4)+1,height=pcx.readUInt16LE(10)-pcx.readUInt16LE(6)+1,stride=pcx.readUInt16LE(66);dims(width,height);if(stride<width||stride*height>PIXELS*2)throw Error('Invalid FNT PCX stride.');
 const pixels=R.pcx8(pcx.subarray(128,pl-768),width,height,stride,pcx[2]===1),text=buffer.toString('latin1',to,to+tl),doc=parseDef(text),settings=sectionMap(sections(doc,'Def')[0]),size=pair(settings.size,[8,height]),spacing=pair(settings.spacing,[0,0]),offset=pair(settings.offset,[0,0]);
 const colors=Array.from({length:256},(_,i)=>[...pcx.subarray(pl-768+i*3,pl-768+i*3+3),i?255:0]),count=Math.min(255,Math.ceil(Math.max(1,Number(settings.colors)||1)/16)*16),palettes=[];
 for(let b=0;b<Math.floor(255/count);b++){const p=colors.map(c=>c.slice());for(let i=256-count;i<256;i++)p[i]=colors[i-count*b].slice();palettes.push(p);}
 const glyphBanks={},indexedGlyphs={};let section='',x=0,totalPixels=0;
 for(const line of text.split(/\r?\n/)){const clean=line.split(';')[0].trim(),head=/^\[([^\]]+)\]/.exec(clean);if(head){section=head[1].toLowerCase();continue;}if(section!=='map'||!clean)continue;const fields=clean.split(/\s+/),code=/^0x[\da-f]+$/i.test(fields[0])?parseInt(fields[0],16):fields[0].charCodeAt(0);if(fields[1]!==undefined)x=Number(fields[1]);const w=fields[2]===undefined?size[0]:Math.abs(Number(fields[2]));if(!Number.isInteger(code)||code<0||code>65535||!Number.isInteger(x)||!Number.isInteger(w)||w<1||x<0||x+w>width)throw Error('FNT glyph map is outside the sheet.');dims(w,height);totalPixels+=w*height*palettes.length;if(totalPixels>PIXELS*2)throw Error('Font bank preview budget exceeded.');const crop=Buffer.alloc(w*height);for(let y=0;y<height;y++)pixels.copy(crop,y*w,y*width+x,y*width+x+w);indexedGlyphs[code]=uri(R.indexedSourcePng(w,height,crop,palettes[0]));palettes.forEach((p,b)=>{(glyphBanks[b]||(glyphBanks[b]={}))[code]={src:uri(R.indexedSourcePng(w,height,crop,p)),width:w,height,axisX:0,axisY:0};});x+=w;if(Object.keys(indexedGlyphs).length>512)throw Error('Font exceeds 512 glyphs.');}
 const bank=Math.max(0,Math.min(palettes.length-1,Number(options.bank)||0));return {state:'bitmap',kind:'bitmap',legacy:true,size,spacing,offset,banks:palettes.map((_,i)=>i),bank,palettes,indexedGlyphs,glyphBanks,glyphs:glyphBanks[bank]||{}};
}
function inspectFont(filename,options={}){
 const ext=path.extname(filename).toLowerCase(),bytes=readBounded(filename);let result;
 if(ext==='.fnt')result=parseLegacyFnt(bytes,options);
 else if(['.ttf','.otf'].includes(ext)){if(bytes.length<12||(!bytes.subarray(0,4).equals(Buffer.from([0,1,0,0]))&&!['OTTO','ttcf','true'].includes(bytes.toString('ascii',0,4))))throw Error('Invalid TrueType/OpenType font header.');result={state:'truetype',kind:'truetype',size:[13,27],spacing:[0,0],offset:[0,0],data:bytes.toString('base64'),banks:[0]};}
 else if(ext==='.def'){
 const doc=parseDef(bytes.toString('utf8'),filename),s=sectionMap(sections(doc,'Def')[0]);
 const ref=unquote(s.file||''),file=ref&&resolveFont(ref,filename,options.root);
 if(!file||!['.ttf','.otf','.sff'].includes(path.extname(file).toLowerCase()))throw Error('Font DEF needs an accessible TrueType or SFF asset.');
 result=inspectFont(file,{...options,settings:s});result={...result,size:pair(s.size,[8,12]),spacing:pair(s.spacing,[0,0]),offset:pair(s.offset,[0,0]),assetPath:file};
 }else if(ext==='.sff'){
 if(bytes.length>=64&&bytes[15]===2&&(bytes.readUInt32LE(40)>4096||bytes.readUInt32LE(48)>64))throw Error('Font archive exceeds the sprite or bank limit.');
 const archive=R.parseSffBuffer(bytes,filename),glyphBanks={},spriteBanks=String(options.settings?.banktype||'').toLowerCase()==='sprite';
 const sourcePalettes=archive.palettes||[];
 const paletteIndex=bank=>{const i=sourcePalettes.findIndex(p=>p.group===0&&p.number===bank);return i<0?null:i;};
 const count=spriteBanks?1:Math.max(1,sourcePalettes.length);
 let total=0;
 for(const sprite of archive.sprites){
   if(!spriteBanks&&sprite.group!==0)continue;
   const resolved=R.resolvedSprite(archive,sprite);
   const width=resolved.width,height=resolved.height;
   dims(width,height);total+=width*height*count;
   if(total>PIXELS*2)throw Error('Font glyph budget exceeded.');
   for(let b=0;b<count;b++){
     const bank=spriteBanks?sprite.group:b;
     const glyphs=glyphBanks[bank]||(glyphBanks[bank]={});
     if(Object.keys(glyphs).length>=512)throw Error('Font exceeds 512 glyphs per bank.');
     const index=paletteIndex(b),colors=sourcePalettes[index]?.colors;
     const depth=colors===256?8:colors===32?5:0;
     const override=depth&&resolved.colorDepth===depth?index:null;
     glyphs[sprite.number]={src:R.spriteDataUri(archive,sprite,override),width,height,axisX:sprite.axisX,axisY:sprite.axisY};
   }
 }
 const banks=Object.keys(glyphBanks).map(Number),requested=Number(options.bank)||0;
 const bank=spriteBanks||banks.includes(requested)?requested:0;
 result={state:'bitmap',kind:'bitmap',bankType:spriteBanks?'sprite':'palette',archiveFile:filename,archiveHash:crypto.createHash('sha256').update(bytes).digest('hex'),glyphs:glyphBanks[bank]||{},glyphBanks,banks,bank,size:[8,12],spacing:[0,0],offset:[0,0]};
 }else throw Error('Unsupported font asset.');return {...result,sourcePath:filename,filename};
}
function importFontSheet(filename,draft={}){
 const image=decodePng(readBounded(filename),{maximumPixels:PIXELS,maximumDimension:4096}),w=Number(draft.cellWidth),h=Number(draft.cellHeight),columns=Number(draft.columns)||Math.floor(image.width/w),chars=Array.from(draft.characters||'');dims(w,h);if(!Number.isInteger(columns)||columns<1||columns*w>image.width||!chars.length||chars.length>512||new Set(chars).size!==chars.length||Math.ceil(chars.length/columns)*h>image.height)throw Error('Character cells must fit the sheet and use unique characters.');const glyphs={};chars.forEach((c,i)=>{const x=i%columns*w,y=Math.floor(i/columns)*h,rgba=Buffer.alloc(w*h*4);for(let row=0;row<h;row++)image.rgba.copy(rgba,row*w*4,((y+row)*image.width+x)*4,((y+row)*image.width+x+w)*4);glyphs[c.codePointAt(0)]={src:uri(R.rgbaPng(w,h,rgba)),width:w,height:h,axisX:0,axisY:0};});return {state:'bitmap',kind:'bitmap',sourcePath:filename,size:[w,h],spacing:pair(draft.spacing,[0,0]),offset:pair(draft.offset,[0,0]),banks:[0],bank:0,glyphs,glyphBanks:{0:glyphs}};
}
function createBitmapFontOutput(preview,draft={}){
 if(preview.archiveFile){
   const bytes=readBounded(preview.archiveFile);
   if(crypto.createHash('sha256').update(bytes).digest('hex')!==preview.archiveHash)throw Error('The source font archive changed. Reopen it before saving.');
   const file=String(draft.sffFile||'font.sff');
   if(/[";\r\n]/.test(file))throw Error('Invalid font asset filename.');
   const size=pair(draft.size,preview.size),spacing=pair(draft.spacing,preview.spacing),offset=pair(draft.offset,preview.offset);
   return {sffBytes:bytes,defText:['[Def]','Type = bitmap','BankType = '+preview.bankType,'Size = '+size.join(', '),'Spacing = '+spacing.join(', '),'Offset = '+offset.join(', '),'File = '+file,''].join('\r\n')};
 }
 const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),sources={},sprites=[],indexed=preview.indexedGlyphs&&Object.keys(preview.indexedGlyphs).length===Object.keys(preview.glyphs).length,palettes=indexed?(preview.palettes||[]).map((colors,i)=>({entryId:'palette-'+i,group:0,number:i,tableOrder:'sff',colors,source:{relativePath:'palette-'+i+'.act',byteHash:hash(Buffer.from(colors.flat())),width:256,height:1}})):[];
 for(const [code,g] of Object.entries(preview.glyphs)){const png=Buffer.from((indexed?preview.indexedGlyphs[code]:g.src).split(',')[1],'base64'),decoded=decodePng(png,{maximumPixels:PIXELS}),name='glyph-'+code+'.png';sources[name]=png;let decodedHash=hash(decoded.rgba);if(indexed)decodedHash=require('./sff_png8_source').readIndexedPng8(png).decodedHash;sprites.push({entryId:'glyph-'+code,group:0,number:Number(code),axisX:g.axisX||0,axisY:g.axisY||0,colorDepth:indexed?8:32,format:indexed?'png8':'png32',compression:indexed?'png8':'png32',paletteId:indexed?'palette-0':null,source:{relativePath:name,byteHash:hash(png),decodedHash,width:g.width,height:g.height}});}
 if(!sprites.length)throw Error('No glyphs to export.');const spec=require('./sff_build_specification').createSffBuildSpecification({planId:'font-lab',sourceRoot:'font-lab',target:{archiveIdentity:'font.sff',sffVersion:'2.1'},sprites,palettes}),sffBytes=require('./sff_v21_writer').createSffV21Bytes(spec,{sources,maxPixels:PIXELS}),size=pair(draft.size||[draft.cellWidth||preview.size[0],draft.height||preview.size[1]],preview.size),spacing=pair(draft.spacing,preview.spacing),offset=pair(draft.offset,preview.offset),file=String(draft.sffFile||'font.sff');if(/[\r\n";]/.test(file))throw Error('Invalid font asset filename.');return {defText:'[Def]\r\nType = bitmap\r\nSize = '+size.join(', ')+'\r\nSpacing = '+spacing.join(', ')+'\r\nOffset = '+offset.join(', ')+'\r\nFile = '+file+'\r\n',sffBytes,sources};
}
module.exports={inspectFont,importFontSheet,createBitmapFontOutput,parseLegacyFnt,readBounded,resolveFont};

