'use strict';

// Visual workspaces share a user-movable editor group. The text companion can
// reserve its live header and native-source groups so visual panels never join
// either one. Live TabGroup identity wins; numeric columns are only a startup
// fallback while VS Code is still restoring its topology.
let column = 0;
let topologyProvider = null;
const tracked = new Set();
const reservations = new Map();
const relocating = new WeakSet();
const panelGroups = new WeakMap();

function valid(value) { return Number.isInteger(value) && value > 0; }
// TabInputWebview exposes VS Code's internal type, while WebviewPanel uses
// the extension's type. Normalize only the host-owned prefix before matching.
function panelViewType(value){return String(value||'').replace(/^mainThreadWebview-/,'');}
function configureViewerTopology(provider) { topologyProvider=typeof provider==='function'?provider:null; }
function topology(){try{return topologyProvider?.()||null;}catch(_){return null;}}
function reservationValues(){return [...reservations.values()].flatMap(values=>[...values]);}
function reservedGroups(){return new Set(reservationValues().filter(value=>value&&typeof value==='object'&&valid(value.viewColumn)));}
function numericReservations(){return new Set(reservationValues().filter(valid));}
function reservedColumns(){return new Set(reservationValues().map(value=>valid(value)?value:value?.viewColumn).filter(valid));}
function groupForPanel(panel){
  const state=topology(),groups=state?.all||[];
  if(panel?.active&&state?.active&&valid(state.active.viewColumn)){panelGroups.set(panel,state.active);return state.active;}
  const known=panelGroups.get(panel);if(known&&groups.includes(known)&&known.viewColumn===panel?.viewColumn)return known;
  const candidates=groups.filter(group=>group?.viewColumn===panel?.viewColumn);
  if(candidates.length===1){panelGroups.set(panel,candidates[0]);return candidates[0];}
  const byTitle=candidates.filter(group=>(group.tabs||[]).some(tab=>String(tab?.label||'')===String(panel?.title||'')));
  if(byTitle.length===1){panelGroups.set(panel,byTitle[0]);return byTitle[0];}
  return null;
}
function panelIsReserved(panel){
  const group=groupForPanel(panel);
  if(group)return reservedGroups().has(group)||numericReservations().has(group.viewColumn);
  return reservedColumns().has(panel?.viewColumn);
}
function fallbackIsReserved(value){
  if(!valid(value))return false;
  if(numericReservations().has(value))return true;
  const all=topology()?.all||[];if(!all.length)return reservedColumns().has(value);
  const groups=all.filter(group=>group?.viewColumn===value);
  return groups.length===1&&reservedGroups().has(groups[0]);
}
function latestAvailablePanel(avoidColumn=0){return [...tracked].reverse().find(panel=>valid(panel?.viewColumn)&&panel.viewColumn!==avoidColumn&&!panelIsReserved(panel));}
function preferredViewerColumn(fallback, avoidColumn = 0) {
  const remembered=[...tracked].reverse().find(panel=>panel?.viewColumn===column&&column!==avoidColumn&&!panelIsReserved(panel));if(remembered)return column;
  const available=latestAvailablePanel(avoidColumn);if(available){column=available.viewColumn;return column;}
  if(valid(column)&&column!==avoidColumn&&!fallbackIsReserved(column))return column;
  if(fallbackIsReserved(fallback))return -2;
  return fallback === -1 ? -2 : fallback;
}
function restoredAssetColumn(groups, avoidColumn = 0) {
  const types=new Set(['ikemenAirWorkspace','ikemenSffViewer','ikemenSndViewer','ikemen.sffWorkspace','ikemen.sndWorkspace']);
  const group=(groups||[]).find(group=>valid(group.viewColumn)&&group.viewColumn!==avoidColumn&&(group.tabs||[]).some(tab=>types.has(panelViewType(tab.input?.viewType))));
  return group?.viewColumn||0;
}
function trackViewerPanel(panel) {
  if (!panel || tracked.has(panel)) return panel;
  tracked.add(panel);
  require('./viewer_close').track(panel);
  if (typeof panel.onDidChangeViewState === 'function') panel.onDidChangeViewState((event) => {
    const active = event && event.webviewPanel;if(!active)return;
    const reserved=panelIsReserved(active);
    if(!reserved)relocating.delete(panel);
    if(active.active&&valid(active.viewColumn)&&!reserved){column=active.viewColumn;tracked.delete(panel);tracked.add(panel);}
  });
  if (typeof panel.onDidDispose === 'function') panel.onDidDispose(() => {
    relocating.delete(panel);panelGroups.delete(panel);tracked.delete(panel);
    if (![...tracked].some(item => item.viewColumn === column&&!panelIsReserved(item))) column = latestAvailablePanel()?.viewColumn || 0;
  });
  if(valid(panel.viewColumn)&&!panelIsReserved(panel)&&(panel.active||!valid(column)))column=panel.viewColumn;
  relocateReservedViewerPanels();
  return panel;
}
function relocateReservedViewerPanels() {
  const safe=latestAvailablePanel();let moved=0;
  for(const panel of tracked){
    if(!panel||!panelIsReserved(panel)||typeof panel.reveal!=='function'||relocating.has(panel))continue;
    relocating.add(panel);panel.reveal(safe?.viewColumn||-2,true);moved+=1;
  }
  if(moved)column=safe?.viewColumn||0;
  return moved;
}
function reserveViewerColumns(owner, values) {
  if(!owner)return 0;
  const next=new Set((values||[]).filter(value=>valid(value)||valid(value?.viewColumn)));
  if(next.size)reservations.set(owner,next);else reservations.delete(owner);
  return relocateReservedViewerPanels();
}
function releaseViewerColumns(owner) { reservations.delete(owner);if(fallbackIsReserved(column))column=latestAvailablePanel()?.viewColumn||0; }
// A serialized WebviewPanel can receive messages before its restoring surface
// has had a chance to call trackViewerPanel again.  The live panel and tab
// topology are still exact authority for that transition; requiring the
// process-local tracking set made the first Text Editor click after reload a
// guaranteed refusal for otherwise clean restored viewers.
function exactViewerGroup(origin){const state=topology();if(!origin||!state?.all?.length)return null;const group=groupForPanel(origin);return group&&state.all.includes(group)?group:null;}
function panelsInExactGroup(group){return group?[...tracked].filter(panel=>groupForPanel(panel)===group):[];}
function transitionPanels(origin,group){const panels=panelsInExactGroup(group);if(origin&&!panels.includes(origin))panels.unshift(origin);return panels;}
function sameMembers(left,right){return left.length===right.length&&left.every(panel=>right.includes(panel));}
function waitUntilUntracked(panels,timeout=1500){return new Promise(resolve=>{const deadline=Date.now()+timeout,check=()=>{if(panels.every(panel=>!tracked.has(panel)))return resolve(true);if(Date.now()>=deadline)return resolve(false);setTimeout(check,10);};check();});}
function waitUntilNativeTextOnly(group,admitted,timeout=1500){return new Promise(resolve=>{const deadline=Date.now()+timeout,check=()=>{const groups=topology()?.all||[],current=groups.includes(group)?group:null,ready=!current||(current.tabs||[]).every(tab=>{const filename=tabFilename(tab);return filename&&admitted.has(filename.toLowerCase());});if(ready)return resolve(true);if(Date.now()>=deadline)return resolve(false);setTimeout(check,10);};check();});}
function tabFilename(tab){const input=tab?.input;if(!input||input.viewType||input.modified||input.original||!input.uri?.fsPath)return'';return require('path').resolve(input.uri.fsPath);}
function exactCandidateTabs(group,candidates){
  const nonNative=(group?.tabs||[]).filter(tab=>!tabFilename(tab));if(nonNative.length!==candidates.length)return null;
  const matched=[],remaining=[...nonNative];
  for(const panel of candidates){const panelType=panelViewType(panel?.viewType),matches=remaining.filter(tab=>{const tabType=panelViewType(tab?.input?.viewType);return /^ikemen/i.test(tabType)&&((panelType&&tabType===panelType)||String(tab?.label||'')===String(panel?.title||''));});if(matches.length!==1)return null;const tab=matches[0];matched.push(tab);remaining.splice(remaining.indexOf(tab),1);}
  return remaining.length?null:matched;
}
function textTransitionEligible(group,originGroup,candidateTabs,admitted){
  return (group?.tabs||[]).every(tab=>{const filename=tabFilename(tab);if(filename)return admitted.has(filename.toLowerCase());return group===originGroup&&candidateTabs.includes(tab);});
}
// VS Code restores inactive serialized viewers lazily. Activate only known asset
// tabs so their normal serializer installs close/draft protection before inspection.
async function restoreSleepingAssets(origin,group,api){
  const assetTypes=new Set(['ikemenAirWorkspace','ikemenSffViewer','ikemenSndViewer']);
  if(!group||!api.commands?.executeCommand)return;
  const snapshot=[...(group.tabs||[])];
  try{
    for(const tab of snapshot){
      if(!assetTypes.has(panelViewType(tab.input?.viewType)))continue;
      const matches=()=>transitionPanels(origin,group).some(panel=>panelViewType(panel.viewType)===panelViewType(tab.input?.viewType)||panel.title===tab.label);
      if(matches())continue;
      if(exactViewerGroup(origin)!==group||!sameMembers(snapshot,group.tabs||[]))return;
      origin.reveal?.(group.viewColumn,false);
      await api.commands.executeCommand('workbench.action.openEditorAtIndex',group.tabs.indexOf(tab));
      const deadline=Date.now()+3000;
      while(!matches()&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20));
    }
  }finally{origin.reveal?.(group.viewColumn,false);}
}
async function closeViewerGroupForText(origin,api=require('vscode'),options={}){
  const group=exactViewerGroup(origin);
  await restoreSleepingAssets(origin,group,api);
  const candidates=transitionPanels(origin,group);
  if(!group||!candidates.length){void api.window.showInformationMessage('The originating visual workspace could not be matched to one exact editor group. It was kept as-is.');return{accepted:false,closed:false,settled:true};}
  const admitted=new Set((options.admittedFiles||[]).map(filename=>require('path').resolve(filename).toLowerCase()));
  // Existing native buffers are preserved by the text layout, not closed or saved.
  if(admitted.size)for(const tab of group.tabs||[]){const filename=tabFilename(tab);if(filename)admitted.add(filename.toLowerCase());}
  const candidateTabs=admitted.size?exactCandidateTabs(group,candidates):[];
  if(admitted.size&&(!candidateTabs||!textTransitionEligible(group,group,candidateTabs,admitted))){void api.window.showInformationMessage('Another editor or viewer shares this visual workspace but is not part of the connected text editor. It was left untouched; move or close that tab before returning to the Text Editor.');return{accepted:false,closed:false,settled:true};}
  if(!await require('./viewer_close').prepare(candidates,api))return{accepted:false,closed:false,settled:true};
  const currentGroup=exactViewerGroup(origin),current=currentGroup===group?transitionPanels(origin,group):[];
  const currentCandidateTabs=admitted.size?exactCandidateTabs(group,candidates):[];
  const tabSetChanged=admitted.size&&(!currentCandidateTabs||!sameMembers(candidateTabs,currentCandidateTabs)||!textTransitionEligible(group,group,candidateTabs,admitted));
  if(currentGroup!==group||!sameMembers(candidates,current)||tabSetChanged){void api.window.showInformationMessage('The visual workspace changed during its close check. Nothing was closed; open the text editor again from the current view.');return{accepted:false,closed:false,settled:true};}
  for(const panel of candidates)panel.dispose?.();
  const untracked=await waitUntilUntracked(candidates),settled=untracked&&(!admitted.size||await waitUntilNativeTextOnly(group,admitted));
  if(!settled)void api.window.showInformationMessage('The visual workspace accepted the close, but VS Code has not finished removing its tabs. The text layout was left unchanged.');
  return{accepted:true,closed:true,settled};
}
function revealInViewerGroup(panel, preserveFocus = false, fallback = 1) {
  if (!panel || typeof panel.reveal !== 'function') return;
  const target = valid(panel.viewColumn) && !panelIsReserved(panel) ? panel.viewColumn : preferredViewerColumn(fallback);
  panel.reveal(target, preserveFocus);
}
function resetViewerGroupForTests() { column = 0; tracked.clear(); reservations.clear(); topologyProvider=null; }

module.exports = { trackedPanels:()=>[...tracked], configureViewerTopology, preferredViewerColumn, trackViewerPanel, revealInViewerGroup, restoredAssetColumn, reserveViewerColumns, releaseViewerColumns, relocateReservedViewerPanels, closeViewerGroupForText, resetViewerGroupForTests };
