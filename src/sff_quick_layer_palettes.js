'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {decodePng}=require('./palette_index_organizer_model');
const {analyzeExactMaster,materializeExactMaster}=require('./sff_master_intake');
const {transactionalWrite}=require('./mutation_safety');
const {paletteRgba,rgbaPng,spriteIndexPlane,resolvedSprite}=require('./sff_reader');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function prepareQuickLayerPalettes({buffers,provenance,archive,directory,baseGroup}){
 if(buffers.length!==provenance.length||!provenance.every(p=>p?.quickLayer))throw Error('Every named-layer source needs its exact palette choice.');
 const groups=new Map(),occupied=new Set(archive.palettes.map(p=>`${p.group},${p.number}`));
 for(let i=0;i<buffers.length;i++){
  const choice=provenance[i].quickLayer,slot=Number(choice.slot);
  if(!Number.isInteger(slot)||slot<0||slot>4||!/^master:\d+,\d+$|^own$|^true-color$/.test(choice.palette||''))throw Error('Invalid named-layer slot or palette choice.');
  if(groups.has(slot)&&groups.get(slot).choice.palette!==choice.palette)throw Error('One named layer cannot have conflicting palette choices.');
  if(!groups.has(slot))groups.set(slot,{choice,indices:[],transparencyKey:null});
  const group=groups.get(slot),key=choice.transparencyKey;
  if(choice.palette==='own' && key!==undefined){if(!Array.isArray(key)||key.length!==3||key.some(n=>!Number.isInteger(n)||n<0||n>255))throw Error('Invalid transparency key for layer '+slot);if(group.transparencyKey&&JSON.stringify(group.transparencyKey)!==JSON.stringify(key))throw Error('Layer '+slot+' has incompatible transparency keys.');group.transparencyKey=[...key];}
  group.indices.push(i);
 }
 fs.mkdirSync(directory,{recursive:true});const output=[...buffers],rows=Array(buffers.length),palettes=[],review=[];
 for(const [slot,{choice,indices,transparencyKey}] of groups){
  let colors,paletteId=null,reused=false,exact;
  if(choice.palette.startsWith('master:')){
   paletteId=choice.palette.slice(7);const matches=archive.palettes.filter(p=>`${p.group},${p.number}`===paletteId);
   if(matches.length!==1)throw Error('Named layer master palette '+paletteId+' is missing or ambiguous.');colors=paletteRgba(archive,matches[0].index);
  }else if(choice.palette==='own'){
   const visible=new Map();for(const index of indices){const image=decodePng(buffers[index]);for(let at=0;at<image.rgba.length;at+=4){const c=[...image.rgba.subarray(at,at+4)];if(c[3])visible.set(c.join(','),c);}}
   if(visible.size>255)throw Error('Layer '+slot+' needs '+visible.size+' visible colors. Choose True Color or reduce this layer before importing.');
   // The reserved group plus exclusive use by this exact sprite bank proves
   // compatibility. Only previously used indexes are eligible: a baked archive
   // may have written silhouette ink into an otherwise unused palette slot.
   const expectedGroup=Number(baseGroup)+10000*slot;
   for(const candidate of archive.palettes.filter(p=>p.group===65000+slot)){
     if(archive.palettes.filter(p=>p.group===candidate.group&&p.number===candidate.number).length!==1)continue;
     const owners=archive.sprites.filter(sprite=>sprite.paletteIndex===candidate.index);
     if(!owners.length||owners.some(sprite=>sprite.group!==expectedGroup||![5,8].includes(resolvedSprite(archive,sprite).colorDepth)))continue;
     const used=new Set();for(const sprite of owners)for(const index of spriteIndexPlane(archive,sprite).indices)if(index)used.add(index);
     const table=paletteRgba(archive,candidate.index);
     if(transparencyKey&&table[0].slice(0,3).some((channel,index)=>channel!==transparencyKey[index]))continue;
     const eligible=table.map((color,index)=>index===0||used.has(index)?color:[0,0,0,0]);
     try{const plan=analyzeExactMaster(indices.map(index=>buffers[index]),eligible);exact=materializeExactMaster(plan).map((buffer,i)=>{
       // Materialize again with the complete retained table, using the proved
       // unique assignments, so every old palette index and reserved ink stays.
       const full=analyzeExactMaster([buffers[indices[i]]],table),decisions={};
       for(const row of plan.rows)if(row.candidates.length===1)decisions[row.id]=row.candidates[0];
       return materializeExactMaster(full,decisions)[0];
     });colors=table;paletteId=`${candidate.group},${candidate.number}`;reused=true;break;}catch(_){/* A missing or ambiguous exact color requires a fresh layer table. */}
   }
   if(!reused){
   colors=[[...(transparencyKey||[0,0,0]),0],...visible.values()];while(colors.length<256)colors.push([0,0,0,0]);
   let number=0;while(occupied.has(`${65000+slot},${number}`))number++;if(number>65535)throw Error('No palette identity is available.');paletteId=`${65000+slot},${number}`;occupied.add(paletteId);
   const act=Buffer.from(colors.flatMap(c=>c.slice(0,3))),filename=path.join(directory,'layer-'+slot+'-'+sha(act)+'.act');if(!fs.existsSync(filename))transactionalWrite(fs,filename,act,{allowExisting:false,backup:false,journal:false,label:'private-quick-layer-palette'});
   palettes.push({id:paletteId,group:65000+slot,number,path:filename,byteHash:sha(act).toUpperCase(),alphaTable:colors.map(c=>c[3]),tableOrder:'index'});
   }
  }
  let changedPixels=0;
  if(colors&&!exact){try{const plan=analyzeExactMaster(indices.map(index=>buffers[index]),colors);exact=materializeExactMaster(plan);}catch(error){throw Error('Layer '+slot+': '+error.message);}}
  for(const [ordinal,index] of indices.entries()){
   if(colors){output[index]=exact[ordinal];}
   else {const image=decodePng(buffers[index]);output[index]=rgbaPng(image.width,image.height,image.rgba);}
   rows[index]={paletteId,paletteChoice:colors?'own-png-palette':'true-color',slot};
  }
  review.push({slot,choice:choice.palette,paletteId,sourceCount:indices.length,transparencyKey,reused,visibleChangedPixels:changedPixels});
 }
 return {buffers:output,rows,palettes,review};
}
module.exports={prepareQuickLayerPalettes};
