'use strict';
function markup() {
  return '<style>.stage-time-clock{display:inline-flex;align-items:center;flex-wrap:wrap;gap:5px;max-width:100%;font-size:12px}.stage-time-clock input{width:78px}.stage-time-clock output{white-space:nowrap}</style><span class="stage-time-clock" id="stageTimeClock"><label title="Local phase display and Stage Rig cycle; does not edit the Stage DEF">Cycle <input id="stageTimeCycle" type="number" min="1" max="2147483647" step="1" value="120" aria-label="Stage cycle length in ticks"></label><output id="stageOfflinePhase">Offline phase 0 / 120</output><output id="stageTimeLive" aria-live="off">Live StageTime —</output><output id="stageTimePhase">Live phase —</output></span>';
}
function createStageTimeClient(env) {
  const doc = env.document, root = doc.getElementById('stageTimeClock');
  const noOp = { offline() {}, live() {}, dispose() {} }; if (!root) return noOp;
  const cycle = doc.getElementById('stageTimeCycle'), live = doc.getElementById('stageTimeLive'), phase = doc.getElementById('stageTimePhase'), offline = doc.getElementById('stageOfflinePhase');
  const valid = env.isCycleLength, scope = env.scope || globalThis, setTimer = env.setTimeout || setTimeout, cancelTimer = env.clearTimeout || clearTimeout;
  const saved = env.getState?.()?.stageTimePreferences;
  cycle.value = saved?.filename === env.filename && valid(saved.cycleLength) ? saved.cycleLength : env.defaultCycle;
  let tick = null, session = null, sequence = 0, timer = null, reason = 'launch a validated Stage Live session', selection = env.selection?.(), disposed = false;
  const retired = new Set();
  const currentCycle = () => Number(cycle.value);
  function render() {
    const length = currentCycle(), ok = valid(length), scrub = Number(env.tick());
    cycle.setAttribute('aria-invalid', String(!ok)); cycle.title = ok ? 'Phase = tick modulo cycle length. Local view preference; no source change.' : 'Enter a whole cycle length from 1 to 2147483647.';
    offline.textContent = 'Offline phase ' + (ok && Number.isSafeInteger(scrub) && scrub >= 0 ? scrub % length + ' / ' + length : '—');
    live.textContent = tick === null ? 'Live StageTime —' : 'Live StageTime ' + tick;
    live.title = tick === null ? reason : 'Last authenticated engine stageTime() sample; never extrapolated. Offline scrub does not move this clock.';
    phase.textContent = 'Live phase ' + (tick !== null && ok ? tick % length + ' / ' + length : '—');
  }
  function clear(message, retire = false) {
    if (retire && session) { retired.add(session); if (retired.size > 16) retired.delete(retired.values().next().value); }
    if (timer !== null) cancelTimer(timer); timer = null; tick = null; reason = message; render();
  }
  function updateOffline() {
    const selected = env.selection?.(); if (selected !== selection) { selection = selected; clear('Stage selection changed; relaunch Live.', true); }
    render();
  }
  function receive(status) {
    if (disposed) return;
    if (status?.state !== 'ready') { clear(status?.reason || 'No current validated Live clock.', true); return; }
    const clock = status.clock;
    if (!clock || !/^[a-f0-9]{48}$/.test(clock.sessionId || '') || !Number.isSafeInteger(clock.sequence) || clock.sequence < 1 || !Number.isSafeInteger(clock.stageTime) || clock.stageTime < 0 || clock.stageTime > 2147483647) { clear('Live clock is unavailable or unverified.'); return; }
    if (retired.has(clock.sessionId) || clock.sessionId === session && clock.sequence <= sequence) return;
    if (doc.hidden) { clear('Editor is hidden; wait for a fresh Live sample.'); return; }
    session = clock.sessionId; sequence = clock.sequence; tick = clock.stageTime;
    if (timer !== null) cancelTimer(timer);
    timer = setTimer(() => clear('Live clock is stale; waiting for a fresh authenticated sample.'), 2500); render();
  }
  const onCycle = () => {
    const length = currentCycle(); if (valid(length)) env.setState?.({ ...env.getState?.(), stageTimePreferences: { filename: env.filename, cycleLength: length } });
    render(); scope.ikemenStageRigCycleChanged?.();
  };
  const onVisibility = () => { if (doc.hidden) clear('Editor is hidden; wait for a fresh Live sample.'); };
  cycle.addEventListener('input', onCycle); doc.addEventListener?.('visibilitychange', onVisibility);
  scope.ikemenStageCycleLength = currentCycle;
  function dispose() { if (disposed) return; disposed = true; if (timer !== null) cancelTimer(timer); cycle.removeEventListener?.('input', onCycle); doc.removeEventListener?.('visibilitychange', onVisibility); if (scope.ikemenStageCycleLength === currentCycle) delete scope.ikemenStageCycleLength; }
  env.window?.addEventListener('beforeunload', dispose); render();
  return { offline: updateOffline, live: receive, dispose };
}
module.exports = { markup, createStageTimeClient };
