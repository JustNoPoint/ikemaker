'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),Module=require('module');

(async()=>{
  const original=Module._load,vscode={workspace:{textDocuments:[]}};
  Module._load=function(request,parent,main){if(request==='vscode')return vscode;return original.call(this,request,parent,main);};
  const api=require('../src/air_viewer');Module._load=original;
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'air-entity-retarget-'));
  try{
    const make=(name,action)=>{const folder=path.join(root,name);fs.mkdirSync(folder);const air=path.join(folder,`${name}.air`),def=path.join(folder,`${name}.def`),text=`[Begin Action ${action}]\n0,0,0,0,2\n0,1,1,2,3\n`;fs.writeFileSync(air,text);fs.writeFileSync(def,`[Info]\nname=${name}\n[Files]\nanim=${name}.air\n`);return{air,def,text};};
    const first=make('First',0),second=make('Second',200),panel={},applied=[],suspended=[];let flushes=0;
    const session={panel,airPath:first.air,selectedAction:0,selectedFrame:1,markedActions:[0],actionAnchor:0,disposed:false};
    const services={session,runtimeDraftStore:{flush:async()=>{flushes++;}},applyBinding:(current,target)=>{assert.strictEqual(current.panel,panel);current.airPath=target.airPath;current.unavailable=false;current.selectedAction=target.selection.action;applied.push(target);},suspendPanel:(current,descriptor,reason)=>{current.unavailable=true;suspended.push({descriptor,reason});},openDocuments:[]};
    const descriptor=(record,label)=>({kind:'character',identity:label.toLowerCase(),ownerFile:record.def,label});
    const adapter=api.createAirRetargetAdapter(panel,services),transaction={from:descriptor(first,'First'),to:descriptor(second,'Second'),fromState:null,toState:{adapterRetainedState:{'air.viewer':{action:200,frame:1,marked:[200],anchor:200}}}};
    const prepared=await adapter.prepare(transaction);assert(prepared.ok);assert.equal(flushes,1);assert.equal(prepared.target.airPath,second.air);assert.equal(prepared.target.selection.action,200);assert.equal(prepared.target.selection.frame,1);assert.deepEqual(prepared.target.selection.marked,[200]);
    assert.strictEqual(await adapter.validate(transaction,prepared),true);await adapter.commit(transaction,prepared);assert.equal(applied.length,1);assert.equal(session.airPath,second.air,'the existing AIR session adopts the exact destination instead of opening another panel');
    await adapter.rollback(transaction,prepared);assert.equal(session.airPath,first.air);assert.equal(applied.length,2);await adapter.rollback(transaction,prepared);assert.equal(applied.length,2,'rollback is idempotent');

    const unavailableTx={from:descriptor(first,'First'),to:{kind:'stage',identity:'stage',ownerFile:path.join(root,'stage.def'),label:'Stage'},fromState:null,toState:null},unavailable=await adapter.prepare(unavailableTx);assert(unavailable.ok&&!unavailable.target.available);await adapter.commit(unavailableTx,unavailable);assert.equal(suspended.length,1);await adapter.rollback(unavailableTx,unavailable);assert.equal(session.airPath,first.air,'rollback restores the exact prior AIR after a truthful unavailable view');

    const race=await adapter.prepare(transaction);fs.writeFileSync(second.air,second.text+'; changed\n');const invalid=await adapter.validate(transaction,race);assert.equal(invalid.ok,false);fs.writeFileSync(second.air,second.text);
    session.sourceMutationBusy=true;const busy=await adapter.prepare(transaction);assert.equal(busy.ok,false);session.sourceMutationBusy=false;

    const dirtyText=second.text.replace('1,2,3','9,8,7'),dirtyDocument={fileName:second.air,isClosed:false,isDirty:true,version:7,getText:()=>dirtyText};
    const dirty=api.prepareAirBinding(transaction.to,{action:200,frame:1},{openDocuments:[dirtyDocument]});assert.equal(dirty.text,dirtyText);assert.equal(fs.readFileSync(second.air,'utf8'),second.text,'retarget preparation retains a dirty open AIR buffer without writing it to disk');
    assert.equal(api.normalizeAirRetainedState(second.text,{action:999,frame:999,marked:[999],anchor:999}).action,200,'stale navigation falls back to an exact destination action');
    console.log('AIR exact entity retarget preparation, retention, validation, unavailable state and rollback passed');
  }finally{fs.rmSync(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
