'use strict';
// VS Code may not create the auxiliary document until the serializer resolves.
// Do not hold that native barrier while opening documents or awaiting webview IPC.
function deferAirBrowserRestore(panel,state,hydrate,options={}){
 const schedule=options.schedule||setTimeout,trace=options.trace||(()=>{}),ticket={disposed:false,started:false,finished:false};
 const subscription=panel.onDidDispose?.(()=>{ticket.disposed=true;trace('restore.disposed')});
 trace('serializer.enter',{floating:state?.floating===true,section:state?.primaryView||'actions'});
 ticket.start=async()=>{if(ticket.disposed)return;ticket.started=true;trace('hydrate.start');try{await hydrate();ticket.finished=true;trace('hydrate.finished')}catch(error){trace('hydrate.error',{error:error?.message||String(error)});options.onError?.(error)}finally{subscription?.dispose?.()}};
 schedule(()=>{void ticket.start()},0);trace('serializer.return');return ticket;
}
module.exports={deferAirBrowserRestore};
