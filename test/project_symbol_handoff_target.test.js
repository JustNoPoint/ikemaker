'use strict';

const assert = require('assert');
const Module = require('module');
const originalLoad = Module._load;
Module._load=function(request,parent,main){if(request==='vscode')return{};return originalLoad.call(this,request,parent,main);};
const library=require('../src/authoring_library');
Module._load=originalLoad;

const authority={schema:'ikemaker.project-symbol-handoff',version:1,defPath:'C:/Game/Hero/Hero.def',category:'maps',name:'Game.Mode'};

(async()=>{
 const order=[],target={defPath:authority.defPath,entry:{id:'maps\0game.mode'}},panel={ikemenSymbolModel:{entries:[{category:'maps',name:'Game.Mode'}]}};let reads=0;
 const result=await library.adoptProjectSymbolAuthority(authority,{beforeOpen:()=>order.push('before'),afterOpen:()=>order.push('after'),targetContext:async()=>{order.push('target');reads++;return target;},uriFile:fsPath=>({fsPath}),openWorkspace:async(seed,query)=>{order.push('open');assert.strictEqual(seed.fsPath,authority.defPath);assert.strictEqual(query,'Maps Game.Mode');return panel;}});
 assert.deepStrictEqual(order,['before','target','after','target','open']);assert.strictEqual(reads,2);assert.strictEqual(result.focused,true);
 let opened=false;await assert.rejects(()=>library.adoptProjectSymbolAuthority(authority,{beforeOpen(){},afterOpen(){},targetContext:async()=>null,uriFile:fsPath=>({fsPath}),openWorkspace:async()=>{opened=true;return panel;}}),/changed before adoption/);assert.strictEqual(opened,false,'a stale target leaves the existing Project Symbols state untouched');
 await assert.rejects(()=>library.adoptProjectSymbolAuthority(authority,{beforeOpen(){},afterOpen(){},targetContext:async()=>target,uriFile:fsPath=>({fsPath}),openWorkspace:async()=>({ikemenSymbolModel:{entries:[{category:'constants',name:'Game.Mode'}]}})}),/one exact catalog item/,'same spelling in another category cannot satisfy adoption');
 console.log('Project Symbols host adoption revalidates before focus and acknowledges one exact category/item');
})().catch(error=>{console.error(error);process.exitCode=1;});
