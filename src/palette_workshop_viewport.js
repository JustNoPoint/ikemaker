'use strict';

// Serialized into the CSP webview. Inspect rendered UI only, never source or
// color inventories. Capture-phase message handling surrounds every renderer,
// including the independently updated library, live editor, bulk and previews.
function installPaletteWorkshopViewport() {
  const navigation = new Set(['paletteWorkspaceAdvance', 'paletteWorkspaceOpenLibrary',
    'paletteTemplateIntakeRoute', 'paletteTemplatePaletteOnlyStarted', 'paletteIndexMigrationContinue',
    'paletteCompanionFocusTool', 'paletteCompanionBridgeAction']);
  let pending = null, generation = 0, anchor = null, settleTimer = null, layoutFrame = 0;
  let userScrollUntil = 0;
  let appliedTop = window.scrollY, appliedLeft = window.scrollX;
  const scrollSelector = '#libraryList,#embeddedPaletteList,.colors,.comparison-grid,.large-preview,.template-canvas-palette-panel,[data-layout-board]';
  function locator(node) {
    if (!node || node === document.body) return null;
    if (node.id) return '#' + CSS.escape(node.id);
    for (const attribute of ['data-bank-card', 'data-bank-grid', 'data-body', 'data-section', 'data-editor-section']) {
      if (node.hasAttribute(attribute)) return '#sections [' + attribute + '="' + CSS.escape(node.getAttribute(attribute)) + '"]';
    }
    for (const name of ['bank-editor', 'bank-note', 'bank-color-editor', 'live-preview', 'step-tabs', 'step-guide', 'flow-choices']) {
      if (node.classList.contains(name)) return '#sections .' + name;
    }
    const owner = node.closest('[data-body],[data-section]');
    if (!owner) return null;
    const attribute = owner.hasAttribute('data-body') ? 'data-body' : 'data-section';
    let selector = '[' + attribute + '="' + CSS.escape(owner.getAttribute(attribute)) + '"]';
    const path = [];
    for (let child = node; child !== owner; child = child.parentElement) {
      if (!child?.parentElement) return null;
      path.unshift(child.tagName.toLowerCase() + ':nth-child(' + (Array.prototype.indexOf.call(child.parentElement.children, child) + 1) + ')');
    }
    return selector + (path.length ? ' > ' + path.join(' > ') : '');
  }
  function resolve(entry) { return entry.node.isConnected ? entry.node : entry.selector && document.querySelector(entry.selector); }
  function captureAnchor() {
    // Deep inside the editor there may be no workflow heading on screen. Use
    // the bank/card's semantic identity, never a replaceable nth-child swatch.
    // The right preview is sticky: it cannot measure document displacement.
    const landmarks = '.step-tabs,.step-guide,[data-section] > summary,.flow-choices,[data-bank-card],.bank-note,.bank-editor,.bank-color-editor,.live-preview,[data-body],[data-section],#spriteEditorMount,#spriteViewport';
    const candidates = Array.from(document.querySelector('#sections')?.querySelectorAll(landmarks) || []);
    function flowPositioned(node) {
      for (let item = node; item && item !== document.body; item = item.parentElement) {
        const position = getComputedStyle(item).position;
        if (position === 'fixed' || position === 'sticky') return false;
      }
      return true;
    }
    const edge = Math.max(0, Math.min(innerHeight / 3, document.querySelector('body > header')?.getBoundingClientRect().bottom || 0));
    const visible = candidates.map(node => ({ node, rect: node.getBoundingClientRect() })).filter(item => item.rect.height && item.rect.bottom > edge && item.rect.top < innerHeight && flowPositioned(item.node));
    visible.sort((a, b) => Math.abs(a.rect.top - edge) - Math.abs(b.rect.top - edge));
    const node = visible[0]?.node;
    if (!node) return null;
    const selector = locator(node);
    return { node, selector, offset: node.getBoundingClientRect().top };
  }
  function restoreAnchor(saved, fallbackTop, fallbackLeft) {
    const node = saved && resolve(saved);
    const top = node && node.getClientRects().length ? window.scrollY + node.getBoundingClientRect().top - saved.offset : fallbackTop;
    appliedTop = Math.max(0, top); appliedLeft = fallbackLeft;
    // Even a same-position scrollTo cancels Chromium's native smooth scrolling.
    // Host echoes and observer callbacks must not interrupt an in-flight gesture.
    if (window.scrollX !== appliedLeft || window.scrollY !== appliedTop) window.scrollTo(appliedLeft, appliedTop);
    appliedTop = window.scrollY;
    return appliedTop;
  }
  function expireAnchorLater() {
    clearTimeout(settleTimer);
    // A render may attach images/editor nodes late, but never owns the viewport
    // indefinitely. Only host updates establish an anchor, never idle scrolling.
    settleTimer = setTimeout(() => { anchor = null; }, 2000);
  }
  function release() {
    const state = pending;
    pending = null;
    generation++;
    if (state) {
      clearTimeout(state.timer);
      state.observer.disconnect();
      document.body.style.minHeight = state.minHeight;
    }
  }
  // A fresh wheel/key/pointer gesture owns the viewport immediately; no queued
  // frame or image load is permitted to put the user back at an old position.
  function userIntent() { anchor = null; clearTimeout(settleTimer); userScrollUntil = performance.now() + 250; release(); }
  for (const type of ['wheel', 'touchstart', 'pointerdown', 'keydown']) addEventListener(type, userIntent, { capture: true, passive: true });
  addEventListener('scroll', event => {
    if (event.target !== document || pending?.restoring) return;
    if (window.scrollX !== appliedLeft || window.scrollY !== appliedTop) {
      userIntent();
    }
  }, { capture: true, passive: true });
  // Native browser anchoring cannot account for the multiple deferred editor
  // owners. Keep one explicit visible anchor, including after a transaction's
  // temporary height reservation expires. No polling and no inventory walk.
  document.documentElement.style.overflowAnchor = 'none';
  function stabilizeLayout() {
    if (layoutFrame) return;
    layoutFrame = requestAnimationFrame(() => {
      layoutFrame = 0;
      if (pending) restore(pending);
      else if (anchor) restoreAnchor(anchor, appliedTop, appliedLeft);
    });
  }
  const layoutObserver = new ResizeObserver(stabilizeLayout);
  layoutObserver.observe(document.body);
  const contentObserver = new MutationObserver(stabilizeLayout);
  contentObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
  addEventListener('focusin', () => {
    if (pending?.restoring) return;
    if (anchor) restoreAnchor(anchor, appliedTop, appliedLeft);
  }, true);
  function restore(state) {
    if (pending !== state) return;
    state.restoring = true;
    for (const entry of state.disclosures) {
      const node = resolve(entry);
      // Retained nodes may have just received a genuine disclosure click.
      if (node && node !== entry.node && node.tagName === 'DETAILS') node.open = entry.open;
    }
    for (const entry of state.scrollers) {
      const node = resolve(entry);
      if (node) { node.scrollTop = entry.top; node.scrollLeft = entry.left; }
    }
    const focused = state.focus && resolve(state.focus);
    if (focused && state.focus.node !== focused && document.activeElement === document.body) focused.focus({ preventScroll: true });
    if (state.viewport) {
      state.top = restoreAnchor(state.anchor, state.top, state.left);
      anchor = state.anchor;
    }
    state.restoring = false;
  }
  addEventListener('message', event => {
    const type = event.data?.type;
    if (typeof type !== 'string' || !type.startsWith('palette')) return;
    if (navigation.has(type)) { userIntent(); return; }
    if (!document.querySelector('.palette-desk')) return;
    // Keyboard paging and wheel scrolling continue asynchronously in Chromium.
    // An echo between input and the last compositor scroll event must not
    // acquire the gesture's starting position and replay it on the next frame.
    const viewport = performance.now() >= userScrollUntil;
    // Do not replay an old position here: a user may have scrolled since the
    // preceding event but before Chromium delivers its queued scroll event.
    const left = scrollX, top = scrollY;
    const retainedAnchor = anchor && top === appliedTop && left === appliedLeft ? anchor : captureAnchor();
    if (pending) release();
    const focus = document.activeElement;
    const state = {
      generation: ++generation, left, top, anchor: retainedAnchor, viewport,
      minHeight: document.body.style.minHeight,
      disclosures: Array.from(document.querySelectorAll('#sections details'), node => ({ node, selector: locator(node), open: node.open })),
      scrollers: Array.from(document.querySelectorAll(scrollSelector), node => {
        if (node.matches('[data-layout-board]')) node = node.parentElement;
        return { node, selector: locator(node), top: node.scrollTop, left: node.scrollLeft };
      }),
      focus: focus !== document.body ? { node: focus, selector: locator(focus) } : null,
      observer: new ResizeObserver(() => restore(state))
    };
    pending = state;
    expireAnchorLater();
    // Replacing a tall body can temporarily clamp scrollY before a renderer
    // reads it. Reserve its height until replacement images/layout have settled.
    document.body.style.minHeight = document.body.getBoundingClientRect().height + 'px';
    state.observer.observe(document.body);
    state.timer = setTimeout(() => { if (pending === state) { restore(state); release(); } }, 500);
  }, true);
  return function finishPaletteViewportUpdate() {
    const state = pending;
    if (!state) return;
    restore(state);
    requestAnimationFrame(() => {
      if (pending !== state) return;
      if (window.scrollX !== state.left || window.scrollY !== state.top) { release(); return; }
      restore(state);
    });
  };
}

module.exports = { installPaletteWorkshopViewport };
