'use strict';

const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const source=fs.readFileSync(path.join(__dirname,'../src/move_constants_workspace.js'),'utf8'),body=source.slice(source.indexOf('async function openProjectileAirRoute('),source.indexOf('async function handle('));

async function scenario({route='a'.repeat(48),active=true,snapshots=3,openHash='air-hash'}={}){
 const warnings=[],calls=[],record={authority:{route}};
 const owner={disposed:false,panel:{active},projectileGeneration:1,projectileRoutes:new Map([[route,record]]),projectileConsumedRoutes:new Set()};
 const snapshot={authority:{defPath:'Hero.def',defHash:'def-hash',airPath:'Hero.air',airHash:'air-hash',action:600,line:4,actionHash:'action-hash',componentIdentity:'projectile-site',sourcePath:'states.cns',sourceHash:'source-hash',startLine:10,endLine:15,rangeHash:'range-hash'}},queue=Array.from({length:snapshots},()=>snapshot);
 let nowActive=active;const sandbox={session:owner,hash:value=>value==='air'?'air-hash':'changed',Object,currentProjectileRoute:(_owner,_record,options={})=>options.requireActive&&!nowActive?null:queue.shift()||null,vscode:{Uri:{file:fsPath=>({fsPath})},workspace:{openTextDocument:async()=>{if(active==='during')nowActive=false;return{getText:()=>openHash==='air-hash'?'air':'changed'}}},commands:{executeCommand:async(...args)=>{calls.push(args);return'opened';}},window:{showWarningMessage:message=>warnings.push(message)}}};
 vm.runInNewContext(body,sandbox);const result=await sandbox.openProjectileAirRoute(owner,route);return{warnings,calls,result,owner,invoke:()=>sandbox.openProjectileAirRoute(owner,route)};
}

(async()=>{
 const good=await scenario();assert.strictEqual(good.calls.length,1);const options=good.calls[0][2];assert.strictEqual(options.action,600);assert.strictEqual(options.exactAuthority.schema,'ikemaker.air-action-authority');assert.strictEqual(options.exactAuthority.origin.schema,'ikemaker.related-source-authority');assert.strictEqual(options.exactAuthority.origin.identity,'projectile-site','generic exact related-source evidence reaches the AIR owner without exposing the route');assert(!Object.prototype.hasOwnProperty.call(options,'route'),'the opaque host route is not forwarded as target identity');assert(good.owner.projectileConsumedRoutes.has('a'.repeat(48))&&!good.owner.projectileRoutes.has('a'.repeat(48)),'route is consumed before the first await');
 const forged=await scenario({route:'short'});assert.strictEqual(forged.calls.length,0);
 const inactive=await scenario({active:false});assert.strictEqual(inactive.calls.length,0,'an inactive origin panel cannot dispatch exact navigation');
 const inactiveDuring=await scenario({active:'during'});assert.strictEqual(inactiveDuring.calls.length,0,'origin activity is rechecked immediately before target dispatch');
 const staleOpen=await scenario({openHash:'changed'});assert.strictEqual(staleOpen.calls.length,0,'AIR drift during openTextDocument fails before target dispatch');
 const staleAfter=await scenario({snapshots:2});assert.strictEqual(staleAfter.calls.length,1);assert(staleAfter.warnings.some(message=>/changed during AIR navigation/.test(message)),'post-await source/assignment drift is reported');
 const replay=await scenario();const before=replay.calls.length;await replay.invoke();assert.strictEqual(replay.calls.length,before,'a consumed route cannot replay');
 console.log('Move Lab Projectile AIR host consumes opaque routes, rejects inactive/stale requests, and forwards exact target authority');
})().catch(error=>{console.error(error);process.exitCode=1;});
