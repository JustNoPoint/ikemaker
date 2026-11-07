'use strict';
const path=require('node:path');
const {hash}=require('./mutation_safety');
const {inspectVariant,planVariant}=require('./move_variant_model');
const canonical=value=>path.resolve(value).toLowerCase();
const local=(filename,folder)=>{const relative=path.relative(folder,filename);return relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative)};
async function createVariant(owner,message,services){
 const api=services.api,notice=reason=>{services.post(owner,{type:'moveVariantResult',ok:false,reason});return api.window.showWarningMessage(reason)};
 if(owner.busy||!services.active(owner))return notice('Focus the selected Move Lab move and finish its pending operation first.');
 owner.busy=true;
 let committedPlan=null;
 try{
  const runtime = services.runtimeCatalog ? await services.runtimeCatalog(owner) : null;
  const snapshot = () => {
    runtime?.check();
    const input = services.snapshot(owner, message);
    return runtime ? { ...input, runtimeStateIds: runtime.ids, runtimeCatalogIncomplete: !runtime.complete } : input;
  };
  const input=snapshot(),inspection=inspectVariant(input);
  if(services.hasDraft(owner,input.component))return notice('Apply or discard the selected StateDef draft before copying its authored source.');
  const name=await api.window.showInputBox({title:'Create move variant',prompt:'Variant / command name',value:(input.component.label||'Move')+' EX',validateInput:value=>value.trim()&&value.length<=80&&!/[\r\n\0]/.test(value)?undefined:'Enter a name of 1–80 characters.'});if(name===undefined)return;
  const id=await api.window.showInputBox({title:'Variant StateDef ID',value:String(inspection.suggestedState),prompt:'Suggested unused authored literal ID; dynamic numbering still needs in-game review.',validateInput:value=>/^\d+$/.test(value)&&Number(value)<=2147483647&&!inspection.index.used.has(Number(value))?undefined:'Choose a nonnegative engine-range ID unused by assigned sources and known engine states.'});if(id===undefined)return;
  const targets=syntax=>input.sources.filter(source=>local(source.filename,input.folder)&&(/\.zss$/i.test(source.filename)?'zss':'cns')===syntax);
  const chooseDestination=async(component,title)=>{const files=targets(component.syntax);if(!files.length)throw Error('No local assigned file with matching syntax is available. Add an appropriate character-owned state file before creating this variant.');if(files.length===1)return files[0].filename;const picked=await api.window.showQuickPick(files.map(file=>({label:path.basename(file.filename),description:file.filename,filename:file.filename,picked:canonical(file.filename)===canonical(component.filename)})),{title});return picked?.filename;};
  const destination=await chooseDestination(input.component,'Variant destination (existing local assigned source)');if(!destination)return;
  const helperOptions=inspection.helpers.filter(helper=>helper.available);
  const picked=helperOptions.length?await api.window.showQuickPick(helperOptions.map(helper=>({label:'Copy Helper starting StateDef '+helper.state,description:path.basename(helper.component.filename),state:helper.state,picked:false})),{title:'Copy one-hop Helper behavior or leave it shared',canPickMany:true,placeHolder:'Unchecked Helper states stay shared. Family IDs and NumHelper guards stay authored.'}):[];if(!picked)return;
  const helperDestinations={};for(const item of picked){const helper=helperOptions.find(helper=>helper.state===item.state);if(!helper)throw Error('The selected Helper copy choice is invalid.');if(services.hasDraft(owner,helper.component))throw Error('A selected Helper state has an unapplied draft. Apply or discard it before copying.');helperDestinations[item.state]=helper.component.syntax===input.component.syntax?destination:await chooseDestination(helper.component,'Destination for copied Helper StateDef '+item.state);if(!helperDestinations[item.state])return;}
  const artworkOptions = [
    {label:'Share existing AIR actions',description:'Keep the original animation references.',copyAir:false},
    {label:'Copy resolved default AIR actions',description:'Copy frames, collisions, timing and loop. Keep sprites shared.',copyAir:true}
  ];
  const defaultAnimation = require('./state_animation_authority').parseStateDefaultAnimation(input.component);
  const actionCounts = new Map();
  if (defaultAnimation.available && input.airText) {
    for (const action of require('./air_preview_model').parseAir(input.airText)) {
      actionCounts.set(action.number, (actionCounts.get(action.number) || 0) + 1);
    }
  }
  const alternatives = [...actionCounts].filter(([action, count]) => count === 1 && action >= 0 && action !== defaultAnimation.action);
  if (alternatives.length) artworkOptions.push({label:'Use another existing AIR action…',description:'Change only the copied move’s default animation.',chooseAction:true});
  const artwork=await api.window.showQuickPick(artworkOptions,{title:'Variant animation resources'});if(!artwork)return;
  const choices={name:name.trim(),newState:Number(id),destination,copyHelpers:picked.map(item=>item.state),helperDestinations,copyAir:artwork.copyAir===true};
  if (artwork.chooseAction) {
    const chosen = await api.window.showQuickPick(alternatives.map(([action]) => ({ label: 'Action ' + action, action })), {title:'Variant default AIR action'});
    if (!chosen) return;
    choices.existingAction = chosen.action;
  }
  let current=snapshot(),plan=planVariant(current,choices);
  if (plan.stateReferences.some(ref => ref.remappable)) {
    const choice = await api.window.showQuickPick([
      { label: 'Redirect self-transitions to the copied state', remap: true },
      { label: 'Keep self-transitions targeting the original state', remap: false }
    ], { title: 'Variant self-transitions', placeHolder: 'Applies only to direct literal ChangeState and SelfState destinations.' });
    if (!choice) return;
    choices.remapSelfTransfers = choice.remap;
    plan = planVariant(current, choices);
  }
  const referenceDetails = plan.stateReferences.map(ref => ref.description +
    (ref.remappable ? (plan.remapSelfTransfers ? ' (remapped)' : ' (kept)') : ''));
  const detail=[...plan.resources.map(resource=>`${resource.kind}: ${resource.from} → ${resource.to}\n${resource.source} → ${resource.destination}\nAIR: ${resource.animation}`),...referenceDetails,'Affected exact files:',...plan.edits.map(edit=>`${edit.filename} (+${Buffer.byteLength(edit.text,'utf8')} bytes; source ${edit.beforeHash.slice(0,12)})`),'Shared:',...plan.warnings,...plan.sharedHelpers.map(helper=>`Helper ${helper.state??helper.expression}: shared ${helper.reason||''}`),'Command Maker receives a name/target draft only. Input sequence and ChangeState trigger require your separate review. Creation applies to open documents; native Save/Auto Save preferences apply.'].join('\n\n');
  const approved=await api.window.showWarningMessage(`Create ${plan.name} as StateDef ${plan.newState}?`,{modal:true,detail},'Create Variant');if(approved!=='Create Variant')return;
  current=snapshot();if(!services.active(owner)||planVariant(current,choices).digest!==plan.digest)throw Error('The source, assignments, resource IDs or selection changed after review. No variant was created.');
  const documents=[];for(const edit of plan.edits){const document=await api.workspace.openTextDocument(api.Uri.file(edit.filename));if(canonical(document.fileName)!==canonical(edit.filename)||hash(document.getText())!==edit.beforeHash)throw Error('An affected source changed while opening. No variant was created.');runtime?.allowCleanOpen?.(document);documents.push({document,edit});}
  current=snapshot();if(!services.active(owner)||planVariant(current,choices).digest!==plan.digest||documents.some(({document,edit})=>hash(document.getText())!==edit.beforeHash))throw Error('An exact variant source changed immediately before applying. Nothing was changed.');
  const workspaceEdit=new api.WorkspaceEdit();for(const {document,edit}of documents)workspaceEdit.insert(document.uri,document.positionAt(edit.offset),edit.text);
  if(!await api.workspace.applyEdit(workspaceEdit))throw Error('The native editor declined the variant edit.');
  if(documents.some(({document,edit})=>hash(document.getText())!==edit.afterHash))throw Error('The native editor did not produce the exact reviewed variant. Inspect its Undo history before continuing.');
  committedPlan=plan;
  if(!services.active(owner)){api.window.showInformationMessage('The reviewed variant was created in its original open documents. Save/Undo there; Command Maker was not retargeted after the selection changed.');return{created:true,plan};}
  await services.refresh(owner,plan);services.post(owner,{type:'moveVariantResult',ok:true,state:plan.newState,reason:`Created ${plan.name} in open documents. Use native Save or Undo; original resources remain intact.`});
  if(!services.active(owner))return{created:true,plan};
  if(plan.commandPath){try{await services.openCommand({defPath:input.defPath,commandPath:plan.commandPath,name:plan.name,state:plan.newState});}catch(error){api.window.showInformationMessage('Variant created. Command Maker draft was not opened: '+error.message);}}else api.window.showInformationMessage('Variant created. No assigned command file is available for Command Maker.');
  return{created:true,plan};
 }catch(error){if(committedPlan){const reason='Variant created in open documents; follow-up did not finish: '+error.message;services.post(owner,{type:'moveVariantResult',ok:true,state:committedPlan.newState,reason});api.window.showInformationMessage(reason);return{created:true,plan:committedPlan};}return notice(error.message)}finally{owner.busy=false;services.post(owner,{type:'moveVariantReady'});}
}
module.exports={createVariant};
