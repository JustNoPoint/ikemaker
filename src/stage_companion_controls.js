'use strict';

// These are the only Stage controls that may cross into its companion browser.
const GROUPS = Object.freeze([
  ['Backgrounds', 'addBg layeredPsd pngLayers duplicateBg removeBg inheritStageProperties copyStageLayerProperties saveStageAssembly insertStageAssembly createStageVariant saveStageComponent insertStageComponent manageStageComponents'],
  ['Preview and camera', 'stageRig guides cameraX cameraY cameraZoom cameraPreset previewSweep timeline inspectSchedule previousChange nextChange loopFirst loopSetFirst loopLast loopSetLast loopPlay captureA captureB compare fit reset'],
  ['Selected background', 'source editPreferred assetSprite assetAction startX startY copy apply applySelected discard undoPreview redoPreview'],
  ['Alignment', 'alignSeam seamReference seamTargetRow seamTargetX seamTargetTile seamPickTarget seamReferenceRow seamReferenceX seamReferenceTile seamPickReference seamFitWidth seamSecondPair seamTargetSecondRow seamTargetSecondX seamTargetSecondTile seamReferenceSecondRow seamReferenceSecondX seamReferenceSecondTile seamMatchPosition seamMatchHorizontal seamMatchVertical seamMeasure seamPreview seamCancel seamApply alignFloor floorGroundRow floorMoveY floorArtworkRow floorArtworkX floorArtworkTile floorUseRow floorPick floorPreview floorCancel floorApply'],
  ['Live and code', 'stageLive stageRebuild stageRebuildStop stageLiveX stageLiveDelta stageLiveLaunch stageLiveApply stageLiveRestore stageLiveStop stageCode'],
  ['Stage Rig', 'rigSpeed rigFine rigFast stageRigPanel'],
  ['Audio', ''],['Areas and transitions', ''],['Physical segments', ''],['Reactions', ''],['Depth and coverage', ''],['Fighter samples', ''],['Other Stage tools', '']
].map(([label,ids])=>Object.freeze({label,ids:Object.freeze(ids.split(' ').filter(Boolean))})));
const IDS = new Set(GROUPS.flatMap(group=>group.ids));
const GROUP_LABELS = new Set(GROUPS.map(group=>group.label));
const TYPES = new Set(['button','select','range','number','text','checkbox','color','search','textarea']);
function cleanControl(value){
  if(!value||typeof value!=='object'||!(IDS.has(value.id)||/^stage-auto-[1-9]\d{0,8}$/.test(value.id))||!GROUP_LABELS.has(value.group)||!TYPES.has(value.type)||typeof value.label!=='string'||value.label.length>160||typeof value.disabled!=='boolean'||typeof value.value!=='string'||value.value.length>8192)return null;
  if(typeof value.hidden!=='boolean'||!(value.pressed===null||typeof value.pressed==='boolean')||typeof value.disclosure!=='boolean'||typeof value.expanded!=='boolean')return null;
  if(value.type==='select'&&(!Array.isArray(value.options)||value.options.length>4096))return null;
  const options=value.type==='select'?value.options.filter(option=>option&&typeof option.value==='string'&&option.value.length<=2048&&typeof option.label==='string'&&option.label.length<=160).map(option=>({value:option.value,label:option.label})):[];
  if(value.type==='select'&&options.length!==value.options.length)return null;
  const limit=name=>typeof value[name]==='string'&&value[name].length<=64?value[name]:'';
  return {id:value.id,group:value.group,type:value.type,label:value.label,disabled:value.disabled,hidden:value.hidden,pressed:value.pressed,disclosure:value.disclosure,expanded:value.expanded,value:value.value,min:limit('min'),max:limit('max'),step:limit('step'),options};
}
function cleanControls(values){if(!Array.isArray(values)||values.length>512)return null;const seen=new Set(),controls=[];for(const value of values){const clean=cleanControl(value);if(!clean||seen.has(clean.id))return null;seen.add(clean.id);controls.push(clean)}return controls;}
function validIntent(control,value){if(!control||control.disabled||control.hidden)return false;if(control.type==='button')return value===null;if(control.type==='checkbox')return typeof value==='boolean';if(typeof value!=='string'||value.length>8192)return false;if(control.type==='select')return control.options.some(option=>option.value===value);if(control.type==='number'||control.type==='range'){const number=Number(value);return value!==''&&Number.isFinite(number)&&(!control.min||number>=Number(control.min))&&(!control.max||number<=Number(control.max));}if(control.type==='color')return /^#[0-9a-fA-F]{6}$/.test(value);return true;}
module.exports={GROUPS,IDS,GROUP_LABELS,TYPES,cleanControl,cleanControls,validIntent};
