'use strict';

// Restoring the current scene leaves form values intact. A different scene may
// only replace the form when the current values still match the loaded model.
function clientScript() {
  return `globalThis.ikemenNavigationSelection=()=>current()?{sceneNumber:current().number}:undefined;
  globalThis.ikemenCanRestoreNavigation=ref=>{
    if(!Number.isInteger(ref?.sceneNumber)||model.scenes.filter(scene=>scene.number===ref.sceneNumber).length!==1)return false;
    const scene=current();
    if(scene?.number===ref.sceneNumber)return true;
    return !scene||(String($('duration').value)===String(scene.endTime)&&String($('color').value)===scene.clearColor.join(','));
  };
  globalThis.ikemenRestoreNavigation=ref=>{
    if(!globalThis.ikemenCanRestoreNavigation(ref))throw new Error('Scene unavailable or unapplied scene edits');
    if(current()?.number===ref.sceneNumber)return;
    selected=model.scenes.findIndex(scene=>scene.number===ref.sceneNumber);render();
  };`;
}
module.exports={clientScript};
