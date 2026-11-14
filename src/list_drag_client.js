'use strict';
// Delegation survives list rerenders. The nearest scrolling parent is used,
// including narrow layouts where a surrounding pane owns the scrollbar.
function installListDrag(env) {
  const root = env.root, doc = root.ownerDocument;
  let held = null, frame = 0, velocity = 0, scrollHost = null, swallowClick = false;
  function stop() { held = null; velocity = 0; if (frame) cancelAnimationFrame(frame); frame = 0; }
  function scrollTick() { frame = 0; if (!held) return; if (!held.row.isConnected) { stop(); return; } if (!velocity) return; scrollHost.scrollBy({ top: velocity }); frame = requestAnimationFrame(scrollTick); }
  function scrollContainer() { for (let node = root; node && node !== doc.body; node = node.parentElement) { if (node.scrollHeight > node.clientHeight && /auto|scroll/.test(getComputedStyle(node).overflowY)) return node; } return doc.scrollingElement || root; }
  root.addEventListener('pointerdown', event => {
    const row = event.target.closest(env.selector);
    if (event.button !== 0 || !row || !root.contains(row) || env.allowed && !env.allowed()) return;
    if (env.preventNative) event.preventDefault();
    held = { row, id: event.pointerId, x: event.clientX, y: event.clientY, armed: false }; row.setPointerCapture?.(event.pointerId);
  });
  root.addEventListener('pointermove', event => {
    if (!held || event.pointerId !== held.id) return;
    if (event.buttons === 0) { stop(); return; }
    if (!held.armed && Math.hypot(event.clientX - held.x, event.clientY - held.y) >= 8) held.armed = true;
    if (!held.armed) return;
    event.preventDefault(); scrollHost = scrollContainer(); const rect = scrollHost.getBoundingClientRect(),pageScroll=scrollHost===doc.scrollingElement; velocity = env.edgeVelocity(event.clientY, pageScroll?0:Math.max(0,rect.top), pageScroll?window.innerHeight:Math.min(window.innerHeight,rect.bottom));
    if (velocity && !frame) frame = requestAnimationFrame(scrollTick);
  });
  root.addEventListener('pointerup', event => {
    if (!held || event.pointerId !== held.id) return;
    const previous = held; stop(); if (!previous.armed) return;
    swallowClick = true; setTimeout(() => { swallowClick = false; }, 0);
    const row = doc.elementFromPoint(event.clientX, event.clientY)?.closest(env.targetSelector || env.selector);
    if (row && root.contains(row)) env.drop(previous.row, row, event.clientY > row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2);
  });
  root.addEventListener('click', event => { if (swallowClick) { event.preventDefault(); event.stopImmediatePropagation(); swallowClick = false; } }, true);
  root.addEventListener('pointercancel', stop); root.addEventListener('lostpointercapture', stop, true); window.addEventListener('pointerup', stop); window.addEventListener('pointercancel', stop); window.addEventListener('blur', stop);
  return stop;
}
function clientScript() { return `const installListDrag=(${installListDrag.toString()}),listEdgeVelocity=(${require('./view_list_move').edgeScrollVelocity.toString()});`; }
module.exports = { installListDrag, clientScript };
