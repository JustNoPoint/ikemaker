'use strict';

const crypto = require('crypto');
const path = require('path');
const { normalizeInteraction } = require('./palette_workshop_interaction_model');
const { normalizeCandidate } = require('./palette_workshop_candidate_model');
const { normalizePreviewSets } = require('./palette_workshop_preview_sets');
const { normalizeOperation: normalizeSelectiveTransfer } = require('./palette_workshop_selective_transfer');
const { normalize: normalizeExternalConflict } = require('./palette_workshop_external_conflict');
const placementDraft = require('./palette_template_placement_draft');

function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
function freeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; for (const item of Object.values(value)) freeze(item); return Object.freeze(value); }
function integer(value) { const number = Number(value); return Number.isInteger(number) && number >= 0 ? number : null; }
function paletteSelection(value = {}) { return { physicalIndex: integer(value.physicalIndex), group: integer(value.group), number: integer(value.number) }; }
function spriteSelection(value = {}) { return { physicalIndex: integer(value.physicalIndex), group: integer(value.group), number: integer(value.number) }; }
function facts(value = {}) { return { preview: String(value.preview || 'none'), staged: String(value.staged || 'none'), embedded: String(value.embedded || 'saved'), activeTarget: String(value.activeTarget || 'reviewed'), builtOutput: String(value.builtOutput || 'none'), adoption: String(value.adoption || 'none') }; }
const BUILD_ATTEMPT_STATUSES = new Set(['idle','choosing','reviewed','running','interrupted','cancelled','failed','busy','validated-test-candidate','validated-not-adopted','adopted','adopted-cleanup-required']);
function buildAttempt(value = {}, restore = false) {
  let status = BUILD_ATTEMPT_STATUSES.has(String(value.status || '')) ? String(value.status) : 'idle';
  if (restore && ['choosing','reviewed','running'].includes(status)) status = 'interrupted';
  const target = value.target && typeof value.target === 'object' ? { filename: String(value.target.filename || ''), byteHash: String(value.target.byteHash || ''), byteLength: Math.max(0, Number(value.target.byteLength) || 0) } : null;
  return { status, backend: ['sprmake2-adopt','builtin-test'].includes(value.backend) ? value.backend : '', message: String(value.message || (status === 'interrupted' ? 'The prior build did not finish. The reviewed plan is retained and can be retried.' : '')), candidatePath: String(value.candidatePath || ''), receiptPath: String(value.receiptPath || value.executionReceiptPath || ''), adopted: Boolean(value.adopted), planRetained: value.planRetained !== false, target, startedAt: String(value.startedAt || ''), finishedAt: String(value.finishedAt || '') };
}
const MAX_LIBRARY_TRAY = 2000;
function libraryTray(value = []) {
  const result = [], seen = new Set();
  for (const raw of Array.isArray(value) ? value : []) {
    if (result.length >= MAX_LIBRARY_TRAY) break;
    const supplied = typeof raw === 'string' ? raw : raw?.filename, filename = String(supplied || '').slice(0, 4096);
    if (!filename || !/\.(?:act|png)$/i.test(filename)) continue;
    const resolved = path.resolve(filename), key = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
    if (seen.has(key)) continue;
    seen.add(key);
    const id = `palette-source-${crypto.createHash('sha256').update(Buffer.from(key)).digest('hex').slice(0, 24)}`;
    result.push({ id, filename: resolved, addedAt: String(typeof raw === 'object' ? raw.addedAt || '' : '').slice(0, 64) });
  }
  return result;
}
function domainState(value = {}) { return { registryRevision: Number.isInteger(Number(value.registryRevision)) ? Number(value.registryRevision) : 0, registryByteHash: String(value.registryByteHash || ''), readOnly: Boolean(value.readOnly), error: String(value.error || ''), selectedDomainIds: [...new Set((value.selectedDomainIds || []).map(String))], selectedRemapPalGroupIds: [...new Set((value.selectedRemapPalGroupIds || []).map(String))], matrixPage: Math.max(0, Number(value.matrixPage) || 0), matrixMode: ['image', 'swatches', 'both'].includes(value.matrixMode) ? value.matrixMode : 'both' }; }
function migrationState(value = {}) { return { operationId: String(value.operationId || ''), headByteHash: String(value.headByteHash || ''), revision: Math.max(0, Number(value.revision) || 0), selectedSourceIndexes: [...new Set((value.selectedSourceIndexes || []).map(Number).filter(Number.isInteger))], status: String(value.status || 'none'), handoffFile: String(value.handoffFile || ''), handoffHash: String(value.handoffHash || ''), error: String(value.error || '') }; }
function reductionState(value = {}) { return { operationId: String(value.operationId || ''), headByteHash: String(value.headByteHash || ''), revision: Math.max(0, Number(value.revision) || 0), activeImageId: String(value.activeImageId || ''), status: String(value.status || 'none'), error: String(value.error || ''), stale: Boolean(value.stale), outputReceiptFile: String(value.outputReceiptFile || ''), outputReceiptHash: String(value.outputReceiptHash || '') }; }
function bulkState(value = {}) { return { operationId: String(value.operationId || ''), headByteHash: String(value.headByteHash || ''), revision: Math.max(0, Number(value.revision) || 0), galleryRoot: String(value.galleryRoot || ''), status: String(value.status || 'none'), error: String(value.error || ''), receiptFile: String(value.receiptFile || ''), receiptHash: String(value.receiptHash || '') }; }
function slotCompactionState(value = {}, restore = false) { const prior=String(value.status||'none'),status=restore&&['reviewed','built','verified'].includes(prior)?'interrupted':prior;return { status, request: clone(value.request || null), review: clone(value.review || null), actionToken:restore?'':String(value.actionToken||''), plan: null, reviewInput: null, manifest: restore?null:clone(value.manifest || null), verification: restore?null:clone(value.verification || null), receiptFile: String(value.receiptFile || ''), error: restore&&status==='interrupted'?'Preview exact mapping again after reopening Palette Workshop.':String(value.error || '') }; }
function familyState(value = {}) { const config=value.config||{},output=value.output||{},template=value.template||{},reverse=value.reverseSync||{};return { status: String(value.status || 'none'), error: String(value.error || ''), config: { scope: ['source','destination','both'].includes(config.scope)?config.scope:'both', namedMappingIds: [...new Set((config.namedMappingIds||[]).map(String))], explicitRangeMappings: clone(config.explicitRangeMappings||[]), aliasDecisions: clone(config.aliasDecisions||{}), defaults: clone(config.defaults||{}) }, assignment: clone(value.assignment||null), summary: clone(value.summary||null), template:{authority:clone(template.authority||null),indexAuthority:clone(template.indexAuthority||null),purpose:String(template.purpose||''),priorPrimaryRecordId:String(template.priorPrimaryRecordId||''),intentionallyUnlistedIndexes:[...new Set((template.intentionallyUnlistedIndexes||[]).map(Number).filter(index=>Number.isInteger(index)&&index>0&&index<256))].sort((a,b)=>a-b),plan:clone(template.plan||null),decisions:clone(template.decisions||[]),placementDraft:template.placementDraft?placementDraft.normalize(template.placementDraft):null,palettePhysicalIndex:Number.isInteger(Number(template.palettePhysicalIndex))?Number(template.palettePhysicalIndex):null,syncReview:clone(template.syncReview||null),conflictReview:clone(template.conflictReview||null),error:String(template.error||'')},reverseSync:{status:String(reverse.status||'none'),plan:clone(reverse.plan||null),reviewInput:clone(reverse.reviewInput||null),manifest:clone(reverse.manifest||null),verification:clone(reverse.verification||null),receiptFile:String(reverse.receiptFile||''),promptProjectUpdates:reverse.promptProjectUpdates!==false,error:String(reverse.error||'')}, output:{status:String(output.status||'none'),manifest:clone(output.manifest||null),verification:clone(output.verification||null),receiptFile:String(output.receiptFile||''),receipt:clone(output.receipt||null),error:String(output.error||'')} }; }

function createPaletteWorkspaceSession(input = {}) {
  const sourceContext = input.contextKind === 'source' || input.contextKind === 'collective-source';
  const collectiveContext = input.contextKind === 'collective-source';
  if (!sourceContext && (!input.target?.filename || !input.target?.byteHash)) throw new Error('Palette Workspace session requires an exact existing-SFF target authority.');
  const inputSources = collectiveContext ? input.sources : input.source ? [input.source] : [];
  if (sourceContext && (!Array.isArray(inputSources) || !inputSources.length || inputSources.some(source => !source?.filename || !source?.byteHash))) throw new Error('Palette Workspace source session requires exact file evidence.');
  const restored = input.restored && typeof input.restored === 'object' ? clone(input.restored) : {};
  const sameTarget = sourceContext ? Array.isArray(restored.sources) && restored.sources.length === inputSources.length && restored.sources.every((source,index) => source.filename === inputSources[index].filename && source.byteHash === inputSources[index].byteHash) : restored.target?.filename === input.target.filename && restored.target?.byteHash === input.target.byteHash;
  const retainedPreview = restored.preview?.dirty ? restored.preview : null;
  const retainedDraft = Boolean(retainedPreview || restored.candidate?.baseline || restored.selectiveTransfer || (restored.organizer?.semanticEntries || []).length || restored.organizer?.construction || restored.migration?.operationId || restored.family?.assignment || restored.family?.template?.placementDraft || restored.family?.template?.authority || restored.family?.output?.manifest || restored.reduction?.operationId || restored.bulk?.operationId || (restored.interaction?.checkpoints || []).length);
  return freeze({
    schema: 'ikemaker.palette-workspace-session', version: 2, sessionId: String(input.sessionId), revision: Number(restored.revision) || 0,
    context: { kind: collectiveContext ? 'collective-source' : sourceContext ? 'source' : 'existing-sff', mode: String(input.mode || restored.context?.mode || 'workspace'), origin: clone(input.origin || (restored.context?.needsPaletteHandoff ? { surface: 'palette-workspace' } : restored.context?.origin) || null), returnContext: clone(input.returnContext || (restored.context?.needsPaletteHandoff ? null : restored.context?.returnContext) || null), needsPaletteHandoff: null, section: String(input.section || restored.context?.section || (sourceContext ? 'sources-preflight' : 'live-edit')) },
    target: sourceContext ? null : clone(retainedPreview && restored.target ? restored.target : input.target), plan: sourceContext ? null : clone(retainedPreview && restored.plan ? restored.plan : input.plan), sources: sourceContext ? clone(retainedDraft && restored.sources?.length ? restored.sources : inputSources) : clone(restored.sources || []),
    selection: { sprite: spriteSelection(restored.selection?.sprite), palette: paletteSelection(restored.selection?.palette) },
    preview: retainedPreview ? { ...clone(retainedPreview), stale: !sameTarget || Boolean(retainedPreview.stale) } : { dirty: false, stale: false, colors: null, source: null, actOrder: null, label: '' },
    organizer: clone(restored.organizer || { semanticEntries: [], construction: null, importSummary: null, durable: true }), collective: clone(restored.collective || { generation: 0, inventoryHash: '', colorIds: [], reviewedImageIds: [], selectedImageIds: [], currentImageId: '', activeColorId: '', contactReviewed: false, reviewedInventoryHash: '', dispositions: {}, audit: { added: [], missing: [], clean: true }, copyHistory: [], regionExclusionReview: null, regionContinuationWarning: null, regionContinuationHistory: [], excludedRegions: [], organizerReady: false }),
    facts: facts(restored.facts), buildAttempt: buildAttempt(restored.buildAttempt, true), libraryTray: libraryTray(restored.libraryTray), interaction: normalizeInteraction(restored.interaction), candidate: normalizeCandidate(restored.candidate), previewSets: normalizePreviewSets(restored.previewSets), selectiveTransfer: normalizeSelectiveTransfer(restored.selectiveTransfer), externalConflict: normalizeExternalConflict(restored.externalConflict), domains: domainState(restored.domains), migration: migrationState(restored.migration), family: familyState(restored.family), slotCompaction: slotCompactionState(restored.slotCompaction,true), reduction: reductionState(restored.reduction), bulk: bulkState(restored.bulk), stale: !sameTarget && Boolean(sourceContext ? restored.sources?.[0] : restored.target), staleReasons: !sameTarget && (sourceContext ? restored.sources?.[0] : restored.target) ? [sourceContext ? 'source' : 'target'] : [], applyAllowed: sameTarget || !(sourceContext ? restored.sources?.[0] : restored.target) || !retainedDraft,
    surfaces: []
  });
}

function revisePaletteWorkspaceSession(session, expectedRevision, patch = {}) {
  if (Number(expectedRevision) !== session.revision) throw new Error(`Palette Workspace session revision changed (expected ${expectedRevision}, current ${session.revision}).`);
  const next = clone(session); next.revision += 1;
  if (patch.selection) next.selection = {
    sprite: Object.prototype.hasOwnProperty.call(patch.selection, 'sprite') ? spriteSelection(patch.selection.sprite || {}) : next.selection.sprite,
    palette: Object.prototype.hasOwnProperty.call(patch.selection, 'palette') ? paletteSelection(patch.selection.palette || {}) : next.selection.palette
  };
  if (patch.preview) next.preview = { ...next.preview, ...clone(patch.preview) };
  if (patch.target) next.target = clone(patch.target);
  if (patch.plan) next.plan = clone(patch.plan);
  if (patch.sources) next.sources = clone(patch.sources);
  if (patch.facts) next.facts = facts({ ...next.facts, ...patch.facts });
  if (patch.buildAttempt) next.buildAttempt = buildAttempt({ ...next.buildAttempt, ...clone(patch.buildAttempt) });
  if (Object.prototype.hasOwnProperty.call(patch, 'libraryTray')) next.libraryTray = libraryTray(patch.libraryTray);
  if (patch.context) next.context = { ...next.context, ...clone(patch.context) };
  if (patch.organizer) next.organizer = { ...next.organizer, ...clone(patch.organizer) };
  if (patch.collective) next.collective = { ...next.collective, ...clone(patch.collective) };
  if (patch.interaction) next.interaction = normalizeInteraction({ ...next.interaction, ...clone(patch.interaction) });
  if (patch.candidate) next.candidate = normalizeCandidate({ ...next.candidate, ...clone(patch.candidate) });
  if (patch.previewSets) next.previewSets = normalizePreviewSets({ ...next.previewSets, ...clone(patch.previewSets) });
  if (Object.prototype.hasOwnProperty.call(patch, 'selectiveTransfer')) next.selectiveTransfer = normalizeSelectiveTransfer(patch.selectiveTransfer);
  if (Object.prototype.hasOwnProperty.call(patch, 'externalConflict')) next.externalConflict = normalizeExternalConflict(patch.externalConflict);
  if (patch.domains) next.domains = domainState({ ...next.domains, ...clone(patch.domains) });
  if (patch.migration) next.migration = migrationState({ ...next.migration, ...clone(patch.migration) });
  if (patch.family) next.family = familyState({ ...next.family, ...clone(patch.family) });
  if (patch.slotCompaction) next.slotCompaction = slotCompactionState({ ...next.slotCompaction, ...clone(patch.slotCompaction) });
  if (patch.reduction) next.reduction = reductionState({ ...next.reduction, ...clone(patch.reduction) });
  if (patch.bulk) next.bulk = bulkState({ ...next.bulk, ...clone(patch.bulk) });
  if (patch.stale !== undefined) next.stale = Boolean(patch.stale);
  if (patch.staleReasons) next.staleReasons = [...new Set(patch.staleReasons.map(String))];
  next.applyAllowed = patch.applyAllowed === undefined ? !next.stale : Boolean(patch.applyAllowed);
  if (!next.preview.dirty) next.preview = { dirty: false, stale: false, colors: null, source: null, actOrder: null, label: '' };
  return freeze(next);
}

module.exports = { createPaletteWorkspaceSession, revisePaletteWorkspaceSession, buildAttempt, libraryTray, slotCompactionState, MAX_LIBRARY_TRAY };
