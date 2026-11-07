'use strict';
// Masks are actual one-row Canvas alpha observations, in native draw order.
// This explains selected-art holes, never mandates filling intentional transparency.
function analyzeAlphaCoverage(masks,selected,width,displayScale=1,maxStrips=128){
 if(!Number.isInteger(width)||width<1||width>4096||!Number.isFinite(displayScale)||displayScale<=0||!Array.isArray(masks)||masks.length>32||!Number.isInteger(maxStrips)||maxStrips<0||maxStrips>128)throw Error('Coverage sampling exceeds its bounded viewport/layer limit.');
 const at=masks.findIndex(mask=>mask.index===selected);if(at<0)return{evaluated:false,reason:'Selected artwork is hidden or outside the rendered layer stack.'};const target=masks[at];if(target.reason)return{evaluated:false,reason:target.reason};
 if(!target.alpha||target.alpha.length!==width)throw Error('Selected alpha observation is incomplete.');
 const counts={opaque:0,filled:0,exposed:0,unknown:0},strips=[];let last=null,omitted=0;
 for(let x=0;x<width;x++){
  const alpha=target.alpha[x];if(alpha===255){counts.opaque++;last=null;continue;}
  let residual=1-alpha/255;const contributors=[],unknown=[];
  for(let i=at-1;i>=0&&residual>.5/255;i--){const lower=masks[i];if(lower.reason){unknown.push(lower.label+': '+lower.reason);continue;}if(!lower.alpha||lower.alpha.length!==width)throw Error('Lower-layer alpha observation is incomplete.');if(lower.alpha[x]>0){contributors.push({index:lower.index,label:lower.label});residual*=1-lower.alpha[x]/255;}}
  const status=unknown.length?'unknown':residual<=.5/255?'filled':'exposed',kind=alpha===0?'transparent':'partial',key=JSON.stringify([status,kind,contributors.map(c=>c.index),unknown]);counts[status]++;
  if(last?.key===key){last.end=x+1;last.width++;last.displayPixels=last.width*displayScale;last.maximumResidual=Math.max(last.maximumResidual,residual);}
  else{const strip={key,start:x,end:x+1,width:1,displayPixels:displayScale,status,kind,contributors,unknown,maximumResidual:residual};if(strips.length<maxStrips){strips.push(strip);last=strip;}else{omitted++;last=strip;}}
 }
 return{evaluated:true,width,counts,strips:strips.map(({key,...strip})=>strip),omitted,selected:target.label,note:'Selected-layer alpha holes at this one viewport row. Filled means opaque at8-bit Canvas precision. Contributors exclude fighters, guides/HUD and editor foreground dimming. This is sampled preview evidence, not whole-stage/native alpha certification.'};
}
module.exports={analyzeAlphaCoverage};
