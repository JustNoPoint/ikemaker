'use strict';

const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const insights=require('../src/coding_assistance_insights');

async function main(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ikemaker-scenario-host-')),owner=path.join(root,'fighter.def'),other=path.join(root,'other.def'),source=path.join(root,'states.zss');
  fs.writeFileSync(owner,'[Files]\nstates = states.zss\n');fs.writeFileSync(other,'[Files]\nstates = states.zss\n');fs.writeFileSync(source,'[StateDef 200]\n');
  let text=fs.readFileSync(source,'utf8'),version=1,currentOwner=owner;
  const document={fileName:source,isClosed:false,get version(){return version;},getText:()=>text},editor={document,selection:{active:{line:0,character:0}}},commands=new Map(),executed=[],messages=[],store=new Map(),context={subscriptions:[],workspaceState:{get:(key,fallback)=>store.has(key)?store.get(key):fallback,update:async(key,value)=>store.set(key,value)}},registry={openContexts:()=>[{type:'character',ownerDef:currentOwner,root,files:[currentOwner,source]}],currentContext:()=>({type:'character',ownerDef:currentOwner,root,files:[currentOwner,source]}),contextOwnsFile:(entry,filename)=>entry.files.some(item=>path.resolve(item).toLowerCase()===path.resolve(filename).toLowerCase())};
  const input=[],pick=[];
  const vscode={workspace:{textDocuments:[document]},window:{activeTextEditor:editor,showInputBox:async()=>input.shift(),showQuickPick:async()=>pick.shift(),showWarningMessage:message=>messages.push(['warning',message]),showInformationMessage:message=>messages.push(['info',message])},commands:{registerCommand:(id,handler)=>(commands.set(id,handler),{dispose(){}}),executeCommand:async(id,...args)=>{executed.push([id,...args]);return id==='ikemen.authoring.launchScenarioOwner'?{status:'launched'}:undefined;}}};
  await insights.register(vscode,context,{registry});

  input.push('Corner whiff','facing, whiff, wall');pick.push({label:'training',value:'training'});await commands.get('ikemen.authoring.saveScenario')();
  const saved=store.get(insights.SCENARIO_KEY);assert.strictEqual(saved.length,1);assert.strictEqual(saved[0].ownerDef,owner);assert.strictEqual(saved[0].sourcePath,source);assert.strictEqual(saved[0].launchCommand,'ikemen.authoring.launchScenarioOwner');assert.strictEqual(saved[0].result,'not-run');

  input.push('{"time":0,"moveContact":1}');await commands.get('ikemen.authoring.setConditionValues')();assert.deepStrictEqual(insights.conditionValues(context,owner),{time:0,moveContact:1});assert.deepStrictEqual(insights.conditionValues(context,other),{},'supplied assumptions never leak to another character');
  for(const hostile of ['{"flag":{}}','{"flag":[]}','{"flag":null}','{"flag":"false"}']){input.push(hostile);await commands.get('ikemen.authoring.setConditionValues')();assert.deepStrictEqual(insights.conditionValues(context,owner),{time:0,moveContact:1},'unsupported JSON value types must not replace the last reviewed values');}
  assert(messages.filter(([,message])=>/boolean or finite number/.test(message)).length===4,'each unsupported Condition Inspector value receives a precise warning');

  pick.push({label:'Corner whiff',index:0});await commands.get('ikemen.authoring.launchScenario')();assert.deepStrictEqual(executed,[['ikemen.authoring.launchScenarioOwner',{ownerDef:owner,mode:'training'}]]);
  pick.push({label:'Corner whiff',index:0},{label:'passed-manually',value:'passed-manually'});await commands.get('ikemen.authoring.recordScenarioResult')();assert.strictEqual(store.get(insights.SCENARIO_KEY)[0].result,'passed-manually');assert.strictEqual(store.get(insights.SCENARIO_KEY)[0].recordedSourceHash,saved[0].sourceHash);

  const count=store.get(insights.SCENARIO_KEY).length;input.push('Stale setup');vscode.window.showInputBox=async options=>{if(options.title==='Save Manual Coding Scenario')return input.shift();text+='\n# changed while dialog was open\n';version++;return'facing';};pick.push({label:'training',value:'training'});await commands.get('ikemen.authoring.saveScenario')();assert.strictEqual(store.get(insights.SCENARIO_KEY).length,count,'dialog-time source changes block stale scenario storage');assert(messages.some(([,message])=>/changed.*Nothing was saved/i.test(message)));

  currentOwner=other;pick.push({label:'Corner whiff',index:0});await commands.get('ikemen.authoring.launchScenario')();assert.strictEqual(executed.length,1,'another character cannot launch the first character scenario');assert(messages.some(([,message])=>/No saved manual coding scenarios.*other\.def/.test(message)));
  fs.rmSync(root,{recursive:true,force:true});
  console.log('Coding scenarios and supplied Condition Inspector values retain exact owner/source authority and reviewed launch routes');
}

main().catch(error=>{console.error(error);process.exitCode=1;});
