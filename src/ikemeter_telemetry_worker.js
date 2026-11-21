'use strict';

const { parentPort, workerData } = require('node:worker_threads');
const { openClip } = require('./ikemeter_telemetry_model');
const { createHistory } = require('./ikemeter_telemetry');

async function run() {
  const receipt = await openClip(workerData.filename);
  const history = createHistory(receipt, workerData.name);
  parentPort.postMessage({ type: 'ready', model: history.snapshot() });
  parentPort.on('message', ({ id, type, value }) => {
    try {
      parentPort.postMessage({ id, result: history.request(type, value) });
    } catch {
      parentPort.postMessage({ id, error: 'The telemetry history request failed.' });
    }
  });
}

run().catch(error => {
  parentPort.postMessage({ type: 'error', error: error.message });
  parentPort.close();
});

