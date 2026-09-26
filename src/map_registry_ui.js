'use strict';

const path = require('path');
const { initialize } = require('./map_registry_service');
const { snippet, buildTree } = require('./map_registry_model');
const { preferredViewerColumn, trackViewerPanel } = require('./viewer_group');
const { TEXT_GRAMMAR_KEY, textGrammar } = require('./map_registry_grammar');
const { filterEntries } = require('./map_registry_browser_model');

let panel, browserState;

function escape(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
function safe(value) { return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026'); }

function editorTarget(vscode, context, documentOverride) {
  const editor = documentOverride ? vscode.window.visibleTextEditors?.find((item) => item.document === documentOverride) : vscode.window.activeTextEditor;
  const document = documentOverride || editor?.document, language = textGrammar(document, context);
  if (!editor || !document || !language) return null;
  return { kind: 'editor', uri: document.uri.toString(), filename: document.fileName, language, grammar: language === 'zss' ? 'code' : 'expression', version: document.version, selection: { start: document.offsetAt(editor.selection.start), end: document.offsetAt(editor.selection.end) } };
}

async function configureTextGrammar(vscode, context, explicit = false) {
  const editor = vscode.window.activeTextEditor, document = editor?.document;
  if (!document || path.extname(document.fileName).toLowerCase() !== '.txt') { if (explicit) await vscode.window.showInformationMessage('Open a .txt file to choose whether it contains ZSS or CNS code.'); return editorTarget(vscode, context); }
  const captured = { uri: document.uri.toString(), version: document.version, start: document.offsetAt(editor.selection.start), end: document.offsetAt(editor.selection.end) };
  const choice = await vscode.window.showQuickPick([{ label: 'Treat this .txt as ZSS code', language: 'zss' }, { label: 'Treat this .txt as CNS code', language: 'ikemen-cns' }, { label: 'Do not treat this .txt as code', language: '' }], { title: 'Map authoring grammar for this text file', placeHolder: 'Stored in local workspace UI state; the file is not modified' });
  if (!choice) return null;
  const current = context.workspaceState.get(TEXT_GRAMMAR_KEY, {}), next = { ...current };
  if (choice.language) next[captured.uri] = choice.language; else delete next[captured.uri];
  await context.workspaceState.update(TEXT_GRAMMAR_KEY, next);
  require('./map_registry_service').current()?.invalidate(document.uri);
  const reopened = await vscode.workspace.openTextDocument(vscode.Uri.parse(captured.uri));
  if (reopened.version !== captured.version || !choice.language) return null;
  return { kind: 'editor', uri: captured.uri, filename: reopened.fileName, language: choice.language, grammar: choice.language === 'zss' ? 'code' : 'expression', version: captured.version, selection: { start: captured.start, end: captured.end } };
}

function seedForTarget(vscode, explicitSeed, target) {
  if (explicitSeed) return explicitSeed;
  if (target?.kind === 'editor' && target.uri) return vscode.Uri.parse(target.uri);
  return undefined;
}

function scopeIdentity(scope) {
  return [scope?.projectId || '', path.resolve(scope?.identity || scope?.root || '').toLowerCase(), ...(scope?.dependencies || []).map((item) => path.resolve(item).toLowerCase()).sort()].join('\0');
}

function validateDestinationSeed(service, vscode, explicitSeed, target) {
  const targetSeed = seedForTarget(vscode, undefined, target), seed = seedForTarget(vscode, explicitSeed, target);
  if (!explicitSeed || !targetSeed) return { seed, target, matches: true };
  const matches = scopeIdentity(service.scope(explicitSeed)) === scopeIdentity(service.scope(targetSeed));
  return { seed, target: matches ? target : null, matches };
}

function renderNodes(node, depth = 0, parentPath = []) {
  const branches = [...node.children.values()].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  const leaves = node.entries.map((entry) => `<button class="map" data-map="${escape(entry.name)}" data-search="${escape((entry.name + ' ' + entry.family + ' ' + entry.notes.map((n) => n.text).join(' ') + ' ' + entry.files.join(' ')).toLowerCase())}"><span>${escape(entry.leaf)}</span><small>${entry.displayWrites}W · ${entry.displayReads}R · ${entry.occurrences.length} use(s)</small></button>`).join('');
  return branches.map((branch) => { const groupPath = [...parentPath, branch.label]; return `<details data-group="${escape(groupPath.join(' › '))}" ${depth < 1 ? 'open' : ''}><summary>${escape(branch.label)}</summary><div>${renderNodes(branch, depth + 1, groupPath)}</div></details>`; }).join('') + leaves;
}

function browserHtml(registry, target) {
  const entries = registry.entries.map((entry) => ({ ...entry, occurrences: entry.occurrences.map((item) => ({ ...item, notes: undefined })) }));
  const tree = renderNodes(buildTree(entries));
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}body{margin:0;color:var(--vscode-foreground);background:var(--vscode-editor-background);font:12px var(--vscode-font-family);height:100vh;overflow:hidden}header{padding:9px;border-bottom:1px solid var(--vscode-panel-border);display:flex;gap:7px;align-items:center;flex-wrap:wrap}header input{min-width:260px;flex:1}button,input{font:inherit;color:inherit;background:var(--vscode-input-background);border:1px solid var(--vscode-input-border);padding:6px}button{cursor:pointer}.layout{height:calc(100vh - 58px);display:grid;grid-template-columns:minmax(260px,360px) 1fr}.tree{overflow:auto;padding:8px;border-right:1px solid var(--vscode-panel-border)}.detail{overflow:auto;padding:14px}.map{display:flex;width:100%;justify-content:space-between;text-align:left;border:0;background:transparent;padding:6px 8px}.map:hover,.map.selected{background:var(--vscode-list-activeSelectionBackground);color:var(--vscode-list-activeSelectionForeground)}details>div{padding-left:13px}summary{cursor:pointer;padding:5px;font-weight:700}.muted,small{color:var(--vscode-descriptionForeground)}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:var(--vscode-textCodeBlock-background);padding:9px}.uses button{display:block;width:100%;text-align:left;margin:4px 0}.warning{border-left:3px solid var(--vscode-charts-yellow);padding:7px}.actions{display:flex;gap:5px;flex-wrap:wrap}@media(max-width:700px){body{height:auto;overflow:auto}.layout{height:auto;display:block}.tree{max-height:45vh;border-right:0;border-bottom:1px solid var(--vscode-panel-border)}}
</style></head><body><header><b>Project Maps</b><input id="search" placeholder="Search names, descriptions, families, or files" aria-label="Search project maps"><button id="refresh">Refresh</button><span class="muted">${escape(registry.detail)}</span></header><main class="layout"><nav class="tree" aria-label="Map hierarchy"><div class="warning">Name-derived groups are suggestions. Exact map spelling remains authoritative.</div>${tree || '<p>No literal map names were found in the indexed scope.</p>'}</nav><section class="detail" id="detail"><h2>Select a map</h2><p>Inspect its contract, exact uses, and safe insertion forms. Search and browsing do not modify project files.</p></section></main><script>
const vscode=acquireVsCodeApi(),entries=${safe(entries)},target=${safe(target)},prior=vscode.getState()||{};const byName=new Map(entries.map(x=>[x.name,x]));let selected='';const manualOpen=new Set(Array.isArray(prior.open)?prior.open:[]);function remember(){const q=document.getElementById('search').value.trim();if(q)return;document.querySelectorAll('details[data-group]').forEach(d=>d.open?manualOpen.add(d.dataset.group):manualOpen.delete(d.dataset.group));vscode.setState({selected,query:'',open:[...manualOpen]})}function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}function select(name){selected=name;document.querySelectorAll('.map').forEach(b=>b.classList.toggle('selected',b.dataset.map===name));const e=byName.get(name);if(!e)return;const notes=e.notes.length?e.notes.map(n=>'<details open><summary>Source note · '+esc(n.filename)+':'+(n.line+1)+'</summary><pre>'+esc(n.text)+'</pre></details>').join(''):'<p class="muted">No clearly associated source contract comment was observed.</p>';const values=e.observedValues.length?'<p><b>Observed assigned expressions:</b> '+e.observedValues.map(esc).join(', ')+'</p>':'';const uses=e.occurrences.map((u,i)=>'<button data-use="'+i+'"><b>'+esc(u.access)+'</b> · '+esc(u.filename)+':'+(u.line+1)+'<br><small>'+esc(u.source)+'</small></button>').join('');const writeActions=target&&target.language==='zss'?'<button data-insert="set">Insert assignment</button><button data-insert="add">Insert addition</button><button data-insert="subtract">Insert subtraction</button>':'';document.getElementById('detail').innerHTML='<h2>'+esc(e.name)+'</h2><p><b>Suggested family:</b> '+esc(e.family)+' <span class="muted">(inferred from name)</span></p><p><b>Source ownership:</b> '+esc(e.ownership)+' · <b>Runtime receiver:</b> '+esc(e.runtimeReceiver)+' · <b>Applicability:</b> '+esc(e.applicability)+'</p>'+notes+values+'<div class="actions">'+(target?'<button data-insert="read">Insert read</button><button data-insert="compare">Insert comparison</button>'+writeActions:'<span class="muted">Open from a ZSS/CNS editor to enable direct insertion.</span>')+'</div><h3>Existing uses</h3><div class="uses">'+uses+'</div><p class="muted">No writer observed means only that no writer was found in the indexed scope.</p>';document.querySelectorAll('[data-use]').forEach(b=>b.onclick=()=>vscode.postMessage({type:'use',name,use:e.occurrences[Number(b.dataset.use)]}));document.querySelectorAll('[data-insert]').forEach(b=>b.onclick=()=>vscode.postMessage({type:'insert',name,operation:b.dataset.insert}));remember()}document.querySelectorAll('.map').forEach(b=>b.onclick=()=>select(b.dataset.map));document.querySelectorAll('details[data-group]').forEach(d=>{d.open=manualOpen.has(d.dataset.group);d.ontoggle=remember});document.getElementById('search').value=prior.query||'';document.getElementById('search').oninput=e=>{const q=e.target.value.toLowerCase().trim();document.querySelectorAll('.map').forEach(b=>b.hidden=!!q&&!b.dataset.search.includes(q));document.querySelectorAll('details[data-group]').forEach(d=>{d.open=q?!!d.querySelector('.map:not([hidden])'):manualOpen.has(d.dataset.group)});vscode.setState({selected,query:q,open:[...manualOpen]})};if(prior.query)document.getElementById('search').dispatchEvent(new Event('input'));if(prior.selected&&byName.has(prior.selected))select(prior.selected);document.getElementById('refresh').onclick=()=>vscode.postMessage({type:'refresh'});addEventListener('message',e=>{if(e.data.type==='status')document.getElementById('detail').insertAdjacentHTML('afterbegin','<p class="warning">'+esc(e.data.text)+'</p>')});
</script></body></html>`;
}

function progressiveBrowserHtml(registry, target) {
  const entries = registry.entries.map((entry) => ({ ...entry, occurrences: entry.occurrences.map((item) => ({ ...item, notes: undefined })) }));
  const destination = target?.filename || (target ? 'Supported visual coding field' : 'Browse only');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}body{margin:0;color:var(--vscode-foreground);background:var(--vscode-editor-background);font:12px var(--vscode-font-family);height:100vh;overflow:hidden}button,input{font:inherit;color:inherit;background:var(--vscode-input-background);border:1px solid var(--vscode-input-border);padding:6px}button{cursor:pointer}button.active{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}header{padding:9px;border-bottom:1px solid var(--vscode-panel-border);display:flex;gap:7px;align-items:center}header input{min-width:260px;flex:1}.layout{height:calc(100vh - 48px);display:grid;grid-template-columns:minmax(420px,42%) 1fr}.layout.wide{grid-template-columns:minmax(600px,62%) 1fr}.browser{min-width:0;border-right:1px solid var(--vscode-panel-border);display:grid;grid-template-rows:auto auto auto auto 1fr;overflow:hidden}.toolbar,.scopes,.path,.groups,.result-head{padding:7px 9px;border-bottom:1px solid var(--vscode-panel-border);display:flex;gap:6px;align-items:center;flex-wrap:wrap}.scopes button{text-align:left}.scopes small{display:block}.path{background:var(--vscode-sideBar-background)}.groups{max-height:132px;overflow:auto}.groups button{display:flex;gap:8px}.results{overflow:auto;padding:6px}.map{display:flex;width:100%;justify-content:space-between;gap:12px;text-align:left;border:0;background:transparent;padding:7px 9px}.map:hover,.map.selected{background:var(--vscode-list-activeSelectionBackground);color:var(--vscode-list-activeSelectionForeground)}.badges{display:flex;gap:4px;flex-wrap:wrap}.badge{border:1px solid var(--vscode-panel-border);border-radius:10px;padding:1px 6px;font-size:10px}.detail{overflow:auto;padding:14px}.muted,small{color:var(--vscode-descriptionForeground)}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:var(--vscode-textCodeBlock-background);padding:9px}.uses button{display:block;width:100%;text-align:left;margin:4px 0}.warning{border-left:3px solid var(--vscode-charts-yellow);padding:7px}.actions{display:flex;gap:5px;flex-wrap:wrap}.destination{padding:7px;background:var(--vscode-textCodeBlock-background)}:focus-visible{outline:2px solid var(--vscode-focusBorder)!important;outline-offset:2px}@media(max-width:850px){body{height:auto;overflow:auto}.layout,.layout.wide{height:auto;display:block}.browser{height:60vh;border-right:0;border-bottom:1px solid var(--vscode-panel-border)}}
</style></head><body><header><b>Project Maps</b><input id="search" placeholder="Search exact names, reminders, groups, or files" aria-label="Search project maps"><button id="width">Wider results</button><button id="refresh">Refresh</button><span class="muted">${escape(registry.detail)}</span></header><main class="layout" id="layout"><section class="browser" aria-label="Map scopes and results"><div class="scopes" id="scopes"></div><div class="path" id="path"></div><div class="groups" id="groups"></div><div class="result-head" id="result-head"></div><div class="results" id="results"></div></section><section class="detail" id="detail"><h2>Select a map</h2><p>Parent groups immediately display every matching exact map. Narrow only when it helps.</p><p class="destination"><b>Insertion destination:</b> ${escape(destination)}</p></section></main><script>
const vscode=acquireVsCodeApi(),entries=${safe(entries)},scopes=${safe(registry.scopes || [])},target=${safe(target)},partial=${safe(Boolean(registry.partial))},stateKey=${safe(registry.def || registry.root || 'workspace')},stored=vscode.getState()||{},prior=stored.contexts?.[stateKey]||{};const byName=new Map(entries.map(x=>[x.name,x]));let state={scope:scopes.some(x=>x.id===prior.scope)?prior.scope:${safe(registry.defaultScope || 'assigned')},path:Array.isArray(prior.path)?prior.path:[],query:String(prior.query||''),selected:String(prior.selected||''),wide:!!prior.wide};function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}function inScope(e,id){return(e.scopeIds||[]).includes(id)}function pathMatch(e,p){return p.every((x,i)=>e.suggestedPath&&e.suggestedPath[i]===x)}function queryMatch(e,q){const terms=q.toLowerCase().trim().split(/\\s+/).filter(Boolean),hay=[e.name,e.family,e.ownership,...(e.notes||[]).map(n=>n.text),...(e.files||[])].join(' ').toLowerCase();return terms.every(t=>hay.includes(t))}function filtered(path=state.path,query=state.query){return entries.filter(e=>inScope(e,state.scope)&&pathMatch(e,path)&&queryMatch(e,query))}function validPath(path){const p=[...path];while(p.length&&!entries.some(e=>inScope(e,state.scope)&&pathMatch(e,p)))p.pop();return p}function save(){const root=vscode.getState()||{};vscode.setState({...root,contexts:{...(root.contexts||{}),[stateKey]:{...state}}})}function nextGroups(list){const index=state.path.length,m=new Map();for(const e of list){const s=e.suggestedPath&&e.suggestedPath[index];if(!s)continue;if(!m.has(s))m.set(s,new Set());m.get(s).add(e.name.toLowerCase())}return[...m].map(([segment,names])=>({segment,count:names.size,fewer:Math.max(0,list.length-names.size)})).sort((a,b)=>a.segment.localeCompare(b.segment,undefined,{numeric:true,sensitivity:'base'}))}function unchangedChain(){let p=[...state.path],list=filtered(p,state.query),added=[];while(true){const index=p.length,m=new Map();for(const e of list){const s=e.suggestedPath&&e.suggestedPath[index];if(!s)continue;if(!m.has(s))m.set(s,[]);m.get(s).push(e)}if(m.size!==1)break;const [segment,next]=[...m][0];const unique=new Set(next.map(e=>e.name.toLowerCase())).size;if(unique!==list.length)break;added.push(segment);p.push(segment);list=next;if(added.length>8)break}return added}function select(name){state.selected=name;save();renderResults();renderDetail()}function renderScopes(){const host=document.getElementById('scopes');host.innerHTML='<b>Source scope:</b>'+scopes.map(s=>'<button data-scope="'+esc(s.id)+'" class="'+(s.id===state.scope?'active':'')+'" title="'+esc((s.description||'')+' · '+s.fileCount+' indexed of '+s.discoveredFileCount+' eligible code file(s)')+'">'+esc(s.label)+'<small>'+s.mapCount+' maps · '+s.fileCount+' indexed file'+(s.fileCount===1?'':'s')+(s.fileCount<s.discoveredFileCount?' of '+s.discoveredFileCount:'')+'</small></button>').join('');host.querySelectorAll('[data-scope]').forEach(b=>b.onclick=()=>{const old=state.path;state.scope=b.dataset.scope;state.path=validPath(old);const changed=state.path.length!==old.length;save();render();if(changed)document.getElementById('result-head').insertAdjacentHTML('beforeend','<span class="warning">Path fell back to the nearest available group.</span>')})}function renderPath(){const host=document.getElementById('path'),crumbs=['All maps',...state.path];host.innerHTML='<button id="back" '+(!state.path.length?'disabled':'')+'>Back</button><button id="clear" '+(!state.path.length&&!state.query?'disabled':'')+'>Clear filters</button><b>Path:</b>'+crumbs.map((x,i)=>'<button data-crumb="'+i+'" class="'+(i===crumbs.length-1?'active':'')+'">'+esc(x)+'</button>').join('');host.querySelector('#back').onclick=()=>{state.path.pop();save();render()};host.querySelector('#clear').onclick=()=>{state.path=[];state.query='';document.getElementById('search').value='';save();render()};host.querySelectorAll('[data-crumb]').forEach(b=>b.onclick=()=>{state.path=state.path.slice(0,Math.max(0,Number(b.dataset.crumb)));save();render()})}function renderGroups(list){const host=document.getElementById('groups'),groups=nextGroups(list),chain=unchangedChain();host.innerHTML='<b>Narrow further:</b>'+(chain.length>1?'<button id="skip">Skip unchanged chain: '+esc(chain.join(' › '))+'</button>':'')+(groups.length?groups.map(g=>'<button data-group="'+esc(g.segment)+'" title="Leaves '+g.count+' distinct maps from the current '+list.length+'">'+esc(g.segment)+' <small>'+g.count+' map'+(g.count===1?'':'s')+', '+g.fewer+' fewer</small></button>').join(''):'<span class="muted">No narrower group</span>');host.querySelectorAll('[data-group]').forEach(b=>b.onclick=()=>{state.path.push(b.dataset.group);save();render()});const skip=host.querySelector('#skip');if(skip)skip.onclick=()=>{state.path.push(...chain);save();render()}}function renderResults(){const list=filtered(),scope=scopes.find(s=>s.id===state.scope);document.getElementById('result-head').innerHTML='<b>'+list.length+' map'+(list.length===1?'':'s')+' / '+(scope?.fileCount||0)+' indexed code file(s)</b>'+(partial?'<span class="warning">Partial index</span>':'')+'<span class="muted">Exact names; scope totals appear above. Row W/R/use counts cover all indexed sources.</span>';document.getElementById('results').innerHTML=list.length?list.map(e=>'<button class="map '+(e.name===state.selected?'selected':'')+'" data-map="'+esc(e.name)+'"><span><b>'+esc(e.name)+'</b><span class="badges">'+(e.sourceBadges||[]).map(x=>'<span class="badge">'+esc(x)+'</span>').join('')+(!e.assigned?'<span class="badge">Reference only</span>':'')+'</span></span><small>'+e.displayWrites+'W · '+e.displayReads+'R · '+e.occurrences.length+' use(s)</small></button>').join(''):'<p class="muted">No maps match this scope, path, and search.</p>';document.querySelectorAll('[data-map]').forEach(b=>b.onclick=()=>select(b.dataset.map));renderGroups(list)}function renderDetail(){const e=byName.get(state.selected),host=document.getElementById('detail');if(!e){host.innerHTML='<h2>Select a map</h2><p>Parent groups immediately display every matching exact map. Narrow only when it helps.</p><p class="destination"><b>Insertion destination:</b> '+esc(${safe(destination)})+'</p>';return}const notes=e.notes.length?e.notes.map(n=>'<details open><summary>Source note · '+esc(n.filename)+':'+(n.line+1)+'</summary><pre>'+esc(n.text)+'</pre></details>').join(''):'<p class="muted">No clearly associated source contract comment was observed.</p>';const values=e.observedValues.length?'<p><b>Observed assigned expressions:</b> '+e.observedValues.map(esc).join(', ')+'</p>':'';const uses=e.occurrences.map((u,i)=>'<button data-use="'+i+'"><b>'+esc(u.access)+'</b> · '+esc(u.filename)+':'+(u.line+1)+'<br><small>'+((u.scopeIds||[]).includes(state.scope)?'In selected scope · ':'Outside selected scope · ')+((u.scopeIds||[]).includes('assigned')?'Assigned':'Reference')+' · '+esc(u.source)+'</small></button>').join('');const write=target&&target.language==='zss'?'<button data-insert="set">Insert assignment</button><button data-insert="add">Insert addition</button><button data-insert="subtract">Insert subtraction</button>':'';host.innerHTML='<h2>'+esc(e.name)+'</h2><p class="destination"><b>Insertion destination:</b> '+esc(${safe(destination)})+'</p><p><b>Suggested family:</b> '+esc(e.family)+' <span class="muted">(inferred from name)</span></p><p><b>Sources:</b> '+esc((e.sourceBadges||[]).join(', ')||'Unknown')+(e.assigned?' · Assigned to character':' · Reference only; not assigned to character')+'</p><p><b>Ownership:</b> '+esc(e.ownership)+' · <b>Runtime receiver:</b> '+esc(e.runtimeReceiver)+'</p>'+notes+values+'<div class="actions">'+(target?'<button data-insert="read">Insert read</button><button data-insert="compare">Insert comparison</button>'+write:'<span class="muted">Browse only. Open from a supported coding destination to insert.</span>')+'</div><h3>All indexed uses</h3><div class="uses">'+uses+'</div><p class="muted">No writer observed means only that no writer was found in the indexed scope.</p>';host.querySelectorAll('[data-use]').forEach(b=>b.onclick=()=>vscode.postMessage({type:'use',name:e.name,use:e.occurrences[Number(b.dataset.use)]}));host.querySelectorAll('[data-insert]').forEach(b=>b.onclick=()=>vscode.postMessage({type:'insert',name:e.name,operation:b.dataset.insert}))}function render(){state.path=validPath(state.path);document.getElementById('layout').classList.toggle('wide',state.wide);renderScopes();renderPath();renderResults();if(state.selected&&!filtered().some(e=>e.name===state.selected))state.selected='';renderDetail();save()}document.getElementById('search').value=state.query;document.getElementById('search').oninput=e=>{state.query=e.target.value;save();renderResults();if(state.selected&&!filtered().some(x=>x.name===state.selected)){state.selected='';renderDetail()}};document.getElementById('width').onclick=()=>{state.wide=!state.wide;document.getElementById('width').textContent=state.wide?'Balanced split':'Wider results';render()};document.getElementById('refresh').onclick=()=>vscode.postMessage({type:'refresh'});addEventListener('message',e=>{if(e.data.type==='status')document.getElementById('detail').insertAdjacentHTML('afterbegin','<p class="warning">'+esc(e.data.text)+'</p>')});render();
</script></body></html>`;
}

async function chooseOperation(vscode, grammar = 'code') {
  const allowed = grammar === 'name' ? [['name', 'Insert exact map name']] : grammar === 'map-table' ? [['tableEntry', 'Insert name and initial value']] : grammar === 'expression' ? [['read', 'Read map value'], ['compare', 'Compare map value']] : [['read', 'Read map value'], ['compare', 'Compare map value'], ['set', 'Set map value'], ['add', 'Add to map value'], ['subtract', 'Subtract from map value']];
  return vscode.window.showQuickPick(allowed.map(([operation, label]) => ({ label, operation })), { title: 'How should IKEMaker insert this map?' });
}

async function chooseMap(vscode, service, seed) {
  const registry = await service.scan(seed), state = service.context?.workspaceState;
  const availableEntries = filterEntries(registry.entries, registry.defaultScope || 'assigned');
  const root = registry.root.toLowerCase(), recentKey = `ikemen.maps.recent:${root}`, groupKey = `ikemen.maps.group:${root}`;
  const recentNames = state?.get(recentKey, []) || [], recent = recentNames.map((name) => availableEntries.find((entry) => entry.name === name)).filter(Boolean);
  const remembered = String(state?.get(groupKey, '') || '').split(' › ').filter(Boolean), stack = [];
  const mapItems = (entries) => entries.map((entry) => ({ label: entry.name, description: `${entry.suggestedPath.join(' › ')} · ${entry.displayWrites}W / ${entry.displayReads}R`, detail: entry.notes[0]?.text.split('\n')[0] || `${entry.occurrences.length} indexed use(s)`, entry }));
  let picked;
  while (!picked) {
    const prefix = stack, within = availableEntries.filter((entry) => prefix.every((part, index) => entry.suggestedPath[index] === part));
    const children = [...new Set(within.map((entry) => entry.suggestedPath[prefix.length]).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const direct = within.filter((entry) => entry.suggestedPath.length === prefix.length);
    const choices = [
      ...(prefix.length ? [{ label: '$(arrow-left) Back', back: true }] : [{ label: '$(search) Search assigned maps…', scope: availableEntries }, ...(recent.length ? [{ label: '$(history) Recent', scope: recent }] : [])]),
      ...children.map((group) => { const next = [...prefix, group], count = availableEntries.filter((entry) => next.every((part, index) => entry.suggestedPath[index] === part)).length, last = remembered.join('\0') === next.join('\0'); return { label: `${last ? '$(star-full)' : '$(folder)'} ${group}`, description: `${count} map(s)${last ? ' · last group' : ''}`, group }; }),
      ...mapItems(direct)
    ];
    const choice = await vscode.window.showQuickPick(choices, { title: `Insert Project Map${prefix.length ? ` · ${prefix.join(' › ')}` : ''}`, placeHolder: registry.complete ? 'Choose a subgroup, exact map, Recent, or Search all maps' : 'Indexed scope is incomplete; choose from observed maps', matchOnDescription: true, matchOnDetail: true });
    if (!choice) return;
    if (choice.back) { stack.pop(); continue; }
    if (choice.scope) { picked = await vscode.window.showQuickPick(mapItems(choice.scope), { title: `Insert Project Map · ${choice.label.replace(/^\$\([^)]*\)\s*/, '')}`, placeHolder: 'Search exact names and source reminders', matchOnDescription: true, matchOnDetail: true }); continue; }
    if (choice.group) { stack.push(choice.group); await state?.update(groupKey, stack.join(' › ')); continue; }
    picked = choice;
  }
  if (picked?.entry) await state?.update(recentKey, [picked.entry.name, ...recentNames.filter((name) => name !== picked.entry.name)].slice(0, 12));
  return picked?.entry;
}

async function valueFor(vscode, operation) {
  if (!['compare', 'set', 'add', 'subtract', 'tableEntry'].includes(operation)) return '1';
  return vscode.window.showInputBox({ title: `Map ${operation} value`, prompt: 'Enter the expression or value. IKEMaker will not infer one.', value: '1', validateInput: (value) => value.trim() ? undefined : 'Enter a value or cancel.' });
}

async function applyEditor(vscode, target, text) {
  const uri = vscode.Uri.parse(target.uri), document = await vscode.workspace.openTextDocument(uri);
  if (document.version !== target.version) throw new Error('The source changed while the map picker was open. Nothing was inserted.');
  const start = document.positionAt(target.selection.start), end = document.positionAt(target.selection.end), edit = new vscode.WorkspaceEdit();
  edit.replace(uri, new vscode.Range(start, end), text);
  if (!await vscode.workspace.applyEdit(edit)) throw new Error('VS Code did not apply the map insertion.');
  const editor = await vscode.window.showTextDocument(document, { preview: false });
  const at = document.positionAt(target.selection.start + text.length); editor.selection = new vscode.Selection(at, at); editor.revealRange(new vscode.Range(at, at));
}

async function pickInsert(vscode, context, options = {}) {
  const service = initialize(vscode, context), target = options.panel ? options.target : (options.target === undefined ? editorTarget(vscode, context) : options.target);
  if (!target) return vscode.window.showInformationMessage('Open a ZSS/CNS editor or focus a supported visual code field before inserting a map.');
  const validation = validateDestinationSeed(service, vscode, options.seed, target), seed = validation.seed;
  if (!validation.matches) return vscode.window.showWarningMessage('The requested map project does not match the captured insertion destination. Nothing was inserted.');
  const entry = await chooseMap(vscode, service, seed); if (!entry) return;
  const selected = await chooseOperation(vscode, target.grammar || 'code'); if (!selected) return;
  const value = await valueFor(vscode, selected.operation); if (value === undefined) return;
  const language = target.language || 'zss', text = snippet(entry.name, selected.operation, value, language);
  if (options.panel) {
    await options.panel.webview.postMessage({ type: 'ikemenMapInsert', target, text });
    return;
  }
  await applyEditor(vscode, target, text);
}

async function openBrowser(vscode, context, seed, targetOverride = undefined) {
  const service = initialize(vscode, context), capturedTarget = targetOverride === undefined ? editorTarget(vscode, context) : targetOverride;
  const validation = validateDestinationSeed(service, vscode, seed, capturedTarget), target = validation.target, frozenSeed = validation.seed, registry = await service.scan(frozenSeed);
  if (!validation.matches) registry.detail = `${registry.detail} The requested browser project differs from the active editor, so this view is browse-only.`;
  browserState = { seed: frozenSeed, target, cacheKey: registry.cacheKey };
  if (!panel) {
    panel = trackViewerPanel(vscode.window.createWebviewPanel('ikemenMapRegistry', 'Project Maps', preferredViewerColumn(vscode.ViewColumn.Beside), { enableScripts: true, retainContextWhenHidden: true }));
    panel.onDidDispose(() => { panel = undefined; browserState = undefined; });
    panel.webview.onDidReceiveMessage(async (message) => {
      try {
        if (message.type === 'refresh') { service.invalidate(); return openBrowser(vscode, context, browserState?.seed, browserState?.target ?? null); }
        const current = await service.entry(message.name, browserState?.seed); if (!current) throw new Error('That map is no longer present in the indexed scope.');
        if (message.type === 'use') { const requested = message.use; const use = current.occurrences.find((item) => item.filename === requested?.filename && item.line === requested?.line && item.character === requested?.character && item.source === requested?.source); if (!use) throw new Error('That source use changed while the registry was open. Refresh and choose it again.'); const document = await vscode.workspace.openTextDocument(use.filename), lineText = document.lineAt(use.line).text; if (!lineText.includes(use.name) || lineText.trim() !== use.source) throw new Error('That source use no longer matches the indexed text. Refresh and choose it again.'); const editor = await vscode.window.showTextDocument(document, { preview: false }); const at = new vscode.Position(use.line, use.character); editor.selection = new vscode.Selection(at, at); editor.revealRange(new vscode.Range(at, at), vscode.TextEditorRevealType.InCenter); }
        if (message.type === 'insert') { const target = browserState?.target; if (!target) throw new Error('This browser is browse-only because its project does not match a captured ZSS/CNS insertion destination.'); const retained = validateDestinationSeed(service, vscode, browserState.seed, target); if (!retained.matches) throw new Error('The browser project no longer matches its captured insertion destination. Nothing was inserted.'); const scoped = await service.scan(browserState.seed); if (scoped.cacheKey !== browserState.cacheKey) throw new Error('The browser project scope changed. Refresh before inserting.'); const value = await valueFor(vscode, message.operation); if (value === undefined) return; await applyEditor(vscode, target, snippet(current.name, message.operation, value, target.language)); }
      } catch (error) { await panel?.webview.postMessage({ type: 'status', text: error.message }); }
    });
  }
  panel.title = `Project Maps · ${path.basename(registry.root || 'No project')}`;
  panel.webview.html = require('./webview_policy').protect(progressiveBrowserHtml(registry, target), panel.webview.cspSource);
  panel.reveal(undefined, false);
  return panel;
}

async function visibleBrowserSeed(vscode, service, requested, chooseCharacter = undefined) {
  if (requested?.fsPath) return { seed: requested, cancelled: false };
  const active = vscode.window.activeTextEditor?.document?.uri;
  if (active?.fsPath) {
    const scope = service.scope(active);
    if (scope?.def && scope?.resolved) return { seed: active, cancelled: false };
  }
  const choose = chooseCharacter || (() => require('./character_picker').chooseCharacterDef(undefined, { title: 'Choose a character for Project Maps' }));
  const selected = await choose();
  return selected ? { seed: vscode.Uri.file(selected), cancelled: false } : { seed: undefined, cancelled: true };
}

async function openVisibleBrowser(vscode, context, service, requested, options = {}) {
  // Capture the destination before a picker can change editor focus. A context
  // choice may change the browsing seed, never the insertion destination.
  const target = editorTarget(vscode, context);
  const resolution = await visibleBrowserSeed(vscode, service, requested, options.chooseCharacter);
  if (resolution.cancelled) return undefined;
  return (options.openBrowser || openBrowser)(vscode, context, resolution.seed, target);
}

function register(vscode, context) {
  const service = initialize(vscode, context), selector = [{ language: 'zss', scheme: 'file' }, { language: 'ikemen-cns', scheme: 'file' }, { language: 'plaintext', scheme: 'file' }];
  context.subscriptions.push(
    vscode.commands.registerCommand('ikemen.maps.openBrowser', (uri) => openVisibleBrowser(vscode, context, service, uri)),
    vscode.commands.registerCommand('ikemen.maps.insert', async (uri) => { let target = editorTarget(vscode, context); if (!target && path.extname(vscode.window.activeTextEditor?.document?.fileName || '').toLowerCase() === '.txt') target = await configureTextGrammar(vscode, context); return pickInsert(vscode, context, { seed: uri, target }); }),
    vscode.commands.registerCommand('ikemen.maps.configureTextGrammar', () => configureTextGrammar(vscode, context, true)),
    vscode.languages.registerCompletionItemProvider(selector, { provideCompletionItems: async (document, position) => { if (!textGrammar(document, context)) return; const before = document.lineAt(position.line).text.slice(0, position.character); if (!/\bmap\s*\([^)]*$/i.test(before)) return; const registry = await service.scan(document.uri), assigned = filterEntries(registry.entries, registry.defaultScope || 'assigned'); return assigned.map((entry, index) => { const item = new vscode.CompletionItem(entry.name, vscode.CompletionItemKind.Variable); item.detail = `Assigned project map · ${entry.displayWrites} writes / ${entry.displayReads} reads`; item.documentation = new vscode.MarkdownString(entry.notes[0]?.text || 'No clearly associated source contract note was observed.'); item.sortText = String(index).padStart(6, '0'); return item; }); } }, '(', '_', '.'),
    vscode.languages.registerHoverProvider(selector, {
      provideHover: async (document, position) => {
        if (!textGrammar(document, context)) return undefined;
        const word = document.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z0-9_.]*/);
        if (!word) return undefined;
        const entry = await service.entry(document.getText(word), document.uri, 'assigned');
        if (!entry) return undefined;
        const body = [
          '**' + entry.name + '**', '',
          entry.displayWrites + ' writer(s) observed · ' + entry.displayReads + ' reader(s) observed · ' + entry.occurrences.length + ' use(s)', '',
          entry.notes[0]?.text || '_No clearly associated source contract note was observed._', '',
          'Suggested family: ' + entry.family + ' (name-derived)',
          'Source ownership: ' + entry.ownership + ' · Runtime receiver: ' + entry.runtimeReceiver
        ].join('\n');
        return new vscode.Hover(new vscode.MarkdownString(body), word);
      }
    }),
    vscode.workspace.onDidChangeTextDocument((event) => { if (/\.def$/i.test(event.document.fileName) || textGrammar(event.document, context)) service.invalidate(event.document.uri); }),
    vscode.workspace.onDidCreateFiles((event) => event.files.some((uri) => /\.(?:zss|cns|cmd|st|inp|jnp|def)$/i.test(uri.fsPath) || textGrammar({ fileName: uri.fsPath, uri, languageId: '' }, context)) && service.invalidate()),
    vscode.workspace.onDidDeleteFiles((event) => event.files.some((uri) => /\.(?:zss|cns|cmd|st|inp|jnp|def)$/i.test(uri.fsPath) || textGrammar({ fileName: uri.fsPath, uri, languageId: '' }, context)) && service.invalidate())
  );
  if (vscode.workspace.onDidRenameFiles) context.subscriptions.push(vscode.workspace.onDidRenameFiles((event) => event.files.some((item) => /\.(?:zss|cns|cmd|st|inp|jnp|def|txt)$/i.test(item.oldUri.fsPath) || /\.(?:zss|cns|cmd|st|inp|jnp|def|txt)$/i.test(item.newUri.fsPath)) && service.invalidate()));
  if (vscode.workspace.createFileSystemWatcher) {
    const watcher = vscode.workspace.createFileSystemWatcher('**/*.{zss,cns,cmd,st,inp,jnp,def,txt}');
    watcher.onDidChange((uri) => service.invalidate(uri)); watcher.onDidCreate((uri) => service.invalidate(uri)); watcher.onDidDelete((uri) => service.invalidate(uri)); context.subscriptions.push(watcher);
  }
  return service;
}

module.exports = { register, openBrowser, openVisibleBrowser, visibleBrowserSeed, pickInsert, editorTarget, textGrammar, configureTextGrammar, seedForTarget, scopeIdentity, validateDestinationSeed, browserHtml, progressiveBrowserHtml };
