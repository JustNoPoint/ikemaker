'use strict';

const assert = require('assert');
const { SLOTS } = require('../src/viewer_toolbar_contract');
const { registerShaderWorkshop, resetShaderWorkshopForTests, exactMessage, sourceOptions, renderWorkshopOwner } = require('../src/shader_workshop_host');
const { createShaderWorkshopSession } = require('../src/shader_workshop_workspace');
const { resetViewerGroupForTests } = require('../src/viewer_group');

function panel() {
  const receive = [], dispose = [];
  return {
    active: true, viewColumn: 2, title: '', disposed: false, reveals: [],
    webview: {
      cspSource: 'vscode-webview://shader-test', html: '', sent: [],
      onDidReceiveMessage(handler) { receive.push(handler); return { dispose() {} }; },
      postMessage(message) { this.sent.push(message); return Promise.resolve(true); }
    },
    onDidChangeViewState() { return { dispose() {} }; },
    onDidDispose(handler) { dispose.push(handler); return { dispose() {} }; },
    reveal(column, preserveFocus) { this.reveals.push([column, preserveFocus]); },
    dispose() { if (this.disposed) return; this.disposed = true; for (const handler of dispose) handler(); },
    receive(message) { return Promise.all(receive.map(handler => handler(message))); }
  };
}

resetViewerGroupForTests();
resetShaderWorkshopForTests();
let handler = null, created = 0;
const made = [];
const vscode = {
  ViewColumn: { Beside: -2 },
  workspace: { textDocuments: [] },
  commands: {
    registerCommand(command, callback) { assert.strictEqual(command, 'ikemen.shader.openWorkshop'); handler = callback; return { dispose() {} }; },
    executeCommand() { return Promise.resolve(); }
  },
  window: {
    createWebviewPanel(type, title, column, options) {
      created += 1; assert.strictEqual(type, 'ikemenShaderWorkshop'); assert.strictEqual(column, -2);
      assert.deepStrictEqual(options.localResourceRoots, []); const value = panel(); made.push(value); return value;
    },
    showErrorMessage(error) { throw new Error(error); }
  }
};
registerShaderWorkshop({ subscriptions: [] }, vscode);
(async () => {
  const first = await handler(), second = await handler();
  assert.strictEqual(first, second); assert.strictEqual(created, 1, 'the workshop is one reusable viewer-group tab');
  const html = first.webview.html;
  assert.strictEqual((html.match(/data-universal-slot=/g) || []).length, SLOTS.length, 'all canonical toolbar slots stay in fixed positions');
  assert.strictEqual((html.match(/acquireVsCodeApi\(\)/g) || []).length, 1, 'the protected page owns one VS Code bridge');
  assert(html.includes("connect-src 'none'") && !html.includes("style-src 'unsafe-inline'"), 'shared webview policy owns CSP');
  assert(html.includes('Preserve palette colors') && html.includes('Preserve transparent pixels'));
  assert(!html.includes('Apply shader') && !html.includes('Save shader'), 'the offline workshop exposes no apply/write claim');
  assert.strictEqual(exactMessage({ type: 'request-preview-frame', generation: 1, frame: 0 }, ['type', 'generation', 'frame']), true);
  assert.strictEqual(exactMessage({ type: 'request-preview-frame', generation: 1, frame: 0, path: 'forged.sff' }, ['type', 'generation', 'frame']), false);
  assert.deepStrictEqual(sourceOptions({ kind: 'sff', sffPath: 'C:\\trusted.sff', selection: { physicalIndex: 0 } }), { kind: 'sff', sffPath: 'C:\\trusted.sff', selection: { physicalIndex: 0 }, paletteOverride: null });
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', designSession = createShaderWorkshopSession();
  designSession.setPreview({ sourceKind: 'air', frames: [{ dataUri: png }, { dataUri: png }, { dataUri: png }] });
  const designPanel = panel(), designOwner = { panel: designPanel, session: designSession, contract: null };
  const send = value => designSession.handleMessage({ ...value, generation: designSession.snapshot().generation });
  send({ type: 'select-preset', presetId: 'outline' }); assert.doesNotThrow(() => renderWorkshopOwner(designOwner)); assert(designPanel.webview.html.includes('Unknown or untrusted shader effect'));
  send({ type: 'set-mode', mode: 'graph' }); assert.doesNotThrow(() => renderWorkshopOwner(designOwner)); assert(designPanel.webview.html.includes('Only trusted preset effects'));
  send({ type: 'set-mode', mode: 'preset' }); send({ type: 'select-preset', presetId: 'palette-tint' }); assert.doesNotThrow(() => renderWorkshopOwner(designOwner)); assert(designPanel.webview.html.includes('Palette Tint is blocked by'));
  assert(designPanel.webview.html.includes('id="previewImage"'), 'valid blocked/design-only states retain their decoded fallback preview');
  first.dispose(); await handler(); assert.strictEqual(created, 2, 'disposing clears the singleton owner');
  resetShaderWorkshopForTests(); resetViewerGroupForTests();
  console.log('Shader Workshop host reuses one protected shared-viewer panel with closed toolbar and preview routes');
})().catch(error => { console.error(error); process.exitCode = 1; });
