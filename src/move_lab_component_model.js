'use strict';

const fs=require('fs');
const path=require('path');
const {attackLibrary,readCurrent,language}=require('./move_lab_model');
const {parseCodeStructure,flatten}=require('./code_structure_model');
const {hash}=require('./mutation_safety');

const canonical=filename=>path.resolve(filename||'').toLowerCase();
function componentReference(component,defPath){return component?{defPath,kind:component.kind,id:component.id,stableId:component.stableId||component.id,filename:component.filename,index:component.index,line:component.line,endLine:component.endLine,signature:component.signature||'',sourceHash:component.sourceHash,rangeHash:component.rangeHash,owner:component.owner?{...component.owner}:null}:null}
function sameOwner(a,b){if(!a&&!b)return true;if(!a||!b)return false;return a.kind===b.kind&&a.signature===b.signature&&a.startLine===b.startLine&&a.endLine===b.endLine}
function validComponentReference(reference,model,defPath){
  if(!reference||!['hitdef','state','function'].includes(reference.kind)||canonical(reference.defPath)!==canonical(defPath))return null;
  const component=(model?.components||[]).find(item=>item.id===reference.id);
  if(!component)return null;
  return component.kind===reference.kind&&canonical(component.filename)===canonical(reference.filename)&&component.index===reference.index&&component.line===reference.line&&component.endLine===reference.endLine&&component.sourceHash===reference.sourceHash&&component.rangeHash===reference.rangeHash&&String(component.signature||'')===String(reference.signature||'')&&sameOwner(component.owner,reference.owner)?component:null;
}
function sharedSource(filename,assets){const folder=assets.folder||path.dirname(assets.defPath||assets.def||'');const relative=path.relative(path.resolve(folder),path.resolve(filename));return relative==='..'||relative.startsWith(`..${path.sep}`)||path.isAbsolute(relative)}
function behaviorComponentModel(assets,openDocuments=[],diagnostics=[]){
 const components=[],failures=[];
 for(const filename of (assets.code||[]).filter(file=>file&&fs.existsSync(file))){
  try{
   const text=readCurrent(filename,openDocuments),sourceHash=hash(text),lines=text.split(/\r?\n/),tree=parseCodeStructure(text,language(filename),filename),nodes=flatten(tree).filter(item=>['state','function'].includes(item.kind));
   const counts={state:0,function:0};
   for(const item of nodes){
    const kind=item.kind,index=counts[kind]++,line=item.startLine,endLine=item.endLine,sourceText=lines.slice(line,endLine+1).join('\n'),signature=String(item.signature||item.title||'').trim();
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
  return{components:items,behaviors:behaviors.components,failures:behaviors.failures,constantProfiles:library.constantProfiles||[],counts:{hitdefs:items.length,states:behaviors.counts.states,functions:behaviors.counts.functions,diagnostics:[...items,...behaviors.components].reduce((sum,item)=>sum+item.diagnostics.length,0)}};
}

module.exports={canonical,componentReference,validComponentReference,behaviorComponentModel,directComponentModel};
