'use strict';

function byte(value) { return Math.max(0, Math.min(255, Math.round(Number(value) || 0))); }
function normalizePalette(colors) {
  if (!Array.isArray(colors) || colors.length !== 256) throw new Error('A palette must contain exactly 256 colors.');
  return colors.map((color, index) => [byte(color?.[0]), byte(color?.[1]), byte(color?.[2]), color?.length > 3 ? byte(color[3]) : (index === 0 ? 0 : 255)]);
}
function normalizeIndices(indices) { return [...new Set((indices || []).map(Number).filter((value) => Number.isInteger(value) && value >= 0 && value <= 255))].sort((a, b) => a - b); }
function mapSelected(colors, indices, transform) {
  const output = normalizePalette(colors), selected = normalizeIndices(indices);
  if (!selected.length) throw new Error('Select at least one palette index.');
  for (const index of selected) { const next = transform(output[index].slice(), index); output[index] = [byte(next[0]), byte(next[1]), byte(next[2]), output[index][3]]; }
  return output;
}
function rgbToHsl(color) {
  const r = byte(color[0]) / 255, g = byte(color[1]) / 255, b = byte(color[2]) / 255, max = Math.max(r, g, b), min = Math.min(r, g, b); let h = 0, s = 0; const l = (max + min) / 2, d = max - min;
  if (d) { s = l > .5 ? d / (2 - max - min) : d / (max + min); if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6; else if (max === g) h = ((b - r) / d + 2) / 6; else h = ((r - g) / d + 4) / 6; }
  return [h * 360, s * 100, l * 100];
}
function hslToRgb(hsl) {
  let h = ((Number(hsl[0]) % 360) + 360) % 360 / 360; const s = Math.max(0, Math.min(100, Number(hsl[1]) || 0)) / 100, l = Math.max(0, Math.min(100, Number(hsl[2]) || 0)) / 100;
  if (!s) { const value = byte(l * 255); return [value, value, value]; }
  const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q, hue = (t) => { t = (t + 1) % 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
  return [byte(hue(h + 1 / 3) * 255), byte(hue(h) * 255), byte(hue(h - 1 / 3) * 255)];
}
function adjustRgb(colors, indices, delta = {}) { return mapSelected(colors, indices, (color) => [color[0] + Number(delta.r || 0), color[1] + Number(delta.g || 0), color[2] + Number(delta.b || 0)]); }
function adjustHsl(colors, indices, delta = {}) { return mapSelected(colors, indices, (color) => { const hsl = rgbToHsl(color); return hslToRgb([hsl[0] + Number(delta.h || 0), hsl[1] + Number(delta.s || 0), hsl[2] + Number(delta.l || 0)]); }); }
function applyPreset(colors, indices, preset) {
  if (preset === 'lighten') return adjustHsl(colors, indices, { l: 15 });
  if (preset === 'darken') return adjustHsl(colors, indices, { l: -15 });
  if (preset === 'hue-positive') return adjustHsl(colors, indices, { h: 120 });
  if (preset === 'hue-negative') return adjustHsl(colors, indices, { h: -120 });
  if (preset === 'grayscale') return mapSelected(colors, indices, (color) => { const value = byte(color[0] * .2126 + color[1] * .7152 + color[2] * .0722); return [value, value, value]; });
  if (preset === 'invert') return mapSelected(colors, indices, (color) => [255 - color[0], 255 - color[1], 255 - color[2]]);
  throw new Error('Choose a palette transformation preset.');
}
function gradientByte(value) {
  const floor = Math.floor(value), fraction = value - floor;
  return byte(fraction === .5 ? (floor % 2 === 0 ? floor : floor + 1) : Math.round(value));
}
function fillGradient(colors, indices, channels = [true, true, true]) {
  const selected = normalizeIndices(indices); if (selected.length < 2) throw new Error('Select at least two indexes for a gradient.'); const output = normalizePalette(colors), first = output[selected[0]].slice(), last = output[selected[selected.length - 1]].slice();
  if (!channels.some(Boolean)) throw new Error('Choose at least one gradient channel.');
  selected.forEach((index, position) => { const amount = position / (selected.length - 1); output[index] = [0, 1, 2, 3].map((channel) => channels[channel] && !(channel===3 && index===0) ? gradientByte(first[channel] + (last[channel] - first[channel]) * amount) : output[index][channel]); }); return output;
}
function swapSelected(colors, indices) { const selected = normalizeIndices(indices); if (selected.length !== 2) throw new Error('Select exactly two indexes to swap.'); const output = normalizePalette(colors), a = output[selected[0]].slice(0, 3), b = output[selected[1]].slice(0, 3); output[selected[0]].splice(0, 3, ...b); output[selected[1]].splice(0, 3, ...a); return output; }
function reverseSelected(colors, indices) { const selected = normalizeIndices(indices); if (selected.length < 2) throw new Error('Select at least two indexes to reverse.'); const output = normalizePalette(colors), rgb = selected.map((index) => output[index].slice(0, 3)).reverse(); selected.forEach((index, position) => output[index].splice(0, 3, ...rgb[position])); return output; }
function duplicateGroups(colors) { const groups = new Map(); normalizePalette(colors).forEach((color, index) => { const key = color.slice(0, 3).join(','); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(index); }); return [...groups].filter(([, indices]) => indices.length > 1).map(([rgb, indices]) => ({ rgb, indices })); }

function selectionHtml() {
  return '<hr><details><summary><b>Selected Index Operations</b></summary><p class="muted">Click an index normally to select one. Ctrl-click selects specific indexes; Shift-click selects a range. Every operation updates the preview only. Use Save Color Edits separately after reviewing the sprite.</p><div class="palette-toolbar"><button id="paletteSelectAll" class="tool">Select All 256</button><button id="paletteClearSelection" class="tool">Clear</button><span id="paletteSelectionStatus" class="muted">0 indexes selected</span></div><div class="palette-color-editor"><label>Red ±</label><input id="paletteDeltaR" type="number" value="0"><label>Green ±</label><input id="paletteDeltaG" type="number" value="0"><label>Blue ±</label><input id="paletteDeltaB" type="number" value="0"><span></span><button id="paletteApplyRgb" class="tool">Preview RGB</button><label>Hue °</label><input id="paletteDeltaH" type="number" value="0"><label>Saturation ±</label><input id="paletteDeltaS" type="number" value="0"><label>Lightness ±</label><input id="paletteDeltaL" type="number" value="0"><span></span><button id="paletteApplyHsl" class="tool">Preview HSL</button></div><div class="palette-toolbar"><select id="palettePreset" title="Transform only the selected indexes"><option value="lighten">Lighten</option><option value="darken">Darken</option><option value="grayscale">Grayscale</option><option value="invert">Invert RGB</option><option value="hue-positive">Hue +120°</option><option value="hue-negative">Hue −120°</option></select><button id="paletteApplyPreset" class="tool">Preview Preset</button><button id="paletteGradient" class="tool" title="Interpolate between the first and last selected colors across the selected indexes">Create Gradient</button><button id="paletteSwap" class="tool" title="Exchange RGB values between exactly two selected indexes">Swap Two</button><button id="paletteReverseSelection" class="tool" title="Reverse RGB order only across selected indexes">Reverse Selection</button><button id="paletteAnalyzeDuplicates" class="tool" title="Report identical RGB entries without merging or reindexing them">Find Exact Duplicates</button></div><div id="paletteSelectionReport" class="status-list muted">No analysis run. Duplicate-looking indexes are never merged automatically because CS materials may require separate identities.</div></details>';
}

function selectionClientScript() {
  const functions = [byte, normalizePalette, normalizeIndices, mapSelected, rgbToHsl, hslToRgb, adjustRgb, adjustHsl, applyPreset, gradientByte, fillGradient, swapSelected, reverseSelected, duplicateGroups].map((fn) => fn.toString()).join('\n');
  return `${functions}
  const paletteBatchSelection=new Set();let paletteBatchAnchor=null;
  const paletteOperationsDialog=document.createElement('dialog');
  paletteOperationsDialog.setAttribute('aria-label','Palette Index Operations');
  paletteOperationsDialog.style.cssText='width:min(1050px,90vw);height:84vh;max-height:90vh;overflow:auto;background:var(--vscode-editor-background);color:var(--vscode-foreground);border:1px solid var(--vscode-panel-border);padding:14px';
  const closePaletteOperations=document.createElement('button');closePaletteOperations.textContent='Close Palette Index Operations';closePaletteOperations.className='tool';closePaletteOperations.onclick=()=>paletteOperationsDialog.close();
  const paletteOperationsHeading=document.createElement('h2');paletteOperationsHeading.textContent='Palette Index Operations';
  paletteOperationsDialog.append(closePaletteOperations,paletteOperationsHeading);
  const paletteOperationsPanel=document.getElementById('palettePanel');
  paletteOperationsPanel.hidden=false;paletteOperationsPanel.classList.add('active');paletteOperationsDialog.append(paletteOperationsPanel);document.body.append(paletteOperationsDialog);
  const openPaletteOperations=document.createElement('button');openPaletteOperations.id='openPaletteIndexOperations';openPaletteOperations.className='tool';openPaletteOperations.textContent='Palette Index Operations…';openPaletteOperations.title='Open a focused palette dialog for selected-color gradients, sort and sprite remap, combine, merge, links and duplicate cleanup.';
  openPaletteOperations.onclick=()=>{paletteOperationsDialog.showModal();requestPaletteData(Number(document.getElementById('paletteSelect').value));};
  document.getElementById('left1').prepend(openPaletteOperations);
  queueMicrotask(()=>{
    document.getElementById('left1').prepend(openPaletteOperations);
    const focused=document.createElement('section');
    focused.append(document.getElementById('paletteSelect'),document.getElementById('paletteInfo'),document.getElementById('paletteGrid'),document.getElementById('paletteColorIndex').closest('.palette-color-editor'),document.getElementById('savePaletteEdits').parentElement);
    const rangeControls=document.createElement('div');rangeControls.className='palette-toolbar';
    const rangeFields=['First selected slot','Last selected slot'].map((text,index)=>{const label=document.createElement('label'),input=document.createElement('input');input.type='number';input.min='0';input.max='255';input.value=index?'3':'1';input.setAttribute('aria-label',text);input.style.width='70px';label.append(document.createTextNode(text+' '),input);rangeControls.append(label);return input});
    const selectRange=document.createElement('button');selectRange.className='tool';selectRange.textContent='Select Slot Range';selectRange.onclick=()=>{const first=Number(rangeFields[0].value),last=Number(rangeFields[1].value);if(!Number.isInteger(first)||!Number.isInteger(last)||first<0||last>255||first>last){operationError(new Error('Choose an ordered slot range from 0 through 255.'));return;}paletteBatchSelection.clear();for(let index=first;index<=last;index++)paletteBatchSelection.add(index);paletteBatchAnchor=first;renderPaletteBatchSelection();};rangeControls.append(selectRange);
    const focusedGrid=focused.querySelector('#paletteGrid');focusedGrid.before(rangeControls);focusedGrid.style.maxWidth='512px';
    const operations=document.getElementById('paletteSelectionStatus').closest('details');operations.open=true;focused.append(operations,document.getElementById('paletteStatus'));
    document.body.append(paletteOperationsPanel);paletteOperationsPanel.hidden=true;paletteOperationsPanel.style.display='none';
    paletteOperationsDialog.replaceChildren(closePaletteOperations,paletteOperationsHeading,focused);
  });
  function paletteBatchIndices(){return normalizeIndices([...paletteBatchSelection])}
  function renderPaletteBatchSelection(){for(const swatch of document.querySelectorAll('#paletteGrid .palette-swatch'))swatch.classList.toggle('batch-selected',paletteBatchSelection.has(Number(swatch.dataset.index)));const indices=paletteBatchIndices(),status=document.getElementById('paletteSelectionStatus');status.textContent=indices.length+' index'+(indices.length===1?'':'es')+' selected'+(indices.length&&indices.length<12?' · '+indices.join(', '):'')}
  function previewPaletteOperation(colors,label){importedPaletteColors=colors.map(color=>color.slice());previewPaletteIndex=null;vscode.postMessage({type:'paletteDraft',colors:importedPaletteColors,label});showPalette(importedPaletteColors,label);renderPaletteBatchSelection();requestCurrentSprite();requestLayers();requestOnion()}
  function operationBase(){if(!displayedPaletteColors)throw new Error('Choose an embedded palette first.');return displayedPaletteColors}
  function operationError(error){document.getElementById('paletteSelectionReport').textContent=error.message}
  const paletteGridTarget=document.getElementById('paletteGrid');
  paletteGridTarget.addEventListener('click',event=>{const swatch=event.target.closest('.palette-swatch');if(!swatch)return;const index=Number(swatch.dataset.index);if(event.shiftKey&&paletteBatchAnchor!==null){event.preventDefault();event.stopImmediatePropagation();for(let at=Math.min(index,paletteBatchAnchor);at<=Math.max(index,paletteBatchAnchor);at++)paletteBatchSelection.add(at);selectPaletteColor(index)}else if(event.ctrlKey||event.metaKey){event.preventDefault();event.stopImmediatePropagation();paletteBatchSelection.has(index)?paletteBatchSelection.delete(index):paletteBatchSelection.add(index);paletteBatchAnchor=index;selectPaletteColor(index)}else{paletteBatchSelection.clear();paletteBatchSelection.add(index);paletteBatchAnchor=index}renderPaletteBatchSelection()},true);
  paletteGridTarget.addEventListener('dragover',event=>{if(event.dataTransfer.types.includes('application/x-ikemaker-palette-colors'))event.preventDefault()});
  paletteGridTarget.addEventListener('drop',event=>{const swatch=event.target.closest('.palette-swatch');if(!swatch)return;try{const payload=JSON.parse(event.dataTransfer.getData('application/x-ikemaker-palette-colors'));if(!Array.isArray(payload.colors)||!payload.colors.length)return;event.preventDefault();const start=Number(swatch.dataset.index),output=normalizePalette(operationBase());paletteBatchSelection.clear();payload.colors.forEach((color,offset)=>{const index=start+offset;if(index>255)return;output[index]=[byte(color[0]),byte(color[1]),byte(color[2]),output[index][3]];paletteBatchSelection.add(index)});paletteBatchAnchor=start;previewPaletteOperation(output,'Reference selection copied to indexes '+start+'–'+Math.min(255,start+payload.colors.length-1))}catch(error){operationError(error)}});
  new MutationObserver(renderPaletteBatchSelection).observe(paletteGridTarget,{childList:true});
  document.getElementById('paletteSelectAll').onclick=()=>{for(let index=0;index<256;index++)paletteBatchSelection.add(index);renderPaletteBatchSelection()};
  document.getElementById('paletteClearSelection').onclick=()=>{paletteBatchSelection.clear();renderPaletteBatchSelection()};
  document.getElementById('paletteApplyRgb').onclick=()=>{try{previewPaletteOperation(adjustRgb(operationBase(),paletteBatchIndices(),{r:document.getElementById('paletteDeltaR').value,g:document.getElementById('paletteDeltaG').value,b:document.getElementById('paletteDeltaB').value}),'Selected-index RGB adjustment')}catch(error){operationError(error)}};
  document.getElementById('paletteApplyHsl').onclick=()=>{try{previewPaletteOperation(adjustHsl(operationBase(),paletteBatchIndices(),{h:document.getElementById('paletteDeltaH').value,s:document.getElementById('paletteDeltaS').value,l:document.getElementById('paletteDeltaL').value}),'Selected-index HSL adjustment')}catch(error){operationError(error)}};
  document.getElementById('paletteApplyPreset').onclick=()=>{try{previewPaletteOperation(applyPreset(operationBase(),paletteBatchIndices(),document.getElementById('palettePreset').value),'Selected-index '+document.getElementById('palettePreset').selectedOptions[0].textContent)}catch(error){operationError(error)}};
  const gradientChannels=[0,1,2,3].map(channel=>{const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=channel<3;input.disabled=channel===3&&model.version!=='2.1';input.setAttribute('aria-label','Gradient '+['Red','Green','Blue','Alpha'][channel]);label.append(input,document.createTextNode(['R','G','B','A'][channel]));if(input.disabled)label.title='Palette alpha gradients require SFF2.1. Older SFF versions support RGB gradients only.';document.getElementById('paletteGradient').before(label);return input});
  const saveGradientRgba=document.createElement('button');saveGradientRgba.className='tool';saveGradientRgba.textContent='Save Reviewed RGBA Colors…';saveGradientRgba.disabled=model.version!=='2.1';saveGradientRgba.title=model.version==='2.1'?'Review RGB and alpha changes together; slot0 alpha stays locked.':'RGBA color writes require SFF2.1; use Save Color Edits for RGB.';document.getElementById('paletteGradient').after(saveGradientRgba);saveGradientRgba.onclick=()=>vscode.postMessage({type:'savePaletteRgbaEdits',paletteIndex:Number(document.getElementById('paletteSelect').value),colors:displayedPaletteColors});
  document.getElementById('savePaletteEdits').textContent='Save RGB Color Edits…';
  document.getElementById('savePaletteEdits').title='Save RGB only; existing alpha values stay unchanged. To save an alpha gradient in SFF2.1 use Save Reviewed RGBA Colors.';
  document.getElementById('paletteGradient').title='Interpolate checked channels by selected index order. Slot0 alpha stays locked. Use the separate reviewed RGBA save for alpha changes.';
  document.getElementById('paletteGradient').onclick=()=>{try{previewPaletteOperation(fillGradient(operationBase(),paletteBatchIndices(),gradientChannels.map(input=>input.checked)),'Selected-index gradient'+(gradientChannels[3].checked?' (RGBA; use reviewed RGBA save)':' (RGB)'))}catch(error){operationError(error)}};
  document.getElementById('paletteSwap').onclick=()=>{try{previewPaletteOperation(swapSelected(operationBase(),paletteBatchIndices()),'Two selected indexes swapped')}catch(error){operationError(error)}};
  document.getElementById('paletteReverseSelection').onclick=()=>{try{previewPaletteOperation(reverseSelected(operationBase(),paletteBatchIndices()),'Selected index order reversed')}catch(error){operationError(error)}};
  document.getElementById('paletteAnalyzeDuplicates').onclick=()=>{try{const groups=duplicateGroups(operationBase()),report=document.getElementById('paletteSelectionReport');report.textContent=groups.length?groups.slice(0,24).map(group=>'RGB '+group.rgb+' → indexes '+group.indices.join(', ')).join('\\n')+(groups.length>24?'\\n…and '+(groups.length-24)+' more group(s).':''):'No exact duplicate RGB entries were found.'}catch(error){operationError(error)}};
  window.paletteSelectionApi={indices:paletteBatchIndices,copyReferenceColors(colors,sourceIndices){const targets=paletteBatchIndices(),source=normalizeIndices(sourceIndices);if(!source.length)throw new Error('Select reference colors first.');if(!targets.length)throw new Error('Select target indexes first.');if(source.length!==targets.length&&source.length!==1)throw new Error('Select the same number of source and target indexes, or one source color for every target.');const output=normalizePalette(operationBase());targets.forEach((target,position)=>{const color=colors[source.length===1?source[0]:source[position]];output[target]=[byte(color[0]),byte(color[1]),byte(color[2]),output[target][3]]});previewPaletteOperation(output,'Copied '+source.length+' reference color selection into '+targets.length+' target index(es)')}};
  const orderLabel=document.createElement('label');orderLabel.textContent='Sort order ';
  const orderSelect=document.createElement('select');
  orderSelect.add(new Option('Ascending','ascending'));orderSelect.add(new Option('Descending','descending'));
  orderLabel.append(orderSelect);document.getElementById('paletteReverseSelection').after(orderLabel);
  for(const [criterion,label] of [['hue','Sort Selected by Hue…'],['brightness','Sort Selected by Brightness…']]) {
    const button=document.createElement('button');button.className='tool';button.textContent=label;
    button.title='Review the selected colors in this order. Sprite indices follow the colors. Slot 0 stays locked.';
    button.onclick=()=>vscode.postMessage({type:'sortPaletteSlots',paletteIndex:Number(document.getElementById('paletteSelect').value),slots:paletteBatchIndices().filter(index=>index!==0),criterion,descending:orderSelect.value==='descending'});
    orderLabel.parentNode.insertBefore(button,orderLabel.nextSibling);
  }
  for(const [mode,label] of [['combine','Combine Into New…'],['merge','Merge and Update Sprites…']]) {
    const button=document.createElement('button');button.className='tool';button.textContent=label;
    button.onclick=()=>vscode.postMessage({type:'mergePaletteTables',mode});
    document.getElementById('paletteAnalyzeDuplicates').after(button);
  }
  for(const [action,label] of [['duplicates','Find Duplicate Palettes…'],['unlink','Unlink Palettes…']]) {
    const button=document.createElement('button');button.className='tool';button.textContent=label;
    button.onclick=()=>vscode.postMessage({type:'paletteSharing',action});
    document.getElementById('paletteAnalyzeDuplicates').after(button);
  }
  renderPaletteBatchSelection();`;
}

module.exports = { byte, normalizePalette, normalizeIndices, adjustRgb, adjustHsl, applyPreset, fillGradient, swapSelected, reverseSelected, duplicateGroups, selectionHtml, selectionClientScript };
