'use strict';
const labels={overview:'Overview',entities:'Entities',data:'Data',execution:'Execution',lua:'Lua',repairs:'Repairs'};
document.querySelectorAll('nav button').forEach((button)=>button.addEventListener('click',()=>{
  document.querySelectorAll('nav button').forEach((item)=>item.removeAttribute('aria-current'));
  button.setAttribute('aria-current','page');
  document.querySelector('#view h1').textContent=labels[button.dataset.view];
}));

const actionButtons=Object.fromEntries([...document.querySelectorAll('[data-action]')].map((button)=>[button.dataset.action,button]));
const statusNode=document.querySelector('#status');
const {lifetimeStatus}=IKeMeterLabels;
let pending=false;
let transientError='';
let selectedLifetimeId=null;
let selectedSampleTick=null;
let followLatest=true;
let historyRequest=0;
let statusRequest=0;
let renderedAuthority=null;
let authorityGeneration=0;
let actionRequest=0;
let lastStatus={connected:false,phase:'disconnected',reason:'no authenticated bridge session'};

function render(status){
  const connected=status.connected===true;
  const phase=status.phase||'disconnected';
  const suspended=phase==='window-suspended',restarting=status.restartAvailable===true;
  const ended=status.gameExited===true,revoked=connected&&(phase==='uncertain'||ended);
  document.querySelector('#session-guidance').textContent=status.detachedGameRunning?'The previous Meter-owned game is still running. Close it before Connect starts a new game.':restarting?(ended?'Start new game & Connect starts a fresh match.':'Restart game & Connect closes this Meter-owned match and starts a fresh one. Disconnect keeps the match open.'):suspended?'Controls are suspended during verified window movement. The interval is unknown; a fresh authenticated capture is required after release.':ended?'The game has exited. Disconnect to finish cleanup before connecting again.':revoked?'Session controls are revoked. Disconnect before connecting again.':connected?'The interactive game is running in its own window. Use Pause, Step, Resume or Disconnect here.':'Connect starts a NEW game; it does not attach to an existing match. Close a previously detached match first if you do not want another game.';
  const authority=`${status.sessionId||''}:${status.epoch||''}:${status.continuityRevision||0}:${phase==='uncertain'||!connected}`;
  if(authority!==renderedAuthority){authorityGeneration++;if(renderedAuthority!==null){historyRequest++;transientError='';clearHistory(connected?'Loading history for the current session.':'Disconnected. Connect to view session history.');}}
  renderedAuthority=authority;
  statusNode.textContent=transientError&&!ended?`Control rejected — ${transientError}`:(connected?`${ended?'Game exited':revoked?'Session revoked':suspended?'Suspended':'Connected'} — epoch ${status.epoch}, tick ${status.tick}, ${phase}${status.reason?` — ${status.reason}`:''}${status.notice?` — ${status.notice}`:''}.`:`Disconnected — ${status.reason||'no authenticated bridge session'}.`);
  statusNode.classList.toggle('connected',connected&&!revoked&&!suspended);
  document.querySelector('#session-value').textContent=connected?`${ended?'Game exited · ':revoked?'Revoked · ':''}Epoch ${status.epoch}`:'Disconnected';
  document.querySelector('#tick-value').textContent=Number.isSafeInteger(status.tick)?String(status.tick):'No samples';
  document.querySelector('#controls-value').textContent=connected&&!revoked?(pending?'Waiting for acknowledgement':phase):'Unavailable';
  actionButtons.connect.disabled=pending||(connected&&!restarting)||suspended||status.detachedGameRunning===true;
  actionButtons.pause.disabled=pending||!connected||phase!=='running';
  actionButtons.step.disabled=pending||!connected||phase!=='paused';
  actionButtons.resume.disabled=pending||!connected||phase!=='paused';
  actionButtons.disconnect.disabled=pending||!connected;
  actionButtons.connect.dataset.restart=String(restarting);actionButtons.connect.textContent=restarting?(ended?'Start new game & Connect':'Restart game & Connect'):'↔';actionButtons.connect.title=restarting?'Stop the exact Meter-owned game, wait for cleanup, and Connect with a fresh identity':'Connect starts a new local game';
  for(const [name,button] of Object.entries(actionButtons)){
    const available=!button.disabled;const label=available?name[0].toUpperCase()+name.slice(1):`${name[0].toUpperCase()+name.slice(1)} unavailable`;
    button.setAttribute('aria-label',name==='connect'&&restarting?actionButtons.connect.textContent:label);
  }
}

function setCurrent(button,current){if(current)button.setAttribute('aria-current','true');else button.removeAttribute('aria-current');}

async function refreshHistory(){
  const request=++historyRequest;const sessionId=lastStatus.sessionId;const epoch=lastStatus.epoch;
  try{
    const history=await(await fetch('/api/history')).json();
    if(request!==historyRequest||!lastStatus.connected||history.sessionId!==sessionId||history.epoch!==epoch)return;
    const list=document.querySelector('#entity-list');
    const existing=new Map([...list.querySelectorAll('[data-lifetime-id]')].map((node)=>[node.dataset.lifetimeId,node]));
    const items=[...history.lifetimes].sort((a,b)=>Number(a.closed)-Number(b.closed)||a.firstTick-b.firstTick);
    list.querySelector('[data-placeholder]')?.remove();
    items.forEach((item,index)=>{
      let button=existing.get(item.id);
      if(!button){button=document.createElement('button');button.className='entity';button.dataset.lifetimeId=item.id;button.addEventListener('click',()=>{if(button.isConnected&&button._authority===renderedAuthority)selectLifetime(button.dataset.lifetimeId);});}
      const prior=item.sessionId!==sessionId||item.epoch!==epoch;
      const lifetimeLabel=lifetimeStatus(item);
      const identity=item.kind==='projectile'?`proj ${item.authoredId} · source ${item.sourceRuntimeId} · observation ${item.runtimeId}`:`ID ${item.runtimeId}`;
      button.textContent=`${item.kind} P${item.owner} · ${identity}${item.identityAmbiguous?' · identity uncertain':''}${lifetimeLabel?` · ${lifetimeLabel}`:''}${prior?' · prior session':''}`;
      setCurrent(button,item.id===selectedLifetimeId);button._item=item;button._authority=renderedAuthority;
      const at=list.children[index];if(at!==button)list.insertBefore(button,at||null);
      existing.delete(item.id);
    });
    for(const node of existing.values())node.remove();
    if(items.length===0){const p=document.createElement('p');p.dataset.placeholder='true';p.textContent='No observed entities.';list.append(p);}
    if(selectedLifetimeId){const selected=items.find((item)=>item.id===selectedLifetimeId);if(selected)renderInspector(selected);else clearInspector('The selected lifetime is no longer retained.');}
  }catch{}
}

function selectLifetime(id){
  selectedLifetimeId=id;selectedSampleTick=null;followLatest=true;
  const button=document.querySelector(`[data-lifetime-id="${CSS.escape(id)}"]`);
  if(button?._item)renderInspector(button._item);refreshHistory();
}

function renderInspector(item){
  const node=document.querySelector('#inspector');let title=node.querySelector('strong'),values=node.querySelector('p'),scrub=node.querySelector('input');
  if(!title){
    node.replaceChildren();title=document.createElement('strong');values=document.createElement('p');scrub=document.createElement('input');
    scrub.type='range';scrub.min='0';scrub.setAttribute('aria-label','Retained sample tick');
    scrub.addEventListener('input',()=>{const current=document.querySelector(`[data-lifetime-id="${CSS.escape(selectedLifetimeId)}"]`)?._item;if(!current)return;const sample=current.samples[Number(scrub.value)];selectedSampleTick=sample?.tick??null;followLatest=false;renderInspector(current);});
    node.append(title,values,scrub);
  }
  const samples=item.samples||[];let index=Math.max(0,samples.length-1);let evicted=false;
  if(!followLatest&&selectedSampleTick!==null){const anchored=samples.findIndex((sample)=>sample.tick===selectedSampleTick);if(anchored>=0)index=anchored;else evicted=true;}
  const sample=evicted?null:samples[index];if(followLatest&&sample)selectedSampleTick=sample.tick;
  const lifetimeLabel=lifetimeStatus(item);
  const identity=item.kind==='projectile'?`proj ${item.authoredId} · source ${item.sourceRuntimeId} · observation ${item.runtimeId}`:`ID ${item.runtimeId}`;
  title.textContent=`${item.kind} · P${item.owner} · ${identity}${item.identityAmbiguous?' · identity uncertain':''}${lifetimeLabel?` · ${lifetimeLabel}`:''}`;
  scrub.max=String(Math.max(0,samples.length-1));scrub.value=String(index);scrub.disabled=samples.length<2;
  values.textContent=evicted?`Tick ${selectedSampleTick} is no longer retained.`:(sample?`Tick ${sample.tick}: ${item.kind==='projectile'?`proj ID ${sample.state}`:`state ${sample.state}`}, anim ${sample.anim}, pos ${sample.x}, ${sample.y}, vel ${sample.vx}, ${sample.vy}`:'No retained watch sample');
}

function clearHistory(message){
  const list=document.querySelector('#entity-list'),p=document.createElement('p');p.dataset.placeholder='true';p.textContent=message;list.replaceChildren(p);clearInspector('Select an entity to inspect its history.');
}

function clearInspector(message='Select an observed entity or event.'){
  selectedLifetimeId=null;selectedSampleTick=null;followLatest=true;
  const p=document.createElement('p');p.textContent=message;document.querySelector('#inspector').replaceChildren(p);
}

async function pollStatus(){
  const request=++statusRequest;
  try{const status=await(await fetch('/api/status')).json();if(request!==statusRequest)return;lastStatus=status;render(status);if(status.connected)await refreshHistory();}catch{}
}

async function pollLoop(){await pollStatus();setTimeout(pollLoop,250);}

async function requestAction(action){
  if(action==='connect'&&lastStatus.restartAvailable===true)action='restart';
  const request=++actionRequest;
  statusRequest++;historyRequest++;transientError='';pending=true;render(lastStatus);
  const authorityAtRequest=authorityGeneration;
  try{
    const headers={'Content-Type':'application/json','X-IKeMeter-Action':'1'};if(lastStatus.sessionId){headers['X-IKeMeter-Session']=lastStatus.sessionId;headers['X-IKeMeter-Epoch']=String(lastStatus.epoch);headers['X-IKeMeter-Continuity']=String(lastStatus.continuityRevision||0);}
    const response=await fetch(`/api/${action}`,{method:'POST',headers});
    const value=await response.json();if(request!==actionRequest||authorityAtRequest!==authorityGeneration)return;
    if(!response.ok)throw new Error(value.error||'Bridge request failed');lastStatus=value;statusRequest++;historyRequest++;
  }catch(error){
    if(request!==actionRequest||authorityAtRequest!==authorityGeneration)return;
    transientError=error.message;const fallback=++statusRequest,fallbackAuthority=authorityGeneration;
    try{const response=await fetch('/api/status'),status=await response.json();if(request===actionRequest&&fallback===statusRequest&&fallbackAuthority===authorityGeneration){lastStatus=status;historyRequest++;}}catch{}
  }
  finally{if(request===actionRequest){pending=false;render(lastStatus);if(lastStatus.connected)await refreshHistory();}}
}

Object.values(actionButtons).forEach((button)=>button.addEventListener('click',()=>requestAction(button.dataset.action)));
pollLoop();
