'use strict';
const path=require('path');
const storeKey='ikemaker.copiedLayerLinks.v1';
let store;
const ownerKey=file=>process.platform==='win32'?path.resolve(file).toLowerCase():path.resolve(file);
function activate(state){store=state;}
function locations(owner){return owner&&store?(store.get('ikemaker.locatedLayerLinks.v1',{})[ownerKey(owner)]||[]).filter(f=>typeof f==='string'):[];}
function locate(owner,file){
  if(!owner||!store)return;
  writing=writing.catch(()=>{}).then(async()=>{
    const all=store.get('ikemaker.locatedLayerLinks.v1',{}),key=ownerKey(owner);
    await store.update('ikemaker.locatedLayerLinks.v1',{...all,[key]:[...new Set([...(all[key]||[]),path.resolve(file)])]});
  });
  return writing;
}
function pending(owner,installed){
  if(!store||!owner)return [];
  const rows=store.get(storeKey,{})[ownerKey(owner)]||[];
  return rows.filter(row=>!installed.some(item=>item.tool==='layer'&&item.id===row.id&&item.role===row.role));
}
let writing=Promise.resolve();
function remember(owner,parts){
  if(!owner||!store)return;
  const rows=parts.flatMap(({source,patch})=>{
    if(!patch.code)return [];
    return require('./authoring_links_workspace').legacyLinks(patch.code).map(({id,label,role})=>({id,label,role,expected:path.basename(source.document.fileName)}));
  });
  writing=writing.catch(()=>{}).then(async()=>{
    const all=store.get(storeKey,{}),key=ownerKey(owner),list=all[key]||[];
    const unique=new Map([...list,...rows].map(row=>[row.id+'/'+row.role,row]));
    await store.update(storeKey,{...all,[key]:[...unique.values()]});
  });
  return writing;
}
module.exports={activate,remember,pending,locate,locations};
