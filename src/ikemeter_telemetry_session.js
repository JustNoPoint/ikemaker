'use strict';

const path = require('node:path');
const { Worker } = require('node:worker_threads');

function startHistory(filename, name, options = {}) {
  const createWorker = options.createWorker || ((entry, configuration) => new Worker(entry, configuration));
  const worker = createWorker(path.join(__dirname, 'ikemeter_telemetry_worker.js'), {
    workerData: { filename, name },
    resourceLimits: { maxOldGenerationSizeMb: 512, maxYoungGenerationSizeMb: 32 }
  });
  let ready, rejectReady, sequence = 0, closed = false, termination;
  const pending = new Map();
  const initial = new Promise((resolve, reject) => { ready = resolve; rejectReady = reject; });
  const startup = setTimeout(() => close(new Error('Telemetry parsing exceeded its time limit. Export a smaller clip and try again.')), options.startTimeoutMs ?? 30000);
  function close(error = new Error('Telemetry history closed.')) {
    if (closed) return termination;
    closed = true;
    clearTimeout(startup);
    rejectReady(error);
    for (const { reject, timer } of pending.values()) {
      clearTimeout(timer);
      reject(error);
    }
    pending.clear();
    try {
      termination = Promise.resolve(worker.terminate()).then(() => true, () => false);
    } catch {
      termination = Promise.resolve(false);
    }
    return termination;
  }

  worker.on('message', message => {
    if (closed) return;
    if (message.type === 'ready') {
      clearTimeout(startup);
      ready(message.model);
      return;
    }
    if (message.type === 'error') {
      close(new Error(message.error));
      return;
    }
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(new Error(message.error));
    else request.resolve(message.result);
  });
  worker.once('error', error => close(error.code === 'ERR_WORKER_OUT_OF_MEMORY'
    ? new Error('Telemetry parsing exceeded its memory limit. Export a smaller clip and try again.') : error));
  worker.once('exit', () => close(new Error('Telemetry history stopped. Try a smaller export.')));

  function request(type, value) {
    if (closed || pending.size >= 8) return Promise.resolve(null);
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => {
        close(new Error('Telemetry history did not respond.'));
      }, options.requestTimeoutMs ?? 5000);
      pending.set(id, { resolve, reject, timer });
      try { worker.postMessage({ id, type, value }); }
      catch { close(new Error('Telemetry history send failed.')); }
    });
  }

  return { ready: initial, request, close };
}

module.exports = { startHistory };

