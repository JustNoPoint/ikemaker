'use strict';
const {inspectMoveControllers,changeControllerField,countedControllerPreview,assignmentPreview}=require('./move_controller_review');

function mountControllerReview(root,item,canEdit,states) {
  const panel=root.querySelector('[data-controller-review]'), area=root.querySelector('#directCodeEditor');
  if(!panel || !area)return;
  const body=panel.querySelector('div');
  let snapshot, blocks=[], index=0;
  const h=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const label=b=>b.type+' · line '+(item.line+b.line+1);
  function showCleanup(details, selected) {
    if(!details.open || details.dataset.ready)return;
    details.dataset.ready='yes';
    const sound=selected.type==='playsnd', key=sound?'channel':'id', wanted=selected.fields.find(f=>f.key===key)?.value;
    if(!wanted || !/^\d+$/.test(wanted)){details.querySelector('div').textContent='Choose a literal '+key+' to find its cleanup sites.';return;}
    const candidates=[], seen=new Set(), kind=sound?'stopsnd':'removeexplod';
    for(const state of states||[]){
      if(state.kind!=='state'||typeof state.text!=='string'||!state.text.toLowerCase().includes(kind))continue;
      for(const block of inspectMoveControllers(state.text,state.syntax,false)){
        if(block.type!==kind || block.fields.find(f=>f.key===key)?.value!==wanted)continue;
        const id=state.filename+'|'+(state.line+block.line);
        if(seen.has(id))continue;
        seen.add(id);
        const conditions=state.syntax==='zss'?block.guards:block.conditions.map(f=>f.key+' = '+f.value);
        candidates.push('<p><b>State '+h(state.signature)+' · '+h(state.fileLabel)+':'+(state.line+block.line+1)+'</b><br>'+conditions.map(c=>'<code>'+h(c)+'</code>').join('<br>')+'</p>');
      }
    }
    details.querySelector('div').innerHTML=candidates.length?'<small>Matching '+key+' '+h(wanted)+' in loaded StateDefs. Check the owner before replacing cleanup.</small>'+candidates.join(''):'No matching cleanup in the loaded StateDefs.';
  }
  function refresh(){
    snapshot=area.value;
    blocks=inspectMoveControllers(snapshot,item.syntax);
    if(!blocks.length){body.textContent='No complete controller found in this block.';return;}
    index=Math.min(index,blocks.length-1);
    body.innerHTML='<label>Controller <select data-controller>'+blocks.map((b,i)=>'<option value="'+i+'">'+h(label(b))+'</option>').join('')+'</select></label><div data-inspector></div>';
    const picker=body.querySelector('select');
    picker.value=String(index);picker.onchange=()=>{index=Number(picker.value);inspect();};
    inspect();
  }
  function inspect(){
    const selected=blocks[index], target=body.querySelector('[data-inspector]');
    const triggerTable=new Map();
    for(const f of selected.conditions){
      if(!triggerTable.has(f.key))triggerTable.set(f.key,[]);
      triggerTable.get(f.key).push(f);
    }
    function valueList(rows){return rows.map(row=>'<div><code>'+h(row.value)+'</code></div>').join('');}
    const routes=[...triggerTable].filter(([k])=>k!=='triggerall');
    const simple=rows=>rows.map(f=>/^\s*(?:stateNo|stateType|time|ctrl|anim|power|life)\s*(?:=|!=|>=|<=|>|<)\s*(?:-?\d+|[SCLA])\s*$/i.test(f.value)?f.value.toLowerCase().replace(/\s+/g,''):null);
    const routeHtml=routes.map(([key,rows],i)=>{
      const current=simple(rows);
      const covered=current.every(Boolean)&&routes.slice(0,i).find(([,older])=>simple(older).every(term=>term&&current.includes(term)));
      return '<tr><th>'+h(key)+'</th><td>'+valueList(rows)+(covered?'<small>Already allowed by '+h(covered[0])+'.</small>':'')+'</td></tr>';
    }).join('');
    let entries='';
    if(['changestate','selfstate'].includes(selected.type)){
      const destination=selected.fields.find(f=>f.key==='value')?.value;
      if(destination && /^-?\d+$/.test(destination)){
        const matches=blocks.filter(b=>b.type===selected.type && b.fields.some(f=>f.key==='value'&&f.value===destination));
        if(matches.length>1)entries='<details data-entries><summary>Compare '+matches.length+' routes to State '+h(destination)+'</summary>'+matches.map(b=>{
          const conditions=item.syntax==='zss'?b.guards:b.conditions.map(f=>f.key+' = '+f.value);
          return '<p><button data-entry="'+blocks.indexOf(b)+'">'+h(label(b))+'</button><br>'+conditions.map(c=>'<code>'+h(c)+'</code>').join('<br>')+'</p>';
        }).join('')+'</details>';
      }
    }
    const effects=selected.type==='playsnd'?['stopongethit','stoponchangestate']:selected.type==='explod'?['removeongethit','removeonchangestate']:[];
    let first=index,last=index;
    while(first>0&&blocks[first-1].type===selected.type)first--;
    while(last+1<blocks.length&&blocks[last+1].type===selected.type)last++;
    const family=blocks.slice(first,last+1);
    const sharedKeys=[...new Set(selected.fields.map(f=>f.key))].filter(k=>k!=='type'&&!/^trigger/.test(k)&&family.every(b=>b.fields.filter(f=>f.key===k).length===1));
    const preview=assignmentPreview(selected,item.syntax)||countedControllerPreview(family,item.syntax);
    target.innerHTML=(triggerTable.has('triggerall')?'<h4>Required for every route</h4>'+valueList(triggerTable.get('triggerall')):'')+
      entries+(routeHtml?'<h4>Alternative routes</h4><table>'+routeHtml+'</table>':'')+
      (selected.guards.length?'<h4>Enclosing conditions</h4>'+valueList(selected.guards.map(value=>({value}))):'')+
      (selected.accesses.length?'<details><summary>Variables and maps · '+selected.accesses.length+'</summary>'+selected.accesses.map(a=>'<div>'+h(a.owner)+' · '+h(a.role)+' <code>'+h(a.slot)+'</code> · line '+(item.line+a.line+1)+'</div>').join('')+'</details>':'')+
      (selected.writes.length?'<h4>Assignments inside expressions</h4>'+selected.writes.map(w=>'<div><code>'+h(w.value)+'</code> · line '+(item.line+w.line+1)+'</div>').join(''):'')+
      '<div class="code-actions"><button data-reveal>Show in source draft</button></div>'+
      (effects.length?'<h4>Lifetime</h4><p>Events refer to the player or Helper running this controller. Keep cleanup that follows the root or a different instance in its own controller.</p>'+effects.map(k=>'<button data-lifetime="'+k+'">'+(k.includes('gethit')?'End on owner hit':'End on owner state change')+'</button>').join(' ')+'<details data-find-cleanup><summary>Find matching cleanup</summary><div></div></details>':'')+
      (family.length>1&&sharedKeys.length?'<details><summary>Edit '+family.length+' consecutive '+h(selected.type)+' controllers</summary><label>Parameter <select data-key>'+sharedKeys.map(k=>'<option>'+h(k)+'</option>').join('')+'</select></label><div data-values></div><button data-stage>Stage parameter edits</button></details>':'')+(preview?'<details><summary>Preview equivalent ZSS</summary><textarea aria-label="ZSS draft" readonly rows="8">'+h(preview)+'</textarea><button data-select-preview>Select ZSS for copying</button></details>':'')+'<p data-feedback role="status"></p>';
    target.querySelectorAll('[data-entry]').forEach(button=>button.onclick=()=>{
      index=Number(button.dataset.entry);
      body.querySelector('[data-controller]').value=String(index);
      inspect();
    });
    const cleanup=target.querySelector('[data-find-cleanup]');
    if(cleanup)cleanup.ontoggle=()=>showCleanup(cleanup,selected);
    const selectPreview=target.querySelector('[data-select-preview]');
    if(selectPreview)selectPreview.onclick=()=>{const text=target.querySelector('textarea');text.focus();text.select();};
    const feedback=target.querySelector('[data-feedback]');
    function stage(editBlocks,key,values){
      if(!canEdit() || area.value!==snapshot){refresh();return;}
      try{
        area.value=changeControllerField(snapshot,editBlocks,key,values,item.syntax);
        area.dispatchEvent(new Event('input',{bubbles:true}));
        refresh();
        body.querySelector('[data-feedback]').textContent='Updated the source draft. Review and apply below.';
      }catch(error){feedback.textContent=error.message;}
    }
    target.querySelector('[data-reveal]').onclick=()=>{area.focus();area.setSelectionRange(selected.start,selected.end);area.scrollIntoView({block:'center'});};
    target.querySelectorAll('[data-lifetime]').forEach(button=>{
      const key=button.dataset.lifetime,field=selected.fields.find(f=>f.key===key);
      if(field)button.title='Current expression: '+field.value+' · set to 1';
      button.disabled=!canEdit()||field?.value==='1';
      button.onclick=()=>stage([selected],key,['1']);
    });
    const key=target.querySelector('[data-key]');
    if(key){
      const inputs=target.querySelector('[data-values]');
      const renderRows=()=>{inputs.innerHTML=family.map(b=>'<label>Line '+(item.line+b.line+1)+' <input aria-label="'+h(key.value)+' line '+(item.line+b.line+1)+'" value="'+h(b.fields.find(f=>f.key===key.value).value)+'"></label>').join('');};
      key.onchange=renderRows;renderRows();
      const button=target.querySelector('[data-stage]');button.disabled=!canEdit();button.onclick=()=>stage(family,key.value,[...inputs.querySelectorAll('input')].map(i=>i.value));
    }
  }
  panel.ontoggle=()=>{if(panel.open)refresh();};
  area.addEventListener('change',()=>{if(panel.open && snapshot!==area.value)refresh();});
}
module.exports={clientScript:()=>[inspectMoveControllers,changeControllerField,countedControllerPreview,assignmentPreview,mountControllerReview].map(fn=>fn.toString()).join('\n')+'\n'};
