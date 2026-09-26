'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const source=fs.readFileSync(path.join(__dirname,'../src/hitdef_workspace.js'),'utf8');
const functions=source.slice(source.indexOf('async function resolveEditor()'),source.indexOf('async function openStateDefinition('));
let release;const uri={toString:()=>'/old'},document={uri,positionAt:x=>x};const env={session:{uri,offset:12,panel:{webview:{postMessage(){throw Error('Stale refresh reached the panel');}}}},eligible:()=>false,vscode:{window:{visibleTextEditors:[]},workspace:{openTextDocument:()=>new Promise(resolve=>{release=()=>resolve(document);})}}};vm.createContext(env);vm.runInContext(functions,env);
(async()=>{
 const first=env.resolveEditor();env.session=null;release();assert.equal(await first,null,'closing during resolution is safe');
 env.session={uri,offset:12};const second=env.resolveEditor();env.session.uri={toString:()=>'/new'};release();assert.equal(await second,null,'rebound source cannot borrow old resolved document');
 env.session={uri,offset:12};const third=env.refresh();env.session={uri:{toString:()=>'/new'}};release();await third;
 console.log('HitDef delayed source resolution and refresh reject closed or rebound sessions');
})().catch(error=>{console.error(error);process.exitCode=1;});
