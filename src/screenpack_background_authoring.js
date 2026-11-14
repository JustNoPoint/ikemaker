'use strict';
const {parseDef,setSectionEntry}=require('./def_model');

function validBackgroundEdit(message) {
  const keys=['type','generation','screenIndex','backgroundIndex','line','x','y','layer'];
  return message&&message.type==='applyBackgroundPlane'&&Number.isInteger(message.generation)&&Object.keys(message).sort().join('|')===keys.sort().join('|')&&
    ['screenIndex','backgroundIndex','line'].every(key=>Number.isInteger(message[key])&&message[key]>=0&&message[key]<100000)&&
    ['x','y'].every(key=>Number.isFinite(message[key])&&Math.abs(message[key])<=10000000)&&[-1,0,1].includes(message.layer);
}
function validPlaneMove(message) {
  const keys=['type','generation','screenIndex','fromLine','toLine'];
  return message?.type==='moveBackgroundPlane' && Object.keys(message).length===keys.length &&
    keys.every(key=>Object.hasOwn(message,key)) &&
    keys.slice(1).every(key=>Number.isSafeInteger(message[key])&&message[key]>=0) &&
    message.fromLine!==message.toLine;
}
function moveBackgroundPlane(text,payload,message) {
  if(!validPlaneMove(message))throw Error('Choose two background planes on the same page.');
  const planes=payload.model.screens[message.screenIndex]?.backgrounds||[];
  const from=planes.findIndex(item=>item.line===message.fromLine);
  const to=planes.findIndex(item=>item.line===message.toLine);
  if(from<0||to<0||planes[from].layer!==planes[to].layer)throw Error('Choose a destination in the same drawing layer.');
  const group=planes.filter(plane=>plane.layer===planes[from].layer);
  const destination=group.indexOf(planes[to]);
  group.splice(destination,0,group.splice(group.indexOf(planes[from]),1)[0]);
  let slot=0;
  const reordered=planes.map(plane=>plane.layer===planes[from].layer?group[slot++]:plane);
  const document=parseDef(text,payload.filename);
  const sections=new Map(document.sections.filter(section=>section.name).map(section=>[section.line,section]));
  const anchors=ordered=>{
    const links=new Map();let anchor=null;
    for(const item of ordered){
      const source=sections.get(item.line);
      if(!/bg(?:\s|$)/.test(source?.normalized || ''))throw Error('The background plane changed.');
      const value=source.entries.find(entry=>entry.normalized==='positionlink')?.value??'0';
      if(Number(value)!==0)links.set(item.line,anchor);
      else anchor=item.line;
    }
    return links;
  };
  const originalLinks=anchors(planes);
  for(const [line,anchor] of anchors(reordered)){
    if(originalLinks.get(line)!==anchor)throw Error('This move would change the source plane used by positionlink.');
  }
  // Replace only BG section slots. BGCtrl, Info and other sections keep their order.
  const bom=text.startsWith('\uFEFF')?'\uFEFF':'';
  const lines=text.slice(bom.length).split(/\r?\n/),ending=text.includes('\r\n')?'\r\n':'\n';
  const trailing=text.endsWith('\n');
  if(trailing)lines.pop();
  const starts=[...sections.keys()];
  const ends=new Map(starts.map((line,n)=>[line,starts[n+1]??lines.length]));
  const replacements=new Map(planes.map((plane,index)=>[plane.line,reordered[index].line]));
  const output=[lines.slice(0,starts[0]).join(ending)];
  if(!starts[0])output.pop();
  for(const line of starts){
    const source=replacements.get(line)??line;
    output.push(lines.slice(source,ends.get(source)).join(ending));
  }
  return {text:bom+output.join(ending)+(trailing?ending:''),description:planes[from].name+' → position of '+planes[to].name+' (drawing layer '+planes[from].layer+')'};
}
function backgroundEdit(text,payload,message) {
  if(!validBackgroundEdit(message))throw Error('Choose an exact background plane and finite coordinates.');
  const screen=payload.model.screens[message.screenIndex],item=screen?.backgrounds?.[message.backgroundIndex];
  if(!item||item.line!==message.line)throw Error('The selected background plane changed. Refresh and try again.');
  let document=parseDef(text,payload.filename);
  const section=document.sections.find(section=>section.name && section.line===item.line);
  if(!section||!/bg(?:\s|$)/.test(section.normalized))throw Error('The exact native background section is unavailable.');
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
function layerStackHtml() {
  return `<details id="screenpackLayerStack"><summary><b>Layers</b> · back to front</summary><p id="screenpackLayerScope" class="small"></p><label id="hudDepthGuideField" hidden><input id="hudDepthGuide" type="checkbox"> Show fighter and foreground depth guides</label><div id="screenpackLayerRows" aria-label="Layers in preview draw order"></div></details>`;
}

// Serialized into the native screenpack viewer, sharing its current page and editor state.
function layerStackClient() {
  const stack=document.getElementById('screenpackLayerStack');
  const rows=document.getElementById('screenpackLayerRows');
  const planeSelect=document.getElementById('backgroundPlane');
  let moving=null;
  function movePlane(from,to) {
    if(from===to)return;
    const changed=globalThis.ikemenHasUnappliedForms?.();
    if(changed){document.getElementById('screenpackLayerScope').textContent='Apply or discard pending edits before reordering planes.';return;}
    post('moveBackgroundPlane',{screenIndex,fromLine:from,toLine:to});
  }
  function paintStack() {
    if (!stack.open) return;
    const active=document.activeElement;
    const focusRow=active?.closest('#screenpackLayerRows [data-layer-kind]');
    const focusKey=focusRow && [focusRow.dataset.layerKind,focusRow.dataset.sourceIndex,active.tagName].join(':');
    const screen=current(), backgrounds=screen.backgrounds||[], elements=screen.elements||[];
    const hud=data.type==='lifebar';
    document.getElementById('hudDepthGuideField').hidden=!hud;
    const activePlane=document.getElementById('screenpackBackgroundEditor').open?planeSelect.value:null;
    const hasGrid=screen.normalized==='select info'&&model.selectGrid;
    rows.replaceChildren();
    document.getElementById('screenpackLayerScope').textContent=hud
      ? 'Current HUD component. Passes −1 and 0 draw behind normal fighters. Pass 1 draws above the stage foreground. Pass 2 draws above foreground sprites.'
      : 'Select a layer to edit it. Uncheck Show to hide it in the preview.';
    function append(kind,index,name,description,key,selected,choose) {
      const row=document.createElement('div'), select=document.createElement('button'), label=document.createElement('label'), show=document.createElement('input');
      row.dataset.layerKind=kind;row.dataset.sourceIndex=String(index);row.style.cssText='display:flex;align-items:center;gap:4px;margin:3px 0;min-width:0';
      select.type='button';select.textContent=name;select.title=description;
      select.setAttribute('aria-label',name+' · '+description);
      select.setAttribute('aria-pressed',String(selected));
      select.style.cssText='flex:1;min-width:0;white-space:normal;text-align:left;overflow-wrap:anywhere';
      if(selected)select.classList.add('active');
      select.onclick=choose;
      show.type='checkbox';show.checked=!previewHidden.has(key);show.setAttribute('aria-label','Show '+name+' in preview');
      show.onchange=()=>{
        if(show.checked) previewHidden.delete(key); else previewHidden.add(key);
        saveView();list();render();inspect();
      };
      label.append(show,' Show');row.append(select,label);rows.append(row);
      for(const control of [select,show])if(focusKey===[kind,String(index),control.tagName].join(':'))control.focus({preventScroll:true});
      return row;
    }
    function bg(layer) {
      backgrounds.forEach((item,index)=>{
        if(item.layer!==layer)return;
        const repeated=backgrounds.some((other,n)=>n!==index&&other.name===item.name);
        const name=repeated?item.name+' (line '+(item.line+1)+')':item.name;
        const inactive=layer===-1&&!inMatchPage(screen.normalized);
        const row=append('background',index,'BG '+layer+' · '+name+(inactive?' (inactive in stock menus)':''),'Background plane '+(index+1),'bg:'+screenIndex+':'+item.line,
          activePlane===String(index),()=>{
            document.getElementById('screenpackBackgroundEditor').open=true;
            planeSelect.value=String(index);
            planeSelect.dispatchEvent(new Event('change'));
            document.getElementById('backgroundX').focus();
            paintStack();
          });
        row.draggable=true;
        row.ondragstart=e=>{moving={screen:screenIndex,line:item.line,layer};e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',String(item.line));};
        row.ondragend=()=>{moving=null;};
        row.ondragover=e=>{if(moving?.screen===screenIndex&&moving.layer===layer)e.preventDefault();};
        row.ondrop=e=>{if(moving?.screen===screenIndex&&moving.layer===layer){e.preventDefault();movePlane(moving.line,item.line);}moving=null;};
        const siblings=backgrounds.filter(bg=>bg.layer===layer),at=siblings.indexOf(item);
        for(const [delta,symbol,meaning] of [[-1,'↑','backward'],[1,'↓','forward']]){
          const move=document.createElement('button');move.type='button';move.textContent=symbol;
          move.title='Move '+name+' '+meaning+' within layer '+layer;move.setAttribute('aria-label',move.title);
          move.disabled=!siblings[at+delta];move.onclick=()=>movePlane(item.line,siblings[at+delta].line);
          row.append(move);
        }
      });
    }
    const match=!hud&&inMatchPage(screen.normalized);
    const passes=match?[-1,0,1,2,3]:[-1,0,1,2];
    const order=screen.hudDrawOrder||elements.map((_,index)=>index);
    for(const pass of passes){
      if(pass===-1||pass===0||match&&pass===1)bg(pass);
      if(pass===0&&hasGrid)append('grid',0,'Character grid','Select screen layout','grid:'+screenIndex,false,()=>{
      const gridRows=document.getElementById('gridRows');
      if(gridRows)gridRows.focus(); else document.getElementById('openSelectLayout')?.click();
    });
    for(const index of order){
      const item=elements[index];
      if(!item||previewPass(item.layer,match,hud)!==pass||hasGrid&&gridElement(item.base))continue;
      append('element',index,'L'+pass+' · '+item.name,'Page element '+(index+1),elementStateKey(screenIndex,index),selectedIndices.has(index),e=>chooseElements(index,e));
    }
      if(pass===1&&!match)bg(1);
    }
    if(!rows.childElementCount)rows.textContent='No layers on this page.';
  }
  document.getElementById('hudDepthGuide').onchange=()=>render();
  stack.addEventListener('toggle',paintStack);
  planeSelect.addEventListener('change',paintStack);
  document.getElementById('backgroundLayer').addEventListener('input',paintStack);
  document.getElementById('discardBackgroundPlane').addEventListener('click',paintStack);
  const updateList=list;
  list=(...args)=>{const result=updateList(...args);paintStack();return result};
}
module.exports={validPlaneMove,moveBackgroundPlane,layerStackHtml,layerStackClient,validBackgroundEdit,backgroundEdit,backgroundControlsHtml,backgroundAuthoringClientScript};
