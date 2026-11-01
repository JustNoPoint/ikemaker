'use strict';

const assert = require('assert');
const vm = require('vm');
const toolbar = require('../src/viewer_toolbar');

const combine = toolbar.combineActionAvailability;
assert.deepStrictEqual(combine(true,'',false,'This control is not available in the current viewer.'),{enabled:false,reason:'This control is not available in the current viewer.'},'a missing body owner disables its menu action with an actionable local reason');
assert.deepStrictEqual(combine(true,'',true,''),{enabled:true,reason:''},'the same action re-enables when its body owner appears');
assert.deepStrictEqual(combine(false,'Select an exact viewer item first.',true,''),{enabled:false,reason:'Select an exact viewer item first.'},'a local owner cannot re-enable a host-blocked action');
assert.deepStrictEqual(combine(false,'Select an exact viewer item first.',false,'Missing local control'),{enabled:false,reason:'Select an exact viewer item first.'},'the authoritative host reason wins when both gates are closed');
assert.deepStrictEqual(combine(true,'stale host reason',false,'Finish the current edit first.'),{enabled:false,reason:'Finish the current edit first.'},'a current local transition supplies its exact reason after the host enables the action');

const client=toolbar.clientScript();
for(const evidence of [
  "button.dataset.toolbarHostEnabled='false'",
  "button.dataset.toolbarHostReason='Checking the current project and editor context…'",
  'localEnabled=Boolean(owner)',
  "button.dataset.toolbarHostEnabled==='true'",
  'button.dataset.toolbarHostReason=state.reason',
  'for(const menu of dropdowns)refreshMenu(menu)',
  'syncIconStates()',
  'renderFavoriteBar()'
])assert(client.includes(evidence),`actual toolbar client is missing availability evidence: ${evidence}`);
assert(!client.includes("if(button.dataset.toolbarElement){owner=document.getElementById(button.dataset.toolbarElement);reason=owner?'':'This control is not available in the current viewer.'}"),'the former silent-no-op owner check is retired');

function clientArrow(name, next) {
  const start = client.indexOf(`const ${name}=`);
  const end = client.indexOf(`const ${next}=`, start);
  assert(start >= 0 && end > start, `could not extract actual ${name} client function`);
  return client.slice(start, end);
}

function button(dataset = {}) {
  return {
    dataset: { ...dataset }, disabled: false, title: '', textContent: 'Open Browser',
    getAttribute(name) { return name === 'aria-label' ? 'Open Browser shortcut' : (this[name] ?? null); },
    setAttribute(name, value) { this[name] = value; },
    removeAttribute(name) { if (name === 'title') this.title = ''; },
    closest() { return menu; }
  };
}

let owner = null;
const original = button({ toolbarActionId: 'sff.element.browser', toolbarElement: 'openBrowser', toolbarHostEnabled: 'true', toolbarHostReason: '' });
const menu = { querySelectorAll: () => [original] };
const refreshContext = {
  menu, original, actions: new Map(), directProxy: new Set(), activity: { repeatable: '' },
  actionById: new Map([[original.dataset.toolbarActionId, original]]),
  document: { getElementById: () => owner, querySelector: () => null },
  globalThis: {}, combineAvailability: combine
};
vm.createContext(refreshContext);
vm.runInContext(clientArrow('refreshMenu', 'syncIconStates') + ';this.refreshMenu=refreshMenu;', refreshContext);
refreshContext.refreshMenu(menu);
assert.strictEqual(original.disabled, false, 'unavailable menu actions remain hoverable so their reason can be read');
assert.strictEqual(original['aria-disabled'], 'true', 'actual refreshMenu marks a missing body owner unavailable');
assert.match(original.title, /not available in the current viewer/i);
owner = button(); owner.title = 'Open the connected browser';
refreshContext.owner = owner;
refreshContext.document.getElementById = () => owner;
refreshContext.refreshMenu(menu);
assert.strictEqual(original.disabled, false, 'actual refreshMenu re-enables the action when its owner appears');
assert.strictEqual(original['aria-disabled'], 'false', 'actual refreshMenu clears the accessible unavailable state');
assert.strictEqual(original.title, owner.title, 'actual refreshMenu exposes the owner purpose when enabled');
original.dataset.toolbarHostEnabled = 'false'; original.dataset.toolbarHostReason = 'Select an exact sprite first.';
refreshContext.refreshMenu(menu);
assert.strictEqual(original.disabled, false, 'host-gated menu actions remain hoverable for their explanation');
assert.strictEqual(original['aria-disabled'], 'true', 'actual refreshMenu preserves the authoritative host gate');
assert.strictEqual(original.title, 'Select an exact sprite first.');

const icon = button({ toolbarIconAction: original.dataset.toolbarActionId });
const iconContext = { toolbar: { querySelectorAll: () => [icon] }, actionById: refreshContext.actionById, menuUnavailable: button => button?.getAttribute('aria-disabled') === 'true' };
vm.createContext(iconContext);
vm.runInContext(clientArrow('syncIconStates', 'invokeResolved') + ';this.syncIconStates=syncIconStates;', iconContext);
iconContext.syncIconStates();
assert.strictEqual(icon.disabled, true, 'the actual quick-icon mirror is disabled with its menu action');
assert.strictEqual(icon.title, original.title, 'the actual quick-icon mirror carries the same actionable reason');
original.dataset.toolbarHostEnabled = 'true'; original.dataset.toolbarHostReason = ''; refreshContext.refreshMenu(menu); iconContext.syncIconStates();
assert.strictEqual(icon.disabled, false, 'the actual quick-icon mirror re-enables after the owner and host gates open');

class Node {
  constructor(tag = 'div') { this.tag = tag; this.children = []; this.dataset = {}; this.textContent = ''; this.title = ''; this.disabled = false; this.className = ''; }
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children = [...items]; }
  setAttribute(name, value) { this[name] = value; }
  querySelector(selector) {
    if (selector === '.viewer-action-label') return this.label || (this.label = new Node('span'));
    if (selector === '.viewer-action-group') return this.group || (this.group = new Node('span'));
    return null;
  }
}
const fakeDocument = { createElement: tag => new Node(tag) };
const favoriteBar = new Node();
const activity = { favorites: [original.dataset.toolbarActionId], recent: [], repeatable: '' };
const favoriteContext = { favoriteBar, activity, actionById: refreshContext.actionById, refreshMenu: refreshContext.refreshMenu, menuUnavailable: button => button?.getAttribute('aria-disabled') === 'true', document: fakeDocument, invoke() {}, openActionSearch() {} };
vm.createContext(favoriteContext);
const favoriteStart = client.indexOf('renderFavoriteBar=()=>{favoriteBar.replaceChildren()');
const favoriteEnd = client.indexOf('};renderFavoriteBar();', favoriteStart);
assert(favoriteStart >= 0 && favoriteEnd > favoriteStart, 'could not extract actual renderFavoriteBar client function');
vm.runInContext(client.slice(favoriteStart, favoriteEnd + 2), favoriteContext);
favoriteContext.renderFavoriteBar();
assert.strictEqual(favoriteBar.children[0].disabled, false, 'the actual favorite mirror follows an enabled original action');
original.dataset.toolbarHostEnabled = 'false'; original.dataset.toolbarHostReason = 'Finish the pending sprite edit first.';
favoriteContext.renderFavoriteBar();
assert.strictEqual(favoriteBar.children[0].disabled, true, 'the actual favorite mirror follows a disabled original action');
assert.strictEqual(favoriteBar.children[0].title, 'Finish the pending sprite edit first.', 'the actual favorite mirror exposes the same actionable reason');

const searchInput = { value: '' }, groupFilter = { value: '' }, availableOnly = { checked: false }, favoritesOnly = { checked: false };
const searchResults = new Node(), searchSummary = new Node();
const searchContext = {
  searchInput, groupFilter, availableOnly, favoritesOnly, searchResults, searchSummary,
  activity, menuActions: [original], actionById: refreshContext.actionById, document: fakeDocument,
  menuUnavailable: button => button?.getAttribute('aria-disabled') === 'true',
  searchTerms: value => value.split(/\s+/).filter(Boolean), actionLabel: item => item.textContent,
  showActionDetails() {}, persistActivity() {}, renderSearch() {}, invoke() {}, actionSearchInvoking: false,
  searchDialog: { close() {}, addEventListener() {} }
};
vm.createContext(searchContext);
vm.runInContext(clientArrow('renderSearch', 'openActionSearch') + ';this.renderSearch=renderSearch;', searchContext);
searchContext.renderSearch();
const searchRow = searchResults.children[0], run = searchRow.children[0], unavailable = searchRow.children.at(-1);
assert.strictEqual(run.disabled, true, 'the actual action-search result mirrors disabled state');
assert.strictEqual(run.title, 'Finish the pending sprite edit first.', 'the actual action-search result exposes the actionable reason');
assert.strictEqual(unavailable.textContent, 'Unavailable: Finish the pending sprite edit first.', 'keyboard action search renders disabled reasons as visible text');

console.log('Toolbar client keeps host and local availability independent across missing/appearing owners, explanations, icons, favorites, and search');
