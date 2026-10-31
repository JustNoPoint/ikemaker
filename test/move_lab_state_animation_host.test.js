'use strict';

const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const source=fs.readFileSync(path.join(__dirname,'../src/move_constants_workspace.js'),'utf8'),body=source.slice(source.indexOf('async function openStateAnimationRoute('),source.indexOf('async function openProjectileResourceRoute('));

async function scenario({route='a'.repeat(48),active=true,current=true,snapshots=3,openHash='air-hash'}={}){
 const warnings=[],calls=[],record={kind:'state-animation',authority:{route,generation:5}},owner={disposed:false,panel:{active},projectileGeneration:5,projectileRoutes:new Map([[route,record]]),projectileConsumedRoutes:new Set()};let nowCurrent=current;
 const authority={route,generation:5,defPath:'Hero.def',defHash:'def-hash',airPath:'Hero.air',airHash:'air-hash',action:200,line:4,actionHash:'action-hash',componentIdentity:'state-site',sourcePath:'states.cns',sourceHash:'source-hash',startLine:10,endLine:14,rangeHash:'range-hash',syntax:'cns',stateSignature:'200',fieldLine:12,fieldStart:0,expression:'200'},queue=Array.from({length:snapshots},()=>({authority}));
 const sandbox={session:owner,hash:value=>value==='air'?'air-hash':'changed',identity:value=>String(value).toLowerCase(),stateAnimationTargetOrigin:value=>({schema:'ikemaker.state-default-animation-authority',version:1,filename:value.sourcePath,sourceHash:value.sourceHash,rangeHash:value.rangeHash,startLine:value.startLine,endLine:value.endLine,action:value.action}),currentStateAnimationRoute:(_owner,_record,options={})=>options.requireActive&&(!active||!nowCurrent)?null:queue.shift()||null,vscode:{Uri:{file:fsPath=>({fsPath})},workspace:{openTextDocument:async()=>({fileName:'Hero.air',getText:()=>openHash==='air-hash'?'air':'changed'})},commands:{executeCommand:async(...args)=>{calls.push(args);return'opened';}},window:{showWarningMessage:message=>warnings.push(message)}}};
 vm.runInNewContext(body,sandbox);const result=await sandbox.openStateAnimationRoute(owner,route,{isCurrent:()=>nowCurrent});return{warnings,calls,result,owner,invoke:()=>sandbox.openStateAnimationRoute(owner,route,{isCurrent:()=>nowCurrent}),stop:()=>{nowCurrent=false}};
}
(async()=>{
 const good=await scenario();assert.strictEqual(good.calls.length,1);const options=good.calls[0][2];assert.strictEqual(options.action,200);assert.strictEqual(options.exactAuthority.origin.schema,'ikemaker.state-default-animation-authority');assert(!Object.prototype.hasOwnProperty.call(options,'route'));assert(good.owner.projectileConsumedRoutes.has('a'.repeat(48))&&!good.owner.projectileRoutes.has('a'.repeat(48)),'the opaque route is consumed before the first await');
 for(const options of [{route:'short'},{active:false},{current:false},{snapshots:0},{openHash:'changed'}]){const denied=await scenario(options);assert.strictEqual(denied.calls.length,0,'forged, inactive, stale, or AIR-drifted routes cannot dispatch');}
 const replay=await scenario();const before=replay.calls.length;await replay.invoke();assert.strictEqual(replay.calls.length,before,'a StateDef AIR route cannot replay');
 console.log('Move Lab consumes exact StateDef animation routes once and revalidates before AIR dispatch');
})().catch(error=>{console.error(error);process.exitCode=1;});
