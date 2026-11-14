'use strict';
let api;
function contextChanged(){if(api)void Promise.resolve(api.commands.executeCommand('setContext','ikemen.viewerShortcutAvailable',require('./viewer_group').trackedPanels().length>0)).catch(()=>{});}
function currentPanel(){const panels=require('./viewer_group').trackedPanels();return panels.find(panel=>panel.active)||panels[panels.length-1];}
async function invoke(action,services={}){
 const host=services.api||api||require('vscode'),panel=services.currentPanel?.()||currentPanel();
 if(!panel)return false;
 if(action==='focus'){
   const owner=require('./viewer_browser_shortcut').ownerOf(panel);
   if(owner){owner.reveal?.(owner.viewColumn,false);return true;}
   panel.reveal?.(panel.viewColumn,false);return panel.webview.postMessage({type:'ikemenNativeShortcut',action:'focus-viewer'});
 }
 panel.reveal?.(panel.viewColumn,false);
 
 return panel.webview.postMessage({type:'ikemenNativeShortcut',action});
}
function register(context,host=require('vscode')){api=host;context.subscriptions.push(host.commands.registerCommand('ikemen.viewer.keyboardShortcuts',()=>host.window.showQuickPick(require('./viewer_shortcuts').SHORTCUTS.map(row=>({label:row.keys,description:row.label,detail:row.scope})),{title:'IKEMaker Keyboard shortcuts',placeHolder:'Search shortcuts by action or viewer'})));for(const [id,action]of[['actionsSearch','actions-search'],['toggleBrowser','viewer-browser'],['focus','focus']])context.subscriptions.push(host.commands.registerCommand('ikemen.viewer.'+id,()=>invoke(action)));contextChanged();}
module.exports={register,invoke,contextChanged,currentPanel};
