'use strict';
const {cropIndexedPng8}=require('./sff_crop_source');
function sealAutocropSource(buffer,axisX,axisY){
 for(const [name,value]of [['X',axisX],['Y',axisY]])if(!Number.isSafeInteger(value)||value< -32768||value>32767)throw Error(`Crop ${name} axis must be a signed16-bit integer.`);
 let cropped;try{cropped=cropIndexedPng8(buffer);}catch(error){throw Error(`Cannot seal archive crop: ${error.message} Use an explicitly prepared indexed PNG8 source.`);}
 const finalX=axisX-cropped.bounds.x,finalY=axisY-cropped.bounds.y;if(finalX< -32768||finalX>32767||finalY< -32768||finalY>32767)throw Error('Cropping would move the stored axis outside the signed16-bit SFF range.');
 return{buffer:cropped.buffer,axisX:finalX,axisY:finalY,preparation:{kind:'sealed-autocrop-source',sourceByteHash:cropped.sourceByteHash.toLowerCase(),outputByteHash:cropped.outputByteHash.toLowerCase(),bounds:{...cropped.bounds},originalAxis:{x:axisX,y:axisY},finalAxis:{x:finalX,y:finalY},trimOffset:{x:cropped.bounds.x,y:cropped.bounds.y},geometryApplied:true}};
}
module.exports={sealAutocropSource};
