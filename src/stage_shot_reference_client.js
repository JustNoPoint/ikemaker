'use strict';
function createShotReferenceClient(env){
 const {document}=env,get=id=>document.getElementById(id);let accepted=null,currentKey='',serial=0,busy=false;
 const panel=document.createElement('details');panel.id='shotReferencePanel';panel.hidden=true;
 panel.innerHTML='<summary>Accepted camera reference</summary><output id="shotReferenceStatus" role="status"></output><div style="display:flex;gap:8px;flex-wrap:wrap"><figure style="margin:0"><figcaption>Accepted preview</figcaption><img id="acceptedShotImage" alt="Accepted preview snapshot" style="max-width:144px"></figure><figure id="currentShotFigure" hidden style="margin:0"><figcaption>Current preview</figcaption><img id="currentShotImage" alt="Current preview snapshot" style="max-width:144px"></figure></div><div class="guide"><button id="compareAcceptedShot">Compare current preview</button><button id="restoreAcceptedPose">Restore reference pose</button><button id="clearAcceptedShot">Clear reference</button></div><small>Visual differences are changes, not errors. Gap delta is the selected layer’s geometric span only; transparency and other layers are excluded.</small>';
 env.container.append(panel);
 function eligibility(){
  if(!accepted)return{ok:false,reason:''};const snapshot=accepted.snapshot,pose=env.pose();
  if(snapshot.localCoord.some((n,i)=>n!==env.model.localCoord[i]))return{ok:false,reason:'Different localcoord: accepted image retained; numerical/visual delta is unavailable. Recall the shot separately to choose an explicit coordinate mapping.'};
  const resolved=env.resolve(accepted.pose.layer);if(resolved.index===null)return{ok:false,reason:resolved.notice||'Accepted layer is unavailable.'};const layer=env.layer();if(!layer||!accepted.pose.layer||['name','id','type'].some(key=>layer[key]!==accepted.pose.layer[key]))return{ok:false,reason:'Select the exact accepted layer; missing or ambiguous identity is not mapped automatically.'};
  if(['x','y','zoom','tick'].some(key=>Math.abs(pose[key]-accepted.pose[key])>1e-6))return{ok:false,reason:'Match the accepted camera X/Y, zoom and tick before comparing.'};
  return{ok:true,reason:'Ready to compare '+accepted.name+'.'};
 }
 function sync(){if(!accepted)return;const state=eligibility();get('compareAcceptedShot').disabled=busy||!state.ok;get('compareAcceptedShot').title=state.reason;get('restoreAcceptedPose').disabled=accepted.snapshot.localCoord.some((n,i)=>n!==env.model.localCoord[i]);if(currentKey!==env.fingerprint()){currentKey='';get('currentShotFigure').hidden=true;get('shotReferenceStatus').textContent=accepted.name+' · '+state.reason;}return state;}
 function use(shot){
  if(!shot?.snapshot?.image?.startsWith('data:image/png;base64,')||shot.snapshot.image.length>131072){env.notice('This legacy camera shot has no accepted snapshot. Save a new shot to capture a reference; the current reference was kept.');return false;}
  accepted=JSON.parse(JSON.stringify(shot));serial++;currentKey='';get('acceptedShotImage').src=accepted.snapshot.image;panel.hidden=false;panel.open=true;env.reveal();panel.scrollIntoView?.({block:'nearest'});sync();get('compareAcceptedShot').focus();return true;
 }
 get('compareAcceptedShot').onclick=async()=>{
  if(!eligibility().ok||busy)return;const ticket=++serial,poseKey=env.intent();busy=true;sync();
  try{await env.ready();if(ticket!==serial||poseKey!==env.intent()||!eligibility().ok)return;const snapshot=env.snapshot();if(ticket!==serial)return;const delta=env.delta(accepted.snapshot.assessment,snapshot.assessment);get('currentShotImage').src=snapshot.image;get('currentShotFigure').hidden=false;currentKey=env.fingerprint();get('shotReferenceStatus').textContent=accepted.name+' · '+(delta.available?'Selected-layer edge gap '+delta.before.toFixed(2)+' → '+delta.after.toFixed(2)+' ('+(delta.change>=0?'+':'')+delta.change.toFixed(2)+' local units).':delta.reason+' Visual snapshots are available.');}
  catch(error){env.notice('Reference comparison could not finish: '+error.message);}finally{busy=false;sync();}
 };
 get('restoreAcceptedPose').onclick=()=>{if(accepted&&!get('restoreAcceptedPose').disabled){serial++;env.restore(accepted.pose);sync();}};
 get('clearAcceptedShot').onclick=()=>{accepted=null;serial++;busy=false;currentKey='';panel.hidden=true;get('acceptedShotImage').removeAttribute('src');get('currentShotImage').removeAttribute('src');};
 return{use,sync,active:()=>accepted};
}
module.exports={createShotReferenceClient};
