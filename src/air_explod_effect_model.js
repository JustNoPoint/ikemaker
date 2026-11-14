"use strict";
const path = require('path');
const {parseAir} = require('./air_preview_model');
const {normalizePreviewLayers,orderedPreviewLayers} = require('./preview_layers_model');
const spatial = require('./spatial_authoring_model');
const {hash} = require('./mutation_safety');
function createAirEffectSeed({defPath, airPath, airText, composition, layerId, ownerAction, id = 71000}) {
 const state = normalizePreviewLayers(composition), layer = state.layers.find(item => item.id === layerId);
 if (!layer || layer.id === 'base' || layer.source.kind !== 'animation') throw new Error('Choose an animation overlay layer. Follow-base costume layers use Use Costume Layer.');
 const actions = parseAir(airText), matches = actions.filter(item => item.number === layer.source.action);
 if (matches.length !== 1 || !matches[0].frames.length) throw new Error('The effect Action must exist exactly once and contain frames.');
 if (layer.source.speed !== 1 || layer.source.tick !== 0) throw new Error('Set layer preview speed to 1 and start tick to 0 before handing it to Explod Lab. AIR timing is preserved by the runtime effect.');
 const blends = {normal:'default',opaque:'none',add:'add',subtract:'sub',A:'add',A1:'add1',S:'sub'};
 if (!Object.hasOwn(blends,layer.blend) || layer.opacity !== 1 || layer.flipY) throw new Error('Use full opacity and supported Normal/Add/Subtract blending without vertical flip before handing this layer to Explod Lab.');
 if(!Number.isInteger(layer.order)||!Number.isInteger(state.layers[0].order))throw new Error('Use whole-number draw orders before handing an effect to Explod Lab. Review absolute runtime priority in the Lab.');
 const base=state.layers.find(item=>item.id==='base'),order=orderedPreviewLayers(state).filter(item=>item.id==='base'||item.enabled||item.id===layer.id),syncLayer=order.indexOf(layer)-order.indexOf(base);
 const plan = spatial.newExplod({ownerTransform:true,runtimeRendering:layer.runtimeRendering,syncLayer,name:layer.label, id, anim:layer.source.action, trigger:'time = 0', position:[layer.x-base.x,layer.y-base.y], scale:[layer.scaleX,layer.scaleY], angle:layer.angle, facing:layer.flipX?-1:1, spritePriority:layer.runtimePriority, transparency:blends[layer.blend], bindTime:-1, removeTime:-2, removeOnChangeState:true, removeOnGetHit:true});
 return {schema:'ikemaker.air-explod-effect',version:1,defPath:path.resolve(defPath),airPath:path.resolve(airPath),sourceHash:hash(airText),layerId:layer.id,ownerAction:Number.isInteger(ownerAction)?ownerAction:undefined,plan};
}
function validateAirEffectSeed(seed, defPath) {
 if(seed?.schema!=='ikemaker.air-explod-effect'||seed.version!==1||path.resolve(seed.defPath).toLowerCase()!==path.resolve(defPath).toLowerCase())throw new Error('This AIR effect belongs to another character.');
 const fs=require('fs'),api=require('vscode'),assigned=require('./costume_explod_workspace').assignments;
 const textFor=filename=>api.workspace.textDocuments?.find(doc=>path.resolve(doc.fileName).toLowerCase()===path.resolve(filename).toLowerCase())?.getText()??fs.readFileSync(filename,'utf8');
 const assets=assigned(defPath,textFor(defPath));
 if(!assets.air||path.resolve(assets.air).toLowerCase()!==path.resolve(seed.airPath).toLowerCase()||hash(textFor(seed.airPath))!==seed.sourceHash)throw new Error('The assigned AIR changed. Return to AIR and hand the layer to Explod Lab again.');
 const plan=spatial.normalizeExplod(seed.plan);
 if(parseAir(textFor(seed.airPath)).filter(action=>action.number===plan.anim).length!==1)throw new Error('The effect Action is no longer unique.');
 if(seed.destination){const filename=seed.destination.filename;if(![...assets.states,...(assets.cmd?[assets.cmd]:[])].some(item=>path.resolve(item).toLowerCase()===path.resolve(filename).toLowerCase())||hash(textFor(filename))!==seed.destination.sourceHash)throw new Error('The selected owning StateDef source changed. Hand the layer to Explod Lab again.');}
 return {...seed,plan};
}
module.exports={createAirEffectSeed,validateAirEffectSeed};
