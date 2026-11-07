'use strict';

// Terminal notices are not review decisions. Flush only after releasing the
// workflow owner: VS Code notification promises can wait indefinitely.
function createStageNotices(displays={}) {
  const pending=[];
  return {
    info(message) { pending.push(['info',message]); },
    error(message) { pending.push(['error',message]); },
    flush() {
      for (const [kind,message] of pending.splice(0)) {
        Promise.resolve().then(()=>displays[kind]?.(message)).catch(()=>{});
      }
    }
  };
}
module.exports={createStageNotices};
