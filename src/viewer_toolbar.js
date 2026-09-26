'use strict';

const ACTIONS = Object.freeze(['back', 'forward', 'back-source', 'used-by', 'related', 'air', 'sff', 'snd', 'source', 'pinned', 'compare', 'game', 'versus', 'training', 'backup', 'autosave']);
const KEY = 'ikemaker.viewerToolbars.v1';
let storage = null, preferences = {}, writing = Promise.resolve();
const panels = new Map();

function normalize(input) {
  const order = [...new Set((Array.isArray(input?.order) ? input.order : []).filter(id => ACTIONS.includes(id)))];
  return { order: [...order, ...ACTIONS.filter(id => !order.includes(id))], hidden: [...new Set((Array.isArray(input?.hidden) ? input.hidden : []).filter(id => ACTIONS.includes(id)))] };
}
function configure(context) { storage = context.globalState; preferences = storage?.get(KEY, {}) || {}; require('./viewer_layout').configure(context); }
const BASIC=['sff','air','snd','source','game'];
function read(surface,mode=require('./interface_mode').current()) { return normalize(preferences[surface+':'+mode] || (mode==='workspace'?preferences[surface]:undefined) || (['sff','air','snd'].includes(surface)&&mode!=='workspace'?{order:BASIC,hidden:ACTIONS.filter(id=>!BASIC.includes(id))}:undefined)); }
function controlsHtml(surface) {
  const initial = JSON.stringify(read(surface)).replace(/&/g,'&amp;').replace(/"/g,'&quot;');
  return `<span class="viewer-toolbar-options" data-compact="${['sff','air','snd'].includes(surface)&&require('./asset_workspace').compact()}" data-mode="${require('./interface_mode').current()}" data-toolbar-surface="${surface}" data-toolbar-preferences="${initial}"><button data-toolbar-more title="Find hidden toolbar commands">More…</button><button data-toolbar-customize title="Show, hide, or reorder this viewer's shared toolbar">Customize…</button>${require('./viewer_layout').html(surface)}</span>`;
}
async function handle(message, panel) {
  if (!['viewerToolbarReady', 'viewerToolbarSave'].includes(message?.type)) return false;
  if (!panel?.webview || !/^[a-z][a-z0-9_-]{0,60}$/.test(message.surface || '')) return true;
  if (!panels.has(panel)) { panels.set(panel, {surface:message.surface,mode:['player','simple','workspace'].includes(message.mode)?message.mode:require('./interface_mode').current()}); panel.onDidDispose?.(() => panels.delete(panel)); }
  if(message.type==='viewerToolbarReady'&&['player','simple','workspace'].includes(message.mode))panels.set(panel,{surface:message.surface,mode:message.mode});
  if (message.type === 'viewerToolbarReady') {
    await panel.webview.postMessage({type:'viewerToolbarPreferences', surface:message.surface, mode:panels.get(panel).mode, preferences:read(message.surface,panels.get(panel).mode)});
    return true;
  }
  const {surface,mode} = panels.get(panel);
  // A serialized queue prevents two simultaneously open viewers from losing
  // each other's preferences, and only broadcasts changes after persistence.
  const change = normalize(message.preferences);
  writing = writing.catch(() => {}).then(async () => {
    if (!storage) throw new Error('Toolbar preferences are not available yet. Reopen the viewer.');
    const next = {...preferences, [surface+':'+mode]:change};
    await storage.update(KEY, next); preferences = next;
    for (const [target, kind] of panels) if (kind.surface === surface && kind.mode === mode) await target.webview.postMessage({type:'viewerToolbarPreferences',surface,mode,preferences:change,saved:true});
  });
  try { await writing; } catch(error) { await panel.webview.postMessage({type:'viewerToolbarError',surface,mode,message:error.message}); }
  return true;
}

function client() {
  for (const toolbar of document.querySelectorAll('.launch-controls')) {
    const options = toolbar.querySelector('[data-toolbar-surface]'); if (!options) continue;
    const surface = options.dataset.toolbarSurface;
    const buttons = [...toolbar.querySelectorAll('button')].filter(button => button.hasAttribute('data-ikemen-save') || button.hasAttribute('data-ikemen-used-by') || button.hasAttribute('data-ikemen-history') || button.hasAttribute('data-ikemen-back-source') || button.hasAttribute('data-ikemen-related') || button.hasAttribute('data-ikemen-viewer') || button.hasAttribute('data-ikemen-launch'));
    const identity = button => button.hasAttribute('data-ikemen-save') ? button.dataset.ikemenSave : button.hasAttribute('data-ikemen-used-by') ? 'used-by' : button.hasAttribute('data-ikemen-history') ? button.dataset.ikemenHistory : button.hasAttribute('data-ikemen-back-source') ? 'back-source' : button.hasAttribute('data-ikemen-related') ? 'related' : button.dataset.ikemenViewer || button.dataset.ikemenLaunch;
    const actions = new Map(buttons.map(button => [identity(button),button]));
    let current = JSON.parse(options.dataset.toolbarPreferences), draft, selected = current.order[0], busy = false;
    const dialog = document.createElement('dialog'); dialog.className = 'viewer-toolbar-dialog'; dialog.setAttribute('aria-label','Customize toolbar');
    dialog.innerHTML = '<h2>Customize toolbar</h2><p>Choose what stays visible. Hidden commands remain in More.</p><div class="viewer-toolbar-list"></div><div class="viewer-toolbar-dialog-actions"><button data-toolbar-up>Move Up</button><button data-toolbar-down>Move Down</button><button data-toolbar-reset>Reset</button></div><p role="status" data-toolbar-status></p><div class="viewer-toolbar-dialog-actions"><button data-toolbar-apply>Save</button><button data-toolbar-cancel>Cancel</button></div>';
    document.body.append(dialog);
    const list = dialog.querySelector('.viewer-toolbar-list'), status = dialog.querySelector('[data-toolbar-status]');
    const apply = () => {
      for (const id of current.order) { const button=actions.get(id); if (!button) continue; button.hidden=current.hidden.includes(id); toolbar.querySelector('.viewer-toolbar-actions').append(button); }
      options.querySelector('[data-toolbar-more]').textContent = current.hidden.length ? 'More… ('+current.hidden.length+')' : 'More…';
    };
    function render() {
      list.replaceChildren();
      for (const id of draft.order) {
        const row=document.createElement('div'); row.className='viewer-toolbar-row';
        const radio=document.createElement('input'); radio.type='radio'; radio.name='toolbar-order-'+surface; radio.checked=selected===id; radio.setAttribute('aria-label','Select '+actions.get(id).textContent.trim()+' to move'); radio.onchange=()=>{selected=id;};
        const label=document.createElement('label'), check=document.createElement('input'); check.type='checkbox'; check.checked=!draft.hidden.includes(id);
        check.onchange=()=>{draft.hidden=draft.hidden.filter(value=>value!==id);if(!check.checked)draft.hidden.push(id);};
        label.append(check,document.createTextNode(actions.get(id).textContent.trim())); row.append(radio,label);list.append(row);
      }
    }
    function openCustomize() {draft={order:[...current.order],hidden:[...current.hidden]};status.textContent='';render();dialog.showModal();}
    options.querySelector('[data-toolbar-customize]').onclick=openCustomize;
    for(const [selector,delta] of [['[data-toolbar-up]',-1],['[data-toolbar-down]',1]]) dialog.querySelector(selector).onclick=()=>{
      const at=draft.order.indexOf(selected), next=at+delta;if(next<0||next>=draft.order.length)return;
      [draft.order[at],draft.order[next]]=[draft.order[next],draft.order[at]];render();list.querySelector('input[type=radio]:checked')?.focus();
    };
    dialog.querySelector('[data-toolbar-reset]').onclick=()=>{draft={order:[...actions.keys()],hidden:[]};render();};
    dialog.querySelector('[data-toolbar-cancel]').onclick=()=>{if(!busy)dialog.close();};
    dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
    dialog.querySelector('[data-toolbar-apply]').onclick=()=>{if(busy)return;busy=true;status.textContent='Saving…';dialog.querySelector('[data-toolbar-apply]').disabled=true;vscode.postMessage({type:'viewerToolbarSave',surface,mode:options.dataset.mode,preferences:draft});};
    const more = document.createElement('dialog');more.className='viewer-toolbar-dialog';more.setAttribute('aria-label','More toolbar commands');document.body.append(more);
    options.querySelector('[data-toolbar-more]').onclick=()=>{
      more.replaceChildren();const heading=document.createElement('h2');heading.textContent='More commands';more.append(heading);
      const note=document.createElement('p');note.textContent='All shared toolbar commands, including hidden ones.';more.append(note);
      for(const id of current.order){const original=actions.get(id),button=document.createElement('button');button.textContent=original.textContent.trim();button.disabled=original.disabled;button.onclick=()=>{more.close();original.click();};more.append(button);}
      const customize=document.createElement('button');customize.textContent='Customize Toolbar…';customize.onclick=()=>{more.close();openCustomize();};
      const close=document.createElement('button');close.textContent='Close';close.onclick=()=>more.close();more.append(customize);if(['air','sff','snd'].includes(surface)){const mode=document.createElement('button');mode.textContent='Workspace mode…';mode.onclick=()=>{more.close();vscode.postMessage({type:'assetWorkspaceOptions'});};more.append(mode);}for(const original of options.querySelectorAll('[data-viewer-layout],[data-viewer-layout-reset]')){const button=document.createElement('button');button.textContent=original.textContent;button.onclick=()=>{more.close();original.click();};more.append(button);}more.append(close);more.showModal();
    };
    addEventListener('message',event=>{
      const message=event.data;if(message.surface!==surface||(message.mode&&message.mode!==options.dataset.mode))return;
      if(message.type==='viewerToolbarPreferences') {current=message.preferences;apply();if(message.saved&&busy){busy=false;dialog.querySelector('[data-toolbar-apply]').disabled=false;dialog.close();options.querySelector('[data-toolbar-customize]').focus();}}
      if(message.type==='viewerToolbarError'){busy=false;dialog.querySelector('[data-toolbar-apply]').disabled=false;status.textContent=message.message;}
    });
    apply();vscode.postMessage({type:'viewerToolbarReady',surface,mode:options.dataset.mode});
  }
}
function clientScript() {return '('+client.toString()+')();'+require('./map_registry_client').clientScript();}
function style() {return '.viewer-toolbar-options[data-compact=true]>[data-toolbar-customize],.viewer-toolbar-options[data-compact=true]>[data-viewer-layout],.viewer-toolbar-options[data-compact=true]>[data-viewer-layout-reset]{display:none}.launch-controls button,.viewer-toolbar-dialog button{font:inherit;color:var(--vscode-button-secondaryForeground,var(--vscode-foreground));background:var(--vscode-button-secondaryBackground,var(--vscode-input-background));border:1px solid var(--vscode-button-border,var(--vscode-panel-border));padding:6px 8px;cursor:pointer}.launch-controls button:disabled,.viewer-toolbar-dialog button:disabled{opacity:.45;cursor:default}.launch-controls button:focus-visible,.viewer-toolbar-dialog button:focus-visible{outline:2px solid var(--vscode-focusBorder);outline-offset:1px}.viewer-toolbar-actions{display:flex;align-items:center;gap:4px;overflow-x:auto;min-width:0;flex:1}.launch-controls button[hidden]{display:none!important}.viewer-toolbar-options{display:inline-flex;gap:4px;flex-shrink:0;flex-wrap:wrap;max-width:100%}.viewer-toolbar-dialog{position:fixed;z-index:10000;box-sizing:border-box;width:min(560px,90vw);max-height:80vh;overflow:auto;background:var(--vscode-editor-background);color:var(--vscode-foreground);border:1px solid var(--vscode-focusBorder);padding:18px}.viewer-toolbar-dialog::backdrop{background:#0008}.viewer-toolbar-dialog h2{margin:0 0 10px}.viewer-toolbar-dialog>button{display:block;margin:6px 0}.viewer-toolbar-row{display:flex;gap:12px;align-items:center;padding:5px}.viewer-toolbar-row label{display:flex;align-items:center;gap:8px}.viewer-toolbar-row input{width:auto!important;min-height:initial}.viewer-toolbar-dialog-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}';}
module.exports = {ACTIONS,normalize,configure,read,handle,controlsHtml,clientScript,style};
