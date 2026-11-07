'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {parseDef,sectionMap}=require('./def_model');
const hash=text=>crypto.createHash('sha256').update(String(text)).digest('hex');
const integer=value=>/^-?\d+$/.test(String(value).trim())&&Number.isSafeInteger(Number(value))?Number(value):null;
const key=file=>path.resolve(file).toLowerCase();
function linked(bg){return Number(bg.raw.positionlink||0)!==0;}
function anchorFor(model,index){if(!linked(model.backgrounds[index])||index===0)return null;let anchor=index-1;while(anchor>0&&linked(model.backgrounds[anchor]))anchor--;return anchor;}
function bgMatches(model,id,index){const rows=model.backgrounds.filter(bg=>id<0||(bg.id??0)===id).map(bg=>bg.order);return index<0?rows:rows.slice(index,index+1);}
// A bounded lexical inventory, not an evaluator. Preserve offsets when masking.
function attachedRecords(text,filename){
 const cns=!/\.zss$/i.test(filename),masked=require('./unused_let_analysis').maskCommentsAndStrings(text,cns?';':'#'),records=[];
 if(cns){for(const section of parseDef(masked,filename).sections){const values=sectionMap(section),name=values.type;if(/^(?:ModifyStageBG|ModifyBGCtrl|ModifyStageVar)$/i.test(name||''))records.push({name,values,line:section.line,character:0});}}
 else{const pattern=/\b(ModifyStageBG|ModifyBGCtrl|ModifyStageVar)\s*\{/gi;let match;while((match=pattern.exec(masked))){let end=pattern.lastIndex,depth=1;while(end<masked.length&&depth){if(masked[end]==='{')depth++;if(masked[end]==='}')depth--;end++;}const body=masked.slice(pattern.lastIndex,end-1),values={};for(const entry of body.split(/[;\r\n]+/)){const pair=/^\s*([\w.]+)\s*:\s*([\s\S]*)$/.exec(entry);if(pair)values[pair[1].toLowerCase()]=pair[2].trim();}records.push({name:match[1],values,line:masked.slice(0,match.index).split('\n').length-1,character:match.index-masked.lastIndexOf('\n',match.index-1)-1});pattern.lastIndex=end;}}
 const reads=/\bstageBGVar\s*\(\s*([^,\r\n]+),\s*([^,\r\n]+),/gi;let read;while((read=reads.exec(masked)))records.push({name:'StageBGVar',values:{id:read[1].trim(),index:read[2].trim()},read:true,line:masked.slice(0,read.index).split('\n').length-1,character:read.index-masked.lastIndexOf('\n',read.index-1)-1});
 return records;
}
function stageMotionOwners(filename,text,selectedOrder,services={}){
 filename=path.resolve(filename);const document=parseDef(text,filename),model=require('./stage_model').stageModel(document),selected=model.backgrounds[selectedOrder];
 if(!selected||selected.order!==selectedOrder)throw Error('Choose a current Stage layer.');
 const read=services.readText||((file)=>fs.readFileSync(file,'utf8')),dependency={filename,fingerprint:hash(text)},context={type:'stage',key:filename,label:path.basename(filename),root:path.dirname(filename),ownerDef:'',files:[filename]},rows=[];
 const source=(line)=>({filename,line,available:true,context,dependencies:[dependency]});
 const add=(row)=>rows.push({...row,id:'motion-'+rows.length});
 const influences=new Set([selectedOrder]);let at=selectedOrder;while(anchorFor(model,at)!==null){at=anchorFor(model,at);influences.add(at);}
 for(const index of influences){const bg=model.backgrounds[index],section=document.sections.find(row=>row.line===bg.line),label=index===selectedOrder?'Layer':'Linked anchor';
  for(const name of ['velocity','sin.x','sin.y']){const entry=[...section.entries].reverse().find(row=>row.normalized===name);if(entry)add({kind:'authored',label:label+' '+name,detail:entry.value,affectedBackgrounds:model.backgrounds.filter(row=>row.order===index||anchorFor(model,row.order)===index).map(row=>row.order),target:source(entry.line),evaluated:'Authored motion preview; controller/attached writes need rig verification.'});}
  const anchor=anchorFor(model,index);if(anchor!==null)add({kind:'positionlink',label:'Position link → '+model.backgrounds[anchor].name,detail:'Most recent preceding unlinked BG; inherits start velocity and delta, adds anchor motion.',affectedBackgrounds:[index,anchor],target:source(model.backgrounds[anchor].line)});
  if(bg.action!==null){const actions=document.sections.filter(section=>new RegExp('^begin\\s+action\\s+'+bg.action+'$','i').test(section.name));for(const action of actions.slice(0,1))add({kind:'air',label:'Embedded AIR '+bg.action,detail:bg.name+(actions.length>1?' · first action owns duplicate ID; later definitions are ignored.':''),affectedBackgrounds:[index],target:source(action.line)});if(!actions.length)add({kind:'air',label:'Missing embedded AIR '+bg.action,affectedBackgrounds:[index],unresolved:true});}
 }
 for(const ctrl of model.controllers)if(ctrl.affectedBackgrounds.some(index=>influences.has(index)))add({kind:'controller',label:ctrl.heading+' · '+ctrl.type,detail:'BGs '+ctrl.affectedBackgrounds.map(index=>model.backgrounds[index].name).join(', '),affectedBackgrounds:ctrl.affectedBackgrounds,controllerOrder:ctrl.order,target:source(ctrl.line),evaluated:'Use the existing BGCtrl timeline; unsupported effects require rig verification.'});
 const targets=require('./stage_code_targets').stageCodeTargets(filename,text,services).filter(row=>row.context?.type==='character'&&row.available&&row.dependencies?.[1]&&key(row.dependencies[1].filename)===key(row.context.ownerDef));
 const attachedOwners=[];for(const target of targets){if(!attachedOwners.some(row=>key(row.ownerDef)===key(target.context.ownerDef)))attachedOwners.push({ownerDef:target.context.ownerDef,label:target.context.label,target});if(key(target.filename)===key(target.context.ownerDef)||!/^(?:st\d*|stcommon|common|cns|cmd)$/i.test(target.assignedKey||''))continue;let content;try{content=String(read(target.filename));if(hash(content)!==target.dependencies.at(-1).fingerprint)continue;}catch{continue;}
  for(const record of attachedRecords(content,target.filename)){const id=integer(record.values.id??record.values.sctrlid??(/^ModifyBGCtrl$/i.test(record.name)?'0':'-1')),index=integer(record.values.index??'-1');let affected=[],unresolved=id===null||index===null;
   if(/^ModifyBGCtrl$/i.test(record.name)){if(id!==null)affected=[...new Set(model.controllers.filter(ctrl=>(ctrl.sctrlid??0)===id).flatMap(ctrl=>ctrl.affectedBackgrounds))];}
   else if(/^ModifyStageVar$/i.test(record.name)){affected=model.backgrounds.map(bg=>bg.order);}
   else if(!unresolved)affected=bgMatches(model,id,index);
   if(record.read&&index!==null&&index<0){unresolved=true;affected=[];}
   if(!unresolved&&!affected.some(index=>influences.has(index)))continue;
   add({kind:record.read?'attached-reference':'attached-write',label:record.name+(unresolved?' · unresolved dynamic target':''),detail:target.context.label+' · '+(unresolved?'May affect this layer; target expression requires runtime evaluation.':record.read?'Literal BG reference (read only).':'Static target match; conditional execution requires rig verification.'),affectedBackgrounds:affected,unresolved,target:{...target,line:record.line,character:record.character}});
  }
 }
 return {filename,selectedOrder,selectedLine:selected.line,selectionFingerprint:hash(text),rows,attachedOwners,scope:'Static inventory of assigned attached sources only; dynamic code, redirects, external modules and runtime branches may add other writers.'};
}
function motionTargetCurrent(target,readText){try{return target?.available===true&&target.dependencies.every(row=>hash(readText(row.filename))===row.fingerprint);}catch{return false;}}
module.exports={stageMotionOwners,attachedRecords,anchorFor,bgMatches,motionTargetCurrent};
