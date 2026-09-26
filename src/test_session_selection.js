'use strict';
function client(){
 globalThis.ikemenNavigationSelection=()=>({tab:document.querySelector('.tab.active')?.dataset.tab,suiteIds:[...document.querySelectorAll('[data-suite]:checked')].map(node=>node.dataset.suite)});
 globalThis.ikemenCanRestoreNavigation=reference=>{
  const tabs=[...document.querySelectorAll('.tab')],suites=[...document.querySelectorAll('[data-suite]')];
  return !!reference&&tabs.some(tab=>tab.dataset.tab===reference.tab)&&Array.isArray(reference.suiteIds)&&reference.suiteIds.every(id=>suites.some(suite=>suite.dataset.suite===id&&!suite.disabled));
 };
 globalThis.ikemenRestoreNavigation=reference=>{
  if(!globalThis.ikemenCanRestoreNavigation(reference))throw Error('Saved test selection is no longer available for this game/profile.');
  for(const suite of document.querySelectorAll('[data-suite]'))suite.checked=reference.suiteIds.includes(suite.dataset.suite);
  [...document.querySelectorAll('.tab')].find(tab=>tab.dataset.tab===reference.tab).click();
 };
}
module.exports={clientScript:()=>`(${client.toString()})();`};
