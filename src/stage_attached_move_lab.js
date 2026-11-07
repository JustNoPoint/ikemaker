'use strict';
const crypto=require('node:crypto'),path=require('node:path');
const returns=new Map(),key=file=>path.resolve(file).toLowerCase();
function createStageReturn(binding,ownerDef,filename){const token=crypto.randomBytes(18).toString('hex'),reference={kind:filename?'stage-sound':'stage',token},entry={kind:reference.kind,ownerDef,filename,current:()=>{try{return binding.isRetainedCurrent();}catch{return false;}},reveal:()=>binding.returnToStage()};returns.set(token,entry);binding.onDispose?.(()=>returns.delete(token));return reference;}
function disposeStageReturn(reference){returns.delete(reference?.token);}
function isStageReturn(reference,ownerDef,filename){const entry=returns.get(reference?.token);return !!entry&&entry.kind===reference?.kind&&key(entry.ownerDef)===key(ownerDef)&&(!entry.filename||!!filename&&key(entry.filename)===key(filename))&&entry.current();}
async function returnToStage(reference,ownerDef,filename){const entry=returns.get(reference?.token);if(!isStageReturn(reference,ownerDef,filename))return false;await entry.reveal();return entry.current();}
async function openAttachedMoveLab(api,binding,attached,services={}){
 if(!binding.isCurrent()||!attached?.ownerDef||!services.sourceCurrent(attached.target))return false;
 const reference=createStageReturn(binding,attached.ownerDef),token=reference.token,entry=returns.get(token);let panel;
 try{panel=await api.commands.executeCommand('ikemen.moveLab.open',api.Uri.file(attached.ownerDef),{preset:true,reference:{defPath:attached.ownerDef,mode:'code',returnTo:reference}});if(!panel||!entry.current()){returns.delete(token);return false;}panel.onDidDispose?.(()=>returns.delete(token));binding.onDispose?.(()=>returns.delete(token));return true;}catch(error){returns.delete(token);throw error;}
}
module.exports={isStageReturn,returnToStage,createStageReturn,disposeStageReturn,openAttachedMoveLab};
