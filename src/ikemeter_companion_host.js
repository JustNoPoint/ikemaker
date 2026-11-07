'use strict';
const path=require('node:path'),http=require('node:http');
const ACTIONS=new Set(['connect','pause','step','resume','disconnect','restart']);
function validAuthority(value){return value&&Object.getPrototypeOf(value)===Object.prototype&&Object.keys(value).sort().join(',')==='continuityRevision,epoch,sessionId'&&typeof value.sessionId==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(value.sessionId)&&Number.isSafeInteger(value.epoch)&&value.epoch>0&&Number.isSafeInteger(value.continuityRevision)&&value.continuityRevision>=0;}
function validRequest(message){
  if(!message||Object.getPrototypeOf(message)!==Object.prototype)return false;
  const keys=Object.keys(message).sort().join(',');
  if(keys!=='id,method,path,type'&&keys!=='authority,id,method,path,type')return false;
  if('authority' in message&&(!validAuthority(message.authority)||message.method!=='POST'||message.path==='/api/connect'))return false;
  return message.type==='ikemeterRequest'&&Number.isSafeInteger(message.id)&&message.id>0&&typeof message.path==='string'&&typeof message.method==='string'&&(
    message.method==='GET'&&['/api/status','/api/history'].includes(message.path)||
    message.method==='POST'&&message.path.startsWith('/api/')&&ACTIONS.has(message.path.slice(5))
  );
}
function deferredDriver(root,runtime,services={}){
  const {AttachedNightlyDriver}=services.driverModule||require(path.join(root,'src/attached_nightly_driver'));
  const {acquireRuntimeLease}=services.recoveryModule||require(path.join(root,'src/recover_sessions'));
  const driver=new AttachedNightlyDriver({root,runtime,powershell:services.powershell});let lease=null;
  return {
    async connect(){const acquired=!lease;if(acquired)lease=acquireRuntimeLease(runtime);try{return await driver.connect();}catch(error){if(acquired){lease.release();lease=null;}throw error;}},
    processStatus:(...args)=>driver.processStatus?.(...args),command:(...args)=>driver.command(...args),sample:(...args)=>driver.sample(...args),
    startSampling:(...args)=>driver.startSampling(...args),revoke:(...args)=>driver.revoke(...args),
    observeWindow:(...args)=>driver.observeWindow?.(...args),beginWindowSuspension:(...args)=>driver.beginWindowSuspension(...args),
    freshWindowOfferFloor:(...args)=>driver.freshWindowOfferFloor(...args),completeWindowSuspension:(...args)=>driver.completeWindowSuspension(...args),
    canRestartOwnedGame:(...args)=>driver.canRestartOwnedGame?.(...args),restartOwnedGame:(...args)=>driver.restartOwnedGame(...args),
    disconnect:(...args)=>driver.disconnect(...args),
    async shutdown(){try{await driver.shutdown();}finally{if(lease){lease.release();lease=null;}}}
  };
}
function proxy(origin,message){return new Promise(resolve=>{
  const headers=message.method==='POST'?{Origin:origin,'Content-Type':'application/json','X-IKeMeter-Action':'1'}:{};
  if(message.authority){headers['X-IKeMeter-Session']=message.authority.sessionId;headers['X-IKeMeter-Epoch']=String(message.authority.epoch);headers['X-IKeMeter-Continuity']=String(message.authority.continuityRevision);}
  const request=http.request(origin+message.path,{method:message.method,headers},response=>{let text='';response.setEncoding('utf8');response.on('data',chunk=>{text+=chunk;if(Buffer.byteLength(text)>4*1024*1024)request.destroy(new Error('Meter response exceeded its bound'));});response.once('end',()=>{try{resolve({status:response.statusCode,body:JSON.parse(text)});}catch{resolve({status:502,body:{error:'Invalid Meter response'}});}});});
  request.setTimeout(18000,()=>request.destroy(new Error('Meter request timed out')));request.once('error',error=>resolve({status:503,body:{error:error.message}}));if(message.method==='POST')request.write('{}');request.end();
});}
async function run(root,runtime,powershell){
  if(!process.send)throw new Error('IKeMeter integrated host requires its owning extension IPC channel');
  const {SessionController}=require(path.join(root,'src/session_controller')),{createAppServer}=require(path.join(root,'src/app_server'));
  const controller=new SessionController(deferredDriver(root,runtime,{powershell})),server=createAppServer({controller});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const origin='http://127.0.0.1:'+server.address().port;let stopping=false;let pending=0;
  async function stop(){if(stopping)return;stopping=true;try{await controller.shutdown();}catch(error){process.stderr.write(error.message+'\n');}finally{server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),5000).unref();}}
  process.on('message',async message=>{if(message?.type==='ikemeterShutdown'&&Object.keys(message).length===1){await stop();return;}if(stopping||!validRequest(message))return;if(pending>=16){process.send?.({type:'ikemeterResponse',id:message.id,status:429,body:{error:'Meter requests are busy'}});return;}pending++;try{const response=await proxy(origin,message);if(process.connected)process.send({type:'ikemeterResponse',id:message.id,...response});}finally{pending--;}});
  process.once('disconnect',stop);process.once('SIGINT',stop);process.once('SIGTERM',stop);
  process.send({type:'ikemeterReady'});
}
module.exports={validRequest,deferredDriver,run};
if(require.main===module){if(process.argv.length!==5){process.stderr.write('Expected trusted Meter package, runtime and PowerShell 7 paths.\n');process.exitCode=1;}else run(path.resolve(process.argv[2]),path.resolve(process.argv[3]),path.resolve(process.argv[4])).catch(error=>{process.stderr.write(error.message+'\n');process.exitCode=1;});}
