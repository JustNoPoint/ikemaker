'use strict';

// Runs inside the real AIR client; timing remains owned by air_playback.
function runtime(api) {
  const select = document.getElementById('onionMode'), pin = document.getElementById('onionPinnedTick');
  const status = document.getElementById('onionTickStatus'), actionInput = document.getElementById('onionPinnedAction'), pinCurrent = document.getElementById('pinCurrentOnion'), frameInput = document.getElementById('onionPinnedFrame');
  const allowed = ['off', 'elements', 'previous', 'next', 'pinned', 'frame'];
  const saved = api.state();
  let mode = allowed.includes(saved.onionMode) ? saved.onionMode : api.depth() ? 'elements' : 'off';
  let pinnedTick = Number.isSafeInteger(saved.onionPinnedTick) && saved.onionPinnedTick > 0 ? saved.onionPinnedTick : 1;
  let pinnedElement = Number.isSafeInteger(saved.onionPinnedElement) && saved.onionPinnedElement >= 0 ? saved.onionPinnedElement : 0;
  let pinnedAction = Number.isSafeInteger(saved.onionPinnedAction) ? saved.onionPinnedAction : null;
  function reference(context) { if(actionInput&&actionInput.value.trim()!==''&&!Number.isSafeInteger(Number(actionInput.value)))return null;if (pinnedAction === null) return context.action; const matches = (context.model.actions || [context.action]).filter(item => item?.number === pinnedAction); return matches.length === 1 ? matches[0] : null; }
  let wrapped = false, lastAction, lastModel, targetKey = '', serial = 0, entry = null;
  let pinAction, pinValue, pinPose;
  const cache = new Map();
  function say(value) { if (status.textContent !== value) status.textContent = value; }
  function invalidate() { targetKey = ''; serial++; entry = null; }
  function reset() { wrapped = false; invalidate(); }
  function sync() {
    if(actionInput){actionInput.value=pinnedAction===null?'':String(pinnedAction);actionInput.parentElement.hidden=!['pinned','frame'].includes(mode);}
    if(frameInput){frameInput.value=String(pinnedElement+1);frameInput.parentElement.hidden=mode!=='frame';}
    select.value = mode; pin.value = String(pinnedTick); pin.disabled = mode !== 'pinned'; pin.parentElement.hidden = mode !== 'pinned';
    const tick = !['off', 'elements'].includes(mode);
    for (const id of ['onion', 'compactOnion']) {
      const button = document.getElementById(id); if (!button) continue;
      button.classList.toggle('active', mode !== 'off');
      const label = mode === 'elements' ? 'Onion: ' + api.depth() : mode === 'off' ? 'Onion: Off' : 'Onion: ' + (mode === 'pinned' ? 'tick ' + pinnedTick : mode === 'frame' ? 'frame ' + (pinnedElement+1) : mode + ' tick');
      const caption = button.querySelector?.('[data-ikm-action-label]');
      if (caption) {
        caption.textContent = label;
        button.dataset.ikmActionIcon = mode === 'elements' ? '◉' + api.depth() : '◉';
        button.setAttribute('aria-label', label);
      } else button.textContent = label;
      button.title = tick ? 'Tick onion preview; choose its mode beside this button. No source changes.' : 'Cycle adjacent element onion depth: Off, 1, 2. Tick modes are available beside this button.';
    }
    api.save({ onionMode: mode, onionPinnedTick: pinnedTick, onionPinnedAction: pinnedAction, onionPinnedElement: pinnedElement });
  }
  function change() { invalidate(); say(''); sync(); api.refresh(); }
  select.onchange = () => { mode = allowed.includes(select.value) ? select.value : 'off'; if (mode === 'elements' && !api.depth()) api.setDepth(1); change(); };
  pin.onchange = () => { const value = Number(pin.value); if (!Number.isSafeInteger(value) || value < 1) { invalidate(); say('Enter a whole tick starting at 1 (the first authored tick).'); return; } pinnedTick = value; change(); };
  if(actionInput)actionInput.onchange=()=>{const value=actionInput.value.trim();if(value!==''&&!Number.isSafeInteger(Number(value))){say('Enter an exact action number or leave blank for the current action.');return;}pinnedAction=value===''?null:Number(value);pinAction=null;change();};
  if(frameInput)frameInput.onchange=()=>{const value=Number(frameInput.value);if(!Number.isSafeInteger(value)||value<1){invalidate();say('Enter an authored frame number starting at 1.');return;}pinnedElement=value-1;change();};
  if(pinCurrent)pinCurrent.onclick=()=>{const context=api.context();if(!context.action||!context.action.frames[context.index])return;pinnedAction=context.action.number;pinnedElement=context.index;mode='frame';pinAction=null;change();};
  document.getElementById('onion').onclick = () => { const depth = mode === 'elements' ? (api.depth() + 1) % 3 : mode === 'off' ? 1 : 0; api.setDepth(depth); mode = depth ? 'elements' : 'off'; change(); };
  window.addEventListener('message', async event => {
    const message = event.data;
    if (message.type === 'images' && mode === 'elements' && message.requestId === api.baseRequest()) { say(message.onionWarning || ''); return; }
    if (message.type !== 'tickOnionImage' || message.requestId !== serial || message.cacheKey !== targetKey) return;
    if (!message.item) { entry = null; say('Onion sprite unavailable.'); return; }
    const request = serial, key = targetKey, image = new Image(); image.src = message.item.dataUri;
    try { await image.decode(); } catch (_) { return; }
    if (request !== serial || key !== targetKey) return;
    entry = { ...message.item, image, opacity: .34 };
    cache.set(key, entry); if (cache.size > 24) cache.delete(cache.keys().next().value);
    api.draw();
  });
  function draw() {
    const context = api.context(), action = context.action;
    if (context.model !== lastModel) { cache.clear(); reset(); lastModel = context.model; }
    if (action !== lastAction) { reset(); lastAction = action; }
    if (mode === 'off' || !action) { say(''); return; }
    if (mode === 'elements') return;
    if (mode === 'pinned' && (!Number.isSafeInteger(Number(pin.value)) || Number(pin.value) < 1)) { say('Enter a whole tick starting at 1 (the first authored tick).'); return; }
    let pose, sourceAction = ['pinned','frame'].includes(mode) ? reference(context) : action;
    if(!sourceAction){invalidate();say('Pinned action is missing or duplicated. Choose an exact action again.');return;}
    if(mode==='frame'){const value=Number(frameInput?.value??pinnedElement+1);if(!Number.isSafeInteger(value)||value<1||!sourceAction.frames[value-1]){invalidate();say('Pinned frame is unavailable. Choose an authored frame in this action.');return;}pose={index:value-1,elapsed:0};}
    else if (mode === 'pinned') {
      if (pinAction !== sourceAction || pinValue !== pinnedTick) { pinAction = sourceAction; pinValue = pinnedTick; pinPose = api.playback.onionTick(sourceAction, 0, 0, mode, pinnedTick); }
      pose = pinPose;
    } else pose = api.playback.onionTick(action, context.index, context.elapsed, mode, pinnedTick, wrapped);
    if (!pose) { say(mode === 'previous' && context.index === 0 ? 'First tick: no previous pose before playback starts.' : 'No onion pose at this tick.'); targetKey = ''; serial++; entry = null; return; }
    const frame = api.visual.sample(sourceAction, pose.index, pose.elapsed);
    say((pinnedAction===null?'':'Action '+sourceAction.number+' · ')+(mode==='frame'?'Pinned frame '+(pose.index+1)+(Number(sourceAction.frames[pose.index].rawTime)===0?' · zero-time authored pose':''):'Onion tick ' + (Math.floor(pose.elapsed) + 1) + ' within element ' + (pose.index + 1)));
    if (frame.group === -1 || frame.index === -1) { targetKey = ''; serial++; entry = null; return; }
    const palette = api.palette(frame.group), key = frame.group + ',' + frame.index + ':p' + (palette === null ? 'sprite' : palette);
    if (key !== targetKey) {
      targetKey = key; serial++; entry = cache.get(key) || null;
      if (!entry) api.post({ type: 'tickOnionFrame', requestId: serial, frame: { group: frame.group, index: frame.index }, paletteIndex: palette, followSpritePalette: context.follow });
    }
    if (entry) api.drawSprite(entry, frame);
  }
  sync();
  return { draw, reset, source() { const context = api.context();if(!['pinned','frame'].includes(mode)||!context.action)return null;const selected=reference(context);if(!selected)return null;let pose;if(mode==='frame'){const value=Number(frameInput?.value??pinnedElement+1);pose=Number.isSafeInteger(value)&&value>=1&&selected.frames[value-1]?{index:value-1}:null;}else{const value=Number(pin.value);pose=Number.isSafeInteger(value)&&value>=1?api.playback.onionTick(selected,0,0,'pinned',value):null;}return pose?{sourceAction:selected.number,sourceElement:pose.index}:null; }, mode: () => mode, advance(next, previous) { if (next <= previous) wrapped = true; } };
}

function install(page) {
  const controls = '<label class="tick-onion-control">Onion <select id="onionMode" aria-label="Onion preview mode"><option value="off">Off</option><option value="elements">Elements</option><option value="previous">Previous tick</option><option value="next">Next tick</option><option value="pinned">Pinned tick</option><option value="frame">Pinned frame</option></select></label><button id="pinCurrentOnion" title="Keep this exact authored frame as the onion reference, including zero-time frames, while selecting other actions">Pin current frame</button><label class="tick-onion-control">Action <input id="onionPinnedAction" aria-label="Pinned onion action number" type="number" step="1" placeholder="Current" style="width:75px"></label><label class="tick-onion-control">Frame <input id="onionPinnedFrame" aria-label="Pinned onion frame (one-based)" type="number" min="1" step="1" value="1" style="width:65px"></label><label class="tick-onion-control">Tick <input id="onionPinnedTick" aria-label="Pinned onion tick (one-based)" type="number" min="1" step="1" value="1" style="width:65px"></label><span id="onionTickStatus" class="muted" role="status"></span>';
  return page.replace(/(<button id="compactOnion"[^>]*>[\s\S]*?<\/button>)/, '$1' + controls)
    .replace('[...images.values()].filter(e=>e.onion)', 'globalThis.ikemenTickOnion?.draw();[...images.values()].filter(e=>e.onion&&(!globalThis.ikemenTickOnion||globalThis.ikemenTickOnion.mode()===\'elements\'))')
    .replace('onion:onionDepth?{action:', "onion:onionDepth&&(!globalThis.ikemenTickOnion||globalThis.ikemenTickOnion.mode()==='elements')?{action:")
    .replace('if(!action||!navigationAllowed())return false;collisionViewerEditEpoch++;', 'if(!action||!navigationAllowed())return false;globalThis.ikemenTickOnion?.reset();collisionViewerEditEpoch++;')
    .replace('frameIndex=Math.max(0,Math.min(Number(index)||0,action.frames.length-1));', 'frameIndex=Math.max(0,Math.min(Number(index)||0,action.frames.length-1));visualClock.sync(action,frameIndex,false,true);')
    .replace('function selectAction(number,keepFrame=false){', 'function selectAction(number,keepFrame=false){globalThis.ikemenTickOnion?.reset();')
    .replace('renderActions();renderStrip();if(action){requestFrame();schedule()}', 'visualClock.sync(action,frameIndex,playing,true);renderActions();renderStrip();if(action){requestFrame();schedule()}')
    .replace('timer=setTimeout(()=>{frameIndex=step.nextIndex;', 'timer=setTimeout(()=>{globalThis.ikemenTickOnion?.advance(step.nextIndex,frameIndex);frameIndex=step.nextIndex;')
    .replace('if(frameIndex!==step.index){frameIndex=step.index;', 'if(frameIndex!==step.index){globalThis.ikemenTickOnion?.advance(step.index,frameIndex);frameIndex=step.index;')
    .replace('</style>', '.tick-onion-control[hidden]{display:none}.tick-onion-control{display:inline-flex;align-items:center;gap:3px}.tick-onion-control select{max-width:125px}#onionTickStatus{font-size:11px}</style>')
    .replace('</script></body>', `globalThis.ikemenTickOnion=(${runtime.toString()})({state:()=>vscode.getState()||{},depth:()=>onionDepth,setDepth:value=>{onionDepth=value},save:saveAirView,refresh:requestFrame,draw,drawSprite,playback:airPlayback,visual:airVisual,baseRequest:()=>requestId,context:()=>({model,action,index:frameIndex,elapsed:visualClock.elapsed(),follow:followSpritePalette}),palette:group=>followSpritePalette?null:paletteValue(group),post:message=>vscode.postMessage(message)});draw();</script></body>`);
}
function spriteReply(session, message, decode) {
  const group = message.frame?.group, index = message.frame?.index;
  if (!Number.isSafeInteger(message.requestId) || message.requestId < 0 || !Number.isInteger(group) || !Number.isInteger(index)) throw new Error('Invalid tick onion sprite request.');
  const palette = message.followSpritePalette === true ? null : Number.isInteger(message.paletteIndex) && message.paletteIndex >= 0 ? message.paletteIndex : null;
  const cacheKey = `${group},${index}:p${palette === null ? 'sprite' : palette}`;
  const sprite = group === -1 || index === -1 ? null : session.byKey.get(`${group},${index}`);
  return { type: 'tickOnionImage', requestId: message.requestId, cacheKey, item: sprite ? { sprite: { axisX: sprite.axisX, axisY: sprite.axisY }, dataUri: decode(session.archive, sprite, palette) } : null };
}
module.exports = { runtime, install, spriteReply };
