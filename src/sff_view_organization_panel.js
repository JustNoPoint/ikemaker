'use strict';
function installSffViewOrganization(){
 const quick=document.getElementById('left1'),toolbar=document.getElementById('sffQuickIconBar'),legacy=document.getElementById('sffLegacyLeft1'),sprites=document.getElementById('left2');
 if(!quick||!toolbar||!legacy||!sprites||document.getElementById('sffViewOrganizationPanel'))return;
 const section=document.createElement('details'),summary=document.createElement('summary'),body=document.createElement('div'),button=document.createElement('button');
 section.id='sffViewOrganizationPanel';section.className='sff-view-organization-panel';summary.textContent='View organization';body.className='sff-view-organization-body';
 section.append(summary,body);for(const source of [legacy,sprites])while(source.firstChild)body.append(source.firstChild);
 body.addEventListener('click',event=>{
  if(event.target.closest?.('input,textarea,select,[contenteditable="true"]'))return;
  const path=event.composedPath(),list=document.getElementById('sprites');if(!path.includes(list))return;
  const prior=path.find(node=>node.classList?.contains('sprite')&&node.dataset?.rowId);if(!prior)return;
  // Selecting a sprite synchronously rebuilds the list and removes its button.
  // Restore only this click's exact row; respect any intentional focus elsewhere.
  const focused=document.activeElement;if(focused!==document.body&&focused!==prior&&focused?.isConnected)return;
  const current=[...list.querySelectorAll('.sprite[data-row-id]')].find(node=>node.dataset.rowId===prior.dataset.rowId);current?.focus({preventScroll:true});
 });
 button.id='sffViewOrganizationToggle';button.type='button';button.textContent='☷';button.title='View organization';button.setAttribute('aria-label','View organization');button.setAttribute('aria-controls',section.id);
 const saved=vscode.getState?.()||{};section.open=saved.sffViewOrganizationOpen===true;
 const synchronize=()=>{button.setAttribute('aria-expanded',String(section.open));vscode.setState({...vscode.getState(),sffViewOrganizationOpen:section.open});};
 section.addEventListener('toggle',synchronize);button.onclick=()=>{section.open=!section.open;synchronize();if(section.open){section.scrollIntoView({block:'nearest'});document.getElementById('organizeMode')?.focus();}};
 toolbar.append(button);quick.append(section);button.setAttribute('aria-expanded',String(section.open));
 const style=document.createElement('style');if(document.currentScript?.nonce)style.nonce=document.currentScript.nonce;
 style.textContent='.sff-view-organization-panel{margin-top:8px;border-top:1px solid var(--vscode-panel-border);padding-top:6px}.sff-view-organization-panel>summary{cursor:pointer;padding:5px 2px}.sff-view-organization-panel>summary:focus-visible,#sffViewOrganizationToggle:focus-visible{outline:2px solid var(--vscode-focusBorder);outline-offset:1px}.sff-view-organization-body{min-width:0}.sff-view-organization-body .size-tool{display:none}.sff-view-organization-body #sprites,.sff-view-organization-body #groups{max-height:300px;overflow:auto}.sff-view-organization-body .toolbar{flex-wrap:wrap}';document.head.append(style);
}
module.exports={installSffViewOrganization,clientScript:()=>`globalThis.ikemenInstallSffViewOrganization=${installSffViewOrganization.toString()};globalThis.ikemenInstallSffViewOrganization();`};
