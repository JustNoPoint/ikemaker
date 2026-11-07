'use strict';
const fs=require('node:fs'),path=require('node:path');
function stageSourceAbsent(filename){try{fs.statSync(filename);return false;}catch(error){if(error.code==='ENOENT')return true;throw error;}}
function showStageSourceRemoved(owner,env){
 if(owner.disposed||!env.current())return false;
 owner.invalidated=true;owner.unavailable=true;owner.sourceRemoved=true;env.detach();
 // Keep the exact filename/panel binding and retained drafts. Opening this same
 // Stage after explicit resource restoration refreshes this panel, not a copy.
 owner.panel.title='Stage · source removed: '+path.basename(owner.filename);
 const html=(env.html||require('./entity_unavailable_view').entityUnavailableHtml)({surface:'stage.workspace',label:'Stage source removed',reason:path.basename(owner.filename)+' was removed, for example by native resource Undo. Editing is disabled. Restore the file with native Undo/Redo or another explicit action, then reopen this Stage. IKEMaker has not recreated or saved any files.'});
 owner.panel.webview.html=env.protect?env.protect(html):require('./webview_policy').protect(html,owner.panel.webview.cspSource);return true;
}
module.exports={stageSourceAbsent,showStageSourceRemoved};
