'use strict';

// Keep this factory self-contained: the same timing rules run in both webviews.
function runtime() {
  function duration(frame, index, count) {
    const value = Number(frame.rawTime ?? frame.time);
    if (value === -1 && index === count - 1) return Infinity;
    return Number.isFinite(value) ? Math.max(0, value) : 0;
  }
  function loopStart(action) {
    return Math.max(0, Math.min(action.frames.length - 1, Math.floor(Number(action.loopStart) || 0)));
  }
  function step(action, index) {
    const count = action.frames.length;
    if (!count) return { index: -1, duration: Infinity, nextIndex: -1 };
    let current = Math.max(0, Math.min(count - 1, Math.floor(Number(index) || 0)));
    const visited = new Set();
    while (!visited.has(current)) {
      visited.add(current);
      const ticks = duration(action.frames[current], current, count);
      const nextIndex = current + 1 < count ? current + 1 : loopStart(action);
      if (ticks > 0) return { index: current, duration: ticks, nextIndex };
      current = nextIndex;
    }
    // An action/loop with no displayed duration must not create a timer spin.
    return { index: count - 1, duration: Infinity, nextIndex: count - 1 };
  }
  function locate(action, tick) {
    const count = action.frames.length;
    if (!count) return { index: -1, elapsed: 0 };
    const value = Number(tick);
    let remaining = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
    const durations = action.frames.map((frame, index) => duration(frame, index, count));
    for (let index = 0; index < count; index++) {
      if (remaining < durations[index]) return { index, elapsed: remaining };
      remaining -= durations[index];
    }
    const start = loopStart(action), total = durations.slice(start).reduce((sum, ticks) => sum + ticks, 0);
    if (!total) return { index: count - 1, elapsed: 0 };
    remaining %= total;
    for (let index = start; index < count; index++) {
      if (remaining < durations[index]) return { index, elapsed: remaining };
      remaining -= durations[index];
    }
    return { index: count - 1, elapsed: 0 };
  }
  // Relative comparisons follow the playback traversal; a pin always counts
  // from the first displayed tick of the action (tick 1 in the UI).
  function onionTick(action, index, elapsed, mode, pinnedTick, wrapped = false) {
    const frames = action?.frames;
    if (!frames?.length || !Number.isInteger(index) || !frames[index]) return null;
    if (mode === 'pinned') {
      if (!Number.isSafeInteger(pinnedTick) || pinnedTick < 1) return null;
      const pose = locate(action, pinnedTick - 1);
      return duration(frames[pose.index], pose.index, frames.length) > 0 ? pose : null;
    }
    if (mode !== 'next' && mode !== 'previous') return null;
    const count = frames.length;
    const ticks = duration(frames[index], index, count);
    const current = Math.min(Math.max(0, ticks - 1), Math.max(0, Math.floor(elapsed) || 0));
    if (mode === 'next') {
      if (current + 1 < ticks) return { index, elapsed: current + 1 };
      const next = step(action, index + 1 < count ? index + 1 : loopStart(action));
      return duration(frames[next.index], next.index, count) > 0 ? { index: next.index, elapsed: 0 } : null;
    }
    if (current > 0) return { index, elapsed: current - 1 };
    const start = wrapped ? loopStart(action) : 0;
    let cursor = index;
    for (let visited = 0; visited < count; visited++) {
      if (cursor <= start && !wrapped) return null;
      cursor = cursor <= start ? count - 1 : cursor - 1;
      const length = duration(frames[cursor], cursor, count);
      if (length > 0) return { index: cursor, elapsed: Number.isFinite(length) ? length - 1 : 0 };
    }
    return null;
  }
  function frameAt(action, tick) { return locate(action, tick).index; }
  function createClock(now = () => performance.now()) {
    let action, index = -1, ticks = 0, running = false, started = now();
    return {
      sync(nextAction, nextIndex, nextRunning, reset = false) {
        const time = now();
        if (reset || action !== nextAction || index !== nextIndex) ticks = 0;
        else if (running) ticks += Math.max(0, time - started) * 60 / 1000;
        action = nextAction; index = nextIndex; running = nextRunning; started = time;
      },
      elapsed() { return ticks + (running ? Math.max(0, now() - started) * 60 / 1000 : 0); }
    };
  }
  return { duration, step, locate, onionTick, frameAt, createClock };
}

module.exports = { runtime, ...runtime() };
