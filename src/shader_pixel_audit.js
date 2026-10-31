'use strict';

const MAX_AUDIT_PIXELS=4*1024*1024,MAX_SAMPLES=16;
const PIXEL_RULES=Object.freeze([
  Object.freeze({id:'preservePaletteColors',label:'Visible RGB unchanged'}),
  Object.freeze({id:'preserveTransparentPixels',label:'Transparent pixels remain empty'}),
  Object.freeze({id:'preservePartialAlpha',label:'Partial alpha unchanged'}),
  Object.freeze({id:'preserveSpriteSilhouette',label:'Visible silhouette unchanged'})
]);
function rgba(value,label,length){if(!(value instanceof Uint8Array)&&!Buffer.isBuffer(value))throw new Error(`${label} pixels must be RGBA bytes.`);if(value.length!==length)throw new Error(`${label} pixels do not match the declared dimensions.`);return value;}
function auditShaderPixels(project,sourceValue,outputValue,widthValue,heightValue){
  const width=Number(widthValue),height=Number(heightValue),pixels=width*height;if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||!Number.isSafeInteger(pixels)||pixels>MAX_AUDIT_PIXELS)throw new Error(`Pixel audit dimensions must contain 1–${MAX_AUDIT_PIXELS} pixels.`);if(!project?.safeguards)throw new Error('A Shader Workshop project is required for pixel audit.');
  const length=pixels*4,source=rgba(sourceValue,'Source',length),output=rgba(outputValue,'Output',length),counts=Object.fromEntries(PIXEL_RULES.map(rule=>[rule.id,0])),samples=Object.fromEntries(PIXEL_RULES.map(rule=>[rule.id,[]]));
  const fail=(id,index)=>{counts[id]+=1;if(samples[id].length<MAX_SAMPLES)samples[id].push(Object.freeze({pixel:index,x:index%width,y:Math.floor(index/width),source:Object.freeze(Array.from(source.slice(index*4,index*4+4))),output:Object.freeze(Array.from(output.slice(index*4,index*4+4)))}));};
  for(let index=0;index<pixels;index+=1){const at=index*4,sa=source[at+3],oa=output[at+3];if(sa>0&&(source[at]!==output[at]||source[at+1]!==output[at+1]||source[at+2]!==output[at+2]))fail('preservePaletteColors',index);if(sa===0&&(oa!==0||output[at]!==0||output[at+1]!==0||output[at+2]!==0))fail('preserveTransparentPixels',index);if(sa>0&&sa<255&&oa!==sa)fail('preservePartialAlpha',index);if((sa===0)!==(oa===0))fail('preserveSpriteSilhouette',index);}
  const rules=PIXEL_RULES.map(rule=>{const enabled=project.safeguards[rule.id]===true,violations=counts[rule.id];return Object.freeze({...rule,enabled,status:enabled?(violations?'failed':'passed'):'advisory',violations,samples:Object.freeze(samples[rule.id])});});
  return Object.freeze({schema:'ikemaker.shader-pixel-audit/v1',width,height,pixels,passed:rules.every(rule=>!rule.enabled||rule.status==='passed'),rules:Object.freeze(rules),limitations:Object.freeze(['Offline RGBA comparison only.','Does not certify IKEMEN runtime equivalence, performance, or target routing.','Run on source or parameter changes, not every animation tick.'])});
}

module.exports={MAX_AUDIT_PIXELS,MAX_SAMPLES,PIXEL_RULES,auditShaderPixels};
