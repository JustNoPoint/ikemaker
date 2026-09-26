'use strict';
function client(){
 const fileKey=value=>String(value||'').replace(/\\/g,'/').toLowerCase();
 globalThis.ikemenNavigationSelection=()=>({sourceHash:model.sourceHash,extraFiles:(model.paletteCandidates||[]).map(item=>item.filename),file:model.preview?.motif?.motifFile||undefined,tab,page,inventoryTab,zoom,showCellNames,showCellNumbers,lines:[...selectedLines],search:$('search').value});
 globalThis.ikemenCanRestoreNavigation=ref=>!!ref&&ref.sourceHash===model.sourceHash&&Array.isArray(ref.extraFiles)&&ref.extraFiles.length===(model.paletteCandidates||[]).length&&ref.extraFiles.every((file,index)=>fileKey(file)===fileKey(model.paletteCandidates[index].filename))&&fileKey(ref.file)===fileKey(model.preview?.motif?.motifFile)&&['roster','options','player','other'].includes(ref.tab)&&['characters','orders','stages','excluded','palettes'].includes(ref.inventoryTab)&&Number.isInteger(ref.page)&&ref.page>=0&&Number.isFinite(ref.zoom)&&ref.zoom>=.25&&ref.zoom<=4&&typeof ref.search==='string'&&typeof ref.showCellNames==='boolean'&&typeof ref.showCellNumbers==='boolean'&&Array.isArray(ref.lines)&&ref.lines.every(line=>Number.isInteger(line)&&workingLines.includes(line));
 globalThis.ikemenRestoreNavigation=ref=>{
  if(!globalThis.ikemenCanRestoreNavigation(ref))throw Error('The saved roster selection or motif no longer matches this source.');
  tab=ref.tab;page=ref.page;inventoryTab=ref.inventoryTab;zoom=ref.zoom;showCellNames=ref.showCellNames;showCellNumbers=ref.showCellNumbers;selectedLines=new Set(ref.lines);selectionAnchor=ref.lines[0]??null;faceCell=ref.lines.length?'line-'+ref.lines[0]:'';$('search').value=ref.search;
  saveState({tab,page,inventoryTab,zoom,showCellNames,showCellNumbers});render();
 };
}
module.exports={clientScript:()=>`(${client.toString()})();`};
