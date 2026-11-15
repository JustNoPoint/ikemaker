'use strict';
const path=require('path');
const kinds={Sff:'.sff',Air:'.air',Snd:'.snd',Def:'.def'};
function reference(value) {
  const result={};
  for(const field of ['physicalIndex','archiveIndex','group','number','frameIndex'])
    if(Number.isSafeInteger(value?.[field])) result[field]=value[field];
  return result;
}
function encodeSession(filename,tabs) {
  const base=path.dirname(filename);
  if(!tabs.length||tabs.length>128)throw Error('Choose a workspace with 1 through 128 tabs.');
  const rows=tabs.map(tab=>{
    const absolute=path.resolve(tab.file);
    const relative=path.relative(base,absolute).replace(/\\/g,'/');
    const fields=value=>tab.kind==='Palette'?{Palettes:[value]}:{[tab.kind]:value};
    return {
      ...fields(absolute),
      ...(path.isAbsolute(relative)?{}:{IKeMakerRelative:fields(relative)}),
      ...(tab.name?{Name:tab.name}:{}),
      Selection:reference(tab.selection)
    };
  });
  return JSON.stringify({Version:1,ActiveTab:Math.max(0,tabs.findIndex(tab=>tab.active)),Tabs:rows},null,2)+'\n';
}
function decodeSession(filename,bytes,onInvalidEntry,exists) {
  if(bytes.length>1048576)throw Error('Workspace file exceeds 1 MB.');
  const data=JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));
  if(data.Version!==1||!Array.isArray(data.Tabs)||!data.Tabs.length||data.Tabs.length>128)throw Error('Invalid workspace version or tab count.');
  const files=[];
  for(const [order,tab] of data.Tabs.entries()){
    const invalid=message=>{
      if(!onInvalidEntry)throw Error(message);
      onInvalidEntry('Tab '+(order+1)+': '+message);
    };
    if(!tab||typeof tab!=='object'||Array.isArray(tab)){invalid('Invalid workspace tab.');continue;}
    const readPath=(kind,text,index)=>{
      if(typeof text!=='string'||!text.trim()||text.includes('\0'))throw Error('Invalid media path in tab '+(order+1)+'.');
      const relative=kind==='Palette'?tab.IKeMakerRelative?.Palettes?.[index]:tab.IKeMakerRelative?.[kind];
      if(relative!==undefined && (typeof relative!=='string'||!relative.trim()||relative.includes('\0')||path.isAbsolute(relative)))
        throw Error('Invalid relative media path in tab '+(order+1)+'.');
      const portable=path.resolve(path.dirname(filename),relative??text);
      const useOriginal=exists && relative!==undefined && path.isAbsolute(text) &&
        path.extname(text).toLowerCase()===path.extname(portable).toLowerCase() &&
        !exists(portable) && exists(text);
      const file=useOriginal?path.normalize(text):portable;
      if(kind!=='Palette'&&path.extname(file).toLowerCase()!==kinds[kind] && !(kind==='Air'&&path.extname(file).toLowerCase()==='.def'))throw Error('Unexpected '+kind+' extension in tab '+(order+1)+'.');
      if(kind==='Palette'&&!/\.(act|pal|rgba|png|pcx|ikpalette\.json)$/i.test(file))throw Error('Unexpected palette file extension.');
      files.push({kind,file,selection:reference(tab.Selection),order,active:order===data.ActiveTab});
    };
    const add=(kind,text,index)=>{
      try{readPath(kind,text,index);}catch(error){invalid(error.message);}
    };
    const hasFile = ['Def','Sff','Air','Snd'].some(kind=>tab[kind]!=null);
    if(!hasFile && (tab.Palettes==null || Array.isArray(tab.Palettes) && !tab.Palettes.length)){
      invalid('This tab contains no supported files.');
      continue;
    }
    if(tab.Def!=null)add('Def',tab.Def);
    else {
      for(const kind of ['Sff','Air','Snd'])if(tab[kind]!=null)add(kind,tab[kind]);
      if(tab.Palettes!=null&&!Array.isArray(tab.Palettes))invalid('Invalid palette list.');
      else (tab.Palettes||[]).forEach((p,index)=>add('Palette',p,index));
    }
  }
  if(!files.length||files.length>512)throw Error('Workspace contains no supported files or exceeds 512 files.');
  return files;
}
module.exports={encodeSession,decodeSession,reference};
