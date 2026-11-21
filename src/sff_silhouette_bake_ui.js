'use strict';
const fs=require('fs');
const presentation = require('./viewer_presentation');
const help = require('./viewer_context_help');
const {hash}=require('./mutation_safety');
const {spriteDataUri}=require('./sff_reader');
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function reviewPage(review,built,images) {
  const defaultPalette=review.palettePairs.findIndex(pair=>pair.sourcePhysicalIndex===built.archive.sprites[review.mappings[0].basePhysicalIndex].paletteIndex);
  const mappings=review.mappings.map(row=>`<tr><td>${escape(row.baseId)}</td><td>${escape(row.layerId)}</td><td>${escape(row.width)} × ${escape(row.height)}</td><td>${escape(row.axisX)}, ${escape(row.axisY)}</td></tr>`).join('');
  const palettes=review.palettePairs.map(row=>`<tr><td>${escape(row.sourceId)}</td><td>${escape(row.equippedId)}</td><td>${escape(row.offId)}</td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:var(--vscode-font-size) var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);padding:20px;max-width:1100px}button,select{font:inherit;color:inherit;background:var(--vscode-button-secondaryBackground);padding:8px;margin:4px;border:1px solid var(--vscode-contrastBorder,#888)}button:focus-visible,select:focus-visible{outline:2px solid var(--vscode-focusBorder)}table{border-collapse:collapse;margin:12px 0}th,td{padding:6px 14px;border:1px solid #888;text-align:left}.previews{display:flex;flex-wrap:wrap;gap:18px}.proof{width:260px;height:260px;position:relative;overflow:auto;background:repeating-conic-gradient(#8884 0% 25%,#5554 0% 50%) 0/16px 16px;border:1px solid #888}.proof img{position:absolute;image-rendering:pixelated}#status{white-space:pre-wrap}small{display:block}details{margin:14px 0}${presentation.style()}${help.style()}</style></head><body><h1>Bake Layer Silhouette into Base</h1>${presentation.chooserHtml()}<p>Layer bank ${escape(review.bank)} · palette index <strong>${escape(review.silhouetteIndex)}</strong> · ${review.mappings.length} new sprite pairs · ${(review.cumulativeMappings||review.mappings).length} cumulative equipment-code mappings.</p><p>The base receives the layer outline for shadow and reflection. The equipped palette includes that outline beneath the visible layer artwork; the unequipped palette removes the outline as well as the layer. Review both states below.</p><label>Preview sprite <select id="pose">${review.mappings.map((image,index)=>`<option value="${index}">${escape(image.baseId)} + ${escape(image.layerId)}</option>`).join('')}</select></label><label>Base costume palette <select id="palette">${review.palettePairs.map((pair,index)=>`<option value="${index}" ${index===defaultPalette?'selected':''}>${escape(pair.sourceId)}</option>`).join('')}</select></label><div class="previews"><section><h2>Equipped</h2><div id="equipped" class="proof" role="img" aria-label="Equipped: base outline and visible equipment"></div></section><section><h2>Unequipped</h2><div id="off" class="proof" role="img" aria-label="Unequipped: base without equipment outline"></div></section><section><h2>Equipped shadow only</h2><div id="shadowEquipped" class="proof" role="img" aria-label="Equipped geometric silhouette"></div></section><section><h2>Unequipped shadow only</h2><div id="shadowOff" class="proof" role="img" aria-label="Unequipped geometric silhouette"></div></section></div><small>Shadow proofs show the geometric silhouette, not a native projected shadow. Nearest-neighbor fitted source-pixel proof, aligned by saved sprite axes. Preview transforms are not baked. Equipment keeps its own saved palette in this proof. Runtime shadow/reflection depends on the engine and generated equipment code.</small><p data-ikm-help="Outline opacity">Only fully opaque equipment pixels contribute to the outline. Translucent edges retain their original artwork.</p><details open><summary>Sprite mappings and expanded base bounds</summary><table><thead><tr><th>Base</th><th>Layer</th><th>Baked dimensions</th><th>Baked axes</th></tr></thead><tbody>${mappings}</tbody></table></details><details open><summary>Palette mapping</summary><table><thead><tr><th>Source</th><th>Equipped</th><th>Unequipped</th></tr></thead><tbody>${palettes}</tbody></table></details><p>A verified original backup is created before saving. Save uses the existing archive transaction and Undo. Previously baked frames are excluded from new batches. Additional frames reuse this silhouette slot and palette pairs. Undo restores the exact previous batch, which can then be continued again. If the archive or originating viewer changes, reopen this review.</p><button id="apply">Save Reviewed Bake</button><button id="code" disabled>Generate equipment code…</button><button id="close" data-ikm-action-icon="×" aria-label="Close" title="Close"><span data-ikm-action-label>Close</span></button><p id="status" role="status" aria-live="polite">Review ready. The character archive has not changed.</p><script>const vscode=acquireVsCodeApi(),images=${JSON.stringify(images).replace(/</g,'\\u003c')};function draw(item){for(const mode of ['equipped','off','shadowEquipped','shadowOff']){const box=document.getElementById(mode);box.replaceChildren();const pieces=item?.[mode]||[],left=Math.min(0,...pieces.map(image=>-image.axisX)),top=Math.min(0,...pieces.map(image=>-image.axisY)),right=Math.max(1,...pieces.map(image=>image.width-image.axisX)),bottom=Math.max(1,...pieces.map(image=>image.height-image.axisY)),scale=Math.min(32,220/Math.max(right-left,bottom-top)),originX=(260-(right-left)*scale)/2-left*scale,originY=(260-(bottom-top)*scale)/2-top*scale;for(const image of pieces){const img=document.createElement('img');img.src=image.uri;img.alt='';img.style.left=(originX-image.axisX*scale)+'px';img.style.top=(originY-image.axisY*scale)+'px';img.style.width=(image.width*scale)+'px';img.style.height=(image.height*scale)+'px';box.append(img)}}}let requestId=0;function request(){vscode.postMessage({type:'preview',pose:Number(document.getElementById('pose').value),palette:Number(document.getElementById('palette').value),requestId:++requestId})}document.getElementById('pose').onchange=request;document.getElementById('palette').onchange=request;document.getElementById('apply').onclick=()=>{document.getElementById('apply').disabled=true;vscode.postMessage({type:'apply'})};document.getElementById('code').onclick=()=>vscode.postMessage({type:'code'});document.getElementById('close').onclick=()=>vscode.postMessage({type:'close'});addEventListener('message',event=>{const m=event.data;if(m.type==='preview'&&m.requestId===requestId)draw(m.image);if(m.type==='result'){document.getElementById('status').textContent=m.message;document.getElementById('code').disabled=!m.saved;document.getElementById('apply').disabled=true}});draw(images);${presentation.clientScript({vscodeVariable:'vscode'})}${help.clientScript()}</script></body></html>`;
}

function previewImages(review,archive,pose=0,palette=null) {
  if(palette===null)palette=Math.max(0,review.palettePairs.findIndex(pair=>pair.sourcePhysicalIndex===archive.sprites[review.mappings[pose]?.basePhysicalIndex]?.paletteIndex));
  const row=review.mappings[pose],pair=review.palettePairs[palette];
  if(!row||!pair)throw Error('Choose a reviewed sprite and costume palette.');
  const base=archive.sprites[row.basePhysicalIndex],layer=archive.sprites[row.layerPhysicalIndex];
  const image=(sprite,colors)=>({uri:spriteDataUri(archive,sprite,colors),axisX:sprite.axisX,axisY:sprite.axisY,width:sprite.width,height:sprite.height});
  const silhouette=Array.from({length:256},(_,index)=>[0,0,0,index?255:0]),off=silhouette.map(color=>[...color]);off[review.silhouetteIndex][3]=0;
  return {equipped:[image(base,pair.equippedPhysicalIndex),image(layer,null)],off:[image(base,pair.offPhysicalIndex)],shadowEquipped:[image(base,silhouette)],shadowOff:[image(base,off)]};
}

async function run(api,filename,archive,message,hooks) {
  const current=()=>hooks.isCurrent()&&hash(fs.readFileSync(filename))===hash(archive.buffer);
  if(!current())throw Error('The archive changed. Refresh the SFF viewer before reviewing a silhouette bake.');
  const banks=[...new Set(archive.sprites.map(sprite=>Math.floor(sprite.group/10000)).filter(bank=>bank>=1&&bank<=6))].sort();
  const preferred=Number(message.bank);
  const pick=message.handoff?{bank:preferred}:await api.window.showQuickPick(banks.map(bank=>({label:`Layer bank ${bank}`,description:`Base group + ${bank*10000}, matching sprite index`,bank})).sort((a,b)=>Number(b.bank===preferred)-Number(a.bank===preferred)),{title:'Bake Layer Silhouette into Base',placeHolder:'Choose the equipment bank, then a current frame, selection, group or remaining frames.'});
  if(!pick)return;
  validateComposition(message.value,pick.bank);
  const history = require('./sff_silhouette_bake_history');
  const continuation=history.continuationFor(filename,archive,pick.bank);
  const scope=message.handoff?{indices:validateHandoff(archive,message)}:await chooseScope(api,archive,pick.bank,message,continuation);
  if(!scope)return;
  if(!current())throw Error('The archive changed while choosing frames. Reopen the bake review.');
  if(scope.code){await hooks.code(history.savedBake(filename,archive,pick.bank),archive);return;}
  history.assertCanBake(filename,archive,pick.bank,scope.indices);
  const tool=require('./sff_silhouette_bake'),review=tool.reviewSilhouetteBake(archive,{bank:pick.bank,basePhysicalIndices:scope.indices,...(continuation?{continuation}:{})}),built=tool.buildSilhouetteBake(archive,review);
  const equipmentReview={...review,mappings:review.cumulativeMappings||[...(continuation?.mappings||[]),...review.mappings]};
  const panel=api.window.createWebviewPanel('ikemenSilhouetteBakeReview','Review Layer Silhouette Bake',api.ViewColumn.Beside,{enableScripts:true,retainContextWhenHidden:true});
  let busy=false,saved=false;
  panel.webview.onDidReceiveMessage(async message=>{
    if(presentation.isMessage(message))return presentation.handle(message,panel);
    if(message.type==='close'){panel.dispose();return;}
    if(message.type==='preview'){try{await panel.webview.postMessage({type:'preview',requestId:message.requestId,image:previewImages(review,built.archive,message.pose,message.palette)});}catch(error){await panel.webview.postMessage({type:'result',saved,message:error.message});}return;}
    if(busy)return;
    try {
      busy=true;
      if(message.type==='apply'&&!saved){
        if(!current())throw Error('The archive or originating viewer changed. Nothing was saved. Reopen the review.');
        require('./sff_silhouette_bake_history').assertCanBake(filename,archive,review.bank,scope.indices);
        // Revalidate the full plan immediately before the mutation callback.
        const fresh=tool.buildSilhouetteBake(archive,review);
        const backup=await hooks.apply({...fresh,sourceHash:hash(archive.buffer),review});
        saved=true;
        await panel.webview.postMessage({type:'result',saved:true,message:'Reviewed silhouette bake saved. Original backup: '+backup+'\nGenerate equipment code to review the equipped condition and palette remaps, then Copy or append through the existing reviewed code workflow.'});
      } else if(message.type==='code'&&saved){if(hash(fs.readFileSync(filename))!==hash(built.archive.buffer))throw Error('The baked archive changed. Refresh and review its palette mappings before generating equipment code.');await hooks.code(equipmentReview,built.archive);}
    } catch(error){await panel.webview.postMessage({type:'result',saved,message:error.message});}
    finally{busy=false;}
  });
  panel.webview.html=require('./webview_policy').protect(reviewPage(review,built,previewImages(review,built.archive)),panel.webview.cspSource);
  return {panel,review,built};
}
function validateHandoff(archive,request){
  if(!/^[a-f0-9]{64}$/.test(request.expectedHash||'')||hash(archive.buffer)!==request.expectedHash)throw Error('The imported archive changed. Reopen the import result and review the current frames before baking.');
  const bank=Number(request.bank);
  if(!Number.isInteger(bank)||bank<1||bank>6)throw Error('The import handoff needs one exact layer bank from 1 through 6.');
  if(!Array.isArray(request.layerIds)||!request.layerIds.length||request.layerIds.some(id=>typeof id!=='string'||!/^\d+,\d+$/.test(id)))throw Error('The import handoff needs exact imported layer sprite IDs.');
  const byId=new Map();for(const sprite of archive.sprites){const id=`${sprite.group},${sprite.number}`;if(byId.has(id))throw Error('Duplicate sprite IDs prevent an exact imported-frame bake.');byId.set(id,sprite);}
  const baseIds=[...new Set(request.layerIds)].map(id=>{const sprite=byId.get(id);if(!sprite||Math.floor(sprite.group/10000)!==bank)throw Error('An imported layer sprite is missing or outside the reviewed bank: '+id);const baseId=`${sprite.group-bank*10000},${sprite.number}`;if(!byId.has(baseId))throw Error('Imported layer '+id+' has no matching base '+baseId+'. Import its base before baking.');return baseId;});
  if(request.baseIds&&(!Array.isArray(request.baseIds)||request.baseIds.length!==baseIds.length||[...request.baseIds].sort().join('|')!==[...baseIds].sort().join('|')))throw Error('The imported layer/base mapping changed. Reopen the import result before baking.');
  return baseIds.map(id=>byId.get(id).index);
}
async function chooseScope(api,archive,bank,message,continuation){
  const ids=new Set(archive.sprites.map(sprite=>`${sprite.group},${sprite.number}`)),done=new Set((continuation?.mappings||[]).map(row=>row.baseId));
  const eligible=archive.sprites.filter(sprite=>sprite.group<10000&&ids.has(`${sprite.group+bank*10000},${sprite.number}`));
  const remaining=eligible.filter(sprite=>!done.has(`${sprite.group},${sprite.number}`));
  const toBase=index=>{const sprite=archive.sprites[index];if(!sprite)return null;return eligible.find(base=>base.number===sprite.number&&(base.group===sprite.group||base.group+bank*10000===sprite.group));};
  const current=toBase(message.selectedIndex),marked=new Set((message.selectedIndices||[]).map(toBase).filter(Boolean).map(sprite=>sprite.index));
  const options=[];
  if(current&&!done.has(`${current.group},${current.number}`))options.push({label:'Current frame only',description:`${current.group},${current.number} · 1 sprite pair`,indices:[current.index]});
  const selected=remaining.filter(sprite=>marked.has(sprite.index));
  if(selected.length>1)options.push({label:'Selected frames',description:`${selected.length} marked unbaked sprite pairs`,indices:selected.map(sprite=>sprite.index)});
  if(current){const group=remaining.filter(sprite=>sprite.group===current.group);if(group.length)options.push({label:'Current sprite group',description:`Group ${current.group} · ${group.length} remaining pairs`,indices:group.map(sprite=>sprite.index)});}
  if(remaining.length){options.push({label:'Pick frames…',description:'Choose individual unbaked sprite pairs; multiple selections allowed',pick:true});options.push({label:'All remaining frames',description:`${remaining.length} unbaked pairs in this bank`,indices:remaining.map(sprite=>sprite.index)});}
  if(continuation && !continuation.palettePairs.some(pair => pair.pending))options.push({label:'Generate equipment code for saved frames…',description:`${done.size} cumulative baked pairs; no archive write`,code:true});
  if(!options.length)throw Error('This layer bank has no matching base frames.');
  const choice=await api.window.showQuickPick(options,{title:'Choose silhouette bake scope',placeHolder:`${done.size} already baked · ${remaining.length} remaining. Start with one frame or a small selection.`});
  if(!choice)return null;
  if(!choice.pick)return choice;
  const picked=await api.window.showQuickPick(remaining.map(sprite=>({label:`${sprite.group},${sprite.number}`,description:`Layer ${sprite.group+bank*10000},${sprite.number}`,picked:marked.has(sprite.index),index:sprite.index})),{title:'Pick frames to bake',placeHolder:'Only checked frames are baked; previous batches stay unchanged.',canPickMany:true});
  if(!picked?.length)return null;
  return {indices:picked.map(item=>item.index)};
}
function validateComposition(composition,bank) {
  const base=composition?.layers?.find(layer=>layer.id==='base');
  for(const layer of composition?.layers||[]) {
    if(layer.id!=='base'&&!(layer.enabled&&layer.source?.kind==='bank'&&layer.source.bank===bank))continue;
    if(layer.id!=='base'&&(layer.visible===false||Number(layer.order??1)<=Number(base?.order??0)))throw Error('Place the visible equipment layer in front of the base before baking. Its artwork must cover the opaque silhouette ink.');
    if(Number(layer.x||0)!==0||Number(layer.y||0)!==0||Number(layer.scaleX??1)!==1||Number(layer.scaleY??1)!==1||Number(layer.angle||0)!==0||layer.flipX||layer.flipY||Number(layer.opacity??1)!==1||(layer.blend&&layer.blend!=='normal'))throw Error('Reset base and equipment preview transforms, opacity and blend before baking. This operation uses saved sprite axes and exact source pixels.');
  }
}
module.exports={run,reviewPage,previewImages,validateComposition,chooseScope,validateHandoff};


