'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const source=fs.readFileSync(path.join(__dirname,'../src/move_constants_workspace.js'),'utf8'),body=source.slice(source.indexOf('async function openProjectSymbolRoute('),source.indexOf('function validProjectileEditValues('));

async function scenario({route='a'.repeat(48),active=true,current=true,disposed=false,generation=7,snapshots=3,failBefore=false,failAfter=false}={}){
 const warnings=[],authority={route,generation:7,category:'maps',name:'Game.Mode'},record={kind:'project-symbol',authority},owner={disposed,panel:{active},projectileGeneration:generation,projectileRoutes:new Map([[route,record]]),projectileConsumedRoutes:new Set()};let valid=true,calls=0;const queue=Array.from({length:snapshots},()=>({authority}));
 const sandbox={currentProjectSymbolRoute:()=>valid?(queue.shift()||null):null,vscode:{window:{showWarningMessage:message=>warnings.push(message)}},require};vm.runInNewContext(body,sandbox);
 const adoptProjectSymbol=async(_authority,hooks)=>{calls++;hooks.beforeOpen();if(failBefore)valid=false;if(failAfter)valid=false;hooks.afterOpen();return{focused:true};};
 const result=await sandbox.openProjectSymbolRoute(owner,route,{isCurrent:()=>current,adoptProjectSymbol});return{result,warnings,owner,calls,invoke:()=>sandbox.openProjectSymbolRoute(owner,route,{isCurrent:()=>current,adoptProjectSymbol})};
}

(async()=>{
 const good=await scenario();assert.strictEqual(good.result.focused,true);assert.strictEqual(good.calls,1);await good.invoke();assert.strictEqual(good.calls,1,'one-use Project Symbols route cannot replay');
 for(const options of [{active:false},{current:false},{disposed:true},{generation:8},{route:'short'},{snapshots:0},{failBefore:true},{failAfter:true}]){const denied=await scenario(options);assert.strictEqual(denied.result?.focused,undefined,'inactive, forged, stale, or raced symbol authority never focuses the target');}
 console.log('Move Lab consumes Project Symbols routes once and revalidates around target adoption');
})().catch(error=>{console.error(error);process.exitCode=1;});
