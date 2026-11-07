'use strict';

const {analyzeExactMaster}=require('./sff_master_intake');
const {remapPngToPalette}=require('./sff_palette_remap');

// Reconstruction has no retained per-color index decisions. Equal visible
// colors therefore cannot authorize choosing the first color-separation index.
function remapReconstructionPage(buffer,colors,{paletteId='the indexing master',pageLabel='PSD page'}={}){
 const analysis=analyzeExactMaster([buffer],colors);
 if(analysis.ambiguities.length){
  const used=analysis.ambiguities.slice(0,4).map(row=>`${row.id} -> indexes ${row.candidates.join(', ')}`).join('; ');
  throw Error(`${pageLabel} has ${analysis.ambiguities.length} used color(s) with ambiguous master indexes: ${used}. Reconstruction did not choose an index. Use Add Sprites > Map exact source colors to master ${paletteId} to review the intended indexes, or select an unambiguous indexing master.`);
 }
 // Preserve the existing visible-loss diagnostics and active-body fallback for
 // unmatched colors. Deliberate nearest-remap workflows are unchanged.
 return remapPngToPalette(buffer,colors);
}

module.exports={remapReconstructionPage};
