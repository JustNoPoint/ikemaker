'use strict';

const PREFERENCE_KEY = 'ikemaker.viewerPresentation.v2';
const LEGACY_PREFERENCE_KEY = 'ikemaker.viewerPresentation.v1';
const MODES = Object.freeze(['guided', 'compact']);
const ACTION_LABELS = Object.freeze(['icons', 'named']);
const DEFAULT_MODE = 'compact';
const DEFAULT_ACTION_LABELS = 'named';
const READY = 'ikmPresentationReady';
const CHANGE = 'ikmPresentationChange';
const STATE = 'ikmPresentationState';

const panels = new Set();
let storage, revision = 0, preference = normalize(), saves = Promise.resolve();

function normalize(saved = {}) {
  if (typeof saved === 'string') {
    return { mode: saved === 'guided' ? 'guided' : DEFAULT_MODE, actionLabels: saved === 'icons' ? 'icons' : DEFAULT_ACTION_LABELS };
  }
  return {
    mode: MODES.includes(saved?.mode) ? saved.mode : DEFAULT_MODE,
    actionLabels: ACTION_LABELS.includes(saved?.actionLabels) ? saved.actionLabels : DEFAULT_ACTION_LABELS
  };
}

function configure(context) {
  storage = context?.globalState;
  preference = normalize(storage?.get(PREFERENCE_KEY) ?? storage?.get(LEGACY_PREFERENCE_KEY));
  revision++;
}

function current() { return preference.mode; }
function currentActionLabels() { return preference.actionLabels; }

function isMessage(message) {
  return message?.type === READY || message?.type === CHANGE;
}

async function send(panel) {
  if (panels.has(panel)) await panel.webview.postMessage({ type: STATE, ...preference, revision });
}

async function handle(message, panel) {
  if (!isMessage(message)) return false;
  if (!panel?.webview || !Object.hasOwn(message, 'type')) return true;
  if (message.type === READY) {
    if (Object.keys(message).length !== 1) return true;
    if (!panels.has(panel)) {
      panels.add(panel);
      panel.onDidDispose?.(() => panels.delete(panel));
    }
    await Promise.allSettled([send(panel)]);
    return true;
  }
  if (Object.keys(message).length !== 2 || !panels.has(panel)) return true;
  let requested;
  if (Object.hasOwn(message, 'mode') && MODES.includes(message.mode)) requested = { mode: message.mode };
  if (Object.hasOwn(message, 'actionLabels') && ACTION_LABELS.includes(message.actionLabels)) requested = { actionLabels: message.actionLabels };
  if (!requested) return true;

  const save = saves.then(async () => {
    if (!panels.has(panel)) return;
    const next = { ...preference, ...requested };
    if (next.mode === preference.mode && next.actionLabels === preference.actionLabels) {
      await Promise.allSettled([send(panel)]);
      return;
    }
    try { await storage?.update(PREFERENCE_KEY, next); } catch (_) {
      await Promise.allSettled([send(panel)]);
      return;
    }
    preference = next;
    revision++;
    await Promise.allSettled([...panels].map(send));
  });
  saves = save.catch(() => {});
  await save;
  return true;
}

function style({ shadow = false } = {}) {
  const mode = '[data-ikm-action-labels="icons"]';
  const icon = (shadow ? ':host(' + mode + ')' : 'html' + mode) + ' [data-ikm-action-icon][aria-label]:not([aria-label=""])';
  return [
    'select:is([data-ikm-presentation-choice],[data-ikm-action-label-choice]){font:inherit;color:var(--vscode-dropdown-foreground,var(--vscode-foreground));background:var(--vscode-dropdown-background,var(--vscode-editor-background));border:1px solid var(--vscode-dropdown-border,var(--vscode-panel-border));min-height:26px}',
    '.ikm-action-focus-label{position:fixed;z-index:2147483647;pointer-events:none;box-sizing:border-box;max-width:min(30em,calc(100vw - 12px));overflow-wrap:anywhere;padding:4px 7px;border:1px solid var(--vscode-editorHoverWidget-border,GrayText);border-radius:3px;background:var(--vscode-editorHoverWidget-background,Canvas);color:var(--vscode-editorHoverWidget-foreground,CanvasText);font:12px/1.4 var(--vscode-font-family,sans-serif)}',
    icon + '{min-width:28px;text-align:center}',
    icon + '::before{content:attr(data-ikm-action-icon);content:attr(data-ikm-action-icon) / "";font-family:"Segoe UI Symbol","Noto Sans Symbols 2",sans-serif}',
    icon + '>[data-ikm-action-label]{display:none}'
  ].join('');
}

function chooserHtml() {
  return '<select data-ikm-presentation-choice aria-label="Viewer explanations" title="Choose whether explanations are visible or available on demand" hidden>' +
    '<option value="guided">Guided</option><option value="compact">Compact</option></select>' +
    '<select data-ikm-action-label-choice aria-label="Viewer action labels" title="Choose icons or named buttons" hidden>' +
    '<option value="icons">Icons</option><option value="named">Named buttons</option></select>';
}

function html() {
  return '<style data-ikm-presentation-style>' + style() + '</style>';
}

function install(bridge, initial, modes, labels, types) {
  if (globalThis.ikmPresentationInstalled) return;
  const root = document.documentElement;
  if (!root?.dataset || typeof bridge?.postMessage !== 'function') return;
  globalThis.ikmPresentationInstalled = { bindActionFocus };
  const explanations = 'select[data-ikm-presentation-choice]';
  const actionLabels = 'select[data-ikm-action-label-choice]';
  const choosers = explanations + ',' + actionLabels;
  let current, revision = -1;
  const iconActions = 'button[data-ikm-action-icon],summary[data-ikm-action-icon],button.ikemaker-universal-toolbar__button,.viewer-icon-row button';
  let focusLabel, focusedAction, labelObserver;
  function clearFocusLabel() {
    labelObserver?.disconnect();
    labelObserver = undefined;
    focusLabel?.remove();
    focusLabel = focusedAction = undefined;
  }
  function positionFocusLabel() {
    if (!focusedAction) return;
    const anchor = focusedAction.getBoundingClientRect();
    if (!focusedAction.isConnected || !anchor.width || !anchor.height || anchor.bottom <= 0 || anchor.top >= innerHeight ||
        anchor.right <= 0 || anchor.left >= innerWidth) return clearFocusLabel();
    const box = focusLabel.getBoundingClientRect();
    focusLabel.style.left = Math.max(6, Math.min(anchor.left, innerWidth - box.width - 6)) + 'px';
    const below = anchor.bottom + 4;
    focusLabel.style.top = Math.max(4, below + box.height <= innerHeight - 4 ? below : anchor.top - box.height - 4) + 'px';
  }
  function refreshFocusLabel() {
    if (!focusedAction) return;
    const name = (focusedAction.getAttribute('aria-label') || '').trim();
    const title = focusedAction.title.trim();
    const visibleName = focusedAction.querySelector('[data-ikm-action-label],.ikm-icon-text');
    if ((!name && !title) || (visibleName && visibleName.getClientRects().length)) return clearFocusLabel();
    const text = name && title && !title.toLowerCase().includes(name.toLowerCase()) ? name + ' — ' + title : title || name;
    if (focusLabel.textContent !== text) focusLabel.textContent = text;
    positionFocusLabel();
  }
  function showFocusLabel(action) {
    clearFocusLabel();
    if (revision < 0 || current.actionLabels !== 'icons' || !action?.matches?.(iconActions) ||
        !action.matches(':focus-visible') || action.matches(':hover')) return;
    focusedAction = action;
    focusLabel = document.createElement('div');
    focusLabel.className = 'ikm-action-focus-label';
    focusLabel.setAttribute('aria-hidden', 'true');
    document.body.append(focusLabel);
    if (typeof MutationObserver === 'function') {
      labelObserver = new MutationObserver(refreshFocusLabel);
      labelObserver.observe(action, {attributes:true, attributeFilter:['title','aria-label','disabled','aria-disabled','class','hidden'], childList:true, subtree:true});
    }
    refreshFocusLabel();
  }
  function bindActionFocus(surface) {
    const onFocus = event => { if (event.target === event.composedPath()[0]) showFocusLabel(event.target); };
    const onPointer = event => { if (focusedAction?.contains(event.target)) clearFocusLabel(); };
    surface.addEventListener('focusin', onFocus);
    surface.addEventListener('focusout', clearFocusLabel);
    surface.addEventListener('pointerover', onPointer);
    return () => {
      surface.removeEventListener('focusin', onFocus);
      surface.removeEventListener('focusout', clearFocusLabel);
      surface.removeEventListener('pointerover', onPointer);
      if (focusedAction && surface.contains(focusedAction)) clearFocusLabel();
    };
  }
  bindActionFocus(document);
  document.addEventListener('pointerdown', clearFocusLabel, true);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') clearFocusLabel(); }, true);
  addEventListener('scroll', positionFocusLabel, true);
  addEventListener('resize', positionFocusLabel);
  addEventListener('pagehide', clearFocusLabel);
  const sync = control => {
    const value = control.matches?.(actionLabels) ? current.actionLabels : current.mode;
    if (control.value !== value) control.value = value;
    if (control.hidden !== (revision < 0)) control.hidden = revision < 0;
  };
  const apply = next => {
    const changed = !current || current.mode !== next.mode || current.actionLabels !== next.actionLabels;
    const labelsChanged = current?.actionLabels !== next.actionLabels;
    current = next;
    root.dataset.ikmPresentation = current.mode;
    root.dataset.ikmActionLabels = current.actionLabels;
    if (revision >= 0) root.dataset.ikmPresentationReady = 'true';
    for (const control of document.querySelectorAll(choosers)) sync(control);
    if (changed && typeof CustomEvent === 'function') {
      document.dispatchEvent(new CustomEvent('ikmPresentationChanged', { detail: { ...current } }));
    }
    if (labelsChanged) showFocusLabel(document.activeElement?.shadowRoot?.activeElement || document.activeElement);
  };
  // A restored preference must not hide instructions before this particular
  // panel proves it can receive authoritative settings and expose the controls.
  apply({ mode: 'guided', actionLabels: 'named' });
  if (typeof MutationObserver === 'function' && document.body) {
    new MutationObserver(records => {
      if (focusedAction && !focusedAction.isConnected) clearFocusLabel();
      for (const { addedNodes } of records) {
        for (const node of addedNodes) {
          if (node.matches?.(choosers)) sync(node);
          for (const control of node.querySelectorAll?.(choosers) || []) sync(control);
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }
  addEventListener('message', event => {
    const message = event.data;
    if (message?.type !== types.state || !modes.includes(message.mode) || !labels.includes(message.actionLabels)
      || !Number.isSafeInteger(message.revision) || message.revision < revision) return;
    revision = message.revision;
    apply({ mode: message.mode, actionLabels: message.actionLabels });
  });
  document.addEventListener('change', event => {
    const target = event.target;
    if (target?.matches?.(explanations) && modes.includes(target.value)) {
      const requested = target.value;
      sync(target);
      bridge.postMessage({ type: types.change, mode: requested });
    }
    if (target?.matches?.(actionLabels) && labels.includes(target.value)) {
      const requested = target.value;
      sync(target);
      bridge.postMessage({ type: types.change, actionLabels: requested });
    }
  });
  bridge.postMessage({ type: types.ready });
}

function clientScript(options = {}) {
  const variable = typeof options.vscodeVariable === 'string' && /^[A-Za-z_$][\w$]*$/.test(options.vscodeVariable) ? options.vscodeVariable : '';
  const bridge = variable || 'globalThis.ikemakerToolbarBridge';
  return '(' + install.toString() + ')(' + bridge + ',' + JSON.stringify(preference) + ',' + JSON.stringify(MODES) + ',' + JSON.stringify(ACTION_LABELS) + ',' +
    JSON.stringify({ ready: READY, change: CHANGE, state: STATE }) + ');';
}

module.exports = {
  PREFERENCE_KEY, LEGACY_PREFERENCE_KEY, MODES, ACTION_LABELS, DEFAULT_MODE, DEFAULT_ACTION_LABELS, READY, CHANGE, STATE,
  configure, current, currentActionLabels, isMessage, handle, style, html, chooserHtml, clientScript
};
