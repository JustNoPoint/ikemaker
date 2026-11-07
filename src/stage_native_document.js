'use strict';
async function openStageNativeDocument(owner,env){
 const decode=require('./stage_clean_decode'),prior=env.nativeDocument?.(),proof=owner.payload.sourceHash===owner.payload.sourceDiskHash&&(!prior||prior.isDirty===false)?decode.captureStageCleanDecode(owner):null;
 const document=await env.api.workspace.openTextDocument(env.api.Uri.file(owner.filename));env.assertRetained();
 if(proof){const result=decode.adoptStageCleanDecode(owner,proof,document);if(result.changed){await env.adopted?.(result);env.assertRetained();await env.post({type:'stageCleanDecodeBaseline',generation:owner.generation,previousSourceHash:result.previousSourceHash,sourceHash:result.sourceHash});}}
 return document;
}
module.exports={openStageNativeDocument};
