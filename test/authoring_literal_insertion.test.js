'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { insertReviewedLiteral } = require('../src/authoring_literal_insertion');

class WorkspaceEdit { constructor() { this.insertions = []; } insert(uri, position, text) { this.insertions.push({ uri, position, text }); } }
function fixture() {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-adapt-')), source = path.join(folder, 'source.zss'), owner = path.join(folder, 'char.def');
  fs.writeFileSync(source, 'source bytes'); fs.writeFileSync(owner, 'owner bytes');
  let text = 'destination', version = 3, offset = 4, applied = 0, previewHook;
  const document = { fileName: path.join(folder, 'destination.zss'), languageId: 'zss', uri: { toString: () => 'file:///destination.zss' }, get version() { return version; }, getText: () => text, offsetAt: () => offset, positionAt: value => ({ line: 0, character: value }) };
  const editor = { document, selection: { isEmpty: true, active: { line: 0, character: offset } } };
  const messages = [], vscode = { WorkspaceEdit, workspace: { textDocuments: [], applyEdit: async edit => { applied += 1; vscode.lastEdit = edit; return true; } }, window: { activeTextEditor: editor, showInformationMessage: async (message, options) => { messages.push({ message, options }); if (options?.modal) { if (previewHook) previewHook(); return 'Insert Adapted Example'; } } } };
  const entry = { kind: 'personalExampleAdaptation', label: 'Safe block', literalText: 'call SharedCommit(1);\nchangeState{value: 200}\r\n',dependencySummary:'functions: SharedCommit · states: 200',sourceLabel:'source.zss',sourceScope:'shared',sourceLanguage:'zss', sourceGuards: [{ filename: source, text: 'source bytes' }, { filename: owner, text: 'owner bytes' }], sourceScopeValid: () => true, destinationGuard: { uri: document.uri.toString(), version, text, offset } };
  return { folder, source, owner, vscode, entry, messages, applied: () => applied, changeDestination() { text += '!'; version += 1; }, changeSource() { fs.writeFileSync(source, 'changed'); }, afterPreview(fn) { previewHook = fn; } };
}

(async () => {
  let test = fixture();
  try {
    await insertReviewedLiteral(test.vscode, test.entry);
    assert.strictEqual(test.applied(), 1); assert.strictEqual(test.vscode.lastEdit.insertions[0].text, test.entry.literalText, 'literal custom syntax and CRLF bytes are not interpreted as snippet placeholders');
    assert(test.messages.some(item => item.options?.modal && /Explicitly linked shared source · source\.zss · ZSS/.test(item.options.detail)&&/functions: SharedCommit · states: 200/.test(item.options.detail)&&/not imported automatically/.test(item.options.detail)));
  } finally { fs.rmSync(test.folder, { recursive: true, force: true }); }

  test = fixture();
  try { test.changeSource(); await insertReviewedLiteral(test.vscode, test.entry); assert.strictEqual(test.applied(), 0, 'changed example source blocks preview and insertion'); }
  finally { fs.rmSync(test.folder, { recursive: true, force: true }); }

  test = fixture();
  try { test.afterPreview(() => test.changeDestination()); await insertReviewedLiteral(test.vscode, test.entry); assert.strictEqual(test.applied(), 0, 'changed destination after preview blocks insertion'); }
  finally { fs.rmSync(test.folder, { recursive: true, force: true }); }

  test = fixture();
  try { test.afterPreview(() => test.changeSource()); await insertReviewedLiteral(test.vscode, test.entry); assert.strictEqual(test.applied(), 0, 'changed source after preview blocks insertion'); }
  finally { fs.rmSync(test.folder, { recursive: true, force: true }); }

  test = fixture();
  try { test.afterPreview(() => { test.entry.sourceScopeValid = () => false; }); await insertReviewedLiteral(test.vscode, test.entry); assert.strictEqual(test.applied(), 0, 'an assignment-scope change after preview blocks insertion'); }
  finally { fs.rmSync(test.folder, { recursive: true, force: true }); }
  console.log('Reviewed personal-example literal insertion and stale-source tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
