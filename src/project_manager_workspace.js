'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vscode = require('vscode');
const registryModel = require('./project_registry');
const management = require('./project_management_model');
const projectContext = require('./project_context_ui');
const { hash } = require('./mutation_safety');
const { preferredViewerColumn, trackViewerPanel } = require('./viewer_group');
const { launchControlsHtml, launchControlsClientScript, handleLaunchMessage } = require('./launch_controls');
const engineModel = require('./engine_registry_model');
const { ENGINE_CATALOG_KEY, BUILT_IN_ENGINE_CATALOG } = require('./updater');
const { INSTALLED_ENGINE_KEY } = require('./engine_runtime');
let extensionContext;

function html(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
function dataJson(value) { return JSON.stringify(value).replace(/</g, '\\u003c'); }
function registryRoot(filename) { return path.dirname(path.dirname(filename)); }
function displayRoot(filename, value) { if (!value) return 'No folder assigned'; const root = registryRoot(filename), absolute = path.isAbsolute(value) ? value : path.resolve(root, value); return absolute; }
function snapshot(filename, registry, issues = [], defaultView = 'games') {
  const engineCatalog = engineModel.normalizeCatalog(extensionContext?.globalState.get(ENGINE_CATALOG_KEY, BUILT_IN_ENGINE_CATALOG));
  const installedEngines = engineModel.normalizeInstalledRegistry(extensionContext?.globalState.get(INSTALLED_ENGINE_KEY, {}));
  return {
    filename, root: registryRoot(filename), schemaVersion: registry.schemaVersion,
    registryVersion: registry.registryVersion, issues,
    games: registry.projects.map((item) => ({ ...item })),
    workProjects: registry.workProjects.map((item) => ({ ...item, displayRoot: displayRoot(filename, item.root) })),
    teams: registry.teams.map((item) => ({ ...item, members: item.members.map((member) => ({ ...member })) })),
    engineCatalog, installedEngines, defaultView
  };
}
function managerHtml(state) {
  const data = dataJson(state);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
:root{color-scheme:light dark}*{box-sizing:border-box}body{margin:0;background:var(--vscode-editor-background);color:var(--vscode-foreground);font:13px var(--vscode-font-family)}button,input,select{font:inherit;color:inherit;background:var(--vscode-input-background);border:1px solid var(--vscode-input-border);padding:6px 9px}button{cursor:pointer}button:hover{background:var(--vscode-list-hoverBackground)}button.primary{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border-color:transparent}button:focus-visible,.tab:focus-visible{outline:2px solid var(--vscode-focusBorder);outline-offset:2px}header{position:sticky;top:0;z-index:4;display:flex;align-items:center;gap:7px;flex-wrap:wrap;padding:9px 12px;border-bottom:1px solid var(--vscode-panel-border);background:var(--vscode-editor-background)}.grow{flex:1}.path{max-width:42vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--vscode-descriptionForeground)}nav{display:flex;gap:5px;flex-wrap:wrap;padding:8px 12px;border-bottom:1px solid var(--vscode-panel-border)}nav button.active{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}main{padding:12px;max-width:1500px;margin:auto}.intro,.notice{padding:10px 12px;border-left:3px solid var(--vscode-focusBorder);background:var(--vscode-textBlockQuote-background);margin-bottom:10px}.notice.error{border-color:var(--vscode-errorForeground)}.toolbar{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin:8px 0 12px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:10px}.card{border:1px solid var(--vscode-panel-border);border-radius:5px;padding:11px;min-width:0}.card h3{margin:0 0 5px}.meta{color:var(--vscode-descriptionForeground);overflow-wrap:anywhere}.badges{display:flex;gap:5px;flex-wrap:wrap;margin:7px 0}.badge{border:1px solid var(--vscode-panel-border);border-radius:11px;padding:2px 7px}.actions{display:flex;gap:5px;flex-wrap:wrap;margin-top:9px}.member{border-top:1px solid var(--vscode-panel-border);padding:8px 0}.member:first-of-type{margin-top:8px}.inactive{opacity:.6}.empty{text-align:center;padding:35px;color:var(--vscode-descriptionForeground)}code{font-family:var(--vscode-editor-font-family)}@media(max-width:700px){header .path{max-width:100%;width:100%}.grid{grid-template-columns:1fr}}
</style></head><body><header><b>Project & Team Manager</b><span class="badge">Registry v${state.registryVersion}</span><span class="path" title="${html(state.filename)}">${html(state.filename)}</span><span class="grow"></span>${launchControlsHtml('project_manager')}<button id="switchRoot" title="Choose another folder or registry">Switch folder…</button><button id="openRegistry" title="Open the underlying registry JSON for advanced editing">Advanced JSON</button><button id="refresh" title="Reload all project and team information">Refresh</button></header><nav aria-label="Manager sections"><button class="tab" data-view="games">Games</button><button class="tab" data-view="engines">Engine Targets</button><button class="tab" data-view="work">Work Projects</button><button class="tab" data-workspace-control="team-assignment" data-view="teams">Teams</button><button class="tab" data-view="validation">Review</button></nav><main><div class="intro"><b>Independent levels:</b> a game owns its exact engine target and rules; installed engines are reusable local copies; knowledge updates only describe upstream changes. Updating knowledge or registering an engine never switches a game.</div><div id="content"></div></main><script>
const vscode=acquireVsCodeApi(),data=${data};let view=vscode.getState()?.view||data.defaultView||'games';const content=document.getElementById('content');function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}function send(type,extra={}){vscode.postMessage({type,...extra})}function badge(value){return '<span class="badge">'+esc(value)+'</span>'}function empty(text){return '<div class="empty">'+esc(text)+'</div>'}function setView(next){view=next;render()}
function targetLabel(t){return (t?.version||'Unknown')+' · '+(t?.channel||'unknown')+(t?.commit?' · '+t.commit.slice(0,12):'')}
function gameCard(g){return '<article class="card"><h3>'+esc(g.name)+'</h3><div class="meta">Game ID: <code>'+esc(g.id)+'</code></div><div class="badges">'+badge(g.distributionIntent==='hobby'?'Hobby / non-commercial':g.distributionIntent==='commercial'?'Commercial':'Undecided')+badge(g.contentBasis)+badge('Engine '+targetLabel(g.engineTarget))+'</div><div class="meta">'+esc(g.sourceAuthority||'No source authority recorded.')+'</div><div class="actions"><button data-action="editGame" data-id="'+esc(g.id)+'" title="Rename this game or change its hobby/commercial and content classifications">Edit game…</button><button data-action="adoptEngine" data-id="'+esc(g.id)+'" title="Review and explicitly adopt one installed exact engine build">Change engine target…</button>'+(g.engineAdoptionHistory?.length?'<button data-action="revertEngine" data-id="'+esc(g.id)+'" title="Review a reversal to the target recorded before the latest adoption">Review last target…</button>':'')+'</div></article>'}
function engineCard(b){const installed=data.installedEngines.builds.filter(i=>i.buildId===b.id),states=[...new Set(installed.map(i=>i.identityStatus))];return '<article class="card"><h3>'+esc(b.version||b.id)+'</h3><div class="badges">'+badge(b.channel)+badge(b.platform)+badge(b.commit?'Exact '+b.commit.slice(0,12):'Unresolved identity')+badge(installed.length?(installed.length+' registered · '+states.join(', ')):'Not registered')+'</div><div class="meta">'+esc(b.source?.url||'No source URL')+'</div><div class="meta">Source '+esc(b.verification?.source||'unknown')+' · Runtime '+esc(b.verification?.runtime||'unknown')+' · Rollback '+esc(b.verification?.rollback||'unknown')+'</div></article>'}
function workCard(p){const game=data.games.find(g=>g.id===p.gameId),team=data.teams.find(t=>t.id===p.teamId);return '<article class="card"><h3>'+esc(p.name)+'</h3><div class="badges">'+badge(p.type)+badge(game?'Game: '+game.name:'No game')+badge(team?'Team: '+team.name:'No team')+'</div><div class="meta" title="'+esc(p.displayRoot)+'">'+esc(p.displayRoot)+'</div><div class="actions"><button data-action="assignGame" data-id="'+esc(p.id)+'" title="Assign or remove the single authoritative game">Assign game…</button><button data-workspace-control="team-assignment" data-action="assignTeam" data-id="'+esc(p.id)+'" title="Assign or remove the responsible team">Assign team…</button><button data-action="editWork" data-id="'+esc(p.id)+'" title="Rename, reclassify, or change this work project's folder">Edit project…</button></div></article>'}
function memberCard(t,m){return '<div class="member '+(m.active?'':'inactive')+'"><b>'+esc(m.name)+'</b> <span class="meta">@'+esc(m.handle)+'</span><div class="badges">'+(m.jobClasses.map(badge).join('')||badge('No job class'))+'</div><button data-action="editMember" data-team="'+esc(t.id)+'" data-id="'+esc(m.id)+'" title="Edit name, handle, job classes, or active status">Edit member…</button></div>'}
function teamCard(t){return '<article class="card"><h3>'+esc(t.name)+'</h3><div class="meta">'+t.members.filter(m=>m.active).length+' active member(s) · '+t.jobClasses.length+' job class(es)</div><div class="badges">'+t.jobClasses.map(badge).join('')+'</div><div class="actions"><button data-action="editTeam" data-id="'+esc(t.id)+'" title="Change this team name">Rename team…</button><button data-action="addJob" data-id="'+esc(t.id)+'" title="Add a custom job class to this team">Add job class…</button><button data-action="addMember" data-id="'+esc(t.id)+'" title="Add a member and assign one or more job classes">Add member…</button></div>'+t.members.map(m=>memberCard(t,m)).join('')+'</article>'}
function render(){for(const b of document.querySelectorAll('.tab')){b.classList.toggle('active',b.dataset.view===view);b.setAttribute('aria-selected',String(b.dataset.view===view))}vscode.setState({view,root:data.root});if(view==='games')content.innerHTML='<div class="toolbar"><h2>Games</h2><span class="grow"></span><button class="primary" data-action="addGame" title="Add another game profile">Add game…</button></div><p class="meta">A game owns one ruleset, one distribution classification, and one exact engine target. Existing projects default conservatively to IKEMEN GO 1.0 stable.</p><div class="grid">'+(data.games.map(gameCard).join('')||empty('No game profiles. Add one to begin.'))+'</div>';else if(view==='engines')content.innerHTML='<div class="toolbar"><h2>Engine Targets</h2><span class="grow"></span><button data-action="updateKnowledge">Update Engine Knowledge…</button><button data-action="showUpdateReport">View Last Update Report</button><button data-action="installEngine">Review & Safely Install Exact Nightly…</button><button class="primary" data-action="registerEngine">Register Existing Build…</button></div><div class="notice">Weekly discovery is read-only for game/project content. Stay, remind, review, staging, backup, installation, registration, and adoption are separate decisions. A moving Nightly is resolved and pinned to one exact commit and artifact before any approved migration.</div><div class="grid">'+(data.engineCatalog.builds.map(engineCard).join('')||empty('No validated engine knowledge is available.'))+'</div>';else if(view==='work')content.innerHTML='<div class="toolbar"><h2>Work Projects</h2><span class="grow"></span><button class="primary" data-action="addWork">Add work project…</button></div><p class="meta">Work may remain unassigned, belong to exactly one game, and optionally belong to one team. Assignments can be changed without moving files.</p><div class="grid">'+(data.workProjects.map(workCard).join('')||empty('No work projects. Add a character, stage, screenpack, system, asset set, or other deliverable.'))+'</div>';else if(view==='teams')content.innerHTML='<div class="toolbar"><h2>Teams</h2><span class="grow"></span><button class="primary" data-action="addTeam">Add team…</button></div><p class="meta">Team names, members, active status, and job classes remain editable. Inactive members stay in project history.</p><div class="grid">'+(data.teams.map(teamCard).join('')||empty('No teams. Solo creators can leave this empty.'))+'</div>';else content.innerHTML='<h2>Registry Review</h2><div class="notice '+(data.issues.some(i=>i.level==='error')?'error':'')+'">Schema '+data.schemaVersion+' · '+data.issues.length+' review item(s)</div>'+(data.issues.length?'<div class="grid">'+data.issues.map(i=>'<article class="card"><b>'+esc(i.level.toUpperCase())+' · '+esc(i.code)+'</b><p>'+esc(i.message)+'</p></article>').join('')+'</div>':empty('No registry problems were found.'))+'<div class="actions"><button data-action="validate">Validate or migrate…</button></div>';wire()}
function wire(){for(const button of content.querySelectorAll('[data-action]'))button.onclick=()=>send(button.dataset.action,{id:button.dataset.id,teamId:button.dataset.team})}for(const button of document.querySelectorAll('.tab'))button.onclick=()=>setView(button.dataset.view);document.getElementById('switchRoot').onclick=()=>send('switchRoot');document.getElementById('openRegistry').onclick=()=>send('openRegistry');document.getElementById('refresh').onclick=()=>send('refresh');globalThis.ikemenNavigationSelection=()=>({view});globalThis.ikemenCanRestoreNavigation=reference=>!!reference&&['games','engines','work','teams','validation'].includes(reference.view);globalThis.ikemenRestoreNavigation=reference=>setView(reference.view);addEventListener('message',event=>{if(event.data.type==='selectManagerView'&&globalThis.ikemenCanRestoreNavigation({view:event.data.view}))setView(event.data.view)});${launchControlsClientScript()}render();
</script></body></html>`;
}

async function chooseRoot(current) {
  const picked = await vscode.window.showOpenDialog({ title: 'Choose an IKEMEN game, project, or team-work folder', defaultUri: current ? vscode.Uri.file(current) : undefined, canSelectFiles: false, canSelectFolders: true, canSelectMany: false, openLabel: 'Open Project Manager' });
  return picked?.[0]?.fsPath || '';
}
async function chooseOptional(items, title, emptyLabel) {
  return vscode.window.showQuickPick([{ label: emptyLabel, id: '' }, ...items.map((item) => ({ label: item.name, description: item.id, id: item.id }))], { title });
}
async function save(panel, state, next, label) {
  projectContext.writeRegistry(state.filename, next, label, state.hash);
  await populate(panel, registryRoot(state.filename));
}
async function promptGame(registry, current) {
  const name = await vscode.window.showInputBox({ title: current ? 'Edit game name' : 'Add game', value: current?.name || '', prompt: 'Public game/project-profile name.' }); if (!name?.trim()) return null;
  const distribution = await vscode.window.showQuickPick([{ label: 'Hobby / non-commercial', value: 'hobby' }, { label: 'Commercial', value: 'commercial' }, { label: 'Undecided / private prototype', value: 'undecided' }].map((item) => ({ ...item, picked: item.value === current?.distributionIntent })), { title: 'Distribution classification', placeHolder: 'This can be changed later.' }); if (!distribution) return null;
  const basis = await vscode.window.showQuickPick([{ label: 'Fully original', value: 'original' }, { label: 'Licensed material', value: 'licensed' }, { label: 'Fan project / reference recreation', value: 'fan-project' }, { label: 'Mixed or undecided', value: 'mixed' }].map((item) => ({ ...item, picked: item.value === current?.contentBasis })), { title: 'Content basis' }); if (!basis) return null;
  return { name: name.trim(), distributionIntent: distribution.value, contentBasis: basis.value };
}
async function promptWork(registry, current, root) {
  const name = await vscode.window.showInputBox({ title: current ? 'Edit work project' : 'Add work project', value: current?.name || '', prompt: 'Examples: Ryu, Metro City Stage, Main Screenpack, Shared Effects.' }); if (!name?.trim()) return null;
  const type = await vscode.window.showQuickPick(registryModel.WORK_PROJECT_TYPES.map((value) => ({ label: value.replace(/(^|-)([a-z])/g, (_, gap, c) => `${gap ? ' ' : ''}${c.toUpperCase()}`), value, picked: value === current?.type })), { title: 'Work-project type' }); if (!type) return null;
  let assignedRoot = current?.root || '';
  const rootChoice = await vscode.window.showQuickPick([{ label: current ? 'Keep current folder' : 'Use manager folder', value: 'keep' }, { label: 'Browse for folder…', value: 'browse' }, { label: 'No folder yet', value: 'none' }], { title: 'Work-project folder', placeHolder: current ? displayRoot(path.join(root, '.ikemen', 'project-registry.json'), assignedRoot) : root }); if (!rootChoice) return null;
  if (rootChoice.value === 'browse') { const picked = await chooseRoot(displayRoot(path.join(root, '.ikemen', 'project-registry.json'), assignedRoot) || root); if (!picked) return null; assignedRoot = path.relative(root, picked).replace(/\\/g, '/') || '.'; }
  else if (rootChoice.value === 'none') assignedRoot = '';
  else if (!current) assignedRoot = '.';
  return { name: name.trim(), type: type.value, root: assignedRoot };
}
function fileSha256(filename) { return crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex'); }
async function registerInstalledBuild(panel, currentState) {
  const catalog = engineModel.normalizeCatalog(extensionContext.globalState.get(ENGINE_CATALOG_KEY, BUILT_IN_ENGINE_CATALOG));
  const pickedBuild = await vscode.window.showQuickPick(catalog.builds.map((build) => ({ label: `${build.version || build.id} · ${build.channel}`, description: build.commit ? build.commit.slice(0, 12) : 'Identity unresolved', build })), { title: 'Register an already installed exact engine build', placeHolder: 'Registration does not adopt the build for any game.' });
  if (!pickedBuild) return;
  if (!pickedBuild.build.commit) return vscode.window.showWarningMessage('This observed build does not yet have an exact commit identity and cannot be registered for adoption.');
  const selected = await vscode.window.showOpenDialog({ title: `Choose the executable for ${pickedBuild.label}`, canSelectFiles: true, canSelectFolders: false, canSelectMany: false, filters: { 'IKEMEN executable': ['exe'] }, openLabel: 'Verify and Register' });
  if (!selected?.[0]) return;
  const executable = selected[0].fsPath, executableSha256 = fileSha256(executable);
  const authenticated = Boolean(pickedBuild.build.executableSha256 && pickedBuild.build.executableSha256 === executableSha256);
  const identityStatus = authenticated ? 'verified' : 'user-asserted';
  const current = extensionContext.globalState.get(INSTALLED_ENGINE_KEY, {});
  const next = engineModel.registerInstalled(current, { buildId: pickedBuild.build.id, executable, root: path.dirname(executable), executableSha256, artifactSha256: authenticated ? pickedBuild.build.artifactSha256 : null, identityStatus, registeredAt: new Date().toISOString(), verifiedAt: authenticated ? new Date().toISOString() : null });
  await extensionContext.globalState.update(INSTALLED_ENGINE_KEY, next);
  await populate(panel, registryRoot(currentState.filename), 'engines');
  return vscode.window.showInformationMessage(authenticated ? `Registered and authenticated ${pickedBuild.build.version || pickedBuild.build.id}. No project target was changed.` : `Registered ${pickedBuild.build.version || pickedBuild.build.id} as a user-asserted artifact. Its hash is pinned, but it was not authenticated against trusted catalog evidence and no project target was changed.`);
}
async function populate(panel, root, defaultView = 'games') {
  const loaded = projectContext.readRegistry(root), exists = fs.existsSync(loaded.filename);
  const refreshed = exists ? loaded : { ...loaded, registry: registryModel.createStarter(), issues: [] }, state = { filename: refreshed.filename, registry: refreshed.registry, hash: exists ? hash(fs.readFileSync(refreshed.filename)) : undefined };
  panel.ikemenProjectManagerState = state; panel.title = 'Project & Team Manager'; panel.webview.options = { enableScripts: true }; panel.webview.html = require('./webview_policy').protect(managerHtml(snapshot(state.filename, state.registry, refreshed.issues, defaultView)), panel.webview.cspSource);
  const sessions = require('./viewer_sessions');
  if (sessions.has(panel)) sessions.updateSource(panel, state.filename); else sessions.register(panel, state.filename, 'project_manager');
  if (panel.ikemenProjectManagerMessage) panel.ikemenProjectManagerMessage.dispose();
  panel.ikemenProjectManagerMessage = panel.webview.onDidReceiveMessage(async (message) => { try {
    const currentState = panel.ikemenProjectManagerState, registry = currentState.registry;
    if (await handleLaunchMessage(message, currentState.filename, 'project-manager', panel)) return;
    if (message.type === 'refresh') return populate(panel, registryRoot(currentState.filename));
    if (message.type === 'updateKnowledge') return vscode.commands.executeCommand('zss.updates.checkNow');
    if (message.type === 'showUpdateReport') return vscode.commands.executeCommand('zss.updates.showLastReport');
    if (message.type === 'installEngine') {
      const projects = registry.projects.filter((item) => item.id !== 'universal');
      let project = projects[0] || registry.projects[0];
      if (projects.length > 1) {
        const picked = await vscode.window.showQuickPick(projects.map((item) => ({ label: item.name, description: `${item.engineTarget?.version || 'unknown'} · ${item.engineTarget?.channel || 'unassigned'}`, project: item })), { title: 'Choose the game/project profile whose shared engine should be reviewed' });
        if (!picked) return;
        project = picked.project;
      }
      return vscode.commands.executeCommand('ikemen.engineMigration.review', { root: registryRoot(currentState.filename), projectId: project?.id });
    }
    if (message.type === 'registerEngine') return registerInstalledBuild(panel, currentState);
    if (message.type === 'adoptEngine') {
      const project = registry.projects.find((item) => item.id === message.id); if (!project) return;
      const catalog = engineModel.normalizeCatalog(extensionContext.globalState.get(ENGINE_CATALOG_KEY, BUILT_IN_ENGINE_CATALOG));
      const installed = engineModel.normalizeInstalledRegistry(extensionContext.globalState.get(INSTALLED_ENGINE_KEY, {}));
      const candidates = catalog.builds.flatMap((build) => { const locals = installed.builds.filter((item) => item.buildId === build.id); return locals.length ? locals.map((local) => ({ build, local })) : (build.id === engineModel.STABLE_BUILD_ID ? [{ build, local: null }] : []); });
      if (!candidates.length) return vscode.window.showWarningMessage('Register an exact installed engine build before changing a project target.');
      const picked = await vscode.window.showQuickPick(candidates.map((item) => ({ label: `${item.build.version || item.build.id} · ${item.build.channel}`, description: `${item.build.commit.slice(0, 12)}${item.local ? ` · ${item.local.identityStatus} · ${item.local.executableSha256.slice(0, 12)}` : ' · legacy stable path'}`, item })), { title: `Choose a reviewed engine target for ${project.name}` });
      if (!picked) return;
      let review = engineModel.adoptionReview(project, engineModel.targetFromBuild(picked.item.build, picked.item.local), catalog, installed);
      if (review.blockers.length === 1 && /user-asserted/.test(review.blockers[0])) {
        const override = await vscode.window.showWarningMessage('This local executable is not authenticated against trusted upstream artifact evidence. Its exact executable hash will still be pinned. Adopt it only as a user-asserted custom/test artifact.', { modal: true }, 'Adopt User-Asserted Artifact');
        if (override !== 'Adopt User-Asserted Artifact') return;
        review = engineModel.adoptionReview(project, engineModel.targetFromBuild(picked.item.build, picked.item.local), catalog, installed, { allowUserAsserted: true });
      }
      if (review.blockers.length) return vscode.window.showWarningMessage(`Cannot adopt this build: ${review.blockers.join(' ')}`);
      const accepted = await vscode.window.showWarningMessage(`Change ${project.name} from ${review.oldTarget.version} (${review.oldTarget.commit.slice(0, 12)}) to ${review.newTarget.version} (${review.newTarget.commit.slice(0, 12)})?`, { modal: true, detail: 'This records an adoption entry. It does not rewrite authored files or run migrations automatically.' }, 'Adopt Exact Build');
      if (accepted !== 'Adopt Exact Build') return;
      const adopted = engineModel.adoptProject(project, review, { catalogRevision: catalog.catalogRevision, verificationSummary: 'Exact installed executable registered; broader gameplay and rollback testing remains project evidence.' });
      return save(panel, currentState, management.updateGame(registry, project.id, adopted), 'adopt-project-engine-target');
    }
    if (message.type === 'revertEngine') {
      const project = registry.projects.find((item) => item.id === message.id), prior = project?.engineAdoptionHistory?.at(-1)?.previousTarget; if (!project || !prior) return;
      const catalog = engineModel.normalizeCatalog(extensionContext.globalState.get(ENGINE_CATALOG_KEY, BUILT_IN_ENGINE_CATALOG));
      const installed = engineModel.normalizeInstalledRegistry(extensionContext.globalState.get(INSTALLED_ENGINE_KEY, {}));
      let review = engineModel.adoptionReview(project, prior, catalog, installed);
      if (review.blockers.length === 1 && /user-asserted/.test(review.blockers[0])) {
        const override = await vscode.window.showWarningMessage('The previous target used a user-asserted executable. Restore only if you accept its pinned but unauthenticated artifact identity.', { modal: true }, 'Restore User-Asserted Artifact');
        if (override !== 'Restore User-Asserted Artifact') return;
        review = engineModel.adoptionReview(project, prior, catalog, installed, { allowUserAsserted: true });
      }
      if (review.blockers.length) return vscode.window.showWarningMessage(`Cannot restore the previous target: ${review.blockers.join(' ')}`);
      const accepted = await vscode.window.showWarningMessage(`Restore ${project.name} to ${review.newTarget.version} (${review.newTarget.commit.slice(0, 12)})?`, { modal: true, detail: 'This changes only the project target and records the reversal. Authored or migrated files are not automatically reversed.' }, 'Record Target Reversal');
      if (accepted !== 'Record Target Reversal') return;
      const adopted = engineModel.adoptProject(project, review, { catalogRevision: catalog.catalogRevision, migrationRecord: 'Target reversal only; review any authored file migrations separately.', verificationSummary: 'Previous target restored through reviewed adoption history.' });
      return save(panel, currentState, management.updateGame(registry, project.id, adopted), 'revert-project-engine-target');
    }
    if (message.type === 'switchRoot') { const selected = await chooseRoot(registryRoot(currentState.filename)); if (selected) return populate(panel, selected); return; }
    if (message.type === 'openRegistry') return vscode.window.showTextDocument(await vscode.workspace.openTextDocument(vscode.Uri.file(currentState.filename)), { preview: false, viewColumn: vscode.ViewColumn.Beside });
    if (message.type === 'validate') {
      const loaded = projectContext.readRegistry(registryRoot(currentState.filename));
      if (loaded.migrationNeeded) {
        const answer = await vscode.window.showWarningMessage(`Migrate this registry from schema ${loaded.sourceSchema} to ${registryModel.CURRENT_SCHEMA}? A recovery record will be created.`, { modal: true }, 'Migrate Registry');
        if (answer !== 'Migrate Registry') return;
        projectContext.writeRegistry(currentState.filename, loaded.registry, 'migrate-project-registry', currentState.hash);
        await populate(panel, registryRoot(currentState.filename));
        return vscode.window.showInformationMessage(`Project registry migrated to schema ${registryModel.CURRENT_SCHEMA}.`);
      }
      const checked = registryModel.validate(registry);
      await populate(panel, registryRoot(currentState.filename));
      return vscode.window.showInformationMessage(checked.issues.length ? `Registry review found ${checked.issues.length} item(s). Open the Review tab for details.` : 'Project, game, and team assignments are valid.');
    }
    if (message.type === 'addGame') { const input = await promptGame(registry); if (input) return save(panel, currentState, management.addGame(registry, input), 'add-game-profile'); return; }
    if (message.type === 'editGame') { const item = registry.projects.find((entry) => entry.id === message.id), input = item && await promptGame(registry, item); if (input) return save(panel, currentState, management.updateGame(registry, item.id, input), 'edit-game-profile'); return; }
    if (message.type === 'addWork') { const input = await promptWork(registry, null, registryRoot(currentState.filename)); if (!input) return; const game = await chooseOptional(registry.projects, 'Assign one game now (optional)', 'No game / assign later'); if (!game) return; const team = await chooseOptional(registry.teams, 'Assign one team now (optional)', 'No team / assign later'); if (!team) return; return save(panel, currentState, management.addWorkProject(registry, { ...input, gameId: game.id, teamId: team.id }), 'add-work-project'); }
    if (message.type === 'editWork') { const item = registry.workProjects.find((entry) => entry.id === message.id), input = item && await promptWork(registry, item, registryRoot(currentState.filename)); if (input) return save(panel, currentState, management.updateWorkProject(registry, item.id, input), 'edit-work-project'); return; }
    if (message.type === 'assignGame') { const choice = await chooseOptional(registry.projects, 'Assign exactly one game', 'No game / unassign'); if (choice) return save(panel, currentState, management.updateWorkProject(registry, message.id, { gameId: choice.id }), 'assign-work-project-game'); return; }
    if (message.type === 'assignTeam') { const choice = await chooseOptional(registry.teams, 'Assign responsible team', 'No team / unassign'); if (choice) return save(panel, currentState, management.updateWorkProject(registry, message.id, { teamId: choice.id }), 'assign-work-project-team'); return; }
    if (message.type === 'addTeam') { const name = await vscode.window.showInputBox({ title: 'Add team', prompt: 'Team names can be changed later.' }); if (name?.trim()) return save(panel, currentState, management.addTeam(registry, { name }), 'add-team'); return; }
    if (message.type === 'editTeam') { const team = registry.teams.find((entry) => entry.id === message.id); if (!team) return; const name = await vscode.window.showInputBox({ title: 'Rename team', value: team.name }); if (name?.trim()) return save(panel, currentState, management.updateTeam(registry, team.id, { name }), 'rename-team'); return; }
    if (message.type === 'addJob') { const name = await vscode.window.showInputBox({ title: 'Add job class', prompt: 'Examples: Technical Artist, Writer, Producer.' }); if (name?.trim()) return save(panel, currentState, management.addJobClass(registry, message.id, name), 'add-team-job-class'); return; }
    if (message.type === 'addMember') { const team = registry.teams.find((entry) => entry.id === message.id); if (!team) return; const name = await vscode.window.showInputBox({ title: `Add member to ${team.name}`, prompt: 'Public team display name.' }); if (!name?.trim()) return; const handle = await vscode.window.showInputBox({ title: 'Mention handle', value: name.replace(/\s+/g, ''), prompt: 'Used for team assignments and mentions.' }); if (!handle?.trim()) return; const roles = await vscode.window.showQuickPick(team.jobClasses.map((label) => ({ label })), { title: 'Job classes', canPickMany: true }); if (!roles) return; return save(panel, currentState, management.addMember(registry, team.id, { name, handle, jobClasses: roles.map((item) => item.label) }), 'add-team-member'); }
    if (message.type === 'editMember') { const team = registry.teams.find((entry) => entry.id === message.teamId), member = team?.members.find((entry) => entry.id === message.id); if (!member) return; const name = await vscode.window.showInputBox({ title: 'Edit member name', value: member.name }); if (!name?.trim()) return; const handle = await vscode.window.showInputBox({ title: 'Edit mention handle', value: member.handle }); if (!handle?.trim()) return; const roles = await vscode.window.showQuickPick(team.jobClasses.map((label) => ({ label, picked: member.jobClasses.includes(label) })), { title: 'Job classes', canPickMany: true }); if (!roles) return; const active = await vscode.window.showQuickPick([{ label: 'Active member', value: true, picked: member.active }, { label: 'Inactive / retain in history', value: false, picked: !member.active }], { title: 'Membership status' }); if (!active) return; return save(panel, currentState, management.updateMember(registry, team.id, member.id, { name, handle, jobClasses: roles.map((item) => item.label), active: active.value }), 'edit-team-member'); }
  } catch (error) { vscode.window.showErrorMessage(`Project & Team Manager: ${error.message}`); } });
}
async function openProjectManager(uri, defaultView = 'games') {
  let root = uri?.fsPath || projectContext.contextRoot(projectContext.activeUri()) || projectContext.workspaceRoot(projectContext.activeUri());
  if (root && fs.existsSync(root) && fs.statSync(root).isFile()) root = path.basename(root).toLowerCase() === 'project-registry.json' ? registryRoot(root) : path.dirname(root);
  if (!root) root = await chooseRoot('');
  if (!root) return;
  const registryFile = projectContext.readRegistry(root).filename, existing = require('./viewer_sessions').find(registryFile, 'project_manager');
  if (existing) { existing.reveal(preferredViewerColumn(vscode.ViewColumn.Active), false); if (defaultView) existing.webview.postMessage({ type: 'selectManagerView', view: defaultView }); return existing; }
  const panel = trackViewerPanel(vscode.window.createWebviewPanel('ikemenProjectManager', 'Project & Team Manager', preferredViewerColumn(vscode.ViewColumn.Active), { enableScripts: true, retainContextWhenHidden: true }));
  await populate(panel, root, defaultView);
  return panel;
}
function registerProjectManagerWorkspace(context) {
  extensionContext = context;
  context.subscriptions.push(vscode.commands.registerCommand('ikemen.projectManager.open', openProjectManager), vscode.commands.registerCommand('ikemen.engineRegistry.open', (uri) => openProjectManager(uri, 'engines')), vscode.window.registerWebviewPanelSerializer('ikemenProjectManager', { async deserializeWebviewPanel(panel, state) { const root = state?.root || projectContext.contextRoot(projectContext.activeUri()) || projectContext.workspaceRoot(projectContext.activeUri()); if (!root) return panel.dispose(); trackViewerPanel(panel); await populate(panel, root, state?.view || 'games'); } }));
}

module.exports = { snapshot, managerHtml, chooseOptional, openProjectManager, registerProjectManagerWorkspace };
