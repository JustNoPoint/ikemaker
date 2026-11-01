'use strict';

const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),Module=require('module');
const original=Module._load;Module._load=function(request,parent,main){if(request==='vscode')return{Uri:{file:filename=>({fsPath:filename,toString:()=>`file://${filename}`})},workspace:{getConfiguration:()=>({get:(_key,fallback)=>fallback})}};return original.call(this,request,parent,main)};
try{
  const api=require('../src/stage_workspace'),root=fs.mkdtempSync(path.join(os.tmpdir(),'stage-layer-client-')),filename=path.join(root,'stage.def');
  try{
    fs.writeFileSync(filename,'[Info]\nname=Layers\n[Camera]\nstartx=0\n[StageInfo]\nzoffset=200\n[BGDef]\n[BG A]\ntype=normal\nspriteno=0,0\n[BG B]\ntype=normal\nspriteno=0,1\n');
    const payload=api.stagePayload(filename),html=api.stageHtml(payload);
    assert(html.includes('application/x-ikemaker-stage-backgrounds'),'Stage rows expose an internal-only drag payload');
    assert(html.includes("post('stageBackgroundDrop'"),'drop routes through the strict Stage host message');
    assert(html.includes("item.layer!==layer||!visible[layer]||item.hidden"),'per-background preview visibility actually gates rendering');
    assert(html.includes("locked.has(index)?'🔒':'🔓'"),'rows expose an explicit editor-local movement lock');
    assert(html.includes("filter(index=>!locked.has(index))"),'locked backgrounds cannot be dragged on the canvas or source stack');
    assert(html.includes('sourceHash:data.sourceHash,previewHidden:'),'preview visibility and editor locks persist only as source-hash-bound view state');
    assert(html.includes("'Hide')+' in preview (H)'"));assert(html.includes("'Unlock':'Lock')+' editor movement (L)'"),'right-click documents and controls both local layer states');
    assert(html.includes("event.key==='h'||event.key==='H'")&&html.includes("event.key==='l'||event.key==='L'"),'keyboard layer shortcuts match the right-click notes');
    assert(api.validStageMessage({type:'stageBackgroundDrop',generation:2,binding:'b',sourceRowIds:['a'],targetRowId:'z',placement:'after'},2));
    assert(!api.validStageMessage({type:'stageBackgroundDrop',generation:2,binding:'b',sourceRowIds:['a'],targetRowId:'z',placement:'replace'},2));
    console.log('Stage preview visibility, editor locks, internal drag payload and strict drop message passed');
  }finally{fs.rmSync(root,{recursive:true,force:true});}
}finally{Module._load=original;}
