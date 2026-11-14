'use strict';
// Selected-layer horizontal geometric span only: no alpha/composited coverage.
function shotGapAssessment(projection,item,layer){
 const unknown=reason=>({layer,coverage:'unknown',gap:null,reason});
 if(!layer||!projection?.supported)return unknown(projection?.reason||'Select a supported artwork layer.');
 const p=projection,v=p.viewport,c=p.clip||{x:v.left,y:v.top,w:v.right-v.left,h:v.bottom-v.top},first=Math.max(v.top,p.top.y,c.y),last=Math.min(v.bottom,p.bottom.y,c.y+c.h),width=v.right-v.left;
 if(last<=first||c.w<=0||c.x>=v.right||c.x+c.w<=v.left)return{layer,coverage:'not-visible',gap:null,reason:'Selected layer has no visible rows at this pose.'};
 // Normal repeats may contain authored spacing gaps; do not infer solid coverage.
 if(item.type!=='parallax'&&item.tile?.some(n=>n!==0))return unknown('Tiled normal-layer gap measurement is unavailable; compare the artwork visually.');
 const gaps=[first,last].map(y=>{const t=(y-p.top.y)/(p.bottom.y-p.top.y),mix=(a,b)=>a+(b-a)*t;let left=mix(p.top.left,p.bottom.left),right=mix(p.top.right,p.bottom.right);const stride=right-left,flag=item.tile?.[0]||0;if(item.type==='parallax'){if(flag===1){left=v.left;right=v.right;}else if(flag!==0)right=left+stride*(flag<0?2147483647:flag);}left=Math.max(left,c.x);right=Math.min(right,c.x+c.w);return Math.min(width,Math.max(0,left-v.left,v.right-right));});
 const gap=Math.max(...gaps);return{layer,coverage:gap>0?'gap':'covered',gap,reason:'Selected-layer geometric span at visible row endpoints; transparency and other layers are excluded.'};
}
function shotAssessmentDelta(accepted,current){
 if(!accepted||!current)return{available:false,reason:'This saved shot has no coverage assessment.'};
 const a=accepted.layer,b=current.layer;if(!a||!b||a.name!==b.name||a.id!==b.id||a.type!==b.type)return{available:false,reason:'Selected-layer identity does not match the accepted reference.'};
 if(!Number.isFinite(accepted.gap)||!Number.isFinite(current.gap))return{available:false,reason:current.reason||accepted.reason||'Coverage is unavailable.'};
 return{available:true,before:accepted.gap,after:current.gap,change:current.gap-accepted.gap};
}
function validShotSnapshot(value){
 if(!value||Object.keys(value).sort().join('|')!=='assessment|height|image|localCoord|width'||!Array.isArray(value.localCoord)||value.localCoord.length!==2||!value.localCoord.every(n=>Number.isInteger(n)&&n>0&&n<=16384)||!Number.isInteger(value.width)||!Number.isInteger(value.height)||value.width<1||value.height<1||Math.max(value.width,value.height)>160||typeof value.image!=='string'||value.image.length>131072||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value.image))return false;
 const bytes=Buffer.from(value.image.slice(22),'base64');if(bytes.length<33||bytes.readUInt32BE(0)!==0x89504e47||bytes.toString('ascii',12,16)!=='IHDR'||bytes.readUInt32BE(16)!==value.width||bytes.readUInt32BE(20)!==value.height)return false;
 const a=value.assessment;return Boolean(a&&Object.keys(a).sort().join('|')==='coverage|gap|layer|reason'&&require('./stage_shot_layer').validShotLayer(a.layer)&&['unknown','not-visible','gap','covered'].includes(a.coverage)&&(a.gap===null||Number.isFinite(a.gap)&&a.gap>=0&&a.gap<=2147483647)&&typeof a.reason==='string'&&a.reason.length<=1024);
}
module.exports={shotGapAssessment,shotAssessmentDelta,validShotSnapshot};
