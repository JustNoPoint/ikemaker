'use strict';
const {decodePng}=require('./palette_index_organizer_model'),{readIndexedPng,encodeIndexedPng}=require('./palette_indexed_png');
function exactImagePalette(bytes,{writerMode='ikemaker',materialize=true}={}){
  let width,height,indices,colors,converted=false;
  if(bytes[25]===3){const image=readIndexedPng(bytes);({width,height,indices,colors}=image);if(indices.includes(0)&&colors[0][3]>0)throw Error('Used image index 0 is opaque. Choose deliberate palette review or True Color; Quick Write reserves index 0 for transparency.');}
  else{
    const image=decodePng(bytes);({width,height}=image);indices=Buffer.alloc(width*height);colors=Array.from({length:256},()=>[0,0,0,0]);const identities=new Map();
    for(let at=0,pixel=0;at<image.rgba.length;at+=4,pixel++){
      const rgba=[...image.rgba.subarray(at,at+4)];if(!rgba[3]){indices[pixel]=0;continue;}
      const key=rgba.join(',');let index=identities.get(key);
      if(index===undefined){index=identities.size+1;if(index>255)throw Error('Exact image indexing needs at most 255 visible RGBA colors plus reserved transparent index 0. Choose Needs Palette or True Color; no reduction was performed.');identities.set(key,index);colors[index]=rgba;}
      indices[pixel]=index;
    }
    converted=true;
  }
  const used=new Set(indices),partialAlpha=[...used].some(index=>colors[index][3]>0&&colors[index][3]<255);
  if(partialAlpha&&writerMode!=='ikemaker')throw Error('SprMake2 cannot preserve these partially transparent palette entries. Choose IKEMaker or review the palette explicitly; alpha was not discarded.');
  return{buffer:materialize?encodeIndexedPng({width,height},indices,colors):null,width,height,indices,colors,converted,partialAlpha};
}
function imagePaletteAvailability(bytes){try{const image=exactImagePalette(bytes,{materialize:false});return{available:true,partialAlpha:image.partialAlpha,converted:image.converted}}catch(error){return{available:false,reason:error.message}}}
function prepareImagePaletteAdmission(admission,writerMode){
  const fs=require('fs'),path=require('path'),os=require('os'),images=admission.admittedBuffers.map(buffer=>exactImagePalette(buffer,{writerMode})),directory=fs.mkdtempSync(path.join(os.tmpdir(),'ikemaker-exact-image-palette-'));
  try{const paths=images.map((image,index)=>{const filename=path.join(directory,`image_${index}.png`);fs.writeFileSync(filename,image.buffer,{flag:'wx'});return filename});return{...admission,paths,admittedBuffers:images.map(image=>image.buffer),sourceProvenance:admission.sourceProvenance.map((proof,index)=>({...proof,exactImagePalette:{converted:images[index].converted,reservedTransparentIndex:0,partialAlpha:images[index].partialAlpha}})),dispose(){fs.rmSync(directory,{recursive:true,force:true})}}}catch(error){fs.rmSync(directory,{recursive:true,force:true});throw error}
}
module.exports={exactImagePalette,imagePaletteAvailability,prepareImagePaletteAdmission};
