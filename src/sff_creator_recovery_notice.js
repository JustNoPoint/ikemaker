'use strict';
function recoveryNotice(recovery) {
  if(!recovery)return'';
  if(recovery.status==='cleaned'&&recovery.rollbackAvailable===false)return'Temporary recovery removed; no rollback copy retained.';
  if(recovery.cleanupRequired===true)return`Temporary recovery retained${recovery.backupPath?` at ${recovery.backupPath}`:''}; cleanup remains required${recovery.error?`: ${recovery.error}`:'.'}`;
  if(recovery.rollbackAvailable===true)return`Recovery remains retained${recovery.backupPath?` at ${recovery.backupPath}`:''}.`;
  return'';
}
function blockedLifecycleNotice(startup) {
  const status = startup?.status || '';
  if (status === 'restart-recovery-review-required') return 'Review the proposed recovery cleanup before continuing.';
  if (!/manual|uncertain|restart-recovery-required/.test(status)) return '';
  const reasons = startup.restartRecoveryPlan?.blockers || [];
  const observation = startup.stableObservationError?.message;
  const guidance = reasons.length || observation
    ? 'Keep the recovery records and review the reported issue before continuing.'
    : 'Keep the recovery records for inspection before starting another save.';
  return [`Operation paused: ${status}.`, ...reasons, observation, guidance]
    .filter(Boolean).join(' ');
}
module.exports={recoveryNotice,blockedLifecycleNotice};
