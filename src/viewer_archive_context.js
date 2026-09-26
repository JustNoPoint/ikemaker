'use strict';
const path=require('path');
const KEY='ikemaker.viewerArchiveContexts.v1';
const key=file=>path.resolve(file).toLowerCase();
function createStore(storage,resolve) {
  let records=storage?.get(KEY,{})||{},writing=Promise.resolve();
  function restore(filename) {
    const saved=records[key(filename)];if(!saved)return undefined;
    const context={ownerDef:saved.ownerDef,prefix:saved.prefix};
    if(typeof context.ownerDef!=='string'||typeof context.prefix!=='string')return undefined;
    if(saved.manual)return {...context,record:{[path.extname(filename).slice(1).toLowerCase()]:filename,source:'Archive selected manually'}};
    try{
      const record=resolve(context.ownerDef,context.prefix,path.extname(filename).slice(1).toLowerCase()).find(record=>key(record[path.extname(filename).slice(1).toLowerCase()])===key(filename));
      if(record)return {...context,record};
    }catch{}
    return {...context,invalid:true,record:{source:'The saved shared archive no longer matches the current configuration. Open a source reference to choose its context again.'}};
  }
  function remember(filename,context) {
    const identity=key(filename);
    const saved=context?{ownerDef:context.ownerDef,prefix:context.prefix,manual:context.record?.source==='Archive selected manually'}:undefined;
    writing=writing.catch(()=>{}).then(async()=>{
      const next={...records};if(saved)next[identity]=saved;else delete next[identity];
      if(storage)await storage.update(KEY,next);records=next;
    });
    return writing;
  }
  return {restore,remember};
}
module.exports={createStore};
