'use strict';

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const engineLocator = require('./engine_locator');
const { chooseLaunchStage } = require('./launch_stage');
const { transactionalWrite } = require('./mutation_safety');
const { findGameRoot, currentCharacter } = require('./ikemen_hub');
const { mergeCatalogs, loadProjectCatalogs, sessionPlan, validateCatalog, appliesTo, legacyChecklist } = require('./test_session_model');
const { installSession, resultFiles, removeBootstrap } = require('./test_session_runtime');
const { detectCapabilities, missingCapabilityMessage } = require('./platform_capabilities');
const { launchControlsHtml, launchControlsClientScript, handleLaunchMessage } = require('./launch_controls');
const { preferredViewerColumn, trackViewerPanel, revealInViewerGroup } = require('./viewer_group');

let panel;
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
function activePath() { return vscode.window.activeTextEditor?.document?.uri?.fsPath || vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || process.cwd(); }
function gameRoot(seed) {
  if(seed?.fsPath||typeof seed==='string')return findGameRoot(seed.fsPath||seed)||'';
  const candidates = [activePath(), ...(vscode.workspace.workspaceFolders || []).map(folder => folder.uri.fsPath)];
  for (const candidate of candidates) { const root = findGameRoot(candidate); if (root) return root; }
  return '';
}
function bundledCatalog() { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'test-catalog.json'), 'utf8')); }
function catalogFor(root) {
  const loaded = loadProjectCatalogs(root), valid = loaded.filter(item => item.catalog).map(item => item.catalog);
  const catalog = mergeCatalogs(bundledCatalog(), ...valid), errors = loaded.filter(item => item.error).map(item => `${path.basename(item.filename)}: ${item.error}`);
  for (const issue of validateCatalog(catalog)) errors.push(issue);
  return { catalog, errors };
}
function configuredProfile(resource) { return String(vscode.workspace.getConfiguration('ikemenZss', resource).get('testProfile', 'default') || 'default').toLowerCase(); }
function contextFor(root) {
  const character = currentCharacter(root) || vscode.workspace.getConfiguration('ikemenZss').get('defaultTrainingCharacter', '');
  return { character, 'character-family': character ? path.basename(path.dirname(character)).toLowerCase() : '' };
}
function readResults(root) {
  return resultFiles(root).slice(0, 20).map(filename => {
    try { return { filename, ...JSON.parse(fs.readFileSync(filename, 'utf8')) }; }
    catch (error) { return { filename, error: error.message }; }
  });
}
function state(root) {
  const merged = catalogFor(root), profile = configuredProfile(vscode.Uri.file(root)), context = contextFor(root);
  return { root, ...merged, profile, context, results: readResults(root) };
}
function html(model) {
  const profiles = model.catalog.profiles.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === model.profile ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('');
  const suites = model.catalog.suites.map(suite => {
    const enabled = appliesTo(suite, model.profile, model.context), scope = `${suite.scope.kind}: ${suite.scope.value}`;
    const reason=enabled?'Included explicitly for this context.':`Unavailable because this suite does not apply to the ${model.profile} profile and current character context.`;
    return `<label class="suite ${enabled ? '' : 'excluded'}"><input type="checkbox" data-suite="${escapeHtml(suite.id)}" aria-label="Include ${escapeHtml(suite.name)}" title="${escapeHtml(reason)}" ${enabled ? 'checked' : 'disabled'}><span><b>${escapeHtml(suite.name)}</b><small>${escapeHtml(scope)} · ${suite.tests.length} test(s)</small><em>${escapeHtml(suite.description || reason)}</em></span></label>`;
  }).join('');
  const diagnostics = model.catalog.diagnostics.map((item, index) => `<div class="diagnostic"><b>${index + 1}. ${escapeHtml(item.name)}</b><span>${escapeHtml(item.help)}</span></div>`).join('');
  const results = model.results.length ? model.results.map(item => `<div class="result"><b>${escapeHtml(path.basename(item.filename))}</b><span>${escapeHtml(item.error || `${item.profile || 'unknown'} · ${(item.tests || []).filter(test => test.status === 'pass').length}/${(item.tests || []).length} passed`)}</span><button data-open-result="${escapeHtml(item.filename)}">Open</button></div>`).join('') : '<p class="muted">No IKEMaker result files have been written yet.</p>';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>
body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);margin:0}.bar{position:sticky;top:0;z-index:3;display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px 14px;background:var(--vscode-sideBar-background);border-bottom:1px solid var(--vscode-panel-border)}button,select{color:var(--vscode-button-foreground);background:var(--vscode-button-background);border:1px solid var(--vscode-button-border,transparent);padding:6px 10px}button:hover{background:var(--vscode-button-hoverBackground)}button:focus-visible,select:focus-visible,input:focus-visible{outline:2px solid var(--vscode-focusBorder);outline-offset:2px}main{padding:14px}.tabs{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:14px}.tab{background:transparent;color:var(--vscode-foreground)}.tab.active{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}section[hidden]{display:none}.grid{display:grid;grid-template-columns:minmax(330px,1fr) minmax(280px,.8fr);gap:14px}.card{border:1px solid var(--vscode-panel-border);background:var(--vscode-sideBar-background);padding:12px}.suite{display:flex;gap:10px;padding:10px;border-bottom:1px solid var(--vscode-panel-border)}.suite span{display:flex;flex-direction:column;gap:4px}.suite small,.suite em,.muted{color:var(--vscode-descriptionForeground)}.suite.excluded{opacity:.65}.diagnostic,.result{display:grid;grid-template-columns:1fr auto;gap:4px 12px;padding:9px;border-bottom:1px solid var(--vscode-panel-border)}.diagnostic span,.result span{grid-column:1}.result button{grid-column:2;grid-row:1/3}.notice{padding:8px;background:var(--vscode-textBlockQuote-background);border-left:3px solid var(--vscode-focusBorder)}code{color:var(--vscode-textPreformat-foreground)}@media(max-width:800px){.grid{grid-template-columns:1fr}}
</style></head><body><div class="bar" role="toolbar" aria-labelledby="testSuiteTitle"><b id="testSuiteTitle">IKEMaker Test & Diagnostic Suite</b><label for="profile">Profile</label><select id="profile" aria-label="Test profile">${profiles}</select><button id="launchTest">Launch Test Session</button><button id="launchDiagnostic">Launch Diagnostic Session</button><button id="newRegistry">New Project Tests</button><button id="importChecklist">Import Checklist</button><button id="refresh">Refresh</button><button id="changeGame">Change Game…</button></div><div id="testSessionStatus" class="notice" role="status" aria-live="polite">Test-session controls are ready.</div><main>
<p class="notice"><b>Context:</b> ${escapeHtml(model.root)} → ${escapeHtml(model.profile)} → ${escapeHtml(model.context.character || 'no current character')}<br>Forced Normal/Counter/Punish Counter remains exclusively in the player-facing Hit & Counter Settings menu.</p>
${model.errors.map(error => `<p class="notice">${escapeHtml(error)}</p>`).join('')}
<div class="tabs" role="tablist" aria-label="Test workspace sections"><button id="testTabTests" class="tab active" role="tab" aria-controls="tests" data-tab="tests">Test Session</button><button id="testTabDiagnostics" class="tab" role="tab" aria-controls="diagnostics" data-tab="diagnostics">Diagnostic Session</button><button id="testTabResults" class="tab" role="tab" aria-controls="results" data-tab="results">Results & Evidence</button><button id="testTabHelp" class="tab" role="tab" aria-controls="help" data-tab="help">How It Works</button></div>
<section id="tests" role="tabpanel" aria-labelledby="testTabTests"><div class="grid"><div class="card"><h2>Applicable suites</h2>${suites}</div><div class="card"><h2>In-game controls</h2><p><code>F8</code> show/hide overlay<br><code>F9</code> next test<br><code>F10</code> mark pass<br><code>F11</code> mark fail<br><code>F12</code> save results</p><p>Logger evidence is detected when the character exposes the known result mask, but human signoff remains authoritative.</p></div></div></section>
<section id="diagnostics" role="tabpanel" aria-labelledby="testTabDiagnostics" hidden><div class="grid"><div class="card"><h2>Native IKEMEN actions</h2>${diagnostics}</div><div class="card"><h2>In-game controls</h2><p><code>F8</code> show/hide overlay<br><code>F9</code> next diagnostic<br><code>F10</code> execute selected action</p><p>Pause and Scroll Lock retain IKEMEN's native pause and frame-step behavior. This session is offline development tooling and is never an online gameplay dependency.</p></div></div></section>
<section id="results" role="tabpanel" aria-labelledby="testTabResults" hidden><div class="card"><h2>Recent evidence</h2>${results}</div></section>
<section id="help" role="tabpanel" aria-labelledby="testTabHelp" hidden><div class="card"><h2>Ownership and safety</h2><p>Universal tests are portable. Game-profile tests are included only by explicit scope. Production order never causes inheritance. Project tests live under <code>.ikemen/tests</code>. Session plans live under <code>.ikemen/test-sessions</code>; Finish Project excludes both and the one-use runtime bootstrap.</p><p>The JNP screenpack Developer Options remain available. This workspace provides the equivalent native diagnostic authority for creators using any motif.</p></div></section>
</main><script>const vscode=acquireVsCodeApi(),testRoot=${JSON.stringify(model.root).replace(/</g,'\\u003c')},saved=vscode.getState()||{},tabs=[...document.querySelectorAll('[role="tab"]')],status=document.getElementById('testSessionStatus');let busy=false;function selectTab(id,focus=false){const selected=tabs.find(tab=>tab.dataset.tab===id)||tabs[0];for(const tab of tabs){const active=tab===selected;tab.classList.toggle('active',active);tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;document.getElementById(tab.dataset.tab).hidden=!active}vscode.setState({...vscode.getState(),tab:selected.dataset.tab});if(focus)selected.focus()}for(const button of tabs){button.onclick=()=>selectTab(button.dataset.tab);button.onkeydown=event=>{let index=tabs.indexOf(button);if(event.key==='Home')index=0;else if(event.key==='End')index=tabs.length-1;else if(event.key==='ArrowRight')index=(index+1)%tabs.length;else if(event.key==='ArrowLeft')index=(index-1+tabs.length)%tabs.length;else return;event.preventDefault();selectTab(tabs[index].dataset.tab,true)}}function setBusy(value,message=''){busy=Boolean(value);for(const control of document.querySelectorAll('.bar button,.bar select,[data-open-result]')){if(busy){if(!control.disabled)control.dataset.testBusyDisabled='true';control.disabled=true;control.title='Wait for the current test-session action to finish.'}else if(control.dataset.testBusyDisabled==='true'){delete control.dataset.testBusyDisabled;control.disabled=false;if(control.title==='Wait for the current test-session action to finish.')control.removeAttribute('title')}}status.textContent=message||(busy?'Test-session action in progress…':'Test-session controls are ready.');syncLaunchReasons()}function rememberFocus(control){vscode.setState({...vscode.getState(),focusId:control?.id||''})}function send(message,control){if(busy){status.textContent='Wait for the current test-session action to finish.';return false}rememberFocus(control);setBusy(true,'Starting test-session action…');vscode.postMessage({...message,root:testRoot});return true}function syncLaunchReasons(){const launchTest=document.getElementById('launchTest'),count=document.querySelectorAll('[data-suite]:checked').length;if(!busy){launchTest.disabled=count===0;launchTest.title=count?'Launch the selected applicable test suites.':'Select at least one applicable suite before launching a test session.';const diagnostic=document.getElementById('launchDiagnostic');diagnostic.disabled=${model.catalog.diagnostics.length===0?'true':'false'};diagnostic.title=diagnostic.disabled?'No diagnostics are available in the current test catalog.':'Launch the current diagnostic catalog.'}}document.querySelectorAll('[data-suite]').forEach(input=>input.onchange=()=>{vscode.setState({...vscode.getState(),suiteIds:[...document.querySelectorAll('[data-suite]:checked')].map(node=>node.dataset.suite)});syncLaunchReasons()});const restoredSuites=Array.isArray(saved.suiteIds)?new Set(saved.suiteIds):null;if(restoredSuites)for(const input of document.querySelectorAll('[data-suite]:not(:disabled)'))input.checked=restoredSuites.has(input.dataset.suite);document.getElementById('profile').onchange=e=>send({type:'profile',profile:e.target.value},e.target);document.getElementById('launchTest').onclick=e=>send({type:'launch',kind:'test',suiteIds:[...document.querySelectorAll('[data-suite]:checked')].map(node=>node.dataset.suite)},e.currentTarget);document.getElementById('launchDiagnostic').onclick=e=>send({type:'launch',kind:'diagnostic'},e.currentTarget);for(const [id,type]of [['newRegistry','newRegistry'],['importChecklist','importChecklist'],['refresh','refresh'],['changeGame','changeGame']])document.getElementById(id).onclick=e=>send({type},e.currentTarget);document.querySelectorAll('[data-open-result]').forEach(button=>button.onclick=()=>send({type:'openResult',filename:button.dataset.openResult},button));addEventListener('message',event=>{const message=event.data;if(message?.type==='testSessionBusy'&&message.root===testRoot)setBusy(message.busy,message.status)});selectTab(saved.tab);syncLaunchReasons();queueMicrotask(()=>{const target=saved.focusId&&document.getElementById(saved.focusId);target?.focus()});${require('./test_session_selection').clientScript()}</script></body></html>`;
}
function capabilities() { return detectCapabilities({ uiKind: vscode.env.uiKind === vscode.UIKind.Web ? 'web' : 'desktop', platform: process.platform, environment: process.env }); }
const testSuiteHtml = html;
html = (model) => testSuiteHtml(model)
  .replace('saved=vscode.getState()||{},tabs=',"stored=vscode.getState()||{},saved=stored.root===testRoot?stored:{},tabs=")
  .replaceAll('vscode.setState({...vscode.getState(),', 'vscode.setState({...vscode.getState(),root:testRoot,')
  .replace('</div><div id="testSessionStatus"', `${launchControlsHtml('test_session')}</div><div id="testSessionStatus"`)
  .replace('</script></body>', `${launchControlsClientScript()}</script></body>`);

async function launch(root, catalog, kind, suiteIds) {
  if (!capabilities().ikemenLaunch) return vscode.window.showInformationMessage(missingCapabilityMessage('IKEMaker Test Session launch', capabilities()));
  const config = vscode.workspace.getConfiguration('ikemenZss', vscode.Uri.file(root));
  const character = currentCharacter(root) || config.get('defaultTrainingCharacter', '');
  if (!character) return vscode.window.showErrorMessage('Open a character file or set the default training character before launching an IKEMaker session.');
  const stage = await chooseLaunchStage(root, config.get('defaultTrainingStage', 'stages/stage0.def'), (items, options) => vscode.window.showQuickPick(items, options));
  if (!stage) return;
  const session = sessionPlan(catalog, { kind, profile: configuredProfile(vscode.Uri.file(root)), suiteIds, character, stage, context: contextFor(root) });
  if (kind === 'test' && !session.tests.length) return vscode.window.showWarningMessage('No applicable tests are selected.');
  const executable = require('./engine_runtime').resolve(root, config.get('ikemenPath', ''), path.join(root, 'data', 'system.def'));
  if (!fs.existsSync(executable)) return vscode.window.showErrorMessage(`IKEMEN executable was not found: ${executable}`);
  try {
    installSession(root, session);
    const args = require('./training_launch_args').buildTrainingArgs('-time', '-1', '-tmode1', '0', '-tmode2', '0', '-s', stage, '-p1', character, '-p2', character);
    const child = spawn(executable, args, { cwd: root, detached: true, stdio: 'ignore', windowsHide: false }); child.unref();
    setTimeout(() => { try { removeBootstrap(root); } catch (_) {} }, 60000);
    vscode.window.showInformationMessage(`IKEMaker ${kind} session launched. Press F8 in game to show or hide its overlay.`);
  } catch (error) { removeBootstrap(root); vscode.window.showErrorMessage(`Could not launch IKEMaker session: ${error.message}`); }
}
async function createRegistry(root) {
  const filename = path.join(root, '.ikemen', 'tests', 'project-tests.json');
  if (!fs.existsSync(filename)) {
    const template = { schemaVersion: 1, profiles: [], suites: [{ id: 'my-project-tests', name: 'My Project Tests', scope: { kind: 'game-profile', value: configuredProfile(vscode.Uri.file(root)) }, description: 'Project-owned tests. Change the scope explicitly when promoting a test.', tests: [{ id: 'example', name: 'Example test', instruction: 'Describe the setup, action, and expected result.', criteria: ['Expected result'] }] }], diagnostics: [] };
    transactionalWrite(fs, filename, `${JSON.stringify(template, null, 2)}\n`, { label: 'create-test-registry', journalRoot: root });
  }
  await vscode.window.showTextDocument(vscode.Uri.file(filename), { preview: false });
}
async function importChecklist(root) {
  const picked = await vscode.window.showOpenDialog({ title: 'Import an IKEMaker @logger-test checklist', canSelectMany: false, filters: { 'Checklist text': ['txt', 'md'] } });
  const source = picked?.[0]?.fsPath; if (!source) return;
  const stem = path.basename(source, path.extname(source)).replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'imported-checklist';
  const profile = configuredProfile(vscode.Uri.file(root));
  const suite = legacyChecklist(fs.readFileSync(source, 'utf8'), { id: stem, name: path.basename(source, path.extname(source)), source: path.basename(source), profile });
  if (!suite.tests.length) return vscode.window.showWarningMessage('The selected file contains no @logger-test records.');
  const filename = path.join(root, '.ikemen', 'tests', `${stem}.json`), output = { schemaVersion: 1, profiles: [], suites: [suite], diagnostics: [] };
  transactionalWrite(fs, filename, `${JSON.stringify(output, null, 2)}\n`, { label: 'import-test-checklist', journalRoot: root, allowExisting: true });
  vscode.window.showInformationMessage(`Imported ${suite.tests.length} test(s) for the ${profile} profile.`);
  if (panel?.ikemenGameRoot===root) panel.webview.html = require('./webview_policy').protect(html(state(root)), panel.webview.cspSource);
}
async function openWorkspace(seed) {
  const root = gameRoot(seed); if (!root) return vscode.window.showErrorMessage('Open a folder, character, or game file inside an IKEMEN installation first.');
  if(panel?.ikemenGameRoot===root){revealInViewerGroup(panel,false,vscode.ViewColumn.Active);return panel;}
  if (!panel) {
    panel = trackViewerPanel(vscode.window.createWebviewPanel('ikemenTestSessions', 'IKEMaker Test & Diagnostic Suite', preferredViewerColumn(vscode.ViewColumn.Active), { enableScripts: true, retainContextWhenHidden: true }));
    panel.onDidDispose(() => { panel.ikemenTestDisposed=true;panel = undefined; });
    panel.webview.onDidReceiveMessage(async message => {
      const currentRoot = panel.ikemenGameRoot;
      const ownedTypes=new Set(['profile','launch','newRegistry','importChecklist','openResult','refresh','changeGame']),owned=ownedTypes.has(message?.type);
      if(!owned){await handleLaunchMessage(message,currentRoot,'tests',panel);return;}
      if(typeof message.root!=='string'||path.resolve(message.root)!==path.resolve(currentRoot)){await panel.webview.postMessage?.({type:'testSessionBusy',root:currentRoot,busy:false,status:'This Tests action no longer matches the open game. Refresh and try again.'});return;}
      if(panel.ikemenTestBusy){await panel.webview.postMessage?.({type:'testSessionBusy',root:currentRoot,busy:true,status:'Wait for the current test-session action to finish.'});return;}
      panel.ikemenTestBusy=true;await panel.webview.postMessage?.({type:'testSessionBusy',root:currentRoot,busy:true,status:'Test-session action in progress…'});
      try{
        if(message.type==='changeGame'){const picked=await vscode.window.showOpenDialog({title:'Choose the IKEMEN game for this Tests screen',canSelectFiles:false,canSelectFolders:true,canSelectMany:false});if(picked?.[0])await openWorkspace(picked[0]);return;}
        if (message.type === 'profile') { await vscode.workspace.getConfiguration('ikemenZss', vscode.Uri.file(currentRoot)).update('testProfile', message.profile, vscode.ConfigurationTarget.Workspace); if(panel?.ikemenGameRoot===currentRoot)panel.webview.html = require('./webview_policy').protect(html(state(currentRoot)), panel.webview.cspSource); }
        else if (message.type === 'launch') { const model = state(currentRoot); await launch(currentRoot, model.catalog, message.kind, message.suiteIds || []); }
        else if (message.type === 'newRegistry') { await createRegistry(currentRoot); }
        else if (message.type === 'importChecklist') { await importChecklist(currentRoot); }
        else if (message.type === 'openResult' && message.filename) {const exact=readResults(currentRoot).find(item=>path.resolve(item.filename)===path.resolve(message.filename));if(!exact)return vscode.window.showWarningMessage('That result is no longer in this game’s recent IKEMaker evidence list. Refresh and choose it again.');if(!fs.existsSync(exact.filename))return vscode.window.showWarningMessage('That IKEMaker result file no longer exists. Refresh the Results list.');await vscode.window.showTextDocument(vscode.Uri.file(exact.filename), { preview: false });}
        else if (message.type === 'refresh'&&panel?.ikemenGameRoot===currentRoot) panel.webview.html = require('./webview_policy').protect(html(state(currentRoot)), panel.webview.cspSource);
      }finally{if(panel){panel.ikemenTestBusy=false;if(!panel.ikemenTestDisposed&&panel.ikemenGameRoot===currentRoot)await panel.webview.postMessage?.({type:'testSessionBusy',root:currentRoot,busy:false,status:'Test-session controls are ready.'});}}
    });
  } else revealInViewerGroup(panel, false, vscode.ViewColumn.Active);
  require('./viewer_navigation').resetSourcePanel(panel);
  panel.ikemenGameRoot = root;
  panel.title = `IKEMaker Tests — ${path.basename(root)}`;
  panel.webview.html = require('./webview_policy').protect(html(state(root)), panel.webview.cspSource);
  return panel;
}
function registerTestSessionWorkspace(context) { context.subscriptions.push(vscode.commands.registerCommand('ikemen.testSessions.open', openWorkspace)); }

module.exports = { bundledCatalog, catalogFor, configuredProfile, contextFor, readResults, state, html, launch, createRegistry, importChecklist, openWorkspace, registerTestSessionWorkspace };
