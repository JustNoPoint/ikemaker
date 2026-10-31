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
const MAP_PANEL_SURFACES = Object.freeze({ ikemenHelperLab: 'helper', ikemenHitDefEditor: 'hitdef', ikemenMoveConstants: 'move_constants', ikemenSpatialComposer: 'spatial_composer' });

function launchControlsHtml(surface = 'shared', options = {}) {
  const destinationStyle=require('./destination_style'),entityHeader=require('./entity_header'),modeStyle=require('./mode_visibility').html()+destinationStyle.styleHtml(destinationStyle.configuredMode());
  return modeStyle+'<span data-viewer-archive hidden></span><style>[data-viewer-archive]:not([hidden]){display:block;max-width:100%;overflow-wrap:anywhere;color:var(--vscode-descriptionForeground);font-size:12px;padding:3px 0}'+require('./viewer_toolbar').style()+'.launch-controls{display:flex;flex:1 1 100%;align-items:stretch;flex-direction:column;gap:3px;max-width:100%;min-width:0}.launch-controls button{flex-shrink:0;white-space:nowrap}:where(button,select,input,textarea,summary,[tabindex]):focus-visible{outline:2px solid var(--vscode-focusBorder,#4daafc)!important;outline-offset:2px}:where(button,select,input,textarea){min-height:26px}:where(button,select,input,textarea):disabled{cursor:not-allowed;opacity:.58}@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.001ms!important;animation-iteration-count:1!important;scroll-behavior:auto!important;transition-duration:.001ms!important}}@media(forced-colors:active){:where(button,select,input,textarea,summary,[tabindex]):focus-visible{outline:2px solid Highlight!important}.active,.selected{outline:1px solid Highlight}}</style>'
    + '<span class="launch-controls" role="group" aria-label="Related work and IKEMEN launch shortcuts"><style>'+entityHeader.style()+'</style>'+entityHeader.html()
    + require('./viewer_toolbar').controlsHtml(surface, options) + '</span>';
}

function launchControlsClientScript() {
  const entityHeaderScript=require('./entity_header').clientScript({vscodeVariable:'vscode'});
  const player=require('./interface_mode').current()==='player';
  const destinationScript="const ikemenDestinationForCommand=value=>{value=String(value||'');if(/^air\\./.test(value))return'air';if(/^sff\\./.test(value))return'sff';if(/^snd\\./.test(value))return'snd';if(/palette|palfx/i.test(value))return'palette';if(/maps/i.test(value))return'maps';if(/stage/i.test(value))return'stage';if(/screenpack|\\.ui\\./i.test(value))return'screenpack';if(/moveLab|moveConstants|hitDef|helperLab|explodComposer|throwCreator|positionCamera/i.test(value))return'move_lab';if(/codeStructure|Controllers|commandMovelist|cnsConverter/i.test(value))return'code';if(/help|experience/i.test(value))return'help';return''};const ikemenActionDestinations={openSource:'code',moveLab:'move_lab',hitdef:'move_lab',position:'move_lab',explods:'move_lab',controllers:'code',dependencies:'code',openMoveLab:'move_lab',throw:'move_lab'};const ikemenIdDestinations={openSource:'code',openDef:'code',source:'code',selectCode:'code',selectCode2:'code',airTextEdit:'code',openManifest:'code',openRawMakerText:'code',throwCreator:'move_lab',openExplodComposer:'move_lab',openPositionCamera:'move_lab',openGuide:'help',luaDocs:'help',dialogueDocs:'help'};const ikemenApplyDestinations=root=>{const buttons=[];if(root.matches?.('button'))buttons.push(root);for(const button of root.querySelectorAll?.('button')||[])buttons.push(button);for(const button of buttons){const data=button.dataset||{},destination=data.ikemenDestination||ikemenDestinationForCommand(data.command)||ikemenActionDestinations[data.action]||ikemenIdDestinations[button.id];if(destination){if(button.dataset)button.dataset.ikemenDestination=destination;else button.setAttribute?.('data-ikemen-destination',destination)}}};ikemenApplyDestinations(document);if(typeof MutationObserver!=='undefined')new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes||[])if(node.nodeType===1)ikemenApplyDestinations(node)}).observe(document.body,{childList:true,subtree:true});";
  const playerScript=destinationScript+"for(const button of document.querySelectorAll('[data-player-command]'))button.onclick=()=>vscode.postMessage({type:'playerNavigate',command:button.dataset.playerCommand});"+(player?"const playerTab=document.querySelector('[data-view=player]');if(playerTab)playerTab.click();const rosterTab=document.querySelector('[data-tab=roster]');if(rosterTab)rosterTab.click();":"");
  return  entityHeaderScript+"addEventListener('message',event=>{if(event.data.type==='viewerArchiveContext')for(const label of document.querySelectorAll('[data-viewer-archive]')){label.textContent=event.data.label;label.title=event.data.detail;label.hidden=!event.data.label;}});addEventListener('message',event=>{const m=event.data;if(m.type!=='viewerHistoryRestore')return;let ok=true;try{if(m.reference){ok=globalThis.ikemenCanRestoreNavigation?.(m.reference)===true;if(ok&&globalThis.ikemenRestoreNavigation)globalThis.ikemenRestoreNavigation(m.reference);else if(ok)window.dispatchEvent(new MessageEvent('message',{data:m.kind==='air'?{type:'selectAction',action:m.reference.group,frameIndex:m.reference.frameIndex}:{type:'navigateReference',reference:m.reference}}));}}catch(error){ok=false;}vscode.postMessage({type:'viewerHistoryRestored',requestId:m.requestId,ok});});const navigationSelection=()=>globalThis.ikemenNavigationSelection?.();"+playerScript+"for(const button of document.querySelectorAll('[data-ikemen-save]'))button.onclick=()=>vscode.postMessage({type:button.dataset.ikemenSave==='backup'?'ikemenMakeBackup':'ikemenToggleAutoSave'});for(const button of document.querySelectorAll('[data-ikemen-used-by]'))button.onclick=()=>vscode.postMessage({type:'viewerUsedBy',navigationSelection:navigationSelection()});for(const button of document.querySelectorAll('[data-ikemen-history]'))button.onclick=()=>vscode.postMessage({type:'viewerHistory',direction:button.dataset.ikemenHistory,navigationSelection:navigationSelection()});addEventListener('message',event=>{if(event.data.type==='viewerHistoryState')for(const button of document.querySelectorAll('[data-ikemen-history]'))button.disabled=event.data.busy||!event.data[button.dataset.ikemenHistory]});for(const button of document.querySelectorAll('[data-ikemen-viewer]'))button.onclick=()=>vscode.postMessage({type:'ikemenViewer',target:button.dataset.ikemenViewer,navigationSelection:navigationSelection(),comparisonPreview:button.dataset.ikemenViewer==='compare'?globalThis.ikemenComparisonCapture?.():undefined});for(const button of document.querySelectorAll('button')){if(!button.hasAttribute('type'))button.type='button';if(!button.hasAttribute('aria-label')){const label=button.getAttribute('title')||button.textContent.trim();if(label)button.setAttribute('aria-label',label)}}for(const field of document.querySelectorAll('input,select,textarea')){if(field.hasAttribute('aria-label')||field.hasAttribute('aria-labelledby')||field.closest('label'))continue;const label=field.getAttribute('title')||field.getAttribute('placeholder')||String(field.id||field.name||'field').replace(/[-_]/g,' ');field.setAttribute('aria-label',label)}for(const canvas of document.querySelectorAll('canvas')){if(!canvas.hasAttribute('role'))canvas.setAttribute('role','img');if(!canvas.hasAttribute('aria-label'))canvas.setAttribute('aria-label',canvas.getAttribute('title')||'Visual preview canvas')}for(const image of document.querySelectorAll('img:not([alt])'))image.alt='';" + require('./universal_toolbar_webview').universalToolbarClientScript({vscodeVariable:'vscode'}) + require('./viewer_toolbar').clientScript() + require('./viewer_layout').clientScript() + require('./webview_accessibility').clientScript() + require('./viewer_close').clientScript() + require('./mode_visibility').clientScript();
}

async function handleLaunchMessage(message, seed, kind = '', panel) {
  const insertionAuthority = require('./map_registry_insertion_authority');
  if (panel && insertionAuthority.handleBridgeMessage(panel, message)) return true;
  if (message?.type === require('./universal_toolbar_webview').MESSAGE_TYPE) {
    const plain=message&&(Object.getPrototypeOf(message)===Object.prototype||Object.getPrototypeOf(message)===null),keys=plain?Object.keys(message).sort():[];
    const slot=String(message?.slotId||''),known=require('./viewer_toolbar_contract').SLOTS.some(item=>item.id===slot);
    if(plain&&keys.length===3&&keys[0]==='configure'&&keys[1]==='slotId'&&keys[2]==='type'&&message.configure===true&&slot==='updates'){await require('vscode').commands.executeCommand('ikemen.updates.configureFrequency');return true;}
    if(plain&&keys.length===3&&keys[0]==='setup'&&keys[1]==='slotId'&&keys[2]==='type'&&message.setup===true&&['versus','training'].includes(slot)){await require('vscode').commands.executeCommand('ikemen.quickLaunch.openSetup',slot==='training'?'training':'versus');return true;}
    if(plain&&keys.length===3&&keys[0]==='disposition'&&keys[1]==='slotId'&&keys[2]==='type'&&known){
      const placement=require('./toolbar_open_disposition');
      if(!placement.valid(message.disposition))return true;
      if(placement.closes(message.disposition)){await placement.apply(require('vscode'),message.disposition);return true;}
      if(slot==='text-source'){
        await require('./viewer_navigation').openConnected(seed,'source',undefined,undefined,require('./viewer_navigation').currentPoint(seed,kind,{},panel),undefined,{disposition:message.disposition});
        return true;
      }
      await handleLaunchMessage({type:message.type,slotId:message.slotId},seed,kind,panel);
      await placement.apply(require('vscode'),message.disposition);
      return true;
    }
    if(!plain||keys.length!==2||keys[0]!=='slotId'||keys[1]!=='type'||!known)return true;
    const browserRoute=require('./viewer_browser_route').forSurface(kind,seed),vscode=require('vscode'),command={
      recovery:'ikemen.mutations.openHistory',run:'ikemen.launchGame',versus:'ikemen.launchMirrorCurrent',training:'ikemen.launchTrainingCurrent',restart:'ikemen.restartRunning',
      project:'ikemen.projectManager.open',stage:'ikemen.stage.openWorkspace',commands:'ikemen.commandMovelist.openEditor',states:'zss.openControllers',palettes:'ikemen.palette.openWorkspace',
      'viewer-browser':browserRoute.command,'actions-search':'ikemen.textActions.open','suite-switch':'ikemen.switchToIkeMiner',help:'ikemen.help.open',settings:'ikemen.openExtensionSettings'
      ,updates:'ikemen.updates.checkAll'
    }[slot];
    if(slot==='close'){if(panel&&await require('./viewer_close').prepare([panel],vscode))panel.dispose();return true;}
    if(slot==='backup'){await require('./save_controls').handle({type:'ikemenMakeBackup'},seed,panel);return true;}
    if(slot==='auto-save'){await require('./save_controls').handle({type:'ikemenToggleAutoSave'},seed,panel);return true;}
    if(slot==='save'){await panel?.webview?.postMessage({type:'ikemenFileSave'});return true;}
    if(slot==='save-as'){await panel?.webview?.postMessage({type:'ikemenFileSaveAs'});return true;}
    if(slot==='text-source'){await require('./viewer_navigation').openConnected(seed,'source',undefined,undefined,require('./viewer_navigation').currentPoint(seed,kind,{},panel));return true;}
    if(['sprites','animations','sounds'].includes(slot)){await require('./viewer_navigation').openConnected(seed,{sprites:'sff',animations:'air',sounds:'snd'}[slot],undefined,undefined,require('./viewer_navigation').currentPoint(seed,kind,{},panel));return true;}
    if(slot==='new'||slot==='open'){
      const route={sff:{new:'sff.createNew',open:'sff.openViewer'},air:{new:'air.createNew',open:'air.openAnimationPreview'},snd:{open:'snd.openViewer'},palette:{new:'ikemen.palette.createScratch',open:'ikemen.palette.openWorkspace'}}[kind]?.[slot];
      if(route)await vscode.commands.executeCommand(route);return true;
    }
    if(slot==='viewer-browser'&&!browserRoute.command){await vscode.window.showInformationMessage(browserRoute.reason);return true;}
    if(command){if(slot==='updates')await vscode.commands.executeCommand(command);else await vscode.commands.executeCommand(command,slot==='viewer-browser'&&!browserRoute.seed?undefined:seed?vscode.Uri.file(seed):undefined);}
    return true;
  }
  if(await require('./mode_visibility').handle(message,panel))return true;
  if(message?.type==='ikemenCloseState'||message?.type==='ikemenPresetState')return true;
  if(message?.type==='viewerToolbarReady')require('./viewer_sessions').register(panel,seed,message.surface);
  if(message?.type==='playerNavigate'){if(['ikemen.selectDef.openWorkspace','ikemen.storyDialogue.openPlayer','ikemen.launchGame','ikemen.openHome','ikemen.changeMode'].includes(message.command))await require('vscode').commands.executeCommand(message.command);return true;}

  if(await require('./asset_workspace').handle(message,panel))return true;
  if(message?.type==='ikemenMaps'){
    const maps=require('./map_registry_ui');
    const hostSurface = MAP_PANEL_SURFACES[panel?.viewType] || '';
    const exactTarget = MAP_AUTHORING_SURFACES.has(hostSurface) && insertionAuthority.exact(message, ['type','target']) && insertionAuthority.validVisualCapture(message.target) && message.target.surface === hostSurface;
    if(!exactTarget||!panel)return true;
    const vscode=require('vscode'),seedUri=seed?vscode.Uri.file(seed):undefined,target=maps.captureVisualTarget(vscode,undefined,seedUri,panel,message.target);
    if(target)await maps.openBrowser(vscode,undefined,seedUri,target);
    return true;
  }
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
  const viewerToolbar = require('./viewer_toolbar');
  // Keep compatibility with lightweight/web hosts and older test adapters that
  // expose the original persistence handler but not dropdown command routing.
  if (viewerToolbar.handleCommand && await viewerToolbar.handleCommand(message, seed, panel)) return true;
  if (await viewerToolbar.handle(message, panel)) return true;
  if (message?.type === 'ikemenViewer' && ['air','sff','snd','source'].includes(message.target)) { await require('./viewer_navigation').openConnected(seed, message.target,undefined,undefined,point()); return true; }
  if (message?.type === 'ikemenRelatedWork') { await require('./related_work').openRelatedWork(seed ? require('vscode').Uri.file(seed) : undefined, kind); return true; }
  if (!message || message.type !== 'ikemenLaunch') return false;
  const vscode = require('vscode');
  const command = COMMANDS[String(message.mode || '')];
  if (command) await vscode.commands.executeCommand(command);
  return true;
}

module.exports = { launchControlsHtml, launchControlsClientScript, handleLaunchMessage, MAP_PANEL_SURFACES };
