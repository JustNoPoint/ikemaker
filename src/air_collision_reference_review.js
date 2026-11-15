'use strict';
const fs=require('fs'),path=require('path'),{hash}=require('./mutation_safety');
function snapshot(filename,vscode,io=fs) {
  const absolute=path.resolve(filename),document=(vscode.workspace.textDocuments||[]).find(doc=>!doc.isClosed&&path.resolve(doc.fileName).toLowerCase()===absolute.toLowerCase());
  const text=document?document.getText():(()=>{if(io.statSync(absolute).size>1024*1024)throw Error('Assigned source exceeds the 1 MB review limit.');return io.readFileSync(absolute,'utf8');})();
  return {filename:absolute,text,hash:hash(text),version:document?.version??null,dirty:document?.isDirty===true};
}
function capture(session,vscode,io=fs) {
  const snapshots=[],references=[],unavailable=[];let paths=[...(session.sourcePaths||[])],owner=null;
  if(session.defPath){try{owner=snapshot(session.defPath,vscode,io);snapshots.push(owner);paths.push(...require('./exact_state_sources').exactStateSources(session.defPath,owner.text,io));}catch(error){unavailable.push(session.defPath+': '+error.message);}}
  const unique=[...new Map(paths.map(filename=>[path.resolve(filename).toLowerCase(),filename])).values()];
  if(unique.length>512)throw Error('Assigned source inventory exceeds the 512-file review limit.');let bytes=0;
  for(const filename of unique){try{const source=snapshot(filename,vscode,io);bytes+=Buffer.byteLength(source.text);if(bytes>8*1024*1024)throw Error('Assigned source inventory exceeds the 8 MB review limit.');snapshots.push(source);source.text.split(/\r?\n/).forEach((line,index)=>{if(!/^\s*(?:;|#|\/\/)/.test(line)&&/\b(?:ClsnVar|ClsnOverlap|ClsnTransform|Clsn1|Clsn2)\b/i.test(line.split(';')[0]))references.push({filename:source.filename,line:index+1,text:line.trim().slice(0,240)});});}catch(error){unavailable.push(filename+': '+error.message);}}
  const complete=!!owner&&!unavailable.length;
  return {snapshots,references,complete,referenceStatus:complete?'Assigned code inventory inspected; no index-sensitive collision references found. Runtime/dynamic use outside assigned sources is not inferred.':(unavailable.length?unavailable.join('\n'):'No exact character DEF assigned; references remain unverified.')};
}
function validate(review,vscode,io=fs) {
  for(const prior of review.snapshots){let current;try{current=snapshot(prior.filename,vscode,io);}catch(_){throw Error('Assigned collision-reference source became unavailable during review. Nothing was applied.');}if(current.hash!==prior.hash||current.version!==prior.version||current.dirty!==prior.dirty)throw Error('Assigned collision-reference source changed during review. Nothing was applied.');}
}
module.exports={snapshot,capture,validate};
