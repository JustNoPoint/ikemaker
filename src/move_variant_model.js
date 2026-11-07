'use strict';
const path=require('node:path');
const {hash}=require('./mutation_safety');
const {parseStateSource}=require('./state_transfer_model');
const {parseStateDefaultAnimation}=require('./state_animation_authority');
const {parseAir,duplicateActionPatch}=require('./air_preview_model');
const canonical=value=>path.resolve(value).toLowerCase();
const number=value=>Number.isSafeInteger(value)&&value>=0&&value<=2147483647;
function offsets(text){const rows=[0];for(let at=0;at<text.length;at++)if(text[at]==='\n')rows.push(at+1);return rows;}
function exactBlock(component,sources){
 if(component?.kind!=='state')throw Error('Choose one authored StateDef. Constants without a unique moveID StateDef are unsupported.');
 const source=sources.find(item=>canonical(item.filename)===canonical(component.filename));if(!source||hash(source.text)!==component.sourceHash)throw Error('The selected StateDef source changed.');
 const starts=offsets(source.text),start=starts[component.startLine],next=starts[component.endLine+1]??source.text.length;let end=next;while(end>start&&/[\r\n]/.test(source.text[end-1]))end--;
 const text=source.text.slice(start,end);if(hash(text.replace(/\r\n/g,'\n'))!==component.rangeHash)throw Error('The selected exact StateDef range changed.');
 const parsed=parseStateSource(text,component.filename,component.syntax==='cns'?'ikemen-cns':'zss');if(parsed.declarations.length!==1||parsed.declarations[0].dynamic||!number(parsed.declarations[0].value))throw Error('Dynamic, negative or structurally ambiguous StateDefs cannot be copied.');
 if(parsed.transfers.some(item=>item.malformed||item.structurallyInvalid))throw Error('The authored StateDef has malformed or structurally invalid controller syntax. Repair it before copying.');return{component,source,start,end,text,parsed,state:parsed.declarations[0].value};
}
function catalog(input){
 if(!input.inventoryComplete||!input.sources?.length||input.sources.some(source=>source.available===false))throw Error('Variant creation requires complete assigned state sources.');
 const states=new Map(),used=new Set(input.runtimeStateIds || []),dynamic=[];
 for(const source of input.sources){const parsed=parseStateSource(source.text,source.filename,/\.zss$/i.test(source.filename)?'zss':'ikemen-cns');for(const declaration of parsed.declarations){if(declaration.dynamic){dynamic.push(source.filename);continue;}if(!number(declaration.value))continue;used.add(declaration.value);const bucket=states.get(declaration.value)||[];bucket.push({source,declaration});states.set(declaration.value,bucket);}for(const transfer of parsed.transfers)if(!transfer.dynamic&&number(transfer.literal))used.add(transfer.literal);}
 return{states,used,dynamic};
}
function unused(used,preferred){let candidate=Number.isSafeInteger(preferred)&&preferred>=0&&preferred<=2147483647?preferred:1000;while(used.has(candidate)&&candidate<2147483647)candidate++;if(!number(candidate)||used.has(candidate))throw Error('No collision-free literal ID is available.');return candidate;}
function inspectVariant(input){
 const index=catalog(input),block=exactBlock(input.component,input.sources);if(index.states.get(block.state)?.length!==1)throw Error('The selected StateDef ID is duplicated in assigned sources. Resolve it first.');
 const helpers=[];for(const transfer of block.parsed.transfers.filter(item=>item.kind==='helper'&&(!item.field||String(item.field).toLowerCase()==='stateno'))){if(transfer.dynamic||transfer.ambiguous||transfer.malformed||transfer.redirected||!number(transfer.literal)){helpers.push({state:null,available:false,expression:transfer.expression,reason:'Dynamic/ambiguous Helper start remains shared.'});continue;}if(helpers.some(item=>item.state===transfer.literal))continue;const matches=index.states.get(transfer.literal)||[],target=matches.length===1&&(input.components||[]).filter(item=>item.kind==='state'&&canonical(item.filename)===canonical(matches[0].source.filename)&&item.startLine===matches[0].declaration.line);helpers.push({state:transfer.literal,available:Boolean(target&&target.length===1&&transfer.literal!==block.state),component:target&&target.length===1?target[0]:null,reason:matches.length!==1?'Missing or duplicate starting StateDef remains shared.':transfer.literal===block.state?'Recursive creator start remains shared.':''});}
 return{block,index,helpers,suggestedState:unused(index.used,block.state+1)};
}
function planVariant(input,choices){
 const inspected=inspectVariant(input),used=new Set(inspected.index.used),newState=choices.newState;if(!number(newState)||used.has(newState))throw Error('The proposed variant StateDef ID collides with an authored declaration/reference.');used.add(newState);
 const selected=new Set(choices.copyHelpers||[]),copies=[{...inspected.block,newState,destination:choices.destination}],mapping=new Map();
 for(const oldState of selected){const helper=inspected.helpers.find(item=>item.state===oldState&&item.available);if(!helper)throw Error('Only uniquely resolved literal one-hop Helper starting states can be copied.');const block=exactBlock(helper.component,input.sources),id=unused(used,newState+1);used.add(id);mapping.set(oldState,id);copies.push({...block,newState:id,destination:choices.helperDestinations?.[oldState]||choices.destination});}
 const actions=input.airText?parseAir(input.airText):[],airUsed=new Set(actions.map(action=>action.number)),airCopies=new Map(),warnings=[
  'SFF sprites, palettes, SND sounds, constants profiles, Helper family IDs/NumHelper guards, functions and nested state dependencies remain shared. Only selected one-hop starting states are copied.',
  'Authored conditions and other state references remain verbatim. Review numeric StateNo checks, maps/variables and shared dependency behavior before testing.'
 ];for(const spawn of require('./helper_authoring_model').inspectSource({filename:inspected.block.component.filename,text:inspected.block.text}).spawns)if(spawn.dynamicId)warnings.push('Computed Helper family ID '+spawn.params.id+' remains verbatim; it is separate from the starting StateDef.');if(inspected.index.dynamic.length)warnings.push('Computed state numbers exist. Suggested IDs are unused authored literals; runtime-derived collisions cannot be certified.');
 if (input.runtimeCatalogIncomplete) warnings.push('Engine common-state inventory is incomplete. Review the destination IDs against your target engine before applying.');
 const referenceReview = require('./move_variant_state_refs');
 if (choices.copyAir) {
   for (const source of input.sources) {
     const syntax = /\.zss$/i.test(source.filename) ? 'zss' : 'cns';
     for (const use of referenceReview.animationUses(source.text, syntax)) if (number(use.action)) airUsed.add(use.action);
   }
 }
 const append=new Map(),resources=[],stateReferences=[];
 for(const copy of copies){
  const target=input.sources.find(source=>canonical(source.filename)===canonical(copy.destination||''));if(!target)throw Error('Choose an existing assigned destination state file.');
  if((/\.zss$/i.test(target.filename)?'zss':'cns')!==copy.component.syntax)throw Error('A copied CNS/ZSS state needs a destination using the same syntax. No conversion is inferred.');
  const patches=[{start:copy.parsed.declarations[0].start,end:copy.parsed.declarations[0].end,text:String(copy.newState)}];
  warnings.push(...referenceReview.sharedFamilyReferences(copy, input.sources));
  for (const use of referenceReview.animationUses(copy.text, copy.component.syntax)) {
    warnings.push(path.basename(copy.source.filename) + ':' + (copy.component.startLine + use.line + 1) +
      ' · ' + use.label + ' ' + use.expression + ' keeps its authored animation reference.');
  }
  const references = require('./move_variant_state_refs').reviewStateReferences(copy);
  for (const ref of references) {
    stateReferences.push({ description: ref.description, remappable: Boolean(ref.patch) });
    if (ref.patch && choices.remapSelfTransfers) patches.push(ref.patch);
  }
  if(copy===copies[0])for(const transfer of copy.parsed.transfers)if(transfer.kind==='helper'&&!transfer.dynamic&&!transfer.ambiguous&&!transfer.malformed&&!transfer.redirected&&mapping.has(transfer.literal))patches.push({start:transfer.start,end:transfer.end,text:String(mapping.get(transfer.literal))});
  const animation=parseStateDefaultAnimation(copy.component);let animationStatus='shared';
  if (copy === copies[0] && choices.existingAction !== undefined) {
    if (!animation.available) throw Error('A unique literal default animation is required to switch this variant to an existing action.');
    const matches = actions.filter(action => action.number === choices.existingAction);
    if (matches.length !== 1) throw Error('The chosen AIR action is missing or duplicated.');
    const start = offsets(copy.text)[animation.line - copy.component.startLine];
    patches.push({ start: start + animation.valueStart, end: start + animation.valueEnd, text: String(choices.existingAction) });
    animationStatus = 'use existing ' + animation.action + ' → ' + choices.existingAction;
  } else if(choices.copyAir&&animation.available){const matches=actions.filter(action=>action.number===animation.action);if(matches.length!==1)throw Error(`AIR Action ${animation.action} is missing or duplicated; choose shared AIR instead.`);let id=airCopies.get(animation.action)?.newAction;if(id===undefined){id=unused(airUsed,animation.action+1);airUsed.add(id);const patch=duplicateActionPatch(input.airText,animation.action,id);airCopies.set(animation.action,{oldAction:animation.action,newAction:id,text:patch.text});}const row=animation.line-copy.component.startLine,starts=offsets(copy.text);patches.push({start:starts[row]+animation.valueStart,end:starts[row]+animation.valueEnd,text:String(id)});animationStatus=`copied ${animation.action} → ${id}`;}else if(choices.copyAir&&!animation.available){animationStatus='shared unresolved animation';warnings.push(`${copy.component.label||copy.state}: ${animation.reason}`);}
  let text=copy.text;for(const patch of patches.sort((a,b)=>b.start-a.start))text=text.slice(0,patch.start)+patch.text+text.slice(patch.end);
  const eol=target.text.includes('\r\n')?'\r\n':'\n',prior=append.get(target.filename)||'';append.set(target.filename,prior+eol+text+eol);
  resources.push({kind:copy===copies[0]?'move-state':'helper-state',from:copy.state,to:copy.newState,source:copy.source.filename,destination:target.filename,animation:animationStatus});
 }
 if(airCopies.size){if(!input.airPath)throw Error('The assigned AIR source is unavailable.');append.set(input.airPath,[...airCopies.values()].map(item=>item.text).join(''));}
 const edits=[...append].map(([filename,text])=>{const before=canonical(filename)===canonical(input.airPath||'.')?input.airText:input.sources.find(source=>canonical(source.filename)===canonical(filename)).text;return{filename,beforeHash:hash(before),afterHash:hash(before+text),offset:before.length,text};});
 const evidence={defPath:input.defPath,defHash:hash(input.defText),inventory:input.sources.map(source=>[canonical(source.filename),hash(source.text)]),airPath:input.airPath||'',airHash:hash(input.airText||'')};
 const result={version:1,newState,stateReferences,remapSelfTransfers:Boolean(choices.remapSelfTransfers),name:String(choices.name||`State ${newState} variant`).slice(0,80),resources,airCopies:[...airCopies.values()].map(({oldAction,newAction})=>({oldAction,newAction})),edits,evidence,warnings,sharedHelpers:inspected.helpers.filter(item=>!selected.has(item.state)).map(({state,expression,reason})=>({state,expression,reason})),commandPath:input.commandPath||''};
 return{...result,digest:hash(JSON.stringify(result))};
}
module.exports={inspectVariant,planVariant,unused};
