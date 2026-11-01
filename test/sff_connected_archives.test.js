'use strict';

const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const Module=require('module');

const root=fs.mkdtempSync(path.join(os.tmpdir(),'ikemaker-connected-sff-'));
const owner=path.join(root,'Ryu.def'),primary=path.join(root,'Ryu.sff'),fx=path.join(root,'sf6commonspr.sff'),fxA=path.join(root,'A-NewFX.sff'),missing=path.join(root,'missing.sff');
for(const filename of [owner,primary,fx,fxA])fs.writeFileSync(filename,'fixture');
const vscode={env:{uiKind:1},UIKind:{Web:2},Uri:{file:fsPath=>({fsPath})},workspace:{getConfiguration:()=>({get:(_key,fallback)=>fallback}),getWorkspaceFolder:()=>undefined}};
const original=Module._load;
let records=[
  {prefix:'sf6',displayPrefix:'SF6',sff:fx},
  {prefix:'duplicate',displayPrefix:'Duplicate',sff:fx},
  {prefix:'missing',displayPrefix:'Missing',sff:missing}
];
Module._load=function(request,parent,isMain){
  if(request==='vscode')return vscode;
  if(request==='./related_work'&&/sff_viewer\.js$/.test(parent.filename))return{resolveAssigned:()=>({sff:primary})};
  if(request==='./viewer_navigation'&&/sff_viewer\.js$/.test(parent.filename))return{archiveRegistry:()=>({candidates:records})};
  return original.call(this,request,parent,isMain);
};

(async()=>{try{
  const {connectedSffInventory,openConnectedSffArchive}=require('../src/sff_viewer');
  const connected=connectedSffInventory(primary,[owner]);
  assert.deepStrictEqual(connected.map(item=>path.basename(item.filename)),['Ryu.sff','sf6commonspr.sff'],'inventory contains the DEF-assigned archive and one canonical shared-FX target');
  assert(connected.every(item=>/^sff-[a-f0-9]{24}$/.test(item.id)&&!item.id.includes(root.toLowerCase())),'webview identities are stable opaque hashes rather than positions or raw paths');
  assert.strictEqual(connected.filter(item=>item.current).length,1,'exactly one connected archive is marked current');
  assert(connected[0].label.startsWith('Character · '));
  assert(connected[1].label.startsWith('SF6 · '));
  assert.deepStrictEqual(connectedSffInventory(fx,[]).map(item=>({name:path.basename(item.filename),current:item.current})),[{name:'sf6commonspr.sff',current:true}],'an unowned standalone viewer exposes only itself');
  const fxId=connected.find(item=>item.filename===fx).id,calls=[],warnings=[],api={Uri:{file:fsPath=>({fsPath})},ViewColumn:{Beside:2},commands:{executeCommand:async(...args)=>calls.push(args)},window:{showWarningMessage:message=>warnings.push(message)}};
  records=[{prefix:'new',displayPrefix:'NEW',sff:fxA},...records];
  assert.strictEqual(await openConnectedSffArchive({id:fxId},primary,[owner],{viewColumn:7},api,()=>false),true,'the actual host receiver accepts the still-authorized stable identity after inventory reorder');
  assert.strictEqual(calls[0][1].fsPath,fx,'inventory reorder cannot make a captured identity open a newly inserted archive');
  assert.strictEqual(calls[0][2],7,'connected SFF stays in the current viewer editor group');
  assert.deepStrictEqual(calls[0][4].ownerDefs,[owner],'the complete owner provenance is retained for viewer reuse and workbench close');
  const failedApi={...api,commands:{executeCommand:async()=>undefined}};
  assert.strictEqual(await openConnectedSffArchive({id:fxId},primary,[owner],{viewColumn:7},failedApi,()=>false),false,'a viewer focus/open failure is acknowledged without changing the origin viewer identity');
  records=records.filter(record=>record.sff!==fx);
  assert.strictEqual(await openConnectedSffArchive({id:fxId},primary,[owner],{viewColumn:7},api,()=>false),false,'a removed target fails closed');
  assert.strictEqual(await openConnectedSffArchive({id:'sff-forged'},primary,[owner],{viewColumn:7},api,()=>false),false,'a forged identity fails closed');
  const primaryId=connected.find(item=>item.filename===primary).id;
  assert.strictEqual(await openConnectedSffArchive({id:primaryId},primary,[owner],{viewColumn:7},api,()=>true),false,'a closing owner cannot open or focus another archive');
  assert.strictEqual(calls.length,1,'removed, forged, and closing-owner routes open nothing');
  assert.strictEqual(warnings.length,4,'each rejected or failed host route explains why nothing opened');
  console.log('Connected SFF inventory is owner-derived, deduplicated, deterministic, and standalone-safe');
}finally{
  Module._load=original;
  fs.rmSync(root,{recursive:true,force:true});
}})().catch(error=>{console.error(error);process.exitCode=1;});
