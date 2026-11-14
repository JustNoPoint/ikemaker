'use strict';

const { randomUUID } = require('node:crypto');

function validRect(rect, width, height) {
  return rect && ['x','y','width','height'].every(k => Number.isSafeInteger(rect[k])) &&
    rect.x >= 0 && rect.y >= 0 && rect.width > 0 && rect.height > 0 &&
    rect.x + rect.width <= width && rect.y + rect.height <= height;
}

function validCut(cut, width, height) {
  if (!validRect(cut, width, height)) return false;
  if (cut.id !== undefined && (typeof cut.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(cut.id))) return false;
  if (cut.written !== undefined && typeof cut.written !== 'boolean') return false;
  if (cut.identity !== undefined && (!cut.identity || !['group','index'].every(key => Number.isSafeInteger(cut.identity[key]) && cut.identity[key] >= 0 && cut.identity[key] <= 65535))) return false;
  return cut.polygon === undefined || (Array.isArray(cut.polygon) && cut.polygon.length >= 3 && cut.polygon.length <= 256 && cut.polygon.every(point => Number.isSafeInteger(point?.x) && Number.isSafeInteger(point?.y) && point.x >= cut.x && point.y >= cut.y && point.x < cut.x + cut.width && point.y < cut.y + cut.height));
}

function copyCut(cut) {
  return { ...cut, ...(cut.polygon ? {polygon:cut.polygon.map(point => ({x:point.x,y:point.y}))} : {}), ...(cut.identity ? {identity:{group:cut.identity.group,index:cut.identity.index}} : {}) };
}

// The importing Quick Add session owns the modal and the pending response.
async function reviewQuickSheetCuts(api, model, panel, signal) {
  if (!panel?.webview) throw Error('Open Sprite Sheet from Quick Add to review the detected cuts.');
  if (signal?.aborted) return null;
  const token = randomUUID();
  return new Promise((resolve, reject) => {
    const listeners = [];
    let settled = false;
    function finish(value, error) {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', abort);
      for (const listener of listeners) listener.dispose();
      if (error) reject(error); else resolve(value);
    }
    function abort() {
      Promise.resolve(panel.webview.postMessage({type:'sheetCutsDismiss',token})).catch(()=>{});
      finish(null);
    }
    listeners.push(panel.onDidDispose(() => finish(null)));
    listeners.push(panel.webview.onDidReceiveMessage(message => {
      if (message?.type !== 'sheetCutsResult' || message.token !== token) return;
      if (message.cancelled === true) return finish(null);
      const advanced = model.advanced === true;
      const action = advanced && message.action === 'stage' ? 'stage' : 'apply';
      const cuts = message.rectangles;
      const allCuts = Array.isArray(message.allCuts) ? message.allCuts : cuts;
      const ids = new Set();
      if (!Array.isArray(cuts) || (action === 'apply' && !cuts.length) || cuts.length > 4096 || !cuts.every(r=>validCut(r,model.width,model.height)) ||
          !Array.isArray(allCuts) || allCuts.length > 4096 || !allCuts.every(r=>validCut(r,model.width,model.height)) ||
          allCuts.some(cut => cut.id !== undefined && (ids.has(cut.id) || (ids.add(cut.id), false))) ||
          (action === 'apply' && cuts.some(cut => cut.id !== undefined && !ids.has(cut.id)))) {
        return finish(null, Error('The reviewed cuts exceed the sheet bounds or frame limit.'));
      }
      if (!advanced) return finish({rectangles:cuts.map(({x,y,width,height})=>({x,y,width,height}))});
      finish({action,rectangles:cuts.map(copyCut),allCuts:allCuts.map(copyCut)});
    }));
    signal?.addEventListener('abort', abort, {once:true});
    Promise.resolve(panel.webview.postMessage({type:'sheetCutsReview',token,width:model.width,height:model.height,layerCount:model.layerCount,
      rectangles:model.rectangles,advanced:model.advanced===true,warnings:model.warnings||[],image:'data:image/png;base64,'+model.previewPng.toString('base64')}))
      .then(delivered=>{if(delivered===false)finish(null);},error=>finish(null,error));
  });
}

function styles() { return `
#quickSheetCuts {box-sizing:border-box;width:min(1120px,97vw);max-height:94vh;overflow:auto;padding:10px;border:1px solid var(--vscode-focusBorder);background:var(--vscode-editor-background);color:var(--vscode-foreground);font:inherit}
#quickSheetCuts::backdrop {background:#0009}
#quickSheetCuts [hidden] {display:none !important}
#quickSheetCuts h2 {font-size:1.1em;margin:0}
#quickSheetCuts .cut-bar {display:flex;flex-wrap:wrap;align-items:center;gap:5px;margin:5px 0}
#quickSheetCuts input {width:6ch} #quickSheetCuts .cut-view {height:clamp(120px,49vh,500px);overflow:auto;background:var(--vscode-sideBar-background)}
#quickSheetCuts svg {display:block;max-width:none;touch-action:none;image-rendering:pixelated;background:repeating-conic-gradient(#484848 0% 25%,#363636 0% 50%) 0 0 / 16px 16px}
#quickSheetCuts svg rect {vector-effect:non-scaling-stroke;stroke:#67e1ff;stroke-width:1.5;fill:transparent}
#quickSheetCuts svg rect.selected {stroke:#ffca52;stroke-width:2.5;fill:#ffd65c22}
#quickSheetCuts svg rect.grip {fill:#ffca52;stroke:#222;pointer-events:none}
#quickSheetCuts svg polygon {vector-effect:non-scaling-stroke;stroke:#67e1ff;stroke-width:1.5;fill:#67e1ff22}
#quickSheetCuts svg polygon.selected {stroke:#ffca52;stroke-width:2.5;fill:#ffd65c33}
#quickSheetCuts svg polyline {vector-effect:non-scaling-stroke;stroke:#ffca52;stroke-width:2;fill:none;pointer-events:none}
#quickSheetCuts .cut-thumbs[hidden] {display:none}
#quickSheetCuts .cut-thumbs {border:1px solid var(--vscode-panel-border);padding:6px;margin:6px 0}
#quickSheetCuts .thumb-grid {display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:6px;max-height:220px;overflow:auto}
#quickSheetCuts .thumb-card {min-width:0;border:1px solid var(--vscode-panel-border);background:var(--vscode-sideBar-background);color:inherit;padding:3px;text-align:center;cursor:grab}
#quickSheetCuts .thumb-card[aria-selected="true"] {outline:2px solid var(--vscode-focusBorder);background:var(--vscode-list-activeSelectionBackground)}
#quickSheetCuts .thumb-card canvas {width:100%;height:74px;object-fit:contain;image-rendering:pixelated;background:repeating-conic-gradient(#484848 0% 25%,#363636 0% 50%) 0 0 / 12px 12px}
#quickSheetCuts .thumb-card small {display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#quickSheetCuts .cut-identity input {width:8ch}
#quickSheetCuts [data-thumbs-toggle][aria-pressed="true"],#quickSheetCuts [data-polygon][aria-pressed="true"] {outline:2px solid var(--vscode-focusBorder)}
#quickSheetCuts [data-redraw][aria-pressed="true"] {outline:2px solid var(--vscode-focusBorder)}
#quickSheetCuts button:focus-visible,#quickSheetCuts select:focus-visible {outline:2px solid var(--vscode-focusBorder)}
`; }

// Serialized into the two Quick Add clients; all coordinates below are original sheet pixels.
function install(send) {
  let current;
  addEventListener('message', e=>{
    const m=e.data;
    if(m?.type==='sheetCutsDismiss' && current?.token===m.token) current.close();
    if(m?.type!=='sheetCutsReview')return;
    current?.close();
    const dialog=document.createElement('dialog');
    dialog.id='quickSheetCuts';
    dialog.setAttribute('aria-label','Review sprite cuts');
    const advanced=m.advanced===true,pageCount=Number.isSafeInteger(m.layerCount)&&m.layerCount>0?m.layerCount:1;
    dialog.innerHTML=`<h2>Review sprite cuts</h2>
      <p>Review the source cuts, then arrange the frames. Shift or Ctrl click thumbnails to select several; drag a thumbnail to reorder. Combining cuts uses their bounding rectangle; a polygon outline is discarded when combined.</p>
      <div class="cut-bar"><label>Cut <select data-list></select></label><button data-add>Add cut</button><button data-redraw aria-pressed="false">Draw rectangle</button><button data-polygon aria-pressed="false">Draw polygon</button><button data-finish-polygon hidden>Finish polygon</button><button data-merge>Combine selected</button><button data-remove>Delete selected</button><button data-undo>Undo cut edit</button><label>Zoom <select data-zoom><option value="fit">Fit</option><option value="1">100%</option><option value="2">200%</option><option value="4">400%</option></select></label></div>
      <div class="cut-view"><svg xmlns="http://www.w3.org/2000/svg" aria-label="Source sheet and cut outlines"><image x="0" y="0"/><g></g></svg></div>
      <div class="cut-bar" data-fields></div><div class="cut-bar"><button data-up>Earlier</button><button data-down>Later</button><button data-thumbs-toggle aria-pressed="false">Show thumbnails</button><span data-status role="status"></span></div>
      <section class="cut-thumbs" data-thumbs hidden aria-label="Sprite cut thumbnails"><div class="cut-bar"><b>Frames in output order</b><button data-page-back>Previous</button><span data-page-status></span><button data-page-next>Next</button></div><div class="thumb-grid" data-thumb-grid role="listbox" aria-multiselectable="true"></div></section>
      <div class="cut-bar cut-identity"><label>Group <input data-group type="number" min="0" max="65535" value="0"></label><label>First index <input data-index type="number" min="0" max="65535" value="0"></label><button data-assign>Assign selected range</button><span data-identity-status role="status"></span></div>
      <p data-warning></p><div class="cut-bar"><button data-use>Use cuts</button><button data-apply-selected>Apply selected</button><button data-stage>Stage for later</button><button data-cancel>Cancel</button></div>`;
    document.body.append(dialog);
    const q=s=>dialog.querySelector(s), svg=q('svg'), layer=q('svg g'), ns='http://www.w3.org/2000/svg';
    if(!advanced){
      dialog.querySelector('p').textContent='Drag a box to move it or drag its corner to resize. Shift-click boxes to merge pieces of one sprite.';
      q('[data-redraw]').textContent='Draw cut';q('[data-merge]').textContent='Merge selected';q('[data-remove]').textContent='Remove';
      for(const selector of ['[data-polygon]','[data-finish-polygon]','[data-thumbs-toggle]','[data-thumbs]','[data-apply-selected]','[data-stage]','.cut-identity'])q(selector).hidden=true;
    }
    const cuts=m.rectangles.map((cut,i)=>({id:cut.id||'cut-'+(i+1),x:cut.x,y:cut.y,width:cut.width,height:cut.height,...(Array.isArray(cut.polygon)?{polygon:cut.polygon.map(p=>({x:p.x,y:p.y}))}:{}),...(cut.identity?{identity:{group:cut.identity.group,index:cut.identity.index}}:{}),...(cut.written?{written:true}:{})}));
    let index=cuts.length?0:-1, marked=new Set(index<0?[]:[index]), drawMode=false, polygonDraft=[], drag=null,thumbsVisible=advanced,thumbPage=0,anchorIndex=index;
    const thumbnailSource=new Image();thumbnailSource.onload=()=>drawThumbs();thumbnailSource.src=m.image;
    const history=[];
    function clone(r){return {...r,...(r.polygon?{polygon:r.polygon.map(p=>({...p}))}:{}),...(r.identity?{identity:{...r.identity}}:{})};}
    function remember(){if(history.length===20)history.shift();history.push({cuts:cuts.map(clone),index,marked:[...marked]});}
    q('[data-undo]').onclick=()=>{const prior=history.pop();if(!prior)return;cuts.splice(0,cuts.length,...prior.cuts);index=prior.index;marked=new Set(prior.marked);drawMode=false;polygonDraft=[];refresh();};
    const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
    const fields=['x','y','width','height'];
    svg.setAttribute('viewBox',[0,0,m.width,m.height].join(' '));
    const image=q('image');image.setAttribute('href',m.image);image.setAttribute('width',m.width);image.setAttribute('height',m.height);
    q('[data-warning]').textContent=(m.warnings||[]).join(' ');
    function select(i){index=i;anchorIndex=i;marked=new Set(i<0?[]:[i]);}
    function selectMany(i,event){
      if(event.shiftKey&&anchorIndex>=0){const lo=Math.min(anchorIndex,i),hi=Math.max(anchorIndex,i);marked=new Set(Array.from({length:hi-lo+1},(_,n)=>lo+n));index=i;}
      else if(event.ctrlKey||event.metaKey){if(marked.has(i))marked.delete(i);else marked.add(i);index=marked.has(i)?i:([...marked][0]??-1);anchorIndex=i;}
      else select(i);
      refresh();
    }
    function moveBlock(target){
      const moving=[...marked].sort((a,b)=>a-b);if(!moving.length||moving.includes(target)||advanced&&(moving.some(i=>cuts[i]?.written)||cuts[target]?.written))return;
      remember();const moved=moving.map(i=>cuts[i]),remaining=cuts.filter((_,i)=>!marked.has(i));
      const before=moving.filter(i=>i<target).length,at=target-before;
      remaining.splice(at,0,...moved);cuts.splice(0,cuts.length,...remaining);
      marked=new Set(moved.map((_,n)=>at+n));index=at;anchorIndex=at;refresh();
    }
    function thumbnailCard(r,i){
      const button=document.createElement('button');button.type='button';button.className='thumb-card';button.draggable=!(advanced&&r.written);button.dataset.thumb=i;button.setAttribute('role','option');button.setAttribute('aria-selected',String(marked.has(i)));
      const range=r.identity?(pageCount===1?String(r.identity.index):r.identity.index+'–'+(r.identity.index+pageCount-1)):'';
      button.setAttribute('aria-label','Frame '+(i+1)+(r.identity?' group '+r.identity.group+', indexes '+range:''));
      const preview=document.createElement('canvas');preview.width=80;preview.height=74;preview.dataset.thumbCanvas=i;
      const label=document.createElement('small');label.textContent='#'+(i+1)+' · '+r.width+'×'+r.height+(r.identity?' · '+r.identity.group+','+range:'')+(r.written?' · written':'');button.append(preview,label);
      button.onclick=event=>{selectMany(i,event);if(event.detail>1){q('.cut-view').scrollIntoView({block:'nearest'});q('[name=x]').focus();}};
      button.ondragstart=event=>{if(advanced&&r.written){event.preventDefault();return;}if(!marked.has(i)){select(i);button.setAttribute('aria-selected','true');}event.dataTransfer.setData('text/plain',String(i));event.dataTransfer.effectAllowed='move';};
      button.ondragover=event=>{event.preventDefault();event.dataTransfer.dropEffect='move';};
      button.ondrop=event=>{event.preventDefault();moveBlock(i);};return button;
    }
    function drawThumbs(){if(!thumbnailSource.complete||!thumbnailSource.naturalWidth)return;for(const canvas of q('[data-thumb-grid]').querySelectorAll('canvas[data-thumb-canvas]')){const r=cuts[Number(canvas.dataset.thumbCanvas)],ctx=canvas.getContext('2d');if(!r||!ctx)continue;ctx.clearRect(0,0,canvas.width,canvas.height);ctx.imageSmoothingEnabled=false;const scale=Math.min(canvas.width/r.width,canvas.height/r.height),w=Math.max(1,Math.round(r.width*scale)),h=Math.max(1,Math.round(r.height*scale)),dx=Math.floor((canvas.width-w)/2),dy=Math.floor((canvas.height-h)/2);if(r.polygon){ctx.save();ctx.beginPath();r.polygon.forEach((point,i)=>{const x=dx+(point.x-r.x)*w/r.width,y=dy+(point.y-r.y)*h/r.height;if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});ctx.closePath();ctx.clip();}ctx.drawImage(thumbnailSource,r.x,r.y,r.width,r.height,dx,dy,w,h);if(r.polygon)ctx.restore();}}
    function renderThumbs(){
      q('[data-thumbs-toggle]').setAttribute('aria-pressed',String(thumbsVisible));q('[data-thumbs-toggle]').textContent=thumbsVisible?'Hide thumbnails':'Show thumbnails';q('[data-thumbs]').hidden=!thumbsVisible;
      if(!thumbsVisible)return;
      const pages=Math.max(1,Math.ceil(cuts.length/64));thumbPage=Math.min(thumbPage,pages-1);const start=thumbPage*64,end=Math.min(cuts.length,start+64);
      q('[data-thumb-grid]').replaceChildren(...cuts.slice(start,end).map((r,n)=>thumbnailCard(r,start+n)));
      drawThumbs();
      q('[data-page-status]').textContent=(thumbPage+1)+' / '+pages+' · '+cuts.length+' frames';q('[data-page-back]').disabled=thumbPage===0;q('[data-page-next]').disabled=thumbPage>=pages-1;
    }
    function fit(){
      const view=q('.cut-view'),scale=q('[data-zoom]').value;
      const zoom=scale==='fit'?Math.min(view.clientWidth/m.width,view.clientHeight/m.height):Number(scale);
      svg.style.width=Math.max(1,m.width*zoom)+'px';svg.style.height=Math.max(1,m.height*zoom)+'px';
    }
    function attributes(el,r){if(r.polygon)el.setAttribute('points',r.polygon.map(p=>p.x+','+p.y).join(' '));else for(const k of fields)el.setAttribute(k,r[k]);}
    function rectangle(r,i){
      const el=document.createElementNS(ns,r.polygon?'polygon':'rect');attributes(el,r);el.dataset.index=i;
      if(marked.has(i))el.setAttribute('class','selected');return el;
    }
    function refresh(){
      drag=null;
      layer.replaceChildren(...cuts.map(rectangle));
      if(polygonDraft.length){const outline=document.createElementNS(ns,'polyline');outline.setAttribute('points',polygonDraft.map(p=>p.x+','+p.y).join(' '));layer.append(outline);}
      const r=cuts[index],list=q('[data-list]');
      list.replaceChildren(...cuts.map((_,i)=>new Option(String(i+1),String(i))));
      list.selectedIndex=index;
      for(const k of fields){const el=q('[name="'+k+'"]');el.value=r?r[k]:'';el.disabled=!r||Boolean(advanced&&r.written);}
      q('[data-undo]').disabled=!history.length;
      q('[data-merge]').textContent=advanced?(marked.size>1?'Combine selected':'Combine with next'):(marked.size>1?'Merge selected':'Merge with next');
      q('[data-merge]').disabled=(marked.size<2&&(index<0||index===cuts.length-1))||Boolean(advanced&&([...marked].some(i=>cuts[i]?.written)||marked.size===1&&cuts[index+1]?.written));q('[data-remove]').disabled=!marked.size||Boolean(advanced&&[...marked].some(i=>cuts[i]?.written));
      q('[data-up]').disabled=index<=0||marked.size!==1||Boolean(advanced&&(r?.written||cuts[index-1]?.written));q('[data-down]').disabled=!r||index===cuts.length-1||marked.size!==1||Boolean(advanced&&(r?.written||cuts[index+1]?.written));
      q('[data-assign]').disabled=!marked.size||Boolean(advanced&&[...marked].some(i=>cuts[i]?.written));
      const pending=cuts.filter(c=>!c.written),pendingSelected=[...marked].filter(i=>cuts[i]&&!cuts[i].written);
      q('[data-use]').disabled=!pending.length;q('[data-use]').textContent=advanced?'Stage all '+pending.length+' in Creator':'Use '+pending.length+' cut'+(pending.length===1?'':'s');
      q('[data-apply-selected]').disabled=!pendingSelected.length;q('[data-apply-selected]').textContent='Stage selected ('+pendingSelected.length+') in Creator';
      q('[data-stage]').textContent=advanced?'Save sheet review for later':'Stage for later';
      q('[data-add]').disabled=q('[data-redraw]').disabled=q('[data-polygon]').disabled=cuts.length>=4096;
      q('[data-redraw]').setAttribute('aria-pressed',String(drawMode==='rect'));
      q('[data-polygon]').setAttribute('aria-pressed',String(drawMode==='polygon'));
      q('[data-finish-polygon]').hidden=drawMode!=='polygon';q('[data-finish-polygon]').disabled=polygonDraft.length<3;
      svg.style.cursor=drawMode?'crosshair':'default';
      q('[data-status]').textContent=marked.size>1?marked.size+' cuts selected':r?'Cut '+(index+1)+' of '+cuts.length+(r.written?' · already written':''):'Draw or add a cut to begin.';
      if(r && marked.size===1&&!r.polygon){const scale=svg.getBoundingClientRect().width/m.width||1,w=Math.min(7/scale,r.width),h=Math.min(7/scale,r.height);const grip=document.createElementNS(ns,'rect');attributes(grip,{x:r.x+r.width-w,y:r.y+r.height-h,width:w,height:h});grip.setAttribute('class','grip');layer.append(grip);}
      renderThumbs();
    }
    q('[data-thumbs-toggle]').onclick=()=>{if(!advanced)return;thumbsVisible=!thumbsVisible;renderThumbs();};
    q('[data-page-back]').onclick=()=>{thumbPage=Math.max(0,thumbPage-1);renderThumbs();};
    q('[data-page-next]').onclick=()=>{thumbPage++;renderThumbs();};
    q('[data-assign]').onclick=()=>{
      if(!advanced||[...marked].some(i=>cuts[i]?.written))return;const group=q('input[data-group]').valueAsNumber,start=q('input[data-index]').valueAsNumber,indices=[...marked].sort((a,b)=>a-b);
      const last=start+indices.length*pageCount-1;
      if(!indices.length||![group,start].every(Number.isSafeInteger)||group<0||group>65535||start<0||last>65535){q('[data-identity-status]').textContent='Choose cuts and a group/index range from 0 to 65535; each cut uses '+pageCount+' page'+(pageCount===1?'':'s')+'.';return;}
      remember();indices.forEach((i,n)=>{cuts[i].identity={group,index:start+n*pageCount};});q('[data-identity-status]').textContent='Assigned '+indices.length+' cut'+(indices.length===1?'':'s')+' × '+pageCount+' page'+(pageCount===1?'':'s')+' to group '+group+', indexes '+start+'–'+last+'.';refresh();
    };
    for(const k of fields){
      const lab=document.createElement('label');lab.textContent=({x:'X ',y:'Y ',width:'Width ',height:'Height '})[k];
      const n=document.createElement('input');n.type='number';n.step='1';n.name=k;lab.append(n);q('[data-fields]').append(lab);
      n.onchange=()=>{const r=cuts[index],v=n.valueAsNumber;if(r&&Number.isSafeInteger(v)&&v!==r[k]){remember();const old={...r},max={x:m.width-r.width,y:m.height-r.height,width:m.width-r.x,height:m.height-r.y}[k];r[k]=clamp(v,k==='x'||k==='y'?0:1,max);if(r.polygon)r.polygon=r.polygon.map(p=>({x:clamp(Math.round(r.x+(p.x-old.x)*r.width/old.width),r.x,r.x+r.width-1),y:clamp(Math.round(r.y+(p.y-old.y)*r.height/old.height),r.y,r.y+r.height-1)}));}refresh();};
    }
    q('[data-list]').onchange=e=>{select(e.target.selectedIndex);refresh();};
    const newId=()=>{
      if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();
      const bytes=new Uint8Array(16);globalThis.crypto.getRandomValues(bytes);bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
      const hex=[...bytes].map(value=>value.toString(16).padStart(2,'0')).join('');return hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20);
    };
    q('[data-add]').onclick=()=>{remember();cuts.push({id:newId(),x:0,y:0,width:Math.min(16,m.width),height:Math.min(16,m.height)});select(cuts.length-1);drawMode=false;refresh();q('[name=x]').focus();};
    q('[data-redraw]').onclick=()=>{drawMode=drawMode==='rect'?false:'rect';polygonDraft=[];refresh();};
    q('[data-polygon]').onclick=()=>{drawMode=drawMode==='polygon'?false:'polygon';polygonDraft=[];refresh();};
    q('[data-finish-polygon]').onclick=()=>{if(polygonDraft.length<3)return;remember();const xs=polygonDraft.map(p=>p.x),ys=polygonDraft.map(p=>p.y),x=Math.min(...xs),y=Math.min(...ys);cuts.push({id:newId(),x,y,width:Math.max(...xs)-x+1,height:Math.max(...ys)-y+1,polygon:polygonDraft.map(p=>({...p}))});select(cuts.length-1);polygonDraft=[];drawMode=false;refresh();};
    q('[data-merge]').onclick=()=>{const ids=marked.size===1?[index,index+1]:[...marked].sort((a,b)=>a-b);if(advanced&&ids.some(i=>cuts[i]?.written))return;remember();if(marked.size===1)marked.add(index+1);const rs=ids.map(i=>cuts[i]),x=Math.min(...rs.map(r=>r.x)),y=Math.min(...rs.map(r=>r.y)),hadPolygon=rs.some(r=>r.polygon);cuts[ids[0]]={...rs[0],x,y,width:Math.max(...rs.map(r=>r.x+r.width))-x,height:Math.max(...rs.map(r=>r.y+r.height))-y};delete cuts[ids[0]].polygon;for(const i of ids.slice(1).reverse())cuts.splice(i,1);select(ids[0]);refresh();if(advanced&&hadPolygon)q('[data-warning]').textContent='Combined polygon artwork uses one bounding rectangle. The former polygon outline was discarded; review the resulting cut before applying.';};
    q('[data-remove]').onclick=()=>{remember();const first=Math.min(...marked);for(const i of [...marked].sort((a,b)=>b-a))cuts.splice(i,1);select(Math.min(first,cuts.length-1));refresh();};
    for(const [name,delta] of [['up',-1],['down',1]])q('[data-'+name+']').onclick=()=>{remember();const next=index+delta;[cuts[index],cuts[next]]=[cuts[next],cuts[index]];select(next);refresh();};
    function point(e){const b=svg.getBoundingClientRect();return {x:clamp(Math.floor((e.clientX-b.left)*m.width/b.width),0,m.width-1),y:clamp(Math.floor((e.clientY-b.top)*m.height/b.height),0,m.height-1)};}
    svg.onpointerdown=e=>{
      if(e.button!==0||drag)return;
      const p=point(e),i=e.target.dataset.index===undefined?-1:Number(e.target.dataset.index);
      if(drawMode==='polygon'){if(polygonDraft.length<256)polygonDraft.push(p);refresh();return;}
      if(!drawMode&&i<0)return;
      if(advanced&&cuts[i]?.written){select(i);refresh();return;}
      if(!drawMode&&e.shiftKey){if(marked.has(i))marked.delete(i);else marked.add(i);index=marked.has(i)?i:([...marked][0]??-1);refresh();return;}
      const isNew=drawMode==='rect';
      if(isNew){remember();cuts.push({id:newId(),...p,width:1,height:1});select(cuts.length-1);drawMode=false;}
      else select(i);
      refresh();
      const r=cuts[index],t=7*m.width/svg.getBoundingClientRect().width;
      const resize=!isNew&&!r.polygon&&p.x>=r.x+r.width-Math.max(1,Math.min(t,r.width/2))&&p.y>=r.y+r.height-Math.max(1,Math.min(t,r.height/2));
      drag={id:e.pointerId,p,original:clone(r),changed:isNew,mode:isNew?'draw':resize?'resize':'move'};svg.setPointerCapture(e.pointerId);e.preventDefault();
    };
    svg.onpointermove=e=>{
      if(drag?.id!==e.pointerId)return;const p=point(e),start=drag.p,o=drag.original,r=cuts[index];
      if(!drag.changed){if(p.x===start.x&&p.y===start.y)return;remember();drag.changed=true;}
      if(drag.mode==='draw'){r.x=Math.min(start.x,p.x);r.y=Math.min(start.y,p.y);r.width=Math.abs(p.x-start.x)+1;r.height=Math.abs(p.y-start.y)+1;}
      else if(drag.mode==='move'){r.x=clamp(o.x+p.x-start.x,0,m.width-r.width);r.y=clamp(o.y+p.y-start.y,0,m.height-r.height);if(o.polygon)r.polygon=o.polygon.map(point=>({x:point.x+r.x-o.x,y:point.y+r.y-o.y}));}
      else{r.width=clamp(o.width+p.x-start.x,1,m.width-r.x);r.height=clamp(o.height+p.y-start.y,1,m.height-r.y);}
      attributes(layer.children[index],r);for(const k of fields)q('[name="'+k+'"]').value=r[k];
    };
    svg.onpointerup=e=>{if(drag?.id===e.pointerId)refresh();};
    svg.onpointercancel=e=>{if(drag?.id!==e.pointerId)return;if(drag.changed)history.pop();if(drag.mode==='draw'){cuts.splice(index,1);select(Math.min(index,cuts.length-1));}else cuts[index]=drag.original;refresh();};
    q('[data-zoom]').onchange=()=>{fit();refresh();};
    const observer=new ResizeObserver(()=>{fit();if(!drag)refresh();});
    function close(){observer.disconnect();dialog.close();dialog.remove();current=null;}
    function finish(action){
      if(action==='cancel')send({type:'sheetCutsResult',token:m.token,cancelled:true});
      else if(!advanced)send({type:'sheetCutsResult',token:m.token,rectangles:cuts.map(({x,y,width,height})=>({x,y,width,height}))});
      else send({type:'sheetCutsResult',token:m.token,action:action==='selected'?'apply':action,rectangles:(action==='stage'?cuts:action==='selected'?[...marked].sort((a,b)=>a-b).map(i=>cuts[i]).filter(c=>!c.written):cuts.filter(c=>!c.written)).map(clone),allCuts:cuts.map(clone)});
      close();
    }
    q('[data-use]').onclick=()=>finish('apply');q('[data-apply-selected]').onclick=()=>finish('selected');q('[data-stage]').onclick=()=>finish('stage');q('[data-cancel]').onclick=()=>finish('cancel');
    dialog.oncancel=e=>{e.preventDefault();finish('cancel');};
    current={token:m.token,close};dialog.showModal();fit();refresh();observer.observe(q('.cut-view'));q('[data-list]').focus();
  });
}
function clientScript(){ return '('+install.toString()+')(message=>vscode.postMessage(message));'; }
module.exports={reviewQuickSheetCuts,validRect,styles,clientScript};
