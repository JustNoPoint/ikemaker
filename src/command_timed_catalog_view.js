'use strict';

// Command Maker "Timed command catalog" picker: section HTML, CSS and client script.
// The webview never builds routes itself; it asks the host (previewCatalogRoute) so Command Maker and
// Move Lab share one implementation (command_route_model.js). Missing native definitions are inserted by
// Command Maker at a reviewed position ("Add definitions & copy route"); maps are never required.

function timedCatalogCss() {
  return '.timed-catalog,.route-order{border:1px solid var(--line);background:#15191f;padding:8px;margin:8px 0}.timed-catalog-grid{display:grid;grid-template-columns:minmax(110px,150px) minmax(0,1fr);gap:5px 8px;align-items:center}.timed-catalog-grid select,.timed-catalog-grid input{min-width:0;width:100%}.timed-catalog-buttons{display:flex;flex-wrap:wrap;gap:6px;border:0;padding:0;margin:0}.timed-catalog-buttons label,.catalog-check{display:flex;gap:4px;align-items:center}.timed-catalog pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#0d1015;border:1px solid var(--line);padding:6px;max-height:220px;overflow:auto}.timed-catalog .catalog-info,.route-order .catalog-info{font-size:11px;line-height:1.45}.catalog-warning{color:var(--warn)}.catalog-error{color:var(--bad)}.catalog-ok{color:var(--good)}.timed-catalog-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}.catalog-placement{border:1px dashed var(--line);padding:6px;margin-top:6px}.catalog-placement select{width:100%}.catalog-placement>b,.catalog-placement>label[for]{display:block;margin:2px 0 4px}.route-order-issue{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:4px 0}.route-order-issue span{flex:1 1 220px}@media(max-width:560px){.timed-catalog-grid{grid-template-columns:1fr}}';
}

function timedCatalogHtml() {
  return '<section class="timed-catalog" id="timedCatalog" aria-labelledby="timedCatalogTitle"><h3 id="timedCatalogTitle">Timed command catalog</h3>'
    + '<p class="muted catalog-info" id="timedCatalogSource"></p>'
    + '<div class="timed-catalog-grid">'
    + '<label for="catalogFilter">Find family</label><input id="catalogFilter" placeholder="qcf, dp, charge, seq…" autocomplete="off">'
    + '<label for="catalogFamily">Family</label><select id="catalogFamily" size="6" aria-describedby="catalogFamilyInfo"></select>'
    + '<span></span><div id="catalogFamilyInfo" class="catalog-info" aria-live="polite"></div>'
    + '<span></span><button id="catalogOptionalPreset" hidden>Open optional-input preset…</button>'
    + '<span>Buttons</span><fieldset class="timed-catalog-buttons" id="catalogButtons" aria-label="Final buttons"></fieldset>'
    + '<label for="catalogEdge">Edge</label><select id="catalogEdge"><option value="press">Press</option><option value="release">Release (negative edge)</option><option value="either">Press or release</option></select>'
    + '<label for="catalogPosture">Posture</label><select id="catalogPosture"><option value="grounded">Grounded (StateType != A)</option><option value="airborne">Airborne (StateType = A)</option><option value="any">Any posture</option></select>'
    + '<label for="catalogAirPolicy">Air orientation</label><select id="catalogAirPolicy"><option value="recognition-facing">Keep recognized direction (default)</option><option value="live-p2-side">Follow opponent after crossing (HDBZ)</option></select>'
    + '<span></span><button id="copyAirSetting" title="Replace the air policy assignment in the character input parser initialization">Copy air policy setting</button>'
    + '<label for="catalogSource">Route source</label><select id="catalogSource"><option value="native">Native command result</option><option value="parser-request">Input parser request</option></select>'
    + '<label for="catalogGate">Control gate</label><select id="catalogGate"><option value="ctrl">ctrl</option><option value="ctrl-or-jumpstart">ctrl or jump start (StateNo = 40)</option><option value="none">No gate</option></select>'
    + '<label for="catalogLanguage">Output</label><select id="catalogLanguage"><option value="cns">CNS</option><option value="zss">ZSS</option></select>'
    + '<label for="catalogMinDistance">Min P2 distance</label><input id="catalogMinDistance" type="number" min="0" step="1" placeholder="Optional — inclusive, absolute horizontal">'
    + '<label for="catalogMaxDistance">Max P2 distance</label><input id="catalogMaxDistance" type="number" min="0" step="1" placeholder="Optional — inclusive, absolute horizontal">'
    + '<label for="catalogDistanceUnits">Distance units</label><select id="catalogDistanceUnits"><option value="const240p">Pixels at 240p reference (Const240p)</option><option value="owner">Owner coordinate units</option></select>'
    + '<label for="catalogStateNo">Target state</label><input id="catalogStateNo" type="number" placeholder="Optional — condition only when empty">'
    + '<label for="catalogNaming">New command names</label><select id="catalogNaming"><option value="owner">Match this character\'s naming</option><option value="reference">Keep catalog names</option></select>'
    + '</div>'
    + '<pre id="catalogPreview" aria-live="polite" aria-label="Generated route"></pre><ul id="catalogNotes" class="catalog-info"></ul>'
    + '<div class="catalog-placement" id="catalogPlacementBox" hidden><b id="catalogPlacementTitle">Definitions to add</b>'
    + '<label for="catalogPlacement" class="catalog-info">Place in the command file</label><select id="catalogPlacement" size="6" aria-describedby="catalogPlacementNote"></select>'
    + '<p id="catalogPlacementNote" class="catalog-info" aria-live="polite"></p>'
    + '<label class="catalog-check catalog-info"><input type="checkbox" id="catalogHeldStartPair"><span id="catalogHeldStartLabel">Native held-start pair (no maps)</span></label></div>'
    + '<div class="timed-catalog-actions"><button id="insertCatalogAndCopy">Add definitions &amp; copy route</button><button id="copyCatalogRoute">Copy route only</button><button id="insertCatalogDefinitions">Add definitions only</button></div>'
    + '</section>'
    + '<section class="route-order" id="routeOrder" aria-labelledby="routeOrderTitle"><h3 id="routeOrderTitle">State -1 route order</h3>'
    + '<p class="muted catalog-info">The first ChangeState that fires wins. A route whose command completes on the same tick as a simpler route above it never runs.</p>'
    + '<div id="routeOrderList" class="catalog-info" role="list"></div></section>';
}

function timedCatalogClientScript() {
  return `
;(()=>{
const cat=data.timedCatalog||{families:[]};let catalogRequest=0,catalogTimer=0,lastRoute=null,lastPlacement=null,placementTouched=false;
const el=id=>document.getElementById(id);
const famById=id=>(cat.families||[]).find(f=>f.id===id);
const fmt=v=>Array.isArray(v)?(v.length?v.join(' / '):'—'):String(v);
const li=(text,cls)=>{const n=document.createElement('li');if(cls)n.className=cls;n.textContent=text;return n;};
function sourceLine(){const own=cat.source&&cat.source.file?cat.source.file.split(/[\\\\/]/).pop():'none';const ref=cat.reference&&cat.reference.provenance?cat.reference.provenance:null;const naming=cat.naming&&cat.naming.stemCase&&cat.naming.stemCase!=='reference'?' · Naming detected: '+(cat.naming.stemCase==='upper'?'UPPERCASE motion names':'lowercase motion names')+' ('+(cat.naming.evidence||[]).slice(0,2).join(', ')+')':'';el('timedCatalogSource').textContent='This character: '+own+(cat.parser?' + input parser '+String(cat.parser.file||'').split(/[\\\\/]/).pop():'')+(ref?' · Built-in reference: '+ref.title+' by '+ref.authoredBy:'')+naming;}
function renderFamilies(){const q=el('catalogFilter').value.trim().toLowerCase();const sel=el('catalogFamily'),prev=sel.value;sel.innerHTML='';
 for(const f of cat.families||[]){if(q&&!(f.id.toLowerCase().includes(q)||(f.displayName||f.id).toLowerCase().includes(q)||f.kind.includes(q)))continue;const o=document.createElement('option');o.value=f.id;o.textContent=(f.displayName||f.id)+' — '+f.kind.replace(/-/g,' ')+(f.origin==='owner'?(f.reference?' · this character + built-in catalog':' · this character'):' · built-in catalog')+(f.parserOnly?' · parser only':'');sel.appendChild(o);}
 for(const p of data.presets||[]){if(!p.kickMash||q&&!p.label.toLowerCase().includes(q)&&!p.id.includes(q))continue;const o=document.createElement('option');o.value='recipe:'+p.id;o.textContent=p.label+' — ZSS recipe';sel.appendChild(o);}
 const options=Array.from(sel.options||[]);if(options.some(o=>o.value===prev))sel.value=prev;else if(options.length)sel.selectedIndex=0;renderFamily();}
function renderFamily(){const f=famById(el('catalogFamily').value);const box=el('catalogButtons');box.innerHTML='';const info=el('catalogFamilyInfo');placementTouched=false;
 const optional=(data.presets||[]).find(p=>p.family && f && p.family.toLowerCase()===f.id.toLowerCase());
 const optionalButton=el('catalogOptionalPreset');
 const kick=(data.presets||[]).find(p=>p.kickMash&&'recipe:'+p.id===el('catalogFamily').value);
 optionalButton.textContent=kick?'Copy ZSS recognizer':'Open optional-input preset…';
 if(kick){clearTimeout(catalogTimer);catalogRequest++;lastRoute=null;lastPlacement=null;info.textContent=kick.explanation;optionalButton.hidden=false;optionalButton.onclick=()=>vscode.postMessage({type:'insertPreset',id:kick.id});el('catalogPreview').textContent=kick.snippet;el('catalogNotes').textContent='';el('catalogPlacementBox').hidden=true;for(const id of ['copyCatalogRoute','insertCatalogDefinitions','insertCatalogAndCopy'])setControlAvailability(id,false,'Copy the ZSS recognizer above.');return;}
 optionalButton.hidden=!optional;
 optionalButton.onclick=()=>{if(optional)document.querySelector('[data-preset="'+optional.id+'"]')?.click();};
 if(!f){info.textContent='No family matches.';for(const id of ['copyCatalogRoute','insertCatalogDefinitions','insertCatalogAndCopy'])setControlAvailability(id,false,'Choose a catalog family first.');el('catalogPreview').textContent='';return;}
 f.buttons.forEach((b,i)=>{const l=document.createElement('label');const c=document.createElement('input');c.type='checkbox';c.value=b;c.checked=i===0;c.onchange=()=>{placementTouched=false;queuePreview();};l.append(c,document.createTextNode(b));box.appendChild(l);});
 if(!f.buttons.length){const s=document.createElement('span');s.className='muted';s.textContent=f.parserOnly?'Published by the parser':'No final button (sequence identifies the command)';box.appendChild(s);}
 const t=f.timing||{};
 const s=f.support||{};const lines=[
  'Recognition: time '+fmt(t.time)+' · steptime '+fmt(t.stepTime)+' · buffer.time '+fmt(t.bufferTime)+' · hitpause '+fmt(t.bufferHitpause)+' · pauseend '+fmt(t.bufferPauseend)+' · '+(t.definitions||0)+' authored definition(s)',
  'Orientation: '+f.orientation+(f.end?' · ends '+f.end:'')+(f.mirror?' · mirror '+f.mirror:'')+' · Engine: v1.0.0 '+(f.engine.stable?'yes':'no')+' · Nightly '+(f.engine.nightly?'yes':'no')+(f.engine.reasons.length?' — '+f.engine.reasons.join(' '):''),
  ...(f.derived?[f.derived]:[])];
 // Guidance is informational: native definitions work on their own; HDBZ refinements are optional.
 info.innerHTML=lines.map(x=>'<div>'+esc(x)+'</div>').join('')+(s.guidance||[]).map(x=>'<div class="muted">'+esc(x)+'</div>').join('');
 const ch=f.choices||{sources:f.parserOnly?[]:['native'],parserLanguages:[],liveP2Side:false,reasons:{}};const src=el('catalogSource');
 if(!ch.sources.includes(src.value))src.value=ch.sources[0]||'native';
 setControlAvailability((src.options||[])[0],ch.sources.includes('native'),ch.reasons.native||'Native routing is unavailable for this family.');
 setControlAvailability((src.options||[])[1],ch.sources.includes('parser-request'),ch.reasons.parser||'The input parser route is unavailable for this family.');
 // Held-start pair: only for families whose HDBZ start deadline separates fresh press from held release.
 const gated=(f.dependencies||[]).some(d=>d.kind==='start-window'&&!d.mappedOnly),dl=cat.heldStartDeadlines;const pair=el('catalogHeldStartPair');pair.checked=false;
 setControlAvailability(pair,Boolean(gated&&dl&&!f.parserOnly),'This family has no fresh-press / held-release start deadline to reproduce.');
 el('catalogHeldStartLabel').textContent=dl?'Native held-start pair: fresh press '+dl.press+' ticks / held release '+dl.release+' ticks (two same-named definitions, no maps)':'Native held-start pair (no maps)';
 syncAir();queuePreview();}
// Live P2 side is offered only for air-capable postures on parser routes whose owner parser stores the
// recognition-time endpoint; output languages are limited to what the owner parser can support.
function syncAir(){const f=famById(el('catalogFamily').value);const ch=(f&&f.choices)||{liveP2Side:false,parserLanguages:[],reasons:{}};const air=el('catalogPosture').value!=='grounded';const parser=el('catalogSource').value==='parser-request';
 const live=air&&parser&&ch.liveP2Side;if(!live)el('catalogAirPolicy').value='recognition-facing';
 setControlAvailability('catalogAirPolicy',live,!air?'Grounded routes always use the facing at recognition.':!parser?'Live P2 side needs the owner parser\\'s stored recognition-time endpoint; a native command result cannot provide it.':(ch.reasons.live||'Live P2 side is unavailable for this family.'));
 setControlAvailability('copyAirSetting',live,'Choose an airborne parser route with a horizontal endpoint.');
 const lang=el('catalogLanguage');for(const o of Array.from(lang.options||[]))setControlAvailability(o,!parser||ch.parserLanguages.includes(o.value),'The owner parser cannot support this output for this family. '+(ch.reasons.parser||''));
 if(parser&&!ch.parserLanguages.includes(lang.value)&&ch.parserLanguages.length)lang.value=ch.parserLanguages[0];}
function request(){const f=famById(el('catalogFamily').value);const box=el('catalogButtons');return{familyId:f&&f.id,buttons:Array.from(box&&box.querySelectorAll?box.querySelectorAll('input:checked'):[]).map(c=>c.value),edge:el('catalogEdge').value,posture:el('catalogPosture').value,airPolicy:el('catalogAirPolicy').value,source:el('catalogSource').value,gate:el('catalogGate').value,language:el('catalogLanguage').value,stateNo:el('catalogStateNo').value,minDistance:el('catalogMinDistance').value,maxDistance:el('catalogMaxDistance').value,distanceUnits:el('catalogDistanceUnits').value,naming:el('catalogNaming').value,beforeIndex:placementTouched?el('catalogPlacement').value:'suggested'};}
function queuePreview(){clearTimeout(catalogTimer);catalogTimer=setTimeout(()=>{const r=request();if(!r.familyId)return;catalogRequest+=1;vscode.postMessage({type:'previewCatalogRoute',requestId:catalogRequest,request:r});},60);}
// Placement list: suggested position first, then "before <command>" for every existing command, then end.
function renderPlacement(route,placement){const box=el('catalogPlacementBox');const missing=(route&&route.missingDefinitions)||[];
 const has=missing.length>0;box.hidden=!has;setControlAvailability('insertCatalogAndCopy',has,'This route only uses commands the character already defines.');setControlAvailability('insertCatalogDefinitions',has,'Nothing to add: every command this route uses is already defined.');
 if(!has||!placement)return;lastPlacement=placement;
 el('catalogPlacementTitle').textContent='Definitions to add to '+(cat.commandFileName||'the command file')+': '+missing.join(', ');
 const sel=el('catalogPlacement'),keep=placementTouched?sel.value:null;sel.innerHTML='';
 const add=(value,text)=>{const o=document.createElement('option');o.value=value;o.textContent=text;sel.appendChild(o);};
 add('suggested','Suggested: '+placement.reason);
 for(const row of cat.commandRows||[])add(String(row.index),'Before '+row.name+' ('+row.command+') · complexity '+row.complexity+(row.complexity<placement.complexity?' · less complex':row.complexity>placement.complexity?' · more complex':''));
 add('end','At the end of the file');
 sel.value=keep!==null&&Array.from(sel.options||[]).some(o=>o.value===keep)?keep:'suggested';
 const note=el('catalogPlacementNote');note.textContent=placement.note.text;note.className='catalog-info '+(placement.note.status==='review'?'catalog-warning':'catalog-ok');}
addEventListener('message',event=>{const m=event.data;if(!m||m.type!=='catalogRoutePreview'||m.requestId!==catalogRequest)return;const notes=el('catalogNotes');notes.innerHTML='';
 if(m.error){lastRoute=null;el('catalogPreview').textContent='';notes.appendChild(li(m.error,'catalog-error'));for(const id of ['copyCatalogRoute','insertCatalogAndCopy','insertCatalogDefinitions'])setControlAvailability(id,false,m.error);el('catalogPlacementBox').hidden=true;return;}
 lastRoute=m.route;el('catalogPreview').textContent=m.route.text;for(const w of m.route.warnings)notes.appendChild(li(w,'catalog-warning'));for(const n of m.route.notes)notes.appendChild(li(n));setControlAvailability('copyCatalogRoute',true,'');renderPlacement(m.route,m.placement);});
addEventListener('message',event=>{
 const m=event.data;if(m?.type!=='browsePremadeCommand')return;
 showTab('command');
 const reveal=node=>{for(let p=node;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;node.scrollIntoView({block:'center'});node.focus();};
 if(m.kind==='preset'){const button=Array.from(document.querySelectorAll('[data-preset]')).find(node=>node.dataset.preset===m.id);if(button){reveal(button);button.click();}return;}
 if(!famById(m.id))return;
 el('catalogFilter').value='';renderFamilies();el('catalogFamily').value=m.id;renderFamily();reveal(el('catalogFamily'));
});
el('catalogFilter').oninput=renderFamilies;el('catalogFamily').onchange=renderFamily;
for(const id of ['catalogEdge','catalogAirPolicy','catalogGate','catalogLanguage','catalogNaming'])el(id).onchange=()=>{placementTouched=false;queuePreview();};
el('copyAirSetting').onclick=()=>vscode.postMessage({type:'copyCatalogAirSetting',request:request()});
el('catalogSource').onchange=()=>{syncAir();queuePreview();};
el('catalogPosture').onchange=()=>{syncAir();queuePreview();};el('catalogStateNo').oninput=queuePreview;el('catalogMinDistance').oninput=queuePreview;el('catalogMaxDistance').oninput=queuePreview;el('catalogDistanceUnits').onchange=queuePreview;
el('catalogPlacement').onchange=()=>{placementTouched=true;queuePreview();};
el('copyCatalogRoute').onclick=()=>vscode.postMessage({type:'copyCatalogRoute',request:request()});
const insert=copyRoute=>{const r=request();vscode.postMessage({type:'insertCatalogDefinitions',request:r,beforeIndex:r.beforeIndex,heldStartPair:Boolean(el('catalogHeldStartPair').checked),copyRoute});};
el('insertCatalogAndCopy').onclick=()=>insert(true);el('insertCatalogDefinitions').onclick=()=>insert(false);
// State -1 route order: one row per route that is shadowed by a simpler route above it.
function renderRouteOrder(){const list=el('routeOrderList');if(!list||typeof list.appendChild!=='function'||typeof document.createElement!=='function')return;list.innerHTML='';const ro=cat.routeOrder||{analyses:[],zssNotAnalyzed:[]};
 const row=(html,cls)=>{const d=document.createElement('div');d.className='route-order-issue '+(cls||'');d.setAttribute('role','listitem');d.innerHTML=html;list.appendChild(d);return d;};
 if(ro.error)row('<span class="catalog-error">'+esc(ro.error)+'</span>');
 if(!(ro.analyses||[]).length)row('<span class="muted">No CNS [Statedef -1] routes found in the command file or assigned state files.</span>');
 for(const a of ro.analyses||[]){
  if(!a.issues.length)row('<span class="catalog-ok">'+esc(a.fileName)+': '+a.routes.length+' command routes · no route is shadowed by a simpler route above it.</span>');
  for(const issue of a.issues){const d=row('<span class="catalog-warning">'+esc(a.fileName)+': '+esc(issue.message)+'</span>');const b=document.createElement('button');b.textContent='Move "'+issue.laterLabel+'" above';b.onclick=()=>vscode.postMessage({type:'moveRouteAbove',file:a.file,fingerprint:a.fingerprint,later:issue.later,earlier:issue.earlier});d.appendChild(b);}
  if((a.undefinedCommands||[]).length)row('<span class="catalog-warning">'+esc(a.fileName)+': routes use undefined commands: '+esc(a.undefinedCommands.join(', '))+'</span>');}
 for(const f of ro.zssNotAnalyzed||[])row('<span class="muted">'+esc(f)+': ZSS StateDef -1 order is not analyzed yet.</span>');}
sourceLine();renderFamilies();renderRouteOrder();
})();
`;
}

module.exports = { timedCatalogCss, timedCatalogHtml, timedCatalogClientScript };
