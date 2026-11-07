'use strict';

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const engineLocator = require('./engine_locator');
const { chooseLaunchStage } = require('./launch_stage');
const { transactionalWrite,hash } = require('./mutation_safety');
const { findGameRoot, currentCharacter } = require('./ikemen_hub');
const { mergeCatalogs, loadProjectCatalogs, sessionPlan, validateCatalog, appliesTo, legacyChecklist } = require('./test_session_model');
const { installSession, resultFiles, removeBootstrap } = require('./test_session_runtime');
const moveRepeat = require('./move_test_again');
const { detectCapabilities, missingCapabilityMessage } = require('./platform_capabilities');
const { launchControlsHtml, launchControlsClientScript, handleLaunchMessage } = require('./launch_controls');
const { preferredViewerColumn, trackViewerPanel, revealInViewerGroup } = require('./viewer_group');

let panel;
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
function activePath() { return vscode.window.activeTextEditor?.document?.uri?.fsPath || vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || process.cwd(); }
function gameRoot(seed) {
  if(seed?.defPath)return findGameRoot(seed.defPath)||'';
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
  return { root, ...merged, profile, context, results: readResults(root), movePlans: moveRepeat.readPlans(root), moveCandidate: panel?.ikemenMoveCandidate || null };
}
function resultSummary(item){
  if(item.error)return item.error;
  if(item.kind==='move-natural-attempt')return `Input attempt ${item.runIndex}: ${item.attempt?.commandName||'named command'} active ${item.attempt?.commandActiveTicks||0} sampled tick(s); State ${item.assertions?.state?.expected} ${item.assertions?.state?.observed?'seen':'not seen'} in this window. No state was forced.`;
  if(item.kind==='move-repeat')return `Move run ${item.runIndex}: ${item.status}; state ${item.assertions?.state?.observed?'seen':'not seen'}, idle ${item.assertions?.idle?.observed?'seen':'not seen'}`;
  return `${item.profile||'unknown'} · ${(item.tests||[]).filter(test=>test.status==='pass').length}/${(item.tests||[]).length} passed`;
}
function html(model) {
  const profiles = model.catalog.profiles.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === model.profile ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('');
  const suites = model.catalog.suites.map(suite => {
    const enabled = appliesTo(suite, model.profile, model.context), scope = `${suite.scope.kind}: ${suite.scope.value}`;
    const reason=enabled?'Included explicitly for this context.':`Unavailable because this suite does not apply to the ${model.profile} profile and current character context.`;
    return `<label class="suite ${enabled ? '' : 'excluded'}"><input type="checkbox" data-suite="${escapeHtml(suite.id)}" aria-label="Include ${escapeHtml(suite.name)}" title="${escapeHtml(reason)}" ${enabled ? 'checked' : 'disabled'}><span><b>${escapeHtml(suite.name)}</b><small>${escapeHtml(scope)} · ${suite.tests.length} test(s)</small><em>${escapeHtml(suite.description || reason)}</em></span></label>`;
  }).join('');
  const diagnostics = model.catalog.diagnostics.map((item, index) => `<div class="diagnostic"><b>${index + 1}. ${escapeHtml(item.name)}</b><span>${escapeHtml(item.help)}</span></div>`).join('');
  const results = model.results.length ? model.results.map(item => `<div class="result"><b>${escapeHtml(path.basename(item.filename))}</b><span>${escapeHtml(resultSummary(item))}</span><button data-open-result="${escapeHtml(item.filename)}">Open</button></div>`).join('') : '<p class="muted">No IKEMaker result files have been written yet.</p>';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>
body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);margin:0}.bar{position:sticky;top:0;z-index:3;display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px 14px;background:var(--vscode-sideBar-background);border-bottom:1px solid var(--vscode-panel-border)}button,select{color:var(--vscode-button-foreground);background:var(--vscode-button-background);border:1px solid var(--vscode-button-border,transparent);padding:6px 10px}button:hover{background:var(--vscode-button-hoverBackground)}button:focus-visible,select:focus-visible,input:focus-visible{outline:2px solid var(--vscode-focusBorder);outline-offset:2px}main{padding:14px}.tabs{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:14px}.tab{background:transparent;color:var(--vscode-foreground)}.tab.active{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}section[hidden]{display:none}.grid{display:grid;grid-template-columns:minmax(330px,1fr) minmax(280px,.8fr);gap:14px}.card{border:1px solid var(--vscode-panel-border);background:var(--vscode-sideBar-background);padding:12px}.suite{display:flex;gap:10px;padding:10px;border-bottom:1px solid var(--vscode-panel-border)}.suite span{display:flex;flex-direction:column;gap:4px}.suite small,.suite em,.muted{color:var(--vscode-descriptionForeground)}.suite.excluded{opacity:.65}.diagnostic,.result{display:grid;grid-template-columns:1fr auto;gap:4px 12px;padding:9px;border-bottom:1px solid var(--vscode-panel-border)}.diagnostic span,.result span{grid-column:1}.result button{grid-column:2;grid-row:1/3}.notice{padding:8px;background:var(--vscode-textBlockQuote-background);border-left:3px solid var(--vscode-focusBorder)}code{color:var(--vscode-textPreformat-foreground)}@media(max-width:800px){.grid{grid-template-columns:1fr}}
</style></head><body><div class="bar" role="toolbar" aria-labelledby="testSuiteTitle"><b id="testSuiteTitle">IKEMaker Test & Diagnostic Suite</b><label for="profile">Profile</label><select id="profile" aria-label="Test profile">${profiles}</select><button id="launchTest">Launch Test Session</button><button id="launchDiagnostic">Launch Diagnostic Session</button><button id="newRegistry">New Project Tests</button><button id="importChecklist">Import Checklist</button><button id="refresh">Refresh</button><button id="changeGame">Change Game…</button></div><div id="testSessionStatus" class="notice" role="status" aria-live="polite">Test-session controls are ready.</div><main>
<p class="notice"><b>Context:</b> ${escapeHtml(model.root)} → ${escapeHtml(model.profile)} → ${escapeHtml(model.context.character || 'no current character')}<br>Forced Normal/Counter/Punish Counter remains exclusively in the player-facing Hit & Counter Settings menu.</p>
${model.errors.map(error => `<p class="notice">${escapeHtml(error)}</p>`).join('')}
<div class="tabs" role="tablist" aria-label="Test workspace sections"><button id="testTabTests" class="tab active" role="tab" aria-controls="tests" data-tab="tests">Test Session</button><button id="testTabDiagnostics" class="tab" role="tab" aria-controls="diagnostics" data-tab="diagnostics">Diagnostic Session</button><button id="testTabResults" class="tab" role="tab" aria-controls="results" data-tab="results">Results & Evidence</button><button id="testTabHelp" class="tab" role="tab" aria-controls="help" data-tab="help">How It Works</button></div>
<section id="tests" role="tabpanel" aria-labelledby="testTabTests"><div class="grid"><div class="card"><h2>Applicable suites</h2>${suites}</div><div class="card"><h2>In-game controls</h2><p><code>Shift+F8</code> show/hide overlay<br><code>Shift+F9</code> next test<br><code>Shift+F10</code> mark pass<br><code>Shift+F11</code> mark fail<br><code>Shift+F7</code> save results</p><p>Logger evidence is detected when the character exposes the known result mask, but human signoff remains authoritative.</p></div></div></section>
<section id="diagnostics" role="tabpanel" aria-labelledby="testTabDiagnostics" hidden><div class="grid"><div class="card"><h2>Native IKEMEN actions</h2>${diagnostics}</div><div class="card"><h2>In-game controls</h2><p><code>Shift+F8</code> show/hide overlay<br><code>Shift+F9</code> next diagnostic<br><code>Shift+F10</code> execute selected action<br><code>Shift+F7</code> save results</p><p>Pause and Scroll Lock retain IKEMEN's native pause and frame-step behavior. This session is offline development tooling and is never an online gameplay dependency.</p></div></div></section>
<section id="results" role="tabpanel" aria-labelledby="testTabResults" hidden><div class="card"><h2>Recent evidence</h2>${results}</div></section>
<section id="help" role="tabpanel" aria-labelledby="testTabHelp" hidden><div class="card"><h2>Ownership and safety</h2><p>Universal tests are portable. Game-profile tests are included only by explicit scope. Production order never causes inheritance. Project tests live under <code>.ikemen/tests</code>. Session plans live under <code>.ikemen/test-sessions</code>; Finish Project excludes both and the one-use runtime bootstrap.</p><p>The JNP screenpack Developer Options remain available. This workspace provides the equivalent native diagnostic authority for creators using any motif.</p></div></section>
</main><script>const vscode=acquireVsCodeApi(),testRoot=${JSON.stringify(model.root).replace(/</g,'\\u003c')},saved=vscode.getState()||{},tabs=[...document.querySelectorAll('[role="tab"]')],status=document.getElementById('testSessionStatus');let busy=false;function selectTab(id,focus=false){const selected=tabs.find(tab=>tab.dataset.tab===id)||tabs[0];for(const tab of tabs){const active=tab===selected;tab.classList.toggle('active',active);tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;document.getElementById(tab.dataset.tab).hidden=!active}vscode.setState({...vscode.getState(),tab:selected.dataset.tab});if(focus)selected.focus()}for(const button of tabs){button.onclick=()=>selectTab(button.dataset.tab);button.onkeydown=event=>{let index=tabs.indexOf(button);if(event.key==='Home')index=0;else if(event.key==='End')index=tabs.length-1;else if(event.key==='ArrowRight')index=(index+1)%tabs.length;else if(event.key==='ArrowLeft')index=(index-1+tabs.length)%tabs.length;else return;event.preventDefault();selectTab(tabs[index].dataset.tab,true)}}function setBusy(value,message=''){busy=Boolean(value);for(const control of document.querySelectorAll('.bar button,.bar select,[data-open-result]')){if(busy){if(!control.disabled)control.dataset.testBusyDisabled='true';control.disabled=true;control.title='Wait for the current test-session action to finish.'}else if(control.dataset.testBusyDisabled==='true'){delete control.dataset.testBusyDisabled;control.disabled=false;if(control.title==='Wait for the current test-session action to finish.')control.removeAttribute('title')}}status.textContent=message||(busy?'Test-session action in progress…':'Test-session controls are ready.');syncLaunchReasons()}function rememberFocus(control){vscode.setState({...vscode.getState(),focusId:control?.id||''})}function send(message,control){if(busy){status.textContent='Wait for the current test-session action to finish.';return false}rememberFocus(control);setBusy(true,'Starting test-session action…');vscode.postMessage({...message,root:testRoot});return true}function syncLaunchReasons(){const launchTest=document.getElementById('launchTest'),count=document.querySelectorAll('[data-suite]:checked').length;if(!busy){launchTest.disabled=count===0;launchTest.title=count?'Launch the selected applicable test suites.':'Select at least one applicable suite before launching a test session.';const diagnostic=document.getElementById('launchDiagnostic');diagnostic.disabled=${model.catalog.diagnostics.length===0?'true':'false'};diagnostic.title=diagnostic.disabled?'No diagnostics are available in the current test catalog.':'Launch the current diagnostic catalog.'}}document.querySelectorAll('[data-suite]').forEach(input=>input.onchange=()=>{vscode.setState({...vscode.getState(),suiteIds:[...document.querySelectorAll('[data-suite]:checked')].map(node=>node.dataset.suite)});syncLaunchReasons()});const restoredSuites=Array.isArray(saved.suiteIds)?new Set(saved.suiteIds):null;if(restoredSuites)for(const input of document.querySelectorAll('[data-suite]:not(:disabled)'))input.checked=restoredSuites.has(input.dataset.suite);document.getElementById('profile').onchange=e=>send({type:'profile',profile:e.target.value},e.target);document.getElementById('launchTest').onclick=e=>send({type:'launch',kind:'test',suiteIds:[...document.querySelectorAll('[data-suite]:checked')].map(node=>node.dataset.suite)},e.currentTarget);document.getElementById('launchDiagnostic').onclick=e=>send({type:'launch',kind:'diagnostic'},e.currentTarget);for(const [id,type]of [['newRegistry','newRegistry'],['importChecklist','importChecklist'],['refresh','refresh'],['changeGame','changeGame']])document.getElementById(id).onclick=e=>send({type},e.currentTarget);document.querySelectorAll('[data-open-result]').forEach(button=>button.onclick=()=>send({type:'openResult',filename:button.dataset.openResult},button));addEventListener('message',event=>{const message=event.data;if(message?.type==='testSessionBusy'&&message.root===testRoot)setBusy(message.busy,message.status)});selectTab(saved.tab);syncLaunchReasons();queueMicrotask(()=>{const target=saved.focusId&&document.getElementById(saved.focusId);target?.focus()});${require('./test_session_selection').clientScript()}</script></body></html>`;
}
function capabilities() { return detectCapabilities({ uiKind: vscode.env.uiKind === vscode.UIKind.Web ? 'web' : 'desktop', platform: process.platform, environment: process.env }); }
const testSuiteHtml = html;
function moveCard(model) {
  const candidate=model.moveCandidate, plans=model.movePlans||[];
  const saved=candidate&&plans.find(item=>item.id===moveRepeat.recipeId(path.relative(model.root,candidate.defPath).replace(/\\/g,'/'),candidate.stateNo,candidate.mode,candidate.commands?.[0]?.name||candidate.commandName||''));
  const value=saved||candidate;
  const choices=plans.map(item=>`<button data-move-plan="${escapeHtml(item.id)}">${item.mode==='natural'?'Input · ':''}State ${item.stateNo} · ${escapeHtml(item.character)}</button>`).join(' ');
  return `<section class="card" aria-label="Repeatable move test"><h2>Test this change again</h2><p class="muted">Select a saved StateDef and set the match. One run starts when the fighters, stage, distance, and facing match; Shift+F6 repeats it manually. The engine records state, spawn counts, hit/guard, and return to idle. Contact still needs your review.</p>${choices ? `<p>Saved move tests: ${choices}</p>` : ''}${value?`<div class="grid"><label>Opponent DEF <input id="moveOpponent" value="${escapeHtml(saved?.opponent||path.relative(model.root,candidate.defPath).replace(/\\/g,'/'))}"></label><label>Stage DEF <input id="moveStage" value="${escapeHtml(saved?.stage||'stages/stage0.def')}"></label><label>Distance <input id="moveDistance" type="number" min="0" max="2000" value="${escapeHtml(saved?.distance??100)}"></label><label>Facing <select id="moveFacing"><option value="1" ${saved?.facing===-1?'':'selected'}>Right (+1)</option><option value="-1" ${saved?.facing===-1?'selected':''}>Left (-1)</option></select></label><label>Expected spawn <select id="moveSpawn">${['any','none','helper','projectile','explod'].map(kind=>`<option value="${kind}" ${saved?.expectedSpawn===kind?'selected':''}>${kind}</option>`).join('')}</select></label></div><p>Selected saved character: <code>${escapeHtml(path.relative(model.root,candidate.defPath))}</code> · State ${candidate.stateNo}</p><button id="launchMoveRepeat">Save setup &amp; launch move test</button>`:'<p>Select a saved move test here, or use “Test this change again…” from a selected Move Lab StateDef.</p>'}</section>`;
}
function moveCardForMode(model){
  const candidate=model.moveCandidate,raw=moveCard(model),character=candidate?path.relative(model.root,candidate.defPath).replace(/\\/g,'/'):'',saved=candidate?(model.movePlans||[]).find(item=>item.id===moveRepeat.recipeId(character,candidate.stateNo,candidate.mode,candidate.commands?.[0]?.name||candidate.commandName||'')):null;
  const card=candidate?raw.replace('</div><p>Selected saved character:',`<label title="Exact peak simultaneous increase, not a count of distinct spawned lifetimes">Expected peak increase (optional) <input id="movePeakIncrease" type="number" min="1" max="16" value="${escapeHtml(saved?.expectedPeakIncrease??'')}"></label></div><p>Selected saved character:`):raw;
  if(candidate?.mode!=='natural')return card;
  const choices=(candidate.commands||[]).filter(item=>typeof item.name==='string').slice(0,16).map(item=>{
    const plan=(model.movePlans||[]).find(saved=>saved.id===moveRepeat.recipeId(character,candidate.stateNo,'natural',item.name));
    const values={opponent:plan?.opponent||character,stage:plan?.stage||'stages/stage0.def',distance:plan?.distance??100,facing:plan?.facing??1,expectedSpawn:plan?.expectedSpawn||'any',peak:plan?.expectedPeakIncrease??''};
    return `<option value="${escapeHtml(item.name)}" data-opponent="${escapeHtml(values.opponent)}" data-stage="${escapeHtml(values.stage)}" data-distance="${escapeHtml(values.distance)}" data-facing="${escapeHtml(values.facing)}" data-spawn="${escapeHtml(values.expectedSpawn)}" data-peak="${escapeHtml(values.peak)}">${escapeHtml(item.name)}</option>`;
  }).join('');
  return card.replace('<p class="muted">Select a saved StateDef and set the match. One run starts when the fighters, stage, distance, and facing match; Shift+F6 repeats it manually. The engine records state, spawn counts, hit/guard, and return to idle. Contact still needs your review.</p>','<p class="muted">Test your authored input in a 600-tick window. The first observation starts when the reviewed fighters, stage, distance, and facing match. No state is forced. Perform the selected command in game; Shift+F6 starts another observation. Named-command recognition, buffer counters, StateDef entry, and spawns are recorded separately.</p>')
    .replace('<button id="launchMoveRepeat">Save setup &amp; launch move test</button>',`<label>Authored command <select id="moveCommand">${choices}</select></label><button id="launchMoveNatural">Save setup &amp; test my input</button>`);
}
html = (model) => testSuiteHtml(model)
  .replace('.bar button,.bar select,[data-open-result]', '.bar button,.bar select,[data-open-result],[data-move-plan],#launchMoveRepeat,#launchMoveNatural')
  .replace('saved=vscode.getState()||{},tabs=',"stored=vscode.getState()||{},saved=stored.root===testRoot?stored:{},tabs=")
  .replaceAll('vscode.setState({...vscode.getState(),', 'vscode.setState({...vscode.getState(),root:testRoot,')
  .replace('</div><div id="testSessionStatus"', `${launchControlsHtml('test_session')}</div><div id="testSessionStatus"`)
  .replace('<div class="tabs" role="tablist"', `${moveCardForMode(model)}<div class="tabs" role="tablist"`)
  .replace('</script></body>', `document.querySelectorAll('[data-move-plan]').forEach(button=>button.onclick=()=>send({type:'selectMovePlan',id:button.dataset.movePlan},button));const moveCommand=document.getElementById('moveCommand');if(moveCommand)moveCommand.onchange=()=>{const data=moveCommand.selectedOptions[0]?.dataset;if(!data)return;document.getElementById('moveOpponent').value=data.opponent;document.getElementById('moveStage').value=data.stage;document.getElementById('moveDistance').value=data.distance;document.getElementById('moveFacing').value=data.facing;document.getElementById('moveSpawn').value=data.spawn;document.getElementById('movePeakIncrease').value=data.peak};for(const id of ['launchMoveRepeat','launchMoveNatural']){const button=document.getElementById(id);if(button)button.onclick=()=>send({type:'launchMove',mode:id==='launchMoveNatural'?'natural':'forced',commandName:moveCommand?.value||'',opponent:document.getElementById('moveOpponent').value,stage:document.getElementById('moveStage').value,distance:document.getElementById('moveDistance').value,facing:document.getElementById('moveFacing').value,expectedSpawn:document.getElementById('moveSpawn').value,expectedPeakIncrease:document.getElementById('movePeakIncrease').value},button)}</script></body>`)
  .replace('</script></body>', `${launchControlsClientScript()}</script></body>`);
const beforePausedHtml=html;html=model=>require('./paused_match_client').decorate(beforePausedHtml(model));
async function preparePausedInspection(root,session,executable){const old=require('./paused_match_host').current(root);if(old)await require('./paused_match_host').release(old);try{return require('./paused_match_host').prepare(root,session,executable)}catch(error){session.pausedInspectorUnavailable=error.message;return null}}

function sessionMatchArgs(character, stage) {
  if (!character || !stage) throw new Error('A saved character and stage are required for a test session.');
  return ['-loadmotif', '-time', '-1', '-rounds', '-1', '-tmode1', '0', '-tmode2', '0', '-s', stage, '-p1', character, '-p2', character];
}
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
    const pausedInspection=await preparePausedInspection(root,session,executable);
    installSession(root, session);
    // The motif must load before the direct match so external/mods can register
    // the session overlay. Keep this as a quick match: older engines reject the
    // combination of the motif-loading flag with training mode.
    const args = sessionMatchArgs(character, stage);
    const child = spawn(executable, args, { cwd: root, detached: true, stdio: 'ignore', windowsHide: false });require('./paused_match_host').bind(pausedInspection,child,root); child.unref();
    setTimeout(() => { try { removeBootstrap(root); } catch (_) {} }, 60000);
    vscode.window.showInformationMessage(`IKEMaker ${kind} session launched. Press Shift+F8 in game to show or hide its overlay.`);
  } catch (error) { removeBootstrap(root); vscode.window.showErrorMessage(`Could not launch IKEMaker session: ${error.message}`); }
}
async function launchMove(root, candidate, fields) {
  if (!candidate || !moveRepeat.inside(root,candidate.defPath)) throw new Error('Select a move from this game before testing.');
  const mode=fields.mode==='natural'?'natural':'forced',commandName=String(fields.commandName||'');
  if(mode==='natural'){
    if(candidate.mode!=='natural'||!Array.isArray(candidate.commands)||!candidate.commands.some(item=>item.name===commandName))throw new Error('Select an exact current authored command from Move Lab diagnosis.');
  }
  if (!capabilities().ikemenLaunch) throw new Error(missingCapabilityMessage('IKEMaker move test launch', capabilities()));
  const workspace=require('./move_constants_workspace'),assets=workspace.characterShellAssets(candidate.defPath);
  const opponentDef=path.resolve(root,fields.opponent),stagePath=path.resolve(root,fields.stage);
  const sourceFiles=[...new Set([assets.defPath,assets.constants,assets.air,assets.commands,assets.sff,assets.snd,...(assets.code||[]),...(mode==='natural'?[opponentDef,stagePath]:[])].filter(file=>file&&fs.existsSync(file)))];
  if(candidate.sourceFile&&!sourceFiles.some(file=>path.resolve(file).toLowerCase()===path.resolve(candidate.sourceFile).toLowerCase()))sourceFiles.push(candidate.sourceFile);
  const dirty=(vscode.workspace.textDocuments||[]).filter(document=>document.isDirty&&sourceFiles.some(file=>path.resolve(file).toLowerCase()===path.resolve(document.fileName).toLowerCase()));
  if(dirty.length)throw new Error('Save the character’s edited DEF, code, command, and AIR files before testing. The repeat run binds saved bytes only.');
  const fresh=await workspace.shellModelFor(assets),states=[...(fresh.directComponents||[]),...(fresh.behaviorComponents||[]),...(fresh.specialistComponents||[])].filter(item=>moveRepeat.stateNumber(item)===candidate.stateNo);
  if(states.length!==1)throw new Error('The selected StateDef is missing or duplicated in the current assigned sources. Refresh Move Lab.');
  const selected=states[0];
  if(!sourceFiles.includes(selected.filename))sourceFiles.push(selected.filename);
  if(candidate.sourceFile&&path.resolve(candidate.sourceFile).toLowerCase()!==path.resolve(selected.filename).toLowerCase())throw new Error('The selected StateDef moved to another assigned file. Return to Move Lab and select it again.');
  if(mode==='natural'&&candidate.sourceFingerprint){
    const binding=candidate.binding;
    if(!binding||path.resolve(binding.defPath||'.').toLowerCase()!==path.resolve(candidate.defPath).toLowerCase()||path.resolve(binding.filename||'.').toLowerCase()!==path.resolve(selected.filename).toLowerCase()||binding.defHash!==hash(fs.readFileSync(candidate.defPath,'utf8'))||binding.sourceHash!==selected.sourceHash||binding.rangeHash!==selected.rangeHash)throw new Error('The diagnosed StateDef or character DEF changed. Re-run diagnosis before testing input.');
    const defText=fs.readFileSync(candidate.defPath,'utf8'),inventory=[candidate.defPath,...require('./exact_state_sources').exactStateSources(candidate.defPath,defText),assets.commands,assets.air,assets.constants],seen=new Set(),records=[];let bytes=0;
    for(const file of inventory){if(!file)continue;const key=path.resolve(file).toLowerCase();if(seen.has(key))continue;seen.add(key);let available=false,sourceHash='';try{const size=fs.statSync(file).size;if(size>8*1024*1024)throw Error('source bound');const text=fs.readFileSync(file,'utf8');bytes+=Buffer.byteLength(text);if(bytes>32*1024*1024)throw Error('inventory bound');sourceHash=hash(text);available=true;}catch{}records.push([key,sourceHash,available]);}
    if(hash(JSON.stringify(records.sort((a,b)=>a[0].localeCompare(b[0]))))!==candidate.sourceFingerprint)throw new Error('The diagnosed assigned source inventory changed. Re-run diagnosis before testing input.');
  }
  if(mode==='natural'){
    if(!assets.commands||!fs.existsSync(assets.commands))throw new Error('The assigned CMD is unavailable for input observation.');
    const definitions=require('./command_movelist_model').parseCommands(fs.readFileSync(assets.commands,'utf8'),assets.commands).commands;
    if(!definitions.some(item=>item.name===commandName))throw new Error('The selected named command is no longer authored in the assigned CMD. Re-run diagnosis.');
    if(candidate.commands.some(item=>item.name===commandName&&item.sourceFile&&path.resolve(item.sourceFile).toLowerCase()!==path.resolve(assets.commands).toLowerCase()))throw new Error('The selected command no longer belongs to the assigned CMD. Re-run diagnosis.');
  }
  const recipe=moveRepeat.plan(root,{defPath:candidate.defPath,stateNo:candidate.stateNo,mode,commandName,opponentDef,stagePath,distance:Number(fields.distance),facing:Number(fields.facing),expectedSpawn:fields.expectedSpawn,expectedPeakIncrease:fields.expectedPeakIncrease,sourceFiles,createdAt:candidate.createdAt});
  const source=recipe.sources.find(item=>item.file===moveRepeat.relativeFile(root,selected.filename));
  const def=recipe.sources.find(item=>item.file===recipe.character);
  recipe.binding={defPath:candidate.defPath,defHash:def.sha256,filename:selected.filename,sourceHash:source.sha256,rangeHash:selected.rangeHash||''};
  const previous=moveRepeat.readPlans(root).find(item=>item.id===recipe.id);
  if(previous&&previous.sourceDigest!==recipe.sourceDigest){
    const answer=await vscode.window.showWarningMessage('The saved move sources changed since this test setup was last run. Save and test the current version?',{modal:true},'Test current saved version');
    if(answer!=='Test current saved version')return null;
  }
  const config=vscode.workspace.getConfiguration('ikemenZss',vscode.Uri.file(root));
  const executable=require('./engine_runtime').resolve(root,config.get('ikemenPath',''),path.join(root,'data','system.def'));
  if(!fs.existsSync(executable))throw new Error(`IKEMEN executable was not found: ${executable}`);
  moveRepeat.savePlan(root,recipe);
  const session={id:`${recipe.id}-${Date.now()}`,kind:'move-repeat',profile:configuredProfile(vscode.Uri.file(root)),character:recipe.character,stage:recipe.stage,createdAt:new Date().toISOString(),tests:[],diagnostics:[],moveRun:recipe};
  const pausedInspection=await preparePausedInspection(root,session,executable);
  installSession(root,session);
  const args=sessionMatchArgs(recipe.character,recipe.stage);args[args.length-1]=recipe.opponent;
  try {const child=spawn(executable,args,{cwd:root,detached:true,stdio:'ignore',windowsHide:false});require('./paused_match_host').bind(pausedInspection,child,root);child.on('error',error=>vscode.window.showErrorMessage(`Move test could not start: ${error.message}`));child.unref();}
  catch(error){removeBootstrap(root);throw error;}
  const bootstrap=path.join(root,...require('./test_session_runtime').MODULE_RELATIVE.split('/'));
  setTimeout(()=>{if(!fs.existsSync(bootstrap))return;try{removeBootstrap(root);}catch(_){}vscode.window.showWarningMessage('The move test overlay did not load within five minutes. The one-use bootstrap was removed; rerun the saved test after checking the engine log.');},300000);
  vscode.window.showInformationMessage(`${mode==='natural'?'Input observation':'Move test'} launched for State ${recipe.stateNo}. The first run starts once the reviewed fighters, stage, distance ${recipe.distance} ±${recipe.distanceTolerance}, and facing ${recipe.facing>0?'right':'left'} match. ${mode==='natural'?`Perform ${commandName} during the 600-tick window; no state is forced. `:''}Shift+F6 repeats; Shift+F7 saves evidence.`);
  return recipe;
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
  if(panel?.ikemenGameRoot===root){if(seed?.defPath){panel.ikemenMoveCandidate=seed;panel.webview.html=require('./webview_policy').protect(html(state(root)),panel.webview.cspSource);}revealInViewerGroup(panel,false,vscode.ViewColumn.Active);return panel;}
  if (!panel) {
    panel = trackViewerPanel(vscode.window.createWebviewPanel('ikemenTestSessions', 'IKEMaker Test & Diagnostic Suite', preferredViewerColumn(vscode.ViewColumn.Active), { enableScripts: true, retainContextWhenHidden: true }));
    panel.onDidDispose(() => { const closingRoot=panel?.ikemenGameRoot;panel.ikemenTestDisposed=true;if(closingRoot)void require('./paused_match_host').release(require('./paused_match_host').current(closingRoot)).catch(()=>{});panel = undefined; });
    panel.webview.onDidReceiveMessage(async message => {
      const currentRoot = panel.ikemenGameRoot;
      if(['capturePausedMatch','resumePausedMatch','selectPausedMatchObject','openPausedMatchObject'].includes(message?.type))return require('./paused_match_routes').handle(panel,message,vscode);
      const ownedTypes=new Set(['profile','launch','launchMove','selectMovePlan','newRegistry','importChecklist','openResult','refresh','changeGame']),owned=ownedTypes.has(message?.type);
      if(!owned){await handleLaunchMessage(message,currentRoot,'tests',panel);return;}
      if(typeof message.root!=='string'||path.resolve(message.root)!==path.resolve(currentRoot)){await panel.webview.postMessage?.({type:'testSessionBusy',root:currentRoot,busy:false,status:'This Tests action no longer matches the open game. Refresh and try again.'});return;}
      if(panel.ikemenTestBusy){await panel.webview.postMessage?.({type:'testSessionBusy',root:currentRoot,busy:true,status:'Wait for the current test-session action to finish.'});return;}
      panel.ikemenTestBusy=true;await panel.webview.postMessage?.({type:'testSessionBusy',root:currentRoot,busy:true,status:'Test-session action in progress…'});
      try{
        if(message.type==='changeGame'){const picked=await vscode.window.showOpenDialog({title:'Choose the IKEMEN game for this Tests screen',canSelectFiles:false,canSelectFolders:true,canSelectMany:false});if(picked?.[0])await openWorkspace(picked[0]);return;}
        if (message.type === 'profile') { await vscode.workspace.getConfiguration('ikemenZss', vscode.Uri.file(currentRoot)).update('testProfile', message.profile, vscode.ConfigurationTarget.Workspace); if(panel?.ikemenGameRoot===currentRoot)panel.webview.html = require('./webview_policy').protect(html(state(currentRoot)), panel.webview.cspSource); }
        else if (message.type === 'launch') { const model = state(currentRoot); await launch(currentRoot, model.catalog, message.kind, message.suiteIds || []); }
        else if (message.type === 'selectMovePlan') {const picked=moveRepeat.readPlans(currentRoot).find(item=>item.id===message.id);if(!picked)throw new Error('That saved move test is no longer available. Refresh this screen.');panel.ikemenMoveCandidate={defPath:path.join(currentRoot,picked.character),stateNo:picked.stateNo,sourceFile:picked.binding?.filename,createdAt:picked.createdAt,mode:picked.mode,commands:picked.commandName?[{name:picked.commandName}]:[]};panel.webview.html=require('./webview_policy').protect(html(state(currentRoot)),panel.webview.cspSource);}
        else if (message.type === 'launchMove') {try{const next=await launchMove(currentRoot,panel.ikemenMoveCandidate,message);if(next&&panel?.ikemenGameRoot===currentRoot)panel.webview.html=require('./webview_policy').protect(html(state(currentRoot)),panel.webview.cspSource);}catch(error){await vscode.window.showWarningMessage(`Move test was not launched: ${error.message}`);}}
        else if (message.type === 'newRegistry') { await createRegistry(currentRoot); }
        else if (message.type === 'importChecklist') { await importChecklist(currentRoot); }
        else if (message.type === 'openResult' && message.filename) {const exact=readResults(currentRoot).find(item=>path.resolve(item.filename)===path.resolve(message.filename));if(!exact)return vscode.window.showWarningMessage('That result is no longer in this game’s recent IKEMaker evidence list. Refresh and choose it again.');if(!fs.existsSync(exact.filename))return vscode.window.showWarningMessage('That IKEMaker result file no longer exists. Refresh the Results list.');await vscode.window.showTextDocument(vscode.Uri.file(exact.filename), { preview: false });}
        else if (message.type === 'refresh'&&panel?.ikemenGameRoot===currentRoot) panel.webview.html = require('./webview_policy').protect(html(state(currentRoot)), panel.webview.cspSource);
      }finally{if(panel){panel.ikemenTestBusy=false;if(!panel.ikemenTestDisposed&&panel.ikemenGameRoot===currentRoot)await panel.webview.postMessage?.({type:'testSessionBusy',root:currentRoot,busy:false,status:'Test-session controls are ready.'});}}
    });
  } else revealInViewerGroup(panel, false, vscode.ViewColumn.Active);
  require('./viewer_navigation').resetSourcePanel(panel);
  if(panel.ikemenGameRoot&&panel.ikemenGameRoot!==root)void require('./paused_match_host').release(require('./paused_match_host').current(panel.ikemenGameRoot)).catch(()=>{});
  panel.ikemenGameRoot = root;
  panel.ikemenMoveCandidate = seed?.defPath ? seed : null;
  panel.title = `IKEMaker Tests — ${path.basename(root)}`;
  panel.webview.html = require('./webview_policy').protect(html(state(root)), panel.webview.cspSource);
  return panel;
}
function registerTestSessionWorkspace(context) { context.subscriptions.push(vscode.commands.registerCommand('ikemen.testSessions.open', openWorkspace),vscode.commands.registerCommand('ikemen.testSessions.openMove', openWorkspace)); }

module.exports = { bundledCatalog, catalogFor, configuredProfile, contextFor, readResults, state, html, sessionMatchArgs, launch, launchMove, createRegistry, importChecklist, openWorkspace, registerTestSessionWorkspace };
