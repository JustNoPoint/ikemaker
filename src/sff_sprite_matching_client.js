'use strict';
function installSpriteSimilarity(){
 let serial=0,active=null;
 let canvasMenu=null;
 globalThis.ikemenSffShowMatchingMenu=(event,previewLayers)=>{
  canvasMenu?.remove();
  const menu=document.createElement('div');canvasMenu=menu;
  menu.id='sffCanvasSpriteActions';menu.setAttribute('role','dialog');menu.setAttribute('aria-label','Canvas sprite actions');
  menu.style.cssText='position:fixed;z-index:10001;padding:8px;background:var(--vscode-menu-background,var(--vscode-editor-background));color:var(--vscode-foreground);border:1px solid var(--vscode-panel-border);box-shadow:0 4px 18px #0008;display:grid;gap:6px';
  const find=document.createElement('button'),layers=document.createElement('button');find.textContent='Find Similar Sprites…';layers.textContent='Preview layers';
  find.onclick=()=>{menu.remove();globalThis.ikemenFindSimilarSprites()};layers.onclick=()=>{menu.remove();previewLayers()};
  menu.append(find,layers);document.body.append(menu);
  menu.style.left=Math.max(4,Math.min(event.clientX,innerWidth-menu.offsetWidth-4))+'px';
  menu.style.top=Math.max(4,Math.min(event.clientY,innerHeight-menu.offsetHeight-4))+'px';find.focus();
  menu.addEventListener('keydown',key=>{if(key.key==='Escape'){menu.remove();canvas.focus()}});
 };
 addEventListener('pointerdown',event=>{if(canvasMenu&&!canvasMenu.contains(event.target)){canvasMenu.remove();canvasMenu=null}},true);

 const loadError=message=>{if(active)active.status.textContent=message;};
 function close(dialog){dialog.remove();if(active?.dialog===dialog){active=null;serial++;}}
 globalThis.ikemenFindSimilarSprites=()=>{
  if(!selected){error.textContent='Select a sprite before searching.';return;}
  active?.dialog.remove();
  const source={index:selected.index,group:selected.group,number:selected.number},dialog=document.createElement('dialog');
  dialog.id='sffSimilarSprites';dialog.setAttribute('aria-label','Find Similar Sprites');
  dialog.style.cssText='max-width:90vw;max-height:85vh;overflow:auto;background:var(--vscode-editor-background);color:var(--vscode-foreground)';
  const title=document.createElement('h2'),note=document.createElement('p'),thresholdLabel=document.createElement('label'),threshold=document.createElement('input'),paletteLabel=document.createElement('label'),palette=document.createElement('input'),search=document.createElement('button'),cancel=document.createElement('button'),status=document.createElement('p'),results=document.createElement('div');
  title.textContent='Find Similar Sprites · '+source.group+','+source.number;
  note.textContent='Compare shape and RGB color after ignoring transparent padding. Results only navigate; no sprite data is linked or changed. Up to 4096 sprites / 16 million pixels are scanned; at most 100 results are shown. Similarity uses a 32 × 32 sample and may miss small details.';
  threshold.type='number';threshold.min=0;threshold.max=100;threshold.step=1;threshold.value=80;threshold.setAttribute('aria-label','Minimum sprite similarity percent');thresholdLabel.append('Minimum similarity (%) ',threshold);
  palette.type='checkbox';paletteLabel.append(palette,' Same embedded palette slot only');
  search.textContent='Find similar';cancel.textContent='Close';status.setAttribute('role','status');
  dialog.append(title,note,thresholdLabel,paletteLabel,search,cancel,status,results);document.body.append(dialog);
  const record={dialog,source,status,results,request:0};active=record;
  cancel.onclick=()=>close(dialog);dialog.addEventListener('cancel',()=>close(dialog));
  search.onclick=()=>{
   const value=Number(threshold.value);if(threshold.value===''||!Number.isFinite(value)||value<0||value>100){status.textContent='Enter a similarity threshold from 0 through 100.';return;}
   results.textContent='';status.textContent='Searching the current archive…';record.request=++serial;
   vscode.postMessage({type:'findSimilarSprites',requestId:record.request,sourceIndex:source.index,threshold:value,samePalette:palette.checked});
  };
  dialog.showModal();threshold.focus();
 };
 addEventListener('message',event=>{
  const message=event.data,record=active;
  if(message.type!=='similarSprites'||!record||message.requestId!==record.request)return;
  if(message.error){loadError(message.error);return;}
  record.results.textContent='';
  record.status.textContent=message.totalMatches+' matches in '+message.scanned+' scanned sprites.'+(message.limited?' Showing up to 100. '+message.skipped.length+' sprites were skipped; narrow the archive or inspect those separately.':'')+(message.warning?' '+message.warning:'');
  for(const result of message.rows){
   const row=document.createElement('button');row.style.cssText='display:block;width:100%;text-align:left;margin:4px 0';
   row.textContent=result.group+','+result.number+' · '+result.score+'% · '+result.width+' × '+result.height+' · physical '+result.index;
   row.onclick=()=>{const sprite=model.sprites[result.index];if(!sprite||sprite.group!==result.group||sprite.number!==result.number){record.status.textContent='This result changed. Run the search again.';return;}selectedIndices.clear();selectedIndices.add(sprite.index);close(record.dialog);selectSprite(sprite);};
   record.results.append(row);
  }
 });
}
function clientScript(){return '('+installSpriteSimilarity.toString()+')();';}
module.exports={clientScript};
