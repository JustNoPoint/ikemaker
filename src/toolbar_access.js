'use strict';

// Shared toolbar accessibility and small-window behaviour for every IKEMaker
// header that uses the universal toolbar or the shared viewer menus.
//
// The client is a progressive enhancement over the server-rendered header:
// it never adds, removes or reroutes an action. It
//   * keeps disabled universal slots focusable and announces their reasons,
//   * gives each toolbar one Tab stop with arrow-key (roving) focus,
//   * adds a persistent bar with Jump to viewer, More, Reset layout and a
//     compact toggle; compact mode moves secondary rows into the More panel,
//   * anchors narrow-window menus below their heading,
//   * hides universal slots this surface never supports (with a toggle).

const PREFERENCE_KEY = 'ikemaker.toolbarAccess.v1';
const COMPACT_VALUES = Object.freeze(['auto', 'on', 'off']);
const COMPACT_WIDTH = 640;
const COMPACT_HEIGHT = 480;
let storage = null;
let preference = Object.freeze({ compact: 'auto', showUnavailable: false });

function normalizePreference(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return Object.freeze({
    compact: COMPACT_VALUES.includes(source.compact) ? source.compact : 'auto',
    showUnavailable: source.showUnavailable === true
  });
}

function configure(context) {
  storage = context?.globalState || null;
  preference = normalizePreference(storage?.get?.(PREFERENCE_KEY));
}

function current() { return preference; }

async function save(message) {
  if (!message || message.type !== 'ikemakerToolbarPreference') return false;
  const keys = Object.keys(message).sort();
  if (keys.length !== 2 || keys[0] !== 'preference' || keys[1] !== 'type') return true;
  preference = normalizePreference(message.preference);
  try { await storage?.update?.(PREFERENCE_KEY, { ...preference }); } catch (_) {}
  return true;
}

const ICON_FONTS = 'var(--vscode-font-family,"Segoe UI",sans-serif),"Segoe UI Symbol","Segoe UI Emoji","Noto Sans Symbols 2","Noto Sans Symbols","Apple Symbols","DejaVu Sans",sans-serif';

function style() {
  return [
    // Visually hidden live region and reasons.
    '.ikm-sr-only{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}',
    // Persistent bar.
    '.ikm-toolbar-bar{display:flex;align-items:center;gap:3px;min-width:0;max-width:100%;padding:2px 3px;box-sizing:border-box}',
    '.ikemaker-entity-header>.ikm-toolbar-bar{margin-left:auto;padding:0}',
    '.ikm-toolbar-bar>button{box-sizing:border-box;min-height:26px;padding:2px 7px;font:inherit;font-size:12px;white-space:nowrap;cursor:pointer;color:var(--vscode-button-secondaryForeground,var(--vscode-foreground));background:var(--vscode-button-secondaryBackground,var(--vscode-input-background));border:1px solid var(--vscode-button-border,var(--vscode-panel-border))}',
    '.ikm-toolbar-bar>button[hidden]{display:none!important}',
    '.ikm-toolbar-bar>button[aria-pressed="true"],.ikm-toolbar-bar>button[aria-expanded="true"]{border-color:var(--vscode-focusBorder);background:var(--vscode-list-activeSelectionBackground,var(--vscode-input-background))}',
    '.ikm-toolbar-bar>.ikm-toolbar-favorites{display:flex;flex:1 1 auto;min-width:0;gap:3px;overflow-x:auto;overflow-y:hidden;scrollbar-width:thin}',
    '.ikm-toolbar-bar .viewer-action-favorites-bar{flex-wrap:nowrap!important;overflow-x:auto!important}',
    // More panel.
    '.ikm-toolbar-more{position:fixed;z-index:10040;left:4px;right:4px;top:var(--ikm-more-top,34px);max-height:calc(100vh - var(--ikm-more-top,34px) - 6px);overflow:auto;box-sizing:border-box;padding:6px;display:flex;flex-direction:column;gap:6px;background:var(--vscode-menu-background,var(--vscode-editor-background));color:var(--vscode-menu-foreground,var(--vscode-foreground));border:1px solid var(--vscode-focusBorder,var(--vscode-panel-border));box-shadow:0 8px 24px #0008}',
    '.ikm-toolbar-more[hidden]{display:none!important}',
    '.ikm-toolbar-more-options{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;font-size:12px}',
    '.ikm-toolbar-more-options label{display:inline-flex;align-items:center;gap:5px}',
    '.ikm-toolbar-more .ikemaker-universal-toolbar,.ikm-toolbar-more .viewer-icon-toolbar,.ikm-toolbar-more .ikemaker-entity-header{flex-wrap:wrap!important;max-width:100%!important;overflow:visible!important}',
    '.ikm-toolbar-more .ikemaker-universal-toolbar__group,.ikm-toolbar-more .viewer-icon-row{flex-wrap:wrap!important;flex:1 1 100%!important;max-width:100%!important}',
    '.ikm-toolbar-more .ikemaker-universal-toolbar__browser-group{margin-left:0!important}',
    // Compact mode: one bar row plus a single scrolling menu row.
    'html.ikm-toolbar-compact .viewer-dropdown-toolbar{flex-wrap:nowrap!important;overflow-x:auto!important;overflow-y:hidden!important;max-width:100%!important;scrollbar-width:thin}',
    'html.ikm-toolbar-compact .viewer-toolbar-context{position:absolute!important;width:1px!important;height:1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important}',
    'html.ikm-toolbar-compact [data-viewer-archive]{display:none!important}',
    // Unsupported universal slots stay reachable through More > Show unavailable.
    'html:not(.ikm-show-unavailable) .ikemaker-universal-toolbar__button.ikm-unsupported{display:none!important}',
    // Disabled universal slots stay focusable (aria-disabled), styled as unavailable.
    '.ikemaker-universal-toolbar__button[aria-disabled="true"]{cursor:not-allowed;opacity:.5}',
    '.ikemaker-universal-toolbar__button[aria-disabled="true"]:hover{background:var(--vscode-input-background)}',
    // Menus: grouped actions from other viewers, qualifiers and unverified badge.
    '.viewer-menu-more>summary{list-style:none;cursor:pointer;padding:5px 8px;color:var(--vscode-descriptionForeground);white-space:nowrap}',
    '.viewer-menu-more>summary::-webkit-details-marker{display:none}',
    '.viewer-menu-more>summary::before{content:"▸ ";}',
    '.viewer-menu-more[open]>summary::before{content:"▾ ";}',
    '.viewer-menu-more>div{padding-left:10px;border-left:1px solid var(--vscode-panel-border)}',
    '.viewer-menu-more>div>button{display:block;width:100%;text-align:left;border:0;background:transparent;color:var(--vscode-menu-foreground,var(--vscode-foreground));white-space:nowrap}',
    '.viewer-menu-more>div>button:hover,.viewer-menu-more>summary:hover{background:var(--vscode-menu-selectionBackground,var(--vscode-list-hoverBackground))}',
    '.viewer-menu-qualifier,.viewer-menu-count{color:var(--vscode-descriptionForeground);font-size:11px}',
    '.viewer-menu-badge{margin-left:8px;padding:0 4px;font-size:10px;border:1px solid var(--vscode-panel-border);color:var(--vscode-descriptionForeground)}',
    // Narrow windows: icon rows and universal groups wrap instead of clipping.
    '@media(max-width:700px){.viewer-icon-row{flex-wrap:wrap!important;flex:1 1 100%!important;max-width:100%!important}.ikemaker-universal-toolbar__group{flex-wrap:wrap!important;max-width:100%}.viewer-icon-toolbar{max-width:100%!important}}',
    // Icon glyph fallback fonts.
    `.ikemaker-universal-toolbar__icon,.viewer-icon-row button>span[aria-hidden="true"],.ikm-toolbar-bar>button>span[aria-hidden="true"]{font-family:${ICON_FONTS}}`,
    // Reduced motion for every page that loads the shared toolbar.
    '@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important;scroll-behavior:auto!important}}',
    // Windows High Contrast / forced colors: state and focus without colour fills.
    '@media(forced-colors:active){'
      + ':where(button,summary,select,input,textarea,a,[tabindex]):focus-visible{outline:2px solid Highlight!important;outline-offset:1px!important}'
      + '.ikemaker-toolbar-context-menu button:focus,.ikemaker-toolbar-context-menu button:hover{outline:2px solid Highlight!important;outline-offset:-2px!important}'
      + '.viewer-dropdown[open]>summary,.viewer-menu-more[open]>summary{outline:1px solid Highlight;outline-offset:-1px}'
      + ':where(.launch-controls,.ikemaker-universal-toolbar,.ikm-toolbar-bar,.ikm-toolbar-more) :where([aria-pressed="true"],[aria-expanded="true"],[aria-current="true"],[aria-current="page"],[aria-selected="true"],.active){outline:2px solid Highlight!important;outline-offset:-2px!important}'
      + ':where(.launch-controls,.ikemaker-universal-toolbar,.ikm-toolbar-more) [aria-disabled="true"]{color:GrayText!important;border-color:GrayText!important;opacity:1!important}'
      + '.viewer-dropdown>div,.viewer-menu-more>div,.ikm-toolbar-more,.ikemaker-toolbar-context-menu,.viewer-toolbar-dialog{border:1px solid CanvasText!important}'
      + '.ikemaker-universal-toolbar__button,.viewer-icon-row button,.ikm-toolbar-bar>button{border:1px solid ButtonText!important}'
      + '.viewer-menu-badge{border-color:GrayText;color:GrayText}'
      + '}'
  ].join('');
}

function client(config, getBridge) {
  'use strict';
  if (globalThis.ikemakerToolbarAccessBound) return;
  if (typeof document === 'undefined' || typeof MutationObserver !== 'function' || typeof HTMLButtonElement !== 'function' || !document.documentElement || typeof document.documentElement.closest !== 'function') return;
  globalThis.ikemakerToolbarAccessBound = true;
  if (!document.body) { document.addEventListener('DOMContentLoaded', () => { globalThis.ikemakerToolbarAccessBound = false; client(config, getBridge); }, { once: true }); return; }
  const doc = document, root = doc.documentElement, STATE_KEY = 'ikemakerToolbarAccess';
  const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const bridge = () => { try { return getBridge() || null; } catch (_) { return null; } };
  // Chromium keeps boxes for content inside a closed <details>; treat it as hidden.
  const visible = element => {
    if (!element || !element.isConnected || !element.getClientRects().length || element.closest('[hidden]')) return false;
    const closed = element.closest('details:not([open])');
    return !closed || closed.querySelector(':scope>summary') === element;
  };
  const UNSUPPORTED = /is not available in this viewer yet\.?\s*$/i;

  let preference = { compact: config.compact || 'auto', showUnavailable: config.showUnavailable === true };
  try { const saved = bridge()?.getState?.()?.[STATE_KEY]; if (saved && ['auto', 'on', 'off'].includes(saved.compact)) preference = { compact: saved.compact, showUnavailable: saved.showUnavailable === true }; } catch (_) {}
  const persist = () => {
    const api = bridge();
    try { const state = api?.getState?.() || {}; api?.setState?.({ ...state, [STATE_KEY]: { ...preference } }); } catch (_) {}
    // Only the shared launch-controls host understands this message.
    if (doc.querySelector('.launch-controls')) try { api?.postMessage?.({ type: 'ikemakerToolbarPreference', preference: { ...preference } }); } catch (_) {}
  };

  let announcer = null;
  const announce = text => {
    if (!announcer) { announcer = doc.createElement('div'); announcer.className = 'ikm-sr-only'; announcer.setAttribute('role', 'status'); announcer.setAttribute('aria-live', 'polite'); doc.body.append(announcer); }
    announcer.textContent = '';
    setTimeout(() => { announcer.textContent = text; }, 40);
  };

  // --- A2: disabled universal slots stay focusable and explain themselves.
  const nativeDisabled = Object.getOwnPropertyDescriptor(HTMLButtonElement.prototype, 'disabled');
  const reasonOf = button => {
    const described = button.getAttribute('aria-description');
    if (described) return described;
    const match = String(button.title || '').match(/unavailable:\s*(.+)$/i);
    return match ? match[1] : 'This action is not available here.';
  };
  const adopt = button => {
    if (button.ikmAdopted || !nativeDisabled?.set) return;
    let state = button.hasAttribute('disabled'), ownedReason = state && button.hasAttribute('aria-description');
    const sync = () => {
      nativeDisabled.set.call(button, false);
      if (state) {
        button.setAttribute('aria-disabled', 'true');
        if (!button.getAttribute('aria-description')) { const match = String(button.title || '').match(/unavailable:\s*(.+)$/i); if (match) { button.setAttribute('aria-description', match[1]); ownedReason = true; } }
      } else {
        if (button.getAttribute('aria-disabled') === 'true') button.setAttribute('aria-disabled', 'false');
        if (ownedReason) { button.removeAttribute('aria-description'); ownedReason = false; }
      }
      button.classList.toggle('ikm-unavailable', state);
      button.classList.toggle('ikm-unsupported', state && UNSUPPORTED.test(reasonOf(button)));
    };
    try { Object.defineProperty(button, 'disabled', { configurable: true, get() { return state; }, set(value) { state = Boolean(value); sync(); } }); } catch (_) { return; }
    button.ikmAdopted = true;
    sync();
    new MutationObserver(() => { if (button.hasAttribute('disabled')) { state = true; sync(); } }).observe(button, { attributes: true, attributeFilter: ['disabled'] });
  };
  const guard = event => {
    const button = event.target?.closest?.('[data-universal-slot]');
    if (!button || !button.ikmAdopted || !button.disabled) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (event.type === 'click') announce(`${button.getAttribute('aria-label') || 'This action'} is unavailable. ${reasonOf(button)}`);
  };
  doc.addEventListener('click', guard, true);
  doc.addEventListener('auxclick', guard, true);

  // --- A1: one Tab stop per toolbar, arrow keys inside it.
  const ROVING = [
    { container: '.ikemaker-universal-toolbar', items: '[data-universal-slot]', axis: 'both' },
    { container: '.viewer-dropdown-toolbar', items: ':scope>details.viewer-dropdown>summary,:scope>button', axis: 'horizontal' },
    { container: '.viewer-icon-toolbar', items: 'button', axis: 'both' },
    { container: '.viewer-action-favorites-bar', items: ':scope>button', axis: 'both' },
    { container: '.ikm-toolbar-bar', items: ':scope>button,:scope>.ikm-toolbar-favorites>button,:scope>.ikm-toolbar-favorites .viewer-action-favorites-bar>button', axis: 'horizontal' }
  ];
  const itemsFor = (container, spec) => { try { return [...container.querySelectorAll(spec.items)].filter(item => !item.disabled || item.ikmAdopted).filter(visible); } catch (_) { return []; } };
  const setupRoving = () => {
    for (const spec of ROVING) for (const container of doc.querySelectorAll(spec.container)) {
      // Favorites moved into the compact bar rove with the bar itself.
      if (spec.container === '.viewer-action-favorites-bar' && container.closest('.ikm-toolbar-bar')) { container.ikmRoving = null; continue; }
      const items = itemsFor(container, spec);
      if (!items.length) continue;
      container.ikmRoving = spec;
      const current = items.find(item => item === doc.activeElement) || items.find(item => item.ikmRoveCurrent) || items[0];
      for (const item of items) { item.tabIndex = item === current ? 0 : -1; item.ikmRoveCurrent = item === current; }
    }
  };
  const containerOf = target => { for (const spec of ROVING) { const container = target?.closest?.(spec.container); if (container?.ikmRoving) return container; } return null; };
  doc.addEventListener('focusin', event => {
    const container = containerOf(event.target); if (!container) return;
    const items = itemsFor(container, container.ikmRoving); if (!items.includes(event.target)) return;
    for (const item of items) { item.tabIndex = item === event.target ? 0 : -1; item.ikmRoveCurrent = item === event.target; }
  });
  doc.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    // Nested "More from …" menu groups: Right opens, Left closes.
    const nested = event.target?.closest?.('details.viewer-menu-more');
    if (nested && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
      if (event.key === 'ArrowRight' && event.target.matches('details.viewer-menu-more>summary')) { event.preventDefault(); event.stopPropagation(); nested.open = true; nested.querySelector(':scope>div>button:not(:disabled)')?.focus(); return; }
      if (event.key === 'ArrowLeft' && !event.target.matches('details.viewer-menu-more>summary')) { event.preventDefault(); event.stopPropagation(); nested.open = false; nested.querySelector(':scope>summary')?.focus(); return; }
    }
    const container = containerOf(event.target); if (!container) return;
    const spec = container.ikmRoving, items = itemsFor(container, spec), at = items.indexOf(event.target);
    if (at < 0) return;
    const keys = spec.axis === 'both' ? ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'] : ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const back = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (at + (back ? -1 : 1) + items.length) % items.length;
    const details = event.target.closest('details.viewer-dropdown');
    if (details?.open && items[next] !== event.target) details.open = false;
    items[next].focus();
    items[next].scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: reduceMotion() ? 'auto' : 'smooth' });
  }, true);

  // --- A3/B5: expanded state for nested groups; anchor narrow-window menus.
  doc.addEventListener('toggle', event => {
    const details = event.target;
    if (!(details instanceof HTMLDetailsElement)) return;
    if (details.matches('.viewer-menu-more')) { details.querySelector(':scope>summary')?.setAttribute('aria-expanded', details.open ? 'true' : 'false'); return; }
    if (!details.matches('.viewer-dropdown')) return;
    const panel = details.querySelector(':scope>div'), summary = details.querySelector(':scope>summary');
    if (!panel || !summary) return;
    if (details.open && (root.classList.contains('ikm-toolbar-compact') || innerWidth <= 700)) {
      const rect = summary.getBoundingClientRect(), top = Math.max(4, Math.min(rect.bottom + 2, innerHeight - 96));
      Object.assign(panel.style, { position: 'fixed', top: top + 'px', left: '8px', right: '8px', minWidth: '0', boxSizing: 'border-box', maxHeight: Math.max(88, innerHeight - top - 8) + 'px' });
      panel.dataset.ikmAnchored = 'true';
    } else if (panel.dataset.ikmAnchored) {
      for (const key of ['position', 'top', 'left', 'right', 'minWidth', 'boxSizing', 'maxHeight']) panel.style[key] = '';
      delete panel.dataset.ikmAnchored;
    }
  }, true);

  // --- Persistent bar, More panel and compact mode.
  const launch = doc.querySelector('.launch-controls');
  const universal = doc.querySelector('.ikemaker-universal-toolbar');
  const anchor = launch || universal;
  if (!anchor) { setupRoving(); return; }
  const entity = launch?.querySelector('.ikemaker-entity-header') || null;
  const bar = doc.createElement('div');
  bar.className = 'ikm-toolbar-bar'; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Toolbar shortcuts');
  const makeButton = (label, icon, title) => { const button = doc.createElement('button'); button.type = 'button'; button.setAttribute('aria-label', label); button.title = title || label; const glyph = doc.createElement('span'); glyph.setAttribute('aria-hidden', 'true'); glyph.textContent = icon; button.append(glyph); return button; };
  const jump = makeButton('Jump to viewer', '↓', 'Jump to viewer content'); jump.append(' Jump to viewer'); jump.dataset.ikmJump = 'true';
  const more = makeButton('More toolbar actions', '⋯', 'More toolbar actions and toolbar options'); more.append(' More'); more.setAttribute('aria-expanded', 'false');
  const resetSource = () => doc.querySelector('[data-viewer-layout-reset]');
  const reset = makeButton('Reset viewer layout', '↺', 'Reset this viewer’s panel layout'); reset.hidden = !resetSource();
  const compactToggle = makeButton('Compact toolbar', '⇲', 'Compact toolbar: one row plus menus; other rows move into More');
  const favorites = doc.createElement('div'); favorites.className = 'ikm-toolbar-favorites'; favorites.setAttribute('role', 'group'); favorites.setAttribute('aria-label', 'Favorite actions');
  bar.append(jump, more, reset, compactToggle, favorites);

  const panel = doc.createElement('div');
  panel.className = 'ikm-toolbar-more'; panel.id = 'ikm-toolbar-more-' + Math.random().toString(36).slice(2, 8); panel.hidden = true;
  panel.setAttribute('role', 'region'); panel.setAttribute('aria-label', 'More toolbar actions');
  more.setAttribute('aria-controls', panel.id);
  const options = doc.createElement('div'); options.className = 'ikm-toolbar-more-options';
  const unavailableLabel = doc.createElement('label'), unavailableBox = doc.createElement('input'); unavailableBox.type = 'checkbox'; unavailableLabel.append(unavailableBox, doc.createElement('span'));
  const autoButton = doc.createElement('button'); autoButton.type = 'button'; autoButton.textContent = 'Use automatic toolbar size';
  const showFull=doc.createElement('button');showFull.type='button';showFull.textContent='Show full toolbar';const resetToolbar=doc.createElement('button');resetToolbar.type='button';resetToolbar.textContent='Reset toolbar';resetToolbar.title='Restore automatic compact sizing and default toolbar visibility';options.append(unavailableLabel,showFull,resetToolbar,autoButton);
  panel.append(options);  // moved rows are inserted before the options
  (launch || universal.parentElement || doc.body).append(panel);

  // Moved rows remember where they came from.
  const movable = [entity, universal, launch?.querySelector('.viewer-icon-toolbar')].filter(Boolean);
  const homes = new Map(movable.map(node => { const marker = doc.createComment('ikm-toolbar-home'); node.before(marker); return [node, marker]; }));
  const placeBar = compact => {
    if (launch) launch.prepend(bar); else universal.before(bar);
  };
  const favoriteBar = () => doc.querySelector('.viewer-action-favorites-bar');
  let favoriteHome = null;
  const isCompact = () => preference.compact === 'on' || (preference.compact === 'auto' && (anchor.getBoundingClientRect().width < config.compactWidth || innerHeight < config.compactHeight));
  let compactNow = null;
  const updateMoreTop = () => { const rect = bar.getBoundingClientRect(); panel.style.setProperty('--ikm-more-top', Math.round(Math.max(4,Math.min(rect.bottom+2,innerHeight-100))) + 'px'); };
  const closeMore = (restore = false) => { if (panel.hidden) return; panel.hidden = true; more.setAttribute('aria-expanded', 'false'); if (restore) more.focus(); };
  const openMore = () => {
    updateMoreTop(); panel.hidden = false; more.setAttribute('aria-expanded', 'true'); setupRoving();
    const first = [...panel.querySelectorAll('[tabindex="0"],button,select,input,summary')].find(element => visible(element) && (!element.disabled || element.ikmAdopted) && element.tabIndex >= 0);
    if (first) first.focus(); else { panel.tabIndex = -1; panel.focus(); }
  };
  const unsupportedCount = () => doc.querySelectorAll('.ikemaker-universal-toolbar__button.ikm-unsupported').length;
  // Writes only real changes: the body observer also watches these nodes.
  const setHidden = (element, value) => { if (element.hidden !== value) element.hidden = value; };
  const setText = (element, value) => { if (element.textContent !== value) element.textContent = value; };
  const renderOptions = () => {
    const count = unsupportedCount();
    setHidden(unavailableLabel, count === 0);
    unavailableBox.checked = preference.showUnavailable;
    setText(unavailableLabel.lastChild, `Show actions this viewer does not support (${count})`);
    root.classList.toggle('ikm-show-unavailable', preference.showUnavailable);
    setHidden(autoButton, preference.compact === 'auto');setHidden(showFull,!compactNow);
    compactToggle.setAttribute('aria-pressed', compactNow ? 'true' : 'false');
    compactToggle.title = (compactNow ? 'Compact toolbar is on' : 'Compact toolbar is off') + (preference.compact === 'auto' ? ' (automatic for this window size)' : '') + '. Select to turn it ' + (compactNow ? 'off.' : 'on.');
    setHidden(reset, !resetSource());
  };
  const applyCompact = force => {
    const compact = isCompact();
    if (compact === compactNow && !force) { renderOptions(); return; }
    compactNow = compact;
    root.classList.toggle('ikm-toolbar-compact', compact);
    placeBar(compact);
    if (compact) {
      for (const node of movable) options.before(node);
      const favs = favoriteBar();
      if (favs && !favoriteHome) { favoriteHome = doc.createComment('ikm-favorites-home'); favs.before(favoriteHome); }
      if (favs) favorites.append(favs);
    } else {
      closeMore();
      for (const [node, marker] of homes) marker.after(node);
      const favs = favoriteBar();
      if (favs && favoriteHome) favoriteHome.after(favs);
    }
    // In the normal layout More only holds toolbar options.
    renderOptions();
    setupRoving();
  };

  jump.addEventListener('click', () => {
    closeMore();
    const header = launch || universal;
    const candidates = [...doc.querySelectorAll('main,[role="main"],.app,#app,button,summary,select,input,textarea,a[href],[tabindex]:not([tabindex="-1"]),canvas,[contenteditable="true"]')];
    const after = candidates.find(element => !header.contains(element) && !bar.contains(element) && !panel.contains(element) && (header.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING) && visible(element));
    if (!after) { announce('No viewer content to jump to.'); return; }
    const focusable = after.matches('button,summary,select,input,textarea,a[href],[tabindex],[contenteditable="true"]') ? after : (after.querySelector('button,summary,select,input,textarea,a[href],[tabindex]:not([tabindex="-1"]),[contenteditable="true"]') || after);
    if (focusable === after && !after.matches('button,summary,select,input,textarea,a[href],[tabindex],[contenteditable="true"]')) after.tabIndex = -1;
    focusable.focus();
    focusable.scrollIntoView?.({ block: 'nearest', behavior: reduceMotion() ? 'auto' : 'smooth' });
  });
  more.addEventListener('click', () => { if (panel.hidden) openMore(); else closeMore(); });
  reset.addEventListener('click', () => { const source = resetSource(); if (source) { source.click(); announce('Viewer layout reset.'); } });
  compactToggle.addEventListener('click', () => { preference = { ...preference, compact: compactNow ? 'off' : 'on' }; persist(); applyCompact(true); announce(compactNow ? 'Compact toolbar on.' : 'Compact toolbar off.'); compactToggle.focus(); });
  showFull.addEventListener('click',()=>{preference={...preference,compact:'off'};persist();applyCompact(true);compactToggle.focus();announce('Full toolbar shown. Select Compact toolbar to shorten it again.')});
  resetToolbar.addEventListener('click',()=>{preference={compact:'auto',showUnavailable:false};persist();applyCompact(true);closeMore(true);announce('Toolbar reset to automatic size.')});
  autoButton.addEventListener('click', () => { preference = { ...preference, compact: 'auto' }; persist(); applyCompact(true); announce('Toolbar size follows the window again.'); });
  unavailableBox.addEventListener('change', () => { preference = { ...preference, showUnavailable: unavailableBox.checked }; persist(); renderOptions(); setupRoving(); });
  doc.addEventListener('keydown', event => { if (event.key === 'Escape' && !panel.hidden && (panel.contains(event.target) || more.contains(event.target))) { event.preventDefault(); event.stopPropagation(); closeMore(true); } }, true);
  doc.addEventListener('pointerdown', event => { if (!panel.hidden && !panel.contains(event.target) && !more.contains(event.target)) closeMore(); });

  for (const button of doc.querySelectorAll('[data-universal-slot]')) adopt(button);
  let scheduled = false;
  const refresh = () => { if (scheduled) return; scheduled = true; requestAnimationFrame(() => { scheduled = false; for (const button of doc.querySelectorAll('[data-universal-slot]')) adopt(button); if (compactNow) { const favs = favoriteBar(); if (favs && favs.parentElement !== favorites) { if (!favoriteHome) { favoriteHome = doc.createComment('ikm-favorites-home'); favs.before(favoriteHome); } favorites.append(favs); } } renderOptions(); setupRoving(); }); };
  new MutationObserver(records => { if (records.some(record => !bar.contains(record.target) || record.type === 'childList')) refresh(); }).observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  let resizeTimer = 0;
  addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { applyCompact(false); if (!panel.hidden) updateMoreTop(); }, 80); });
  applyCompact(true);
}

function clientScript(options = {}) {
  const variable = typeof options.vscodeVariable === 'string' && /^[A-Za-z_$][\w$]*$/.test(options.vscodeVariable) ? options.vscodeVariable : '';
  const getter = variable ? `()=>{try{return ${variable}}catch(_){return globalThis.ikemakerToolbarBridge||null}}` : '()=>globalThis.ikemakerToolbarBridge||null';
  const config = { compact: preference.compact, showUnavailable: preference.showUnavailable, compactWidth: COMPACT_WIDTH, compactHeight: COMPACT_HEIGHT };
  return `(${client.toString()})(${JSON.stringify(config)},${getter});`;
}

module.exports = { PREFERENCE_KEY, COMPACT_WIDTH, COMPACT_HEIGHT, normalizePreference, configure, current, save, style, clientScript };
