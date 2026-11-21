'use strict';
function style(){return '@media(forced-colors:active){:where(.active,.selected,.is-selected,[aria-selected="true"],[aria-pressed="true"],[aria-current="true"],[aria-current="page"],details[open]>summary){outline:2px solid Highlight!important;outline-offset:-2px!important}:where(button,summary,a,input,select,textarea,[tabindex]):focus-visible,.ikemaker-toolbar-context-menu button:focus{outline:2px solid Highlight!important;outline-offset:1px!important}:where(button,[role="button"]):is(:disabled,[aria-disabled="true"]){color:GrayText!important;opacity:1!important}.viewer-action-favorite[aria-pressed="true"]{border:2px solid Highlight!important}}html[data-ikm-presentation-ready] .ikm-icon-fallback-label{display:none!important}.ikm-icon-text{display:none!important}:is(.ikm-text-icons:not([data-ikm-presentation-ready]),[data-ikm-action-labels="named"]) :is(.ikemaker-universal-toolbar__button,.viewer-icon-row button){width:auto!important;max-width:none!important;flex-basis:auto!important;padding:0 5px!important}:is(.ikm-text-icons:not([data-ikm-presentation-ready]),[data-ikm-action-labels="named"]) .ikm-icon-text{display:inline!important;font:12px/1.2 var(--vscode-font-family)!important}:is(.ikm-text-icons:not([data-ikm-presentation-ready]),[data-ikm-action-labels="named"]) :is(.ikemaker-universal-toolbar__icon,.viewer-icon-row button>span[aria-hidden="true"]:not(.ikm-icon-text)){display:none!important}@media(forced-colors:active){:is(.ikemaker-universal-toolbar__button,.viewer-icon-row button){width:auto!important;max-width:none!important;flex-basis:auto!important;padding:0 5px!important}.ikm-icon-text{display:inline!important;font:12px/1.2 var(--vscode-font-family)!important}:is(.ikemaker-universal-toolbar__icon,.viewer-icon-row button>span[aria-hidden="true"]:not(.ikm-icon-text)){display:none!important}}';}
function client() {
  if (typeof document === 'undefined' || typeof MutationObserver !== 'function' || globalThis.ikmIconFallbackBound) return;
  globalThis.ikmIconFallbackBound = true;
  const root = document.documentElement, bridge = globalThis.ikemakerToolbarBridge;
  const buttons = '.ikemaker-universal-toolbar__button,.viewer-icon-row button';
  const captionSelector = '.ikm-icon-text', optionsSelector = '.ikm-toolbar-more-options';
  let enabled = false;
  try { enabled = bridge?.getState?.()?.toolbarTextIcons === true; } catch (_) {}
  root.classList.toggle('ikm-text-icons', enabled);

  function syncCaption(button) {
    const text = button.getAttribute('aria-label')?.trim() || button.getAttribute('title')?.trim() || 'Action';
    let caption = button.querySelector(captionSelector);
    if (!caption) {
      caption = document.createElement('span');
      caption.className = 'ikm-icon-text';
      caption.setAttribute('aria-hidden', 'true');
      caption.textContent = text;
      button.append(caption);
    } else if (caption.textContent !== text) {
      caption.textContent = text;
    }
  }

  function syncToggle() {
    const options = document.querySelector(optionsSelector);
    if (!options || options.querySelector('[data-icon-text-toggle]')) return;
    const label = document.createElement('label'), checkbox = document.createElement('input');
    label.className = 'ikm-icon-fallback-label';
    checkbox.type = 'checkbox';
    checkbox.dataset.iconTextToggle = 'true';
    checkbox.checked = enabled;
    checkbox.onchange = () => {
      enabled = checkbox.checked;
      root.classList.toggle('ikm-text-icons', enabled);
      try { bridge?.setState?.({ ...bridge.getState?.(), toolbarTextIcons: enabled }); } catch (_) {}
    };
    label.append(checkbox, document.createTextNode('Show icon text labels'));
    options.append(label);
  }

  document.querySelectorAll(buttons).forEach(syncCaption);
  syncToggle();
  new MutationObserver(records => {
    const pending = new Set();
    let optionsChanged = false;
    for (const record of records) {
      const target = record.target;
      if (record.type === 'attributes') {
        if (target.matches(buttons)) pending.add(target);
        continue;
      }
      // Our generated caption and its text must not trigger another refresh.
      if (target.closest?.(captionSelector)) continue;
      if (target.closest?.(optionsSelector)) optionsChanged = true;
      const button = target.closest?.(buttons);
      if (button && (record.removedNodes.length || [...record.addedNodes].some(node => !node.matches?.(captionSelector)))) pending.add(button);
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1 || node.matches(captionSelector)) continue;
        if (node.matches(buttons)) pending.add(node);
        node.querySelectorAll(buttons).forEach(control => pending.add(control));
        if (node.matches(optionsSelector) || node.querySelector(optionsSelector)) optionsChanged = true;
      }
    }
    for (const button of pending) if (button.isConnected) syncCaption(button);
    if (optionsChanged) syncToggle();
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-label', 'title'] });
}
module.exports={style,clientScript:()=>`(${client.toString()})();`};
