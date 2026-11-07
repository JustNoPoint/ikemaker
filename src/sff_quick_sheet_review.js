'use strict';

const { randomUUID } = require('node:crypto');

function validRect(rect, width, height) {
  return rect && ['x','y','width','height'].every(k => Number.isSafeInteger(rect[k])) &&
    rect.x >= 0 && rect.y >= 0 && rect.width > 0 && rect.height > 0 &&
    rect.x + rect.width <= width && rect.y + rect.height <= height;
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
      const cuts = message.rectangles;
      if (!Array.isArray(cuts) || !cuts.length || cuts.length > 4096 || !cuts.every(r=>validRect(r,model.width,model.height))) {
        return finish(null, Error('The reviewed cuts exceed the sheet bounds or frame limit.'));
      }
      finish({rectangles:cuts.map(({x,y,width,height})=>({x,y,width,height}))});
    }));
    signal?.addEventListener('abort', abort, {once:true});
    Promise.resolve(panel.webview.postMessage({type:'sheetCutsReview',token,width:model.width,height:model.height,
      rectangles:model.rectangles,warnings:model.warnings||[],image:'data:image/png;base64,'+model.previewPng.toString('base64')}))
      .then(delivered=>{if(delivered===false)finish(null);},error=>finish(null,error));
  });
}

function styles() { return `
#quickSheetCuts {box-sizing:border-box;width:min(960px,96vw);max-height:94vh;overflow:auto;padding:10px;border:1px solid var(--vscode-focusBorder);background:var(--vscode-editor-background);color:var(--vscode-foreground);font:inherit}
#quickSheetCuts::backdrop {background:#0009}
#quickSheetCuts h2 {font-size:1.1em;margin:0}
#quickSheetCuts .cut-bar {display:flex;flex-wrap:wrap;align-items:center;gap:5px;margin:5px 0}
#quickSheetCuts input {width:6ch} #quickSheetCuts .cut-view {height:clamp(120px,49vh,500px);overflow:auto;background:var(--vscode-sideBar-background)}
#quickSheetCuts svg {display:block;max-width:none;touch-action:none;image-rendering:pixelated;background:repeating-conic-gradient(#484848 0% 25%,#363636 0% 50%) 0 0 / 16px 16px}
#quickSheetCuts svg rect {vector-effect:non-scaling-stroke;stroke:#67e1ff;stroke-width:1.5;fill:transparent}
#quickSheetCuts svg rect.selected {stroke:#ffca52;stroke-width:2.5;fill:#ffd65c22}
#quickSheetCuts svg rect.grip {fill:#ffca52;stroke:#222;pointer-events:none}
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
    dialog.innerHTML=`<h2>Review sprite cuts</h2>
      <p>Drag a box to move it or drag its corner to resize. Shift-click boxes to merge pieces of one sprite.</p>
      <div class="cut-bar"><label>Cut <select data-list></select></label><button data-add>Add cut</button><button data-redraw aria-pressed="false">Draw cut</button><button data-merge>Merge selected</button><button data-remove>Remove</button><button data-undo>Undo cut edit</button><label>Zoom <select data-zoom><option value="fit">Fit</option><option value="1">100%</option><option value="2">200%</option><option value="4">400%</option></select></label></div>
      <div class="cut-view"><svg xmlns="http://www.w3.org/2000/svg" aria-label="Source sheet and cut outlines"><image x="0" y="0"/><g></g></svg></div>
      <div class="cut-bar" data-fields></div><div class="cut-bar"><button data-up>Earlier</button><button data-down>Later</button><span data-status role="status"></span></div>
      <p data-warning></p><div class="cut-bar"><button data-use>Use cuts</button><button data-cancel>Cancel</button></div>`;
    document.body.append(dialog);
    const q=s=>dialog.querySelector(s), svg=q('svg'), layer=q('svg g'), ns='http://www.w3.org/2000/svg';
    const cuts=m.rectangles.map(({x,y,width,height})=>({x,y,width,height}));
    let index=cuts.length?0:-1, marked=new Set(index<0?[]:[index]), drawMode=false, drag=null;
    const history=[];
    function remember(){if(history.length===20)history.shift();history.push({cuts:cuts.map(r=>({...r})),index});}
    q('[data-undo]').onclick=()=>{const prior=history.pop();if(!prior)return;cuts.splice(0,cuts.length,...prior.cuts);select(prior.index);drawMode=false;refresh();};
    const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
    const fields=['x','y','width','height'];
    svg.setAttribute('viewBox',[0,0,m.width,m.height].join(' '));
    const image=q('image');image.setAttribute('href',m.image);image.setAttribute('width',m.width);image.setAttribute('height',m.height);
    q('[data-warning]').textContent=(m.warnings||[]).join(' ');
    function select(i){index=i;marked=new Set(i<0?[]:[i]);}
    function fit(){
      const view=q('.cut-view'),scale=q('[data-zoom]').value;
      const zoom=scale==='fit'?Math.min(view.clientWidth/m.width,view.clientHeight/m.height):Number(scale);
      svg.style.width=Math.max(1,m.width*zoom)+'px';svg.style.height=Math.max(1,m.height*zoom)+'px';
    }
    function attributes(el,r){for(const k of fields)el.setAttribute(k,r[k]);}
    function rectangle(r,i){
      const el=document.createElementNS(ns,'rect');attributes(el,r);el.dataset.index=i;
      if(marked.has(i))el.setAttribute('class','selected');return el;
    }
    function refresh(){
      drag=null;
      layer.replaceChildren(...cuts.map(rectangle));
      const r=cuts[index],list=q('[data-list]');
      list.replaceChildren(...cuts.map((_,i)=>new Option(String(i+1),String(i))));
      list.selectedIndex=index;
      for(const k of fields){const el=q('[name="'+k+'"]');el.value=r?r[k]:'';el.disabled=!r;}
      q('[data-undo]').disabled=!history.length;
      q('[data-merge]').textContent=marked.size>1?'Merge selected':'Merge with next';
      q('[data-merge]').disabled=marked.size<2&&(index<0||index===cuts.length-1);q('[data-remove]').disabled=!marked.size;
      q('[data-up]').disabled=index<=0||marked.size!==1;q('[data-down]').disabled=!r||index===cuts.length-1||marked.size!==1;
      q('[data-use]').disabled=!cuts.length;q('[data-use]').textContent='Use '+cuts.length+' cut'+(cuts.length===1?'':'s');
      q('[data-add]').disabled=q('[data-redraw]').disabled=cuts.length>=4096;
      q('[data-redraw]').setAttribute('aria-pressed',String(drawMode));
      svg.style.cursor=drawMode?'crosshair':'default';
      q('[data-status]').textContent=marked.size>1?marked.size+' cuts selected':r?'Cut '+(index+1)+' of '+cuts.length:'Draw or add a cut to begin.';
      if(r && marked.size===1){const scale=svg.getBoundingClientRect().width/m.width||1,w=Math.min(7/scale,r.width),h=Math.min(7/scale,r.height);const grip=document.createElementNS(ns,'rect');attributes(grip,{x:r.x+r.width-w,y:r.y+r.height-h,width:w,height:h});grip.setAttribute('class','grip');layer.append(grip);}
    }
    for(const k of fields){
      const lab=document.createElement('label');lab.textContent=({x:'X ',y:'Y ',width:'Width ',height:'Height '})[k];
      const n=document.createElement('input');n.type='number';n.step='1';n.name=k;lab.append(n);q('[data-fields]').append(lab);
      n.onchange=()=>{const r=cuts[index],v=n.valueAsNumber;if(r&&Number.isSafeInteger(v)&&v!==r[k]){remember();const max={x:m.width-r.width,y:m.height-r.height,width:m.width-r.x,height:m.height-r.y}[k];r[k]=clamp(v,k==='x'||k==='y'?0:1,max);}refresh();};
    }
    q('[data-list]').onchange=e=>{select(e.target.selectedIndex);refresh();};
    q('[data-add]').onclick=()=>{remember();cuts.push({x:0,y:0,width:Math.min(16,m.width),height:Math.min(16,m.height)});select(cuts.length-1);drawMode=false;refresh();q('[name=x]').focus();};
    q('[data-redraw]').onclick=()=>{drawMode=!drawMode;refresh();};
    q('[data-merge]').onclick=()=>{remember();if(marked.size===1)marked.add(index+1);const ids=[...marked].sort((a,b)=>a-b),rs=ids.map(i=>cuts[i]),x=Math.min(...rs.map(r=>r.x)),y=Math.min(...rs.map(r=>r.y));cuts[ids[0]]={x,y,width:Math.max(...rs.map(r=>r.x+r.width))-x,height:Math.max(...rs.map(r=>r.y+r.height))-y};for(const i of ids.slice(1).reverse())cuts.splice(i,1);select(ids[0]);refresh();};
    q('[data-remove]').onclick=()=>{remember();const first=Math.min(...marked);for(const i of [...marked].sort((a,b)=>b-a))cuts.splice(i,1);select(Math.min(first,cuts.length-1));refresh();};
    for(const [name,delta] of [['up',-1],['down',1]])q('[data-'+name+']').onclick=()=>{remember();const next=index+delta;[cuts[index],cuts[next]]=[cuts[next],cuts[index]];select(next);refresh();};
    function point(e){const b=svg.getBoundingClientRect();return {x:clamp(Math.floor((e.clientX-b.left)*m.width/b.width),0,m.width-1),y:clamp(Math.floor((e.clientY-b.top)*m.height/b.height),0,m.height-1)};}
    svg.onpointerdown=e=>{
      if(e.button!==0||drag)return;
      const p=point(e),i=e.target.dataset.index===undefined?-1:Number(e.target.dataset.index);
      if(!drawMode&&i<0)return;
      if(!drawMode&&e.shiftKey){if(marked.has(i))marked.delete(i);else marked.add(i);index=marked.has(i)?i:([...marked][0]??-1);refresh();return;}
      const isNew=drawMode;
      if(isNew){remember();cuts.push({...p,width:1,height:1});select(cuts.length-1);drawMode=false;}
      else select(i);
      refresh();
      const r=cuts[index],t=7*m.width/svg.getBoundingClientRect().width;
      const resize=!isNew&&p.x>=r.x+r.width-Math.max(1,Math.min(t,r.width/2))&&p.y>=r.y+r.height-Math.max(1,Math.min(t,r.height/2));
      drag={id:e.pointerId,p,original:{...r},changed:isNew,mode:isNew?'draw':resize?'resize':'move'};svg.setPointerCapture(e.pointerId);e.preventDefault();
    };
    svg.onpointermove=e=>{
      if(drag?.id!==e.pointerId)return;const p=point(e),start=drag.p,o=drag.original,r=cuts[index];
      if(!drag.changed){if(p.x===start.x&&p.y===start.y)return;remember();drag.changed=true;}
      if(drag.mode==='draw'){r.x=Math.min(start.x,p.x);r.y=Math.min(start.y,p.y);r.width=Math.abs(p.x-start.x)+1;r.height=Math.abs(p.y-start.y)+1;}
      else if(drag.mode==='move'){r.x=clamp(o.x+p.x-start.x,0,m.width-r.width);r.y=clamp(o.y+p.y-start.y,0,m.height-r.height);}
      else{r.width=clamp(o.width+p.x-start.x,1,m.width-r.x);r.height=clamp(o.height+p.y-start.y,1,m.height-r.y);}
      attributes(layer.children[index],r);for(const k of fields)q('[name="'+k+'"]').value=r[k];
    };
    svg.onpointerup=e=>{if(drag?.id===e.pointerId)refresh();};
    svg.onpointercancel=e=>{if(drag?.id!==e.pointerId)return;if(drag.changed)history.pop();if(drag.mode==='draw'){cuts.splice(index,1);select(Math.min(index,cuts.length-1));}else cuts[index]=drag.original;refresh();};
    q('[data-zoom]').onchange=()=>{fit();refresh();};
    const observer=new ResizeObserver(()=>{fit();if(!drag)refresh();});
    function close(){observer.disconnect();dialog.close();dialog.remove();current=null;}
    function finish(cancelled){send({type:'sheetCutsResult',token:m.token,...(cancelled?{cancelled:true}:{rectangles:cuts})});close();}
    q('[data-use]').onclick=()=>finish(false);q('[data-cancel]').onclick=()=>finish(true);
    dialog.oncancel=e=>{e.preventDefault();finish(true);};
    current={token:m.token,close};dialog.showModal();fit();refresh();observer.observe(q('.cut-view'));q('[data-list]').focus();
  });
}
function clientScript(){ return '('+install.toString()+')(message=>vscode.postMessage(message));'; }
module.exports={reviewQuickSheetCuts,validRect,styles,clientScript};
