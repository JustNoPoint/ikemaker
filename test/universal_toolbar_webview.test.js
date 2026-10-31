'use strict';

const assert = require('assert');
const vm = require('vm');
const Module = require('module');
const { SLOTS, SPECIALIST_ACTION_IDS } = require('../src/viewer_toolbar_contract');
const { adapt } = require('../src/universal_toolbar_adapter');
const {
  MESSAGE_TYPE, validateToolbarModel, universalToolbarStyle, renderUniversalToolbar,
  universalToolbarClientScript, createUniversalToolbarDispatcher
} = require('../src/universal_toolbar_webview');

function model(surfaceId = 'code.authoring-workspace', enabled = ['open']) {
  const capabilities = {};
  for (const id of enabled) capabilities[id] = { enabled: true, dispatch: `host.${id}`, routeKind: id === 'connected-resources' ? 'connected-resources' : undefined };
  return adapt(surfaceId, capabilities);
}

const toolbar = model();
assert.strictEqual(validateToolbarModel(toolbar), toolbar);
const html = renderUniversalToolbar(toolbar);
assert.strictEqual((html.match(/data-universal-slot=/g) || []).length, SLOTS.length);
assert.match(html, /data-universal-slot="restart"/, 'restart sits in the canonical toolbar on every surface');
assert.match(html, /data-universal-slot="updates"/, 'one combined update icon sits in the canonical toolbar on every surface');
assert.deepStrictEqual([...html.matchAll(/data-universal-slot="([^"]+)"/g)].map((match) => match[1]), SLOTS.map((slot) => slot.id));
assert.strictEqual((html.match(/role="group"/g) || []).length, 4, 'canonical slots wrap only as whole groups');
assert.match(html, /aria-label="Open"/); assert.match(html, /aria-description="New is not available/);
assert.doesNotMatch(html, /host\.open|snd\.element|data-command|data-dispatch/, 'host dispatch identities and specialist controls never enter markup');
const css = universalToolbarStyle();
assert.match(css, /flex-wrap:wrap/); assert.match(css, /overflow-x:hidden/); assert.match(css, /width:27px/); assert.match(css, /height:27px/); assert.match(css, /:focus-visible/);
assert(css.split('}').filter(Boolean).every((rule) => rule.includes('.ikemaker-universal-toolbar')), 'every CSS rule is scoped to universal chrome');

const sent = [], button = { disabled: false, dataset: { universalSlot: 'open' } }, root = {
  contains: () => true, addEventListener(type, listener) { this.listener = listener; }
},testDocument={querySelector:()=>root,addEventListener(type,listener){this.listener=listener;}};
vm.runInNewContext(universalToolbarClientScript(), {
  document:testDocument, acquireVsCodeApi: () => ({ postMessage: (message) => sent.push(message) })
});
root.listener({ target: { closest: () => button } });
assert.strictEqual(JSON.stringify(sent), JSON.stringify([{ type: MESSAGE_TYPE, slotId: 'open' }]));
assert.deepStrictEqual(Object.keys(sent[0]).sort(), ['slotId', 'type'], 'client sends only the allowlisted envelope');
button.disabled = true; root.listener({ target: { closest: () => button } }); assert.strictEqual(sent.length, 1);
testDocument.listener({target:{closest:()=>({disabled:false,dataset:{ikemakerBodyMessage:'organize-cards'}})}});
assert.strictEqual(JSON.stringify(sent.at(-1)),JSON.stringify({type:'organize-cards'}),'declarative body controls send only a bounded opaque message type for host validation');
const sharedClient = universalToolbarClientScript({ vscodeVariable: 'vscode' });
assert(!sharedClient.includes('acquireVsCodeApi()'), 'composed webviews can share their single existing VS Code API acquisition');
assert(sharedClient.includes('const bridge=vscode;'));
assert(sharedClient.includes("addEventListener('contextmenu'"), 'destination icons expose alternate placement on right click');
assert(sharedClient.includes('Open side by side') && sharedClient.includes('Open in new window'));
assert(!sharedClient.includes('Open as tab'), 'normal open/focus remains exclusive to the ordinary left click');
assert(sharedClient.includes("slot==='updates'") && sharedClient.includes('configure:true'), 'right click and keyboard context access route Updates to its settings chooser');
assert(sharedClient.includes("setAttribute('role','menuitem')"), 'alternate-placement choices expose menu semantics');
assert(sharedClient.includes("['ArrowDown','ArrowUp','Home','End']"), 'alternate-placement choices support predictable keyboard navigation');
assert(sharedClient.includes('closeContext(true)') && sharedClient.includes('trigger.focus()'), 'Escape closes alternate placement and restores focus to its toolbar icon');
assert(sharedClient.includes('rect?.left') && sharedClient.includes('rect?.bottom'), 'keyboard-opened placement menus anchor to their toolbar icon without invalid coordinates');

(async () => {
  const calls = [], obtained = [];
  const dispatcher = createUniversalToolbarDispatcher({
    handlersBySurface: { 'code.authoring-workspace': {
      open: async (intent) => { calls.push(['start', intent]); await new Promise((resolve) => setImmediate(resolve)); calls.push(['end', intent.slotId]); return 'opened'; },
      save: async (intent) => { calls.push(['save', intent.slotId]); return 'saved'; }
    } },
    getToolbar: async (surfaceId) => { obtained.push(surfaceId); return model(surfaceId, ['open', 'save']); }
  });
  const first = dispatcher.dispatch('code.authoring-workspace', { type: MESSAGE_TYPE, slotId: 'open' });
  const second = dispatcher.dispatch('code.authoring-workspace', { type: MESSAGE_TYPE, slotId: 'save' });
  assert.deepStrictEqual(await Promise.all([first, second]), ['opened', 'saved']);
  assert.deepStrictEqual(calls.map((call) => call[0]), ['start', 'end', 'save'], 'dispatch is serialized');
  assert.deepStrictEqual(obtained, ['code.authoring-workspace', 'code.authoring-workspace'], 'canonical toolbar is fetched freshly for every dispatch');
  assert.deepStrictEqual(calls[0][1], { surfaceId: 'code.authoring-workspace', slotId: 'open', actionId: 'universal.open' });

  const updateCommands = [], originalLoad = Module._load;
  Module._load = function patched(request, parent, main) { if (request === 'vscode') return { commands: { executeCommand: async (...args) => updateCommands.push(args) } }; return originalLoad.call(this, request, parent, main); };
  try {
    const updateDispatcher = createUniversalToolbarDispatcher({ handlersBySurface: { 'code.authoring-workspace': {} }, getToolbar: async () => model('code.authoring-workspace', ['updates']) });
    await updateDispatcher.dispatch('code.authoring-workspace', { type: MESSAGE_TYPE, slotId: 'updates' });
    await updateDispatcher.dispatch('code.authoring-workspace', { type: MESSAGE_TYPE, slotId: 'updates', configure: true });
    assert.deepStrictEqual(updateCommands.map((entry) => entry[0]), ['ikemen.updates.checkAll', 'ikemen.updates.configureFrequency']);
  } finally { Module._load = originalLoad; }

  const reject = async (surfaceId, message, pattern) => assert.rejects(() => dispatcher.dispatch(surfaceId, message), pattern);
  await reject('missing', { type: MESSAGE_TYPE, slotId: 'open' }, /Unregistered/);
  await reject('code.authoring-workspace', { type: 'other', slotId: 'open' }, /Unknown.*message type/);
  await reject('code.authoring-workspace', { type: MESSAGE_TYPE, slotId: 'nope' }, /Unknown or specialist/);
  await reject('code.authoring-workspace', { type: MESSAGE_TYPE, slotId: SPECIALIST_ACTION_IDS[0] }, /Unknown or specialist/);
  await reject('code.authoring-workspace', { type: MESSAGE_TYPE, slotId: 'open', command: 'forged' }, /forged or extra/);
  await reject('code.authoring-workspace', { type: MESSAGE_TYPE, slotId: 'open', surfaceId: 'air.viewer' }, /forged or extra/);

  const disabled = createUniversalToolbarDispatcher({ handlersBySurface: { 'code.authoring-workspace': { open() {} } }, getToolbar: async () => model('code.authoring-workspace', []) });
  await assert.rejects(() => disabled.dispatch('code.authoring-workspace', { type: MESSAGE_TYPE, slotId: 'open' }), /not available/);
  const mismatch = createUniversalToolbarDispatcher({ handlersBySurface: { 'code.authoring-workspace': { open() {} } }, getToolbar: async () => model('air.viewer', ['open']) });
  await assert.rejects(() => mismatch.dispatch('code.authoring-workspace', { type: MESSAGE_TYPE, slotId: 'open' }), /surface does not match/);
  const unhandled = createUniversalToolbarDispatcher({ handlersBySurface: { 'code.authoring-workspace': {} }, getToolbar: async () => model('code.authoring-workspace', ['open']) });
  await assert.rejects(() => unhandled.dispatch('code.authoring-workspace', { type: MESSAGE_TYPE, slotId: 'open' }), /No closed universal handler/);
  assert.throws(() => createUniversalToolbarDispatcher({ handlersBySurface: { 'code.authoring-workspace': { [SPECIALIST_ACTION_IDS[0]]() {} } } }), /non-universal/);
  console.log('Universal toolbar webview rendering, scoped layout, narrow client protocol and fail-closed serialized host dispatch passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
