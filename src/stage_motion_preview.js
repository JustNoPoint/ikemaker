'use strict';

// Authored motion at N completed BG updates after reset, not an inferred game
// round/time tick. Controller/external writes require a separate evaluator.
function stageMotionPreview(model,updates,starts){
 const reasons=[],f=Math.fround,rows=[];
 if(!Number.isInteger(updates)||updates<0||updates>10000)reasons.push('Motion preview supports 0–10000 completed background updates.');
 if((model.controllers||[]).some(c=>c.type!=='null'))reasons.push('BGCtrl effects require runtime verification.');
 if(model.attachedChars?.length)reasons.push('Attached-character writes require runtime verification.');
 if((model.stageInfo?.xScale??1)!==1||(model.stageInfo?.yScale??1)!==1)reasons.push('Scaled-stage motion needs runtime verification.');
 if(model.stageInfo?.hires)reasons.push('Legacy hires motion needs runtime verification.');
 if(model.backgrounds?.length>256)reasons.push('Motion preview is limited to 256 backgrounds.');
 if(reasons.length)return {supported:false,reasons,rows:[],groundY:null};
 let anchor=-1;
 function fields(value,defaults){
  const result=defaults.map(f);if(value===undefined)return result;
  for(const [i,token]of String(value).split(',').slice(0,result.length).entries()){
   const raw=token.trimStart();if(raw){const n=Number(raw);if(!Number.isFinite(n))throw Error('Motion fields must be finite literal numbers.');result[i]=f(n);}
   if(/\s/.test(raw))break;
  }return result;
 }
 try{for(const [index,item]of model.backgrounds.entries()){
  const raw=item.raw||{},linked=Number(raw.positionlink||0)!==0&&index>0,owner=linked?rows[anchor]:null;
  const base=(starts?.[index]||item.start).map(f),start=base.map((n,i)=>f(n+(owner?owner.start[i]:0)));
  const velocity=fields(raw.velocity,owner?owner.velocity:item.velocity||[0,0]);
  const delta=owner?[...owner.delta]:[...(item.delta||[1,1])];
  const sine=[0,0],offset=[0,0];
  for(let axis=0;axis<2;axis++){
   const [radius,periodValue,phase]=fields(raw[axis===0?'sin.x':'sin.y'],[0,0,0]),period=Math.trunc(periodValue);
   if(period>2147483647||period< -2147483648)throw Error('Sin period is outside int32.');
   let position=0;for(let n=0;n<updates;n++)position=f(position+velocity[axis]);
   if(updates&&period>0){let initial=Math.trunc(f(f(phase*f(period))/360))%period;if(initial<0)initial+=period;sine[axis]=f(radius*f(Math.sin(2*Math.PI*((initial+updates-1)%period)/period)));}
   offset[axis]=f(f(position+sine[axis])+(owner?owner.sine[axis]:0));
  }
  if([...start,...velocity,...delta,...offset].some(n=>!Number.isFinite(n)))throw Error('Motion preview overflowed finite coordinates.');
  rows.push({index,start,velocity,delta,sine,offset,position:start.map((n,i)=>f(n+offset[i])),linkedTo:owner?anchor:null});
  if(!linked)anchor=index;
 }}catch(error){return {supported:false,reasons:[error.message],rows:[],groundY:null};}
 const id=model.stageInfo?.zOffsetLink,linkedFloor=Number.isInteger(id)&&id>=0?model.backgrounds.findIndex(bg=>(bg.id??0)===id):-1;
 const groundY=(model.stageInfo?.zOffset||0)+(linkedFloor>=0?Math.trunc(rows[linkedFloor].start[1])+rows[linkedFloor].offset[1]:0);
 return {supported:true,reasons:[],rows,groundY,linkedFloor,updates};
}
module.exports={stageMotionPreview};
