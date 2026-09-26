'use strict';

const assert = require('assert');
const path = require('path');
const registry = require('../src/authoring_context_registry');

function panel() {
  const disposeHandlers = [], viewHandlers = [];
  return {
    active: false,
    onDidDispose(handler) { disposeHandlers.push(handler); return { dispose() {} }; },
    onDidChangeViewState(handler) { viewHandlers.push(handler); return { dispose() {} }; },
    activate() { this.active = true; for (const handler of viewHandlers) handler({ webviewPanel: this }); },
    dispose() { for (const handler of disposeHandlers) handler(); }
  };
}

const root = path.join('C:', 'game', 'chars', 'Ryu'), visual = panel();
const context = registry.registerAuthoringPanel(visual, { type: 'character', key: root, label: 'Ryu', root, files: [path.join(root, 'Ryu.def')] });
assert.strictEqual(registry.contextOwnsFile(context, path.join(root, 'states', 'normal.zss')), true);
assert.strictEqual(registry.contextOwnsFile(context, path.join('C:', 'game', 'chars', 'Goku', 'G.def')), false);
visual.activate();
assert.strictEqual(registry.currentContext().label, 'Ryu');
const finishClose = registry.beginContextClose(context);
assert.strictEqual(registry.isClosingFile(path.join(root, 'Anim.air')), true);
assert.strictEqual(registry.isClosingFile(path.join('C:', 'game', 'chars', 'Goku', 'Anim.air')), false);
finishClose();
assert.strictEqual(registry.isClosingFile(path.join(root, 'Anim.air')), false);
assert.strictEqual(registry.disposeContextPanels(context), 1);
assert.strictEqual(registry.openContexts().length, 0);

console.log('Authoring context registry tests passed');
