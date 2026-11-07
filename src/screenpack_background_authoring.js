'use strict';
const {parseDef,setSectionEntry}=require('./def_model');

function validBackgroundEdit(message) {
  const keys=['type','generation','screenIndex','backgroundIndex','line','x','y','layer'];
  return message&&message.type==='applyBackgroundPlane'&&Number.isInteger(message.generation)&&Object.keys(message).sort().join('|')===keys.sort().join('|')&&
    ['screenIndex','backgroundIndex','line'].every(key=>Number.isInteger(message[key])&&message[key]>=0&&message[key]<100000)&&
    ['x','y'].every(key=>Number.isFinite(message[key])&&Math.abs(message[key])<=10000000)&&[-1,0,1].includes(message.layer);
}
function backgroundEdit(text,payload,message) {
  if(!validBackgroundEdit(message))throw Error('Choose an exact background plane and finite coordinates.');
  const screen=payload.model.screens[message.screenIndex],item=screen?.backgrounds?.[message.backgroundIndex];
  if(!item||item.line!==message.line)throw Error('The selected background plane changed. Refresh and try again.');
  let document=parseDef(text,payload.filename);
  const section=document.sections.find(section=>section.line===item.line);
  if(!section||!section.normalized.includes('bg '))throw Error('The exact native background section is unavailable.');
  const start=`${message.x}, ${message.y}`;
  let next=setSectionEntry(document,item.line,'start',start);
  document=parseDef(next,payload.filename);
  next=setSectionEntry(document,item.line,'layerno',String(message.layer));
  return {text:next,item,screen,description:`[${section.name}]\nstart = ${start}\nlayerno = ${message.layer}`};
}
function backgroundControlsHtml() {
  return `<details id="screenpackBackgroundEditor" class="viewer-specialty"><summary><b>Background planes</b></summary><p class="small">Choose native artwork, then adjust its position or drawing layer. Changes preview immediately.</p><label class="row"><span>Plane</span><select id="backgroundPlane" aria-label="Background plane"></select></label><label class="row"><span>Start X</span><input id="backgroundX" type="number" aria-label="Background start X"></label><label class="row"><span>Start Y</span><input id="backgroundY" type="number" aria-label="Background start Y"></label><label class="row"><span>Layer</span><select id="backgroundLayer" aria-label="Background drawing layer"><option value="-1">-1 · rear</option><option value="0">0 · behind UI</option><option value="1">1 · foreground</option></select></label><label><input id="backgroundDrag" type="checkbox"> Drag this plane on the canvas</label><div class="guide" style="margin-top:6px"><button id="applyBackgroundPlane">Review and apply plane</button><button id="discardBackgroundPlane">Discard plane preview</button></div><p class="small" id="backgroundPlaneStatus" role="status" aria-live="polite"></p></details>`;
}
function backgroundAuthoringClientScript(){return `
(()=>{
 const select=document.getElementById('backgroundPlane'),x=document.getElementById('backgroundX'),y=document.getElementById('backgroundY'),layer=document.getElementById('backgroundLayer'),dragToggle=document.getElementById('backgroundDrag'),apply=document.getElementById('applyBackgroundPlane'),discard=document.getElementById('discardBackgroundPlane'),note=document.getElementById('backgroundPlaneStatus');
 if(!select)return;let page=-1,plane=0,dragging=null;const originals=new Map();
 const key=()=>screenIndex+':'+plane,planes=()=>current().backgrounds||[],item=()=>planes()[plane],dirty=()=>originals.size>0;
 function inspectPlane(){const value=item();for(const node of [x,y,layer,dragToggle,apply,discard])node.disabled=!value;if(!value){note.textContent='This page has no native background planes.';return}x.value=value.start[0];y.value=value.start[1];layer.value=String(value.layer);const changed=originals.has(key());apply.disabled=!changed;discard.disabled=!changed;note.textContent=(value.sprite?'Sprite '+value.sprite.join(','):value.action!==null?'Animation '+value.action:'Native '+value.type)+' · line '+(value.line+1)+(changed?' · preview changes; apply to save.':' · source order '+(plane+1)+' / '+planes().length);}
 function sync(){if(page!==screenIndex){page=screenIndex;plane=0;dragging=null;dragToggle.checked=false}select.innerHTML='';for(let i=0;i<planes().length;i++){const option=document.createElement('option');option.value=i;option.textContent=(i+1)+'. '+planes()[i].name;select.appendChild(option)}select.value=String(plane);select.disabled=!planes().length;inspectPlane()}
 function preview(){const value=item();if(!value)return;const nx=Number(x.value),ny=Number(y.value),nl=Number(layer.value);if(!Number.isFinite(nx)||!Number.isFinite(ny)||Math.abs(nx)>10000000||Math.abs(ny)>10000000||![-1,0,1].includes(nl))return;if(!originals.has(key()))originals.set(key(),{value,start:[...value.start],layer:value.layer});value.start=[nx,ny];value.layer=nl;const original=originals.get(key());if(nx===original.start[0]&&ny===original.start[1]&&nl===original.layer)originals.delete(key());inspectPlane();render()}
 for(const node of [x,y,layer])node.addEventListener('input',preview);select.onchange=()=>{plane=Number(select.value);inspectPlane();render()};
 discard.onclick=()=>{const original=originals.get(key());if(original){original.value.start=original.start;original.value.layer=original.layer;originals.delete(key())}inspectPlane();render()};
 apply.onclick=()=>{const value=item();if(value&&originals.has(key()))post('applyBackgroundPlane',{screenIndex,backgroundIndex:plane,line:value.line,x:value.start[0],y:value.start[1],layer:value.layer})};
 canvas.addEventListener('mousedown',event=>{if(!dragToggle.checked||!item())return;event.preventDefault();event.stopImmediatePropagation();canvas.focus();dragging={x:event.clientX,y:event.clientY,start:[...item().start]};},true);
 window.addEventListener('mousemove',event=>{if(!dragging)return;event.stopImmediatePropagation();const bounds=canvas.getBoundingClientRect();x.value=Math.round((dragging.start[0]+(event.clientX-dragging.x)*canvas.width/bounds.width)*1000)/1000;y.value=Math.round((dragging.start[1]+(event.clientY-dragging.y)*canvas.height/bounds.height)*1000)/1000;preview()},true);
 window.addEventListener('mouseup',()=>dragging=null,true);
 canvas.addEventListener('keydown',event=>{if(!dragToggle.checked||!item()||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();event.stopImmediatePropagation();const step=event.shiftKey?10:1;x.value=Number(x.value)+(event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0);y.value=Number(y.value)+(event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0);preview()},true);
 const baseList=list;list=(...args)=>{const result=baseList(...args);sync();return result};
 const hadForms=globalThis.ikemenHasUnappliedForms,canKeep=globalThis.ikemenCanKeepDraft;
 globalThis.ikemenHasUnappliedForms=()=>dirty()||Boolean(hadForms?.());globalThis.ikemenCanKeepDraft=()=>!dirty()&&Boolean(canKeep?.());
 sync();
})();`;}
module.exports={validBackgroundEdit,backgroundEdit,backgroundControlsHtml,backgroundAuthoringClientScript};
