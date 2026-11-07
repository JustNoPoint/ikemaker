'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const vscode = require('vscode');
const { inspectPsd, planPsdExports, exportPsdPlan, safeLabel } = require('./sff_psd_intake');
const { readSff } = require('./sff_reader');
const { hash, transactionalWrite, optionsFromConfig } = require('./mutation_safety');
const { expectedSpriteIdentities, verifySffIdentities, adoptGeneratedSource } = require('./layered_psd_adoption');
const { reviewedStack } = require('./visual_layer_stack_model');
const { preferredViewerColumn, trackViewerPanel } = require('./viewer_group');

const TARGETS = new Set(['stage', 'ui', 'story']);
const LAYERED_PSD_LIMITS = Object.freeze({ layers: 128, canvasPixels: 16_000_000, aggregateLayerPixels: 64_000_000, exportedBytes: 64 * 1024 * 1024 });

function assertLayeredPsdExportBytes(outputs, statSync = fs.statSync) {
  if (!Array.isArray(outputs)) throw new Error('Layered PSD exports are unavailable. Reopen the PSD and retry the export.');
  const exportedBytes = outputs.reduce((total, item) => total + Number(statSync(item.filename).size), 0);
  if (!Number.isSafeInteger(exportedBytes) || exportedBytes < 0 || exportedBytes > LAYERED_PSD_LIMITS.exportedBytes) throw new Error(`The exported layered PSD preview exceeds the reviewed ${Math.floor(LAYERED_PSD_LIMITS.exportedBytes / 1024 / 1024)} MiB limit. Flatten, crop, or split the PSD before importing it.`);
  return exportedBytes;
}

function enforceLayeredPsdExportLimit(outputs, outputDirectory, dependencies = {}) {
  const statSync = dependencies.statSync || fs.statSync;
  const rmSync = dependencies.rmSync || fs.rmSync;
  try { return assertLayeredPsdExportBytes(outputs, statSync); }
  catch (error) { rmSync(outputDirectory, { recursive: true, force: true }); throw error; }
}

function writeLayeredPsdTemporaryArtifact(outputDirectory, filename, content, label, io = fs, temporaryRoot = os.tmpdir()) {
  const approvedRoot = path.resolve(temporaryRoot, 'ikemaker-layered-psd');
  const root = path.resolve(outputDirectory);
  const rootRelative = path.relative(approvedRoot, root);
  if (!rootRelative || rootRelative.startsWith('..') || path.isAbsolute(rootRelative)) throw new Error('Layered PSD artifacts may only be written inside a unique IKEMaker OS-temporary export directory.');
  const target = path.resolve(filename);
  const targetRelative = path.relative(root, target);
  if (!targetRelative || targetRelative.startsWith('..') || path.isAbsolute(targetRelative)) throw new Error('A layered PSD artifact tried to escape its reviewed temporary export directory.');
  const exists = io.existsSync(target), expectedHash = exists ? hash(io.readFileSync(target)) : hash(Buffer.alloc(0));
  return transactionalWrite(io, target, content, { label: `temporary-layered-psd-${String(label || 'artifact')}`, journalRoot: root, journal: false, backup: false, allowExisting: exists, expectedHash });
}

function cleanupLayeredPsdTemporaryExport(outputDirectory, dependencies = {}) {
  const temporaryRoot = dependencies.temporaryRoot || os.tmpdir();
  const rmSync = dependencies.rmSync || fs.rmSync;
  const approvedRoot = path.resolve(temporaryRoot, 'ikemaker-layered-psd');
  const root = path.resolve(outputDirectory || '');
  const relative = path.relative(approvedRoot, root);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Only a completed IKEMaker layered-PSD temporary export may be removed.');
  rmSync(root, { recursive: true, force: true });
  return true;
}

function finiteInteger(value, fallback, minimum = 0, maximum = 65535) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= minimum && number <= maximum ? number : fallback;
}

function layeredPsdPlan(records, options = {}) {
  if (!Array.isArray(records) || records.length < 2 || records[0].index !== 0) throw new Error('A layered PSD with a composite page and at least one authored layer is required.');
  if (records.length - 1 > LAYERED_PSD_LIMITS.layers) throw new Error(`Layered PSD review supports at most ${LAYERED_PSD_LIMITS.layers} authored layers. Flatten or split this document before importing it.`);
  const target = TARGETS.has(options.target) ? options.target : 'stage';
  if (!['top-first', 'bottom-first'].includes(options.stackDirection)) throw new Error('Review the PSD preview and choose whether page 1 is the top or bottom authored layer.');
  const canvas = records[0], group = finiteInteger(options.group, 0), startIndex = finiteInteger(options.startIndex, 0);
  const authored = records.slice(1).filter(record => !/^(?:reference|guide|notes?)$/i.test(String(record.name || '').trim()));
  if (!authored.length) throw new Error('The PSD exposes no authored layers after reference/guide pages are excluded.');
  const canvasPixels = Number(canvas.width) * Number(canvas.height), aggregateLayerPixels = canvasPixels * authored.length;
  if (!Number.isSafeInteger(canvasPixels) || canvasPixels < 1 || canvasPixels > LAYERED_PSD_LIMITS.canvasPixels) throw new Error(`The layered PSD canvas exceeds the reviewed ${LAYERED_PSD_LIMITS.canvasPixels.toLocaleString()}-pixel limit. Flatten, crop, or split it before importing.`);
  if (!Number.isSafeInteger(aggregateLayerPixels) || aggregateLayerPixels > LAYERED_PSD_LIMITS.aggregateLayerPixels) throw new Error(`The layered PSD stack exceeds the reviewed ${LAYERED_PSD_LIMITS.aggregateLayerPixels.toLocaleString()} aggregate layer-pixel limit. Flatten or split it before importing.`);
  if (startIndex + authored.length - 1 > 65535) throw new Error('The PSD layer range exceeds SFF index 65535.');
  const topFirst = options.stackDirection === 'top-first';
  const layers = authored.map((record, sourceOrder) => ({
    id: `psd-layer-${record.index}`,
    name: String(record.name || `Layer ${record.index}`),
    pageIndex: record.index,
    sourceOrder,
    renderOrder: topFirst ? authored.length - sourceOrder - 1 : sourceOrder,
    x: Number(record.x) || 0,
    y: Number(record.y) || 0,
    width: Number(record.width) || canvas.width,
    height: Number(record.height) || canvas.height,
    visible: record.visible !== false,
    opacity: Number.isFinite(Number(record.opacity)) ? Math.max(0, Math.min(1, Number(record.opacity))) : 1,
    compose: String(record.compose || 'over').toLowerCase(),
    sprite: [group, startIndex + sourceOrder]
  }));
  const targetCanvas = Array.isArray(options.targetCanvas) && options.targetCanvas.length === 2 ? options.targetCanvas.map(Number) : null;
  const canvasMismatch = targetCanvas && targetCanvas.every(Number.isFinite) && (targetCanvas[0] !== canvas.width || targetCanvas[1] !== canvas.height);
  return {
    target,
    canvas: { width: canvas.width, height: canvas.height },
    group,
    startIndex,
    ownerFile: options.ownerFile ? path.resolve(options.ownerFile) : '',
    targetName: String(options.targetName || ''),
    layers,
    drawStack: [...layers].filter(layer => layer.visible).sort((left, right) => left.renderOrder - right.renderOrder),
    stackDirection: options.stackDirection,
    canKeepLayers: layers.every(layer => !layer.visible || ['', 'over', 'src-over', 'source-over', 'normal'].includes(layer.compose)),
    warnings: [
      'Layer names, stack order, canvas geometry, visibility, and opacity are retained. Photoshop masks, adjustment layers, smart objects, and blend modes must be rasterized to layer pixels before import.',
      'The generated code assumes each exported full-canvas PNG is added to the target SFF at the displayed group,index without cropping and with axis 0,0.',
      ...(canvasMismatch ? [`PSD canvas ${canvas.width}×${canvas.height} differs from target coordinates ${targetCanvas[0]}×${targetCanvas[1]}. The artwork is not scaled automatically; review placement in the target viewer.`] : []),
      ...layers.filter(layer => layer.visible && !['', 'over', 'src-over', 'source-over', 'normal'].includes(layer.compose)).map(layer => `${layer.name} uses unsupported Photoshop compose mode “${layer.compose}”. Bake that appearance or flatten the PSD; independent IKEMEN sprites will not match it.`)
    ]
  };
}

function codeName(value, fallback) { return safeLabel(value, fallback).replace(/[._-]+/g, ' '); }
function generateLayerCode(plan, options = {}) {
  if (!plan || !TARGETS.has(plan.target) || !Array.isArray(plan.drawStack)) throw new Error('A reviewed layered PSD plan is required.');
  const start = Array.isArray(options.origin) && options.origin.length === 2 ? options.origin.map(value => Number(value) || 0) : [0, 0];
  const layerNo = finiteInteger(options.layerNo, 0, -1, 2);
  if (plan.target === 'story') {
    const first = finiteInteger(options.firstLayer, 0, 0, 999);
    return plan.drawStack.map((layer, ordinal) => {
      const index = first + ordinal;
      return `; PSD: ${layer.name}\nlayer${index}.offset = ${start[0] + (Number(layer.deltaX) || 0)},${start[1] + (Number(layer.deltaY) || 0)}\nlayer${index}.spr = ${layer.sprite[0]},${layer.sprite[1]}\nlayer${index}.starttime = 0`;
    }).join('\n\n');
  }
  const uiBase = String(options.backgroundPrefix || plan.targetName || 'TitleBG').replace(/\s*(?:Info|Def)$/i, '') || 'Title';
  const prefix = plan.target === 'ui' ? (/BG$/i.test(uiBase) ? uiBase : `${uiBase}BG`) : 'BG';
  const base = finiteInteger(options.firstBlock, 0, 0, 9999);
  return plan.drawStack.map((layer, ordinal) => {
    const title = plan.target === 'ui' ? `${prefix} ${base + ordinal}` : `BG ${codeName(layer.name, `PSD Layer ${ordinal + 1}`)} p${layer.pageIndex}`;
    return `; PSD page ${layer.pageIndex}: ${layer.name}\n[${title}]\ntype = normal\nspriteno = ${layer.sprite[0]},${layer.sprite[1]}\nstart = ${start[0] + (Number(layer.deltaX) || 0)},${start[1] + (Number(layer.deltaY) || 0)}\ndelta = 1,1\nlayerno = ${layerNo}`;
  }).join('\n\n');
}

function sealLayeredPsdReview(plan, allDraw, layerStates, options = {}) {
  const review = reviewedStack(allDraw, layerStates);
  const intakeLayers = [...review.layers].sort((left, right) => left.sprite[1] - right.sprite[1]);
  const reviewedPlan = { ...plan, layers: review.layers, drawStack: review.drawStack };
  return { review, selectedLayers: review.drawStack, intakeLayers, reviewedPlan, code: generateLayerCode(reviewedPlan, options) };
}

function csv(value) { const text = String(value ?? ''); return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }
function manifestText(plan, outputs, sourceHash = '') {
  const byPage = new Map(outputs.map(item => [item.sourceOrdinal, item.filename]));
  return ['SourceHash,StackDirection,PSDPage,LayerName,PNG,Group,Index,AxisX,AxisY,RenderOrder,Visible,Opacity,Compose', ...plan.layers.map(layer => [sourceHash, plan.stackDirection, layer.pageIndex, layer.name, byPage.get(layer.pageIndex) || '', layer.sprite[0], layer.sprite[1], Number(layer.deltaX) || 0, Number(layer.deltaY) || 0, layer.renderOrder, layer.visible ? 1 : 0, layer.opacity, layer.compose].map(csv).join(','))].join('\n') + '\n';
}

function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])); }
function json(value) { return JSON.stringify(value).replace(/</g, '\\u003c'); }
function plainObject(value){return Boolean(value)&&typeof value==='object'&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null)}
function exactObject(value,keys){return plainObject(value)&&JSON.stringify(Object.keys(value).sort())===JSON.stringify([...keys].sort())}
function validLayeredPsdMessage(message,layers){
  if(!plainObject(message)||typeof message.type!=='string')return false;
  if(['openFolder','openOwner','reviewChanged','verifyAdoption'].includes(message.type))return exactObject(message,['type']);
  if(message.type==='copyCode')return exactObject(message,['type','code'])&&typeof message.code==='string'&&message.code.length<=500000;
  if(message.type==='openSffIntake'){
    if(!exactObject(message,['type','layers']))return false;
    try{reviewedStack(layers,message.layers);return true}catch(_){return false}
  }
  return false;
}

function layeredPsdHtml(model) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  :root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#101217;color:#e8edf2;font:12px var(--vscode-font-family,Segoe UI)}header,.tools{display:flex;gap:7px;align-items:center;flex-wrap:wrap;padding:8px 10px;border-bottom:1px solid #39414d;background:#181b20}button,input,textarea{font:inherit;color:inherit;background:#262b33;border:1px solid #4b5665;padding:5px}button:disabled,input:disabled{cursor:not-allowed;opacity:.55}.app{display:grid;grid-template-columns:minmax(260px,330px) minmax(320px,1fr) minmax(280px,360px);height:calc(100vh - 48px)}aside{padding:10px;overflow:auto;background:#181b20}main{display:grid;place-items:center;overflow:auto;padding:16px;background:repeating-conic-gradient(#1b2027 0 25%,#14181e 0 50%) 50%/24px 24px}.preview{position:relative;width:min(100%,960px);aspect-ratio:var(--ratio);background:#222;overflow:hidden}.preview img{position:absolute;inset:0;width:100%;height:100%;object-fit:fill;image-rendering:pixelated}.layer{display:grid;grid-template-columns:auto minmax(0,1fr);gap:7px;border-bottom:1px solid #303743}.layer>button{border:0;text-align:left;padding:7px;width:100%;overflow-wrap:anywhere}.layer.selected>button{background:#174d56;outline:1px solid #55d8dc}.layer.drag-over{outline:2px solid #e7b84b}.visibility{margin:9px 3px}.muted{color:#9ba7b5}.warn{border-left:3px solid #e7b84b;padding:7px;margin:7px 0;background:#28251c}.position{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto;gap:5px;margin:8px 0}.order{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px}textarea{width:100%;height:55vh;resize:vertical;font-family:var(--vscode-editor-font-family,monospace)}@media(max-width:900px){header{position:static}.app{display:flex;flex-direction:column;height:auto}.app>aside,.app>main{overflow:visible}main{min-height:360px}.order{grid-template-columns:repeat(2,minmax(0,1fr))}.position{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.position button{grid-column:1/-1}textarea{height:280px}}
  </style></head><body><header aria-label="Layered PSD actions"><b>Layered PSD · ${escapeHtml(model.targetLabel)}</b><span class="muted">${escapeHtml(path.basename(model.psdPath))}</span><button id="copy">Copy generated code</button><button id="sff">Continue exported layers in SFF intake…</button><button id="verify" disabled>Verify built SFF &amp; review source…</button><button id="folder">Open exported layer folder</button><button id="owner"${model.ownerFile?'':` disabled title="No owner source was attached. Use Copy generated code after verification."`}>Open owner source</button></header><div class="app"><aside aria-labelledby="stackHeading"><h3 id="stackHeading">PSD stack · top to bottom</h3><p id="stackHelp" class="muted">Select a layer with Enter or Space. Use Arrow keys, Home, and End to navigate; Ctrl/Command toggles and Shift selects a range. Visibility is independent. Drag rows or use the ordering buttons.</p><div class="order" aria-label="Move selected layers in draw order"><button id="orderUp" disabled>Up</button><button id="orderDown" disabled>Down</button><button id="orderTop" disabled>Top</button><button id="orderBottom" disabled>Bottom</button></div><div class="position"><input id="deltaX" type="number" value="0" aria-label="Move selected layers X" disabled><input id="deltaY" type="number" value="0" aria-label="Move selected layers Y" disabled><button id="move" disabled>Move selected</button></div><div id="layers" role="listbox" aria-labelledby="stackHeading" aria-describedby="stackHelp" aria-multiselectable="true"></div>${model.warnings.map(warning => `<div class="warn">${escapeHtml(warning)}</div>`).join('')}</aside><main aria-label="Layered PSD composite preview"><div id="preview" class="preview" style="--ratio:${model.canvas.width}/${model.canvas.height}"></div></main><aside aria-labelledby="sourceHeading"><h3 id="sourceHeading">Generated IKEMEN source</h3><p class="muted">Order and reviewed X/Y deltas are live. Authored PSD opacity is displayed as baked/export evidence and is not editable here. Sprite group/index identities never change when layers move, hide, or reorder.</p><textarea id="code" readonly aria-label="Generated IKEMEN source"></textarea><p id="status" role="status" aria-live="polite">Select one or more layers to move or reorder them.</p></aside></div><script>
  const vscode=acquireVsCodeApi(),model=${json(model)},layers=document.getElementById('layers'),preview=document.getElementById('preview'),code=document.getElementById('code'),status=document.getElementById('status'),copy=document.getElementById('copy'),sff=document.getElementById('sff'),verify=document.getElementById('verify'),folder=document.getElementById('folder'),owner=document.getElementById('owner'),orderUp=document.getElementById('orderUp'),orderDown=document.getElementById('orderDown'),orderTop=document.getElementById('orderTop'),orderBottom=document.getElementById('orderBottom'),deltaX=document.getElementById('deltaX'),deltaY=document.getElementById('deltaY'),move=document.getElementById('move'),DRAG_TYPE='application/x-ikemaker-layered-psd';let stack=model.layers.slice().sort((a,b)=>a.renderOrder-b.renderOrder).map(layer=>({...layer,authoredX:layer.x,authoredY:layer.y,x:0,y:0})),selected=new Set(),anchor='',dragIds=[],dragToken='',dragSerial=0,focusedId=stack.length?stack[stack.length-1].id:'',hostBusy=false,verifyReady=false;
  function esc(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}function topFirst(){return stack.slice().reverse()}function active(){return stack.filter(layer=>layer.visible)}function state(){return stack.map(layer=>({id:layer.id,x:layer.x,y:layer.y,visible:layer.visible}))}function reason(control,enabled,enabledTitle,disabledTitle){control.disabled=!enabled;control.title=enabled?enabledTitle:disabledTitle}
  function syncControls(){const hasSelection=selected.size>0,selectionReason='Select one or more PSD layers first.',wait='Wait for the current Layered PSD action to finish.';for(const [control,label] of [[orderUp,'Move selected layers up'],[orderDown,'Move selected layers down'],[orderTop,'Move selected layers to the top'],[orderBottom,'Move selected layers to the bottom'],[move,'Apply X/Y movement to selected layers']])reason(control,!hostBusy&&hasSelection,label,hostBusy?wait:selectionReason);reason(deltaX,!hostBusy&&hasSelection,'Horizontal movement in pixels',hostBusy?wait:selectionReason);reason(deltaY,!hostBusy&&hasSelection,'Vertical movement in pixels',hostBusy?wait:selectionReason);reason(copy,!hostBusy,'Copy the generated source code',wait);reason(sff,!hostBusy,'Open reviewed exported layers in SFF intake',wait);reason(folder,!hostBusy,'Open the exported layer folder',wait);reason(owner,!hostBusy&&Boolean(model.ownerFile),'Open the exact attached owner source',hostBusy?wait:'No owner source was attached. Use Copy generated code after verification.');reason(verify,!hostBusy&&verifyReady,'Verify the built SFF, then review source adoption',hostBusy?wait:'Open SFF intake and complete its reviewed build first.');document.querySelectorAll('[data-layer]').forEach(row=>{const button=row.querySelector('button'),box=row.querySelector('input');button.disabled=box.disabled=hostBusy;button.draggable=!hostBusy})}
  function changed(message){if(hostBusy)return;verifyReady=false;status.textContent=message||'Layer review changed. Open SFF intake again to seal this order and placement.';vscode.postMessage({type:'reviewChanged'});render(focusedId)}
  function selectRow(id,event={}){const visual=topFirst(),ids=visual.map(layer=>layer.id);focusedId=id;if(event.shiftKey&&anchor&&ids.includes(anchor)){const a=ids.indexOf(anchor),b=ids.indexOf(id);if(!(event.ctrlKey||event.metaKey))selected=new Set();for(const value of ids.slice(Math.min(a,b),Math.max(a,b)+1))selected.add(value)}else if(event.ctrlKey||event.metaKey){selected.has(id)?selected.delete(id):selected.add(id);anchor=id}else{selected=new Set([id]);anchor=id}render(id)}
  function navigateRow(id,event){const ids=topFirst().map(layer=>layer.id),at=ids.indexOf(id);let next=at;if(event.key==='ArrowUp')next=Math.max(0,at-1);else if(event.key==='ArrowDown')next=Math.min(ids.length-1,at+1);else if(event.key==='Home')next=0;else if(event.key==='End')next=ids.length-1;else return;event.preventDefault();selectRow(ids[next],event)}
  function reorder(operation){let visual=topFirst();if(hostBusy||!selected.size)return;if(operation==='top')visual=[...visual.filter(layer=>selected.has(layer.id)),...visual.filter(layer=>!selected.has(layer.id))];else if(operation==='bottom')visual=[...visual.filter(layer=>!selected.has(layer.id)),...visual.filter(layer=>selected.has(layer.id))];else if(operation==='up'){for(let i=1;i<visual.length;i++)if(selected.has(visual[i].id)&&!selected.has(visual[i-1].id))[visual[i-1],visual[i]]=[visual[i],visual[i-1]]}else for(let i=visual.length-2;i>=0;i--)if(selected.has(visual[i].id)&&!selected.has(visual[i+1].id))[visual[i],visual[i+1]]=[visual[i+1],visual[i]];stack=visual.reverse();changed('Reviewed draw order changed.')}
  function clearDrag(){dragIds=[];dragToken='';document.querySelectorAll('[data-layer]').forEach(row=>row.classList.remove('drag-over'))}function drop(target,before,token){if(hostBusy||!dragToken||token!==dragToken){clearDrag();return}let visual=topFirst();const moving=visual.filter(layer=>dragIds.includes(layer.id));if(!moving.length||dragIds.includes(target)){clearDrag();return}visual=visual.filter(layer=>!dragIds.includes(layer.id));const at=visual.findIndex(layer=>layer.id===target);visual.splice(at+(before?0:1),0,...moving);stack=visual.reverse();clearDrag();changed('Reviewed draw order changed by drag and drop.')}
  function clientCodeName(value,fallback){const normalized=String(value||fallback).trim().replace(/[^a-z0-9._-]+/gi,'_').replace(/^_+|_+$/g,'')||fallback;return normalized.replace(/[._-]+/g,' ')}function liveCode(){const config=model.codeConfig,visible=active();return visible.map((layer,ordinal)=>{const x=config.origin[0]+layer.x,y=config.origin[1]+layer.y;if(config.target==='story'){const index=config.firstLayer+ordinal;return '; PSD: '+layer.name+'\\nlayer'+index+'.offset = '+x+','+y+'\\nlayer'+index+'.spr = '+layer.sprite.join(',')+'\\nlayer'+index+'.starttime = 0'}const title=config.target==='ui'?config.uiPrefix+' '+(config.firstBlock+ordinal):'BG '+clientCodeName(layer.name,'PSD Layer '+(ordinal+1))+' p'+layer.pageIndex;return '; PSD page '+layer.pageIndex+': '+layer.name+'\\n['+title+']\\ntype = normal\\nspriteno = '+layer.sprite.join(',')+'\\nstart = '+x+','+y+'\\ndelta = 1,1\\nlayerno = '+config.layerNo}).join('\\n\\n')}
  function render(focusId=''){const visual=topFirst();if(!visual.some(layer=>layer.id===focusedId))focusedId=visual[0]?.id||'';layers.innerHTML=visual.map(layer=>'<div class="layer '+(selected.has(layer.id)?'selected':'')+'" data-layer="'+layer.id+'"><input class="visibility" type="checkbox" aria-label="Show '+esc(layer.name)+'" '+(layer.visible?'checked':'')+'><button role="option" aria-selected="'+selected.has(layer.id)+'" tabindex="'+(layer.id===focusedId?'0':'-1')+'" draggable="'+(!hostBusy)+'" title="Select '+esc(layer.name)+'; drag to reorder"><b>'+esc(layer.name)+'</b><br><span class="muted">PSD page '+layer.pageIndex+' · sprite '+layer.sprite.join(',')+' · authored '+layer.authoredX+','+layer.authoredY+' · reviewed Δ '+layer.x+','+layer.y+' · baked opacity '+Math.round(layer.opacity*100)+'%</span></button></div>').join('');preview.innerHTML=active().map((layer,index)=>'<img src="'+layer.dataUri+'" alt="'+esc(layer.name)+'" style="z-index:'+index+';transform:translate('+(layer.x/model.canvas.width*100)+'%,'+(layer.y/model.canvas.height*100)+'%)">').join('');code.value=liveCode();document.querySelectorAll('[data-layer]').forEach(row=>{const id=row.dataset.layer,button=row.querySelector('button'),box=row.querySelector('input');button.onclick=event=>selectRow(id,event);button.onfocus=()=>{focusedId=id};button.onkeydown=event=>navigateRow(id,event);button.ondragstart=event=>{if(hostBusy){event.preventDefault();return}if(!selected.has(id))selected=new Set([id]);focusedId=id;dragIds=[...selected];dragToken='layered-psd-'+(++dragSerial);event.dataTransfer.effectAllowed='move';event.dataTransfer.setData(DRAG_TYPE,dragToken);syncControls()};button.ondragend=clearDrag;row.ondragover=event=>{if(hostBusy||!dragToken||!Array.from(event.dataTransfer?.types||[]).includes(DRAG_TYPE))return;event.preventDefault();row.classList.add('drag-over')};row.ondragleave=()=>row.classList.remove('drag-over');row.ondrop=event=>{const token=event.dataTransfer?.getData(DRAG_TYPE)||'';if(!dragToken||token!==dragToken){clearDrag();return}event.preventDefault();row.classList.remove('drag-over');const rect=row.getBoundingClientRect();drop(id,event.clientY<rect.top+rect.height/2,token)};box.onchange=event=>{event.stopPropagation();const layer=stack.find(item=>item.id===id);layer.visible=box.checked;changed('Layer visibility changed.')}});syncControls();if(focusId)document.querySelector('[data-layer="'+CSS.escape(focusId)+'"] button')?.focus()}
  function beginHostAction(message){if(hostBusy)return false;hostBusy=true;status.textContent=message;syncControls();return true}orderUp.onclick=()=>reorder('up');orderDown.onclick=()=>reorder('down');orderTop.onclick=()=>reorder('top');orderBottom.onclick=()=>reorder('bottom');move.onclick=()=>{if(hostBusy||!selected.size)return;const dx=Number(deltaX.value),dy=Number(deltaY.value);if(!Number.isFinite(dx)||!Number.isFinite(dy)){status.textContent='Enter valid whole-pixel X and Y movement values.';return}for(const layer of stack)if(selected.has(layer.id)){layer.x+=dx;layer.y+=dy}deltaX.value=deltaY.value=0;changed('Selected layer placement changed.')};copy.onclick=()=>{if(beginHostAction('Copying generated code…'))vscode.postMessage({type:'copyCode',code:code.value})};sff.onclick=()=>{if(beginHostAction('Opening reviewed layers in SFF intake…'))vscode.postMessage({type:'openSffIntake',layers:state()})};verify.onclick=()=>{if(beginHostAction('Verifying the built SFF…'))vscode.postMessage({type:'verifyAdoption'})};folder.onclick=()=>{if(beginHostAction('Opening exported layer folder…'))vscode.postMessage({type:'openFolder'})};owner.onclick=()=>{if(model.ownerFile&&beginHostAction('Opening the exact owner source…'))vscode.postMessage({type:'openOwner'})};addEventListener('message',event=>{const message=event.data||{};if(message.type==='layeredActionState')hostBusy=Boolean(message.busy);if(message.type==='intakeStarted'||message.type==='verificationRetry')verifyReady=true;if(message.type==='adoptionComplete'||message.type==='reviewInvalidated')verifyReady=false;if(typeof message.message==='string'&&message.message)status.textContent=message.message;syncControls()});render();
  </script></body></html>`;
}

async function openLayeredPsdWorkspace(options = {}) {
  const target = TARGETS.has(options.target) ? options.target : 'stage';
  const currentCheck = typeof options.isCurrent === 'function' ? options.isCurrent : () => true;
  const isCurrent = () => { try { return Boolean(currentCheck()); } catch (_) { return false; } };
  if (!isCurrent()) return null;
  const picked = await vscode.window.showOpenDialog({ title: `Import layered PSD for ${target === 'ui' ? 'UI / Screenpack' : target}`, canSelectFiles: true, canSelectFolders: false, canSelectMany: false, filters: { 'Photoshop document': ['psd'] } });
  if (!picked?.[0] || !isCurrent()) return null;
  const direction = await vscode.window.showQuickPick([{label:'PSD page 1 is the top layer',value:'top-first',description:'Common ImageMagick PSD page order; preview before continuing.'},{label:'PSD page 1 is the bottom layer',value:'bottom-first',description:'Use when the live composite shows the stack reversed.'}],{title:'Confirm PSD stack direction'});
  if(!direction||!isCurrent())return null;
  const groupValue = await vscode.window.showInputBox({ title: 'Sprite group for exported PSD layers', value: String(finiteInteger(options.group, target === 'story' ? 100 : 0)), validateInput: value => /^\d+$/.test(value) && Number(value) <= 65535 ? undefined : 'Enter a whole number from 0 to 65535.' });
  if (groupValue === undefined || !isCurrent()) return null;
  const indexValue = await vscode.window.showInputBox({ title: 'First sprite index', value: String(finiteInteger(options.startIndex, 0)), validateInput: value => /^\d+$/.test(value) && Number(value) <= 65535 ? undefined : 'Enter a whole number from 0 to 65535.' });
  if (indexValue === undefined || !isCurrent()) return null;
  const imageMagick = vscode.workspace.getConfiguration('ikemenZss').get('imageMagickPath', 'magick');
  const inspection = inspectPsd(picked[0].fsPath, imageMagick), plan = layeredPsdPlan(inspection.records, { ...options, target, group: Number(groupValue), startIndex: Number(indexValue), stackDirection:direction.value });
  const exportPlan = planPsdExports(inspection.records, 'layers');
  const sourceBytes=fs.readFileSync(inspection.filename),psdHash=crypto.createHash('sha256').update(sourceBytes).digest('hex'),digest = crypto.createHash('sha256').update(sourceBytes).update(JSON.stringify({target,group:plan.group,startIndex:plan.startIndex,stackDirection:plan.stackDirection,targetName:plan.targetName,origin:options.origin,targetCanvas:options.targetCanvas})).digest('hex').slice(0, 16);
  const outputDirectory = path.join(os.tmpdir(), 'ikemaker-layered-psd', `${digest}-${crypto.randomUUID()}`);
  const outputs = exportPsdPlan(inspection, exportPlan, outputDirectory), byPage = new Map(outputs.map(item => [item.sourceOrdinal, item]));
  enforceLayeredPsdExportLimit(outputs, outputDirectory);
  for (const layer of plan.layers) { const output = byPage.get(layer.pageIndex),handoff=output?path.join(outputDirectory,`g${String(layer.sprite[0]).padStart(5,'0')}_i${String(layer.sprite[1]).padStart(5,'0')}_${safeLabel(layer.name,`layer_${layer.pageIndex}`)}.png`):'';if(output)writeLayeredPsdTemporaryArtifact(outputDirectory,handoff,fs.readFileSync(output.filename),`layer-${layer.pageIndex}`);layer.filename = handoff; layer.dataUri = output ? `data:image/png;base64,${fs.readFileSync(output.filename).toString('base64')}` : ''; }
  const blocks = [], firstLayer=finiteInteger(options.firstLayer,0,0,999), firstBlock=finiteInteger(options.firstBlock,0,0,9999), allDraw=[...plan.layers].sort((left,right)=>left.renderOrder-right.renderOrder);
  for (const [ordinal,layer] of allDraw.entries()) { const single = { ...plan, drawStack: [layer] }; blocks.push({ id: layer.id, renderOrder: layer.renderOrder, code: generateLayerCode(single, { ...options, firstLayer: firstLayer + ordinal, firstBlock: firstBlock + ordinal }) }); }
  const initiallyVisible=new Set(plan.layers.filter(layer=>layer.visible).map(layer=>layer.id)),completeCode=blocks.filter(block=>initiallyVisible.has(block.id)).sort((left,right)=>left.renderOrder-right.renderOrder).map(block=>block.code).join('\n\n');
  writeLayeredPsdTemporaryArtifact(outputDirectory,path.join(outputDirectory, 'ikemaker-layer-map.csv'),manifestText(plan, plan.layers.map(layer=>({sourceOrdinal:layer.pageIndex,filename:layer.filename})),psdHash),'initial-manifest');
  writeLayeredPsdTemporaryArtifact(outputDirectory,path.join(outputDirectory, `ikemaker-${target}-layers.txt`),completeCode + '\n','initial-source');
  const targetLabel = target === 'ui' ? 'UI / Screenpack' : target === 'story' ? 'Storyboard' : 'Stage';
  const uiBase=String(options.backgroundPrefix||plan.targetName||'TitleBG').replace(/\s*(?:Info|Def)$/i,'')||'Title',codeConfig={target,origin:Array.isArray(options.origin)&&options.origin.length===2?options.origin.map(value=>Number(value)||0):[0,0],layerNo:finiteInteger(options.layerNo,0,-1,2),firstLayer,firstBlock,uiPrefix:/BG$/i.test(uiBase)?uiBase:`${uiBase}BG`};
  if (!isCurrent()) { cleanupLayeredPsdTemporaryExport(outputDirectory); return null; }
  const panel = trackViewerPanel(vscode.window.createWebviewPanel('ikemenLayeredPsdWorkspace', `Layered PSD · ${targetLabel}`, preferredViewerColumn(vscode.ViewColumn.Active), { enableScripts: true, retainContextWhenHidden: true }));
  panel.webview.html = require('./webview_policy').protect(require('./standalone_review_header').enhance(layeredPsdHtml({ ...plan, psdPath: inspection.filename, outputDirectory, targetLabel, codeConfig }),'visual.layered-psd'), panel.webview.cspSource);
  const ownerFile=options.ownerFile&&fs.existsSync(options.ownerFile)?path.resolve(options.ownerFile):'',ownerSourceHash=ownerFile?hash(fs.readFileSync(ownerFile)):'';
  const owner={disposed:false,busy:false,completedReviewGeneration:0,generation:1,reviewGeneration:1};let pendingAdoption=null;
  const post=message=>{if(!owner.disposed)panel.webview.postMessage(message)};
  const actionState=(busy,message)=>post({type:'layeredActionState',busy:Boolean(busy),message:String(message||'')});
  async function runExclusive(label,task){
    if(owner.busy){actionState(true,`Finish the current Layered PSD action before ${label.toLowerCase()}.`);return}
    const generation=owner.generation;owner.busy=true;actionState(true,`${label}…`);
    try{const message=await task(generation);if(!owner.disposed&&owner.generation===generation)actionState(false,message||`${label} closed.`)}
    catch(error){if(!owner.disposed&&owner.generation===generation)actionState(false,`Could not ${label.toLowerCase()}: ${error.message}`)}
    finally{if(!owner.disposed&&owner.generation===generation)owner.busy=false}
  }
  panel.webview.onDidReceiveMessage(async message => {
    if(require('./standalone_review_header').isMessage(message)&&await require('./standalone_review_header').handle(message,options.ownerFile||'',panel))return;
    if(owner.disposed||!validLayeredPsdMessage(message,allDraw))return;
    if(message.type==='reviewChanged'){owner.reviewGeneration++;owner.completedReviewGeneration=0;pendingAdoption=null;post({type:'reviewInvalidated',message:'Layer review changed. Open SFF intake again to seal this order, visibility, and placement.'});return}
    if(message.type==='copyCode')return runExclusive('Copy generated code',async()=>{await vscode.env.clipboard.writeText(message.code);return'Generated layer code copied.'});
    if(message.type==='openFolder')return runExclusive('Open the exported layer folder',async()=>{await vscode.commands.executeCommand('revealFileInOS',vscode.Uri.file(outputDirectory));return'Exported layer folder opened.'});
    if(message.type==='openOwner')return runExclusive('Open the exact owner source',async()=>{if(!ownerFile)return'No owner source was attached. Use Copy generated code after verification.';await vscode.commands.executeCommand('vscode.open',vscode.Uri.file(ownerFile));return`Opened owner source: ${ownerFile}`});
    if(message.type==='openSffIntake'){owner.completedReviewGeneration=0;return runExclusive('Open SFF intake',async generation=>{
      const reviewGeneration=owner.reviewGeneration,sealed=sealLayeredPsdReview(plan,allDraw,message.layers,options),{review,selectedLayers,intakeLayers,reviewedPlan,code}=sealed,current=()=>!owner.disposed&&owner.generation===generation&&owner.reviewGeneration===reviewGeneration;
      if(!selectedLayers.length)return'Keep at least one PSD layer visible before opening SFF intake.';
      if(selectedLayers.some(layer=>!['','over','src-over','source-over','normal'].includes(layer.compose)))return'Layer intake is blocked because one or more visible Photoshop blend modes cannot be reproduced safely. Bake or flatten those effects first.';
      const sffPath=options.sffPath&&fs.existsSync(options.sffPath)?options.sffPath:(await vscode.window.showOpenDialog({title:'Choose the SFF that will receive these PSD layers',canSelectFiles:true,canSelectFolders:false,canSelectMany:false,filters:{SFF:['sff']}}))?.[0]?.fsPath;
      if(!sffPath)return'SFF intake selection cancelled; the reviewed layer state is unchanged.';
      if(!current())return'The layer review changed before SFF intake opened. Review it again.';
      await vscode.commands.executeCommand('sff.openAddSprites',vscode.Uri.file(sffPath),{sourcePaths:intakeLayers.map(layer=>layer.filename),group:plan.group,startIndex:Math.min(...intakeLayers.map(layer=>layer.sprite[1])),detect:true,reversed:false,anchor:'top-left'});
      if(!current())return'The layer review changed while SFF intake opened. Review it again.';
      const identities=expectedSpriteIdentities(intakeLayers);
      writeLayeredPsdTemporaryArtifact(outputDirectory,path.join(outputDirectory,'ikemaker-layer-map.csv'),manifestText(reviewedPlan,reviewedPlan.layers.map(layer=>({sourceOrdinal:layer.pageIndex,filename:layer.filename})),psdHash),'reviewed-manifest');
      writeLayeredPsdTemporaryArtifact(outputDirectory,path.join(outputDirectory,`ikemaker-${target}-layers.txt`),code+'\n','reviewed-source');
      pendingAdoption=Object.freeze({sffPath:path.resolve(sffPath),identities,code,ownerFile,ownerSourceHash,target:plan.target,targetName:plan.targetName,reviewGeneration});
      post({type:'intakeStarted',message:`SFF intake opened for ${path.resolve(sffPath)} with all ${identities.length} stable layer identities; ${selectedLayers.length} visible layer(s) will be written to source. Complete the reviewed build, then verify here.`});return`SFF intake opened for ${path.resolve(sffPath)}. Complete its reviewed build, then verify here.`;
    });}
    if(message.type==='verifyAdoption')return runExclusive('Verify the built SFF and review source',async generation=>{
      const adoption=pendingAdoption,reviewGeneration=owner.reviewGeneration,current=()=>!owner.disposed&&owner.generation===generation&&owner.reviewGeneration===reviewGeneration&&pendingAdoption===adoption;
      if(!adoption)return'Open SFF intake from this workspace before verifying adoption.';
      let verification;try{verification=verifySffIdentities(readSff(adoption.sffPath),adoption.identities)}catch(error){return`The target SFF could not be verified: ${error.message}`}
      if(!verification.ok){const missing=verification.missing.map(item=>item.key).join(', '),ambiguous=verification.ambiguous.map(item=>`${item.key} (${item.count} copies)`).join(', ');return`SFF is not ready.${missing?` Missing: ${missing}.`:''}${ambiguous?` Duplicate identities: ${ambiguous}.`:''}`}
      if(!adoption.ownerFile){pendingAdoption=null;owner.completedReviewGeneration=reviewGeneration;post({type:'adoptionComplete',message:`Verified ${verification.present.length} sprite identities. No owner source file was attached; use Copy generated code before closing this completed session.`});return'SFF verified; no owner source file was attached. Copy the generated code before closing.'}
      const findLive=()=> (vscode.workspace.textDocuments||[]).find(document=>document.uri?.scheme==='file'&&path.resolve(document.uri.fsPath).toLowerCase()===adoption.ownerFile.toLowerCase());
      if(findLive()?.isDirty)return'The owner source has unsaved changes. Save it, reopen this layered import, and verify again so IKEMaker cannot overwrite newer work.';
      const before=fs.readFileSync(adoption.ownerFile,'utf8');if(hash(Buffer.from(before))!==adoption.ownerSourceHash)return'The owner source changed after this layered import opened. Reopen the import and review the generated source against the current file.';
      const detail=`Verified SFF: ${verification.present.map(item=>item.key).join(', ')}\nOwner: ${adoption.ownerFile}\n\nSource to append:\n${adoption.code}`;
      const choice=await vscode.window.showWarningMessage(`The target SFF now uniquely contains all ${verification.present.length} reviewed layer sprite(s). Append the displayed generated source to ${path.basename(adoption.ownerFile)}?`,{modal:true,detail},'Append Reviewed Source','Copy Code Only');
      if(!current())return'The layer review or target changed during source review. Verify again.';
      if(choice==='Copy Code Only'){await vscode.env.clipboard.writeText(adoption.code);return'SFF verified. Generated source copied; the owner file was not changed.'}
      if(choice!=='Append Reviewed Source')return'SFF verified. Source adoption remains pending.';
      let finalVerification;try{finalVerification=verifySffIdentities(readSff(adoption.sffPath),adoption.identities)}catch(error){return`The target SFF changed during source review: ${error.message}`}
      if(!finalVerification.ok)return'The target SFF changed during source review and no longer proves every unique sprite identity. Verify again.';
      if(findLive()?.isDirty)return'The owner source gained unsaved changes during source review. Save it and reopen the layered import.';
      const currentSource=fs.readFileSync(adoption.ownerFile,'utf8'),currentHash=hash(Buffer.from(currentSource));if(currentHash!==adoption.ownerSourceHash)return'The owner source changed during source review. Reopen the layered import against the current file.';
      let next;try{next=adoptGeneratedSource(currentSource,adoption)}catch(error){return`Source adoption is not safe: ${error.message}`}
      try{transactionalWrite(fs,adoption.ownerFile,next,optionsFromConfig(vscode,adoption.ownerFile,'adopt-layered-psd-source',{journalRoot:path.dirname(adoption.ownerFile),expectedHash:adoption.ownerSourceHash}));pendingAdoption=null;owner.completedReviewGeneration=reviewGeneration;post({type:'adoptionComplete',message:`Verified SFF sprites in ${adoption.sffPath} and appended the reviewed generated source to ${adoption.ownerFile}. Temporary layer exports will be removed when this completed workspace closes.`});return`Verified SFF sprites in ${adoption.sffPath} and appended the reviewed generated source to ${adoption.ownerFile}.` }catch(error){return`The SFF was verified, but source adoption failed: ${error.message}`}
    });
  });
  panel.onDidDispose(()=>{const completedCurrentReview=owner.completedReviewGeneration===owner.reviewGeneration&&!pendingAdoption;owner.disposed=true;owner.generation++;owner.reviewGeneration++;pendingAdoption=null;if(completedCurrentReview)try{cleanupLayeredPsdTemporaryExport(outputDirectory)}catch(_){/* A locked completed export remains recoverable in the OS temp folder. */}});
  return panel;
}

function register(context) { context.subscriptions.push(vscode.commands.registerCommand('ikemen.layeredPsd.open', (_uri, options) => openLayeredPsdWorkspace(options || {}))); }

module.exports = { TARGETS, LAYERED_PSD_LIMITS, assertLayeredPsdExportBytes, enforceLayeredPsdExportLimit, writeLayeredPsdTemporaryArtifact, cleanupLayeredPsdTemporaryExport, layeredPsdPlan, generateLayerCode, sealLayeredPsdReview, manifestText, layeredPsdHtml, validLayeredPsdMessage, openLayeredPsdWorkspace, register };
