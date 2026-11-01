'use strict';

function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[character]); }

function entityUnavailableHtml(input = {}) {
  const label = String(input.label || 'Selected entity').slice(0,256), reason = String(input.reason || 'This viewer has no applicable resource for the selected entity.').slice(0,2048), header = require('./entity_header');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${header.style()}:root{color-scheme:light dark}*{box-sizing:border-box}body{margin:0;color:var(--vscode-foreground);background:var(--vscode-editor-background);font:13px var(--vscode-font-family)}main{min-height:220px;display:grid;place-items:center;padding:24px}.empty{max-width:620px;border:1px solid var(--vscode-panel-border);background:var(--vscode-sideBar-background);padding:18px}.empty h2{margin-top:0}.empty p{color:var(--vscode-descriptionForeground)}</style></head><body><header>${header.html()}</header><main><section class="empty" role="status" aria-live="polite"><h2>${escapeHtml(label)}</h2><p>${escapeHtml(reason)}</p><p>The prior entity’s navigation and drafts remain retained. Choose an applicable entity to restore this viewer.</p></section></main><script>const vscode=acquireVsCodeApi();globalThis.ikemenCanLeaveAsset=()=>true;globalThis.ikemenCanRestoreNavigation=()=>false;${header.clientScript({vscodeVariable:'vscode'})}</script></body></html>`;
}

module.exports = { entityUnavailableHtml };
