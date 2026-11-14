'use strict';
const fs=require('node:fs'),path=require('node:path'),{hash}=require('./mutation_safety'),{stageDiskEdit}=require('./stage_source_representation'),{parseDef}=require('./def_model');
const proofs=new WeakMap(),key=file=>path.resolve(file).toLowerCase();
function fileIdentity(file,io){const stat=io.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink())throw Error('Clean Stage decoding requires the same regular source file.');return [io.realpathSync(file),stat.dev,stat.ino,stat.size,stat.mtimeMs,stat.ctimeMs,stat.birthtimeMs];}
function readStable(file,io){const before=fileIdentity(file,io),raw=io.readFileSync(file);if(JSON.stringify(before)!==JSON.stringify(fileIdentity(file,io)))throw Error('Stage disk identity changed while reading its clean decoding proof.');return {identity:before,raw};}
function captureStageCleanDecode(owner,io=fs){
 if(owner.disposed||owner.invalidated||!owner.panel?.active)throw Error('Activate the owning Stage before capturing its decoding proof.');
 const disk=readStable(owner.filename,io),diskHash=hash(disk.raw),payload=owner.payload;
 if(payload.sourceDiskHash!==diskHash||payload.sourceHash!==diskHash)throw Error('Stage source or disk bytes changed before clean decoding.');
 const proof=Object.freeze({filename:owner.filename,sourceHash:payload.sourceHash,diskHash});
 proofs.set(proof,{owner,panel:owner.panel,payload,model:payload.model,filename:owner.filename,generation:owner.generation,selected:owner.selected,selection:JSON.stringify(owner.selectedIndices),sourceHash:payload.sourceHash,diskHash,identity:disk.identity,raw:Buffer.from(disk.raw)});return proof;
}
function adoptStageCleanDecode(owner,proof,document,io=fs){
 const record=proofs.get(proof),current=()=>record&&record.owner===owner&&!owner.disposed&&!owner.invalidated&&owner.panel===record.panel&&owner.panel.active&&owner.payload===record.payload&&owner.payload.model===record.model&&owner.filename===record.filename&&owner.generation===record.generation&&owner.selected===record.selected&&JSON.stringify(owner.selectedIndices)===record.selection&&owner.payload.sourceHash===record.sourceHash&&owner.payload.sourceDiskHash===record.diskHash;
 if(!current())throw Error('Stage ownership, source or selection changed during clean decoding.');
 if(!document||document.isClosed||document.isDirty!==false||key(document.fileName)!==key(record.filename)||document.uri?.fsPath&&key(document.uri.fsPath)!==key(record.filename))throw Error('Clean decoding needs the exact clean native Stage document.');
 const version=document.version,text=document.getText(),disk=readStable(record.filename,io);
 if(JSON.stringify(disk.identity)!==JSON.stringify(record.identity)||hash(disk.raw)!==record.diskHash||!disk.raw.equals(record.raw))throw Error('Stage disk bytes or identity changed during clean decoding.');
 // Reuse the mutation path's strict UTF-8/BOM/EOL equivalence proof. Reopening
 // clean text must reproduce the original bytes exactly, not accept edits.
 if(!stageDiskEdit(disk.raw,text,text).equals(disk.raw))throw Error('Native Stage text differs beyond clean decoding.');
 if(JSON.stringify(parseDef(record.raw.toString('utf8')).sections)!==JSON.stringify(parseDef(text).sections))throw Error('Native decoding changed Stage source structure or line coordinates. Refresh the Stage.');
 if(!current()||document.isDirty||document.isClosed||document.version!==version||document.getText()!==text)throw Error('Stage or native text changed while proving clean decoding.');
 const sourceHash=hash(text),changed=sourceHash!==record.sourceHash;
 owner.payload.sourceHash=sourceHash;proofs.delete(proof);
 return {changed,previousSourceHash:record.sourceHash,sourceHash,sourceDiskHash:record.diskHash,documentVersion:version};
}
module.exports={captureStageCleanDecode,adoptStageCleanDecode};
