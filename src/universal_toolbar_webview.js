'use strict';

const { CONTRACT_ID, DIMENSIONS, GROUPS, SLOTS, SPECIALIST_ACTION_IDS, deepFreeze } = require('./viewer_toolbar_contract');
const { adapt } = require('./universal_toolbar_adapter');
const { SURFACES } = require('./viewer_surface_registry');

const MESSAGE_TYPE = 'ikemaker.universal-toolbar.invoke';
const ROOT_CLASS = 'ikemaker-universal-toolbar';
const surfaceById = new Map(SURFACES.map((surface) => [surface.id, surface]));
const slotById = new Map(SLOTS.map((slot) => [slot.id, slot]));
const specialistIds = new Set(SPECIALIST_ACTION_IDS);
const TONE_HUES = Object.freeze({ danger: 2, create: 142, save: 215, run: 174, navigate: 268, edit: 34, view: 195, neutral: 220 });

function buttonTone(value) {
  const text = String(value || '').toLowerCase();
  if (/delete|remove|discard|clear|stop|close|cancel/.test(text)) return 'danger';
  if (/new|add|create|duplicate|insert/.test(text)) return 'create';
  if (/save|export|backup|copy/.test(text)) return 'save';
  if (/play|run|training|versus|launch|audition|loop|pause/.test(text)) return 'run';
  if (/previous|next|back|forward|seek|move earlier|move later|home|end/.test(text)) return 'navigate';
  if (/edit|replace|change|rename|apply|comment|crop|resize|rotate|align|remap/.test(text)) return 'edit';
  if (/view|preview|fit|zoom|axis|grid|show|open|browser|search|find/.test(text)) return 'view';
  return 'neutral';
}

function toneAttributes(value, key = value) {
  const tone = buttonTone(value), source = String(key || value || '');
  let hash = 0;
  for (let index = 0; index < source.length; index++) hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  const hue = (TONE_HUES[tone] + (hash % 19) - 9 + 360) % 360;
  return ` data-button-tone="${tone}" style="--viewer-button-hue:${hue}"`;
}

const ICONS = deepFreeze({
  new: '+', close: '×', open: '↗', save: '▣', 'auto-save': '↻', 'save-as': '⎘', 'text-source': '✎', 'connected-resources': '⧉',
  backup: '↥', recovery: '↺', run: '▶', versus: '∞', training: '◎', restart: '⟳', project: '▦', stage: '▱',
  sprites: '▧', animations: '▷', commands: '⌁', states: '{}', sounds: '♫', palettes: '◐',
  'code-structure': '⋮', 'viewer-browser': '▤', 'actions-search': '⌕', 'suite-switch': '⇄', updates: '⇩', help: '?', settings: '⚙'
});

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function validateToolbarModel(model, expectedSurfaceId) {
  if (!model || model.contractId !== CONTRACT_ID) throw new Error(`Universal toolbar requires ${CONTRACT_ID}.`);
  if (String(model.surfaceId || '') !== String(expectedSurfaceId || model.surfaceId || '')) throw new Error('Universal toolbar surface does not match its host.');
  const surface = surfaceById.get(String(model.surfaceId || ''));
  if (!surface || surface.toolbarContractId !== CONTRACT_ID) throw new Error(`Unknown or excluded universal toolbar surface: ${model.surfaceId || ''}`);
  if (!model.dimensions || model.dimensions.width !== DIMENSIONS.width || model.dimensions.height !== DIMENSIONS.height || model.dimensions.wrap !== DIMENSIONS.wrap || model.dimensions.horizontalScroll !== DIMENSIONS.horizontalScroll) throw new Error('Universal toolbar dimensions do not match the canonical contract.');
  if (!Array.isArray(model.slots) || model.slots.length !== SLOTS.length) throw new Error(`Universal toolbar must contain all ${SLOTS.length} canonical slots.`);
  model.slots.forEach((slot, index) => {
    const canonical = SLOTS[index];
    if (!slot || slot.id !== canonical.id || slot.label !== canonical.label || slot.actionId !== canonical.actionId || slot.group !== canonical.group || slot.groupIndex !== canonical.groupIndex || slot.slotIndex !== canonical.slotIndex) throw new Error(`Universal toolbar slot ${index} is not canonical.`);
    if (specialistIds.has(slot.id) || specialistIds.has(slot.actionId) || specialistIds.has(String(slot.dispatch || '').trim())) throw new Error(`Specialist action ${slot.id || slot.actionId} belongs in the viewer body.`);
    if (slot.enabled && (!String(slot.dispatch || '').trim() || slot.reason)) throw new Error(`Enabled universal slot ${slot.id} has an invalid capability state.`);
    if (!slot.enabled && !String(slot.reason || '').trim()) throw new Error(`Disabled universal slot ${slot.id} requires an unavailable reason.`);
  });
  return model;
}

function universalToolbarStyle() {
  return `.${ROOT_CLASS}{box-sizing:border-box;display:flex;align-items:center;align-content:flex-start;flex-wrap:wrap;gap:3px;max-width:100%;min-height:33px;overflow-x:hidden;overflow-y:visible;padding:3px;color:var(--vscode-foreground);background:var(--vscode-editor-background)}.${ROOT_CLASS},.${ROOT_CLASS} *{box-sizing:border-box}.${ROOT_CLASS}__group{display:inline-flex;flex:0 0 auto;flex-wrap:nowrap;gap:2px;align-items:center}.${ROOT_CLASS}__group+.${ROOT_CLASS}__group{padding-inline-start:3px;border-inline-start:1px solid var(--vscode-panel-border)}.${ROOT_CLASS}__button{display:inline-grid;place-items:center;flex:0 0 ${DIMENSIONS.width}px;width:${DIMENSIONS.width}px;height:${DIMENSIONS.height}px;min-width:${DIMENSIONS.width}px;min-height:${DIMENSIONS.height}px;margin:0;padding:0;border:1px solid var(--vscode-input-border,var(--vscode-panel-border));border-radius:0;color:var(--vscode-input-foreground,var(--vscode-foreground));background:var(--vscode-input-background);font:700 14px/1 var(--vscode-font-family);cursor:pointer}.${ROOT_CLASS}__button:hover:not(:disabled){background:var(--vscode-toolbar-hoverBackground)}.${ROOT_CLASS}__button:focus-visible{outline:2px solid var(--vscode-focusBorder);outline-offset:1px}.${ROOT_CLASS}__button:disabled{cursor:not-allowed;opacity:.5}.${ROOT_CLASS}__icon{pointer-events:none}.${ROOT_CLASS}__sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.${ROOT_CLASS} .ikemaker-toolbar-context-menu{position:fixed;z-index:2147483647;display:flex;flex-direction:column;min-width:190px;padding:4px;background:var(--vscode-menu-background,var(--vscode-editor-background));color:var(--vscode-menu-foreground,var(--vscode-foreground));border:1px solid var(--vscode-menu-border,var(--vscode-panel-border));box-shadow:0 8px 24px #0008}.${ROOT_CLASS} .ikemaker-toolbar-context-menu button{min-height:26px;padding:5px 9px;text-align:left;border:0;background:transparent;color:inherit;font:inherit}.${ROOT_CLASS} .ikemaker-toolbar-context-menu button:hover,.${ROOT_CLASS} .ikemaker-toolbar-context-menu button:focus{background:var(--vscode-menu-selectionBackground,var(--vscode-list-hoverBackground));outline:none}`;
}

function renderUniversalToolbar(model, options = {}) {
  validateToolbarModel(model, options.surfaceId);
  const slots = new Map(model.slots.map((slot) => [slot.id, slot]));
  const groups = GROUPS.map((group) => {
    const buttons = group.slots.map((canonical) => {
      const slot = slots.get(canonical.id), reason = String(slot.reason || '').trim();
      const title = slot.enabled ? slot.label : `${slot.label} — unavailable: ${reason}`;
      const pressed=slot.id==='auto-save'&&typeof slot.pressed==='boolean'?` aria-pressed="${slot.pressed?'true':'false'}"`:'';
      const saveCapable=slot.id==='save'?` data-manual-save-capable="${slot.manualSaveCapable===true?'true':'false'}" data-save-policy-owned="${slot.savePolicyOwned===true?'true':'false'}"`:'';
      return `<button type="button" class="${ROOT_CLASS}__button" data-universal-slot="${escapeHtml(slot.id)}" data-universal-group="${slot.groupIndex}" data-universal-coordinate="${slot.groupIndex}:${slot.slotIndex}"${toneAttributes(`${slot.id} ${slot.label}`, slot.actionId)} aria-label="${escapeHtml(slot.label)}"${pressed}${saveCapable}${slot.enabled ? '' : ` disabled aria-disabled="true" aria-description="${escapeHtml(reason)}"`} title="${escapeHtml(title)}"><span class="${ROOT_CLASS}__icon" aria-hidden="true">${escapeHtml(ICONS[slot.id] || '•')}</span><span class="${ROOT_CLASS}__sr">${escapeHtml(slot.label)}</span></button>`;
    }).join('');
    return `<div class="${ROOT_CLASS}__group" role="group" aria-label="${escapeHtml(group.id)}">${buttons}</div>`;
  }).join('');
  return `<nav class="${ROOT_CLASS}" data-toolbar-contract="${CONTRACT_ID}" data-surface-id="${escapeHtml(model.surfaceId)}" aria-label="${escapeHtml(options.label || 'IKEMaker universal actions')}">${groups}</nav>`;
}

function universalToolbarClientScript(options = {}) {
  const shared = typeof options.vscodeVariable === 'string' && /^[A-Za-z_$][\w$]*$/.test(options.vscodeVariable) ? options.vscodeVariable : '';
  const bridge = shared ? `const bridge=${shared};` : 'const bridge=acquireVsCodeApi();';
  return `(function(){'use strict';const root=document.querySelector('.${ROOT_CLASS}');if(!root||root.dataset?.universalToolbarBound==='true')return;if(root.dataset)root.dataset.universalToolbarBound='true';${bridge}const openable=new Set(['open','text-source','connected-resources','project','stage','sprites','animations','commands','states','sounds','palettes','code-structure','viewer-browser','actions-search','suite-switch','help','settings']),matchSetup=new Set(['versus','training']);let contextMenu=null,contextTrigger=null;const closeContext=(restoreFocus=false)=>{contextMenu?.remove();contextMenu=null;const trigger=contextTrigger;contextTrigger=null;if(restoreFocus&&trigger?.isConnected)trigger.focus()};const moveContextFocus=(menu,event)=>{const items=[...menu.querySelectorAll('[role="menuitem"]:not(:disabled)')],at=items.indexOf(document.activeElement);if(!items.length)return;if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeContext(true);return}if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?items.length-1:event.key==='ArrowUp'?(at<=0?items.length-1:at-1):(at<0||at===items.length-1?0:at+1);items[next].focus()};const showContext=(event,slotId,trigger,send)=>{event.preventDefault();event.stopPropagation();closeContext();contextTrigger=trigger;const menu=document.createElement('div');menu.className='ikemaker-toolbar-context-menu';menu.setAttribute('role','menu');menu.setAttribute('aria-label',(trigger.getAttribute('aria-label')||'Toolbar action')+' options');for(const [disposition,label]of[['beside','Open side by side'],['window','Open in new window'],['close-tab','Close current tab'],['close-window','Close current window']]){const choice=document.createElement('button');choice.type='button';choice.setAttribute('role','menuitem');choice.dataset.disposition=disposition;choice.textContent=label;choice.onclick=()=>{closeContext();send(disposition)};menu.append(choice)}menu.addEventListener('keydown',event=>moveContextFocus(menu,event));root.append(menu);const width=200,height=menu.offsetHeight||124,rect=trigger.getBoundingClientRect?.(),clientX=Number.isFinite(event.clientX)&&event.clientX>0?event.clientX:rect?.left,clientY=Number.isFinite(event.clientY)&&event.clientY>0?event.clientY:rect?.bottom;menu.style.left=Math.max(4,Math.min(clientX||4,innerWidth-width-4))+'px';menu.style.top=Math.max(4,Math.min(clientY||4,innerHeight-height-4))+'px';contextMenu=menu;menu.querySelector('button')?.focus()};const invokeContext=(event,button)=>{if(!button||!root.contains(button)||button.disabled)return;const slot=button.dataset.universalSlot;if(slot==='updates'){event.preventDefault();event.stopPropagation();bridge.postMessage({type:${JSON.stringify(MESSAGE_TYPE)},slotId:slot,configure:true});return}if(matchSetup.has(slot)){event.preventDefault();event.stopPropagation();bridge.postMessage({type:${JSON.stringify(MESSAGE_TYPE)},slotId:slot,setup:true});return}if(!openable.has(slot))return;showContext(event,slot,button,disposition=>bridge.postMessage({type:${JSON.stringify(MESSAGE_TYPE)},slotId:slot,disposition}))};root.addEventListener('contextmenu',event=>invokeContext(event,event.target.closest('[data-universal-slot]')));root.addEventListener('keydown',event=>{if(event.key==='ContextMenu'||(event.shiftKey&&event.key==='F10'))invokeContext(event,event.target.closest('[data-universal-slot]'))});root.addEventListener('click',function(event){const button=event.target.closest('[data-universal-slot]');if(!button||!root.contains(button)||button.disabled)return;bridge.postMessage({type:${JSON.stringify(MESSAGE_TYPE)},slotId:button.dataset.universalSlot});});globalThis.addEventListener?.('message',event=>{const state=event.data;if(state?.type!=='ikemenSavePolicy')return;const auto=root.querySelector('[data-'+'universal-slot="auto-save"]'),save=root.querySelector('[data-'+'universal-slot="save"]');if(auto){auto.setAttribute('aria-pressed',state.enabled?'true':'false');auto.title='Auto Save is '+(state.enabled?'on':'off')+' for the focused file. Select to turn it '+(state.enabled?'off':'on')+'.'}if(save&&save.dataset.manualSaveCapable==='true'&&save.dataset.savePolicyOwned!=='true'){save.disabled=state.enabled===true;save.setAttribute('aria-disabled',state.enabled?'true':'false');save.title=state.enabled?'Save is unavailable because Auto Save is on.':'Save all pending changes for the focused file.';if(state.enabled)save.setAttribute('aria-description','Save is unavailable because Auto Save is on.');else save.removeAttribute('aria-description')}});document.addEventListener('pointerdown',event=>{if(contextMenu&&!contextMenu.contains(event.target))closeContext()});document.addEventListener('click',function(event){const button=event.target.closest('[data-ikemaker-body-message]');if(!button||button.disabled)return;const type=button.dataset.ikemakerBodyMessage;if(typeof type!=='string'||!/^[a-z][a-z0-9-]{0,63}$/.test(type))return;bridge.postMessage({type});});})();`;
}

function assertMessage(message) {
  if (!message || (Object.getPrototypeOf(message) !== Object.prototype && Object.getPrototypeOf(message) !== null)) throw new Error('Universal toolbar message must be a plain object.');
  const keys = Object.keys(message).sort(),hasConfigure=keys.length===3&&keys[0]==='configure'&&keys[1]==='slotId'&&keys[2]==='type',hasDisposition=keys.length===3&&keys[0]==='disposition'&&keys[1]==='slotId'&&keys[2]==='type',hasSetup=keys.length===3&&keys[0]==='setup'&&keys[1]==='slotId'&&keys[2]==='type';
  if (!(keys.length === 2 && keys[0] === 'slotId' && keys[1] === 'type') && !hasConfigure && !hasDisposition && !hasSetup) throw new Error('Universal toolbar message contains forged or extra fields.');
  if (message.type !== MESSAGE_TYPE) throw new Error('Unknown universal toolbar message type.');
  if (typeof message.slotId !== 'string' || !slotById.has(message.slotId) || specialistIds.has(message.slotId)) throw new Error('Unknown or specialist universal toolbar slot.');
  if(hasDisposition&&!require('./toolbar_open_disposition').valid(message.disposition))throw new Error('Unknown toolbar opening disposition.');
  if(hasConfigure&&(message.configure!==true||message.slotId!=='updates'))throw new Error('Unknown update configuration request.');
  if(hasSetup&&(message.setup!==true||!['versus','training'].includes(message.slotId)))throw new Error('Unknown match setup request.');
  return message.slotId;
}

function normalizeHandlers(handlersBySurface = {}) {
  const result = new Map();
  for (const [surfaceId, supplied] of Object.entries(handlersBySurface)) {
    const surface = surfaceById.get(surfaceId);
    if (!surface || surface.toolbarContractId !== CONTRACT_ID) throw new Error(`Cannot register universal handlers for surface: ${surfaceId}`);
    if (!supplied || Object.getPrototypeOf(supplied) !== Object.prototype) throw new TypeError(`Universal handlers for ${surfaceId} must be a plain object.`);
    const handlers = new Map();
    for (const [slotId, handler] of Object.entries(supplied)) {
      if (!slotById.has(slotId) || specialistIds.has(slotId)) throw new Error(`Cannot register non-universal handler: ${slotId}`);
      if (typeof handler !== 'function') throw new TypeError(`Universal handler ${surfaceId}/${slotId} must be a function.`);
      handlers.set(slotId, handler);
    }
    result.set(surfaceId, handlers);
  }
  return result;
}

function createUniversalToolbarDispatcher(options = {}) {
  const handlers = normalizeHandlers(options.handlersBySurface || options.handlers || {});
  const getToolbar = options.getToolbar || (async (surfaceId) => adapt(surfaceId, await options.getCapabilities?.(surfaceId) || {}, await options.getAdapterOptions?.(surfaceId) || {}));
  if (typeof getToolbar !== 'function') throw new TypeError('Universal toolbar dispatcher requires a toolbar provider.');
  let queue = Promise.resolve();
  const dispatch = (surfaceId, message) => {
    const id = String(surfaceId || '');
    let slotId;
    try { slotId = assertMessage(message); } catch (error) { return Promise.reject(error); }
    const surface = surfaceById.get(id), surfaceHandlers = handlers.get(id);
    if (!surface || surface.toolbarContractId !== CONTRACT_ID || !surfaceHandlers) return Promise.reject(new Error(`Unregistered universal toolbar surface: ${id}`));
    const operation = queue.then(async () => {
      const model = validateToolbarModel(await getToolbar(id), id), slot = model.slots.find((candidate) => candidate.id === slotId);
      if (!slot || slot.actionId !== slotById.get(slotId).actionId) throw new Error('Universal toolbar slot does not match the canonical contract.');
      if (!slot.enabled) throw new Error(slot.reason || `Universal toolbar slot ${slotId} is disabled.`);
      if (specialistIds.has(slot.id) || specialistIds.has(slot.actionId) || specialistIds.has(String(slot.dispatch || '').trim())) throw new Error('Specialist actions cannot dispatch through universal chrome.');
      if(message.setup===true)return require('vscode').commands.executeCommand('ikemen.quickLaunch.openSetup',slotId==='training'?'training':'versus');
      const disposition=message.disposition,placement=require('./toolbar_open_disposition');
      if(disposition&&placement.closes(disposition))return placement.apply(require('vscode'),disposition);
      const handler = surfaceHandlers.get(slotId) || (slotId === 'auto-save'
        ? async () => require('./save_controls').toggle(options.seed || '')
        : slotId === 'restart'
        ? async () => require('vscode').commands.executeCommand('ikemen.restartRunning')
        : slotId === 'updates'
        ? async () => require('vscode').commands.executeCommand(message.configure === true ? 'ikemen.updates.configureFrequency' : 'ikemen.updates.checkAll')
        : null);
      if (!handler) throw new Error(`No closed universal handler is registered for ${id}/${slotId}.`);
      const intent={surfaceId:id,slotId,actionId:slot.actionId};if(disposition)intent.disposition=disposition;const result=await handler(deepFreeze(intent));
      if(disposition)await placement.apply(require('vscode'),disposition);return result;
    });
    queue = operation.catch(() => undefined);
    return operation;
  };
  return deepFreeze({ dispatch, messageType: MESSAGE_TYPE, registeredSurfaceIds: deepFreeze([...handlers.keys()].sort()) });
}

module.exports = {
  MESSAGE_TYPE, ROOT_CLASS, ICONS, escapeHtml, validateToolbarModel, universalToolbarStyle,
  renderUniversalToolbar, render: renderUniversalToolbar, universalToolbarClientScript, clientScript: universalToolbarClientScript,
  createUniversalToolbarDispatcher, createDispatcher: createUniversalToolbarDispatcher
};
