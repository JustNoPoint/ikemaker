'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { palettePlanLocation, readPalettePlan } = require('./palette_plan');
const { createPaletteWorkspaceSession, revisePaletteWorkspaceSession } = require('./palette_workspace_session');

const STORAGE_KEY = 'ikemaker.paletteWorkspaceSessions.v1';
function sha(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function key(filename) { const value = path.resolve(filename); return process.platform === 'win32' ? value.toLowerCase() : value; }
function sourceKey(filename) { return `source:${key(filename)}`; }
function fileEvidence(filename, required = false) { const resolved = path.resolve(filename), exists = fs.existsSync(resolved),stat=exists?fs.statSync(resolved):null; if (required && (!exists || !stat.isFile())) throw new Error(`Palette Workspace source is missing: ${resolved}`); const bytes = exists ? fs.readFileSync(resolved) : Buffer.alloc(0); return { filename: resolved, exists, byteHash: sha(bytes), byteLength: bytes.length, modifiedTimeMs:stat?.mtimeMs||0 }; }
function fastEvidence(prior) { const resolved=path.resolve(prior.filename),exists=fs.existsSync(resolved),stat=exists?fs.statSync(resolved):null;if(!exists||!stat.isFile())return{filename:resolved,exists:false,byteHash:'',byteLength:0,modifiedTimeMs:0};if(Number(prior.byteLength)===stat.size&&Number(prior.modifiedTimeMs)>0&&Math.abs(Number(prior.modifiedTimeMs)-stat.mtimeMs)<=1)return{...prior,filename:resolved,exists:true,byteLength:stat.size,modifiedTimeMs:stat.mtimeMs};return fileEvidence(resolved,false) }
function targetEvidence(filename) { return fileEvidence(filename, true); }
function planEvidence(filename) { return fileEvidence(palettePlanLocation(filename), false); }
function sameEvidence(left, right) { return Boolean(left && right) && key(left.filename) === key(right.filename) && Boolean(left.exists) === Boolean(right.exists) && String(left.byteHash || '') === String(right.byteHash || '') && Number(left.byteLength) === Number(right.byteLength); }
function buildGateError(code, message) { const error = new Error(message); error.code = code; return error; }
function persisted(session) { const copy = JSON.parse(JSON.stringify(session)); delete copy.surfaces; return copy; }

class PaletteWorkspaceService {
  constructor(storage = null) { this.storage = storage; this.sessions = new Map(); this.listeners = new Map(); this.saved = storage?.get?.(STORAGE_KEY, {}) || {}; }
  id(filename) { return `palette-sff-${sha(Buffer.from(key(filename))).slice(0, 24)}`; }
  sourceId(filename) { return `palette-source-${sha(Buffer.from(key(filename))).slice(0, 24)}`; }
  open(filename, options = {}) {
    const target = targetEvidence(filename), sessionKey = key(filename), current = this.sessions.get(sessionKey);
    if (current) return current;
    const restored = this.saved[sessionKey] || null;
    const session = createPaletteWorkspaceSession({ sessionId: this.id(filename), target, plan: planEvidence(filename), restored, mode: options.mode, origin: options.origin, returnContext: options.returnContext });
    this.sessions.set(sessionKey, session); this.persist(sessionKey, session); return restored ? this.refresh(filename) : session;
  }
  snapshot(filename) { return this.sessions.get(key(filename)) || this.open(filename); }
  openSource(filename, options = {}) {
    const source = fileEvidence(filename, true), sessionKey = sourceKey(filename), current = this.sessions.get(sessionKey); if (current) return current;
    const restored = this.saved[sessionKey] || null, collective = restored?.context?.kind === 'collective-source', restoredSources = collective ? (restored.sources || []).map(item => fastEvidence(item)).filter(item => item.exists) : null, session = createPaletteWorkspaceSession({ sessionId: this.sourceId(filename), contextKind: collective ? 'collective-source' : 'source', source, sources: collective && restoredSources.length ? restoredSources : [source], restored, mode: 'workspace', origin: options.origin, returnContext: options.returnContext, section: options.section });
    this.sessions.set(sessionKey, session); this.persist(sessionKey, session); return restored ? this.refreshSource(filename) : session;
  }
  sourceSnapshot(filename) { return this.sessions.get(sourceKey(filename)) || this.openSource(filename); }
  promoteCollective(filename, sources, collective = {}) {
    const sessionKey = sourceKey(filename), current = this.sourceSnapshot(filename), evidence = sources.map(source => typeof source === 'string' ? fileEvidence(source, true) : source);
    return this.updateSource(filename, current.revision, { context: { kind: 'collective-source', section: 'sources-preflight' }, sources: evidence, collective, stale: false, staleReasons: [], applyAllowed: false });
  }
  promoteCollectiveQuiet(filename, sources, collective = {}) { const sessionKey=sourceKey(filename),current=this.sourceSnapshot(filename),evidence=sources.map(source=>typeof source==='string'?fileEvidence(source,true):source),next=revisePaletteWorkspaceSession(current,current.revision,{context:{kind:'collective-source',section:current.context.section},sources:evidence,collective,stale:false,staleReasons:[],applyAllowed:true});this.sessions.set(sessionKey,next);this.persist(sessionKey,next);return next; }
  persist(sessionKey, session) { this.saved[sessionKey] = persisted(session); const pending = this.storage?.update?.(STORAGE_KEY, this.saved); if (pending?.catch) pending.catch(() => {}); }
  notify(sessionKey, session) { for (const listener of this.listeners.get(sessionKey)?.values() || []) listener(session); }
  update(filename, expectedRevision, patch) { const sessionKey = key(filename), current = this.snapshot(filename), next = revisePaletteWorkspaceSession(current, expectedRevision, patch); this.sessions.set(sessionKey, next); this.persist(sessionKey, next); this.notify(sessionKey, next); return next; }
  mutate(filename, patch) { const current = this.snapshot(filename); return this.update(filename, current.revision, patch); }
  setReturnContext(filename, returnContext, origin) { const current = this.snapshot(filename); return this.update(filename, current.revision, { context: { returnContext: cloneEvidence(returnContext), origin: cloneEvidence(origin || current.context.origin) } }); }
  attach(filename, surfaceId, listener) { const sessionKey = key(filename), session = this.snapshot(filename); if (!this.listeners.has(sessionKey)) this.listeners.set(sessionKey, new Map()); this.listeners.get(sessionKey).set(String(surfaceId), listener); listener(session); return () => this.listeners.get(sessionKey)?.delete(String(surfaceId)); }
  attachSource(filename, surfaceId, listener) { const sessionKey = sourceKey(filename), session = this.sourceSnapshot(filename); if (!this.listeners.has(sessionKey)) this.listeners.set(sessionKey, new Map()); this.listeners.get(sessionKey).set(String(surfaceId), listener); listener(session); return () => this.listeners.get(sessionKey)?.delete(String(surfaceId)); }
  updateSource(filename, expectedRevision, patch) { const sessionKey = sourceKey(filename), current = this.sourceSnapshot(filename), next = revisePaletteWorkspaceSession(current, expectedRevision, patch); this.sessions.set(sessionKey, next); this.persist(sessionKey, next); this.notify(sessionKey, next); return next; }
  mutateSource(filename, patch) { const current = this.sourceSnapshot(filename); return this.updateSource(filename, current.revision, patch); }
  mutateSourceQuiet(filename, patch) { const sessionKey=sourceKey(filename),current=this.sourceSnapshot(filename),next=revisePaletteWorkspaceSession(current,current.revision,patch);this.sessions.set(sessionKey,next);this.persist(sessionKey,next);return next; }
  mutateSourceTransient(filename, patch) { const sessionKey=sourceKey(filename),current=this.sourceSnapshot(filename),next=revisePaletteWorkspaceSession(current,current.revision,patch);this.sessions.set(sessionKey,next);return next; }
  resetSource(filename, options = {}) { const sessionKey=sourceKey(filename),current=this.sourceSnapshot(filename),source=fileEvidence(filename,true),next=createPaletteWorkspaceSession({sessionId:current.sessionId,contextKind:'source',source,sources:[source],mode:'workspace',origin:options.origin||current.context?.origin,returnContext:options.returnContext||current.context?.returnContext,section:options.section||'sources-preflight'});this.sessions.set(sessionKey,next);this.persist(sessionKey,next);this.notify(sessionKey,next);return next; }
  rebindSourceContext(filename, options = {}) {
    const current = this.sourceSnapshot(filename), context = {};
    if (Object.prototype.hasOwnProperty.call(options, 'section')) context.section = String(options.section || current.context.section);
    if (Object.prototype.hasOwnProperty.call(options, 'origin')) context.origin = cloneEvidence(options.origin);
    if (Object.prototype.hasOwnProperty.call(options, 'returnContext')) context.returnContext = cloneEvidence(options.returnContext);
    return Object.keys(context).length ? this.updateSource(filename, current.revision, { context }) : current;
  }
  refreshSource(filename,options={}) { const current = this.sourceSnapshot(filename), observed = current.sources.map(source => options.exact===true?fileEvidence(source.filename, false):fastEvidence(source)), changed = observed.length !== current.sources.length || observed.some((source,index) => !source.exists || source.byteHash !== current.sources[index].byteHash || source.byteLength !== current.sources[index].byteLength), retainedDraft = current.preview.dirty || (current.organizer?.semanticEntries || []).length > 0 || current.context.kind === 'collective-source'; const stale = changed && retainedDraft; return this.updateSource(filename, current.revision, { sources: stale ? current.sources : observed, stale, staleReasons: stale ? ['source'] : [], applyAllowed: !stale, preview: stale ? { stale: true } : {} }); }
  assertSourceApplicable(filename) { const session = this.refreshSource(filename,{exact:true}); if (!session.applyAllowed) throw new Error('Palette Workspace source draft is stale (source changed). Review it again before export or Apply.'); return session; }
  assertSourceApplicableQuiet(filename) { const current=this.sourceSnapshot(filename);if(!current.applyAllowed)throw new Error('Palette Workspace source draft is stale (source changed). Review it again before export or Apply.');const observed=current.sources.map(fastEvidence),changed=observed.length!==current.sources.length||observed.some((source,index)=>!source.exists||source.byteHash!==current.sources[index].byteHash||source.byteLength!==current.sources[index].byteLength);if(!changed)return current;const retainedDraft=current.preview.dirty||(current.organizer?.semanticEntries||[]).length>0||current.context.kind==='collective-source',next=this.updateSource(filename,current.revision,{sources:retainedDraft?current.sources:observed,stale:retainedDraft,staleReasons:retainedDraft?['source']:[],applyAllowed:!retainedDraft,preview:retainedDraft?{stale:true}:{}});if(!next.applyAllowed)throw new Error('Palette Workspace source draft is stale (source changed). Review it again before export or Apply.');return next; }
  select(filename, value = {}) { return this.mutate(filename, { selection: value }); }
  preview(filename, value = {}) {
    const current = this.snapshot(filename), source = value.source?.filename ? fileEvidence(value.source.filename, true) : value.source || current.preview.source || null;
    return this.mutate(filename, { target: value.rebase ? targetEvidence(filename) : current.target, plan: value.rebase ? planEvidence(filename) : current.plan, sources: source ? [source] : current.sources, preview: { ...current.preview, dirty: true, stale: value.rebase ? false : current.stale, colors: value.colors || null, source, sourceBaseline: value.sourceBaseline || current.preview.sourceBaseline || null, actOrder: value.actOrder || current.preview.actOrder || null, label: String(value.label || current.preview.label || '') }, facts: { preview: 'draft' }, stale: value.rebase ? false : current.stale, staleReasons: value.rebase ? [] : current.staleReasons, applyAllowed: value.rebase ? true : current.applyAllowed });
  }
  discardPreview(filename) { return this.mutate(filename, { preview: { dirty: false }, facts: { preview: 'none' } }); }
  refreshFacts(filename, extraFacts = {}) { return this.mutate(filename, { plan: planEvidence(filename), facts: extraFacts }); }
  beginBuildAttempt(filename) {
    const current = this.snapshot(filename), status = current.buildAttempt?.status, pending = ['choosing','reviewed','running'].includes(status);
    if (pending) throw buildGateError('PALETTE_BUILD_BUSY', 'A Palette Workshop build choice or build is already in progress for this SFF.');
    if (status === 'adopted-cleanup-required') throw buildGateError('PALETTE_BUILD_RECOVERY_REQUIRED', 'The active SFF changed during the prior build, but its completion cleanup needs recovery. Use the retained receipt; do not rebuild this plan.');
    const observedTarget = targetEvidence(filename), observedPlan = planEvidence(filename);
    if (!observedPlan.exists) throw buildGateError('PALETTE_BUILD_EMPTY', 'No reviewed palette plan is staged. Choose and stage palettes before building.');
    if (!sameEvidence(current.target, observedTarget)) throw buildGateError('PALETTE_BUILD_TARGET_DRIFT', 'The active SFF changed after this palette plan was reviewed. Reopen the Palette Workshop and review or restage the plan.');
    if (!sameEvidence(current.plan, observedPlan)) throw buildGateError('PALETTE_BUILD_PLAN_DRIFT', 'The staged palette plan changed after it was displayed. Reopen the Palette Workshop and review the refreshed plan.');
    const plan = readPalettePlan(filename), changeCount = (plan.palettes || []).length + (plan.deletions || []).length;
    if (!changeCount) throw buildGateError('PALETTE_BUILD_EMPTY', 'No reviewed palette additions or deletions are staged. Choose and stage palettes before building.');
    if (String(plan.sourceSffSHA256 || '').toLowerCase() !== observedTarget.byteHash.toLowerCase()) throw buildGateError('PALETTE_BUILD_TARGET_DRIFT', 'The active SFF no longer matches the SFF used to review this palette plan. Review and restage the plan before building.');
    return this.mutate(filename, { buildAttempt: { status: 'choosing', backend: '', message: 'Choosing a writer…', candidatePath: '', receiptPath: '', adopted: false, planRetained: true, target: observedTarget, startedAt: new Date().toISOString(), finishedAt: '' } });
  }
  updateBuildAttempt(filename, patch = {}) {
    const current = this.snapshot(filename);
    return this.update(filename, current.revision, { buildAttempt: { ...current.buildAttempt, ...patch } });
  }
  recordBuildResult(filename, result = {}) {
    const status = ['cancelled','failed','busy','validated-test-candidate','validated-not-adopted','adopted','adopted-cleanup-required'].includes(result.status) ? result.status : 'failed', adopted = status === 'adopted', cleanup = status === 'adopted-cleanup-required';
    const facts = adopted ? { staged: 'none', embedded: 'saved', builtOutput: 'verified', adoption: 'active-target' } : status === 'validated-test-candidate' ? { builtOutput: 'validated-candidate', adoption: 'not-adopted' } : cleanup ? { staged: 'cleanup-required', embedded: 'saved', builtOutput: 'verified', adoption: 'active-target' } : { adoption: 'not-adopted' };
    const refreshed = this.refresh(filename, { facts, acceptTarget: adopted || cleanup, acceptPlan: adopted });
    const defaults = { cancelled: 'Cancelled. The active SFF is unchanged and the reviewed plan is retained.', failed: 'Build failed. The active SFF is unchanged and the reviewed plan is retained.', busy: 'Another build is already running for this SFF. The active SFF is unchanged and the reviewed plan is retained.', 'validated-test-candidate': 'The test candidate was validated. The active SFF is unchanged and the reviewed plan is retained.', 'validated-not-adopted': 'Validation finished without adoption. The active SFF is unchanged and the reviewed plan is retained.', adopted: 'The verified candidate was applied and the completed staged plan was cleared.', 'adopted-cleanup-required': 'The active SFF changed, but plan cleanup needs recovery. The reviewed plan and receipt were retained.' };
    const detail = String(result.message || '').trim(), message = detail && detail !== defaults[status] ? `${defaults[status]} ${detail}` : defaults[status];
    return this.update(filename, refreshed.revision, { buildAttempt: { status, backend: result.backend || refreshed.buildAttempt?.backend || '', message, candidatePath: String(result.candidatePath || ''), receiptPath: String(result.receiptPath || result.executionReceiptPath || ''), adopted: Boolean(result.adopted || adopted || cleanup), planRetained: result.planRetained === undefined ? !adopted : result.planRetained !== false, target: targetEvidence(filename), startedAt: refreshed.buildAttempt?.startedAt || new Date().toISOString(), finishedAt: new Date().toISOString() } });
  }
  refresh(filename, options = {}) {
    const current = this.snapshot(filename), observedTarget = targetEvidence(filename), observedPlan = planEvidence(filename), reasons = [];
    if (current.target.byteHash !== observedTarget.byteHash || current.target.byteLength !== observedTarget.byteLength) reasons.push('target');
    if (current.plan?.byteHash !== observedPlan.byteHash || current.plan?.exists !== observedPlan.exists) reasons.push('plan');
    for (const source of current.sources || []) { const observed = fileEvidence(source.filename, false); if (observed.exists !== source.exists || observed.byteHash !== source.byteHash) reasons.push('source'); }
    const stale = reasons.length > 0 && current.preview.dirty;
    return this.update(filename, current.revision, { target: options.acceptTarget || !current.preview.dirty ? observedTarget : current.target, plan: options.acceptPlan ? observedPlan : current.plan, facts: options.facts, stale, staleReasons: reasons, applyAllowed: !stale, preview: stale ? { stale: true } : {} });
  }
  assertApplicable(filename) { const session = this.refresh(filename); if (!session.applyAllowed) throw new Error(`Palette Workspace draft is stale (${session.staleReasons.join(', ')} changed). Preview/review it again before Apply.`); return session; }
}

function cloneEvidence(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }

let shared = new PaletteWorkspaceService(), configured = false, configuredStorage;
function configurePaletteWorkspaceService(storage) { if(configured&&configuredStorage===storage)return shared;shared = new PaletteWorkspaceService(storage);configured=true;configuredStorage=storage;return shared; }
function paletteWorkspaceService() { return shared; }

module.exports = { PaletteWorkspaceService, configurePaletteWorkspaceService, paletteWorkspaceService, fileEvidence, targetEvidence, planEvidence, sameEvidence };
