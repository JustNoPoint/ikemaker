'use strict';
const fs=require('fs');
const {hash}=require('./mutation_safety');
const {planStorage}=require('./sff_archive_storage');

async function run(vscode,filename,archive,message,hooks) {
  const current=()=>hooks.isCurrent()&&hash(fs.readFileSync(filename))===hash(archive.buffer);
  if(!current())throw new Error('The archive changed. Refresh before reviewing storage/order.');
  const pick=await vscode.window.showQuickPick([
    {label:'Sort physical sprites by group, index',description:'Entire archive; stable ascending order; authored IDs stay unchanged',operation:'sort-id'},
    {label:'Sort physical sprites by group, index — portraits first',description:'Entire archive; group 9000 first, then stable numeric group/index order',operation:'sort-id',options:{portraitsFirst:true}},
    {label:'Sort selected sprites within their physical slots',description:'Marked sprites only; stable ascending group/index; other slots stay in place',operation:'sort-selected-id'},
    {label:'Sort physical sprites by image area',description:'Entire archive; smallest first, then group/index; authored IDs stay unchanged',operation:'sort-size'},
    {label:'Choose a specific image-link source',description:'Replace the current sprite artwork with a chosen sprite; review images and linked users',operation:'manual-link'},
    {label:'Link exact images in selected sprites',description:'Only exact index/RGBA planes; independent assigned palettes retained',operation:'link'},
    {label:'Unlink selected sprite images',description:'Give each selected sprite independent image data',operation:'unlink'},
    {label:'Unlink all sprite images',description:'Entire archive; give every linked sprite its own exact image data',operation:'unlink-all'}
  ],{title:'SFF archive order and image storage',placeHolder:'Review every physical-row change before saving. SFF v2 only.'});
  if(!pick)return;
  if(pick.operation==='manual-link')return require('./sff_manual_image_link_ui').run(vscode,filename,archive,message,hooks);
  const indices=Array.isArray(message.selectedIndices)&&message.selectedIndices.length?message.selectedIndices:[message.selectedIndex];
  const plan=planStorage(archive,pick.operation,indices,pick.options||{});
  if(!plan.changes.length){vscode.window.showInformationMessage('No physical order or image link changes are needed.');return;}
  const detail=[`Archive: ${filename}`,pick.label,...plan.lookupChanges.map(change=>`Duplicate sprite ${change.identity}: first match changes from original row ${change.prior+1} to original row ${change.next+1}. References to this ID may display different artwork.`),`${plan.changes.length} reviewed physical-row changes.`,
    'Group/index IDs, axes, exact decoded pixels and assigned palettes are preserved. Sorting changes physical archive order and retargets shared-image links. Selected-only sorting reorders marked sprites within their original slots. Portrait-first sorting moves group 9000 before other numeric groups. Linking shares only exact index/RGBA planes among selected sprites; palette tables remain independent. Unlinking materializes the existing resolved image. Limits: 4096 rows, one million pixels per image, 16 million total; selected sort/link/unlink scope at most 256. Unlink All covers every linked sprite within the archive limits.',
    ...plan.changes.map(change=>`${change.group},${change.number} [physical ${change.index}]: ${change.action}`)].join('\n');
  const answer=await require('./sff_readonly_review').review(vscode,{
    title:'SFF Archive Order and Storage Review',content:detail,
    confirm:()=>vscode.window.showWarningMessage('Save these reviewed archive order/storage changes?',{modal:true,detail},'Apply Reviewed Changes')
  });
  if(answer!=='Apply Reviewed Changes')return;
  if(!current())throw new Error('The archive changed or the originating viewer closed during review. Nothing was written.');
  await hooks.apply(plan);
  vscode.window.showInformationMessage(`Saved ${plan.changes.length} reviewed physical order/image storage changes.`);
  return plan;
}

module.exports={run};
