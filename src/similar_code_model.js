'use strict';

const path = require('path');
const crypto = require('crypto');
const { parseCodeStructure } = require('./code_structure_model');
const { buildAdaptationReview } = require('./similar_code_adaptation');
const intentSearch = require('./intent_search');
const {textGrammar}=require('./map_registry_grammar');

const DEFAULT_LIMITS = Object.freeze({ files:256, sourceBytes:4*1024*1024, totalBytes:16*1024*1024, candidates:4096, results:48 });
const COMPARABLE_KINDS = new Set(['state','function','controller','condition','loop']);
const STOP_WORDS = new Set(['a','an','and','as','at','by','else','false','for','from','if','in','is','not','of','on','or','the','then','to','true','while','with']);

function language(filename,languageId) {
  const grammar=languageId||textGrammar({fileName:filename});
  return path.extname(filename).toLowerCase()==='.lua'||grammar==='lua'?'lua':grammar==='ikemen-cns'?'cns':'zss';
}
function digest(value){return crypto.createHash('sha256').update(String(value||'')).digest('hex');}
function canonical(value){return path.resolve(String(value||''));}
function sourceText(lines,node){return lines.slice(node.startLine,node.endLine+1).join('\n');}
function excerpt(value,maxBytes=3500){
  const result=[];let bytes=0;
  for(const line of String(value||'').split(/\r?\n/).slice(0,80)){
    const next=Buffer.byteLength(line,'utf8')+(result.length?1:0);
    if(bytes+next>maxBytes){result.push('…');break;}
    result.push(line);bytes+=next;
  }
  return result.join('\n');
}
function maskedExcerpt(value,maxBytes=3500){return excerpt(String(value||'').replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,'[string literal]'),maxBytes);}
function normalizeWords(value){
  return String(value||'').replace(/#[^\r\n]*/g,' ').replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,' string ').replace(/\b(?:0x[\da-f]+|\d+(?:\.\d+)?)\b/gi,' number ').toLowerCase().match(/[a-z_][a-z0-9_.]*/g)||[];
}
function dependencySummary(value){
  const text=String(value||''), collect=(expression,group=1)=>[...new Set([...text.matchAll(expression)].map(match=>match[group]).filter(Boolean))].sort().slice(0,32);
  return Object.freeze({
    functions:collect(/\bcall\s+([a-z_][a-z0-9_]*)\s*\(/gi),
    maps:collect(/\bmap\s*\(\s*([^)]+?)\s*\)/gi),
    constants:collect(/\bconst\s*\(\s*([a-z_][a-z0-9_.]*)\s*\)/gi),
    commands:collect(/\bcommand\s*(?:!?=)\s*"([^"\r\n]+)"/gi),
    states:collect(/\b(?:changeState|selfState|targetState)\s*\{[^}]*?\bvalue\s*:\s*(-?\d+)/gis),
    animations:collect(/\b(?:anim|changeAnim)\s*(?:[:=]|\{[^}]*?\bvalue\s*:)\s*(-?\d+)/gis),
    sounds:collect(/\b(?:playSnd|sndPan)\s*\{[^}]*?\bvalue\s*:\s*([^;}]+)/gis),
    helpers:collect(/\bhelper\s*\{[^}]*?\bid\s*:\s*([^;}\r\n]+)/gis),
    explods:collect(/\b(?:explod|modifyExplod|removeExplod)\s*\{[^}]*?\bid\s*:\s*([^;}\r\n]+)/gis),
    projectiles:collect(/\bprojectile\s*\{[^}]*?\bprojID\s*:\s*([^;}\r\n]+)/gis)
  });
}
function nodeTokens(node,source){
  const tokens=new Set([`kind:${node.kind}`]), stack=[node];
  while(stack.length){const current=stack.pop();tokens.add(`shape:${current.kind}`);if(current.kind==='controller')tokens.add(`controller:${String(current.title||'').toLowerCase()}`);for(const child of current.children||[])stack.push(child);}
  for(const word of normalizeWords(`${node.signature||''}\n${source}`))if(!STOP_WORDS.has(word))tokens.add(word);
  return tokens;
}
function nodeShape(node){const counts={};const stack=[node];while(stack.length){const current=stack.pop();counts[current.kind]=(counts[current.kind]||0)+1;for(const child of current.children||[])stack.push(child);}return counts;}
function jaccard(left,right){let common=0;for(const value of left)if(right.has(value))common+=1;const union=left.size+right.size-common;return union?common/union:0;}
function shapeScore(left,right){const keys=new Set([...Object.keys(left),...Object.keys(right)]);let shared=0,total=0;for(const key of keys){shared+=Math.min(left[key]||0,right[key]||0);total+=Math.max(left[key]||0,right[key]||0);}return total?shared/total:0;}
function similarity(left,right){
  if(left.kind!==right.kind)return 0;
  const token=jaccard(left.tokens,right.tokens), shape=shapeScore(left.shape,right.shape), length=Math.min(left.lineCount,right.lineCount)/Math.max(left.lineCount,right.lineCount,1), title=String(left.title||'').toLowerCase()===String(right.title||'').toLowerCase()?0.08:0;
  return Math.min(1,0.67*token+0.18*shape+0.15*length+title);
}
function collectCandidates(document,limits){
  const filename=canonical(document.filename), text=String(document.text||''), lines=text.split(/\r?\n/), root=parseCodeStructure(text,language(filename,document.languageId),filename), result=[];
  function visit(node,trail=[]){
    if(COMPARABLE_KINDS.has(node.kind)&&result.length<limits.candidates){
      const excerpt=sourceText(lines,node), lineCount=Math.max(1,node.endLine-node.startLine+1);
      result.push({id:digest(JSON.stringify([filename,node.kind,node.startLine,node.endLine,trail])).slice(0,32),filename,language:language(filename,document.languageId),kind:node.kind,title:String(node.title||node.signature||node.kind),startLine:Math.max(0,node.startLine||0),endLine:Math.max(node.startLine||0,node.endLine||0),lineCount,text:excerpt,tokens:nodeTokens(node,excerpt),shape:nodeShape(node),dependencies:dependencySummary(excerpt),fingerprint:digest(text)});
    }
    for(let index=0;index<(node.children||[]).length;index+=1)visit(node.children[index],[...trail,index]);
  }
  visit(root);return result;
}
function seedFor(candidates,active){
  if(!active||typeof active.filename!=='string'||!Number.isInteger(active.line)||active.line<0)return null;
  const filename=canonical(active.filename).toLowerCase(), containing=candidates.filter(candidate=>candidate.filename.toLowerCase()===filename&&candidate.startLine<=active.line&&candidate.endLine>=active.line);
  return containing.sort((left,right)=>(left.endLine-left.startLine)-(right.endLine-right.startLine)||right.startLine-left.startLine)[0]||null;
}
function dependencyDetail(dependencies){
  const parts=[];for(const [label,values] of Object.entries(dependencies))if(values.length)parts.push(`${label}: ${values.join(', ')}`);return parts.join(' · ')||'No supported literal code or asset dependency was identified.';
}
function comparisonDetail(seed,candidate){
  const parts=[],difference=(label,left,right)=>{const removed=left.filter(value=>!right.includes(value)),added=right.filter(value=>!left.includes(value));if(removed.length)parts.push(`current-only ${label}: ${removed.join(', ')}`);if(added.length)parts.push(`reference-only ${label}: ${added.join(', ')}`);};
  for(const key of ['functions','maps','constants','commands','states','animations','sounds','helpers','explods','projectiles'])difference(key,seed.dependencies[key]||[],candidate.dependencies[key]||[]);
  const controllers=value=>[...value.tokens].filter(token=>token.startsWith('controller:')).map(token=>token.slice(11)).sort();difference('controllers',controllers(seed),controllers(candidate));
  if(seed.lineCount!==candidate.lineCount)parts.push(`lines: current ${seed.lineCount}, reference ${candidate.lineCount}`);
  return parts.join(' · ')||'No literal dependency or controller-family difference was identified; review values and conditions directly.';
}
function safeIntentText(candidate){
  const tokens=[...(candidate.tokens||[])].filter(value=>!/^string$/i.test(value)&&!/^number$/i.test(value)).slice(0,128);
  return [candidate.kind,candidate.title,...tokens].join(' ');
}
function normalizedIntentAliases(value={}){
  const source=value&&Object.getPrototypeOf(value)===Object.prototype?value:{},custom={};let seen=0;for(const alias in source){if(!Object.prototype.hasOwnProperty.call(source,alias)||seen++>=512)break;const raw=source[alias],phrase=String(alias||'').trim().toLowerCase();if(Buffer.byteLength(phrase,'utf8')>256||/[<>\u0000-\u001f\u007f]/.test(phrase))continue;const values=Array.isArray(raw)?raw:[raw];if(values.length>32)continue;const targets=[];for(const item of values){if(typeof item!=='string'||Buffer.byteLength(item,'utf8')>512||/[<>\u0000-\u001f\u007f]/.test(item)){targets.length=0;break;}const term=item.trim();if(term)targets.push(term);}if(phrase&&targets.length)custom[phrase]=targets;}
  const combined={...intentSearch.BUILTIN_ALIASES,...custom},result=[];
  for(const [rawPhrase,rawTargets] of Object.entries(combined).slice(0,512)){
    const phrase=String(rawPhrase||'').trim().toLowerCase().replace(/\s+/g,' '),targets=(Array.isArray(rawTargets)?rawTargets:[rawTargets]).filter(item=>typeof item==='string').map(item=>item.trim()).filter(Boolean).slice(0,32);
    if(!phrase||Buffer.byteLength(phrase,'utf8')>256||/[<>\u0000-\u001f\u007f]/.test(phrase)||!targets.length)continue;
    result.push({phrase,targets});
  }
  return result;
}
function intentExampleDiscovery(candidates,pins=[],aliases={},limit=48){
  const canonical=(candidates||[]).map(candidate=>({candidate,haystack:safeIntentText(candidate),id:`candidate:${candidate.id}`})),resolvedPins=(Array.isArray(pins)?pins:[]).slice(0,64).filter(pin=>pin&&typeof pin.id==='string'&&typeof pin.label==='string').map(pin=>({pin,haystack:[pin.label,pin.kind,pin.status].join(' '),id:`pin:${pin.id}`})),targets=[...canonical,...resolvedPins],byId=new Map(),collisions=[];
  for(const entry of normalizedIntentAliases(aliases)){
    const rawMatches=targets.filter(target=>entry.targets.some(term=>intentSearch.matches(target.haystack,term))),candidateMatches=rawMatches.filter(target=>target.candidate),pinMatches=rawMatches.filter(target=>target.pin),smallest=candidateMatches.length?Math.min(...candidateMatches.map(target=>target.candidate.lineCount)):0,matches=[...pinMatches,...candidateMatches.filter(target=>target.candidate.lineCount===smallest)];
    if(matches.length===1){const current=byId.get(matches[0].id)||[];current.push(entry.phrase);byId.set(matches[0].id,current);}
    else if(matches.length>1&&collisions.length<64)collisions.push({phrase:entry.phrase,targetCount:matches.length,targetIds:matches.slice(0,32).map(item=>digest(item.id).slice(0,32))});
  }
  const pinRows=[],intentRows=[];
  for(const item of resolvedPins){
    const pin=item.pin,usable=['current','moved'].includes(pin.status)&&pin.source&&typeof pin.text==='string',description=`Personal example · ${pin.status}${pin.detail?` · ${String(pin.detail).slice(0,1024)}`:''}`;
    pinRows.push({id:digest(['personal-example',pin.id]).slice(0,32),label:String(pin.label).slice(0,512),kind:'personal-example',status:String(pin.status||'unknown').slice(0,128),description,detail:usable?'Owner-scoped working reference; source compatibility is not inferred.':'Stale reference; review or relink it in My Examples before use.',aliases:(byId.get(item.id)||[]).slice(0,32),sourceLabel:pin.sourceLabel||path.basename(pin.filename||''),compatibility:'authored project source · portability unproven',...(usable?{excerpt:maskedExcerpt(pin.text),comparison:'Personal example bookmark; compare exact source and conditions directly.',source:pin.source}: {})});
  }
  for(const item of canonical){const phrases=byId.get(item.id)||[];if(!phrases.length)continue;const candidate=item.candidate;intentRows.push({id:digest(['intent-example',candidate.id]).slice(0,32),label:candidate.title,kind:candidate.kind,status:'intent match',description:`Intent-matched project block · ${path.basename(candidate.filename)}:${candidate.startLine+1}`,detail:'Matched only deterministic parsed names, block/controller kinds, and masked source tokens; behavior is not inferred.',aliases:phrases.slice(0,32),sourceLabel:path.basename(candidate.filename),compatibility:'authored project source · portability unproven',excerpt:maskedExcerpt(candidate.text),comparison:'Intent metadata match only; inspect conditions and dependencies directly.',source:{filename:candidate.filename,line:candidate.startLine,endLine:candidate.endLine,fingerprint:candidate.fingerprint}});}
  const bounded=Math.max(1,Math.min(48,Number(limit)||48));return{rows:[...pinRows.slice(0,bounded),...intentRows.slice(0,bounded)],collisions,truncated:pinRows.length>bounded||intentRows.length>bounded};
}
function buildSimilarCodeProjection(input={},options={}){
  const limits={...DEFAULT_LIMITS,...options}, documents=[], seen=new Set();let totalBytes=0,truncated=false;
  for(const value of (Array.isArray(input.documents)?input.documents:[]).slice(0,limits.files)){
    if(!value||typeof value.filename!=='string'||typeof value.text!=='string')continue;const filename=canonical(value.filename),key=filename.toLowerCase(),bytes=Buffer.byteLength(value.text,'utf8');
    if(seen.has(key)||bytes>limits.sourceBytes||totalBytes+bytes>limits.totalBytes){truncated=true;continue;}seen.add(key);totalBytes+=bytes;documents.push({filename,text:value.text,languageId:value.languageId});
  }
  const candidates=[];for(const document of documents){if(candidates.length>=limits.candidates){truncated=true;break;}candidates.push(...collectCandidates(document,{...limits,candidates:limits.candidates-candidates.length}));}
  const seed=seedFor(candidates,input.activeSource);
  const discovery=intentExampleDiscovery(candidates,input.personalExamples,input.aliases,limits.results);
  const ranked=seed?candidates.filter(candidate=>candidate.id!==seed.id).map(candidate=>({candidate,score:similarity(seed,candidate)})).filter(item=>item.score>=0.2).sort((left,right)=>right.score-left.score||left.candidate.filename.localeCompare(right.candidate.filename)||left.candidate.startLine-right.candidate.startLine).slice(0,limits.results):[];
  const structural=ranked.map(({candidate,score})=>({id:candidate.id,label:candidate.title,kind:candidate.kind,status:score>=0.7?'close':score>=0.45?'related':'possible',description:`${Math.round(score*100)}% structural similarity · ${path.basename(candidate.filename)}:${candidate.startLine+1}`,detail:dependencyDetail(candidate.dependencies),comparison:comparisonDetail(seed,candidate),excerpt:excerpt(candidate.text),sourceLabel:path.basename(candidate.filename),source:{filename:candidate.filename,line:candidate.startLine,endLine:candidate.endLine,fingerprint:candidate.fingerprint},adaptation:buildAdaptationReview({currentSource:{filename:seed.filename,line:seed.startLine,endLine:seed.endLine,fingerprint:seed.fingerprint},referenceSource:{filename:candidate.filename,line:candidate.startLine,endLine:candidate.endLine,fingerprint:candidate.fingerprint},currentLanguage:seed.language,referenceLanguage:candidate.language,currentDependencies:seed.dependencies,referenceDependencies:candidate.dependencies,target:input.target||{channel:'unknown'}})}));
  const structuralBySource=new Map(structural.map((row,index)=>[`${row.source.filename}:${row.source.line}:${row.source.endLine}`,index])),extras=[];
  for(const row of discovery.rows){const identity=row.source?`${row.source.filename}:${row.source.line}:${row.source.endLine}`:'';if(row.kind!=='personal-example'&&identity&&structuralBySource.has(identity)){const index=structuralBySource.get(identity);structural[index]={...structural[index],aliases:[...new Set([...(structural[index].aliases||[]),...(row.aliases||[])])].slice(0,32)};}else extras.push(row);}
  const pins=extras.filter(row=>row.kind==='personal-example').slice(0,8),intentRows=extras.filter(row=>row.kind!=='personal-example').slice(0,8),reserved=[...pins,...intentRows],structuralBudget=Math.max(0,limits.results-reserved.length),combined=[...structural.slice(0,structuralBudget),...reserved],items=combined.slice(0,limits.results);
  const note=seed?`Compared with ${seed.title} in ${path.basename(seed.filename)}:${seed.startLine+1}. Scores describe static structural similarity, not behavioral equivalence or runtime proof. Intent matches and personal labels are deterministic discovery metadata only.`:'Intent matches and current personal examples remain available. Place the native editor cursor inside a connected StateDef, Function, controller, condition, or loop, then choose Refresh for structural comparison.';
  return Object.freeze({items,count:items.length,truncated:truncated||discovery.truncated||structural.length>structuralBudget||extras.filter(row=>row.kind==='personal-example').length>pins.length||extras.filter(row=>row.kind!=='personal-example').length>intentRows.length||ranked.length>=limits.results,aliasCollisions:discovery.collisions,note,seed:seed?Object.freeze({label:seed.title,kind:seed.kind,excerpt:excerpt(seed.text),source:{filename:seed.filename,line:seed.startLine,endLine:seed.endLine,fingerprint:seed.fingerprint},dependencies:seed.dependencies}):null});
}

module.exports={DEFAULT_LIMITS,COMPARABLE_KINDS,buildSimilarCodeProjection,collectCandidates,seedFor,similarity,dependencySummary,comparisonDetail,maskedExcerpt,intentExampleDiscovery,normalizedIntentAliases};
