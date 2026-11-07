'use strict';
const {parseDef}=require('./def_model');
// char.go: Common.Const's first section, in configured order, followed by the
// actual charCNS first [Constants]. Compiler scanStateDef requires VT_Int.
function values(contract){
 const proof=contract.runtimeCatalog?.constants;
 if(proof?.complete!==true)return null;
 const result=new Map(),apply=section=>{const seen=new Set();for(const entry of section?.entries||[]){if(seen.has(entry.normalized))continue;seen.add(entry.normalized);const text=entry.value.trim(),value=/^[+-]?\d+$/.test(text)?Number(text):null;result.set(entry.normalized,{value:Number.isInteger(value)&&value>=-2147483648&&value<=2147483647?value:null,filename:section.filename,expression:text});}};
 for(const source of proof.commonInputs||[]){const section=parseDef(source.text,source.filename).sections.find(section=>section.name);if(section)apply({...section,filename:source.filename});}
 if(proof.characterCns){const sections=parseDef(proof.characterCns.text,proof.characterCns.filename).sections;if(sections.some(section=>/\.constants$/i.test(section.normalized)))result.unresolvedReason='Language-qualified Constants in '+proof.characterCns.filename+' need explicit effective-language/source composition review.';const section=sections.find(section=>section.normalized==='constants');if(section)apply({...section,filename:proof.characterCns.filename});}
 return result;
}
function headers(contract){
 const constants=values(contract),result=[];
 for(const source of contract.sources||[]){const seen=new Set(),masked=require('./unused_let_analysis').maskCommentsAndStrings(source.text,/\.zss$/i.test(source.filename)?'#':';'),matches=[...masked.matchAll(/^[ \t]*\[[ \t]*statedef[ \t]+([^;\]\r\n]+)/gim)];if(matches.length!==[...masked.matchAll(/^[ \t]*\[[ \t]*statedef\b/gim)].length)throw Error('Cannot prove StateDef header shape in '+source.filename+'. Keep a literal integer or const(Name) on its header line, or compose the hook explicitly in source.');for(const match of matches){
  const expression=match[1].split(';')[0].trim();let value;
  if(/^[+-]?\d+$/.test(expression)){value=expression==='+1'?-10:Number(expression);if(!Number.isInteger(value)||value< -2147483648||value>2147483647)throw Error('StateDef integer is outside the proven signed 32-bit range in '+source.filename+'. Review its native value before composing hooks.');}
  else {if(constants?.unresolvedReason)throw Error(constants.unresolvedReason+' StateDef '+expression+' in '+source.filename);const constant=/^const\s*\(\s*([a-z_][a-z0-9_.]*)\s*\)$/i.exec(expression),resolved=constant&&constants?.get(constant[1].toLowerCase());
   if(!resolved||resolved.value===null)throw Error('Cannot prove StateDef '+expression+' in '+source.filename+'. Resolve its literal integer Common.Const / character CNS value, or compose the post-state hook explicitly in source.');
   value=resolved.value;
   if(value<0)throw Error('Dynamic StateDef '+expression+' resolves to '+value+' in '+source.filename+' (constant from '+resolved.filename+'). Negative dynamic hooks require explicit source composition.');
  }
  if(/\.zss$/i.test(source.filename)&&seen.has(value))throw Error('Duplicate StateDef '+value+' in the same ZSS source '+source.filename+'. Compose one hook in that source; cross-file append does not permit same-file duplicates.');seen.add(value);result.push({filename:source.filename,expression,value});
 }}return result;
}
module.exports={values,headers};
