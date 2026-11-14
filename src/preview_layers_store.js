'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {transactionalWrite,hash}=require('./mutation_safety');
const {sealedRoot,assertSafeAncestors,contained}=require('./palette_domain_registry');
function location(filename,surface,root) {
  if(!['sff','air'].includes(surface))throw Error('Unknown preview layer surface.');
  root=sealedRoot(root||path.dirname(filename));
  if(!contained(root,path.resolve(filename)))throw Error('Preview layer asset is outside its owning project root.');
  const key=surface+':'+path.relative(root,path.resolve(filename)).replace(/\\/g,'/');
  const digest=crypto.createHash('sha256').update(key).digest('hex');
  return {file:path.join(root,'.ikemen-tools','preview-layers',digest+'.json'),legacy:path.join(root,'.ikemen-tools','preview-layers.json'),key};
}
function loadPreviewLayers(filename,surface,root) {
  try{const target=location(filename,surface,root);assertSafeAncestors(root||path.dirname(filename),target.file);assertSafeAncestors(root||path.dirname(filename),target.legacy);if(fs.existsSync(target.file))return JSON.parse(fs.readFileSync(target.file,'utf8')).value;return JSON.parse(fs.readFileSync(target.legacy,'utf8')).entries?.[target.key]||null}catch(_){return null}
}
function savePreviewLayers(filename,surface,value,root) {
  const target=location(filename,surface,root),store={version:1,key:target.key,value:JSON.parse(JSON.stringify(value))};
  assertSafeAncestors(root||path.dirname(filename),target.file);
  const expectedHash=hash(fs.existsSync(target.file)?fs.readFileSync(target.file):Buffer.alloc(0));
  transactionalWrite(fs,target.file,JSON.stringify(store,null,2)+'\n',{expectedHash,allowExisting:true,label:'preview-layers'});
  return value;
}
module.exports={loadPreviewLayers,savePreviewLayers};
