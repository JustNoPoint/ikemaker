'use strict';

const path = require('path');
const { parseCodeStructure, flatten } = require('./code_structure_model');
const { languageGuidanceHtml } = require('./language_guidance');
const { describeOption } = require('./controller_option_guidance');
const controllerCatalog = require('../data/sctrl.json');
const { launchControlsHtml, launchControlsClientScript, handleLaunchMessage } = require('./launch_controls');
const { preferredViewerColumn, trackViewerPanel, revealInViewerGroup } = require('./viewer_group');
const controllerDocs = new Map(controllerCatalog.map((item) => [item.name.toLowerCase(), item]));
const DOCS_URL = 'https://potsmugen.github.io/ikemen-merged-docs/';
const WIKI_URL = 'https://github.com/ikemen-engine/Ikemen-GO/wiki';

let activeSession = null;
function key(uri) { return uri.toString(); }
function language(document) {
  if (document.languageId === 'lua' || /\.lua$/i.test(document.fileName)) return 'lua';
  if (document.languageId === 'ikemen-cns' || /\.cns$/i.test(document.fileName)) return 'cns';
  return 'zss';
}
function title(document) { return `${path.basename(document.fileName)} — Visual Structure`; }

function safeJson(value) { return JSON.stringify(value).replace(/</g, '\\u003c'); }
function rawHtml(model) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
  :root{color-scheme:light dark}*{box-sizing:border-box}body{height:100vh;display:grid;grid-template-rows:auto minmax(0,1fr);overflow:hidden;margin:0;font:13px var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background)}
  header{height:auto;min-height:44px;max-height:45vh;overflow:auto;flex-wrap:wrap;display:flex;align-items:center;gap:8px;padding:7px 12px;border-bottom:1px solid var(--vscode-panel-border);position:sticky;top:0;background:var(--vscode-editor-background);z-index:3}header b{font-size:14px}header>*{min-width:0;max-width:100%}header>.launch-controls{flex:1 0 100%}header input{width:180px}header button{white-space:normal}.shell>*{min-width:0}.grow{flex:1}input,select,button{font:inherit;color:inherit;background:var(--vscode-input-background);border:1px solid var(--vscode-input-border);padding:5px 8px}button{cursor:pointer;background:var(--vscode-button-secondaryBackground)}
  .shell{display:grid;grid-template-columns:minmax(250px,34%) 1fr;min-height:0;overflow:auto}aside{border-right:1px solid var(--vscode-panel-border);padding:10px;overflow:auto}.explain{padding:16px;overflow:auto}.summary{padding:10px;border:1px solid var(--vscode-panel-border);background:var(--vscode-editor-inactiveSelectionBackground);margin-bottom:12px}.risk{display:inline-block;border-radius:10px;padding:2px 7px;font-size:11px;margin-left:6px}.risk.safe{background:#1e6b45;color:#fff}.risk.review{background:#866800;color:#fff}.risk.unsafe{background:#9c2d2d;color:#fff}
  .tree,.tree ul{list-style:none;margin:0;padding-left:13px}.tree{padding-left:0}.card{margin:3px 0}.row{display:flex;align-items:center;gap:6px;border:1px solid transparent;padding:5px 6px;border-radius:3px;cursor:pointer}.row:hover{background:var(--vscode-list-hoverBackground)}.row.active{border-color:var(--vscode-focusBorder);background:var(--vscode-list-activeSelectionBackground);color:var(--vscode-list-activeSelectionForeground)}.toggle{width:18px;text-align:center;color:var(--vscode-descriptionForeground)}.kind{text-transform:uppercase;font-size:10px;min-width:62px;color:var(--vscode-descriptionForeground)}.line{margin-left:auto;color:var(--vscode-descriptionForeground);font-size:11px}.hidden{display:none!important}
  details{border:1px solid var(--vscode-panel-border);margin:10px 0;padding:8px}details summary{cursor:pointer;font-weight:600}.source{white-space:pre-wrap;padding:10px;background:var(--vscode-textCodeBlock-background);border-left:3px solid var(--vscode-focusBorder)}.muted{color:var(--vscode-descriptionForeground)}.option-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(210px,100%),1fr));gap:5px;margin:8px 0}.option{display:block;text-align:left;width:100%;border:1px solid var(--vscode-panel-border);border-radius:4px;padding:7px;color:var(--vscode-descriptionForeground);background:transparent}.option:not(.used):hover{border-color:var(--vscode-focusBorder);background:var(--vscode-list-hoverBackground)}.option b{color:var(--vscode-foreground)}.option.used{border-color:var(--vscode-charts-green);background:color-mix(in srgb,var(--vscode-charts-green) 22%,transparent);color:var(--vscode-foreground);font-weight:700;cursor:default}.option.unknown{border-color:var(--vscode-charts-yellow);color:var(--vscode-charts-yellow)}
  @media(max-width:760px){.shell{grid-template-columns:1fr}.explain{border-top:1px solid var(--vscode-panel-border)}aside{border-right:0}.compactHide{display:none}}
  </style></head><body><header><b>Visual Code Structure</b><span id="lang"></span><span id="experience"></span><span class="grow"></span><input id="search" placeholder="Search structure"><select id="filter"><option value="all">All blocks</option><option value="function">Functions</option><option value="state">States</option><option value="controller">Controllers</option><option value="flow">Conditions & loops</option></select><button id="collapse">Collapse all</button><button id="onlineDocs" title="Open the current IKEMEN merged documentation in your browser.">Online Docs</button><button id="wiki" title="Open the official IKEMEN GO wiki in your browser.">Wiki</button></header><div class="shell"><aside><div class="summary" id="fileSummary"></div><ul class="tree" id="tree"></ul></aside><main class="explain"><h2 id="title">Select a block</h2><div id="risk"></div><p id="modeNote" class="muted"></p>${languageGuidanceHtml(model.language, model.experience)}<p id="description" class="muted">Choose a structure card to see its purpose and source context.</p><details open><summary>Source context</summary><pre class="source" id="source"></pre></details><details><summary>What is this?</summary><div id="docs"></div></details><details id="controllerDocs"><summary>Controller documentation (offline)</summary><div id="controllerDocsBody"></div></details><details id="boundary"><summary>Online / rollback boundary</summary><div id="boundaryText"></div></details><button id="reveal">Reveal in code editor</button></main></div><script>
  const vscode=acquireVsCodeApi();let model=${safeJson(model)},selected=null,collapsed=new Set(vscode.getState()?.collapsed||[]);const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function idFor(n){return n.kind+':'+n.startLine+':'+n.title}function risk(n){return n.risk||model.risk}function save(){vscode.setState({...vscode.getState(),collapsed:[...collapsed],selected:selected&&idFor(selected)})}
  function matches(n){const q=$('search').value.toLowerCase(),f=$('filter').value,flow=['condition','loop'].includes(n.kind),kind=f==='all'||f===n.kind||(f==='flow'&&flow);return kind&&(!q||(n.title+' '+(n.signature||'')+' '+n.kind).toLowerCase().includes(q))}
  function nodeHtml(n){const id=idFor(n),children=n.children||[],visible=matches(n)||children.some(deepMatch),closed=collapsed.has(id);if(!visible)return'';return '<li class="card" data-id="'+esc(id)+'"><div class="row'+(selected&&idFor(selected)===id?' active':'')+'"><span class="toggle">'+(children.length?(closed?'▶':'▼'):'·')+'</span><span class="kind">'+esc(n.kind)+'</span><span>'+esc(n.title)+'</span>'+(risk(n)?'<span class="risk '+esc(risk(n).level)+'">'+esc(risk(n).label)+'</span>':'')+'<span class="line">L'+(n.startLine+1)+'</span></div>'+(children.length?'<ul class="'+(closed?'hidden':'')+'">'+children.map(nodeHtml).join('')+'</ul>':'')+'</li>'}
  function deepMatch(n){return matches(n)||(n.children||[]).some(deepMatch)}function all(){const out=[];(function visit(n){for(const c of n.children||[]){out.push(c);visit(c)}})(model);return out}
  function render(){ $('tree').innerHTML=(model.children||[]).map(nodeHtml).join('')||'<li class="muted">No matching blocks.</li>';for(const el of document.querySelectorAll('.card>.row'))el.onclick=e=>{const li=e.currentTarget.parentElement,n=all().find(x=>idFor(x)===li.dataset.id);if(!n)return;if((n.children||[]).length&&e.target.classList.contains('toggle')){collapsed.has(li.dataset.id)?collapsed.delete(li.dataset.id):collapsed.add(li.dataset.id);save();render();return}select(n,true)} }
  function controllerDocumentation(n){const host=$('controllerDocs'),body=$('controllerDocsBody'),isController=n.kind==='controller';host.classList.toggle('hidden',!isController);if(!isController){body.innerHTML='';return}const params=n.doc?.params||[],used=new Set((n.usedParams||[]).map(x=>x.toLowerCase())),known=new Set(params.map(x=>x.name.toLowerCase()));const fields=params.map((p,i)=>{const active=used.has(p.name.toLowerCase()),flags=[p.required?'required':'optional','IKEMEN 1.0'].join(' · '),tip=p.description+' Expected: '+(p.placeholder||'value');return '<button class="option '+(active?'used':'')+'" data-option="'+i+'" '+(active?'disabled':'')+' title="'+esc(tip)+'"><b>'+esc(p.name)+(active?' ✓':' +')+'</b><br><span>'+esc(p.description)+'</span><br><span class="muted">'+esc(p.placeholder||'value')+' · '+esc(flags)+'</span></button>'}).join('');const unknown=(n.usedParams||[]).filter(name=>!known.has(name.toLowerCase())).map(name=>'<span class="option unknown"><b>'+esc(name)+' ?</b><br>Not found in the bundled catalog.</span>').join('');body.innerHTML='<p>'+esc(n.doc?.summary||'No bundled description is available for this controller.')+'</p>'+(fields||unknown?'<p><b>Options:</b> click any unused option to review its value and insert it into this controller. Green options are already used.</p><div class="option-list">'+fields+unknown+'</div>':'<p class="muted">No documented options are listed for this controller.</p>');for(const button of body.querySelectorAll('button[data-option]'))button.onclick=()=>{const p=params[Number(button.dataset.option)];vscode.postMessage({type:'insertOption',controller:{title:n.title,startLine:n.startLine},parameter:p})}}
  function select(n,reveal){selected=n;const r=risk(n);$('title').textContent=n.title;$('description').textContent=(n.doc&&n.doc.summary)||'';$('docs').innerHTML='<b>'+esc(n.doc?.title||n.kind)+'</b><p>'+esc(n.doc?.summary||'')+'</p><p class="muted">Lines '+(n.startLine+1)+'–'+(n.endLine+1)+(n.doc?.source?' · '+esc(n.doc.source):'')+'</p>';$('source').textContent=n.sourceExcerpt||n.signature||n.title;$('risk').innerHTML=r?'<span class="risk '+esc(r.level)+'">'+esc(r.label)+'</span>':'';$('boundary').classList.toggle('hidden',model.language!=='lua');$('boundaryText').textContent=r?r.summary:'';controllerDocumentation(n);save();render();if(reveal)vscode.postMessage({type:'reveal',line:n.startLine,navigationSelection:globalThis.ikemenNavigationSelection()})}
  function apply(next){model=next;$('lang').textContent=model.language.toUpperCase();$('experience').textContent='· '+(model.experience==='advanced'?'Advanced':'Learning');$('modeNote').textContent=model.experience==='advanced'?'Advanced presentation is active. Explanations remain available in the collapsed reference fields.':'Learning presentation is active. Select a block to connect its source, purpose, options, and safety notes.';const nodes=all(),counts={};for(const n of nodes)counts[n.kind]=(counts[n.kind]||0)+1;$('fileSummary').innerHTML='<b>'+esc(model.file)+'</b><br>'+nodes.length+' recognized blocks<br><span class="muted">'+Object.entries(counts).map(x=>x[0]+' '+x[1]).join(' · ')+'</span>';const remembered=vscode.getState()?.selected,previous=selected&&idFor(selected);selected=nodes.find(x=>idFor(x)===(previous||remembered))||nodes[0]||null;render();if(selected)select(selected,false)}
  $('search').oninput=render;$('filter').onchange=render;$('collapse').onclick=()=>{for(const n of all())if((n.children||[]).length)collapsed.add(idFor(n));save();render()};$('onlineDocs').onclick=()=>vscode.postMessage({type:'external',target:'docs'});$('wiki').onclick=()=>vscode.postMessage({type:'external',target:'wiki'});$('reveal').onclick=()=>selected&&vscode.postMessage({type:'reveal',line:selected.startLine,navigationSelection:globalThis.ikemenNavigationSelection()});window.addEventListener('message',e=>{if(e.data.type==='model')apply(e.data.model);if(e.data.type==='selection'){const n=all().filter(x=>x.startLine<=e.data.line&&x.endLine>=e.data.line).sort((a,b)=>(a.endLine-a.startLine)-(b.endLine-b.startLine))[0];if(n)select(n,false)}});apply(model);
  </script></body></html>`;
}

function html(model) {
  return rawHtml(model).replace('</header>', `${launchControlsHtml('code_structure')}</header>`).replace('</script></body>', `${require('./code_structure_navigation').clientScript()}${launchControlsClientScript()}</script></body>`);
}

function clientModel(document, experience = 'learning') {
  const root = parseCodeStructure(document.getText(), language(document), document.fileName);
  const lines = document.getText().split(/\r?\n/);
  for (const item of flatten(root)) {
    item.sourceExcerpt = lines.slice(item.startLine, Math.min(item.endLine + 1, item.startLine + 10)).join('\n');
    if (item.kind === 'controller') {
      const entry = controllerDocs.get(item.title.toLowerCase());
      const source = lines.slice(item.startLine, item.endLine + 1).join('\n');
      item.usedParams = root.language === 'cns'
        ? [...source.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_.]*)\s*=/gm)].map((match) => match[1]).filter((name) => !/^(?:type|trigger(?:all|\d+)|persistent|ignorehitpause)$/i.test(name))
        : [...source.matchAll(/(?:^|[;{\n])\s*([A-Za-z_][A-Za-z0-9_.]*)\s*:/g)].map((match) => match[1]);
      if (entry) item.doc = { title: entry.name, summary: entry.description, params: (entry.params || []).map((parameter) => ({ name: parameter.name, placeholder: parameter.placeholder, required: Boolean(parameter.required), description: describeOption(parameter.name, entry.name) })), source: 'Bundled IKEMEN 1.0 controller documentation' };
    }
  }
  return { ...root, file: path.basename(document.fileName), uri: document.uri.toString(), total: flatten(root).length, experience: experience === 'advanced' ? 'advanced' : 'learning' };
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
  const document = session.document, parameter = message.parameter || {}, controller = findController(document, message.controller || {});
  if (!controller) return vscode.window.showWarningMessage('That controller moved or changed. Select it again in Visual Code Structure.');
  const source = document.getText(new vscode.Range(controller.startLine, 0, Math.min(document.lineCount - 1, controller.endLine), document.lineAt(Math.min(document.lineCount - 1, controller.endLine)).text.length));
  const name = String(parameter.name || '').trim();
  const alreadyUsed = language(document) === 'cns' ? new RegExp(`^\\s*${name.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\s*=`, 'im').test(source) : new RegExp(`(?:^|[;{\\n])\\s*${name.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\s*:`, 'im').test(source);
  if (alreadyUsed) return vscode.window.showInformationMessage(`${name} is already present in this controller.`);
  const value = await vscode.window.showInputBox({ title: `Add ${name} to ${controller.title}`, prompt: `${parameter.description || describeOption(name, controller.title)} Expected: ${parameter.placeholder || 'value'}`, placeHolder: parameter.placeholder || 'value', validateInput: (input) => input.trim() ? undefined : 'Enter a value, or press Escape to cancel.' });
  if (value === undefined) return;
  const edit = new vscode.WorkspaceEdit();
  if (language(document) === 'cns') edit.insert(document.uri, new vscode.Position(controller.endLine + 1, 0), `${name} = ${value.trim()}\n`);
  else {
    const closing = zssControllerClose(document, controller.startLine), indentMatch = /^(\s*)/.exec(document.lineAt(controller.startLine).text), indent = `${indentMatch ? indentMatch[1] : ''}\t`;
    edit.insert(document.uri, new vscode.Position(closing, 0), `${indent}${name}: ${value.trim()};\n`);
  }
  await vscode.workspace.applyEdit(edit);
}

function bindSession(vscode, session, document) {
  if (!supported(document)) return;
  session.document = document; session.experience = experienceFor(vscode, document); session.panel.title = title(document);
  require('./viewer_navigation').registerSourcePanel(session.panel, document.fileName);
  session.panel.webview.postMessage({ type: 'model', model: clientModel(document, session.experience) });
}

async function openCodeStructureWorkspace(vscode, context, uri) {
  let document;
  if (uri && uri.fsPath) document = await vscode.workspace.openTextDocument(uri);
  else document = vscode.window.activeTextEditor && vscode.window.activeTextEditor.document;
  if (!document || !(/\.(?:zss|cns|lua)$/i.test(document.fileName) || ['zss', 'lua', 'ikemen-cns'].includes(document.languageId))) return vscode.window.showWarningMessage('Open a ZSS, CNS, or Lua file first.');
  if (activeSession) { bindSession(vscode, activeSession, document); revealInViewerGroup(activeSession.panel, false, vscode.ViewColumn.Active); return activeSession.panel; }
  const experience = experienceFor(vscode, document);
  const panel = trackViewerPanel(vscode.window.createWebviewPanel('ikemen.codeStructure', title(document), preferredViewerColumn(vscode.ViewColumn.Active), { enableScripts: true, retainContextWhenHidden: true }));
  const session = { panel, document, experience }; activeSession = session; panel.webview.html = require('./webview_policy').protect(html(clientModel(document, experience)), panel.webview.cspSource);
  panel.webview.onDidReceiveMessage(async (message) => {
    if (await handleLaunchMessage(message, session.document.fileName, 'code', panel)) return;
    if (message.type === 'reveal') await reveal(vscode, session.document, message.line, panel, message);
    else if (message.type === 'insertOption') await insertControllerOption(vscode, session, message);
    else if (message.type === 'external') {
      const target = message.target === 'wiki' ? WIKI_URL : DOCS_URL;
      await vscode.env.openExternal(vscode.Uri.parse(target));
    }
  });
  panel.onDidDispose(() => { if (session.refreshTimer) clearTimeout(session.refreshTimer); if (activeSession === session) activeSession = null; });
  return panel;
}

function registerCodeStructureWorkspace(vscode, context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('ikemen.codeStructure.openWorkspace', (uri) => openCodeStructureWorkspace(vscode, context, uri)),
    vscode.workspace.onDidChangeTextDocument((event) => { const session = activeSession; if (!session || key(event.document.uri) !== key(session.document.uri)) return; clearTimeout(session.refreshTimer); session.refreshTimer = setTimeout(() => { if (activeSession === session) session.panel.webview.postMessage({ type: 'model', model: clientModel(event.document, session.experience) }); }, 180); }),
    vscode.window.onDidChangeActiveTextEditor((editor) => { if (activeSession && editor && supported(editor.document)) bindSession(vscode, activeSession, editor.document); }),
    vscode.window.onDidChangeTextEditorSelection((event) => { const session = activeSession; if (session && key(event.textEditor.document.uri) === key(session.document.uri)) session.panel.webview.postMessage({ type: 'selection', line: event.selections[0].active.line }); })
  );
}

module.exports = { registerCodeStructureWorkspace, openCodeStructureWorkspace, clientModel, html, insertControllerOption, zssControllerClose, supported, DOCS_URL, WIKI_URL };
