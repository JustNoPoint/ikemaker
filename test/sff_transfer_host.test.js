'use strict';

const assert=require('assert'),Module=require('module');

(async()=>{
  const original=Module._load,roleCalls=[],errors=[];
  const sourceArchive={sprites:[{index:0,group:0,number:0},{index:1,group:0,number:1}]},destinationArchive={sprites:[{index:0,group:9,number:9}]},browserStub={closeTransferSession(){},transferSelectionItems(_archive,references){return references.map(reference=>({id:`${reference.group},${reference.number}@${reference.physicalIndex}`,physicalIndex:reference.physicalIndex,label:'dragged',contentFingerprint:'A'.repeat(64),metadataFingerprint:'B'.repeat(64)}))}};
  const vscode={window:{showErrorMessage:async message=>{errors.push(message)},showInformationMessage:async()=>{}},commands:{},Uri:{file:fsPath=>({fsPath})},ViewColumn:{One:1,Beside:2}};
  Module._load=function(request,parent,main){
    if(request==='vscode')return vscode;
    if(request==='./sff_viewer'&&parent?.filename?.endsWith('sff_transfer_host.js'))return{updateSffTransferRole(panel,role,sessionId){roleCalls.push({panel,role,sessionId});return panel.accept!==false}};
    if(request==='./sff_browser'&&parent?.filename?.endsWith('sff_transfer_host.js'))return browserStub;
    if(request==='./sff_reader'&&parent?.filename?.endsWith('sff_transfer_host.js'))return{readSff:filename=>filename.includes('ryu')?sourceArchive:destinationArchive};
    return original.call(this,request,parent,main);
  };
  const {SffTransferHost,sameFile,exactDragAuthority,exactDestinationBoundary}=require('../src/sff_transfer_host');
  assert.equal(sameFile('C:\\Chars\\Ryu\\Ryu.sff','c:\\chars\\ryu\\ryu.sff'),process.platform==='win32');
  const host=new SffTransferHost(),source={id:'source-h',role:'source'},destination={id:'destination-h',role:'destination'};
  host.handles.set('stale',{id:'stale',filename:'C:\\chars\\ryu.sff',role:'destination'});
  host.handles.set(source.id,{id:source.id,filename:'C:\\chars\\ryu.sff',role:'source',sessionId:'session'});
  host.handles.set(destination.id,{id:destination.id,filename:'C:\\chars\\ken.sff',role:'destination',sessionId:'session'});
  host.mode={snapshot:()=>({active:true,handles:{source,destination}})};
  assert.equal(host.roleForUri({fsPath:'C:\\chars\\ryu.sff'}),'source','routing is derived from active handle authority rather than leaked handles');
  host.handles.delete(source.id);
  assert.equal(host.roleForUri({fsPath:'C:\\chars\\ryu.sff'}),'','a stale handle cannot route a later browser');
  host.handles.set(source.id,{id:source.id,filename:'C:\\chars\\ryu.sff',role:'source',sessionId:'session',panel:{accept:true}});
  host.handles.get(destination.id).panel={accept:false};
  await assert.rejects(()=>host.updateEndpointRoles([{handle:source,role:'destination'},{handle:destination,role:'source'}],{sessionId:'session'}),/could not be updated/);
  assert.equal(host.handles.get(source.id).role,'source');assert.equal(host.handles.get(destination.id).role,'destination');
  assert.deepEqual(roleCalls.map(call=>call.role),['destination','source','source'],'the first visual role is rolled back if the second update fails');
  const authority={schema:'ikemaker.sff-transfer-drag',sessionId:'session',generation:4,sourceHandleId:source.id,selection:[{physicalIndex:1,group:0,number:1}]},snapshot={active:true,session:{sessionId:'session',generation:4},handles:{source,destination}};
  assert.deepEqual(exactDragAuthority(snapshot,source.id,authority),authority.selection);
  assert.throws(()=>exactDragAuthority(snapshot,source.id,{...authority,sessionId:'other'}),/stale or different/);
  assert.deepEqual(exactDestinationBoundary(destinationArchive,{kind:'between-sprites',id:'9,9@0',position:1}),{kind:'between-sprites',id:'9,9@0',position:1});
  assert.throws(()=>exactDestinationBoundary(destinationArchive,{kind:'between-sprites',id:'9,8@0',position:1}),/stale or mismatched/);
  let current=[{id:'old-A'}],reviewed=null;host.handles.get(destination.id).filename='C:\\chars\\ken.sff';host.mode={snapshot:()=>snapshot,setSelection:(role,selection,handleId)=>{assert.equal(role,'source');assert.equal(handleId,source.id);current=selection},reviewSelection:async(method,input)=>{reviewed={method,input,selection:current};return{status:'cancelled'}}};
  await host.dropSelected('destination',destination.id,authority,{kind:'between-sprites',id:'9,9@0',position:1});
  assert.equal(reviewed.method,'drag-drop');assert.equal(reviewed.selection[0].physicalIndex,1,'the exact dragged B batch replaces stale prior selection A before review');
  await host.dropSelected('source',source.id,authority,{kind:'between-sprites',id:'9,9@0',position:1});assert.match(errors.at(-1),/accepted only by the current Destination/);
  Module._load=original;
  console.log('SFF Transfer host routing, atomic role rollback, bound drag authority and exact destination boundary passed');
})().catch(error=>{console.error(error);process.exitCode=1});
