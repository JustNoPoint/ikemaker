'use strict';
(function expose(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.IKeMeterLabels=api;
})(typeof globalThis==='object'?globalThis:this,()=>({
  lifetimeStatus(item){
    if(item.departed)return 'departed';
    if(item.closed&&item.identityAmbiguous)return 'last observed';
    if(item.closed)return 'capture ended · last observed';
    return '';
  },
}));
