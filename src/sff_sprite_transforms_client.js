'use strict';

function installSpriteTransforms() {
  const opener = document.getElementById('sffTransformSprites');
  let serial = 0, active = null;
  function close(record) {
    record.dialog.remove();
    if (active === record) {
      vscode.postMessage({type:'spriteTransformCancel',token:record.token});
      active = null; serial++; opener.focus();
    }
  }
  opener.onclick = () => {
    if (!selected) { error.textContent='Select at least one sprite first.'; return; }
    if (dirtyAxes.size || pendingSpriteNames.size) { error.textContent='Save pending sprite axes and names before reviewing transforms.'; return; }
    active?.dialog.remove();
    const indices = selectedIndices.size ? [...selectedIndices] : [selected.index];
    const selection = indices.map(index => model.sprites[index]).filter(Boolean).map(sprite => ({index:sprite.index,group:sprite.group,number:sprite.number}));
    const dialog=document.createElement('dialog');dialog.id='sffSpriteTransformReview';dialog.setAttribute('aria-label','Transform selected sprites');
    dialog.style.cssText='max-width:95vw;max-height:90vh;overflow:auto;background:var(--vscode-editor-background);color:var(--vscode-foreground)';
    const title=document.createElement('h2'),note=document.createElement('p'),operation=document.createElement('select'),fields=document.createElement('div'),review=document.createElement('button'),apply=document.createElement('button'),cancel=document.createElement('button'),status=document.createElement('p'),results=document.createElement('div');
    title.textContent='Transform '+selection.length+' selected sprite(s)';
    note.textContent='Review the before/after image, size, axes and link changes before applying. Palette assignments and archive order stay intact. Flips and right-angle turns rearrange pixels exactly. Scale and free rotation resample; nearest keeps existing pixels, area preserves indexed colors, and bilinear blends truecolor only. Each image is limited to one million pixels; batches to 16 million pixels. RGB24 canvas padding is opaque black. SFF v1 supports axis shifts only.';
    operation.setAttribute('aria-label','Sprite transform operation');
    const operations=[['crop','Crop transparent padding'],['canvas','Resize canvas'],['scale','Scale pixels'],['flip-x','Flip horizontally'],['flip-y','Flip vertically'],['rotate-cw','Rotate 90° clockwise'],['rotate-ccw','Rotate 90° counterclockwise'],['rotate-180','Rotate 180°'],['rotate-free','Rotate by degrees'],['shift-axes','Shift axes only']];
    for(const [value,label]of operations){const option=document.createElement('option');option.value=value;option.textContent=label;operation.append(option)}
    const inputs={};
    for(const [key,label,value]of [['width','Canvas width',selected.width],['height','Canvas height',selected.height],['percentX','Scale X percent',100],['percentY','Scale Y percent',100],['x','Axis shift X',0],['y','Axis shift Y',0],['degrees','Clockwise degrees',45],['offsetX','Rotation placement X',0],['offsetY','Rotation placement Y',0]]){
      const wrap=document.createElement('label'),input=document.createElement('input');input.type='number';input.value=value;input.setAttribute('aria-label',label);wrap.append(label+' ',input);fields.append(wrap);inputs[key]={input,wrap};
    }
    const anchor=document.createElement('select'),anchorWrap=document.createElement('label');anchor.setAttribute('aria-label','Canvas placement');
    for(const [value,label]of [['center','Center'],['top-left','Top left'],['bottom-center','Bottom center']]){const option=document.createElement('option');option.value=value;option.textContent=label;anchor.append(option)}
    anchorWrap.append('Canvas placement ',anchor);fields.append(anchorWrap);
    const pivot=document.createElement('select'),pivotWrap=document.createElement('label'),interpolation=document.createElement('select'),interpolationWrap=document.createElement('label'),fit=document.createElement('input'),fitWrap=document.createElement('label');
    for(const [value,label]of [['sprite','Sprite center'],['axis','Axis'],['top-left','Top left']]){const option=document.createElement('option');option.value=value;option.textContent=label;pivot.append(option)}
    for(const [value,label]of [['nearest','Nearest existing pixel'],['area','Area / index-preserving'],['bilinear','Bilinear · truecolor only']]){const option=document.createElement('option');option.value=value;option.textContent=label;interpolation.append(option)}
    pivot.setAttribute('aria-label','Rotation or flip pivot');interpolation.setAttribute('aria-label','Pixel interpolation');fit.type='checkbox';fit.checked=true;
    pivotWrap.append('Pivot ',pivot);interpolationWrap.append('Interpolation ',interpolation);fitWrap.append(fit,' Fit rotation canvas automatically');fields.append(pivotWrap,interpolationWrap,fitWrap);
    review.textContent='Review transform';apply.textContent='Apply reviewed transforms';apply.disabled=true;cancel.textContent='Cancel';status.setAttribute('role','status');
    dialog.append(title,note,operation,fields,review,apply,cancel,status,results);document.body.append(dialog);
    const record={dialog,selection,status,results,apply,review,cancel,request:0,token:null,busy:false};active=record;
    function invalidate(){record.request=++serial;record.token=null;apply.disabled=true;status.textContent='Settings changed. Review again before applying.';results.textContent=''}
    function syncFields(){
      for(const [key,{wrap}]of Object.entries(inputs))wrap.hidden=!((operation.value==='canvas'&&['width','height'].includes(key))||(operation.value==='scale'&&['percentX','percentY'].includes(key))||(operation.value==='shift-axes'&&['x','y'].includes(key))||(operation.value==='rotate-free'&&(key==='degrees'||!fit.checked&&['width','height','offsetX','offsetY'].includes(key))));
      anchorWrap.hidden=operation.value!=='canvas';pivotWrap.hidden=!/^(flip-|rotate-)/.test(operation.value);interpolationWrap.hidden=!['scale','rotate-free'].includes(operation.value);fitWrap.hidden=operation.value!=='rotate-free';invalidate();
    }
    operation.onchange=syncFields;anchor.onchange=pivot.onchange=interpolation.onchange=invalidate;fit.onchange=syncFields;
    for(const {input}of Object.values(inputs))input.oninput=invalidate;
    review.onclick=()=>{
      const options={anchor:anchor.value,pivot:pivot.value,interpolation:interpolation.value,fit:fit.checked};for(const [key,{input,wrap}]of Object.entries(inputs))if(!wrap.hidden){if(input.value===''){status.textContent='Complete every visible numeric field.';return}options[key]=Number(input.value)}
      record.request=++serial;record.token=null;apply.disabled=true;status.textContent='Preparing and reopening the candidate archive…';
      vscode.postMessage({type:'spriteTransformReview',requestId:record.request,selection,operation:operation.value,options});
    };
    apply.onclick=()=>{if(!record.token||record.busy)return;record.busy=true;apply.disabled=true;review.disabled=true;cancel.disabled=true;status.textContent='Saving reviewed transforms…';vscode.postMessage({type:'spriteTransformApply',token:record.token,requestId:record.request})};
    cancel.onclick=()=>{if(!record.busy)close(record)};dialog.addEventListener('cancel',event=>{if(record.busy){event.preventDefault();return}close(record)});
    syncFields();dialog.showModal();operation.focus();
  };
  addEventListener('message',event=>{
    const message=event.data,record=active;if(!record||message.requestId!==record.request)return;
    if(message.type==='spriteTransformError'){record.busy=false;record.review.disabled=false;record.cancel.disabled=false;record.apply.disabled=true;record.status.textContent=message.message;return}
    if(message.type!=='spriteTransformReview')return;
    record.token=message.token;record.apply.disabled=false;record.results.textContent='';
    record.status.textContent=message.changes.length+' reviewed sprites. '+message.materialized.length+' unselected shared-image sources preserved independently; '+message.relinked.length+' remaining links retargeted to those unchanged pixels. '+message.warning;
    for(const change of message.changes){
      const row=document.createElement('section'),label=document.createElement('p'),before=document.createElement('img'),after=document.createElement('img');
      label.textContent=change.group+','+change.number+' · '+change.before.width+'×'+change.before.height+' axis '+change.before.axisX+','+change.before.axisY+' → '+change.after.width+'×'+change.after.height+' axis '+change.after.axisX+','+change.after.axisY+(change.detached?' · selected link becomes independent':'');
      before.src=change.beforeUri;after.src=change.afterUri;before.alt='Before '+change.group+','+change.number;after.alt='After '+change.group+','+change.number;
      for(const img of [before,after])img.style.cssText='width:240px;height:240px;max-width:100%;object-fit:contain;image-rendering:pixelated;margin:6px;background:repeating-conic-gradient(#666 0% 25%,#444 0% 50%) 50%/12px 12px';
      row.append(label,before,after);record.results.append(row);
    }
  });
}
function clientScript(){return '('+installSpriteTransforms.toString()+')();';}
module.exports={clientScript};
