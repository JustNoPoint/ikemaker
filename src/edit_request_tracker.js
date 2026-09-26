'use strict';
function createTracker(){
 let sequence=0,pending;
 return{
  busy:()=>!!pending,
  begin(edit,payload){if(pending)return null;const id=++sequence;pending={id,edit,snapshot:JSON.stringify(payload)};return id;},
  finish(id,edit,payload){if(!pending||id!==pending.id)return null;const saved=pending;pending=undefined;return saved.edit===edit&&saved.snapshot===JSON.stringify(payload);},
  cancel(id){if(pending?.id===id){pending=undefined;return true;}return false;}
 };
}
module.exports={createTracker,clientScript:()=>`const editRequests=(${createTracker.toString()})();`};
