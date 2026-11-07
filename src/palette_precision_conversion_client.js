'use strict';

function install() {
  let reviewedToken = '';
  let inFlight = '';
  let precisionFocus = null;
  let convertElement = null;
  let companionInput = false;
  let inFlightFromCompanion = false;
  const previousRender = renderLive;
  const publishCore = publishPaletteCompanionBridge;
  publishPaletteCompanionBridge = function () {
    const precision = document.getElementById('interactionPrecision');
    // Never replace a focused companion with the transient bank shell. The
    // existing controls are published after the bank enhancer has attached them.
    if (precision && !precision.closest('.bank-editor')) return;
    return publishCore();
  };
  const invokeCore = invokePaletteCompanionBridge;
  const precisionIds = new Set(['interactionPrecision', 'reviewPrecision', 'convertPrecision']);
  invokePaletteCompanionBridge = function (action = {}) {
    if (!precisionIds.has(action.precisionControl)) return invokeCore(action);
    const target = document.getElementById(action.precisionControl);
    const reviewed = live?.precisionConversion;
    if (!target || action.precisionToken !== reviewed?.token
      || !['click', 'change', 'input'].includes(action.event)) {
      return publishPaletteCompanionBridge();
    }
    if (action.event === 'input') return;
    if (action.precisionControl === 'interactionPrecision' && action.event === 'change') {
      if (!target.disabled) {
        target.value = String(action.value || 'full');
        companionInput = true;
        try { target.dispatchEvent(new Event('change', { bubbles: true })); }
        finally { companionInput = false; }
      }
    } else if (action.event === 'click' && !target.disabled) {
      companionInput = true;
      try { target.click(); } finally { companionInput = false; }
    }
    requestAnimationFrame(() => requestAnimationFrame(publishPaletteCompanionBridge));
  };
  const focusAllowed = element =>
    document.activeElement === element || document.activeElement === document.body;

  renderLive = function () {
    previousRender();
    const host = sections.querySelector('[data-body="live-edit"]');
    const precision = host?.querySelector('#interactionPrecision');
    const review = live?.precisionConversion;
    if (!precision || !review) return;
    if (reviewedToken !== review?.token) reviewedToken = '';
    const options = precision.closest('.live-options') || precision.closest('details') || host;
    options.dataset.precisionReviewed = String(Boolean(reviewedToken));
    const bar = document.createElement('div');
    bar.className = 'live-tools';
    const open = document.createElement('button');
    open.type = 'button';
    open.id = 'reviewPrecision';
    open.textContent = 'Review conversion';
    open.disabled = !review?.available || Boolean(inFlight);
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'convertPrecision';
    button.textContent = 'Convert ' + (review?.scopeLabel || 'current scope');
    button.setAttribute('aria-describedby', 'precisionConversionReview');
    button.disabled = !review?.available || Boolean(inFlight) || reviewedToken !== review?.token;
    open.title = button.title = review?.reason
      || 'Review this exact scope before converting its RGB values in the draft.';
    const note = document.createElement('p');
    note.id = 'precisionConversionReview';
    note.className = 'muted';
    note.tabIndex = -1;
    note.setAttribute('role', 'status');
    note.textContent = !review ? 'Waiting for the exact RGB conversion preview.'
      : !review.available ? review.reason
        : review.changedCount + ' changed; ' + review.skippedLockedCount + ' locked/protected skipped. '
          + 'Alpha and index positions preserved. Review, then Enter on Convert; Save/Replace writes it.';
    bar.append(open, button);
    options.append(bar, note);
    convertElement = button;
    for (const control of [precision, open, button]) control.dataset.precisionToken = review?.token || '';

    const prior = precision.onchange;
    precision.onchange = event => {
      reviewedToken = '';
      precisionFocus = companionInput ? null : {
        profile: precision.value,
        selectionKey: review?.selectionKey,
        element: precision
      };
      button.disabled = true;
      open.disabled = true;
      prior?.(event);
    };
    open.onclick = () => {
      if (open.disabled || inFlight || !review?.available) return;
      reviewedToken = review.token;
      options.dataset.precisionReviewed = 'true';
      button.disabled = false;
      note.textContent = 'Reviewed ' + review.scopeLabel + ': ' + review.changedCount
        + ' RGB entries. Enter on Convert applies once to the draft.';
      if (!companionInput) button.focus({ preventScroll: true });
    };
    button.onkeydown = event => {
      if (event.key === 'Enter' && event.repeat) event.preventDefault();
    };
    button.onclick = () => {
      if (button.disabled || inFlight || !review?.available || reviewedToken !== review.token) return;
      inFlight = review.token;
      inFlightFromCompanion = companionInput;
      precision.disabled = true;
      button.disabled = true;
      open.disabled = true;
      post('interactionConvertPrecision', { token: review.token });
    };

    let restoreSelect = null;
    if (precisionFocus && review?.profile === precisionFocus.profile) {
      const request = precisionFocus;
      precisionFocus = null;
      if (review.selectionKey === request.selectionKey && focusAllowed(request.element)) {
        restoreSelect = request;
      }
    }
    // Finish the bank before the viewport transaction restores its anchor.
    // Deferring this move changes document height after scroll restoration.
    enhanceDualBankEditor();
    const completedBank = host.querySelector('.bank-editor');
    if (completedBank && !completedBank.contains(options)) completedBank.append(options);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!options.isConnected || host.querySelector('#interactionPrecision') !== precision) return;
      const bank = host.querySelector('.bank-editor');
      const focused = options.contains(document.activeElement) ? document.activeElement : null;
      if (bank && !bank.contains(options)) bank.append(options);
      if (focused?.isConnected && focusAllowed(focused)) focused.focus({ preventScroll: true });
      if (restoreSelect && focusAllowed(restoreSelect.element)) precision.focus({ preventScroll: true });
      if (bank && typeof publishPaletteCompanionBridge === 'function') publishPaletteCompanionBridge();
    }));
  };

  document.addEventListener('focusin', event => {
    if (precisionFocus && event.target !== precisionFocus.element && event.target !== document.body
      && event.target.id !== 'interactionPrecision') precisionFocus = null;
  });
  addEventListener('message', event => {
    const message = event.data;
    if (message?.type !== 'palettePrecisionConversionResult' || message.token !== inFlight) return;
    const canFocus = !inFlightFromCompanion && focusAllowed(convertElement);
    inFlight = '';
    inFlightFromCompanion = false;
    reviewedToken = '';
    renderLiveGuarded();
    const note = sections.querySelector('#precisionConversionReview');
    if (!note) return;
    note.textContent = message.success
      ? 'RGB conversion retained in the draft. Undo or Save/Replace when ready.'
      : message.message || 'Review the current preview before converting.';
    // Held Enter must not continue onto Undo, Review or another mutation control.
    if (canFocus) note.focus({ preventScroll: true });
  });
}

function installCompanion() {
  let pendingProfileToken = '';
  let snapshotGeneration = 0;
  const sendCore = sendPaletteCompanionControl;
  const precisionIds = new Set(['interactionPrecision', 'reviewPrecision', 'convertPrecision']);
  sendPaletteCompanionControl = function (target, eventName, event) {
    if (!precisionIds.has(target?.id)) return sendCore(target, eventName, event);
    if (target.id === 'interactionPrecision' && eventName === 'change') {
      pendingProfileToken = target.dataset.precisionToken || '';
      const review = document.getElementById('reviewPrecision');
      const convert = document.getElementById('convertPrecision');
      if (review) review.disabled = true;
      if (convert) convert.disabled = true;
    }
    vscode.postMessage({ type: 'bridgeAction', action: {
      precisionControl: target.id,
      precisionToken: target.dataset.precisionToken || '',
      event: eventName,
      value: 'value' in target ? target.value : undefined
    } });
  };
  const core = applyPaletteCompanionBridge;
  applyPaletteCompanionBridge = function (snapshot) {
    const generation = ++snapshotGeneration;
    const priorId = document.activeElement?.id;
    core(snapshot);
    const precision = document.getElementById('interactionPrecision');
    if (pendingProfileToken && precision?.dataset.precisionToken !== pendingProfileToken) {
      pendingProfileToken = '';
    }
    if (pendingProfileToken) {
      const review = document.getElementById('reviewPrecision');
      const convert = document.getElementById('convertPrecision');
      if (review) review.disabled = true;
      if (convert) convert.disabled = true;
    }
    requestAnimationFrame(() => {
      if (generation !== snapshotGeneration) return;
      if (document.activeElement !== document.body && document.activeElement.id !== priorId) return;
      const convert = document.getElementById('convertPrecision');
      const reviewed = document.querySelector('[data-precision-reviewed="true"]');
      if (priorId === 'reviewPrecision' && reviewed && convert && !convert.disabled) {
        convert.focus({ preventScroll: true });
      } else if (priorId === 'convertPrecision' && (!convert || convert.disabled)) {
        document.getElementById('precisionConversionReview')?.focus({ preventScroll: true });
      }
    });
  };
  document.querySelector('.companion-panes')?.addEventListener('keydown', event => {
    if (event.target.id === 'convertPrecision' && event.key === 'Enter' && event.repeat) {
      event.preventDefault();
    }
  });
}

module.exports = {
  clientScript: () => `(${install.toString()})();`,
  companionClientScript: () => `(${installCompanion.toString()})();`,
  install, installCompanion
};
