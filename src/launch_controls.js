'use strict';


const COMMANDS = Object.freeze({
  game: 'ikemen.launchGame',
  versus: 'ikemen.launchMirrorCurrent',
  training: 'ikemen.launchTrainingCurrent'
});

// These workspaces contain authorable ZSS/CNS/CMD code or expression fields.
// Asset viewers and descriptive/project screens intentionally do not expose map
// insertion merely because they share this toolbar.
const MAP_AUTHORING_SURFACES = new Set([
  'helper', 'hitdef', 'move_constants', 'spatial_composer'
]);

function launchControlsHtml(surface = 'shared') {
  const modeStyle=require('./mode_visibility').html()+require('./destination_style').styleHtml();
  const playerNavigation='<span class="player-navigation" role="group" aria-label="Player navigation">'+[['ikemen.selectDef.openWorkspace','Characters & Stages'],['ikemen.storyDialogue.openPlayer','Stories'],['ikemen.launchGame','Play'],['ikemen.openHome','Home'],['ikemen.changeMode','Change mode…']].map(([command,label])=>'<button data-player-command="'+command+'">'+label+'</button>').join('')+'</span>';

  return modeStyle+playerNavigation+'<span data-viewer-archive hidden></span><style>[data-viewer-archive]:not([hidden]){display:block;max-width:100%;overflow-wrap:anywhere;color:var(--vscode-descriptionForeground);font-size:12px;padding:3px 0}'+require('./viewer_toolbar').style()+'.launch-controls{display:inline-flex;align-items:center;gap:4px;flex-wrap:nowrap;max-width:100%;min-width:0;flex-shrink:1}.launch-controls button{flex-shrink:0}.launch-controls button{white-space:nowrap}.launch-controls small{font-size:.72em;opacity:.72;margin-left:3px}:where(button,select,input,textarea,summary,[tabindex]):focus-visible{outline:2px solid var(--vscode-focusBorder,#4daafc)!important;outline-offset:2px}:where(button,select,input,textarea){min-height:26px}:where(button,select,input,textarea):disabled{cursor:not-allowed;opacity:.58}@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.001ms!important;animation-iteration-count:1!important;scroll-behavior:auto!important;transition-duration:.001ms!important}}@media(forced-colors:active){:where(button,select,input,textarea,summary,[tabindex]):focus-visible{outline:2px solid Highlight!important}.active,.selected{outline:1px solid Highlight}}@media(max-width:900px){.launch-controls small{display:none}}</style>'
    + '<span class="launch-controls" role="group" aria-label="Related work and IKEMEN launch shortcuts">'
    + '<span class="viewer-toolbar-actions"><button data-ikemen-history="back" disabled title="Return to the previous source or viewer">Back</button><button data-ikemen-history="forward" disabled title="Return to the next source or viewer">Forward</button><button data-ikemen-back-source disabled title="Open this viewer from a code reference to enable Back to Source">Back to Source</button>'
    + '<button data-ikemen-used-by'+(['air','sff','snd'].includes(surface)?'':' disabled')+' title="Find source references to the selected animation, sprite, or sound">Used By…</button>'
    + '<button class="ikemen-related-work" data-ikemen-related title="Open source files and visual workspaces connected to this screen">Related Work…</button>'
    + ['air','sff','snd','source'].map(target => '<button data-ikemen-destination="'+({air:'air',sff:'sff',snd:'snd',source:'code'}[target])+'" data-ikemen-viewer="'+target+'" title="Open connected '+target.toUpperCase()+' '+(target === 'source' ? 'text editor' : 'viewer')+'">'+({air:'Animations',sff:'Sprites',snd:'Sounds',source:'Code'}[target])+'</button>').join('')
    + '<button data-ikemen-destination="code" data-ikemen-viewer="pinned" title="Keep constants, common code, and functions beside this viewer">Pinned Sources…</button>'
    + (MAP_AUTHORING_SURFACES.has(surface) ? '<button data-ikemen-destination="maps" data-ikemen-maps data-ikemen-map-surface="'+surface+'" title="Browse project maps, inspect contracts and uses, or insert into the focused supported code field">Maps…</button>' : '')
    + '<button data-ikemen-viewer="compare"'+(['air','sff','snd'].includes(surface)?'':' disabled')+' title="Pin an animation, sprite preview, or saved sound as reference, then compare another selection">Compare…</button>'
    + '<button data-ikemen-save="backup" title="Copy this saved file to a backup location you choose">Make Backup…</button><button data-ikemen-save="autosave" aria-pressed="false" title="Toggle sprite-axis and Workflow autosave. Text editor autosave is separate in VS Code Settings. Explicit Save and Apply still save">Asset Auto Save: Off</button>'
    + '<button data-ikemen-launch="game" title="Launch IKEMEN · Ctrl+Alt+F5">Game <small>Ctrl+Alt+F5</small></button>'
    + '<button data-ikemen-launch="versus" title="Launch infinite-time, infinite-round mirror VS · Ctrl+Alt+F6">Infinite VS <small>Ctrl+Alt+F6</small></button>'
    + '<button data-ikemen-launch="training" title="Launch the current character training mirror · Ctrl+Alt+F7">Training <small>Ctrl+Alt+F7</small></button>'
    + '</span>' + require('./viewer_toolbar').controlsHtml(surface) + '</span>';
}

function launchControlsClientScript() {
  const player=require('./interface_mode').current()==='player';
  const destinationScript="const ikemenDestinationForCommand=value=>{value=String(value||'');if(/^air\\./.test(value))return'air';if(/^sff\\./.test(value))return'sff';if(/^snd\\./.test(value))return'snd';if(/palette|palfx/i.test(value))return'palette';if(/maps/i.test(value))return'maps';if(/stage/i.test(value))return'stage';if(/screenpack|\\.ui\\./i.test(value))return'screenpack';if(/moveLab|moveConstants|hitDef|helperLab|explodComposer|throwCreator|positionCamera/i.test(value))return'move_lab';if(/codeStructure|Controllers|commandMovelist|cnsConverter/i.test(value))return'code';if(/help|experience/i.test(value))return'help';return''};const ikemenApplyDestinations=root=>{const buttons=[];if(root.matches?.('[data-command]'))buttons.push(root);for(const button of root.querySelectorAll?.('[data-command]')||[])buttons.push(button);for(const button of buttons){const destination=ikemenDestinationForCommand(button.dataset.command);if(destination)button.dataset.ikemenDestination=destination}};ikemenApplyDestinations(document);if(typeof MutationObserver!=='undefined')new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes||[])if(node.nodeType===1)ikemenApplyDestinations(node)}).observe(document.body,{childList:true,subtree:true});";
  const playerScript=destinationScript+"for(const button of document.querySelectorAll('[data-player-command]'))button.onclick=()=>vscode.postMessage({type:'playerNavigate',command:button.dataset.playerCommand});"+(player?"const playerTab=document.querySelector('[data-view=player]');if(playerTab)playerTab.click();const rosterTab=document.querySelector('[data-tab=roster]');if(rosterTab)rosterTab.click();":"");
  return  "addEventListener('message',event=>{if(event.data.type==='viewerArchiveContext')for(const label of document.querySelectorAll('[data-viewer-archive]')){label.textContent=event.data.label;label.title=event.data.detail;label.hidden=!event.data.label;}});addEventListener('message',event=>{const m=event.data;if(m.type!=='viewerHistoryRestore')return;let ok=true;try{if(m.reference){ok=globalThis.ikemenCanRestoreNavigation?.(m.reference)===true;if(ok&&globalThis.ikemenRestoreNavigation)globalThis.ikemenRestoreNavigation(m.reference);else if(ok)window.dispatchEvent(new MessageEvent('message',{data:m.kind==='air'?{type:'selectAction',action:m.reference.group,frameIndex:m.reference.frameIndex}:{type:'navigateReference',reference:m.reference}}));}}catch(error){ok=false;}vscode.postMessage({type:'viewerHistoryRestored',requestId:m.requestId,ok});});const navigationSelection=()=>globalThis.ikemenNavigationSelection?.();"+playerScript+"for(const button of document.querySelectorAll('[data-ikemen-save]'))button.onclick=()=>vscode.postMessage({type:button.dataset.ikemenSave==='backup'?'ikemenMakeBackup':'ikemenToggleAutoSave'});addEventListener('message',event=>{if(event.data.type==='ikemenSavePolicy')for(const button of document.querySelectorAll('[data-ikemen-save=autosave]')){button.textContent='Asset Auto Save: '+(event.data.enabled?'On':'Off');button.setAttribute('aria-pressed',String(event.data.enabled));button.title='Sprite-axis and Workflow autosave. Text editor autosave: '+(event.data.textAutoSave||'off')+' (change separately in VS Code Settings).';button.setAttribute('aria-label',button.textContent+'. '+button.title);}});for(const button of document.querySelectorAll('[data-ikemen-used-by]'))button.onclick=()=>vscode.postMessage({type:'viewerUsedBy',navigationSelection:navigationSelection()});for(const button of document.querySelectorAll('[data-ikemen-history]'))button.onclick=()=>vscode.postMessage({type:'viewerHistory',direction:button.dataset.ikemenHistory,navigationSelection:navigationSelection()});addEventListener('message',event=>{if(event.data.type==='viewerHistoryState')for(const button of document.querySelectorAll('[data-ikemen-history]'))button.disabled=event.data.busy||!event.data[button.dataset.ikemenHistory]});for(const button of document.querySelectorAll('[data-ikemen-back-source]'))button.onclick=()=>vscode.postMessage({type:'viewerBackToSource',navigationSelection:navigationSelection()});addEventListener('message',event=>{if(event.data.type==='viewerSourceAvailable')for(const button of document.querySelectorAll('[data-ikemen-back-source]')){button.disabled=!event.data.available;button.title=event.data.available?'Return to '+event.data.label:'Open this viewer from a code reference to enable Back to Source';button.setAttribute('aria-label',button.title)}});for(const button of document.querySelectorAll('[data-ikemen-viewer]'))button.onclick=()=>vscode.postMessage({type:'ikemenViewer',target:button.dataset.ikemenViewer,navigationSelection:navigationSelection(),comparisonPreview:button.dataset.ikemenViewer==='compare'?globalThis.ikemenComparisonCapture?.():undefined});for(const button of document.querySelectorAll('[data-ikemen-launch]'))button.onclick=()=>vscode.postMessage({type:'ikemenLaunch',mode:button.dataset.ikemenLaunch});for(const button of document.querySelectorAll('[data-ikemen-related]'))button.onclick=()=>vscode.postMessage({type:'ikemenRelatedWork'});for(const button of document.querySelectorAll('button')){if(!button.hasAttribute('type'))button.type='button';if(!button.hasAttribute('aria-label')){const label=button.getAttribute('title')||button.textContent.trim();if(label)button.setAttribute('aria-label',label)}}for(const field of document.querySelectorAll('input,select,textarea')){if(field.hasAttribute('aria-label')||field.hasAttribute('aria-labelledby')||field.closest('label'))continue;const label=field.getAttribute('title')||field.getAttribute('placeholder')||String(field.id||field.name||'field').replace(/[-_]/g,' ');field.setAttribute('aria-label',label)}for(const canvas of document.querySelectorAll('canvas')){if(!canvas.hasAttribute('role'))canvas.setAttribute('role','img');if(!canvas.hasAttribute('aria-label'))canvas.setAttribute('aria-label',canvas.getAttribute('title')||'Visual preview canvas')}for(const image of document.querySelectorAll('img:not([alt])'))image.alt='';" + require('./viewer_toolbar').clientScript() + require('./viewer_layout').clientScript() + require('./webview_accessibility').clientScript() + require('./viewer_close').clientScript() + require('./mode_visibility').clientScript();
}

async function handleLaunchMessage(message, seed, kind = '', panel) {
  if(await require('./mode_visibility').handle(message,panel))return true;
  if(message?.type==='ikemenCloseState'||message?.type==='ikemenPresetState')return true;
  if(message?.type==='viewerToolbarReady')require('./viewer_sessions').register(panel,seed,message.surface);
  if(message?.type==='playerNavigate'){if(['ikemen.selectDef.openWorkspace','ikemen.storyDialogue.openPlayer','ikemen.launchGame','ikemen.openHome','ikemen.changeMode'].includes(message.command))await require('vscode').commands.executeCommand(message.command);return true;}

  if(await require('./asset_workspace').handle(message,panel))return true;
  if(message?.type==='ikemenMaps'){
    const maps=require('./map_registry_ui');
    if(message.target)await maps.pickInsert(require('vscode'),undefined,{seed:seed?require('vscode').Uri.file(seed):undefined,panel,target:message.target});
    else if(panel)await maps.openBrowser(require('vscode'),undefined,seed?require('vscode').Uri.file(seed):undefined,null);
    else await require('vscode').commands.executeCommand('ikemen.maps.openBrowser',seed?require('vscode').Uri.file(seed):undefined);
    return true;
  }
  if(message?.type==='ikemenMapInsertResult'){if(!message.ok)await require('vscode').window.showWarningMessage(message.reason||'The visual map insertion was rejected safely.');return true;}
  if(await require('./save_controls').handle(message,seed,panel))return true;
  if(await require('./viewer_layout').handle(message,panel))return true;
  const navigation=require('./viewer_navigation');
  if(message?.type==='viewerHistoryRestored'){navigation.acknowledgeRestore(panel,message);return true;}
  const point=()=>navigation.currentPoint(seed,kind,message,panel);
  if(message?.type==='ikemenViewer'&&message.target==='compare'){await require('./viewer_comparison').openComparison(seed,kind,message.navigationSelection,{preview:message.comparisonPreview,requirePreview:kind==='sff'});return true;}
  if(message?.type==='viewerSelectionChanged'){require('./viewer_sources').followSelection(point());return true;}
  if(message?.type==='ikemenViewer'&&message.target==='pinned'){await require('./viewer_sources').openSources(seed,point());return true;}
  if(message?.type==='viewerUsedBy'){await require('./viewer_used_by').openUsedBy(seed,kind,message.navigationSelection,point());return true;}
  if(message?.type==='viewerHistory'){await navigation.travelHistory(message.direction==='back'?-1:message.direction==='forward'?1:0,point());return true;}
  if (message?.type === 'viewerToolbarReady') require('./viewer_navigation').registerSourcePanel(panel, seed);
  if (message?.type === 'viewerBackToSource') { await require('./viewer_navigation').backToSource(seed,point()); return true; }
  if (await require('./viewer_toolbar').handle(message, panel)) return true;
  if (message?.type === 'ikemenViewer' && ['air','sff','snd','source'].includes(message.target)) { await require('./viewer_navigation').openConnected(seed, message.target,undefined,undefined,point()); return true; }
  if (message?.type === 'ikemenRelatedWork') { await require('./related_work').openRelatedWork(seed ? require('vscode').Uri.file(seed) : undefined, kind); return true; }
  if (!message || message.type !== 'ikemenLaunch') return false;
  const vscode = require('vscode');
  const command = COMMANDS[String(message.mode || '')];
  if (command) await vscode.commands.executeCommand(command);
  return true;
}

module.exports = { launchControlsHtml, launchControlsClientScript, handleLaunchMessage };
