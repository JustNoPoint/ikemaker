const assert=require('assert'),fs=require('fs'),path=require('path'),os=require('os'),Module=require('module');
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'preset-identity-')),file=path.join(folder,'hero.def'),sprite=path.join(folder,'hero.sff');fs.writeFileSync(file,'');fs.writeFileSync(sprite,'');
const original=Module._load,handlers={},reveals=[];let saved,failActive=false;
const api={Uri:{file:fsPath=>({fsPath,scheme:'file'})},commands:{registerCommand:(id,fn)=>{handlers[id]=fn;return{};}},workspace:{workspaceFolders:[{uri:{fsPath:folder}}]},window:{tabGroups:{all:[{viewColumn:1,tabs:[{input:{uri:{fsPath:sprite,scheme:'file'},viewType:'ikemen.sffWorkspace'}}]}]},showQuickPick:async items=>items[0],showInformationMessage(){}}};
const sessions={COMMANDS:{character_health:'health',sff:'sff'},HISTORY_KINDS:{character_health:'health',sff:'sff'},capture:async()=>[
 {file:sprite,kind:'sff',group:1,reference:{group:2}},
 {file,kind:'character_health',group:1,reference:{profile:'ikemen-1.0'}},
 {file,kind:'character_health',group:1,active:true,reference:{profile:'conservative-custom'}}
]};
Module._load=function(name,parent,main){if(name==='vscode')return api;if(name==='./viewer_sessions')return sessions;if(name==='./viewer_navigation')return{openPresetPoint:async(point,column,onRestored)=>{if(failActive&&point.reference?.profile==='conservative-custom')return false;onRestored({reveal:(group,focus)=>reveals.push({profile:point.reference?.profile,group,focus})});return true;}};return original.call(this,name,parent,main);};
(async()=>{const presets=require('../src/workspace_presets');saved=await presets.capture('Two profiles');assert.equal(saved.files.length,3,'native custom editor deduplicates while both ordinary views survive');assert.deepEqual(saved.files.filter(x=>x.kind==='character_health').map(x=>x.reference.profile),['ikemen-1.0','conservative-custom']);assert.equal(saved.files[0].reference.group,2);
 presets.registerWorkspacePresets({subscriptions:[],workspaceState:{get:()=>({presets:[saved]})}});
 await handlers['ikemen.workspacePreset.restore']();assert.deepEqual(reveals,[{profile:'conservative-custom',group:1,focus:false}],'focus targets the exact restored panel');
 reveals.length=0;failActive=true;await handlers['ikemen.workspacePreset.restore']();assert.deepEqual(reveals,[],'failure of active view must not focus another view of same file');
 console.log('Preset capture preserves same-file views and restore focuses only the successfully restored active panel');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{Module._load=original;fs.rmSync(folder,{recursive:true,force:true});});
