'use strict';

const maxBodyBytes=8192;

async function readJson(request){
  if(!/^application\/json(?:;|$)/i.test(request.headers['content-type']||''))throw Error('JSON input required');
  if(Number(request.headers['content-length'])>maxBodyBytes)throw Error('Watch request is too large');
  const parts=[];
  let size=0;
  for await(const chunk of request.iterator({destroyOnReturn:false})){
    size+=chunk.length;
    if(size>maxBodyBytes)throw Error('Watch request is too large');
    parts.push(chunk);
  }
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts)));
}

function match(log,params){
  if(!log.session||params.get('session')!==log.session.sessionId||params.get('epoch')!==String(log.session.epoch)){
    throw Error('The watch session changed');
  }
}

function createWatchRoute(sendJson){
  let exporting=false;
  return async(request,response,expectedHost,controller)=>{
    response.setHeader('Cache-Control','no-store');
    try{
      const {pathname,searchParams}=new URL(request.url,'http://localhost');
      if(pathname==='/api/watch'&&request.method==='GET'){
        sendJson(response,200,controller.watchView());
        return;
      }
      if(request.method!=='POST'||request.headers.origin!=='http://'+expectedHost||
         request.headers['x-ikemeter-action']!=='1'){
        sendJson(response,403,{error:'Local watch action required'});
        return;
      }
      const log=controller.watchLog;
      if(pathname==='/api/watch/config'){
        const body=await readJson(request);
        sendJson(response,200,controller.configureWatches(body));
      }else if(pathname==='/api/watch/retention'){
        const seconds=await readJson(request);
        if(log.session)match(log,searchParams);
        log.setSeconds(seconds);
        sendJson(response,200,controller.watchView());
      }else if(pathname==='/api/watch/export'){
        match(log,searchParams);
        if(exporting)throw Error('A watch export is already in progress');
        const body=log.export();
        exporting=true;
        const release=()=>{exporting=false;response.off('finish',release);response.off('close',release);};
        response.once('finish',release);
        response.once('close',release);
        response.setTimeout(15000,()=>response.destroy());
        response.setHeader('Content-Disposition','attachment; filename="ikemeter-watch-log.json"');
        sendJson(response,200,body);
      }else sendJson(response,404,{error:'Unknown watch action'});
    }catch(error){
      if(!response.headersSent&&!response.destroyed)sendJson(response,409,{error:error.message});
      else response.destroy();
    }
  };
}
module.exports={createWatchRoute};
