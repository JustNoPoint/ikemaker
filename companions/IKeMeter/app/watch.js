'use strict';
const get=id=>document.getElementById(id);
const ui={
  status:get('watch-status'),form:get('watch-form'),slot:get('watch-slot'),kind:get('watch-kind'),
  key:get('watch-key'),keyLabel:get('watch-key-label'),mapIndex:get('watch-map-index'),
  mapLabel:get('watch-map-index-label'),owner:get('watch-owner'),ownerLabel:get('watch-owner-label'),
  add:get('watch-add'),list:get('watch-list'),pasteForm:get('watch-paste-form'),paste:get('watch-paste'),pasteSubmit:get('watch-paste-submit'),
  retention:get('watch-retention'),seconds:get('watch-seconds'),download:get('watch-download'),
  count:get('watch-count'),records:get('watch-records')
};
const entities=new Set(['helper','explod','projectile']);
let view=null,busy=false,revision=0,planStamp='',recordsStamp='';
async function request(path,body){
  const options=body===undefined?{}:{
    method:'POST',headers:{'Content-Type':'application/json','x-ikemeter-action':'1'},body:JSON.stringify(body)
  };
  const response=await fetch(path,options);
  if(!response.ok){
    const problem=await response.json();
    throw Error(problem.error||'Watch request failed');
  }
  return response;
}
function scope(){
  return view?.session?'?'+new URLSearchParams({session:view.session.sessionId,epoch:view.session.epoch}):'';
}
function labelWatch({kind,slot,key,mapIndex,ownerHelperId}){
  const selector=key===null?'all IDs':String(key)+(mapIndex===null?'':' ['+mapIndex+']');
  return 'P'+slot+' · '+kind+' · '+selector+(ownerHelperId===null?'':' · helper owner #'+ownerHelperId);
}
function configureKind(){
  const kind=ui.kind.value;
  ui.keyLabel.textContent=kind==='map'?'Map name':entities.has(kind)?'Authored ID (blank for all)':'Variable index';
  ui.key.required=!entities.has(kind);
  ui.key.inputMode=kind==='map'?'text':'numeric';
  ui.mapLabel.hidden=kind!=='map';
  ui.ownerLabel.hidden=kind!=='explod'&&kind!=='projectile';
}
function renderPlan(data){
  const stamp=JSON.stringify([data.slots,data.watches,data.editable,busy]);
  if(stamp===planStamp)return;
  planStamp=stamp;
  if(ui.slot.options.length!==data.slots.length){
    ui.slot.replaceChildren(...data.slots.map(slot=>new Option('P'+slot,String(slot))));
  }
  ui.list.replaceChildren(...data.watches.map((item,index)=>{
    const row=document.createElement('li');
    const title=document.createElement('span');
    title.textContent=labelWatch(item);
    const remove=document.createElement('button');
    remove.type='button';remove.textContent='Remove';
    remove.setAttribute('aria-label','Remove '+title.textContent);
    remove.disabled=!data.editable||busy;
    remove.onclick=()=>update('/api/watch/config',view.watches.filter((_,i)=>i!==index));
    row.append(title,remove);
    return row;
  }));
  for(const input of [ui.slot,ui.kind,ui.key,ui.mapIndex,ui.owner,ui.paste,ui.pasteSubmit])input.disabled=!data.editable||busy;
  ui.add.disabled=!data.editable||data.watches.length>=12||busy;
}
function textValue(value){
  if(value===null)return '—';
  return typeof value==='string'?JSON.stringify(value):String(value);
}
function stateLabel(context){
  const describe=sample=>'State '+sample.stateNo+(sample.stateOwnerSlot==null?' · owner unknown':' · P'+sample.stateOwnerSlot);
  const current=context?.current,previous=context?.previous;
  if(previous&&current&&(previous.stateNo!==current.stateNo||previous.stateOwnerSlot!==current.stateOwnerSlot)){
    return describe(previous)+' → '+describe(current);
  }
  return current?describe(current):previous?'Last observed '+describe(previous):'—';
}
function renderRecords(data){
  const stamp=JSON.stringify([data.session?.sessionId,data.records[0]?.seq,data.records.at(-1)?.seq]);
  if(stamp===recordsStamp)return;
  recordsStamp=stamp;
  ui.records.replaceChildren(...[...data.records].reverse().map(record=>{
    const row=document.createElement('tr');
    row.dataset.event=record.event;
    const key=record.key??record.authoredId;
    const selector=record.mapIndex===null?key:String(key)+' ['+record.mapIndex+']';
    const coverage=record.reason?record.coverage+' · '+record.reason:record.coverage;
    for(const item of [record.tick,stateLabel(record.stateContext),record.kind,record.ownerId,record.entityId,record.parentId,selector,record.event,
      textValue(record.before),textValue(record.after),coverage]){
      const cell=document.createElement('td');
      cell.textContent=item===null?'—':String(item);
      row.append(cell);
    }
    return row;
  }));
}
function render(data){
  view=data;
  renderPlan(data);renderRecords(data);
  if(document.activeElement!==ui.seconds)ui.seconds.value=String(data.retentionSeconds);
  ui.download.disabled=!data.session||busy;
  ui.status.textContent=data.live?'Watching current session':data.session?'Session ended · retained observations':data.editable?'Ready to configure':'Watch capture is inactive for this session';
  ui.status.classList.toggle('connected',data.live);
  ui.count.textContent=data.retained+' retained · '+data.records.length+' shown · '+data.dropped+' capacity losses · '+data.truncated+' incomplete observations';
}
async function refresh(){
  if(busy)return;
  const token=++revision;
  try{
    const data=await (await request('/api/watch')).json();
    if(token===revision)render(data);
  }catch(error){if(token===revision)ui.status.textContent=error.message;}
}
async function update(path,body){
  if(busy)return false;
  busy=true;++revision;
  if(view)renderPlan(view);
  try{
    const result=await request(path,body);
    render(await result.json());
    return true;
  }catch(error){ui.status.textContent=error.message;return false;}
  finally{busy=false;if(view){renderPlan(view);ui.download.disabled=!view.session;}}
}
ui.kind.addEventListener('change',()=>{ui.key.value='';ui.owner.value='';configureKind();});
ui.form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!view?.editable)return;
  const kind=ui.kind.value, raw=ui.key.value.trim(), index=ui.mapIndex.value.trim();
  const owner=ui.ownerLabel.hidden?'':ui.owner.value.trim();
  if((kind!=='map'&&raw&&!/^\d+$/.test(raw))||(kind==='map'&&index&&!/^-?\d+$/.test(index))||(owner&&!/^\d+$/.test(owner))){
    ui.status.textContent='Enter a whole-number index or ID';
    return;
  }
  const key=kind==='map'?raw:raw?Number(raw):null;
  if(await update('/api/watch/config',[...view.watches,{slot:Number(ui.slot.value),kind,key,
    mapIndex:kind==='map'&&index?Number(index):null,ownerHelperId:owner?Number(owner):null}])){
    ui.key.value='';ui.mapIndex.value='';ui.owner.value='';
  }
});
ui.pasteForm.addEventListener('submit',event=>{
  event.preventDefault();
  if(!view?.editable)return;
  let plan;
  try{plan=JSON.parse(ui.paste.value);}catch{ui.status.textContent='Paste a JSON array of watches';return;}
  void update('/api/watch/config',plan);
});
ui.retention.addEventListener('submit',event=>{
  event.preventDefault();
  void update('/api/watch/retention'+scope(),Number(ui.seconds.value));
});
ui.download.addEventListener('click',async()=>{
  if(busy||!view?.session)return;
  busy=true;++revision;ui.download.disabled=true;
  try{
    const blob=await (await request('/api/watch/export'+scope(),{})).blob();
    const href=URL.createObjectURL(blob), anchor=document.createElement('a');
    anchor.href=href;anchor.download='ikemeter-watch-log.json';anchor.click();
    setTimeout(()=>URL.revokeObjectURL(href),1000);
  }catch(error){ui.status.textContent=error.message;}
  finally{busy=false;ui.download.disabled=!view?.session;}
});
configureKind();
void refresh();
setInterval(refresh,1000);
