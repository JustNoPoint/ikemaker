'use strict';

const fs=require('fs');
const path=require('path');
const {attackLibrary,readCurrent,language}=require('./move_lab_model');
const {parseCodeStructure,flatten}=require('./code_structure_model');
const {hash}=require('./mutation_safety');
const {buildProjectSymbolCatalog,CATEGORY_ORDER,CATEGORY_LABELS,CATALOG_LIMITS}=require('./project_symbol_catalog');
const {buildResourceLifecycleProjection}=require('./resource_lifecycle_projection');
const {existingBindings}=require('./helper_map_binding');

const canonical=filename=>path.resolve(filename||'').toLowerCase();
const COMPONENT_KINDS=new Set(['hitdef','state','function','helper','explod','projectile']);
function componentReference(component,defPath){return component?{defPath,kind:component.kind,id:component.id,stableId:component.stableId||component.id,filename:component.filename,index:component.index,line:component.line,endLine:component.endLine,signature:component.signature||'',sourceHash:component.sourceHash,rangeHash:component.rangeHash,owner:component.owner?{...component.owner}:null}:null}
function sameOwner(a,b){if(!a&&!b)return true;if(!a||!b)return false;return a.kind===b.kind&&a.signature===b.signature&&a.startLine===b.startLine&&a.endLine===b.endLine}
function validComponentReference(reference,model,defPath){
  if(!reference||!COMPONENT_KINDS.has(reference.kind)||canonical(reference.defPath)!==canonical(defPath))return null;
  const component=(model?.components||[]).find(item=>item.id===reference.id);
  if(!component)return null;
  return component.kind===reference.kind&&canonical(component.filename)===canonical(reference.filename)&&component.index===reference.index&&component.line===reference.line&&component.endLine===reference.endLine&&component.sourceHash===reference.sourceHash&&component.rangeHash===reference.rangeHash&&String(component.signature||'')===String(reference.signature||'')&&sameOwner(component.owner,reference.owner)?component:null;
}
function sharedSource(filename,assets){const folder=assets.folder||path.dirname(assets.defPath||assets.def||'');const relative=path.relative(path.resolve(folder),path.resolve(filename));return relative==='..'||relative.startsWith(`..${path.sep}`)||path.isAbsolute(relative)}
function ownerSummary(item){return item?{kind:item.kind,title:item.title,signature:item.signature||item.title||'',startLine:item.startLine,endLine:item.endLine}:null}
function receiverHints(text,syntax){
 const cleaned=String(text||'').split(/\r?\n/).map(line=>line.replace(syntax==='cns'?/;.*/:/#.*/,'').replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,'')).join('\n');
 return [['root','Root'],['parent','Parent'],['p2','P2']].filter(([token])=>new RegExp(`\\b${token}\\b`,'i').test(cleaned)).map(([,label])=>label);
}
const KNOWLEDGE_LIMIT=64,KNOWLEDGE_SITE_LIMIT=8;
const LIFECYCLE_GROUPS=Object.freeze([['creation','Creation'],['reference','References'],['mutation','Mutations'],['cleanup','Cleanup']]);
function freeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
function selectedComponentLifecycle(component,lifecycle,ownerIdentity){
 const unavailable=reason=>freeze({schema:'ikemaker.move-lab.selected-lifecycle',version:1,status:'unavailable',complete:false,namespace:component?.kind||'',resourceId:'',literal:false,runtimeIdentity:'unproven',selectedSource:null,groups:[],counts:{sites:0,creations:0},limitations:[reason]});
 if(!component||!['helper','explod','projectile'].includes(component.kind))return unavailable('Select an exact Helper, Explod, or Projectile creation controller.');
 if(!lifecycle||String(lifecycle.ownerIdentity||'').replace(/\\/g,'/').toLowerCase()!==String(ownerIdentity||'').replace(/\\/g,'/').toLowerCase())return unavailable('Exact lifecycle ownership is unavailable for this character.');
 const filename=canonical(component.filename),start=Number(component.startLine??component.line),end=Number(component.endLine??component.line),matches=[];
 for(const item of lifecycle.items||[])if(item.namespace===component.kind)for(const site of item.sites||[])if(site.role==='creation'&&canonical(site.source?.filename)===filename&&Number(site.source?.line)>=start&&Number(site.source?.line)<=end)matches.push({item,site});
 if(matches.length!==1)return unavailable(matches.length?'More than one lifecycle creation identity occurs inside this controller; no connection was inferred.':'This creation has no exact lifecycle identity.');
 const {item,site:selected}=matches[0],baseLimitations=[...(lifecycle.limitations||[])];
 if(!item.literal||item.resourceId==='(id omitted)')return freeze({schema:'ikemaker.move-lab.selected-lifecycle',version:1,status:'unresolved',complete:false,namespace:item.namespace,resourceId:item.resourceId,literal:false,runtimeIdentity:'unproven',selectedSource:selected.source,selectedRecipient:selected.recipient,groups:[],counts:{sites:0,creations:1},limitations:[...baseLimitations,'The selected creation uses a dynamic or omitted ID. Its lifecycle remains visible but is intentionally unlinked.']});
 const groups=LIFECYCLE_GROUPS.map(([role,label])=>freeze({role,label,sites:freeze((item.sites||[]).filter(candidate=>candidate.role===role).map(candidate=>freeze({id:candidate.id,role:candidate.role,access:candidate.access,literal:candidate.literal,owner:candidate.owner,recipient:candidate.recipient,metadata:candidate.metadata,source:candidate.source,selected:candidate.id===selected.id})))})).filter(group=>group.sites.length);
 const creations=groups.find(group=>group.role==='creation')?.sites.length||0,limitations=[...baseLimitations];if(creations>1)limitations.push(`${creations} literal creation sites use this ${item.namespace} ID. They are candidates, not proof of one runtime instance.`);
 return freeze({schema:'ikemaker.move-lab.selected-lifecycle',version:1,status:lifecycle.complete?'ready':'incomplete',complete:Boolean(lifecycle.complete),namespace:item.namespace,resourceId:item.resourceId,literal:true,runtimeIdentity:'unproven',selectedSource:selected.source,selectedRecipient:selected.recipient,groups,counts:{sites:groups.reduce((sum,group)=>sum+group.sites.length,0),creations},limitations});
}
function selectedComponentKnowledge(component,catalog){
 if(!component||!catalog)return{complete:false,items:[],truncated:false,limitations:['Project Knowledge is unavailable.']};
 const filename=canonical(component.filename),start=Number(component.startLine??component.line),end=Number(component.endLine??component.line),items=[];
 for(const entry of catalog.entries||[]){
  const siteFilename=site=>site.filename||catalog.files?.[site.fileIndex]||'',selectedSites=(entry.sites||[]).filter(site=>canonical(siteFilename(site))===filename&&Number(site.line)>=start&&Number(site.line)<=end);
  if(!selectedSites.length)continue;
  const exact=(sites=[])=>sites.slice(0,KNOWLEDGE_SITE_LIMIT).map(site=>{const target=siteFilename(site);return{filename:target,file:site.file||path.basename(target),line:site.line,role:site.role,access:site.access||'',ownerKind:site.ownerKind||'',ownerName:site.ownerName||'',assigned:Boolean(site.assigned)}});
  const destinations=(entry.sites||[]).filter(site=>['declaration','creation'].includes(site.role));
  items.push({
   id:entry.id,category:entry.category,categoryLabel:CATEGORY_LABELS[entry.category]||entry.category,
   name:entry.name,status:entry.status,roles:[...new Set(selectedSites.map(site=>site.role||site.access||'reference'))],
   selectedSites:exact(selectedSites),destinations:exact(destinations),totalSites:(entry.sites||[]).length,
   declarations:Number(entry.declarations||0),references:Number(entry.references||0),reads:Number(entry.reads||0),writes:Number(entry.writes||0),assigned:Boolean(entry.assigned)
  });
 }
 items.sort((left,right)=>CATEGORY_ORDER.indexOf(left.category)-CATEGORY_ORDER.indexOf(right.category)||String(left.name).localeCompare(String(right.name),undefined,{numeric:true,sensitivity:'base'}));
 const limitations=[];
 if(catalog.resolved===false)limitations.push('Assigned project ownership is incomplete.');
 if(catalog.failures?.length)limitations.push(`${catalog.failures.length} assigned source file(s) could not be indexed.`);
 if(items.length>KNOWLEDGE_LIMIT)limitations.push(`Only the first ${KNOWLEDGE_LIMIT} exact connections are shown here; use Project Symbols & Contracts for the complete result.`);
 return{complete:catalog.resolved!==false&&!catalog.failures?.length,items:items.slice(0,KNOWLEDGE_LIMIT),truncated:items.length>KNOWLEDGE_LIMIT,limitations};
}
function assignedProjectKnowledge(assets,openDocuments=[]){
 const files=[],failures=[],candidates=(assets.code||[]).filter(Boolean);let totalBytes=0;
 if(candidates.length>CATALOG_LIMITS.files)failures.push({filename:'',reason:`assigned code exceeds the ${CATALOG_LIMITS.files}-file project-catalog limit`});
 for(const filename of candidates.length>CATALOG_LIMITS.files?[]:candidates){
  try{const open=openDocuments.find(item=>canonical(item.fileName)===canonical(filename)&&!item.isClosed),stat=open?null:fs.statSync(filename);if(stat&&!stat.isFile())throw new Error('not a regular file');if(stat&&stat.size>CATALOG_LIMITS.perSourceBytes)throw new Error('source exceeds the 4 MiB project-catalog admission limit');const text=readCurrent(filename,openDocuments),bytes=Buffer.byteLength(text,'utf8');if(bytes>CATALOG_LIMITS.perSourceBytes)throw new Error('source exceeds the 4 MiB project-catalog admission limit');if(totalBytes+bytes>CATALOG_LIMITS.sourceBytes)throw new Error('assigned sources exceed the 16 MiB project-catalog aggregate admission limit');totalBytes+=bytes;files.push({filename,text});}
  catch(error){failures.push({filename,reason:error.message});}
 }
 const admitted=failures.length?[]:files,catalog=buildProjectSymbolCatalog(admitted,{assignedFiles:admitted.map(item=>item.filename),label:path.basename(path.dirname(assets.defPath||assets.def||'')),resolved:failures.length===0,ownerIdentity:assets.defPath||assets.def});
 catalog.failures=[...(catalog.failures||[]),...failures];
 if(failures.length)catalog.resolved=false;
 return catalog;
}
function compactProjectKnowledge(catalog,resourceLifecycle){
 const files=[...new Set((catalog?.entries||[]).flatMap(entry=>(entry.sites||[]).map(site=>site.filename)).filter(Boolean))],indices=new Map(files.map((filename,index)=>[canonical(filename),index])),exact=site=>({fileIndex:indices.get(canonical(site.filename)),line:site.line,start:Number.isInteger(site.start)?site.start:null,role:site.role,access:site.access||'',assigned:Boolean(site.assigned),ownerKind:site.ownerKind||'',ownerName:site.ownerName||'',runtimeOwner:site.runtimeOwner||'',valueKind:site.valueKind||'',catalogMatch:site.catalogMatch===true,metadata:site.metadata&&typeof site.metadata==='object'?{visibilityCapabilityId:site.metadata.visibilityCapabilityId||''}:{}});
 const sources=Object.fromEntries(Object.values(catalog?.sources||{}).map(source=>[canonical(source.filename),{filename:source.filename,hash:source.hash||'',bytes:Number(source.bytes||0)}]));
 return{resolved:catalog?.resolved!==false,ownerIdentity:catalog?.ownerIdentity||'',files,sources,failures:(catalog?.failures||[]).map(item=>({filename:item.filename||'',reason:item.reason||item.message||''})),entries:(catalog?.entries||[]).map(entry=>({id:entry.id,category:entry.category,categoryLabel:CATEGORY_LABELS[entry.category]||entry.category,name:entry.name,status:entry.status,sites:(entry.sites||[]).map(exact),declarations:Number(entry.declarations||0),references:Number(entry.references||0),reads:Number(entry.reads||0),writes:Number(entry.writes||0),assigned:Boolean(entry.assigned),runtimeOwners:[...(entry.runtimeOwners||[])]})),resourceLifecycle:resourceLifecycle||null};
}
function lexicalContextPath(lines,startLine,endLine,syntax){
 if(syntax==='cns')return[];
 const stack=[];
 for(let row=Math.max(0,startLine);row<endLine;row++){
  const code=String(lines[row]||'').replace(/#.*/,'').replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,' value ');let pending='';
  for(const character of code){
   if(character==='{'){
    const signature=pending.trim(),match=/^(?:(?:ignorehitpause|persistent\s*\([^)]*\))\s+)*(?:(?:else\s+)?if|else|for|while|switch)\b/i.exec(signature),kind=/\b(?:for|while)\b/i.test(signature)?'loop':'condition';
    stack.push(match?{kind,title:signature,signature,startLine:row,endLine:row}:null);pending='';
   }else if(character==='}'){stack.pop();pending='';}
   else if(character===';')pending='';else pending+=character;
  }
 }
 return stack.filter(Boolean);
}
function controllerEndLine(lines,startLine,syntax,fallback){
 if(syntax==='cns')return fallback;
 let depth=0,opened=false;
 for(let row=startLine;row<lines.length;row++){
  const code=String(lines[row]||'').replace(/#.*/,'').replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,'');
  for(const character of code){if(character==='{'){depth++;opened=true;}else if(character==='}'&&opened){depth--;if(depth===0)return row;}}
 }
 return fallback;
}
function lineStarts(text) {
 const starts = [0];
 for (let at = text.indexOf('\n'); at !== -1; at = text.indexOf('\n', at + 1)) starts.push(at + 1);
 return starts;
}
function exactLineSlice(text,starts,startLine,endLine){
 const start=starts[startLine]??text.length,next=starts[endLine+1]??text.length;
 let end=next;while(end>start&&(text[end-1]==='\n'||text[end-1]==='\r'))end--;
 return text.slice(start,end);
}
function specialistComponentModel(assets,openDocuments=[],diagnostics=[]){
 const components=[],failures=[],wanted={helper:'helper',explod:'explod',projectile:'projectile'};
 for(const filename of (assets.code||[]).filter(file=>file&&fs.existsSync(file))){
  try{
   const text=readCurrent(filename,openDocuments),sourceHash=hash(text),starts=lineStarts(text),lines=text.split(/\r?\n/),tree=parseCodeStructure(text,language(filename),filename),syntax=tree.language||language(filename),counts={helper:0,explod:0,projectile:0};
   const visit=(node,ancestors=[])=>{
    for(const child of node.children||[]){
     const kind=child.kind==='controller'?wanted[String(child.title||'').trim().toLowerCase()]:null;
     if(kind){
      const index=counts[kind]++,line=child.startLine,endLine=controllerEndLine(lines,line,syntax,child.endLine),sourceText=exactLineSlice(text,starts,line,endLine),rangeHash=hash(sourceText),stableId=`${canonical(filename)}:${kind}:${line}:${endLine}:${rangeHash}`,owner=ancestors.slice().reverse().find(item=>['state','function'].includes(item.kind)),contextPath=lexicalContextPath(lines,(owner?.startLine??-1)+1,line,syntax),relevant=diagnostics.filter(problem=>canonical(problem.filename||problem.uri?.fsPath)===canonical(filename)&&Number(problem.line??problem.range?.start?.line??-1)>=line&&Number(problem.line??problem.range?.start?.line??-1)<=endLine).map(problem=>({filename:problem.filename||problem.uri?.fsPath,line:problem.line??problem.range?.start?.line??line,character:problem.character??problem.range?.start?.character??0,severity:problem.severity,message:problem.message,source:problem.source||'IKEMEN',code:String(problem.diagnosticCode??problem.code??'')}));
      const contextText=contextPath.map(item=>item.signature||item.title||'').join('\n'),component={kind,id:stableId,stableId,filename,fileLabel:path.basename(filename),index,line,startLine:line,endLine,signature:String(child.signature||child.title||'').trim(),title:`${child.title} creation site ${index+1}`,label:`${child.title} creation site ${index+1}`,syntax,sourceHash,rangeHash,sourceText,text:sourceText,shared:sharedSource(filename,assets),diagnostics:relevant,owner:ownerSummary(owner),contextPath,receiverHints:receiverHints(`${contextText}\n${sourceText}`,syntax),helperMapBindings:kind==='helper'?existingBindings(sourceText,syntax):[]};
      component.reference=componentReference(component,assets.defPath||assets.def);components.push(component);
     }
     visit(child,[...ancestors,child]);
    }
   };
   visit(tree,[]);
  }catch(error){failures.push({filename,message:error.message});}
 }
 return{components,failures,counts:{helpers:components.filter(item=>item.kind==='helper').length,explods:components.filter(item=>item.kind==='explod').length,projectiles:components.filter(item=>item.kind==='projectile').length}};
}
function behaviorComponentModel(assets,openDocuments=[],diagnostics=[]){
 const components=[],failures=[];
 for(const filename of (assets.code||[]).filter(file=>file&&fs.existsSync(file))){
  try{
   const text=readCurrent(filename,openDocuments),sourceHash=hash(text),starts=lineStarts(text),lines=text.split(/\r?\n/),tree=parseCodeStructure(text,language(filename),filename),nodes=flatten(tree).filter(item=>['state','function'].includes(item.kind));
   const counts={state:0,function:0};
   for(const item of nodes){
    const kind=item.kind,index=counts[kind]++,line=item.startLine,endLine=item.endLine,sourceText=exactLineSlice(text,starts,line,endLine).split(/\r?\n/).join('\n'),signature=String(item.signature||item.title||'').trim();
    // Draft identity deliberately includes the original range and bytes. Inserting,
    // deleting, or changing another parsed block must orphan a retained draft rather
    // than silently attaching it to the next ordinal component.
    const rangeHash=hash(sourceText),stableId=`${canonical(filename)}:${kind}:${line}:${endLine}:${rangeHash}`,relevant=diagnostics.filter(problem=>canonical(problem.filename||problem.uri?.fsPath)===canonical(filename)&&Number(problem.line??problem.range?.start?.line??-1)>=line&&Number(problem.line??problem.range?.start?.line??-1)<=endLine).map(problem=>({filename:problem.filename||problem.uri?.fsPath,line:problem.line??problem.range?.start?.line??line,character:problem.character??problem.range?.start?.character??0,severity:problem.severity,message:problem.message,source:problem.source||'IKEMEN',code:String(problem.diagnosticCode??problem.code??'')}));
    const controllers=(item.children||[]).filter(child=>child.kind==='controller').map(child=>child.title);
    const component={kind,id:stableId,stableId,filename,fileLabel:path.basename(filename),index,line,startLine:line,endLine,signature,title:item.title||`${kind} ${signature}`,label:item.title||`${kind} ${signature}`,syntax:tree.language||language(filename),sourceHash,rangeHash,sourceText,text:sourceText,shared:sharedSource(filename,assets),controllers,diagnostics:relevant,owner:null};
    component.reference=componentReference(component,assets.defPath||assets.def);components.push(component);
   }
  }catch(error){failures.push({filename,message:error.message});}
 }
 return{components,failures,counts:{states:components.filter(item=>item.kind==='state').length,functions:components.filter(item=>item.kind==='function').length}};
}
function directComponentModel(assets,openDocuments=[],diagnostics=[]){
  const library=attackLibrary(assets,openDocuments),items=library.controllers.map(component=>{
    const relevant=diagnostics.filter(item=>canonical(item.filename||item.uri?.fsPath)===canonical(component.filename)&&Number(item.line??item.range?.start?.line??-1)>=component.line&&Number(item.line??item.range?.start?.line??-1)<=component.endLine).map(item=>({filename:item.filename||item.uri?.fsPath,line:item.line??item.range?.start?.line??component.line,character:item.character??item.range?.start?.character??0,severity:item.severity,message:item.message,source:item.source||'IKEMEN',code:String(item.diagnosticCode??item.code??'')}));
    const normalized={...component,kind:'hitdef',diagnostics:relevant};
    return{...normalized,reference:componentReference(normalized,assets.defPath||assets.def)};
  });
  const behaviors=behaviorComponentModel(assets,openDocuments,diagnostics);
  const specialists=specialistComponentModel(assets,openDocuments,diagnostics);
  let knowledge=null,knowledgeFailures=[];
  try{knowledge=assignedProjectKnowledge(assets,openDocuments);}catch(error){knowledgeFailures=[{filename:assets.defPath||assets.def||'',message:error.message}];}
  const components=items,behaviorItems=behaviors.components,specialistItems=specialists.components;
  const lifecycle=knowledge?buildResourceLifecycleProjection(knowledge,{ownerIdentity:assets.defPath||assets.def,contextOwnerIdentity:assets.defPath||assets.def}):null;
  const linkedSpecialists=specialistItems.map(item=>({...item,lifecycleConnections:selectedComponentLifecycle(item,lifecycle,assets.defPath||assets.def)}));
  return{components,behaviors:behaviorItems,specialists:linkedSpecialists,projectKnowledge:knowledge?compactProjectKnowledge(knowledge,lifecycle):{resolved:false,failures:knowledgeFailures,entries:[],resourceLifecycle:null},failures:[...behaviors.failures,...specialists.failures,...knowledgeFailures],constantProfiles:library.constantProfiles||[],counts:{hitdefs:components.length,states:behaviors.counts.states,functions:behaviors.counts.functions,...specialists.counts,diagnostics:[...components,...behaviorItems,...linkedSpecialists].reduce((sum,item)=>sum+item.diagnostics.length,0)}};
}

module.exports={canonical,componentReference,validComponentReference,selectedComponentKnowledge,selectedComponentLifecycle,assignedProjectKnowledge,compactProjectKnowledge,behaviorComponentModel,specialistComponentModel,directComponentModel};
