'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vscode = require('vscode');
const { nearestCharacterDef, chooseCharacterDef } = require('./character_picker');
const { resolveAssigned } = require('./related_work');
const { parseDef, kind: defKind } = require('./def_model');
const trajectory = require('./trajectory_model');
const { createTrajectoryPreview } = require('./trajectory_preview_model');
const { createTrajectoryProposal } = require('./trajectory_proposal_model');
const { createTrajectoryContextAdapter } = require('./trajectory_context_adapters');
const { zssInsertionContext } = require('./code_structure_model');
const { createGeneratedCodeSnapshot, projectGeneratedCodeSnapshot, authorizeGeneratedCodeIntent, INVOKE_TYPE } = require('./generated_code_authority');
const { preferredViewerColumn, trackViewerPanel, revealInViewerGroup } = require('./viewer_group');
const { hash } = require('./mutation_safety');
const { adapt } = require('./universal_toolbar_adapter');
const { SLOTS } = require('./viewer_toolbar_contract');
const { MESSAGE_TYPE, universalToolbarStyle, renderUniversalToolbar, universalToolbarClientScript, createUniversalToolbarDispatcher } = require('./universal_toolbar_webview');

const sessions = new Map();
const INSERT_OPERATIONS = Object.freeze([{ id: 'insert-cursor', artifactIds: ['trajectory-controller'], targetPolicyId: 'active-cursor', mutationOwner: 'trajectory-workspace-host', atomicity: 'single' }]);
const MAX_MESSAGE_BYTES = 64 * 1024;
const fileKey = value => path.resolve(value || '').toLowerCase();
const safe = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
const sha = value => crypto.createHash('sha256').update(String(value)).digest('hex');
function languageFor(filename) { return /\.(?:cns|cmd|st|txt)$/i.test(filename || '') ? 'cns' : 'zss'; }
function languageForDocument(document) { return document?.languageId === 'zss' || /\.zss$/i.test(document?.fileName || '') ? 'zss' : languageFor(document?.fileName); }
function publicContextKind(seed) {
  const filename = seed?.fsPath || vscode.window.activeTextEditor?.document?.fileName || '';
  if (!filename || path.extname(filename).toLowerCase() !== '.def' || !fs.existsSync(filename)) return 'spatial';
  try {
    const classified = defKind(parseDef(fs.readFileSync(filename, 'utf8'), filename));
    if (classified === 'stage') return 'stage';
    if (classified === 'screenpack' || classified === 'lifebar') return 'screenpack';
  } catch (_) {}
  return 'spatial';
}
function assignedSources(defPath) {
  if (!defPath || !fs.existsSync(defPath)) return [];
  const assets = resolveAssigned(defPath), excluded = new Set([assets.commands, assets.constants].filter(Boolean).map(fileKey)), seen = new Set(), result = [];
  for (const filename of assets.code || []) {
    if (!filename || !fs.existsSync(filename) || !/\.(?:zss|cns|st|txt)$/i.test(filename)) continue;
    const resolved = path.resolve(filename), key = fileKey(resolved);
    if (!excluded.has(key) && !seen.has(key)) { seen.add(key); result.push(resolved); }
  }
  return result;
}
function defaultPlan(language = 'zss') {
  return trajectory.normalizeTrajectory({
    name: 'Orbit trajectory', kind: 'circle', durationTicks: 60,
    coordinateSpace: 'world', owner: { kind: 'self', reviewed: true },
    anchor: { kind: 'origin', position: [0, 0], provenance: 'user-authored' },
    centerOffset: [0, 0], startRadius: [40, 40], endRadius: [40, 40],
    phaseDegrees: 0, tiltDegrees: 0, sweepDegrees: 360, direction: 'clockwise',
    facing: 1, easing: 'linear', localCoord: [320, 240], engine: { channel: 'stable', version: '1.0' },
    outputLanguage: language
  });
}
function normalizePlan(input) { return trajectory.normalizeTrajectory(input); }
function normalizeAdapterPlan(input, adapter) {
  const plan = normalizePlan(input);
  if (!adapter.allowedSpaces.includes(plan.coordinateSpace)) throw new Error(`${plan.coordinateSpace} coordinates are not available in the ${adapter.kind} trajectory context.`);
  if (!adapter.allowedOwners.includes(plan.owner.kind)) throw new Error(`${plan.owner.kind} ownership is not available in the ${adapter.kind} trajectory context.`);
  return plan;
}
function initialPlan(adapter) {
  const base = defaultPlan(adapter.target.language);
  if (adapter.kind === 'stage') return normalizeAdapterPlan({ ...base, coordinateSpace: 'stage', owner: { kind: 'stage-point', reviewed: true } }, adapter);
  if (adapter.kind === 'screenpack') return normalizeAdapterPlan({ ...base, coordinateSpace: 'screen', owner: { kind: 'screen', reviewed: true } }, adapter);
  return normalizeAdapterPlan(base, adapter);
}
function cnsInsertionContext(text, line) {
  const lines = String(text || '').split(/\r?\n/), current = lines[line] ?? '';
  if (current.trim()) return { valid: false, label: 'CNS controller boundary', issue: 'Place the cursor on a blank line between complete CNS controllers.' };
  const headers = lines.map((value, index) => ({ index, match: /^\s*\[\s*([^\]]+)\]/.exec(value) })).filter(item => item.match);
  const previous = [...headers].reverse().find(item => item.index < line), stateDef = [...headers].reverse().find(item => item.index < line && /^statedef\b/i.test(item.match[1].trim()));
  const nextCode = lines.slice(line + 1).map((value, offset) => ({ index: line + 1 + offset, code: value.replace(/;.*/, '').trim() })).find(item => item.code);
  if (!previous || !/^state(?:def)?\b/i.test(previous.match[1].trim())) return { valid: false, label: 'Outside a StateDef controller list', issue: 'The active CNS section is not a StateDef or State controller. Choose a blank controller boundary inside the intended StateDef.' };
  if (!stateDef || (previous && /^statedef\b/i.test(previous.match[1].trim()) && nextCode && !/^\[\s*state\b/i.test(nextCode.code))) return { valid: false, label: 'Outside a complete StateDef controller boundary', issue: 'Place the cursor after StateDef properties or a complete controller, before the next controller or at the end of the StateDef.' };
  if (nextCode && !/^\[\s*(?:state|statedef)\b/i.test(nextCode.code)) return { valid: false, label: 'Inside CNS controller parameters', issue: 'The next active line is still part of the current controller. Choose the blank line after its final parameter.' };
  return { valid: true, label: `CNS StateDef ${stateDef.match[1].trim()} at line ${stateDef.index + 1}`, issue: '' };
}
function insertionContext(document, cursor, outputLanguage) {
  const language = languageForDocument(document);
  if (language !== outputLanguage) return { valid: false, label: 'Language mismatch', issue: `The proposal is ${outputLanguage.toUpperCase()} but the exact source is ${language.toUpperCase()}. Choose matching output before rechecking.` };
  return language === 'zss' ? zssInsertionContext(document.getText(), cursor.line) : cnsInsertionContext(document.getText(), cursor.line);
}
function proposalFor(owner) {
  return createTrajectoryProposal(owner.plan, { kind: owner.adapter.kind, language: owner.outputLanguage, capabilityState: owner.adapter.target.capabilityState, mutationAllowed: owner.adapter.mutation.allowed, name: owner.plan.name });
}
function previewFor(owner, options = {}) {
  return createTrajectoryPreview(owner.plan, {
    tick: Math.max(0, Math.min(owner.plan.durationTicks, Number.isSafeInteger(options.tick) ? options.tick : owner.tick || 0)),
    pathSampleCount: options.pathSampleCount ?? owner.pathSampleCount ?? Math.min(owner.plan.durationTicks + 1, 121),
    ghostCount: options.ghostCount ?? owner.ghostCount ?? Math.min(12, owner.plan.durationTicks + 1),
    ghostOpacity: options.ghostOpacity ?? owner.ghostOpacity ?? 0.35,
    projection: options.projection || { viewport: [900, 520], origin: [450, 390], pan: [0, 0], zoom: 1 },
    references: owner.references || {}
  });
}
function trajectoryControlAvailability(state = {}) {
  const pending = Boolean(state.pending), preview = Boolean(state.previewAvailable), tick = Number.isFinite(Number(state.tick)) ? Number(state.tick) : 0, maximum = Math.max(0, Number(state.maximum) || 0), ghosts = Math.max(0, Number(state.ghostCount) || 0);
  const unavailable = reason => Object.freeze({ disabled: true, reason }), available = Object.freeze({ disabled: false, reason: '' });
  const waiting = 'Wait for the current trajectory preview to finish.';
  const previewReason = 'Generate a valid trajectory preview first.';
  const transport = !preview ? unavailable(previewReason) : pending ? unavailable(waiting) : available;
  return Object.freeze({
    previous: !preview ? unavailable(previewReason) : pending ? unavailable(waiting) : tick <= 0 ? unavailable('Already at the first trajectory tick.') : available,
    next: !preview ? unavailable(previewReason) : pending ? unavailable(waiting) : tick >= maximum ? unavailable('Already at the final trajectory tick.') : available,
    play: !preview ? unavailable(previewReason) : available,
    playhead: transport,
    fit: transport,
    ghostTick: !preview ? unavailable(previewReason) : pending ? unavailable(waiting) : ghosts < 1 ? unavailable('No sampled ghost ticks are available. Increase Ghosts first.') : available,
    previewSettings: pending ? unavailable(waiting) : available,
    copy: state.proposalValid && state.hasCode ? available : unavailable('Resolve the reported trajectory issues before copying the proposal.'),
    source: state.sourceReady ? available : unavailable('Recheck an assigned native source cursor before opening it.'),
    recheck: state.canRecheck ? available : unavailable(state.recheckReason || 'Open an assigned character state source before rechecking the cursor.'),
    insert: !state.proposalValid ? unavailable('Resolve the reported trajectory issues before inserting.') : !state.hasAuthority || !state.hasTarget ? unavailable('Recheck an assigned native source cursor before inserting.') : available
  });
}
function makeSnapshot(owner) {
  const proposal = proposalFor(owner);
  if (!proposal.valid || !proposal.artifacts.length) return null;
  return createGeneratedCodeSnapshot({
    surfaceId: 'code.trajectory', generation: owner.generation, contextIdentity: owner.adapter.id,
    contextRevision: owner.contextRevision, valid: proposal.valid,
    issues: proposal.issues.map(entry => ({ level: entry.level === 'error' ? 'error' : entry.level === 'info' ? 'info' : 'warning', message: entry.message })),
    artifacts: proposal.artifacts
  });
}
function project(owner) {
  const proposal = proposalFor(owner), preview = previewFor(owner);
  const recheckAvailable = Boolean(owner.adapter?.mutation?.allowed) && assignedSources(owner.defPath).length > 0;
  return {
    contract: 'ikemaker-trajectory-workspace-v1', adapter: owner.adapter, plan: owner.plan,
    outputLanguage: owner.outputLanguage, generation: owner.generation, preview,
    proposal: { valid: proposal.valid, previewOnly: proposal.previewOnly, issues: proposal.issues, sections: proposal.sections, code: proposal.artifacts[0]?.text || '' },
    source: owner.capture ? { label: path.basename(owner.capture.filename), ready: true } : { label: 'No checked insertion cursor', ready: false },
    recheck: { available: recheckAvailable, reason: recheckAvailable ? '' : owner.adapter?.mutation?.allowed ? 'Open an assigned character state source before rechecking the cursor.' : owner.adapter?.mutation?.reason || 'This trajectory context is preview-only.' },
    authority: owner.snapshot ? projectGeneratedCodeSnapshot(owner.snapshot) : null,
    targetId: owner.capture ? `cursor:${owner.capture.opaqueTarget}` : ''
  };
}
function toolbarModel(owner = {}) {
  const capabilities = Object.fromEntries(SLOTS.map(slot => [slot.id, { enabled: false, reason: `${slot.label} is unavailable for Orbit Assist.` }]));
  const enable = (id, dispatch = `internal:${id}`) => { capabilities[id] = { enabled: true, dispatch }; };
  for (const id of ['new', 'close', 'open', 'project', 'stage', 'viewer-browser', 'actions-search', 'suite-switch', 'help', 'settings', 'code-structure']) enable(id);
  capabilities.save = { enabled: false, reason: 'Orbit Assist retains a draft and inserts reviewed code through the native editor. Save remains editor-owned.' };
  if (owner.capture) enable('text-source');
  return adapt('code.trajectory', capabilities);
}
function invalidate(owner, reason = 'The checked insertion authority changed.', publish = true) {
  owner.generation += 1; owner.capture = null; owner.snapshot = null;
  if (publish && !owner.disposed) void owner.panel.webview.postMessage({ type: 'authorityCleared', reason, model: project(owner), toolbar: toolbarModel(owner) });
}
function captureCurrent(owner) {
  const editor = vscode.window.activeTextEditor;
  const sources = assignedSources(owner.defPath);
  if (!editor || !sources.some(filename => fileKey(filename) === fileKey(editor.document.fileName))) throw new Error('Open an assigned character state source and place the native cursor where the reviewed controller should be inserted.');
  const text = editor.document.getText(), cursor = { line: editor.selection.active.line, character: editor.selection.active.character }, context = insertionContext(editor.document, cursor, owner.outputLanguage);
  if (!context.valid) throw new Error(context.issue);
  const identity = { uri: editor.document.uri.toString(), filename: path.resolve(editor.document.fileName), targetLanguage: languageForDocument(editor.document), insertionLabel: context.label, version: String(editor.document.version), sha256: hash(text), assignmentRevision: sha(JSON.stringify(sources.map(fileKey))), cursor, generation: owner.generation };
  owner.capture = Object.freeze({ ...identity, opaqueTarget: sha(JSON.stringify(identity)) });
  owner.snapshot = makeSnapshot(owner);
  if (!owner.snapshot) throw new Error('The current trajectory proposal is blocked. Resolve its reported issues before checking an insertion cursor.');
  return owner.capture;
}
function currentCapture(owner) {
  const capture = owner.capture;
  if (!capture || capture.generation !== owner.generation) return null;
  const editor = (vscode.window.visibleTextEditors || []).find(value => value.document.uri.toString() === capture.uri);
  if (!editor || editor.document.isClosed || languageForDocument(editor.document) !== capture.targetLanguage || owner.outputLanguage !== capture.targetLanguage || String(editor.document.version) !== capture.version || hash(editor.document.getText()) !== capture.sha256 || editor.selection.active.line !== capture.cursor.line || editor.selection.active.character !== capture.cursor.character) return null;
  const sources = assignedSources(owner.defPath);
  if (sha(JSON.stringify(sources.map(fileKey))) !== capture.assignmentRevision || !sources.some(filename => fileKey(filename) === fileKey(capture.filename))) return null;
  if (!insertionContext(editor.document, capture.cursor, capture.targetLanguage).valid) return null;
  return { capture, editor };
}
async function insert(owner, message) {
  const current = currentCapture(owner);
  if (!current || !owner.snapshot) throw new Error('The checked source or cursor changed. Recheck before inserting.');
  const authorization = authorizeGeneratedCodeIntent({ message, currentSnapshot: owner.snapshot, operations: INSERT_OPERATIONS, activeContext: { identity: owner.adapter.id, revision: owner.contextRevision, targetPolicies: { 'active-cursor': [`cursor:${current.capture.opaqueTarget}`] } } });
  const fresh = currentCapture(owner);
  if (!fresh || fresh.capture.opaqueTarget !== current.capture.opaqueTarget) throw new Error('The source changed immediately before insertion. Nothing was inserted.');
  const artifact = authorization.artifacts[0], prefix = fresh.editor.selection.active.character ? '\n' : '';
  if (artifact.language !== fresh.capture.targetLanguage) throw new Error('The generated artifact language no longer matches the exact source. Nothing was inserted.');
  const applied = await fresh.editor.edit(edit => edit.insert(fresh.editor.selection.active, `${prefix}${artifact.text}\n`));
  if (applied === false) throw new Error('The native editor rejected the edit. Nothing was inserted.');
  invalidate(owner, 'Controller inserted. Recheck before another insertion.');
  vscode.window.showInformationMessage('Orbit Assist proposal inserted as one native unsaved edit. VS Code Undo can remove it.');
}
function exactKeys(message, allowed, required = []) { const keys = Object.keys(message || {}); return keys.every(key => allowed.includes(key)) && required.every(key => Object.prototype.hasOwnProperty.call(message, key)); }
function validMessage(message) {
  if (!message || typeof message !== 'object' || Array.isArray(message) || typeof message.type !== 'string') return false;
  if (message.type === MESSAGE_TYPE) return exactKeys(message, ['type', 'slotId'], ['slotId']) || message.slotId === 'updates' && message.configure === true && exactKeys(message, ['type', 'slotId', 'configure'], ['slotId', 'configure']);
  if (message.type === 'updatePlan') return exactKeys(message, ['type', 'plan', 'outputLanguage'], ['plan', 'outputLanguage']) && message.plan && typeof message.plan === 'object' && ['zss', 'cns'].includes(message.outputLanguage);
  if (message.type === 'preview') return exactKeys(message, ['type', 'tick', 'pathSampleCount', 'ghostCount', 'ghostOpacity', 'projection'], ['tick']) && Number.isSafeInteger(message.tick);
  if (['recheck', 'copyProposal', 'openSource'].includes(message.type)) return exactKeys(message, ['type']);
  if (message.type === INVOKE_TYPE) return exactKeys(message, ['type', 'surfaceId', 'snapshotDigest', 'operationId', 'artifactIds', 'targetIds'], ['surfaceId', 'snapshotDigest', 'operationId', 'artifactIds', 'targetIds']);
  return false;
}
function page(model, toolbar) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
  :root{color-scheme:light dark}*{box-sizing:border-box}body{margin:0;height:100vh;display:flex;flex-direction:column;overflow:hidden;background:var(--vscode-editor-background);color:var(--vscode-foreground);font:12px var(--vscode-font-family)}button,input,select{font:inherit;color:inherit;background:var(--vscode-input-background);border:1px solid var(--vscode-panel-border);padding:5px 7px}button{cursor:pointer;background:var(--vscode-button-secondaryBackground)}main{flex:1;min-height:0;display:grid;grid-template-columns:minmax(270px,330px) minmax(0,1fr) minmax(270px,350px)}aside,.center{padding:10px;overflow:auto}.left{border-right:1px solid var(--vscode-panel-border)}.right{border-left:1px solid var(--vscode-panel-border)}.grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}.grid label{display:flex;flex-direction:column;gap:3px}.card{border:1px solid var(--vscode-panel-border);padding:9px;margin-bottom:9px}.toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:5px}.toolbar input[type=range]{flex:1;min-width:120px}.stage{height:500px;position:relative;border:1px solid var(--vscode-panel-border);background:#132033;margin-top:8px}canvas{width:100%;height:100%;display:block}.muted{color:var(--vscode-descriptionForeground)}.issue{border-left:3px solid var(--vscode-editorWarning-foreground);padding:6px;margin:5px 0}.issue.error{border-color:var(--vscode-errorForeground)}pre{white-space:pre-wrap;word-break:break-word;max-height:45vh;overflow:auto;background:var(--vscode-textCodeBlock-background);padding:8px}@media(max-width:1050px){body{height:auto;overflow:auto}main{display:flex;flex-direction:column}.left,.right{border:0}.stage{height:380px}}</style><style>${universalToolbarStyle()}</style></head><body>${renderUniversalToolbar(toolbar,{surfaceId:'code.trajectory',label:'IKEMaker universal actions'})}<main><aside class="left"><h2>Orbit Assist</h2><p class="muted">One shared deterministic trajectory model. Preview density never changes emitted timing.</p><div class="card grid" id="fields" role="group" aria-label="Trajectory parameters"></div><div class="card grid"><label>Ghosts<input id="ghosts" type="number" min="0" max="512" value="12"></label><label>Opacity<input id="opacity" type="number" min="0" max="1" step="0.05" value="0.35"></label><label>Path samples<input id="samples" type="number" min="2" max="2048" value="121"></label><label>Output<select id="language"><option value="zss">ZSS</option><option value="cns">CNS</option></select></label></div><p id="status" role="status" aria-live="polite"></p></aside><section class="center"><div class="toolbar" role="toolbar" aria-label="Trajectory preview controls"><button id="previous" title="Previous trajectory tick">◀</button><input id="playhead" type="range" min="0" max="60" value="0" aria-label="Trajectory tick"><button id="next" title="Next trajectory tick">▶</button><button id="play">Play</button><button id="fit">Fit</button><label>Ghost tick <select id="ghostTick" aria-label="Choose a sampled ghost tick"></select></label><span id="readout" aria-live="polite"></span></div><div class="stage" role="region" aria-label="Trajectory preview"><canvas id="canvas" tabindex="0" role="img" aria-label="Orbit path preview. Use the trajectory slider or ghost tick list for keyboard navigation."></canvas></div><p class="muted">Select a ghost to jump to its exact simulation tick. Keyboard users can use Ghost tick or the trajectory slider. Wheel zooms; Shift-drag pans. Playback and preview remain read-only.</p></section><aside class="right"><h3>Reviewed proposal</h3><div id="issues" role="status" aria-live="polite" aria-label="Trajectory proposal findings"></div><pre id="code" tabindex="0" aria-label="Generated trajectory controller"></pre><div class="toolbar" role="toolbar" aria-label="Trajectory proposal actions"><button id="copy">Copy proposal</button><button id="source">Open checked source</button><button id="recheck">Recheck native cursor</button><button id="insert" disabled>Insert at cursor</button></div><p class="muted">Insertion is one native unsaved edit with VS Code Undo. Source identity, document version/hash, cursor, context revision, proposal digest, artifact and target are checked again immediately before mutation.</p></aside></main><script>
  const vscode=acquireVsCodeApi(),trajectoryControlAvailability=${trajectoryControlAvailability.toString()};let model=${safe(model)},plan=model.plan,preview=model.preview,tick=preview.playhead.tick,playing=false,timer=null,zoom=1,pan=[0,0],pending=false;const $=id=>document.getElementById(id),num=id=>Number($(id).value),esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));const deg=value=>Number(value)*180/Math.PI;
  function setAvailability(id,state,enabledTitle=''){const control=$(id);if(!control)return;if(!control.dataset.enabledTitle)control.dataset.enabledTitle=enabledTitle||control.title||'';control.disabled=Boolean(state?.disabled);const reason=state?.reason||'';control.title=control.disabled?reason:(enabledTitle||control.dataset.enabledTitle);if(control.disabled&&reason)control.setAttribute('aria-description',reason);else control.removeAttribute('aria-description')}
  function refreshControlAvailability(){const states=trajectoryControlAvailability({pending,previewAvailable:Boolean(preview?.available),tick,maximum:preview?.playhead?.maximum??plan.durationTicks,ghostCount:preview?.ghosts?.length??0,proposalValid:Boolean(model.proposal?.valid),hasCode:Boolean(model.proposal?.code),sourceReady:Boolean(model.source?.ready),canRecheck:Boolean(model.recheck?.available),recheckReason:model.recheck?.reason||'',hasAuthority:Boolean(model.authority),hasTarget:Boolean(model.targetId)});for(const id of ['previous','next','play','playhead','fit','ghostTick','copy','source','recheck','insert'])setAvailability(id,states[id]);for(const id of ['ghosts','opacity','samples'])setAvailability(id,states.previewSettings);return states}
  function field(id,label,value,type='number'){return '<label>'+label+'<input id="'+id+'" type="'+type+'" value="'+esc(value)+'"></label>'}function choice(id,label,value,values){return '<label>'+label+'<select id="'+id+'">'+values.map(item=>'<option '+(item===value?'selected ':'')+'value="'+item+'">'+item+'</option>').join('')+'</select></label>'}
  function fields(){return field('name','Name',plan.name,'text')+choice('kind','Shape',plan.kind,['circle','ellipse','arc','spiral'])+choice('space','Coordinates',plan.coordinateSpace,model.adapter.allowedSpaces)+choice('owner','Owner',plan.owner.kind,model.adapter.allowedOwners)+field('ownerReference','Owner ID / expression',plan.owner.id||plan.owner.expression||'','text')+choice('direction','Direction',plan.direction,['clockwise','counter-clockwise'])+choice('easing','Easing',plan.easing,['linear','ease-in','ease-out','ease-in-out'])+field('centerX','Center X',plan.centerOffset[0])+field('centerY','Center Y',plan.centerOffset[1])+field('radiusX','Start radius X',plan.startRadius[0])+field('radiusY','Start radius Y',plan.startRadius[1])+field('endRadiusX','End radius X',plan.endRadius[0])+field('endRadiusY','End radius Y',plan.endRadius[1])+field('phase','Start phase °',deg(plan.phaseRadians))+field('sweep','Sweep °',deg(plan.sweepRadians))+field('tilt','Tilt °',deg(plan.tiltRadians))+field('duration','Duration ticks',plan.durationTicks)+field('facing','Facing',plan.facing)+field('localW','Local width',plan.localCoord[0])+field('localH','Local height',plan.localCoord[1])}
  function ownerDraft(){const kind=$('owner').value,reference=$('ownerReference').value.trim();return{kind,reviewed:true,...(kind==='helper'?{id:reference}:{}),...(kind==='expression'?{expression:reference}:{})}}function draft(){return{name:$('name').value,kind:$('kind').value,durationTicks:Math.round(num('duration')),coordinateSpace:$('space').value,owner:ownerDraft(),anchor:plan.anchor,centerOffset:[num('centerX'),num('centerY')],startRadius:[num('radiusX'),num('radiusY')],endRadius:[num('endRadiusX'),num('endRadiusY')],phaseDegrees:num('phase'),sweepDegrees:num('sweep'),tiltDegrees:num('tilt'),direction:$('direction').value,facing:num('facing'),easing:$('easing').value,localCoord:[num('localW'),num('localH')],engine:plan.engine}}
  function update(){vscode.postMessage({type:'updatePlan',plan:draft(),outputLanguage:$('language').value})}function requestPreview(){if(pending)return;pending=true;refreshControlAvailability();const canvas=$('canvas'),rect=canvas.getBoundingClientRect();vscode.postMessage({type:'preview',tick,pathSampleCount:Math.round(num('samples')),ghostCount:Math.round(num('ghosts')),ghostOpacity:num('opacity'),projection:{viewport:[Math.max(1,Math.round(rect.width)),Math.max(1,Math.round(rect.height))],origin:[rect.width/2,rect.height*.75],pan,zoom}})}
  function render(){plan=model.plan;preview=model.preview;$('fields').innerHTML=fields();$('language').value=model.outputLanguage;$('playhead').max=plan.durationTicks;$('playhead').value=tick=Math.min(tick,plan.durationTicks);$('issues').innerHTML=(model.proposal.issues||[]).map(item=>'<div class="issue '+(item.level==='error'?'error':'')+'"><b>'+esc(item.level)+'</b> · '+esc(item.message)+'</div>').join('');$('code').textContent=model.proposal.code;$('status').textContent=model.source.ready?'Checked insertion source: '+model.source.label:'Preview is ready. Recheck a native editor cursor before inserting.';document.querySelectorAll('#fields input,#fields select').forEach(control=>{control.onchange=update});$('language').onchange=update;draw();refreshControlAvailability()}
  function line(ctx,points,color,width=1){if(!points.length)return;ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);for(const point of points.slice(1))ctx.lineTo(point[0],point[1]);ctx.stroke()}function draw(){const canvas=$('canvas'),rect=canvas.getBoundingClientRect(),width=Math.max(1,Math.round(rect.width)),height=Math.max(1,Math.round(rect.height));if(canvas.width!==width)canvas.width=width;if(canvas.height!==height)canvas.height=height;const ctx=canvas.getContext('2d');ctx.fillStyle='#132033';ctx.fillRect(0,0,width,height);ctx.strokeStyle='#34475e';for(let i=0;i<=10;i++){ctx.beginPath();ctx.moveTo(i*width/10,0);ctx.lineTo(i*width/10,height);ctx.stroke();ctx.beginPath();ctx.moveTo(0,i*height/10);ctx.lineTo(width,i*height/10);ctx.stroke()}if(!preview?.available){refreshControlAvailability();return}line(ctx,preview.path.map(item=>item.canvas),'#45b8ff',2);for(const ghost of preview.ghosts){ctx.globalAlpha=ghost.opacity;ctx.fillStyle='#c68cff';ctx.beginPath();ctx.arc(ghost.canvas[0],ghost.canvas[1],6,0,Math.PI*2);ctx.fill()}ctx.globalAlpha=1;const current=preview.current;ctx.fillStyle='#ffbd45';ctx.beginPath();ctx.arc(current.canvas[0],current.canvas[1],9,0,Math.PI*2);ctx.fill();line(ctx,[current.canvas,current.velocityEndCanvas],'#ff6b6b',2);ctx.fillStyle='#fff';ctx.fillText('tick '+preview.playhead.tick+' / '+preview.playhead.maximum+' · '+preview.inspector.coordinateSpace,10,18);$('readout').textContent='Tick '+preview.playhead.tick+' · X '+preview.inspector.position[0].toFixed(3)+' · Y '+preview.inspector.position[1].toFixed(3);const ghostTick=$('ghostTick'),value=String(tick);ghostTick.innerHTML=preview.ghosts.map(ghost=>'<option value="'+ghost.tick+'">Tick '+ghost.tick+'</option>').join('');if(preview.ghosts.some(ghost=>String(ghost.tick)===value))ghostTick.value=value;canvas._ghosts=preview.ghosts;refreshControlAvailability()}
  $('previous').onclick=()=>{tick=Math.max(0,tick-1);$('playhead').value=tick;requestPreview()};$('next').onclick=()=>{tick=Math.min(plan.durationTicks,tick+1);$('playhead').value=tick;requestPreview()};$('playhead').oninput=event=>{tick=Number(event.target.value);requestPreview()};$('ghostTick').onchange=event=>{tick=Number(event.target.value);$('playhead').value=tick;requestPreview()};$('play').onclick=()=>{playing=!playing;$('play').textContent=playing?'Pause':'Play';if(timer)clearInterval(timer);if(playing)timer=setInterval(()=>{tick=tick>=plan.durationTicks?0:tick+1;$('playhead').value=tick;requestPreview()},1000/60)};$('fit').onclick=()=>{zoom=1;pan=[0,0];requestPreview()};for(const id of ['ghosts','opacity','samples'])$(id).onchange=requestPreview;$('recheck').onclick=()=>vscode.postMessage({type:'recheck'});$('copy').onclick=()=>vscode.postMessage({type:'copyProposal'});$('source').onclick=()=>vscode.postMessage({type:'openSource'});$('insert').onclick=()=>{if(!model.authority||!model.targetId)return;vscode.postMessage({type:'ikemaker.generated-code.invoke',surfaceId:'code.trajectory',snapshotDigest:model.authority.snapshotDigest,operationId:'insert-cursor',artifactIds:['trajectory-controller'],targetIds:[model.targetId]})};
  const canvas=$('canvas');canvas.onwheel=event=>{event.preventDefault();zoom=Math.max(.2,Math.min(8,zoom*(event.deltaY<0?1.12:.89)));requestPreview()};let drag=null;canvas.onpointerdown=event=>{const rect=canvas.getBoundingClientRect(),point=[event.clientX-rect.left,event.clientY-rect.top],ghost=(canvas._ghosts||[]).map(item=>({item,distance:Math.hypot(item.canvas[0]-point[0],item.canvas[1]-point[1])})).sort((a,b)=>a.distance-b.distance)[0];if(ghost&&ghost.distance<12&&!event.shiftKey){tick=ghost.item.tick;$('playhead').value=tick;requestPreview();return}drag={point,pan:[...pan]};canvas.setPointerCapture(event.pointerId)};canvas.onpointermove=event=>{if(!drag||!event.shiftKey)return;const rect=canvas.getBoundingClientRect();pan=[drag.pan[0]+event.clientX-rect.left-drag.point[0],drag.pan[1]+event.clientY-rect.top-drag.point[1]];requestPreview()};canvas.onpointerup=canvas.onpointercancel=()=>{drag=null};
  window.addEventListener('message',event=>{const message=event.data||{};if(message.type==='model'){model=message.model;pending=false;render()}if(message.type==='preview'){preview=message.preview;pending=false;tick=preview.playhead.tick;$('playhead').value=tick;draw()}if(message.type==='authorityCleared'){model=message.model;pending=false;render()}if(message.type==='trajectoryToolbarState')updateToolbar(message.model)});function updateToolbar(toolbar){for(const slot of toolbar?.slots||[]){const button=document.querySelector('[data-universal-slot="'+slot.id+'"]');if(button){button.disabled=!slot.enabled;button.title=slot.enabled?slot.label:slot.label+' — unavailable: '+slot.reason}}}${universalToolbarClientScript({vscodeVariable:'vscode'})}new ResizeObserver(requestPreview).observe(canvas);render();requestPreview();
  </script></body></html>`;
}
function createToolbar(owner) {
  const execute = command => async () => vscode.commands.executeCommand(command, owner.defPath ? vscode.Uri.file(owner.defPath) : undefined);
  const handlers = { new: execute('ikemen.text.createNew'), close: async () => owner.panel.dispose(), open: execute('workbench.action.files.openFile'), 'text-source': async () => { const current=currentCapture(owner); if(current) return vscode.window.showTextDocument(current.editor.document,{preview:false}); }, project: execute('ikemen.projectManager.open'), stage: execute('ikemen.stage.openWorkspace'), 'viewer-browser': execute('ikemen.authoringBrowser.open'), 'actions-search': execute('ikemen.textActions.open'), 'suite-switch': execute('ikemen.switchToIkeMiner'), help: execute('ikemen.help.open'), settings: execute('ikemen.openExtensionSettings'), 'code-structure': execute('ikemen.codeStructure.openWorkspace') };
  return createUniversalToolbarDispatcher({ handlersBySurface: { 'code.trajectory': handlers }, getToolbar: async () => toolbarModel(owner) });
}
async function openTrajectoryWorkspace(seed, options = {}) {
  let defPath = nearestCharacterDef(seed?.fsPath || vscode.window.activeTextEditor?.document.fileName || '');
  if (!defPath && !['stage','screenpack'].includes(options.kind)) defPath = await chooseCharacterDef(seed, { title: 'Orbit Assist — Choose Character' });
  const kind = ['move','helper','explod','projectile','spatial','stage','screenpack'].includes(options.kind) ? options.kind : 'spatial';
  if (!defPath && !['stage','screenpack'].includes(kind)) return null;
  const id = `${kind}:${fileKey(defPath || seed?.fsPath || 'preview')}`, existing = sessions.get(id);
  if (existing && !existing.disposed) { existing.panel.reveal(undefined,false); return existing.panel; }
  const active = vscode.window.activeTextEditor, sources = assignedSources(defPath), activeAssigned = active && sources.some(filename => fileKey(filename) === fileKey(active.document.fileName));
  const adapter = createTrajectoryContextAdapter({ kind, id, label: `${kind} Orbit Assist`, source: activeAssigned ? { uri: active.document.uri.toString(), revision: hash(active.document.getText()), owner: `character:${fileKey(defPath)}` } : undefined, target: { language: activeAssigned ? languageFor(active.document.fileName) : 'zss', engine: 'ikemen-1.0', capabilityState: 'stable' }, observations: [], mutation: { allowed: kind === 'spatial' && Boolean(defPath), resolverId: 'trajectory.exact-cursor', owner: 'trajectory-workspace-host', reason: kind === 'spatial' ? 'Open an assigned native state source to establish mutation authority.' : `${kind} integration remains preview-only until its specialist viewer supplies an exact owner and source contract.` } });
  const plan = normalizeAdapterPlan(options.plan || initialPlan(adapter), adapter), panel = trackViewerPanel(vscode.window.createWebviewPanel('ikemenTrajectoryAssist', `${path.basename(path.dirname(defPath || seed?.fsPath || 'Preview'))} — Orbit Assist`, preferredViewerColumn(vscode.ViewColumn.Active,vscode.window.activeTextEditor?.viewColumn), {enableScripts:true,retainContextWhenHidden:true}));
  const owner = { panel, defPath, adapter, plan, outputLanguage: adapter.target.language, contextRevision: 1, generation: 1, capture: null, snapshot: null, tick: 0, pathSampleCount: Math.min(plan.durationTicks+1,121), ghostCount: Math.min(12,plan.durationTicks+1), ghostOpacity:.35, disposed:false, queue:Promise.resolve() };
  sessions.set(id,owner);owner.toolbar=createToolbar(owner);panel.webview.html=require('./webview_policy').protect(page(project(owner),toolbarModel(owner)),panel.webview.cspSource);require('./viewer_sessions').register(panel,defPath||seed?.fsPath||id,'trajectory_assist',true);require('./viewer_close').support(panel,{isBusy:()=>false,keepDraft:async()=>true});
  const changed=vscode.workspace.onDidChangeTextDocument(event=>{if(owner.capture?.uri===event.document?.uri?.toString())invalidate(owner,'The checked source changed. Recheck the native cursor.')});const selected=vscode.window.onDidChangeTextEditorSelection(event=>{if(owner.capture?.uri===event.textEditor?.document?.uri?.toString()){const at=event.selections?.[0]?.active;if(!at||at.line!==owner.capture.cursor.line||at.character!==owner.capture.cursor.character)invalidate(owner,'The native cursor moved. Recheck before inserting.')}});panel.onDidDispose(()=>{owner.disposed=true;changed.dispose();selected.dispose();sessions.delete(id)});
  panel.webview.onDidReceiveMessage(message=>{let size=Infinity;try{size=Buffer.byteLength(JSON.stringify(message))}catch(_){}if(size>MAX_MESSAGE_BYTES||!validMessage(message)||owner.disposed)return;owner.queue=owner.queue.then(async()=>{if(message.type===MESSAGE_TYPE){try{return await owner.toolbar.dispatch('code.trajectory',message)}catch(error){return vscode.window.showInformationMessage(error.message)}}if(message.type==='updatePlan'){owner.plan=normalizeAdapterPlan(message.plan,owner.adapter);owner.outputLanguage=message.outputLanguage;invalidate(owner,'The trajectory plan changed. Recheck before inserting.',false);return owner.panel.webview.postMessage({type:'model',model:project(owner)})}if(message.type==='preview'){owner.tick=message.tick;owner.pathSampleCount=message.pathSampleCount;owner.ghostCount=message.ghostCount;owner.ghostOpacity=message.ghostOpacity;const preview=previewFor(owner,message);return owner.panel.webview.postMessage({type:'preview',preview})}if(message.type==='recheck'){captureCurrent(owner);return owner.panel.webview.postMessage({type:'model',model:project(owner)})}if(message.type==='copyProposal'){const proposal=proposalFor(owner);if(proposal.valid&&proposal.artifacts[0])return vscode.env.clipboard.writeText(proposal.artifacts[0].text)}if(message.type==='openSource'){const current=currentCapture(owner);if(!current)throw new Error('The checked source is no longer current. Recheck first.');return vscode.window.showTextDocument(current.editor.document,{preview:false})}if(message.type==='ikemaker.generated-code.invoke')return insert(owner,message)}).catch(error=>{if(!owner.disposed)vscode.window.showWarningMessage(`Orbit Assist stopped the request safely: ${error.message}`)});return owner.queue});
  return panel;
}
function registerTrajectoryWorkspace(context){context.subscriptions.push(vscode.commands.registerCommand('ikemen.trajectory.openAssist',uri=>openTrajectoryWorkspace(uri,{kind:publicContextKind(uri)})));}

module.exports={registerTrajectoryWorkspace,openTrajectoryWorkspace,defaultPlan,normalizePlan,normalizeAdapterPlan,initialPlan,publicContextKind,assignedSources,proposalFor,previewFor,trajectoryControlAvailability,toolbarModel,validMessage,captureCurrent,currentCapture,insert,project,page,languageForDocument,cnsInsertionContext,insertionContext};
