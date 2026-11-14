'use strict';
const { parentPort, workerData } = require('worker_threads');
const { stagePayload } = require('./shader_workshop_files');

try {
  parentPort.postMessage({payload:stagePayload(workerData,true)});
} catch (error) {
  parentPort.postMessage({error:String(error.message || error)});
}
