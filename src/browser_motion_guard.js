'use strict';
// Kept self-contained so generated webview clients run the same tested guard.
function createBrowserMotionGuard(scope, onChange) {
  const doc=scope.document, media=scope.matchMedia?.('(prefers-reduced-motion: reduce)');
  let disposed=false;
  const allowed=()=>!disposed&&!media?.matches&&doc?.hidden!==true;
  const changed=()=>onChange?.(allowed());
  if(media?.addEventListener)media.addEventListener('change',changed);else media?.addListener?.(changed);
  doc?.addEventListener?.('visibilitychange',changed);
  const dispose=()=>{if(disposed)return;disposed=true;if(media?.removeEventListener)media.removeEventListener('change',changed);else media?.removeListener?.(changed);doc?.removeEventListener?.('visibilitychange',changed);scope.removeEventListener?.('beforeunload',dispose);onChange?.(false);};
  scope.addEventListener?.('beforeunload',dispose);
  return {allowed,reduced:()=>media?.matches===true,dispose};
}
module.exports={createBrowserMotionGuard,clientSource:()=>createBrowserMotionGuard.toString()};
