'use strict';
const fs=require('fs'),path=require('path');
const model=require('./stage_audio_model');
const {hash}=require('./mutation_safety');
function state(owner){return owner.stageAudio||(owner.stageAudio={slot:'',track:null});}
function read(env,owner){return env.readText(owner.filename);}
async function publish(owner,env,open=true){
 const current=state(owner),text=read(env,owner),assignment=model.music(text,owner.filename,current.slot);
 if(!current.track&&assignment.assignment&&!assignment.assignment.includes(',')){
  const file=env.resolveAsset(assignment.assignment.replace(/^"|"$/g,''),owner.filename);
  if(file&&fs.existsSync(file))try{current.track=model.inspect(fs.readFileSync(file),file);}catch(error){current.error=error.message;}
 }
 return env.post({type:'stageAudioState',generation:owner.generation,open,slot:current.slot,current:assignment,track:current.track,error:current.error||'',root:env.root||path.dirname(owner.filename)});
}
async function chooseProject(owner,env){
 const root=env.root||path.dirname(owner.filename),files=[],queue=[path.join(root,'sound')];let visited=0;
 while(queue.length&&files.length<1500&&visited++<500){const dir=queue.shift();if(!fs.existsSync(dir))continue;for(const entry of fs.readdirSync(dir,{withFileTypes:true})){if(entry.isSymbolicLink())continue;const file=path.join(dir,entry.name);if(entry.isDirectory())queue.push(file);else if(entry.isFile()&&model.FORMATS.includes(path.extname(file).slice(1).toLowerCase()))files.push(file);}}
 return env.api.window.showQuickPick(files.map(filename=>({label:path.basename(filename),description:path.relative(root,filename),filename})),{title:'Existing project music — sound folder (up to 1500 tracks)'});
}
async function handle(owner,message,env){
 if(!model.validMessage(message)||message.generation!==owner.generation)return false;
 const current=state(owner);
 try{
  if(message.operation==='cancel'){owner.stageAudio={slot:current.slot,track:null};return publish(owner,env,false);}
  if(message.operation==='open')return publish(owner,env);
  if(message.operation==='slot'){model.slot(message.slot);owner.stageAudio={slot:message.slot,track:null};return publish(owner,env);}
  const authority=env.capture();if(!authority)throw Error('The Stage is no longer the current authoring owner.');
  if(message.operation==='removeTrack'){
   if(owner.busy&&!env.busyOwned)throw Error('Wait for the current Stage operation.');
   const before=read(env,owner),slot=current.slot,assignment=model.music(before,owner.filename,slot),after=model.removeTrack(before,owner.filename,slot);
   const detail=owner.filename+'\nSlot: '+(slot||'Default')+'\nRemove track: '+assignment.assignment+'\nOnly the track assignment is commented out. Volume, loop settings, other slots and audio files are preserved. Removing an override does not force silence; engine fallback and character music may still play.\nReviewed Stage edit with native/Stage Undo. Save the DEF before testing.';
   if(await env.api.window.showWarningMessage('Remove this Stage track assignment?',{modal:true,detail},'Remove Track')!=='Remove Track')return false;
   env.assert(authority);if(current.slot!==slot||read(env,owner)!==before)throw Error('Stage or selected slot changed during review. Nothing was removed.');
   await env.apply(after,authority);owner.stageAudio=null;await env.refresh();return true;
  }
  if(message.operation==='event'){
   const track=current.track;if(!track)throw Error('Choose and preview event music first.');if(!env.root)throw Error('Event music requires a containing game project.');
   model.assignmentPath(owner.filename,track.filename,env.root);const fresh=model.inspect(fs.readFileSync(track.filename),track.filename);if(fresh.hash!==track.hash)throw Error('Chosen event music changed. Choose it again.');
   owner.stageEventMusic=require('./stage_reaction_music').draft(fresh,message,owner.filename);env.assert(authority);
   return env.post({type:'stageAudioEventSelection',generation:owner.generation,selected:owner.selected,filename:track.filename,status:'Event music selected for reviewed reaction source. Stage music assignment and original audio remain unchanged.'});
  }
  if(message.operation==='waveform'){
   const track=current.track;if(!track)throw Error('Choose compressed audio first.');
   if(env.api.workspace?.isTrusted===false)throw Error('Waveform decoding requires a trusted local workspace.');
   if(!['ogg','flac'].includes(track.extension))throw Error('Precise compressed waveform decoding is available for Vorbis and FLAC. MP3 decoder delay mapping is not verified.');
   const executable=env.api.workspace.getConfiguration('ikemenZss').get('ffmpegPath','ffmpeg');
   if(await env.api.window.showInformationMessage('Decode a read-only waveform using configured ffmpeg? No converted file is written. Source-rate metadata must match the decoded frame count. Limit: 15 seconds and 32 MiB decoded audio.',{modal:true},'Decode Waveform')!=='Decode Waveform')return false;
   env.assert(authority);if(hash(fs.readFileSync(track.filename))!==track.hash)throw Error('Chosen audio changed before decoding.');
   const result=await require('./stage_audio_decode').decodeWaveform(track,executable);await env.restoreNativeDocument?.();env.assert(authority);if(hash(fs.readFileSync(track.filename))!==track.hash)throw Error('Chosen audio changed during decoding.');
   Object.assign(track,result);return publish(owner,env);
  }
  if(message.operation==='choose'||message.operation==='project'){
   const picked=message.operation==='project'?await chooseProject(owner,env):await env.api.window.showOpenDialog({title:'Choose music for preview — no files are copied',canSelectMany:false,filters:{'IKEMEN music':model.FORMATS}});
   if(!picked)return false;env.assert(authority);const filename=message.operation==='project'?picked.filename:picked[0]?.fsPath;if(!filename)return false;
   const track=model.inspect(fs.readFileSync(filename),filename);env.assert(authority);current.track=track;current.error='';return publish(owner,env);
  }
  if(message.operation==='sounds'){
   // The Stage has no SND archive or universal sound-event syntax. Resolve an attached owner explicitly.
   const owners=owner.payload.model.attachedChars||[],choices=[];
   for(const attached of owners){const file=env.resolveAsset(attached.path,owner.filename);if(!file||!fs.existsSync(file))continue;const source=env.readText(file),doc=require('./def_model').parseDef(source,file),section=doc.sections.find(s=>s.normalized==='files'),fields=section?require('./def_model').sectionMap(section):{};if(fields.sound){const snd=env.resolveAsset(fields.sound.replace(/^"|"$/g,''),file);if(snd&&fs.existsSync(snd))choices.push({label:attached.name||path.basename(file),description:'Entity SND: '+snd,filename:snd,owner:file,ownerHash:hash(source),soundHash:hash(fs.readFileSync(snd))});}}
   if(!choices.length)return env.api.window.showInformationMessage('No attached entity has a resolved SND. Attach an entity with an existing sound archive first. Sound playback belongs to its PlaySnd controller.');
   const chosen=await env.api.window.showQuickPick(choices,{title:'Sounds — choose attached entity owner'});if(!chosen)return false;env.assert(authority);
   if(hash(env.readText(chosen.owner))!==chosen.ownerHash||hash(fs.readFileSync(chosen.filename))!==chosen.soundHash)throw Error('The attached entity or sound archive changed during selection. Choose its sounds again.');
   const stageFilename=owner.filename,entityIdentity=owner.entityIdentity,stageFingerprint=hash(env.readText(stageFilename)),identity=require('./stage_attached_authoring_workflow').identity,stageIdentity=identity(stageFilename),ownerIdentity=identity(chosen.owner);
   const retained=()=>{try{const stat=fs.lstatSync(chosen.filename);return !owner.disposed&&owner.filename===stageFilename&&owner.entityIdentity===entityIdentity&&hash(env.readText(stageFilename))===stageFingerprint&&identity(stageFilename)===stageIdentity&&identity(chosen.owner)===ownerIdentity&&hash(env.readText(chosen.owner))===chosen.ownerHash&&stat.isFile()&&!stat.isSymbolicLink();}catch{return false;}};
   return require('./stage_attached_sound').openAttachedSound(env.api,{isRetainedCurrent:retained,returnToStage:()=>{if(retained())owner.panel.reveal(owner.panel.viewColumn,false);},onDispose:callback=>owner.panel.onDidDispose?.(callback)},{ownerDef:chosen.owner,filename:chosen.filename,column:owner.panel.viewColumn});
  }
  if(message.operation==='apply'){
   if(owner.busy&&!env.busyOwned)throw Error('Wait for the current Stage operation.');
   const track=current.track;if(!track)throw Error('Choose a validated music file first.');
   if(hash(fs.readFileSync(track.filename))!==track.hash)throw Error('The chosen audio changed. Choose it again before applying.');
   let destination=null,assignment;
   if(message.mode==='copy'){
    const root=env.root;if(!root)throw Error('A containing game root is required for approved music import.');
    const selected=await env.api.window.showSaveDialog({title:'Choose approved music copy destination — no file is written yet',defaultUri:env.api.Uri.file(path.join(root,'sound',path.basename(track.filename))),filters:{'Original music format':[track.extension]}});if(!selected)return false;env.assert(authority);
    destination=selected.fsPath;assignment=model.assignmentPath(owner.filename,destination,root);
    if(path.extname(destination).toLowerCase()!==path.extname(track.filename).toLowerCase())throw Error('Keep the original audio extension; import does not convert audio.');
    if(fs.existsSync(destination))throw Error('The import destination already exists. Reference the existing project file or choose another copy destination.');
   }else assignment=model.assignmentPath(owner.filename,track.filename,env.root);
   const before=read(env,owner),draft={...message,slot:current.slot,assignment,frames:track.frames},after=model.apply(before,owner.filename,draft);
   const details=`${owner.filename}\n${current.slot||'Default '}music: ${model.music(before,owner.filename,current.slot).assignment||'(none)'} → ${assignment}\nVolume: ${message.volume} (engine clamps to configured MaxBGMVolume); loop: ${message.loop}; source frame range: ${message.start} → ${message.end==='0'?'file end':message.end}\n${destination?'Create exact audio copy: '+destination+'\nOriginal audio remains untouched.':'Reference existing audio: '+track.filename}\n${destination?'Compound native edit: use native Undo to undo both file creation and assignment.':'Stage edit supports native or Stage Undo.'}\nAn open native Stage edit remains unsaved until Save. Verify in the target engine.`;
   if(await env.api.window.showWarningMessage('Apply reviewed Stage music?',{modal:true,detail:details},'Apply Music')!=='Apply Music')return false;
   env.assert(authority);if(read(env,owner)!==before||hash(fs.readFileSync(track.filename))!==track.hash)throw Error('Stage or audio changed during review. Nothing was applied.');
   if(destination){
    const document=await env.openDocument();env.assert(authority);if(document.getText()!==before||fs.existsSync(destination))throw Error('Source or import destination changed.');
    model.assignmentPath(owner.filename,destination,env.root);const bytes=fs.readFileSync(track.filename);if(hash(bytes)!==track.hash)throw Error('The original audio changed while preparing import.');
    const edit=new env.api.WorkspaceEdit();edit.createFile(env.api.Uri.file(destination),{overwrite:false,ignoreIfExists:false,contents:bytes});edit.replace(document.uri,new env.api.Range(document.positionAt(0),document.positionAt(before.length)),after);
    env.assert(authority);if(!await env.api.workspace.applyEdit(edit,{label:'Import Stage music'}))throw Error('Native compound import was not confirmed. Review Stage and destination before retrying; use native Undo for any partial changes.');
    if(document.getText()!==after||!fs.existsSync(destination)||hash(fs.readFileSync(destination))!==track.hash)throw Error('Native import result is incomplete. Review both files and use native Undo before retrying.');
    // Do not add a text-only history record for a file-creating operation.
    // Prior visual history cannot cross this compound native edit.
    if(owner.history){owner.history.undoStack.length=0;owner.history.redoStack.length=0;owner.history.resourceError='Music import is a compound native edit. Use native Undo/Redo after checking the Stage and copied audio.';}
   }else await env.apply(after,authority);
   owner.stageAudio=null;await env.refresh();return true;
  }
 }catch(error){current.error=error.message;await env.api.window.showErrorMessage('Stage Music & Sounds: '+error.message);return false;}
 return false;
}
async function chooseOwnerSound(owner,env){
 const authority=env.capture();if(!authority)throw Error('The attached Stage source is no longer current.');
 const choices=[];
 for(const attached of owner.payload.model.attachedChars||[]){
  const ownerDef=env.resolveAsset(attached.path,owner.filename);if(!ownerDef||!fs.existsSync(ownerDef))continue;
  const text=env.readText(ownerDef),document=require('./def_model').parseDef(text,ownerDef),section=document.sections.find(s=>s.normalized==='files'),fields=section?require('./def_model').sectionMap(section):{};
  if(!fields.sound)continue;const filename=env.resolveAsset(fields.sound.replace(/^"|"$/g,''),ownerDef);if(!filename||!fs.existsSync(filename))continue;
  choices.push({label:attached.name||path.basename(ownerDef),description:filename,ownerDef,ownerDefHash:hash(text),filename,sourceHash:hash(fs.readFileSync(filename))});
 }
 const choice=choices.length===1?choices[0]:await env.api.window.showQuickPick(choices,{title:'Choose attached entity sound owner'});if(!choice)return null;env.assert(authority);
 const archive=require('./snd_reader').readSnd(choice.filename);
 if(hash(archive.buffer)!==choice.sourceHash||hash(env.readText(choice.ownerDef))!==choice.ownerDefHash)throw Error('The attached sound owner changed while choosing.');
 const entries=archive.entries.filter(entry=>entry.duplicateOf===null&&entry.wav.valid).map(entry=>({label:entry.group+', '+entry.index,description:'SND entry '+entry.archiveIndex,entry}));
 const selected=await env.api.window.showQuickPick(entries,{title:'Choose existing sound group, index'});if(!selected)return null;env.assert(authority);
 const input=await env.api.window.showInputBox({title:'PlaySnd channel for this attached entity',value:'0',validateInput:value=>/^\d{1,10}$/.test(value)&&Number(value)<=2147483647?undefined:'Use a nonnegative int32 channel.'});if(input===undefined)return null;
 if(!/^\d{1,10}$/.test(input)||Number(input)>2147483647)throw Error('Invalid sound channel.');
 const receipt={ownerDef:choice.ownerDef,ownerDefHash:choice.ownerDefHash,filename:choice.filename,sourceHash:choice.sourceHash,group:selected.entry.group,index:selected.entry.index,archiveIndex:selected.entry.archiveIndex,channel:Number(input)};
 env.assert(authority);validateOwnerSound(receipt,owner,env);return receipt;
}
function validateOwnerSound(receipt,owner,env){
 const same=(a,b)=>path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase();
 if(!(owner.payload.model.attachedChars||[]).some(attached=>{const file=env.resolveAsset(attached.path,owner.filename);return file&&same(file,receipt.ownerDef);}))throw Error('The sound owner is no longer attached to this Stage.');
 const source=env.readText(receipt.ownerDef);if(hash(source)!==receipt.ownerDefHash)throw Error('The chosen attached entity DEF changed.');
 const document=require('./def_model').parseDef(source,receipt.ownerDef),section=document.sections.find(s=>s.normalized==='files'),fields=section?require('./def_model').sectionMap(section):{},assigned=fields.sound&&env.resolveAsset(fields.sound.replace(/^"|"$/g,''),receipt.ownerDef);
 if(!assigned||!same(assigned,receipt.filename))throw Error('The chosen SND is no longer assigned to this attached entity.');
 const archive=require('./snd_reader').readSnd(receipt.filename);if(hash(archive.buffer)!==receipt.sourceHash)throw Error('The chosen SND archive changed.');
 const entry=archive.entries[receipt.archiveIndex];if(!entry||entry.group!==receipt.group||entry.index!==receipt.index||entry.duplicateOf!==null||!entry.wav.valid)throw Error('The selected sound identity is no longer exact.');
 return true;
}
module.exports={handle,publish,chooseProject,chooseOwnerSound,validateOwnerSound};
