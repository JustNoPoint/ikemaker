'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {parseDef,sections}=require('./def_model');
const {assignedPath}=require('./character_dependency_model');
const sff=require('./sff_reader'),snd=require('./snd_reader'),{indexed}=require('./palette_sprite_associations');
const MAX_ARCHIVE_BYTES=256*1024*1024,MAX_DECODE_PIXELS=64000000,MAX_DECODE_SPRITES=4096;
function auditMedia(defPath,io=fs,services={}) {
  const findings=[],files=[],archives=[],coverage=[],formats=[],root=path.resolve(defPath);
  const add=(input)=>findings.push({safe:false,endLine:input.line||0,category:'Linked media health',...input});
  const problem=(filename,code,title,message,extra={})=>add({file:filename,line:0,code,level:'warning',title,message,...(['.sff','.snd'].includes(path.extname(filename).toLowerCase())?{mediaKind:path.extname(filename).slice(1).toUpperCase()}:{}),...extra});
  let document;try{document=parseDef(io.readFileSync(root,'utf8'),root);}catch(error){problem(root,'media-owner-unreadable','Media owner could not be read',error.message);return {findings,files,archives,coverage,formats};}
  const sectionsFound=sections(document,'files');
  if(sectionsFound.length!==1){problem(root,'media-owner-ambiguous','Media assignments are not uniquely owned','Choose a character DEF with exactly one [Files] section before linking AIR, SFF and SND.');coverage.push('Linked media comparison refused: ambiguous [Files] ownership.');return {findings,files,archives,coverage,formats};}
  const declarations=sectionsFound[0].entries,assets={};
  for(const [kind,keys] of [['air',['anim','air']],['sff',['sprite','sff']],['snd',['sound','snd']]]){
    const entries=declarations.filter(entry=>keys.includes(entry.normalized)&&entry.value.trim());
    if(entries.length>1){problem(root,'media-assignment-ambiguous','Ambiguous '+kind.toUpperCase()+' assignment','Multiple '+keys.join('/')+' entries prevent choosing an exact assigned archive.',{line:entries[1].line,key:kind});coverage.push(kind.toUpperCase()+': ambiguous assignment; not inspected.');continue;}
    if(!entries.length){coverage.push(kind.toUpperCase()+': not assigned.');continue;}
    const entry=entries[0],filename=assignedPath(root,entry.value,entry.key,io);assets[kind]={filename,entry,status:'unavailable'};
    if(!filename){problem(root,'media-assignment-invalid','Invalid '+kind.toUpperCase()+' assignment','The assigned path is not a supported literal filename.',{line:entry.line,key:kind});continue;}
    try{
      if(!io.existsSync(filename)){assets[kind].status='missing';problem(root,'media-archive-missing','Assigned '+kind.toUpperCase()+' is missing',filename+'. Cross-file asset references remain unverified.',{line:entry.line,key:kind});continue;}
      if(io.statSync&&io.statSync(filename).size>MAX_ARCHIVE_BYTES)throw Error('Archive exceeds the 256 MB media-health limit.');
      const raw=io.readFileSync(filename),buffer=Buffer.isBuffer(raw)?raw:Buffer.from(raw);
      if(buffer.length>MAX_ARCHIVE_BYTES)throw Error('Archive exceeds the 256 MB media-health limit.');
      assets[kind].buffer=buffer;assets[kind].status='readable';assets[kind].hash=crypto.createHash('sha256').update(buffer).digest('hex');
      if(kind==='air')assets[kind].text=buffer.toString('utf8');
      else files.push({filename,relative:path.relative(path.dirname(root),filename),extension:'.'+kind,text:'',hash:assets[kind].hash,binary:true,findings:0});
    }catch(error){assets[kind].status='unreadable';problem(root,'media-archive-unreadable','Assigned '+kind.toUpperCase()+' could not be read',filename+': '+error.message+'. Cross-file references remain unverified.',{line:entry.line,key:kind});}
  }
  let spriteArchive=null,soundArchive=null,spriteKeys=new Map();
  if(assets.sff?.buffer){const asset=assets.sff;try{
    spriteArchive=(services.parseSffBuffer||sff.parseSffBuffer)(asset.buffer,asset.filename);asset.status='parsed';
    archives.push({kind:'SFF',filename:asset.filename,version:spriteArchive.header.version.join('.'),bytes:asset.buffer.length,sprites:spriteArchive.sprites.length,palettes:spriteArchive.palettes.length});
    for(const sprite of spriteArchive.sprites){const key=sprite.group+','+sprite.number;if(!spriteKeys.has(key))spriteKeys.set(key,[]);spriteKeys.get(key).push(sprite);if(spriteKeys.get(key).length>1)problem(asset.filename,'media-duplicate-sprite','Duplicate sprite key '+key,'Physical sprite '+sprite.index+' repeats an earlier key; AIR references are ambiguous.',{key});if(!sprite.dataSize&&sprite.link>sprite.index)problem(asset.filename,'media-forward-sprite-link','Forward sprite link '+key,'Physical sprite '+sprite.index+' links to later physical sprite '+sprite.link+'. Verify engine compatibility before saving or converting links.',{key});}
    const paletteKeys=new Map(),paletteHashes=new Map(),used=new Set(spriteArchive.sprites.filter(sprite=>(services.indexed||indexed)(spriteArchive,sprite)).map(sprite=>sprite.paletteIndex));
    for(const slot of [...used]){let at=slot;const seen=new Set();while(spriteArchive.palettes[at]&&!seen.has(at)){seen.add(at);used.add(at);const item=spriteArchive.palettes[at];if(item.dataSize||item.colorsRgba)break;at=item.link;}}
    for(const palette of spriteArchive.palettes){const key=palette.group+','+palette.number;if(paletteKeys.has(key))problem(asset.filename,'media-duplicate-palette-key','Duplicate embedded palette key '+key,'Physical palette '+palette.index+' repeats an earlier embedded key. External ACT palettes are not counted.',{key});else paletteKeys.set(key,palette.index);
      if(!palette.dataSize&&palette.link>palette.index)problem(asset.filename,'media-forward-palette-link','Forward palette link '+key,'This embedded palette links to a later physical slot. Verify the target engine behavior.',{key});
      try{const rgba=(services.paletteRgba||sff.paletteRgba)(spriteArchive,palette.index);if(!rgba)throw Error('Palette payload is missing.');const hash=crypto.createHash('sha256').update(Buffer.from(rgba.flat())).digest('hex');if(paletteHashes.has(hash))problem(asset.filename,'media-equal-embedded-palette','Equal embedded palette '+key,'Decoded colors match physical palette '+paletteHashes.get(hash)+'. This is a review-only storage suggestion; independent palette ownership may be intentional.',{key,level:'suggestion'});else paletteHashes.set(hash,palette.index);}catch(error){problem(asset.filename,'media-palette-decode','Palette '+key+' cannot be decoded',error.message,{key});}
      if(palette.group!==1&&!used.has(palette.index))problem(asset.filename,'media-unreferenced-embedded-palette','Unreferenced embedded palette '+key,'No direct sprite palette reference was found. Group 1 character palettes are excluded; code/external uses are not proven unused.',{key,level:'suggestion'});
    }
    let pixels=0,decoded=0;const decodedSources=new Set();for(const sprite of spriteArchive.sprites){let source;try{source=(services.resolvedSprite||sff.resolvedSprite)(spriteArchive,sprite);}catch(error){problem(asset.filename,'media-sprite-decode','Sprite '+sprite.group+','+sprite.number+' cannot be decoded',error.message,{key:sprite.group+','+sprite.number});continue;}const decodeKey=source.index+':'+((services.indexed||indexed)(spriteArchive,sprite)?sprite.paletteIndex:'truecolor');if(decodedSources.has(decodeKey))continue;pixels+=Math.max(0,source.width*source.height);if(decoded>=MAX_DECODE_SPRITES||pixels>MAX_DECODE_PIXELS){coverage.push('SFF pixel decode stopped at the safety budget; remaining sprites are unverified.');problem(asset.filename,'media-decode-budget','SFF decode coverage is incomplete','Only the first '+decoded+' sprites fit the bounded media-health decode budget.');break;}try{(services.spritePng||sff.spritePng)(spriteArchive,sprite);}catch(error){problem(asset.filename,'media-sprite-decode','Sprite '+sprite.group+','+sprite.number+' cannot be decoded',error.message,{key:sprite.group+','+sprite.number});}decoded++;decodedSources.add(decodeKey);}
  }catch(error){spriteArchive=null;asset.status='unreadable';problem(asset.filename,'media-sff-unreadable','SFF structure could not be read',error.message+'. AIR sprite references remain unverified.');}}
  if(assets.air?.text!==undefined){const asset=assets.air,actions=require('./air_preview_model').parseAir(asset.text);let frames=0,blank=0;
    for(const action of actions)for(let index=0;index<action.frames.length;index++){const frame=action.frames[index];frames++;if(frame.group===-1||frame.index===-1){blank++;continue;}if(!spriteArchive)continue;const key=frame.group+','+frame.index,matches=spriteKeys.get(key)||[];
      if(!matches.length)problem(asset.filename,'media-missing-sprite','Action '+action.number+', frame '+(index+1)+' references missing sprite '+key,'The exact assigned SFF was read successfully and contains no sprite with this key. No replacement or deletion is proposed.',{line:Math.max(0,frame.line-1),action:action.number,frameIndex:index,key,level:'error'});
      else if(matches.length>1)problem(asset.filename,'media-ambiguous-sprite-reference','Action '+action.number+', frame '+(index+1)+' references duplicate sprite '+key,'The assigned SFF contains '+matches.length+' physical entries with this key. Resolve ownership in the sprite viewer.',{line:Math.max(0,frame.line-1),action:action.number,frameIndex:index,key});
    }
    archives.push({kind:'AIR',filename:asset.filename,bytes:asset.buffer.length,actions:actions.length,frames,intentionalBlankFrames:blank,lineEndings:asset.text.includes('\r\n')?'CRLF':'LF',spriteReferenceCoverage:spriteArchive?'exact assigned SFF':'unverified: SFF missing, unreadable or ambiguous'});
    if(!spriteArchive)coverage.push('AIR sprite references unverified: no readable, uniquely assigned SFF.');
  }
  if(assets.snd?.buffer){const asset=assets.snd;try{
    soundArchive=(services.parseSndBuffer||snd.parseSndBuffer)(asset.buffer,asset.filename);asset.status='parsed';const groups=new Map();let durationSeconds=0;
    for(const sound of soundArchive.entries){const key=sound.group+','+sound.index,info=sound.wav;
      if(sound.duplicateOf!==null)problem(asset.filename,'media-duplicate-sound','Duplicate sound key '+key,'Physical sound '+sound.archiveIndex+' duplicates physical sound '+sound.duplicateOf+'.',{key});
      const sampleFormat=info.effectiveFormat??info.format;
      const pcm=[1,3].includes(sampleFormat);
      const packedFrameBytes=Math.ceil(info.channels*info.bitsPerSample/8);
      const alignedFrameBytes=info.channels*Math.ceil(info.bitsPerSample/8);
      const validAlignment=info.blockAlign===alignedFrameBytes||(sampleFormat===1&&info.blockAlign===packedFrameBytes);
      const consistent=info.valid&&!info.formatError&&info.dataOffset!==null&&info.channels>0&&info.sampleRate>0&&info.blockAlign>0&&info.byteRate>0&&(!pcm||(validAlignment&&info.byteRate===info.sampleRate*info.blockAlign&&info.dataSize%info.blockAlign===0));
      if(!consistent){problem(asset.filename,'media-sound-header','Sound '+key+' has an unreadable or inconsistent WAV header','A RIFF/WAVE format and data chunk, positive rate/channels/alignment, and consistent PCM frame sizes are required.',{key});continue;}
      const engineNotice=require('./wav_sample_formats').engineNotice(info);if(engineNotice)problem(asset.filename,'media-sound-engine-format','Sound '+key+' needs engine playback review',engineNotice,{key});
      const validBits=info.validBitsPerSample||info.bitsPerSample;
      const formatKey=[info.sampleRate,info.bitsPerSample,info.channels,info.format,sampleFormat,validBits,info.channelMask||0].join(':');
      const encodingLabel=pcm?require('./wav_sample_formats').label(info):'WAV format 0x'+info.format.toString(16);
      const group=groups.get(formatKey)||{sampleRate:info.sampleRate,bitsPerSample:info.bitsPerSample,channels:info.channels,formatTag:info.format,encodingLabel,channelMask:info.channelMask||0,count:0};group.count++;groups.set(formatKey,group);durationSeconds+=info.durationSeconds;
    }
    for(const issue of soundArchive.issues||[])if(!/^Duplicate sound|not a readable/.test(issue)&&!issue.includes('not a readable RIFF'))problem(asset.filename,'media-snd-structure','SND archive structure warning',issue);
    formats.push(...groups.values());archives.push({kind:'SND',filename:asset.filename,bytes:asset.buffer.length,sounds:soundArchive.entries.length,durationSeconds,formats:[...groups.values()]});
  }catch(error){asset.status='unreadable';problem(asset.filename,'media-snd-unreadable','SND structure could not be read',error.message);}}
  for(const [kind,asset] of Object.entries(assets))coverage.push(kind.toUpperCase()+': '+asset.status+'.');
  for(const file of files)file.findings=findings.filter(item=>item.file===file.filename).length;
  return {findings,files,archives,coverage,formats,owner:root};
}
module.exports={auditMedia,MAX_ARCHIVE_BYTES,MAX_DECODE_PIXELS,MAX_DECODE_SPRITES};
