'use strict';

// Restoring the current scene leaves form values intact. A different scene may
// only replace the form when the current values still match the loaded model.
function clientScript() {
  return `globalThis.ikemenNavigationSelection=()=>current()?{sceneKey:current().key}:undefined;
  globalThis.ikemenCanRestoreNavigation=ref=>{
    const matches=typeof ref?.sceneKey==='string'?model.scenes.filter(scene=>scene.key===ref.sceneKey):Number.isInteger(ref?.sceneNumber)?model.scenes.filter(scene=>scene.number===ref.sceneNumber):[];
    if(matches.length!==1)return false;
    const scene=current();
    if(scene===matches[0])return true;
    return !scene||(String($('duration').value)===String(scene.endTime)&&String($('color').value)===scene.clearColor.join(',')&&globalThis.ikemenSceneEffectsClean?.()!==false);
  };
  globalThis.ikemenRestoreNavigation=ref=>{
    if(!globalThis.ikemenCanRestoreNavigation(ref))throw new Error('Scene unavailable or unapplied scene edits');
    const target=typeof ref.sceneKey==='string'?model.scenes.find(scene=>scene.key===ref.sceneKey):model.scenes.find(scene=>scene.number===ref.sceneNumber);
    if(current()===target)return;
    selected=model.scenes.indexOf(target);render();
  };`;
}
module.exports={clientScript};
