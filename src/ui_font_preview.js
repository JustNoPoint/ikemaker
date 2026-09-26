 'use strict';
const fs=require('fs'),path=require('path');
const {parseDef,sections,sectionMap,tuple,unquote}=require('./def_model');
const {readSff,spriteDataUri}=require('./sff_reader');
function loadFontPreview(reference,motif,root){
 const resolve=(ref,owner)=>[path.resolve(path.dirname(owner),ref),root&&path.resolve(root,'font',ref),root&&path.resolve(root,ref)].filter(Boolean).find(p=>fs.existsSync(p));
 const filename=resolve(reference,motif);
 if(!filename)return {state:'approximate',reason:'Font file unavailable'};
 if(path.extname(filename).toLowerCase()!=='.def')return {state:'approximate',reason:'Legacy FNT font'};
 try{
  const document=parseDef(fs.readFileSync(filename,'utf8'),filename),settings=sectionMap(sections(document,'Def')[0]);
  if(String(settings.type).toLowerCase()!=='bitmap')return {state:'approximate',reason:'Unsupported font type'};
  const asset=resolve(unquote(settings.file||''),filename);if(!asset)return {state:'approximate',reason:'Font sprite archive unavailable'};
  const archive=readSff(asset),glyphs={};
  for(const sprite of archive.sprites.filter(s=>s.group===0&&s.number>=32&&s.number<=126))glyphs[sprite.number]={src:spriteDataUri(archive,sprite),width:sprite.width,height:sprite.height,axisX:sprite.axisX,axisY:sprite.axisY};
  if(!Object.keys(glyphs).length)return {state:'approximate',reason:'No supported glyphs'};
  return {state:'bitmap',size:tuple(settings.size||'8,12'),spacing:tuple(settings.spacing||'0,0'),offset:tuple(settings.offset||'0,0'),glyphs};
 }catch(_){return {state:'approximate',reason:'Font could not be decoded'};}
}
module.exports={loadFontPreview};
