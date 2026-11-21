'use strict';
function groupLayerSources(sources){
  const groups=new Map();
  for(const source of sources){const name=String(source.layerMetadata?.name||source.layerName||'').trim();const key=name?name.toLocaleLowerCase():`source:${source.id}`;if(!groups.has(key))groups.set(key,{key,name:name||source.name||'Image',sources:[]});groups.get(key).sources.push(source);}
  const result=[];
  for(const group of groups.values()){
    const documents=new Set(),ambiguous=group.sources.some(source=>{const key=source.sourceKey||source.id;if(documents.has(key))return true;documents.add(key);return false;});
    if(ambiguous){for(const source of group.sources)result.push({key:`${group.key}:${source.id}`,name:`${group.name} · ${source.name||source.id} · page ${source.layerMetadata?.index??'?'}`,sources:[source],ambiguous:true});}
    else result.push({...group,ambiguous:false});
  }
  return result;
}
function layerPlanProblem(plan,targetVersion='2.1',sources=[]){
  if(!plan.length||!plan.some(row=>row.slot!=='skip'&&row.slot!=='background'))return 'Assign at least one image layer to Base or a layer slot.';
  const used=new Set(),palettes=new Map(),byId=new Map(sources.map(source=>[source.id,source]));let bakes=0;
  for(const row of plan){if(row.slot==='skip')continue;
    if(row.slot!=='background'&&palettes.has(row.slot)&&palettes.get(row.slot)!==row.palette)return 'Rows sharing a sprite slot need the same palette choice.';
    palettes.set(row.slot,row.palette);
    for(const id of row.sourceIds?.length?row.sourceIds:['unknown']){const source=byId.get(id),frame=Number.isSafeInteger(source?.sequenceOrdinal)?`frame:${source.sequenceOrdinal}`:source?.sourceKey||(!sources.length?'unknown':id),key=row.slot+':'+frame;if(used.has(key))return 'Two layers share the same slot in one frame. Choose a different slot or Skip for that frame.';used.add(key);}
    if(row.palette==='true-color'&&targetVersion!=='2.1')return 'True Color layers require SFF 2.1.';if(row.bake){bakes++;if(!Number.isInteger(row.slot)||row.slot<1||row.slot>4)return 'Choose Bake only for an equipment layer in slots 1–4.';}}
  if(bakes>1)return 'Choose one equipment layer for the optional silhouette review.';
  return '';
}
function html(prefix){return `<section id="${prefix}LayerPlanSection" class="sff-add-section"><h3>Named layer assignments</h3><label><input id="${prefix}LayerPlanEnable" type="checkbox"> Assign named layers to Base and equipment slots</label><p class="muted">Matching layer names across documents share one assignment. Frame indexes follow their document. Repeated names within a document stay separate for explicit choices. The optional one-color background supplies transparent index-0 RGB for new independent palettes; same-colored opaque artwork stays visible. Skip leaves a layer out.</p><div id="${prefix}LayerPlanRows" role="group" aria-label="Named layer sprite assignments" hidden></div><p id="${prefix}LayerPlanStatus" role="status" aria-live="polite"></p></section>`;}
function installLayerIntakePlan(prefix,sources,palettes,changed,options={}){
  const document=globalThis.document,root=document.getElementById(prefix+'LayerPlanSection');
  if(!root)return {active:()=>false,plan:()=>[],problem:()=>'',reset(){}};
  const enable=document.getElementById(prefix+'LayerPlanEnable'),rows=document.getElementById(prefix+'LayerPlanRows'),status=document.getElementById(prefix+'LayerPlanStatus');
  const eligible=sources.length>0&&sources.every(source=>source.layerMetadata&&source.layerRole);
  root.hidden=!eligible;
  const store=globalThis.ikemenLayerIntakePlans||(globalThis.ikemenLayerIntakePlans=new Map());let state=store.get(prefix);
  if(!state){state={signature:null,entries:[]};store.set(prefix,state);}
  const signature=JSON.stringify([sources.map(source=>[source.id,source.layerMetadata?.name,source.layerName,source.sourceKey,source.suggestedSlot]),palettes.map(palette=>palette.id),options.targetVersion]);
  const active=()=>eligible&&enable.checked;
  const plan=()=>state.entries.map(entry=>({sourceIds:entry.group.sources.map(source=>source.id),slot:entry.slot,palette:entry.palette,bake:entry.bake}));
  const problem=()=>active()?layerPlanProblem(plan(),options.targetVersion,sources):'';
  function sync(){rows.hidden=!active();for(const entry of state.entries){const noPalette=entry.slot==='background'||entry.slot==='skip';if(entry.paletteSelect){entry.paletteSelect.parentElement.hidden=noPalette;entry.paletteSelect.disabled=noPalette;}if(entry.bakeLabel)entry.bakeLabel.hidden=typeof entry.slot!=='number'||entry.slot===0;}const issue=problem();status.textContent=active()?(issue||'Per-layer palettes and slots will be validated when Write SFF runs. Optional Bake opens a separate silhouette review after the import; it never saves the bake automatically.'):'Layer assignments are off. Existing batch palette and numbering controls apply.';}
  function change(){sync();changed?.();}
  enable.onchange=()=>{state.userChoice=enable.checked;change();};
  if(state.signature!==signature){
    if(!eligible){enable.checked=false;state.userChoice=undefined;}
    else if(state.userChoice===undefined)enable.checked=true;
    state.signature=signature;rows.replaceChildren();let nextSlot=1;const groups=groupLayerSources(sources),body=groups.find(group=>group.sources.every(source=>source.layerRole==='body'))||groups[0];
    state.entries=groups.map(group=>{const suggestion=group.sources[0]?.suggestedSlot,slot=group.sources.every(source=>source.suggestedSlot===suggestion)&&[0,1,2,3,4,'background','skip'].includes(suggestion)?suggestion:group===body?0:nextSlot<=4?nextSlot++:'skip';return {group,slot,palette:typeof slot==='number'&&palettes.some(palette=>palette.id==='1,0')?'master:1,0':'own',bake:false};});
    for(const entry of state.entries){
      const card=document.createElement('fieldset'),legend=document.createElement('legend');legend.textContent=entry.group.name+' · '+entry.group.sources.length+' frame(s)';card.append(legend);
      if(entry.group.ambiguous){const note=document.createElement('p');note.textContent='Repeated name within a document: this page has its own assignment.';card.append(note);}
      const choice=(label,items,value,update)=>{const field=document.createElement('label'),select=document.createElement('select');field.style.cssText='display:inline-grid;gap:3px;margin:4px 12px 4px 0';field.append(document.createTextNode(label));for(const [key,text]of items){const item=document.createElement('option');item.value=String(key);item.textContent=text;select.append(item);}select.value=String(value);select.onchange=()=>{update(select.value);change();};field.append(select);card.append(field);return select;};
      choice('Sprite slot',[[0,'Base'],[1,'Layer 1'],[2,'Layer 2'],[3,'Layer 3'],[4,'Layer 4'],['background','One-color background'],['skip','Skip']],entry.slot,value=>{entry.slot=/^[0-4]$/.test(value)?Number(value):value;if(typeof entry.slot!=='number'||entry.slot===0){entry.bake=false;entry.checkbox.checked=false;}if(entry.slot==='background'||entry.slot==='skip')entry.palette='own';});
      entry.paletteSelect=choice('Palette',[['own','Own exact palette'],...(options.targetVersion==='2.1'?[['true-color','True Color']]:[]),...palettes.map(palette=>['master:'+palette.id,'Exact master '+palette.id])],entry.palette,value=>entry.palette=value);
      const bake=document.createElement('label'),checkbox=document.createElement('input');entry.bakeLabel=bake;checkbox.type='checkbox';checkbox.setAttribute('aria-label','Review silhouette bake for '+entry.group.name);entry.checkbox=checkbox;checkbox.onchange=()=>{if(checkbox.checked){for(const other of state.entries){other.bake=false;if(other.checkbox)other.checkbox.checked=false;}entry.bake=true;checkbox.checked=true;}else entry.bake=false;change();};bake.append(checkbox,document.createTextNode(' Review silhouette bake after import'));card.append(bake);rows.append(card);
    }
  }
  sync();
  return {active,plan,problem,reset(){enable.checked=false;state.userChoice=undefined;state.signature=null;state.entries=[];rows.replaceChildren();sync();}};
}
function clientScript(){return `const groupLayerSources=${groupLayerSources.toString()},layerPlanProblem=${layerPlanProblem.toString()},installLayerIntakePlan=${installLayerIntakePlan.toString()};`;}
module.exports={groupLayerSources,layerPlanProblem,html,clientScript};
