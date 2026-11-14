'use strict';
// Native PSD processes stay outside the extension host so the editor remains responsive.
process.once('message', job => {
  try {
    const result = require('./psd_costume_bank_model').extractSources(job.matches, job.directory, job.layerName, job.executable, (i, total, file) => process.send?.({
      progress: {
        i,
        total,
        file
      }
    }));
    process.send?.({
      result
    }, () => process.disconnect());
  } catch (error) {
    process.send?.({
      error: error.message
    }, () => process.disconnect());
  }
});
