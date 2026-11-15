'use strict';
const path = require('node:path');
function fileKey(filename, platform) {
  const resolved = path.resolve(filename);
  return platform === 'win32' ? resolved.toLowerCase() : resolved;
}
function broadcast({enabled,sourcePanel,sourceOwner,panels,ownerFor,selected,platform=process.platform}) {
  if (!enabled || !sourceOwner || sourceOwner.disposed || sourceOwner.unavailable ||
      sourceOwner.transferPinned || sourceOwner.retainedState?.dirty || !selected) return 0;
  let count = 0;
  for (const panel of panels) {
    const owner = ownerFor(panel);
    if (panel === sourcePanel || !owner || owner.disposed || owner.unavailable ||
        owner.transferPinned || owner.busy || owner.retainedState?.dirty ||
        fileKey(owner.filename,platform) !== fileKey(sourceOwner.filename,platform) ||
        owner.sourceFingerprint !== sourceOwner.sourceFingerprint) continue;
    panel.webview.postMessage({type:'sffSyncedSelection',selected,generation:owner.generation,sourceFingerprint:owner.sourceFingerprint});
    count++;
  }
  return count;
}
module.exports = {broadcast};
