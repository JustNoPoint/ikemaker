'use strict';
async function publishStageToolbarActivation(owner,env){
 const panel=owner.panel,filename=owner.filename,generation=owner.generation,toolbar=env.toolbar||require('./viewer_toolbar');
 const current=()=>!owner.disposed&&!owner.unavailable&&owner.panel===panel&&panel.active===true&&owner.filename===filename&&owner.generation===generation&&env.currentOwner()===owner;
 try{if(!current())return false;env.claim();const ready={type:'viewerToolbarReady',surface:'stage'};await toolbar.handleCommand(ready,filename,panel);if(!current())return false;await toolbar.handle(ready,panel,{isCurrent:current});return current();}catch{return false;}
}
module.exports={publishStageToolbarActivation};
