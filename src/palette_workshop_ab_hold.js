'use strict';
function runtime(){
  const activation=event=>event?.key===' '||event?.key==='Enter';
  function bind(control,showOriginal,restoreDraft){
    if(!control||typeof showOriginal!=='function'||typeof restoreDraft!=='function')throw new Error('A/B hold control requires one control and two view callbacks.');
    control.onpointerdown=event=>{event?.preventDefault?.();control.setPointerCapture?.(event.pointerId);showOriginal()};
    control.onpointerup=control.onpointercancel=control.onpointerleave=control.onlostpointercapture=restoreDraft;
    control.onkeydown=event=>{if(activation(event)){event.preventDefault?.();showOriginal()}};
    control.onkeyup=event=>{if(activation(event)){event.preventDefault?.();restoreDraft()}};
    control.onblur=restoreDraft;
    return restoreDraft;
  }
  return{bind};
}
module.exports={runtime};
