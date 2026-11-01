'use strict';

// Canvas wheel gestures are local: never turn a pinch into whole-webview zoom.
function mediaWheelFactor(event) {
  const delta = Number(event.deltaY);
  if (!Number.isFinite(delta) || delta === 0) return 1;
  if (event.ctrlKey) return Math.exp(-Math.max(-100, Math.min(100, delta)) * .01);
  return delta < 0 ? 1.2 : 1 / 1.2;
}

function mediaZoomKey(event) {
  if (event.ctrlKey || event.metaKey || event.altKey) return 0;
  if (event.code === 'NumpadAdd' || event.key === '+' || event.key === '=') return 1;
  if (event.code === 'NumpadSubtract' || event.key === '-') return -1;
  return 0;
}

function installMediaNumericWheel(document) {
  document.addEventListener('wheel', event => {
    const input = event.target;
    if (!event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || !event.deltaY ||
        input !== document.activeElement || input?.type !== 'number' || input.disabled || input.readOnly ||
        input.step === 'any' || input.value === '' || !Number.isFinite(input.valueAsNumber)) return;
    const before = input.value;
    try { if (event.deltaY < 0) input.stepUp(); else input.stepDown(); } catch (_) { return; }
    event.preventDefault();
    if (input.value !== before) {
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, { passive: false });
}

function clientScript() {
  return `${mediaWheelFactor.toString()}\n${mediaZoomKey.toString()}\n${installMediaNumericWheel.toString()}\ninstallMediaNumericWheel(document);`;
}

module.exports = { mediaWheelFactor, mediaZoomKey, installMediaNumericWheel, clientScript };
