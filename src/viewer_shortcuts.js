'use strict';

// Product shortcut descriptions are shared by Help, menus, and the native bridge.
const SHORTCUTS = Object.freeze([
  {surface:'all',keys:'Alt+ArrowLeft / Alt+ArrowRight / Delete',label:'Reorder / remove favorite action',scope:'Focused favorite action in the favorites bar'},
  {surface:'all',keys:'Arrow keys / Home / End',label:'Navigate menus, toolbar groups, tabs and lists',scope:'Focused navigation region'},
  {surface:'all',keys:'Enter / Space',label:'Activate focused action or select list item',scope:'Focused action or list item'},
  {surface:'all',keys:'Tab / Shift+Tab / Escape',label:'Move focus / close the current menu or dialog',scope:'Focused viewer controls'},
  {surface:'all',keys:'ContextMenu / Shift+F10',label:'Open available action options',scope:'Focused control with context options'},
  {surface:'hitdef',keys:'Ctrl+Enter / Meta+Enter',label:'Apply current HitDef draft',scope:'Changed, current, conflict-free HitDef draft'},
  {surface:'code',keys:'Ctrl+S / Meta+S',label:'Save current bound source',scope:'Focused document-backed source editor'},
  {surface:'code',keys:'Tab',label:'Insert tab character',scope:'Focused document-backed source editor'},
  {surface:'snd',keys:'Space / Shift+Arrow keys',label:'Mark sound / extend marked range',scope:'Focused browser sound card'},
  {surface:'sff',keys:'Arrow keys / Shift+Arrow keys / Home',label:'Move floating panel / move by 10 pixels / reset',scope:'Focused Move sprite or layer panel heading'},
  {surface:'all',keys:'Alt+A',label:'Action Search',scope:'IKEMaker viewer or connected native editor',command:'ikemen.viewer.actionsSearch'},
  {surface:'all',keys:'Alt+Shift+B',label:'Toggle Viewer Browser',scope:'IKEMaker viewer or connected native editor',command:'ikemen.viewer.toggleBrowser'},
  {surface:'all',keys:'Alt+Shift+V',label:'Focus Viewer',scope:'IKEMaker browser or connected native editor',command:'ikemen.viewer.focus'},
  {surface:'all',keys:'Ctrl+Alt+F5',label:'Launch game',scope:'When game launching is available'},
  {surface:'all',keys:'Ctrl+Alt+F6',label:'Launch mirror match',scope:'When game launching is available'},
  {surface:'all',keys:'Ctrl+Alt+F7',label:'Launch training',scope:'When game launching is available'},
  {surface:'all',keys:'Ctrl+Alt+PageUp',label:'Previous entity',scope:'When entity switching is ready'},
  {surface:'air',keys:'Escape',label:'Return to AIR Actions Browser',scope:'AIR-linked native source; keep source open'},
  {surface:'air',keys:'1 / 2',label:'Convert selected collision boxes',scope:'Focused AIR viewer'},
  {surface:'air',keys:'Ctrl+C / Ctrl+X / Ctrl+V',label:'Copy, cut, paste collision boxes',scope:'Focused AIR viewer'},
  {surface:'snd',keys:'Space / K',label:'Play or pause',scope:'Focused sound viewer outside form controls'},
  {surface:'snd',keys:'J / L',label:'Seek backward / forward',scope:'Focused sound viewer outside form controls'},
  {surface:'snd',keys:'A / B',label:'Set loop start / end',scope:'Focused sound viewer outside form controls'},
  {surface:'sff',keys:'Delete',label:'Request selected sprite deletion',scope:'Focused sprite viewer outside text fields; existing deletion review applies'},
  {surface:'sff',keys:'[ / ]',label:'Previous / next move target',scope:'Focused sprite viewer'},
  {surface:'sff',keys:'X',label:'Hold to drag a move target',scope:'Focused sprite viewer'},
  {surface:'sff',keys:'Space / Arrow keys',label:'Pan preview / nudge selected target axes',scope:'Sprite move mode outside form controls'},
  {surface:'stage',keys:'H / L',label:'Hide or show / lock or unlock selected backgrounds',scope:'Focused Stage viewer outside form controls'}
]);
function formatShortcut(value){return String(value||'').split('+').map(key=>({ctrl:'Ctrl',alt:'Alt',shift:'Shift',meta:'Meta',pageup:'PageUp',pagedown:'PageDown',left:'Left',right:'Right',escape:'Escape',space:'Space'}[key.toLowerCase()]||key.toUpperCase())).join('+');}
function forSurface(surface){return SHORTCUTS.filter(row=>row.surface==='all'||row.surface===surface);}
function helpHtml(){const esc=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));return '<section aria-label="Keyboard shortcuts"><h2>Keyboard shortcuts</h2><p>Viewer shortcuts return to the last live IKEMaker panel. Single-letter keys apply only inside their viewer. Alt+Left keeps VS Code editor history navigation.</p><dl>'+SHORTCUTS.map(row=>'<dt><kbd>'+esc(row.keys)+'</kbd> — '+esc(row.label)+'</dt><dd>'+esc(row.scope)+'</dd>').join('')+'</dl></section>';}
function nativeClientScript(bridge='vscode'){return `(function(){if(globalThis.ikemenNativeShortcutBound)return;globalThis.ikemenNativeShortcutBound=true;globalThis.addEventListener?.('message',event=>{const message=event.data;if(message?.type!=='ikemenNativeShortcut')return;if(message.action==='actions-search'){(document.querySelector('[data-toolbar-search]')||document.querySelector('[data-control-search-launch]'))?.click();return;}if(message.action==='focus-viewer'){const target=document.getElementById?.('returnOwner')||[...document.querySelectorAll('button')].find(button=>/^Focus (?:.* ?Viewer|Workshop)$/i.test((button.textContent||'').trim()));if(target&&!target.disabled)target.click();else ${bridge}.postMessage({type:'ikemenFocusViewer'});return;}if(message.action==='viewer-browser')${bridge}.postMessage({type:'ikemenBrowserShortcut'});});})();`;}
function ariaShortcut(value){return formatShortcut(value).replace(/\bCtrl\b/g,'Control');}
module.exports={ariaShortcut,nativeClientScript,SHORTCUTS,forSurface,formatShortcut,helpHtml};
