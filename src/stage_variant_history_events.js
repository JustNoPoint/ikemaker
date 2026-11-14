'use strict';
const path=require('node:path');
// Native resource Undo/Redo can leave an unchanged parent text (unbound
// variants). Recheck only histories that own a resource named by the event.
function registerStageVariantHistoryEvents(api,env){
 const disposables=[],key=file=>path.resolve(file).toLowerCase();
 const changed=files=>{const names=new Set(files.filter(Boolean).map(file=>key(file.fsPath||file.fileName||file)));for(const owner of env.owners()){
  if(owner.disposed||owner.busy||owner.history?.replaying)continue;
  if([...owner.history?.undoStack||[],...owner.history?.redoStack||[]].some(entry=>entry.resource?.destination&&names.has(key(entry.resource.destination))))env.publish(owner);
 }};
 for(const method of ['onDidCreateFiles','onDidDeleteFiles'])if(typeof api.workspace[method]==='function')disposables.push(api.workspace[method](event=>changed(event.files||[])));
 if(typeof api.workspace.onDidRenameFiles==='function')disposables.push(api.workspace.onDidRenameFiles(event=>changed((event.files||[]).flatMap(file=>[file.oldUri,file.newUri]))));
 if(typeof api.workspace.onDidSaveTextDocument==='function')disposables.push(api.workspace.onDidSaveTextDocument(document=>changed([document.uri])));
 return {dispose(){for(const disposable of disposables)disposable.dispose();}};
}
module.exports={registerStageVariantHistoryEvents};
