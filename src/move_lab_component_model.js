'use strict';

const path=require('path');
const {attackLibrary}=require('./move_lab_model');

const canonical=filename=>path.resolve(filename||'').toLowerCase();
function componentReference(component,defPath){return component?{defPath,kind:'hitdef',id:component.id,filename:component.filename,index:component.index,line:component.line,endLine:component.endLine,sourceHash:component.sourceHash,rangeHash:component.rangeHash,owner:component.owner?{...component.owner}:null}:null}
function sameOwner(a,b){if(!a&&!b)return true;if(!a||!b)return false;return a.kind===b.kind&&a.signature===b.signature&&a.startLine===b.startLine&&a.endLine===b.endLine}
function validComponentReference(reference,model,defPath){
  if(!reference||reference.kind!=='hitdef'||canonical(reference.defPath)!==canonical(defPath))return null;
  const component=(model?.components||[]).find(item=>item.id===reference.id);
  if(!component)return null;
  return canonical(component.filename)===canonical(reference.filename)&&component.index===reference.index&&component.line===reference.line&&component.endLine===reference.endLine&&component.sourceHash===reference.sourceHash&&component.rangeHash===reference.rangeHash&&sameOwner(component.owner,reference.owner)?component:null;
}
function directComponentModel(assets,openDocuments=[],diagnostics=[]){
  const library=attackLibrary(assets,openDocuments),items=library.controllers.map(component=>{
    const relevant=diagnostics.filter(item=>canonical(item.filename||item.uri?.fsPath)===canonical(component.filename)&&Number(item.line??item.range?.start?.line??-1)>=component.line&&Number(item.line??item.range?.start?.line??-1)<=component.endLine).map(item=>({filename:item.filename||item.uri?.fsPath,line:item.line??item.range?.start?.line??component.line,character:item.character??item.range?.start?.character??0,severity:item.severity,message:item.message,source:item.source||'IKEMEN',code:String(item.diagnosticCode??item.code??'')}));
    return{...component,kind:'hitdef',diagnostics:relevant,reference:componentReference(component,assets.defPath||assets.def)};
  });
  return{components:items,constantProfiles:library.constantProfiles||[],counts:{hitdefs:items.length,diagnostics:items.reduce((sum,item)=>sum+item.diagnostics.length,0)}};
}

module.exports={canonical,componentReference,validComponentReference,directComponentModel};
