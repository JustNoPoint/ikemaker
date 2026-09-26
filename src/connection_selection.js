'use strict';
function client(){
 let selected;
 const nodes=()=>[...document.querySelectorAll('[data-file]')];
 const branches=()=>[...document.querySelectorAll('[data-branch]')];
 function mark(node){selected=node?{file:node.dataset.file,line:Number(node.dataset.line||0)}:undefined;for(const item of nodes())item.setAttribute('aria-current',String(item===node));}
 globalThis.ikemenNavigationSelection=()=>({...selected,closedBranches:branches().filter(branch=>!branch.open).map(branch=>branch.dataset.branch),scrollTop:document.scrollingElement?.scrollTop||0});
 globalThis.ikemenCanRestoreNavigation=ref=>!!ref&&Array.isArray(ref.closedBranches)&&ref.closedBranches.every(id=>branches().some(branch=>branch.dataset.branch===id))&&(!ref.file||nodes().some(node=>node.dataset.file===ref.file&&Number(node.dataset.line||0)===ref.line));
 globalThis.ikemenRestoreNavigation=ref=>{
  if(!globalThis.ikemenCanRestoreNavigation(ref))throw Error('A saved connection or branch is no longer available.');
  for(const branch of branches())branch.open=!ref.closedBranches.includes(branch.dataset.branch);
  mark(ref.file?nodes().find(node=>node.dataset.file===ref.file&&Number(node.dataset.line||0)===ref.line):undefined);
  if(document.scrollingElement)document.scrollingElement.scrollTop=Math.max(0,Number(ref.scrollTop)||0);
 };
 document.addEventListener('click',event=>{const node=event.target?.closest?.('[data-file]');if(node)mark(node);});
}
module.exports={clientScript:()=>`(${client.toString()})();`};
