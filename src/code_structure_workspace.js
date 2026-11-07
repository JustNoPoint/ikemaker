'use strict';

const path = require('path');
const { parseCodeStructure, flatten } = require('./code_structure_model');
const { attachCodeBlockInsights } = require('./code_block_insights');
const { languageGuidanceHtml } = require('./language_guidance');
const { describeOption } = require('./controller_option_guidance');
const controllerCatalog = require('../data/sctrl.json');
const { launchControlsHtml, launchControlsClientScript, handleLaunchMessage } = require('./launch_controls');
const { preferredViewerColumn, trackViewerPanel, revealInViewerGroup } = require('./viewer_group');
const { sourceState, saveSourceDocument } = require('./source_document_save');
const { planControllerOptionInsertion } = require('./controller_option_mutation');
const { adapt } = require('./universal_toolbar_adapter');
const { SLOTS } = require('./viewer_toolbar_contract');
const { MESSAGE_TYPE, universalToolbarStyle, renderUniversalToolbar, universalToolbarClientScript, createUniversalToolbarDispatcher } = require('./universal_toolbar_webview');
const { ExactSourceRegistry, unavailable } = require('./exact_source_routes');
const { createNavigationState, projectNavigation, reduceNavigation } = require('./authoring_navigation_model');
const { referenceFor, findBlock } = require('./code_structure_navigation');
const { registerAuthoringPanel, getContextModel } = require('./authoring_context_registry');
const { classify, contextDescriptor } = require('./text_editor_toolbar');
const { hash } = require('./mutation_safety');
const controllerDocs = new Map(controllerCatalog.map((item) => [item.name.toLowerCase(), item]));
const DOCS_URL = 'https://potsmugen.github.io/ikemen-merged-docs/';
const WIKI_URL = 'https://github.com/ikemen-engine/Ikemen-GO/wiki';

let activeSession = null;
let resolveCapabilities = () => ({});
const { filterEntry } = require('./catalog_capability_filter');
const { capabilityFingerprint } = require('./capability_fingerprint');
function controllerFor(title, capabilities) {
  const entry = controllerDocs.get(title.toLowerCase());
  return entry && filterEntry(entry, capabilities);
}
function key(uri) { return uri.toString(); }
const fileKey=filename=>path.resolve(filename||'').toLowerCase();
function supportedFile(filename){return /\.(?:zss|cns|lua)$/i.test(filename||'');}
function uniqueExisting(files){const seen=new Set(),result=[];for(const value of files||[]){if(!value||typeof value!=='string'||!path.isAbsolute(value)||!supportedFile(value))continue;const filename=path.resolve(value),id=fileKey(filename);if(seen.has(id)||!require('fs').existsSync(filename))continue;seen.add(id);result.push(filename);}return result;}
function descriptorFor(vscode,document){const classification=classify(document,vscode.workspace.getConfiguration('ikemenZss',document.uri));return{classification,descriptor:contextDescriptor(document,classification,require('./viewer_navigation'))};}
function connectedCodeFiles(vscode,document,descriptor){
  let assigned=[];
  if(descriptor.ownerDef){try{assigned=require('./related_work').resolveAssigned(descriptor.ownerDef).code||[];}catch{}}
  const root=descriptor.root?path.resolve(descriptor.root):'';
  const open=descriptor.ownerDef?[]:(vscode.workspace.textDocuments||[]).filter(item=>supported(item)&&root&&fileKey(item.fileName).startsWith(fileKey(root)+path.sep.toLowerCase())).map(item=>item.fileName);
  return uniqueExisting([document.fileName,...(descriptor.files||[]),...assigned,...open]);
}
function navigationFor(files,current,mode='tabs'){return createNavigationState({mode,items:files.map(filename=>({id:fileKey(filename),label:path.basename(filename),title:path.basename(filename),filename,kind:path.extname(filename).slice(1).toLowerCase()})),currentId:files.some(file=>fileKey(file)===fileKey(current))?fileKey(current):(files[0]?fileKey(files[0]):null)});}
function blockAtLine(nodes,line){if(!Number.isInteger(line)||line<0)return null;return(nodes||[]).filter(item=>Number(item.startLine)<=line&&Number(item.endLine)>=line).sort((left,right)=>(left.endLine-left.startLine)-(right.endLine-right.startLine)||right.startLine-left.startLine)[0]||null;}
function structureSelection(session){return session?.blockReference?{surfaceId:'code.structure',uri:session.document.uri.toString(),filename:session.document.fileName,blockReference:session.blockReference}:null;}
function claimStructureSelection(session){const selection=structureSelection(session);if(!selection||!session.contextModel)return null;return session.contextModel.update({selection,activeSurfaceId:'code.structure'});}
function codeStructureToolbarModel(session={}){
  const document=session.document,character=session.descriptor?.type==='character'&&Boolean(session.descriptor.ownerDef),selected=Boolean(session.blockReference),available=Boolean(document&&!document.isClosed&&supported(document));
  const capabilities=Object.fromEntries(SLOTS.map(slot=>[slot.id,{enabled:false,reason:`${slot.label} is unavailable for the current Code Structure context.`}])),enable=(id,dispatch)=>capabilities[id]={enabled:true,dispatch};
  for(const id of ['new','close','open','recovery','run','project','stage','viewer-browser','actions-search','suite-switch','help','settings'])enable(id,'internal:'+id);
  if(available){for(const id of ['save','backup'])enable(id,'internal:'+id);}
  if(selected&&available)capabilities['text-source']={enabled:true,dispatch:'internal:text-source',capabilityId:'implemented.code-structure-source',resolverId:'code-structure.exact-source',routeKind:'selected-block'};else capabilities['text-source']={enabled:false,reason:'Select one current structure block to open its exact native source.'};
  const count=projectNavigation(session.navigation||navigationFor([], '')).visibleCount;if(count>1){enable('connected-resources','internal:connected-resources');capabilities['connected-resources']={...capabilities['connected-resources'],routeKind:'connected-resources'};}else capabilities['connected-resources']={enabled:false,reason:'No other truthful connected code file is available.'};
  if(character){for(const id of ['versus','training','sprites','animations','commands','states','sounds','palettes'])enable(id,'internal:'+id);}else for(const id of ['versus','training','sprites','animations','commands','states','sounds','palettes'])capabilities[id]={enabled:false,reason:`${SLOTS.find(slot=>slot.id===id)?.label||id} requires one proven character owner.`};
  capabilities['code-structure']={enabled:false,reason:'Already in Code Structure.'};
  return adapt('code.structure',capabilities,{resolverIds:['code-structure.exact-source']});
}
function language(document) {
  if (document.languageId === 'lua' || /\.lua$/i.test(document.fileName)) return 'lua';
  if (document.languageId === 'ikemen-cns' || /\.cns$/i.test(document.fileName)) return 'cns';
  return 'zss';
}
function title(document) { return `${path.basename(document.fileName)} — Visual Structure`; }

function codeStructureControlAvailability(input = {}) {
  const count = Math.max(0, Number(input.nodeCount) || 0), files = Math.max(0, Number(input.fileCount) || 0);
  const collapsible = Math.max(0, Number(input.collapsibleCount) || 0), expanded = Math.max(0, Number(input.expandedCollapsibleCount) || 0);
  const at = files ? Math.max(0, Math.min(files - 1, Number(input.fileIndex) || 0)) : -1;
  const state = (disabled, reason = '') => Object.freeze({ disabled: Boolean(disabled), reason: disabled ? reason : '' });
  return Object.freeze({
    focusSelected: state(!input.selected || input.selectedFocused, !input.selected ? 'Select one structure block before focusing its branch.' : 'The selected structure branch is already focused.'),
    showAll: state(!input.focusActive, 'No structure-only focus filter is active.'),
    collapse: state(!collapsible || !expanded, !collapsible ? (count ? 'No displayed structure block has children to collapse.' : 'No structure blocks are available to collapse.') : 'All displayed structure branches are already collapsed.'),
    reveal: state(!input.selected, 'Select one structure block before revealing its exact source.'),
    filePrevious: state(files < 2 || at <= 0, files < 2 ? 'No previous connected code file is available.' : 'Already at the first connected code file.'),
    fileNext: state(files < 2 || at >= files - 1, files < 2 ? 'No next connected code file is available.' : 'Already at the last connected code file.'),
    fileSlider: state(files < 2, files ? 'Only one connected code file is available.' : 'No connected code file is available.'),
    fileSelect: state(files < 2, files ? 'Only one connected code file is available.' : 'No connected code file is available.')
  });
}
function codeStructureTreeFocusIndex(current, key, count) {
  const total = Math.max(0, Number(count) || 0); if (!total) return -1;
  const at = Math.max(0, Math.min(total - 1, Number(current) || 0));
  if (key === 'Home') return 0; if (key === 'End') return total - 1;
  if (key === 'ArrowDown') return (at + 1) % total; if (key === 'ArrowUp') return (at - 1 + total) % total;
  return at;
}
function codeStructureAccessibilityClientScript() { return `
  function structureSetAvailability(id,state){const control=$(id);if(!control)return;control.disabled=Boolean(state.disabled);if(control.dataset.enabledTitle===undefined)control.dataset.enabledTitle=control.title||'';control.title=state.disabled?state.reason:control.dataset.enabledTitle;state.disabled?control.setAttribute('aria-description',state.reason):control.removeAttribute('aria-description')}
  function structureVisibleTreeRows(){const tree=$('tree');return[...tree.querySelectorAll('.card>.row')].filter(row=>{for(let parent=row.parentElement;parent&&parent!==tree;parent=parent.parentElement)if(parent.classList?.contains('hidden'))return false;return true})}
  function refreshStructureAccessibility(){const nodes=all(),collapsible=nodes.filter(item=>(item.children||[]).length),nav=model.navigation||{visibleItems:[],currentId:null},files=nav.visibleItems||[],fileIndex=Math.max(0,files.findIndex(item=>item.id===nav.currentId)),state=(${codeStructureControlAvailability.toString()})({nodeCount:nodes.length,collapsibleCount:collapsible.length,expandedCollapsibleCount:collapsible.filter(item=>!collapsed.has(idFor(item))).length,selected:Boolean(selected),selectedFocused:Boolean(selected&&focusId===idFor(selected)),focusActive:Boolean(focusId),fileCount:files.length,fileIndex});for(const id of ['focusSelected','showAll','collapse','reveal','filePrevious','fileNext','fileSlider','fileSelect'])structureSetAvailability(id,state[id]);const tree=$('tree'),allRows=[...tree.querySelectorAll('.card>.row')],rows=structureVisibleTreeRows(),selectedRow=selected?rows.find(row=>row.parentElement?.dataset.id===idFor(selected)):null;tree.tabIndex=rows.length?-1:0;allRows.forEach(row=>{const visible=rows.includes(row);row.setAttribute('role','option');row.tabIndex=visible&&(row===selectedRow||(!selectedRow&&row===rows[0]))?0:-1;row.setAttribute('aria-selected',String(Boolean(selected&&row.parentElement?.dataset.id===idFor(selected))));if(!row.dataset.structureKeys){row.dataset.structureKeys='1';row.addEventListener('keydown',event=>{if(!['ArrowUp','ArrowDown','Home','End','Enter',' '].includes(event.key))return;event.preventDefault();if(event.key==='Enter'||event.key===' '){row.click();return}const visibleRows=structureVisibleTreeRows(),current=visibleRows.indexOf(row),target=(${codeStructureTreeFocusIndex.toString()})(current,event.key,visibleRows.length);visibleRows[target]?.focus()})}});document.querySelectorAll('[data-nav-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.classList.contains('active'))));document.querySelectorAll('[data-file-id]').forEach(button=>{const current=button.dataset.fileId===nav.currentId;button.disabled=current;button.setAttribute('aria-current',current?'page':'false');if(current){const reason='Already viewing this connected code file.';button.title=reason;button.setAttribute('aria-description',reason)}});for(const button of $('controllerDocsBody').querySelectorAll('button:disabled')){const reason='This controller option is already present in the selected block.';button.title=reason;button.setAttribute('aria-description',reason)}}
  const structureRender=render;render=function(){const tree=$('tree'),active=document.activeElement,owned=tree.contains(active),key=owned?active.closest('.card')?.dataset.id:'';structureRender();refreshStructureAccessibility();if(owned){const rows=structureVisibleTreeRows(),target=(key?rows.find(row=>row.parentElement?.dataset.id===key):null)||rows[0]||tree;target.focus()}};
  const structureNavigation=renderFileNavigation;renderFileNavigation=function(){structureNavigation();refreshStructureAccessibility()};
  const structureControllerDocs=controllerDocumentation;controllerDocumentation=function(node){structureControllerDocs(node);refreshStructureAccessibility()};
  refreshStructureAccessibility();
`; }

function safeJson(value) { return JSON.stringify(value).replace(/</g, '\\u003c'); }
function rawHtml(model) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
  :root{color-scheme:light dark}*{box-sizing:border-box}body{height:100vh;display:grid;grid-template-rows:auto minmax(0,1fr);overflow:hidden;margin:0;font:13px var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background)}
  header{height:auto;min-height:44px;max-height:45vh;overflow:auto;flex-wrap:wrap;display:flex;align-items:center;gap:8px;padding:7px 12px;border-bottom:1px solid var(--vscode-panel-border);position:sticky;top:0;background:var(--vscode-editor-background);z-index:3}header b{font-size:14px}header>*{min-width:0;max-width:100%}header>.launch-controls{flex:1 0 100%}header input{width:180px}header button{white-space:normal}.shell>*{min-width:0}.grow{flex:1}input,select,button{font:inherit;color:inherit;background:var(--vscode-input-background);border:1px solid var(--vscode-input-border);padding:5px 8px}button{cursor:pointer;background:var(--vscode-button-secondaryBackground)}
  .shell{display:grid;grid-template-columns:minmax(250px,34%) 1fr;min-height:0;overflow:auto}aside{border-right:1px solid var(--vscode-panel-border);padding:10px;overflow:auto}.explain{padding:16px;overflow:auto}.summary{padding:10px;border:1px solid var(--vscode-panel-border);background:var(--vscode-editor-inactiveSelectionBackground);margin-bottom:12px}.risk{display:inline-block;border-radius:10px;padding:2px 7px;font-size:11px;margin-left:6px}.risk.safe{background:#1e6b45;color:#fff}.risk.review{background:#866800;color:#fff}.risk.unsafe{background:#9c2d2d;color:#fff}
  .tree,.tree ul{list-style:none;margin:0;padding-left:13px}.tree{padding-left:0}.card{margin:3px 0}.row{display:flex;align-items:center;gap:6px;border:1px solid transparent;padding:5px 6px;border-radius:3px;cursor:pointer}.row:hover{background:var(--vscode-list-hoverBackground)}.row.active{border-color:var(--vscode-focusBorder);background:var(--vscode-list-activeSelectionBackground);color:var(--vscode-list-activeSelectionForeground)}.toggle{width:18px;text-align:center;color:var(--vscode-descriptionForeground)}.kind{text-transform:uppercase;font-size:10px;min-width:62px;color:var(--vscode-descriptionForeground)}.line{margin-left:auto;color:var(--vscode-descriptionForeground);font-size:11px}.hidden{display:none!important}
  .explain details,.structure-secondary,.code-file-collection{border:1px solid var(--vscode-panel-border);margin:10px 0;padding:8px}details summary{cursor:pointer;font-weight:600}.source{white-space:pre-wrap;padding:10px;background:var(--vscode-textCodeBlock-background);border-left:3px solid var(--vscode-focusBorder)}.muted{color:var(--vscode-descriptionForeground)}.option-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(210px,100%),1fr));gap:5px;margin:8px 0}.option{display:block;text-align:left;width:100%;border:1px solid var(--vscode-panel-border);border-radius:4px;padding:7px;color:var(--vscode-descriptionForeground);background:transparent}.option:not(.used):hover{border-color:var(--vscode-focusBorder);background:var(--vscode-list-hoverBackground)}.option b{color:var(--vscode-foreground)}.option.used{border-color:var(--vscode-charts-green);background:color-mix(in srgb,var(--vscode-charts-green) 22%,transparent);color:var(--vscode-foreground);font-weight:700;cursor:default}.option.unknown{border-color:var(--vscode-charts-yellow);color:var(--vscode-charts-yellow)}
  @media(max-width:760px){.shell{grid-template-columns:1fr}.explain{border-top:1px solid var(--vscode-panel-border)}aside{border-right:0}.compactHide{display:none}}
  </style></head><body><header><b>Visual Code Structure</b><span id="lang"></span><span id="experience"></span><span class="grow"></span><input id="search" placeholder="Search names, explanations, and options"><select id="filter"><option value="all">All blocks</option><option value="issues">Issues &amp; safety</option><option value="function">Functions</option><option value="call">Function calls</option><option value="state">States</option><option value="controller">Controllers</option><option value="flow">Conditions & loops</option></select><button id="focusSelected" disabled title="Hide unrelated blocks in this presentation only">Focus selected block</button><button id="showAll" disabled>Show all</button><span id="focusStatus" class="muted" aria-live="polite"></span><button id="collapse">Collapse all</button><button id="onlineDocs" title="Open the current IKEMEN merged documentation in your browser.">Online Docs</button><button id="wiki" title="Open the official IKEMEN GO wiki in your browser.">Wiki</button><div class="code-file-nav"><button id="filePrevious" title="Previous connected code file">◀</button><input id="fileSlider" type="range" min="1" max="1" value="1" aria-label="Connected code file"><button id="fileNext" title="Next connected code file">▶</button><span id="fileReadout">0 of 0</span><select id="fileSelect" aria-label="Choose connected code file"></select><span class="nav-modes"><button data-nav-mode="tabs">Tabs</button><button data-nav-mode="list">List</button><button data-nav-mode="cards">Cards</button></span><label><input id="followEditor" type="checkbox"> Follow active supported editor</label></div><details class="code-file-collection"><summary>Connected code files</summary><div id="fileCollection"></div></details></header><div class="shell"><aside><div class="summary" id="fileSummary"></div><span id="saveStatus" class="muted"></span><ul class="tree" id="tree"></ul></aside><main class="explain"><h2 id="title">Select a block</h2><div id="risk"></div><p id="modeNote" class="muted"></p>${languageGuidanceHtml(model.language, model.experience)}<p id="description" class="muted">Choose a structure card to see its purpose and source context.</p><details open><summary>Source context</summary><pre class="source" id="source"></pre></details><details open id="why"><summary>Why might this not run?</summary><div id="whyBody"></div></details><details><summary>What is this?</summary><div id="docs"></div></details><details id="controllerDocs"><summary>Controller documentation (offline)</summary><div id="controllerDocsBody"></div></details><details id="boundary"><summary>Online / rollback boundary</summary><div id="boundaryText"></div></details><button id="reveal">Reveal in code editor</button></main></div><script>
  const vscode=acquireVsCodeApi();let model=${safeJson(model)},selected=null,focusId=null,collapsed=new Set(vscode.getState()?.collapsed||[]);const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),saveStatus=$('saveStatus');function renderSourceSave(state,message=''){saveStatus.textContent=message||(!state?.available?'Source unavailable':state.dirty?'Unsaved document changes':'Saved to disk');saveStatus.title=state?.filename||model.file}renderSourceSave(model.sourceState);window.addEventListener('message',event=>{const message=event.data;if(message.sourceUri&&message.sourceUri!==model.uri)return;if(message.type==='sourceSaveStatus')renderSourceSave(message.state,message.message||'');if(message.type==='sourceEditStatus'||message.type==='navigationStatus')saveStatus.textContent=message.text||message.message;if(message.type==='model'&&message.model?.sourceState){model=message.model;renderSourceSave(message.model.sourceState);renderFileNavigation()}});
  function idFor(n){return n.kind+':'+n.startLine+':'+n.title}function risk(n){return n.risk||model.risk}function save(){vscode.setState({...vscode.getState(),collapsed:[...collapsed],selected:selected&&idFor(selected)})}
  function focusedIds(){if(!focusId)return null;const allowed=new Set(),nodes=all(),focus=nodes.find(n=>idFor(n)===focusId);if(!focus){focusId=null;return null}const add=n=>{allowed.add(idFor(n));for(const child of n.children||[])add(child)};add(focus);const contains=n=>idFor(n)===focusId||(n.children||[]).some(contains);for(const root of model.children||[]){const visit=n=>{if(contains(n))allowed.add(idFor(n));for(const child of n.children||[])visit(child)};visit(root)}return allowed}
  function searchable(n){const doc=n.doc||{},params=(doc.params||[]).map(p=>[p.name,p.description,p.placeholder].join(' ')).join(' '),insights=(n.insights||[]).map(i=>[i.message,i.help,i.severity].join(' ')).join(' ');return [n.title,n.signature,n.kind,doc.title,doc.summary,params,insights,risk(n)?.label,risk(n)?.summary].join(' ').toLowerCase()}
  function matches(n){const focus=focusedIds();if(focus&&!focus.has(idFor(n)))return false;const q=$('search').value.toLowerCase(),f=$('filter').value,flow=['condition','loop'].includes(n.kind),hasIssue=Boolean((n.insights||[]).length||risk(n)),kind=f==='all'||f===n.kind||(f==='flow'&&flow)||(f==='issues'&&hasIssue);return kind&&(!q||searchable(n).includes(q))}
  function nodeHtml(n){const id=idFor(n),children=n.children||[],visible=matches(n)||children.some(deepMatch),closed=collapsed.has(id);if(!visible)return'';return '<li class="card" data-id="'+esc(id)+'"><div class="row'+(selected&&idFor(selected)===id?' active':'')+'"><span class="toggle">'+(children.length?(closed?'▶':'▼'):'·')+'</span><span class="kind">'+esc(n.kind)+'</span><span>'+esc(n.title)+'</span>'+(risk(n)?'<span class="risk '+esc(risk(n).level)+'">'+esc(risk(n).label)+'</span>':'')+'<span class="line">L'+(n.startLine+1)+'</span></div>'+(children.length?'<ul class="'+(closed?'hidden':'')+'">'+children.map(nodeHtml).join('')+'</ul>':'')+'</li>'}
  function deepMatch(n){return matches(n)||(n.children||[]).some(deepMatch)}function all(){const out=[];(function visit(n){for(const c of n.children||[]){out.push(c);visit(c)}})(model);return out}
  function render(){const nodes=all(),focus=focusedIds(),hidden=focus?nodes.length-focus.size:0;$('focusSelected').disabled=!selected;$('showAll').disabled=!focusId;$('focusStatus').textContent=focusId?hidden+' unrelated block'+(hidden===1?'':'s')+' hidden · presentation only':'';$('tree').innerHTML=(model.children||[]).map(nodeHtml).join('')||'<li class="muted">No matching blocks.</li>';for(const el of document.querySelectorAll('.card>.row'))el.onclick=e=>{const li=e.currentTarget.parentElement,n=all().find(x=>idFor(x)===li.dataset.id);if(!n)return;if((n.children||[]).length&&e.target.classList.contains('toggle')){collapsed.has(li.dataset.id)?collapsed.delete(li.dataset.id):collapsed.add(li.dataset.id);save();render();return}select(n,false);vscode.postMessage({type:'selectBlock',reference:historyReferenceFor(n)})} }
  function controllerDocumentation(n){const host=$('controllerDocs'),body=$('controllerDocsBody'),isController=n.kind==='controller';host.classList.toggle('hidden',!isController);if(!isController){body.innerHTML='';return}const params=n.doc?.params||[],used=new Set((n.usedParams||[]).map(x=>x.toLowerCase())),known=new Set(params.map(x=>x.name.toLowerCase()));const fields=params.map((p,i)=>{const active=used.has(p.name.toLowerCase()),flags=[p.required?'required':'optional','IKEMEN 1.0'].join(' · '),tip=p.description+' Expected: '+(p.placeholder||'value');return '<button class="option '+(active?'used':'')+'" data-option="'+i+'" '+(active?'disabled':'')+' title="'+esc(tip)+'"><b>'+esc(p.name)+(active?' ✓':' +')+'</b><br><span>'+esc(p.description)+'</span><br><span class="muted">'+esc(p.placeholder||'value')+' · '+esc(flags)+'</span></button>'}).join('');const unknown=(n.usedParams||[]).filter(name=>!known.has(name.toLowerCase())).map(name=>'<span class="option unknown"><b>'+esc(name)+' ?</b><br>Not found in the bundled catalog.</span>').join('');body.innerHTML='<p>'+esc(n.doc?.summary||'No bundled description is available for this controller.')+'</p>'+(fields||unknown?'<p><b>Options:</b> click any unused option to review its value and insert it into this controller. Green options are already used.</p><div class="option-list">'+fields+unknown+'</div>':'<p class="muted">No documented options are listed for this controller.</p>');for(const button of body.querySelectorAll('button[data-option]'))button.onclick=()=>{const p=params[Number(button.dataset.option)];vscode.postMessage({type:'insertOption',reference:historyReferenceFor(n),parameterName:p.name})}}
  function select(n,reveal){selected=n;const r=risk(n);$('title').textContent=n.title;$('description').textContent=(n.doc&&n.doc.summary)||'';$('docs').innerHTML='<b>'+esc(n.doc?.title||n.kind)+'</b><p>'+esc(n.doc?.summary||'')+'</p><p class="muted">Lines '+(n.startLine+1)+'–'+(n.endLine+1)+(n.doc?.source?' · '+esc(n.doc.source):'')+'</p>';$('source').textContent=n.sourceExcerpt||n.signature||n.title;$('risk').innerHTML=r?'<span class="risk '+esc(r.level)+'">'+esc(r.label)+'</span>':'';const insights=n.insights||[];$('whyBody').innerHTML=insights.length?'<p>'+insights.map(i=>'<b>'+esc(i.message)+'</b> <span class="muted">L'+(i.line+1)+' · '+esc(i.severity)+'</span>'+(i.help?'<br><span class="muted">'+esc(i.help)+'</span>':'')).join('</p><p>')+'</p><p class="muted">Static review cannot prove that engine timing, dynamic values, or external calls will reach this block.</p>':'<p><b>No local static blocker found.</b></p><p class="muted">This does not prove the block will run. Engine timing, state ownership, dynamic values, and external calls may still prevent it.</p>';$('boundary').classList.toggle('hidden',model.language!=='lua');$('boundaryText').textContent=r?r.summary:'';controllerDocumentation(n);save();render();if(reveal)vscode.postMessage({type:'reveal',line:n.startLine,navigationSelection:globalThis.ikemenNavigationSelection()})}
  function apply(next){model=next;$('lang').textContent=model.language.toUpperCase();$('experience').textContent='· '+(model.experience==='advanced'?'Advanced':'Learning');$('modeNote').textContent=model.experience==='advanced'?'Advanced presentation is active. Explanations remain available in the collapsed reference fields.':'Learning presentation is active. Select a block to connect its source, purpose, options, and safety notes.';const nodes=all(),counts={};for(const n of nodes)counts[n.kind]=(counts[n.kind]||0)+1;$('fileSummary').innerHTML='<b>'+esc(model.file)+'</b><br>'+nodes.length+' recognized blocks<br><span class="muted">'+Object.entries(counts).map(x=>x[0]+' '+x[1]).join(' · ')+'</span>';selected=historyFindBlock(nodes,model.selectedReference)||null;if(model.focusOnSelected&&selected)focusId=idFor(selected);else if(focusId&&!nodes.some(n=>idFor(n)===focusId))focusId=null;render();if(selected)select(selected,false)}
  function renderFileNavigation(){const nav=model.navigation||{mode:'tabs',visibleItems:[],slider:{min:0,max:0,value:0,title:'0 of 0',previousDisabled:true,nextDisabled:true}};const slider=nav.slider;$('filePrevious').disabled=slider.previousDisabled;$('fileNext').disabled=slider.nextDisabled;$('fileSlider').min=slider.min;$('fileSlider').max=slider.max;$('fileSlider').value=slider.value;$('fileSlider').disabled=!nav.visibleItems.length;$('fileReadout').textContent=slider.title;$('fileSelect').innerHTML=nav.visibleItems.map(item=>'<option value="'+esc(item.id)+'" '+(item.id===nav.currentId?'selected':'')+'>'+esc(item.label)+'</option>').join('');$('fileCollection').className='navigation-'+nav.mode;$('fileCollection').innerHTML=nav.visibleItems.map(item=>'<button data-file-id="'+esc(item.id)+'" '+(item.id===nav.currentId?'class="active"':'')+'>'+esc(item.label)+'</button>').join('');document.querySelectorAll('[data-nav-mode]').forEach(button=>button.classList.toggle('active',button.dataset.navMode===nav.mode));document.querySelectorAll('[data-file-id]').forEach(button=>button.onclick=()=>vscode.postMessage({type:'fileNavigate',action:'select',id:button.dataset.fileId}))}$('filePrevious').onclick=()=>vscode.postMessage({type:'fileNavigate',action:'previous'});$('fileNext').onclick=()=>vscode.postMessage({type:'fileNavigate',action:'next'});$('fileSlider').oninput=()=>{const at=Number($('fileSlider').value)-1,item=(model.navigation?.visibleItems||[])[at];if(item)$('fileReadout').textContent=(at+1)+' of '+model.navigation.visibleItems.length+' · '+item.label};$('fileSlider').onchange=()=>vscode.postMessage({type:'fileNavigate',action:'select-index',index:Number($('fileSlider').value)-1});$('fileSelect').onchange=()=>vscode.postMessage({type:'fileNavigate',action:'select',id:$('fileSelect').value});document.querySelectorAll('[data-nav-mode]').forEach(button=>button.onclick=()=>vscode.postMessage({type:'navigationMode',mode:button.dataset.navMode}));$('followEditor').checked=Boolean(model.followActive);$('followEditor').onchange=()=>vscode.postMessage({type:'followActive',enabled:$('followEditor').checked});$('search').oninput=render;$('filter').onchange=render;$('focusSelected').onclick=()=>{if(!selected)return;focusId=idFor(selected);collapsed.delete(focusId);render()};$('showAll').onclick=()=>{focusId=null;render()};$('collapse').onclick=()=>{for(const n of all())if((n.children||[]).length)collapsed.add(idFor(n));save();render()};$('onlineDocs').onclick=()=>vscode.postMessage({type:'external',target:'docs'});$('wiki').onclick=()=>vscode.postMessage({type:'external',target:'wiki'});$('reveal').onclick=()=>selected&&vscode.postMessage({type:'reveal',reference:historyReferenceFor(selected)});window.addEventListener('message',e=>{if(e.data.type==='model')apply(e.data.model);if(e.data.type==='selection'){const n=all().filter(x=>x.startLine<=e.data.line&&x.endLine>=e.data.line).sort((a,b)=>(a.endLine-a.startLine)-(b.endLine-b.startLine))[0];if(n)select(n,false)}});renderFileNavigation();apply(model);
  </script></body></html>`;
}

function html(model, toolbarModel) {
  const fallbackDocument={fileName:model.file||'source.zss',uri:{toString:()=>model.uri||''},isClosed:false},fallbackNavigation=navigationFor([],fallbackDocument.fileName),sharedHeader=require('./shared_workspace_header').html('code_structure',toolbarModel||codeStructureToolbarModel({document:fallbackDocument,blockReference:flatten(model)[0]?referenceFor(flatten(model)[0]):null,navigation:fallbackNavigation}));
  return rawHtml(model)
    .replace('id="search" placeholder=', 'id="search" aria-label="Search code structure" placeholder=')
    .replace('id="filter">', 'id="filter" aria-label="Filter code structure blocks">')
    .replace('id="filePrevious" title=', 'id="filePrevious" aria-label="Previous connected code file" title=')
    .replace('id="fileNext" title=', 'id="fileNext" aria-label="Next connected code file" title=')
    .replace('id="fileReadout">', 'id="fileReadout" role="status" aria-live="polite">')
    .replace('id="fileCollection">', 'id="fileCollection" role="region" aria-label="Connected code files">')
    .replace('id="saveStatus" class="muted"', 'id="saveStatus" class="muted" role="status" aria-live="polite"')
    .replace('id="focusStatus" class="muted"', 'id="focusStatus" class="muted" role="status"')
    .replace('class="tree" id="tree"', 'class="tree" id="tree" role="listbox" aria-label="Code structure blocks"')
    .replace('<main class="explain">', '<main class="explain" aria-labelledby="title">')
    .replace('class="source" id="source"', 'class="source" id="source" tabindex="0" aria-label="Selected block source context"')
    .replace('id="risk"></div>', 'id="risk" role="status"></div>')
    .replace('</style>', `${universalToolbarStyle()}.code-structure-content{display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden}.code-structure-content>.shared-workspace-header{flex:0 0 auto}.code-structure-content>.shell{flex:1;min-height:0}.code-file-nav{display:flex;align-items:center;flex-wrap:wrap;gap:4px;flex:1 0 100%}.code-file-nav>input[type=range]{flex:1;min-width:100px}.code-file-collection{flex:1 0 100%;margin:0;padding:4px}.code-file-collection #fileCollection{display:flex;flex-wrap:wrap;gap:4px;padding-top:4px}.code-file-collection .navigation-list,.code-file-collection .navigation-cards{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(160px,1fr))}body{display:flex!important;flex-direction:column}.structure-secondary{flex:1 0 100%;margin:0;padding:4px}.structure-secondary-controls{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding-top:6px}.structure-secondary:not([open])>.structure-secondary-controls{display:none}.structure-secondary>summary{font-size:12px}@media(min-width:761px){.structure-secondary:not([open])>.structure-secondary-controls{display:flex}.structure-secondary>summary{display:none}}@media(max-width:760px){header{min-height:0;padding:4px 8px;gap:4px;max-height:28vh}.shell{grid-template-rows:minmax(180px,50%) minmax(0,1fr);overflow:hidden}.shell>aside,.shell>.explain{min-height:0;overflow:auto}.summary{padding:3px;margin-bottom:3px;font-size:11px}.summary br,.summary .muted{display:none}.summary b{margin-right:6px}.explain{padding:8px}header .grow{display:none}}@media(max-width:520px){header input,header select,header button,.code-file-nav>*{width:100%;max-width:none}.code-file-nav{display:grid;grid-template-columns:1fr}.nav-modes{display:grid;grid-template-columns:repeat(3,1fr)}}</style>`)
    .replace('<input id="search"', '<details class="structure-secondary" open><summary>Search, filters &amp; connected files</summary><div class="structure-secondary-controls"><input id="search"')
    .replace('</details></header>', '</details></div></details></header>')
    .replace('<body>', `<body><div class="code-structure-content">${sharedHeader}`)
    .replace('<script>', `</div><script>${require('./code_structure_navigation').clientScript()}`)
    .replace('</script></body>', `${codeStructureAccessibilityClientScript()}if(typeof matchMedia==='function'){const compact=matchMedia('(max-width:760px)'),secondary=document.querySelector('.structure-secondary'),fit=()=>{if(secondary)secondary.open=!compact.matches};fit();compact.addEventListener?.('change',fit)}${launchControlsClientScript()}addEventListener('message',event=>{if(event.data?.type==='ikemaker.code-structure.open-actions')document.querySelector('[data-toolbar-search]')?.click()});</script></body>`);
}

function clientModel(document, experience = 'learning', capabilities = resolveCapabilities(document.uri)) {
  const root = parseCodeStructure(document.getText(), language(document), document.fileName);
  attachCodeBlockInsights(root, document.getText(), root.language);
  const lines = document.getText().split(/\r?\n/);
  for (const item of flatten(root)) {
    item.sourceExcerpt = lines.slice(item.startLine, Math.min(item.endLine + 1, item.startLine + 10)).join('\n');
    if (item.kind === 'controller') {
      const entry = controllerFor(item.title, capabilities);
      const source = lines.slice(item.startLine, item.endLine + 1).join('\n');
      item.usedParams = root.language === 'cns'
        ? [...source.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_.]*)\s*=/gm)].map((match) => match[1]).filter((name) => !/^(?:type|trigger(?:all|\d+)|persistent|ignorehitpause)$/i.test(name))
        : [...source.matchAll(/(?:^|[;{\n])\s*([A-Za-z_][A-Za-z0-9_.]*)\s*:/g)].map((match) => match[1]);
      if (entry) item.doc = { title: entry.name, summary: entry.description, params: (entry.params || []).map((parameter) => ({ name: parameter.name, placeholder: parameter.placeholder, required: Boolean(parameter.required), description: describeOption(parameter.name, entry.name) })), source: capabilities.target?.buildId ? 'Controller reference - ' + capabilities.target.buildId : 'Bundled IKEMEN controller reference' };
    }
  }
  return { ...root, file: path.basename(document.fileName), uri: document.uri.toString(), sourceState: sourceState(document, path.basename(document.fileName)), total: flatten(root).length, experience: experience === 'advanced' ? 'advanced' : 'learning' };
}

async function reveal(vscode, document, line, panel, message) {
  const navigation = require('./viewer_navigation');
  return navigation.openViewerSource(document.fileName, line, navigation.currentPoint(document.fileName, 'code', message, panel));
}

function supported(document) { return Boolean(document && (/\.(?:zss|cns|lua)$/i.test(document.fileName) || ['zss', 'lua', 'ikemen-cns'].includes(document.languageId))); }
function experienceFor(vscode, document) { const domain = language(document) === 'lua' ? 'lua' : language(document); return vscode.workspace.getConfiguration('ikemenZss', document.uri).get(`experience.${domain}`, 'learning'); }
function findController(document, descriptor) { return flatten(parseCodeStructure(document.getText(), language(document), document.fileName)).find((item) => item.kind === 'controller' && item.startLine === Number(descriptor.startLine) && item.title.toLowerCase() === String(descriptor.title).toLowerCase()); }
function zssControllerClose(document, startLine) {
  let depth = 0, opened = false;
  for (let line = startLine; line < document.lineCount; line += 1) {
    const code = document.lineAt(line).text.replace(/#.*/, '');
    for (const char of code) { if (char === '{') { depth += 1; opened = true; } else if (char === '}') { depth -= 1; if (opened && depth <= 0) return line; } }
  }
  return Math.min(document.lineCount - 1, startLine + 1);
}
async function insertControllerOption(vscode, session, message) {
  const document = session.document;
  const capabilities = resolveCapabilities(document.uri);
  const targetFingerprint = capabilityFingerprint(capabilities);
  const controller = findBlock(flatten(clientModel(document, session.experience, capabilities)), message.reference);
  const entry = controller?.kind === 'controller' && controllerFor(controller.title, capabilities);
  const parameter = entry?.params?.find(item => item.name === message.parameterName);
  if (!controller) return vscode.window.showWarningMessage('That controller moved or changed. Select it again in Visual Code Structure.');
  if(!parameter)return vscode.window.showWarningMessage('That controller option is unavailable for the current engine target. Select the controller again.');
  const source = document.getText(new vscode.Range(controller.startLine, 0, Math.min(document.lineCount - 1, controller.endLine), document.lineAt(Math.min(document.lineCount - 1, controller.endLine)).text.length));
  const name = String(parameter.name || '').trim(),description=describeOption(name,controller.title);
  const alreadyUsed = language(document) === 'cns' ? new RegExp(`^\\s*${name.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\s*=`, 'im').test(source) : new RegExp(`(?:^|[;{\\n])\\s*${name.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\s*:`, 'im').test(source);
  if (alreadyUsed) return vscode.window.showInformationMessage(`${name} is already present in this controller.`);
  const sourceUri = document.uri.toString(), sourceVersion = document.version, sourceText = document.getText();
  const unchanged = () => session.document.uri.toString() === sourceUri && document.version === sourceVersion && document.getText() === sourceText;
  const value = await vscode.window.showInputBox({ title: `Add ${name} to ${controller.title}`, prompt: `${description} Expected: ${parameter.placeholder || 'value'}`, placeHolder: parameter.placeholder || 'value', validateInput: (input) => input.trim() ? undefined : 'Enter a value, or press Escape to cancel.' });
  if (value === undefined) return;
  if (!unchanged()) return vscode.window.showInformationMessage('The controller source changed while this option was being drafted. Select the controller again; nothing was inserted.');
  const plan = planControllerOptionInsertion(sourceText, { syntax: language(document), startLine: controller.startLine, endLine: controller.endLine, name, value });
  const answer = await vscode.window.showInformationMessage(`Preview adding ${name} to ${controller.title}`, { modal: true, detail: `${plan.preview}\nOnly this insertion will be applied. Existing comments, duplicate entries, unknown/custom fields, spacing, and line endings remain untouched.` }, 'Apply Option');
  if (answer !== 'Apply Option') return;
  if (capabilityFingerprint(resolveCapabilities(document.uri)) !== targetFingerprint) {
    return vscode.window.showWarningMessage('The engine target changed. Review the controller option again.');
  }
  if (!unchanged()) return vscode.window.showInformationMessage('The controller source changed after the preview. Select the controller again; nothing was inserted.');
  const edit = new vscode.WorkspaceEdit();
  edit.insert(document.uri, document.positionAt(plan.offset), plan.text);
  if (!await vscode.workspace.applyEdit(edit)) throw new Error('VS Code did not insert the controller option. Nothing was saved.');
  session.panel.webview.postMessage({ type: 'sourceEditStatus', text: `${name} applied to the open document—not saved to disk yet.` });
}

async function bindSession(vscode, session, document, options={}) {
  if (!supported(document)||session.busy) return false;
  const replacePage=Boolean(options.initial||session.unavailable);
  const owner=descriptorFor(vscode,document),descriptor=options.contextDescriptor||owner.descriptor,files=Array.isArray(options.allowedFiles)?uniqueExisting([document.fileName,...options.allowedFiles]):connectedCodeFiles(vscode,document,descriptor),previousMode=options.navigationMode||session.navigation?.mode||'tabs';
  if(replacePage)session.generation=(session.generation||0)+1;session.unavailable=false;session.entityIdentity='';session.document=document;session.experience=experienceFor(vscode,document);session.classification=owner.classification;session.descriptor=descriptor;session.navigation=navigationFor(files,document.fileName,previousMode);
  const model=clientModel(document,session.experience),nodes=flatten(model),remembered=session.fileSelections?.get(fileKey(document.fileName)),requested=blockAtLine(nodes,options.selectionLine),selected=requested||findBlock(nodes,remembered)||nodes[0]||null;
  session.blockReference=selected?referenceFor(selected):null;session.fileSelections?.set(fileKey(document.fileName),session.blockReference);session.panel.title=title(document);
  session.contextEntry=registerAuthoringPanel(session.panel,{...descriptor,files});session.contextModel=getContextModel(session.contextEntry);
  require('./viewer_navigation').registerSourcePanel(session.panel,document.fileName);
  const pageModel={...model,navigation:projectNavigation(session.navigation),followActive:Boolean(session.followActive),selectedReference:session.blockReference,focusOnSelected:Boolean(options.focus)};
  if(replacePage)session.panel.webview.html=require('./webview_policy').protect(html(pageModel,codeStructureToolbarModel(session)),session.panel.webview.cspSource);else await session.panel.webview.postMessage({type:'model',model:pageModel});
  if(session.toolbar)session.toolbar=createStructureToolbar(vscode,session);
  if(options.claim&&session.panel.active===true)claimStructureSelection(session);return true;
}

function codeRetainedState(session) {
  if(session?.unavailable)return Object.freeze({unavailable:true,entityIdentity:String(session.entityIdentity||'')});
  const selections=[],withinLimit=value=>Buffer.byteLength(JSON.stringify(value),'utf8')<=128*1024;
  for(const [filename,reference] of session?.fileSelections||[]){
    if(selections.length>=200)break;
    if(typeof filename!=='string'||!reference)continue;
    const next=[...selections,{filename,reference}];if(!withinLimit(next))break;selections.push(next.at(-1));
  }
  return Object.freeze({
    currentFilename:session?.document?.fileName||'',
    navigationMode:['tabs','list','cards'].includes(session?.navigation?.mode)?session.navigation.mode:'tabs',
    followActive:Boolean(session?.followActive),
    blockReference:session?.blockReference||null,
    fileSelections:selections
  });
}

function restoreCodeRetainedState(session,state,allowedFiles=[]) {
  if(!session)return;
  if(!state||state.unavailable){session.fileSelections=new Map();return;}
  const allowed=new Set(allowedFiles.map(fileKey));
  session.followActive=Boolean(state.followActive);
  session.fileSelections=new Map();
  for(const item of Array.isArray(state.fileSelections)?state.fileSelections.slice(0,200):[]){
    if(!item||typeof item.filename!=='string'||!item.reference||!allowed.has(fileKey(item.filename)))continue;
    session.fileSelections.set(fileKey(item.filename),item.reference);
  }
  if(state.blockReference&&typeof state.currentFilename==='string'&&allowed.has(fileKey(state.currentFilename)))session.fileSelections.set(fileKey(state.currentFilename),state.blockReference);
}

function codeTarget(projection,retainedState=null) {
  const candidates=(projection?.code||[]).filter(item=>item?.available&&supportedFile(item.filename));
  if(!candidates.length)return null;
  const preferred=typeof retainedState?.currentFilename==='string'?candidates.find(item=>fileKey(item.filename)===fileKey(retainedState.currentFilename)):null;
  return preferred||candidates[0];
}

function suspendCodeStructureSession(session,descriptor,reason,services={}) {
  session.generation=(session.generation||0)+1;session.unavailable=true;session.entityIdentity=String(descriptor?.identity||descriptor?.id||'');session.blockReference=null;
  const kind=String(descriptor?.kind||descriptor?.type||'workspace'),ownerFile=typeof descriptor?.ownerFile==='string'?descriptor.ownerFile:'',root=ownerFile?path.dirname(ownerFile):'';
  session.contextEntry=(services.registerAuthoringPanel||registerAuthoringPanel)(session.panel,{type:kind,key:ownerFile||session.entityIdentity||kind,label:String(descriptor?.label||kind),root,ownerDef:kind==='character'?ownerFile:'',files:ownerFile?[ownerFile]:[]});
  session.contextModel=(services.getContextModel||getContextModel)(session.contextEntry);
  session.panel.title=`Code Structure · ${String(descriptor?.label||'Unavailable')}`;
  session.panel.webview.html=(services.unavailableHtml||require('./entity_unavailable_view').entityUnavailableHtml)({surface:'code.structure',label:String(descriptor?.label||'Selected entity'),reason});
  return session;
}

function createCodeRetargetAdapter(vscode,panel,services={}) {
  const session=services.session||(activeSession?.panel===panel?activeSession:null);
  if(!session)throw new Error('Code retargeting requires the active Code Structure panel.');
  const resolveTargets=services.resolveTargets||require('./entity_target_resolver').resolveEntityTargets,targetsStillCurrent=services.targetsStillCurrent||require('./entity_target_resolver').targetsStillCurrent,io=services.fs||require('fs');
  const liveDocument=filename=>(vscode.workspace.textDocuments||[]).find(document=>!document.isClosed&&fileKey(document.fileName)===fileKey(filename));
  const snapshot=filename=>{const document=liveDocument(filename),text=document?document.getText():io.readFileSync(filename,'utf8');return{filename:path.resolve(filename),sourceHash:hash(text),version:document?String(document.version):null,open:Boolean(document)};};
  const snapshotCurrent=capture=>{try{const current=snapshot(capture.filename);return current.sourceHash===capture.sourceHash&&(!capture.open||(current.open&&current.version===capture.version));}catch{return false;}};
  const exactDescriptor=(descriptor,projection,files)=>{const kind=String(descriptor?.kind||descriptor?.type||projection?.kind||'workspace'),ownerFile=projection?.ownerFile||descriptor?.ownerFile||'',root=ownerFile?path.dirname(ownerFile):'';return{type:kind,key:ownerFile||String(descriptor?.identity||descriptor?.id||kind),label:String(descriptor?.label||path.basename(ownerFile)||kind),root,ownerDef:kind==='character'?ownerFile:'',files:[ownerFile,...files].filter(Boolean)};};
  return{
    id:'code.structure',surfaceId:'code.structure',transferPinned:false,
    async supports(){return activeSession===session&&!session.panel.disposed;},
    async prepare(transaction){
      if(activeSession!==session||session.panel.disposed)return{ok:false,reason:'The Code Structure workspace closed during switching.'};
      if(session.busy)return{ok:false,reason:'Wait for the current Code Structure operation to finish.'};
      const retainedState=codeRetainedState(session),capture=session.unavailable?{unavailable:true,descriptor:transaction.from,retainedState}:{unavailable:false,document:session.document,descriptor:session.descriptor,allowedFiles:projectNavigation(session.navigation).items.map(item=>item.filename),retainedState};
      let projection;try{projection=resolveTargets(transaction.to,services);}catch(error){return{ok:true,capture,target:null,targetReason:error.message,retainedState};}
      const destinationState=transaction.toState?.adapterRetainedState?.['code.structure'],target=codeTarget(projection,destinationState);
      if(!target)return{ok:true,capture,target:null,targetReason:'This entity has no supported ZSS, CNS, or Lua source assigned by its exact owner.',retainedState};
      let source;try{source=snapshot(target.filename);}catch(error){return{ok:true,capture,target:null,targetReason:error.message,retainedState};}
      const allowedFiles=projection.code.filter(item=>item?.available&&supportedFile(item.filename)).map(item=>item.filename);
      return{ok:true,capture,target:{projection,source,retainedState:destinationState,allowedFiles,descriptor:exactDescriptor(transaction.to,projection,allowedFiles)},retainedState};
    },
    async validate(_transaction,prepared){if(activeSession!==session||session.busy)return{ok:false,reason:'The Code Structure workspace changed while switching.'};if(!prepared.target)return true;return targetsStillCurrent(prepared.target.projection,services)&&snapshotCurrent(prepared.target.source)||{ok:false,reason:'The destination code owner or source changed while switching.'};},
    async commit(transaction,prepared){
      if(!prepared.target){prepared.committed=true;suspendCodeStructureSession(session,transaction.to,prepared.targetReason||'This entity has no applicable code source.',services);return;}
      if(!snapshotCurrent(prepared.target.source))throw new Error('The destination code source changed immediately before switching.');
      const document=await vscode.workspace.openTextDocument(vscode.Uri.file(prepared.target.source.filename));
      if(!snapshotCurrent(prepared.target.source))throw new Error('The destination code source changed while it was opening.');
      prepared.committed=true;
      restoreCodeRetainedState(session,prepared.target.retainedState,prepared.target.allowedFiles);
      const rebound=await bindSession(vscode,session,document,{initial:true,claim:panel.active===true,navigationMode:prepared.target.retainedState?.navigationMode||'tabs',contextDescriptor:prepared.target.descriptor,allowedFiles:prepared.target.allowedFiles});
      if(!rebound||fileKey(session.document.fileName)!==fileKey(prepared.target.source.filename))throw new Error('Code Structure could not adopt the destination source.');
    },
    async rollback(transaction,prepared){
      if(!prepared?.committed||prepared.rolledBack)return;
      if(prepared.capture?.unavailable)suspendCodeStructureSession(session,transaction.from,'This entity has no applicable code source.',services);
      else if(prepared.capture?.document){
        const document=prepared.capture.document.isClosed?await vscode.workspace.openTextDocument(prepared.capture.document.uri):prepared.capture.document;
        restoreCodeRetainedState(session,prepared.capture.retainedState,prepared.capture.allowedFiles||[document.fileName]);
        const rebound=await bindSession(vscode,session,document,{initial:true,claim:panel.active===true,navigationMode:prepared.capture.retainedState?.navigationMode,contextDescriptor:prepared.capture.descriptor,allowedFiles:prepared.capture.allowedFiles});
        if(!rebound||fileKey(session.document.fileName)!==fileKey(document.fileName))throw new Error('Code Structure could not restore its prior exact source.');
      }
      prepared.rolledBack=true;prepared.committed=false;
    }
  };
}

function validStructureMessage(message){
  if(!message||(Object.getPrototypeOf(message)!==Object.prototype&&Object.getPrototypeOf(message)!==null)||typeof message.type!=='string')return false;try{if(JSON.stringify(message).length>50000)return false;}catch{return false;}const keys=Object.keys(message),exact=(allowed,required=[])=>keys.every(key=>allowed.includes(key))&&required.every(key=>Object.prototype.hasOwnProperty.call(message,key));
  const validReference=reference=>{if(!reference||(Object.getPrototypeOf(reference)!==Object.prototype&&Object.getPrototypeOf(reference)!==null))return false;const fields=Object.keys(reference);return fields.length===4&&['blockKind','title','signature','excerpt'].every(field=>fields.includes(field)&&typeof reference[field]==='string')&&reference.blockKind.length>0&&reference.blockKind.length<=40&&reference.title.length>0&&reference.title.length<=1000&&reference.signature.length<=10000&&reference.excerpt.length<=20000;};
  if(message.type==='selectBlock'||message.type==='reveal')return exact(['type','reference'],['reference'])&&validReference(message.reference);
  if(message.type==='fileNavigate'){
    if(message.action==='previous'||message.action==='next')return exact(['type','action'],['action']);
    if(message.action==='select')return exact(['type','action','id'],['action','id'])&&typeof message.id==='string'&&message.id.length>0&&message.id.length<=4096;
    if(message.action==='select-index')return exact(['type','action','index'],['action','index'])&&Number.isInteger(message.index)&&message.index>=0&&message.index<=100000;
    return false;
  }
  if(message.type==='navigationMode')return exact(['type','mode'],['mode'])&&['tabs','list','cards'].includes(message.mode);
  if(message.type==='followActive')return exact(['type','enabled'],['enabled'])&&typeof message.enabled==='boolean';
  if(message.type==='saveCode')return exact(['type']);
  if(message.type==='insertOption')return exact(['type','reference','parameterName'],['reference','parameterName'])&&validReference(message.reference)&&typeof message.parameterName==='string'&&message.parameterName.length>0&&message.parameterName.length<=100;
  if(message.type==='external')return exact(['type','target'],['target'])&&['docs','wiki'].includes(message.target);
  const schemas={
    playerNavigate:[['command'],[]],ikemenMakeBackup:[[],[]],ikemenToggleAutoSave:[[],[]],viewerUsedBy:[['navigationSelection'],[]],viewerHistory:[['direction','navigationSelection'],[]],viewerBackToSource:[['navigationSelection'],[]],ikemenViewer:[['target','navigationSelection'],['comparisonPreview']],ikemenLaunch:[['mode'],[]],ikemenRelatedWork:[[],[]],viewerHistoryRestored:[['requestId','ok'],[]],
    ikemenCloseState:[['id','clean','busy','canKeepDraft','verified'],[]],ikemenPresetState:[['id','reference'],[]],ikemenMaps:[['target','navigationSelection'],[]],ikemenMapInsertResult:[['ok'],['reason']],viewerToolbarCrossSurfaceResult:[['requestId','ok'],['reason']],viewerToolbarCrossSurface:[['source','target','actionId','requestId','busy','safeToLeave','navigationSelection'],[]],
    // F3 retirement debt: restored old webviews may still send this exact,
    // host-allowlisted alias. New clients emit viewerToolbarAction only.
    viewerToolbarCommand:[['command','seed'],[]],
    viewerToolbarReady:[['surface','mode'],[]],viewerToolbarSave:[['surface','mode','preferences'],[]],viewerToolbarActivityReady:[['surface'],[]],viewerToolbarActivitySave:[['surface','activity'],[]],assetWorkspaceOptions:[[],[]],assetWorkspaceReady:[[],[]],assetWorkspaceCaptured:[['id','clean','state','reference','fields','scroll'],[]],viewerLayoutReady:[['surface','mode'],['initial']],viewerLayoutSave:[['surface','mode','layout'],['name']],viewerLayoutReset:[['surface','mode'],[]],ikemenModeReady:[[],[]],viewerSelectionChanged:[[],['navigationSelection']]
  };
  const schema=schemas[message.type];return Boolean(schema&&exact(['type',...schema[0],...schema[1]],schema[0]));
}

function createStructureToolbar(vscode,session,services={}){
  const generation=session.generation,navigation=services.navigation||require('./viewer_navigation'),exactSources=new ExactSourceRegistry(),isCurrent=services.isCurrent||(()=>activeSession===session&&session.generation===generation);
  const resolveCurrent=()=>{if(!isCurrent()||!session.document||session.document.isClosed||!session.blockReference)return null;const model=clientModel(session.document,session.experience),block=findBlock(flatten(model),session.blockReference);if(!block)return null;const text=session.document.getText();return{filename:session.document.fileName,line:block.startLine,reference:referenceFor(block),fingerprint:hash(text),version:String(session.document.version??hash(text)),uri:session.document.uri.toString(),label:`${block.title} · ${path.basename(session.document.fileName)}`};};
  exactSources.register({id:'code-structure.exact-source',capabilityId:'implemented.code-structure-source',surfaceId:'code.structure',resolve:request=>{const route=resolveCurrent(),context=session.contextModel?.snapshot(),selection=structureSelection(session);if(!route||!context||!selection)return unavailable('The selected code block is no longer available.',request);if(request.uri!==route.uri||request.version!==route.version||request.fingerprint!==route.fingerprint||request.line!==route.line||JSON.stringify(request.reference)!==JSON.stringify(route.reference))return unavailable('The selected code block changed before opening.',request);if(request.contextId!==context.identity||request.selectionRevision!==context.selectionRevision||context.activeSurfaceId!=='code.structure'||JSON.stringify(context.selection)!==JSON.stringify(selection))return unavailable('Code Structure is no longer the active shared selection.',request);return{available:true,filename:route.filename,line:route.line,identity:'selected-block',fingerprint:route.fingerprint,version:route.version,label:route.label,access:'external-editor',mutationOwner:'native-text-editor',contextId:context.identity,selectionRevision:context.selectionRevision};}});
  const openExact=async()=>{const route=resolveCurrent(),context=session.contextModel?.snapshot();if(!route||!context)return vscode.window.showInformationMessage('Select one current structure block first.');const request={uri:route.uri,line:route.line,reference:route.reference,version:route.version,fingerprint:route.fingerprint,contextId:context.identity,selectionRevision:context.selectionRevision};let result;try{result=await exactSources.open('code-structure.exact-source',request,async resolved=>{await services.beforeNavigateCheck?.();const document=session.document,text=document.getText(),fingerprint=hash(text),version=String(document.version??fingerprint);if(document.fileName!==resolved.filename||fingerprint!==resolved.fingerprint||version!==resolved.version)throw new Error('The source changed while it was opening. Nothing was navigated.');return navigation.openViewerSource(document.fileName,resolved.line,navigation.currentPoint(document.fileName,'code',{navigationSelection:route.reference},session.panel));});}catch(error){vscode.window.showInformationMessage(error.message);return unavailable(error.message,request);}if(!result.available)vscode.window.showInformationMessage(result.reason);return result;};
  const seed=()=>session.descriptor?.ownerDef||session.document.fileName,command=(id,useSeed=true)=>async()=>vscode.commands.executeCommand(id,...(useSeed?[vscode.Uri.file(seed())]:[])),characterTarget=target=>async()=>navigation.openConnected(session.descriptor.ownerDef,target,session.blockReference,undefined,navigation.currentPoint(session.document.fileName,'code',{navigationSelection:session.blockReference},session.panel));
  const save=async()=>{if(session.busy)return;session.busy=true;try{const result=await saveSourceDocument(session.document,path.basename(session.document.fileName));await session.panel.webview.postMessage({type:'sourceSaveStatus',sourceUri:session.document.uri.toString(),state:sourceState(session.document,path.basename(session.document.fileName)),message:result.message});}finally{session.busy=false;}};
  const handlers={new:command('ikemen.text.createNew',false),open:command('workbench.action.files.openFile',false),close:async()=>{if(await (services.viewerClose||require('./viewer_close')).prepare([session.panel],vscode)&&isCurrent()&&!session.busy)session.panel.dispose();},save,'text-source':openExact,'connected-resources':async()=>{const candidateNavigation=session.navigation,items=projectNavigation(candidateNavigation).visibleItems,picked=await vscode.window.showQuickPick(items.map(item=>({label:item.label,description:item.filename,item})),{title:'Code Structure — Connected Files'});if(picked&&isCurrent())return switchStructureFile(vscode,session,picked.item.id,true,candidateNavigation,generation);},backup:command('ikemen.makeBackup'),recovery:command('ikemen.mutations.openHistory'),run:command('ikemen.launchGame'),versus:command('ikemen.launchMirrorCurrent'),training:command('ikemen.launchTrainingCurrent'),project:command('ikemen.projectManager.open',false),stage:command('ikemen.stage.openWorkspace'),sprites:characterTarget('sff'),animations:characterTarget('air'),commands:command('ikemen.commandMovelist.openEditor'),states:command('zss.openControllers'),sounds:characterTarget('snd'),palettes:command('ikemen.palette.openWorkspace'),'viewer-browser':async()=>vscode.commands.executeCommand('ikemen.authoringBrowser.open',session.document.uri),'actions-search':async()=>isCurrent()&&session.panel.webview.postMessage({type:'ikemaker.code-structure.open-actions'}),'suite-switch':command('ikemen.switchSuite',false),help:command('ikemen.help.open',false),settings:command('ikemen.openExtensionSettings',false)};
  return{dispatcher:createUniversalToolbarDispatcher({handlersBySurface:{'code.structure':handlers},getToolbar:async()=>codeStructureToolbarModel(session)}),openExact,resolveCurrent};
}

async function switchStructureFile(vscode,session,id,claim=false,candidateNavigation=session.navigation,expectedGeneration=session.generation){
  const item=projectNavigation(candidateNavigation).items.find(candidate=>candidate.id===id);if(!item||session.busy)return false;
  try{
    const document=await vscode.workspace.openTextDocument(vscode.Uri.file(item.filename));
    if(activeSession!==session||session.busy||session.generation!==expectedGeneration)return false;
    return await bindSession(vscode,session,document,{claim,navigationMode:candidateNavigation.mode});
  }catch(error){
    await session.panel.webview.postMessage({type:'navigationStatus',message:`Could not open ${path.basename(item.filename)}. The current file and selection were kept.`});
    return false;
  }
}

async function openCodeStructureWorkspace(vscode, context, uri, options={}) {
  let document;
  if (uri && uri.fsPath) document = await vscode.workspace.openTextDocument(uri);
  else document = vscode.window.activeTextEditor && vscode.window.activeTextEditor.document;
  if (!document || !(/\.(?:zss|cns|lua)$/i.test(document.fileName) || ['zss', 'lua', 'ikemen-cns'].includes(document.languageId))) return vscode.window.showWarningMessage('Open a ZSS, CNS, or Lua file first.');
  const selectionLine=Number.isInteger(options?.line)&&options.line>=0?options.line:undefined;
  if (activeSession) { await bindSession(vscode, activeSession, document,{claim:true,selectionLine,focus:Boolean(options?.focus)}); revealInViewerGroup(activeSession.panel, false, vscode.ViewColumn.Active); return activeSession.panel; }
  const experience = experienceFor(vscode, document);
  const panel = trackViewerPanel(vscode.window.createWebviewPanel('ikemen.codeStructure', title(document), preferredViewerColumn(vscode.ViewColumn.Active), { enableScripts: true, retainContextWhenHidden: true }));
  const session = { panel, document, experience,generation:0,busy:false,followActive:Boolean(context.workspaceState?.get?.('ikemaker.codeStructure.followActive',false)),fileSelections:new Map(),navigation:navigationFor([document.fileName],document.fileName),blockReference:null,contextEntry:null,contextModel:null,toolbar:null,queue:Promise.resolve() }; activeSession = session;
  await bindSession(vscode,session,document,{initial:true,claim:panel.active===true,selectionLine,focus:Boolean(options?.focus)});session.toolbar=createStructureToolbar(vscode,session);
  const handleMessage=async(message,generation)=>{
    const current=()=>activeSession===session&&!session.unavailable&&session.generation===generation;
    if(!current())return;
    if(message?.type===MESSAGE_TYPE){try{await session.toolbar.dispatcher.dispatch('code.structure',message);}catch{}return;}
    // The shared toolbar handler is the sole catalog validator/dispatcher.
    // Always return so forged catalog traffic cannot fall through to body routes.
    if(message?.type==='viewerToolbarAction'){await handleLaunchMessage(message,session.document.fileName,'code',panel);return;}
    if(!validStructureMessage(message))return;
    if (await handleLaunchMessage(message, session.document.fileName, 'code', panel)) return;
    if (message.type === 'saveCode') {
      const document = session.document, sourceUri = document.uri.toString();
      if (message.sourceUri && message.sourceUri !== sourceUri) return;
      if (session.busy) return panel.webview.postMessage({ type: 'sourceSaveStatus', sourceUri, state: sourceState(document, path.basename(document.fileName)), message: 'Wait for the current code edit to finish before saving.' });
      session.busy = true;
      try {
        const result = await saveSourceDocument(document, path.basename(document.fileName));
        if (session.document.uri.toString() !== sourceUri) return;
        return panel.webview.postMessage({ type: 'sourceSaveStatus', sourceUri, state: sourceState(document, path.basename(document.fileName)), message: result.message });
      } finally { session.busy = false; }
    }
    if(message.type==='selectBlock'){const block=findBlock(flatten(clientModel(session.document,session.experience)),message.reference);if(!block)return;session.blockReference=referenceFor(block);session.fileSelections.set(fileKey(session.document.fileName),session.blockReference);if(panel.active===true)claimStructureSelection(session);return;}
    if(message.type==='fileNavigate'){let next;try{next=reduceNavigation(session.navigation,message.action==='select'?{type:'select',id:message.id}:message.action==='select-index'?{type:'select-index',index:message.index}:{type:message.action});}catch{return;}const target=projectNavigation(next).currentId;if(!target)return;return switchStructureFile(vscode,session,target,panel.active===true,next,generation);}
    if(message.type==='navigationMode'){session.navigation=reduceNavigation(session.navigation,{type:'set-mode',mode:message.mode});return bindSession(vscode,session,session.document,{claim:false});}
    if(message.type==='followActive'){const document=session.document;session.followActive=message.enabled;await context.workspaceState?.update?.('ikemaker.codeStructure.followActive',message.enabled);if(!current())return false;return bindSession(vscode,session,document,{claim:false});}
    if (message.type === 'reveal') {const block=findBlock(flatten(clientModel(session.document,session.experience)),message.reference);if(!block)return;session.blockReference=referenceFor(block);if(panel.active===true)claimStructureSelection(session);return session.toolbar.openExact();}
    else if (message.type === 'insertOption') {
      if (session.busy) return panel.webview.postMessage({ type: 'sourceEditStatus', text: 'Wait for the current code edit or save to finish.' });
      session.busy = true; try { await insertControllerOption(vscode, session, message); } finally { session.busy = false; }
    }
    else if (message.type === 'external') {
      const target = message.target === 'wiki' ? WIKI_URL : DOCS_URL;
      await vscode.env.openExternal(vscode.Uri.parse(target));
    }
  };
  panel.webview.onDidReceiveMessage((message) => {
    const generation=session.generation,operation=()=>activeSession===session&&generation===session.generation?handleMessage(message,generation):false;
    session.queue=session.queue.then(operation,operation);
    return session.queue;
  });
  const activation=panel.onDidChangeViewState?.(event=>{if(event.webviewPanel.active&&activeSession===session)claimStructureSelection(session);});
  require('./viewer_close').support(panel,{isBusy:()=>activeSession===session&&session.busy});
  panel.onDidDispose(() => { activation?.dispose?.();if (session.refreshTimer) clearTimeout(session.refreshTimer); if (activeSession === session) activeSession = null; });
  require('./entity_switch_runtime').attachEntitySurface(panel,{surfaceId:'code.structure',createAdapter:()=>createCodeRetargetAdapter(vscode,panel)});
  return panel;
}

function registerCodeStructureWorkspace(vscode, context, getCapabilities = () => ({})) {
  resolveCapabilities = getCapabilities;
  context.subscriptions.push(require('./engine_capability_events').onDidChangeEngineCapabilities(() => {
    const session = activeSession;
    if (session && !session.unavailable) {
      session.queue = session.queue.then(() => activeSession === session && !session.unavailable && bindSession(vscode, session, session.document, {claim:false}));
    }
  }));
  context.subscriptions.push(
    vscode.commands.registerCommand('ikemen.codeStructure.openWorkspace', (uri, options) => openCodeStructureWorkspace(vscode, context, uri, options)),
    vscode.commands.registerCommand('ikemen.codeStructure.focusCurrent', () => {
      const editor=vscode.window.activeTextEditor;
      if(!editor||!supported(editor.document))return vscode.window.showWarningMessage('Place the caret in a ZSS, CNS, or Lua editor first.');
      return openCodeStructureWorkspace(vscode,context,editor.document.uri,{line:editor.selection.active.line,focus:true});
    }),
    vscode.workspace.onDidChangeTextDocument((event) => { const session = activeSession, sourceUri = event.document.uri.toString(); if (!session || session.unavailable || key(event.document.uri) !== key(session.document.uri)) return; if(Array.isArray(event.contentChanges)&&event.contentChanges.length===0)return session.panel.webview.postMessage({type:'sourceSaveStatus',sourceUri,state:sourceState(event.document,path.basename(event.document.fileName))}); clearTimeout(session.refreshTimer); session.refreshTimer = setTimeout(() => { if (activeSession === session && !session.unavailable && session.document.uri.toString() === sourceUri) bindSession(vscode,session,event.document,{claim:false}); }, 180); }),
    vscode.window.onDidChangeActiveTextEditor((editor) => { const session=activeSession;if(session?.followActive&&!session.unavailable&&!session.busy&&editor&&supported(editor.document))session.queue=session.queue.then(()=>activeSession===session&&!session.unavailable&&!session.busy?bindSession(vscode,session,editor.document,{claim:false}):false); }),
    vscode.window.onDidChangeTextEditorSelection((event) => { const session = activeSession; if (session && !session.unavailable && key(event.textEditor.document.uri) === key(session.document.uri)) session.panel.webview.postMessage({ type: 'selection', line: event.selections[0].active.line }); })
  );
  if(vscode.workspace.onDidSaveTextDocument)context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((document) => { const session = activeSession, sourceUri = document.uri.toString(); if (session && !session.unavailable && key(document.uri) === key(session.document.uri)) session.panel.webview.postMessage({ type: 'sourceSaveStatus', sourceUri, state: sourceState(document, path.basename(document.fileName)) }); }));
}

module.exports = { registerCodeStructureWorkspace, openCodeStructureWorkspace, clientModel, html, insertControllerOption, zssControllerClose, supported, DOCS_URL, WIKI_URL, descriptorFor, connectedCodeFiles, navigationFor, blockAtLine, structureSelection, claimStructureSelection, codeStructureToolbarModel, validStructureMessage, createStructureToolbar, bindSession, switchStructureFile, codeRetainedState, restoreCodeRetainedState, codeTarget, suspendCodeStructureSession, createCodeRetargetAdapter, codeStructureControlAvailability, codeStructureTreeFocusIndex, codeStructureAccessibilityClientScript };
