'use strict';

function byte(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(255, Math.round(number))) : 0;
}

function normalizePalette(colors) {
  if (!Array.isArray(colors) || colors.length !== 256) throw new Error('A reference palette must contain exactly 256 indexed colors.');
  return colors.map((color, index) => {
    if (!Array.isArray(color) || color.length < 3) throw new Error(`Reference palette index ${index} is invalid.`);
    return [byte(color[0]), byte(color[1]), byte(color[2]), color.length > 3 ? byte(color[3]) : (index === 0 ? 0 : 255)];
  });
}

function parseIndexMacro(text) {
  const mappings = [], destinations = new Set();
  for (const [offset, raw] of String(text || '').split(/\r?\n/).entries()) {
    const line = raw.replace(/(?:#|;).*$/, '').trim();
    if (!line) continue;
    const match = /^(\d+)\s*(?:=|<-|←)\s*(\d+)$/.exec(line);
    if (!match) throw new Error(`Macro line ${offset + 1} must use destination=source, for example 32=18.`);
    const destination = Number(match[1]), source = Number(match[2]);
    if (destination > 255 || source > 255) throw new Error(`Macro line ${offset + 1} uses an index outside 0-255.`);
    if (destinations.has(destination)) throw new Error(`Macro destination ${destination} is assigned more than once.`);
    destinations.add(destination); mappings.push({ destination, source });
  }
  if (!mappings.length) throw new Error('Enter at least one destination=source mapping.');
  return mappings;
}

function applyIndexMacro(colors, mappings) {
  const source = normalizePalette(colors), result = source.map((color) => color.slice());
  for (const mapping of mappings || []) {
    const destination = Number(mapping.destination), sourceIndex = Number(mapping.source);
    if (!Number.isInteger(destination) || destination < 0 || destination > 255 || !Number.isInteger(sourceIndex) || sourceIndex < 0 || sourceIndex > 255) throw new Error('Palette macro indexes must be whole values from 0 through 255.');
    result[destination] = source[sourceIndex].slice();
  }
  return result;
}

function trayHtml() {
  return '<hr><details open><summary><b>Reference Palette Tray</b></summary><p class="muted">Load many ACT or indexed PNG palettes without changing the SFF. Select several entries for batch export; the focused entry supplies the reference grid. Click one reference color to copy it. Ctrl-click or Shift-click selects several colors; drag them onto a target index or copy them into an equally sized target selection.</p><div class="palette-toolbar"><button id="loadReferencePalettes" class="tool" title="Load one or more ACT or indexed PNG palettes into this temporary reference tray">Load Palettes / Images…</button><button id="removeReferencePalettes" class="tool" title="Remove selected references from this temporary tray without deleting their files">Remove Selected</button><button id="clearReferencePalettes" class="tool" title="Clear the temporary reference tray without deleting files">Clear Tray</button></div><select id="referencePaletteSelect" multiple size="6" style="width:100%;margin:7px 0" title="Ctrl/Command-click to select specific references; Shift-click to select a range"><option>No reference palettes loaded</option></select><div id="referencePaletteInfo" class="muted">References are session-only and non-destructive.</div><div id="referencePaletteGrid" class="palette-grid"></div><div class="palette-toolbar"><button id="previewReferencePalette" class="tool" title="Preview the focused reference palette on the current sprite without changing the SFF">Preview Focused</button><button id="copyReferenceSelection" class="tool" title="Copy selected reference colors into the selected target indexes">Copy Selection → Target</button><label class="muted" title="The target is the selected index in the embedded palette editor">Target index <span id="referenceTargetIndex">0</span></label></div><details><summary><b>Batch table conversion and index macro</b></summary><p class="muted">Enable <b>Flip 256-color table order</b> when palettes came from an application that stores its table opposite Photoshop. This reverses the RGB table while preserving transparency at its intended index. Optional macro lines use <code>destination=source</code>; for example, <code>32=18</code> copies old index 18 into new index 32. Preview first; batch export writes new ACT files and never overwrites originals.</p><label title="Reverse the 256 RGB entries before applying optional index mappings"><input id="referenceFlipTable" type="checkbox" style="width:auto;margin:0"> Flip 256-color table order</label><textarea id="referencePaletteMacro" rows="6" style="width:100%;resize:vertical;margin-top:7px" placeholder="Optional index mapping:&#10;32=18&#10;33=19"></textarea><div class="palette-toolbar"><button id="previewReferenceMacro" class="tool" title="Preview the table flip and optional index mapping on the focused reference">Preview Conversion</button><button id="saveReferenceMacro" class="tool" title="Save the table-flip choice and reusable index mapping as a small IKEMaker JSON file">Save Conversion…</button><button id="loadReferenceMacro" class="tool" title="Load a previously saved IKEMaker palette conversion">Load Conversion…</button><button id="exportReferenceBatch" class="tool" title="Apply the table flip and optional mapping to every selected reference and export new ACT files">Batch Export Converted…</button></div></details><div id="referencePaletteStatus" class="status-list muted">Nothing loaded.</div></details>';
}

function trayClientScript() {
  return `
  let referencePalettes=[],focusedReferenceId=null,referenceSelectedIndices=new Set(),referenceAnchor=null;
  function referenceSelection(){const select=document.getElementById('referencePaletteSelect');return [...select.selectedOptions].map(option=>option.value).filter(Boolean)}
  function focusedReference(){return referencePalettes.find(item=>item.id===focusedReferenceId)||referencePalettes[0]||null}
  function renderReferenceGrid(){const grid=document.getElementById('referencePaletteGrid'),item=focusedReference();grid.textContent='';document.getElementById('referencePaletteInfo').textContent=item?(item.name+' · '+item.kind+' · 256 colors · '+referenceSelectedIndices.size+' color(s) selected'):'References are session-only and non-destructive.';if(!item)return;item.colors.forEach((color,index)=>{const swatch=document.createElement('button');swatch.className='palette-swatch'+(color[3]===0?' transparent':'')+(referenceSelectedIndices.has(index)?' batch-selected':'');swatch.style.background=color[3]===0?'':('rgb('+color[0]+','+color[1]+','+color[2]+')');swatch.dataset.index=index;swatch.draggable=true;swatch.title='Reference index '+index+' · RGBA '+color.join(', ')+' · click copies one; Ctrl/Shift selects several; drag selection to target';swatch.onclick=event=>{if(event.shiftKey&&referenceAnchor!==null){for(let at=Math.min(index,referenceAnchor);at<=Math.max(index,referenceAnchor);at++)referenceSelectedIndices.add(at);renderReferenceGrid();return}if(event.ctrlKey||event.metaKey){referenceSelectedIndices.has(index)?referenceSelectedIndices.delete(index):referenceSelectedIndices.add(index);referenceAnchor=index;renderReferenceGrid();return}referenceSelectedIndices=new Set([index]);referenceAnchor=index;previewPaletteColor(color);document.getElementById('referencePaletteStatus').textContent='Copied '+item.name+' index '+index+' into target index '+selectedColorIndex+'. Preview only; use Save Color Edits to commit deliberately.';renderReferenceGrid()};swatch.ondragstart=event=>{if(!referenceSelectedIndices.has(index))referenceSelectedIndices=new Set([index]);const indices=normalizeIndices([...referenceSelectedIndices]);event.dataTransfer.setData('application/x-ikemaker-palette-colors',JSON.stringify({indices,colors:indices.map(at=>item.colors[at])}));event.dataTransfer.effectAllowed='copy'};grid.append(swatch)})}
  function renderReferenceList(){const select=document.getElementById('referencePaletteSelect'),before=new Set(referenceSelection());select.textContent='';for(const item of referencePalettes){const option=document.createElement('option');option.value=item.id;option.textContent=item.name;option.selected=before.has(item.id);select.append(option)}if(!referencePalettes.length){const option=document.createElement('option');option.textContent='No reference palettes loaded';option.value='';select.append(option)}if(!focusedReferenceId||!referencePalettes.some(item=>item.id===focusedReferenceId))focusedReferenceId=referencePalettes[0]?.id||null;for(const id of ['removeReferencePalettes','clearReferencePalettes','previewReferencePalette','copyReferenceSelection','previewReferenceMacro','exportReferenceBatch'])document.getElementById(id).disabled=!referencePalettes.length;renderReferenceGrid()}
  document.getElementById('loadReferencePalettes').onclick=()=>vscode.postMessage({type:'loadReferencePalettes'});
  document.getElementById('removeReferencePalettes').onclick=()=>vscode.postMessage({type:'removeReferencePalettes',ids:referenceSelection()});
  document.getElementById('clearReferencePalettes').onclick=()=>vscode.postMessage({type:'clearReferencePalettes'});
  document.getElementById('referencePaletteSelect').onchange=e=>{focusedReferenceId=e.target.value||referenceSelection().at(-1)||focusedReferenceId;referenceSelectedIndices.clear();referenceAnchor=null;renderReferenceGrid()};
  document.getElementById('previewReferencePalette').onclick=()=>{const item=focusedReference();if(!item)return;importedPaletteColors=item.colors.map(color=>color.slice());previewPaletteIndex=null;showPalette(importedPaletteColors,'Reference: '+item.name);requestCurrentSprite();requestLayers();requestOnion();document.getElementById('referencePaletteStatus').textContent='Previewing '+item.name+'. No SFF data changed.'};
  document.getElementById('copyReferenceSelection').onclick=()=>{try{const item=focusedReference();if(!item)return;window.paletteSelectionApi.copyReferenceColors(item.colors,[...referenceSelectedIndices]);document.getElementById('referencePaletteStatus').textContent='Copied selected reference colors into selected target indexes. Preview only.'}catch(error){document.getElementById('referencePaletteStatus').textContent=error.message}};
  document.getElementById('previewReferenceMacro').onclick=()=>{const item=focusedReference();if(item)vscode.postMessage({type:'previewReferenceMacro',id:item.id,macro:document.getElementById('referencePaletteMacro').value,flipTable:Boolean(document.getElementById('referenceFlipTable').checked)})};
  document.getElementById('saveReferenceMacro').onclick=()=>vscode.postMessage({type:'saveReferenceMacro',macro:document.getElementById('referencePaletteMacro').value,flipTable:Boolean(document.getElementById('referenceFlipTable').checked)});
  document.getElementById('loadReferenceMacro').onclick=()=>vscode.postMessage({type:'loadReferenceMacro'});
  document.getElementById('exportReferenceBatch').onclick=()=>vscode.postMessage({type:'exportReferenceBatch',ids:referenceSelection().length?referenceSelection():referencePalettes.map(item=>item.id),macro:document.getElementById('referencePaletteMacro').value,flipTable:Boolean(document.getElementById('referenceFlipTable').checked)});
  window.addEventListener('message',event=>{const message=event.data;if(message.type==='referencePaletteList'){referencePalettes=message.items||[];focusedReferenceId=message.focusedId||focusedReferenceId;renderReferenceList();document.getElementById('referencePaletteStatus').textContent=referencePalettes.length?(referencePalettes.length+' reference palette(s) loaded. Select several for batch adaptation.'):'Nothing loaded.'}else if(message.type==='referenceMacroPreview'){importedPaletteColors=message.colors.map(color=>color.slice());previewPaletteIndex=null;showPalette(importedPaletteColors,'Converted reference: '+message.name);requestCurrentSprite();requestLayers();requestOnion();document.getElementById('referencePaletteStatus').textContent='Previewing '+(message.flipped?'table flip'+(message.mappingCount?' plus ':''):'')+(message.mappingCount?message.mappingCount+' index mapping(s)':'')+' on '+message.name+'. No SFF data changed.'}else if(message.type==='referenceMacroLoaded'){document.getElementById('referencePaletteMacro').value=message.macro||'';document.getElementById('referenceFlipTable').checked=Boolean(message.flipTable);document.getElementById('referencePaletteStatus').textContent='Loaded conversion '+message.name+': '+(message.flipTable?'table flip, ':'')+message.mappingCount+' mapping(s).'}else if(message.type==='referenceBatchExported'){document.getElementById('referencePaletteStatus').textContent='Exported '+message.count+' converted ACT palette(s) to '+message.folder+'. Originals were not changed.'}});
  renderReferenceList();
  `;
}

module.exports = { normalizePalette, parseIndexMacro, applyIndexMacro, trayHtml, trayClientScript };
