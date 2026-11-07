'use strict';
const path = require('path');
const model = require('./stage_png_layers');
function client(document, vscode, initial, coverageFor) {
  const rows = initial.map(row => ({ ...row, layerno: 0 }));
  const list = document.getElementById('layers'), canvas = document.getElementById('preview'), ctx = canvas.getContext('2d'), status = document.getElementById('status'), create = document.getElementById('create');
  const images = new Map(); let pending = false;
  const width = document.getElementById('width'), height = document.getElementById('height');
  width.value = rows[0].width; height.value = rows[0].height;
  function draw() {
    const w = Math.max(1, Math.min(16384, Number(width.value) || 320)), h = Math.max(1, Math.min(16384, Number(height.value) || 240)), scale = Math.min(1, 1600 / w, 1000 / h);
    const coverage = coverageFor(rows, [w, h]);
    document.getElementById('coverage').textContent = `Camera: X ${coverage.left} to ${coverage.right}; vertical travel locked for top-aligned art. ${coverage.missing || 'Opaque backdrop covers the full camera travel.'} Change Camera / Stage properties in the saved Stage Workspace to override.`;
    canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    for (const layerno of [0, 1]) {
      if (layerno === 1) { ctx.fillStyle = '#fff8'; ctx.fillRect(w * .35, h * .55, 15, h * .35); ctx.fillRect(w * .65, h * .55, 15, h * .35); }
      for (const row of rows.filter(row => row.layerno === layerno)) { const image = images.get(row.id); if (image?.complete) ctx.drawImage(image, 0, 0); }
    }
  }
  function render() {
    list.replaceChildren();
    rows.forEach((row, index) => {
      const line = document.createElement('li'), label = document.createElement('span'), up = document.createElement('button'), down = document.createElement('button'), placement = document.createElement('select');
      label.textContent = `${index + 1}. ${row.name} (${row.width} × ${row.height})`; up.textContent = '↑'; down.textContent = '↓';
      up.setAttribute('aria-label', `Move ${row.name} earlier`); down.setAttribute('aria-label', `Move ${row.name} later`); up.disabled = index === 0 || pending; down.disabled = index === rows.length - 1 || pending;
      for (const [value, text] of [[0, 'Behind fighters'], [1, 'In front of fighters']]) { const option = document.createElement('option'); option.value = String(value); option.textContent = text; placement.append(option); }
      placement.value = String(row.layerno); placement.disabled = pending; placement.setAttribute('aria-label', `${row.name} fighter placement`);
      placement.onchange = () => { row.layerno = Number(placement.value); draw(); };
      up.onclick = () => { [rows[index - 1], rows[index]] = [rows[index], rows[index - 1]]; render(); };
      down.onclick = () => { [rows[index + 1], rows[index]] = [rows[index], rows[index + 1]]; render(); };
      line.append(label, up, down, placement); list.append(line);
    }); draw();
  }
  for (const row of rows) { const image = document.createElement('img'); image.onload = draw; image.src = row.image; images.set(row.id, image); }
  width.onchange = draw; height.onchange = draw;
  create.onclick = () => { if (pending) return; pending = true; create.disabled = true; status.textContent = 'Preparing exact files for review…'; render(); vscode.postMessage({ type: 'createPngStage', rows: rows.map(({ id, layerno }) => ({ id, layerno })), localCoord: [Number(width.value), Number(height.value)] }); };
  document.getElementById('cancel').onclick = () => vscode.postMessage({ type: 'cancelPngStage' });
  window.addEventListener('message', event => { if (event.data?.type !== 'pngStageResult') return; pending = false; create.disabled = Boolean(event.data.created); status.textContent = event.data.message; render(); });
  render();
}
function html(snapshots, webview) {
  const input = snapshots.map(row => ({ id: row.id, name: path.basename(row.filename), width: row.width, height: row.height, opaque: row.opaque, image: `data:image/png;base64,${row.bytes.toString('base64')}` }));
  const page = `<!doctype html><html><head><meta charset="utf-8"><style>body{font:var(--vscode-font-size) var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);padding:0}.png-stage-body{padding:16px}.png-stage-body button,.png-stage-body select,.png-stage-body input{font:inherit;margin:4px;padding:5px;background:var(--vscode-input-background);color:inherit;border:1px solid var(--vscode-input-border)}.png-stage-body li{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:6px 0}.png-stage-body li span{flex:1;min-width:160px}.png-stage-body canvas{max-width:100%;max-height:45vh;object-fit:contain;background:repeating-conic-gradient(#8883 0% 25%,#5553 0% 50%) 0/16px 16px;border:1px solid #888}.png-stage-body input{width:90px}#status{white-space:pre-wrap}</style></head><body><h1>Create Stage from PNG layers</h1><p>Order: back to front within each fighter plane. Images share the canvas top-left; smaller images keep their original size. No scaling, cropping or color conversion. White silhouettes only illustrate fighter depth.</p><label>Canvas width <input id="width" type="number" min="1" max="16384"></label><label>height <input id="height" type="number" min="1" max="16384"></label><ol id="layers"></ol><p id="coverage" role="status"></p><canvas id="preview" aria-label="Ordered layer composition preview"></canvas><p>Creates a new connected DEF + SFF 2.1 and PNG hash receipt. Existing files are never replaced. Review the exact destination before writing.</p><button id="create">Review & create Stage…</button><button id="cancel">Cancel</button><p id="status" role="status"></p><script>(${client.toString()})(document,acquireVsCodeApi(),${JSON.stringify(input).replace(/</g, '\\u003c')},(${model.coverageFor.toString()}));</script></body></html>`;
  const shared = require('./shared_workspace_header'), toolbar = require('./standalone_review_header').model('stage.png-creation');
  const withHeader = page.replace('<body>', '<body>' + shared.html('png_stage', toolbar) + '<main class="png-stage-body">').replace('</body>', '</main></body>').replace('<script>', '<script>const vscode=acquireVsCodeApi();' + shared.clientScript('vscode')).replace(')(document,acquireVsCodeApi(),', ')(document,vscode,');
  return require('./webview_policy').protect(withHeader, webview?.cspSource);
}
async function openPngStage(api, options = {}) {
  const selected = await api.window.showOpenDialog({ title: 'Choose PNG Stage layers (reorder next)', canSelectMany: true, canSelectFiles: true, canSelectFolders: false, filters: { PNG: ['png'] } });
  if (!selected?.length) return { cancelled: true };
  let snapshots;
  try { snapshots = model.captureLayers(selected.map(uri => uri.fsPath)); } catch (error) { await api.window.showErrorMessage(error.message); return { error: error.message }; }
  const { preferredViewerColumn, trackViewerPanel } = require('./viewer_group');
  const panel = trackViewerPanel(api.window.createWebviewPanel('ikemen.pngStageCreation', 'PNG layers → Stage', preferredViewerColumn(api.ViewColumn.Active), { enableScripts: true, retainContextWhenHidden: true }));
  require('./shared_workspace_header').attachObserver(panel, 'stage.png-creation');
  panel.webview.html = html(snapshots, panel.webview); let busy = false, completed = false, disposed = false;
  require('./viewer_close').support(panel, { isBusy: () => busy });
  panel.onDidDispose(() => { disposed = true; });
  panel.webview.onDidReceiveMessage(async message => {
    if (disposed || !message || typeof message !== 'object') return;
    if (require('./standalone_review_header').isMessage(message)) return require('./standalone_review_header').handle(message, undefined, panel);
    if (busy || completed) return;
    if (message.type === 'cancelPngStage' && Object.keys(message).length === 1) { panel.dispose(); return; }
    if (message.type !== 'createPngStage' || Object.keys(message).sort().join(',') !== 'localCoord,rows,type') return;
    busy = true;
    try {
      // Validate before opening a dialog. A webview cannot supply any path.
      model.arrangement(snapshots, message.rows);
      require('./authoring_creation_plan').normalizeLocalCoord(message.localCoord);
      const target = await api.window.showSaveDialog({ title: 'New PNG Stage DEF', defaultUri: options.defaultUri, filters: { 'Stage DEF': ['def'] } });
      if (!target || disposed) { if (!disposed) await panel.webview.postMessage({ type: 'pngStageResult', message: 'Destination cancelled; no files created.' }); return; }
      const plan = model.buildPlan(target.fsPath, snapshots, message.rows, { localCoord: message.localCoord, author: options.author || '' });
      const detail = [...plan.files.map(row => row.filename), '', `Canvas: ${plan.localCoord.join(' × ')}`, `Camera X: ${plan.receipt.coverage.left} to ${plan.receipt.coverage.right}; Y locked at 0`, plan.receipt.coverage.missing || 'Opaque backdrop covers camera travel. Override in saved Stage Camera settings.', ...plan.receipt.layers.map(row => `${row.order + 1}. ${path.basename(row.input)} → 0,${row.order} (${row.layerno ? 'in front of' : 'behind'} fighters)`), '', 'All three files are new. Any write failure rolls back the output set. PNG source bytes must still match this review.'].join('\n');
      const answer = await api.window.showInformationMessage('Create this ordered PNG Stage?', { modal: true, detail }, 'Create Stage');
      if (answer !== 'Create Stage' || disposed) { if (!disposed) await panel.webview.postMessage({ type: 'pngStageResult', message: 'Review cancelled; no files created.' }); return; }
      const dirty = api.workspace.textDocuments?.find(document => document.isDirty && plan.files.some(row => path.resolve(document.fileName).toLowerCase() === row.filename.toLowerCase()));
      if (dirty) throw Error('An output has an unsaved editor. Choose a different destination.');
      model.writePlan(plan); completed = true;
      await panel.webview.postMessage({ type: 'pngStageResult', created: true, message: `Created ${target.fsPath}` });
      try { const opened = await (options.openStage || require('./stage_workspace').openStageWorkspace)(target); if (!opened) throw Error('Stage Workspace did not open.'); panel.dispose(); }
      catch (error) { await api.window.showWarningMessage(`Stage files are saved. Open this exact DEF to continue: ${target.fsPath}. ${error.message}`); }
    } catch (error) { if (!disposed) await panel.webview.postMessage({ type: 'pngStageResult', message: `PNG Stage creation: ${error.message}` }); }
    finally { busy = false; }
  });
  return panel;
}
module.exports = { client, html, openPngStage };
