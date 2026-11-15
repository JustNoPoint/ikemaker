'use strict';
const path=require('path');
const store=require('./preview_layers_store');
const {normalizePreviewLayers}=require('./preview_layers_model');
const panels=new Map();
const ids=['base','layer1','layer2','layer3','layer4'];
const validOrder=o=>Array.isArray(o)&&o.length===5&&ids.every(id=>o.includes(id));
const key=file=>process.platform==='win32'?path.resolve(file).toLowerCase():path.resolve(file);
function read(file){
  const saved=store.loadPreviewLayers(file,'linked',path.dirname(file));
  return {key:key(file),slots:saved?.slots||{},order:saved?.order||null,frames:saved?.frames||{}};
}
function bind(panel,file,local){
  if(!file||!panel?.webview)return null;
  if(!panels.has(panel))panel.onDidDispose?.(()=>panels.delete(panel));
  panels.set(panel,{key:key(file),local:normalizePreviewLayers(local)});
  return read(file);
}
function write(file,layout,focusSlot){
  store.savePreviewLayers(file,'linked',layout,path.dirname(file));
  for(const [panel,entry] of panels)if(entry.key===layout.key)panel.webview.postMessage({type:'sharedLayerLayout',layout,focusSlot});
}
function linkBank(file,bank,name){
  if(!Number.isInteger(bank)||bank<1||bank>6)throw Error('Invalid sprite bank.');
  const layout=read(file),local=[...panels.values()].filter(p=>p.key===layout.key).flatMap(p=>p.local.layers);
  const slots=ids.slice(1);
  let id=slots.find(id=>layout.slots[id]?.bank===bank)||slots.find(id=>local.some(l=>l.id===id&&l.enabled&&l.source.kind==='bank'&&l.source.bank===bank));
  if(!id)id=slots.find(id=>!layout.slots[id]?.enabled&&!local.some(l=>l.id===id&&l.enabled));
  if(!id)throw Error('All four overlay slots are occupied. Remove a layer before loading another bank.');
  const active=slots.filter(s=>s!==id&&(layout.slots[s]?.enabled||local.some(l=>l.id===s&&l.enabled)));
  if(!layout.slots[id]?.enabled){
    const stack=layout.order||[...ids];
    const insert=order=>{
      const result=order.filter(s=>s!==id);
      const front=result.filter(s=>s==='base'||active.includes(s)).at(-1);
      result.splice(result.indexOf(front)+1,0,id);return result;
    };
    layout.order=insert(stack);
    for(const frame of Object.keys(layout.frames))layout.frames[frame]=insert(layout.frames[frame]);
  }
  layout.slots[id]={bank,enabled:true,visible:true,followBasePalette:layout.slots[id]?.bank!==bank||layout.slots[id].followBasePalette!==false,name:name||''};
  write(file,layout,id);
  return id;
}
function saveChanges(panel,file,value,edits){
  const entry=panels.get(panel);if(!file||entry?.key!==key(file))return;
  entry.local=value;
  if(!Array.isArray(edits)||!edits.length)return;
  const layout=read(file);
  for(const id of ids.slice(1).filter(id=>edits.includes(id))){
    const l=value.layers.find(l=>l.id===id);
    if(l.source.kind==='bank'&&l.source.bank>0&&(l.enabled||layout.slots[id])){
      layout.slots[id]={bank:l.source.bank,enabled:l.enabled,visible:l.visible,followBasePalette:l.followBasePalette!==false,name:l.displayName};
    }else if(layout.slots[id])layout.slots[id]={...layout.slots[id],enabled:false,visible:false};
  }
  write(file,layout);
}
async function reorder(api,panel,file,message){
  const binding=panels.get(panel);if(!file||binding?.key!==key(file)||!validOrder(message.order))return;
  const frame=/^\d{1,5},\d{1,5}$/.test(message.frame)?message.frame:null;
  const options=[{label:'All frames',detail:'Use this order throughout the SFF and AIR.'}];
  if(frame)options.push({label:'Only this sprite frame',detail:'Use this order wherever sprite '+frame+' appears in either viewer.',frame});
  const picked=await api.window.showQuickPick(options,{title:'Apply layer order to…'});
  if(!picked||panels.get(panel)?.key!==binding.key)return;
  const layout=read(file);
  if(picked.frame)layout.frames[frame]=message.order;
  else {layout.order=message.order;layout.frames={};}
  write(file,layout);
}
module.exports={bind,linkBank,saveChanges,reorder};
