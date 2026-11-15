'use strict';
function renderPreviewLayerList(container,state,callbacks){
 const ordered=[...state.layers].sort((a,b)=>a.order-b.order||state.layers.indexOf(a)-state.layers.indexOf(b));container.textContent='';
 container.setAttribute('aria-label','Five preview layers, top behind and bottom in front');
 const heading=document.createElement('div');heading.textContent='Drag · Select · Show · Layer · Order';heading.style.cssText='font-size:10px;line-height:1.4;white-space:nowrap';heading.setAttribute('aria-hidden','true');container.append(heading);
 for(const [index,layer]of ordered.entries()){
  const row=document.createElement('div');row.className='preview-layer-row';row.dataset.layerId=layer.id;row.draggable=true;row.title='Drag to reorder. Top is behind; bottom is in front.'+(!layer.enabled?' Empty slot.':'');row.style.cssText='display:grid;grid-template-columns:10px 16px 16px minmax(0,1fr) 42px;align-items:center;gap:3px;min-width:0;margin:3px 0;min-height:26px';
  const selected=document.createElement('input'),show=document.createElement('input'),focus=document.createElement('button'),order=document.createElement('input');
  const slotName=layer.id==='base'?'Base':'Layer '+layer.id.slice(5);
  selected.type=show.type='checkbox';selected.checked=state.selected.includes(layer.id);selected.setAttribute('aria-label','Select '+slotName);selected.onchange=()=>callbacks.select(layer.id,true);
  show.checked=layer.enabled&&layer.visible;show.setAttribute('aria-label','Show '+slotName);show.onchange=()=>callbacks.toggle(layer.id,show.checked);
  focus.type='button';focus.textContent=layer.label;const baseRank=ordered.findIndex(item=>item.id==='base'),position=(index+1)+' of 5'+(layer.id==='base'?', Base reference':index<baseRank?', behind Base':', in front of Base');row.setAttribute('role','group');row.setAttribute('aria-label',layer.label+', '+position);if(layer.id==='base')row.dataset.baseLayer='true';focus.setAttribute('aria-label',layer.label+', '+position+(layer.enabled?'':' empty slot'));focus.dataset.previewLayerFocus=layer.id;focus.style.cssText='min-width:0;width:100%;padding:2px;font-size:11px;white-space:nowrap';focus.setAttribute('aria-pressed',String(state.selected.includes(layer.id)));focus.title='Select layer. Alt+Up/Down changes draw order.';focus.setAttribute('aria-keyshortcuts','Alt+ArrowUp Alt+ArrowDown Alt+Home Alt+End');focus.onclick=event=>callbacks.select(layer.id,event.ctrlKey||event.metaKey||event.shiftKey);
  focus.updateLayerCaption=caption=>{
    focus.textContent=caption;
    focus.title=caption+' · '+position+'. Right-click for layer options.';
    focus.setAttribute('aria-label',caption+', '+slotName+', '+position);
  };
  focus.updateLayerCaption(callbacks.caption(layer));
  // The fill identifies the base even when selection or draw order changes.
  const isBase = layer.id === 'base';
  focus.style.setProperty('background', isBase ? '#165888' : 'var(--vscode-editor-background, #242424)', 'important');
  focus.style.setProperty('color', isBase ? '#fff' : 'var(--vscode-editor-foreground, #ededed)', 'important');
  focus.style.setProperty('border-color', isBase ? '#74baf2' : 'var(--vscode-descriptionForeground, #888)', 'important');
  if (selected.checked) focus.style.setProperty('box-shadow', 'inset 0 -2px currentColor', 'important');
  focus.style.overflow='hidden';focus.style.textOverflow='ellipsis';
  const openOptions=event=>{
    event.preventDefault();event.stopPropagation();
    if(document.querySelector('dialog[data-layer-options]'))return;
    const dialog=document.createElement('dialog'),form=document.createElement('form'),heading=document.createElement('strong');
    dialog.dataset.layerOptions=layer.id;dialog.setAttribute('aria-label','Layer options');
    dialog.style.cssText='max-width:min(24rem,90vw);max-height:85vh;overflow:auto;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background);border:1px solid var(--vscode-focusBorder);padding:12px';
    form.style.cssText='display:grid;gap:8px';heading.textContent=layer.label+' · '+focus.textContent;form.append(heading);dialog.append(form);
    callbacks.options(layer,form,()=>dialog.close());
    const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancel';cancel.onclick=()=>dialog.close();form.append(cancel);
    dialog.onclose=()=>{dialog.remove();container.querySelector('[data-preview-layer-focus="'+layer.id+'"]')?.focus();};
    document.body.append(dialog);dialog.showModal();
  };
  row.oncontextmenu=openOptions;
  focus.addEventListener('keydown',event=>{if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10')openOptions(event)});
  order.type='number';order.value=String(layer.order);order.min='0';order.max='4';order.dataset.layerOrder=layer.id;order.step='1';order.style.cssText='width:42px;min-width:0;box-sizing:border-box;padding:1px;font-size:11px';order.setAttribute('aria-label','Draw order for '+slotName);order.onchange=()=>{if(order.value.trim()&&Number.isFinite(Number(order.value))){const rank=Math.max(0,Math.min(4,Math.round(Number(order.value)))),others=ordered.filter(item=>item.id!==layer.id);callbacks.move(layer.id,others[rank]?.id||null);[...container.querySelectorAll('[data-layer-order]')].find(node=>node.dataset.layerOrder===layer.id)?.focus()}};
  const restore=()=>[...container.querySelectorAll('[data-preview-layer-focus]')].find(node=>node.dataset.previewLayerFocus===layer.id)?.focus();
  focus.onkeydown=event=>{if(!event.altKey||event.ctrlKey||event.metaKey||!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;event.preventDefault();event.stopPropagation();if(event.key==='Home')callbacks.move(layer.id,ordered[0].id);else if(event.key==='End')callbacks.move(layer.id,null);else if(event.key==='ArrowUp'&&index>0)callbacks.move(layer.id,ordered[index-1].id);else if(event.key==='ArrowDown'&&index<ordered.length-1)callbacks.move(layer.id,ordered[index+2]?.id||null);restore()};
  row.ondragstart=event=>{if(row.dataset.layerDragging==='true'||event.target?.closest?.('input,[data-layer-grip]')){event.preventDefault();return}event.dataTransfer.setData('application/x-ikemaker-preview-layer',layer.id);event.dataTransfer.effectAllowed='move'};
  row.ondragover=event=>{if([...event.dataTransfer.types].includes('application/x-ikemaker-preview-layer')){event.preventDefault();event.dataTransfer.dropEffect='move'}};
  row.ondrop=event=>{const id=event.dataTransfer.getData('application/x-ikemaker-preview-layer');if(!state.layers.some(item=>item.id===id))return;event.preventDefault();event.stopPropagation();const rect=row.getBoundingClientRect(),before=event.clientY<rect.top+rect.height/2;callbacks.move(id,before?layer.id:ordered[index+1]?.id||null)};
  const grip=document.createElement('span');grip.textContent='::';grip.setAttribute('aria-hidden','true');grip.title='Drag layer to change draw order';grip.style.cssText='cursor:grab;font-weight:bold;user-select:none';
  grip.dataset.layerGrip=layer.id;grip.style.cssText+=';touch-action:none;display:block;padding:4px 0';
  let pointer=null,dropRow=null,dropBefore=null,moved=false,startX=0,startY=0;
  const clearCue=()=>{if(dropRow){dropRow.style.removeProperty('box-shadow');delete dropRow.dataset.layerDrop}dropRow=null;dropBefore=null};
  const hit=(x,y)=>{
   clearCue();const candidates=[...container.querySelectorAll('[data-layer-id]')],bounds=container.getBoundingClientRect(),first=candidates[0]?.getBoundingClientRect(),last=candidates.at(-1)?.getBoundingClientRect();
   if(!first||!last||x<bounds.left||x>bounds.right||y<first.top-4||y>last.bottom+4)return null;
   const target=document.elementFromPoint(x,y)?.closest?.('[data-layer-id]');
   let node=target&&container.contains(target)?target:candidates.find(row=>{const r=row.getBoundingClientRect();return y>=r.top&&y<=r.bottom+4});if(!node&&y>=last.bottom)node=candidates.at(-1);if(!node)return null;
   const rect=node.getBoundingClientRect(),before=y<rect.top+rect.height/2,index=candidates.indexOf(node);dropRow=node;dropBefore=before?node.dataset.layerId:candidates[index+1]?.dataset.layerId||null;node.dataset.layerDrop=before?'before':'after';node.style.boxShadow=before?'inset 0 3px 0 var(--vscode-focusBorder, #4daafc)':'inset 0 -3px 0 var(--vscode-focusBorder, #4daafc)';return{before:dropBefore};
  };
  const finish=(event,commit)=>{if(pointer!==event.pointerId)return;const target=commit&&moved?hit(event.clientX,event.clientY):null;const captured=pointer;pointer=null;clearCue();row.draggable=true;delete row.dataset.layerDragging;row.style.removeProperty('outline');grip.style.cursor='grab';try{grip.releasePointerCapture(captured)}catch(_){}if(target){callbacks.move(layer.id,target.before);restore()}};
  grip.onpointerdown=event=>{if(event.button!==0||pointer!==null)return;event.preventDefault();event.stopPropagation();pointer=event.pointerId;startX=event.clientX;startY=event.clientY;moved=false;row.draggable=false;row.dataset.layerDragging='true';row.style.outline='2px dashed var(--vscode-focusBorder, #4daafc)';grip.style.cursor='grabbing';grip.setPointerCapture(event.pointerId)};
  grip.onpointermove=event=>{if(pointer!==event.pointerId)return;event.preventDefault();event.stopPropagation();if(Math.hypot(event.clientX-startX,event.clientY-startY)>2)moved=true;if(moved)hit(event.clientX,event.clientY)};
  grip.onpointerup=event=>{event.preventDefault();event.stopPropagation();finish(event,true)};grip.onpointercancel=event=>finish(event,false);grip.onlostpointercapture=event=>finish(event,false);

  for(const checkbox of [selected,show])checkbox.style.cssText='width:14px;min-width:0;height:14px;min-height:0;margin:0;padding:0';
  row.append(grip,selected,show,focus,order);
  container.append(row);
 }
 const layer=state.layers.find(item=>item.id===state.primary);
 if(layer&&layer.id!=='base'){
  const paletteLabel=document.createElement('label'),follow=document.createElement('input');
  follow.type='checkbox';follow.checked=layer.followBasePalette!==false;
  follow.dataset.layerPalette=layer.id;
  follow.onchange=()=>callbacks.runtime(layer.id,{followBasePalette:follow.checked});
  paletteLabel.title='Use the palette displayed on the base sprite. Clear to use this layer’s embedded palette.';
  paletteLabel.append(follow,document.createTextNode('Follow sprite palette'));container.append(paletteLabel);
  const details=document.createElement('details'),summary=document.createElement('summary'),label=document.createElement('label'),independent=document.createElement('input'),priority=document.createElement('input');summary.textContent='Game rendering';details.append(summary);independent.type='checkbox';independent.checked=layer.runtimeRendering==='independent';independent.onchange=()=>callbacks.runtime(layer.id,{runtimeRendering:independent.checked?'independent':'grouped'});label.append(independent,document.createTextNode('Independent game layer (other sprites may interleave)'));priority.type='number';priority.step='1';priority.value=String(layer.runtimePriority);priority.disabled=!independent.checked;priority.setAttribute('aria-label','Independent game priority for '+layer.label);priority.title='Game sprite priority, separate from preview draw order';priority.onchange=()=>{if(priority.value.trim()&&Number.isInteger(Number(priority.value)))callbacks.runtime(layer.id,{runtimePriority:Number(priority.value)})};details.append(label,priority);
  for(const [key,caption] of [['castShadow','Cast stage shadow'],['showReflection','Show stage reflection']]){
   const row=document.createElement('label'),check=document.createElement('input');
   check.type='checkbox';check.checked=layer[key]===true;
   check.onchange=()=>callbacks.runtime(layer.id,{[key]:check.checked});
   row.append(check,document.createTextNode(caption));details.append(row);
  }
  container.append(details);
 }

}
module.exports={renderPreviewLayerList,clientSource:()=>renderPreviewLayerList.toString()};
function installLayerWorkspaceLauncher(panel,redraw){
 const host=document.getElementById('stage')||document.querySelector('canvas')?.parentElement||panel.parentElement;
 const button=document.createElement('button');button.type='button';button.textContent='Preview layers';button.dataset.previewLayersLauncher='true';button.setAttribute('aria-controls',panel.id);button.title='Open a split workspace for the five preview layers';button.style.cssText='position:absolute;right:6px;top:6px;z-index:20;width:auto;max-width:140px;min-height:24px;padding:3px 7px;flex:none;font-size:12px';if(typeof getComputedStyle==='function'&&getComputedStyle(host).position==='static')host.style.position='relative';
 const setOpen=open=>{panel.hidden=!open;panel.style.setProperty?.('display',open?'block':'none','important');button.setAttribute('aria-expanded',String(open));redraw?.()};
 button.onclick=()=>setOpen(panel.hidden);host.append(button);
 const close=document.createElement('button');close.type='button';close.textContent='Close layers';close.onclick=()=>{setOpen(false);button.focus()};panel.prepend(close);setOpen(false);
 return {open:()=>setOpen(true),close:()=>setOpen(false)};
}
module.exports.launcherSource=()=>`(${installLayerWorkspaceLauncher.toString()})`;
function compactLayerTransformFields(fields,prefix,nudge,current){
 let note=fields.querySelector('[data-layer-transform-note]');if(!note){note=document.createElement('p');note.dataset.layerTransformNote='true';note.setAttribute('role','status');note.style.cssText='grid-column:1/-1;margin:3px 0;font-size:11px;line-height:1.3';fields.append(note)}note.textContent=current?.id==='base'?'Base X/Y is the reference for every exported layer offset. Moving Base changes those game offsets.':current?.runtimeRendering!=='independent'?(current?.source?.kind==='animation'?'AIR controls accessory timing. Choose pause and visibility rules in Use layer in game.':'In game, the body layer follows the character’s pose. X/Y is relative to Base. Other transform controls here affect the preview.'):'Independent game layer: other sprites may interleave at its game priority.';
 if(fields.querySelector('[data-layer-transform-pair]'))return;
 const pair=document.createElement('div');pair.dataset.layerTransformPair='true';pair.style.cssText='display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:5px;grid-column:1/-1';
 const lookup=key=>document.getElementById(prefix+key);
 for(const [key,label,minus,plus]of [['x','X','←','→'],['y','Y','↑','↓']]){
  const field=lookup(key);if(!field)continue;
  const old=field.closest('label'),caption=[...fields.querySelectorAll('label')].find(node=>node.htmlFor===field.id),wrap=document.createElement('label'),stepper=document.createElement('span');wrap.textContent=label;wrap.style.cssText='display:flex;flex-direction:column;min-width:0;font-size:11px';stepper.style.cssText='display:flex;align-items:center;gap:2px;min-width:0';
  const before=document.createElement('button'),after=document.createElement('button');for(const [button,text,delta]of [[before,minus,-1],[after,plus,1]]){button.type='button';button.textContent=text;button.title='Move '+label+' '+(delta<0?'negative':'positive');button.setAttribute('aria-label',button.title);button.style.cssText='flex:0 0 23px;width:23px!important;min-width:23px!important;max-width:23px!important;height:24px;min-height:24px;padding:0!important';button.onclick=()=>nudge(key,delta)}
  field.style.cssText='min-width:0;width:100%;flex:1;box-sizing:border-box;font-size:12px;padding:2px';stepper.append(before,field,after);wrap.append(stepper);pair.append(wrap);if(old)old.remove();else caption?.remove();
 }
 fields.prepend(pair);pair.after(note);
}
module.exports.compactSource=()=>compactLayerTransformFields.toString();
