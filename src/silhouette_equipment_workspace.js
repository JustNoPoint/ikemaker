'use strict';
const {normalizePreviewLayers}=require('./preview_layers_model');
async function openSilhouetteEquipment(context,services={}){
 const api=services.api||require('vscode');
 const review=context.review;
 if(!review?.palettePairs?.length)throw Error('Reopen the silhouette bake review before generating equipment code.');
 const composition=normalizePreviewLayers(context.composition);
 const slot=composition.primary==='base'?'layer1':composition.primary;
 let previousExpression=context.equippedExpression;
 const workspace=require('./costume_explod_workspace');
 for(const owner of context.ownerDefs||[]){
   const definition=await api.workspace.openTextDocument(api.Uri.file(owner));
   const assigned=workspace.assignments(owner,definition.getText());
   if(require('path').resolve(assigned.sff||'').toLowerCase()!==require('path').resolve(context.sffPath).toLowerCase())continue;
   for(const filename of assigned.states){
     const document=await api.workspace.openTextDocument(api.Uri.file(filename)),text=document.getText();
     for(const marker of text.matchAll(/^[#;] IKEMaker managed costume [^\r\n]+/gm)){
       if(!marker[0].startsWith('# IKEMaker managed costume '+slot+' ')&&!marker[0].startsWith('; IKEMaker managed costume '+slot+' '))continue;
       const installed=workspace.managedSpecification(marker[0],text,marker.index);
       if(installed?.spec?.equipment?.equippedExpression)previousExpression=installed.spec.equipment.equippedExpression;
     }
   }
 }
 const equippedExpression=await api.window.showInputBox({title:'Equipment on/off condition',prompt:'True draws the equipped silhouette and visible claw. False hides both; your loss and pickup states control this expression.',value:previousExpression||'map(ikemaker_equipped_claw)',validateInput:value=>!value.trim()||/[\r\n;{}\[\]#]/.test(value)?'Enter one trigger expression.':undefined});
 if(equippedExpression===undefined)return;
 const bank=Number(review.bank??review.targetBank??composition.layers.find(l=>l.id===slot)?.source.bank??1);
 composition.layers=composition.layers.map(layer=>layer.id===slot?{...layer,enabled:true,visible:true,label:'Visible claw',source:{...layer.source,kind:'bank',bank},castShadow:false,showReflection:false}:layer);
 composition.primary=slot;composition.selected=[slot];
 const archiveHash=require('crypto').createHash('sha256').update(require('fs').readFileSync(context.sffPath)).digest('hex');
 if(context.bakedHash && context.bakedHash!==archiveHash)throw Error('The baked SFF changed. Reopen its silhouette review before generating code.');
 const mappings=review.cumulativeMappings||[...(review.continuation?.mappings||[]),...(review.mappings||[])];
 const equipment={palettePairs:review.palettePairs,equippedExpression,archiveHash,mappings,bank};
 return require('./costume_explod_workspace').openCostumeLayer({...context,composition,runtimeMode:'body-pose',equipment},services);
}
module.exports={openSilhouetteEquipment};
