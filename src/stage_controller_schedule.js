'use strict';

function controllerTime(raw, inheritedLoop) {
  const fields = String(raw ?? '').split(',');
  const start = parseInt(fields[0], 10) || 0;
  const time = [start, start, inheritedLoop];
  for (let i = 0; i < Math.min(fields.length, time.length); i++) {
    const field = fields[i].trimStart();
    if (field) time[i] = parseInt(field, 10) || 0;
    // The pinned engine's readI32ForStage stops at trailing whitespace before a comma.
    if (/\s/.test(field)) break;
  }
  return time;
}

// Kept self-contained for the Stage webview. Ticks count from zero and end is inclusive.
function scheduleAt(controllers, tick) {
  let previous = null, next = null;
  const active = [];
  function boundary(first, period) {
    const prior = period > 0 ? first + Math.floor((tick - 1 - first) / period) * period : first;
    const later = period > 0 ? first + Math.max(0, Math.ceil((tick + 1 - first) / period)) * period : first;
    if (prior >= first && prior < tick && (previous === null || prior > previous)) previous = prior;
    if (later > tick && later <= 2147483647 && (next === null || later < next)) next = later;
  }
  for (const [index, ctrl] of controllers.entries()) {
    const [start, end, loop] = ctrl.time;
    if (start < 0 || end < start || (loop >= 0 && start >= loop)) continue;
    const duration = (loop > 0 ? Math.min(end, loop) : end) - start;
    if (tick >= start && (loop > 0 ? (tick - start) % loop <= duration : tick <= end)) active.push(index);
    if (loop > 0 && duration >= loop - 1) boundary(start, 0);
    else {
      boundary(start, loop);
      boundary(start + duration + 1, loop);
    }
  }
  return {previous, next, active};
}

function controllerIds(raw) {
  const ids = [];
  for (const token of String(raw ?? '').split(',')) {
    const field = token.trimStart();
    if (field) ids.push(parseInt(field, 10) || 0);
    if (/\s/.test(field)) break;
  }
  return ids;
}

module.exports = {controllerTime, controllerIds, scheduleAt};
