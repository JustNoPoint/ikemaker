'use strict';
const {
  normalizePreviewLayers,
  editPreviewLayers,orderedPreviewLayers,movePreviewLayer
} = require('./preview_layers_model');

function installSffPreviewLayers(normalizePreviewLayers, editPreviewLayers, layerList, moveLayer, launcher, compactFields,sharedClient) {
  let composition = normalizePreviewLayers(model.previewLayers),
    drag = null,
    xHeld = false;
  const supportedBlends = ['normal', 'add', 'subtract', 'multiply', 'screen'];
  globalThis.ikemenSffPreviewMode = true;
  const sourceRedraw = redraw,
    sourceHandlers = Object.fromEntries(['onpointerdown', 'onpointermove', 'onpointerup', 'onpointercancel', 'oncontextmenu'].map(key => [key, canvas[key]]));
  const pane = document.createElement('aside');
  pane.id = 'sffPreviewLayers';
  pane.className = 'rail';
  pane.setAttribute('aria-label', 'Preview layers');
  pane.style.cssText = 'width:230px;min-width:185px;max-width:48%;resize:horizontal;overflow:auto;flex-shrink:0';
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;width:100%;max-width:100%;min-width:0;box-sizing:border-box;min-height:140px;flex:1;overflow:hidden';
  stage.before(wrap);
  wrap.append(pane, stage);
  stage.style.flex = '1';
  stage.style.minWidth = '0';
  stage.style.width = '0';
  stage.style.maxWidth = '100%';
  stage.style.boxSizing = 'border-box';
  canvas.style.width='100%';canvas.style.maxWidth='100%';canvas.style.minWidth='0';
  const heading = document.createElement('h3');
  heading.textContent = 'Preview layers';
  pane.append(heading);
  const list = document.createElement('div');
  list.setAttribute('role', 'group');
  list.setAttribute('aria-label', 'Select preview layers');
  pane.append(list);
  const tools = document.createElement('div');
  tools.className = 'toolbar';
  pane.append(tools);
  const add = document.createElement('button'),
    remove = document.createElement('button');
  add.textContent = 'Add layer';
  remove.textContent = 'Remove';
  const airButton = document.createElement('button');
  airButton.textContent = 'Create layer animations…';
  airButton.title = 'Copy the base action timing and use this layer’s matching sprites';
  airButton.onclick = () => vscode.postMessage({type:'createLayerAir', bindingGeneration:model.bindingGeneration, value:composition});
  const runtimeButton = document.createElement('button');
  runtimeButton.textContent = 'Use layer in game…';
  runtimeButton.title = 'For body details, use a fixed group offset and keep each base sprite’s index. This lets the layer follow the displayed pose in game.';
  runtimeButton.onclick = () => vscode.postMessage({type:'useCostumeLayer', bindingGeneration:model.bindingGeneration, value:composition});
  const reviewButton=document.createElement('button');
  reviewButton.textContent='Review existing layer…';
  reviewButton.title='Open existing runtime layer code and linked assets';
  reviewButton.onclick=()=>vscode.postMessage({type:'reviewExistingLayer',bindingGeneration:model.bindingGeneration});
  const importButton = document.createElement('button');
  importButton.textContent = 'Import layer from PSDs…';
  importButton.title = 'Use the saved frame mapping to add artwork to this SFF';
  importButton.onclick = () => vscode.postMessage({type:'importPsdCostumeBank', bindingGeneration:model.bindingGeneration, value:composition});
  importButton.hidden = !!model.transfer;
  tools.append(add, remove, importButton, airButton, reviewButton, runtimeButton);
  const mode = document.createElement('button');
  mode.id = 'sffPreviewSourceMode';
  mode.textContent = 'Edit saved sprite axes';
  mode.title = 'Switch to native SFF axis editing; writes follow the existing Save / Auto Save setting';
  pane.append(mode);
  const fields = document.createElement('div');
  fields.className = 'options';
  pane.append(fields);
  const status = document.createElement('p');
  status.className = 'muted';
  status.setAttribute('role', 'status');
  status.textContent = 'Project preview only. Drag the sprite, or use arrows, to move selected layers.';
  pane.append(status);
  const blendNote = document.createElement('p');
  blendNote.className = 'muted';
  blendNote.setAttribute('role', 'status');
  pane.append(blendNote);
  const controls = {};
  const layer = id => composition.layers.find(item => item.id === id);
  const primaryLayer = () => layer(composition.primary);
  const syncNativeLayerOrder = () => {
    const baseOrder = layer('base').order;
    for (let slot = 1; slot <= 4; slot++) {
      const input = document.getElementById('layerOrder' + slot);
      input.min = '-4';
      input.max = '4';
      input.value = String(layer('layer' + slot).order - baseOrder);
    }
  };
  const shared=sharedClient(model.sharedLayout,()=>composition, ()=>selected?selected.group+','+selected.number:null,m=>vscode.postMessage({...m,bindingGeneration:model.bindingGeneration}),()=>{renderLayerControls();requestLayers()},()=>persistComposition());
  shared.listen();
  const persistComposition = () => {
    vscode.setState(Object.assign({}, vscode.getState() || {}, {
      previewLayers: composition
    }));
    vscode.postMessage({
      type: 'savePreviewLayers',
      bindingGeneration: model.bindingGeneration,
      value: composition,bankEdits:shared.changed()
    })
  };
  const editSelectedLayers = patch => {
    if(Object.hasOwn(patch,'order')){shared.rank(composition.primary,Math.max(0,Math.min(4,Math.round(Number(patch.order)))));return;}

    composition = editPreviewLayers(composition, composition.selected, patch);
    persistComposition();
    renderLayerControls();
    requestLayers()
  };
  const sourcePicker = document.createElement('select');
  const sourceLabel = document.createElement('label');
  sourceLabel.textContent = 'Layer artwork';
  sourceLabel.htmlFor = sourcePicker.id = 'previewLayer_source';
  for (const [value, label] of [['sprite', 'Fixed sprite'], ...[1,2,3,4,5,6].map(bank => [String(bank), 'Follow base (group +' + bank * 10000 + ')'])]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    sourcePicker.append(option);
  }
  sourcePicker.onchange = () => {
    for (const item of composition.layers) {
      if (item.id === 'base' || !composition.selected.includes(item.id)) continue;
      item.source.kind = sourcePicker.value === 'sprite' ? 'sprite' : 'bank';
      if (item.source.kind === 'bank') item.source.bank = Number(sourcePicker.value);
    }
    persistComposition();
    renderLayerControls();
    requestLayers();
  };
  fields.append(sourceLabel, sourcePicker);
  for (const [key, label, type] of [
      ['group', 'Sprite group', 'number'],
      ['index', 'Sprite index', 'number'],
      ['x', 'X offset', 'number'],
      ['y', 'Y offset', 'number'],
      ['scaleX', 'Scale X', 'number'],
      ['scaleY', 'Scale Y', 'number'],
      ['angle', 'Angle', 'number'],
      ['opacity', 'Opacity', 'number'],
      ['order', 'Draw order', 'number'],
      ['flipX', 'Flip X', 'checkbox'],
      ['flipY', 'Flip Y', 'checkbox'],
      ['blend', 'Blend', 'select']
    ]) {
    const caption = document.createElement('label'),
      input = document.createElement(type === 'select' ? 'select' : 'input');
    input.id = 'previewLayer_' + key;
    caption.htmlFor = input.id;
    caption.textContent = label;
    if (type === 'select')
      for (const name of ['normal', 'add', 'subtract', 'multiply', 'screen']) {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        input.append(option)
      } else {
        input.type = type;
        input.step = ['scaleX', 'scaleY', 'opacity'].includes(key) ? '.05' : '1';
        if (key === 'group' || key === 'index') { input.min = '0'; input.max = '65535'; }
      }
    input.onchange = () => {
      if (key === 'group' || key === 'index') {
        const identity = Number(input.value);
        if (!Number.isInteger(identity) || identity < 0 || identity > 65535 || !input.value.trim()) {
          status.textContent = 'Sprite ' + key + ' must be a whole number from 0 through 65535.';
          renderLayerControls();
          return;
        }
        composition = {
          ...composition,
          layers: composition.layers.map(item => composition.selected.includes(item.id) && item.id !== 'base' ? {
            ...item,
            source: {
              ...item.source,
              kind: 'sprite',
              [key]: Number(input.value)
            }
          } : item)
        };
        composition = normalizePreviewLayers(composition);
        persistComposition();
        renderLayerControls();
        requestLayers()
      } else editSelectedLayers({
        [key]: type === 'checkbox' ? input.checked : type === 'number' ? Number(input.value) : input.value
      })
    };
    controls[key] = input;
    fields.append(caption, input);
  }

  const axisLinkLabel=document.createElement('label'),axisLink=document.createElement('input');
  axisLink.type='checkbox';axisLink.id='previewLayer_axisLink';
  axisLinkLabel.append(axisLink,' Include this layer in linked saved-axis offsets');fields.append(axisLinkLabel);
  axisLink.onchange=()=>{const item=primaryLayer();if(item.id==='base')return;item.axisLink=axisLink.checked;persistComposition();renderLayerControls();};
  const mapLabel=document.createElement('label'),mapInput=document.createElement('input'),mapButton=document.createElement('button');
  mapLabel.textContent='Current base → layer sprite (group,index)';mapInput.id='previewLayer_axisMap';mapInput.placeholder='15000,0';mapLabel.append(mapInput);fields.append(mapLabel);
  mapButton.textContent='Map current sprite';mapButton.onclick=()=>{const item=primaryLayer(),key=selected&&`${selected.group},${selected.number}`,value=mapInput.value.trim();if(item.id==='base'||!key)return;if(!/^\d+,\d+$/.test(value)){status.textContent='Enter the target as group,index.';return;}const [group,index]=value.split(',').map(Number),matches=model.sprites.filter(sprite=>sprite.group===group&&sprite.number===index);if(matches.length!==1){status.textContent=matches.length?'Target ID is ambiguous; choose an exact unique sprite.':'Target sprite is missing from this SFF.';return;}item.axisMapping={...item.axisMapping,[key]:value};item.axisLink=true;persistComposition();renderLayerControls();status.textContent=`Mapped ${key} to ${value} for ${item.label}.`;};fields.append(mapButton);

  compactFields(fields,'previewLayer_',(key,delta)=>editSelectedLayers({[key]:primaryLayer()[key]+delta}));
  function spriteReference(item){
    if(item.id==='base'||item.source.kind==='bank'){
      return selected && {group:selected.group+(item.id==='base'?0:item.source.bank*10000), index:selected.number};
    }
    return item.source;
  }
  function spriteCaption(item){
    const ref=spriteReference(item);
    return !item.enabled?'Empty':ref?ref.group+', '+ref.index:'—';
  }
  function spriteOptions(item,form,close){
    const ref=spriteReference(item), fields={};
    for(const key of ['group','index']){
      const label=document.createElement('label'),input=document.createElement('input');
      label.textContent=key==='group'?'Group':'Index';input.type='number';input.min=0;input.max=65535;input.step=1;input.required=true;input.value=ref?.[key]??0;label.append(input);form.append(label);fields[key]=input;
    }
    const apply=document.createElement('button'),error=document.createElement('span');error.setAttribute('role','status');
    apply.type='submit';apply.textContent=item.id==='base'?'Show sprite':item.source.kind==='bank'?'Use fixed sprite':'Use sprite';form.append(apply,error);
    form.onsubmit=event=>{
      event.preventDefault();const group=fields.group.valueAsNumber,index=fields.index.valueAsNumber;
      const matches=model.sprites.filter(sprite=>sprite.group===group&&sprite.number===index);
      if(matches.length!==1){error.textContent=matches.length?'More than one sprite has that ID.':'No sprite in this SFF has that ID.';return;}
      if(item.id==='base'){selectSprite(matches[0]);}
      else{const target=layer(item.id);target.source={...target.source,kind:'sprite',group,index};if(!target.enabled)target.visible=true;target.enabled=true;persistComposition();renderLayerControls();requestLayers();redraw();}
      close();
    };
  }
  function renderLayerControls() {
    const unsupported = composition.layers.filter(item => !supportedBlends.includes(item.blend));
    blendNote.hidden = !unsupported.length;
    blendNote.textContent = unsupported.length ? 'Saved blend ' + unsupported.map(item => item.label + ' (' + item.blend + ')').join(', ') + ' is shown as normal in this preview. The saved value is retained until you choose another blend.' : '';
    runtimeButton.hidden = !!model.transfer;
    runtimeButton.disabled = composition.primary === 'base' || !primaryLayer()?.enabled;
    airButton.hidden = runtimeButton.hidden;
    airButton.disabled = runtimeButton.disabled;
    list.textContent = '';
    const changed=()=>{persistComposition();renderLayerControls();requestLayers();redraw()};
    layerList(list,shared.state(),{
      caption:spriteCaption,options:spriteOptions,
      select:(id,multiple)=>{composition=normalizePreviewLayers({...composition,primary:id,selected:multiple?(composition.selected.includes(id)?composition.selected.filter(value=>value!==id):[...composition.selected,id]):[id]});changed()},
      toggle:(id,visible)=>{const item=layer(id);if(visible)item.enabled=true;item.visible=visible;changed()},
      order:(id,order)=>shared.rank(id,order),
      move:(id,before)=>shared.move(id,before),
      runtime:(id,patch)=>{composition=normalizePreviewLayers({...composition,layers:composition.layers.map(item=>item.id===id?{...item,...patch}:item)});changed()}
    });
    const item = primaryLayer();
    if(item.enabled && item.id!=='base' && item.source.kind==='bank' && !model.transfer){
      const repair=document.createElement('button');repair.textContent='Index bank to base palettes…';
      repair.onclick=()=>{if(!dirtyAxes.size&&!pendingSpriteNames.size)vscode.postMessage({type:'sffAction',action:'indexLayerBank',bank:item.source.bank,selectedIndex:selected?.index,bindingGeneration:model.bindingGeneration});else status.textContent='Save pending sprite edits before converting.'};
      list.append(repair);
    }
    compactFields(fields,'previewLayer_',(key,delta)=>editSelectedLayers({[key]:primaryLayer()[key]+delta}),item);
    sourcePicker.value = item.source.kind === 'bank' ? String(item.source.bank) : 'sprite';
    sourcePicker.disabled = item.id === 'base';
    axisLink.checked=item.axisLink===true;axisLink.disabled=item.id==='base';
    mapInput.disabled=mapButton.disabled=item.id==='base'||!selected;
    mapInput.value=selected ? item.axisMapping?.[`${selected.group},${selected.number}`] ?? '' : '';
    for (const [key, input] of Object.entries(controls)) {
      const value = key === 'group' || key === 'index' ? item.source[key] : item[key];
      if (key === 'blend') {
        input.querySelector('[data-preview-blend-fallback]')?.remove();
        if (!supportedBlends.includes(value)) {
          const fallback = document.createElement('option');
          fallback.value = value;
          fallback.textContent = value + ' (preview: normal)';
          fallback.dataset.previewBlendFallback = 'true';
          input.prepend(fallback);
        }
      }
      if (input.type === 'checkbox') input.checked = value;
      else input.value = value;
      input.disabled = (key === 'group' || key === 'index') && item.id === 'base'
    }
    add.disabled = composition.layers.every(item => item.enabled);
    remove.disabled = composition.selected.every(id => id === 'base')
  }
  add.onclick = () => {
    const item = composition.layers.find(item => !item.enabled);
    if (!item) return;
    item.enabled = true;
    item.visible = true;
    item.source = {
      ...item.source,
      kind: 'sprite',
      group: selected?.group || 0,
      index: selected?.number || 0
    };
    composition.selected = [item.id];
    composition.primary = item.id;
    persistComposition();
    renderLayerControls();
    requestLayers()
  };
  remove.onclick = () => {
    for (const item of composition.layers)
      if (item.id !== 'base' && composition.selected.includes(item.id)) item.enabled = false;
    composition = normalizePreviewLayers({
      ...composition,
      primary: 'base',
      selected: ['base']
    });
    persistComposition();
    renderLayerControls();
    requestLayers()
  };
  requestLayers = () => {
    if(shared.needsList())renderLayerControls();
    syncNativeLayerOrder();
    for(const button of list.querySelectorAll('[data-preview-layer-focus]')){const item=layer(button.dataset.previewLayerFocus);const caption=spriteCaption(item);if(button.textContent!==caption){button.updateLayerCaption(caption);}}
    spriteImageAuthority.invalidate('layer');
    layerImages.clear();
    layerSprites.clear();
    if (selected)
      for (let slot = 1; slot <= 4; slot++) {
        const item = layer('layer' + slot);
        document.getElementById('layerEnabled' + slot).checked = item.enabled && item.visible;
        if (!item.enabled || !item.visible || item.source.kind==='bank' && (selected.group<0 || selected.group>=10000 || selected.group+item.source.bank*10000>65535)) continue;
        const matches = model.sprites.filter(sprite => sprite.group === (item.source.kind === 'bank' ? selected.group + item.source.bank * 10000 : item.source.group) && sprite.number === (item.source.kind === 'bank' ? selected.number : item.source.index));
        if (matches.length !== 1) continue;
        layerSprites.set(slot, matches[0]);
        requestSpriteImage(matches[0], {
          layerSlot: slot,
          layerFor: selected.index
        }, selected, item.followBasePalette)
      }
    redraw()
  };
  const drawableLayers = () => composition.layers.filter(item => item.enabled && item.visible).map(item => ({
    item,
    sprite: item.id === 'base' ? selected : layerSprites.get(Number(item.id.slice(5))),
    image: item.id === 'base' ? image : layerImages.get(Number(item.id.slice(5)))
  })).filter(item => item.sprite && item.image).sort((a, b) => shared.order().indexOf(a.item.id) - shared.order().indexOf(b.item.id));

  function layerTransformMatrix(item) {
    const angle = item.angle * Math.PI / 180,
      c = Math.cos(angle),
      s = Math.sin(angle),
      sx = item.scaleX * (item.flipX ? -1 : 1),
      sy = item.scaleY * (item.flipY ? -1 : 1);
    return {
      a: c * sx,
      b: s * sx,
      c: -s * sy,
      d: c * sy
    }
  }

  function imagePointOnCanvas(draw, x, y) {
    const m = layerTransformMatrix(draw.item),
      px = x - draw.sprite.axisX,
      py = y - draw.sprite.axisY;
    return {
      x: canvas.width / 2 + viewOffsetX + (draw.item.x + m.a * px + m.c * py) * zoomScale,
      y: canvas.height / 2 + viewOffsetY + (draw.item.y + m.b * px + m.d * py) * zoomScale
    }
  }

  function layerContainsPoint(draw, p) {
    const m = layerTransformMatrix(draw.item),
      dx = (p.x - canvas.width / 2 - viewOffsetX) / zoomScale - draw.item.x,
      dy = (p.y - canvas.height / 2 - viewOffsetY) / zoomScale - draw.item.y,
      det = m.a * m.d - m.b * m.c,
      x = (m.d * dx - m.c * dy) / det + draw.sprite.axisX,
      y = (-m.b * dx + m.a * dy) / det + draw.sprite.axisY;
    return x >= 0 && y >= 0 && x <= draw.image.width && y <= draw.image.height
  }
  let subtractContext;
  function subtractSprite(draw, corners) {
    const x = Math.max(0, Math.floor(Math.min(...corners.map(point => point.x))));
    const y = Math.max(0, Math.floor(Math.min(...corners.map(point => point.y))));
    const width = Math.min(canvas.width, Math.ceil(Math.max(...corners.map(point => point.x)))) - x;
    const height = Math.min(canvas.height, Math.ceil(Math.max(...corners.map(point => point.y)))) - y;
    if (width <= 0 || height <= 0 || draw.item.opacity === 0) return;
    subtractContext ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    const paint = subtractContext;
    if (paint.canvas.width < width) paint.canvas.width = width;
    if (paint.canvas.height < height) paint.canvas.height = height;
    paint.resetTransform();
    paint.clearRect(0, 0, width, height);
    paint.translate(-x, -y);
    const m = ctx.getTransform();
    paint.transform(m.a, m.b, m.c, m.d, m.e, m.f);
    paint.imageSmoothingEnabled = false;
    paint.drawImage(draw.image, -draw.sprite.axisX * zoomScale, -draw.sprite.axisY * zoomScale, draw.image.width * zoomScale, draw.image.height * zoomScale);
    const source = paint.getImageData(0, 0, width, height).data;
    const destination = ctx.getImageData(x, y, width, height);
    for (let i = 0; i < source.length; i += 4) {
      const alpha = source[i + 3] / 255 * draw.item.opacity;
      if (!alpha) continue;
      for (let channel = 0; channel < 3; channel++) {
        destination.data[i + channel] = Math.max(0, destination.data[i + channel] - source[i + channel] * alpha);
      }
    }
    ctx.putImageData(destination, x, y);
  }
  redraw = () => {
    if (globalThis.ikemenSffPreviewMode === false) {
      sourceRedraw();
      return
    }
    resetSpriteScrollbars();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (document.getElementById('proofBackground')?.value === 'configured') paintConfiguredBackground();
    if (document.getElementById('axisLayer').value === 'behind') drawAxis();
    if (onionImage && onionSprite && document.getElementById('onionSkin').checked) {
      ctx.save();
      ctx.globalAlpha = Number(document.getElementById('onionOpacity').value) / 100;
      drawSpriteImage(onionImage, onionSprite, zoomScale);
      ctx.restore()
    }
    for (const draw of drawableLayers()) {
      const item = draw.item,
        m = layerTransformMatrix(item);
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = item.opacity;
      ctx.globalCompositeOperation = ({
        add: 'lighter',
        multiply: 'multiply',
        screen: 'screen'
      })[item.blend] || 'source-over';
      ctx.translate(canvas.width / 2 + viewOffsetX + item.x * zoomScale, canvas.height / 2 + viewOffsetY + item.y * zoomScale);
      ctx.transform(m.a, m.b, m.c, m.d, 0, 0);
      const points = [
          [0, 0],
          [draw.image.width, 0],
          [draw.image.width, draw.image.height],
          [0, draw.image.height]
        ].map(([x, y]) => imagePointOnCanvas(draw, x, y));
      for (const point of points) spriteScrollbars.point(point.x - canvas.width / 2 - viewOffsetX, point.y - canvas.height / 2 - viewOffsetY);
      if (item.blend === 'subtract') subtractSprite(draw, points);
      else ctx.drawImage(draw.image, -draw.sprite.axisX * zoomScale, -draw.sprite.axisY * zoomScale, draw.image.width * zoomScale, draw.image.height * zoomScale);
      ctx.restore();
      if (composition.selected.includes(item.id)) {
        ctx.save();
        ctx.strokeStyle = item.id === composition.primary ? '#f0c94d' : '#42a5f5';
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
        ctx.closePath();
        ctx.stroke();
        ctx.restore()
      }
    }
    if (document.getElementById('axisLayer').value === 'front') drawAxis();
    drawPixelRulers();
    spriteScrollbars.update(viewOffsetX, viewOffsetY);
  };
  const canvasPoint = event => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * canvas.width / rect.width,
      y: (event.clientY - rect.top) * canvas.height / rect.height
    }
  };
  const sourceDoubleClick = canvas.ondblclick;
  canvas.ondblclick = event => {
    if (globalThis.ikemenSffPreviewMode === false) return sourceDoubleClick?.(event);
    const target = drawableLayers().reverse().find(draw => draw.item.opacity > 0 && layerContainsPoint(draw, canvasPoint(event)));
    if (target?.item.id === 'base' && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault();
      if(globalThis.ikemenCanReplaceSprite?.()===false)return;
      vscode.postMessage({type:'sffAction', action:'changeImage', selectedIndex:selected.index, selectedIndices:[selected.index], group:selected.group});
    } else if (!target || event.shiftKey) centerView();
  };
  canvas.onpointerdown = event => {
    if (event.button !== 0) return;
    const p = canvasPoint(event),
      target = drawableLayers().reverse().find(item => item.item.opacity > 0 && layerContainsPoint(item, p));
    if ((xHeld || !pane.hidden) && target) {
      if (!composition.selected.includes(target.item.id)) {
        composition.selected = event.ctrlKey ? [...composition.selected, target.item.id] : [target.item.id];
        composition.primary = target.item.id;
        renderLayerControls()
      }
      drag = {
        pointer: event.pointerId,
        p,
        move: true,
        layers: composition.layers.map(item => ({
          ...item
        }))
      }
    } else drag = {
      pointer: event.pointerId,
      p,
      viewX: viewOffsetX,
      viewY: viewOffsetY
    };
    canvas.setPointerCapture(event.pointerId)
  };
  canvas.onpointermove = event => {
    if (!drag || drag.pointer !== event.pointerId) return;
    const p = canvasPoint(event);
    if (drag.move) {
      composition = normalizePreviewLayers({
        ...composition,
        layers: drag.layers.map(item => composition.selected.includes(item.id) ? {
          ...item,
          x: item.x + (p.x - drag.p.x) / zoomScale,
          y: item.y + (p.y - drag.p.y) / zoomScale
        } : item)
      });
      renderLayerControls();
      redraw()
    } else setViewOffset(drag.viewX + p.x - drag.p.x, drag.viewY + p.y - drag.p.y, false)
  };
  canvas.onpointerup = event => {
    if (!drag || drag.pointer !== event.pointerId) return;
    if (drag.move) persistComposition();
    drag = null;
    saveViewState()
  };
  canvas.onpointercancel = () => {
    if (drag?.move) {
      composition = normalizePreviewLayers({
        ...composition,
        layers: drag.layers
      });
      renderLayerControls();
      redraw()
    }
    drag = null
  };
  addEventListener('keydown', event => {
    if (globalThis.ikemenSffPreviewMode === false) return;
    if (event.target.matches('input,textarea,select,[contenteditable="true"]')) return;
    if (event.key.toLowerCase() === 'x') xHeld = true;
    if (event.key === 'Escape' && drag) {
      canvas.onpointercancel();
      return
    }
    const delta = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1]
    } [event.key];
    if (delta && event.target === canvas) {
      event.preventDefault();
      const amount = event.shiftKey ? 10 : 1;
      editSelectedLayers({
        x: primaryLayer().x + delta[0] * amount,
        y: primaryLayer().y + delta[1] * amount
      })
    }
  });
  addEventListener('keyup', event => {
    if (event.key.toLowerCase() === 'x') xHeld = false
  });
  for (let slot = 1; slot <= 4; slot++) {
    document.getElementById('layerEnabled' + slot).onchange = event => {
      layer('layer' + slot).enabled = event.target.checked;
      layer('layer' + slot).visible = true;
      persistComposition();
      renderLayerControls();
      requestLayers()
    };
    document.getElementById('layerBank' + slot).onchange = event => {
      layer('layer' + slot).source = {
        ...layer('layer' + slot).source,
        kind: 'bank',
        bank: Number(event.target.value)
      };
      persistComposition();
      renderLayerControls();
      requestLayers()
    };
    document.getElementById('layerOrder' + slot).onchange = event => {
      const relative = Number(event.target.value);
      if (!event.target.value.trim() || !Number.isInteger(relative) || relative < -4 || relative > 4) {
        syncNativeLayerOrder();
        status.textContent = 'Draw order must be a whole number from -4 through 4 relative to Base.';
        return;
      }
      shared.rank('layer'+slot,Math.max(0,Math.min(4,shared.order().indexOf('base')+relative)));
      renderLayerControls();
      requestLayers()
    }
  }
  // Legacy axis controls remain in the Sprite inspector for explicit native edits.
  document.getElementById('axisMoveTarget').closest('.options').hidden = true;
  document.getElementById('moveTargetStatus').textContent = 'Use Preview layers beside the canvas. Preview movement never edits saved SFF axes.';
  canvas.addEventListener('keydown', event => {
    if (globalThis.ikemenSffPreviewMode !== false && event.key === 'Delete') {
      event.preventDefault();
      event.stopPropagation();
      remove.onclick()
    }
  }, true);
  pane.addEventListener('keydown', event => {
    if (event.key === 'Delete') {
      event.preventDefault();
      event.stopPropagation();
      remove.onclick()
    }
  });
  canvas.oncontextmenu = event => {
    event.preventDefault();
    if (globalThis.ikemenSffShowMatchingMenu) globalThis.ikemenSffShowMatchingMenu(event, () => list.querySelector('button')?.focus());
    else list.querySelector('button')?.focus()
  };
  canvas.addEventListener('keydown', event => {
    if (globalThis.ikemenSffPreviewMode === false) return;
    if (event.key === 'ContextMenu' || event.shiftKey && event.key === 'F10') {
      event.preventDefault();
      const bounds = canvas.getBoundingClientRect();
      if (globalThis.ikemenSffShowMatchingMenu) globalThis.ikemenSffShowMatchingMenu({clientX:bounds.left+20,clientY:bounds.top+20}, () => list.querySelector('button')?.focus());
      else list.querySelector('button')?.focus()
    }
  });
  const previewHandlers = Object.fromEntries(['onpointerdown', 'onpointermove', 'onpointerup', 'onpointercancel', 'oncontextmenu'].map(key => [key, canvas[key]]));
  mode.onclick = () => {
    globalThis.ikemenSffPreviewMode = !globalThis.ikemenSffPreviewMode;
    Object.assign(canvas, globalThis.ikemenSffPreviewMode ? previewHandlers : sourceHandlers);
    fields.hidden = !globalThis.ikemenSffPreviewMode;
    document.getElementById('axisMoveTarget').closest('.options').hidden = globalThis.ikemenSffPreviewMode;
    mode.textContent = globalThis.ikemenSffPreviewMode ? 'Edit saved sprite axes' : 'Return to preview layers';
    syncNativeLayerOrder();
    status.textContent = globalThis.ikemenSffPreviewMode ? 'Project preview only. Drag to move selected layers.' : 'Native SFF axis editing. Hold X and drag; use the source context menu to choose saved sprites. Save / Auto Save applies.';
    redraw()
  };
  document.getElementById('refreshLayers').onclick = () => requestLayers();
  launcher(pane,redraw);
  renderLayerControls();
  requestLayers();
  addEventListener('message', event => {
    const message = event.data;
    if (message.type !== 'browserControl') return;
    const control = message.control || {};
    if (control.id === 'axisMoveTarget' || control.id === 'axisMoveTargets') {
      const requested = control.id === 'axisMoveTargets' ? control.value : [control.value],
        ids = (Array.isArray(requested) ? requested : []).filter(id => composition.layers.some(layer => layer.id === id && layer.enabled));
      if (ids.length) {
        composition = normalizePreviewLayers({
          ...composition,
          selected: control.id === 'axisMoveTargets' ? ids : [...new Set([...composition.selected, ...ids])],
          primary: ids[0]
        });
        persistComposition();
        renderLayerControls();
        redraw()
      }
    }
  });
  addEventListener('message', event => {
    if (event.data.type === 'previewLayersSaveFailed') status.textContent = 'Preview metadata could not be saved: ' + event.data.message
  });
}

function clientScript() {
  // The serialized editor closes over the normalizer; bind it in the webview
  // realm rather than relying on the extension host's CommonJS scope.
  return '(' + installSffPreviewLayers.toString() + ')(' + normalizePreviewLayers.toString() + ',(normalizePreviewLayers=>(' + editPreviewLayers.toString() + '))(' + normalizePreviewLayers.toString() + '),' + require('./preview_layer_list').clientSource() + ',((normalizePreviewLayers,orderedPreviewLayers)=>(' + movePreviewLayer.toString() + '))(' + normalizePreviewLayers.toString() + ',' + orderedPreviewLayers.toString() + '),' + require('./preview_layer_list').launcherSource() + ',' + require('./preview_layer_list').compactSource() + ',' + require('./shared_layer_client').sharedLayerClient.toString() + ');';
}
module.exports = {
  clientScript
};
