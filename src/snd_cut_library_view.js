'use strict';

// Serialized into the review webview together with the existing audition controls.
function cutLibrary({q, document:doc=document,selected, clips, blocked, post, dragPayload, refresh, refilter, canImport,pointerDrop}) {
  const menu = q('cutMenu');
  const editor = q('cutEditor');
  let dragIds = null;
  let anchorId = null;

  function visibleCuts() {
    const term = q('cutFind').value.trim().toLowerCase();
    const filter = q('cutFilter').value;
    const sort = q('cutSort').value;
    const list = clips().filter(clip => {
      const used = clip.placements || [];
      if (filter === 'unused' && used.length || filter === 'here' && !clip.addedHere ||
          filter === 'elsewhere' && (!used.length || clip.addedHere) || filter === 'rejected' && !clip.rejected) return false;
      return !term || [clip.name, clip.group + ',' + clip.index, ...used.map(use => [use.destination, use.entityId, use.group + ',' + use.index].join(' '))]
        .some(field => String(field ?? '').toLowerCase().includes(term));
    });
    if (sort === 'name') list.sort((a,b) => (a.name || '').localeCompare(b.name || '', undefined, {numeric:true}));
    if (sort === 'number') list.sort((a,b) => (a.group ?? Infinity)-(b.group ?? Infinity) || (a.index ?? Infinity)-(b.index ?? Infinity));
    if (sort === 'duration') list.sort((a,b) => (b.end-b.start)-(a.end-a.start));
    return list;
  }
  q('cutFind').oninput = refilter;
  q('cutFilter').onchange = refilter;
  q('cutSort').onchange = refilter;
  function orderedIds() {
    return clips().filter(clip => selected.has(clip.id)).map(clip => clip.id);
  }
  function choose(clip) {
    if (!selected.has(clip.id)) {
      selected.clear();
      selected.add(clip.id);
      refresh();
    }
  }
  function add() {
    if (canImport && !blocked() && selected.size) post('addCuts', {ids: orderedIds()});
  }
  function closeMenu() { menu.hidden = true; }
  function editLabels() {
    if (blocked() || !selected.size) return;
    const single = selected.size === 1 && clips().find(clip => selected.has(clip.id));
    editor.hidden = false;
    q('cutName').disabled = !single;
    q('cutName').value = single?.name || '';
    q('cutGroup').value = single?.group ?? '';
    q('cutIndex').value = single?.index ?? '';
    (single ? q('cutName') : q('cutGroup')).focus();
  }
  function bindMenu(action, callback) {
    q(action).onclick = () => { closeMenu(); callback(); };
  }
  bindMenu('cutMenuAdd', add);
  bindMenu('cutMenuEdit', editLabels);
  bindMenu('cutMenuDelete', () => post('deleteCuts', {ids: orderedIds()}));
  q('cutAdd').onclick = add;
  q('cutEdit').onclick = editLabels;
  q('cutRelocate').onclick = () => post('relocateSource', {});
  q('cutCancelEdit').onclick = () => { editor.hidden = true; };
  q('cutApply').onclick = () => {
    if (blocked() || !selected.size || !Array.from(editor.querySelectorAll('input')).every(input => input.reportValidity())) return;
    const fields = {ids: orderedIds()};
    if (selected.size === 1) fields.name = q('cutName').value.trim();
    if (q('cutGroup').value !== '') fields.group = Number(q('cutGroup').value);
    if (q('cutIndex').value !== '') fields.startIndex = Number(q('cutIndex').value);
    post('labelCuts', fields);
    editor.hidden = true;
  };
  doc.addEventListener('pointerdown', event => { if (!menu.contains(event.target)) closeMenu(); });
  doc.addEventListener('keydown', event => { if (event.key === 'Escape') { closeMenu(); editor.hidden = true; } });
  const target = q('cutDrop');
  target.hidden = !canImport || Boolean(pointerDrop);
  target.ondragover = event => { if (dragIds && !blocked()) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } };
  target.ondrop = event => {
    if (!dragIds || blocked()) return;
    event.preventDefault();
    post('addCuts', {ids: dragIds});
    dragIds = null;
  };
  function decorate(row, clip) {
    const placements = clip.placements || [];
    row.classList.toggle('cutPlaced', Boolean(clip.addedHere));
    row.classList.toggle('cutPlacedElsewhere', !clip.addedHere && placements.length > 0);
    row.tabIndex = 0;
    function selectRow(event) {
      if (blocked() || event.target.closest('input,button,a')) return;
      if (event.shiftKey && anchorId !== null) {
        const ordered = visibleCuts();
        const a = ordered.findIndex(item => item.id === anchorId);
        const b = ordered.findIndex(item => item.id === clip.id);
        if (!event.ctrlKey && !event.metaKey) selected.clear();
        if (a >= 0 && b >= 0) {
          for (const item of ordered.slice(Math.min(a,b),Math.max(a,b)+1)) selected.add(item.id);
        } else selected.add(clip.id);
      } else {
        if (!event.ctrlKey && !event.metaKey) selected.clear();
        if (selected.has(clip.id)) selected.delete(clip.id);
        else selected.add(clip.id);
        anchorId = clip.id;
      }
      refresh();
    }
    row.onclick = selectRow;
    function context(x,y) {
      if (blocked()) return;
      choose(clip);
      editor.hidden = true;
      menu.hidden = false;
      menu.style.left = Math.max(0, Math.min(x, innerWidth - menu.offsetWidth)) + 'px';
      menu.style.top = Math.max(0, Math.min(y, innerHeight - menu.offsetHeight)) + 'px';
      menu.querySelector('button:not([disabled])')?.focus();
    }
    row.oncontextmenu = event => { event.preventDefault(); context(event.clientX,event.clientY); };
    row.onkeydown = event => {
      if (event.key === ' ' && event.target === row) {
        event.preventDefault();
        selectRow(event);
      } else if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
        event.preventDefault();
        const box = row.getBoundingClientRect();
        context(box.left,box.top);
      }
    };
    if(pointerDrop){let held=null,suppressClick=false;row.draggable=false;row.style.userSelect='none';row.addEventListener('pointerdown',event=>{if(event.button!==0||blocked()||event.target.closest('input,button,a'))return;held={id:event.pointerId,x:event.clientX,y:event.clientY,armed:false};row.setPointerCapture?.(event.pointerId);});row.addEventListener('pointermove',event=>{if(!held||held.id!==event.pointerId)return;if(Math.hypot(event.clientX-held.x,event.clientY-held.y)>=8)held.armed=true;if(held.armed){event.preventDefault();row.style.cursor='grabbing';}});row.addEventListener('pointerup',event=>{if(!held||held.id!==event.pointerId)return;const armed=held.armed;held=null;row.style.cursor='';if(!armed)return;suppressClick=true;setTimeout(()=>suppressClick=false,0);choose(clip);const payload=dragPayload(orderedIds());if(payload)pointerDrop(payload,event.clientX,event.clientY);});row.addEventListener('pointercancel',()=>{held=null;row.style.cursor='';});row.addEventListener('click',event=>{if(suppressClick){event.preventDefault();event.stopImmediatePropagation();}},true);}
    row.draggable = !blocked()&&!pointerDrop;
    row.ondragstart = event => {
      choose(clip);
      dragIds = orderedIds();
      const payload = dragPayload(dragIds);
      if (payload) event.dataTransfer.setData('application/x-ikemaker-voice-cut-ticket', JSON.stringify(payload));
      event.dataTransfer.effectAllowed = 'copy';const dragStatus=q('voiceStatus');if(dragStatus)dragStatus.textContent='Dragging '+dragIds.length+' reviewed cut(s). Drop on a SND viewer to review its destination.';
      if(payload)event.dataTransfer.setData('text/plain','IKEMAKER_VOICE_CUT_V1:'+JSON.stringify(payload));
    };
    row.ondragend = () => { dragIds = null;const dragStatus=q('voiceStatus');if(dragStatus)dragStatus.textContent='To review the destination, use Add selected to SND or drag the cuts onto the drop area in this window.'; };
  }
  let editingIds = '';
  function update() {
    const currentIds = Array.from(selected).join(',');
    if (currentIds !== editingIds) editor.hidden = true;
    editingIds = currentIds;
    q('cutRelocate').disabled = blocked();
    for (const id of ['cutEdit','cutMenuEdit','cutMenuDelete']) q(id).disabled = blocked() || !selected.size;
    for (const id of ['cutAdd','cutMenuAdd']) q(id).disabled = !canImport || blocked() || !selected.size;
    q('cutAdd').hidden = !canImport;
  }
  return {decorate, update, visibleCuts, reset: () => { anchorId = null; editor.hidden = true; closeMenu(); }};
}

const controls = `<details><summary>Recording locations</summary><p id="cutOrigin"></p><button id="cutRelocate">Locate original WAV…</button></details><div><label>Find cuts<input id="cutFind" type="search" placeholder="Name, number or destination"></label><label>Show<select id="cutFilter"><option value="">All cuts</option><option value="unused">Never added</option><option value="here">Added to this entity</option><option value="elsewhere">Past placements only</option><option value="rejected">Rejected</option></select></label><label>Sort<select id="cutSort"><option value="">Source order</option><option value="name">Name</option><option value="number">Group and index</option><option value="duration">Longest first</option></select></label></div><div><button id="cutAdd">Add selected to SND…</button> <button id="cutEdit">Name or number selected…</button> <span id="cutDrop">Drop selected cuts here to choose a destination SND</span></div>
<fieldset id="cutEditor" hidden><legend>Selected cuts</legend><label>Cut name<input id="cutName" maxlength="160"></label><label>Group<input id="cutGroup" type="number" min="0" max="2147483647"></label><label>Starting index<input id="cutIndex" type="number" min="0" max="2147483647"></label><button id="cutApply">Apply to selected</button> <button id="cutCancelEdit">Cancel</button></fieldset>
<div id="cutMenu" hidden><button id="cutMenuAdd">Add selected to SND…</button><button id="cutMenuEdit">Name or number…</button><button id="cutMenuDelete">Delete selected cuts…</button></div>`;
const style = `tr.cutSelected{outline:1px solid var(--vscode-focusBorder);outline-offset:-1px}.cutPlacedElsewhere{border-inline-start:3px solid var(--vscode-charts-blue)}#cutMenu{position:fixed;z-index:5;background:var(--vscode-menu-background,Canvas);padding:4px;border:1px solid var(--vscode-menu-border,GrayText)}#cutMenu button{display:block;width:100%;text-align:left}.cutPlaced{background:var(--vscode-diffEditor-insertedTextBackground,rgba(52,147,79,.17))}#cutDrop{display:inline-block;border:1px dashed var(--vscode-focusBorder);padding:8px}#cutDrop[hidden]{display:none}#voiceClips td{overflow-wrap:anywhere}
@media(max-width:720px){
 #cutTable,#cutTable tbody{display:block}
 #cutTable thead{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
 #cutTable tr{display:grid;grid-template-columns:auto repeat(3,minmax(0,1fr));align-items:center;border-bottom:1px solid var(--vscode-panel-border);padding-block:4px}
 #cutTable td{border:0;padding:3px}
 #cutTable td:nth-child(2){grid-column:span 2;font-weight:600}
 #cutTable td:nth-child(5){grid-column:2}
 #cutTable td:nth-child(8){grid-column:1/-1;white-space:pre-line}
 #cutTable td:last-child{grid-column:1/-1}
 #cutTable td[data-label]::before{content:attr(data-label);display:block;font-size:.85em;color:var(--vscode-descriptionForeground)}
}`;
module.exports = {cutLibrary, controls, style};
