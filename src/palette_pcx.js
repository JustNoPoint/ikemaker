'use strict';
const {encodePcx}=require('./sff_v1_pcx8_writer');
const {decodeImage,LIMITS}=require('./palette_from_images');
const {sourceColors}=require('./palette_standalone_export');

function readPalette(bytes) {
    if(!Buffer.isBuffer(bytes)||bytes.length>LIMITS.bytes)throw Error('Palette PCX exceeds 32 MB or is not a byte buffer.');
    if(bytes.length<128||bytes[0]!==10||bytes[3]!==8||bytes[65]!==1) {
        throw Error('Import an 8-bit, single-plane indexed PCX palette. RGB PCX has no indexed color table; use Create From Images instead.');
    }
    // Reuse the bounded image decoder to refuse malformed/truncated pixels before admitting its table.
    decodeImage(bytes,'palette.pcx',{pcxTransparentZero:true});
    const stride=bytes.readUInt16LE(66);
    const height=bytes.readUInt16LE(10)-bytes.readUInt16LE(6)+1;
    const end=bytes.length-769;
    if(bytes[2]===1)require('./sff_v1_pcx8_strict_validator').decodePcxRleRows(bytes,128,end,stride,height,'Indexed PCX');
    else if(end-128!==stride*height)throw Error('Indexed PCX raw scanline length is inconsistent.');
    const rgb=bytes.subarray(bytes.length-768);
    return Array.from({length:256},(_,i)=>[rgb[i*3],rgb[i*3+1],rgb[i*3+2],i===0?0:255]);
}
function prepareExport(document) {
    const {colors,count}=sourceColors(document);
    const alphaLoss=colors.slice(0,count).map((color,index)=>color[3] === (index===0?0:255)?-1:index).filter(index=>index>=0);
    const rgb=Buffer.alloc(768);
    for(let i=0;i<256;i++)for(let c=0;c<3;c++)rgb[i*3+c]=i<count?colors[i][c]:0;
    const indices=Buffer.from(Array.from({length:256},(_,i)=>i));
    const bytes=encodePcx(16,16,indices,rgb,false).physical;
    return {bytes,count,padded:256-count,alphaLoss};
}
module.exports={readPalette,prepareExport};
