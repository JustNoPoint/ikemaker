'use strict';
function runtime(){
 let busy=false;
 function invoke(selection){if(busy)return;busy=true;vscode.postMessage({type:'createMoveVariant',...selection});sync();}
 const rich=document.createElement('button');rich.id='createMoveVariant';rich.textContent='Create move variant…';rich.title='Review a new StateDef, shared/copied AIR and exact Helper starting-state copies';document.getElementById('moveOverview')?.after(rich);rich.onclick=()=>{if(move)invoke({sourceId:move.id,sourceHash:model.timingSources?.constants||''})};
 function sync(){rich.hidden=!move;rich.disabled=busy||!move;document.querySelectorAll('[data-create-move-variant]').forEach(button=>button.disabled=busy);}
 function mount(root,item){sync();if(item.kind!=='state')return;const actions=root.querySelector('.direct-actions');if(!actions)return;const button=document.createElement('button');button.dataset.createMoveVariant='true';button.textContent='Create move variant…';button.disabled=busy;button.onclick=()=>invoke({reference:item.reference});actions.append(button);}
 window.addEventListener('message',event=>{if(event.data?.type==='moveVariantReady'){busy=false;sync();return;}if(event.data?.type!=='moveVariantResult')return;busy=false;const status=document.getElementById('status');if(status)status.textContent=event.data.reason||'';sync()});
 const previous=render;render=function(...args){const result=previous(...args);sync();return result;};sync();return{mount,sync};
}
module.exports={clientScript:()=>`const moveVariantUi=(${runtime.toString()})();`};
