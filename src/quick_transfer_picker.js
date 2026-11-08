'use strict';

const path = require('path');
const vscode = require('vscode');
const { protect } = require('./webview_policy');

function transferClient() {
  const api = acquireVsCodeApi();
  const data = JSON.parse(document.getElementById('transfer-data').textContent);
  const el = id => document.getElementById(id);
  const queue = new Set(), marked = new Set(), mappings = new Map();
  let matches = [], page = 0, previewIndex = -1;
  const pageSize = 250;
  const pageItems = () => matches.slice(page * pageSize, (page + 1) * pageSize);
  function option(index) {
    const row = data.rows[index];
    const opt = new Option(row.label + (row.description ? '  ·  ' + row.description : ''), String(index));
    opt.title = opt.text;
    return opt;
  }
  function status() {
    el('count').textContent = marked.size + ' selected · ' + queue.size + ' queued';
    el('add').disabled = !marked.size;
    el('remove').disabled = !el('queue').selectedOptions.length;
    el('review').disabled = !queue.size;
  }
  function drawSource() {
    const list = el('source');
    list.replaceChildren();
    for (const index of pageItems()) {
      const opt = option(index);
      opt.selected = marked.has(index);
      list.add(opt);
    }
    el('range').textContent = matches.length ? (page * pageSize + 1) + '–' + Math.min(matches.length,(page+1)*pageSize) + ' of ' + matches.length : 'No matches';
    el('prev').disabled = page === 0;
    el('next').disabled = (page+1)*pageSize >= matches.length;
    el('paging').hidden = matches.length <= pageSize;
    status();
  }
  function drawQueue() {
    const list = el('queue');
    list.replaceChildren();
    for (const index of queue) {
      const opt = option(index), edit = mappings.get(index);
      if (edit?.targetId) opt.text += ' → ' + edit.targetId;
      if (edit?.conflictPolicy && edit.conflictPolicy !== 'ask') opt.text += ' (' + edit.conflictPolicy + ')';
      list.add(opt);
    }
    el('mapping').hidden = true;
    status();
  }
  function show(index) {
    if (!Number.isInteger(index) || !data.rows[index]) return;
    if(data.hasAudio){
      el('audio').pause();el('audio').removeAttribute('src');el('audio').load();
      el('listen').disabled=false;el('soundStatus').textContent=data.rows[index].label;
    }
    previewIndex = index;
    if(!data.hasPreview)return;
    el('image').hidden = true;
    el('caption').textContent = data.rows[index].label;
    api.postMessage({type:'preview',index});
  }
  window.addEventListener('message', ({data:message}) => {
    if(message.type==='audio'&&data.hasAudio&&message.index===previewIndex){
      el('listen').disabled=false;
      if(message.uri){el('audio').src=message.uri;el('audio').play().catch(()=>{});}
      else el('soundStatus').textContent='Audio preview unavailable for '+data.rows[previewIndex].label;
      return;
    }
    if (message.type !== 'preview' || message.index !== previewIndex) return;
    const img = el('image');
    if (message.uri) { img.src = message.uri; img.hidden = false; }
    else el('caption').textContent = data.rows[previewIndex].label + ' · Preview unavailable';
  });
  function filter() {
    const query = el('search').value.trim().toLowerCase();
    matches = data.rows.flatMap((row, index) => (row.label + ' ' + row.description).toLowerCase().includes(query) ? [index] : []);
    if (el('sort').checked) matches.sort((a,b)=>data.rows[a].label.localeCompare(data.rows[b].label,undefined,{numeric:true}) || a-b);
    page = 0; drawSource();
  }
  el('search').oninput = filter; el('sort').onchange = filter;
  el('prev').onclick = () => { page--; drawSource(); };
  el('next').onclick = () => { page++; drawSource(); };
  el('source').onchange = event => {
    const list = event.target;
    for (const opt of list.options) {
      const index = Number(opt.value);
      if (opt.selected) marked.add(index); else marked.delete(index);
    }
    show(Number(list.selectedOptions[0]?.value)); status();
  };
  el('queue').onchange = event => {
    const list=event.target,index=Number(list.selectedOptions[0]?.value);
    show(index); status();
    el('mapping').hidden=list.selectedOptions.length!==1||!(data.allowTargetId||data.policies.length);
    el('targetId').value=mappings.get(index)?.targetId||'';
    el('targetId').setCustomValidity('');
    el('policy').value=mappings.get(index)?.conflictPolicy||'ask';
  };
  function setMapping(){
    const list=el('queue'),opt=list.selectedOptions[0];
    if(list.selectedOptions.length!==1)return;
    const index=Number(opt.value), targetId=el('targetId').value.trim(), conflictPolicy=el('policy').value||'ask';
    if(targetId&&!new RegExp(data.pattern).test(targetId)){
      el('targetId').setCustomValidity('Enter '+data.idLabel+'.');el('targetId').reportValidity();return false;
    }
    el('targetId').setCustomValidity('');
    mappings.set(index,{targetId,conflictPolicy});
    opt.text=option(index).text+(targetId?' → '+targetId:'')+(conflictPolicy==='ask'?'':' ('+conflictPolicy+')');
    return true;
  }
  el('targetId').oninput=()=>el('targetId').setCustomValidity('');
  el('targetId').onchange=setMapping;el('policy').onchange=setMapping;
  for (const action of ['all','invert','clear']) el(action).onclick = () => {
    for (const index of matches) {
      if (action === 'clear' || (action === 'invert' && marked.has(index))) marked.delete(index);
      else marked.add(index);
    }
    drawSource();
  };
  function add() {
    const next = new Set([...queue,...marked]);
    if (next.size > data.limit) {el('count').textContent='Queue up to '+data.limit+' items per transfer.';return;}
    for (const index of marked) queue.add(index);
    drawQueue();
  }
  function remove() {
    for(const opt of Array.from(el('queue').selectedOptions)) {queue.delete(Number(opt.value));mappings.delete(Number(opt.value));}
    drawQueue();
  }
  el('add').onclick = add; el('source').ondblclick = add;
  el('remove').onclick = remove; el('queue').ondblclick = remove;
  el('review').onclick = () => {
    if(!el('mapping').hidden && setMapping()===false)return;
    api.postMessage({type:'review',indices:Array.from(queue),edits:Array.from(queue,i=>mappings.get(i)||{}),...(el('importSprites')?{importSprites:el('importSprites').checked}:{})});
  };
  el('cancel').onclick = () => api.postMessage({type:'cancel'});
  if(data.hasAudio)el('listen').onclick=()=>{
    if(previewIndex<0)return;
    el('listen').disabled=true;api.postMessage({type:'audio',index:previewIndex});
  };
  filter(); if(data.rows.length)show(0);
}

function mappingOptions(options) {
  const single=options.kind.toLowerCase()==='air';
  return {allowTargetId:!!options.allowTargetId, policies:options.allowConflictPolicy ? (options.policyChoices||['ask','skip','replace','next-free']) : [],
    idLabel:single?'an action number':'a group,index pair',pattern:single?'^-?[0-9]+$':'^-?[0-9]+ *, *-?[0-9]+$'};
}
function pickerHtml(options) {
  const {kind,source,destination,rows} = options;
  const escape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const hasPreview = Boolean(options.getPreview || rows.some(row => row.preview));
  const mapping=mappingOptions(options);
  const data = JSON.stringify({...mapping,rows:rows.map(row=>({label:String(row.label),description:String(row.description||'')})),hasPreview,hasAudio:!!options.getAudio,limit:options.maxSelection||4096}).replace(/</g,'\\u003c');
  const sameName = path.basename(source).toLowerCase()===path.basename(destination).toLowerCase();
  const endpoint = file => '<span class="file" title="'+escape(file)+'">'+escape(sameName?file:path.basename(file))+'</span>';
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+
    '*{box-sizing:border-box}body{font:var(--vscode-font-size) var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);margin:0;padding:12px}h1{font-size:1.15rem;margin:0 0 10px}main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}section{min-width:0}.file{font-weight:normal;overflow-wrap:anywhere;color:var(--vscode-descriptionForeground)}label{display:block;font-weight:600;margin-bottom:4px}input,select,button{font:inherit;color:inherit}input[type=search],select{background:var(--vscode-input-background);border:1px solid var(--vscode-input-border,var(--vscode-panel-border));width:100%;padding:4px}select{height:clamp(8rem,30vh,22rem)}button{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:1px solid transparent;padding:4px 8px}button:disabled{opacity:.55}button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--vscode-focusBorder)}.bar,footer{display:flex;flex-wrap:wrap;align-items:center;gap:5px;margin:6px 0}.bar label{margin:0;font-weight:normal}footer{position:sticky;bottom:0;background:var(--vscode-editor-background);padding:7px 0;border-top:1px solid var(--vscode-panel-border)}#count{margin-right:auto}#review{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}figure{display:flex;gap:8px;align-items:center;margin:8px 0}img{width:clamp(100px,18vw,200px);height:clamp(80px,18vh,150px);object-fit:contain;image-rendering:pixelated;background:var(--vscode-sideBar-background)}[hidden]{display:none!important}@media(max-width:540px){main{grid-template-columns:1fr}select{height:8rem}}'+
    '</style></head><body><h1>'+escape(kind.toUpperCase())+' Quick Transfer</h1><main><section><label for="source">Source · '+endpoint(source)+'</label><input type="search" id="search" placeholder="Filter source" aria-label="Filter source"><select multiple id="source" aria-label="Source items"></select><div class="bar"><button id="all">Select all</button><button id="invert">Invert</button><button id="clear">Clear</button><label><input type="checkbox" id="sort">Sort</label></div><div class="bar" id="paging"><button id="prev">Previous</button><span id="range"></span><button id="next">Next</button></div><button id="add">Add to queue →</button></section><section><label for="queue">Destination queue · '+endpoint(destination)+'</label><select multiple id="queue"></select><div class="bar"><button id="remove">Remove selected</button></div><div id="mapping" hidden><label '+(mapping.allowTargetId?'':'hidden')+'>Destination ID <input id="targetId" placeholder="Keep source ID"></label><label '+(mapping.policies.length?'':'hidden')+'>On conflict <select id="policy" style="height:auto">'+mapping.policies.map(p=>'<option value="'+escape(p)+'">'+escape(({ask:'Ask during review',skip:'Skip',replace:'Replace','next-free':'Use next free ID'})[p]||p)+'</option>').join('')+'</select></label></div></section></main>'+
    (options.spriteImport?'<label><input id="importSprites" type="checkbox"> Import sprites <small>(include attached palettes and update frame IDs)</small></label>':'')+
    (hasPreview?'<figure><img id="image" hidden alt="Selected sprite preview"><figcaption id="caption"></figcaption></figure>':'')+
    (options.getAudio?'<div class="bar"><button id="listen">Audition sound</button><audio id="audio" controls preload="none"></audio><span id="soundStatus" role="status"></span></div>':'')+
    '<footer><span id="count" role="status"></span><button id="review">Review transfer…</button><button id="cancel">Cancel</button></footer><script type="application/json" id="transfer-data">'+data+'</script><script>('+transferClient.toString()+')()</script></body></html>';
}

async function pickTransferRows(options) {
  const {rows,kind} = options;
  if (!rows.length) { await vscode.window.showInformationMessage('The source contains no transferable items.'); return; }
  const panel=vscode.window.createWebviewPanel('ikemakerQuickTransfer',kind.toUpperCase()+' Quick Transfer',vscode.ViewColumn.Active,{enableScripts:true,retainContextWhenHidden:true});
  return new Promise(resolve=>{
    let done=false, latest=0;
    const finish=(value,close)=>{if(done)return; done=true;resolve(value);if(close)panel.dispose();};
    panel.onDidDispose(()=>finish(undefined,false));
    panel.webview.onDidReceiveMessage(async message=>{
      if(done||!message)return;
      if(message.type==='cancel')return finish(undefined,true);
      if(message.type==='preview'||message.type==='audio'){
        const index=message.index, request=++latest;
        if(!Number.isSafeInteger(index)||index<0||index>=rows.length)return;
        let uri;
        const audio=message.type==='audio';
        try{uri=audio?await options.getAudio?.(rows[index]):rows[index].preview||await options.getPreview?.(rows[index]);}catch{}
        if(done||latest!==request)return;
        return panel.webview.postMessage({type:message.type,index,uri:typeof uri==='string'&&uri.startsWith(audio?'data:audio/wav;base64,':'data:image/png;base64,')?uri:null});
      }
      if(message.type!=='review')return;
      const ids=message.indices;
      if(!Array.isArray(ids)||!ids.length||ids.length>(options.maxSelection||4096)||new Set(ids).size!==ids.length||ids.some(i=>!Number.isSafeInteger(i)||i<0||i>=rows.length))return;
      const edits=message.edits;
      if(!Array.isArray(edits)||edits.length!==ids.length)return;
      const mapping=mappingOptions(options), pattern=new RegExp(mapping.pattern);
      const selected=[];
      for(let n=0;n<ids.length;n++){
        const edit=edits[n];
        if(!edit||typeof edit!=='object'||Array.isArray(edit)||Object.keys(edit).some(k=>!['targetId','conflictPolicy'].includes(k)))return;
        const {targetId='',conflictPolicy='ask'}=edit;
        if(typeof targetId!=='string'||targetId.length>64||(targetId&&(!mapping.allowTargetId||!pattern.test(targetId))))return;
        if(conflictPolicy!=='ask'&&!mapping.policies.includes(conflictPolicy))return;
        const row=rows[ids[n]];
        selected.push(targetId||conflictPolicy!=='ask'?{...row,...(targetId?{targetId}:{}),...(conflictPolicy!=='ask'?{conflictPolicy}:{})}:row);
      }
      if(options.spriteImport){
        if(typeof message.importSprites!=='boolean')return;
        finish({rows:selected,importSprites:message.importSprites},true);
      }else finish(selected,true);
    });
    panel.webview.html=protect(pickerHtml(options),panel.webview.cspSource);
  });
}
module.exports={pickTransferRows,pickerHtml};
