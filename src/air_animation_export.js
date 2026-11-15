'use strict';
const path=require('path'),fs=require('fs'),crypto=require('crypto');
const {hash,transactionalWrite,optionsFromConfig}=require('./mutation_safety'),{readBoundedStableFile}=require('./air_action_sequence_export');
const model=require('./air_animation_export_model'),codecs=require('./air_animation_codecs');
const TYPES=new Set(['prepareAnimatedAirExport','animatedAirExportFrames','applyAnimatedAirExport','cancelAnimatedAirExport']);
const safeId=value=>Number.isSafeInteger(value)&&value>=1;
const key=value=>path.resolve(value).toLowerCase();
function post(session,message){return session.panel.webview.postMessage(message);}
function currentSources(session,vscode){const document=(vscode.workspace.textDocuments||[]).find(doc=>key(doc.fileName)===key(session.airPath));if(document?.isDirty)throw Error('Save the AIR before exporting so the animation is bound to the exact source file.');const air=readBoundedStableFile(fs,session.airPath,16*1024*1024,'AIR'),sff=readBoundedStableFile(fs,session.sffPath,256*1024*1024,'SFF');const ownerPath=session.defPath?key(session.defPath):null,ownerDocument=ownerPath?(vscode.workspace.textDocuments||[]).find(doc=>key(doc.fileName)===ownerPath):null;if(ownerDocument?.isDirty)throw Error('Save the owning DEF before exporting so its linked assets can be verified.');const ownerHash=ownerPath?hash(readBoundedStableFile(fs,session.defPath,1024*1024,'Owning DEF')):null;return {air,sff,airHash:hash(air),sffHash:hash(sff),version:document?.version??null,ownerPath,ownerHash,ownerVersion:ownerDocument?.version??null};}
function validateSources(session,vscode,authority){if(session.disposed||session.bindingGeneration!==authority.bindingGeneration||key(session.airPath)!==authority.airPath||key(session.sffPath)!==authority.sffPath)throw Error('The AIR export viewer binding changed. Nothing was exported.');const current=currentSources(session,vscode);if(current.airHash!==authority.sources.airHash||current.sffHash!==authority.sources.sffHash||current.version!==authority.sources.version||current.ownerPath!==authority.sources.ownerPath||current.ownerHash!==authority.sources.ownerHash||current.ownerVersion!==authority.sources.ownerVersion)throw Error('AIR, SFF or owning DEF source changed after the preview was prepared. Nothing was exported.');}
function dirtyTarget(vscode,target){return (vscode.workspace.textDocuments||[]).some(doc=>doc.isDirty&&key(doc.fileName)===key(target));}
function targetHash(target){return fs.existsSync(target)?hash(readBoundedStableFile(fs,target,codecs.MAX_BYTES,'Animation destination')):hash(Buffer.alloc(0));}
async function configure(vscode,session,message,context){
  const saved=context?.globalState?.get('ikemen.air.animationExport',{})||{},format=await vscode.window.showQuickPick((saved.format==='gif'?[{label:'Animated GIF',format:'gif'},{label:'Lossless animated WebP',format:'webp'}]:[{label:'Lossless animated WebP',format:'webp'},{label:'Animated GIF',format:'gif'}]),{title:'Animated AIR export format'});if(!format)return null;
  const scale=await vscode.window.showInputBox({title:'Animation export scale',value:String(saved.scale||1),prompt:'Whole scale1–8. The complete animation uses one fixed canvas.',validateInput:value=>Number.isSafeInteger(Number(value))&&Number(value)>=1&&Number(value)<=8?undefined:'Enter a whole scale from1 to8.'});if(scale===undefined)return null;
  const backgrounds=[{label:'Transparent background',background:null},{label:'Current proof background',background:/^#[0-9a-f]{6}$/i.test(message.background||'')?message.background:'#132033'}],background=await vscode.window.showQuickPick(backgrounds,{title:'Animation export background'});if(!background)return null;
  const boxes=await vscode.window.showQuickPick([{label:'No collision overlay',boxKinds:[]},{label:'Clsn1 attack boxes',boxKinds:['clsn1']},{label:'Clsn2 hurt/contact boxes',boxKinds:['clsn2']},{label:'Both collision kinds',boxKinds:['clsn1','clsn2']}],{title:'Authored AIR collision overlay'});if(!boxes)return null;
  return {format:format.format,scale:Number(scale),background:background.background,boxKinds:boxes.boxKinds,holdTicks:Number(saved.holdTicks)||60};
}
async function handle(env){const {session,message,vscode,context}=env,type=message.type;
  if(type==='cancelAnimatedAirExport'){if(session.animatedExportRequestId===message.requestId){session.animatedExport=null;session.animatedExportEpoch=(session.animatedExportEpoch||0)+1;}return;}
  if(type==='prepareAnimatedAirExport'){
    if(!safeId(message.requestId)||!Number.isSafeInteger(message.action)||session.sourceKind==='stage'||!session.sffPath)throw Error('Choose an authored standalone AIR action with an exact connected SFF.');
    const epoch=(session.animatedExportEpoch||0)+1;session.animatedExportEpoch=epoch;session.animatedExportRequestId=message.requestId;session.animatedExport=null;
    const cancel=()=>post(session,{type:'animatedAirExportCancelled',requestId:message.requestId});
    let settings=await configure(vscode,session,message,context);if(!settings)return cancel();
    const sources=currentSources(session,vscode),text=sources.air.toString('utf8').replace(/^\uFEFF/,'');if(require('./air_batch_scope').sourceFingerprint(text)!==message.sourceFingerprint)throw Error('The visible AIR source changed. Reopen animated export.');
    const matches=require('./air_preview_model').parseAir(text).filter(action=>action.number===message.action);if(matches.length!==1)throw Error('The export action is missing or duplicated.');
    if(matches[0].frames.at(-1)?.rawTime===-1){const hold=await vscode.window.showInputBox({title:'Finite final hold for animation export',value:String(settings.holdTicks),prompt:'The infinite final element is exported for this many60Hz ticks (1–3600).',validateInput:value=>Number.isSafeInteger(Number(value))&&Number(value)>=1&&Number(value)<=3600?undefined:'Enter1–3600ticks.'});if(hold===undefined)return cancel();settings={...settings,holdTicks:Number(hold)};}
    const archive=require('./sff_reader').parseSffBuffer(sources.sff,session.sffPath),plan=model.plan(matches[0],archive,{...settings,palettes:message.palettes});
    const uri=await vscode.window.showSaveDialog({title:'Choose animated AIR export destination',defaultUri:vscode.Uri.file(path.join(path.dirname(session.airPath),path.parse(session.airPath).name+'_action_'+message.action+'.'+settings.format)),filters:settings.format==='gif'?{GIF:['gif']}:{WebP:['webp']}});if(!uri)return cancel();const target=path.resolve(uri.fsPath);
    if(path.extname(target).toLowerCase()!=='.'+settings.format||[session.airPath,session.sffPath,...(session.sourcePaths||[]),session.defPath].filter(Boolean).some(filename=>key(filename)===key(target)))throw Error('Choose a separate destination with the reviewed GIF/WebP extension.');if(dirtyTarget(vscode,target))throw Error('The animation destination has unsaved text edits. Choose a different file.');
    const authority={token:crypto.randomBytes(24).toString('hex'),requestId:message.requestId,epoch,airPath:key(session.airPath),sffPath:key(session.sffPath),bindingGeneration:session.bindingGeneration,sources,plan,target,expectedHash:targetHash(target),existing:fs.existsSync(target),candidate:null,settings};validateSources(session,vscode,authority);
    if(session.animatedExportEpoch!==epoch||session.disposed)return cancel();session.animatedExport=authority;await post(session,{type:'animatedAirExportRender',requestId:authority.requestId,token:authority.token,plan});return;
  }
  const authority=session.animatedExport;if(!authority||authority.token!==message.token||authority.requestId!==message.requestId||authority.epoch!==session.animatedExportEpoch)throw Error('The animated export preview is stale or no longer belongs to this viewer.');
  validateSources(session,vscode,authority);
  if(type==='animatedAirExportFrames'){
    if(authority.candidate||!Array.isArray(message.frames)||message.frames.length!==authority.plan.runs.length)throw Error('Animation rendering does not match the reviewed run count.');
    let totalBytes=0;const decode=require('./palette_index_organizer_model').decodePng,frames=message.frames.map((dataUri,index)=>{if(typeof dataUri!=='string'||dataUri.length>90*1024*1024||!/^data:image\/png;base64,[A-Za-z0-9+/]*={0,2}$/.test(dataUri))throw Error('Animation renderer returned an invalid PNG frame.');const bytes=Buffer.from(dataUri.slice(dataUri.indexOf(',')+1),'base64');totalBytes+=bytes.length;if(totalBytes>128*1024*1024)throw Error('Rendered animation frames exceed128MB.');const decoded=decode(bytes,{maximumPixels:16000000,maximumDimension:4096});if(decoded.width!==authority.plan.width||decoded.height!==authority.plan.height)throw Error('Animation rendering dimensions changed.');return {rgba:decoded.rgba,delay:authority.plan.runs[index].delay};});
    const encoded=authority.settings.format==='gif'?codecs.gif(authority.plan.width,authority.plan.height,frames):{buffer:codecs.webp(authority.plan.width,authority.plan.height,frames),quantized:false};authority.candidate=encoded.buffer;
    const {plan,settings}=authority;
    const timing=Math.round(plan.ticks*1000/60);
    const colorSummary=settings.format==='webp'?'Lossless RGBA WebP.':
      (encoded.quantized?`Reduced colors in ${encoded.quantizedFrames} frame palette(s).`:'Frame palettes preserve up to 255 opaque colors.')+' GIF alpha below 128 becomes transparent.';
    const details=[
      `Action ${plan.action} · ${plan.width}×${plan.height} · ${frames.length} rendered frames · ${plan.ticks} ticks · ${plan.durationMilliseconds} ms`,
      `${encoded.buffer.length.toLocaleString('en-US')} bytes`,
      colorSummary,
      settings.format==='gif'&&plan.durationMilliseconds!==timing?`The AIR lasts ${timing} ms. GIF timing rounds each displayed frame to at least 20 ms. Choose WebP for closer timing.`:'',
      'The exported image repeats from the first frame after one pass through the action.',
      authority.existing?'Save replaces the existing animation file.':'Save creates a new animation file.',
      authority.target
    ].filter(Boolean);
    await post(session,{type:'animatedAirExportPreview',requestId:authority.requestId,token:authority.token,dataUri:'data:image/'+settings.format+';base64,'+encoded.buffer.toString('base64'),summary:details.join('\n')});return;
  }
  if(type==='applyAnimatedAirExport'){
    if(!authority.candidate)throw Error('Render and inspect the animation preview before saving.');session.animatedExport=null;
    if(dirtyTarget(vscode,authority.target)||targetHash(authority.target)!==authority.expectedHash||fs.existsSync(authority.target)!==authority.existing)throw Error('The animation destination changed during review. Nothing was exported.');
    transactionalWrite(fs,authority.target,authority.candidate,optionsFromConfig(vscode,authority.target,'export-air-animation',{allowExisting:authority.existing,expectedHash:authority.expectedHash}));
    await context?.globalState?.update('ikemen.air.animationExport',authority.settings);await post(session,{type:'animatedAirExportSaved',requestId:authority.requestId,path:authority.target});vscode.window.showInformationMessage('Exported animated AIR preview to '+authority.target);return;
  }
  throw Error('Unknown animated AIR export operation.');
}
module.exports={TYPES,handle,currentSources,validateSources,configure,targetHash};
