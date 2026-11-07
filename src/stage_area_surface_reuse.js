'use strict';
// Receipt evidence is rechecked by the pure planner; a marker alone is never enough.
const path=require('path'),{hash}=require('./mutation_safety'),recipes=require('./stage_area_recipes'),{areaIdentities,assertDistinctAreaIdentities}=require('./stage_area_identity');
const same=(a,b)=>path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase();
function verifiedOtherSurfaceText(source,contract,namespace,evidence=[]){
 let checked=source.text;assertDistinctAreaIdentities(evidence);
 for(const record of evidence){
  const receipt=recipes.resolveRecipe(recipes.readRecipe(record.text,'surface'),record.filename,record.projectRoot);if(!receipt||receipt.namespace===namespace)continue;
  const identity=areaIdentities(record.text).find(item=>item.namespace===receipt.identity.namespace.toLowerCase());if(!identity||JSON.stringify(identity.values)!==JSON.stringify(receipt.identity.values))throw Error('Other Stage surface identity changed: '+record.filename);
  const participant=receipt.settings.participants.find(item=>same(item.defFilename,contract.defFilename)&&same(item.sourceFilename,source.filename));if(!participant)continue;
  const document=receipt.documents.find(item=>/^participant\d+$/.test(item.role)&&same(item.filename,source.filename));if(!document)throw Error('Other Stage participant receipt is missing: '+record.filename+' -> '+source.filename);
  const start='# IKEMaker managed Stage recipe '+receipt.namespace+' '+document.role+' '+document.bodyHash+document.eol,at=checked.indexOf(start),end='# End IKEMaker managed Stage recipe '+receipt.namespace+' '+document.role,endAt=checked.indexOf(end,at+start.length);
  if(at<0||endAt<0)throw Error('Other Stage managed adapter is missing: '+record.filename+' -> '+source.filename);
  const body=checked.slice(at+start.length,endAt),prefix=receipt.namespace+'_c'+Number(document.role.slice(11)),guard=identity.values.map((value,index)=>'stageConst('+identity.namespace+'_identity_'+index+') = '+value).join(' && ');
  if(hash(body)!==document.bodyHash||!body.includes('# Reviewed one-way surface compatibility adapter '+prefix+'. No fighter-name guessing.')||!body.includes(' if !isHelper && ('+guard+') && (')||!body.includes('# End reviewed compatibility adapter '+prefix))throw Error('Other Stage adapter body/identity guard needs source review: '+source.filename+' (Stage '+record.filename+')');
  checked=recipes.stripBlock(checked,receipt.namespace,document);
 }
 return checked;
}
function allocateNamespace(stageFilename,sources,records){
 const seed=hash(path.resolve(stageFilename).toLowerCase()).slice(0,12);for(let index=0;index<100;index++){const candidate='ikm_surface_'+seed+(index?'_'+index:'');if(!sources.some(source=>source.text.toLowerCase().includes(candidate))&&!records.some(record=>record.text.toLowerCase().includes(candidate)))return candidate;}throw Error('No unambiguous surface namespace is available. Review existing surface recipes.');
}
module.exports={verifiedOtherSurfaceText,allocateNamespace};
