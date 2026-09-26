'use strict';
function client(){
 const fingerprint=item=>({file:item.file,line:item.line,code:item.code,title:item.title,message:item.message,fix:item.fix});
 const matches=(item,ref)=>item.file===ref.file&&item.line===ref.line&&item.code===ref.code&&item.title===ref.title&&item.message===ref.message&&JSON.stringify(item.fix)===JSON.stringify(ref.fix);
 function selectedItems(ref){return ref.findings.map(record=>model.findings.filter(item=>item.fix&&matches(item,record)));}
 globalThis.ikemenNavigationSelection=()=>({profile:model.profile,extraFiles:model.files.filter(file=>file.extra).map(file=>file.filename),file:fileFilter,search:search.value,level:level.value,findings:model.findings.filter(item=>selected.has(item.id)).map(fingerprint)});
 globalThis.ikemenCanRestoreNavigation=ref=>!!ref&&ref.profile===model.profile&&Array.isArray(ref.findings)&&Array.isArray(ref.extraFiles)&&ref.extraFiles.every(file=>model.files.some(item=>item.extra&&item.filename===file))&&(!ref.file||model.files.some(item=>item.filename===ref.file))&&[...level.options].some(option=>option.value===ref.level)&&selectedItems(ref).every(items=>items.length===1);
 globalThis.ikemenRestoreNavigation=ref=>{
  if(!globalThis.ikemenCanRestoreNavigation(ref))throw Error('Saved health findings or files changed. Refresh and select findings again.');
  selected=new Set(selectedItems(ref).map(items=>items[0].id));fileFilter=ref.file||'';search.value=String(ref.search||'');level.value=ref.level;
  for(const button of document.querySelectorAll('[data-file-filter]'))button.classList.toggle('active',button.dataset.fileFilter===fileFilter);
  render();
 };
}
module.exports={clientScript:()=>`(${client.toString()})();`};
