'use strict';

const {forSurface,forText}=require('./viewer_browser_route');
const BROWSERS=Object.freeze({air:'./air_docking_workspace',sff:'./sff_browser',snd:'./snd_browser',palette:'./palette_workshop_browser'});
const returnOwners=new WeakMap();

async function toggle({surface,seed,ownerPanel,route,api,lookup,prepare}={}){
  // A webview message is accepted only from its exact active owner. This also
  // keeps an unrelated editor, transfer endpoint, or restored stale pane inert.
  if(!ownerPanel?.active||ownerPanel.visible===false)return false;
  const selected=route||forSurface(surface,seed);
  if(!selected?.command)return false;
  const record=lookup?.(surface,seed)||null,panel=record?.panel;
  if(record?.transferPinned||record?.unavailable||record?.disposed)return false;
  if(panel){
    if(panel.visible===false){if(ownerPanel!==panel)returnOwners.set(panel,ownerPanel);panel.reveal?.(panel.viewColumn,false);return true;}
    if(!await prepare([panel],api))return false;
    if(!ownerPanel.active||record.panel!==panel)return false;
    panel.dispose?.();if(ownerPanel!==panel)ownerPanel.reveal?.(ownerPanel.viewColumn,false);else returnOwners.get(panel)?.reveal?.(returnOwners.get(panel).viewColumn,false);return true;
  }
  const uri=selected.seed&&seed?api.Uri.file(seed):undefined;
  const opened=await api.commands.executeCommand(selected.command,uri);
  const current=lookup?.(surface,seed)||null;
  const browserPanel=current&&!current.transferPinned&&!current.unavailable&&!current.disposed?current.panel:opened&&!opened.transferPinned&&!opened.unavailable&&!opened.disposed?(opened.panel||opened):null;
  if(browserPanel?.reveal&&browserPanel!==ownerPanel)returnOwners.set(browserPanel,ownerPanel);
  return true;
}

async function handleCompanion(message,surface,seed,panel,services={}){
  if(message?.type!=='ikemenBrowserShortcut'||Object.keys(message).length!==1)return false;
  const api=services.api||require('vscode'),snapshot=services.lookup?.(surface,seed)||require(BROWSERS[surface]).browserSnapshot(seed);
  if(snapshot?.panel!==panel||snapshot.transferPinned||snapshot.unavailable)return false;
  return toggle({surface,seed,ownerPanel:panel,route:forSurface(surface,seed),api,lookup:()=>snapshot,prepare:services.prepare||require('./viewer_close').prepare});
}

async function handle(message,seed,surface,ownerPanel,services={}){
  if(message?.type!=='ikemenBrowserShortcut'||Object.keys(message).length!==1)return false;
  const route=services.route||(surface==='text'?forText(services.classification):forSurface(surface,seed));
  const api=services.api||require('vscode'),lookup=services.lookup||((kind,filename)=>{if(kind==='text'&&services.classification?.kind==='air')return require(BROWSERS.air).browserSnapshot(filename);if(route.command==='ikemen.authoringBrowser.open')return require('./authoring_workspace').browserSnapshot();const moduleName=BROWSERS[kind];return moduleName?require(moduleName).browserSnapshot(filename):null;});
  return toggle({surface,seed,ownerPanel,route,api,lookup,prepare:services.prepare||require('./viewer_close').prepare});
}

module.exports={BROWSERS,toggle,handle,handleCompanion};
