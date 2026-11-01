'use strict';

const crypto = require('crypto');
const { spriteIndexPlane } = require('./sff_reader');

const LIMITS = Object.freeze({ maximumActions: 2048, maximumFrames: 65536, maximumDistinctSprites: 4096, maximumDecodedPixels: 16000000, maximumSuggestions: 8 });
function digest(value) { return crypto.createHash('sha256').update(Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value))).digest('hex'); }
function coordinate(group, number) { return `${Number(group)},${Number(number)}`; }
function exactScope(indexes) { return [...new Set((indexes || []).map(Number).filter(value => Number.isInteger(value) && value > 0 && value < 256))].sort((a,b)=>a-b); }
function safeLabel(value){return String(value||'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,128);}
function preflightAirText(text,limits=LIMITS){let actions=0,frames=0;for(const raw of String(text||'').split(/\r?\n/)){const clean=raw.replace(/;.*/,'').trim();if(/^\[\s*begin\s+action\s+-?\d+\s*\]$/i.test(clean))actions++;else if(/^-?\d+\s*,\s*-?\d+\s*,\s*-?\d+\s*,\s*-?\d+\s*,\s*-?\d+/.test(clean))frames++;if(actions>limits.maximumActions)throw new Error(`The assigned AIR exceeds the ${limits.maximumActions}-action discovery limit.`);if(frames>limits.maximumFrames)throw new Error(`The assigned AIR exceeds the ${limits.maximumFrames}-frame discovery limit.`);}return{actions,frames};}

function discover(input = {}) {
  const archive = input.archive, actions = Array.isArray(input.actions) ? input.actions : [], indexes = exactScope(input.indexes), limits = { ...LIMITS, ...(input.limits || {}) };
  if (!archive || !Array.isArray(archive.sprites)) throw new Error('Useful-animation discovery requires an exact SFF archive.');
  if (!indexes.length) return { available: false, reason: 'Transparent index 0 is not scored as visible palette evidence. Choose another color or named group.', suggestions: [], skipped: {} };
  if (actions.length > limits.maximumActions) throw new Error(`The assigned AIR exceeds the ${limits.maximumActions}-action discovery limit.`);
  let frameCount = 0; const referenced = new Set();
  for (const action of actions) { frameCount += (action.frames || []).length; for (const frame of action.frames || []) if (frame.group >= 0) referenced.add(coordinate(frame.group, frame.index)); }
  if (frameCount > limits.maximumFrames) throw new Error(`The assigned AIR exceeds the ${limits.maximumFrames}-frame discovery limit.`);
  if (referenced.size > limits.maximumDistinctSprites) throw new Error(`The assigned AIR exceeds the ${limits.maximumDistinctSprites}-sprite discovery limit.`);
  const byCoordinate = new Map(); for (const sprite of archive.sprites) { const key=coordinate(sprite.group,sprite.number); if(!byCoordinate.has(key))byCoordinate.set(key,[]);byCoordinate.get(key).push(sprite); }
  const planes = new Map(), actionNumberCounts=new Map();for(const action of actions)actionNumberCounts.set(Number(action.number),(actionNumberCounts.get(Number(action.number))||0)+1);const skipped = { missing: 0, duplicate: 0, truecolor: 0, decode: 0, duplicateActions: 0 }, scope = new Set(indexes); let decodedPixels = 0;
  for (const key of referenced) {
    const candidates=byCoordinate.get(key)||[]; if(!candidates.length){skipped.missing++;continue} if(candidates.length!==1){skipped.duplicate++;continue}
    const sprite=candidates[0]; if(![5,8].includes(Number(sprite.colorDepth))){skipped.truecolor++;continue}
    const width=Number(sprite.width),height=Number(sprite.height),pixelCount=width*height;if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width>16384||height>16384||!Number.isSafeInteger(pixelCount))throw new Error('An assigned indexed sprite has unsafe dimensions; useful-animation discovery stopped before decoding it.');
    if(decodedPixels+pixelCount>limits.maximumDecodedPixels)throw new Error(`The complete AIR scan exceeds the ${limits.maximumDecodedPixels.toLocaleString()}-pixel discovery limit.`);
    try { const plane=spriteIndexPlane(archive,sprite); decodedPixels+=plane.indices.length; let matchingPixels=0; for(const value of plane.indices)if(scope.has(value))matchingPixels++; planes.set(key,{sprite,matchingPixels}); } catch(error){skipped.decode++;throw new Error(`An indexed sprite could not be decoded, so the complete useful-animation scan stopped: ${safeLabel(error.message)}`);}
  }
  const scored=[];
  for(let sourceOrder=0;sourceOrder<actions.length;sourceOrder++){
    const action=actions[sourceOrder];if(actionNumberCounts.get(Number(action.number))!==1||action.shadowedDuplicate){skipped.duplicateActions++;continue}const distinct=new Map(); let matchingFrames=0,firstFrameIndex=-1;
    for(let frameIndex=0;frameIndex<(action.frames||[]).length;frameIndex++){const frame=action.frames[frameIndex],hit=planes.get(coordinate(frame.group,frame.index));if(!hit||!hit.matchingPixels)continue;matchingFrames++;if(firstFrameIndex<0)firstFrameIndex=frameIndex;distinct.set(coordinate(frame.group,frame.index),hit);}
    if(!distinct.size)continue;const rows=[...distinct.values()],matchingPixels=rows.reduce((sum,row)=>sum+row.matchingPixels,0),thumbnail=rows.sort((a,b)=>b.matchingPixels-a.matchingPixels||a.sprite.index-b.sprite.index)[0].sprite;
    scored.push({id:`action-${sourceOrder}-${action.number}`,actionNumber:Number(action.number),actionName:safeLabel(action.comment||action.name||''),sourceLine:Number(action.line)||0,firstFrameIndex,matchingPixels,distinctSprites:distinct.size,matchingFrames,thumbnailSprite:{physicalIndex:thumbnail.index,group:thumbnail.group,number:thumbnail.number}});
  }
  scored.sort((a,b)=>b.matchingPixels-a.matchingPixels||b.distinctSprites-a.distinctSprites||b.matchingFrames-a.matchingFrames||a.sourceLine-b.sourceLine||a.actionNumber-b.actionNumber);
  const suggestions=scored.slice(0,limits.maximumSuggestions);return{available:Boolean(suggestions.length),reason:suggestions.length?'Suggestions show strong visible index coverage; they do not prove runtime palette ownership.':'No assigned AIR action visibly uses the selected indexed color scope.',suggestions,skipped,scanned:{actions:actions.length,frames:frameCount,distinctSprites:referenced.size,decodedPixels},scopeHash:digest(indexes)};
}

function discoverSprites(input = {}) {
  const archive=input.archive;if(!archive||!Array.isArray(archive.sprites))throw new Error('Useful-sprite discovery requires an exact SFF archive.');if(archive.sprites.length>LIMITS.maximumDistinctSprites)throw new Error(`The SFF exceeds the ${LIMITS.maximumDistinctSprites}-sprite complete fallback limit; no partial result was labelled strongest.`);
  const actions=archive.sprites.map((sprite,sourceOrder)=>({number:sourceOrder,line:sourceOrder+1,frames:[{group:sprite.group,index:sprite.number}]}));
  const result=discover({...input,actions});
  return{...result,reason:result.available?'No unique assigned AIR was found. These complete-scan results are matching indexed sprites; choose one as the static preview.':result.reason,suggestions:result.suggestions.map(item=>({id:`sprite-${item.thumbnailSprite.physicalIndex}`,kind:'sprite',matchingPixels:item.matchingPixels,thumbnailSprite:item.thumbnailSprite}))};
}

function binding(input = {}) { return digest({version:1,sffPath:String(input.sffPath||''),sffHash:String(input.sffHash||''),defPath:String(input.defPath||''),defHash:String(input.defHash||''),airPath:String(input.airPath||''),airHash:String(input.airHash||''),assignmentHash:String(input.assignmentHash||''),palette:input.palette,colorsHash:String(input.colorsHash||''),scopeHash:String(input.scopeHash||''),membershipHash:String(input.membershipHash||''),suggestions:(input.suggestions||[]).map(item=>[item.id,item.actionNumber,item.firstFrameIndex,item.matchingPixels,item.distinctSprites,item.matchingFrames,item.thumbnailSprite])}); }

module.exports = { LIMITS, exactScope, preflightAirText, discover, discoverSprites, binding };
