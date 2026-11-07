'use strict';

const path = require('node:path');
const {createHash} = require('node:crypto');
const {validShotLayer}=require('./stage_shot_layer');

function validPose(pose) {
  const validFighters=value=>value===undefined||(Array.isArray(value)&&value.length===2&&value.every(item=>item===null||(item&&Object.keys(item).sort().join('|')==='action|def|external|palette'&&typeof item.def==='string'&&item.def.length>0&&item.def.length<=4096&&!/[\0\r\n]/.test(item.def)&&/\.def$/i.test(item.def)&&typeof item.external==='boolean'&&Number.isInteger(item.action)&&item.action>=0&&item.action<=2147483647&&typeof item.palette==='string'&&item.palette.length<=128)));
  const style = pose?.appearance;
  const validStyle = style === undefined || (style && Object.keys(style).every(key=>['size','one','two','dim','gray','fighters','hud'].includes(key)) && validFighters(style.fighters) && require('./stage_hud_safe_area').validHudInsets(style.hud) &&
    ['off','small','standard','giant'].includes(style.size) && [style.one,style.two].every(color => /^#[a-f0-9]{6}$/i.test(color)) &&
    typeof style.dim === 'boolean' && typeof style.gray === 'boolean');
  return pose && validStyle && validShotLayer(pose.layer) && Object.keys(pose).every(key => ['x','y','zoom','tick','appearance','layer'].includes(key)) &&
    [pose.x, pose.y].every(n => Number.isFinite(n) && Math.abs(n) <= 2147483647) &&
    Number.isFinite(pose.zoom) && pose.zoom >= 0.1 && pose.zoom <= 4 &&
    Number.isSafeInteger(pose.tick) && pose.tick >= 0 && pose.tick <= 2147483647;
}

function validCameraState(value) {
  const validFighters=value=>value===undefined||(Array.isArray(value)&&value.length===2&&value.every(item=>item===null||(item&&Object.keys(item).sort().join('|')==='action|def|external|palette'&&typeof item.def==='string'&&item.def.length>0&&item.def.length<=4096&&!/[\0\r\n]/.test(item.def)&&/\.def$/i.test(item.def)&&typeof item.external==='boolean'&&Number.isInteger(item.action)&&item.action>=0&&item.action<=2147483647&&typeof item.palette==='string'&&item.palette.length<=128)));
  return value && ['x','y','zoom','tick','viewScale','panX','panY'].every(key=>Number.isFinite(value[key])) &&
    Math.abs(value.x)<=2147483647 && Math.abs(value.y)<=2147483647 && value.zoom>0 && value.zoom<=100 &&
    Number.isSafeInteger(value.tick) && value.tick>=0 && value.tick<=2147483647 &&
    value.viewScale>=0.1 && value.viewScale<=6 && Math.abs(value.panX)<=1000000 && Math.abs(value.panY)<=1000000 &&
    value.appearance && validFighters(value.appearance.fighters) && require('./stage_hud_safe_area').validHudInsets(value.appearance.hud) && ['off','small','standard','giant'].includes(value.appearance.size) &&
    [value.appearance.one,value.appearance.two].every(color=>/^#[a-f0-9]{6}$/i.test(color)) &&
    typeof value.appearance.dim==='boolean' && typeof value.appearance.gray==='boolean';
}

const writes=new WeakMap();
async function updateShots(storage,key,expected,next,current){
 let queue=writes.get(storage);if(!queue){queue=new Map();writes.set(storage,queue);}const prior=queue.get(key)||Promise.resolve();
 const task=prior.catch(()=>{}).then(async()=>{if(!current()||JSON.stringify(storage.get(key,[]))!==expected)throw Error('Camera shots changed during this choice. Try again.');await storage.update(key,next);});queue.set(key,task);try{await task;}finally{if(queue.get(key)===task)queue.delete(key);}
}
function shotStorageKey(filename,projectRoot){const canonical=path.resolve(projectRoot||filename);return(projectRoot?'ikemaker.stageShots.project.v2.':'ikemaker.stageShots.v1.')+createHash('sha256').update(process.platform==='win32'?canonical.toLowerCase():canonical).digest('hex');}
async function chooseShots(api,storage,owner,message,options={}){
 const generation=owner.generation,filename=owner.filename,current=()=>!owner.disposed&&owner.panel.active&&owner.generation===generation&&owner.filename===filename;
 if(!current()||owner.choosingShots)return;owner.choosingShots=true;const notices=require('./stage_terminal_notices').createStageNotices({info:text=>api.window.showInformationMessage(text),error:text=>api.window.showErrorMessage?.(text)});
 const shared=message.action.endsWith('-project'),action=message.action.replace(/-project$/,''),localCoord=owner.payload?.model?.localCoord;
 try{
  if(shared){const relative=options.projectRoot&&path.relative(path.resolve(options.projectRoot),path.resolve(filename));if(!options.projectRoot||relative==='..'||relative?.startsWith('..'+path.sep)||path.isAbsolute(relative||'')){notices.info('Project camera shots need a proven containing IKEMEN project. This stage was unchanged.');return;}}
  const key=shotStorageKey(filename,shared?options.projectRoot:null),raw=storage.get(key,[]);if(!Array.isArray(raw)||raw.length>64)throw Error('Saved shot list exceeds the64-shot limit. Existing storage was retained.');
  const expected=JSON.stringify(raw),shots=raw.filter(s=>typeof s?.name==='string'&&s.name.length<=64&&validPose(s.pose)&&(!s.localCoord||Array.isArray(s.localCoord)&&s.localCoord.length===2&&s.localCoord.every(n=>Number.isInteger(n)&&n>0&&n<=16384))&&(!s.snapshot||require('./stage_shot_assessment').validShotSnapshot(s.snapshot))),scope=shared?'project':'this Stage';if(shots.length!==raw.length)throw Error('Invalid camera shot records were retained. No saved shots were changed.');
  if(action==='save'){
   const validate=value=>{const name=value.trim();if(!name||name.length>64||/[\0\r\n]/.test(name))return'Use a name from1 to64 characters.';if(shots.some(s=>s.name.toLowerCase()===name.toLowerCase()))return'This shot name is already in use.';};
   if(shots.length>=64)throw Error('This shot list is full (64). Remove a shot explicitly first.');
   const value=await api.window.showInputBox({prompt:'Save camera pose, selected-layer reference and preview snapshot for '+scope,validateInput:validate});
   if(!value||validate(value)||!current()||!validPose(message.pose))return;
   if(message.snapshot&&!require('./stage_shot_assessment').validShotSnapshot(message.snapshot))throw Error('Camera snapshot is invalid or too large.');if(message.snapshot&&(JSON.stringify(message.snapshot.localCoord)!==JSON.stringify(localCoord)||['name','id','type'].some(key=>message.snapshot.assessment.layer?.[key]!==message.pose.layer?.[key])))throw Error('Camera snapshot coordinate/layer ownership does not match the selected pose.');
   const shot={name:value.trim(),pose:message.pose,...(Array.isArray(localCoord)?{localCoord:[...localCoord]}:{}),...(message.snapshot?{snapshot:message.snapshot}:{})};
   await updateShots(storage,key,expected,[...shots,shot],current);return;
  }
  if(!shots.length){notices.info('Use Save '+(shared?'project camera shot':'camera shot')+' first.');return;}
  const compare=action==='compare',rows=shots.map(shot=>({label:shot.name,description:'X '+shot.pose.x+' / Y '+shot.pose.y+' / zoom '+shot.pose.zoom+' / tick '+shot.pose.tick,shot})),picked=await api.window.showQuickPick(rows,{title:(compare?'Compare':action==='remove'?'Remove':action==='reference'?'Use accepted reference':'Recall')+' '+scope+' camera shot',canPickMany:compare}),selected=(compare?picked:[picked])?.filter(row=>rows.includes(row)).map(row=>row.shot);
  if(!current()||!selected?.length)return;
  if(action==='remove'){await updateShots(storage,key,expected,shots.filter(s=>s!==selected[0]),current);return;}
  if(compare&&(selected.length<2||selected.length>8)){notices.info('Choose between two and eight camera shots to compare.');return;}
  const mismatch=selected.filter(s=>Array.isArray(s.localCoord)&&Array.isArray(localCoord)&&s.localCoord.some((n,i)=>n!==localCoord[i]));let mapping='authored';
  if(mismatch.length&&action!=='reference'){
   const choices=[{label:'Keep original Stage coordinates',description:'Preview uses original X/Y and current camera bounds; no silent scaling.',mapping:'authored'},{label:'Scale X/Y to this Stage localcoord',description:'Explicit editor-only pose mapping; source files stay unchanged.',mapping:'scaled'}],choice=await api.window.showQuickPick(choices,{title:'Camera shot localcoord differs',placeHolder:mismatch.map(s=>s.name+': '+s.localCoord.join('×')+' → '+localCoord.join('×')).join('; ')});
   if(!choices.includes(choice)||!current())return;mapping=choice.mapping;
  }
  const output=selected.map(s=>mapping==='scaled'&&mismatch.includes(s)?{...s,pose:{...s.pose,x:s.pose.x*localCoord[0]/s.localCoord[0],y:s.pose.y*localCoord[1]/s.localCoord[1]},mapping:'Scaled explicitly from '+s.localCoord.join('×')+'; accepted snapshot retains original coordinates.'}:s);
  if(output.some(s=>!validPose(s.pose)))throw Error('Mapped camera pose exceeds supported coordinates.');
  if(JSON.stringify(storage.get(key,[]))!==expected)throw Error('Camera shots changed during this choice. Try again.');
  await owner.panel.webview.postMessage({type:'stageCameraShots',generation,compare,reference:action==='reference',shots:output});
 }catch(error){notices.error('Camera shots: '+error.message);}finally{owner.choosingShots=false;notices.flush();}
}
module.exports={validPose,validCameraState,chooseShots,shotStorageKey};
