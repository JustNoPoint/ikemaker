'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'character_workbenches.js'), 'utf8');
const closeStart = source.indexOf('async function closeAuthoringContext');
const closeEnd = source.indexOf('\nfunction registerCharacterWorkbenches', closeStart);
const close = source.slice(closeStart, closeEnd);
const chooseStart = source.indexOf('async function chooseCloseContext');
const choose = source.slice(chooseStart, closeStart);
assert(close.includes('beginContextClose(selected)'), 'character close must guard the context from automatic reopen');
assert(close.indexOf('panel.dispose()') > close.indexOf('vscode.window.tabGroups.close'), 'exact visual panels must survive native close cancellation');
assert(close.includes('for (let pass = 0; pass < 8; pass += 1)'), 'close must drain tabs recreated by delayed VS Code events');
assert(close.includes('onDidChangeTabs') && close.includes('onDidCloseTextDocument'), 'close must wait for real editor-topology events');
assert(close.includes('onDidChangeVisibleTextEditors'), 'close must wait for visible-editor topology to settle after tabs disappear');
assert(!close.includes('hiddenRemaining'), 'a loaded TextDocument without an editor must not block character close');
assert(close.includes('Still open:'), 'a genuine close blocker must name the remaining editor or workspace');
assert(close.includes('matchingCharacterPanels(selected)'), 'reserved character folders must reconcile exact tracked asset viewers');
assert(close.includes('while(Date.now()<deadline)'), 'character close must drain viewers that VS Code restores after the initial panel snapshot');
assert(close.includes('Date.now()-quietSince>=900'), 'close success requires a sustained owner-empty interval, not one empty event turn');
assert(source.includes('SESSION_GENERATIONS')&&source.includes('if(cancelled())return'), 'an in-flight character-session opener must be tombstoned before it can publish more viewers or a false opened toast');
assert(close.includes('refreshedProfile(savedProfile)'), 'closing a saved workbench must refresh current DEF dependencies before collecting shared asset viewers');
assert(choose.includes('refreshedCharacterContext(profile)'), 'toolbar/menu close must refresh saved character dependencies before selecting its context');
assert(!close.includes('emptyVisualGroups'), 'numeric columns must not be used as cross-window ownership');
assert(close.includes('finally { finishClose(); }'), 'the close guard must always be released');

const air = fs.readFileSync(path.join(__dirname, '..', 'src', 'air_viewer.js'), 'utf8');
assert(air.includes('options.automatic && isClosingFile(airPath)'), 'automatic AIR opening must honor the close guard');
assert(air.includes('if (isClosingFile(session.airPath)) return;'), 'AIR source synchronization must honor the close guard');
assert(air.includes('isClosingFile(airPath)||ownerDefs.some(isClosingOwner)'),'lazy AIR deserialization must abort while its file or exact character owner is closing');
const snd=fs.readFileSync(path.join(__dirname,'..','src','snd_viewer.js'),'utf8');
assert(snd.includes('isClosingFile(filename)||ownerDefs.some(isClosingOwner)'),'lazy SND deserialization must abort while its file or exact character owner is closing');
const sff=fs.readFileSync(path.join(__dirname,'..','src','sff_viewer.js'),'utf8');
assert(sff.includes('if(ownerDefs.some(isClosingOwner)){panel.dispose();return false;}'),'owner-tagged SFF deserialization must abort before registration while that character is closing');
const textHeader = fs.readFileSync(path.join(__dirname, '..', 'src', 'text_editor_toolbar.js'), 'utf8');
assert(textHeader.includes("layoutMode='explicitly-closed'"), 'disposing the text header is terminal until an explicit open or resume');
assert(!textHeader.includes('setTimeout(()=>repairProtectedHeader(),35)'), 'character close cannot race a delayed text-header recreation');
assert(textHeader.includes('connectedFiles.some(file=>contextRegistry.isClosingFile(file.filename))'), 'startup/header repair yields to the character close guard');
for (const [filename, marker] of [['character_dependency_workspace.js','characterContextDescriptor'],['character_health_workspace.js','healthCharacterContext'],['cns_converter_workspace.js','characterRoot=characterDef?path.dirname']]) {
  const registration=fs.readFileSync(path.join(__dirname,'..','src',filename),'utf8');
  assert(registration.includes(marker)&&registration.includes('ownerDef'),`${filename} must register URI-less character panels under the character-folder identity and exact owner DEF`);
}

console.log('Atomic character-close policy tests passed');

const vm = require('vm');
(async () => {
  const stale={name:'Ryu',folder:'c:/chars/ryu',defPath:'c:/chars/ryu/ryu.def',connectedFiles:['c:/chars/ryu/old.sff']};
  const fresh={...stale,connectedFiles:['c:/chars/template/shared.sff']};
  let refreshedChoices=0;
  const chooseSandbox={
    activeFile:()=> 'c:/chars/ryu/ryu.def', characterFolder:()=> 'c:/chars/ryu', load:()=>[stale], normalized:value=>String(value).toLowerCase(),
    refreshedProfile:profile=>{refreshedChoices++;assert.strictEqual(profile,stale);return fresh;},allFiles:profile=>[profile.defPath,...(profile.connectedFiles||[])],characterContext:profile=>({type:'character',key:profile.folder,label:profile.name,files:[profile.defPath,...profile.connectedFiles]}),
    refreshedCharacterContext:profile=>({type:'character',key:'c:/chars/ryu',label:'Ryu',files:profile.connectedFiles}),
    currentContext:()=>null,openContexts:()=>[],path:{basename:value=>value.split('/').pop(),dirname:value=>value.split('/').slice(0,-1).join('/')},vscode:{window:{showQuickPick:async choices=>choices[0]}}
  };
  vm.createContext(chooseSandbox);vm.runInContext(choose+';this.runChoose=chooseCloseContext',chooseSandbox);
  const toolbarContext=await chooseSandbox.runChoose({},'character');
  assert.equal(refreshedChoices,1,'no-item toolbar close refreshes the saved profile selected from the active character');
  assert(Array.from(toolbarContext.files).includes('c:/chars/template/shared.sff'),'the refreshed toolbar context owns an externally connected SFF panel');

  const ken={name:'Ken',folder:'c:/chars/ken',defPath:'c:/chars/ken/ken.def',connectedFiles:['c:/chars/template/shared.sff']};
  chooseSandbox.activeFile=()=> 'c:/chars/template/shared.sff';chooseSandbox.load=()=>[fresh,ken];chooseSandbox.refreshedProfile=profile=>profile;chooseSandbox.allFiles=profile=>[profile.defPath,...profile.connectedFiles];chooseSandbox.refreshedCharacterContext=profile=>chooseSandbox.characterContext(profile);chooseSandbox.currentContext=()=>({type:'character',ownerDef:fresh.defPath,root:fresh.folder,key:fresh.folder});
  const currentOwner=await chooseSandbox.runChoose({},'character');
  assert.equal(currentOwner.label,'Ryu','a shared template source closes the exact current character owner rather than inventing a Template character');
  chooseSandbox.currentContext=()=>null;chooseSandbox.vscode.window.showQuickPick=async choices=>choices.find(choice=>choice.label.includes('Ken'));
  const chosenOwner=await chooseSandbox.runChoose({},'character');
  assert.equal(chosenOwner.label,'Ken','an ambiguous shared source requires an explicit saved-character choice and never falls back to Template');

  let forgotten=0, attempts=0, released=0, policyPanels=[];
  const registry={matchingPanels:()=>[],hasPanel:()=>false};
  const characterViews={matchingCharacterPanels:()=>policyPanels.map(panel=>({panel})),sharedCharacterPanels:()=>[],restoredUnownedCharacterPanels:()=>[],addCharacterPanelOwner:()=>false,releaseCharacterPanelOwner:()=>0,hasCharacterPanel:panel=>policyPanels.includes(panel)};
  const sandbox={require:name=>name==='./authoring_context_registry'?registry:name==='./character_view_policy'?characterViews:{prepare:async()=>true},refreshedProfile:profile=>profile,allFiles:profile=>profile.connectedFiles||[],refreshedCharacterContext:profile=>({key:'test',root:'test',type:'character',label:profile.name||'Test',ownerDef:profile.defPath||'',files:profile.connectedFiles||[]}),characterContext:profile=>({key:'test',type:'character',label:profile?.name||'Test',ownerDef:profile?.defPath||'',files:profile?.connectedFiles||[]}),activeFile:()=>'',characterFolder:()=>'',load:()=>[],currentContext:()=>null,openContexts:()=>[],path:{basename:value=>value},beginContextClose:()=>()=>released++,tabFilename:()=> 'file.air',contextOwnsFile:()=>true,forgetCharacter:()=>forgotten++,WORKBENCH_COLUMNS:new Map(),SESSION_GENERATIONS:new Map(),normalized:x=>x,vscode:{window:{tabGroups:{all:[{tabs:[{}]}],close:async()=>{attempts++;return false;}},showQuickPick:async choices=>choices[0],showWarningMessage:()=>{},showInformationMessage(){throw new Error('Cancelled close must not report success');}}},Promise,Set,Number,Date,setTimeout,clearTimeout,setInterval,clearInterval};
  vm.createContext(sandbox);vm.runInContext(choose+close+';this.run=closeAuthoringContext',sandbox);
  await sandbox.run({},'character',{folder:'test'});
  assert.equal(attempts,1);assert.equal(forgotten,0);assert.equal(released,1);

  let reported='';attempts=0;const viewer={title:'Template SFF',dispose(){policyPanels=policyPanels.filter(item=>item!==this);}};policyPanels=[viewer];sandbox.vscode.window.showInformationMessage=message=>{reported=message;};sandbox.vscode.window.tabGroups.all=[];sandbox.vscode.window.visibleTextEditors=[];sandbox.vscode.workspace={textDocuments:[],getConfiguration:()=>({get:(_,fallback)=>fallback})};sandbox.vscode.window.tabGroups.close=async()=>true;await sandbox.run({},'character',{folder:'test'});assert.equal(policyPanels.length,0,'an exact asset viewer in a reserved character folder is disposed');assert(reported.includes('1 visual workspace(s)'),'success reports the reconciled visual panel');assert.equal(forgotten,1);assert.equal(released,2);

  const connectedViewer={title:'Shared SFF',dispose(){policyPanels=policyPanels.filter(item=>item!==this);}};
  policyPanels=[connectedViewer];reported='';sandbox.load=()=>[{name:'Ryu',folder:'c:/chars/ryu',defPath:'c:/chars/ryu/ryu.def',connectedFiles:['c:/chars/template/shared.sff']}];sandbox.refreshedCharacterContext=profile=>({key:'c:/chars/ryu',root:'c:/chars/ryu',type:'character',label:profile.name,files:profile.connectedFiles});sandbox.contextOwnsFile=(selected,filename)=>(selected.files||[]).includes(filename);characterViews.matchingCharacterPanels=selected=>selected.files.includes('c:/chars/template/shared.sff')?[{panel:connectedViewer}]:[];characterViews.hasCharacterPanel=panel=>policyPanels.includes(panel);await sandbox.run({},'character');assert.equal(policyPanels.length,0,'no-item toolbar close disposes the SFF viewer connected outside the character folder');assert(reported.includes('1 visual workspace(s)'),'no-item toolbar close reports the connected external viewer');

  let adopted=false;const legacyViewer={active:true,title:'Restored shared SFF',dispose(){policyPanels=policyPanels.filter(item=>item!==this);}};policyPanels=[legacyViewer];characterViews.restoredUnownedCharacterPanels=()=>adopted?[]:[{panel:legacyViewer,filename:'c:/chars/template/shared.sff'}];characterViews.addCharacterPanelOwner=()=>{adopted=true;return true;};characterViews.matchingCharacterPanels=()=>adopted?[{panel:legacyViewer}]:[];sandbox.vscode.window.showWarningMessage=async(message,options,choice)=>choice;reported='';await sandbox.run({},'character',{profile:{name:'Test',folder:'test',defPath:'c:/chars/test/test.def',connectedFiles:[]}});assert(adopted,'an active viewer restored from a pre-provenance release is adopted only after the explicit one-time choice');assert.equal(policyPanels.length,0,'the adopted restored viewer closes with the selected character');assert(reported.includes('1 visual workspace(s)'),'the migrated restored viewer is included in close success');

  const keptLegacy={active:true,title:'Kept restored SFF',dispose(){throw new Error('Keep Open must retain the legacy viewer');}};policyPanels=[keptLegacy];let keepPrompts=0;characterViews.restoredUnownedCharacterPanels=()=>[{panel:keptLegacy,filename:'c:/chars/template/shared.sff'}];characterViews.addCharacterPanelOwner=()=>{throw new Error('Keep Open must not adopt the legacy viewer');};characterViews.matchingCharacterPanels=()=>[];characterViews.hasCharacterPanel=panel=>policyPanels.includes(panel);sandbox.vscode.window.showWarningMessage=async()=>{keepPrompts++;return 'Keep Open';};await sandbox.run({},'character',{profile:{name:'Test',folder:'test',defPath:'c:/chars/test/test.def',connectedFiles:['c:/chars/template/shared.sff']}});assert.equal(keepPrompts,1,'an active legacy viewer offers the one-time ownership choice');assert(policyPanels.includes(keptLegacy),'Keep Open retains a connected external legacy viewer while the character closes');

  const inactiveLegacy={active:false,title:'Inactive restored SFF',dispose(){throw new Error('an inactive legacy viewer must not be closed implicitly');}};policyPanels=[inactiveLegacy];keepPrompts=0;characterViews.restoredUnownedCharacterPanels=()=>[{panel:inactiveLegacy,filename:'c:/chars/template/shared.sff'}];sandbox.vscode.window.showWarningMessage=async()=>{keepPrompts++;return 'Keep Open';};await sandbox.run({},'character',{profile:{name:'Test',folder:'test',defPath:'c:/chars/test/test.def',connectedFiles:['c:/chars/template/shared.sff']}});assert.equal(keepPrompts,1,'the one-time migration choice includes connected inactive restored viewers so one workbench close can handle its legacy stack');assert(policyPanels.includes(inactiveLegacy),'Keep Open still retains an inactive connected legacy viewer until explicitly adopted');

  const unrelatedLegacy={active:false,title:'Ken restored SFF',dispose(){throw new Error('closing Ryu must never dispose an unrelated inactive Ken viewer');}};policyPanels=[unrelatedLegacy];keepPrompts=0;characterViews.restoredUnownedCharacterPanels=()=>[{panel:unrelatedLegacy,filename:'c:/chars/ken/ken.sff'}];sandbox.vscode.window.showWarningMessage=async()=>{keepPrompts++;return 'Close with Test';};await sandbox.run({},'character',{profile:{name:'Test',folder:'test',defPath:'c:/chars/test/test.def',connectedFiles:['c:/chars/template/shared.sff']}});assert.equal(keepPrompts,0,'an unrelated inactive legacy viewer is not offered for adoption');assert(policyPanels.includes(unrelatedLegacy),'an unrelated inactive legacy viewer survives the selected character close');

  let lateDisposed=0;const lateViewer={title:'Late restored AIR',dispose(){lateDisposed++;policyPanels=policyPanels.filter(item=>item!==this);}};const firstViewer={title:'Active restored SFF',dispose(){policyPanels=policyPanels.filter(item=>item!==this);setTimeout(()=>policyPanels.push(lateViewer),180);}};policyPanels=[firstViewer];characterViews.restoredUnownedCharacterPanels=()=>[];characterViews.matchingCharacterPanels=()=>policyPanels.map(panel=>({panel}));characterViews.hasCharacterPanel=panel=>policyPanels.includes(panel);let successCount=0;sandbox.vscode.window.showInformationMessage=()=>{successCount++;};await sandbox.run({},'character',{folder:'test'});assert.equal(lateDisposed,1,'one close transaction drains a viewer restored after the initially active viewer is disposed');assert.equal(policyPanels.length,0,'no late owned viewer survives the fixed-point drain');assert.equal(successCount,1,'the delayed restored stack reports success exactly once');

  characterViews.matchingCharacterPanels=()=>[];sandbox.contextOwnsFile=()=>true;
  const hidden={fileName:'hidden.cns',isClosed:false,uri:{scheme:'file'}},hiddenGroup={viewColumn:1,tabs:[]};let hiddenShown=0,hiddenClosed=0;sandbox.tabFilename=tab=>tab?.input?.uri?.fsPath||'';sandbox.vscode.workspace={textDocuments:[hidden],getConfiguration:()=>({get:(key,fallback)=>key==='textToolbar.headerOnlyLayout'?true:fallback})};sandbox.vscode.ViewColumn={One:1};sandbox.vscode.window.activeTextEditor=null;sandbox.vscode.window.visibleTextEditors=[];sandbox.vscode.window.tabGroups.all=[];sandbox.vscode.window.showTextDocument=async document=>{hiddenShown++;const tab={input:{uri:{fsPath:document.fileName}}};hiddenGroup.tabs=[tab];sandbox.vscode.window.tabGroups.all=[hiddenGroup];return{document,viewColumn:1};};sandbox.vscode.window.tabGroups.close=async target=>{if(target===hiddenGroup.tabs[0]){hiddenClosed++;hiddenGroup.tabs=[];}return true;};await sandbox.run({},'character',{folder:'test'});assert.equal(hiddenShown,1,'header-only close materializes an owned document omitted from the tab snapshot');assert.equal(hiddenClosed,1,'the exact materialized hidden editor is closed');assert.equal(hidden.isClosed,false,'VS Code may retain a loaded TextDocument after its editor closes');

  const delayedEditor={document:{fileName:'delayed.cns'}};reported='';sandbox.vscode.window.showInformationMessage=message=>{reported=message;};sandbox.vscode.workspace={textDocuments:[],getConfiguration:()=>({get:(_,fallback)=>fallback})};sandbox.vscode.window.visibleTextEditors=[delayedEditor];sandbox.vscode.window.tabGroups.all=[];setTimeout(()=>{sandbox.vscode.window.visibleTextEditors=[];},180);await sandbox.run({},'character',{folder:'test'});assert(reported.startsWith('Closed '),'a visible editor that settles after the former 120ms boundary must not cause a false close failure');

  let blocked='';sandbox.vscode.window.visibleTextEditors=[{document:{fileName:'stuck.cns'}}];sandbox.vscode.window.showWarningMessage=message=>{blocked=message;};await sandbox.run({},'character',{folder:'test'});assert(blocked.includes('stuck.cns'),'a genuinely surviving editor remains named as a close blocker after the stable-state wait');sandbox.vscode.window.visibleTextEditors=[];
  console.log('Cancelled character close preserves panels and context without repeated prompts');
})().catch(error=>{console.error(error);process.exitCode=1;});
