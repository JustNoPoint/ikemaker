'use strict';
function referenceFor(node) {
  return node ? {blockKind:node.kind,title:node.title,signature:node.signature||'',excerpt:node.sourceExcerpt||''} : undefined;
}
function findBlock(nodes, reference) {
  if(!reference||typeof reference.blockKind!=='string'||typeof reference.title!=='string')return null;
  const matches=nodes.filter(node=>node.kind===reference.blockKind&&node.title===reference.title&&(node.signature||'')===reference.signature&&(node.sourceExcerpt||'')===reference.excerpt);
  return matches.length===1?matches[0]:null;
}
function clientScript() {
  return `const historyReferenceFor=${referenceFor.toString()},historyFindBlock=${findBlock.toString()};
  globalThis.ikemenNavigationSelection=()=>historyReferenceFor(selected);
  globalThis.ikemenCanRestoreNavigation=ref=>!!historyFindBlock(all(),ref);
  globalThis.ikemenRestoreNavigation=ref=>{
    const node=historyFindBlock(all(),ref);if(!node)throw new Error('Block changed or became ambiguous');
    $('search').value='';$('filter').value='all';
    const expand=parent=>{if((parent.children||[]).some(child=>child===node||expand(child))){collapsed.delete(idFor(parent));return true;}return false;};
    expand(model);select(node,false);
  };`;
}
module.exports={referenceFor,findBlock,clientScript};
