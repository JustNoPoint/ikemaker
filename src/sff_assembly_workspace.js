'use strict';

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { readSff, friendlyVersion, spritePng } = require('./sff_reader');
const { stringifyCsv } = require('./sff');
const { spriteSystemName } = require('./sff_names');
const { buildAssembly, operationLabel } = require('./sff_assembly_model');
const { createBuildPackage } = require('./sff_commands');
const { DEFAULT_PROFILE } = require('./sff_build_profile');
const { preferredViewerColumn, trackViewerPanel } = require('./viewer_group');
const { launchControlsHtml, launchControlsClientScript, handleLaunchMessage } = require('./launch_controls');
const { transactionalWriteSet, transactionalWrite, beginExternalMutation } = require('./mutation_safety');
const { FormDrafts } = require('./form_drafts');

let formDrafts = new FormDrafts();
const sessions = new Map();

function json(value) { return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026'); }
function compact(archive) {
  const groups = new Map();
  for (const sprite of archive.sprites) { if (!groups.has(sprite.group)) groups.set(sprite.group, []); groups.get(sprite.group).push({ index: sprite.index, number: sprite.number, axisX: sprite.axisX, axisY: sprite.axisY, width: sprite.width, height: sprite.height, name: spriteSystemName(sprite.group, sprite.number).systemName || '' }); }
  return { filename: archive.filename, version: friendlyVersion(archive.version), count: archive.sprites.length, groups: [...groups].map(([group, sprites]) => ({ group, sprites })) };
}
async function chooseSff(title) { const picked = await vscode.window.showOpenDialog({ title, canSelectMany: false, filters: { 'SFF archive': ['sff'] } }); return picked?.[0]?.fsPath || ''; }
function fileHash(filename) { return fs.existsSync(filename) ? crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex') : ''; }
function assemblyReference(baseFile, sourceFile) {
  const baseHash = fileHash(baseFile), sourceHash = fileHash(sourceFile);
  return baseHash && sourceHash ? { baseFile: path.resolve(baseFile), sourceFile: path.resolve(sourceFile), baseHash, sourceHash, identity: crypto.createHash('sha256').update(path.resolve(baseFile).toLowerCase()).update('\0').update(baseHash).update('\0').update(path.resolve(sourceFile).toLowerCase()).update('\0').update(sourceHash).digest('hex') } : null;
}
function validReference(reference) { const current = reference?.baseFile && reference?.sourceFile ? assemblyReference(reference.baseFile, reference.sourceFile) : null; return current && current.identity === reference.identity && current.baseHash === reference.baseHash && current.sourceHash === reference.sourceHash ? current : null; }
function safeAssemblyDraft(value, base, source) {
  if (!value || typeof value !== 'object') return null;
  const sourceIndices = new Set(source.sprites.map(sprite => sprite.index)), sourceGroups = new Set(source.sprites.map(sprite => sprite.group)), baseGroups = new Set(base.sprites.map(sprite => sprite.group));
  const operations = Array.isArray(value.operations) ? value.operations.slice(0, 5000).map(item => {
    const indices = Array.isArray(item?.selection?.indices) ? [...new Set(item.selection.indices.filter(Number.isInteger).filter(index => sourceIndices.has(index)).slice(0, 10000))] : [];
    const groups = Array.isArray(item?.selection?.groups) ? [...new Set(item.selection.groups.filter(Number.isInteger).filter(group => sourceGroups.has(group)).slice(0, 1000))] : [];
    const targetGroup = Number.isInteger(item?.targetGroup) && baseGroups.has(item.targetGroup) ? item.targetGroup : undefined;
    if ((!indices.length && !groups.length) || (item.targetGroup !== undefined && targetGroup === undefined)) return null;
    const mode = item.mode === 'replace' ? 'replace' : 'append', selection = indices.length ? { indices } : { groups };
    return { selection, ...(targetGroup === undefined ? {} : { targetGroup }), mode, preserveDestinationAxis: item.preserveDestinationAxis !== false, label: operationLabel({ selection, targetGroup, mode }) };
  }).filter(Boolean) : [];
  return { operations, selected: Array.isArray(value.selected) ? [...new Set(value.selected.filter(Number.isInteger).filter(index => sourceIndices.has(index)).slice(0, 10000))] : [], mode: value.mode === 'replace' ? 'replace' : 'append', preserveDestinationAxis: value.preserveDestinationAxis !== false };
}

function html(model) { return `<!doctype html><html><head><meta charset="utf-8"><style>
:root{color-scheme:light dark}*{box-sizing:border-box}body{margin:0;background:var(--vscode-editor-background);color:var(--vscode-foreground);font:13px var(--vscode-font-family)}header{display:flex;gap:7px;align-items:center;padding:8px 12px;border-bottom:1px solid var(--vscode-panel-border);flex-wrap:wrap}button,select{font:inherit}button{padding:6px 9px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:0;cursor:pointer}main{height:calc(100vh - 48px);display:grid;grid-template-columns:1fr 300px 1fr}.archive{overflow:auto;padding:10px}.plan{border-left:1px solid var(--vscode-panel-border);border-right:1px solid var(--vscode-panel-border);padding:10px;overflow:auto}.group{border:1px solid var(--vscode-panel-border);margin:7px 0;background:var(--vscode-sideBar-background)}.group>summary{padding:8px;cursor:pointer}.sprites{padding:3px}.sprite{display:grid;grid-template-columns:58px 1fr;gap:7px;align-items:center;padding:4px;border:1px solid transparent;cursor:pointer}.sprite.selected{border-color:var(--vscode-focusBorder)}.sprite img,.preview{width:54px;height:54px;object-fit:contain;background:#282828}.drop{outline:2px dashed var(--vscode-focusBorder)}.operation{padding:7px;margin:6px 0;border:1px solid var(--vscode-panel-border)}.muted{color:var(--vscode-descriptionForeground)}label{display:block;margin:8px 0}</style></head><body><header><b>Two-SFF Assembly</b><span class="muted">Drag source groups or selected sprites onto destination groups</span><button id="build">Create reviewed SFF package…</button><button id="discardDraft" hidden>Discard recovered plan</button><span id="draftStatus" role="status" aria-live="polite"></span>${launchControlsHtml('sff_assembly')}</header><main><section class="archive"><h3>Source · ${model.source.count} sprites</h3><p>${model.source.filename}</p><div id="source"></div></section><aside class="plan"><h3>Assembly plan</h3><label>Drop behavior <select id="mode"><option value="append">Add at next free indexes</option><option value="replace">Replace matching indexes</option></select></label><label><input type="checkbox" id="axis" checked> Keep destination axis when replacing</label><button id="original">Add selected using original groups/indexes</button><button id="clear">Clear plan</button><div id="ops"></div><p class="muted">Nothing is written until you create the package. Collisions stop the operation unless Replace is explicitly selected.</p></aside><section class="archive"><h3>Destination / template · ${model.base.count} sprites</h3><p>${model.base.filename}</p><div id="base"></div></section></main><script>
const vscode=acquireVsCodeApi(),model=${json(model)},recovered=model.recoveredDraft;let selected=new Set(recovered?.selected||[]),anchor=-1,operations=recovered?.operations||[],revision=0,storedRevision=0;const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function stage(){if(!model.reference?.identity)return;revision++;vscode.postMessage({type:'assemblyDraft',identity:model.reference.identity,revision,draft:{operations,selected:[...selected],mode:mode.value,preserveDestinationAxis:axis.checked}})}
function groupHtml(g,source){return '<details class="group" data-group="'+g.group+'" '+(g.sprites.length<20?'open':'')+'><summary draggable="'+source+'" data-drag-group="'+g.group+'"><b>Group '+g.group+'</b> · '+g.sprites.length+' sprites</summary><div class="sprites">'+g.sprites.map((s,i)=>'<div class="sprite '+(source&&selected.has(s.index)?'selected':'')+'" '+(source?'draggable="true"':'')+' data-index="'+s.index+'" data-group="'+g.group+'"><img data-thumb="'+(source?'source':'base')+':'+s.index+'"><span><b>'+g.group+','+s.number+'</b><br>'+esc(s.name||'Unmapped')+'<br><small>axis '+s.axisX+','+s.axisY+'</small></span></div>').join('')+'</div></details>'}
function render(){source.innerHTML=model.source.groups.map(g=>groupHtml(g,true)).join('');base.innerHTML=model.base.groups.map(g=>groupHtml(g,false)).join('');ops.innerHTML=operations.map((o,i)=>'<div class="operation">'+esc(o.label)+'<br><button data-remove="'+i+'">Remove</button></div>').join('');wire()}
function wire(){document.querySelectorAll('#source .sprite').forEach((el,pos)=>{el.onclick=e=>{const id=+el.dataset.index;if(e.shiftKey&&anchor>=0){const all=[...document.querySelectorAll('#source .sprite')].map(x=>+x.dataset.index),a=all.indexOf(anchor),b=all.indexOf(id);for(let i=Math.min(a,b);i<=Math.max(a,b);i++)selected.add(all[i])}else if(e.ctrlKey){selected.has(id)?selected.delete(id):selected.add(id)}else{selected=new Set([id])}anchor=id;render();stage()};el.ondragstart=e=>{const ids=selected.has(+el.dataset.index)?[...selected]:[+el.dataset.index];e.dataTransfer.setData('text/plain',JSON.stringify({indices:ids}))}});document.querySelectorAll('[data-drag-group]').forEach(el=>el.ondragstart=e=>e.dataTransfer.setData('text/plain',JSON.stringify({groups:[+el.dataset.dragGroup]})));document.querySelectorAll('#base .group').forEach(el=>{el.ondragover=e=>{e.preventDefault();el.classList.add('drop')};el.ondragleave=()=>el.classList.remove('drop');el.ondrop=e=>{e.preventDefault();el.classList.remove('drop');add(JSON.parse(e.dataTransfer.getData('text/plain')),+el.dataset.group)}});document.querySelectorAll('[data-remove]').forEach(el=>el.onclick=()=>{operations.splice(+el.dataset.remove,1);render();stage()});document.querySelectorAll('img[data-thumb]').forEach(img=>{const request=img.dataset.thumb;img.removeAttribute('data-thumb');vscode.postMessage({type:'thumb',request})})}
function add(selection,targetGroup){const o={selection,targetGroup,mode:mode.value,preserveDestinationAxis:axis.checked};o.label=o.mode+': '+((selection.indices||[]).length?selection.indices.length+' selected sprite(s)':'group '+selection.groups.join(','))+' → group '+targetGroup;operations.push(o);render();stage()}
document.getElementById('original').onclick=()=>{if(!selected.size)return;const o={selection:{indices:[...selected]},mode:mode.value,preserveDestinationAxis:axis.checked};o.label=o.mode+': '+selected.size+' selected sprite(s) → original identities';operations.push(o);render();stage()};document.getElementById('clear').onclick=()=>{operations=[];render();stage()};mode.value=recovered?.mode||'append';axis.checked=recovered?.preserveDestinationAxis!==false;mode.onchange=axis.onchange=stage;document.getElementById('discardDraft').hidden=!recovered;document.getElementById('draftStatus').textContent=recovered?'Recovered the plan for these exact SFF files.':'';document.getElementById('discardDraft').onclick=()=>vscode.postMessage({type:'discardAssemblyDraft',identity:model.reference?.identity});document.getElementById('build').onclick=()=>vscode.postMessage({type:'build',operations});addEventListener('message',e=>{const m=e.data||{};if(m.type==='thumb')document.querySelectorAll('img').forEach(img=>{if(img.dataset.loaded===m.request)return;const parent=img.closest('.sprite');if(parent&&m.request.endsWith(':'+parent.dataset.index)&&((m.request.startsWith('source:')&&parent.closest('#source'))||(m.request.startsWith('base:')&&parent.closest('#base')))){img.src=m.uri;img.dataset.loaded=m.request}});if(m.type==='assemblyDraftStored')storedRevision=Math.max(storedRevision,m.revision||0);if(m.type==='assemblyDraftDiscarded'){operations=[];selected.clear();document.getElementById('discardDraft').hidden=true;document.getElementById('draftStatus').textContent='';render()}if(m.type==='ikemenPresetCapture')vscode.postMessage({type:'ikemenPresetState',id:m.id,reference:model.reference})});render();globalThis.ikemenNavigationSelection=()=>model.reference;globalThis.ikemenCanRestoreNavigation=ref=>!!ref&&ref.identity===model.reference?.identity;globalThis.ikemenRestoreNavigation=()=>true;globalThis.ikemenIsBusy=()=>storedRevision<revision;globalThis.ikemenHasUnappliedEdits=()=>operations.length>0;globalThis.ikemenCanKeepDraft=()=>!!model.reference&&storedRevision>=revision;${launchControlsClientScript()}</script></body></html>`; }

async function createAssemblyPackage(base, source, operations) {
  const plan = buildAssembly(base, source, operations); if (!plan.changes.length) return vscode.window.showWarningMessage('The assembly plan contains no changes.');
  if (plan.conflicts.length) return vscode.window.showErrorMessage(`Assembly stopped: ${plan.conflicts.length} identity collision(s). Choose Replace or Add at next free indexes. First: ${plan.conflicts[0].identity}`);
  const picked = await vscode.window.showOpenDialog({ title: 'Choose a folder for the assembled SFF package', canSelectFiles: false, canSelectFolders: true, canSelectMany: false }); if (!picked?.[0]) return;
  const root = path.join(picked[0].fsPath, `sff-assembly-${Date.now()}`), sprites = path.join(root, 'sprites');
  const rows = [], writes = [];
  for (const item of plan.rows) {
    const archive = item.archive === 'base' ? base : source, sprite = archive.sprites[item.sourceIndex], filename = `g${String(item.group).padStart(5,'0')}_i${String(item.number).padStart(5,'0')}.png`, absolute = path.join(sprites, filename), data = spritePng(archive, sprite); writes.push([absolute, data]);
    rows.push({ OriginalRelativePath: path.join('sprites', filename), SourceArchive: archive.filename, SourceIdentity: `${sprite.group},${sprite.number}`, SuggestedName: spriteSystemName(item.group, item.number).systemName || '', BaseGroup: item.group, ComputedGroup: item.group, ImageIndex: item.number, AxisX: item.axisX, AxisY: item.axisY, SourceSHA256: crypto.createHash('sha256').update(data).digest('hex').toUpperCase(), ReviewStatus: 'APPROVED', ReviewReason: item.archive === 'base' ? 'Preserved destination sprite.' : 'Explicitly staged through two-SFF assembly.' });
  }
  const manifest = path.join(root, 'assembly-manifest.csv'); writes.push([manifest, stringifyCsv(rows)], [path.join(root, 'assembly-plan.json'), `${JSON.stringify({ version: 1, scope: 'SFF_ONLY', airPolicy: 'PRESERVE_DESTINATION_UNCHANGED', base: base.filename, source: source.filename, operations, changes: plan.changes }, null, 2)}\n`]); transactionalWriteSet(fs, writes, { label: 'two-sff-assembly-package', allowExisting: false, backup: false, journal: false });
  const outputName = `${path.parse(base.filename).name}-assembled.sff`, outputSff = path.join(root, outputName), outputDirectory = path.join(root, 'build'), build = await createBuildPackage({ sourceRoot: root, manifestPath: manifest, outputDirectory, outputSff, paletteSourceSff: base.filename, buildProfile: { ...DEFAULT_PROFILE, profileName: 'Two-SFF reviewed assembly' } });
  const action = await vscode.window.showInformationMessage(`Assembly package ready: ${plan.changes.length} change(s), ${plan.rows.length} total sprites.`, 'Build assembled SFF', 'Open manifest', 'Open build.cmd'); if (action === 'Build assembled SFF') await runSprMaker(build, outputDirectory, outputSff, root); if (action === 'Open manifest') vscode.window.showTextDocument(vscode.Uri.file(manifest)); if (action === 'Open build.cmd') vscode.window.showTextDocument(vscode.Uri.file(build.batchPath));
}

async function runSprMaker(build, outputDirectory, outputSff, root) {
  if (!fs.existsSync(build.sprmake)) return vscode.window.showErrorMessage(`SprMaker2 was not found: ${build.sprmake}`);
  const guard = beginExternalMutation(fs, outputSff, { label: 'two-sff-assembly', journalRoot: root, backup: false });
  const result = spawnSync(build.sprmake, [build.definitionPath], { cwd: outputDirectory, windowsHide: true, encoding: 'utf8' });
  transactionalWrite(fs, path.join(outputDirectory, 'sprmake2.log'), `${result.stdout || ''}${result.stderr || ''}`, { label: 'two-sff-assembly-log', journalRoot: root, backup: false });
  if (result.error || result.status !== 0 || !fs.existsSync(outputSff)) { guard.rollback(); throw result.error || new Error(`SprMaker2 failed with exit code ${result.status}. Review sprmake2.log.`); }
  guard.complete(); await vscode.window.showInformationMessage(`Assembled SFF created: ${outputSff}`);
}

async function openSffAssembly(uri, options = {}) {
  let reference = options?.preset ? validReference(options.reference) : null;
  if (options?.preset && !reference) return;
  let baseFile = reference?.baseFile || (/\.sff$/i.test(uri?.fsPath || '') && fs.existsSync(uri.fsPath) ? uri.fsPath : await chooseSff('Choose the destination or template SFF'));
  if (!baseFile) return;
  let sourceFile = reference?.sourceFile || await chooseSff('Choose the source SFF'); if (!sourceFile) return;
  reference ||= assemblyReference(baseFile, sourceFile); if (!reference) return;
  if (sessions.has(reference.identity)) { const existing = sessions.get(reference.identity); if (!validReference(reference)) return; existing.panel.reveal(undefined, false); return existing.panel; }
  const base = readSff(baseFile), source = readSff(sourceFile), recoveredDraft = safeAssemblyDraft(formDrafts.read(`sff-assembly:${reference.identity}`), base, source), model = { base: compact(base), source: compact(source), reference, recoveredDraft }, seed = baseFile;
  const owner = { panel: null, base, source, reference, busy: 0, disposed: false };
  const panel = owner.panel = trackViewerPanel(vscode.window.createWebviewPanel('ikemenSffAssembly', `SFF Assembly · ${path.basename(baseFile)}`, preferredViewerColumn(vscode.ViewColumn.Active), { enableScripts: true, retainContextWhenHidden: true }));
  sessions.set(reference.identity, owner); panel.webview.html = require('./webview_policy').protect(html(model), panel.webview.cspSource);
  require('./viewer_sessions').register(panel, baseFile, 'sff_assembly', true);
  require('./viewer_close').support(panel, { isBusy: () => owner.busy > 0, keepDraft: () => formDrafts.flush() });
  panel.webview.onDidReceiveMessage(message => {
    owner.busy++;
    Promise.resolve().then(async () => {
      if (owner.disposed) return;
      if (await handleLaunchMessage(message, seed, 'sff', panel)) return;
      if (message.type === 'thumb') { const [side, raw] = String(message.request).split(':'), archive = side === 'source' ? source : base, sprite = archive.sprites[Number(raw)]; if (sprite) panel.webview.postMessage({ type: 'thumb', request: message.request, uri: `data:image/png;base64,${spritePng(archive, sprite).toString('base64')}` }); return; }
      if (message.type === 'assemblyDraft') {
        if (message.identity !== reference.identity || !validReference(reference)) throw new Error('The assembly sources changed. Reopen them before continuing this plan.');
        const draft = safeAssemblyDraft(message.draft, base, source); if (!draft) throw new Error('The assembly draft is invalid.');
        await formDrafts.stage(`sff-assembly:${reference.identity}`, draft);
        if (!owner.disposed) panel.webview.postMessage({ type: 'assemblyDraftStored', revision: message.revision }); return;
      }
      if (message.type === 'discardAssemblyDraft') { if (message.identity === reference.identity) await formDrafts.discard(`sff-assembly:${reference.identity}`); if (!owner.disposed) panel.webview.postMessage({ type: 'assemblyDraftDiscarded' }); return; }
      if (message.type === 'build') { if (!validReference(reference)) throw new Error('One of the SFF sources changed. Reopen and review the plan before building.'); await createAssemblyPackage(base, source, safeAssemblyDraft({ operations: message.operations }, base, source).operations); }
    }).catch(error => vscode.window.showErrorMessage(`SFF assembly failed: ${error.message}`)).finally(() => owner.busy--);
  });
  panel.onDidDispose(() => { owner.disposed = true; if (sessions.get(reference.identity) === owner) sessions.delete(reference.identity); });
  return panel;
}
function registerSffAssembly(context) { formDrafts = new FormDrafts(context.workspaceState, 'ikemaker.sffAssemblyDrafts.v1'); context.subscriptions.push(vscode.commands.registerCommand('sff.openAssembly', (uri, options) => openSffAssembly(uri, options))); }

module.exports = { registerSffAssembly, openSffAssembly, createAssemblyPackage, compact, html, assemblyReference, validReference, safeAssemblyDraft };
