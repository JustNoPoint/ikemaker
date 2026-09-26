'use strict';
function client(){
 const projects=()=>new Set(['all','unassigned',...[...data.ticketBoard.tickets,...data.ticketBoard.reports].filter(item=>item.workProjectId).map(item=>'id:'+item.workProjectId),...(data.assignedWorkProject?['id:'+data.assignedWorkProject.id]:[])]);
 globalThis.ikemenNavigationSelection=()=>({profileId:data.profile.id,view,projectFilter:issueProjectFilter,scrollTop:document.querySelector('main')?.scrollTop||0,issueFormOpen:!!$('issueForm')?.parentElement?.open});
 globalThis.ikemenCanRestoreNavigation=ref=>!!ref&&ref.profileId===data.profile.id&&['tickets','reports','inbox','members','next','phases','lessons','team'].includes(ref.view)&&projects().has(ref.projectFilter)&&Number.isFinite(ref.scrollTop)&&ref.scrollTop>=0&&typeof ref.issueFormOpen==='boolean';
 globalThis.ikemenRestoreNavigation=ref=>{
  if(!globalThis.ikemenCanRestoreNavigation(ref))throw Error('The saved workflow profile, tab or project filter is no longer available.');
  captureIssueDraft();view=ref.view;issueProjectFilter=ref.projectFilter;vscode.setState({...vscode.getState(),view,issueProjectFilter});render();
  if($('issueForm'))$('issueForm').parentElement.open=ref.issueFormOpen;
  const main=document.querySelector('main');if(main)main.scrollTop=ref.scrollTop;
 };
}
module.exports={clientScript:()=>`(${client.toString()})();`};
