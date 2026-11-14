'use strict';
const MESSAGE_TYPE = 'ikemaker.viewer-browser-state';
function state(value = {}) {
  const open = value.open === true, visible = open && value.visible !== false, floating = open && value.floating === true;
  return Object.freeze({type:MESSAGE_TYPE,open,visible,floating,state:!open?'closed':!visible?'hidden':floating?'floating':'docked'});
}
function publish(panel, value) { return panel?.webview?.postMessage?.(state(value)); }
function style() { return '.ikemaker-universal-toolbar [data-universal-slot="viewer-browser"][data-browser-state]::after{position:absolute;right:0;bottom:0;min-width:9px;font:700 8px/9px var(--vscode-font-family);background:var(--vscode-editor-background);color:var(--vscode-foreground)}.ikemaker-universal-toolbar [data-universal-slot="viewer-browser"][data-browser-state="docked"]::after{content:"D"}.ikemaker-universal-toolbar [data-universal-slot="viewer-browser"][data-browser-state="floating"]::after{content:"F"}.ikemaker-universal-toolbar [data-universal-slot="viewer-browser"][data-browser-state="hidden"]::after{content:"H"}.ikemaker-universal-toolbar [data-universal-slot="viewer-browser"]{position:relative}.ikemaker-universal-toolbar [data-universal-slot="viewer-browser"][data-browser-state="docked"],.ikemaker-universal-toolbar [data-universal-slot="viewer-browser"][data-browser-state="floating"]{box-shadow:inset 0 -3px var(--vscode-focusBorder)}.ikemaker-universal-toolbar [data-universal-slot="viewer-browser"][data-browser-state="hidden"]{box-shadow:inset 0 -3px var(--vscode-descriptionForeground)}'; }
function clientScript() { return `(function(){const button=document.querySelector('[data-universal-slot="viewer-browser"]');if(!button?.dataset||typeof button.setAttribute!=='function')return;const labels={closed:'closed — open browser',hidden:'hidden — show browser',docked:'open in main window — close browser',floating:'open in floating window — close browser'};const update=state=>{if(!Object.hasOwn(labels,state))return;button.dataset.browserState=state;button.setAttribute('aria-pressed',state==='closed'?'false':'true');const label='Viewer Browser · '+labels[state]+' · Alt+Shift+B';button.title=label;button.setAttribute('aria-label',label);};update('closed');addEventListener('message',event=>{if(event.data?.type===${JSON.stringify(MESSAGE_TYPE)})update(event.data.state)});})();`; }
const owners=new Map(),browsers=new Map(),bindings=new WeakMap(),browserBindings=new WeakMap();
function identity(surface,file){return surface+'\0'+require('path').resolve(file).toLowerCase();}
function notify(key){const record=browsers.get(key);for(const panel of owners.get(key)||[])publish(panel,{open:Boolean(record&&!record.disposed&&!record.unavailable),visible:record?.panel?.visible,floating:record?.floating});}
function registerOwner(panel,surface,file){
 if(!['air','sff','snd','palette'].includes(surface)||!file||!panel||surface==='palette'&&!/[.]sff$/i.test(file))return;
 const key=identity(surface,file),old=bindings.get(panel);
 if(old?.key===key){notify(key);return;}
 if(old){owners.get(old.key)?.delete(panel);for(const subscription of old.subscriptions)subscription?.dispose?.();}
 if(!owners.has(key))owners.set(key,new Set());owners.get(key).add(panel);
 const subscriptions=[panel.onDidChangeViewState?.(()=>notify(key)),panel.webview?.onDidReceiveMessage?.(()=>notify(key)),panel.onDidDispose?.(()=>{owners.get(key)?.delete(panel);bindings.delete(panel);for(const subscription of subscriptions)subscription?.dispose?.();})];
 bindings.set(panel,{key,subscriptions});notify(key);
}
function registerBrowser(surface,record){
 if(!record?.panel||record.transferPinned)return;
 const file=record.filename||record.data?.airPath;if(!file)return;
 const key=identity(surface,file),old=browserBindings.get(record.panel);
 if(old?.key===key){notify(key);return;}
 if(old){if(browsers.get(old.key)===record)browsers.delete(old.key);notify(old.key);for(const subscription of old.subscriptions)subscription?.dispose?.();}
 browsers.set(key,record);
 const subscriptions=[record.panel.onDidChangeViewState?.(()=>notify(key)),record.panel.onDidDispose?.(()=>{if(browsers.get(key)===record)browsers.delete(key);notify(key);browserBindings.delete(record.panel);for(const subscription of subscriptions)subscription?.dispose?.();})];
 browserBindings.set(record.panel,{key,subscriptions});notify(key);
}
function refreshBrowser(surface,record){registerBrowser(surface,record);}
module.exports={MESSAGE_TYPE,state,publish,style,clientScript,registerOwner,registerBrowser,refreshBrowser};
