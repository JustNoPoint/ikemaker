'use strict';

const DEFAULT_QUIET_MS = 300;
const DEFAULT_MINIMUM_WAIT_MS = 200;
const DEFAULT_MAXIMUM_WAIT_MS = 2500;

function waitForWorkbenchRestoreSettled(api, options = {}) {
  const quietMs = Math.max(50, Number(options.quietMs) || DEFAULT_QUIET_MS);
  const minimumWaitMs = Math.max(0, Number(options.minimumWaitMs) || DEFAULT_MINIMUM_WAIT_MS);
  const maximumWaitMs = Math.max(quietMs, Number(options.maximumWaitMs) || DEFAULT_MAXIMUM_WAIT_MS);
  const timers = options.timers || { setTimeout, clearTimeout };
  return new Promise(resolve => {
    const started = Date.now();
    let quietTimer = null, maximumTimer = null, finished = false;
    const subscriptions = [];
    const finish = reason => {
      if (finished) return;
      finished = true;
      if (quietTimer) timers.clearTimeout(quietTimer);
      if (maximumTimer) timers.clearTimeout(maximumTimer);
      for (const subscription of subscriptions) try { subscription?.dispose?.(); } catch (_) {}
      resolve(reason);
    };
    const schedule = () => {
      if (finished) return;
      if (quietTimer) timers.clearTimeout(quietTimer);
      const elapsed = Date.now() - started;
      quietTimer = timers.setTimeout(() => finish('quiet'), Math.max(quietMs, minimumWaitMs - elapsed));
    };
    const listen = source => { if (typeof source === 'function') try { subscriptions.push(source(schedule)); } catch (_) {} };
    listen(api?.window?.tabGroups?.onDidChangeTabs);
    listen(api?.window?.tabGroups?.onDidChangeTabGroups);
    listen(api?.window?.onDidChangeVisibleTextEditors);
    listen(api?.window?.onDidChangeActiveTextEditor);
    maximumTimer = timers.setTimeout(() => finish('deadline'), maximumWaitMs);
    schedule();
  });
}

function createBrowserReadinessController(options = {}) {
  const timeoutMs = Math.max(250, Number(options.timeoutMs) || 3000);
  let generation = 0, readyGeneration = -1, waiters = [];
  const arm = () => { generation += 1; return generation; };
  const signal = message => {
    if (message?.type !== 'companionBrowserReady') return false;
    readyGeneration = generation;
    const pending = waiters; waiters = [];
    for (const finish of pending) finish(true);
    return true;
  };
  const wait = () => {
    if (readyGeneration === generation) return Promise.resolve(true);
    return new Promise(resolve => {
      let settled = false;
      const timer = setTimeout(() => finish(false), timeoutMs);
      const finish = value => { if (settled) return; settled = true; clearTimeout(timer); waiters = waiters.filter(candidate => candidate !== finish); resolve(value); };
      waiters.push(finish);
    });
  };
  const dispose = () => { const pending = waiters; waiters = []; for (const finish of pending) finish(false); };
  return Object.freeze({ arm, signal, wait, dispose, generation: () => generation });
}

module.exports = { DEFAULT_QUIET_MS, DEFAULT_MINIMUM_WAIT_MS, DEFAULT_MAXIMUM_WAIT_MS, waitForWorkbenchRestoreSettled, createBrowserReadinessController };
