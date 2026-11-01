'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');

const root=path.join(__dirname,'..'),manifest=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const restoredViewerTypes=['ikemenSffViewer','ikemenSndViewer','ikemenAirWorkspace','ikemenAirDockingExperimental'];
for(const viewType of restoredViewerTypes)assert(manifest.activationEvents.includes(`onWebviewPanel:${viewType}`),`${viewType} restoration must activate IKEMaker before VS Code asks its serializer to restore the viewer`);

const extension=fs.readFileSync(path.join(root,'src','extension.js'),'utf8');
const toolbarRegistration=extension.indexOf('textEditorToolbar.register(vscode, context)');
assert(toolbarRegistration>=0,'the text editor toolbar must be registered during activation');
for(const registration of ['registerSffViewer(context)','registerSndViewer(context)','registerAirViewer(context',"require('./air_docking_workspace').register(context)"]){
  const at=extension.indexOf(registration);
  assert(at>=0,`${registration} must remain part of activation`);
  assert(toolbarRegistration<at,`resumeFromVisualViewer must be registered before ${registration} restores or serves viewer navigation`);
}
console.log('Restored SFF, SND and AIR viewers activate IKEMaker and register text navigation before viewer serializers');
