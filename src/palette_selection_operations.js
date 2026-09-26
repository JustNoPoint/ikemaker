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
function fillGradient(colors, indices) {
  const selected = normalizeIndices(indices); if (selected.length < 2) throw new Error('Select at least two indexes for a gradient.'); const output = normalizePalette(colors), first = output[selected[0]].slice(), last = output[selected[selected.length - 1]].slice();
  selected.forEach((index, position) => { const amount = position / (selected.length - 1); output[index] = [0, 1, 2].map((channel) => byte(first[channel] + (last[channel] - first[channel]) * amount)).concat(output[index][3]); }); return output;
}
function swapSelected(colors, indices) { const selected = normalizeIndices(indices); if (selected.length !== 2) throw new Error('Select exactly two indexes to swap.'); const output = normalizePalette(colors), a = output[selected[0]].slice(0, 3), b = output[selected[1]].slice(0, 3); output[selected[0]].splice(0, 3, ...b); output[selected[1]].splice(0, 3, ...a); return output; }
function reverseSelected(colors, indices) { const selected = normalizeIndices(indices); if (selected.length < 2) throw new Error('Select at least two indexes to reverse.'); const output = normalizePalette(colors), rgb = selected.map((index) => output[index].slice(0, 3)).reverse(); selected.forEach((index, position) => output[index].splice(0, 3, ...rgb[position])); return output; }
function duplicateGroups(colors) { const groups = new Map(); normalizePalette(colors).forEach((color, index) => { const key = color.slice(0, 3).join(','); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(index); }); return [...groups].filter(([, indices]) => indices.length > 1).map(([rgb, indices]) => ({ rgb, indices })); }

function selectionHtml() {
  return '<hr><details><summary><b>Selected Index Operations</b></summary><p class="muted">Click an index normally to select one. Ctrl-click selects specific indexes; Shift-click selects a range. Every operation updates the preview only. Use Save Color Edits separately after reviewing the sprite.</p><div class="palette-toolbar"><button id="paletteSelectAll" class="tool">Select All 256</button><button id="paletteClearSelection" class="tool">Clear</button><span id="paletteSelectionStatus" class="muted">0 indexes selected</span></div><div class="palette-color-editor"><label>Red ±</label><input id="paletteDeltaR" type="number" value="0"><label>Green ±</label><input id="paletteDeltaG" type="number" value="0"><label>Blue ±</label><input id="paletteDeltaB" type="number" value="0"><span></span><button id="paletteApplyRgb" class="tool">Preview RGB</button><label>Hue °</label><input id="paletteDeltaH" type="number" value="0"><label>Saturation ±</label><input id="paletteDeltaS" type="number" value="0"><label>Lightness ±</label><input id="paletteDeltaL" type="number" value="0"><span></span><button id="paletteApplyHsl" class="tool">Preview HSL</button></div><div class="palette-toolbar"><select id="palettePreset" title="Transform only the selected indexes"><option value="lighten">Lighten</option><option value="darken">Darken</option><option value="grayscale">Grayscale</option><option value="invert">Invert RGB</option><option value="hue-positive">Hue +120°</option><option value="hue-negative">Hue −120°</option></select><button id="paletteApplyPreset" class="tool">Preview Preset</button><button id="paletteGradient" class="tool" title="Interpolate between the first and last selected colors across the selected indexes">Create Gradient</button><button id="paletteSwap" class="tool" title="Exchange RGB values between exactly two selected indexes">Swap Two</button><button id="paletteReverseSelection" class="tool" title="Reverse RGB order only across selected indexes">Reverse Selection</button><button id="paletteAnalyzeDuplicates" class="tool" title="Report identical RGB entries without merging or reindexing them">Find Exact Duplicates</button></div><div id="paletteSelectionReport" class="status-list muted">No analysis run. Duplicate-looking indexes are never merged automatically because CS materials may require separate identities.</div></details>';
}

function selectionClientScript() {
  const functions = [byte, normalizePalette, normalizeIndices, mapSelected, rgbToHsl, hslToRgb, adjustRgb, adjustHsl, applyPreset, fillGradient, swapSelected, reverseSelected, duplicateGroups].map((fn) => fn.toString()).join('\n');
  return `${functions}
  const paletteBatchSelection=new Set();let paletteBatchAnchor=null;
  function paletteBatchIndices(){return normalizeIndices([...paletteBatchSelection])}
  function renderPaletteBatchSelection(){for(const swatch of document.querySelectorAll('#paletteGrid .palette-swatch'))swatch.classList.toggle('batch-selected',paletteBatchSelection.has(Number(swatch.dataset.index)));const indices=paletteBatchIndices(),status=document.getElementById('paletteSelectionStatus');status.textContent=indices.length+' index'+(indices.length===1?'':'es')+' selected'+(indices.length&&indices.length<12?' · '+indices.join(', '):'')}
  function previewPaletteOperation(colors,label){importedPaletteColors=colors.map(color=>color.slice());previewPaletteIndex=null;showPalette(importedPaletteColors,label);renderPaletteBatchSelection();requestCurrentSprite();requestLayers();requestOnion()}
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
  document.getElementById('paletteGradient').onclick=()=>{try{previewPaletteOperation(fillGradient(operationBase(),paletteBatchIndices()),'Selected-index gradient')}catch(error){operationError(error)}};
  document.getElementById('paletteSwap').onclick=()=>{try{previewPaletteOperation(swapSelected(operationBase(),paletteBatchIndices()),'Two selected indexes swapped')}catch(error){operationError(error)}};
  document.getElementById('paletteReverseSelection').onclick=()=>{try{previewPaletteOperation(reverseSelected(operationBase(),paletteBatchIndices()),'Selected index order reversed')}catch(error){operationError(error)}};
  document.getElementById('paletteAnalyzeDuplicates').onclick=()=>{try{const groups=duplicateGroups(operationBase()),report=document.getElementById('paletteSelectionReport');report.textContent=groups.length?groups.slice(0,24).map(group=>'RGB '+group.rgb+' → indexes '+group.indices.join(', ')).join('\\n')+(groups.length>24?'\\n…and '+(groups.length-24)+' more group(s).':''):'No exact duplicate RGB entries were found.'}catch(error){operationError(error)}};
  window.paletteSelectionApi={indices:paletteBatchIndices,copyReferenceColors(colors,sourceIndices){const targets=paletteBatchIndices(),source=normalizeIndices(sourceIndices);if(!source.length)throw new Error('Select reference colors first.');if(!targets.length)throw new Error('Select target indexes first.');if(source.length!==targets.length&&source.length!==1)throw new Error('Select the same number of source and target indexes, or one source color for every target.');const output=normalizePalette(operationBase());targets.forEach((target,position)=>{const color=colors[source.length===1?source[0]:source[position]];output[target]=[byte(color[0]),byte(color[1]),byte(color[2]),output[target][3]]});previewPaletteOperation(output,'Copied '+source.length+' reference color selection into '+targets.length+' target index(es)')}};
  renderPaletteBatchSelection();`;
}

module.exports = { byte, normalizePalette, normalizeIndices, adjustRgb, adjustHsl, applyPreset, fillGradient, swapSelected, reverseSelected, duplicateGroups, selectionHtml, selectionClientScript };
