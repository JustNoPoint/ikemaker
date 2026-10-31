'use strict';

const crypto=require('crypto');
const { DEPENDENCY_KINDS, reviewIdentity }=require('./similar_code_adaptation');

const MAX_SOURCE_BYTES=4*1024*1024;
const MAX_BLOCK_BYTES=512*1024;
const MAX_RANGES=512;
const MAX_DEPTH=128;
const LANGUAGES=new Set(['zss','cns','lua']);

function digest(value){return crypto.createHash('sha256').update(String(value??'')).digest('hex');}
function bounded(value,max=512){const text=String(value??'').trim();return text&&Buffer.byteLength(text,'utf8')<=max&&!/[\u0000-\u001f\u007f]/.test(text)?text:'';}
function language(value){const result=String(value||'').toLowerCase();return result==='ikemen-cns'?'cns':result;}
function maskSource(text,grammar,{strings=false}={}){
  const source=String(text||''),out=[...source],quoteEnd=new Set(),lineComment=grammar==='zss'?'#':grammar==='lua'?'--':';';let quote='',escaped=false;
  for(let index=0;index<source.length;index+=1){const character=source[index],next=source.slice(index,index+lineComment.length);
    if(quote){if(strings&&character!=='\r'&&character!=='\n')out[index]=' ';if(escaped){escaped=false;continue;}if(character==='\\'){escaped=true;continue;}if(character===quote){quoteEnd.add(index);quote='';}continue;}
    if(character==='"'||character==="'"){quote=character;if(strings)out[index]=' ';continue;}
    if(next===lineComment){for(let at=index;at<source.length&&source[at]!=='\r'&&source[at]!=='\n';at+=1)out[at]=' ';index=Math.max(index,index+lineComment.length-1);while(index+1<source.length&&source[index+1]!=='\r'&&source[index+1]!=='\n')index+=1;}
  }
  return out.join('');
}
function blockSlice(text,source){
  const lines=String(text).match(/.*(?:\r\n|\n|\r|$)/g)||[],startLine=source.line,endLine=source.endLine;
  if(!Number.isInteger(startLine)||startLine<0||!Number.isInteger(endLine)||endLine<startLine||endLine>=lines.length)return null;
  let start=0;for(let index=0;index<startLine;index+=1)start+=lines[index].length;let end=start;for(let index=startLine;index<=endLine;index+=1)end+=lines[index].length;
  return{start,end,text:String(text).slice(start,end)};
}
function occurrencePatterns(kind){
  return ({
    functions:[/\bcall\s+([a-z_][a-z0-9_]*)\s*\(/gi],
    maps:[/\bmap\s*\(\s*([^)]+?)\s*\)/gi],
    constants:[/\bconst\s*\(\s*([a-z_][a-z0-9_.]*)\s*\)/gi],
    commands:[/\bcommand\s*(?:!?=)\s*"([^"\r\n]+)"/gi],
    states:[/\b(?:changeState|selfState|targetState)\s*\{[^}]*?\bvalue\s*:\s*(-?\d+)/gis],
    animations:[/\b(?:anim|changeAnim)\s*(?:[:=]|\{[^}]*?\bvalue\s*:)\s*(-?\d+)/gis],
    sounds:[/\b(?:playSnd|sndPan)\s*\{[^}]*?\bvalue\s*:\s*((?:[a-z]\s*)?-?\d+\s*,\s*-?\d+)/gis],
    helpers:[/\bhelper\s*\{[^}]*?\bid\s*:\s*(-?\d+)/gis],
    explods:[/\b(?:explod|modifyExplod|removeExplod)\s*\{[^}]*?\bid\s*:\s*(-?\d+)/gis],
    projectiles:[/\bprojectile\s*\{[^}]*?\bprojID\s*:\s*(-?\d+)/gis]
  })[kind]||[];
}
function codePosition(text,offset){let quote='',escaped=false;for(let index=0;index<offset;index+=1){const character=text[index];if(quote){if(escaped){escaped=false;continue;}if(character==='\\'){escaped=true;continue;}if(character===quote)quote='';}else if(character==='"'||character==="'")quote=character;}return!quote;}
function hasLuaLongBracket(text){return/(?:--\s*)?\[(=*)\[/.test(String(text||''));}
function dependencyOccurrences(text,grammar,rows){
  if(grammar==='lua'&&hasLuaLongBracket(text))return[];
  const commentsOnly=maskSource(text,grammar),codeOnly=maskSource(text,grammar,{strings:true}),result=[];
  for(const row of rows){const expected=String(row.referenceValue||'').trim();for(const expression of occurrencePatterns(row.kind)){expression.lastIndex=0;const searchable=row.kind==='commands'?commentsOnly:codeOnly;let match;while((match=expression.exec(searchable))){if(row.kind==='commands'&&!codePosition(commentsOnly,match.index))continue;const captured=String(match[1]||''),normalized=captured.trim();if(normalized.toLocaleLowerCase()!==expected.toLocaleLowerCase())continue;const relative=match[0].lastIndexOf(captured),leading=captured.length-captured.trimStart().length,start=match.index+relative+leading,end=start+normalized.length;result.push({rowId:row.id,kind:row.kind,start,end,original:String(text).slice(start,end)});if(!match[0].length)expression.lastIndex+=1;}}}
  return result.sort((left,right)=>left.start-right.start||left.end-right.end||left.rowId.localeCompare(right.rowId));
}
function validReplacement(kind,value){
  const text=bounded(value);if(!text)return false;
  if(['states','animations','helpers','explods','projectiles'].includes(kind))return/^-?\d+$/.test(text);
  if(kind==='sounds')return/^(?:[a-z]\s*)?-?\d+\s*,\s*-?\d+$/i.test(text);
  if(kind==='functions'||kind==='constants')return/^[a-z_][a-z0-9_.]*$/i.test(text);
  if(kind==='maps')return/^[^()\r\n;{}]+$/.test(text);
  if(kind==='commands')return!/["'\r\n]/.test(text);
  return false;
}
function nestingDepth(text,grammar){const source=maskSource(text,grammar,{strings:true});let depth=0,highest=0;for(const character of source){if(character==='{'){depth+=1;highest=Math.max(highest,depth);if(highest>MAX_DEPTH)return highest;}else if(character==='}')depth=Math.max(0,depth-1);}return highest;}
function normalizedSelection(value,row){
  if(typeof value==='string')value={value,source:'catalog'};
  if(!value||Object.getPrototypeOf(value)!==Object.prototype||!['catalog','explicit'].includes(value.source))return null;
  const selected=bounded(value.value);if(!selected||!validReplacement(row.kind,selected))return null;
  const admitted=(row.alternatives||[]).some(candidate=>String(candidate).toLocaleLowerCase()===selected.toLocaleLowerCase());
  if(value.source==='catalog'&&!admitted)return null;
  return{value:selected,source:value.source,classification:row.kind};
}
function buildAdaptationDraft(input={}){
  const review=input.review;if(!review||review.schema!=='ikemaker.similar-code-adaptation-review'||review.mutationAllowed!==false||reviewIdentity(review)!==String(review.reviewId||'').toLowerCase())throw new Error('The adaptation review is invalid or stale.');
  const grammar=language(review.referenceLanguage),currentGrammar=language(review.currentLanguage);if(!LANGUAGES.has(grammar)||grammar!==currentGrammar)throw new Error('Adaptation drafts require the same supported source language.');
  const referenceText=String(input.referenceText??''),currentText=String(input.currentText??'');if(Buffer.byteLength(referenceText,'utf8')>MAX_SOURCE_BYTES||Buffer.byteLength(currentText,'utf8')>MAX_SOURCE_BYTES)throw new Error('Adaptation source exceeds the 4 MiB file limit.');
  if(digest(referenceText)!==review.reference.fingerprint||digest(currentText)!==review.current.fingerprint)throw new Error('The current or reference source changed. Refresh Similar Code.');
  for(const key of ['capabilityFingerprint','catalogFingerprint','contextFingerprint'])if(review.target?.[key]&&String(input[key]||'').toLowerCase()!==String(review.target[key]).toLowerCase())throw new Error(`The ${key.replace('Fingerprint','')} authority changed. Refresh Similar Code.`);
  if(review.omittedCount)throw new Error('The dependency review was truncated and cannot create a complete draft.');
  const slice=blockSlice(referenceText,review.reference);if(!slice)throw new Error('The exact reference block range is unavailable.');if(Buffer.byteLength(slice.text,'utf8')>MAX_BLOCK_BYTES)throw new Error('The reference block exceeds the 512 KiB draft limit.');if(grammar==='lua'&&hasLuaLongBracket(slice.text))throw new Error('Lua long-bracket comments or strings require manual review and cannot create an adaptation draft.');if(nestingDepth(slice.text,grammar)>MAX_DEPTH)throw new Error('The reference block exceeds the 128-level nesting limit.');
  const selections=input.selections&&Object.getPrototypeOf(input.selections)===Object.prototype?input.selections:{},replacementByRow=new Map(),blockers=[];
  for(const row of review.rows){if(!DEPENDENCY_KINDS.includes(row.kind)){blockers.push(`${row.id}: unsupported dependency kind`);continue;}if(row.status==='dynamic-unresolved'){blockers.push(`${row.id}: dynamic dependency`);continue;}const fallback=row.status==='already-matched'&&row.selectedValue?{value:row.selectedValue,source:'catalog'}:null,selected=normalizedSelection(selections[row.id]||fallback,row);if(!selected){blockers.push(`${row.id}: explicit reviewed substitution required`);continue;}replacementByRow.set(row.id,selected);}
  const ranges=dependencyOccurrences(slice.text,grammar,review.rows);if(ranges.length>MAX_RANGES)throw new Error('The draft exceeds the 512 replacement-range limit.');
  for(const row of review.rows)if(replacementByRow.has(row.id)&&!ranges.some(range=>range.rowId===row.id))blockers.push(`${row.id}: no parser-proven literal occurrence`);
  for(let index=1;index<ranges.length;index+=1)if(ranges[index].start<ranges[index-1].end)blockers.push(`${ranges[index].rowId}: overlapping or ambiguous occurrence`);
  if(blockers.length)throw new Error(`Adaptation draft is blocked: ${[...new Set(blockers)].slice(0,32).join('; ')}`);
  const replacements=ranges.filter(range=>replacementByRow.get(range.rowId)?.value!==range.original).map(range=>({...range,replacement:replacementByRow.get(range.rowId).value,selectionSource:replacementByRow.get(range.rowId).source}));let adapted=slice.text;
  for(const replacement of [...replacements].sort((left,right)=>right.start-left.start))adapted=adapted.slice(0,replacement.start)+replacement.replacement+adapted.slice(replacement.end);
  const replacedOriginalBytes=replacements.reduce((sum,item)=>sum+Buffer.byteLength(item.original,'utf8'),0),unchangedBytes=Math.max(0,Buffer.byteLength(slice.text,'utf8')-replacedOriginalBytes),authority={reviewId:review.reviewId,currentFingerprint:review.current.fingerprint,referenceFingerprint:review.reference.fingerprint,capabilityFingerprint:review.target?.capabilityFingerprint||'',catalogFingerprint:review.target?.catalogFingerprint||'',contextFingerprint:review.target?.contextFingerprint||''};
  return Object.freeze({schema:'ikemaker.similar-code-adaptation-draft',version:1,draftId:digest(JSON.stringify([authority,replacements.map(item=>[item.rowId,item.start,item.end,item.replacement]),digest(adapted)])),language:grammar,languageId:grammar==='cns'?'ikemen-cns':grammar,original:slice.text,text:adapted,replacementCount:replacements.length,unchangedBytes,authority:Object.freeze(authority),replacements:Object.freeze(replacements.map(item=>Object.freeze({...item})))});
}

module.exports={MAX_SOURCE_BYTES,MAX_BLOCK_BYTES,MAX_RANGES,MAX_DEPTH,buildAdaptationDraft,dependencyOccurrences,validReplacement,maskSource,blockSlice,nestingDepth,hasLuaLongBracket};
