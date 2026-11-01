'use strict';

const assert = require('assert');
const workspace = require('../src/code_structure_workspace');
const { insertControllerOption } = workspace;
const { flatten } = require('../src/code_structure_model');
const { referenceFor } = require('../src/code_structure_navigation');

class Range {
  constructor(startLine, startCharacter, endLine, endCharacter) {
    this.start = { line: startLine, character: startCharacter };
    this.end = { line: endLine, character: endCharacter };
  }
}

class WorkspaceEdit {
  constructor() { this.insertions = []; }
  insert(uri, position, text) { this.insertions.push({ uri, position, text }); }
}

function positionAt(text, offset) {
  const before = text.slice(0, offset), lines = before.split('\n');
  return { line: lines.length - 1, character: lines[lines.length - 1].replace(/\r$/, '').length };
}

function fixture() {
  let text = '[StateDef 200]\r\nhitDef{\r\n\tattr: S, NA;\r\n\tdamage: 30, 0;\n}\r\n';
  const edits = [], messages = [], statuses = [];
  const document = {
    languageId: 'zss', fileName: 'safe.zss', uri: { toString: () => 'file:///safe.zss' }, version: 7,
    get lineCount() { return text.split(/\r?\n/).length; },
    getText() { return text; },
    lineAt(line) { const value = text.split(/\r?\n/)[line] || ''; return { text: value, range: { start: { line, character: 0 }, end: { line, character: value.length } } }; },
    positionAt(offset) { return positionAt(text, offset); }
  };
  const session = { document, panel: { webview: { postMessage: (message) => statuses.push(message) } } };
  const vscode = {
    Range, WorkspaceEdit,
    workspace: { applyEdit: async (edit) => { edits.push(edit); return true; } },
    window: {
      showInputBox: async () => 'MA',
      showInformationMessage: async (message, options, action) => { messages.push({ message, options, action }); return options?.modal ? 'Apply Option' : undefined; },
      showWarningMessage: async (message) => { messages.push({ message }); }
    }
  };
  return { vscode, session, document, edits, messages, statuses, mutate(nextText = `${text}# external change\r\n`) { text = nextText; document.version += 1; } };
}

const requestFor = test => ({ reference:referenceFor(flatten(workspace.clientModel(test.document)).find(item=>item.kind==='controller')), parameterName:'guardflag' });

(async () => {
  let test = fixture();
  await insertControllerOption(test.vscode, test.session, requestFor(test));
  assert.strictEqual(test.edits.length, 1, 'a reviewed unchanged source receives one WorkspaceEdit');
  assert.strictEqual(test.edits[0].insertions.length, 1, 'the canonical owner inserts exactly one byte range');
  assert.strictEqual(test.edits[0].insertions[0].text, '\tguardflag: MA;\n', 'the real host action uses the source-local line ending');
  assert(test.messages.some((item) => item.options?.modal && /Only this insertion/.test(item.options.detail)), 'the native modal explicitly previews the bounded mutation');
  assert(test.statuses.some((item) => item.type === 'sourceEditStatus'));

  test = fixture();
  test.vscode.window.showInputBox = async () => { test.mutate(); return 'MA'; };
  await insertControllerOption(test.vscode, test.session, requestFor(test));
  assert.strictEqual(test.edits.length, 0, 'a source change while entering the value blocks Apply');
  assert(test.messages.some((item) => /changed while this option was being drafted/.test(item.message)));

  test = fixture();
  test.vscode.window.showInformationMessage = async (message, options) => {
    test.messages.push({ message, options });
    if (options?.modal) { test.mutate(); return 'Apply Option'; }
    return undefined;
  };
  await insertControllerOption(test.vscode, test.session, requestFor(test));
  assert.strictEqual(test.edits.length, 0, 'a source change after preview confirmation blocks Apply');
  assert(test.messages.some((item) => /changed after the preview/.test(item.message)));

  test = fixture();
  test.vscode.window.showInputBox = async () => { test.session.document = { ...test.document, uri: { toString: () => 'file:///other.zss' } }; return 'MA'; };
  await insertControllerOption(test.vscode, test.session, requestFor(test));
  assert.strictEqual(test.edits.length, 0, 'rebinding the shared panel to another URI blocks the old insertion');

  console.log('Code Structure option preview and stale-source host tests passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
