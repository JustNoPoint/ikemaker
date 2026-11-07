'use strict';
const {performance}=require('node:perf_hooks');
function createWindowStateReader(pid,onState,onFailure,clock=()=>performance.now(),nativeNow=()=>Number(process.hrtime.bigint())/1e6){
 let previous=null,failed=false,buffer='';
 const fail=()=>{if(!failed){failed=true;onFailure(new Error('Owned window observation is unavailable or inconsistent'));}};
 function accept(value){
  const keys=['observedAtMs','version','sequence','processId','processStarted','threadId','hwnd','moving','moveSizeHwnd','visible','minimized'];
  if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).sort().join('|')!==keys.sort().join('|')||!Number.isFinite(value.observedAtMs)||value.observedAtMs<=0||previous&&value.observedAtMs<previous.observedAtMs||value.version!==1||value.processId!==pid||!Number.isSafeInteger(value.sequence)||value.sequence!==(previous?previous.sequence+1:1)||!Number.isSafeInteger(value.threadId)||value.threadId<=0||!/^\d{1,20}$/.test(value.processStarted)||!/^[1-9]\d{0,19}$/.test(value.hwnd)||!/^\d{1,20}$/.test(value.moveSizeHwnd)||typeof value.moving!=='boolean'||typeof value.visible!=='boolean'||typeof value.minimized!=='boolean'||(!previous&&value.moving)||previous&&['processStarted','threadId','hwnd'].some(key=>value[key]!==previous[key])||value.moving&&(!value.visible||value.minimized||value.moveSizeHwnd!==value.hwnd))throw Error('Invalid native state');
  const age=nativeNow()-value.observedAtMs;if(!Number.isFinite(age)||age< -2||age>500)throw Error('Native observation is stale');
  previous=value;onState({...value,receivedAt:clock()-Math.max(0,age)});
 }
 return{push(chunk){if(failed)return;buffer+=String(chunk).replace(/^\uFEFF/,'');if(buffer.length>16384)return fail();let index;while((index=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,index).trim();buffer=buffer.slice(index+1);if(!line)continue;try{accept(JSON.parse(line));}catch{return fail();}}},fail};
}
function isRetiredModalAccept(result,proof){
 const keys=['bounded','bytes','error','payload','acceptCompleted','listenerRetired','retiredWhileOwnedModal','nativeWindow'];
 if(!result||Object.getPrototypeOf(result)!==Object.prototype||Object.keys(result).sort().join('|')!==keys.sort().join('|')||result.bounded!==false||result.bytes!==0||result.error!=='accept-deadline-exceeded'||result.payload!==''||result.acceptCompleted!==false||result.listenerRetired!==true||result.retiredWhileOwnedModal!==true||!proof)return false;
 const value=result.nativeWindow,names=['processId','processStarted','threadId','hwnd'];return value&&Object.getPrototypeOf(value)===Object.prototype&&Object.keys(value).sort().join('|')===names.sort().join('|')&&names.every(key=>value[key]===proof[key]);
}
module.exports={createWindowStateReader,isRetiredModalAccept};
