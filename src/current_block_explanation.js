'use strict';

const crypto = require('crypto');
const path = require('path');
const { parseCodeStructure, flatten } = require('./code_structure_model');
const { dependencySummary } = require('./similar_code_model');
const { explanationFor } = require('./diagnostic_explanations');

const LIMITS = Object.freeze({ sourceBytes:4*1024*1024, projectionBytes:128*1024, entries:256, textBytes:2048 });
const KINDS = new Set(['state','function','controller','condition','loop']);
const DEPENDENCY_LABELS = Object.freeze({ functions:'Function', maps:'Map', constants:'Constant', commands:'Command', states:'StateDef', animations:'Animation', sounds:'Sound', helpers:'Helper ID', explods:'Explod ID', projectiles:'Projectile ID' });

function digest(value) { return crypto.createHash('sha256').update(String(value ?? '')).digest('hex'); }
function plain(value) { return Boolean(value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype); }
function clean(value, max = LIMITS.textBytes) {
  const normalized=String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
  if(Buffer.byteLength(normalized,'utf8')<=max)return normalized;
  let output='';for(const character of normalized){if(Buffer.byteLength(output+character,'utf8')>max-3)break;output+=character;}return `${output}…`;
}
function maskStrings(value){return clean(String(value||'').replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,'[string literal]'),1024);}
function languageFor(filename, supplied='') { const value=String(supplied||'').toLowerCase(),extension=path.extname(filename).toLowerCase(); return value==='lua'||extension==='.lua'?'lua':value==='cns'||value==='ikemen-cns'||['.cns','.st'].includes(extension)?'cns':'zss'; }
function structuralCode(line,language){
  const source=String(line||''),result=[];let quote='',escaped=false;
  for(let index=0;index<source.length;index+=1){
    const character=source[index],next=source[index+1]||'';
    if(quote){if(escaped){escaped=false;continue;}if(character==='\\'){escaped=true;continue;}if(character===quote)quote='';continue;}
    if(character==='"'||character==="'"){quote=character;continue;}
    if(language==='zss'&&character==='#')break;
    if(language==='cns'&&character===';')break;
    if(language==='lua'&&character==='-'&&next==='-')break;
    result.push(character);
  }
  return result.join('');
}
function boundedCatalogMembership(entries=[],baseComplete=false,limit=4096){
  const known={},safeLimit=Math.max(1,Math.min(4096,Number(limit)||4096));let complete=baseComplete===true;
  for(const category of ['functions','states','commands']){
    const values=(Array.isArray(entries)?entries:[]).filter(item=>item?.category===category&&item.declarations>0).map(item=>item.name);
    if(values.length>safeLimit)complete=false;
    known[category]=values.slice(0,safeLimit);
  }
  return{complete,known};
}
function smallest(root,line){return flatten(root).filter(node=>KINDS.has(node.kind)&&node.startLine<=line&&node.endLine>=line).sort((left,right)=>(left.endLine-left.startLine)-(right.endLine-right.startLine)||right.startLine-left.startLine)[0]||null;}
function descendants(node){const result=[],stack=[...(node.children||[])];while(stack.length&&result.length<LIMITS.entries){const current=stack.shift();result.push(current);stack.unshift(...(current.children||[]));}return result;}
function dependencyRows(blockText,catalog={}){
  const summary=dependencySummary(blockText),known=plain(catalog.known)?catalog.known:{},complete=catalog.complete===true,rows=[];
  for(const [key,label] of Object.entries(DEPENDENCY_LABELS))for(const raw of (summary[key]||[]).slice(0,LIMITS.entries-rows.length)){
    const value=clean(raw,256);if(!value)continue;
    const resolvable=['functions','states','commands'].includes(key),available=Array.isArray(known[key])?new Set(known[key].map(item=>String(item).toLowerCase())):null;
    let status='observed literal reference';
    if(resolvable&&complete&&available)status=available.has(value.toLowerCase())?'resolved in complete assigned catalog':'unresolved in complete assigned catalog';
    else if(resolvable)status='resolution unknown — assigned catalog incomplete';
    rows.push({id:digest(['dependency',key,value]).slice(0,32),kind:key,label,value,status,unresolved:status.startsWith('unresolved')});
  }
  return rows.slice(0,LIMITS.entries);
}
function diagnosticRows(diagnostics,node,filename,fingerprint){
  const rows=[];
  for(const [index,value] of (Array.isArray(diagnostics)?diagnostics:[]).entries()){
    if(!plain(value))continue;const start=Math.max(0,Number(value.startLine??value.line)||0),end=Math.max(start,Number(value.endLine??value.range?.end?.line??start)||start);
    if(start>node.endLine||end<node.startLine)continue;
    const code=clean(typeof value.code==='object'?value.code?.value:value.code||'diagnostic',256),message=clean(value.message||'Diagnostic',2048),explanation=explanationFor(code);
    rows.push({id:digest(['diagnostic',index,start,end,code,message]).slice(0,32),kind:'diagnostic',severity:clean(value.severity||'Information',64),code,message,meaning:clean(explanation?.[1]||'',2048),steps:(explanation?.[2]||[]).slice(0,8).map(step=>clean(step,512)),source:{filename,line:start,endLine:end,fingerprint}});
    if(rows.length>=LIMITS.entries)break;
  }
  return rows;
}
function buildCurrentBlockExplanation(input={}){
  if(!plain(input)||typeof input.filename!=='string'||!path.isAbsolute(input.filename)||typeof input.text!=='string'||!Number.isSafeInteger(input.line)||input.line<0)return Object.freeze({ok:false,reason:'Open a connected ZSS, CNS/ST, or Lua source and place the caret inside a supported block.'});
  const bytes=Buffer.byteLength(input.text,'utf8');if(bytes>LIMITS.sourceBytes)return Object.freeze({ok:false,reason:'This source exceeds the 4 MiB explanation limit.'});
  const filename=path.resolve(input.filename),language=languageFor(filename,input.language);
  let braceDepth=0,maxBraceDepth=0;for(const line of input.text.split(/\r?\n/)){for(const character of structuralCode(line,language)){if(character==='{')maxBraceDepth=Math.max(maxBraceDepth,++braceDepth);else if(character==='}')braceDepth=Math.max(0,braceDepth-1);}if(maxBraceDepth>128)return Object.freeze({ok:false,reason:'This source exceeds the supported nested-block depth.'});}
  const fingerprint=digest(input.text);if(input.fingerprint&&input.fingerprint!==fingerprint)return Object.freeze({ok:false,reason:'The source changed before explanation could be built.'});
  const root=parseCodeStructure(input.text,language,filename),node=smallest(root,input.line);
  if(!node)return Object.freeze({ok:false,reason:'No supported StateDef, function, controller, condition, or loop contains the caret.'});
  const lines=input.text.split(/\r?\n/),blockText=lines.slice(node.startLine,node.endLine+1).join('\n'),children=descendants(node),counts={};for(const child of children)counts[child.kind]=(counts[child.kind]||0)+1;
  const conditions=children.filter(child=>child.kind==='condition').slice(0,64).map((child,index)=>({id:digest(['condition',child.startLine,index]).slice(0,32),line:child.startLine,label:maskStrings(child.signature||child.title||'condition')}));
  const actions=children.filter(child=>['controller','call','assignment'].includes(child.kind)).slice(0,96).map((child,index)=>({id:digest(['action',child.kind,child.startLine,index]).slice(0,32),line:child.startLine,kind:child.kind,label:maskStrings(child.title||child.signature||child.kind)}));
  const dependencies=dependencyRows(blockText,input.catalog),diagnostics=diagnosticRows(input.diagnostics,node,filename,fingerprint),unresolved=dependencies.filter(item=>item.unresolved);
  const target=plain(input.target)?{channel:clean(input.target.channel||'',64),version:clean(input.target.version||'',128),buildId:clean(input.target.buildId||'',256),commit:clean(input.target.commit||'',128),capabilityFingerprint:/^[a-f0-9]{64}$/i.test(input.target.capabilityFingerprint||'')?input.target.capabilityFingerprint.toLowerCase():''}:{};
  const diagnosticsComplete=input.diagnosticsComplete!==false,diagnosticsOmittedCount=diagnosticsComplete?0:Math.max(1,Number(input.diagnosticsOmittedCount)||1);
  const note=!diagnosticsComplete?'Diagnostic review is incomplete because the bounded intake omitted additional native Problems. No clean result is claimed.':diagnostics.length||unresolved.length?'Confirmed source evidence is listed below. Runtime reachability and gameplay behavior remain unproven.':'No confirmed local blocker was found. This is static source review, not runtime proof.';
  const projection={schema:'ikemaker.current-block-explanation',version:1,ok:true,id:digest([filename,fingerprint,input.version,input.line,node.kind,node.startLine,node.endLine,target]),contextKey:clean(input.contextKey||'',1024),filename,fingerprint,documentVersion:Number.isSafeInteger(input.version)?input.version:-1,caretLine:input.line,language,node:{kind:node.kind,title:clean(node.title||node.kind,512),signature:maskStrings(node.signature||''),startLine:node.startLine,endLine:node.endLine,purpose:clean(node.doc?.summary||'A parsed code block in the active connected source.',2048)},structure:{counts,conditions,actions},dependencies,diagnostics,diagnosticsComplete,diagnosticsOmittedCount,catalogComplete:input.catalog?.complete===true,target,nightlyStringsEnabled:input.nightlyStringsEnabled===true,note};
  if(Buffer.byteLength(JSON.stringify(projection),'utf8')>LIMITS.projectionBytes)throw new RangeError('Current block explanation exceeds its 128 KiB projection limit.');
  return Object.freeze(projection);
}

module.exports={LIMITS,KINDS,buildCurrentBlockExplanation,smallest,maskStrings,structuralCode,boundedCatalogMembership};
