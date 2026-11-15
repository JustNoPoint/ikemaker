"use strict";

// Preview composition only. Source frames and SFF axes remain owned by their editors.
function runtime(api, normalizePreviewLayers, editPreviewLayers, layerList, moveLayer, compactFields,sharedClient) {
  function initialState(value, legacy = []) {
    if (value) {
      return normalizePreviewLayers(value);
    }
    const result = normalizePreviewLayers(null);
    for (const layer of result.layers) {
      if (layer.id === "base") continue;
      const slot = Number(layer.id.slice(5)),
        old = legacy.find((item) => Number(item.slot) === slot);
      layer.source.kind = "bank";
      if (old) {
        layer.enabled = old.enabled !== false;
        layer.visible = old.visible !== false;
        layer.source.bank = Number(old.bank) || 0;
        layer.order = Number(old.order) || 0;
      }
    }
    return normalizePreviewLayers(result);
  }
  let sourcePath = api.model().airPath,
    state = initialState(
      api.model().previewLayers ||
        (api.saved().airPath === sourcePath ? api.saved().previewLayers : null),
      api.saved().airPath === sourcePath && Array.isArray(api.saved().layers)
        ? api.saved().layers
        : [],
    ),
    clocks = new Map(),
    cache = new Map(),
    pending = new Map(),
    serial = 0,
    sourceGeneration = 0;
  const positions=new Map();
  const panel = document.getElementById("layerPanel"),
    rows = document.getElementById("previewLayerRows"),
    fields = document.getElementById("previewLayerFields"),
    status = document.getElementById("previewLayerStatus");
  const stage=api.canvas.parentElement,split=document.createElement('div');split.className='air-preview-layer-split';stage.before(split);split.append(panel,stage);panel.style.cssText='width:230px;min-width:185px;max-width:48%;resize:horizontal;overflow:auto;flex:0 0 auto;padding:5px';stage.style.cssText+=';flex:1;min-width:0;min-height:0;position:relative';
  const byId = (id) => state.layers.find((layer) => layer.id === id),
    primary = () => byId(state.primary) || state.layers[0];
  const shared=sharedClient(api.model().sharedLayout,()=>state, ()=>{const f=api.action()?.frames?.[api.index()];return f?f.group+','+f.index:null;},m=>api.post({...m,airPath:api.model().airPath,sffPath:api.model().sffPath}),()=>{render();api.draw();scheduleAnimation()},()=>persist());
  shared.listen();
  function persist() {
    api.save({ previewLayers: state });
    api.post({
      type: "savePreviewLayers",
      airPath: api.model().airPath,
      sffPath: api.model().sffPath,
      value: state, bankEdits:shared.changed(),
    });
  }
  function select(id, multiple) {
    state.primary = id;
    state.selected = multiple
      ? state.selected.includes(id)
        ? state.selected.filter((item) => item !== id)
        : [...state.selected, id]
      : [id];
    if (!state.selected.length) state.selected = [id];
    state = normalizePreviewLayers(state);
    render();
    persist();
    api.draw();
  }
  function change(patch, absolute = false) {
    if(Object.hasOwn(patch,'order')){shared.rank(state.primary,Math.max(0,Math.min(4,Math.round(Number(patch.order)))));return;}

    state = absolute ? normalizePreviewLayers({
      ...state,
      layers: state.layers.map(layer => state.selected.includes(layer.id) ? { ...layer, ...patch } : layer),
    }) : editPreviewLayers(state, state.selected, patch);
    render();
    persist();
    api.draw();
    scheduleAnimation();
  }
  function changeSource(patch, kind) {
    state = normalizePreviewLayers({
      ...state,
      layers: state.layers.map((layer) =>
        state.selected.includes(layer.id) &&
        layer.id !== "base" &&
        (!kind || layer.source.kind === kind)
          ? { ...layer, source: { ...layer.source, ...patch } }
          : layer,
      ),
    });
    render();
    persist();
    api.draw();
    scheduleAnimation();
  }
  function input(label, key, value, type = "number") {
    const wrap = document.createElement("label");
    wrap.textContent = label;
    const field = document.createElement("input");
    field.id = "previewLayer" + key;
    field.type = type;
    if (type === "number") field.step = "any";
    field.value = value;
    field.onchange = () =>
      change({ [key]: type === "number" ? Number(field.value) : field.value });
    wrap.append(field);
    fields.append(wrap);
    return field;
  }
  let rendering = false;
  function airCaption(item,frame){
    if(!item.enabled)return 'Empty';
    if(item.labelMode==='name'){
      if(item.displayName)return item.displayName;
      const action=item.source.kind==='animation'&&item.id!=='base'?api.model().actions.find(a=>a.number===item.source.action):api.action();
      if(item.label!==(item.id==='base'?'Base':'Layer '+item.id.slice(5)))return item.label;
      if((item.id==='base'||item.source.kind!=='sprite')&&action?.name)return action.name;
      return 'Unnamed';
    }
    return frame&&frame.group>=0?String(frame.group):'—';
  }
  function currentPose(item){return item.id==='base'?api.action()?.frames[api.index()]:pose(item);}
  function airOptions(item,form,close){
    for(const [key,title] of [['group','Show group number'],['name','Show name']]){
      const button=document.createElement('button');button.type='button';button.textContent=title;button.setAttribute('aria-pressed',String(item.labelMode===key));
      button.onclick=()=>{byId(item.id).labelMode=key;persist();render();api.draw();close()};form.append(button);
    }
    const label=document.createElement('label'),field=document.createElement('input'),save=document.createElement('button');
    label.textContent='Layer name';field.maxLength=80;field.value=item.displayName||(item.label===(item.id==='base'?'Base':'Layer '+item.id.slice(5))?'':item.label);label.append(field);save.type='submit';save.textContent='Use layer name';form.append(label,save);
    form.onsubmit=event=>{event.preventDefault();if(!field.value.trim()){field.focus();return;}const target=byId(item.id);target.displayName=field.value.trim();target.labelMode='name';persist();render();api.draw();close()};
  }
  function render() {
    const runtimeButton = document.getElementById("previewLayerRuntime");
    runtimeButton.hidden = api.model().sourceKind === "stage" || !!api.model().transfer;
    runtimeButton.disabled = primary().id === "base" || !primary().enabled;
    const airButton = document.getElementById("previewLayerMakeAir");
    airButton.hidden = runtimeButton.hidden;
    airButton.disabled = runtimeButton.disabled || primary().source.kind !== "bank";
    function launch(type) {
      api.post({type, airPath:api.model().airPath, sffPath:api.model().sffPath, action:api.action()?.number, value:state});
    }
    airButton.onclick = () => launch("createLayerAir");
    document.getElementById('previewLayerReviewExisting').onclick=()=>api.post({type:'reviewExistingLayer',airPath:api.model().airPath,sffPath:api.model().sffPath});
    runtimeButton.onclick = () => launch("useCostumeLayer");
    const effectButton = document.getElementById("previewLayerTimedEffect");
    effectButton.hidden = runtimeButton.hidden;
    effectButton.disabled = !state.layers.some(layer => layer.id !== "base" && state.selected.includes(layer.id) && layer.source.kind === "animation");
    effectButton.onclick = () => launch("useTimedEffect");
    if (rendering) return;
    rendering = true;
    rows.textContent = "";
    fields.textContent = "";
    const changed=()=>{persist();render();api.draw();scheduleAnimation()};
    layerList(rows,shared.state(),{
      caption:item=>airCaption(item,item.enabled?currentPose(item):null),options:airOptions,
      select:(id,multiple)=>select(id,multiple),
      toggle:(id,visible)=>{const layer=byId(id);if(visible)layer.enabled=true;layer.visible=visible;changed()},
      order:(id,order)=>shared.rank(id,order),
      move:(id,before)=>shared.move(id,before),
      runtime:(id,patch)=>{state=normalizePreviewLayers({...state,layers:state.layers.map(layer=>layer.id===id?{...layer,...patch}:layer)});changed()}
    });
    const p = primary();
    status.textContent =
      state.selected.length + " selected · Focus: " + p.label;
    const unsupportedBlends = state.layers.filter(layer => ["multiply", "screen"].includes(layer.blend));
    if (unsupportedBlends.length) status.textContent += " · Saved " + unsupportedBlends.map(layer => layer.label + " (" + layer.blend + ")").join(", ") + " blend is shown with the AIR frame blend; the saved value is retained until changed.";
    for (const [label, key] of [
      ["X", "x"],
      ["Y", "y"],
      ["Scale X", "scaleX"],
      ["Scale Y", "scaleY"],
      ["Rotation", "angle"],
      ["Opacity", "opacity"],
      ["Draw order", "order"],
    ])
      input(label, key, p[key]);
    const blend = input(
      "Blend mode",
      "blend",
      ({ normal: "inherit", opaque: "normal" })[p.blend] || p.blend,
      "text",
    );
    blend.setAttribute("list", "airPreviewBlendModes");
    blend.title = "Inherit uses the AIR frame blend. Choose normal, A, A1, S, SA, or enter weights such as AS256D128, SS128 or SAS64D32.";
    blend.onchange = () => {
      const mode = blend.value.trim().toUpperCase();
      const weights = /^(?:AS|SS|SAS)([0-9]{1,3})(?:D([0-9]{1,3}))?$/.exec(mode);
      if (!["INHERIT", "NORMAL", "A", "A1", "S", "SA", "ADD", "SUBTRACT"].includes(mode) &&
          !(weights && Number(weights[1]) <= 256 && Number(weights[2] || 0) <= 256)) {
        blend.setAttribute("aria-invalid", "true");
        status.textContent = "Choose inherit, normal, A, A1, S, SA, AS, SS or SAS. Weights range from 0 to 256.";
        return;
      }
      change({ blend: ({ INHERIT: "normal", NORMAL: "opaque" })[mode] || mode });
    };
    for (const [label, key] of [
      ["Flip X", "flipX"],
      ["Flip Y", "flipY"],
    ]) {
      const wrap = document.createElement("label"),
        box = document.createElement("input");
      box.type = "checkbox";
      box.id = "previewLayer" + key;
      box.checked = p[key];
      box.onchange = () => change({ [key]: box.checked });
      wrap.append(box, label);
      fields.append(wrap);
    }
    const source = p.source || {};
    if (p.id !== "base") {
      const wrap = document.createElement("label");
      wrap.textContent = "Source";
      const selectSource = document.createElement("select");
      selectSource.id = "previewLayerSource";
      for (const kind of ["sprite", "animation", "bank"]) {
        const option = new Option(
          kind === "sprite"
            ? "Sprite"
            : kind === "bank"
              ? "Sprite bank (recommended for body details)"
              : "AIR animation",
          kind,
        );
        selectSource.append(option);
      }
      selectSource.value = source.kind || "sprite";
      selectSource.onchange = () => changeSource({ kind: selectSource.value });
      wrap.append(selectSource);
      fields.append(wrap);
      for (const [label, key, defaultValue] of source.kind === "animation"
        ? [
            ["Action", "action", api.action()?.number || 0],
            ["Speed", "speed", 1],
            ["Start tick", "tick", 0],
          ]
        : source.kind === "bank"
          ? [["Bank", "bank", Number(p.id.slice(5)) || 1]]
          : [
              ["Group", "group", 0],
              ["Image", "index", 0],
            ]) {
        const wrap = document.createElement("label");
        wrap.textContent = label;
        const field = document.createElement("input");
        field.id = "previewLayerSource" + key;
        field.type = "number";
        field.step = key === "speed" ? "any" : "1";
        const limits = {
          group: [-1, 65535], index: [-1, 65535], bank: [0, 6],
          action: [0, 2147483647], tick: [0, 2147483647], speed: [0.01, 10],
        }[key];
        field.min = limits[0];
        field.max = limits[1];
        field.required = true;
        field.value = source[key] ?? defaultValue;
        field.onchange = () => {
          if (!field.validity.valid) {
            field.setAttribute("aria-invalid", "true");
            status.textContent = label + " must be " + (key === "speed" ? "a number" : "an integer") +
              " from " + limits[0] + " to " + limits[1] + ".";
            return;
          }
          changeSource({ [key]: Number(field.value) }, source.kind);
        };
        wrap.append(field);
        fields.append(wrap);
      }
      if (source.kind === "animation") {
        const wrap = document.createElement("label"),
          box = document.createElement("input");
        box.id = "previewLayerPlaying";
        box.type = "checkbox";
        box.checked = source.playing !== false;
        box.onchange = () =>
          changeSource({ playing: box.checked }, "animation");
        wrap.append(box, "Play independently");
        fields.append(wrap);
      }
      if (source.kind === "bank") {
        const header=document.createElement('div');
        header.textContent='Linked AIR field exceptions';
        header.style.gridColumn='1 / -1';
        fields.append(header);
        const scopeLabel=document.createElement('label'),scope=document.createElement('select');
        scope.id='previewLayerExceptionScope';
        scopeLabel.textContent='Exception scope';
        for(const [value,title] of [['layer','Layer default'],['action','This Action'],['element','This element']]){const option=document.createElement('option');option.value=value;option.textContent=title;scope.append(option)}
        scopeLabel.append(scope);fields.append(scopeLabel);
        const note=document.createElement('p');note.className='muted';note.style.gridColumn='1 / -1';note.textContent='Checked fields keep this layer’s AIR value when the base Action changes. An element rule takes priority over an Action rule, then the layer default. Existing differing values also stay independent.';fields.append(note);
        const actionKey=String(api.action()?.number ?? 0),elementKey=actionKey+':'+api.index();
        const rules=()=>byId(p.id).linkExceptions;
        const nativeRule=()=>{
          const marker='source=bank:'+source.bank+'; base='+actionKey+';',paired=api.model().actions.find(item=>item.sourceText?.includes(marker));
          const line=paired?.sourceText?.split(/\r?\n/).filter(row=>/^\s*-?\d+\s*,\s*-?\d+\s*,/.test(row))[api.index()]||'';
          const found=/\bIKEMaker link-except=([\w,]+)/.exec(line);
          return Object.fromEntries((found?.[1]||'').split(',').filter(Boolean).map(name=>[name,true]));
        };
        const active=()=>scope.value==='layer'?rules().layer:scope.value==='action'?rules().actions[actionKey]||{}:nativeRule();
        const boxes=[];
        for(const [key,title] of [['x','X offset'],['y','Y offset'],['time','Duration'],['flipH','Flip H'],['flipV','Flip V'],['scaleX','X scale'],['scaleY','Y scale'],['angle','Angle'],['blend','Blend'],['interpolate','Interpolation'],['loopStart','LoopStart']]){
          const label=document.createElement('label'),box=document.createElement('input');box.type='checkbox';box.dataset.linkException=key;label.style.display='flex';label.style.flexDirection='row';label.style.alignItems='center';label.append(box,title);fields.append(label);boxes.push(box);
          box.onchange=()=>{if(scope.value==='element'){api.post({type:'setLinkedElementException',airPath:api.model().airPath,sffPath:api.model().sffPath,baseAction:Number(actionKey),source:'bank:'+source.bank,frameIndex:api.index(),field:key,keep:box.checked});status.textContent='Applying element exception in AIR source…';return;}const target=byId(p.id),exceptions=target.linkExceptions,rule=active();rule[key]=box.checked;exceptions.actions[actionKey]=scope.value==='action'?rule:exceptions.actions[actionKey];persist();status.textContent='Saved linked AIR exception for '+scope.options[scope.selectedIndex].text+'.'};
        }
        scope.onchange=()=>{for(const box of boxes)box.checked=active()[box.dataset.linkException]===true};
        scope.onchange();
      }
    }
    compactFields(fields,"previewLayer",(key,delta)=>change({[key]:primary()[key]+delta}),primary());
    rendering = false;
  }
  function transformed(frame, layer) {
    const nativeBlend = { add: "A", subtract: "S", opaque: "" },
      flags = String(frame.flags || "").toUpperCase(),
      override = layer.blend !== "normal" && !["multiply", "screen"].includes(layer.blend);
    return {
      ...frame,
      x: Number(frame.x || 0) + layer.x,
      y: Number(frame.y || 0) + layer.y,
      scaleX: (frame.scaleX ?? 1) * layer.scaleX,
      scaleY: (frame.scaleY ?? 1) * layer.scaleY,
      angle: Number(frame.angle || 0) + layer.angle,
      flags:
        (flags.includes("H") !== layer.flipX ? "H" : "") +
        (flags.includes("V") !== layer.flipY ? "V" : ""),
      blend: override ? (nativeBlend[layer.blend] ?? layer.blend) : frame.blend,
      blendState: override ? undefined : frame.blendState,
    };
  }
  function pose(layer) {
    const source = layer.source || {};
    if (source.kind === "bank") {
      const frame = api.action()
        ? api.visual.sample(api.action(), api.index(), api.elapsed())
        : null;
      return frame && frame.group >= 0 && frame.group < 10000 && frame.group+10000*source.bank<=65535 && frame.index >= 0
        ? { ...frame, group: frame.group + 10000 * (Number(source.bank) || 0) }
        : null;
    }
    if (source.kind !== "animation")
      return {
        group: source.group || 0,
        index: source.index || 0,
        x: 0,
        y: 0,
        flags: "",
        scaleX: 1,
        scaleY: 1,
      };
    const action = api
      .model()
      .actions.find((item) => item.number === Number(source.action));
    if (!action?.frames.length) return null;
    const now = performance.now(),
      startTick = Math.max(0, Number(source.tick) || 0),
      speed = Number(source.speed) || 1,
      running = source.playing !== false;
    let clock = clocks.get(layer.id);
    if (!clock || clock.action !== source.action || clock.tick !== startTick) {
      clock = {
        action: source.action,
        tick: startTick,
        elapsed: startTick,
        started: now,
        running,
        speed,
      };
      clocks.set(layer.id, clock);
    }
    const elapsed =
      clock.elapsed +
      (clock.running ? (((now - clock.started) * 60) / 1000) * clock.speed : 0);
    if (clock.running !== running || clock.speed !== speed) {
      clock.elapsed = elapsed;
      clock.started = now;
      clock.running = running;
      clock.speed = speed;
    }
    const tick = elapsed;
    const position = api.playback.locate(action, tick);
    positions.set(layer.id,position.index);
    return api.visual.sample(action, position.index, position.elapsed);
  }
  let visibleSprites = [];
  function fitPoints() {
    return visibleSprites.flatMap(({ entry, frame }) =>
      api.visual.corners({ ...entry.sprite, width: entry.image.width, height: entry.image.height }, frame)
    );
  }
  function draw(base, picture) {
    if(shared.needsList()&&!rendering)render();
    const order=shared.order();
    const entries = [];
    for (const layer of state.layers) {
      if (!layer.enabled) continue;
      const frame = layer.id === "base" ? picture : pose(layer);
      const button=rows.querySelector('[data-preview-layer-focus="'+layer.id+'"]'),caption=airCaption(layer,frame);
      if(button&&button.textContent!==caption){button.updateLayerCaption(caption);}
      if(!layer.visible)continue;
      if (!frame || frame.group < 0 || frame.index < 0) continue;
      let entry = layer.id === "base" ? base : null;
      if (layer.id !== "base") {
        const palette = layer.followBasePalette ? api.basePalette() : null,
          key = frame.group + "," + frame.index + ":" + palette;
        entry = cache.get(key);
        if (!cache.has(key) && !pending.has(key)) {
          const requestId = ++serial;
          pending.set(key, requestId);
          api.post({
            type: "previewLayerFrame",
            airPath: api.model().airPath,
            sffPath: api.model().sffPath,
            requestId,
            key,
            frame: { group: frame.group, index: frame.index },
            paletteIndex: palette,
          });
        }
      }
      if (entry) entries.push({ layer, entry, frame });
    }
    entries.sort(
      (a, b) =>
        order.indexOf(a.layer.id) - order.indexOf(b.layer.id) ||
        state.layers.indexOf(a.layer) - state.layers.indexOf(b.layer),
    );
    visibleSprites = entries.filter(({ layer }) => layer.opacity > 0).map(({ layer, entry, frame }) => ({
      entry: { ...entry, opacity: layer.opacity },
      frame: transformed(frame, layer),
    }));
    for (const visible of visibleSprites) api.drawSprite(visible.entry, visible.frame);
  }
  window.addEventListener("message", async (event) => {
    const m = event.data;
    if (m.type !== "previewLayerImage" || pending.get(m.key) !== m.requestId)
      return;
    // A request stays pending through decode so animation draws share one image.
    const generation = sourceGeneration;
    let entry = null;
    if (m.item) {
      const image = new Image();
      image.src = m.item.dataUri;
      try {
        await image.decode();
        entry = { ...m.item, image };
      } catch (_) {
        // Record this failure for this source generation, like a missing sprite.
      }
    }
    if (generation !== sourceGeneration || pending.get(m.key) !== m.requestId) return;
    pending.delete(m.key);
    cache.set(m.key, entry);
    if (cache.size > 96) cache.delete(cache.keys().next().value);
    if (!entry) {
      status.textContent = (m.item ? "Could not decode sprite: " : "Sprite unavailable: ") + m.key;
      return;
    }
    api.draw();
  });
  document.getElementById("previewLayerFit").onclick = () => document.getElementById("fit").click();
  document.getElementById("previewLayerSelectAll").onclick = () => {
    state.selected = state.layers
      .filter((layer) => layer.enabled)
      .map((layer) => layer.id);
    state = normalizePreviewLayers(state);
    render();
    persist();
  };
  document.getElementById("previewLayerReset").onclick = () =>
    change({
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      angle: 0,
      flipX: false,
      flipY: false,
      opacity: 1,
      blend: "normal",
    }, true);
  panel.addEventListener("keydown", (event) => {
    if (
      /INPUT|SELECT|TEXTAREA/.test(event.target.tagName) ||
      !event.key.startsWith("Arrow")
    )
      return;
    const delta = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }[event.key];
    if (!delta) return;
    event.preventDefault();
    const p = primary(),
      n = event.shiftKey ? 10 : 1;
    change({ x: p.x + delta[0] * n, y: p.y + delta[1] * n });
  });
  let drag = null;
  function cancelDrag() {
    if (!drag) return;
    state = drag.state;
    drag = null;
    render();
    api.draw();
  }
  api.canvas.addEventListener("pointercancel", cancelDrag, true);
  api.canvas.addEventListener("lostpointercapture", cancelDrag, true);
  api.canvas.addEventListener(
    "pointerdown",
    (event) => {
      if (
        panel.hidden ||
        event.button !== 0
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      drag = {
        x: event.clientX,
        y: event.clientY,
        state: JSON.parse(JSON.stringify(state)),
      };
      api.canvas.setPointerCapture(event.pointerId);
    },
    true,
  );
  api.canvas.addEventListener(
    "pointermove",
    (event) => {
      if (!drag) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const p = drag.state.layers.find(
          (item) => item.id === drag.state.primary,
        ),
        dx = (event.clientX - drag.x) / api.zoom(),
        dy = (event.clientY - drag.y) / api.zoom();
      state = editPreviewLayers(drag.state, drag.state.selected, {
        x: p.x + dx,
        y: p.y + dy,
      });
      api.draw();
    },
    true,
  );
  api.canvas.addEventListener(
    "pointerup",
    (event) => {
      if (!drag) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      drag = null;
      render();
      persist();
    },
    true,
  );
  let animationFrame = 0;
  function scheduleAnimation() {
    if (
      animationFrame ||
      !state.layers.some(
        (layer) =>
          layer.id !== "base" &&
          layer.enabled &&
          layer.visible &&
          layer.source?.kind === "animation" &&
          layer.source.playing !== false,
      )
    )
      return;
    animationFrame = requestAnimationFrame(() => {
      animationFrame = 0;
      api.draw();
      scheduleAnimation();
    });
  }
  render();
  scheduleAnimation();
  window.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape" && drag) {
        event.preventDefault();
        event.stopImmediatePropagation();
        cancelDrag();
        return;
      }
      const previewTarget =
        panel.contains(event.target) ||
        (event.target === api.canvas &&
          !panel.hidden);
      if (!previewTarget || /INPUT|SELECT|TEXTAREA/.test(event.target.tagName))
        return;
      const delta = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      }[event.key];
      if (delta) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const p = primary(),
          n = event.shiftKey ? 10 : 1;
        change({ x: p.x + delta[0] * n, y: p.y + delta[1] * n });
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        event.stopImmediatePropagation();
        change({ visible: false });
      }
    },
    true,
  );
  window.addEventListener("message", (event) => {
    const message = event.data;
    if (message.type === "error" && message.operation === "savePreviewLayers")
      status.textContent =
        message.message || "Preview layers could not be saved.";
    if (message.type !== "model") return;
    sourceGeneration++;
    cache.clear();
    pending.clear();
    if (message.model?.airPath !== sourcePath || shared.key()!==message.model?.sharedLayout?.key) {
      cancelDrag();
      sourcePath = message.model?.airPath;
      state = initialState(message.model?.previewLayers);
      shared.reset(message.model?.sharedLayout);
      clocks.clear();
      render();
      api.save({ previewLayers: state });
    }
    api.draw();
    scheduleAnimation();
  });
  return { draw, fitPoints, state: () => state, authoredTarget:()=>({state,layerId:state.primary,frameIndex:positions.get(state.primary)??0}) };
}
function install(page) {
  const {
    normalizePreviewLayers,
    editPreviewLayers,
    orderedPreviewLayers,movePreviewLayer,
  } = require("./preview_layers_model");
  const controls =
    '<h3>Preview layers</h3><p class="muted">Top behind · bottom in front. Drag rows or Alt+Up/Down. Ctrl/Shift selects several.</p><div id="previewLayerRows"></div><button id="previewLayerSelectAll">Select enabled</button><button id="previewLayerFit">Fit visible layers</button><button id="previewLayerMakeAir" title="Copy the base action timing and use this layer’s matching sprites">Create layer animations…</button><button id="previewLayerReviewExisting" title="Open the existing runtime layer code and its linked AIR Actions">Review existing layer…</button><button id="previewLayerRuntime" title="Use a sprite bank for a body layer or an AIR action for a separately timed accessory">Use layer in game…</button><button id="previewLayerTimedEffect" title="Review selected animation layers as independently timed effects. Hidden layers can be included in runtime.">Use as timed effect - Explod Lab</button><datalist id="airPreviewBlendModes"><option value="inherit"><option value="normal"><option value="A"><option value="A1"><option value="S"><option value="SA"><option value="AS128D128"><option value="SS128D128"><option value="SAS64D32"></datalist><div id="previewLayerFields"></div><div class="row"><button id="previewLayerReset">Reset transform</button></div><p id="previewLayerStatus" role="status"></p>';
  return page
    .replace(
      /<section class="panel" id="layerPanel">[\s\S]*?<\/section>/,
      '<section class="panel" id="layerPanel" tabindex="0">' +
        controls +
        '<div id="layers" hidden></div></section>',
    )
    .replace(/(<section class="panel" id="layerPanel"[\s\S]*?<\/section>)/, "")
    .replace(
      '<main class="center">',
      '<main class="center"><section class="panel" id="layerPanel" tabindex="0">' +
        controls +
        '<div id="layers" hidden></div></section>',
    )
    .replace(
      "const base=images.get(0);if(base)drawSprite(base,picture);",
      "const base=images.get(0);if(globalThis.ikemenPreviewLayers)globalThis.ikemenPreviewLayers.draw(base,picture);else if(base)drawSprite(base,picture);",
    )
    .replace(
      "</style>",
      ".air-preview-layer-split{display:flex;flex:1 1 auto;min-height:0;min-width:0;overflow:hidden}.air-preview-layer-split>.stage{flex:1 1 auto!important;min-width:0!important;min-height:0!important}.air-preview-layer-split>#layerPanel{align-self:stretch;box-sizing:border-box;border-right:1px solid var(--vscode-panel-border);font-size:12px}.air-preview-layer-split>#layerPanel h3{margin:3px 0;font-size:13px}.air-preview-layer-split>#layerPanel>p.muted{font-size:10px;margin:3px 0}.air-preview-layer-split>#layerPanel button{min-height:24px;padding:2px 4px}.air-preview-layer-split>#layerPanel .preview-layer-row{min-height:24px}.workspace>.center>.air-preview-layer-split{flex:1 1 auto!important;min-height:160px!important}@media(max-width:420px){.air-preview-layer-split>#layerPanel{width:180px!important;min-width:165px!important;max-width:65%!important}}#layerPanel>.row{display:flex;gap:3px;flex-wrap:wrap}#layerPanel>.row>button{width:25px!important;min-width:25px!important;max-width:25px!important;height:25px;min-height:25px;padding:0!important;flex:none}#layerPanel>.row>#previewLayerReset{width:auto!important;max-width:none!important;padding:0 5px!important}.preview-layer-row{display:flex;gap:4px;margin:3px 0}.preview-layer-row button{flex:1;text-align:left}.preview-layer-row button[aria-pressed=true]{outline:1px solid var(--vscode-focusBorder)}#previewLayerFields{display:grid;grid-template-columns:1fr 1fr;gap:5px}#previewLayerFields label{display:flex;flex-direction:column}#previewLayerFields input{min-width:0;width:100%;box-sizing:border-box}</style>",
    )
    .replace(
      "</script></body>",
      `globalThis.ikemenPreviewLayers=(${runtime.toString()})({model:()=>model,action:()=>action,index:()=>frameIndex,elapsed:()=>visualClock.elapsed(),saved:()=>saved,save:saveAirView,post:message=>vscode.postMessage(message),draw,drawSprite,canvas,zoom:()=>zoom,playback:airPlayback,visual:airVisual,basePalette:()=>paletteValue(current()?.group)??current()?.spritePaletteIndex??null},${normalizePreviewLayers.toString()},(normalizePreviewLayers=>(${editPreviewLayers.toString()}))(${normalizePreviewLayers.toString()}),${require('./preview_layer_list').clientSource()},((normalizePreviewLayers,orderedPreviewLayers)=>(${movePreviewLayer.toString()}))(${normalizePreviewLayers.toString()},${orderedPreviewLayers.toString()}),${require('./preview_layer_list').compactSource()},${require('./shared_layer_client').sharedLayerClient.toString()});const layerWorkspaceLauncher=${require('./preview_layer_list').launcherSource()}(document.getElementById('layerPanel'),draw);if(model.openLayerWorkspace)layerWorkspaceLauncher.open();window.addEventListener('message',event=>{if(event.data?.type==='openLayerWorkspace')layerWorkspaceLauncher.open()});draw();</script></body>`,
    );
}
function validateBinding(filename, sffPath, message) {
  const path = require("node:path"),
    key = (value) => path.resolve(value).toLowerCase();
  if (
    typeof message.airPath !== "string" ||
    key(message.airPath) !== key(filename) ||
    typeof message.sffPath !== "string" ||
    (message.sffPath ? key(message.sffPath) : "") !==
      (sffPath ? key(sffPath) : "")
  )
    throw new Error(
      "The preview layer asset changed. Refresh this viewer before editing layers.",
    );
}
module.exports = { runtime, install, validateBinding };
