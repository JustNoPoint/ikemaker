'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),os=require('os'),Module=require('module'),vm=require('vm');
(async()=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'history-routes-'));
  const air=path.join(folder,'test.air'),cns=path.join(folder,'test.cns');
  fs.writeFileSync(air,'[Begin Action 200]\n0,0,0,0,1\n0,1,0,0,1\n');fs.writeFileSync(cns,'anim = 200\n');fs.writeFileSync(path.join(folder,'test.def'),'[Files]\nanim = test.air\ncns = test.cns\n');
  const messages=[],notices=[],sourceVisits=[];let accept=true,nav,disposed,opens=0;
  const panel={reveal(){},onDidDispose(fn){disposed=fn;},webview:{postMessage(message){messages.push(message);if(message.type==='viewerHistoryRestore')queueMicrotask(()=>nav.acknowledgeRestore(panel,{requestId:message.requestId,ok:accept}));return true;}}};
  const vscode={Uri:{file:fsPath=>({fsPath})},Range:class{constructor(line,character){this.line=line;this.character=character;}},workspace:{textDocuments:[],openTextDocument:async filename=>({fileName:filename,getText:()=>fs.readFileSync(filename,'utf8'),lineAt:line=>({text:fs.readFileSync(filename,'utf8').split('\n')[line]})})},window:{showInformationMessage:text=>notices.push(text),showErrorMessage:text=>notices.push(text),showTextDocument:async(doc,options)=>sourceVisits.push({doc,options})}};
  const original=Module._load;
  Module._load=function(request,parent,isMain){if(request==='vscode')return vscode;if(request==='./air_viewer'&&parent.filename.endsWith('viewer_navigation.js'))return{openAirPreview:async()=>{opens++;queueMicrotask(()=>nav.registerSourcePanel(panel,air));return {panel};}};return original.call(this,request,parent,isMain);};
  try{
    nav=require('../src/viewer_navigation');
    await nav.openConnected(cns,'air',{group:200},{filename:cns,line:0,character:2,text:'anim = 200'});
    assert(await nav.travelHistory(-1,nav.currentPoint(air,'air',{navigationSelection:{group:200,frameIndex:1}},panel)));
    assert.strictEqual(sourceVisits[0].options.selection.line,0);
    accept=false;assert.strictEqual(await nav.travelHistory(1),false,'viewer veto must not advance history');
    accept=true;assert(await nav.travelHistory(1));
    assert.deepStrictEqual(messages.filter(m=>m.type==='viewerHistoryRestore').at(-1).reference,{group:200,frameIndex:1});
    await nav.travelHistory(-1);disposed();
    assert(await nav.travelHistory(1),'closed viewer reopens and acknowledges the exact selection');assert.strictEqual(opens,2);
    await nav.travelHistory(-1);fs.writeFileSync(air,'[Begin Action 999]\n0,0,0,0,1\n');
    assert.strictEqual(await nav.travelHistory(1),false);assert(notices.at(-1).includes('no longer exists'));
    fs.writeFileSync(air,'[Begin Action 200]\n0,0,0,0,1\n0,1,0,0,1\n');
    assert(await nav.travelHistory(1),'a failed visit retains the cursor for retry');
    await nav.travelHistory(-1);nav.registerSourcePanel(panel,path.join(folder,'other.def'));
    assert(await nav.travelHistory(1));assert.strictEqual(opens,3,'a panel now showing another owner cannot satisfy the old history location');
    const def=path.join(folder,'test.def');
    nav.registerSourcePanel(panel,def);
    await nav.openReferenceSource({filename:cns,line:0,text:'anim = 200'},nav.currentPoint(def,'constants',{navigationSelection:{id:'normal.mp'}},panel));
    disposed();
    vscode.commands={executeCommand:async(command,uri,options)=>{
      assert.strictEqual(command,'ikemen.moveConstants.open');assert.strictEqual(uri.fsPath,def);assert.deepStrictEqual(options,{history:true});
      queueMicrotask(()=>nav.registerSourcePanel(panel,def));return panel;
    }};
    assert(await nav.travelHistory(-1),'closed JNP history reopens its owner and waits for readiness');
    assert.deepStrictEqual(messages.filter(m=>m.type==='viewerHistoryRestore').at(-1).reference,{id:'normal.mp'});
    const storyboard=path.join(folder,'story.def');
    fs.writeFileSync(storyboard,'[SceneDef]\n[Scene 2]\nend.time = 180\n[Scene 7]\nend.time = 90\n');
    nav.registerSourcePanel(panel,storyboard);
    await nav.openViewerSource(cns,0,nav.currentPoint(storyboard,'storyboard',{navigationSelection:{sceneNumber:7}},panel));
    disposed();let storyboardOpens=0;
    vscode.commands.executeCommand=async(command,uri)=>{
      assert.equal(command,'ikemen.storyboard.open');assert.equal(uri.fsPath,storyboard);storyboardOpens++;
      queueMicrotask(()=>nav.registerSourcePanel(panel,storyboard));return panel;
    };
    assert(await nav.travelHistory(-1));assert.equal(storyboardOpens,1);
    assert.equal(messages.filter(m=>m.type==='viewerHistoryRestore').at(-1).reference.sceneNumber,7);
    await nav.travelHistory(1);fs.writeFileSync(storyboard,'[SceneDef]\n[Scene 2]\nend.time = 180\n');
    assert.equal(await nav.travelHistory(-1),false,'deleted scenes must not silently select another scene');
    assert.equal(storyboardOpens,1);
    fs.appendFileSync(storyboard,'[Scene 7]\nend.time = 90\n');assert(await nav.travelHistory(-1),'failed restore leaves history available for retry');
    const codeFile=path.join(folder,'blocks.zss'),codeText='[StateDef 200]\nHitDef{\n damage:30;\n}\n';
    fs.writeFileSync(codeFile,codeText);
    const codeModel=require('../src/code_structure_workspace').clientModel({fileName:codeFile,languageId:'zss',uri:{toString:()=>codeFile},getText:()=>codeText});
    const codeNode=require('../src/code_structure_model').flatten(codeModel).find(n=>n.kind==='controller');
    const codeRef=require('../src/code_structure_navigation').referenceFor(codeNode);
    nav.registerSourcePanel(panel,codeFile);
    await nav.openViewerSource(cns,0,nav.currentPoint(codeFile,'code',{navigationSelection:codeRef},panel));disposed();
    vscode.commands.executeCommand=async(command,uri)=>{assert.equal(command,'ikemen.codeStructure.openWorkspace');assert.equal(uri.fsPath,codeFile);queueMicrotask(()=>nav.registerSourcePanel(panel,codeFile));return panel;};
    assert(await nav.travelHistory(-1),'closed Code Structure restores a real client-model block reference');
    assert.deepStrictEqual(messages.filter(m=>m.type==='viewerHistoryRestore').at(-1).reference,codeRef);
    await nav.travelHistory(1);fs.writeFileSync(codeFile,'; inserted line\n'+codeText);
    assert(await nav.travelHistory(-1),'unique block survives line movement');
    await nav.travelHistory(1);fs.writeFileSync(codeFile,codeText.replace('30','31'));
    assert.equal(await nav.travelHistory(-1),false,'changed block cannot silently restore');
    fs.writeFileSync(codeFile,codeText);assert(await nav.travelHistory(-1));
    const stageFile=path.join(folder,'stage.def'),stageText='[Info]\nname=Test\n[Camera]\nstartx=0\n[StageInfo]\nzoffset=200\n[BGDef]\n[BG Sky]\ntype=normal\nspriteno=0,0\nstart=0,0\n[BG Floor]\ntype=normal\nspriteno=0,1\nstart=0,200\n';
    fs.writeFileSync(stageFile,stageText);const stageRef={backgroundName:'Floor',backgroundType:'normal'};
    nav.registerSourcePanel(panel,stageFile);await nav.openViewerSource(cns,0,nav.currentPoint(stageFile,'stage',{navigationSelection:stageRef},panel));disposed();
    vscode.commands.executeCommand=async(command,uri)=>{assert.equal(command,'ikemen.stage.openWorkspace');assert.equal(uri.fsPath,stageFile);queueMicrotask(()=>nav.registerSourcePanel(panel,stageFile));return panel;};
    assert(await nav.travelHistory(-1),'closed Stage dispatch restores the background reference');assert.deepStrictEqual(messages.filter(m=>m.type==='viewerHistoryRestore').at(-1).reference,stageRef);
    await nav.travelHistory(1);fs.writeFileSync(stageFile,stageText.replace('[BG Floor]','[BG Renamed]'));
    assert.equal(await nav.travelHistory(-1),false,'renamed background must not select a different element');
    fs.writeFileSync(stageFile,stageText);assert(await nav.travelHistory(-1));
    // Native authoring source buttons share source tab placement and history.
    vscode.ViewColumn={Beside:-2};
    vscode.window.tabGroups={all:[{viewColumn:3,tabs:[{input:{uri:{fsPath:cns}}}]}]};
    const commandOwner=path.join(folder,'command-owner.def'),commandFile=path.join(folder,'commands.cmd');
    fs.writeFileSync(commandOwner,'[Files]\ncmd=commands.cmd\n');fs.writeFileSync(commandFile,'[Command]\nname="test"\ncommand=x\n');
    const commandRef={tab:'command',file:commandFile,command:require('../src/command_movelist_navigation').commandValues(require('../src/command_movelist_model').parseCommands(fs.readFileSync(commandFile,'utf8')).commands[0])};
    for(const kind of ['stage','storyboard','commands','code']){
      const owner=kind==='commands'?commandOwner:def;
      nav.registerSourcePanel(panel,owner);
      const from=nav.currentPoint(owner,kind,kind==='commands'?{navigationSelection:commandRef}:{},panel);
      assert(await nav.openViewerSource(cns,999,from));
      assert.strictEqual(sourceVisits.at(-1).options.viewColumn,3,'reuse the source tab group');
      assert.strictEqual(sourceVisits.at(-1).options.selection.line,1,'clamp beyond the last line');
      assert(await nav.travelHistory(-1),'native source visit returns to the open authoring panel');
      assert.strictEqual(messages.filter(m=>m.type==='viewerHistoryRestore').at(-1).kind,kind);
    }
    vscode.window.visibleTextEditors=[{document:{fileName:cns},viewColumn:4}];
    assert(await nav.openViewerSource(cns,Infinity,nav.currentPoint(def,'stage',{},panel)));
    assert.strictEqual(sourceVisits.at(-1).options.viewColumn,4);
    assert.strictEqual(sourceVisits.at(-1).options.selection.line,0);
    assert.strictEqual(await nav.openViewerSource(path.join(folder,'missing.def'),0),false);
    assert(notices.at(-1).includes('no longer available'));

  }finally{Module._load=original;fs.rmSync(folder,{recursive:true,force:true});}

  // Execute the Stage native Source branch, not a duplicate implementation.
  const stageSource=fs.readFileSync(path.join(__dirname,'../src/stage_workspace.js'),'utf8');
  const stageStart=stageSource.indexOf("if (message.type === 'openSource') {");
  assert(stageStart>=0);
  const stageBranch=stageSource.slice(stageStart).match(/^if \(message.type === 'openSource'\) \{[\s\S]*?return;\s*\}/)[0];
  const calls=[],stagePanel={};
  await vm.runInNewContext('(async()=>{'+stageBranch+'})()',{
    message:{type:'openSource',line:17},filename:'stage.def',panel:stagePanel,
    currentPoint:(filename,kind,message,panel)=>({filename,kind,panel}),
    openViewerSource:async(...args)=>calls.push(args)
  });
  assert.strictEqual(calls.length,1);assert.strictEqual(calls[0][1],17);
  assert.strictEqual(calls[0][2].kind,'stage');assert.strictEqual(calls[0][2].panel,stagePanel);

  // Run the real webview restore bridge: a pending edit veto sends a negative
  // acknowledgment and never dispatches a selection-changing message.
  const {launchControlsClientScript}=require('../src/launch_controls');
  const bridge=launchControlsClientScript().split('const navigationSelection=')[0];
  const replies=[],dispatched=[];let listener;
  const sandbox={addEventListener:(type,fn)=>listener=fn,vscode:{postMessage:m=>replies.push(m)},ikemenCanRestoreNavigation:()=>false,window:{dispatchEvent:event=>dispatched.push(event)},MessageEvent:class{constructor(type,init){this.type=type;this.data=init.data;}}};
  vm.runInNewContext(bridge,sandbox);
  listener({data:{type:'viewerHistoryRestore',requestId:1,kind:'air',reference:{group:200}}});
  assert.strictEqual(replies[0].ok,false);assert.strictEqual(dispatched.length,0);
  sandbox.ikemenCanRestoreNavigation=()=>true;
  listener({data:{type:'viewerHistoryRestore',requestId:2,kind:'air',reference:{group:200,frameIndex:1}}});
  assert.strictEqual(replies[1].ok,true);assert.strictEqual(dispatched[0].data.frameIndex,1);
  let restoredMove;
  sandbox.ikemenRestoreNavigation=ref=>{restoredMove=ref.id;};
  listener({data:{type:'viewerHistoryRestore',requestId:3,kind:'constants',reference:{id:'normal.mp'}}});
  assert.strictEqual(restoredMove,'normal.mp');assert.strictEqual(dispatched.length,1,'custom workspaces restore through their own selection adapter');
  console.log('History source/viewer routing, exact selection, closed panels, stale targets and dirty-edit veto passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
