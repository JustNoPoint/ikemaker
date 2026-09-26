'use strict';

const assert = require('assert');
const Module = require('module');

let receiver = null, warningMode = 'race';
const originalText = '; file heading\r\n[Begin Action 10] ; first\r\n10, 0, 0, 0, 1\r\n; note before next section\r\n[Begin Action 20]\r\n20, 0, 0, 0, 1\r\n[Begin Action 30]\r\n30, 0, 0, 0, 1\r\n; final action note\r\n';
const document = {
  uri: { fsPath: 'C:\\fixture\\Anim.air' }, version: 1, text: originalText,
  getText() { return this.text; },
  positionAt(offset) { return { offset }; }
};
const applied = [];
class WorkspaceEdit {
  constructor() { this.replacements = []; }
  replace(uri, range, text) { this.replacements.push({ uri, range, text }); }
}
class Range {
  constructor(start, end) { this.start = start; this.end = end; }
}
const messages = [];
const vscode = {
  WorkspaceEdit, Range,
  workspace: {
    async openTextDocument() { return document; },
    async applyEdit(edit) {
      applied.push(edit);
      for (const item of [...edit.replacements].sort((a, b) => b.range.start.offset - a.range.start.offset)) document.text = document.text.slice(0, item.range.start.offset) + item.text + document.text.slice(item.range.end.offset);
      document.version += 1;
      return true;
    }
  },
  window: {
    async showWarningMessage() {
      if (warningMode === 'race') {
        document.text += '; concurrent source edit\r\n';
        document.version += 1;
      }
      return 'Delete Animations';
    }
  }
};
const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return vscode;
  return originalLoad.call(this, request, parent, isMain);
};
const { attachMessages } = require('../src/air_viewer');
Module._load = originalLoad;

const session = {
  airPath: document.uri.fsPath,
  byKey: new Map(),
  actionMutationModel(text) { return { title: 'Anim.air', text }; },
  panel: { webview: {
    onDidReceiveMessage(callback) { receiver = callback; return { dispose() {} }; },
    async postMessage(message) { messages.push(message); }
  } }
};
attachMessages(session);
assert(receiver, 'AIR lifecycle host receiver must attach');

(async () => {
  await receiver({ type: 'deleteActions', actions: [10, 30], actionRequestId: 41 });
  assert.strictEqual(applied.length, 0, 'a source change after confirmation must produce zero WorkspaceEdits');
  assert(messages.some((message) => message.type === 'error' && message.actionRequestId === 41), 'a rejected stale request must release its matching client request');

  warningMode = 'success';
  document.text = originalText;
  document.version = 1;
  messages.length = 0;
  await receiver({ type: 'deleteActions', actions: [10, 30], actionRequestId: 42 });
  assert.strictEqual(applied.length, 1, 'one confirmed multi-delete must be grouped into one WorkspaceEdit for Undo');
  const replacements = applied[0].replacements;
  assert.strictEqual(replacements.length, 2, 'each non-contiguous selected action must use its own narrow replacement range');
  assert(replacements.every((item) => item.text === '' && item.range.start.offset < item.range.end.offset), 'delete ranges must be non-empty narrow removals');
  assert(replacements.every((item) => item.range.end.offset - item.range.start.offset < originalText.length), 'multi-delete must not replace the full AIR document');
  assert(document.text.includes('[Begin Action 20]'), 'the unselected action must survive');
  assert(!document.text.includes('[Begin Action 10]') && !document.text.includes('[Begin Action 30]'), 'only selected actions must be removed');
  assert.strictEqual(messages[0].type, 'model', 'the client must receive the post-edit model first');
  assert.deepStrictEqual({ type: messages[1].type, request: messages[1].actionRequestId, action: messages[1].action }, { type: 'actionMutationApplied', request: 42, action: 20 }, 'the completion message must identify the surviving action and exact request');
  console.log('AIR action lifecycle host tests passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
