'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LIMITS = Object.freeze({ modules: 32, bytes: 1024 * 1024, fileBytes: 256 * 1024 });
const namePattern = '[A-Za-z_][A-Za-z0-9_]*(?:[.:][A-Za-z_][A-Za-z0-9_]*)*';

function maskLua(text) {
  const source=String(text||''),out=[...source];let quote='',escape=false,longClose='',lineComment=false;
  const longOpenAt=index=>{if(source[index]!=='[')return null;let cursor=index+1;while(source[cursor]==='=')cursor+=1;if(source[cursor]!=='[')return null;const equals=source.slice(index+1,cursor);return{length:cursor-index+1,close:`]${equals}]`};};
  for(let index=0;index<source.length;index+=1){
    const value=source[index];
    if(lineComment){if(value==='\n')lineComment=false;else out[index]=' ';continue;}
    if(longClose){if(source.startsWith(longClose,index)){for(let at=index;at<index+longClose.length;at+=1)out[at]=' ';index+=longClose.length-1;longClose='';}else if(value!=='\n'&&value!=='\r')out[index]=' ';continue;}
    if(quote){if(value!=='\n'&&value!=='\r')out[index]=' ';if(escape)escape=false;else if(value==='\\')escape=true;else if(value===quote)quote='';continue;}
    if(source.startsWith('--',index)){const long=longOpenAt(index+2);out[index]=out[index+1]=' ';if(long){for(let at=index+2;at<index+2+long.length;at+=1)out[at]=' ';index+=long.length+1;longClose=long.close;}else{index+=1;lineComment=true;}continue;}
    const long=longOpenAt(index);if(long){for(let at=index;at<index+long.length;at+=1)out[at]=' ';index+=long.length-1;longClose=long.close;continue;}
    if(value==='"'||value==="'"){quote=value;out[index]=' ';}
  }
  return out.join('');
}

function lineAt(source,offset){return (String(source).slice(0,offset).match(/\n/g)||[]).length;}
function documentation(source,line,params){
  const lines=String(source).split(/\r?\n/),comments=[];
  for(let at=line-1;at>=0;at-=1){const match=/^\s*---\s?(.*)$/.exec(lines[at]||'');if(!match)break;comments.unshift(match[1]);}
  const parameterDocs={};for(const value of comments){const match=/^@param\s+([A-Za-z_]\w*)\s*(.*)$/.exec(value);if(match&&params.includes(match[1]))parameterDocs[match[1]]=match[2]||`Authored parameter ${match[1]}.`;}
  return{documentation:comments.filter(value=>!/^@param\b/.test(value)&&!/^@return\b/.test(value)).join(' ').trim(),parameterDocs};
}
function parameters(value){const raw=String(value||'').trim();if(!raw)return[];const parts=raw.split(',').map(item=>item.trim());return parts.every(item=>item==='...'||/^[A-Za-z_]\w*$/.test(item))?parts:null;}
function parseLuaFunctions(text,filename=''){
  const source=String(text||'');if(Buffer.byteLength(source,'utf8')>LIMITS.fileBytes)return Object.freeze({definitions:Object.freeze([]),returnName:'',complete:false,limitations:Object.freeze(['Lua source exceeds the per-file assistance limit.'])});
  const masked=maskLua(source),definitions=[],lines=masked.split(/\r?\n/),depths=[];let depth=0;
  for(let line=0;line<lines.length;line+=1){const code=lines[line],closers=(code.match(/\bend\b|\buntil\b/g)||[]).length,leading=/^\s*(?:end|until)\b/.test(code)?1:0;depth=Math.max(0,depth-leading);depths[line]=depth;const opens=(code.match(/\bfunction\b/g)||[]).length+(/^\s*if\b.*\bthen\b/.test(code)?1:0)+(/^\s*(?:for|while)\b.*\bdo\b/.test(code)?1:0)+(/^\s*do\b/.test(code)?1:0)+(/^\s*repeat\b/.test(code)?1:0);depth=Math.max(0,depth+opens-(closers-leading));}
  const add=(match,assigned)=>{const params=parameters(match[3]);if(!params)return;const name=match[2],start=match.index+match[0].lastIndexOf(name),line=lineAt(source,start),docs=documentation(source,line,params),separator=name.includes(':')?':':name.includes('.')?'.':'';definitions.push(Object.freeze({name,params,varargs:params.at(-1)==='...',local:Boolean(match[1]),assigned,line,start,filename:path.resolve(filename||'.'),separator,topLevel:depths[line]===0,...docs}));};
  const declared=new RegExp(`(?:^|\\n)\\s*(local\\s+)?function\\s+(${namePattern})\\s*\\(([^)]*)\\)`,'g');for(let match=declared.exec(masked);match;match=declared.exec(masked))add(match,false);
  const assigned=new RegExp(`(?:^|\\n)\\s*(local\\s+)?(${namePattern.replace('[.:]','[.]')})\\s*=\\s*function\\s*\\(([^)]*)\\)`,'g');for(let match=assigned.exec(masked);match;match=assigned.exec(masked))add(match,true);
  definitions.sort((a,b)=>a.line-b.line||a.start-b.start);
  const returns=[...masked.matchAll(/(?:^|\n)\s*return\s+([A-Za-z_]\w*)\s*(?:;|\n|$)/g)].map(match=>match[1]);
  const returnName=returns.length===1?returns[0]:'';
  return Object.freeze({definitions:Object.freeze(definitions),returnName,complete:true,limitations:Object.freeze([])});
}

function requireBindings(text){
  const source=String(text||''),masked=maskLua(source),bindings=[];
  const pattern=/(?:^|\n)\s*local\s+([A-Za-z_]\w*)\s*=\s*require\s*(?:\(\s*)?(["'])([^"'\r\n]+)\2\s*\)?/g;
  for(let match=pattern.exec(source);match;match=pattern.exec(source)){
    const requireAt=match.index+match[0].indexOf('require');if(masked.slice(requireAt,requireAt+7)!=='require')continue;
    if(!/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/.test(match[3]))continue;
    bindings.push(Object.freeze({alias:match[1],module:match[3],line:lineAt(source,match.index)}));
  }
  return bindings;
}
function openDocument(vscode,filename){return(vscode.workspace.textDocuments||[]).find(document=>!document.isClosed&&path.resolve(document.fileName||'').toLowerCase()===path.resolve(filename).toLowerCase());}
function readSource(vscode,filename){const document=openDocument(vscode,filename);if(document)return{text:document.getText(),version:document.version,dirty:Boolean(document.isDirty),uri:document.uri};const stat=fs.statSync(filename);if(stat.size>LIMITS.fileBytes)throw new Error('Lua module exceeds the per-file assistance limit.');return{text:fs.readFileSync(filename,'utf8'),version:null,dirty:false,uri:vscode.Uri.file(filename)};}
function resolveModule(vscode,base,moduleName){const relative=moduleName.split('.'),stem=path.join(base,...relative),candidates=[`${stem}.lua`,path.join(stem,'init.lua')].filter(filename=>{if(openDocument(vscode,filename))return true;try{return fs.statSync(filename).isFile();}catch(_){return false;}});return candidates.length===1?path.resolve(candidates[0]):'';}
function projectedRequiredDefinitions(parsed,alias,uri,availableLine){
  if(!parsed.returnName)return[];const root=parsed.returnName;
  return parsed.definitions.flatMap(definition=>{
    if(definition.name===root)return[{...definition,name:alias,sourceName:definition.name,uri,imported:true,availableLine}];
    if(!definition.name.startsWith(`${root}.`)&&!definition.name.startsWith(`${root}:`))return[];
    return[{...definition,name:`${alias}${definition.name.slice(root.length)}`,sourceName:definition.name,uri,imported:true,availableLine}];
  });
}
async function buildLuaFunctionCatalog(vscode,document){
  const filename=path.resolve(document.fileName||document.uri?.fsPath||'.'),source=String(document.getText()||''),local=parseLuaFunctions(source,filename),definitions=local.definitions.filter(item=>item.topLevel).map(item=>({...item,uri:document.uri,imported:false})),limitations=[...(local.limitations||[])],dependencies=[];let bytes=Buffer.byteLength(source,'utf8'),modules=0;
  for(const binding of requireBindings(source)){
    if(++modules>LIMITS.modules){limitations.push('The direct require-module limit was reached.');break;}
    const resolved=resolveModule(vscode,path.dirname(filename),binding.module);if(!resolved){limitations.push(`Require ${binding.module} is not one exact same-folder module.`);continue;}
    try{const loaded=readSource(vscode,resolved);bytes+=Buffer.byteLength(loaded.text,'utf8');if(bytes>LIMITS.bytes){limitations.push('The Lua assistance byte limit was reached.');break;}const parsed=parseLuaFunctions(loaded.text,resolved);if(!parsed.complete){limitations.push(...(parsed.limitations||[]).map(value=>`${binding.module}: ${value}`));continue;}definitions.push(...projectedRequiredDefinitions({...parsed,definitions:parsed.definitions.filter(item=>item.topLevel)},binding.alias,loaded.uri,binding.line));dependencies.push(Object.freeze({filename:resolved,version:loaded.version,dirty:loaded.dirty,hash:crypto.createHash('sha256').update(loaded.text).digest('hex')}));}catch(error){limitations.push(`${binding.module}: ${error.message}`);}
  }
  return Object.freeze({complete:local.complete,definitions:Object.freeze(definitions.map(Object.freeze)),limitations:Object.freeze(limitations),authority:Object.freeze({filename,version:Number.isInteger(document.version)?document.version:null,hash:crypto.createHash('sha256').update(source).digest('hex'),dependencies:Object.freeze(dependencies)})});
}
function luaCatalogStillCurrent(vscode,catalog,document){
  if(!catalog?.complete||!catalog.authority||path.resolve(document.fileName||document.uri?.fsPath||'.').toLowerCase()!==path.resolve(catalog.authority.filename).toLowerCase())return false;const source=String(document.getText()||'');if((Number.isInteger(catalog.authority.version)&&document.version!==catalog.authority.version)||crypto.createHash('sha256').update(source).digest('hex')!==catalog.authority.hash)return false;
  try{for(const expected of catalog.authority.dependencies||[]){const loaded=readSource(vscode,expected.filename);if(loaded.version!==expected.version||loaded.dirty!==expected.dirty||crypto.createHash('sha256').update(loaded.text).digest('hex')!==expected.hash)return false;}}catch(_){return false;}return true;
}

function luaCallAtDocumentPosition(text,line,character){
  const source=String(text||''),lines=source.split(/\r?\n/),wanted=Math.max(0,Math.min(Number(line)||0,lines.length-1));let offset=0;for(let at=0;at<wanted;at+=1)offset+=lines[at].length+1;offset+=Math.max(0,Math.min(Number(character)||0,(lines[wanted]||'').length));
  const code=maskLua(source),stack=[];
  for(let index=0;index<offset;index+=1){const value=code[index];if(value==='('){const match=new RegExp(`(${namePattern})\\s*$`).exec(code.slice(0,index));stack.push(match?{name:match[1],open:index,activeParameter:0,nesting:0}:null);for(const item of stack.slice(0,-1))if(item)item.nesting+=1;}else if(value==='['||value==='{'){for(const item of stack)if(item)item.nesting+=1;}else if(value===')'){stack.pop();for(const item of stack)if(item)item.nesting=Math.max(0,item.nesting-1);}else if(value===']'||value==='}'){for(const item of stack)if(item)item.nesting=Math.max(0,item.nesting-1);}else if(value===','&&stack.at(-1)&&stack.at(-1).nesting===0)stack.at(-1).activeParameter+=1;}
  const call=[...stack].reverse().find(Boolean)||null;return call?{...call,line:wanted}:null;
}
function luaCompletionContext(text,line,character){const lines=String(text||'').split(/\r?\n/),value=String(lines[line]||'').slice(0,Math.max(0,Number(character)||0)),match=new RegExp(`(${namePattern})$`).exec(maskLua(value));if(!match||/\bfunction\s+$/.test(maskLua(value.slice(0,match.index))))return null;return{name:match[1],prefix:match[1],line,start:match.index,end:value.length,hasArguments:false};}
function luaSymbolAt(text,line,character){const lines=String(text||'').split(/\r?\n/),value=String(lines[line]||''),at=Math.max(0,Math.min(Number(character)||0,value.length));let start=at,end=at;while(start>0&&/[A-Za-z0-9_.:]/.test(value[start-1]))start-=1;while(end<value.length&&/[A-Za-z0-9_.:]/.test(value[end]))end+=1;const name=value.slice(start,end);return new RegExp(`^${namePattern}$`).test(name)?{name,line,start,end}:null;}
function definitionsFor(catalog,name='',line=Number.MAX_SAFE_INTEGER){const wanted=String(name||'').toLowerCase(),at=Number.isSafeInteger(line)?line:Number.MAX_SAFE_INTEGER;return(catalog?.definitions||[]).filter(item=>item.topLevel!==false&&(!wanted||item.name.toLowerCase()===wanted)&&(!item.imported||!Number.isSafeInteger(item.availableLine)||at>=item.availableLine)&&(!item.local||item.imported||at>=item.line));}

module.exports={LIMITS,maskLua,parseLuaFunctions,requireBindings,buildLuaFunctionCatalog,luaCatalogStillCurrent,luaCallAtDocumentPosition,luaCompletionContext,luaSymbolAt,definitionsFor};
