'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const editor = require('../src/palette_sprite_editor_client');

const client = editor.clientScript();
const pairs=Array.from({length:100},(_,index)=>({from:index,to:index})),before=pairs.map(pair=>({...pair}));
assert.deepStrictEqual(editor.assignRemapIndex(pairs,37,201,0),{pair:37,index:201,side:'from',from:201,to:37},'left click assigns only the selected pair old/source index');
assert.deepStrictEqual(editor.assignRemapIndex(pairs,37,202,2),{pair:37,index:202,side:'to',from:201,to:202},'right click assigns only the selected pair new/replacement index');
editor.assignRemapIndex(pairs,38,38,0,[1,2,3,255]);
assert.deepStrictEqual(pairs[38].fromColor,[1,2,3,255],'Remappen assignment can retain an independent RGBA snapshot');
assert.deepStrictEqual(pairs.reduce((changed,pair,index)=>{if(pair.from!==before[index].from||pair.to!==before[index].to)changed.push(index);return changed},[]),[37],'Remappen assignment cannot alter a neighboring pair');
const painted={dataset:{},style:{setProperty(name,value,priority){this.record={name,value,priority}}}};editor.paintRemapSwatch(painted,'rgba(1,2,3,1)');assert.strictEqual(painted.dataset.viewerColorSwatch,'true');assert.deepStrictEqual(painted.style.record,{name:'background-color',value:'rgba(1,2,3,1)',priority:'important'},'Remappen swatches retain their exact color against semantic toolbar button tinting');
const sample=Buffer.from([0,1,2,127,128,254,255]),encoded=sample.toString('base64');
assert.deepStrictEqual([...editor.decodeIndexPlane(encoded,sample.length)],[...sample],'standard Base64 index pixels decode without relying on browser atob');
assert.deepStrictEqual([...editor.decodeIndexPlane(`  ${encoded.replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}\n`,sample.length)],[...sample],'URL-safe, unpadded, and whitespace-wrapped index pixels decode deterministically');
assert.throws(()=>editor.decodeIndexPlane('not valid!',sample.length),/malformed/,'invalid index data fails once with a specific bounded error');
for (const marker of [
  "['hand','✋','Move canvas']",
  "['move','✥','Move selection']",
  "['rect','▭','Rectangle selection']",
  "['lasso','⌁','Free selection']",
  "['wand','✦','Magic wand']",
  "['picker','⌾','Color picker · left primary, right secondary']",
  "['pen','✎','Pen']",
  "['eraser','⌫','Eraser (index 0)']",
  "['remap','✎','Remappen pencil · replaces only the active old/source color with its new/replacement color']",
  "['bucket','▰','Paint bucket']",
  'Array.from({length:100}',
  "textContent='Remappen 1–100'",
  'Old / source ↑',
  'New / replacement ↓',
  'sprite-tools" hidden',
  "event.key==='+'",
  "event.key==='-'",
  "addEventListener('wheel'",
  "{passive:false}",
  'id="spritePixelGrid"',
  'id="spriteExpandViewer"',
  "expanded=retained?.expanded===true",
  "event.key==='Escape'&&expanded",
  'const gridVisible=pixelGrid&&zoom>=4',
  'data-editor-section="layers"',
  'data-editor-section="masks"',
  'Create mask from selection',
  'Remove active-layer mask',
  "post('spritePixelReview'",
  'ikemenSelectSpriteIndex',
  'dual-palette-layout',
  "post('migrationPlace'",
  'Create / Update Palette Template',
  "activeMode='template'",
  'spriteEditorAttempted',
  'paletteEnhancementQueued'
]) assert(client.includes(marker), `missing sprite editor contract: ${marker}`);
assert(client.includes("attachLiveSpriteEditor(host,live,post)!==true"), 'failed or early indexed-editor attachment remains retryable and visibly reports the reason');
assert(!client.includes('atob(model.indexPlane)'), 'sprite tools use the bounded decoder rather than fragile browser atob');
assert(client.includes("spriteEditorAttempted='failed'"), 'a failed tool start is latched for the current render instead of recursively adding errors');
assert.strictEqual((client.match(/id="spriteRemapPairsPrimary"/g)||[]).length,1,'the 100 Remappen pairs have one authoritative dock beside Bank A');
assert(client.includes("primaryDock.querySelector('h4').textContent='Remappen 1–100'"), 'the compact Bank A dock is promoted to all 100 Remappen pairs');
assert(client.includes('primaryRoot.append(cell)'), 'all 100 Remappen pairs render into the same compact grid');
assert(client.includes('function renderPairs(){const primaryRoot=primaryPairs'), 'the reparented Remappen dock redraws through its stable editor-owned reference');
assert(!client.includes("function renderPairs(){const primaryRoot=mount.querySelector('#spriteRemapPairsPrimary')"), 'Remappen redraw does not search its former parent after the dock moves beside Bank A');
assert(client.includes("snapshot=pair[side+'Color']"), 'Remappen swatches prefer their independent saved RGBA snapshots when Bank A changes');
assert(client.includes("assigned?css(pair[side]):'transparent'"), 'assigned legacy Remappen colors still render while unassigned pairs stay visibly empty');
assert(client.includes('mount.ikemakerUseSpriteIndex=assignSpriteIndex;primaryDock.ikemakerUseSpriteIndex=assignSpriteIndex'), 'the mounted editor and its reparented Remappen dock retain one direct indexed-color assignment owner');
assert(client.includes("retained?.remapSchema===2"),'legacy identity-filled Remappen state is discarded instead of silently mirroring Bank A');
assert(client.includes("{from:null,to:null,fromColor:null,toColor:null}"),'Remappen starts as independent empty pairs without live palette color references');
assert(client.includes('ikemakerCloneUniqueRemap=cloneUniqueRemap'),'the editor exposes an explicit bounded clone route without coupling pairs to Bank A');
assert(client.includes('overflowDock?.remove()'), 'the obsolete lower viewer-side Remappen dock is removed after its hidden image tools are preserved');
assert.match(editor.styles(),/grid-template-columns:repeat\(10,16px\)/,'Remappen uses the same fixed 16-pixel swatch width as Bank A and Bank B');
assert.match(editor.styles(),/grid-template-rows:16px 16px/,'each old/new Remappen pair uses two fixed 16-pixel swatches');
assert.match(editor.styles(),/\.remap-pair\{box-sizing:border-box;padding:0;border:0\}/,'the pair wrapper fits its 16-pixel grid track without padding or border overflow');
assert.match(editor.styles(),/\.sprite-editor\{grid-template-columns:minmax\(0,1fr\)\}/,'the viewer and its controls span the previously reserved left column');
assert(client.includes('overflowDock?.remove()'),'the old viewer-side Remappen overflow cannot reserve space beside or below the viewer');
assert.match(editor.styles(),/sprite-viewer-expanded[^}]*grid-column:1\/-1/,'expanded viewer takes the full workshop width');
assert.match(editor.styles(),/dual-bank-live:has\(>\.sprite-viewer-expanded\)>\.live-controls\{display:none\}/,'expanded viewer can cover the compact workshop controls');
assert(client.includes("mount.addEventListener('keydown',event=>{if(event.key==='Escape'&&expanded)"), 'Escape restores the workspace from anywhere inside the expanded editor, including its focused button');
assert(client.includes("mount.addEventListener('ikemaker-use-sprite-index'"), 'banks and the color editor can assign an indexed color through the owning sprite editor without a global bridge');
assert(client.includes("if(tool==='remap')assigned=assignRemapIndex(pairs,activePair,index,button,color)"), 'Remappen uses the tested left-click old/source and right-click new/replacement assignment owner with an independent color snapshot');
assert(client.includes("if(tool==='picker'){if(event.button===2)secondary=sampled;else primary=sampled"), 'the sprite color picker samples primary and secondary indexes directly from the image');
assert(client.includes('displayIndex=index=>index<0?0:paletteIndexMap[index]'), 'uncovered layered pixels normalize to transparent index 0 before picker or Remappen assignment');
assert(client.includes('setPaletteIndexMap(event.detail.indexMap)'), 'Preview B can retain color identity through a non-destructive old-index to new-index map');
assert(client.includes('dimUnselected=event.detail.dimUnselected===true'), 'the sprite editor accepts the non-destructive focus-preview toggle');
assert(client.includes('lightenUnselected=event.detail.lightenUnselected===true'), 'the sprite editor accepts the non-destructive lighten-preview toggle');
assert(client.includes('shade=dimUnselected&&unselected?0.22:1'), 'unselected sprite colors darken while selected palette indexes retain full brightness');
assert(client.includes('lighten=lightenUnselected&&unselected?0.62:0'), 'unselected sprite colors lighten while selected palette indexes retain their original colors');
assert(client.includes('storageIndex(button)'), 'drawing through a retained preview map converts visible indexes back to stored sprite indexes');
assert.match(editor.styles(),/\.sprite-pixel-grid\{[^}]*pointer-events:none/,'the zooming pixel grid is a non-interactive screen-space overlay');
assert(client.includes("gridOverlay.style.backgroundSize=zoom+'px '+zoom+'px'"), 'each grid cell tracks one sprite pixel at the current zoom');
assert(client.includes("if(zoom<4)zoom=4"), 'turning on Pixel Grid below 400% immediately zooms to a visible grid instead of silently doing nothing');
assert(client.includes("setAttribute('aria-pressed',String(gridVisible))"), 'Pixel Grid reports its actual visible state rather than a hidden preference');
assert(!client.includes("ctx.strokeStyle='rgba(255,255,255,.24)'"), 'grid lines are not rasterized into the low-resolution sprite canvas where zoom would thicken them');
assert(client.includes("new CustomEvent('ikemaker-sprite-color-picked'"), 'sprite image sampling synchronizes the visible palette banks and rectangular color controls');
assert(!client.includes("if(tool==='remap'&&!event.shiftKey)"), 'Remappen canvas input never silently switches back into old/new sampling');
assert(client.includes("paintAt(p.x,p.y,tool==='eraser'?0:storageIndex(button),tool==='remap')"), 'Remappen is a direct pencil operation through the exact old-to-new paint filter');
assert(client.includes("p[at]===from)p[at]=remap?to:value"), 'Remappen changes only pixels whose index matches the selected old/source value');
assert(client.includes("['pen','eraser','remap'].includes(tool)"), 'Pen, Eraser, and Remappen all share the exact brush-footprint preview');
assert(client.includes("brushPreview.style.width=(brush*zoom)+'px'"), 'the canvas footprint matches the selected size at the current zoom');
assert(client.includes("brush+' × '+brush+' px'"), 'tool size has an explicit pixel readout');
for(const cursor of ['sprite-canvas-hand','sprite-canvas-move','sprite-canvas-wand','sprite-canvas-picker','sprite-canvas-remap'])assert(editor.styles().includes(cursor),`missing tool cursor style: ${cursor}`);

const controller = fs.readFileSync(path.join(__dirname, '..', 'src', 'palette_workspace_controller.js'), 'utf8');
assert.match(controller, /action === 'spritePixelReview'/);
assert.match(controller, /pixelPickToken\(archive,sprite,original\)/);
assert.match(controller, /replacementSourcePath:filename/);

const creator = fs.readFileSync(path.join(__dirname, '..', 'src', 'sff_creator_workspace.js'), 'utf8');
assert.match(creator, /request\?\.replacementSourcePath/);

console.log('Palette sprite editor exposes zoom, canvas tools, 100 remap pairs, bidirectional index picking, layers, and reviewed SFF replacement handoff');
