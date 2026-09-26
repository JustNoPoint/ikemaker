'use strict';

const path = require('path');
const vscode = require('vscode');
const { inspectImages, batchSummary } = require('./palette_import_assistant');
const { launchControlsHtml, launchControlsClientScript, handleLaunchMessage } = require('./launch_controls');
const { preferredViewerColumn, trackViewerPanel } = require('./viewer_group');

function cohesive(page) { return page.replace('</header>', `${launchControlsHtml('palette_import')}</header>`).replace('</script></body>', `${launchControlsClientScript()}</script></body>`); }

function safe(value) { return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026'); }
function html(model) { return `<!doctype html><html><head><meta charset="utf-8"><style>
:root{color-scheme:light dark}body{font:13px var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);margin:0}header{display:flex;gap:8px;align-items:center;padding:10px 14px;border-bottom:1px solid var(--vscode-panel-border)}main{padding:14px;max-width:1100px}button{font:inherit;padding:7px 10px;color:var(--vscode-button-foreground);background:var(--vscode-button-background);border:0;cursor:pointer}.summary,.card{padding:12px;margin:10px 0;border:1px solid var(--vscode-panel-border);border-radius:5px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:9px}.ready{border-left:5px solid #49d17d}.review{border-left:5px solid #dfb64b}.conversion-required,.error{border-left:5px solid #e45b5b}.muted{color:var(--vscode-descriptionForeground)}code{background:var(--vscode-textCodeBlock-background);padding:2px 4px}</style></head><body><header><b>Sprite & Palette Import Assistant</b><button id="choose">Choose PNG sprites…</button><button id="sff">Open SFF Workspace…</button></header><main><p>This preflight protects source colors before an SFF import. It never quantizes, remaps, or overwrites an image automatically.</p><div id="body"></div></main><script>
const vscode=acquireVsCodeApi();let model=${safe(model)};const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function render(){const b=document.getElementById('body');if(!model.items.length){b.innerHTML='<div class="summary">Choose one or more PNG sprites to check palette compatibility.</div>';return}const s=model.summary;b.innerHTML='<div class="summary"><b>'+esc(s.title)+'</b><br>'+esc(s.detail)+'</div><div class="grid">'+model.items.map(x=>'<article class="card '+esc(x.state)+'"><b>'+esc(x.name)+'</b><br>'+x.width+' × '+x.height+' · '+(x.indexed?'indexed':'truecolor')+(x.indexed?' · '+x.paletteSize+' palette entries':'')+'<br><span class="muted">'+esc(x.detail)+'</span></article>').join('')+'</div>'+(s.safeToStage?'<p><b>Ready:</b> these files share one indexed palette and transparency index 0. Open the SFF workspace and use its reviewed manifest/import tools.</p>':'<p><b>Review required:</b> correct the listed source images first. The assistant will not silently damage color separation.</p>')}
document.getElementById('choose').onclick=()=>vscode.postMessage({type:'choose'});document.getElementById('sff').onclick=()=>vscode.postMessage({type:'sff'});addEventListener('message',e=>{if(e.data.type==='model'){model=e.data.model;render()}});render();
</script></body></html>`; }

async function choose(owner) {
  const files = await vscode.window.showOpenDialog({ title: 'Choose PNG sprites to preflight', filters: { 'PNG sprites': ['png'] }, canSelectMany: true, canSelectFiles: true, canSelectFolders: false });
  if (!files?.length || owner.disposed) return;
  const items = inspectImages(files.map((item) => item.fsPath));
  if (!owner.disposed) owner.panel.webview.postMessage({ type: 'model', model: { items, summary: batchSummary(items) } });
}
function openPaletteImportWorkspace(uri) {
  const seed = uri?.fsPath || vscode.window.activeTextEditor?.document?.fileName || '';
  const model = { items: [], summary: batchSummary([]) };
  const panel = trackViewerPanel(vscode.window.createWebviewPanel('ikemenPaletteImportAssistant', 'Sprite & Palette Import Assistant', preferredViewerColumn(vscode.ViewColumn.Active), { enableScripts: true, retainContextWhenHidden: true }));
  const owner = { panel, disposed: false, busy: 0 };
  panel.webview.html = require('./webview_policy').protect(cohesive(html(model)), panel.webview.cspSource);
  require('./viewer_close').support(panel, { isBusy: () => owner.busy > 0 });
  panel.webview.onDidReceiveMessage((message) => { owner.busy++; Promise.resolve().then(async () => {
    if (owner.disposed) return;
    if (await handleLaunchMessage(message, seed, 'palette', panel)) return;
    if (message.type === 'choose') return choose(owner);
    if (message.type === 'sff') return vscode.commands.executeCommand('sff.openViewer');
  }).catch((error) => vscode.window.showErrorMessage(`Palette import preflight: ${error.message}`)).finally(() => owner.busy--); });
  panel.onDidDispose(() => { owner.disposed = true; });
  return panel;
}
function registerPaletteImportWorkspace(context) { context.subscriptions.push(vscode.commands.registerCommand('ikemen.paletteImport.open', openPaletteImportWorkspace)); }

module.exports = { registerPaletteImportWorkspace, openPaletteImportWorkspace, html };
