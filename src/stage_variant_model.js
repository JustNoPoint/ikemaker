'use strict';
const path=require('node:path'),{parseDef,unquote}=require('./def_model'),{sectionSource,setEntry}=require('./stage_source_edits'),{resourcesFor}=require('./stage_assembly_model'),{hash}=require('./mutation_safety'),{applyBindings}=require('./stage_assembly_dependencies');
const isBackground=s=>/^bg\s/i.test(s.name),isAction=s=>/^begin\s+action\s+\d+$/i.test(s.name);
function artResources(text){const doc=parseDef(text);return resourcesFor(doc.sections.filter(isBackground).map(s=>sectionSource(text,s)),doc.sections.filter(isAction).map(s=>sectionSource(text,s)));}
function spriteKey(raw){const key=String(raw).replace(/\s/g,'');if(!/^\d+,\d+$/.test(key)||key.split(',').some(n=>Number(n)>65535))throw Error('Choose a concrete replacement sprite group,number.');return key;}
function calibrationText(text){
 text=require('./stage_area_identity').stripAreaIdentity(text);
 const doc=parseDef(text),lines=String(text).split(/(\r\n|\r|\n)/);
 for(let i=0;i<doc.sections.length;i++){const section=doc.sections[i],end=doc.sections[i+1]?.line??doc.lines.length;
  for(const entry of section.entries)if(section.normalized==='bgdef'&&entry.normalized==='spr'||isBackground(section)&&entry.normalized==='spriteno'){const raw=lines[entry.line*2],equals=raw.indexOf('=');lines[entry.line*2]=raw.slice(0,equals+1)+'<art>';}
  if(isAction(section))for(let line=section.line+1;line<end;line++)lines[line*2]=lines[line*2].replace(/^(\s*)\d+(\s*,\s*)\d+(\s*,)/,'$1<group>$2<number>$3');
 }
 return lines.join('');
}
function planStageVariant({text,sourceFilename,destination,sffReference,mappings={},sourceSprites={},destinationSprites={},round,requireMatchingBounds=false}){
 if(!sourceFilename||!destination||path.resolve(sourceFilename).toLowerCase()===path.resolve(destination).toLowerCase())throw Error('Choose a separate new Stage DEF for the variant.');
 if(path.dirname(path.resolve(sourceFilename)).toLowerCase()!==path.dirname(path.resolve(destination)).toLowerCase())throw Error('Create the variant beside its source Stage so attached, music and round references keep their runtime meaning.');
 if(!/\.def$/i.test(destination))throw Error('New round variant destination must be a DEF file.');
 if(!sffReference||/[\r\n\x00]/.test(sffReference)||path.isAbsolute(unquote(sffReference)))throw Error('Choose a relative replacement SFF reference.');
 const doc=parseDef(text,sourceFilename),bgdefs=doc.sections.filter(s=>s.normalized==='bgdef');if(bgdefs.length!==1||bgdefs[0].entries.filter(e=>e.normalized==='spr').length!==1)throw Error('Variant needs one unambiguous BGDef sprite archive.');
 const resources=artResources(text),normalized={},changes=[],warnings=[];
 for(const key of resources){if(!Object.prototype.hasOwnProperty.call(mappings,key))throw Error('Explicitly bind replacement art for sprite '+key);const replacement=spriteKey(mappings[key]),before=sourceSprites[key],after=destinationSprites[replacement];if(!before||!after||['width','height','axisX','axisY'].some(k=>!Number.isFinite(before[k])||!Number.isFinite(after[k]))||before.width<=0||before.height<=0||after.width<=0||after.height<=0)throw Error('Replacement '+key+' → '+replacement+' lacks valid sprite dimensions/axes.');const matching=['width','height','axisX','axisY'].every(k=>before[k]===after[k]);if(!matching){if(requireMatchingBounds)throw Error('Replacement '+key+' → '+replacement+' changes sprite dimensions/axes.');warnings.push(key+' → '+replacement+': artwork bounds/axes differ; floor and seam pixels may need adjustment after visual review.');}normalized[key]=replacement;changes.push({source:key,target:replacement,matchingBounds:matching,sourceBounds:{...before},bounds:{width:after.width,height:after.height,axisX:after.axisX,axisY:after.axisY}});}
 let next=text;const rawLines=String(text).split(/(\r\n|\r|\n)/);
 for(let i=0;i<doc.sections.length;i++){const section=doc.sections[i],end=doc.sections[i+1]?.line??doc.lines.length;
  if(isBackground(section)){const refs=section.entries.filter(e=>e.normalized==='spriteno');if(refs.length>1)throw Error('Duplicate sprite fields need source review before variant creation.');}
  if(isAction(section))for(let line=section.line+1;line<end;line++)rawLines[line*2]=rawLines[line*2].replace(/^(\s*)(\d+)(\s*,\s*)(\d+)(\s*,)/,(raw,space,g,comma,n,tail)=>{const key=spriteKey(g+','+n),parts=normalized[key]?.split(',');if(!parts)throw Error('Unmapped embedded AIR art '+key);return space+parts[0]+comma+parts[1]+tail;});
 }
 next=rawLines.join('');for(const section of doc.sections.filter(isBackground).sort((a,b)=>b.line-a.line)){const entry=section.entries.find(e=>e.normalized==='spriteno');if(entry)next=setEntry(next,section.line,'spriteno',normalized[spriteKey(entry.value)]);}
 next=setEntry(next,bgdefs[0].line,'spr',sffReference);
 if(calibrationText(next)!==calibrationText(text))throw Error('Variant would change calibrated camera/floor/layer/controller geometry.');
 const sanitized=require('./stage_area_identity').stripAreaIdentity(next);if(sanitized!==next)warnings.push('The new variant omits reserved IKEMaker area/reaction identity constants. Existing linked code remains guarded to its original Stage; arbitrary authored Constants are preserved.');next=sanitized;
 let parentText=null,binding=null;if(round!==undefined&&round!==null){if(!Number.isInteger(round)||round<2||round>999)throw Error('Choose a literal round number 2–999. Round 1 starts on the main Stage.');const assignments=require('./stage_round_assignment').roundAssignments(text),key=assignments.rounds.find(row=>row.round===round)?.key.toLowerCase()||'round'+round+'def',relative=path.basename(destination),value=/[\s;]/.test(relative)?'"'+relative+'"':relative;const parent=applyBindings(text,{[key]:value});parentText=parent.text;binding=parent.changes[0]||{key,previous:value,value};}
 return Object.freeze({kind:'stage-round-variant',sourceFilename,destination,text:next,sourceHash:hash(text),candidateHash:hash(next),calibrationHash:hash(calibrationText(text)),sffReference,mappings:Object.freeze(normalized),changes:Object.freeze(changes),warnings:Object.freeze(warnings),parentText,binding,authoredCalibrationPreserved:true,geometryPreserved:warnings.length===0,notice:'Authored camera, floor, seams, layer order, AIR timing and controller IDs are preserved. Replacement pixel content still requires Canvas/native visual review.'});
}
module.exports={artResources,calibrationText,planStageVariant};
