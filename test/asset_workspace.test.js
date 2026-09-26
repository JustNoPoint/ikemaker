'use strict';
const assert=require('assert');
const workspace=require('../src/asset_workspace');
let multiple=false;const notices=[];
workspace.configure({workspace:{getConfiguration:()=>({get:(name,fallback)=>name==='multipleAssetWorkspaces'?multiple:fallback})},window:{showInformationMessage:message=>notices.push(message)}});
function panel(column,clean=true){const disposals=[];return {viewColumn:column,clean,disposed:false,reveals:[],webview:{postMessage(message){if(message.type==='assetWorkspaceCapture')queueMicrotask(()=>workspace.handle({type:'assetWorkspaceCaptured',id:message.id,clean:this.owner.clean,state:{selected:42},reference:{group:2,number:3},fields:{search:'<sprite>'},scroll:[{id:'sprites',top:80,left:0}]},this.owner));return Promise.resolve(true);}},onDidDispose(fn){disposals.push(fn);},onDidChangeViewState(){},dispose(){this.disposed=true;for(const fn of disposals)fn();},reveal(column){this.reveals.push(column);}};}
function attach(file,p){p.webview.owner=p;return workspace.decorate(p,file,'sff','<body><details open>Help</details><script>const vscode=acquireVsCodeApi();</script>');}
(async()=>{
 const first=panel(2);assert(!attach('C:/one.sff',first).includes('details open'));await workspace.handle({type:'assetWorkspaceReady'},first);
 first.clean=false;assert.strictEqual(await workspace.beforeOpen('C:/two.snd'),false);assert(!first.disposed);assert.strictEqual(first.reveals.at(-1),2);
 first.clean=true;assert.strictEqual(await workspace.beforeOpen('C:/two.snd'),true);assert(!first.disposed,'Preflight must not close the original before the replacement loads');
 const second=panel(3);attach('C:/two.snd',second);await workspace.handle({type:'assetWorkspaceReady'},second);assert(first.disposed);assert.deepStrictEqual(second.reveals,[2],'Replacement stays in the same group');
 const restored=panel(2),html=attach('C:/one.sff',restored);assert(html.includes('ikemenResumeAsset'));assert(html.includes('selected'));assert(!html.includes('<sprite>'),'Embedded snapshots must escape HTML');
 await workspace.handle({type:'assetWorkspaceReady'},restored);assert(second.disposed);
 assert(!attach('C:/one.sff',restored).includes('ikemenResumeAsset'),'Refreshing a live viewer must not apply a stale snapshot twice');
 restored.clean=false;const rejected=panel(2);attach('C:/blocked.air',rejected);await workspace.handle({type:'assetWorkspaceReady'},rejected);assert(rejected.disposed);assert(!restored.disposed);
 const dirtyReplacement=panel(2,false);attach('C:/dirty-new.air',dirtyReplacement);await workspace.handle({type:'assetWorkspaceReady'},dirtyReplacement);assert(!dirtyReplacement.disposed&&!restored.disposed,'Dirty replacement and original must both survive a veto');dirtyReplacement.dispose();
 multiple=true;const extra=panel(4);attach('C:/extra.snd',extra);await workspace.handle({type:'assetWorkspaceReady'},extra);assert(!restored.disposed);assert.strictEqual(await workspace.beforeOpen('C:/anything.air'),true,'Flexible mode must leave unfinished editors alone');
 restored.clean=true;multiple=false;const final=panel(4);attach('C:/final.sff',final);await workspace.handle({type:'assetWorkspaceReady'},final);assert(restored.disposed&&extra.disposed);assert(!final.disposed);
 final.dispose();
 assert.doesNotThrow(()=>new Function(workspace.clientScript()));
 console.log('Simple asset workspace: dirty veto, load-before-close, same-group switch, state recovery, safe snapshots, rejected custom-editor opening and flexible mode passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
