'use strict';

// Contextual help for explicit explanatory prose in IKEMaker webviews.
//
// Markup contract (opt-in only; nothing else on the page is touched):
//   <p data-ikm-help="Master protection">Explanatory prose…</p>
//   data-ikm-help        optional trigger name ("Help: <name>"); empty means "Help".
//   data-ikm-help-mode   optional "tooltip" or "disclosure" (long or linked help is
//                        always a disclosure).
//
// Presentation state belongs to viewer_presentation.js (html[data-ikm-presentation]
// and the document "ikmPresentationChanged" event). This module only reads it.
// Prose is hidden only after data-ikm-help-ready is set, which happens only once a
// connected trigger exists, so a page without this script keeps readable prose.
// Unsafe markup (form controls, live/status/alert regions, interactive or live
// ancestors, nested help) is refused with data-ikm-help-refused and left visible.

const VERSION = 1;
const LONG_HELP_CHARACTERS = 280;
const ATTRIBUTES = Object.freeze({
  help: 'data-ikm-help',
  mode: 'data-ikm-help-mode',
  ready: 'data-ikm-help-ready',
  open: 'data-ikm-help-open',
  refused: 'data-ikm-help-refused',
  trigger: 'data-ikm-help-trigger',
  tip: 'data-ikm-help-tip'
});
const HIDING = ':is([data-ikm-presentation="compact"],[data-ikm-presentation="icons"])';

function style({ shadow = false } = {}) {
  const hiding = shadow ? ':host(' + HIDING + ')' : 'html' + HIDING;
  return [
    '.ikm-help-trigger{display:none;align-items:center;justify-content:center;box-sizing:border-box;min-width:24px;min-height:24px;margin:0 4px 0 0;padding:0 6px;border:1px solid var(--vscode-button-border,var(--vscode-panel-border,transparent));border-radius:12px;background:var(--vscode-button-secondaryBackground,transparent);color:var(--vscode-button-secondaryForeground,var(--vscode-foreground));font:inherit;font-size:12px;line-height:1;cursor:help;vertical-align:middle}',
    '.ikm-help-trigger:hover{background:var(--vscode-button-secondaryHoverBackground,var(--vscode-list-hoverBackground))}',
    '.ikm-help-trigger:focus-visible{outline:2px solid var(--vscode-focusBorder,#4daafc);outline-offset:2px}',
    '.ikm-help-trigger[aria-expanded="true"]{border-color:var(--vscode-focusBorder,#4daafc)}',
    hiding + ' .ikm-help-trigger{display:inline-flex}',
    hiding + ' [data-ikm-help][data-ikm-help-ready]:not([data-ikm-help-open]){display:none!important}',
    '.ikm-help-tip{position:fixed;z-index:10050;left:8px;top:8px;box-sizing:border-box;max-width:min(360px,calc(100vw - 16px));max-height:calc(100vh - 16px);overflow:auto;padding:6px 8px;border:1px solid var(--vscode-editorHoverWidget-border,var(--vscode-panel-border,#808080));background:var(--vscode-editorHoverWidget-background,var(--vscode-editor-background,#1e1e1e));color:var(--vscode-editorHoverWidget-foreground,var(--vscode-foreground,#cccccc));font-size:12px;line-height:1.4;white-space:normal;overflow-wrap:anywhere;box-shadow:0 2px 8px var(--vscode-widget-shadow,rgba(0,0,0,.36))}',
    '.ikm-help-tip[hidden]{display:none!important}',
    '@media (forced-colors:active){.ikm-help-trigger,.ikm-help-tip{border:1px solid CanvasText}}'
  ].join('');
}

// Runs inside the webview. Self-contained: it is serialized by clientScript().
function install(config, shadow) {
  const doc = globalThis.document;
  if (!doc || !doc.documentElement) return null;
  const surface = shadow || doc;
  const tree = shadow || doc.documentElement;
  const presentationHost = shadow?.host || doc.documentElement;
  const owner = shadow || globalThis;
  const existing = owner.ikmContextHelp;
  if (existing && existing.version === config.version) { existing.refresh(); return existing; }
  const A = config.attributes;
  const entries = new Map();
  const listeners = [];
  const checkAuthoredDisplay = new Set();
  let disposed = false;
  function listen(target, type, handler, capture = false) {
    target.addEventListener(type, handler, capture);
    listeners.push(() => target.removeEventListener?.(type, handler, capture));
  }
  const LIVE_ROLES = new Set(['status', 'alert', 'log', 'timer', 'marquee', 'progressbar', 'alertdialog']);
  const CONTROL_ROLES = new Set(['button', 'checkbox', 'combobox', 'listbox', 'menu', 'menubar', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'radio', 'radiogroup', 'searchbox', 'slider', 'spinbutton', 'switch', 'tab', 'tablist', 'textbox', 'tree', 'treeitem', 'grid', 'gridcell', 'dialog', 'link']);
  const CONTROL_TAGS = new Set(['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'OUTPUT', 'PROGRESS', 'METER', 'FORM', 'FIELDSET', 'LABEL', 'DETAILS', 'SUMMARY', 'DIALOG', 'OPTION', 'IFRAME', 'OBJECT', 'EMBED', 'VIDEO', 'AUDIO', 'CANVAS']);
  const CONTAINER_TAGS = new Set(['HTML', 'HEAD', 'BODY', 'LI', 'TD', 'TH', 'TR', 'THEAD', 'TBODY', 'TFOOT', 'DT', 'DD', 'OPTGROUP', 'LEGEND', 'CAPTION', 'SCRIPT', 'STYLE', 'TEMPLATE']);
  const INTERACTIVE_ANCESTORS = new Set(['BUTTON', 'A', 'LABEL', 'SUMMARY', 'SELECT', 'OPTION', 'TEXTAREA', 'OUTPUT']);
  const BLOCK_TAGS = new Set(['P', 'UL', 'OL', 'DL', 'TABLE', 'PRE', 'BLOCKQUOTE', 'FIGURE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'SECTION', 'ARTICLE', 'DIV']);
  let counter = 0, active = null, hideTimer = null, scheduled = false, observer = null;

  const get = (el, name) => (el && el.getAttribute ? el.getAttribute(name) : null);
  const setIfChanged = (el, name, value) => { if (get(el, name) !== value) el.setAttribute(name, value); };
  const removeIfPresent = (el, name) => { if (el.hasAttribute && el.hasAttribute(name)) el.removeAttribute(name); };
  const role = el => String(get(el, 'role') || '').trim().toLowerCase().split(/\s+/)[0];
  const isLive = el => { const live = get(el, 'aria-live'); return (live !== null && live.trim().toLowerCase() !== 'off') || LIVE_ROLES.has(role(el)) || el.tagName === 'OUTPUT'; };
  const editable = el => { const value = get(el, 'contenteditable'); return value !== null && value.toLowerCase() !== 'false'; };
  const focusable = el => { const value = get(el, 'tabindex'); return value !== null && Number(value) >= 0; };
  const normalize = text => String(text || '').replace(/\s+/g, ' ').trim();
  const presentation = () => get(presentationHost, 'data-ikm-presentation');
  const hiding = () => presentation() === 'compact' || presentation() === 'icons';
  const uniqueId = prefix => {
    let id;
    do { id = prefix + (shadow ? 'shadow-' : '') + (++counter); } while (surface.getElementById(id));
    return id;
  };
  const elements = root => { const out = []; const visit = node => { for (const child of node.childNodes || []) if (child.nodeType === 1) { out.push(child); visit(child); } }; visit(root); return out; };

  function unavailable(node, errorIds) {
    if (node.hidden || get(node, 'aria-hidden')?.trim().toLowerCase() === 'true' ||
        node.hasAttribute('inert') || node.style?.display === 'none' ||
        ['hidden', 'collapse'].includes(node.style?.visibility)) return 'hidden-content';
    if (errorIds.has(node.id)) return 'error-message';
    return '';
  }

  function refusal(el, errorIds) {
    if (!el.parentNode || el.parentNode.nodeType !== 1) return 'detached';
    if (CONTAINER_TAGS.has(el.tagName)) return 'unsupported-container';
    if ((el.tagName === 'A' && el.hasAttribute('href')) || CONTROL_TAGS.has(el.tagName) || CONTROL_ROLES.has(role(el))) return 'form-control';
    // Read the authored display before applying our own compact-mode hide rule.
    if ((!el.hasAttribute(A.ready) || checkAuthoredDisplay.has(el)) && typeof globalThis.getComputedStyle === 'function') {
      removeIfPresent(el, A.ready);
      const computed = globalThis.getComputedStyle(el);
      if (computed.display === 'none' || ['hidden', 'collapse'].includes(computed.visibility)) return 'hidden-content';
    }
    const blocked = unavailable(el, errorIds);
    if (blocked) return blocked;
    if (isLive(el)) return 'live-region';
    if (editable(el) || focusable(el)) return 'focusable-content';
    for (let node = el.parentElement; node; node = node.parentElement) {
      const blocked = unavailable(node, errorIds);
      if (blocked) return blocked;
      if (node.hasAttribute(A.help)) return 'nested-help';
      if (isLive(node)) return 'live-region-ancestor';
      if (editable(node)) return 'editable-ancestor';
      if (INTERACTIVE_ANCESTORS.has(node.tagName) || CONTROL_ROLES.has(role(node))) return 'interactive-ancestor';
    }
    for (const node of elements(el)) {
      const blocked = unavailable(node, errorIds);
      if (blocked) return blocked;
      if (node.hasAttribute(A.help)) return 'nested-help';
      if (isLive(node)) return 'live-region';
      if (CONTROL_TAGS.has(node.tagName) || (CONTROL_ROLES.has(role(node)) && role(node) !== 'link')) return 'form-control';
      if (editable(node) || (focusable(node) && !(node.tagName === 'A' && node.hasAttribute('href')))) return 'focusable-content';
    }
    if (!normalize(el.textContent)) return 'empty';
    return '';
  }

  function kindFor(el, text) {
    const descendants = elements(el);
    if (descendants.some(node => (node.tagName === 'A' && node.hasAttribute('href')) || role(node) === 'link')) return 'disclosure';
    const requested = String(get(el, A.mode) || '').trim().toLowerCase();
    if (requested === 'disclosure') return 'disclosure';
    if (text.length > config.longHelpCharacters) return 'disclosure';
    if (requested === 'tooltip') return 'tooltip';
    if (descendants.some(node => BLOCK_TAGS.has(node.tagName)) || descendants.filter(node => node.tagName === 'BR').length > 1) return 'disclosure';
    return 'tooltip';
  }

  function labelFor(el) {
    const name = normalize(get(el, A.help));
    if (!name) return config.defaultName;
    return /^help\b/i.test(name) ? name : config.defaultName + ': ' + name;
  }

  function clearHideTimer() { if (hideTimer !== null) { clearTimeout(hideTimer); hideTimer = null; } }

  function hide(entry) {
    if (!entry || entry.kind !== 'tooltip') return;
    if (active === entry) clearHideTimer();
    entry.pinned = false;
    if (!entry.tip.hidden) entry.tip.hidden = true;
    if (active === entry) active = null;
  }

  function position(entry) {
    const trigger = entry.trigger.getBoundingClientRect(), tip = entry.tip.getBoundingClientRect();
    const width = Number(globalThis.innerWidth) || doc.documentElement.clientWidth || 0;
    const height = Number(globalThis.innerHeight) || doc.documentElement.clientHeight || 0;
    const margin = 8, gap = 6;
    const maxLeft = Math.max(margin, width - tip.width - margin);
    const left = Math.min(Math.max(trigger.left, margin), maxLeft);
    let top = trigger.bottom + gap, placement = 'below';
    if (top + tip.height > height - margin && trigger.top - gap - tip.height >= margin) { top = trigger.top - gap - tip.height; placement = 'above'; }
    else top = Math.max(margin, Math.min(top, height - tip.height - margin));
    entry.tip.style.left = Math.round(left) + 'px';
    entry.tip.style.top = Math.round(top) + 'px';
    setIfChanged(entry.tip, 'data-placement', placement);
  }

  function show(entry, pinned) {
    if (!entry || entry.kind !== 'tooltip' || !hiding() || !entry.trigger.isConnected) return;
    clearHideTimer();
    if (active && active !== entry) hide(active);
    syncText(entry);
    entry.tip.hidden = false;
    entry.pinned = Boolean(pinned) || entry.pinned;
    position(entry);
    active = entry;
  }

  function scheduleHide(entry) {
    if (active !== entry || entry.pinned) return;
    clearHideTimer();
    hideTimer = setTimeout(() => { hideTimer = null; if (active === entry && !entry.pinned && !entry.focused) hide(entry); }, config.hideDelay);
  }

  function setOpen(entry, open) {
    if (open) setIfChanged(entry.prose, A.open, ''); else removeIfPresent(entry.prose, A.open);
    setIfChanged(entry.trigger, 'aria-expanded', open ? 'true' : 'false');
  }

  function syncText(entry) {
    if (entry.kind !== 'tooltip') return;
    const text = normalize(entry.prose.textContent);
    if (entry.tip.textContent !== text) entry.tip.textContent = text;
  }

  function create(el, kind) {
    const entry = { prose: el, kind, pinned: false, focused: false, assignedId: '' };
    const trigger = doc.createElement('button');
    trigger.setAttribute('type', 'button');
    trigger.setAttribute('class', 'ikm-help-trigger');
    trigger.setAttribute(A.trigger, kind);
    trigger.setAttribute('aria-label', labelFor(el));
    const glyph = doc.createElement('span');
    glyph.setAttribute('aria-hidden', 'true');
    glyph.textContent = '?';
    trigger.appendChild(glyph);
    entry.trigger = trigger;
    if (kind === 'tooltip') {
      const tip = doc.createElement('div');
      tip.setAttribute('id', uniqueId('ikm-help-tip-'));
      tip.setAttribute('role', 'tooltip');
      tip.setAttribute('class', 'ikm-help-tip');
      tip.setAttribute(A.tip, '');
      tip.hidden = true;
      entry.tip = tip;
      syncText(entry);
      (shadow || doc.body || doc.documentElement).appendChild(tip);
      trigger.setAttribute('aria-describedby', tip.getAttribute('id'));
      tip.addEventListener('mouseenter', () => clearHideTimer());
      tip.addEventListener('mouseleave', () => scheduleHide(entry));
      trigger.addEventListener('mouseenter', () => show(entry, false));
      trigger.addEventListener('mouseleave', () => scheduleHide(entry));
      trigger.addEventListener('focus', () => { entry.focused = true; show(entry, false); });
      trigger.addEventListener('blur', () => { entry.focused = false; hide(entry); });
      trigger.addEventListener('click', () => { if (active === entry && entry.pinned) hide(entry); else show(entry, true); });
    } else {
      if (!el.getAttribute('id')) { entry.assignedId = uniqueId('ikm-help-prose-'); el.setAttribute('id', entry.assignedId); }
      trigger.setAttribute('aria-controls', el.getAttribute('id'));
      trigger.setAttribute('aria-expanded', 'false');
      trigger.addEventListener('click', () => setOpen(entry, !el.hasAttribute(A.open)));
    }
    el.parentNode.insertBefore(trigger, el);
    return entry;
  }

  function teardown(entry) {
    hide(entry);
    entry.restoreTabIndex?.();
    entries.delete(entry.prose);
    if (entry.trigger.parentNode) entry.trigger.parentNode.removeChild(entry.trigger);
    if (entry.tip && entry.tip.parentNode) entry.tip.parentNode.removeChild(entry.tip);
    removeIfPresent(entry.prose, A.ready);
    removeIfPresent(entry.prose, A.open);
    if (entry.assignedId && get(entry.prose, 'id') === entry.assignedId) entry.prose.removeAttribute('id');
  }

  function ensure(el, errorIds) {
    let entry = entries.get(el);
    const reason = refusal(el, errorIds);
    if (reason) {
      if (entry) teardown(entry);
      removeIfPresent(el, A.ready);
      setIfChanged(el, A.refused, reason);
      return;
    }
    removeIfPresent(el, A.refused);
    const kind = kindFor(el, normalize(el.textContent));
    if (entry && entry.kind !== kind) { teardown(entry); entry = null; }
    if (!entry) { entry = create(el, kind); entries.set(el, entry); }
    if (entry.trigger.parentNode !== el.parentNode || entry.trigger.nextSibling !== el) el.parentNode.insertBefore(entry.trigger, el);
    setIfChanged(entry.trigger, 'aria-label', labelFor(el));
    syncText(entry);
    if (entry.tip && !entry.tip.isConnected) (shadow || doc.body || doc.documentElement).appendChild(entry.tip);
    if (entry.kind === 'tooltip' && active === entry && !entry.tip.hidden) position(entry);
    const usable = entry.trigger.isConnected && entry.trigger.parentNode === el.parentNode && (!entry.tip || entry.tip.isConnected);
    if (usable) setIfChanged(el, A.ready, ''); else removeIfPresent(el, A.ready);
  }

  function refresh() {
    scheduled = false;
    if (disposed) return;
    const errorIds = new Set();
    for (const owner of tree.querySelectorAll('[aria-errormessage]')) {
      for (const id of (get(owner, 'aria-errormessage') || '').trim().split(/\s+/)) if (id) errorIds.add(id);
    }
    for (const entry of [...entries.values()]) if (!entry.prose.isConnected || !entry.prose.hasAttribute(A.help)) teardown(entry);
    for (const el of tree.querySelectorAll('[' + A.help + ']')) ensure(el, errorIds);
    checkAuthoredDisplay.clear();
  }

  function schedule() {
    if (disposed || scheduled) return;
    scheduled = true;
    Promise.resolve().then(refresh);
  }

  function entryFor(node) {
    for (const entry of entries.values()) if (entry.trigger === node || entry.trigger.contains(node) || entry.prose.contains(node) || (entry.tip && entry.tip.contains(node))) return entry;
    return null;
  }

  listen(surface, 'keydown', event => {
    if (event.key !== 'Escape' && event.key !== 'Esc') return;
    // An Escape from a nested shadow surface belongs to that surface.
    const scope = event.composedPath?.()[0]?.getRootNode?.();
    if (scope && scope !== surface) return;
    if (active) { hide(active); event.preventDefault(); event.stopPropagation(); return; }
    const entry = entryFor(surface.activeElement);
    if (!entry || entry.kind !== 'disclosure' || !entry.prose.hasAttribute(A.open)) return;
    const focusInside = entry.prose.contains(surface.activeElement);
    setOpen(entry, false);
    // Focus stays put unless it was inside prose that is now hidden.
    if (focusInside) entry.trigger.focus();
    event.preventDefault();
    event.stopPropagation();
  }, true);
  listen(doc, 'pointerdown', event => {
    if (!active) return;
    const target = shadow ? event.composedPath()[0] : event.target;
    if (active.trigger.contains(target) || active.tip.contains(target)) return;
    hide(active);
  }, true);
  let wasHiding = hiding();
  listen(doc, 'ikmPresentationChanged', () => {
    if (wasHiding === hiding()) return;
    wasHiding = hiding();
    const focused = surface.activeElement;
    const entry = entryFor(focused);
    if (active) hide(active);
    if (!entry) return;
    if (!hiding() && focused === entry.trigger) {
      const prose = entry.prose;
      if (!prose.hasAttribute('tabindex')) {
        prose.setAttribute('tabindex', '-1');
        entry.restoreTabIndex = () => {
          prose.removeEventListener('blur', entry.restoreTabIndex);
          if (get(prose, 'tabindex') === '-1') prose.removeAttribute('tabindex');
          delete entry.restoreTabIndex;
        };
        prose.addEventListener('blur', entry.restoreTabIndex);
      }
      prose.focus({ preventScroll: true });
    } else if (hiding() && entry.prose.contains(focused) && !entry.prose.hasAttribute(A.open)) {
      entry.trigger.focus({ preventScroll: true });
    }
  });
  if (typeof globalThis.addEventListener === 'function') {
    listen(globalThis, 'resize', () => { if (active) position(active); });
    const onScroll = () => { if (active && !active.pinned) hide(active); else if (active) position(active); };
    listen(globalThis, 'scroll', onScroll, true);
    if (shadow) listen(shadow, 'scroll', onScroll, true);
  }
  if (typeof globalThis.MutationObserver === 'function') {
    observer = new globalThis.MutationObserver(records => {
      let relevant = false;
      for (const record of records) {
        const target = record.target;
        // Repositioning our own tooltip updates its style. It cannot affect which prose is eligible.
        if (target.hasAttribute?.(A.tip) || target.hasAttribute?.(A.trigger)) continue;
        // Status and preview readouts often replace only text nodes. Outside annotated prose
        // those updates cannot change help eligibility, error references, or trigger placement.
        if (record.type === 'characterData' || (record.type === 'childList' && record.addedNodes && record.removedNodes &&
            [...record.addedNodes, ...record.removedNodes].every(node => node.nodeType === 3))) {
          let prose = target.nodeType === 1 ? target : target.parentElement;
          while (prose && !prose.hasAttribute(A.help)) prose = prose.parentElement;
          if (!prose) continue;
        }
        if (['style', 'class', 'hidden'].includes(record.attributeName)) {
          for (let node = target; node; node = node.parentElement) {
            if (node.hasAttribute?.(A.help)) { checkAuthoredDisplay.add(node); relevant = true; }
          }
          for (const prose of target.querySelectorAll?.('[' + A.help + ']') || []) {
            checkAuthoredDisplay.add(prose);
            relevant = true;
          }
        } else relevant = true;
      }
      if (relevant) schedule();
    });
    observer.observe(tree, { subtree: true, childList: true, characterData: true, attributes: true,
      attributeFilter: [A.help, A.mode, 'aria-live', 'role', 'contenteditable', 'tabindex', 'href', 'id', 'aria-errormessage', 'hidden', 'aria-hidden', 'inert', 'style', 'class'] });
  }

  const api = {
    version: config.version,
    refresh,
    hideAll() { if (active) hide(active); },
    inspect(el) {
      const entry = entries.get(el);
      return { ready: Boolean(el && el.hasAttribute && el.hasAttribute(A.ready)), refused: get(el, A.refused) || '', kind: entry ? entry.kind : '', trigger: entry ? entry.trigger : null, tip: entry && entry.tip ? entry.tip : null };
    },
    dispose() {
      disposed = true;
      checkAuthoredDisplay.clear();
      clearHideTimer();
      for (const remove of listeners.splice(0)) remove();
      if (observer) observer.disconnect();
      for (const entry of [...entries.values()]) teardown(entry);
      if (owner.ikmContextHelp === api) delete owner.ikmContextHelp;
    }
  };
  owner.ikmContextHelp = api;
  refresh();
  return api;
}

function clientScript(options = {}) {
  const longHelp = Number.isSafeInteger(options.longHelpCharacters) && options.longHelpCharacters > 0 ? options.longHelpCharacters : LONG_HELP_CHARACTERS;
  const hideDelay = Number.isSafeInteger(options.hideDelay) && options.hideDelay >= 0 ? options.hideDelay : 150;
  const defaultName = typeof options.defaultName === 'string' && options.defaultName.trim() ? options.defaultName.trim() : 'Help';
  const shadow = /^[A-Za-z_$][\w$]*$/.test(options.shadowVariable || '') ? ',' + options.shadowVariable : '';
  const config = { version: VERSION, attributes: ATTRIBUTES, longHelpCharacters: longHelp, hideDelay, defaultName };
  // JSON.stringify escapes nothing dangerous for a <script> body except "</"; guard it.
  return '(' + install.toString() + ')(' + JSON.stringify(config).replace(/</g, '\\u003c') + shadow + ');';
}

module.exports = { VERSION, ATTRIBUTES, LONG_HELP_CHARACTERS, style, clientScript };
