'use strict';
// Serialized into both viewer webviews.
function sharedLayerClient(initial,getState,pose,post,refresh,saveLocal){
  let layout=initial,previous=new Map(),listOrder='';
  const signature=l=>JSON.stringify([l.source.kind,l.source.bank,l.enabled,l.visible,l.followBasePalette,l.displayName]);
  function remember(){previous=new Map(getState().layers.map(l=>[l.id,signature(l)]));}
  function receive(next){
    layout=next;
    for(const l of getState().layers){
      const slot=layout?.slots[l.id];if(!slot)continue;
      if(!slot.enabled&&l.source.kind!=='bank')continue;
      Object.assign(l,{enabled:slot.enabled,visible:slot.visible,followBasePalette:slot.followBasePalette!==false,displayName:slot.name||l.displayName,source:{...l.source,kind:'bank',bank:slot.bank}});
      if(slot.name)l.label=slot.name;
    }
    if(layout?.order)for(const l of getState().layers)l.order=layout.order.indexOf(l.id);
    remember();listOrder='';
  }
  receive(initial);
  function currentOrder(){
    const s=getState(),f=pose();
    return layout?.frames[f]||layout?.order||s.layers.slice().sort((a,b)=>a.order-b.order).map(l=>l.id);
  }
  function move(id,before){
    const order=currentOrder().filter(s=>s!==id);
    if(id===before)return;
    order.splice(before===null?order.length:order.indexOf(before),0,id);
    if(!layout){for(const l of getState().layers)l.order=order.indexOf(l.id);saveLocal();refresh();return;}
    post({type:'orderCharacterLayers',order,frame:pose()});
  }
  return {
    changed(){const ids=getState().layers.filter(l=>l.id!=='base'&&signature(l)!==previous.get(l.id)).map(l=>l.id);remember();return ids;},
    move,rank(id,n){move(id,currentOrder().filter(s=>s!==id)[n]||null);},
    state(){const order=currentOrder();listOrder=order.join();return {...getState(),layers:getState().layers.map(l=>({...l,order:order.indexOf(l.id)}))};},
    order:currentOrder,needsList(){return listOrder!==currentOrder().join();},
    key(){return layout?.key;},reset(next){receive(next);},
    listen(){window.addEventListener('message',({data})=>{if(data.type==='sharedLayerLayout'&&layout?.key===data.layout?.key){receive(data.layout);if(data.focusSlot){getState().primary=data.focusSlot;getState().selected=[data.focusSlot];}refresh();}});}
  };
}
module.exports={sharedLayerClient};
