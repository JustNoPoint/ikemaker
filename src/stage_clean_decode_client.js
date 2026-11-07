'use strict';
function applyStageCleanDecodeBaseline(data,message,saveView){
 if(!message||Object.keys(message).sort().join('|')!=='generation|previousSourceHash|sourceHash|type'||message.type!=='stageCleanDecodeBaseline'||message.generation!==data.generation||message.previousSourceHash!==data.sourceHash||![message.previousSourceHash,message.sourceHash].every(value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)))return false;
 data.sourceHash=message.sourceHash;saveView();return true;
}
module.exports={applyStageCleanDecodeBaseline};
