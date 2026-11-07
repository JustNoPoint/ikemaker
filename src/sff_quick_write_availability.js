'use strict';
function quickWriteAvailability(target,writerMode){
  if(target.sffVersion!=='2.1')return{enabled:false,reason:'Quick Write currently preserves existing SFF 2.1 archives. Use Advanced for an explicitly reviewed format conversion.'};
  if(writerMode==='ikemaker'){
    const certificate=require('./sff_bundled_certification').resolveBundledSffCertification('sff-v2.1','ikemaker-builtin-sff-v21-png8-prerelease');
    if(!certificate.available)return{enabled:false,reason:certificate.reason};
    const inspect=require('./sff_quick_native_write').inspectQuickNativeAvailability;
    return{...inspect({draft:{target},capabilityRequest:certificate.capabilityRequest}),trueColor:inspect({draft:{target},build:{specification:{sprites:[{format:'png32',colorDepth:32}],palettes:[]}},capabilityRequest:certificate.capabilityRequest}).enabled,partialAlpha:true,label:certificate.label};
  }
  if(target.duplicateSpriteIds?.length)return{enabled:false,reason:'SprMake2 cannot preserve repeated sprite identities. Choose IKEMaker; existing sprites will not be renumbered.'};
  return{enabled:true,reason:'',trueColor:false,partialAlpha:false,label:writerMode==='both'?'Both validate the same request; verified SprMake2 bytes update this SFF.':'SprMake2 validates a private candidate before updating this SFF.'};
}
module.exports={quickWriteAvailability};
