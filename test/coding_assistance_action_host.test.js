'use strict';

const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const crypto=require('crypto');
const host=require('../src/coding_assistance_action_host');
const digest=value=>crypto.createHash('sha256').update(String(value)).digest('hex');

async function main(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ikemaker-assistant-actions-')),owner=path.join(root,'fighter.def'),source=path.join(root,'states.zss'),other=path.join(root,'other.zss'),disk='[StateDef 100]\n',dirty='[StateDef 100]\nif time = 0 {}\n';fs.writeFileSync(owner,'[Files]\nstates = states.zss\n');fs.writeFileSync(source,disk);fs.writeFileSync(other,'[StateDef 900]\n');
  const sourceUri={fsPath:source,toString:()=>`file:${source}`},document={fileName:source,uri:sourceUri,isClosed:false,isDirty:true,languageId:'ikemen-zss',getText:()=>dirty},calls=[],messages=[],originalUri={toString:()=> 'untitled:saved-snapshot'},picks=[];
  const api={Uri:{file:filename=>({fsPath:filename})},workspace:{textDocuments:[document],openTextDocument:async options=>{assert.strictEqual(options.content,disk);assert.strictEqual(options.language,'ikemen-zss');return{uri:originalUri};}},window:{showQuickPick:async()=>picks.shift(),showWarningMessage:message=>(messages.push(['warning',message]),message),showInformationMessage:message=>(messages.push(['info',message]),message)},commands:{executeCommand:async(...args)=>(calls.push(args),args)}};
  const context={ownerDef:owner,files:[owner,source]},exact={filename:source,line:1,fingerprint:digest(dirty)};let current=true,focused=0,services={isCurrent:()=>current,focusSimilar:()=>{focused++;return true;}};

  assert.strictEqual(await host.execute(api,{action:'focus-similar-code'},context,services),true);assert.strictEqual(focused,1);
  await host.execute(api,{action:'open-example-templates'},context,services);assert.deepStrictEqual(calls.pop(),['ikemen.authoring.openExamples']);
  await host.execute(api,{action:'open-recipe-library'},context,services);assert.deepStrictEqual(calls.pop(),['ikemen.authoring.openRecipes']);
  await host.execute(api,{action:'open-native-diff',source:exact},context,services);const diff=calls.pop();assert.strictEqual(diff[0],'vscode.diff');assert.strictEqual(diff[1],originalUri);assert.strictEqual(diff[2],sourceUri);assert.match(diff[3],/Saved ↔ Unsaved Semantic Change/);

  picks.push({id:'position'});await host.execute(api,{action:'open-coordinate-tools',source:exact},context,services);const position=calls.pop();assert.strictEqual(position[0],'ikemen.positionCamera.open');assert.strictEqual(position[1].fsPath,owner);assert.deepStrictEqual(position[2].sourceSelection,exact);
  picks.push({id:'scale'});await host.execute(api,{action:'open-coordinate-tools',source:exact},context,services);const scale=calls.pop();assert.strictEqual(scale[0],'ikemen.scaleReview.run');assert.strictEqual(scale[2].preferredSourcePath,source);assert.deepStrictEqual(scale[2].sourceSelection,exact);

  const beforeCalls=calls.length;await host.execute(api,{action:'open-native-diff',source:{...exact,fingerprint:'0'.repeat(64)}},context,services);assert.strictEqual(calls.length,beforeCalls);assert(messages.some(([,message])=>/changed or is no longer assigned/.test(message)));
  messages.length=0;await host.execute(api,{action:'open-native-diff',source:{filename:other,line:0,fingerprint:digest(fs.readFileSync(other,'utf8'))}},context,services);assert(messages.some(([,message])=>/no longer assigned/.test(message)),'a real but unassigned source is rejected');
  picks.push({id:'position'});current=false;assert.strictEqual(await host.execute(api,{action:'open-coordinate-tools',source:exact},context,services),false);assert.strictEqual(picks.length,1,'a stale browser authority is rejected before prompting');
  assert.strictEqual(await host.execute(api,{action:'run-arbitrary-command'},context,{isCurrent:()=>true}),false,'unknown action identifiers fail closed');
  fs.rmSync(root,{recursive:true,force:true});console.log('Coding Insight row actions preserve exact source/owner authority across Similar Code, templates, native diff, Position & Camera, and Scale Review handoffs');
}

main().catch(error=>{console.error(error);process.exitCode=1;});
