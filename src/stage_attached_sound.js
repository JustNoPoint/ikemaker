'use strict';
const returns=require('./stage_attached_move_lab');
async function openAttachedSound(api,binding,{ownerDef,filename,column}){
 if(!binding.isRetainedCurrent())return false;const reference=returns.createStageReturn(binding,ownerDef,filename);
 try{const panel=await api.commands.executeCommand('snd.openViewer',api.Uri.file(filename),column,undefined,undefined,{ownerDefs:[ownerDef],stageReturn:{reference,ownerDef,filename}});if(!panel||!returns.isStageReturn(reference,ownerDef,filename)){returns.disposeStageReturn(reference);return false;}panel.onDidDispose?.(()=>returns.disposeStageReturn(reference));return panel;}catch(error){returns.disposeStageReturn(reference);throw error;}
}
function available(session,filename){const record=session?.stageReturn;return session?.transferPinned!==true&&!!record&&(session.ownerDefs||[]).some(owner=>require('node:path').resolve(owner).toLowerCase()===require('node:path').resolve(record.ownerDef).toLowerCase())&&returns.isStageReturn(record.reference,record.ownerDef,filename);}
async function returnFromSound(session,filename){const record=session?.stageReturn;return available(session,filename)?returns.returnToStage(record.reference,record.ownerDef,filename):false;}
module.exports={openAttachedSound,available,returnFromSound};
