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
    return `<label class="suite ${enabled ? '' : 'excluded'}"><input type="checkbox" data-suite="${escapeHtml(suite.id)}" ${enabled ? 'checked' : 'disabled'}><span><b>${escapeHtml(suite.name)}</b><small>${escapeHtml(scope)} · ${suite.tests.length} test(s)</small><em>${escapeHtml(suite.description || (enabled ? 'Included explicitly for this context.' : 'Not applicable to the selected profile.'))}</em></span></label>`;
  }).join('');
  const diagnostics = model.catalog.diagnostics.map((item, index) => `<div class="diagnostic"><b>${index + 1}. ${escapeHtml(item.name)}</b><span>${escapeHtml(item.help)}</span></div>`).join('');
  const results = model.results.length ? model.results.map(item => `<div class="result"><b>${escapeHtml(path.basename(item.filename))}</b><span>${escapeHtml(item.error || `${item.profile || 'unknown'} · ${(item.tests || []).filter(test => test.status === 'pass').length}/${(item.tests || []).length} passed`)}</span><button data-open-result="${escapeHtml(item.filename)}">Open</button></div>`).join('') : '<p class="muted">No IKEMaker result files have been written yet.</p>';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>
body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);margin:0}.bar{position:sticky;top:0;z-index:3;display:flex;gap:8px;align-items:center;padding:10px 14px;background:var(--vscode-sideBar-background);border-bottom:1px solid var(--vscode-panel-border)}button,select{color:var(--vscode-button-foreground);background:var(--vscode-button-background);border:1px solid var(--vscode-button-border,transparent);padding:6px 10px}button:hover{background:var(--vscode-button-hoverBackground)}main{padding:14px}.tabs{display:flex;gap:4px;margin-bottom:14px}.tab{background:transparent;color:var(--vscode-foreground)}.tab.active{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}section{display:none}section.active{display:block}.grid{display:grid;grid-template-columns:minmax(330px,1fr) minmax(280px,.8fr);gap:14px}.card{border:1px solid var(--vscode-panel-border);background:var(--vscode-sideBar-background);padding:12px}.suite{display:flex;gap:10px;padding:10px;border-bottom:1px solid var(--vscode-panel-border)}.suite span{display:flex;flex-direction:column;gap:4px}.suite small,.suite em,.muted{color:var(--vscode-descriptionForeground)}.suite.excluded{opacity:.45}.diagnostic,.result{display:grid;grid-template-columns:1fr auto;gap:4px 12px;padding:9px;border-bottom:1px solid var(--vscode-panel-border)}.diagnostic span,.result span{grid-column:1}.result button{grid-column:2;grid-row:1/3}.notice{padding:8px;background:var(--vscode-textBlockQuote-background);border-left:3px solid var(--vscode-focusBorder)}code{color:var(--vscode-textPreformat-foreground)}@media(max-width:800px){.grid{grid-template-columns:1fr}.bar{flex-wrap:wrap}}
</style></head><body><div class="bar"><b>IKEMaker Test & Diagnostic Suite</b><select id="profile">${profiles}</select><button id="launchTest">Launch Test Session</button><button id="launchDiagnostic">Launch Diagnostic Session</button><button id="newRegistry">New Project Tests</button><button id="importChecklist">Import Checklist</button><button id="refresh">Refresh</button><button id="changeGame">Change Game…</button></div><main>
<p class="notice"><b>Context:</b> ${escapeHtml(model.root)} → ${escapeHtml(model.profile)} → ${escapeHtml(model.context.character || 'no current character')}<br>Forced Normal/Counter/Punish Counter remains exclusively in the player-facing Hit & Counter Settings menu.</p>
${model.errors.map(error => `<p class="notice">${escapeHtml(error)}</p>`).join('')}
<div class="tabs"><button class="tab active" data-tab="tests">Test Session</button><button class="tab" data-tab="diagnostics">Diagnostic Session</button><button class="tab" data-tab="results">Results & Evidence</button><button class="tab" data-tab="help">How It Works</button></div>
<section id="tests" class="active"><div class="grid"><div class="card"><h2>Applicable suites</h2>${suites}</div><div class="card"><h2>In-game controls</h2><p><code>F8</code> show/hide overlay<br><code>F9</code> next test<br><code>F10</code> mark pass<br><code>F11</code> mark fail<br><code>F12</code> save results</p><p>Logger evidence is detected when the character exposes the known result mask, but human signoff remains authoritative.</p></div></div></section>
<section id="diagnostics"><div class="grid"><div class="card"><h2>Native IKEMEN actions</h2>${diagnostics}</div><div class="card"><h2>In-game controls</h2><p><code>F8</code> show/hide overlay<br><code>F9</code> next diagnostic<br><code>F10</code> execute selected action</p><p>Pause and Scroll Lock retain IKEMEN's native pause and frame-step behavior. This session is offline development tooling and is never an online gameplay dependency.</p></div></div></section>
<section id="results"><div class="card"><h2>Recent evidence</h2>${results}</div></section>
<section id="help"><div class="card"><h2>Ownership and safety</h2><p>Universal tests are portable. Game-profile tests are included only by explicit scope. Production order never causes inheritance. Project tests live under <code>.ikemen/tests</code>. Session plans live under <code>.ikemen/test-sessions</code>; Finish Project excludes both and the one-use runtime bootstrap.</p><p>The JNP screenpack Developer Options remain available. This workspace provides the equivalent native diagnostic authority for creators using any motif.</p></div></section>
</main><script>const vscode=acquireVsCodeApi();document.querySelectorAll('.tab').forEach(button=>button.onclick=()=>{document.querySelectorAll('.tab,section').forEach(node=>node.classList.remove('active'));button.classList.add('active');document.getElementById(button.dataset.tab).classList.add('active')});document.getElementById('profile').onchange=e=>vscode.postMessage({type:'profile',profile:e.target.value});document.getElementById('launchTest').onclick=()=>vscode.postMessage({type:'launch',kind:'test',suiteIds:[...document.querySelectorAll('[data-suite]:checked')].map(node=>node.dataset.suite)});document.getElementById('launchDiagnostic').onclick=()=>vscode.postMessage({type:'launch',kind:'diagnostic'});document.getElementById('newRegistry').onclick=()=>vscode.postMessage({type:'newRegistry'});document.getElementById('importChecklist').onclick=()=>vscode.postMessage({type:'importChecklist'});document.getElementById('refresh').onclick=()=>vscode.postMessage({type:'refresh'});document.getElementById('changeGame').onclick=()=>vscode.postMessage({type:'changeGame'});document.querySelectorAll('[data-open-result]').forEach(button=>button.onclick=()=>vscode.postMessage({type:'openResult',filename:button.dataset.openResult}));${require('./test_session_selection').clientScript()}</script></body></html>`;
}
function capabilities() { return detectCapabilities({ uiKind: vscode.env.uiKind === vscode.UIKind.Web ? 'web' : 'desktop', platform: process.platform, environment: process.env }); }
const testSuiteHtml = html;
html = (model) => testSuiteHtml(model).replace('</div><main>', `${launchControlsHtml('test_session')}</div><main>`).replace('</script></body>', `${launchControlsClientScript()}</script></body>`);

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
    const args = ['-loadmotif', '1', '-training', '1', '-time', '-1', '-tmode1', '0', '-tmode2', '0', '-s', stage, '-p1', character, '-p2', character];
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
    panel.onDidDispose(() => { panel = undefined; });
    panel.webview.onDidReceiveMessage(async message => {
      const currentRoot = panel.ikemenGameRoot;
      if (await handleLaunchMessage(message, currentRoot, 'tests', panel)) return;
      if(message.type==='changeGame'){const picked=await vscode.window.showOpenDialog({title:'Choose the IKEMEN game for this Tests screen',canSelectFiles:false,canSelectFolders:true,canSelectMany:false});if(picked?.[0])await openWorkspace(picked[0]);return;}
      if (message.type === 'profile') { await vscode.workspace.getConfiguration('ikemenZss', vscode.Uri.file(currentRoot)).update('testProfile', message.profile, vscode.ConfigurationTarget.Workspace); if(panel?.ikemenGameRoot===currentRoot)panel.webview.html = require('./webview_policy').protect(html(state(currentRoot)), panel.webview.cspSource); }
      else if (message.type === 'launch') { const model = state(currentRoot); await launch(currentRoot, model.catalog, message.kind, message.suiteIds || []); }
      else if (message.type === 'newRegistry') { await createRegistry(currentRoot); }
      else if (message.type === 'importChecklist') { await importChecklist(currentRoot); }
      else if (message.type === 'openResult' && message.filename && fs.existsSync(message.filename)) await vscode.window.showTextDocument(vscode.Uri.file(message.filename), { preview: false });
      else if (message.type === 'refresh') panel.webview.html = require('./webview_policy').protect(html(state(currentRoot)), panel.webview.cspSource);
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
