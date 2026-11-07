'use strict';

const { createHash } = require('crypto');
const triggerCatalog = require('./trigger_catalog_normalization').normalizeTriggerCatalog(require('../data/triggers.json'));
const {argumentSlot,argumentSummary}=require('./trigger_argument_model');
const {luaCatalogFor,luaApiSignatureHelp}=require('./lua_target_catalog');
const { completionModels, hoverModel, luaCompletionModels, luaHoverModel } = require('./language_intelligence');
const { commandReferenceAtPosition } = require('./command_reference_model');
const { functionCallAtPosition, functionCallAtDocumentPosition, functionDefinitions, symbolAt, referencesFor: symbolReferencesFor, definitionsFor: symbolDefinitionsFor } = require('./zss_navigation');
const { assetReferenceContext, sharedAssetSource } = require('./zss_asset_catalog');
const { stateDestinationContext, stateSymbolAt } = require('./state_transfer_model');
const { collectRecords } = require('./analyzer');
const { filterAvailable, enabledCapabilityIds } = require('./catalog_capability_filter');
const { referenceCapability } = require('./project_reference_context');
const { parseLuaFunctions, luaCallAtDocumentPosition, luaCompletionContext, luaSymbolAt, definitionsFor: luaDefinitionsFor } = require('./lua_function_catalog');
const {capabilityFingerprint}=require('./capability_fingerprint');

const FUNCTION_CALL_CONTEXT_CACHE_LIMIT=256,functionCallContextCache=new Map();
function sourceFingerprint(document){return createHash('sha256').update(String(document?.getText?.()||'')).digest('hex');}
function boundedFunctionCallContext(document,position,capabilities={}){
  const source=String(document.getText()||''),allLines=source.split(/\r?\n/),targetLine=Math.max(0,Math.min(Number(position.line)||0,allLines.length-1));let startLine=Math.max(0,targetLine-255),windowLines=allLines.slice(startLine,targetLine+1),windowText=windowLines.join('\n');
  while(windowText.length>65536&&startLine<targetLine){windowLines.shift();startLine+=1;windowText=windowLines.join('\n');}
  const version=Number.isInteger(document.version)?document.version:null,key=version===null?'':`${String(document.uri?.toString?.()||document.fileName||'document')}\0${version}\0${targetLine}\0${position.character}\0${capabilityFingerprint(capabilities)}`;
  if(key&&functionCallContextCache.has(key))return functionCallContextCache.get(key);
  const call=functionCallAtDocumentPosition(windowText,targetLine-startLine,position.character),result=call?{...call,line:call.line+startLine}:null;
  if(key){functionCallContextCache.set(key,result);while(functionCallContextCache.size>FUNCTION_CALL_CONTEXT_CACHE_LIMIT)functionCallContextCache.delete(functionCallContextCache.keys().next().value);}
  return result;
}

function domainFor(document) {
  if (document.languageId === 'lua') return 'lua';
  return document.languageId === 'ikemen-cns' ? 'cns' : 'zss';
}

function experienceFor(vscode, document) {
  return vscode.workspace.getConfiguration('ikemenZss', document.uri)
    .get(`experience.${domainFor(document)}`, 'learning');
}

function markdown(vscode, model) {
  const value = new vscode.MarkdownString(undefined, true);
  value.isTrusted = false;
  value.appendMarkdown(`### ${model.title}\n\n`);
  if (model.summary) value.appendMarkdown(`${model.summary}\n\n`);
  if (model.explanation) value.appendMarkdown(`**Learning note:** ${model.explanation}\n\n`);
  value.appendMarkdown(model.documentationLabel || 'Bundled IKEMEN 1.0 documentation.');
  if (model.url) value.appendMarkdown(` [Official online reference](${model.url})`);
  return value;
}

function completionKind(vscode, kind) {
  if (kind === 'controller') return vscode.CompletionItemKind.Class;
  if (kind === 'parameter') return vscode.CompletionItemKind.Property;
  if (kind === 'redirection') return vscode.CompletionItemKind.Reference;
  if (kind === 'luaFunction') return vscode.CompletionItemKind.Function;
  return vscode.CompletionItemKind.Function;
}

function makeCompletion(vscode, model, index) {
  const item = new vscode.CompletionItem(model.label, completionKind(vscode, model.kind));
  item.detail = model.detail;
  item.documentation = model.documentation;
  item.insertText = new vscode.SnippetString(model.insertText);
  if (model.filterText) item.filterText = model.filterText;
  item.sortText = `${model.kind === 'parameter' ? '0' : model.kind === 'controller' ? '1' : '2'}-${String(index).padStart(4, '0')}-${model.label}`;
  return item;
}

function commandReferencePrefix(linePrefix, languageId = 'zss') {
  const source = String(linePrefix || '');
  const reference = commandReferenceAtPosition(source, source.length, { semicolonComments: languageId === 'ikemen-cns' });
  return reference && reference.end === source.length ? reference.name : null;
}

function commandNameCompletions(vscode, names, prefix) {
  const folded = String(prefix || '').toLowerCase();
  return [...new Set((Array.isArray(names) ? names : []).map(String).filter(Boolean))]
    .filter(name => !folded || name.toLowerCase().includes(folded))
    .map((name, index) => {
      const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Reference);
      item.detail = 'Character command · exact defined name';
      item.documentation = 'Uses the exact name from this character’s resolved CMD/INP/JNP catalog. Choosing it does not rename or rewrite the command definition.';
      item.insertText = name;
      item.filterText = name;
      item.sortText = `0-command-${String(index).padStart(4, '0')}-${name}`;
      return item;
    });
}

function commandCatalogValue(provider, document) {
  const value = provider(document);
  return Array.isArray(value) ? { names: value, definitions: [] } : value || { names: [], definitions: [] };
}

function commandReferenceHover(vscode, reference, catalog) {
  const definitions = (catalog.definitions || []).filter(item => item.name === reference.name);
  if (!definitions.length) return undefined;
  const clean = value => String(value == null ? '' : value).replace(/`/g, '\\`');
  const content = new vscode.MarkdownString(undefined, true); content.isTrusted = false;
  content.appendMarkdown(`### Command \`${clean(reference.name)}\`\n\n`);
  content.appendMarkdown(`${definitions.length} exact native definition${definitions.length === 1 ? '' : 's'} in the resolved character catalog.\n\n`);
  for (const definition of definitions){content.appendMarkdown(`- \`${clean(definition.command || '(empty)')}\` — ${definition.time}f total, ${definition.stepTime}f step window · ${clean(String(definition.file || '').split(/[\\/]/).pop())}:${definition.line + 1}\n`);if(definition.documentation)content.appendMarkdown(`  - Authored documentation: ${clean(definition.documentation)}\n`);}
  content.appendMarkdown('\nIKEMaker does not merge or choose between same-name definitions.');
  return new vscode.Hover(content);
}

function uriLabel(uri) {
  const value = String(uri?.fsPath || uri?.path || uri?.toString?.() || 'open ZSS');
  return value.split(/[\\/]/).pop() || value;
}

function functionSnippet(vscode, definition, nameOnly = false) {
  if (nameOnly) return definition.name;
  const escaped = value => String(value || 'value').replace(/[}$\\]/g, '\\$&').replace(/[\r\n]+/g, ' ');
  const parameters = (definition.params || []).map((parameter, index) => `\${${index + 1}:${escaped(parameter)}}`).join(', ');
  return new vscode.SnippetString(`${definition.name}(${parameters})`);
}

function functionCallCompletions(vscode, call, entries, options={}) {
  const folded = String(call?.prefix || '').toLowerCase(), definitions = functionDefinitions(entries);
  const distinct = new Map();
  for (const definition of definitions) {
    if (folded && !definition.name.toLowerCase().includes(folded)) continue;
    const key = `${definition.name}\0${definition.signature}`;
    if (!distinct.has(key)) distinct.set(key, { definition, count: 0, locations: [] });
    const item = distinct.get(key); item.count += 1; item.locations.push(`${uriLabel(definition.uri)}:${definition.line + 1}`);
  }
  return [...distinct.values()].sort((left, right) => left.definition.name.localeCompare(right.definition.name, undefined, { sensitivity: 'base' }) || left.definition.signature.localeCompare(right.definition.signature)).map((group, index) => {
    const definition = group.definition, item = new vscode.CompletionItem(definition.name, vscode.CompletionItemKind.Function);
    item.detail = `Authored ZSS function · ${definition.name}${definition.signature}${group.count > 1 ? ` · ${group.count} matching declarations` : ''}`;
    item.documentation = `${definition.documentation?`Authored documentation: ${definition.documentation} `:''}Parameters come from the authored declaration; IKEMaker does not invent argument values. Source: ${group.locations.join(', ')}.`;
    item.insertText = functionSnippet(vscode, definition, call.hasArguments);
    item.filterText = `${definition.name} ${(definition.params || []).join(' ')}`;
    item.sortText = `0-function-${String(index).padStart(4, '0')}-${definition.name}`;
    item.range = new vscode.Range(call.line, call.start, call.line, call.end);
    return item;
  });
}

function functionCallHover(vscode, call, entries, capabilities={}) {
  const allowStrings=enabledCapabilityIds(capabilities).has('zss.runtime-strings'),definitions = functionDefinitions(entries, call.name);
  if (!definitions.length) return undefined;
  const clean = value => String(value == null ? '' : value).replace(/`/g, '\\`'), content = new vscode.MarkdownString(undefined, true); content.isTrusted = false;
  content.appendMarkdown(`### Authored function \`${clean(call.name)}\`\n\n`);
  content.appendMarkdown(`${definitions.length} matching declaration${definitions.length === 1 ? '' : 's'} in the live ZSS index.\n\n`);
  for (const definition of definitions) {content.appendMarkdown(`- \`${clean(definition.displaySignature || definition.name + definition.signature)}\` · source \`${clean(definition.sourceSignature || `[Function ${definition.name}${definition.signature}]`)}\` · ${clean(uriLabel(definition.uri))}:${definition.line + 1}\n`);if(definition.documentation)content.appendMarkdown(`  - Authored documentation: ${clean(definition.documentation)}\n`);}
  const calls=(entries||[]).flatMap(entry=>(entry.records||collectRecords(entry.text||'',entry.uri?.fsPath||'')).calls||[]).filter(record=>String(record.name||'').toLowerCase()===String(call.name||'').toLowerCase()),positions=[];
  for(const record of calls)for(let index=0;index<(record.argumentKinds||[]).length;index+=1){const kind=record.argumentKinds[index];if(!kind||kind==='unknown'||kind==='string'&&!allowStrings)continue;if(!positions[index])positions[index]={kinds:new Set(),summaries:new Set()};positions[index].kinds.add(kind);const summary=record.argumentSummaries?.[index];if(summary)positions[index].summaries.add(summary);}
  const observed=positions.flatMap((position,index)=>position?[{index,kinds:[...position.kinds].sort(),summaries:[...position.summaries].slice(0,4)}]:[]);
  if(observed.length){content.appendMarkdown('\nObserved authored call-site kinds (source evidence only):\n');for(const position of observed){content.appendMarkdown(`- Argument ${position.index+1}: **${position.kinds.map(clean).join(' / ')}**`);if(position.summaries.length)content.appendMarkdown(` · ${position.summaries.map(clean).join('; ')}`);content.appendMarkdown('\n');}}
  content.appendMarkdown('\nArgument placeholders and signature help come from these declarations; IKEMaker does not choose defaults or rewrite an existing call.');
  return new vscode.Hover(content, new vscode.Range(call.line, call.start, call.line, call.end));
}

function functionSignatureHelp(call, entries, capabilities={}) {
  const definitions = functionDefinitions(entries, call.name);
  if (!definitions.length || !call.hasArguments) return undefined;
  const allowStrings=enabledCapabilityIds(capabilities).has('zss.runtime-strings'),calls=(entries||[]).flatMap(entry=>(entry.records||collectRecords(entry.text||'',entry.uri?.fsPath||'')).calls||[]).filter(record=>String(record.name||'').toLowerCase()===String(call.name||'').toLowerCase());
  const evidence=(position)=>{const kinds=[...new Set(calls.map(record=>record.argumentKinds?.[position]).filter(kind=>kind&&kind!=='unknown'&&(allowStrings||kind!=='string')))].sort();if(!kinds.length)return'';const status=kinds.length===1?kinds[0].toUpperCase():'MIXED';return `\n\n${status} · inferred from ${calls.filter(record=>record.argumentKinds?.[position]&&record.argumentKinds[position]!=='unknown').length} authored call site(s); this is evidence, not a declared type.`;};
  const signatures = definitions.map(definition => ({
    label: definition.displaySignature || `${definition.name}${definition.signature}`,
    documentation: `AUTHORED · ${definition.sourceSignature || `[Function ${definition.name}${definition.signature}]`} · ${uriLabel(definition.uri)}:${definition.line + 1}. Arguments and returns are untyped variable names; IKEMaker does not invent declared types or defaults.${definitions.length>1?' AMBIGUOUS: multiple declarations are visible and the first compiled declaration is not proven here.':''}`,
    parameters: (definition.params || []).map((parameter,index) => ({ label: parameter, documentation: `${definition.parameterDocs?.[parameter]||`Authored parameter ${parameter}.`}${evidence(index)}` }))
  }));
  return { signatures, activeSignature: 0, activeParameter: Math.min(call.activeParameter, Math.max(0, ...signatures.map(signature => signature.parameters.length - 1))) };
}
function luaFunctionCompletions(vscode,context,catalog){
  if(!context)return[];const folded=String(context.prefix||'').toLowerCase(),seen=new Set();return luaDefinitionsFor(catalog,'',context.line).filter(definition=>definition.name.toLowerCase().startsWith(folded)&&!seen.has(definition.name.toLowerCase())&&seen.add(definition.name.toLowerCase())).map((definition,index)=>{const item=new vscode.CompletionItem(definition.name,vscode.CompletionItemKind.Function),params=definition.params||[];item.detail=`Authored Lua function · ${definition.imported?'exact required module':'current source'}`;item.documentation=`${definition.documentation?`${definition.documentation} `:''}Authored at ${uriLabel(definition.uri)}:${definition.line+1}. Parameters are source names; IKEMaker does not invent values or execute Lua.`;item.insertText=new vscode.SnippetString(`${definition.name}(${params.map((name,at)=>`\${${at+1}:${name==='...'?'values':name}}`).join(', ')})`);item.filterText=`${definition.name} ${params.join(' ')}`;item.sortText=`0-lua-user-${String(index).padStart(4,'0')}-${definition.name}`;item.range=new vscode.Range(context.line,context.start,context.line,context.end);return item;});
}
function luaFunctionHover(vscode,symbol,catalog){
  const definitions=luaDefinitionsFor(catalog,symbol?.name,symbol?.line);if(!definitions.length)return undefined;const content=new vscode.MarkdownString(undefined,true);content.isTrusted=false;content.appendMarkdown(`### Authored Lua function \`${String(symbol.name).replace(/`/g,'\\`')}\`\n\n`);for(const definition of definitions){content.appendMarkdown(`- \`${definition.name}(${(definition.params||[]).join(', ')})\` · ${definition.imported?'required module':'current source'} · \`${uriLabel(definition.uri)}:${definition.line+1}\`\n`);if(definition.documentation)content.appendMarkdown(`  - ${definition.documentation.replace(/`/g,'\\`')}\n`);}content.appendMarkdown('\nLua parameters are dynamically typed. This is source assistance only; IKEMaker does not execute the function or infer a runtime return value.');return new vscode.Hover(content,new vscode.Range(symbol.line,symbol.start,symbol.line,symbol.end));
}
function luaFunctionSignatureHelp(call,catalog){
  const definitions=luaDefinitionsFor(catalog,call?.name,call?.line);if(!definitions.length)return undefined;const signatures=definitions.map(definition=>({label:`${definition.name}(${(definition.params||[]).join(', ')})`,documentation:`AUTHORED Lua · ${definition.imported?'exact direct require':'current source'} · ${uriLabel(definition.uri)}:${definition.line+1}. Dynamic parameters have no declared types or invented defaults.`,parameters:(definition.params||[]).map(parameter=>({label:parameter,documentation:definition.parameterDocs?.[parameter]||(`${parameter==='...'?'Authored variable argument list':`Authored parameter ${parameter}`}.`)}))}));const maximum=Math.max(0,...signatures.map(signature=>signature.parameters.length-1)),active=definitions.some(definition=>definition.varargs)&&call.activeParameter>maximum?maximum:Math.min(call.activeParameter,maximum);return{signatures,activeSignature:0,activeParameter:active};
}
function expressionCallAtPosition(line,character,options={}){
  const source=String(line||''),limit=Math.max(0,Math.min(Number(character)||0,source.length)),stack=[];let quote='';
  for(let index=0;index<limit;index+=1){const value=source[index];if(quote){if(value===quote&&source[index-1]!=='\\')quote='';continue;}if(value==='"'||value==="'"){quote=value;continue;}if(value==='#'||options.semicolonComments&&value===';')return null;if(value==='('){const before=source.slice(0,index),match=/([A-Za-z_][A-Za-z0-9_.]*)\s*$/.exec(before);stack.push({name:match?.[1]||'',open:index,activeParameter:0,depth:0});for(const parent of stack.slice(0,-1))parent.depth+=1;}else if(value===')'){stack.pop();for(const parent of stack)parent.depth=Math.max(0,parent.depth-1);}else if(value===','&&stack.length&&stack.at(-1).depth===0)stack.at(-1).activeParameter+=1;}
  const call=[...stack].reverse().find(value=>value.name);return call||null;
}
function triggerSignatureHelp(call,triggers=triggerCatalog,capabilities={}){
  if(!call?.name)return undefined;const entry=(triggers||[]).find(value=>String(value.name||'').toLowerCase()===call.name.toLowerCase()),signature=String(entry?.signature||'');if(!entry||!signature.includes('(')||!signature.includes(')'))return undefined;
  const parameters=signature.slice(signature.indexOf('(')+1,signature.lastIndexOf(')')).split(',').map(value=>value.trim()).filter(Boolean),activeParameter=Math.min(call.activeParameter,Math.max(0,parameters.length-1));return{signatures:[{label:signature,documentation:`${entry.description||'Bundled documented IKEMEN expression.'} ${argumentSummary(entry,capabilities)} Source: ${entry.source||'bundled IKEMEN documentation'}.`,parameters:parameters.map((parameter,position)=>{const slot=argumentSlot(entry,position,capabilities);return{label:parameter,documentation:slot?`${slot.meaning||`Documented ${entry.name} argument: ${slot.name}.`} Expected: ${slot.type}.${slot.choices.length?` Known values: ${slot.choices.map(choice=>`${choice.value} — ${choice.meaning||choice.type}`).join('; ')}.`:''}${slot.allowExpression?' An editable expression may also be entered.':''}`:`Documented ${entry.name} argument: ${parameter}. IKEMaker does not choose its value.`};})}],activeSignature:0,activeParameter};
}

function functionCatalog(provider, document) {
  try { return Promise.resolve(provider(document)).then(value => value?.complete ? value : { complete: false, entries: [] }).catch(() => ({ complete: false, entries: [] })); }
  catch (_) { return Promise.resolve({ complete: false, entries: [] }); }
}

function assetCatalog(provider, document) {
  try { return Promise.resolve(provider(document)).catch(() => ({ kinds: {} })); }
  catch (_) { return Promise.resolve({ kinds: {} }); }
}

function stateCatalog(provider, document) {
  try { return Promise.resolve(provider(document)).then(value => value?.complete ? value : { complete: false, definitions: [] }).catch(() => ({ complete: false, definitions: [] })); }
  catch (_) { return Promise.resolve({ complete: false, definitions: [] }); }
}
function luaFunctionCatalog(provider,document){try{return Promise.resolve(provider(document)).then(value=>Array.isArray(value?.definitions)?value:{complete:false,definitions:[]}).catch(()=>({complete:false,definitions:[]}));}catch(_){return Promise.resolve({complete:false,definitions:[]});}}

function stateCompletions(vscode, context, catalog) {
  if (!catalog?.complete || !/^[+-]?\d*$/.test(String(context.prefix || '').trim())) return [];
  const first = new Map();
  for (const definition of catalog.definitions || []) if (definition.value >= 0 && !first.has(definition.value)) first.set(definition.value, definition);
  return [...first.values()].sort((left, right) => left.value - right.value).map((definition, index) => {
    const label = String(definition.value), item = new vscode.CompletionItem(label, vscode.CompletionItemKind.Reference);
    item.detail = `Runtime StateDef ${label} · ${definition.role} · compile position ${definition.order + 1}`;
    item.documentation = `${definition.documentation?`Authored documentation: ${definition.documentation} `:''}Exact nonnegative StateDef from ${uriLabel(definition.uri)}:${definition.line + 1}. The list follows the proven character/common-state compile catalog and changes only this recognized destination field.`;
    item.insertText = label; item.filterText = label; item.sortText = `0-state-${String(index).padStart(6, '0')}-${label}`;
    item.range = new vscode.Range(context.line, context.start, context.line, context.end); return item;
  });
}

function stateReferenceHover(vscode,symbol,catalog){
  if(!symbol||!catalog?.complete)return undefined;
  const definitions=(catalog.definitions||[]).filter(item=>item.value===symbol.value);if(!definitions.length)return undefined;
  const clean=value=>String(value==null?'':value).replace(/`/g,'\\`'),content=new vscode.MarkdownString(undefined,true);content.isTrusted=false;
  content.appendMarkdown(`### Runtime StateDef \`${symbol.value}\`\n\n`);
  content.appendMarkdown(`${definitions.length} exact declaration${definitions.length===1?'':'s'} in runtime compile order. ${symbol.type==='declaration'?'This is a declaration site.':'This literal destination resolves through the owning character catalog.'}\n\n`);
  definitions.forEach((definition,index)=>{content.appendMarkdown(`- ${index===0?'**active candidate**':'shadowed candidate'} · \`${clean(uriLabel(definition.uri))}:${definition.line+1}\` · ${clean(definition.role)} · compile position ${definition.order+1}\n`);if(definition.documentation)content.appendMarkdown(`  - Authored documentation: ${clean(definition.documentation)}\n`);});
  if(definitions.length>1)content.appendMarkdown('\nMultiple declarations remain visible; IKEMaker does not silently merge them.');
  const record=symbol.record;return new vscode.Hover(content,new vscode.Range(record.line,record.character,record.endLine,record.endCharacter));
}

function scopedLocalAt(text,filename,line,character){
  const collected=collectRecords(String(text||''),filename),records=collected.locals||[],occurrence=records.find(record=>record.line===line&&character>=record.start&&character<=record.start+record.name.length+(record.sigil?1:0));
  if(!occurrence)return null;const related=records.filter(record=>record.identity===occurrence.identity),declaration=related.find(record=>record.declaration);
  return{occurrence,declaration,related,records:collected};
}
function currentSourceParameterFlow(symbol,allowStrings){
  const declaration=symbol?.declaration;if(!declaration||declaration.localKind!=='parameter'||declaration.ownerKind!=='function')return null;
  const functions=(symbol.records?.functions||[]).filter(record=>record.name.toLowerCase()===String(declaration.ownerName||'').toLowerCase()&&record.line===declaration.ownerLine);
  if(functions.length!==1)return null;
  const position=(functions[0].params||[]).findIndex(param=>String(typeof param==='string'?param:param?.name||'').toLowerCase()===declaration.name.toLowerCase());if(position<0)return null;
  const calls=(symbol.records?.calls||[]).filter(record=>record.name.toLowerCase()===functions[0].name.toLowerCase()&&position<(record.argumentKinds||[]).length),kinds=[...new Set(calls.map(record=>record.argumentKinds[position]).filter(kind=>kind&&kind!=='unknown'&&(allowStrings||kind!=='string'))) ].sort(),summaries=[...new Set(calls.map(record=>(record.argumentSummaries||[])[position]).filter(value=>value&&(allowStrings||!/^string literal/i.test(value))))].slice(0,6);
  return kinds.length?{kinds,summaries,callSites:calls.length}:null;
}
function directStringReturnEvidence(sites,entries){
  const declarations=new Map(),sources=[];
  for(const entry of entries||[]){
    const records=entry.records||collectRecords(entry.text||'',entry.uri?.fsPath||entry.filename||'');
    sources.push(records);
    for(const record of records.functions||[]){
      const key=String(record.name||'').toLowerCase();if(!key)continue;
      if(!declarations.has(key))declarations.set(key,[]);declarations.get(key).push(record);
    }
  }
  const exact=new Map();
  for(const [key,records] of declarations)if(records.length===1&&(records[0].returns||[]).length===1){const declaration=records[0],name=declaration.returns[0],writes=sources.flatMap(source=>source.locals||[]).filter(local=>local.ownerKind==='function'&&local.ownerName===declaration.name&&local.ownerLine===declaration.line&&local.name===name&&local.access==='write'&&local.valueKind&&local.valueKind!=='unknown');if(writes.length&&writes.every(local=>local.valueKind==='string'))exact.set(key,declaration.name);}
  const names=[],matchedSites=new Set();
  for(const site of sites||[]){
    if(site.valueKind!=='expression'||!site.observedValue)continue;
    const match=/^\s*call\s+([A-Za-z_][A-Za-z0-9_.]*)\s*\((?:[^()]|\([^()]*\))*\)\s*$/i.exec(site.observedValue),name=match&&exact.get(match[1].toLowerCase());
    if(name){matchedSites.add(site);if(!names.includes(name))names.push(name);}
  }
  return{names,matchedSites};
}
function scopedLocalHover(vscode,document,position,capabilities={}){
  const symbol=scopedLocalAt(document.getText(),document.fileName||document.uri?.fsPath||'source.zss',position.line,position.character);if(!symbol)return undefined;
  const record=symbol.occurrence,declaration=symbol.declaration,clean=value=>String(value==null?'':value).replace(/`/g,'\\`'),content=new vscode.MarkdownString(undefined,true);content.isTrusted=false;
  content.appendMarkdown(`### Scoped ${record.localKind==='parameter'?'parameter':'local'} \`${clean(record.name)}\`\n\n`);
  content.appendMarkdown(`Scope: **${clean(record.metadata?.scope||`${record.ownerKind} ${record.ownerName}`)}** · ${symbol.related.filter(item=>!item.declaration).length} indexed use${symbol.related.filter(item=>!item.declaration).length===1?'':'s'} in this exact declaration scope.\n\n`);
  if(declaration?.documentation)content.appendMarkdown(`Authored documentation: ${clean(declaration.documentation)}\n\n`);
  const allowStrings=enabledCapabilityIds(capabilities).has('zss.runtime-strings'),stringReturnEvidence=allowStrings?directStringReturnEvidence(symbol.related,[{text:document.getText(),filename:document.fileName||document.uri?.fsPath||'source.zss'}]):{names:[],matchedSites:new Set()},typed=symbol.related.filter(item=>item.valueKind&&item.valueKind!=='unknown'&&!stringReturnEvidence.matchedSites.has(item)&&(allowStrings||item.valueKind!=='string')),kinds=[...new Set([...typed.map(item=>item.valueKind),...stringReturnEvidence.names.map(()=>'string')])].sort(),summaries=[...new Set([...typed.map(item=>item.valueSummary).filter(Boolean),...stringReturnEvidence.names.map(name=>`inferred string return from Function ${name}`)])].slice(0,6);
  if(kinds.length){content.appendMarkdown(`Observed authored value kind${kinds.length===1?'':'s'}: **${kinds.map(clean).join(' / ')}**.\n\n`);if(summaries.length)content.appendMarkdown(summaries.map(value=>`- ${clean(value)}`).join('\n')+'\n\n');content.appendMarkdown('These are exact source observations, not a runtime type guarantee.\n\n');}
  const inbound=currentSourceParameterFlow(symbol,allowStrings);if(inbound){content.appendMarkdown(`Observed inbound call kind${inbound.kinds.length===1?'':'s'} in this source: **${inbound.kinds.map(clean).join(' / ')}** at ${inbound.callSites} exact call site${inbound.callSites===1?'':'s'}.\n\n`);if(inbound.summaries.length)content.appendMarkdown(inbound.summaries.map(value=>`- ${clean(value)}`).join('\n')+'\n\n');content.appendMarkdown('This is positional source evidence from calls in the current file, not a complete runtime type guarantee. Project Knowledge owns connected-file flow.\n\n');}
  const enabled=enabledCapabilityIds(capabilities),stringInputs=allowStrings?[...new Map(symbol.related.filter(item=>item.metadata?.['string usage']==='runtime string input'&&(!item.metadata.visibilityCapabilityId||enabled.has(String(item.metadata.visibilityCapabilityId).toLowerCase()))).map(item=>[`${item.metadata['string controller']}.${item.metadata['string field']}:${item.metadata['string role']}`,item.metadata])).values()]:[];
  if(stringInputs.length){content.appendMarkdown('Runtime string input use:\n\n');for(const metadata of stringInputs.slice(0,6))content.appendMarkdown(`- **${clean(metadata['string controller'])}.${clean(metadata['string field'])}** · ${clean(metadata['string role'])}\n`);content.appendMarkdown('\nThis is exact authored flow into a verified Nightly string position; IKEMaker does not infer the runtime value.\n\n');}
  const allowCommand=enabledCapabilityIds(capabilities).has('command.nightly-expressions'),commandUses=allowCommand?[...new Set(symbol.related.filter(item=>item.metadata?.usage==='dynamic command name').map(item=>item.metadata?.['command trigger']).filter(Boolean))]:[];
  if(commandUses.length)content.appendMarkdown(`Dynamic command-name input: **${commandUses.map(clean).join(' / ')}**. This exact use is available only for the selected supporting target; IKEMaker does not resolve the runtime command name.\n\n`);
  content.appendMarkdown(declaration?`Declared at line ${declaration.line+1}. Equal spellings in another function or StateDef are separate identifiers.`:'No declaration was proven in this parsed scope; IKEMaker does not infer another scope.');
  return new vscode.Hover(content,new vscode.Range(record.line,record.start,record.line,record.start+record.name.length+(record.sigil?1:0)));
}
function scopedNameCompletionContext(text,filename,line,character){
  const lines=String(text||'').split(/\r?\n/),prefix=String(lines[line]||'').slice(0,character),typed=/\$([A-Za-z_][A-Za-z0-9_]*)$/.exec(prefix);if(!typed)return null;
  let owner=null;for(let index=0;index<=line;index+=1){const code=String(lines[index]||'').replace(/#.*$/,'');const fn=/^\s*\[\s*Function\s+([A-Za-z_][A-Za-z0-9_.]*)/i.exec(code),state=/^\s*\[\s*StateDef\s+([^;\]]+)/i.exec(code);if(fn)owner={ownerKind:'function',ownerName:fn[1],ownerLine:index};else if(state)owner={ownerKind:'state',ownerName:state[1].trim(),ownerLine:index};else if(/^\s*\[\s*[^\]]+\]/.test(code))owner=null;}
  if(!owner)return null;const start=character-typed[0].length,records=collectRecords(String(text||''),filename).locals||[],declarations=records.filter(record=>record.declaration&&record.ownerKind===owner.ownerKind&&record.ownerName===owner.ownerName&&record.ownerLine===owner.ownerLine&&record.line<=line);
  return{...owner,line,start,end:character,prefix:typed[1],declarations};
}
function scopedNameCompletions(vscode,context){
  if(!context)return[];const seen=new Set(),folded=context.prefix.toLowerCase();return context.declarations.filter(record=>(!folded||record.name.toLowerCase().includes(folded))&&!seen.has(record.name.toLowerCase())&&seen.add(record.name.toLowerCase())).map((record,index)=>{const item=new vscode.CompletionItem(`$${record.name}`,vscode.CompletionItemKind.Variable||vscode.CompletionItemKind.Reference);item.detail=`Scoped ${record.localKind==='parameter'?'parameter':'local'} · ${record.metadata?.scope||context.ownerName}`;item.documentation=`${record.documentation?`Authored documentation: ${record.documentation} `:''}Exact declaration at line ${record.line+1}. Equal spellings in another function or StateDef are separate identifiers.`;item.insertText=`$${record.name}`;item.filterText=`$${record.name} ${record.metadata?.scope||''}`;item.sortText=`0-scoped-${String(index).padStart(4,'0')}-${record.name}`;item.range=new vscode.Range(context.line,context.start,context.line,context.end);return item;});
}

function resourceAt(document,position){const records=collectRecords(document.getText(),document.fileName||document.uri?.fsPath||'source.zss').resources||[];return records.find(record=>record.line===position.line&&position.character>=record.start&&position.character<=record.start+String(record.id||'').length);}
function resourceHover(vscode,document,position){const record=resourceAt(document,position);if(!record)return undefined;const clean=value=>String(value==null?'':value).replace(/`/g,'\\`'),title=record.kind[0].toUpperCase()+record.kind.slice(1),content=new vscode.MarkdownString(undefined,true);content.isTrusted=false;content.appendMarkdown(`### ${title} ID \`${clean(record.id)}\`\n\n`);content.appendMarkdown(`**${clean(record.role||'reference')}** · ${clean(record.access||'use')} in ${clean(record.metadata?.scope||record.ownerName||'the current source')}\n\n`);for(const [name,value] of Object.entries(record.metadata||{})){if(name==='scope'||value==null||typeof value==='object')continue;content.appendMarkdown(`- **${clean(name)}:** ${clean(value)}\n`);}content.appendMarkdown('\nThis is an exact current-document lifecycle site. Use **Open Current Symbol in Project Knowledge** to review connected creation, mutation, cleanup, and reference sites across the resolved project.');return new vscode.Hover(content,new vscode.Range(record.line,record.start,record.line,record.start+String(record.id||'').length));}
function projectDataSymbolAt(document,position){const symbol=symbolAt(document.getText(),position.line,position.character,document.fileName||document.uri?.fsPath||'');return symbol&&['map','variable','constant'].includes(symbol.kind)?symbol:null;}
function projectDataHover(vscode,symbol,entries,capabilities={}){
  if(!symbol)return undefined;
  const sites=symbolReferencesFor(entries,symbol,true),definitions=symbolDefinitionsFor(entries,symbol),reads=sites.filter(site=>site.access==='read').length,writes=sites.filter(site=>site.access==='write').length,clean=value=>String(value==null?'':value).replace(/`/g,'\\`'),title=symbol.kind==='map'?'Map':symbol.kind==='constant'?'Constant':'Variable',content=new vscode.MarkdownString(undefined,true);content.isTrusted=false;
  content.appendMarkdown(`### ${title} \`${clean(symbol.name)}\`\n\n`);content.appendMarkdown(`${definitions.length} exact authored definition/write site${definitions.length===1?'':'s'} · ${reads} read${reads===1?'':'s'} · ${writes} write${writes===1?'':'s'} in the resolved owner catalog.\n\n`);
  for(const site of definitions.slice(0,6))content.appendMarkdown(`- ${clean(uriLabel(site.uri))}:${site.line+1}${site.ownerName?` · ${clean(site.ownerKind||'scope')} ${clean(site.ownerName)}`:''}\n`);
  if(!definitions.length)content.appendMarkdown('No authored definition was resolved; this may be an engine/common symbol or an incomplete owner catalog.\n');
  const documentation=[...new Set(definitions.map(site=>site.documentation).filter(Boolean))].slice(0,6);if(documentation.length)content.appendMarkdown(`\nAuthored documentation:\n\n${documentation.map(value=>`- ${clean(value)}`).join('\n')}\n`);
  const allowStrings=enabledCapabilityIds(capabilities).has('zss.runtime-strings'),stringReturnEvidence=allowStrings?directStringReturnEvidence(sites,entries):{names:[],matchedSites:new Set()},typed=sites.filter(item=>item.valueKind&&item.valueKind!=='unknown'&&!stringReturnEvidence.matchedSites.has(item)&&(allowStrings||item.valueKind!=='string')),kinds=[...new Set([...typed.map(item=>item.valueKind),...stringReturnEvidence.names.map(()=>'string')])].sort(),summaries=[...new Set([...typed.map(item=>item.valueSummary).filter(Boolean),...stringReturnEvidence.names.map(name=>`inferred string return from Function ${name}`)])].slice(0,6);
  if(kinds.length){content.appendMarkdown(`\nObserved authored value kind${kinds.length===1?'':'s'}: **${kinds.map(clean).join(' / ')}**.\n\n`);if(summaries.length)content.appendMarkdown(summaries.map(value=>`- ${clean(value)}`).join('\n')+'\n');content.appendMarkdown('\nThese are exact source observations, not a runtime type guarantee.\n');}
  const enabled=enabledCapabilityIds(capabilities),stringInputs=allowStrings?[...new Map(sites.filter(item=>item.metadata?.['string usage']==='runtime string input'&&(!item.metadata.visibilityCapabilityId||enabled.has(String(item.metadata.visibilityCapabilityId).toLowerCase()))).map(item=>[`${item.metadata['string controller']}.${item.metadata['string field']}:${item.metadata['string role']}`,item.metadata])).values()]:[];
  if(stringInputs.length){content.appendMarkdown('\nRuntime string input use:\n\n');for(const metadata of stringInputs.slice(0,6))content.appendMarkdown(`- **${clean(metadata['string controller'])}.${clean(metadata['string field'])}** · ${clean(metadata['string role'])}\n`);content.appendMarkdown('\nThis is exact authored flow into a verified Nightly string position; IKEMaker does not infer the runtime value.\n');}
  const allowCommand=enabledCapabilityIds(capabilities).has('command.nightly-expressions'),commandUses=allowCommand?[...new Set(sites.filter(item=>item.metadata?.usage==='dynamic command name').map(item=>item.metadata?.['command trigger']).filter(Boolean))]:[];
  if(commandUses.length)content.appendMarkdown(`\nDynamic command-name input: **${commandUses.map(clean).join(' / ')}**. This exact use is available only for the selected supporting target; IKEMaker does not resolve the runtime command name.\n`);
  content.appendMarkdown('\nUse **Open Current Symbol in Project Knowledge** for source-scope groups and complete indexed relationships. Dynamic values are not inferred.');return new vscode.Hover(content,new vscode.Range(symbol.line,symbol.start,symbol.line,symbol.start+String(symbol.name||'').length));
}
function maskedReferencePrefix(line,character,languageId='zss'){const source=String(line||'').slice(0,Math.max(0,Number(character)||0)),output=source.split('');let quote='',escaped=false;for(let index=0;index<source.length;index+=1){const value=source[index];if(quote){output[index]=' ';if(escaped)escaped=false;else if(value==='\\')escaped=true;else if(value===quote)quote='';continue;}if(value==='"'||value==="'"){quote=value;output[index]=' ';continue;}if(value==='#'||languageId==='ikemen-cns'&&value===';'){for(let at=index;at<output.length;at+=1)output[at]=' ';break;}}return output.join('');}
function projectNameCompletionContext(line,character,options={}){const source=String(line||'').slice(0,Math.max(0,Number(character)||0)),prefix=maskedReferencePrefix(source,source.length,options.languageId||'zss'),match=/\b(map|const)\s*\(\s*([A-Za-z_][A-Za-z0-9_.]*)?$/i.exec(prefix);if(!match)return null;const typed=match[2]||'',start=prefix.length-typed.length;return{kind:match[1].toLowerCase()==='const'?'constant':'map',prefix:source.slice(start),start,end:prefix.length};}
function projectNameCompletions(vscode,context,entries,line){if(!context)return[];const folded=context.prefix.toLowerCase(),seen=new Set(),records=[];for(const entry of entries||[]){const source=entry.records||collectRecords(entry.text||'',entry.uri?.fsPath||'');for(const record of source[context.kind==='constant'?'constants':'maps']||[]){if(context.kind==='constant'&&!record.declaration)continue;const key=record.name.toLowerCase();if(seen.has(key)||folded&&!key.includes(folded))continue;seen.add(key);records.push({...record,uri:entry.uri});}}return records.sort((a,b)=>a.name.localeCompare(b.name,undefined,{sensitivity:'base'})).map((record,index)=>{const item=new vscode.CompletionItem(record.name,vscode.CompletionItemKind.Reference);item.detail=`Authored ${context.kind} · ${uriLabel(record.uri)}:${record.line+1}`;item.documentation=`Exact name from the resolved owner catalog. Choosing it changes only this reference; IKEMaker does not invent a value or rewrite other sites.`;item.insertText=record.name;item.filterText=record.name;item.sortText=`0-${context.kind}-${String(index).padStart(4,'0')}-${record.name}`;item.range=new vscode.Range(line,context.start,line,context.end);return item;});}
function resourceIdCompletionContext(text,line,character,options={}){
  const languageId=options.languageId||'zss',lines=String(text||'').split(/\r?\n/),raw=String(lines[Math.max(0,Number(line)||0)]||''),prefix=maskedReferencePrefix(raw,character,languageId),call=/\b(numHelper|helper|numExplod|numProjID|projContactTime|projGuardedTime|projHitTime|projCancelTime)\s*\(\s*(-?\d*)$/i.exec(prefix);
  if(call){const name=call[1].toLowerCase(),kind=name.includes('helper')?'helper':name.includes('explod')?'explod':'projectile',typed=call[2]||'';return{kind,prefix:typed,start:prefix.length-typed.length,end:prefix.length};}
  if(languageId==='ikemen-cns'){
    const field=/^\s*id\s*=\s*(-?\d*)$/i.exec(prefix);if(!field)return null;let type='';for(let row=Math.max(0,Number(line)||0);row>=0;row-=1){const code=maskedReferencePrefix(lines[row],String(lines[row]||'').length,languageId);if(row!==line&&/^\s*\[/.test(code))break;const found=/^\s*type\s*=\s*(modifyExplod|removeExplod|explodBindTime)\s*$/i.exec(code);if(found){type=found[1];break;}}if(!type)return null;const typed=field[1]||'';return{kind:'explod',prefix:typed,start:prefix.length-typed.length,end:prefix.length};
  }
  const before=[...lines.slice(0,Math.max(0,Number(line)||0)).map(value=>maskedReferencePrefix(value,String(value||'').length,languageId)),prefix].join('\n'),controller=/\b(modifyExplod|removeExplod|explodBindTime)\s*\{[^{}]*\bid\s*:\s*(-?\d*)$/i.exec(before);if(!controller)return null;const typed=controller[2]||'';return{kind:'explod',prefix:typed,start:prefix.length-typed.length,end:prefix.length};
}
function resourceIdCompletions(vscode,context,entries,line){if(!context)return[];const seen=new Map();for(const entry of entries||[]){const source=entry.records||collectRecords(entry.text||'',entry.uri?.fsPath||'');for(const record of source.resources||[]){if(record.kind!==context.kind||!record.literal||record.role!=='creation')continue;const id=String(record.id);if(context.prefix&&!id.startsWith(context.prefix))continue;if(!seen.has(id))seen.set(id,{record,uri:entry.uri,count:0});seen.get(id).count+=1;}}return[...seen.values()].sort((a,b)=>Number(a.record.id)-Number(b.record.id)||a.record.id.localeCompare(b.record.id)).map((value,index)=>{const item=new vscode.CompletionItem(String(value.record.id),vscode.CompletionItemKind.Reference);item.detail=`Existing ${context.kind} ID · ${value.count} creation site${value.count===1?'':'s'}`;item.documentation=`Exact literal ID observed in the complete owner catalog. This completion is offered only at a reference/mutation site and does not create, renumber, or validate runtime exclusivity.`;item.insertText=String(value.record.id);item.filterText=String(value.record.id);item.sortText=`0-resource-${String(index).padStart(4,'0')}-${value.record.id}`;item.range=new vscode.Range(line,context.start,line,context.end);return item;});}

function stateTypeValueCompletionContext(text,line,character,capabilities={}){
  const lines=String(text||'').split(/\r?\n/),current=String(lines[line]||''),prefix=current.slice(0,Math.max(0,Number(character)||0)),before=lines.slice(0,line).concat(prefix).join('\n'),stateStart=before.toLowerCase().lastIndexOf('[statedef'),controllerStart=before.toLowerCase().lastIndexOf('statetypeset'),stateOpen=stateStart>=0&&before.indexOf(']',stateStart)<0,controllerOpen=controllerStart>=0&&before.indexOf('}',controllerStart)<0;
  if(!stateOpen&&!controllerOpen)return null;const match=/\b(type|statetype|movetype|physics)\s*:\s*("?)([A-Za-z]*)$/i.exec(prefix);if(!match)return null;
  const field=match[1].toLowerCase(),quoted=match[2]==='"',dynamic=enabledCapabilityIds(capabilities).has('zss.dynamic-state-types');if(quoted&&!dynamic)return null;
  const base=field==='movetype'?['I','A','H']:field==='physics'?['S','C','A','N']:['S','C','A','L'],values=dynamic?[...base,'U']:base,start=prefix.length-match[3].length-(quoted?1:0);
  return{field,quoted,dynamic,values,prefix:match[3],start,end:prefix.length};
}
function stateTypeValueCompletions(vscode,context,line){if(!context)return[];const folded=context.prefix.toLowerCase();return context.values.filter(value=>!folded||value.toLowerCase().startsWith(folded)).map((value,index)=>{const item=new vscode.CompletionItem(context.quoted?`"${value}"`:value,vscode.CompletionItemKind.EnumMember||vscode.CompletionItemKind.Value);item.detail=`${context.field} value${value==='U'?' · exact supporting Nightly':''}`;item.documentation=`${context.quoted?'Runtime string form':'Conventional literal form'} for ${context.field}.${context.dynamic?' The selected exact target supports dynamic state-type expressions; this completion inserts only the chosen static value.':''}`;item.insertText=context.quoted?`"${value}"`:value;item.range=new vscode.Range(line,context.start,line,context.end);item.sortText=`0-state-type-${String(index).padStart(2,'0')}-${value}`;return item;});}

function assetCompletions(vscode, context, catalog, line) {
  if (context.ownership === 'shared') return sharedAssetCompletions(vscode, context, catalog, line);
  const source = catalog?.kinds?.[context.kind];
  if (!source?.complete) return [];
  const typed = String(context.prefix || '').toLowerCase().replace(/\s/g, ''), seen = new Set();
  return (source.entries || []).filter(entry => {
    const value = context.kind === 'air' ? String(entry.group) : `${context.explicitS ? 's' : ''}${entry.group},${entry.number}`;
    return (!typed || value.toLowerCase().includes(typed)) && !seen.has(value) && seen.add(value);
  }).map((entry, index) => {
    const value = context.kind === 'air' ? String(entry.group) : `${context.explicitS ? 'S' : ''}${entry.group},${entry.number}`;
    const item = new vscode.CompletionItem(value, vscode.CompletionItemKind.Reference);
    item.detail = context.kind === 'air' ? `Assigned AIR Action ${entry.group}` : `Assigned ${context.kind.toUpperCase()} ${entry.group},${entry.number}`;
    item.documentation = `Exact identity from ${String(source.filename || '').split(/[\\/]/).pop()}. Choosing it changes only this literal field; IKEMaker does not rewrite related code or assets.`;
    item.insertText = value; item.filterText = value; item.sortText = `0-asset-${String(index).padStart(6, '0')}-${value}`;
    item.range = new vscode.Range(line, context.start, line, context.end); return item;
  });
}

function sharedAssetCompletions(vscode, context, catalog, line) {
  if (!catalog?.shared?.complete) return [];
  const typed = String(context.typedPrefix || ''), folded = typed.toLowerCase(), candidates = [];
  if (context.implicitDefault || folded === 'f') {
    const source = sharedAssetSource(catalog, 'f', context.kind);
    if (source) candidates.push({ selector: 'f', displayPrefix: context.implicitDefault ? '' : (typed || 'F'), source });
  } else if (folded) {
    const prefixes = [...new Set((catalog.shared.archives || []).map(archive => archive.prefix).filter(prefix => prefix.startsWith(folded)))];
    for (const prefix of prefixes) {
      const source = sharedAssetSource(catalog, prefix, context.kind); if (!source) continue;
      const archive = (catalog.shared.archives || []).find(item => item.prefix === prefix);
      candidates.push({ selector: prefix, displayPrefix: prefix === folded && typed ? typed : archive?.displayPrefix || prefix, source });
    }
  }
  const seen = new Set(), items = [];
  for (const candidate of candidates) for (const entry of candidate.source.entries || []) {
    const suffix = context.kind === 'air' ? String(entry.group) : `${entry.group},${entry.number}`, value = `${candidate.displayPrefix}${suffix}`;
    if (seen.has(value.toLowerCase())) continue; seen.add(value.toLowerCase());
    const item = new vscode.CompletionItem(value, vscode.CompletionItemKind.Reference);
    item.detail = `Runtime CommonFX ${candidate.selector.toUpperCase()} · ${context.kind === 'air' ? `Action ${entry.group}` : `SND ${entry.group},${entry.number}`}`;
    item.documentation = `Exact identity from ${String(candidate.source.filename || '').split(/[\\/]/).pop()}, resolved through ${candidate.source.archive.source}. Choosing it changes only this literal field; IKEMaker does not rewrite code or assets.`;
    item.insertText = value; item.filterText = value; item.sortText = `0-commonfx-${candidate.selector}-${String(items.length).padStart(6, '0')}-${value}`;
    item.range = new vscode.Range(line, context.start, line, context.end); items.push(item);
  }
  return items;
}

function registerLanguageProviders(vscode, context, getControllers, getCommandCatalog = () => [], getFunctionCatalog = () => ({ complete: false, entries: [] }), getAssetCatalog = () => ({ kinds: {} }), getStateCatalog = () => ({ complete: false, definitions: [] }), getCapabilities=()=>({nightlyStringsEnabled:false}), getLuaFunctionCatalog=document=>({complete:true,definitions:parseLuaFunctions(document.getText(),document.fileName).definitions.map(definition=>({...definition,uri:document.uri,imported:false}))})) {
  const selector = [{ language: 'zss' }, { language: 'ikemen-cns' }, { language: 'lua' }];
  const hoverSelector = [...selector, { scheme:'file', pattern:'**/*.def' }];
  const codingCatalogs = (document) => {
    const capabilities = getCapabilities(document.uri);
    return { capabilities, controllers: filterAvailable(getControllers(document), capabilities), triggers: filterAvailable(triggerCatalog, capabilities) };
  };
  const asyncGenerations=new Map();let asyncGeneration=0;
  const requestIdentity=document=>{const rendered=document?.uri?.toString?.();return String(rendered&&rendered!=='[object Object]'?rendered:document?.fileName||document?.uri?.fsPath||'document');};
  const beginRequest=(channel,document,capabilities)=>{const key=`${channel}\0${requestIdentity(document)}`,generation=++asyncGeneration,version=Number.isInteger(document.version)?document.version:null,source=version===null?sourceFingerprint(document):'';asyncGenerations.set(key,generation);while(asyncGenerations.size>256)asyncGenerations.delete(asyncGenerations.keys().next().value);return{key,generation,version,source,capabilities:capabilityFingerprint(capabilities)};};
  const requestCurrent=(request,document,token)=>!token?.isCancellationRequested&&asyncGenerations.get(request.key)===request.generation&&(request.version===null?sourceFingerprint(document)===request.source:document.version===request.version)&&capabilityFingerprint(getCapabilities(document.uri))===request.capabilities;
  const guardedFunctionCatalog=(request,document,token,capabilities,project,fallback)=>functionCatalog(getFunctionCatalog,document).then(catalog=>requestCurrent(request,document,token)?project(catalog,capabilities):fallback);
  const guardedLuaFunctionCatalog=(request,document,token,project,fallback)=>luaFunctionCatalog(getLuaFunctionCatalog,document).then(catalog=>requestCurrent(request,document,token)?project(catalog):fallback);
  const completions = {
    provideCompletionItems(document, position, token) {
      if(token?.isCancellationRequested)return[];
      const requestCapabilities=getCapabilities(document.uri),request=beginRequest('completion',document,requestCapabilities);
      const lineText = document.lineAt(position.line).text, linePrefix = lineText.slice(0, position.character);
      if (document.languageId !== 'lua') {
        const destination = stateDestinationContext(document.getText(), document.fileName, document.languageId, position.line, position.character, { capabilities: getCapabilities(document.uri) });
        if (destination) return stateCatalog(getStateCatalog, document).then(catalog => requestCurrent(request,document,token)?stateCompletions(vscode, destination, catalog):[]);
        const commandReference = commandReferenceAtPosition(lineText, position.character, { semicolonComments: document.languageId === 'ikemen-cns' });
        if (commandReference) {
          const commandPrefix = lineText.slice(commandReference.start, position.character);
          const items = commandNameCompletions(vscode, commandCatalogValue(getCommandCatalog, document).names, commandPrefix);
          const replacement = new vscode.Range(position.line, commandReference.start, position.line, commandReference.end);
          for (const item of items) item.range = replacement;
          return items;
        }
      }
      if(document.languageId==='zss'||document.languageId==='ikemen-cns'){
        const projectCapabilities=requestCapabilities,projectName=projectNameCompletionContext(lineText,position.character,{languageId:document.languageId}),category=projectName?.kind==='constant'?'constants':'maps';if(projectName&&referenceCapability(document.languageId,category,'complete',projectCapabilities).supported)return guardedFunctionCatalog(request,document,token,projectCapabilities,catalog=>catalog.complete?projectNameCompletions(vscode,projectName,catalog.entries,position.line):[],[]);
        const resourceId=resourceIdCompletionContext(document.getText(),position.line,position.character,{languageId:document.languageId});if(resourceId)return guardedFunctionCatalog(request,document,token,projectCapabilities,catalog=>catalog.complete?resourceIdCompletions(vscode,resourceId,catalog.entries,position.line):[],[]);
      }
      if (document.languageId === 'zss') {
        const stateTypeContext=stateTypeValueCompletionContext(document.getText(),position.line,position.character,getCapabilities(document.uri));if(stateTypeContext)return stateTypeValueCompletions(vscode,stateTypeContext,position.line);
        const scoped=scopedNameCompletionContext(document.getText(),document.fileName||document.uri?.fsPath||'source.zss',position.line,position.character);if(scoped)return scopedNameCompletions(vscode,scoped);
        const asset = assetReferenceContext(document.getText(), document.fileName || document.uri?.fsPath || 'source.zss', position.line, position.character);
        if (asset) return assetCatalog(getAssetCatalog, document).then(catalog => requestCurrent(request,document,token)?assetCompletions(vscode, asset, catalog, position.line):[]);
        const callCapabilities=requestCapabilities,call = boundedFunctionCallContext(document, position, callCapabilities);
        if (call) {
          call.line = position.line;
          return guardedFunctionCatalog(request,document,token,callCapabilities,catalog=>catalog.complete?functionCallCompletions(vscode,call,catalog.entries,callCapabilities):[],[]);
        }
      }
      if(document.languageId==='lua'){
        const luaContext=luaCompletionContext(document.getText(),position.line,position.character);if(luaContext)return guardedLuaFunctionCatalog(request,document,token,catalog=>{const user=luaFunctionCompletions(vscode,luaContext,catalog),userNames=new Set(user.map(item=>String(item.label).toLowerCase())),bundled=luaCompletionModels({linePrefix,experience:experienceFor(vscode,document),api:luaCatalogFor(requestCapabilities)}).filter(model=>!userNames.has(String(model.label).toLowerCase())).map((model,index)=>makeCompletion(vscode,model,index));return[...user,...bundled];},[]);
      }
      const catalogs = document.languageId === 'lua' ? null : codingCatalogs(document);
      const models = document.languageId === 'lua' ? luaCompletionModels({
        linePrefix, experience: experienceFor(vscode, document), api: luaCatalogFor(requestCapabilities)
      }) : completionModels({
        text: document.getText(), line: position.line, linePrefix,
        languageId: document.languageId, experience: experienceFor(vscode, document),
        controllers: catalogs.controllers, triggers: catalogs.triggers
      });
      return models.map((model, index) => makeCompletion(vscode, model, index));
    }
  };
  const hovers = {
    provideHover(document, position, token) {
      if(token?.isCancellationRequested)return undefined;
      const requestCapabilities=getCapabilities(document.uri),request=beginRequest('hover',document,requestCapabilities);
      const defDocument=/\.def$/i.test(document.fileName||document.uri?.fsPath||'');
      if(defDocument){const dataSymbol=projectDataSymbolAt(document,position),capabilities=requestCapabilities;return dataSymbol?guardedFunctionCatalog(request,document,token,capabilities,catalog=>catalog.complete?projectDataHover(vscode,dataSymbol,catalog.entries,capabilities):undefined,undefined):undefined;}
      if (document.languageId !== 'lua') {
        const reference = commandReferenceAtPosition(document.lineAt(position.line).text, position.character, { semicolonComments: document.languageId === 'ikemen-cns' });
        if (reference) {
          const hover = commandReferenceHover(vscode, reference, commandCatalogValue(getCommandCatalog, document));
          if (hover) return hover;
        }
      }
      if(document.languageId!=='lua'){
        if(document.languageId==='zss'){const local=scopedLocalHover(vscode,document,position,getCapabilities(document.uri));if(local)return local;}
        const resource=resourceHover(vscode,document,position);if(resource)return resource;
        if(document.languageId==='zss'){const dataSymbol=projectDataSymbolAt(document,position),capabilities=requestCapabilities;if(dataSymbol)return guardedFunctionCatalog(request,document,token,capabilities,catalog=>catalog.complete?projectDataHover(vscode,dataSymbol,catalog.entries,capabilities):undefined,undefined);}
        const symbol=stateSymbolAt(document.getText(),document.fileName||document.uri?.fsPath||'',document.languageId,position.line,position.character,{capabilities:getCapabilities(document.uri)});
        if(symbol)return stateCatalog(getStateCatalog,document).then(catalog=>requestCurrent(request,document,token)?stateReferenceHover(vscode,symbol,catalog):undefined);
      }
      if (document.languageId === 'zss') {
        const callCapabilities=requestCapabilities,call = boundedFunctionCallContext(document, position, callCapabilities);
        if (call?.name) {
          call.line = position.line;
          return guardedFunctionCatalog(request,document,token,callCapabilities,catalog=>catalog.complete?functionCallHover(vscode,call,catalog.entries,callCapabilities):undefined,undefined);
        }
      }
      if(document.languageId==='lua'){
        const symbol=luaSymbolAt(document.getText(),position.line,position.character);if(symbol)return guardedLuaFunctionCatalog(request,document,token,catalog=>luaFunctionHover(vscode,symbol,catalog)||(()=>{const range=new vscode.Range(symbol.line,symbol.start,symbol.line,symbol.end),model=luaHoverModel({word:symbol.name,experience:experienceFor(vscode,document),api:luaCatalogFor(requestCapabilities)});return model?new vscode.Hover(markdown(vscode,model),range):undefined;})(),undefined);
      }
      const range = document.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z0-9_.]*/);
      if (!range) return undefined;
      const catalogs = document.languageId === 'lua' ? null : codingCatalogs(document);
      const model = document.languageId === 'lua' ? luaHoverModel({
        word: document.getText(range), experience: experienceFor(vscode, document), api: luaCatalogFor(requestCapabilities)
      }) : hoverModel({
        word: document.getText(range), text: document.getText(), line: position.line,
        languageId: document.languageId, experience: experienceFor(vscode, document),
        controllers: catalogs.controllers, triggers: catalogs.triggers
      });
      return model ? new vscode.Hover(markdown(vscode, model), range) : undefined;
    }
  };
  const signatures = {
    provideSignatureHelp(document, position, token) {
      if(document.languageId==='lua'){if(token?.isCancellationRequested)return undefined;const capabilities=getCapabilities(document.uri),request=beginRequest('signature',document,capabilities),call=luaCallAtDocumentPosition(document.getText(),position.line,position.character);return call?.name?guardedLuaFunctionCatalog(request,document,token,catalog=>luaFunctionSignatureHelp(call,catalog)||luaApiSignatureHelp(call,capabilities),undefined):undefined;}
      if (!['zss','ikemen-cns'].includes(document.languageId)) return undefined;
      if(token?.isCancellationRequested)return undefined;const capabilities=getCapabilities(document.uri),request=beginRequest('signature',document,capabilities),call = document.languageId==='zss'?boundedFunctionCallContext(document, position, capabilities):null;
      if(call?.name&&call.hasArguments)return guardedFunctionCatalog(request,document,token,capabilities,catalog=>catalog.complete?functionSignatureHelp(call,catalog.entries,capabilities):undefined,undefined);
      const catalogs=codingCatalogs(document);return triggerSignatureHelp(expressionCallAtPosition(document.lineAt(position.line).text,position.character,{semicolonComments:document.languageId==='ikemen-cns'}),catalogs.triggers,catalogs.capabilities);
    }
  };
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(selector, completions, ':', '=', '(', ',', '"', ' ', '.', '$'),
    vscode.languages.registerHoverProvider(hoverSelector, hovers),
    vscode.languages.registerSignatureHelpProvider([{ language: 'zss' },{ language:'ikemen-cns' },{ language:'lua' }], signatures, '(', ',')
  );
}

module.exports = { registerLanguageProviders, domainFor, experienceFor, markdown, commandReferencePrefix, commandNameCompletions, commandReferenceHover, functionCallCompletions, functionCallHover, functionSignatureHelp, luaFunctionCompletions, luaFunctionHover, luaFunctionSignatureHelp, expressionCallAtPosition, triggerSignatureHelp, assetCompletions, stateCompletions, stateReferenceHover, scopedLocalAt, scopedLocalHover, currentSourceParameterFlow, scopedNameCompletionContext, scopedNameCompletions, resourceAt, resourceHover, projectDataSymbolAt, projectDataHover, projectNameCompletionContext, projectNameCompletions, resourceIdCompletionContext, resourceIdCompletions, stateTypeValueCompletionContext, stateTypeValueCompletions, boundedFunctionCallContext, capabilityFingerprint };
