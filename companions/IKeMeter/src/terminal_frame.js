'use strict';
const REASONS = new Set(['clock-rewind','eligibility-lost','pause-ownership-lost','step-discontinuity']);
function parseTerminalFrame(payload, expected) {
  if (typeof payload !== 'string' || Buffer.byteLength(payload)>4096) throw new Error('invalid sample payload');
  const parts=payload.split('\t');
  if (!parts.some((part)=>part.startsWith('kind='))) return null;
  const allowed=new Set(['protocol','kind','session','epoch','sequence','reason','lastTick','observedTick']);
  const fields={};
  for(const part of parts){
    const match=/^([A-Za-z][A-Za-z0-9]*)=([A-Za-z0-9_-]+)$/.exec(part);
    if(!match||!allowed.has(match[1])||Object.hasOwn(fields,match[1]))throw new Error('malformed terminal frame');
    fields[match[1]]=match[2];
  }
  for(const field of ['protocol','kind','session','epoch','sequence','reason','lastTick'])if(!Object.hasOwn(fields,field))throw new Error('missing terminal field');
  const integer=(name,min=0)=>{if(!/^(0|[1-9][0-9]*)$/.test(fields[name]||''))throw new Error('invalid terminal integer');const value=Number(fields[name]);if(!Number.isSafeInteger(value)||value<min)throw new Error('invalid terminal integer');return value;};
  if(fields.protocol!=='1'||fields.kind!=='terminal'||!REASONS.has(fields.reason)||fields.session!==expected.sessionId||integer('epoch',1)!==expected.epoch||integer('sequence',1)!==expected.sequence)throw new Error('stale or incompatible terminal frame');
  return {terminal:true,sessionId:fields.session,epoch:expected.epoch,creditSequence:expected.sequence,reason:fields.reason,lastTrustedTick:integer('lastTick'),observedTick:Object.hasOwn(fields,'observedTick')?integer('observedTick'):null};
}
module.exports={parseTerminalFrame,TERMINAL_REASONS:REASONS};
