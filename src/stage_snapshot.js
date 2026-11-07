'use strict';
// A bounded, immutable review snapshot. All destination writes belong to a fresh
// disposable root; source paths are never destinations.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {parseDef,unquote}=require('./def_model');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const inside=(root,file)=>{const rel=path.relative(root,file);return rel!==''&&!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel)};
function snapshotStage({root,filename,sourceText,documents=[],maxFiles=512,maxBytes=256*1024*1024}){
 root=fs.realpathSync(root);filename=fs.realpathSync(filename);
 if(!inside(root,filename))throw Error('Stage must be inside the declared project root.');
 const drafts=new Map(documents.map(d=>[path.resolve(d.filename).toLowerCase(),Buffer.isBuffer(d.bytes)?Buffer.from(d.bytes):Buffer.from(d.text,'utf8')]));
 if(sourceText!==undefined)drafts.set(filename.toLowerCase(),Buffer.from(sourceText,'utf8'));
 const files=[],visited=new Map();let total=0,diskTotal=0;
 function resolve(owner,reference,role,defaultDirectory=''){
  reference=unquote(reference).replace(/\\/g,'/');
  if(!reference||/[\x00-\x1f]/.test(reference)||path.isAbsolute(reference)||/^[a-z]+:/i.test(reference))throw Error('Unsafe or unresolved dependency: '+reference);
  const candidates=[path.dirname(owner),root,path.join(root,'data')].flatMap(base=>{const direct=path.resolve(base,reference);return defaultDirectory&&!reference.toLowerCase().startsWith(defaultDirectory.toLowerCase()+'/')?[direct,path.resolve(base,defaultDirectory,reference)]:[direct]});
  // Compiler fallback searches every original CNS location before any .zss
  // alternative. Preserve that order when both forms exist.
  for(const candidate of role==='code'?[...candidates,...candidates.map(file=>file+'.zss')]:candidates){if(!inside(root,candidate))continue;if(fs.existsSync(candidate)&&fs.statSync(candidate).isFile()){const real=fs.realpathSync(candidate);if(!inside(root,real))throw Error('Dependency symlink escapes the declared project root: '+reference);return real;}}
  throw Error('Unresolved declared dependency '+reference+' in '+path.relative(root,owner));
 }
 function visit(file,role){
  const key=file.toLowerCase();if(visited.has(key))return visited.get(key);
  if(files.length>=maxFiles)throw Error('Disposable dependency graph exceeds file budget.');
  const diskBytes=fs.statSync(file).size;
  if(diskBytes>maxBytes-diskTotal||(drafts.has(key)&&drafts.get(key).length>maxBytes-total))throw Error('Disposable dependency graph exceeds byte budget.');diskTotal+=diskBytes;
  const disk=fs.readFileSync(file),bytes=drafts.get(key)||disk;total+=bytes.length;if(total>maxBytes)throw Error('Disposable dependency graph exceeds byte budget.');
  const node={filename:file,relative:path.relative(root,file).replace(/\\/g,'/'),role,bytes:Buffer.from(bytes),sha256:sha(bytes),diskSha256:sha(disk),diskBytes,dirty:sha(bytes)!==sha(disk),references:[]};visited.set(key,node);files.push(node);
  if(!/\.(?:def|cns|cmd|zss|st|air|const)$/i.test(file))return node;
  const text=bytes.toString('utf8');if(text.includes('\ufffd'))throw Error('Dependency source must be valid UTF-8: '+node.relative);
  const doc=parseDef(text,file);
  for(const section of doc.sections)for(const entry of section.entries){
   let nextRole='';const k=entry.normalized,s=section.normalized.replace(/^[a-z]{2}\./,'');
   if(role==='stage'){
    if(s==='info'&&/^round\d+def$/.test(k))nextRole='stage';
    else if(s==='info'&&require('./stage_attached_declarations').isAttachedDeclaration(k))nextRole='character';
    else if(s==='bgdef'&&k==='spr')nextRole='binary';
    else if(s==='bgdef'&&['model','environment'].includes(k)&&unquote(entry.value))throw Error('3D external resource graph is unresolved; disposable rebuild refused.');
    else if(/^bg(?:\s|$)/.test(s)&&['video','shader'].includes(k)&&unquote(entry.value))throw Error('Video/shader resource graph is unresolved; disposable rebuild refused.');
    else if(s==='music'&&/^bgmusic\d*$/.test(k))nextRole='binary';
   }else if(role==='character'&&s==='files'&&/^(?:cmd|cns|st\d*|stcommon|common|sprite|anim|sound|pal\d+|font\d+|movelist\d*)$/.test(k))nextRole=/^(?:sprite|sound|pal\d+|font\d+|movelist\d*)$/.test(k)?'binary':'code';
   if(role==='character'&&s==='shaders'&&unquote(entry.value))throw Error('Attached-character shader resource graph is unresolved.');
   if(nextRole&&unquote(entry.value)){const reference=/^font\d+$/.test(k)?entry.value.split(',')[0]:entry.value,defaultDirectory=role==='stage'&&s==='info'?'stages':/^font\d+$/.test(k)?'font':'',dependency=resolve(file,reference,nextRole,defaultDirectory),child=visit(dependency,nextRole);node.references.push({line:entry.line,key:k,target:child.relative});}
  }
  for(const match of text.matchAll(/^\s*#include\s+["']([^"']+)["']/gm)){const child=visit(resolve(file,match[1],'code'),'code');node.references.push({include:match[1],target:child.relative});}
  // Includes are preserved by retaining the project tree. Dynamic Lua/file loads
  // cannot be inferred as a complete graph and must be explicitly resolved first.
  if(/\b(?:dofile|loadfile|require)\s*\(/.test(text))throw Error('Dynamic script dependency is unresolved in '+node.relative);
  return node;
 }
 const stage=visit(filename,'stage');
 const digest=sha(Buffer.from(files.map(f=>f.relative+'\0'+f.sha256).join('\n')));
 return{root,filename,stage:stage.relative,files,totalBytes:total,digest,dirty:files.filter(f=>f.dirty).map(f=>f.relative)};
}
function verifySnapshot(snapshot,{documents=[]}={}){
 validateSnapshot(snapshot);
 const drafts=new Map(documents.map(d=>[path.resolve(d.filename).toLowerCase(),Buffer.isBuffer(d.bytes)?d.bytes:Buffer.from(d.text,'utf8')]));
 for(const file of snapshot.files){if(fs.statSync(file.filename).size!==file.diskBytes||sha(fs.readFileSync(file.filename))!==file.diskSha256)throw Error('Dependency changed after review: '+file.relative);const draft=drafts.get(file.filename.toLowerCase());if(file.dirty&&!draft)throw Error('Reviewed dirty dependency is no longer available: '+file.relative);if(draft&&sha(draft)!==file.sha256)throw Error('Dependency draft changed after review: '+file.relative);}
 return true;
}
function validateSnapshot(snapshot){
 if(!snapshot||!Array.isArray(snapshot.files)||sha(Buffer.from(snapshot.files.map(f=>f.relative+'\0'+f.sha256).join('\n')))!==snapshot.digest||snapshot.files.some(f=>sha(f.bytes)!==f.sha256))throw Error('Reviewed snapshot bytes or identity changed.');
}
function writeSnapshot(snapshot,directory){
 validateSnapshot(snapshot);
 directory=fs.realpathSync(directory);if(directory===snapshot.root||inside(snapshot.root,directory))throw Error('Disposable copy must be outside the project.');
 for(const file of snapshot.files){const target=path.resolve(directory,file.relative);if(!inside(directory,target))throw Error('Snapshot target escaped disposable root.');fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,file.bytes,{flag:'wx'});}
 return path.join(directory,snapshot.stage);
}
module.exports={snapshotStage,verifySnapshot,validateSnapshot,writeSnapshot,inside,sha};
