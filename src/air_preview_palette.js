'use strict';
function resolveAirPreviewPalette(preferences,group,manualPaletteIndex=null,followSpritePalette=true){
 if(followSpritePalette!==false)return null;
 if(manualPaletteIndex===-1)return null;
 if(Number.isInteger(manualPaletteIndex)&&manualPaletteIndex>=0)return manualPaletteIndex;
 const groupIndex=preferences?.explicitGroupPaletteIndices?.[String(group)];
 if(Number.isInteger(groupIndex)&&groupIndex>=0)return groupIndex;
 return preferences?.screenPaletteExplicit===true&&Number.isInteger(preferences.screenPaletteIndex)&&preferences.screenPaletteIndex>=0?preferences.screenPaletteIndex:null;
}
function sameAirPreviewContext(before,after){return String(before?.airPath||'')===String(after?.airPath||'')&&String(before?.sffPath||'')===String(after?.sffPath||'');}
function initialAirPaletteFollow(saved,model){const same=String(saved?.airPath||'')===String(model?.airPath||'')&&String(saved?.sffPath||'')===String(model?.sffPath||'')&&String(saved?.sourceFingerprint||'')===String(model?.sourceFingerprint||'');return same&&saved?.followSpritePalette===false?false:true;}
module.exports={initialAirPaletteFollow,resolveAirPreviewPalette,sameAirPreviewContext};
