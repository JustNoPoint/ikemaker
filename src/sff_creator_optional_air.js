'use strict';
// SFF completion is authoritative independently of this optional, separately
// reviewed AIR operation. An AIR refusal must never imply the SFF was rolled back.
async function reviewOptionalAirAfterBuild(api, draft, completed, dependencies = {}) {
  if(draft?.configuration?.gifAirAfterBuild!==true)return{requested:false};
  const helper=dependencies.helper||require('./sff_guided_gif_air');
  if(completed?.applied===false){
    const reason='AIR was not started; the SFF write was not confirmed.';
    await api.window.showInformationMessage(reason);
    return{requested:true,applied:false,reason};
  }
  try {
    let staged,verifiedBuild;
    if(completed?.locator){
      const recovered=helper.recoverGuidedGifAirFromCompleted(completed.locator);
      if(!recovered.available)throw Error(recovered.reason);
      ({staged,verifiedBuild}=recovered);
      staged={...staged,draft:{...staged.draft,configuration:draft.configuration}};
    }else{
      staged={draft:{...draft,target:{...draft.target,path:completed?.targetPath}},plan:{ready:completed?.finalReady,conflicts:[],skipped:[]}};
      verifiedBuild=completed?.cancelled===false?{targetPath:completed.targetPath,byteHash:completed.byteHash,finalReady:completed.finalReady,applied:completed.applied}:null;
    }
    const result=await helper.dispatchGuidedGifAirHandoff(api,staged,{enabled:true,verifiedBuild});
    if(!result.applied)await api.window.showInformationMessage('SFF updated. Optional AIR was not changed; its review was cancelled or deferred.');
    return result;
  }catch(error){
    await api.window.showWarningMessage(`SFF updated. Optional AIR was not changed: ${error.message}`);
    return{requested:true,applied:false,error:error.message};
  }
}
module.exports={reviewOptionalAirAfterBuild};
