'use strict';

const fs = require('fs');
const path = require('path');
const vscode = require('vscode');
const { parseDef, sections, value, unquote } = require('./def_model');
const { readSff, actRgba, spriteDataUri } = require('./sff_reader');
const { pngPaletteRgba } = require('./palette_library');
const { paletteRole, paletteReplacementPlan, bufferWithPaletteReplacement, reversePaletteRgb } = require('./palette_editor');
const { applyPreset } = require('./palette_selection_operations');
const { stagePalette } = require('./palette_plan');
const { hash, transactionalWrite, optionsFromConfig } = require('./mutation_safety');
const { preferredViewerColumn, trackViewerPanel } = require('./viewer_group');
const { normalizeOrder, REVERSED_ORDER, orderLabel } = require('./act_palette_order');

function escapeName(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function paletteSource(filename) {
  const data = fs.readFileSync(filename), png = /\.png$/i.test(filename);
  const colors = png ? pngPaletteRgba(data) : actRgba(data);
  return { filename: path.resolve(filename), name: path.basename(filename), kind: png ? 'Indexed PNG' : 'ACT', colors };
}

function characterSff(defPath) {
  const document = parseDef(fs.readFileSync(defPath, 'utf8'), defPath), files = sections(document, 'files')[0];
  const reference = unquote(value(files, 'sprite') || value(files, 'sff'));
  if (!reference) throw new Error('The character DEF does not assign a sprite/SFF file.');
  const filename = path.resolve(path.dirname(defPath), reference.replace(/[\\/]/g, path.sep));
  if (!fs.existsSync(filename)) throw new Error(`The assigned SFF was not found: ${filename}`);
  return filename;
}

function representativeSprite(archive) {
  return archive.sprites.find((sprite) => sprite.group === 9000 && sprite.number === 0 && sprite.colorDepth === 8)
    || archive.sprites.find((sprite) => sprite.group === 0 && sprite.number === 0 && sprite.colorDepth === 8)
    || archive.sprites.find((sprite) => sprite.colorDepth === 8)
    || null;
}

function replacementSummary(archive, paletteIndex, source) {
  const plan = paletteReplacementPlan(archive, paletteIndex, source.colors), palette = archive.palettes[paletteIndex];
  return {
    paletteIndex, id: `${palette.group},${palette.number}`, role: paletteRole(palette), changedCount: plan.changedCount,
    affectedSprites: archive.sprites.filter((sprite) => sprite.paletteIndex === paletteIndex).length,
    linkedChildren: archive.palettes.filter((item) => item.dataSize === 0 && item.link === paletteIndex).map((item) => `${item.group},${item.number}`)
  };
}

function playerPaletteConversion(source, options = {}) {
  let colors = options.flipTable ? reversePaletteRgb(source.colors) : source.colors.map((color) => color.slice());
  const preset = String(options.preset || 'none');
  if (preset !== 'none') colors = applyPreset(colors, Array.from({ length: 256 }, (_, index) => index), preset);
  return { ...source, colors, flipTable: Boolean(options.flipTable), preset };
}

function rawPage(model) {
  const safe = (value) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
  return `<!doctype html><html><head><meta charset="utf-8"><style>:root{color-scheme:light dark}*{box-sizing:border-box}body{margin:0;font:13px var(--vscode-font-family);background:var(--vscode-editor-background);color:var(--vscode-foreground)}header{display:flex;gap:8px;align-items:center;padding:10px 14px;border-bottom:1px solid var(--vscode-panel-border)}main{padding:16px;max-width:1050px}.compare{display:grid;grid-template-columns:1fr 1fr;gap:12px}.card{border:1px solid var(--vscode-panel-border);padding:12px;border-radius:5px}.image{height:360px;display:grid;place-items:center;background:repeating-conic-gradient(#333 0 25%,#222 0 50%) 50%/20px 20px}.image img{max-width:100%;max-height:100%;image-rendering:pixelated}button,select{font:inherit;padding:7px 10px;color:inherit;background:var(--vscode-input-background);border:1px solid var(--vscode-input-border)}button.primary{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}.warning{border-left:5px solid var(--vscode-charts-yellow)}.muted{color:var(--vscode-descriptionForeground)}.options{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:12px 0}@media(max-width:720px){.compare{grid-template-columns:1fr}.image{height:260px}}</style></head><body><header><b>Safe Palette Placement</b><span>${escapeName(model.character)}</span><span>← ${escapeName(model.source.name)}</span></header><main><div class="card warning"><b>Preview only.</b> The SFF remains unchanged until Apply is confirmed. Only the chosen stored palette changes; sprites using other palettes—including FX—are untouched.</div><div class="options"><label>Destination color <select id="target">${model.targets.map((item) => `<option value="${item.index}">${item.id} · ${item.role}</option>`).join('')}</select></label><label><input id="flipTable" type="checkbox" ${model.defaultFlip?'checked':''}> Reverse ACT RGB table</label><label><input id="rememberOrder" type="checkbox" checked> Remember this ACT order</label><label>Simple adjustment <select id="preset"><option value="none">None</option><option value="lighten">Lighter</option><option value="darken">Darker</option><option value="grayscale">Grayscale</option><option value="invert">Invert colors</option><option value="hue-positive">Hue shift A</option><option value="hue-negative">Hue shift B</option></select></label></div><p class="muted">Active order: <b id="activeOrder"></b>. ACT has no producer marker; use the preview to choose file order (0 → 255) or reversed RGB order (255 → 0).</p><div class="compare"><section class="card"><h3>Currently stored</h3><div class="image"><img id="before"></div></section><section class="card"><h3>Proposed ${model.source.kind}</h3><div class="image"><img id="after" src="${model.after}"></div></section></div><div class="card" id="facts"></div><p><button id="apply" class="primary">Review &amp; Apply…</button> <button id="cancel">Cancel</button></p></main><script>const vscode=acquireVsCodeApi(),model=${safe(model)},target=document.getElementById('target'),flip=document.getElementById('flipTable'),remember=document.getElementById('rememberOrder'),preset=document.getElementById('preset');function options(){return{paletteIndex:Number(target.value),flipTable:flip.checked,rememberOrder:remember.checked,preset:preset.value}}function request(){document.getElementById('activeOrder').textContent=flip.checked?'Reversed RGB table (255 → 0)':'ACT file order (0 → 255)';vscode.postMessage({type:'preview',...options()})}target.onchange=request;flip.onchange=request;preset.onchange=request;document.getElementById('apply').onclick=()=>vscode.postMessage({type:'apply',...options()});document.getElementById('cancel').onclick=()=>vscode.postMessage({type:'cancel'});addEventListener('message',event=>{if(event.data.type!=='preview')return;document.getElementById('before').src=event.data.before;document.getElementById('after').src=event.data.after;const s=event.data.summary;document.getElementById('facts').innerHTML='<b>Replacement summary</b><p>'+s.changedCount+' of 256 RGB indices change · '+s.affectedSprites+' sprite(s) directly use '+s.id+'. Sprites using every other palette remain untouched.</p>'+(s.linkedChildren.length?'<p>Linked palette IDs that inherit this stored table: '+s.linkedChildren.join(', ')+'</p>':'<p>No linked child palettes inherit this table.</p>')});request();</script></body></html>`;
}

function page(model) {
  const output = rawPage(model)
    .replace('Reverse ACT RGB table', 'Reversed Photoshop method')
    .replace('Reversed RGB table (255 → 0)', 'Reversed Photoshop method (255 → 0)');
  if (model.source?.kind === 'ACT') return output;
  return output
    .replace('<label><input id="rememberOrder"', '<label hidden><input id="rememberOrder"')
    .replaceAll('Reversed Photoshop method', 'Reverse RGB table')
    .replace('ACT has no producer marker; use the preview to choose file order (0 → 255) or reversed RGB order (255 → 0).', 'Use the preview to choose direct or reversed RGB table order.');
}

async function rememberActOrder(config, chosen, api = vscode) {
  const order = normalizeOrder(chosen);
  await config.update('actPaletteOrder', order, api.ConfigurationTarget.Global);
  const effective = normalizeOrder(config.get('actPaletteOrder', 'index'));
  if (effective !== order) api.window.showInformationMessage('This order is being used for the current preview, but a more specific VS Code setting overrides the global ACT preference. No workspace or project setting was changed.');
  return effective === order;
}

async function openRosterPaletteFlow(defPath, sourcePath, preferredPaletteIndex = null) {
  const source = paletteSource(sourcePath), resource = vscode.Uri.file(sourcePath), config = vscode.workspace.getConfiguration('ikemenZss', resource), rememberedOrder = normalizeOrder(config.get('actPaletteOrder', 'index')), sffPath = characterSff(defPath), archive = readSff(sffPath), sprite = representativeSprite(archive);
  if (!sprite) throw new Error('No indexed sprite is available for a palette preview. True-color sprites use PalFX rather than embedded palette replacement.');
  const targets = archive.palettes.filter((palette) => palette.dataSize > 0 && palette.colors === 256).map((palette) => ({ index: palette.index, id: `${palette.group},${palette.number}`, role: paletteRole(palette) }));
  if (!targets.length) throw new Error('This SFF has no stored 256-color palette that can be replaced directly. Stage a new palette through the SFF workspace rebuild tools.');
  const panel = trackViewerPanel(vscode.window.createWebviewPanel('ikemenRosterPalettePlacement', `${path.basename(defPath, '.def')} — Palette Preview`, preferredViewerColumn(vscode.ViewColumn.Active), { enableScripts: true }));
  if (Number.isInteger(preferredPaletteIndex)) targets.sort((a, b) => (a.index === preferredPaletteIndex ? -1 : b.index === preferredPaletteIndex ? 1 : 0));
  panel.webview.html = require('./webview_policy').protect(page({ character: path.basename(defPath, '.def'), source: { name: source.name, kind: source.kind }, targets, after: spriteDataUri(archive, sprite, source.colors), defaultFlip: source.kind === 'ACT' && rememberedOrder === REVERSED_ORDER, rememberedOrder: orderLabel(rememberedOrder) }),panel.webview.cspSource);
  panel.webview.onDidReceiveMessage(async (message) => {
    if (message.type === 'cancel') return panel.dispose();
    if(source.kind==='ACT'&&message.rememberOrder)await rememberActOrder(config,message.flipTable?REVERSED_ORDER:'index');
    const paletteIndex = Number(message.paletteIndex), converted = playerPaletteConversion(source, message), summary = replacementSummary(archive, paletteIndex, converted);
    if (message.type === 'preview') return panel.webview.postMessage({ type: 'preview', before: spriteDataUri(archive, sprite, paletteIndex), after: spriteDataUri(archive, sprite, converted.colors), summary });
    if (message.type !== 'apply') return;
    const answer = await vscode.window.showWarningMessage(`Replace palette ${summary.id} in ${path.basename(sffPath)} from ${source.name}?`, { modal: true, detail: `${summary.changedCount} RGB indices change. ${summary.affectedSprites} sprite(s) directly use this palette.${summary.linkedChildren.length ? ` Linked IDs ${summary.linkedChildren.join(', ')} will inherit it.` : ''}\n\nReview the affected sprites before applying this palette replacement.` }, 'Apply Palette');
    if (answer !== 'Apply Palette') return;
    const result = bufferWithPaletteReplacement(archive, paletteIndex, converted.colors), options = optionsFromConfig(vscode, sffPath, 'roster-palette-replace', { journalRoot: path.dirname(defPath), expectedHash: hash(archive.buffer) });
    transactionalWrite(fs, sffPath, result.buffer, options); panel.dispose();
    vscode.window.showInformationMessage(`Palette ${summary.id} was replaced in ${path.basename(sffPath)}. Use VS Code’s IKEMaker mutation history to review or restore it.`);
  });
}

async function stageNewRosterPalette(defPath, sourcePath) {
  const sffPath = characterSff(defPath), archive = readSff(sffPath), occupied = archive.palettes.map((palette) => `${palette.group},${palette.number}`);
  const group = await vscode.window.showInputBox({ title: 'New palette group', value: '1', validateInput: (input) => /^\d+$/.test(input) ? undefined : 'Enter a whole number from 0 through 65535.' }); if (group === undefined) return;
  const number = await vscode.window.showInputBox({ title: 'New palette number', value: '1', validateInput: (input) => /^\d+$/.test(input) ? undefined : 'Enter a whole number from 0 through 65535.' }); if (number === undefined) return;
  const source = paletteSource(sourcePath), resource = vscode.Uri.file(sourcePath), config = vscode.workspace.getConfiguration('ikemenZss', resource), rememberedOrder = normalizeOrder(config.get('actPaletteOrder', 'index')), sprite = representativeSprite(archive);
  if (!sprite) throw new Error('No indexed character sprite is available to preview this color.');
  const defaultFlip = source.kind === 'ACT' && rememberedOrder === REVERSED_ORDER, before = spriteDataUri(archive, sprite), after = spriteDataUri(archive, sprite, playerPaletteConversion(source, { flipTable: defaultFlip }).colors), id = `${group},${number}`;
  const panel = trackViewerPanel(vscode.window.createWebviewPanel('ikemenRosterPalettePlacement', `${path.basename(defPath, '.def')} — New Color Preview`, preferredViewerColumn(vscode.ViewColumn.Active), { enableScripts: true }));
  const orderControl = source.kind === 'ACT'
    ? `<label><input id="flipTable" type="checkbox" ${defaultFlip ? 'checked' : ''}> Reversed Photoshop method (255 → 0)</label> <label><input id="rememberOrder" type="checkbox" checked> Remember this ACT order</label>`
    : '<label><input id="flipTable" type="checkbox"> Reverse RGB table</label><input id="rememberOrder" type="checkbox" hidden>';
  panel.webview.html = require('./webview_policy').protect(`<!doctype html><html><head><meta charset="utf-8"><style>:root{color-scheme:light dark}body{font:13px var(--vscode-font-family);background:var(--vscode-editor-background);color:var(--vscode-foreground);margin:0;padding:16px}main{max-width:1000px}.compare{display:grid;grid-template-columns:1fr 1fr;gap:12px}.card{border:1px solid var(--vscode-panel-border);padding:12px}.image{height:360px;display:grid;place-items:center;background:#222}.image img{max-width:100%;max-height:100%;image-rendering:pixelated}.options{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:12px 0}button{font:inherit;padding:8px 11px;border:0;background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)}button.primary{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}</style></head><body><main><h2>Preview new color ${id}</h2><p>Nothing has been saved. Compare the character below, then confirm only if this is the color you intended.</p><div class="options">${orderControl}<span>Active order: <b id="activeOrder"></b></span></div><div class="compare"><section class="card"><h3>Current character color</h3><div class="image"><img src="${before}"></div></section><section class="card"><h3>New color from ${String(source.name).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}</h3><div class="image"><img id="after" src="${after}"></div></section></div><p><button class="primary" id="apply">Add Color ${id}</button> <button id="cancel">Cancel</button></p><details><summary>What happens after I confirm?</summary><p>IKEMaker safely prepares color slot ${id}. The original character file is not replaced yet. Player Mode then opens the reviewed SprMaker2 build path without exposing the general SFF editor.</p></details></main><script>const vscode=acquireVsCodeApi(),isAct=${source.kind === 'ACT'},flip=document.getElementById('flipTable'),remember=document.getElementById('rememberOrder');function values(){return{flipTable:flip.checked,rememberOrder:isAct&&remember.checked}}function preview(){document.getElementById('activeOrder').textContent=flip.checked?(isAct?'Reversed Photoshop method (255 → 0)':'Reversed RGB table (255 → 0)'):'File order (0 → 255)';vscode.postMessage({type:'preview',...values()})}flip.onchange=preview;document.getElementById('apply').onclick=()=>vscode.postMessage({type:'apply',...values()});document.getElementById('cancel').onclick=()=>vscode.postMessage({type:'cancel'});addEventListener('message',event=>{if(event.data.type==='preview')document.getElementById('after').src=event.data.after});preview();</script></body></html>`,panel.webview.cspSource);
  panel.webview.onDidReceiveMessage(async (message) => {
    if (message.type === 'cancel') return panel.dispose();
    const converted = playerPaletteConversion(source, message);
    if (message.type === 'preview') return panel.webview.postMessage({ type: 'preview', after: spriteDataUri(archive, sprite, converted.colors) });
    if (message.type !== 'apply') return;
    if (source.kind === 'ACT' && message.rememberOrder) await rememberActOrder(config, message.flipTable ? REVERSED_ORDER : 'index');
    const result = stagePalette(sffPath, sourcePath, Number(group), Number(number), occupied, { tableOrder: message.flipTable ? REVERSED_ORDER : 'index' }); panel.dispose();
    const action = await vscode.window.showInformationMessage(`Color ${id} is prepared. It will not appear in the game until IKEMaker finishes updating the character file.`, 'Finish Color Update', 'Later');
    if (action === 'Finish Color Update') vscode.commands.executeCommand('ikemen.palettePlayer.finishStaged', vscode.Uri.file(sffPath));
    return result;
  });
}

async function routeRosterPalette(defPath, sourcePath) {
  const sffPath = characterSff(defPath), archive = readSff(sffPath);
  const choices = archive.palettes.filter((palette) => palette.dataSize > 0 && palette.colors === 256).map((palette) => ({ label: `Color ${palette.group},${palette.number}`, description: paletteRole(palette), paletteIndex: palette.index }));
  choices.push({ label: '$(add) Use a new color number…', description: 'IKEMaker will safely prepare an unused slot.', newSlot: true });
  const choice = await vscode.window.showQuickPick(choices, { title: `${path.basename(defPath, '.def')} · which color number should ${path.basename(sourcePath)} use?`, placeHolder: 'Existing colors are previewed before replacement. New numbers are prepared without touching the character file.' });
  if (choice?.newSlot) return stageNewRosterPalette(defPath, sourcePath);
  if (choice && Number.isInteger(choice.paletteIndex)) return openRosterPaletteFlow(defPath, sourcePath, choice.paletteIndex);
}

module.exports = { paletteSource, characterSff, representativeSprite, replacementSummary, playerPaletteConversion, rememberActOrder, openRosterPaletteFlow, stageNewRosterPalette, routeRosterPalette };
