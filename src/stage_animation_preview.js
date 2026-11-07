'use strict';
const {parseAir}=require('./air_preview_model');
const {scanStageAir}=require('./stage_air_source');
// AIR-only view of a DEF: retain line numbers while excluding numeric lines in other sections.
function collectStageAnimations(text,numbers){const parsed=parseAir(scanStageAir(text).projection),actions={},spriteKeys=new Set(),issues=[];let total=0;
for(const number of [...new Set(numbers)].slice(0,256)){const action=parsed.find(item=>item.number===number&&!item.shadowedDuplicate);if(!action){actions[number]={supported:false,reason:'Missing embedded AIR Action '+number+'.',frames:[]};continue;}const frames=action.frames.map(frame=>({sprite:[frame.group,frame.index],offset:[frame.x,frame.y],time:frame.rawTime,flags:frame.flags,scale:[Math.fround(frame.scaleX),Math.fround(frame.scaleY)],angle:frame.angle,blend:frame.blend,interpolate:frame.interpolate,line:frame.line-1}));let reason=action.copyError||'';if(frames.length>512||total+frames.length>4096)reason='AIR canvas limit: 512 frames per action / 4096 total.';else total+=frames.length;
if(!frames.length)reason=reason||'Embedded AIR action has no resolved frames.';if(frames.at(-1)?.time!==-1&&frames.reduce((sum,frame)=>sum+frame.time,0)>2147483647)reason='AIR total duration exceeds supported int32 timing.';for(const [index,frame]of frames.entries()){if(frame.time<0&&!(frame.time===-1&&index===frames.length-1))reason='Non-final negative AIR durations require runtime verification.';if(!frame.sprite.every(value=>Number.isInteger(value)&&value>=-2147483648&&value<=2147483647)||!frame.offset.every(value=>Number.isInteger(value)&&value>=-2147483648&&value<=2147483647)||!frame.scale.every(value=>Number.isFinite(value)&&Math.abs(value)<=10000)||!Number.isSafeInteger(frame.time)||Math.abs(frame.time)>2147483647)reason='AIR values exceed supported finite/int32 bounds.';if(!/^(?:H?V?|VH)$/.test(frame.flags)||frame.angle!==0||frame.blend||frame.interpolate.length)reason='AIR angle, blend, interpolation or nonstandard flip flags require runtime verification.';}
const entry={supported:!reason,reason,line:action.line-1,loopStart:action.loopStart,frames:frames.length<=512?frames:[]};actions[number]=entry;if(reason)issues.push({action:number,reason});if(entry.supported)for(const frame of frames){if(frame.sprite.includes(-1))continue;spriteKeys.add(frame.sprite.map(value=>((value%65536)+65536)%65536).join(','));}}
return{actions,spriteKeys:[...spriteKeys],issues};}
// Pinned anim.go Reset / UpdateSprite / Action for nonnegative times + final -1.
// N is completed Stage BG updates: reset N=0 has no sprite; draw is sampled
// before Action advances element time. Keep standalone for the generated client.
function stageAnimationSample(action,updates){
 if(!action?.supported)return{supported:false,reason:action?.reason||'Missing embedded AIR action.',frame:null};if(!Number.isInteger(updates)||updates<0||updates>10000)return{supported:false,reason:'AIR preview supports 0–10000 completed BG updates.',frame:null};const frames=action.frames,count=frames.length;if(!count)return{supported:true,frame:null,index:0,elapsed:0,blank:true};const hold=frames[count-1].time===-1,total=hold?-1:frames.reduce((sum,frame)=>sum+frame.time,0),loop=Math.max(0,Math.min(count-1,action.loopStart||0)),loopTime=hold?0:frames.slice(loop).reduce((sum,frame)=>sum+frame.time,0);let index=0,time=0,clock=0,newFrame=true,spriteIndex=-1,drawIndex=0,elapsed=0,loopCount=0;
 function next(){if(total!==-1||index<count-1){time=0;newFrame=true;do{index++;}while(index<count&&!(total===-1&&index===count-1)&&frames[index].time<=0);}}
 for(let n=0;n<updates;n++){
  if(total>0){if(clock>=total){time=0;newFrame=true;index=loop;}let seek=index;while(seek<count&&frames[seek].time<=0&&!(seek===count-1&&frames[seek].time===-1))seek++;index=Math.min(count-1,seek);}
  if(newFrame&&frames[index].time!==0)spriteIndex=index;newFrame=false;drawIndex=index;elapsed=time;
  if(frames[index].time<=0)next();if(index<count){time++;if(time>=frames[index].time){next();if(index>=count)index=loop;}}else index=loop;if(total!==-1&&clock>=total){clock=total-loopTime;loopCount++;}clock++;
 }
 const state={animelem:index,animelemtime:time,animloopcount:loopCount,animtime:clock-total};
 if(spriteIndex<0)return{supported:true,frame:null,index:drawIndex,elapsed,blank:true,state};const frame={...frames[drawIndex],sprite:[...frames[spriteIndex].sprite]};frame.sprite=frame.sprite.map(value=>value===-1?-1:((value%65536)+65536)%65536);return{supported:true,frame,index:drawIndex,elapsed,blank:frame.sprite.includes(-1)||frame.scale.some(value=>value===0),state};
}
// ReadAnimFrame negates stored offsets for H/V; Draw multiplies by H/V again.
// Those signs cancel. AIR element scale also cancels out of the offset, while
// BG scale remains (anim.go75–88,1071–1085; stage.go Draw airOffsetFix={1,1}).
// Stage animations leave phantomPixel=false; only storyboard.go enables it.
function stageAnimationGeometry(frame,info,start,delta,camera,bgScale,center){const flip=[frame.flags.includes('H')?-1:1,frame.flags.includes('V')?-1:1],scale=bgScale.map((value,index)=>value*frame.scale[index]*flip[index]),origin=start.map((value,index)=>value-camera[index]*delta[index]+frame.offset[index]*bgScale[index]+(index===0?center:0)),x=origin[0]-info.axisX*scale[0],y=origin[1]-info.axisY*scale[1],w=info.width*scale[0],h=info.height*scale[1];return{x:Math.min(x,x+w),y:Math.min(y,y+h),w:Math.abs(w),h:Math.abs(h),scale,origin,flip:scale.map(value=>value<0)};}
module.exports={collectStageAnimations,stageAnimationSample,stageAnimationGeometry};
