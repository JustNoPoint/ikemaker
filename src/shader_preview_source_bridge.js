'use strict';

const {previewFromSff,previewFromAir}=require('./shader_preview_model');
const {MAX_AIR_BYTES,createShaderSourceAuthority}=require('./shader_source_authority');

function createShaderPreviewSourceBridge(options={}){
  const authority=options.sourceAuthority||createShaderSourceAuthority(options);
  return Object.freeze({
    fromSff(filename,selection,paletteOverride=null){const captured=authority.captureSff(filename,selection);return Object.freeze({preview:previewFromSff(captured.observed.archive,captured.observed.archive.sprites[captured.evidence.physicalIndex],paletteOverride),source:captured.evidence});},
    fromAir(sffFilename,airFilename,actionNumber,paletteForGroup=null,spriteSelection=null){const captured=authority.captureAir(sffFilename,airFilename,actionNumber,spriteSelection);return Object.freeze({preview:previewFromAir(captured.sffObserved.archive,captured.action,paletteForGroup),source:captured.evidence});},
    refresh(source,paletteOverride=null){const captured=authority.revalidate(source);if(source.kind==='sff')return Object.freeze({preview:previewFromSff(captured.observed.archive,captured.observed.archive.sprites[captured.evidence.physicalIndex],paletteOverride),source:captured.evidence});return Object.freeze({preview:previewFromAir(captured.sffObserved.archive,captured.action,paletteOverride),source:captured.evidence});}
  });
}

module.exports={MAX_AIR_BYTES,createShaderPreviewSourceBridge};
