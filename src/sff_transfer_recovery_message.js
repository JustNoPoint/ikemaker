'use strict';
function transferRecoveryMessage(result){
  const cleanup=result?.recoveryCleanup;
  if(cleanup?.verified===true&&cleanup.removed===true&&cleanup.retained===false)return 'Temporary recovery removed after verified completion; no rollback copy retained.';
  if(cleanup?.retained===true){const location=cleanup.backupPath||cleanup.recoveryPath||result?.durableBackup?.filename||result?.durableBackup?.path;return `Temporary recovery retained${location?` at ${location}`:''}. Inspect the execution receipt before recovery or cleanup.`;}
  return 'Recovery cleanup is unconfirmed. Inspect the execution receipt before assuming a rollback copy is available.';
}
module.exports={transferRecoveryMessage};
