'use strict';
function paletteDraftSaveAvailability(session={}){
 if(session.context?.kind!=='existing-sff'||!session.target?.filename)return{enabled:false,reason:'Choose an exact SFF target before saving embedded palette colors.'};
 if(session.candidate?.active)return{enabled:false,reason:'Finish or restore the reviewed candidate before saving an embedded palette draft.'};
 if(session.stale||session.preview?.stale||session.applyAllowed===false)return{enabled:false,reason:'Refresh the exact current palette before saving its draft.'};
 if(!session.selection?.palette||!session.preview?.dirty||!Array.isArray(session.preview.colors))return{enabled:false,reason:'There are no retained palette color changes to save.'};
 return{enabled:true,reason:'Save the retained color draft to the exact selected embedded palette.'};
}
module.exports={paletteDraftSaveAvailability};
