'use strict';
function client(api){
  let busy=false,serial=0,token='',candidate=false;
  const row=document.createElement('div');row.className='timeline-actions';row.style.order='7';
  const button=document.createElement('button');button.id='exportAnimatedAir';button.textContent='Export animation…';button.title='Preview and export one authored AIR pass as animated GIF or lossless WebP.';row.append(button);document.getElementById('compactFrameTools').after(row);
  const dialog=document.createElement('dialog');dialog.id='animatedAirExportDialog';dialog.style.cssText='width:min(720px,92vw);max-height:90vh;overflow:auto;background:var(--vscode-editor-background);color:var(--vscode-foreground);border:1px solid var(--vscode-focusBorder)';
  const title=document.createElement('h2');title.textContent='Animated AIR export';const status=document.createElement('pre');status.style.whiteSpace='pre-wrap';status.setAttribute('role','status');const preview=document.createElement('img');preview.alt='Rendered animation candidate';preview.style.cssText='display:block;max-width:100%;max-height:50vh;object-fit:contain;image-rendering:pixelated;background:repeating-conic-gradient(#777 0% 25%,#aaa 0% 50%) 50% / 16px 16px';
  const save=document.createElement('button');save.textContent='Save reviewed animation…';save.disabled=true;const cancel=document.createElement('button');cancel.textContent='Cancel';dialog.append(title,status,preview,save,cancel);document.body.append(dialog);
  function sync(){const context=api.context();button.disabled=busy||!context.action||context.model.sourceKind==='stage';}
  function finish(message){busy=false;candidate=false;token='';save.disabled=true;preview.removeAttribute('src');if(dialog.open)dialog.close();api.status(message);sync();}
  function abort(){if(!busy)return;api.post({type:'cancelAnimatedAirExport',requestId:serial,token});serial++;finish('Animated export cancelled. No animation file was written.');}
  dialog.addEventListener('cancel',event=>{event.preventDefault();abort();});cancel.onclick=abort;
  save.onclick=()=>{if(!busy||!candidate||!token)return;save.disabled=true;cancel.disabled=true;status.textContent+='\nSaving reviewed animation…';api.post({type:'applyAnimatedAirExport',requestId:serial,token});};
  button.onclick=()=>{const context=api.context();if(busy||!context.action||!api.canStart())return;busy=true;candidate=false;token='';serial++;sync();api.post({type:'prepareAnimatedAirExport',requestId:serial,action:context.action.number,sourceFingerprint:context.model.sourceFingerprint,background:api.background(),palettes:api.palettes()});api.status('Preparing animated export options…');};
  window.addEventListener('message',async event=>{const message=event.data;if(message.requestId!==serial||!busy)return;
    if(message.type==='animatedAirExportCancelled'){finish('Animated export cancelled.');return;}
    if(message.type==='animatedAirExportError'){cancel.disabled=false;finish(message.message||'Animated export failed.');return;}
    if(message.type==='animatedAirExportSaved'){cancel.disabled=false;finish('Exported animation: '+message.path);return;}
    if(message.type==='animatedAirExportRender'){
      token=message.token;const generation=serial;save.disabled=true;cancel.disabled=false;status.textContent='Rendering animation candidate…';preview.removeAttribute('src');if(!dialog.open)dialog.showModal();
      try{const frames=await api.renderer.frames(message.plan,{visual:api.visual,cancelled:()=>!busy||serial!==generation,progress:(index,total)=>{status.textContent='Rendering '+index+' / '+total+' runs…';}});if(frames&&busy&&serial===generation){status.textContent='Encoding animation candidate…';api.post({type:'animatedAirExportFrames',requestId:serial,token,frames});}}catch(error){api.post({type:'cancelAnimatedAirExport',requestId:serial,token});finish('Animation rendering failed: '+error.message);}return;
    }
    if(message.type==='animatedAirExportPreview'&&message.token===token){status.textContent=message.summary;preview.src=message.dataUri;try{await preview.decode();preview.style.width=Math.min(512,Math.max(128,preview.naturalWidth))+'px';}catch(error){api.post({type:'cancelAnimatedAirExport',requestId:serial,token});finish('The encoded animation preview could not be displayed. Nothing was saved.');return;}if(message.requestId!==serial||!busy)return;candidate=true;save.disabled=false;cancel.disabled=false;}
  });
  const oldLeave=globalThis.ikemenCanLeaveAsset,oldBusy=globalThis.ikemenIsBusy;globalThis.ikemenCanLeaveAsset=()=>!busy&&(!oldLeave||oldLeave());globalThis.ikemenIsBusy=()=>busy||!!oldBusy?.();
  sync();return {sync,busy:()=>busy};
}
function install(page){return page.replace('</script></body>',`const animatedAirExportClient=(${client.toString()})({renderer:(${require('./air_animation_export_model').renderRuntime.toString()})(),visual:airVisual,context:()=>({model,action}),canStart:()=>navigationAllowed()&&!actionMutationBusy,post:message=>vscode.postMessage(message),background:proofColor,status:message=>{document.getElementById('timelineStatus').textContent=message},palettes:()=>followSpritePalette?null:Object.fromEntries((action?.frames||[]).map(frame=>[frame.group,paletteValue(frame.group)]))});const updateBeforeAnimatedExport=updateActionAvailability;updateActionAvailability=()=>{updateBeforeAnimatedExport();animatedAirExportClient.sync()};</script></body>`);}
module.exports={client,install};
