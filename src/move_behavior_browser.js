'use strict';

// This projection adds presentation, never source authority. Routes remain the
// opaque, generation-bound tokens issued by state_transition_authority.
function project(model){
 const pool=[...(model.behaviorComponents||[]),...(model.directComponents||[]),...(model.specialistComponents||[])],states=pool.filter(item=>item.kind==='state');
 const stateCounts=new Map(),profilesByState=new Map();for(const state of states){const key=String(state.signature||'');stateCounts.set(key,(stateCounts.get(key)||0)+1);}for(const profile of model.moves||[]){const number=Number(profile.values?.moveID);if(!Number.isSafeInteger(number))continue;const list=profilesByState.get(number)||[];list.push(profile);profilesByState.set(number,list);}
 const cards=pool.map(item=>{
  const state=item.kind==='state'&&/^\d+$/.test(String(item.signature||''))?Number(item.signature):null;
  const action=item.stateAnimation?.available===true?item.stateAnimation.action:null;
  const profiles=Number.isInteger(state)&&action===state&&stateCounts.get(String(state))===1?(profilesByState.get(state)||[]):[];
  const profile=profiles.length===1?profiles[0]:null;
  const timing=profile?.timingEvidence||profile?.timeline?.timingEvidence||model.directActionTiming?.[item.id];
  const first=profile?.timeline?.state==='ready'?profile.timeline.frames?.[0]:null,key=first?first.group+','+first.index:'',image=profile?.images?.[key]||null;
  return{id:item.id,kind:item.kind,label:profile?.prefix||item.label||item.signature||item.kind,state,reference:item.reference,sourceHash:item.sourceHash,component:item,profileId:profile?.id||'',profileAmbiguous:profiles.length>1,
   thumbnail:image||model.directActionImages?.[item.id]||null,commands:[...(item.commandUses?.items||[]),...(item.stateIncoming?.items||[]).flatMap(edge=>edge.inputs||[])].flatMap(use=>[use.name,...(use.motions||[])]).filter(Boolean),timing:timing||null,
   edges:(item.stateTransitions?.items||item.functionTransfers||[]).map(edge=>({...edge,sourceId:item.id,conditions:edge.conditions||{expressions:[],labels:[],detail:'Condition capture unavailable; inspect exact source.'}})),incoming:Number(item.stateIncoming?.total||0),transitionReason:item.stateTransitions?.available===false?item.stateTransitions.reason:''};
 });
 const linkedProfiles=new Set(cards.map(card=>card.profileId));for(const profile of model.moves||[])if(!linkedProfiles.has(profile.id)){const first=profile.timeline?.state==='ready'?profile.timeline.frames?.[0]:null;cards.push({id:'profile:'+profile.id,kind:'constants',label:profile.prefix||profile.id,state:null,reference:null,sourceHash:model.timingSources?.constants||'',component:null,profileId:profile.id,thumbnail:first?profile.images?.[first.group+','+first.index]||null:null,commands:[],timing:profile.timingEvidence||null,edges:[],incoming:0});}
 const conventional=[[0,'Standing / idle'],[5,'Turn'],[10,'Crouch transition'],[11,'Crouching'],[20,'Walking'],[40,'Jump start'],[50,'Airborne'],[52,'Landing'],[100,'Run candidate'],[105,'Back dash candidate'],[120,'Guard candidate'],[5000,'Hit reaction candidate'],[5150,'KO candidate'],[180,'Win candidate'],[170,'Lose candidate']].map(([state,label])=>{const matches=cards.filter(card=>card.kind==='state'&&card.state===state);return{state,label,status:matches.length===1?'candidate':matches.length?'ambiguous':'not indexed',id:matches.length===1?matches[0].id:''}});
 return{cards,conventional,limitations:['Assigned source inventory only; runtime reachability, cancel eligibility and character completeness are not proven.',...(model.directActionImagesTruncated?[String(model.directActionImagesTruncated)+' direct-action thumbnails omitted by the bounded decode limit.']:[]),...(model.componentFailures||[]).map(item=>String(item.reason||item.message||'An assigned source could not be indexed.'))]};
}
function markup(){return '<details id="moveBehaviorBrowser" class="move-behavior-browser"><summary>Move cards &amp; whole-character behavior</summary><div id="moveBehaviorDesk"></div></details>';}
function style(){return '.move-behavior-browser{flex:0 0 auto;max-height:48vh;overflow:auto;padding:7px 10px;border-bottom:1px solid var(--vscode-panel-border)}.move-behavior-browser>summary{cursor:pointer;font-weight:700}.behavior-tools{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:7px 0}.behavior-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(230px,100%),1fr));gap:8px}.behavior-card{border:1px solid var(--vscode-panel-border);padding:8px;min-width:0;overflow-wrap:anywhere}.behavior-card img{height:68px;max-width:110px;object-fit:contain;image-rendering:pixelated;float:right}.behavior-card pre{white-space:pre-wrap;overflow-wrap:anywhere}.behavior-list .behavior-card{display:block;margin:3px 0;padding:5px}.behavior-list .behavior-card img{display:none}.behavior-route{padding:6px;border-left:2px solid var(--vscode-focusBorder);margin:5px 0}.behavior-note{display:block;width:100%;min-height:54px}.behavior-sketch{position:relative;width:min(220px,100%);height:auto;aspect-ratio:2/1;border:1px solid var(--vscode-panel-border);touch-action:none}.behavior-sketch polyline{fill:none;stroke:var(--vscode-foreground);stroke-width:2}.behavior-tools input[type=search]{flex:1;min-width:160px}.behavior-card:focus-visible{outline:2px solid var(--vscode-focusBorder)}';}
function client(project){
 const host=document.getElementById('moveBehaviorDesk'),disclosure=document.getElementById('moveBehaviorBrowser');if(!host||!disclosure)return;
 const commandRecipes=()=>vscode.postMessage({type:'moveCommandTriggerRecipes'});const commandButton=document.getElementById('moveCommandTriggerRecipes');if(commandButton)commandButton.onclick=commandRecipes;
 const owner=()=>String(model.files?.defPath||'').replace(/\\/g,'/').toLowerCase();
 let preferences=vscode.getState()?.moveBehaviorReview||{},query='',view=preferences.view==='list'?'list':'cards',selected='',page=0,returnOrigin=null;const usedRoutes=new Set();
 const persist=()=>vscode.setState({...vscode.getState(),moveBehaviorReview:{...preferences,view}});
 const noteKey=card=>owner()+'#'+card.id+'#'+card.sourceHash;
 let cachedModel=null,cachedProjection=null;const projectionFor=()=>{if(cachedModel!==model){cachedModel=model;cachedProjection=project(model);}return cachedProjection};
 const pool=()=>projectionFor().cards;
 function select(card){if(!card)return false;if(card.kind==='constants'){moveDirectUi.clear();selectMove(card.profileId);}else moveDirectUi.select(card.reference);selected=card.id;return true;}
 function returnToOrigin(){if(!returnOrigin||returnOrigin.owner!==owner())return false;const origin=returnOrigin;if(origin.constantsHash!==String(model.timingSources?.constants||'')||origin.airHash!==String(model.timingSources?.air||'')){$('status').textContent='The original move source changed. Choose the move again before returning.';return false;}if(origin.profileId){const profile=(model.moves||[]).find(item=>item.id===origin.profileId);if(!profile)return false;if(typeof viewZoom!=='undefined'&&Number.isFinite(origin.zoom))viewZoom=origin.zoom;if(typeof panX!=='undefined'&&Number.isFinite(origin.panX))panX=origin.panX;if(typeof panY!=='undefined'&&Number.isFinite(origin.panY))panY=origin.panY;moveDirectUi.clear();selectMove(profile.id,undefined,origin.frame);for(const section of document.querySelectorAll('.code-section'))section.open=(origin.openSections||[]).includes(section.dataset.section);if(typeof saveState==='function')saveState();}else{const card=pool().find(item=>item.id===origin.cardId&&item.sourceHash===origin.sourceHash);if(!card)return false;select(card);}vscode.postMessage({type:'refresh'});$('status').textContent='Returned to the original move; refreshing exact one-hop links.';render();return true;}
 function route(card,edge){if(!card||!edge?.available||!/^[0-9a-f]{48}$/.test(edge.route||''))return false;const state=codeDraftStore.actionState(card.component);if(state.changed||state.conflict||state.pending){$('status').textContent='Apply or discard the exact source draft before cancel-route navigation.';return false;}if(usedRoutes.has(edge.route)){vscode.postMessage({type:'refresh'});$('status').textContent='Refreshing the exact transition link…';return false;}returnOrigin={owner:owner(),profileId:typeof move!=='undefined'?move?.id||'':'',frame:typeof frame==='number'?frame:0,cardId:card.id,sourceHash:card.sourceHash,constantsHash:String(model.timingSources?.constants||''),airHash:String(model.timingSources?.air||''),openSections:[...document.querySelectorAll('.code-section[open]')].map(node=>node.dataset.section),label:typeof move!=='undefined'&&move?move.prefix:card.label,zoom:typeof viewZoom==='number'?viewZoom:null,panX:typeof panX==='number'?panX:null,panY:typeof panY==='number'?panY:null};usedRoutes.add(edge.route);select(card);vscode.postMessage({type:'openStateTransitionRoute',route:edge.route});render();return true;}
 function entryInputSummary(card) {
  const entries=new Set();
  for(const edge of card.component?.stateIncoming?.items||[])for(const input of edge.inputs||[])entries.add(input.name+' · '+input.motions.join(' / '));
  return entries.size?'<p>Entry input references: '+[...entries].map(esc).join('<br>')+'</p>':'';
 }
 function commandLinks(card) {
  const rows=card.component?.commandUses?.items||[],seen=new Set();
  return rows.map((item,index)=>{
   const key=[item.name,item.available,item.reason].join('|');
   if(seen.has(key))return '';
   seen.add(key);
   if(!item.available)return esc(item.name)+(item.reason?' · '+esc(item.reason):'');
   return '<button data-card-input="'+esc(card.id)+'" data-index="'+index+'">'+esc(item.name)+'</button> '+esc((item.motions||[]).join(' / '));
  }).filter(Boolean).join('<br>');
 }
 function functionSites(card) {
  const callers=card.component?.functionCallers;
  if(!callers?.items?.length)return '';
  return '<details><summary>Function callers ('+callers.total+')</summary>'+callers.items.map((item,index)=>{
   const where=esc(item.ownerName)+' · '+esc(item.file)+', line '+(item.line+1);
   return item.available?'<p><button data-card-caller="'+esc(card.id)+'" data-index="'+index+'">'+where+'</button></p>':'<p>'+where+' · '+esc(item.reason)+'</p>';
  }).join('')+'</details>';
 }
 function incomingLinks(card) {
  const incoming=card.component?.stateIncoming;
  if(!incoming?.items?.length)return '';
  return '<details><summary>Incoming routes ('+incoming.total+')</summary>'+incoming.items.map((edge,index)=>
   '<p><button data-incoming-card="'+esc(card.id)+'" data-index="'+index+'">From state '+esc(edge.fromState)+'</button> '+esc(edge.file)+', line '+(edge.line+1)+'<br>'+esc(edge.conditions?.expressions?.join(' / ')||'See source for conditions')+'</p>'
  ).join('')+(incoming.omitted?'<p>'+incoming.omitted+' additional routes omitted.</p>':'')+'</details>';
 }
 function planningFields(card,note) {
  return [['category','Category'],['scenario','Verified in game under these conditions'],['destination','Proposed follow-up'],['window','Proposed condition or window']].map(([key,label])=>
   '<label>'+label+' <input data-card-plan="'+esc(card.id)+'" data-field="'+key+'" maxlength="160" value="'+esc(note[key]||'')+'"></label>'
  ).join('')+(card.reference&&['state','function'].includes(card.kind)?'<button data-review-proposal="'+esc(card.id)+'">Edit the state or function for this proposal</button>':'');
 }
 function followupDetails(card,phase){if(card.profileId||!phase?.followups?.length)return '';return '<details class="behavior-followups"><summary>Authored state transitions / conditions ('+phase.followups.length+')</summary><p>Source clauses, not guaranteed cancels or evaluated windows.</p>'+phase.followups.map(row=>'<div class="behavior-route"><b>State '+esc(row.target)+'</b>'+(row.cases||[]).map(text=>'<p>'+esc(text)+'</p>').join('')+'<pre>'+esc((row.expressions||[]).join('\n'))+'</pre><button data-behavior-followup-source="'+esc(card.id)+'">Open owning StateDef source</button></div>').join('')+'</details>';}
 function render(){
  const projection=projectionFor(),needle=query.toLowerCase(),allCards=projection.cards.filter(card=>[card.label,card.kind,card.state,preferences.notes?.[noteKey(card)]?.category,...card.commands].join(' ').toLowerCase().includes(needle));page=Math.max(0,Math.min(page,Math.max(0,Math.ceil(allCards.length/60)-1)));const cards=allCards.slice(page*60,page*60+60);
  host.innerHTML='<p class="muted">Choose a move to see its input and follow-ups. Creator annotations are saved with this source snapshot.</p><div class="behavior-tools">'+(returnOrigin?'<button id="behaviorReturn">Back to '+esc(returnOrigin.label)+' · frame '+(returnOrigin.frame+1)+'</button>':'')+'<button id="behaviorCommandRecipes">Command triggers…</button><input id="behaviorSearch" type="search" aria-label="Find character behavior" placeholder="State, command, behavior…" value="'+esc(query)+'"><button id="behaviorView" aria-pressed="'+(view==='list')+'">'+(view==='list'?'Show visual cards':'Show compact keyboard list')+'</button><button id="behaviorPrevious" '+(page===0?'disabled':'')+'>Previous page</button><button id="behaviorNext" '+((page+1)*60>=allCards.length?'disabled':'')+'>Next page</button><span role="status">'+cards.length+' shown / '+allCards.length+' matching / '+projection.cards.length+' indexed behaviors · page '+(page+1)+'</span></div><details><summary>Conventional state candidates</summary><p>Numbers are conventions, not proof of ownership or complete locomotion.</p>'+projection.conventional.map(item=>'<p>'+esc(item.label)+' · '+item.state+' · '+esc(item.status)+(item.status==='not indexed'?' · commonly supplied by shared/common states; no character override is indexed <button data-behavior-override="'+item.state+'" title="Open the existing StateDef wizard in an assigned character source; choose StateDef '+item.state+'">Create override…</button>':'')+(item.id?' <button data-behavior-select="'+esc(item.id)+'">Inspect exact candidate</button>':'')+'</p>').join('')+'</details><div class="'+(view==='list'?'behavior-list':'behavior-cards')+'">'+cards.map(card=>{
   const note=preferences.notes?.[noteKey(card)]||{},thumbnail=document.getElementById('followSpritePalette')?.checked===false?(card.thumbnail?.characterPaletteSrc||card.thumbnail?.src):card.thumbnail?.src,phase=card.timing;
   return '<article class="behavior-card" tabindex="0" data-behavior-card="'+esc(card.id)+'">'+(thumbnail?'<img src="'+esc(thumbnail)+'" alt="Established AIR action preview">':'')+'<h3>'+esc(card.label)+'</h3>'+entryInputSummary(card)+'<p>'+esc(card.kind)+(card.state!==null?' · State '+card.state:'')+' · '+card.incoming+' incoming / '+card.edges.length+' outgoing</p><p>Command references: '+(commandLinks(card)||'none found in this block')+'</p><details><summary>Timing and recovery</summary><p>AIR first-active hint: '+(Number.isInteger(phase?.firstActiveHint)?phase.firstActiveHint+'t':'unknown')+' · post-window hint: '+(Number.isInteger(phase?.postWindowHint)?phase.postWindowHint+'t':'unknown')+'<br>'+esc(phase?.authored||'Authored AIR timing unavailable')+'<br>Ordinary control: '+esc(phase?.ordinaryControl||'unknown from AIR alone')+'<br>Cancel / advantage: '+esc(phase?.cancel||'unknown')+' / '+esc(phase?.advantage||'unknown')+(phase?.helperSpawn?'<br>Helper spawn: '+esc(phase.helperSpawn):'')+(phase?.helperLifetime?'<br>Helper lifetime: '+esc(phase.helperLifetime):'')+(phase?.projectile?'<br>Projectile release: '+esc(phase.projectile.release||'unknown')+'<br>Projectile lifetime: '+esc(phase.projectile.lifetime||'unknown'):'')+'</p></details>'+followupDetails(card,phase)+(card.transitionReason?'<p role="status">'+esc(/Save or revert.*DEF/i.test(card.transitionReason)?'Save DEF to follow transitions. Saved source ownership is required; no file was saved automatically.':card.transitionReason)+'</p>':'')+'<button data-behavior-select="'+esc(card.id)+'">Inspect exact '+esc(card.kind)+'</button>'+incomingLinks(card)+functionSites(card)+card.edges.map((edge,index)=>'<div class="behavior-route"><b>'+esc(card.state??card.label)+' → '+esc(edge.state??edge.expression??'?')+'</b> · '+esc(edge.label||'Transition')+'<p>'+esc(edge.conditions.labels.join(' · ')||'Authored condition')+'</p><pre>'+esc(edge.conditions.expressions.join('\n')||edge.expression||'No condition excerpt available')+'</pre><small>'+esc(edge.conditions.detail)+'</small><br>'+(edge.available?'<button '+(usedRoutes.has(edge.route)?'disabled title="Return to refresh this exact link"':'')+' data-behavior-route="'+esc(card.id)+'" data-edge="'+index+'">Open exact one-hop destination</button>':'<span>'+esc(edge.reason||'Dynamic destination is unresolved')+'</span>')+'</div>').join('')+'<details data-behavior-annotation="'+esc(card.id)+'" '+(preferences.noteOpen?.[card.id]?'open':'')+'><summary>Optional creator annotation / sketch</summary>'+planningFields(card,note)+'<label>Private annotation<textarea class="behavior-note" data-behavior-note="'+esc(card.id)+'" maxlength="4000">'+esc(note.text||'')+'</textarea></label><svg data-sketch-canvas="'+esc(card.id)+'" class="behavior-sketch" viewBox="0 0 220 110" role="img" aria-label="Creator sketch; add points using the X and Y fields"><polyline points="'+(Array.isArray(note.points)?note.points:[]).filter(point=>Array.isArray(point)&&point.length===2&&point.every(Number.isFinite)&&point[0]>=0&&point[0]<=220&&point[1]>=0&&point[1]<=110).slice(-128).map(point=>point.join(',')).join(' ')+'"></polyline></svg><label>X <input type="number" min="0" max="220" value="110" data-sketch-x="'+esc(card.id)+'"></label><label>Y <input type="number" min="0" max="110" value="55" data-sketch-y="'+esc(card.id)+'"></label><button data-sketch-add="'+esc(card.id)+'">Add sketch point</button><button data-sketch-clear="'+esc(card.id)+'">Clear sketch</button></details></article>';
  }).join('')+'</div>'+projection.limitations.map(text=>'<p class="muted">'+esc(text)+'</p>').join('');
  const current=id=>pool().find(card=>card.id===id);
  if(host.querySelector('#behaviorReturn'))host.querySelector('#behaviorReturn').onclick=returnToOrigin;
  host.querySelector('#behaviorCommandRecipes').onclick=commandRecipes;
  host.querySelector('#behaviorSearch').oninput=event=>{query=event.target.value;page=0;const position=event.target.selectionStart;render();const input=host.querySelector('#behaviorSearch');input.focus();input.setSelectionRange(position,position)};
  host.querySelector('#behaviorPrevious').onclick=()=>{page=Math.max(0,page-1);render()};host.querySelector('#behaviorNext').onclick=()=>{page++;render()};
  host.querySelector('#behaviorView').onclick=()=>{view=view==='list'?'cards':'list';persist();render();host.querySelector('#behaviorView').focus()};
  host.querySelectorAll('[data-behavior-followup-source]').forEach(button=>button.onclick=()=>{const card=current(button.dataset.behaviorFollowupSource);if(!card)return;const draft=codeDraftStore.actionState(card.component);if(draft.changed||draft.conflict||draft.pending){$('status').textContent='Apply or discard the exact source draft before opening its authored transition source.';return;}select(card);vscode.postMessage({type:'openDirectComponent',reference:card.reference});});
  host.querySelectorAll('[data-behavior-override]').forEach(button=>button.onclick=()=>vscode.postMessage({type:'moveBehaviorCreateOverride',state:Number(button.dataset.behaviorOverride)}));
  host.querySelectorAll('[data-behavior-select]').forEach(button=>button.onclick=()=>select(current(button.dataset.behaviorSelect)));
  host.querySelectorAll('[data-behavior-route]').forEach(button=>button.onclick=()=>{const card=current(button.dataset.behaviorRoute);route(card,card?.edges[Number(button.dataset.edge)])});
  const update=(id,change)=>{const card=current(id);if(!card)return;preferences.notes||={};const key=noteKey(card);preferences.notes[key]=change(preferences.notes[key]||{});persist();};
  host.querySelectorAll('[data-card-caller]').forEach(button=>button.onclick=()=>{
   const card=current(button.dataset.cardCaller),link=card?.component?.functionCallers?.items?.[Number(button.dataset.index)];
   if(!link?.available||!link.route)return;
   const state=codeDraftStore.actionState(card.component);
   if(state.changed||state.conflict||state.pending){$('status').textContent='Apply or discard this function draft before opening its caller.';return;}
   if(select(card))vscode.postMessage({type:'openFunctionCallRoute',route:link.route});
  });
  host.querySelectorAll('[data-card-input]').forEach(button=>button.onclick=()=>{
   const card=current(button.dataset.cardInput),link=card?.component?.commandUses?.items?.[Number(button.dataset.index)];
   if(!link?.available||!link.route)return;
   const state=codeDraftStore.actionState(card.component);
   if(state.changed||state.conflict||state.pending){$('status').textContent='Apply or discard this source draft before opening the input.';return;}
   if(select(card))vscode.postMessage({type:'openCommandUsageRoute',route:link.route});
  });
  host.querySelectorAll('[data-incoming-card]').forEach(button=>button.onclick=()=>{
   const card=current(button.dataset.incomingCard),edge=card?.component?.stateIncoming?.items?.[Number(button.dataset.index)];
   if(edge)route(card,edge);
  });
  host.querySelectorAll('[data-review-proposal]').forEach(button=>button.onclick=()=>{
   const card=current(button.dataset.reviewProposal);
   if(!select(card))return;
   const editor=document.getElementById('directCodeEditor');
   if(editor){disclosure.open=false;editor.focus();editor.scrollIntoView({block:'nearest'});}
  });
  host.querySelectorAll('[data-card-plan]').forEach(field=>field.oninput=()=>{
   const key=field.dataset.field;
   if(['category','scenario','destination','window'].includes(key))update(field.dataset.cardPlan,note=>({...note,[key]:field.value.slice(0,160)}));
  });
  host.querySelectorAll('[data-behavior-annotation]').forEach(details=>details.ontoggle=()=>{preferences.noteOpen||={};preferences.noteOpen[details.dataset.behaviorAnnotation]=details.open;persist()});
  host.querySelectorAll('[data-sketch-canvas]').forEach(svg=>svg.onpointerdown=event=>{const rect=svg.getBoundingClientRect();if(!rect.width||!rect.height)return;const x=Math.round((event.clientX-rect.left)*220/rect.width),y=Math.round((event.clientY-rect.top)*110/rect.height);if(x<0||x>220||y<0||y>110)return;update(svg.dataset.sketchCanvas,note=>({...note,points:[...(note.points||[]),[x,y]].slice(-128)}));render()});
  host.querySelectorAll('[data-behavior-note]').forEach(area=>area.oninput=()=>update(area.dataset.behaviorNote,note=>({...note,text:area.value.slice(0,4000)})));
  host.querySelectorAll('[data-sketch-add]').forEach(button=>button.onclick=()=>{const id=button.dataset.sketchAdd,x=Number([...host.querySelectorAll('[data-sketch-x]')].find(node=>node.dataset.sketchX===id).value),y=Number([...host.querySelectorAll('[data-sketch-y]')].find(node=>node.dataset.sketchY===id).value);if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>220||y<0||y>110)return;update(id,note=>({...note,points:[...(note.points||[]),[x,y]].slice(-128)}));render()});
  host.querySelectorAll('[data-sketch-clear]').forEach(button=>button.onclick=()=>{update(button.dataset.sketchClear,note=>({...note,points:[]}));render()});
  const elements=[...host.querySelectorAll('[data-behavior-card]')];elements.forEach((element,index)=>element.onkeydown=event=>{if(event.target!==element)return;const target=event.key==='Home'?0:event.key==='End'?elements.length-1:event.key==='ArrowDown'?Math.min(elements.length-1,index+1):event.key==='ArrowUp'?Math.max(0,index-1):-1;if(target>=0){event.preventDefault();elements[target].focus()}else if(event.key==='Enter'){event.preventDefault();select(current(element.dataset.behaviorCard))}});
 }
 disclosure.open=preferences.open===true||model.browseBehaviors===true;disclosure.ontoggle=()=>{preferences.open=disclosure.open;persist();if(disclosure.open)render()};
 document.addEventListener('change',event=>{if(event.target?.id==='followSpritePalette'&&disclosure.open)render()});
 window.addEventListener('message',event=>{if(event.data?.type==='moveBehaviorBrowse'){disclosure.open=true;render();disclosure.scrollIntoView({block:'nearest'});disclosure.querySelector('summary')?.focus();return;}if(event.data?.type==='model')queueMicrotask(()=>{usedRoutes.clear();if(returnOrigin&&returnOrigin.owner!==owner())returnOrigin=null;if(disclosure.open)render()})});render();
 globalThis.ikemenMoveBehaviorReview={render,select,route,returnToOrigin};
}
function clientScript(){return `(${client.toString()})(${project.toString()});`;}
module.exports={project,markup,style,clientScript};
