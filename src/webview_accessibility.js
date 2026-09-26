'use strict';
function client(){
 for(const bar of document.querySelectorAll('.tabs')){
  const buttons=[...bar.querySelectorAll('button')];if(buttons.length<2)continue;
  bar.setAttribute('role','tablist');if(!bar.hasAttribute('aria-label'))bar.setAttribute('aria-label','Workspace sections');
  const visible=()=>buttons.filter(button=>!button.hidden&&!button.disabled&&(typeof getComputedStyle!=='function'||getComputedStyle(button).display!=='none'));
  function update(){const available=visible(),selected=available.find(button=>button.classList.contains('active'))||available[0];for(const [index,button]of buttons.entries()){button.setAttribute('role','tab');button.setAttribute('aria-selected',String(button===selected));button.tabIndex=button===selected?0:-1;if(!button.id)button.id='ikemen-tab-'+[...document.querySelectorAll('.tabs')].indexOf(bar)+'-'+index;const target=document.getElementById(button.dataset.tab||button.dataset.view||'')||document.getElementById('content');if(target){button.setAttribute('aria-controls',target.id);target.setAttribute('role','tabpanel');if(button===selected)target.setAttribute('aria-labelledby',button.id);}}}
  bar.addEventListener('keydown',event=>{const current=event.target;if(!buttons.includes(current)||event.altKey||event.ctrlKey||event.metaKey)return;const available=visible(),index=available.indexOf(current);let next;if(['ArrowRight','ArrowDown'].includes(event.key))next=available[(index+1)%available.length];else if(['ArrowLeft','ArrowUp'].includes(event.key))next=available[(index+available.length-1)%available.length];else if(event.key==='Home')next=available[0];else if(event.key==='End')next=available.at(-1);if(next){event.preventDefault();next.click();update();next.focus();}});
  bar.addEventListener('click',()=>queueMicrotask(update));
  if(typeof MutationObserver==='function')new MutationObserver(update).observe(bar,{subtree:true,attributes:true,attributeFilter:['class','hidden','disabled']});
  update();
 }
}
module.exports={clientScript:()=>`(${client.toString()})();`};
