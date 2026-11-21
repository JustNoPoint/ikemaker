'use strict';
const {TextDecoder}=require('node:util');
const maxLineBytes=32768;

function openSampleCreditRelay(child,signal,timeoutMs=12000) {
  let resolveReady,rejectReady,pending,failed=null,started=false,length=0;
  const ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
  const line=Buffer.allocUnsafe(maxLineBytes);
  const decoder=new TextDecoder('utf-8',{fatal:true});
  const startupTimer=setTimeout(()=>fail('sample relay startup expired'),timeoutMs);
  function fail(message) {
    if(failed)return;
    failed=Object.assign(Error(message),{relayFatal:true});
    clearTimeout(startupTimer);
    if(!started)rejectReady(failed);
    if(pending){clearTimeout(pending.timer);pending.reject(failed);pending=null;}
  }
  function receive(buffer) {
    if(failed)return;
    try{
      const message=JSON.parse(decoder.decode(buffer));
      if(!started){
        if(message.type!=='ready')throw Error('sample relay did not authenticate startup');
        started=true;clearTimeout(startupTimer);resolveReady();return;
      }
      if(!pending||message.sequence!==pending.sequence)throw Error('sample relay returned an unrelated credit');
      if(message.type==='listening'&&!pending.listening){
        pending.listening=true;pending.onListening();return;
      }
      if(message.type!=='result'||!pending.listening||typeof message.bounded!=='boolean'||
         typeof message.error!=='string'||typeof message.payload!=='string'||!Number.isInteger(message.bytes)||
         (message.bounded?(message.bytes<1||message.bytes>4096||Buffer.byteLength(message.payload)!==message.bytes):
           (message.bytes!==0||message.payload!=='')))throw Error('sample relay returned invalid framing');
      const current=pending;pending=null;clearTimeout(current.timer);current.resolve(message);
    }catch(error){fail(error.message);}
  }
  child.stdout.on('data',chunk=>{
    if(failed)return;
    let offset=0;
    while(offset<chunk.length&&!failed){
      const newline=chunk.indexOf(10,offset),end=newline<0?chunk.length:newline;
      const count=end-offset;
      if(length+count>line.length){fail('sample relay response exceeded its byte limit');return;}
      chunk.copy(line,length,offset,end);length+=count;
      if(newline<0)return;
      receive(line.subarray(0,length));length=0;offset=newline+1;
    }
  });
  child.stdout.once('end',()=>fail('sample relay ended'));
  child.on('error',()=>fail('sample relay process error'));
  child.stdin.on('error',()=>fail('sample relay input closed'));
  const abort=()=>fail('sample relay session retired');
  signal.addEventListener('abort',abort,{once:true});
  if(signal.aborted)abort();
  return {ready,
    request(job,onListening){
      if(failed)return Promise.reject(failed);
      if(!started||pending)return Promise.reject(Error('sample relay already owns an outstanding credit'));
      const text=JSON.stringify(job)+'\n';
      if(Buffer.byteLength(text)>2048)return Promise.reject(Error('sample credit exceeded its byte limit'));
      return new Promise((resolve,reject)=>{
        pending={sequence:job.sequence,onListening,resolve,reject,timer:setTimeout(()=>fail('sample relay credit expired'),timeoutMs)};
        child.stdin.write(text);
      });
    },
    close(){signal.removeEventListener('abort',abort);fail('sample relay closed');child.stdin.end();}
  };
}

module.exports={openSampleCreditRelay};
