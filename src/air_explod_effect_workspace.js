"use strict";
const path=require('path');
const {normalizePreviewLayers}=require('./preview_layers_model');
const {assignments,usedExplodIds}=require('./costume_explod_workspace');
const {createAirEffectSeed}=require('./air_explod_effect_model');
const {wrapBlock,stableId,planUpdate}=require('./authoring_links');
function stateDestinations(source) {
 const syntax=/\.zss$/i.test(source.document.fileName)?'zss':'cns';
 const sections=require('./costume_explod_workspace').allStateSections(source.text,syntax);
 return sections.map(section=>({label:'State '+section.stateNumber,description:path.basename(source.document.fileName),source,stateNumber:section.stateNumber,start:section.start}));
}

async function openAirEffect(context,services={}) {
 const api=services.api||require('vscode'), composition=normalizePreviewLayers(context.composition);
 const requested=composition.layers.filter(layer=>layer.id!=='base'&&composition.selected.includes(layer.id));
 if(requested.some(layer=>layer.source.kind!=='animation'))throw new Error('All selected runtime layers must use animation artwork. Deselect costume or sprite layers first.');
 const selected=composition.layers.filter(layer=>layer.id!=='base'&&composition.selected.includes(layer.id)&&layer.source.kind==='animation');
 if(!selected.length)throw new Error('Select animation overlay layers to hand to Explod Lab. Preview visibility does not control runtime inclusion.');
 const candidates=[];
 for(const filename of new Set(context.ownerDefs||[])){const document=await api.workspace.openTextDocument(api.Uri.file(filename)),assets=assignments(filename,document.getText());if(assets.air&&path.resolve(assets.air).toLowerCase()===path.resolve(context.airPath).toLowerCase())candidates.push({label:path.basename(filename),filename,assets});}
 if(!candidates.length)throw new Error('Open the AIR assigned by a character DEF before handing off an effect.');
 const owner=candidates.length===1?candidates[0]:await api.window.showQuickPick(candidates,{title:'AIR to Explod Lab',placeHolder:'Choose the owning character'});if(!owner)return;
 const layer=selected.length===1?selected[0]:(await api.window.showQuickPick(selected.map(layer=>({label:layer.label,description:'Action '+layer.source.action+(!layer.enabled?' - disabled in preview':layer.visible?' - visible in preview':' - hidden in preview'),layer})),{title:'AIR to Explod Lab',placeHolder:'Choose the runtime effect to review; repeat for other selected layers'}))?.layer;if(!layer)return;
 const air=await api.workspace.openTextDocument(api.Uri.file(context.airPath));
 const sources=await Promise.all([...new Set([...owner.assets.states,...(owner.assets.cmd?[owner.assets.cmd]:[])])].map(async filename=>{const document=await api.workspace.openTextDocument(api.Uri.file(filename));return{document,text:document.getText()};}));
 const allChoices=sources.flatMap(source=>stateDestinations(source)),stateCounts=new Map();for(const item of allChoices)stateCounts.set(item.stateNumber,(stateCounts.get(item.stateNumber)||0)+1);
 const choices=allChoices.filter(item=>stateCounts.get(item.stateNumber)===1);
 if(!choices.length)throw new Error('Add an owning StateDef in an assigned state source before handing off the effect.');
 const destination=await api.window.showQuickPick(choices,{title:'AIR to Explod Lab',placeHolder:'Choose the owning runtime StateDef (independent of AIR Action numbers)'});if(!destination)return;
 const used=usedExplodIds(sources);let id=71000;while(used.has(id))id++;
 const seed=createAirEffectSeed({defPath:owner.filename,airPath:context.airPath,airText:air.getText(),composition,layerId:layer.id,ownerAction:context.action,id});
 const timing=await api.window.showQuickPick([{label:'Owning state entry',trigger:'time = 0',detail:'Create once when the selected runtime StateDef starts.'},...(Number.isInteger(context.action)?[{label:'Start of AIR Action '+context.action,trigger:'anim = '+context.action+' && AnimElemTime(1) = 0',detail:'Create when this animation starts, including ChangeAnim later in the state.'}]:[])],{title:'Effect creation timing',placeHolder:'Choose when the effect starts; edit the trigger further in Explod Lab'});if(!timing)return;
 seed.plan.trigger=timing.trigger;
 seed.destination={filename:destination.source.document.fileName,sourceHash:require('./mutation_safety').hash(destination.source.text),stateNumber:destination.stateNumber,start:destination.start};seed.plan.language=/\.zss$/i.test(seed.destination.filename)?'zss':'cns';
 return api.commands.executeCommand('ikemen.explodComposer.open',api.Uri.file(owner.filename),{airEffect:seed});
}
async function applyAirEffect(owner, displayedCode, services={}) {
 const api=services.api||require('vscode'),model=require('./air_explod_effect_model');
 const seed=model.validateAirEffectSeed(owner.airEffect,owner.defPath),generated=require('./spatial_authoring_model').generateExplod(owner.plan);
 if(!generated.valid||displayedCode!==generated.code)throw new Error('The effect code changed. Review the refreshed Lab code before applying.');
 const destination=seed.destination;if(!destination)throw new Error('Choose the owning StateDef from AIR first.');
 const definition=await api.workspace.openTextDocument(api.Uri.file(owner.defPath)),assets=assignments(owner.defPath,definition.getText());
 const sources=await Promise.all([...new Set([...assets.states,...(assets.cmd?[assets.cmd]:[])])].map(async filename=>{const document=await api.workspace.openTextDocument(api.Uri.file(filename));return {document,text:document.getText()};}));
 const matchingStates=sources.flatMap(source=>stateDestinations(source)).filter(item=>String(item.stateNumber)===String(destination.stateNumber));if(matchingStates.length!==1)throw new Error('The owning StateDef is ambiguous across assigned sources.');
 const target=sources.find(source=>path.resolve(source.document.fileName).toLowerCase()===path.resolve(destination.filename).toLowerCase());
 const syntax=/\.zss$/i.test(destination.filename)?'zss':'cns';if(owner.plan.language!==syntax)throw new Error('Choose '+syntax.toUpperCase()+' output for the selected owning state source.');
 const sections=require('./costume_explod_workspace').globalSections(target.text,syntax,destination.stateNumber);
 if(sections.length!==1||sections[0].start!==destination.start)throw new Error('The owning StateDef is missing or duplicated. Hand the effect off again.');
 const linked=wrapBlock(generated.code,{tool:'explod',id:stableId(owner.defPath,seed.airPath,seed.layerId,destination.filename,destination.stateNumber),role:'effect',syntax,label:`AIR effect · Explod ${owner.plan.id}`,mode:'managed'});
 const planned=planUpdate(target.text,linked);
 if(planned.status==='conflict')throw new Error(planned.reason+' The AIR effect was not changed.');
 const sourcesWithoutOwn=sources.map(source=>source===target&&planned.status!=='new'?{...source,text:source.text.slice(0,planned.start)+source.text.slice(planned.end)}:source);
 if(usedExplodIds(sourcesWithoutOwn).has(owner.plan.id))throw new Error('This Explod ID already occurs in assigned state code outside the linked effect. Choose a new ID or edit the existing controller.');
 if(planned.status==='unchanged'){owner.airEffect=null;return {reused:true};}
 if(planned.status==='update'){
  const choice=await api.window.showWarningMessage('Replace the clean linked AIR effect in this StateDef?',{modal:true,detail:'The reviewed generated block will be replaced as one native unsaved edit. Adjacent authored code stays intact.'},'Replace Linked Effect');
  if(choice!=='Replace Linked Effect')return {cancelled:true};
  if(planUpdate(target.document.getText(),linked).status!=='update')throw new Error('The linked AIR effect changed during review. Reopen Explod Lab.');
 }
 const edit=new api.WorkspaceEdit();
 if(planned.status==='update')edit.replace(target.document.uri,new api.Range(target.document.positionAt(planned.start),target.document.positionAt(planned.end)),planned.text);
 else {const patch=require('./costume_explod_workspace').stateInsertion(target.text,linked,sections[0],destination.stateNumber);edit.insert(target.document.uri,target.document.positionAt(patch.offset),patch.code);}
 model.validateAirEffectSeed(owner.airEffect,owner.defPath);
 if(!await api.workspace.applyEdit(edit))throw new Error('The editor did not apply the reviewed effect.');
 owner.airEffect=null;
 await api.window.showTextDocument(target.document,{preview:false});
 return {applied:true,updated:planned.status==='update'};
}
module.exports={openAirEffect,applyAirEffect,stateDestinations};
