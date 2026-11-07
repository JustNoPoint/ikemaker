'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const vscode = require('vscode');
const { FormDrafts } = require('./form_drafts');
const pendingChanges = require('./pending_changes');
const { planSpriteIntake } = require('./sff_creator_model');
const { creatorOperationSummary, creatorCandidateImpactLines } = require('./sff_creator_operation_summary');
const { createBuildPackage, executeGeneratedBuild, executeComparedSprMake2Build, compareGeneratedBuild, validateExistingSprMake2Output } = require('./sff_commands');
const { parseSffBuffer, readSff, paletteRgba, spritePng } = require('./sff_reader');
const { DEFAULT_PROFILE } = require('./sff_build_profile');
const { parseCsv, stringifyCsv } = require('./sff');
const { transactionalWrite, transactionalWriteSet } = require('./mutation_safety');
const { preferredViewerColumn, trackViewerPanel } = require('./viewer_group');
const { inspectPsd, planPsdExports, exportPsdPlan, collectTimelineSequence, safeLabel } = require('./sff_psd_intake');
const { createArchiveIndex, createManifestIndex, layerOneMapping, resolvePsdBaseMapping, scanPsdFolder } = require('./sff_psd_reconstruction');
const { extractGifSequence } = require('./sff_gif_intake');
const { safePrefix, naturalCompare, orderedSources, planPreparedSources, inspectPreparedPng, prepareSourceBuffers } = require('./sff_source_preparation');
const { encodeIndexed, remapPngToPalette } = require('./sff_palette_remap');
const { remapReconstructionPage } = require('./sff_psd_reconstruction_palette');
const { pngPaletteRgba } = require('./palette_library');
const { planFrameSequenceExport, executeFrameSequenceExport } = require('./frame_sequence_export');
const { sha256: sheetSha256, analyzeIndexedGutters, analyzeIndexedComponents, gridProposal, extractIndexedGrid } = require('./sff_sheet_intake');
const { reviewSpriteSheet, resumeSpriteSheet } = require('./sff_sheet_workspace');
const { listStoredSessions } = require('./sff_sheet_session_store');
const { inspectIndexedCrop, cropIndexedPng8 } = require('./sff_crop_source');
const { captureTarget } = require('./sff_build_safety');
const { readIndexedPng8 } = require('./sff_png8_source');
const { decodePng } = require('./palette_index_organizer_model');
const { proposeCreatorAxes } = require('./sff_creator_auto_axis');
const { canonicalize } = require('./sff_build_specification');
const { archiveTemporaryPaletteCleanupReview } = require('./sff_placeholder_lifecycle');
const { INDEX_ORDER, REVERSED_ORDER, normalizeOrder, readAct, colorsForOrder, orderLabel } = require('./act_palette_order');
const { createMasterSnapshot, masterLocation, writeMasterSnapshot, readMasterSnapshot, paletteFingerprint } = require('./palette_master');
const { createCreatorTestBuild, prepareCreatorTestBuild } = require('./sff_creator_test_build');
const { createCreatorDualV21TestBuild } = require('./sff_creator_dual_test_build');
const { PaletteReplacementRuleStore } = require('./palette_replacement_rule_store');
const unmatchedColors = require('./sff_unmatched_color_workflow');
const { ReplacementRuleReviewAuthority, normalizeBinding: normalizeReplacementRuleBinding, verifyAcceptance, revalidateAcceptance, applyAcceptanceToDecisions, verifyWorkshopReturn, revalidateWorkshopReturn, applyWorkshopReturnToDecisions } = require('./sff_creator_replacement_rule_review');
const { PaletteAdaptationReviewAuthority, verifyAcceptance: verifyPaletteAdaptationAcceptance, revalidateAcceptance: revalidatePaletteAdaptationAcceptance, applyAcceptanceToDecisions: applyPaletteAdaptationAcceptanceToDecisions } = require('./sff_creator_palette_adaptation_review');
const { launchControlsHtml, launchControlsClientScript, handleLaunchMessage } = require('./launch_controls');
const { adapt } = require('./universal_toolbar_adapter');
const { SLOTS } = require('./viewer_toolbar_contract');
const writerPreference = require('./sff_writer_preference');
const needsPaletteHandoff = require('./sff_needs_palette_handoff');
const { prepareDesktopDropAsync, inspectImageDimensions, SURFACES: DROP_SURFACES } = require('./desktop_drop_host_evidence');
const { planLogicalGroupAssignment, applyLogicalGroupAssignment } = require('./sff_logical_group_assignment');
const { scanAirSpriteReferences } = require('./air_sprite_reference_scan');
const { ROUTES: BUILT_IN_LIFECYCLE_ROUTES, createCreatorBuiltInLifecycleCoordinator, draftRevision: lifecycleDraftRevision } = require('./sff_creator_builtin_lifecycle');
const { DETACH_CONFIRMATION, createProductionCreatorWorkspaceContinuationHost } = require('./sff_creator_workspace_continuation');
const { installCreatorBuiltInLifecycleRuntime } = require('./sff_creator_builtin_lifecycle_runtime');
const { action: productionLifecycleAction, createCreatorProductionWorkspaceCoordinator } = require('./sff_creator_production_workspace_coordinator');
const { createVscodeTargetReviewUi } = require('./sff_creator_production_review_ui');
const { createVscodeAdoptionReviewUi } = require('./sff_creator_adoption_review_ui');
const { createVscodeLayoutReviewUi } = require('./sff_creator_layout_review_ui');
const { createVscodeExecutionStartUi } = require('./sff_creator_execution_start_ui');
const { createVscodeHistoryReviewUi } = require('./sff_creator_history_review_ui');
const { pickCreatorCertificationEvidence } = require('./sff_creator_certification_evidence_intake');
const { probeCreatorReplacementCapability } = require('./sff_creator_replacement_capability_probe');

const COMMAND = 'sff.openCreator';
const OWNER = 'sff.creator';
const DRAFT_STORE = 'ikemaker.sffCreatorDrafts.v1';
const WRITER_RUN_BINDINGS = 'ikemaker.sffWriterRunBindings.v1';
const MAX_SOURCES = 5000;
const MAX_REPLACEMENT_RULE_TARGET_BYTES = 512 * 1024 * 1024;
let drafts = new FormDrafts();
let writerRunState = { get: () => ({}), update: async () => {} };
let lifecycleContinuations = null;
let productionLifecycle = null;
let productionLifecycleStarter = null;
const sessions = new Map();
const replacementRuleSessions = new Map();
const targetCache = new Map();
const CREATOR_SURFACE = 'sff.creator';

const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const json = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
const workspaceRoot = () => vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || process.cwd();
const workspaceKey = () => path.resolve(workspaceRoot());
const draftKey = root => `sff-creator:${process.platform === 'win32' ? root.toLowerCase() : root}`;
const runBindingKey = root => process.platform === 'win32' ? path.resolve(root).toLowerCase() : path.resolve(root);
const readRunBinding = root => writerRunState.get(WRITER_RUN_BINDINGS, {})?.[runBindingKey(root)] || null;
async function writeRunBinding(root, binding) { const all = { ...(writerRunState.get(WRITER_RUN_BINDINGS, {}) || {}) }; if (binding) all[runBindingKey(root)] = binding; else delete all[runBindingKey(root)]; await writerRunState.update(WRITER_RUN_BINDINGS, all); }
const sameResolvedPath = (left, right) => Boolean(left && right) && (process.platform === 'win32' ? path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase() : path.resolve(left) === path.resolve(right));
function writerRunBindingMatches(expected, actual) {
  if (!expected || !actual) return false;
  const pathKeys = new Set(['gameRoot','reportPath','builtInPath','sprMake2Path','targetPath','ownerDefPath']);
  return ['version','workspace','gameRoot','reportPath','reportHash','builtInPath','builtInHash','builtInSize','sprMake2Path','sprMake2Hash','sprMake2Size','targetPath','targetHash','ownerDefPath','ownerDefHash','ownerSpriteAssignment'].every(key => pathKeys.has(key) ? sameResolvedPath(expected[key], actual[key]) : expected[key] === actual[key]);
}
function creatorToolbarModel(draft = {}) {
  const available = new Set(['new','close','open','recovery','run','versus','training','restart','project','stage','sprites','animations','commands','states','sounds','palettes','code-structure','viewer-browser','actions-search','suite-switch','help','settings']);
  if (draft.target?.path) available.add('text-source');
  const capabilities = Object.fromEntries(SLOTS.map(slot => [slot.id, available.has(slot.id) ? { enabled: true, dispatch: `internal:${slot.id}` } : { enabled: false, reason: slot.id === 'save' ? 'Creator drafts are retained automatically; SFF writes remain in the specialist actions below.' : 'This action is not valid for the SFF Creator.' }]));
  return adapt(CREATOR_SURFACE, capabilities, { migrationReason: 'SFF Creator universal navigation and escape path with specialist writer controls kept in the body.' });
}
const resource = root => vscode.Uri.file(root).toString();
function readStableBoundedFile(filename, maximumBytes, label) {
  const absolute = path.resolve(filename), before = fs.statSync(absolute);
  if (!before.isFile() || !Number.isSafeInteger(before.size) || before.size < 0 || before.size > maximumBytes) throw new Error(`${label} must be a regular file no larger than ${maximumBytes} bytes.`);
  const bytes = fs.readFileSync(absolute), after = fs.statSync(absolute);
  if (!after.isFile() || bytes.length !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs) throw new Error(`${label} changed while it was being reviewed. Try again after the file is stable.`);
  return bytes;
}

function readWriterComparisonReport(filename) {
  const absolute = path.resolve(filename);
  const stat = fs.lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Writer comparison must be a direct local JSON file.');
  let report, reportBytes;
  try { reportBytes = readStableBoundedFile(absolute, 8 * 1024 * 1024, 'writer comparison'); report = JSON.parse(reportBytes.toString('utf8')); }
  catch (error) { throw new Error(`Could not read writer comparison: ${error.message}`); }
  if (!report || report.schema !== 'ikemaker.sff-backend-comparison' || report.version !== 1) throw new Error('This is not an IKEMaker writer-comparison version 1 report.');
  if (typeof report.semanticEquivalent !== 'boolean' || typeof report.byteEquivalent !== 'boolean' || typeof report.independentlyValidated !== 'boolean') throw new Error('Writer comparison is missing its validated result flags.');
  if ((report.status === 'equivalent') !== report.semanticEquivalent) throw new Error('Writer comparison status conflicts with its semantic result.');
  const adoptionKeys = ['attempted','builtInCandidateAdopted','sprMake2CandidateAdopted','supportedByThisWorkflow'];
  if (!report.adoption || adoptionKeys.some(key => report.adoption[key] !== false)) throw new Error('Writer comparison is not a closed no-adoption test report.');
  const text = (value, maximum = 500) => String(value || '').slice(0, maximum);
  const candidate = (value, fallback) => ({ label: fallback, backendId: text(value?.backendId || value?.backend || fallback, 120), byteLength: Number.isSafeInteger(Number(value?.byteLength)) ? Number(value.byteLength) : null, byteHash: /^[a-f0-9]{64}$/i.test(String(value?.byteHash || value?.hash || '')) ? String(value.byteHash || value.hash).toLowerCase() : '' });
  const builtIn = candidate(report.candidates?.builtIn || report.builtInCandidate, 'IKEMaker');
  const sprMake2 = candidate(report.candidates?.sprMake2 || report.sprMake2Candidate, 'SprMake2');
  for (const [label, raw, normalized] of [['IKEMaker', report.candidates?.builtIn, builtIn], ['SprMake2', report.candidates?.sprMake2, sprMake2]]) if (!raw || raw.adoptionAllowed !== false || !normalized.byteHash || !Number.isSafeInteger(normalized.byteLength) || normalized.byteLength < 0) throw new Error(`${label} candidate evidence is incomplete or open to adoption.`);
  const semantic = report.semantic || {};
  const count = (side, key) => Array.isArray(side?.[key]) ? side[key].length : Number.isSafeInteger(Number(side?.[`${key}Count`])) ? Number(side[`${key}Count`]) : null;
  const sibling = suffix => path.join(path.dirname(absolute), `${path.basename(absolute, '-writer-comparison.json')}${suffix}`);
  const candidateState = (candidatePath, candidateInfo) => {
    try {
      const candidateStat = fs.lstatSync(candidatePath);
      if (!candidateStat.isFile() || candidateStat.isSymbolicLink() || candidateStat.size !== candidateInfo.byteLength) return false;
      return candidateInfo.byteHash ? crypto.createHash('sha256').update(readStableBoundedFile(candidatePath, 1024 * 1024 * 1024, path.basename(candidatePath))).digest('hex') === candidateInfo.byteHash : true;
    } catch { return false; }
  };
  const builtInPath = sibling('-IKEMaker-test.sff'), sprMake2Path = sibling('-SprMake2-test.sff');
  return { path: absolute, reportHash: crypto.createHash('sha256').update(reportBytes).digest('hex'), folder: path.dirname(absolute), status: text(report.status || (report.semanticEquivalent ? 'equivalent' : 'different'), 80), purpose: text(report.purpose, 800), semanticEquivalent: report.semanticEquivalent, byteEquivalent: report.byteEquivalent, independentlyValidated: report.independentlyValidated, validationProfile: text(report.validationProfile, 300), specificationHash: text(report.specificationArtifactByteHash || report.specificationHash, 128), firstDifference: text(report.firstDifference == null ? '' : typeof report.firstDifference === 'string' ? report.firstDifference : JSON.stringify(report.firstDifference), 2000), builtIn: { ...builtIn, sprites: count(semantic.builtIn, 'sprites'), palettes: count(semantic.builtIn, 'palettes') }, sprMake2: { ...sprMake2, sprites: count(semantic.sprMake2, 'sprites'), palettes: count(semantic.sprMake2, 'palettes') }, logTail: text(Array.isArray(report.boundedLogTail) ? report.boundedLogTail.slice(-80).map(String).join('\n') : report.boundedLogTail, 12000), builtInPath, sprMake2Path, builtInAvailable: candidateState(builtInPath, builtIn), sprMake2Available: candidateState(sprMake2Path, sprMake2) };
}

async function openPaletteWorkshopAfterFreshCheck(postReviewState, verifyFresh, openWorkshop) {
  await postReviewState();
  await verifyFresh();
  return openWorkshop();
}

function defaultDraft() {
  return {
    version: 1, sources: [], deletedSpriteIdentities: [], replaceSpriteIdentities: [], existingIdentities: [], target: null, addedSpritePaletteId: '', reviewConflictsOnly: false, integrityIssues: [], replacementRuleAcceptances: [], workshopReturns: [], paletteAdaptationAcceptances: [], replacementRuleDraftFingerprint: '',
    configuration: {
      numberingMode: 'consecutive', group: 0, startIndex: 0, step: 10,
      collisionPolicy: 'stop', reservedRanges: [], filenameRules: [], overrides: {},
      anchor: 'center', offsetX: 0, offsetY: 0, cropMode: 'none',
      paletteChoice: 'own-png-palette', paletteMode: 'image', imagePaletteGroup: 1, imagePaletteTableOrder: 'index', tilingMethod: 'single-palette', duplicatePolicy: 'preserve-separate', placeholder: false, placeholderNote: '', importedPalettes: [],
      newArchiveVersion: '2.1', png8Optimization: 'none', keepRecoveryBackup: false, gifAirAfterBuild: false,
      masterPaletteId: '',
      temporaryPalettePath: '', temporaryPaletteByteHash: '', temporaryPaletteColorHash: '', temporaryPaletteId: '9,1', temporaryPaletteLifecycleId: '', temporaryPaletteTableOrder: INDEX_ORDER
    }
  };
}

function targetFromFile(filename, expectedFingerprint = '') {
  const absolute = path.resolve(filename), stat = fs.statSync(absolute), cacheKey = process.platform === 'win32' ? absolute.toLowerCase() : absolute;
  const cached = targetCache.get(cacheKey);
  if (cached && cached.size === stat.size && cached.mtimeMs === stat.mtimeMs) {
    const target = clone(cached.target), expected = expectedFingerprint ? String(expectedFingerprint).toLowerCase() : target.fingerprint;
    return { ...target, stale: expected !== target.fingerprint, expectedFingerprint: expected };
  }
  const buffer = fs.readFileSync(absolute), archive = readSff(absolute);
  const fingerprint = crypto.createHash('sha256').update(buffer).digest('hex').toLowerCase();
  const paletteRows = archive.palettes.map(palette => { const colors = paletteRgba(archive, palette.index), partialAlphaIndexes = colors.map((color, index) => color[3] !== 0 && color[3] !== 255 ? index : -1).filter(index => index >= 0); return { id: `${palette.group},${palette.number}`, group: palette.group, number: palette.number, physicalIndex: palette.index, colorHash: crypto.createHash('sha256').update(JSON.stringify(colors)).digest('hex'), partialAlphaCount: partialAlphaIndexes.length, partialAlphaIndexes }; });
  const paletteCounts = new Map(); for (const palette of paletteRows) paletteCounts.set(palette.id, (paletteCounts.get(palette.id) || 0) + 1);
  const identities = archive.sprites.map(sprite => `${sprite.group},${sprite.number}`), spriteCounts = new Map(); for (const identity of identities) spriteCounts.set(identity, (spriteCounts.get(identity) || 0) + 1);
  const target = {
    path: absolute, name: path.basename(absolute), fingerprint,
    sffVersion: Array.isArray(archive.header?.version) ? `${Number(archive.header.version[0]) || 0}.${Number(archive.header.version[2]) || 0}` : '?',
    stale: Boolean(expectedFingerprint && String(expectedFingerprint).toLowerCase() !== fingerprint),
    expectedFingerprint: expectedFingerprint ? String(expectedFingerprint).toLowerCase() : fingerprint,
    spriteCount: archive.sprites.length, paletteCount: archive.palettes.length,
    identities, palettes: paletteRows,
    duplicateSpriteIds: [...spriteCounts].filter(([, count]) => count > 1).map(([id]) => id),
    duplicatePaletteIds: [...paletteCounts].filter(([, count]) => count > 1).map(([id]) => id)
  };
  targetCache.set(cacheKey, { size: stat.size, mtimeMs: stat.mtimeMs, target: clone({ ...target, stale: false, expectedFingerprint: fingerprint }) });
  return target;
}

function bindInvocationTarget(value, target) {
  const draft = safeDraft(value), wanted = target && target.path ? target : null;
  if (!wanted) return { draft, changed: false, blocked: false, message: '' };
  const same = draft.target?.path && path.resolve(draft.target.path).toLowerCase() === path.resolve(wanted.path).toLowerCase();
  const hasPendingChanges = Boolean(draft.sources.length || draft.deletedSpriteIdentities?.length || draft.replaceSpriteIdentities?.length || draft.integrityIssues?.length);
  if (hasPendingChanges && draft.target && !same) return { draft, changed: false, blocked: true, message: `The retained Creator draft targets ${draft.target.name}. Finish or discard it before switching to ${wanted.name}.` };
  if (hasPendingChanges && same) return { draft, changed: false, blocked: false, message: `Creator already targets ${draft.target.name}; the retained reviewed changes were preserved.` };
  draft.target = wanted; draft.existingIdentities = wanted.identities;
  draft.configuration.paletteMode = 'target';
  draft.addedSpritePaletteId = wanted.palettes.find(item => item.id === '1,1')?.id || wanted.palettes[0]?.id || '';
  return { draft, changed: true, blocked: false, message: `Target attached: ${wanted.name}. Add one sprite, a batch, a folder, GIF frames, or PSD-derived images.` };
}

function bindDeletionInvocation(value, target, physicalIndices, archive = null) {
  const bound = bindInvocationTarget(value, target);
  if (bound.blocked) return bound;
  const draft = bound.draft, loaded = archive || readSff(target.path), requested = [...new Set((Array.isArray(physicalIndices) ? physicalIndices : []).map(Number))];
  if (!requested.length) return bound;
  if (requested.some(index => !Number.isSafeInteger(index) || index < 0 || index >= loaded.sprites.length)) return { draft, changed: bound.changed, blocked: true, message: 'One or more selected physical sprites no longer exist. Refresh the SFF viewer before staging deletion.' };
  const identities = requested.map(index => `${loaded.sprites[index].group},${loaded.sprites[index].number}`);
  const ambiguous = identities.find(identity => target.duplicateSpriteIds?.includes(identity));
  if (ambiguous) return { draft, changed: bound.changed, blocked: true, message: `Sprite ${ambiguous} occurs more than once physically. The SprMake2 preservation backend cannot delete that identity unambiguously.` };
  const protectedIdentity = identities.find(identity => identity === '59000,0' || identity === '59000,1');
  if (protectedIdentity) return { draft, changed: bound.changed, blocked: true, message: `Protected template sprite ${protectedIdentity} cannot be deleted through a batch plan.` };
  draft.deletedSpriteIdentities = [...new Set([...(draft.deletedSpriteIdentities || []), ...identities])];
  return { draft, changed: true, blocked: false, message: `Staged ${identities.length} sprite deletion${identities.length === 1 ? '' : 's'} for final review. The active SFF is unchanged.` };
}

function bindDuplicateInvocation(root, value, target, physicalIndex, archive = null) {
  const bound = bindInvocationTarget(value, target);
  if (bound.blocked) return bound;
  const draft = bound.draft, loaded = archive || readSff(target.path), index = Number(physicalIndex), sprite = loaded.sprites[index];
  if (!Number.isSafeInteger(index) || index < 0 || !sprite) return { draft, changed: bound.changed, blocked: true, message: 'The selected physical sprite no longer exists. Refresh the SFF viewer before duplicating it.' };
  const identity = `${sprite.group},${sprite.number}`;
  if (target.duplicateSpriteIds?.includes(identity)) return { draft, changed: bound.changed, blocked: true, message: `Sprite ${identity} occurs more than once physically. Choose an exact unique source before duplicating it.` };
  if (![5, 8].includes(Number(sprite.colorDepth))) return { draft, changed: bound.changed, blocked: true, message: `Sprite ${identity} is ${sprite.colorDepth}-bit. The shared duplicate seed currently requires an indexed sprite so palette assignment remains exact.` };
  const palette = target.palettes?.find(item => item.physicalIndex === sprite.paletteIndex);
  if (!palette) return { draft, changed: bound.changed, blocked: true, message: `Sprite ${identity} has no uniquely resolved embedded palette.` };
  if (draft.sources.length && draft.configuration.paletteMode === 'target' && draft.addedSpritePaletteId && draft.addedSpritePaletteId !== palette.id) return { draft, changed: bound.changed, blocked: true, message: `The retained intake batch uses target palette ${draft.addedSpritePaletteId}, while ${identity} uses ${palette.id}. Finish that batch or start a separate reviewed duplicate plan.` };
  const bytes = spritePng(loaded, sprite, null, true), cacheRoot = path.join(root, '.ikemen-tools', 'sff-creator', 'sources', String(target.fingerprint).toLowerCase(), 'duplicates');
  const filename = path.join(cacheRoot, `g${String(sprite.group).padStart(5, '0')}_i${String(sprite.number).padStart(5, '0')}_p${String(index).padStart(6, '0')}.png`), digest = crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase();
  if (fs.existsSync(filename)) {
    const existing = crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex').toUpperCase();
    if (existing !== digest) return { draft, changed: bound.changed, blocked: true, message: 'The retained duplicate-source cache contains different bytes. Nothing was replaced.' };
  } else transactionalWriteSet(fs, [[filename, bytes]], { label: 'sff-creator-duplicate-source', allowExisting: false, backup: false, journal: false });
  const creatorSourceIdentity = `duplicate:${target.fingerprint}:${index}`;
  const source = sourceFromFile(filename, { sourceIdentity: creatorSourceIdentity, label: `${identity} duplicate source`, provenance: { kind: 'sff-duplicate-source', creatorSourceIdentity, sourceFile: target.path, sourceArchive: target.path, sourceArchiveByteHash: target.fingerprint, sourceIdentity: identity, sourcePhysicalIndex: index } });
  if (draft.sources.some(item => item.id === source.id)) return { draft, changed: bound.changed, blocked: true, message: `Sprite ${identity} is already staged as a duplicate source in this Creator draft.` };
  const occupied = new Set(target.identities || []);
  try { for (const row of draftToPlan(draft).ready) occupied.add(row.identity); } catch (_) { /* Existing conflicts remain visible after the new row is staged. */ }
  let number = sprite.number + 1; while (number <= 65535 && occupied.has(`${sprite.group},${number}`)) number += 1;
  if (number > 65535) return { draft, changed: bound.changed, blocked: true, message: `Group ${sprite.group} has no free index after ${sprite.number} for the duplicate proposal.` };
  draft.sources.push(source); draft.configuration.paletteMode = 'target'; draft.addedSpritePaletteId = palette.id;
  draft.configuration.overrides[source.id] = { group: sprite.group, number, axisX: sprite.axisX, axisY: sprite.axisY, cropMode: 'none' };
  return { draft, changed: true, blocked: false, message: `Staged indexed sprite ${identity} as ${sprite.group},${number}. Review its destination, axes, palette and sharing choice before building.` };
}

function bindReplacementInvocation(value, target, physicalIndex, replacementPath, archive = null) {
  const bound = bindInvocationTarget(value, target);
  if (bound.blocked) return bound;
  const draft = bound.draft, loaded = archive || readSff(target.path), index = Number(physicalIndex), sprite = loaded.sprites[index];
  if (!Number.isSafeInteger(index) || index < 0 || !sprite) return { draft, changed: bound.changed, blocked: true, message: 'The selected physical sprite no longer exists. Refresh the SFF viewer before replacing its image.' };
  const identity = `${sprite.group},${sprite.number}`;
  if (identity === '59000,0' || identity === '59000,1') return { draft, changed: bound.changed, blocked: true, message: `Protected template sprite ${identity} cannot be replaced through a batch plan.` };
  if (target.duplicateSpriteIds?.includes(identity)) return { draft, changed: bound.changed, blocked: true, message: `Sprite ${identity} occurs more than once physically. Replacing that identity is ambiguous.` };
  if ([24, 32].includes(Number(sprite.colorDepth))) {
    if (target.sffVersion !== '2.1' || sprite.dataSize === 0 || ![[11, 24], [12, 32], [0, 24], [0, 32]].some(([format, depth]) => sprite.format === format && sprite.colorDepth === depth)) return { draft, changed: bound.changed, blocked: true, message: `Sprite ${identity} needs a direct supported SFF v2.1 truecolor source. Linked sprites must be edited through their physical source or deliberately detached in Creator.` };
    if (draft.sources.length && draft.configuration.paletteMode !== 'true-color') return { draft, changed: bound.changed, blocked: true, message: 'Finish or discard the current indexed Creator batch before staging a truecolor replacement.' };
    if ((draft.replaceSpriteIdentities || []).includes(identity) || draft.sources.some(item => (draft.configuration.overrides[item.id] || {}).group === sprite.group && (draft.configuration.overrides[item.id] || {}).number === sprite.number)) return { draft, changed: bound.changed, blocked: true, message: `Sprite ${identity} already has a staged replacement in this Creator draft.` };
    let source;
    try { source = sourceFromFile(replacementPath, { sourceIdentity: `replacement:${target.fingerprint}:${index}:${path.resolve(replacementPath)}`, provenance: { kind: 'sff-replacement-source', sourceFile: path.resolve(replacementPath), sourceArchive: target.path, sourceArchiveByteHash: target.fingerprint, sourceIdentity: identity, sourcePhysicalIndex: index } }); }
    catch (error) { return { draft, changed: bound.changed, blocked: true, message: `Replacement image could not be staged: ${error.message}` }; }
    if (source.bitDepth !== 8 || source.colorType !== (sprite.colorDepth === 24 ? 2 : 6)) return { draft, changed: bound.changed, blocked: true, message: `Replacement image for ${identity} must be a sealed ${sprite.colorDepth}-bit PNG. Explicit depth conversion needs a separate reviewed Creator plan.` };
    draft.sources.push(source); draft.replaceSpriteIdentities = [...new Set([...(draft.replaceSpriteIdentities || []), identity])];
    draft.configuration.paletteMode = 'true-color'; draft.configuration.paletteChoice = 'true-color'; draft.configuration.cropMode = 'none'; draft.configuration.duplicatePolicy = 'preserve-separate'; draft.addedSpritePaletteId = '';
    draft.configuration.truecolorLinkedReplacement = loaded.sprites.some(item => item.dataSize === 0 && item.link === index);
    draft.configuration.overrides[source.id] = { group: sprite.group, number: sprite.number, axisX: sprite.axisX, axisY: sprite.axisY, cropMode: 'none' };
    return { draft, changed: true, blocked: false, message: draft.configuration.truecolorLinkedReplacement ? `Sprite ${identity} is ready for review. Save a new SFF copy; its linked sprites will stay connected.` : `Sprite ${identity} is ready for review. Save a new SFF copy to keep editing.` };
  }
  if (![5, 8].includes(Number(sprite.colorDepth))) return { draft, changed: bound.changed, blocked: true, message: `Sprite ${identity} is ${sprite.colorDepth}-bit. The shared replacement route currently requires an indexed sprite so palette assignment remains exact.` };
  const palette = target.palettes?.find(item => item.physicalIndex === sprite.paletteIndex);
  if (!palette) return { draft, changed: bound.changed, blocked: true, message: `Sprite ${identity} has no uniquely resolved embedded palette.` };
  if (draft.sources.length && draft.configuration.paletteMode === 'target' && draft.addedSpritePaletteId && draft.addedSpritePaletteId !== palette.id) return { draft, changed: bound.changed, blocked: true, message: `The retained intake batch uses target palette ${draft.addedSpritePaletteId}, while ${identity} uses ${palette.id}. Finish that batch or start a separate reviewed replacement plan.` };
  const creatorSourceIdentity = `replacement:${target.fingerprint}:${index}:${path.resolve(replacementPath)}`;
  let source;
  try { source = sourceFromFile(replacementPath, { sourceIdentity: creatorSourceIdentity, provenance: { kind: 'sff-replacement-source', creatorSourceIdentity, sourceFile: path.resolve(replacementPath), sourceArchive: target.path, sourceArchiveByteHash: target.fingerprint, sourceIdentity: identity, sourcePhysicalIndex: index } }); }
  catch (error) { return { draft, changed: bound.changed, blocked: true, message: `Replacement image could not be staged: ${error.message}` }; }
  if (source.bitDepth !== 8 || source.colorType !== 3) return { draft, changed: bound.changed, blocked: true, message: `Replacement image for ${identity} must be an indexed 8-bit PNG. Use palette preparation before staging it.` };
  if ((draft.replaceSpriteIdentities || []).includes(identity) || draft.sources.some(item => (draft.configuration.overrides[item.id] || {}).group === sprite.group && (draft.configuration.overrides[item.id] || {}).number === sprite.number)) return { draft, changed: bound.changed, blocked: true, message: `Sprite ${identity} already has a staged replacement in this Creator draft.` };
  draft.sources.push(source); draft.replaceSpriteIdentities = [...new Set([...(draft.replaceSpriteIdentities || []), identity])];
  draft.configuration.paletteMode = 'target'; draft.addedSpritePaletteId = palette.id;
  draft.configuration.overrides[source.id] = { group: sprite.group, number: sprite.number, axisX: sprite.axisX, axisY: sprite.axisY, cropMode: 'none' };
  return { draft, changed: true, blocked: false, message: `Staged a replacement source for ${identity}. Review its pixels, preserved axis, target palette and candidate impact before building.` };
}

function saveVerifiedCreatorCopy(testBuild, destination) {
  const filename = path.resolve(destination || '');
  if (!/\.sff$/i.test(filename) || fs.existsSync(filename)) throw new Error('Choose a new .sff filename for the verified copy; an existing file is never overwritten.');
  if (testBuild?.adoptionAllowed !== false || !/^[a-f0-9]{64}$/i.test(String(testBuild.candidateByteHash || ''))) throw new Error('A sealed candidate-only Creator test build is required before saving a copy.');
  const source = path.resolve(testBuild.candidatePath || ''), stat = fs.lstatSync(source);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('The verified Creator candidate is no longer a regular file. Build it again.');
  const bytes = fs.readFileSync(source), digest = crypto.createHash('sha256').update(bytes).digest('hex');
  if (digest !== String(testBuild.candidateByteHash).toLowerCase()) throw new Error('The verified Creator candidate changed before Save As. Build it again.');
  transactionalWriteSet(fs, [[filename, bytes]], { label: 'sff-creator-verified-copy', allowExisting: false, backup: false, journal: false });
  if (crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex') !== digest) throw new Error('The saved SFF copy did not match the verified candidate.');
  readSff(filename);
  return { filename, byteHash: digest, receiptPath: testBuild.receiptPath, adoptionAllowed: false };
}

async function createReviewedTruecolorCopy(root, draft, destination) {
  const reviewed = safeDraft(draft), state = applyState(reviewed);
  if (!state.enabled || reviewed.configuration.paletteMode !== 'true-color' || !reviewed.replaceSpriteIdentities.length || reviewed.target?.sffVersion !== '2.1') throw new Error(state.reason || 'A reviewed SFF v2.1 truecolor replacement is required.');
  const filename = path.resolve(destination || '');
  if (!/\.sff$/i.test(filename) || fs.existsSync(filename)) throw new Error('Choose a new .sff filename; the verified copy never overwrites an existing archive.');
  const parent = path.join(path.dirname(filename), `${path.basename(filename, '.sff')}-review`), packaged = await createReviewedPackage(root, reviewed, false, '', parent);
  const build = { ...packaged.build, specificationArtifactByteHash: crypto.createHash('sha256').update(fs.readFileSync(packaged.build.specificationPath)).digest('hex') };
  const candidate = createCreatorTestBuild({ packageRoot: packaged.packageRoot, build, targetId: 'sff-v2.1' });
  return saveVerifiedCreatorCopy(candidate, filename);
}

function paletteAdaptationInvocationBinding(archive, physicalIndices, targetPaletteIndex, preservePhysicalIndices = []) {
  const requested = [...new Set((Array.isArray(physicalIndices) ? physicalIndices : []).map(Number))], preserved = [...new Set((Array.isArray(preservePhysicalIndices) ? preservePhysicalIndices : []).map(Number))].filter(index => !requested.includes(index)), staged = [...requested, ...preserved];
  if (!archive?.buffer || !requested.length || staged.length > MAX_SOURCES) throw new Error(`Choose from 1 through ${MAX_SOURCES} total adapted and preserved sprites.`);
  const ownerIndex = index => { const seen = new Set(); let sprite = archive.sprites[index]; while (sprite && sprite.dataSize === 0) { if (seen.has(sprite.index)) return -1; seen.add(sprite.index); sprite = archive.sprites[sprite.link]; } return sprite?.index ?? -1; };
  const row = index => { const sprite = archive.sprites[index]; if (!Number.isSafeInteger(index) || index < 0 || !sprite) throw new Error('One or more reviewed palette-adaptation sprites no longer exist.'); return { physicalIndex: index, group: sprite.group, number: sprite.number, dataSize: sprite.dataSize, link: sprite.link, ownerPhysicalIndex: ownerIndex(index), colorDepth: sprite.colorDepth, paletteIndex: sprite.paletteIndex, axisX: sprite.axisX, axisY: sprite.axisY }; };
  const palette = archive.palettes[Number(targetPaletteIndex)], colors = palette && paletteRgba(archive, Number(targetPaletteIndex));
  if (!palette || !Array.isArray(colors) || colors.length !== 256) throw new Error('The reviewed target palette no longer resolves to exactly 256 entries.');
  const body = { archiveFingerprint: crypto.createHash('sha256').update(archive.buffer).digest('hex').toLowerCase(), targetPalette: { physicalIndex: Number(targetPaletteIndex), group: palette.group, number: palette.number, colorHash: crypto.createHash('sha256').update(JSON.stringify(colors)).digest('hex') }, requested: requested.map(row), preserved: preserved.map(row) };
  return Object.freeze({ ...body, bindingHash: crypto.createHash('sha256').update(JSON.stringify(canonicalize(body))).digest('hex') });
}

function bindPaletteAdaptationInvocation(root, value, target, physicalIndices, targetPaletteIndex, archive = null, preservePhysicalIndices = [], expectedBinding = null) {
  const bound = bindInvocationTarget(value, target);
  if (bound.blocked) return bound;
  const draft = bound.draft, loaded = archive || readSff(target.path), requested = [...new Set((Array.isArray(physicalIndices) ? physicalIndices : []).map(Number))], preserved = [...new Set((Array.isArray(preservePhysicalIndices) ? preservePhysicalIndices : []).map(Number))].filter(index => !requested.includes(index)), stagedIndices = [...requested, ...preserved];
  if (!requested.length) return { draft, changed: bound.changed, blocked: true, message: 'Choose at least one indexed source sprite to adapt.' };
  if (stagedIndices.length > MAX_SOURCES) return { draft, changed: bound.changed, blocked: true, message: `This adaptation exceeds Creator's ${MAX_SOURCES}-sprite combined adaptation and preservation safety limit.` };
  if (draft.sources.length || draft.deletedSpriteIdentities.length || draft.replaceSpriteIdentities.length) return { draft, changed: bound.changed, blocked: true, message: 'Finish or discard the retained Creator draft before starting a reviewed palette adaptation.' };
  const archiveHash = crypto.createHash('sha256').update(loaded.buffer).digest('hex').toLowerCase();
  if (archiveHash !== String(target.fingerprint || target.expectedFingerprint || '').toLowerCase()) return { draft, changed: bound.changed, blocked: true, message: 'The target SFF changed before palette adaptation could be staged. Reopen the SFF viewer and try again.' };
  let observedBinding;
  try { observedBinding = paletteAdaptationInvocationBinding(loaded, requested, targetPaletteIndex, preserved); }
  catch (error) { return { draft, changed: bound.changed, blocked: true, message: error.message }; }
  if (!expectedBinding || expectedBinding.bindingHash !== observedBinding.bindingHash || JSON.stringify(expectedBinding) !== JSON.stringify(observedBinding)) return { draft, changed: bound.changed, blocked: true, message: 'The reviewed SFF, target palette, sprite identities, axes, palettes, or link topology changed before Creator opened. Nothing was staged.' };
  const targetPalette = target.palettes?.find(item => item.physicalIndex === Number(targetPaletteIndex));
  if (!targetPalette) return { draft, changed: bound.changed, blocked: true, message: 'The selected target palette no longer exists.' };
  const targetColors = paletteRgba(loaded, targetPalette.physicalIndex);
  if (!Array.isArray(targetColors) || targetColors.length !== 256) return { draft, changed: bound.changed, blocked: true, message: `Palette ${targetPalette.id} is not an exact 256-entry palette.` };
  const ownerIndex = index => {
    const seen = new Set(); let current = loaded.sprites[index];
    while (current && current.dataSize === 0) { if (seen.has(current.index)) return -1; seen.add(current.index); current = loaded.sprites[current.link]; }
    return current?.index ?? -1;
  };
  const dependentCounts = new Map();
  for (const sprite of loaded.sprites) if (sprite.dataSize === 0) { const owner = ownerIndex(sprite.index); if (owner >= 0) dependentCounts.set(owner, (dependentCounts.get(owner) || 0) + 1); }
  const stagedSet = new Set(stagedIndices);
  for (const index of requested) if (loaded.sprites[index]?.dataSize !== 0 && dependentCounts.get(index)) {
    const omitted = loaded.sprites.filter(sprite => ownerIndex(sprite.index) === index && !stagedSet.has(sprite.index));
    if (omitted.length) return { draft, changed: bound.changed, blocked: true, message: `Editing source sprite ${loaded.sprites[index].group},${loaded.sprites[index].number} would also change ${omitted.length} linked sprite(s). Choose all affected links or materialize the unselected links with their original colors.` };
  }
  const sprites = [], originalPalettes = new Map();
  for (const index of stagedIndices) {
    const sprite = loaded.sprites[index];
    if (!Number.isSafeInteger(index) || index < 0 || !sprite) return { draft, changed: bound.changed, blocked: true, message: 'One or more selected physical sprites no longer exist. Refresh the SFF viewer before staging adaptation.' };
    const identity = `${sprite.group},${sprite.number}`;
    if (target.duplicateSpriteIds?.includes(identity)) return { draft, changed: bound.changed, blocked: true, message: `Sprite ${identity} occurs more than once physically. Palette adaptation cannot replace that identity unambiguously.` };
    if (Number(sprite.colorDepth) !== 8) return { draft, changed: bound.changed, blocked: true, message: `Sprite ${identity} is ${sprite.colorDepth}-bit. Reviewed palette adaptation currently accepts indexed 8-bit source sprites only.` };
    if (sprite.group === 59000) return { draft, changed: bound.changed, blocked: true, message: `Protected template sprite ${identity} cannot be replaced through palette adaptation.` };
    if (preserved.includes(sprite.index)) { const sourcePalette = target.palettes?.find(palette => palette.physicalIndex === sprite.paletteIndex); if (!sourcePalette) return { draft, changed: bound.changed, blocked: true, message: `Sprite ${identity} cannot be materialized because its original palette no longer resolves.` }; originalPalettes.set(sprite.index, sourcePalette); }
    sprites.push(sprite);
  }
  const cacheRoot = path.join(root, '.ikemen-tools', 'sff-creator', 'sources', archiveHash, 'palette-adaptations'), prepared = [], writes = [];
  for (const sprite of sprites) {
    const identity = `${sprite.group},${sprite.number}`, bytes = spritePng(loaded, sprite, null, true), digest = crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase();
    const filename = path.join(cacheRoot, `g${String(sprite.group).padStart(5, '0')}_i${String(sprite.number).padStart(5, '0')}_p${String(sprite.index).padStart(6, '0')}.png`);
    if (fs.existsSync(filename)) {
      const existing = crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex').toUpperCase();
      if (existing !== digest) return { draft, changed: bound.changed, blocked: true, message: `The retained adaptation cache for sprite ${identity} contains different bytes. Nothing was staged.` };
    } else writes.push([filename, bytes]);
    const creatorSourceIdentity = `palette-adaptation:${archiveHash}:${sprite.index}:${targetPalette.physicalIndex}`;
    const source = sourceFromFile(filename, { sourceIdentity: creatorSourceIdentity, label: `${identity} · adapt to palette ${targetPalette.id}`, provenance: { kind: 'sff-palette-adaptation-source', creatorSourceIdentity, sourceFile: target.path, sourceArchive: target.path, sourceArchiveByteHash: archiveHash, sourceIdentity: identity, sourcePhysicalIndex: sprite.index, sourcePalettePhysicalIndex: sprite.paletteIndex, targetPalettePhysicalIndex: targetPalette.physicalIndex, targetPaletteId: targetPalette.id, targetPaletteColorHash: targetPalette.colorHash } }, bytes);
    prepared.push({ source, sprite, identity, adapt: requested.includes(sprite.index) });
  }
  if (writes.length) transactionalWriteSet(fs, writes, { label: 'sff-creator-palette-adaptation-sources', allowExisting: false, backup: false, journal: false });
  draft.configuration.paletteMode = 'target'; draft.configuration.paletteChoice = 'own-png-palette'; draft.addedSpritePaletteId = targetPalette.id;
  for (const item of prepared) {
    draft.sources.push(item.source); draft.replaceSpriteIdentities.push(item.identity);
    const sourcePalette = originalPalettes.get(item.sprite.index);
    draft.configuration.overrides[item.source.id] = { group: item.sprite.group, number: item.sprite.number, axisX: item.sprite.axisX, axisY: item.sprite.axisY, cropMode: 'none', paletteId: item.adapt ? targetPalette.id : sourcePalette.id };
  }
  draft.replaceSpriteIdentities = [...new Set(draft.replaceSpriteIdentities)];
  return { draft, changed: true, blocked: false, message: `Staged ${requested.length} indexed sprite${requested.length === 1 ? '' : 's'} for reviewed pixel/index adaptation to palette ${targetPalette.id}${preserved.length ? ` and ${preserved.length} linked sprite${preserved.length === 1 ? '' : 's'} for materialization with original colors` : ''}. Open Nearest color suggestions in Final Review; the active SFF is unchanged.` };
}

function pngInfo(filename, admittedBuffer = null) {
  const buffer = Buffer.isBuffer(admittedBuffer) ? admittedBuffer : fs.readFileSync(filename);
  if (buffer.length < 33 || buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || buffer.toString('ascii', 12, 16) !== 'IHDR') throw new Error(`${path.basename(filename)} is not a valid PNG.`);
  const width = buffer.readUInt32BE(16), height = buffer.readUInt32BE(20);
  if (!width || !height) throw new Error(`${path.basename(filename)} has invalid dimensions.`);
  const bitDepth = buffer[24], colorType = buffer[25], colors = colorType === 3 ? pngPaletteRgba(buffer) : null;
  let cropInspection = null, decodedHash = null, croppedDecodedHash = null;
  if (colorType === 3 && bitDepth === 8) {
    try {
      cropInspection = inspectIndexedCrop(buffer);
      const decoded = readIndexedPng8(buffer);
      decodedHash = decoded.decodedHash;
      const bounds = cropInspection?.bounds;
      if (bounds && !bounds.empty && bounds.width && bounds.height) {
        const cropped = Buffer.alloc(bounds.width * bounds.height);
        for (let y = 0; y < bounds.height; y += 1) decoded.indices.copy(cropped, y * bounds.width, (bounds.y + y) * width + bounds.x, (bounds.y + y) * width + bounds.x + bounds.width);
        croppedDecodedHash = crypto.createHash('sha256').update(cropped).digest('hex');
      }
    } catch (_) { /* Noncanonical indexed files retain byte evidence but are not proposed as exact duplicates. */ }
  } else if (bitDepth === 8 && (colorType === 2 || colorType === 6)) {
    const decoded = decodePng(buffer, { maximumDimension: 65535, maximumPixels: 100000000 });
    if (colorType === 2) { const rgb = Buffer.alloc(width * height * 3); for (let i = 0, j = 0; i < decoded.rgba.length; i += 4) { rgb[j++] = decoded.rgba[i]; rgb[j++] = decoded.rgba[i + 1]; rgb[j++] = decoded.rgba[i + 2]; } decodedHash = crypto.createHash('sha256').update(rgb).digest('hex'); }
    else decodedHash = crypto.createHash('sha256').update(decoded.rgba).digest('hex');
  }
  const partialAlphaIndexes = colors ? colors.map((color, index) => color[3] !== 0 && color[3] !== 255 ? index : -1).filter(index => index >= 0) : [];
  return { width, height, bitDepth, colorType, byteLength: buffer.length, decodedHash, croppedDecodedHash, paletteColorHash: colors ? crypto.createHash('sha256').update(JSON.stringify(colors)).digest('hex') : null, partialAlphaCount: partialAlphaIndexes.length, partialAlphaIndexes, cropBounds: cropInspection?.bounds || null, cropChanged: Boolean(cropInspection?.changed), byteHash: crypto.createHash('sha256').update(buffer).digest('hex').toUpperCase() };
}

function paletteSourceInfo(filename, tableOrder = INDEX_ORDER) {
  const absolute = path.resolve(filename), buffer = fs.readFileSync(absolute), extension = path.extname(absolute).toLowerCase();
  const normalizedOrder = normalizeOrder(tableOrder), colors = extension === '.act' ? readAct(buffer, normalizedOrder) : extension === '.png' ? colorsForOrder(pngPaletteRgba(buffer), normalizedOrder) : null;
  if (!Array.isArray(colors) || colors.length !== 256) throw new Error(`${path.basename(filename)} must be a 256-color ACT or indexed PNG palette.`);
  const partialAlphaIndexes = colors.map((color, index) => color[3] !== 0 && color[3] !== 255 ? index : -1).filter(index => index >= 0);
  return { path: absolute, name: path.basename(absolute), byteHash: crypto.createHash('sha256').update(buffer).digest('hex').toUpperCase(), colorHash: crypto.createHash('sha256').update(JSON.stringify(colors)).digest('hex'), colors, tableOrder: normalizedOrder, tableOrderLabel: orderLabel(normalizedOrder), partialAlphaCount: partialAlphaIndexes.length, partialAlphaIndexes };
}

function sourceFromFile(filename, metadata = {}, admittedBuffer = null) {
  const absolute = path.resolve(filename), info = pngInfo(absolute, admittedBuffer);
  const identityBasis = metadata.sourceIdentity || (process.platform === 'win32' ? absolute.toLowerCase() : absolute);
  return { id: `source-${crypto.createHash('sha256').update(identityBasis).digest('hex').slice(0, 20)}`, ownerId: metadata.ownerId || crypto.randomUUID(), path: absolute, name: metadata.label || path.basename(absolute), ...info, provenance: metadata.provenance || null };
}

function portableManifestPath(root, value, rowNumber) {
  const text = String(value || '').trim();
  if (!text || path.isAbsolute(text)) throw new Error(`SprMake2 manifest row ${rowNumber} must reference a relative PNG path inside its portable package.`);
  const packageRoot = path.resolve(root), filename = path.resolve(packageRoot, text);
  if (filename !== packageRoot && !filename.startsWith(`${packageRoot}${path.sep}`)) throw new Error(`SprMake2 manifest row ${rowNumber} escapes its portable package.`);
  if (path.extname(filename).toLowerCase() !== '.png') throw new Error(`SprMake2 manifest row ${rowNumber} references ${path.basename(filename) || text}; Creator currently imports indexed PNG rows only.`);
  if (!fs.existsSync(filename) || !fs.statSync(filename).isFile()) throw new Error(`SprMake2 manifest row ${rowNumber} source is missing: ${text}.`);
  return filename;
}

function manifestInteger(row, names, label, rowNumber, minimum, maximum) {
  const name = names.find(key => Object.prototype.hasOwnProperty.call(row, key) && String(row[key]).trim() !== '');
  if (!name) throw new Error(`SprMake2 manifest row ${rowNumber} has no ${label}.`);
  const value = Number(row[name]);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(`SprMake2 manifest row ${rowNumber} ${label} must be an integer from ${minimum} through ${maximum}.`);
  return value;
}

function mergeImportedSources(draft, imported, overrides, importedPalettes = []) {
  const next = safeDraft(draft), existing = new Map(next.sources.map(source => [source.id, source]));
  for (const source of imported) existing.set(source.id, source);
  if (existing.size > MAX_SOURCES) throw new Error(`Import would exceed Creator's ${MAX_SOURCES}-source draft limit.`);
  next.sources = [...existing.values()]; next.configuration.overrides = { ...next.configuration.overrides, ...overrides };
  if (importedPalettes.length) {
    const palettes = new Map((next.configuration.importedPalettes || []).map(palette => [palette.id, palette]));
    for (const palette of importedPalettes) {
      const prior = palettes.get(palette.id);
      if (prior && prior.colorHash !== palette.colorHash) throw new Error(`Imported palette ${palette.id} conflicts with a different retained recipe palette.`);
      palettes.set(palette.id, palette);
    }
    next.configuration.importedPalettes = [...palettes.values()];
  }
  if (!next.target) next.configuration.paletteMode = 'image';
  return next;
}

function importSprMake2Manifest(draft, manifestPath) {
  const filename = path.resolve(manifestPath), text = fs.readFileSync(filename, 'utf8'), rows = parseCsv(text);
  if (!rows.length) throw new Error('The selected SprMake2 manifest contains no sprite rows.');
  if (rows.length > MAX_SOURCES) throw new Error(`The selected SprMake2 manifest contains ${rows.length} rows; Creator accepts at most ${MAX_SOURCES} sources per draft.`);
  const manifestHash = crypto.createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex').toUpperCase(), packageRoot = path.dirname(filename), imported = [], overrides = {}, seen = new Set();
  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 2, sourceText = row.OriginalRelativePath || row.Source || row.Filename || row.File;
    const sourcePath = portableManifestPath(packageRoot, sourceText, rowNumber), group = manifestInteger(row, ['ComputedGroup', 'Group', 'BaseGroup'], 'group', rowNumber, 0, 65535), number = manifestInteger(row, ['ImageIndex', 'Index'], 'index', rowNumber, 0, 65535), axisX = manifestInteger(row, ['AxisX', 'X'], 'axis X', rowNumber, -32768, 32767), axisY = manifestInteger(row, ['AxisY', 'Y'], 'axis Y', rowNumber, -32768, 32767);
    const expectedHash = String(row.SourceSHA256 || row.SHA256 || '').trim().toUpperCase(), sourceIdentity = `sprmake2-manifest:${manifestHash}:${index}:${sourceText}`, source = sourceFromFile(sourcePath, { sourceIdentity, provenance: { kind: 'imported-sprmake2-manifest', creatorSourceIdentity: sourceIdentity, manifest: path.basename(filename), manifestHash, rowNumber, originalRelativePath: String(sourceText) } });
    if (source.colorType !== 3 || source.bitDepth !== 8) throw new Error(`SprMake2 manifest row ${rowNumber} source ${path.basename(sourcePath)} is not an 8-bit indexed PNG.`);
    if (expectedHash && !/^[A-F0-9]{64}$/.test(expectedHash)) throw new Error(`SprMake2 manifest row ${rowNumber} has an invalid SourceSHA256.`);
    if (expectedHash && source.byteHash !== expectedHash) throw new Error(`SprMake2 manifest row ${rowNumber} source hash changed; expected ${expectedHash}, found ${source.byteHash}.`);
    if (seen.has(source.id)) throw new Error(`SprMake2 manifest row ${rowNumber} duplicates an earlier physical row identity.`);
    seen.add(source.id); imported.push(source);
    const autocrop = /^(?:1|true|yes)$/i.test(String(row.Autocrop || row.AutoCrop || '').trim()), duplicate = String(row.DuplicatePolicy || '').trim();
    if (duplicate && !['share-identical', 'preserve-separate'].includes(duplicate)) throw new Error(`SprMake2 manifest row ${rowNumber} has unsupported DuplicatePolicy ${duplicate}.`);
    overrides[source.id] = { group, number, axisX, axisY, cropMode: autocrop ? 'autocrop' : 'none', ...(duplicate ? { duplicatePolicy: duplicate } : {}) };
  }
  return { draft: mergeImportedSources(draft, imported, overrides), importedCount: imported.length, recipe: path.basename(filename), recipeHash: manifestHash, manifestHash, recipeKind: 'CSV manifest' };
}

function unquoteSprMake2Value(value) {
  const text = String(value || '').trim();
  return text.length >= 2 && ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) ? text.slice(1, -1) : text;
}

function stripSprMake2Comment(value) {
  const text = String(value || ''); let quote = '';
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quote) {
      if (character === quote) {
        if (quote === '"' && text[index + 1] === '"') index += 1;
        else quote = '';
      }
      continue;
    }
    if (character === '"' || character === "'") { quote = character; continue; }
    if (character === ';') return text.slice(0, index).trim();
  }
  return text.trim();
}

function importSprMake2Definition(draft, definitionPath) {
  const filename = path.resolve(definitionPath), bytes = fs.readFileSync(filename);
  if (bytes.length > 8 * 1024 * 1024) throw new Error('The SprMake2 definition exceeds the reviewed 8 MiB intake limit.');
  const text = bytes.toString('utf8').replace(/^\uFEFF/, ''), definitionHash = crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase(), packageRoot = path.dirname(filename), lines = text.split(/\r?\n/);
  let section = '', inputDirectory = packageRoot, usePalette = null, autocrop = false, duplicatePolicy = 'preserve-separate', reverseAct = null;
  const imported = [], overrides = {}, paletteRows = [], usedPaletteIds = new Set();
  const containedPath = (directory, sourceText, lineNumber, kind, extension) => {
    const sourcePath = path.resolve(directory, sourceText), relation = path.relative(packageRoot, sourcePath);
    if (!relation || path.isAbsolute(relation) || relation.split(path.sep).includes('..')) throw new Error(`SprMake2 definition line ${lineNumber} ${kind} escapes its portable package.`);
    if (path.extname(sourcePath).toLowerCase() !== extension || !fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) throw new Error(`SprMake2 definition line ${lineNumber} ${kind} is not an available ${extension.toUpperCase().slice(1)} inside the portable package: ${sourceText}.`);
    return sourcePath;
  };
  const paletteIdentity = (value, lineNumber) => {
    const match = /^(\d+)\s*,\s*(\d+)$/.exec(String(value || '').trim());
    if (!match || Number(match[1]) > 65535 || Number(match[2]) > 65535) throw new Error(`SprMake2 definition line ${lineNumber} sprite.usepal must be -1 or group,index within 0–65535.`);
    return `${Number(match[1])},${Number(match[2])}`;
  };
  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1, content = stripSprMake2Comment(lines[index]);
    if (!content) continue;
    const sectionMatch = /^\[([^\]]+)\]$/.exec(content);
    if (sectionMatch) { section = sectionMatch[1].trim().toLowerCase(); continue; }
    if (section === 'option') {
      const assignment = /^([^=]+)=(.*)$/.exec(content); if (!assignment) continue;
      const key = assignment[1].trim().toLowerCase(), value = unquoteSprMake2Value(assignment[2]);
      if (key === 'input.dir') {
        const proposed = path.resolve(packageRoot, value || '.');
        if (proposed !== packageRoot && !proposed.startsWith(`${packageRoot}${path.sep}`)) throw new Error(`SprMake2 definition line ${lineNumber} input.dir escapes its portable package.`);
        inputDirectory = proposed;
      } else if (key === 'sprite.usepal') usePalette = value;
      else if (key === 'sprite.autocrop') autocrop = /^(?:1|true|yes)$/i.test(value);
      else if (key === 'sprite.detectduplicates') duplicatePolicy = /^(?:1|true|yes)$/i.test(value) ? 'share-identical' : 'preserve-separate';
      else if (key === 'pal.reverseact') {
        if (!/^(?:0|1|false|true|no|yes)$/i.test(value)) throw new Error(`SprMake2 definition line ${lineNumber} pal.reverseact must be 0 or 1.`);
        reverseAct = /^(?:1|true|yes)$/i.test(value);
      }
      continue;
    }
    if (section === 'pal') {
      const parsed = parseCsv(`Group,Index,Source,Start,End\r\n${content}\r\n`)[0];
      if (!parsed) throw new Error(`SprMake2 definition line ${lineNumber} is not a five-field palette row.`);
      const group = manifestInteger(parsed, ['Group'], 'palette group', lineNumber, 0, 65535), number = manifestInteger(parsed, ['Index'], 'palette index', lineNumber, 0, 65535), startText = String(parsed.Start ?? '').trim(), endText = String(parsed.End ?? '').trim(), start = startText ? Number(startText) : null, end = endText ? Number(endText) : null, sourceText = unquoteSprMake2Value(parsed.Source);
      paletteRows.push({ lineNumber, group, number, id: `${group},${number}`, sourceText, inputDirectory });
      paletteRows[paletteRows.length - 1].range = { start, end, declared: Boolean(startText || endText) };
      continue;
    }
    if (section !== 'sprite') continue;
    if (usePalette === null) throw new Error(`SprMake2 definition line ${lineNumber} sprite.usepal is not declared. Set it to -1 or an explicit group,index so the palette route is reviewable.`);
    const storedPaletteId = String(usePalette).trim() === '-1' ? null : paletteIdentity(usePalette, lineNumber);
    const parsed = parseCsv(`Group,Index,Source,AxisX,AxisY\r\n${content}\r\n`)[0];
    if (!parsed) throw new Error(`SprMake2 definition line ${lineNumber} is not a five-field sprite row.`);
    const group = manifestInteger(parsed, ['Group'], 'group', lineNumber, 0, 65535), number = manifestInteger(parsed, ['Index'], 'index', lineNumber, 0, 65535), axisX = manifestInteger(parsed, ['AxisX'], 'axis X', lineNumber, -32768, 32767), axisY = manifestInteger(parsed, ['AxisY'], 'axis Y', lineNumber, -32768, 32767), sourceText = unquoteSprMake2Value(parsed.Source);
    const sourcePath = containedPath(inputDirectory, sourceText, lineNumber, 'source', '.png');
    const sourceIdentity = `sprmake2-definition:${definitionHash}:${lineNumber}:${sourceText}`, source = sourceFromFile(sourcePath, { sourceIdentity, provenance: { kind: 'imported-sprmake2-definition', creatorSourceIdentity: sourceIdentity, definition: path.basename(filename), definitionHash, lineNumber, inputDirectory: path.relative(packageRoot, inputDirectory).replace(/\\/g, '/') || '.', originalSource: sourceText, storedPaletteId } });
    if (source.colorType !== 3 || source.bitDepth !== 8) throw new Error(`SprMake2 definition line ${lineNumber} source ${path.basename(sourcePath)} is not an 8-bit indexed PNG.`);
    imported.push(source); overrides[source.id] = { group, number, axisX, axisY, cropMode: autocrop ? 'autocrop' : 'none', duplicatePolicy, ...(storedPaletteId ? { paletteId: storedPaletteId } : {}) };
    if (storedPaletteId) usedPaletteIds.add(storedPaletteId);
    if (imported.length > MAX_SOURCES) throw new Error(`The SprMake2 definition contains more than Creator's ${MAX_SOURCES}-source draft limit.`);
  }
  if (!imported.length) throw new Error('The selected SprMake2 definition contains no importable [Sprite] rows.');
  if (usedPaletteIds.size && reverseAct === null) throw new Error('The SprMake2 definition uses stored ACT palettes but does not explicitly declare pal.reverseact. Add pal.reverseact = 0 or 1 so table order is not guessed.');
  const paletteById = new Map(), importedPalettes = [];
  for (const row of paletteRows) {
    if (paletteById.has(row.id)) throw new Error(`SprMake2 definition palette ${row.id} is declared more than once (line ${row.lineNumber}).`);
    paletteById.set(row.id, null);
    if (!usedPaletteIds.has(row.id)) continue;
    if (!row.range.declared || !Number.isSafeInteger(row.range.start) || !Number.isSafeInteger(row.range.end) || row.range.start !== 0 || row.range.end !== 255) throw new Error(`SprMake2 definition line ${row.lineNumber} uses ${row.range.declared ? `palette range ${row.range.start},${row.range.end}` : 'an undeclared palette range'}. Creator intake currently requires explicit lossless full range 0,255.`);
    const sourcePath = containedPath(row.inputDirectory, row.sourceText, row.lineNumber, 'palette source', '.act'), tableOrder = reverseAct ? INDEX_ORDER : REVERSED_ORDER, info = paletteSourceInfo(sourcePath, tableOrder);
    const palette = { id: row.id, group: row.group, number: row.number, path: info.path, byteHash: info.byteHash, colorHash: info.colorHash, colors: info.colors, tableOrder: info.tableOrder, partialAlphaCount: info.partialAlphaCount, partialAlphaIndexes: info.partialAlphaIndexes, provenance: { kind: 'imported-sprmake2-palette', definition: path.basename(filename), definitionHash, lineNumber: row.lineNumber, originalSource: row.sourceText, originalReverseAct: reverseAct } };
    paletteById.set(row.id, palette); importedPalettes.push(palette);
  }
  for (const id of usedPaletteIds) if (!paletteById.get(id)) throw new Error(`SprMake2 definition assigns stored palette ${id}, but [Pal] does not declare it exactly once.`);
  const ignoredPaletteRows = paletteRows.filter(row => !usedPaletteIds.has(row.id)).length;
  return { draft: mergeImportedSources(draft, imported, overrides, importedPalettes), importedCount: imported.length, importedPaletteCount: importedPalettes.length, recipe: path.basename(filename), recipeHash: definitionHash, recipeKind: 'DEF package', ignoredPaletteRows };
}

function importSprMake2Recipe(draft, filename) {
  const extension = path.extname(filename).toLowerCase();
  if (extension === '.csv') return importSprMake2Manifest(draft, filename);
  if (extension === '.def') return importSprMake2Definition(draft, filename);
  throw new Error('Choose a portable SprMake2 CSV manifest or DEF package definition.');
}

function scanPngFolder(root, options = {}) {
  const selectedRoot = path.resolve(root), rootStat = fs.statSync(selectedRoot);
  if (!rootStat.isDirectory()) throw new Error('Choose a folder containing PNG sprite sources.');
  const realRoot = fs.realpathSync(selectedRoot), recursive = options.recursive === true;
  const maximumFiles = Number.isSafeInteger(options.maximumFiles) ? options.maximumFiles : MAX_SOURCES;
  const maximumDepth = Number.isSafeInteger(options.maximumDepth) ? options.maximumDepth : 12;
  const maximumEntries = Number.isSafeInteger(options.maximumEntries) ? options.maximumEntries : Math.max(20000, maximumFiles * 10);
  if (maximumFiles < 1 || maximumDepth < 0 || maximumEntries < 1) throw new Error('Folder scan limits are invalid.');
  const files = [], skippedSymlinks = [], skippedSubfolders = [];
  let visitedEntries = 0;
  const inside = filename => {
    const relative = path.relative(realRoot, fs.realpathSync(filename));
    return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
  };
  const visit = (directory, depth) => {
    const entries = fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => naturalCompare(left.name, right.name));
    for (const entry of entries) {
      visitedEntries += 1;
      if (visitedEntries > maximumEntries) throw new Error(`Folder scan exceeded the ${maximumEntries}-entry safety limit. Choose a smaller folder or prepare smaller batches.`);
      const filename = path.join(directory, entry.name), relative = path.relative(selectedRoot, filename).replace(/\\/g, '/');
      const stat = fs.lstatSync(filename);
      if (stat.isSymbolicLink()) { skippedSymlinks.push(relative); continue; }
      if (!inside(filename)) throw new Error(`Folder entry resolves outside the selected folder: ${relative}.`);
      if (stat.isDirectory()) {
        if (!recursive) { skippedSubfolders.push(relative); continue; }
        if (depth >= maximumDepth) throw new Error(`Folder scan exceeded the ${maximumDepth}-level recursion limit at ${relative}. Choose a shallower folder or prepare smaller batches.`);
        visit(filename, depth + 1);
      } else if (stat.isFile() && /\.png$/i.test(entry.name)) {
        if (files.length >= maximumFiles) throw new Error(`Folder contains more than ${maximumFiles} PNG sources. No partial batch was added; choose a smaller folder.`);
        files.push(filename);
      }
    }
  };
  visit(selectedRoot, 0);
  return { root: selectedRoot, realRoot, recursive, files, skippedSymlinks, skippedSubfolders, visitedEntries, order: 'natural-relative-path' };
}

function mergeCreatorSources(draft, additions) {
  const byId = new Map((draft.sources || []).map(item => [item.id, item]));
  for (const item of additions || []) byId.set(item.id, item);
  if (byId.size > MAX_SOURCES) throw new Error(`This batch would exceed Creator's ${MAX_SOURCES}-source draft limit. No partial batch was added.`);
  draft.sources = [...byId.values()];
  return draft;
}

function persistFolderSources(projectRoot, scan) {
  if (!scan || !Array.isArray(scan.files) || !scan.root) throw new Error('The reviewed PNG folder scan is invalid.');
  const records = scan.files.map((filename, ordinal) => {
    const absolute = path.resolve(filename), relative = path.relative(path.resolve(scan.root), absolute);
    if (path.isAbsolute(relative) || relative === '..' || relative.startsWith(`..${path.sep}`) || path.extname(absolute).toLowerCase() !== '.png') throw new Error(`Folder source escapes the reviewed PNG folder: ${filename}.`);
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`Folder source is no longer a regular contained file: ${relative}.`);
    const realRoot = scan.realRoot || fs.realpathSync(scan.root), realFile = fs.realpathSync(absolute), realRelative = path.relative(realRoot, realFile);
    if (path.isAbsolute(realRelative) || realRelative === '..' || realRelative.startsWith(`..${path.sep}`)) throw new Error(`Folder source resolves outside the reviewed folder: ${relative}.`);
    const data = fs.readFileSync(absolute), byteHash = crypto.createHash('sha256').update(data).digest('hex').toUpperCase();
    // Parse before writing anything so one invalid PNG cannot leave a partial cache.
    inspectPreparedPng(data, relative);
    pngInfo(absolute);
    return { filename: absolute, ordinal, data, byteHash, relativePath: relative.replace(/\\/g, '/') };
  });
  const batchHash = crypto.createHash('sha256').update(JSON.stringify(records.map(item => [item.relativePath, item.byteHash]))).digest('hex');
  const cacheRoot = path.join(projectRoot, '.ikemen-tools', 'sff-creator', 'sources', batchHash, 'folder');
  const project = path.resolve(projectRoot), cacheRelative = path.relative(project, cacheRoot);
  if (path.isAbsolute(cacheRelative) || cacheRelative === '..' || cacheRelative.startsWith(`..${path.sep}`)) throw new Error('The Creator source cache is outside the current project.');
  let cursor = project;
  for (const part of cacheRelative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    if (fs.existsSync(cursor) && fs.lstatSync(cursor).isSymbolicLink()) throw new Error(`The Creator source cache path contains a symbolic link or junction: ${cursor}.`);
  }
  const writes = [];
  for (const record of records) {
    record.target = path.join(cacheRoot, `${String(record.ordinal).padStart(5, '0')}.png`);
    const target = record.target;
    if (fs.existsSync(target)) {
      const targetStat = fs.lstatSync(target);
      if (targetStat.isSymbolicLink() || !targetStat.isFile()) throw new Error(`The Creator source cache target is not a regular file: ${target}.`);
      const existingHash = crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex').toUpperCase();
      if (existingHash !== record.byteHash) throw new Error(`The Creator source cache contains different bytes for ${target}. The existing cache was not replaced.`);
    } else writes.push([target, record.data]);
  }
  if (writes.length) transactionalWriteSet(fs, writes, { label: 'sff-creator-folder-source-cache', allowExisting: false, backup: false, journal: false });
  const additions = records.map(record => {
    const sourceIdentity = `folder:${batchHash}:${record.relativePath}`;
    return sourceFromFile(record.target, { sourceIdentity, label: record.relativePath, provenance: { kind: 'png-folder-import', sourceIdentity, sourceFolder: scan.root, sourceFile: record.filename, sourceRelativePath: record.relativePath, sourceByteHash: record.byteHash, batchHash, sourceOrdinal: record.ordinal, recursive: scan.recursive, order: scan.order } });
  });
  return { additions, batchHash, cacheRoot };
}

async function exportFrameSequence(frames, source, suggestedPrefix, label) {
  const destination = await vscode.window.showOpenDialog({ title: `Choose a folder for the extracted ${label} PNG sequence`, canSelectFiles: false, canSelectFolders: true, canSelectMany: false });
  if (!destination?.[0]) return null;
  const prefix = await vscode.window.showInputBox({ title: 'PNG sequence filename prefix', value: safeLabel(suggestedPrefix, 'frame'), validateInput: value => String(value || '').trim() ? undefined : 'Enter a filename prefix.' });
  if (prefix === undefined) return null;
  const plan = planFrameSequenceExport(fs, frames, destination[0].fsPath, { prefix, start: 0, padding: 5, source });
  const result = executeFrameSequenceExport(fs, plan, { label: `sff-creator-export-${String(source.kind || 'sequence')}` });
  vscode.window.showInformationMessage(`Exported ${result.frames.length} PNG frame(s) and a provenance manifest to ${result.destination}.`);
  return result;
}

function persistCreatorFrames(root, frames, sourceHash, mode) {
  const safeMode = safeLabel(mode, 'sequence'), cacheRoot = path.join(root, '.ikemen-tools', 'sff-creator', 'sources', String(sourceHash).toLowerCase(), safeMode);
  const writes = [], retained = frames.map((frame, index) => {
    const data = fs.readFileSync(frame.filename), target = path.join(cacheRoot, `${String(index).padStart(5, '0')}.png`), digest = crypto.createHash('sha256').update(data).digest('hex');
    if (fs.existsSync(target)) {
      const existing = crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex');
      if (existing !== digest) throw new Error(`The Creator source cache contains different bytes for ${target}. The existing cache was not replaced.`);
    } else writes.push([target, data]);
    return { ...frame, filename: target };
  });
  if (writes.length) transactionalWriteSet(fs, writes, { label: 'sff-creator-source-cache', allowExisting: false, backup: false, journal: false });
  return retained;
}

function relinkCreatorSource(root, draft, sourceId, filename) {
  const current = safeDraft(draft), index = current.sources.findIndex(source => source.id === String(sourceId || ''));
  if (index < 0) throw new Error('The selected Creator source row no longer exists.');
  const prior = current.sources[index], expectedHash = String(prior.byteHash || '').toUpperCase();
  if (!/^[A-F0-9]{64}$/.test(expectedHash)) throw new Error('The selected source has no reviewed SHA-256 and cannot be relinked safely. Remove it and add the image as a new source.');
  const absolute = path.resolve(filename), bytes = fs.readFileSync(absolute); inspectPreparedPng(bytes, path.basename(absolute));
  const observedHash = crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase();
  if (observedHash !== expectedHash) throw new Error(`The selected PNG does not match the reviewed source bytes. Expected ${expectedHash}; found ${observedHash}. Remove the old row and add this changed artwork as a new source for review.`);
  const retained = persistCreatorFrames(root, [{ filename: absolute }], expectedHash, `relinked-${prior.id}`).at(0), provenance = prior.provenance && typeof prior.provenance === 'object' ? clone(prior.provenance) : {};
  const replacement = sourceFromFile(retained.filename, { sourceIdentity: provenance.creatorSourceIdentity || provenance.sourceIdentity || `relinked:${prior.id}`, ownerId: prior.ownerId, label: prior.name, provenance: { ...provenance, relinkedSourceFile: absolute, relinkedSourceByteHash: observedHash, relinkedFromUnavailablePath: prior.path } });
  replacement.id = prior.id; current.sources[index] = replacement;
  return { draft: current, source: replacement };
}

function unavailableSourceRecord(item) {
  if (!item || typeof item !== 'object' || !String(item.path || '').trim()) return null;
  const absolute = path.resolve(String(item.path)), sourceIdentity = item.provenance?.creatorSourceIdentity || item.provenance?.sourceIdentity;
  const identityBasis = sourceIdentity || (process.platform === 'win32' ? absolute.toLowerCase() : absolute);
  const computedId = `source-${crypto.createHash('sha256').update(identityBasis).digest('hex').slice(0, 20)}`, id = /^source-[a-f0-9]{20}$/i.test(String(item.id || '')) ? String(item.id).toLowerCase() : computedId;
  const number = (value, minimum = 0, maximum = 100000000) => Number.isSafeInteger(Number(value)) && Number(value) >= minimum && Number(value) <= maximum ? Number(value) : 0;
  const expectedHash = /^[a-f0-9]{64}$/i.test(String(item.byteHash || '')) ? String(item.byteHash).toUpperCase() : '';
  return {
    id, ownerId: typeof item.ownerId === 'string' && item.ownerId.length <= 200 ? item.ownerId : `unavailable-${id.slice(7)}`,
    path: absolute, name: String(item.name || path.basename(absolute)).slice(0, 500),
    width: number(item.width, 1), height: number(item.height, 1), bitDepth: number(item.bitDepth, 1, 64), colorType: number(item.colorType, 0, 6), byteLength: number(item.byteLength),
    decodedHash: typeof item.decodedHash === 'string' ? item.decodedHash : null, croppedDecodedHash: typeof item.croppedDecodedHash === 'string' ? item.croppedDecodedHash : null,
    paletteColorHash: typeof item.paletteColorHash === 'string' ? item.paletteColorHash : null,
    partialAlphaCount: number(item.partialAlphaCount, 0, 256), partialAlphaIndexes: Array.isArray(item.partialAlphaIndexes) ? item.partialAlphaIndexes.filter(value => Number.isSafeInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 255).map(Number).slice(0, 256) : [],
    cropBounds: item.cropBounds && typeof item.cropBounds === 'object' ? clone(item.cropBounds) : null, cropChanged: Boolean(item.cropChanged),
    byteHash: expectedHash, currentByteHash: '', stale: true, unavailable: true, provenance: item.provenance && typeof item.provenance === 'object' ? clone(item.provenance) : null
  };
}

function replacementRuleCoreFingerprint(value) {
  const body = clone(value && typeof value === 'object' ? value : {});
  delete body.replacementRuleAcceptances;
  delete body.workshopReturns;
  delete body.paletteAdaptationAcceptances;
  delete body.replacementRuleDraftFingerprint;
  return crypto.createHash('sha256').update(JSON.stringify(canonicalize(body))).digest('hex');
}

function safeDraft(value, admittedSourceBuffers = null) {
  const base = defaultDraft(), input = value && typeof value === 'object' ? value : {};
  const integrityIssues = [], addIntegrityIssue = (code, message) => {
    if (!integrityIssues.some(issue => issue.code === code)) integrityIssues.push({ code, message });
  };
  for (const issue of Array.isArray(input.integrityIssues) ? input.integrityIssues : []) {
    if (issue && typeof issue === 'object' && /^[a-z0-9-]{1,80}$/.test(String(issue.code || '')) && typeof issue.message === 'string' && issue.message.length <= 500) addIntegrityIssue(String(issue.code), issue.message);
  }
  const sourceRows = Array.isArray(input.sources) ? input.sources : [];
  if (input.sources !== undefined && !Array.isArray(input.sources)) addIntegrityIssue('sources-not-array', 'The recovered source list is malformed. Discard this draft or import an intact Creator plan.');
  if (sourceRows.length > MAX_SOURCES) addIntegrityIssue('sources-over-limit', `The recovered draft contains ${sourceRows.length} source rows, above the ${MAX_SOURCES}-source safety limit. No reduced batch can be applied.`);
  const seen = new Set(), verifiedOriginals = new Set(), sources = [];
  for (const item of sourceRows.slice(0, MAX_SOURCES)) {
    try {
      try { require('./sff_guided_intake').assertGuidedProvenance(item.provenance, verifiedOriginals); } catch (error) { addIntegrityIssue('guided-original-changed', error.message); }
      const admitted = admittedSourceBuffers instanceof Map ? admittedSourceBuffers.get(path.resolve(item.path)) : null;
      const observed = sourceFromFile(item.path, { sourceIdentity: item.provenance?.creatorSourceIdentity || item.provenance?.sourceIdentity, ownerId: item.ownerId, label: item.name, provenance: item.provenance }, admitted), expectedHash = String(item.byteHash || '').toUpperCase();
      if (/^source-[a-f0-9]{20}$/i.test(String(item.id || ''))) observed.id = String(item.id).toLowerCase();
      const source = expectedHash && expectedHash !== observed.byteHash
        ? { ...observed, byteHash: expectedHash, stale: true, currentByteHash: observed.byteHash }
        : observed;
      if (!seen.has(source.id)) { seen.add(source.id); sources.push(source); }
      else addIntegrityIssue('duplicate-source-identity', `The recovered draft contains duplicate source identity ${source.id}. The duplicate was quarantined and the draft cannot be applied.`);
    } catch (_) {
      const unavailable = unavailableSourceRecord(item);
      if (unavailable && !seen.has(unavailable.id)) { seen.add(unavailable.id); sources.push(unavailable); }
      else if (unavailable) addIntegrityIssue('duplicate-source-identity', `The recovered draft contains duplicate source identity ${unavailable.id}. The duplicate was quarantined and the draft cannot be applied.`);
      else addIntegrityIssue('invalid-source-row', 'The recovered draft contains a source row without a usable path or identity. The row was quarantined and the draft cannot be applied.');
    }
  }
  const sourceIds = new Set(sources.map(item => item.id));
  const raw = input.configuration && typeof input.configuration === 'object' ? input.configuration : {};
  for (const name of ['group','startIndex','step','offsetX','offsetY']) if (Object.hasOwn(raw,name) && (raw[name] === null || typeof raw[name] === 'string' && !raw[name].trim())) addIntegrityIssue('blank-'+name.toLowerCase(), `Enter an explicit whole-number ${name}; blank fields are not zero.`);
  const rawOverrides = raw.overrides && !Array.isArray(raw.overrides) && typeof raw.overrides === 'object' ? Object.entries(raw.overrides) : [];
  if (raw.overrides !== undefined && (!raw.overrides || Array.isArray(raw.overrides) || typeof raw.overrides !== 'object')) addIntegrityIssue('overrides-not-object', 'The recovered per-sprite override table is malformed. No reduced operation can be applied.');
  const validOverrides = [];
  for (const [id, item] of rawOverrides) {
    if (!sourceIds.has(id)) { addIntegrityIssue('orphan-source-override', `The recovered draft contains an override for missing source ${String(id).slice(0, 80)}. No reduced operation can be applied.`); continue; }
    if (!item || Array.isArray(item) || typeof item !== 'object') { addIntegrityIssue('invalid-source-override', `The recovered override for source ${String(id).slice(0, 80)} is malformed. No reduced operation can be applied.`); continue; }
    validOverrides.push([id, item]);
  }
  if (validOverrides.length > MAX_SOURCES) addIntegrityIssue('overrides-over-limit', `The recovered draft contains more than ${MAX_SOURCES} valid override rows. No reduced operation can be applied.`);
  const overrides = Object.fromEntries(validOverrides.slice(0, MAX_SOURCES));
  let target = null;
  if (input.target?.path) {
    try { target = targetFromFile(input.target.path, input.target.expectedFingerprint || input.target.fingerprint); }
    catch (_) { target = { ...input.target, path: path.resolve(input.target.path), stale: true, unavailable: true }; }
  }
  const targetPaletteIds = new Set((target?.palettes || []).map(item => item.id));
  let paletteMode = ['target', 'image', 'temporary', 'true-color', 'needs-palette'].includes(raw.paletteMode) ? raw.paletteMode : (target ? 'target' : 'image');
  if (!target && paletteMode === 'target') paletteMode = 'image';
  const newArchiveVersion = raw.newArchiveVersion === '2.0' ? '2.0' : '2.1', effectiveSffVersion = target?.sffVersion || newArchiveVersion;
  if (paletteMode === 'true-color' && effectiveSffVersion !== '2.1') paletteMode = 'needs-palette';
  const cropMode = paletteMode === 'true-color' ? 'none' : (['none', 'before-axis', 'after-axis', 'autocrop'].includes(raw.cropMode) ? raw.cropMode : 'none');
  const requestedPalette = String(input.addedSpritePaletteId || '').replace(/\s+/g, ''), requestedMasterPalette = String(raw.masterPaletteId || '').replace(/\s+/g, ''), masterPaletteId = targetPaletteIds.has(requestedMasterPalette) ? requestedMasterPalette : '', temporaryPaletteId = String(raw.temporaryPaletteId || '9,1').replace(/\s+/g, '');
  const temporaryPaletteTableOrder = normalizeOrder(raw.temporaryPaletteTableOrder);
  let temporaryPalette = null;
  if (raw.temporaryPalettePath) {
    try {
      const observed = paletteSourceInfo(raw.temporaryPalettePath, temporaryPaletteTableOrder), expectedHash = String(raw.temporaryPaletteByteHash || '').toUpperCase();
      temporaryPalette = { ...observed, stale: Boolean(expectedHash && expectedHash !== observed.byteHash), expectedByteHash: expectedHash || observed.byteHash };
    } catch (_) { temporaryPalette = { path: path.resolve(raw.temporaryPalettePath), stale: true, unavailable: true }; }
  }
  const importedPaletteRows = Array.isArray(raw.importedPalettes) ? raw.importedPalettes : [];
  if (raw.importedPalettes !== undefined && !Array.isArray(raw.importedPalettes)) addIntegrityIssue('palettes-not-array', 'The recovered imported-palette list is malformed. No reduced operation can be applied.');
  if (importedPaletteRows.length > MAX_SOURCES) addIntegrityIssue('palettes-over-limit', `The recovered draft contains ${importedPaletteRows.length} imported palette rows, above the ${MAX_SOURCES}-row safety limit. No reduced operation can be applied.`);
  const importedPalettes = [], importedPaletteIds = new Set();
  for (const item of importedPaletteRows.slice(0, MAX_SOURCES)) {
    const match = /^(\d+)\s*,\s*(\d+)$/.exec(String(item?.id || ''));
    if (!match || Number(match[1]) > 65535 || Number(match[2]) > 65535) { addIntegrityIssue('invalid-imported-palette', 'The recovered draft contains an imported palette with a missing, malformed, or out-of-range identity. The row was quarantined.'); continue; }
    const id = `${Number(match[1])},${Number(match[2])}`;
    if (importedPaletteIds.has(id)) { addIntegrityIssue('duplicate-imported-palette', `The recovered draft contains duplicate imported palette ${id}. The duplicate was quarantined.`); continue; }
    importedPaletteIds.add(id);
    try {
      const observed = paletteSourceInfo(item.path, item.tableOrder), expectedHash = String(item.byteHash || '').toUpperCase();
      importedPalettes.push({ ...item, id, group: Number(match[1]), number: Number(match[2]), path: observed.path, byteHash: expectedHash || observed.byteHash, colorHash: observed.colorHash, colors: observed.colors, tableOrder: observed.tableOrder, partialAlphaCount: observed.partialAlphaCount, partialAlphaIndexes: observed.partialAlphaIndexes, stale: Boolean(expectedHash && expectedHash !== observed.byteHash), currentByteHash: observed.byteHash });
    } catch (_) { importedPalettes.push({ ...item, id, group: Number(match[1]), number: Number(match[2]), path: path.resolve(String(item.path || '.')), stale: true, unavailable: true }); }
  }
  const placeholder = Boolean(raw.placeholder), temporaryPaletteLifecycleId = String(raw.temporaryPaletteLifecycleId || (placeholder && paletteMode === 'temporary' ? crypto.randomUUID() : '')).trim();
  const targetIdentitySet = new Set(target?.identities || []), normalizeRecoveredOperations = (value, label, limit, extraCheck = null) => {
    if (value !== undefined && !Array.isArray(value)) { addIntegrityIssue(`${label}-not-array`, `The recovered ${label} list is malformed. No reduced operation can be applied.`); return []; }
    const rows = Array.isArray(value) ? value : [];
    if (rows.length > limit) addIntegrityIssue(`${label}-over-limit`, `The recovered draft contains ${rows.length} ${label} rows, above the ${limit}-row safety limit. No reduced operation can be applied.`);
    const result = [], identities = new Set();
    for (const rawIdentity of rows.slice(0, limit)) {
      const compact = String(rawIdentity || '').replace(/\s+/g, ''), match = /^(\d+),(\d+)$/.exec(compact);
      if (!match || Number(match[1]) > 65535 || Number(match[2]) > 65535) { addIntegrityIssue(`invalid-${label}`, `The recovered draft contains a malformed or out-of-range ${label} identity. The row was quarantined.`); continue; }
      const identity = `${Number(match[1])},${Number(match[2])}`;
      if (identities.has(identity)) { addIntegrityIssue(`duplicate-${label}`, `The recovered draft contains duplicate ${label} identity ${identity}. The duplicate was quarantined.`); continue; }
      identities.add(identity);
      if (!target) { addIntegrityIssue(`${label}-without-target`, `The recovered draft contains ${label} rows without a reviewed target SFF. No reduced operation can be applied.`); continue; }
      if (!targetIdentitySet.has(identity)) { addIntegrityIssue(`missing-${label}-target`, `The recovered ${label} identity ${identity} is absent from its reviewed target. The row was quarantined.`); continue; }
      if (identity === '59000,0' || identity === '59000,1') { addIntegrityIssue(`protected-${label}`, `The recovered ${label} list includes protected template sprite ${identity}. The row was quarantined.`); continue; }
      if (extraCheck && !extraCheck(identity)) continue;
      result.push(identity);
    }
    return result;
  };
  const deletedSpriteIdentities = normalizeRecoveredOperations(input.deletedSpriteIdentities, 'deletion', 100000);
  const stagedOverrideIdentities = new Set(Object.values(overrides).filter(item => Number.isSafeInteger(Number(item.group)) && Number.isSafeInteger(Number(item.number))).map(item => `${Number(item.group)},${Number(item.number)}`));
  const replaceSpriteIdentities = normalizeRecoveredOperations(input.replaceSpriteIdentities, 'replacement', MAX_SOURCES, identity => {
    if (!stagedOverrideIdentities.has(identity)) { addIntegrityIssue('replacement-without-source', `The recovered replacement ${identity} has no exact staged source override. The row was quarantined.`); return false; }
    if (target?.duplicateSpriteIds?.includes(identity)) { addIntegrityIssue('ambiguous-replacement', `The recovered replacement ${identity} occurs more than once physically in its target. The row was quarantined.`); return false; }
    return true;
  });
  if (Array.isArray(raw.filenameRules) && raw.filenameRules.length > 32) addIntegrityIssue('filename-rules-over-limit', 'The recovered draft contains more than 32 filename rules. No truncated rule set can be applied.');
  if (raw.filenameRules !== undefined && !Array.isArray(raw.filenameRules)) addIntegrityIssue('filename-rules-not-array', 'The recovered filename-rule list is malformed. No reduced operation can be applied.');
  if (Array.isArray(raw.reservedRanges) && raw.reservedRanges.length > 1000) addIntegrityIssue('reserved-ranges-over-limit', 'The recovered draft contains more than 1000 reserved ranges. No truncated range set can be applied.');
  if (raw.reservedRanges !== undefined && !Array.isArray(raw.reservedRanges)) addIntegrityIssue('reserved-ranges-not-array', 'The recovered reserved-range list is malformed. No reduced operation can be applied.');
  const result = {
    version: 1, sources, deletedSpriteIdentities, replaceSpriteIdentities, target, integrityIssues,
    addedSpritePaletteId: paletteMode === 'temporary' ? temporaryPaletteId : (paletteMode === 'target' && target ? (targetPaletteIds.has(requestedPalette) ? requestedPalette : (target?.palettes?.[0]?.id || '')) : ''),
    existingIdentities: target ? target.identities : (Array.isArray(input.existingIdentities) ? input.existingIdentities.map(String).filter(value => /^-?\d+,-?\d+$/.test(value)).slice(0, 100000) : []),
    reviewConflictsOnly: Boolean(input.reviewConflictsOnly),
    configuration: {
      ...base.configuration, ...raw, png8Optimization: require('./sff_png8_optimization').normalizePng8Optimization(raw.png8Optimization), keepRecoveryBackup: raw.keepRecoveryBackup === true, gifAirAfterBuild: raw.gifAirAfterBuild === true, gifAirAction: Number.isInteger(raw.gifAirAction) ? raw.gifAirAction : null, overrides, paletteMode, cropMode, newArchiveVersion, placeholder, masterPaletteId, temporaryPaletteId, temporaryPaletteLifecycleId, temporaryPaletteTableOrder, imagePaletteTableOrder: normalizeOrder(raw.imagePaletteTableOrder), tilingMethod: ['single-palette','automatic-tiles','reviewed-tiles'].includes(raw.tilingMethod) ? raw.tilingMethod : 'single-palette', importedPalettes,
      temporaryPalettePath: temporaryPalette?.path || '', temporaryPaletteByteHash: temporaryPalette?.expectedByteHash || '', temporaryPaletteColorHash: temporaryPalette?.colorHash || '', temporaryPalettePartialAlphaCount: Number(temporaryPalette?.partialAlphaCount || 0), temporaryPalettePartialAlphaIndexes: temporaryPalette?.partialAlphaIndexes || [], temporaryPaletteStale: Boolean(temporaryPalette?.stale), temporaryPaletteUnavailable: Boolean(temporaryPalette?.unavailable),
      filenameRules: Array.isArray(raw.filenameRules) ? raw.filenameRules.slice(0, 32) : [],
      reservedRanges: Array.isArray(raw.reservedRanges) ? raw.reservedRanges.slice(0, 1000) : []
    }
  };
  const retainedFingerprint = String(input.replacementRuleDraftFingerprint || '').toLowerCase();
  const retainedAcceptances = Array.isArray(input.replacementRuleAcceptances) ? input.replacementRuleAcceptances : [];
  const retainedWorkshopReturns = Array.isArray(input.workshopReturns) ? input.workshopReturns : [];
  const retainedPaletteAdaptations = Array.isArray(input.paletteAdaptationAcceptances) ? input.paletteAdaptationAcceptances : [];
  let adaptationPayloadBytes = 0, adaptationOccurrenceCount = 0, adaptationPayloadBounded = retainedPaletteAdaptations.length <= 4096;
  if (adaptationPayloadBounded) try {
    for (const acceptance of retainedPaletteAdaptations) {
      adaptationPayloadBytes += Buffer.byteLength(JSON.stringify(acceptance), 'utf8');
      for (const decision of Object.values(acceptance?.resolutionPatch?.decisions || {})) adaptationOccurrenceCount += Array.isArray(decision?.includedOccurrenceIndexes) ? decision.includedOccurrenceIndexes.length : 0;
      if (!Number.isSafeInteger(adaptationPayloadBytes) || adaptationPayloadBytes > 8 * 1024 * 1024 || !Number.isSafeInteger(adaptationOccurrenceCount) || adaptationOccurrenceCount > unmatchedColors.MAX_UNMATCHED_OCCURRENCES) { adaptationPayloadBounded = false; break; }
    }
  } catch (_) { adaptationPayloadBounded = false; }
  if (retainedAcceptances.length <= 4096 && retainedWorkshopReturns.length <= 4096 && adaptationPayloadBounded && /^[0-9a-f]{64}$/.test(retainedFingerprint) && retainedFingerprint === replacementRuleCoreFingerprint(result)) {
    try { result.replacementRuleAcceptances = retainedAcceptances.map(verifyAcceptance); result.workshopReturns = retainedWorkshopReturns.map(verifyWorkshopReturn); result.paletteAdaptationAcceptances = retainedPaletteAdaptations.map(verifyPaletteAdaptationAcceptance); result.replacementRuleDraftFingerprint = retainedFingerprint; }
    catch (_) { result.replacementRuleAcceptances = []; result.workshopReturns = []; result.paletteAdaptationAcceptances = []; result.replacementRuleDraftFingerprint = ''; }
  } else { result.replacementRuleAcceptances = []; result.workshopReturns = []; result.paletteAdaptationAcceptances = []; result.replacementRuleDraftFingerprint = ''; }
  return result;
}

function replacementRuleBinding(root, draft, creatorGeneration, draftRevision) {
  const safe = safeDraft(draft);
  if (!safe.target?.path) throw new Error('Saved color rules require an existing target SFF and an exact embedded master palette.');
  if (!safe.sources.length) throw new Error('Add at least one sprite source before reviewing saved color rules.');
  const targetBytes = readStableBoundedFile(safe.target.path, MAX_REPLACEMENT_RULE_TARGET_BYTES, 'Saved-color-rule target SFF'), targetHash = crypto.createHash('sha256').update(targetBytes).digest('hex').toLowerCase();
  if (targetHash !== String(safe.target.expectedFingerprint || '').toLowerCase()) throw new Error('The target SFF changed after review. Choose it again before reviewing saved color rules.');
  const archive = parseSffBuffer(targetBytes, safe.target.path), masterId = String(safe.configuration.masterPaletteId || ''), matching = archive.palettes.filter(item => `${item.group},${item.number}` === masterId);
  if (matching.length !== 1) throw new Error('Choose one unambiguous embedded indexing/master palette before reviewing saved color rules.');
  const masterPalette = matching[0], colors = paletteRgba(archive, masterPalette.index), fingerprint = paletteFingerprint(colors).toLowerCase(), snapshot = readMasterSnapshot(masterLocation(safe.target.path, root));
  const protectedMatch = snapshot?.palette && Number(snapshot.palette.group) === masterPalette.group && Number(snapshot.palette.number) === masterPalette.number && String(snapshot.palette.fingerprint || '').toLowerCase() === fingerprint;
  const masterVersion = protectedMatch ? `protected:${String(snapshot.createdAt || fingerprint).slice(0, 180)}` : `embedded:${fingerprint}`;
  const planBySource = new Map((draftToPlan(safe).rows || []).map(row => [row.sourceId, row]));
  let totalSourceBytes = 0;
  const scanSources = safe.sources.map((source, order) => {
    const bytes = readStableBoundedFile(source.path, unmatchedColors.MAX_SOURCE_BYTES, `Saved-color-rule source ${source.name}`); totalSourceBytes += bytes.length;
    if (!Number.isSafeInteger(totalSourceBytes) || totalSourceBytes > unmatchedColors.MAX_TOTAL_SOURCE_BYTES) throw new Error(`Saved-color-rule sources exceed the ${unmatchedColors.MAX_TOTAL_SOURCE_BYTES}-byte aggregate review limit.`);
    const observed = crypto.createHash('sha256').update(bytes).digest('hex').toLowerCase();
    if (observed !== String(source.byteHash || '').toLowerCase()) throw new Error(`Source ${source.name} changed after review. Add it again before reviewing saved color rules.`);
    return { id: source.id, label: source.name, sourceHash: observed, bytes, order, plannedIdentity: planBySource.get(source.id)?.identity || '' };
  });
  const conversionProfile = 'sff-creator-indexed-exact-v1', alphaPolicy = 'exact-alpha';
  const scan = unmatchedColors.scan({ masterColors: colors, masterFingerprint: fingerprint, masterVersion, alphaPolicy, conversionProfile, sources: scanSources });
  const registry = new PaletteReplacementRuleStore(root).read();
  return {
    creatorGeneration, draftRevision, targetIdentity: path.resolve(safe.target.path), targetHash,
    master: { physicalIndex: masterPalette.index, colors, fingerprint, version: masterVersion },
    sources: scan.sourceEvidence.map(source => ({ id: source.sourceId, hash: source.sourceHash, decodedPixelHash: source.decodedPixelHash })), scan, registry,
    scope: { kind: 'character', id: path.resolve(safe.target.path).toLowerCase() }, conversionProfile, alphaPolicy
  };
}

function revalidateRetainedReplacementRuleAcceptance(root, draft) {
  const safe = safeDraft(draft), acceptances = safe.replacementRuleAcceptances || [], workshopReturns = safe.workshopReturns || [], paletteAdaptations = safe.paletteAdaptationAcceptances || [];
  if (!acceptances.length && !workshopReturns.length && !paletteAdaptations.length) return null;
  const provenance = acceptances[0]?.provenance?.binding || workshopReturns[0]?.provenance?.binding || paletteAdaptations[0]?.provenance?.binding || {}, creatorGeneration = Number(provenance.creatorGeneration), draftRevision = Number(provenance.draftRevision);
  if (!Number.isSafeInteger(creatorGeneration) || creatorGeneration < 0 || !Number.isSafeInteger(draftRevision) || draftRevision < 0) throw new Error('The retained saved-color-rule decision is missing its Creator revision evidence. Review the saved rules again.');
  const binding = replacementRuleBinding(root, safe, creatorGeneration, draftRevision), issueIds = new Set(); let resolved = {};
  for (const acceptance of acceptances) {
    const checked = revalidateAcceptance(acceptance, binding), patch = checked.resolutionPatch;
    for (const issueId of [...patch.acceptedIssueIds, ...patch.ignoredIssueIds]) { if (issueIds.has(issueId)) throw new Error(`Saved-color-rule issue ${issueId} has more than one retained decision.`); issueIds.add(issueId); }
    resolved = applyAcceptanceToDecisions(checked, binding, resolved).decisions;
  }
  for (const workshopReturn of workshopReturns) {
    const checked = revalidateWorkshopReturn(workshopReturn, binding); if (issueIds.has(checked.issueId)) throw new Error(`Saved-color-rule issue ${checked.issueId} has more than one retained decision.`); issueIds.add(checked.issueId);
    resolved = applyWorkshopReturnToDecisions(checked, binding, resolved).decisions;
  }
  for (const acceptance of paletteAdaptations) {
    const checked = revalidatePaletteAdaptationAcceptance(acceptance, binding), patch = checked.resolutionPatch;
    for (const issueId of patch.acceptedIssueIds) { if (issueIds.has(issueId)) throw new Error(`Unmatched-color issue ${issueId} has more than one retained decision.`); issueIds.add(issueId); }
    resolved = applyPaletteAdaptationAcceptanceToDecisions(checked, binding, resolved).decisions;
  }
  return { binding, acceptances, workshopReturns, paletteAdaptations, resolved, excludedIssueIds: [...issueIds] };
}

function relativeProjectPath(root, filename) {
  if (!filename) return '';
  const relative = path.relative(path.resolve(root), path.resolve(filename));
  return relative && !path.isAbsolute(relative) && !relative.split(path.sep).includes('..') ? relative.replace(/\\/g, '/') : '';
}

function serializeCreatorPlan(root, draft) {
  const safe = safeDraft(draft), pathHints = {
    sources: Object.fromEntries(safe.sources.map(source => [source.id, relativeProjectPath(root, source.path)]).filter(([, relative]) => relative)),
    target: relativeProjectPath(root, safe.target?.path),
    temporaryPalette: relativeProjectPath(root, safe.configuration.temporaryPalettePath),
    importedPalettes: Object.fromEntries((safe.configuration.importedPalettes || []).map(palette => [palette.id, relativeProjectPath(root, palette.path)]).filter(([, relative]) => relative))
  };
  return `${JSON.stringify({ kind: 'ikemaker-sff-creator-plan', version: 1, draft: safe, pathHints }, null, 2)}\n`;
}

function unresolvedPlanPath(root, category, identity, original, extension) {
  const digest = crypto.createHash('sha256').update(`${category}\0${identity}\0${original}`).digest('hex').slice(0, 24);
  return path.join(path.resolve(root), '.ikemen-tools', 'sff-creator', 'unresolved-plan', `${category}-${digest}${extension}`);
}

function resolveProjectPlanHint(root, value, extensions) {
  if (typeof value !== 'string' || !value || value.length > 2048 || value.includes('\0') || path.isAbsolute(value)) throw new Error('The Creator plan contains an unsafe project-relative path.');
  const base = path.resolve(root), candidate = path.resolve(base, value), relation = path.relative(base, candidate);
  if (!relation || path.isAbsolute(relation) || relation.split(path.sep).includes('..')) throw new Error('The Creator plan contains an unsafe project-relative path.');
  if (extensions && !extensions.includes(path.extname(candidate).toLowerCase())) throw new Error('The Creator plan path has an unexpected file type.');
  let cursor = base;
  for (const part of relation.split(path.sep)) {
    cursor = path.join(cursor, part);
    if (fs.existsSync(cursor) && fs.lstatSync(cursor).isSymbolicLink()) throw new Error('The Creator plan project-relative path contains a symbolic link or junction.');
  }
  if (fs.existsSync(candidate)) {
    const realBase = fs.realpathSync(base), realCandidate = fs.realpathSync(candidate), realRelation = path.relative(realBase, realCandidate);
    if (path.isAbsolute(realRelation) || realRelation === '..' || realRelation.startsWith(`..${path.sep}`)) throw new Error('The Creator plan project-relative path resolves outside the project.');
  }
  return candidate;
}

function parseCreatorPlan(root, content) {
  if (Buffer.byteLength(String(content || ''), 'utf8') > 16 * 1024 * 1024) throw new Error('The SFF Creator plan exceeds the 16 MiB safety limit.');
  let record; try { record = JSON.parse(String(content || '')); } catch (error) { throw new Error(`The SFF Creator plan is not valid JSON: ${error.message}`); }
  if (record?.kind !== 'ikemaker-sff-creator-plan' || record.version !== 1 || !record.draft || typeof record.draft !== 'object') throw new Error('This is not a supported IKEMaker SFF Creator plan.');
  const draft = JSON.parse(JSON.stringify(record.draft)), hints = record.pathHints && !Array.isArray(record.pathHints) && typeof record.pathHints === 'object' ? record.pathHints : {};
  if (Array.isArray(draft.integrityIssues) && draft.integrityIssues.length) throw new Error('The Creator plan records unresolved recovery-integrity issues and cannot be imported as a smaller operation. Repair or recreate the plan from reviewed sources.');
  const sources = Array.isArray(draft.sources) ? draft.sources : [];
  if (sources.length > MAX_SOURCES) throw new Error(`The Creator plan contains more than ${MAX_SOURCES} source rows.`);
  const sourceIds = new Set(), sourceHints = hints.sources && !Array.isArray(hints.sources) && typeof hints.sources === 'object' ? hints.sources : {};
  for (const source of sources) {
    if (!source || typeof source !== 'object' || !/^source-[a-f0-9]{20}$/i.test(String(source.id || '')) || sourceIds.has(String(source.id).toLowerCase())) throw new Error('The Creator plan contains a missing, invalid, or duplicate source identity.');
    source.id = String(source.id).toLowerCase(); sourceIds.add(source.id);
    if (!/^[a-f0-9]{64}$/i.test(String(source.byteHash || ''))) throw new Error(`The Creator plan source ${source.id} lacks an exact SHA-256 byte hash.`);
    const original = String(source.path || '');
    if (Object.prototype.hasOwnProperty.call(sourceHints, source.id)) source.path = resolveProjectPlanHint(root, sourceHints[source.id], ['.png']);
    else { source.path = unresolvedPlanPath(root, 'source', source.id, original, '.png'); source.provenance = { ...(source.provenance && typeof source.provenance === 'object' ? source.provenance : {}), planOriginalPath: original, planPathAuthority: 'unresolved-external' }; }
  }
  if (Object.keys(sourceHints).some(id => !sourceIds.has(String(id).toLowerCase()))) throw new Error('The Creator plan contains a path hint for an unknown source identity.');
  if (draft.target) {
    if (!/^[a-f0-9]{64}$/i.test(String(draft.target.expectedFingerprint || draft.target.fingerprint || ''))) throw new Error('The Creator plan target lacks an exact reviewed SHA-256 fingerprint.');
    const original = String(draft.target.path || '');
    if (Object.prototype.hasOwnProperty.call(hints, 'target') && hints.target) draft.target.path = resolveProjectPlanHint(root, hints.target, ['.sff']);
    else { draft.target.path = unresolvedPlanPath(root, 'target', String(draft.target.expectedFingerprint || draft.target.fingerprint || ''), original, '.sff'); draft.target.planOriginalPath = original; }
  } else if (Object.prototype.hasOwnProperty.call(hints, 'target') && hints.target) throw new Error('The Creator plan contains a target path hint without a reviewed target SFF.');
  draft.configuration = draft.configuration && typeof draft.configuration === 'object' ? draft.configuration : {};
  if (draft.configuration.temporaryPalettePath) {
    if (!/^[a-f0-9]{64}$/i.test(String(draft.configuration.temporaryPaletteByteHash || ''))) throw new Error('The Creator plan temporary palette lacks an exact SHA-256 byte hash.');
    const original = String(draft.configuration.temporaryPalettePath);
    if (Object.prototype.hasOwnProperty.call(hints, 'temporaryPalette') && hints.temporaryPalette) draft.configuration.temporaryPalettePath = resolveProjectPlanHint(root, hints.temporaryPalette, ['.act', '.png']);
    else { draft.configuration.temporaryPalettePath = unresolvedPlanPath(root, 'temporary-palette', String(draft.configuration.temporaryPaletteId || ''), original, path.extname(original).toLowerCase() === '.png' ? '.png' : '.act'); draft.configuration.temporaryPaletteOriginalPath = original; }
  } else if (Object.prototype.hasOwnProperty.call(hints, 'temporaryPalette') && hints.temporaryPalette) throw new Error('The Creator plan contains a temporary-palette path hint without a reviewed palette row.');
  const palettes = Array.isArray(draft.configuration.importedPalettes) ? draft.configuration.importedPalettes : [], paletteHints = hints.importedPalettes && !Array.isArray(hints.importedPalettes) && typeof hints.importedPalettes === 'object' ? hints.importedPalettes : {};
  if (palettes.length > MAX_SOURCES) throw new Error(`The Creator plan contains more than ${MAX_SOURCES} imported palette rows.`);
  const paletteIds = new Set();
  for (const palette of palettes) {
    const id = String(palette?.id || '').replace(/\s+/g, ''), original = String(palette?.path || '');
    if (!/^\d+,\d+$/.test(id) || id.split(',').some(value => Number(value) > 65535) || paletteIds.has(id)) throw new Error('The Creator plan contains a missing, out-of-range, or duplicate imported palette identity.');
    if (!/^[a-f0-9]{64}$/i.test(String(palette?.byteHash || ''))) throw new Error(`The Creator plan imported palette ${id || '(missing)'} lacks an exact SHA-256 byte hash.`);
    palette.id = id; paletteIds.add(id);
    if (Object.prototype.hasOwnProperty.call(paletteHints, id)) palette.path = resolveProjectPlanHint(root, paletteHints[id], ['.act', '.png']);
    else { palette.path = unresolvedPlanPath(root, 'imported-palette', id, original, path.extname(original).toLowerCase() === '.png' ? '.png' : '.act'); palette.planOriginalPath = original; }
  }
  if (Object.keys(paletteHints).some(id => !paletteIds.has(String(id).replace(/\s+/g, '')))) throw new Error('The Creator plan contains a path hint for an unknown imported palette identity.');
  const normalizeIdentityRows = (value, label, limit) => {
    if (value === undefined) return [];
    if (!Array.isArray(value)) throw new Error(`The Creator plan ${label} list is not an array.`);
    if (value.length > limit) throw new Error(`The Creator plan contains more than ${limit} ${label} rows.`);
    const normalized = value.map((identity, index) => {
      const compact = String(identity || '').replace(/\s+/g, ''), match = /^(\d+),(\d+)$/.exec(compact);
      if (!match || Number(match[1]) > 65535 || Number(match[2]) > 65535) throw new Error(`The Creator plan ${label} row ${index + 1} is not a valid SFF group,index identity.`);
      return `${Number(match[1])},${Number(match[2])}`;
    });
    if (new Set(normalized).size !== normalized.length) throw new Error(`The Creator plan contains a duplicate ${label} identity.`);
    if (normalized.length && !draft.target) throw new Error(`The Creator plan cannot contain ${label} rows without a target SFF.`);
    const targetIdentities = new Set(Array.isArray(draft.target?.identities) ? draft.target.identities.map(identity => String(identity).replace(/\s+/g, '')) : []);
    const missing = normalized.find(identity => !targetIdentities.has(identity));
    if (missing) throw new Error(`The Creator plan ${label} identity ${missing} is absent from its reviewed target SFF.`);
    const protectedIdentity = normalized.find(identity => identity === '59000,0' || identity === '59000,1');
    if (protectedIdentity) throw new Error(`The Creator plan ${label} identity ${protectedIdentity} is a protected template sprite.`);
    const ambiguous = normalized.find(identity => draft.target?.duplicateSpriteIds?.includes(identity));
    if (ambiguous) throw new Error(`The Creator plan ${label} identity ${ambiguous} occurs more than once physically in its reviewed target.`);
    return normalized;
  };
  draft.deletedSpriteIdentities = normalizeIdentityRows(draft.deletedSpriteIdentities, 'deletion', 100000);
  draft.replaceSpriteIdentities = normalizeIdentityRows(draft.replaceSpriteIdentities, 'replacement', MAX_SOURCES);
  const overrideIds = Object.keys(draft.configuration.overrides || {});
  if (overrideIds.some(id => !sourceIds.has(String(id).toLowerCase()))) throw new Error('The Creator plan contains an override for an unknown source identity.');
  const safe = safeDraft(draft);
  if (safe.sources.length !== sources.length || safe.sources.some((source, index) => source.id !== sources[index].id)) throw new Error('The Creator plan source identities could not be revalidated without changing its reviewed rows.');
  if (JSON.stringify(safe.deletedSpriteIdentities) !== JSON.stringify(draft.deletedSpriteIdentities)) throw new Error('The Creator plan deletion rows could not be revalidated without changing the reviewed operation.');
  if (JSON.stringify(safe.replaceSpriteIdentities) !== JSON.stringify(draft.replaceSpriteIdentities)) throw new Error('The Creator plan replacement rows could not be revalidated without changing the reviewed operation.');
  if (safe.configuration.importedPalettes.length !== palettes.length || safe.configuration.importedPalettes.some((palette, index) => palette.id !== palettes[index].id)) throw new Error('The Creator plan imported palette rows could not be revalidated without changing the reviewed operation.');
  if (safe.integrityIssues.length) throw new Error(`The Creator plan could not be revalidated without quarantining reviewed data: ${safe.integrityIssues[0].message}`);
  return safe;
}

function draftToPlan(draft) {
  const safe = safeDraft(draft);
  if (!safe.sources.length) return { rows: [], conflicts: [], skipped: [], ready: [], summary: { sources: 0, ready: 0, blocked: 0, skipped: 0 } };
  const replacements = new Set(safe.replaceSpriteIdentities || []), plan = planSpriteIntake(safe.sources, safe.configuration, safe.existingIdentities.filter(identity => !replacements.has(identity)));
  for (const row of plan.ready) if (replacements.has(row.identity)) row.resolution = 'replace-active';
  return plan;
}

function duplicateGroupAnalysis(plan, draft) {
  const ready = Array.isArray(plan?.ready) ? plan.ready : [], groups = new Map(), unclassified = [];
  let independentSourceBytes = 0;
  for (const row of ready) {
    const source = row.source || {}, beforeAxis = row.cropMode === 'before-axis', bounds = beforeAxis ? source.cropBounds : null;
    const decodedHash = beforeAxis ? source.croppedDecodedHash : source.decodedHash;
    const width = beforeAxis ? bounds?.width : source.width, height = beforeAxis ? bounds?.height : source.height;
    const sourceBytes = Number.isSafeInteger(source.byteLength) && source.byteLength >= 0 ? source.byteLength : 0;
    independentSourceBytes += sourceBytes;
    if (!decodedHash || !width || !height) { unclassified.push({ sourceId: row.sourceId, identity: row.identity, name: source.name || row.sourceId, reason: 'Decoded indexed-pixel evidence is unavailable.' }); continue; }
    const importedPalette = (draft?.configuration?.importedPalettes || []).find(palette => palette.id === row.paletteId), targetPalette = draft?.target?.palettes?.find(palette => palette.id === row.paletteId);
    const paletteKey = row.paletteId ? `stored:${row.paletteId}:${importedPalette?.colorHash || targetPalette?.colorHash || ''}` : draft?.configuration?.paletteMode === 'temporary'
      ? `temporary:${draft.configuration.temporaryPaletteId}:${draft.configuration.temporaryPaletteColorHash || ''}`
      : draft?.configuration?.paletteMode === 'image' ? `source:${source.paletteColorHash || ''}`
        : draft?.target ? `target:${draft.addedSpritePaletteId || ''}` : `source:${source.paletteColorHash || ''}`;
    const key = JSON.stringify([decodedHash, width, height, paletteKey]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ sourceId: row.sourceId, identity: row.identity, name: source.name || row.sourceId, sourceBytes });
  }
  const duplicates = [...groups.values()].filter(items => items.length > 1);
  let sharedSourceBytes = independentSourceBytes;
  for (const items of duplicates) sharedSourceBytes -= items.slice(1).reduce((sum, item) => sum + item.sourceBytes, 0);
  return {
    exactGroupCount: duplicates.length,
    duplicateSpriteCount: duplicates.reduce((sum, items) => sum + items.length, 0),
    linkCandidateCount: duplicates.reduce((sum, items) => sum + items.length - 1, 0),
    independentSourceBytes, sharedSourceBytes,
    estimatedSourceBytesSaved: Math.max(0, independentSourceBytes - sharedSourceBytes),
    unclassifiedCount: unclassified.length,
    groups: duplicates.map((items, index) => ({ groupNumber: index + 1, members: items })), unclassified
  };
}

function imagePaletteAllocation(draft, plan) {
  if (!draft?.target || draft.configuration?.paletteMode !== 'image') return null;
  const group = Number(draft.configuration.imagePaletteGroup);
  if (!Number.isSafeInteger(group) || group < 0 || group > 65535) throw new Error('Image palette group must be an integer from 0 through 65535.');
  const ready = (Array.isArray(plan?.ready) ? plan.ready : []).filter(row => !row.paletteId);
  if (!ready.length) return null;
  const missing = ready.filter(row => !row.source?.paletteColorHash);
  if (missing.length) throw new Error(`${missing.length} source(s) cannot supply an indexed 256-color image palette.`);
  const occupied = (draft.target.palettes || []).filter(item => Number(item.group) === group).map(item => Number(item.number)).filter(Number.isSafeInteger);
  const start = occupied.length ? Math.max(...occupied) + 1 : 0, end = start + ready.length - 1;
  if (start > 65535 || end > 65535) throw new Error(`Image palette group ${group} cannot append ${ready.length} palette(s); the 0–65535 range is exhausted.`);
  return { group, start, end, count: ready.length, assignments: ready.map((row, index) => ({ sourceId: row.sourceId, spriteIdentity: row.identity, paletteId: `${group},${start + index}` })) };
}

function applyState(draft) {
  if (Array.isArray(draft.integrityIssues) && draft.integrityIssues.length) return { enabled: false, reason: `Recovered draft integrity check failed: ${draft.integrityIssues[0].message} Discard this draft or import an intact reviewed plan.` };
  const deletions = Array.isArray(draft.deletedSpriteIdentities) ? [...new Set(draft.deletedSpriteIdentities.map(String))] : [];
  const replacements = Array.isArray(draft.replaceSpriteIdentities) ? [...new Set(draft.replaceSpriteIdentities.map(String))] : [];
  if (!draft.sources.length && !deletions.length) return { enabled: false, reason: 'Choose at least one PNG source or stage a sprite deletion.' };
  if (deletions.length && !draft.target) return { enabled: false, reason: 'Sprite deletion requires an existing target SFF.' };
  if (draft.target?.stale) return { enabled: false, reason: draft.target.unavailable ? 'The selected target SFF is unavailable or invalid. Choose it again.' : 'The selected target SFF changed after review. Choose it again to refresh the reviewed fingerprint.' };
  if (replacements.length && !draft.target) return { enabled: false, reason: 'Sprite replacement requires an existing target SFF.' };
  const temporaryMode = draft.configuration.paletteMode === 'temporary';
  const imageMode = draft.configuration.paletteMode === 'image';
  const trueColorMode = draft.configuration.paletteMode === 'true-color';
  if (draft.sources.length && temporaryMode) {
    if (!draft.configuration.placeholder) return { enabled: false, reason: 'Temporary palettes require the incoming batch to be marked as placeholders.' };
    if (!/^\d+,\d+$/.test(draft.configuration.temporaryPaletteId)) return { enabled: false, reason: 'Enter the temporary palette as group,index.' };
    const [group, number] = draft.configuration.temporaryPaletteId.split(',').map(Number);
    if (group > 65535 || number > 65535) return { enabled: false, reason: 'Temporary palette group and index must be within 0–65535.' };
    if (draft.target?.palettes?.some(item => item.id === draft.configuration.temporaryPaletteId)) return { enabled: false, reason: `Temporary palette ${draft.configuration.temporaryPaletteId} already exists in the target. Choose an unused identity.` };
    if (!draft.configuration.temporaryPalettePath) return { enabled: false, reason: 'Choose one ACT or indexed PNG for the temporary palette.' };
    if (draft.configuration.temporaryPaletteStale) return { enabled: false, reason: 'The temporary palette source changed or is unavailable. Choose it again.' };
    if (!draft.configuration.temporaryPaletteLifecycleId) return { enabled: false, reason: 'The temporary palette lifecycle identity is missing. Toggle placeholder mode again.' };
    const incompatible = draft.sources.filter(source => source.paletteColorHash !== draft.configuration.temporaryPaletteColorHash);
    if (incompatible.length) return { enabled: false, reason: `${incompatible.length} source(s) do not exactly use the temporary palette. Mark them and apply the selected palette before building.` };
  }
  const stale = draft.sources.filter(source => source.stale), unavailable = stale.filter(source => source.unavailable).length, changed = stale.length - unavailable;
  if (stale.length) return { enabled: false, reason: `${unavailable ? `${unavailable} PNG source(s) are unavailable or invalid${changed ? ` and ${changed} changed` : ''}` : `${changed} PNG source(s) changed`} after review. Add the affected files again to explicitly refresh them; no staged row was discarded.` };
  let plan;
  try { plan = draftToPlan(draft); } catch (error) { return { enabled: false, reason: error.message }; }
  if (draft.configuration.paletteMode === 'needs-palette') return { enabled: false, reason: 'Needs Palette is a preparation route. Continue to Palette Workshop with the selected reduction or tiling method before building.', plan };
  if (draft.configuration.paletteMode === 'true-color') {
    const version = draft.target?.sffVersion || draft.configuration.newArchiveVersion || '2.1';
    if (version !== '2.1') return { enabled: false, reason: `SFF ${version} cannot store true-color sprites. Use Needs Palette for this archive version.`, plan };
    const incompatible = plan.ready.filter(row => ![2, 6].includes(Number(row.source?.colorType)) || Number(row.source?.bitDepth) !== 8 || !row.source?.decodedHash);
    if (incompatible.length) return { enabled: false, reason: `${incompatible.length} source(s) are not sealed 8-bit RGB or RGBA PNG images. Choose Needs Palette for indexed or unsupported artwork.`, plan };
  }
  const importedPalettes = Array.isArray(draft.configuration.importedPalettes) ? draft.configuration.importedPalettes : [], importedPaletteIds = new Set(importedPalettes.map(palette => palette.id)), targetPaletteIds = new Set((draft.target?.palettes || []).map(palette => palette.id));
  const staleImported = importedPalettes.find(palette => palette.stale || palette.unavailable);
  if (staleImported) return { enabled: false, reason: `Imported recipe palette ${staleImported.id} changed or is unavailable. Re-import the portable SprMake2 definition.`, plan };
  const importedCollision = importedPalettes.find(palette => targetPaletteIds.has(palette.id));
  if (importedCollision) return { enabled: false, reason: `Imported recipe palette ${importedCollision.id} collides with the attached target SFF. Choose a new archive or review the palette identity in the legacy definition.`, plan };
  const unresolvedStored = plan.ready.find(row => row.paletteId && !importedPaletteIds.has(row.paletteId) && !targetPaletteIds.has(row.paletteId));
  if (unresolvedStored) return { enabled: false, reason: `Sprite ${unresolvedStored.identity} references stored palette ${unresolvedStored.paletteId}, but that palette is not available in the imported recipe or target SFF.`, plan };
  const ambiguousStored = plan.ready.find(row => row.paletteId && draft.target?.duplicatePaletteIds?.includes(row.paletteId));
  if (ambiguousStored) return { enabled: false, reason: `Sprite ${ambiguousStored.identity} references target palette ${ambiguousStored.paletteId}, which occurs more than once physically.`, plan };
  for (const row of plan.ready.filter(item => item.indexingPaletteId)) {
    if (!draft.target) return { enabled: false, reason: `Sprite ${row.identity} declares indexing palette ${row.indexingPaletteId} without an attached target SFF.`, plan };
    const matches = (draft.target.palettes || []).filter(palette => palette.id === row.indexingPaletteId);
    if (matches.length !== 1) return { enabled: false, reason: `Sprite ${row.identity} indexing palette ${row.indexingPaletteId} is missing or ambiguous in the target SFF.`, plan };
    if (row.source?.paletteColorHash !== matches[0].colorHash) return { enabled: false, reason: `Sprite ${row.identity} is not indexed by its reviewed indexing palette ${row.indexingPaletteId}. Re-run the reviewed remap.`, plan };
  }
  const unassignedRows = plan.ready.filter(row => !row.paletteId);
  if (!temporaryMode && !imageMode && !trueColorMode && unassignedRows.length && draft.target?.duplicatePaletteIds?.includes(draft.addedSpritePaletteId)) return { enabled: false, reason: `The selected target palette ${draft.addedSpritePaletteId} occurs more than once physically. Choose a unique palette identity or repair the palette table first.`, plan };
  if (draft.sources.length && draft.target && !imageMode && !temporaryMode && !trueColorMode && unassignedRows.length && !draft.addedSpritePaletteId) return { enabled: false, reason: 'Choose the embedded target palette for the added sprites.', plan };
  if (draft.sources.length && draft.target && !temporaryMode && !imageMode && !trueColorMode && unassignedRows.length) {
    const targetPalette = draft.target.palettes?.find(item => item.id === draft.addedSpritePaletteId), unassignedIds = new Set(unassignedRows.map(row => row.sourceId)), incompatible = draft.sources.filter(source => unassignedIds.has(source.id) && (!targetPalette?.colorHash || source.paletteColorHash !== targetPalette.colorHash));
    if (incompatible.length) return { enabled: false, reason: `${incompatible.length} source(s) do not exactly use target palette ${draft.addedSpritePaletteId}. Mark them and use “Apply Selected Target Palette” before building.`, plan };
  }
  for (const row of plan.ready) {
    const evidence = row.axisEvidence;
    if (!evidence) continue;
    if (!evidence.evidence || evidence.evidence.algorithmVersion !== 1 || !['alpha-bottom-center', 'alpha-bounds-center', 'alpha-top-center', 'alpha-left-center', 'alpha-right-center', 'reference-silhouette', 'multi-reference-consensus'].includes(String(evidence.method)) || !['high', 'review', 'low'].includes(String(evidence.confidenceLabel)) || !Number.isFinite(Number(evidence.confidence)) || Number(evidence.confidence) < 0 || Number(evidence.confidence) > 1 || Buffer.byteLength(JSON.stringify(evidence), 'utf8') > 32768) return { enabled: false, reason: `Sprite ${row.identity} has invalid or oversized automatic-axis evidence. Run the suggestion again or enter the axis manually.`, plan };
    if (evidence.proposedAxisX !== row.axisX || evidence.proposedAxisY !== row.axisY || evidence.evidence.sourceId !== row.sourceId || String(evidence.evidence.sourceImageHash || '').toUpperCase() !== String(row.source.byteHash || '').toUpperCase()) return { enabled: false, reason: `Sprite ${row.identity} changed after its automatic-axis suggestion. Run the suggestion again or enter the axis manually.`, plan };
    const sourceBasis = evidence.evidence.sourceCoordinateBasis || {}, rowBasis = row.axisBasis || {};
    if (sourceBasis.stage !== rowBasis.stage || Number(sourceBasis.width) !== Number(rowBasis.width) || Number(sourceBasis.height) !== Number(rowBasis.height)) return { enabled: false, reason: `Sprite ${row.identity} changed crop coordinate space after its automatic-axis suggestion. Review its axis again.`, plan };
    for (const reference of Array.isArray(evidence.evidence.references) ? evidence.evidence.references : []) {
      const referenceRow = plan.ready.find(item => item.sourceId === reference.sourceId);
      const targetIssue = referenceRow ? '' : targetAxisReferenceIssue(draft, reference);
      if (targetIssue || (referenceRow && (referenceRow.axisX !== reference.axisX || referenceRow.axisY !== reference.axisY || String(referenceRow.source?.byteHash || '').toUpperCase() !== String(reference.imageHash || '').toUpperCase() || referenceRow.axisBasis?.stage !== reference.coordinateBasis?.stage || Number(referenceRow.axisBasis?.width) !== Number(reference.coordinateBasis?.width) || Number(referenceRow.axisBasis?.height) !== Number(reference.coordinateBasis?.height)))) return { enabled: false, reason: `${targetIssue || `A trusted staged reference for sprite ${row.identity} changed after the suggestion.`} Review its automatic axis again.`, plan };
    }
    if (evidence.visualReviewStatus !== 'approved') return { enabled: false, reason: `Preview and visually approve the suggested axis for sprite ${row.identity} before creating or building a package.`, plan };
  }
  plan.duplicateAnalysis = duplicateGroupAnalysis(plan, draft);
  if (plan.conflicts.length) return { enabled: false, reason: `Resolve ${plan.conflicts.length} numbering or reservation conflict(s) first.` };
  if (!plan.ready.length && !deletions.length) return { enabled: false, reason: 'The reviewed plan has no ready sprites or deletions.' };
  const duplicateDeletion = deletions.find(identity => draft.target?.duplicateSpriteIds?.includes(identity));
  if (duplicateDeletion) return { enabled: false, reason: `Sprite ${duplicateDeletion} occurs more than once physically, so deleting it by identity is ambiguous.` , plan };
  const missingDeletion = deletions.find(identity => !draft.target?.identities?.includes(identity));
  if (missingDeletion) return { enabled: false, reason: `Sprite ${missingDeletion} no longer exists in the reviewed target.` , plan };
  const protectedDeletion = deletions.find(identity => identity === '59000,0' || identity === '59000,1');
  if (protectedDeletion) return { enabled: false, reason: `Protected template sprite ${protectedDeletion} cannot be deleted through a batch plan.` , plan };
  if (draft.target && deletions.length >= draft.target.spriteCount) return { enabled: false, reason: 'A deletion plan must leave at least one sprite in the SFF.', plan };
  const replaceAndDelete = plan.ready.find(row => deletions.includes(row.identity));
  if (replaceAndDelete) return { enabled: false, reason: `Sprite ${replaceAndDelete.identity} cannot be deleted and replaced in the same reviewed build.`, plan };
  for (const identity of replacements) {
    if ((draft.target?.identities || []).filter(item => item === identity).length !== 1) return { enabled: false, reason: `Replacement ${identity} no longer resolves to exactly one physical target sprite.`, plan };
    if (plan.ready.filter(row => row.identity === identity).length !== 1) return { enabled: false, reason: `Replacement ${identity} must resolve to exactly one staged source row.`, plan };
  }
  const undeclaredReplacement = plan.ready.find(row => draft.target?.identities?.includes(row.identity) && !replacements.includes(row.identity));
  if (undeclaredReplacement) return { enabled: false, reason: `Sprite ${undeclaredReplacement.identity} collides with the active archive without an explicit replacement request.`, plan };
  plan.deletedSpriteIdentities = deletions;
  plan.replaceSpriteIdentities = replacements;
  if (draft.target && deletions.length) {
    try { plan.temporaryPaletteCleanup = archiveTemporaryPaletteCleanupReview(draft.target.path, readSff(draft.target.path), deletions); }
    catch (error) { plan.temporaryPaletteCleanup = { eligible: [], blocked: [{ lifecycleId: '', paletteId: '', eligible: false, action: 'keep', reasons: [`Cleanup review unavailable: ${error.message}`] }] }; }
  } else plan.temporaryPaletteCleanup = { eligible: [], blocked: [] };
  try { plan.imagePaletteAllocation = imagePaletteAllocation(draft, plan); } catch (error) { return { enabled: false, reason: error.message, plan }; }
  const removedTemporaryPaletteIds = new Set((plan.temporaryPaletteCleanup?.eligible || []).map(item => item.paletteId));
  const retainedPartialTargetPalettes = (draft.target?.palettes || []).filter(item => item.partialAlphaCount > 0 && !removedTemporaryPaletteIds.has(item.id));
  const partialSourceRows = plan.ready.filter(row => Number(row.source?.partialAlphaCount || 0) > 0);
  plan.sprMake2Limitations = [
    ...retainedPartialTargetPalettes.map(item => `Target palette ${item.id} has ${item.partialAlphaCount} partially transparent color entr${item.partialAlphaCount === 1 ? 'y' : 'ies'}.`),
    ...(imageMode ? partialSourceRows.map(row => `Sprite ${row.identity}'s image palette has ${row.source.partialAlphaCount} partially transparent color entr${row.source.partialAlphaCount === 1 ? 'y' : 'ies'}.`) : []),
    ...(temporaryMode && Number(draft.configuration.temporaryPalettePartialAlphaCount || 0) > 0 ? [`Temporary palette ${draft.configuration.temporaryPaletteId} has ${draft.configuration.temporaryPalettePartialAlphaCount} partially transparent color entries.`] : [])
  ];
  const legacyAutocropRows = plan.ready.filter(row => row.cropMode === 'autocrop');
  plan.builtInLimitations = legacyAutocropRows.length
    ? [`${legacyAutocropRows.length} sprite${legacyAutocropRows.length === 1 ? '' : 's'} use legacy SprMake2 autocrop without a sealed final crop snapshot.`]
    : [];
  const duplicatePolicies = new Set(plan.ready.map(row => row.duplicatePolicy));
  if (duplicatePolicies.size > 1) plan.sprMake2Limitations.push('This plan mixes per-sprite identical-data choices, while SprMake2 exposes one build-wide duplicate switch. Create Package Only retains the exact choices for the built-in specification; SprMake2 Build and Compare Both remain unavailable.');
  if (plan.ready.some(row => row.group < 0 || row.group > 65535 || row.number < 0 || row.number > 65535)) return { enabled: false, reason: 'Every SFF group and index must be within 0–65535.' };
  if (plan.ready.some(row => row.axisX < -32768 || row.axisX > 32767 || row.axisY < -32768 || row.axisY > 32767)) return { enabled: false, reason: 'Every SFF axis coordinate must fit the signed 16-bit range.' };
  if (!trueColorMode && plan.ready.some(row => row.paletteChoice !== 'own-png-palette')) return { enabled: false, reason: 'This slice can only preserve each PNG palette. Shared palette selection is not implemented yet.' };
  return { enabled: true, reason: plan.sprMake2Limitations.join(' '), plan };
}

function creatorPaletteReview(draft, row, source, context = {}) {
  const explicitId = String(row?.paletteId || '').replace(/\s+/g, '');
  const mode = draft.configuration.paletteMode;
  const effectiveId = explicitId || (mode === 'target' ? String(draft.addedSpritePaletteId || '') : mode === 'temporary' ? String(draft.configuration.temporaryPaletteId || '') : '');
  if (!effectiveId) return { id: '', colors: null, colorHash: source?.paletteColorHash || '', label: 'Image palette' };
  const imported = (draft.configuration.importedPalettes || []).find(palette => palette.id === effectiveId);
  if (imported) {
    if (imported.stale || imported.unavailable || !Array.isArray(imported.colors) || imported.colors.length !== 256) throw new Error(`Imported recipe palette ${effectiveId} changed or is unavailable.`);
    return { id: effectiveId, colors: imported.colors, colorHash: imported.colorHash, label: `Imported stored palette ${effectiveId}` };
  }
  if (mode === 'temporary' && effectiveId === draft.configuration.temporaryPaletteId) {
    if (!draft.configuration.temporaryPalettePath || draft.configuration.temporaryPaletteStale) throw new Error(`Temporary palette ${effectiveId} changed or is unavailable.`);
    const info = paletteSourceInfo(draft.configuration.temporaryPalettePath, draft.configuration.temporaryPaletteTableOrder);
    return { id: effectiveId, colors: info.colors, colorHash: info.colorHash, label: `Temporary palette ${effectiveId}` };
  }
  if (draft.target?.path) {
    const matches = (draft.target.palettes || []).filter(palette => palette.id === effectiveId);
    if (matches.length !== 1) throw new Error(`Target palette ${effectiveId} is missing or ambiguous.`);
    const archive = context.targetArchive || readSff(draft.target.path);
    context.targetArchive = archive;
    const observed = crypto.createHash('sha256').update(archive.buffer).digest('hex').toLowerCase();
    if (observed !== String(draft.target.expectedFingerprint || '').toLowerCase()) throw new Error('The target SFF changed before palette-aware preview. Choose it again.');
    const palette = archive.palettes[matches[0].physicalIndex];
    return { id: effectiveId, colors: paletteRgba(archive, palette.index), colorHash: matches[0].colorHash, label: `${effectiveId === '1,1' ? 'Master' : 'Stored/FX'} palette ${effectiveId}` };
  }
  throw new Error(`Stored palette ${effectiveId} is not available for preview.`);
}

function paletteAwarePreview(bytes, palette) {
  if (!palette?.colors) return bytes;
  const decoded = readIndexedPng8(bytes, { maxPixels: 64 * 1024 * 1024 });
  return encodeIndexed(decoded.width, decoded.height, decoded.indices, palette.colors);
}

function spriteAxisPreviewPayload(draft, sourceId) {
  const safe = safeDraft(draft), plan = draftToPlan(safe), row = plan.ready.find(item => item.sourceId === String(sourceId || ''));
  if (!row) throw new Error('The marked source has no ready axis/crop proposal. Resolve its conflict before previewing it.');
  const source = safe.sources.find(item => item.id === row.sourceId), bytes = fs.readFileSync(source.path), observed = crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase();
  if (observed !== String(source.byteHash).toUpperCase()) throw new Error('The marked source changed after review. Add it again before previewing.');
  if (bytes.length > 64 * 1024 * 1024) throw new Error('The marked PNG exceeds the 64 MiB interactive preview limit. Its numeric review remains available.');
  const palette = creatorPaletteReview(safe, row, source), previewBytes = paletteAwarePreview(bytes, palette), cropBounds = row.cropMode === 'none' ? null : source.cropBounds;
  const cropLabels = { none: 'no crop', 'before-axis': 'crop source before calculating axis', 'after-axis': 'calculate axis before crop', autocrop: 'legacy SprMake2 autocrop' };
  return { type: 'spriteAxisPreview', sourceId: row.sourceId, name: source.name, identity: row.identity, axisX: row.axisX, axisY: row.axisY, displayAxisX: row.axisX + (row.cropMode === 'before-axis' ? Number(cropBounds?.x || 0) : 0), displayAxisY: row.axisY + (row.cropMode === 'before-axis' ? Number(cropBounds?.y || 0) : 0), axisBasis: row.axisBasis, cropMode: row.cropMode, cropLabel: cropLabels[row.cropMode], cropBounds, requiresAxisReview: row.axisEvidence?.visualReviewStatus === 'pending', paletteId: palette.id, paletteLabel: palette.label, paletteColorHash: palette.colorHash, dataUri: `data:image/png;base64,${previewBytes.toString('base64')}` };
}

const SOURCE_THUMBNAIL_LIMIT = 48;
const SOURCE_THUMBNAIL_EDGE = 96;
const SOURCE_THUMBNAIL_MAX_PIXELS = 16 * 1024 * 1024;
const SOURCE_THUMBNAIL_BATCH_PIXELS = 32 * 1024 * 1024;

function sourceThumbnailPayload(draft, sourceIds) {
  const safe = safeDraft(draft), requested = [...new Set((Array.isArray(sourceIds) ? sourceIds : []).map(String))];
  if (requested.length > SOURCE_THUMBNAIL_LIMIT) throw new Error(`A contact-sheet page may request at most ${SOURCE_THUMBNAIL_LIMIT} thumbnails.`);
  let plannedRows;
  try { plannedRows = draftToPlan(safe).rows; }
  catch (_) { plannedRows = safe.sources.map(source => ({ sourceId: source.id, paletteId: safe.configuration.overrides[source.id]?.paletteId || null })); }
  const sources = new Map(safe.sources.map(source => [source.id, source])), rows = new Map(plannedRows.map(row => [row.sourceId, row])), items = [], context = {};
  let decodedPixels = 0;
  for (const sourceId of requested) {
    const source = sources.get(sourceId);
    if (!source) { items.push({ sourceId, error: 'The source is no longer in this Creator draft.' }); continue; }
    const row = rows.get(sourceId), mode = safe.configuration.paletteMode, requestedPaletteId = row?.paletteId || (mode === 'target' ? safe.addedSpritePaletteId : mode === 'temporary' ? safe.configuration.temporaryPaletteId : ''), paletteMetadata = (safe.configuration.importedPalettes || []).find(item => item.id === requestedPaletteId) || (safe.target?.palettes || []).find(item => item.id === requestedPaletteId), requestedColorHash = paletteMetadata?.colorHash || (mode === 'temporary' ? safe.configuration.temporaryPaletteColorHash : '') || source.paletteColorHash || '', requestedCacheKey = `${sourceId}:${String(source.byteHash || '').toUpperCase()}:${requestedPaletteId}:${requestedColorHash}`;
    try {
      const bytes = fs.readFileSync(source.path), observed = crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase();
      if (observed !== String(source.byteHash).toUpperCase()) throw new Error('Source changed; add it again before thumbnail review.');
      const pixels = Number(source.width) * Number(source.height);
      if (!Number.isSafeInteger(pixels) || pixels < 1 || pixels > SOURCE_THUMBNAIL_MAX_PIXELS || decodedPixels + pixels > SOURCE_THUMBNAIL_BATCH_PIXELS) throw new Error('Source exceeds the bounded contact-sheet decode budget; use the one-sprite preview.');
      const decoded = readIndexedPng8(bytes, { maxPixels: SOURCE_THUMBNAIL_MAX_PIXELS }); decodedPixels += pixels;
      const scale = Math.min(1, SOURCE_THUMBNAIL_EDGE / decoded.width, SOURCE_THUMBNAIL_EDGE / decoded.height), width = Math.max(1, Math.round(decoded.width * scale)), height = Math.max(1, Math.round(decoded.height * scale)), indices = Buffer.alloc(width * height);
      for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) indices[y * width + x] = decoded.indices[Math.min(decoded.height - 1, Math.floor(y / scale)) * decoded.width + Math.min(decoded.width - 1, Math.floor(x / scale))];
      const palette = creatorPaletteReview(safe, row, source, context), thumbnail = encodeIndexed(width, height, indices, palette.colors || decoded.colors);
      items.push({ sourceId, byteHash: observed, cacheKey: `${sourceId}:${observed}:${palette.id}:${palette.colorHash || ''}`, paletteId: palette.id, paletteLabel: palette.label, paletteColorHash: palette.colorHash, width, height, originalWidth: decoded.width, originalHeight: decoded.height, dataUri: `data:image/png;base64,${thumbnail.toString('base64')}` });
    } catch (error) { items.push({ sourceId, byteHash: String(source.byteHash || '').toUpperCase(), cacheKey: requestedCacheKey, paletteId: requestedPaletteId, paletteColorHash: requestedColorHash, error: error.message || String(error) }); }
  }
  return { type: 'sourceThumbnails', limit: SOURCE_THUMBNAIL_LIMIT, items };
}

function sourceAuditionPayload(draft, sourceIds) {
  const safe = safeDraft(draft), requested = new Set((Array.isArray(sourceIds) ? sourceIds : []).map(String)), ordered = safe.sources.filter(source => requested.has(source.id));
  if (!ordered.length) throw new Error('Mark one or more staged sources to audition.');
  if (ordered.length > SOURCE_THUMBNAIL_LIMIT) throw new Error(`Audition at most ${SOURCE_THUMBNAIL_LIMIT} marked sources at a time.`);
  const planned = draftToPlan(safe), rows = new Map(planned.rows.map(row => [row.sourceId, row])), thumbs = new Map(sourceThumbnailPayload(safe, ordered.map(source => source.id)).items.map(item => [item.sourceId, item]));
  const frames = ordered.map(source => {
    const row = rows.get(source.id), thumbnail = thumbs.get(source.id), issues = [];
    if (!row || row.status !== 'ready') issues.push(row?.reason || 'Destination is not ready.');
    if (!thumbnail?.dataUri) issues.push(thumbnail?.error || 'Thumbnail could not be decoded.');
    return { sourceId: source.id, name: source.name, identity: row?.identity || 'unassigned', axisX: Number(row?.axisX || 0), axisY: Number(row?.axisY || 0), width: thumbnail?.originalWidth || source.width, height: thumbnail?.originalHeight || source.height, previewWidth: thumbnail?.width || 0, previewHeight: thumbnail?.height || 0, dataUri: thumbnail?.dataUri || '', paletteLabel: thumbnail?.paletteLabel || '', ticks: 6, status: issues.length ? 'review' : 'ready', issues };
  });
  return { type: 'sourceAudition', frames, readyCount: frames.filter(frame => frame.status === 'ready').length, reviewCount: frames.filter(frame => frame.status !== 'ready').length, previewOnly: true };
}

function targetAxisReference(target, archive, physicalIndex, directory) {
  const index = Number(physicalIndex), sprite = archive?.sprites?.[index];
  if (!target?.path || !Number.isSafeInteger(index) || !sprite) throw new Error('The selected target-SFF axis reference no longer exists.');
  const targetHash = crypto.createHash('sha256').update(archive.buffer).digest('hex').toLowerCase();
  if (targetHash !== String(target.expectedFingerprint || target.fingerprint || '').toLowerCase()) throw new Error('The target SFF changed before its axis reference could be extracted. Choose the target again.');
  const bytes = spritePng(archive, sprite), identity = `${sprite.group},${sprite.number}`, sourceIdentity = `target-sff-axis-reference:${targetHash}:${index}`, filename = path.join(directory, `p${String(index).padStart(6, '0')}-g${sprite.group}-i${sprite.number}.png`);
  transactionalWrite(fs, filename, bytes, { label: 'sff-creator-target-axis-reference', allowExisting: false, backup: false, journal: false });
  const source = sourceFromFile(filename, { sourceIdentity, label: `${path.basename(target.path)} · ${identity} · physical #${index}`, provenance: { kind: 'target-sff-axis-reference', sourceIdentity, sourceFile: target.path, targetArchiveHash: targetHash, targetPhysicalIndex: index, sourceIdentityInArchive: identity } });
  return { source, row: { sourceId: source.id, source, identity, axisX: sprite.axisX, axisY: sprite.axisY, cropMode: 'none', cropBounds: null, axisBasis: { width: source.width, height: source.height, stage: 'source-image' }, status: 'ready' } };
}

function targetAxisReferenceIssue(draft, reference) {
  const provenance = reference?.provenance;
  if (provenance?.kind !== 'target-sff-axis-reference') return 'The trusted axis reference is no longer part of the staged sources or attached target SFF.';
  if (!draft.target?.path || String(draft.target.expectedFingerprint || '').toLowerCase() !== String(provenance.targetArchiveHash || '').toLowerCase()) return 'The attached target SFF no longer matches the trusted axis reference.';
  try {
    const archive = readSff(draft.target.path), targetHash = crypto.createHash('sha256').update(archive.buffer).digest('hex').toLowerCase(), sprite = archive.sprites[Number(provenance.targetPhysicalIndex)];
    if (targetHash !== String(provenance.targetArchiveHash || '').toLowerCase() || !sprite) return 'The trusted target-SFF axis reference changed or disappeared.';
    const bytes = spritePng(archive, sprite), imageHash = crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase(), info = readIndexedPng8(bytes);
    if (imageHash !== String(reference.imageHash || '').toUpperCase() || sprite.axisX !== reference.axisX || sprite.axisY !== reference.axisY || `${sprite.group},${sprite.number}` !== String(provenance.sourceIdentityInArchive || '') || reference.coordinateBasis?.stage !== 'source-image' || Number(reference.coordinateBasis?.width) !== info.width || Number(reference.coordinateBasis?.height) !== info.height) return 'The trusted target-SFF axis reference pixels, identity, axis, or dimensions changed.';
    return '';
  } catch (_) { return 'The trusted target-SFF axis reference could not be reopened and verified.'; }
}

function pendingSeed(root, draft) {
  const state = applyState(draft), plan = state.plan;
  const deletionCount = draft.deletedSpriteIdentities?.length || 0, integrityCount = draft.integrityIssues?.length || 0;
  return {
    ownerId: OWNER, ownerLabel: 'SFF Creator', type: plan?.conflicts.length ? 'conflict' : 'draft', resource: resource(root), scope: 'sprite-intake',
    title: 'SFF Creator sprite intake',
    detail: draft.sources.length || deletionCount || integrityCount ? `${draft.sources.length} source(s) · ${plan?.ready.length || 0} ready · ${deletionCount} deletion(s)${integrityCount ? ` · ${integrityCount} recovery-integrity blocker(s)` : ''}${plan?.conflicts.length ? ` · ${plan.conflicts.length} conflict(s)` : ''}` : 'Empty retained SFF Creator draft',
    persistence: 'workspace', sourceRevision: String(Date.now()),
    actions: {
      focus: { label: 'Open SFF Creator' },
      apply: { label: 'Create Reviewed Build Package', enabled: state.enabled, reason: state.reason },
      undo: { label: 'Discard Creator Draft', enabled: draft.sources.length > 0 || deletionCount > 0 || integrityCount > 0, reason: draft.sources.length || deletionCount || integrityCount ? '' : 'The draft is already empty.' }
    }, metadata: { sourceCount: draft.sources.length, readyCount: plan?.ready.length || 0, deletionCount, integrityCount, conflictCount: plan?.conflicts.length || 0 }
  };
}

async function stageDraft(root, draft, admittedSourceBuffers = null) {
  const safe = safeDraft(draft, admittedSourceBuffers);
  if (safe.replacementRuleAcceptances.length || safe.workshopReturns.length || safe.paletteAdaptationAcceptances.length) revalidateRetainedReplacementRuleAcceptance(root, safe);
  await drafts.stage(draftKey(root), safe);
  const seed = pendingSeed(root, safe), service = pendingChanges.current();
  const hasChanges = safe.sources.length || safe.deletedSpriteIdentities.length || safe.replaceSpriteIdentities.length || safe.integrityIssues.length;
  const entry = hasChanges ? await service.upsert(seed) : undefined;
  if (!hasChanges) await service.remove(pendingChanges.identity(seed).id);
  return { draft: safe, entry, state: applyState(safe) };
}

function compactIntakeConfiguration(settings = {}) {
  for (const name of ['group','startIndex','offsetX','offsetY']) if (Object.hasOwn(settings,name) && (settings[name] === null || typeof settings[name] === 'string' && !settings[name].trim())) throw new Error(`Enter an explicit whole-number ${name}; blank fields are not zero.`);
  const paletteChoice = settings.paletteChoice === 'true-color' ? 'true-color' : settings.paletteChoice === 'needs-palette' ? 'needs-palette' : 'own-png-palette';
  const numberingMode = settings.detect ? 'detected' : settings.numberingMode === 'stepped' ? 'stepped' : 'consecutive';
  const paletteMode = paletteChoice === 'true-color' ? 'true-color' : paletteChoice === 'needs-palette' ? 'needs-palette' : settings.paletteMode === 'target' ? 'target' : 'image';
  return {
    numberingMode, group: Number(settings.group), startIndex: Number(settings.startIndex), step: numberingMode === 'stepped' ? 10 : 1,
    collisionPolicy: ['stop', 'skip', 'next-free', 'replace-staged'].includes(settings.collisionPolicy) ? settings.collisionPolicy : 'stop',
    anchor: require('./sff_creator_model').ANCHORS.has(settings.anchor) ? settings.anchor : 'center', offsetX: Number(settings.offsetX || 0), offsetY: Number(settings.offsetY || 0),
    cropMode: paletteMode === 'true-color' ? 'none' : (['none', 'before-axis', 'after-axis'].includes(settings.cropMode) ? settings.cropMode : 'none'),
    paletteChoice, paletteMode, duplicatePolicy: settings.shareIdentical ? 'share-identical' : 'preserve-separate', imagePaletteTableOrder: settings.reversed ? 'reversed' : 'index',
    tilingMethod: ['single-palette', 'automatic-tiles', 'reviewed-tiles'].includes(settings.tilingMethod) ? settings.tilingMethod : 'single-palette', preferredWriter: require('./sff_writer_preference').normalize(settings.preferredWriter),
    gifAirAfterBuild: settings.gifAirAfterBuild === true, gifAirAction: Number.isInteger(settings.gifAirAction) ? settings.gifAirAction : null,
      png8Optimization: require('./sff_png8_optimization').normalizePng8Optimization(settings.png8Optimization),
    filenameRules: settings.detect ? [{ id: 'compact-group-index', pattern: '(?:g|group)?(\\d+)[_,-](?:i|index)?(\\d+)', groupCapture: 1, numberCapture: 2, confidence: 'review' }] : []
  };
}

function retainGuidedSources(records) {
  if (!records.some(item => item.provenance?.kind === 'guided-image-intake')) return records;
  const batchHash = crypto.createHash('sha256').update(JSON.stringify(records.map(item => [crypto.createHash('sha256').update(fs.readFileSync(item.path)).digest('hex'), item.provenance || null]))).digest('hex');
  const retained = persistCreatorFrames(require('./sff_private_storage').directory('sources'), records.map(item => ({ filename: item.path })), batchHash, 'guided-intake');
  return records.map((item, index) => ({ ...item, path: retained[index].filename }));
}

async function stageCompactIntake(targetPath, sourcePaths, settings = {}) {
  const root = workspaceKey(), key = draftKey(root), target = targetFromFile(targetPath);
  let draft = safeDraft(settings.quickWrite === true ? defaultDraft() : drafts.read(key) || defaultDraft());
  const bound = bindInvocationTarget(draft, target);
  if (bound.blocked) throw new Error(bound.message);
  draft = bound.draft;
  let paths = Array.isArray(sourcePaths) ? sourcePaths : [];
  if (!paths.length || paths.length > MAX_SOURCES) throw new Error(`Choose from 1 through ${MAX_SOURCES} PNG sprite sources.`);
  const admittedBuffers = Array.isArray(settings.admittedBuffers) ? settings.admittedBuffers : [];
  const provenance = Array.isArray(settings.sourceProvenance) ? settings.sourceProvenance : [];
  if (provenance.length === paths.length && provenance.every(item => item?.kind === 'guided-image-intake')) {
    const batchHash = crypto.createHash('sha256').update(JSON.stringify(paths.map((filename, index) => [crypto.createHash('sha256').update(admittedBuffers[index] || fs.readFileSync(filename)).digest('hex'), provenance[index]]))).digest('hex');
    paths = persistCreatorFrames(require('./sff_private_storage').directory('sources'), paths.map(filename => ({ filename })), batchHash, 'guided-intake').map(item => item.filename);
  }
  const additions = paths.map((filename, index) => sourceFromFile(filename, provenance[index] ? { sourceIdentity: provenance[index].role === 'image' ? (process.platform === 'win32' ? path.resolve(provenance[index].sourceFile).toLowerCase() : path.resolve(provenance[index].sourceFile)) : `guided:${provenance[index].sourceByteHash}:${provenance[index].role}:${provenance[index].sourceOrdinal}`, label: path.basename(provenance[index].sourceFile) + ' · ' + provenance[index].role + ' ' + provenance[index].sourceOrdinal, provenance: provenance[index] } : {}, Buffer.isBuffer(admittedBuffers[index]) ? admittedBuffers[index] : null));
  const hasTrueColor = additions.some(source => source.colorType !== 3 || source.bitDepth !== 8);
  const compact = compactIntakeConfiguration(settings), paletteChoice = compact.paletteChoice;
  if (hasTrueColor && paletteChoice !== 'true-color' && paletteChoice !== 'needs-palette') throw new Error('Choose True Color to retain these pixels in SFF 2.1, or Needs Palette to prepare indexed artwork.');
  if (paletteChoice === 'true-color' && target.sffVersion !== '2.1') throw new Error(`SFF ${target.sffVersion} cannot store true-color sprites. Choose Needs Palette for this target.`);
  mergeCreatorSources(draft, additions);
  draft.configuration = {
    ...draft.configuration,
    ...compact
  };
  require('./sff_guided_grouping').applyGuidedGrouping(draft.configuration, additions, settings);
  if (draft.configuration.paletteMode === 'target') {
    const paletteId = String(settings.paletteId || '').replace(/\s+/g, '');
    if (!target.palettes.some(item => item.id === paletteId)) throw new Error('Choose one exact embedded target palette.');
    draft.addedSpritePaletteId = paletteId;
  } else draft.addedSpritePaletteId = '';
  const admittedSourceBuffers = new Map(paths.map((filename, index) => [path.resolve(filename), Buffer.isBuffer(admittedBuffers[index]) ? admittedBuffers[index] : null]));
  if(settings.separatePsdGroups===true)require('./sff_guided_grouping').assertGuidedPairing(draftToPlan(draft),draft.configuration);
  const staged = settings.quickWrite === true ? await (async()=>{const safe=safeDraft(draft,admittedSourceBuffers);return{draft:safe,state:applyState(safe)}})() : await stageDraft(root, draft, admittedSourceBuffers);
  if (!staged.state.enabled && paletteChoice !== 'true-color' && paletteChoice !== 'needs-palette') throw new Error(staged.state.reason);
  return { draft: staged.draft, plan: staged.state.plan, writer: draft.configuration.preferredWriter, buildReady: staged.state.enabled, limitation: staged.state.enabled ? '' : staged.state.reason, message: `Staged ${additions.length} sprite source${additions.length === 1 ? '' : 's'} for ${target.name}.` };
}

function manifestRows(plan, configuration = {}, evidenceArtifact = null) {
  return plan.ready.map(row => ({
    OriginalRelativePath: row.source.name, SourceAbsolutePath: row.source.path,
    SourceArchive: row.source.provenance?.sourceFile || '', SourceIdentity: row.source.provenance?.sourceIdentity || '',
    SourceRole: row.source.provenance?.role || '', SourceOrdinal: row.source.provenance?.sourceOrdinal ?? '',
    GuidedGifAir: require('./sff_guided_gif_air').serializeGuidedGifAir(row.source.provenance),
    PreparationKind: ['before-axis-crop', 'after-axis-crop'].includes(row.source.provenance?.kind) ? row.source.provenance.kind : '', PreparationSourceSHA256: row.source.provenance?.sourceByteHash || '', PreparationBounds: row.source.provenance?.sourceRectangle ? `${row.source.provenance.sourceRectangle.x},${row.source.provenance.sourceRectangle.y},${row.source.provenance.sourceRectangle.width},${row.source.provenance.sourceRectangle.height}` : '', PreparationOutputSHA256: row.source.provenance?.outputByteHash || '', PreparationAxisDeltaX: row.source.provenance?.axisDeltaX ?? 0, PreparationAxisDeltaY: row.source.provenance?.axisDeltaY ?? 0, PreparationOriginalAxis: row.source.provenance?.originalAxis ? `${row.source.provenance.originalAxis.x},${row.source.provenance.originalAxis.y}` : '',
    Placeholder: configuration.placeholder ? 'YES' : '', PlaceholderNote: configuration.placeholderNote || '', PlaceholderOwnerId: row.source.ownerId || '',
    BaseGroup: row.group, ComputedGroup: row.group, ImageIndex: row.number,
    AxisX: row.axisX, AxisY: row.axisY, LayerNumber: 0,
    SourceSHA256: row.source.byteHash, ReviewStatus: row.axisEvidence?.visualReviewStatus === 'approved' || !row.axisEvidence ? 'APPROVED' : 'REVIEW',
    DuplicatePolicy: row.duplicatePolicy,
    PaletteGroup: row.paletteId ? row.paletteId.split(',')[0] : '', PaletteIndex: row.paletteId ? row.paletteId.split(',')[1] : '',
    AxisMethod: row.axisEvidence?.method || '', AxisConfidence: row.axisEvidence ? String(row.axisEvidence.confidence) : '', AxisEvidence: row.axisEvidence ? crypto.createHash('sha256').update(JSON.stringify(canonicalize(row.axisEvidence))).digest('hex') : '', AxisEvidenceFile: row.axisEvidence ? evidenceArtifact?.identity || '' : '', AxisEvidenceSetSHA256: row.axisEvidence ? evidenceArtifact?.byteHash || '' : '',
    ReviewReason: `Explicitly reviewed in SFF Creator; ${row.resolution}; crop ${row.cropMode}; palette ${row.paletteChoice}; duplicates ${row.duplicatePolicy}${row.axisEvidence ? `; axis ${row.axisEvidence.method} ${Math.round(row.axisEvidence.confidence * 100)}% visually approved with retained evidence` : ''}.`
  }));
}

function creatorAxisEvidenceArtifact(plan) {
  const rows = plan.ready.filter(row => row.axisEvidence).map(row => ({ sourceId: row.sourceId, identity: row.identity, axisX: row.axisX, axisY: row.axisY, sourceSHA256: row.source.byteHash, evidence: row.axisEvidence }));
  if (!rows.length) return null;
  const content = `${JSON.stringify(canonicalize({ schema: 'ikemaker.sff-creator-axis-evidence', version: 1, rows }), null, 2)}\n`;
  return { identity: 'axis-evidence.json', byteHash: crypto.createHash('sha256').update(content).digest('hex'), content };
}

function prepareReviewedPaletteDecisionSources(packageRoot, plan, retained) {
  if (!retained || !Object.keys(retained.resolved || {}).length) return { plan, writes: [], decisionHash: '' };
  const binding = retained.binding, issues = new Map(binding.scan.issues.map(issue => [issue.issueId, issue])), editsBySource = new Map();
  for (const [issueId, decision] of Object.entries(retained.resolved)) {
    if (!['map-index', 'rule'].includes(decision.kind)) continue;
    const issue = issues.get(issueId); if (!issue) throw new Error(`Retained color decision ${issueId} no longer has source evidence.`);
    for (const occurrenceIndex of decision.includedOccurrenceIndexes) {
      const occurrence = issue.occurrences[occurrenceIndex]; if (!occurrence) throw new Error(`Retained color decision ${issueId} references a missing occurrence.`);
      if (!editsBySource.has(occurrence.sourceId)) editsBySource.set(occurrence.sourceId, []);
      editsBySource.get(occurrence.sourceId).push({ issueId, occurrence, sourceRgba: issue.sourceRgba.slice(), destinationIndex: decision.destinationIndex });
    }
  }
  if (!editsBySource.size) return { plan, writes: [], decisionHash: '' };
  const writes = [], replacements = new Map();
  for (const row of plan.ready) {
    const edits = editsBySource.get(row.sourceId); if (!edits?.length) continue;
    const sourceBytes = readStableBoundedFile(row.source.path, unmatchedColors.MAX_SOURCE_BYTES, `Reviewed palette source ${row.source.name}`), sourceHash = crypto.createHash('sha256').update(sourceBytes).digest('hex').toUpperCase();
    if (sourceHash !== String(row.source.byteHash || '').toUpperCase()) throw new Error(`Source ${row.source.name} changed before its reviewed color decisions could be prepared.`);
    const indexed = readIndexedPng8(sourceBytes), indices = Buffer.from(indexed.indices), touched = new Map();
    for (const edit of edits) {
      const pixel = edit.occurrence.y * indexed.width + edit.occurrence.x;
      if (!Number.isSafeInteger(pixel) || pixel < 0 || pixel >= indices.length) throw new Error(`Reviewed color occurrence for ${row.source.name} is outside the source image.`);
      const sourceIndex = indices[pixel], observedRgba = indexed.colors[sourceIndex];
      if (JSON.stringify(observedRgba) !== JSON.stringify(edit.sourceRgba)) throw new Error(`Source pixel evidence for ${row.source.name} changed before palette preparation.`);
      if (touched.has(pixel) && touched.get(pixel) !== edit.destinationIndex) throw new Error(`Source pixel ${edit.occurrence.x},${edit.occurrence.y} in ${row.source.name} has conflicting reviewed destinations.`);
      touched.set(pixel, edit.destinationIndex); indices[pixel] = edit.destinationIndex;
    }
    for (let pixel = 0; pixel < indexed.indices.length; pixel += 1) {
      if (touched.has(pixel)) continue;
      const sourceIndex = indexed.indices[pixel], sourceRgba = indexed.colors[sourceIndex], masterRgba = binding.evidence.master.colors[sourceIndex];
      if (JSON.stringify(sourceRgba) !== JSON.stringify(masterRgba)) throw new Error(`Untouched pixel ${pixel % indexed.width},${Math.floor(pixel / indexed.width)} in ${row.source.name} uses source index ${sourceIndex}, whose color differs from the reviewed master at that index. Review exact-color reindexing before applying nearest-color decisions.`);
    }
    const buffer = encodeIndexed(indexed.width, indexed.height, indices, binding.evidence.master.colors), output = path.join(packageRoot, 'prepared-sources', `${row.source.id}-reviewed-palette.png`), outputHash = crypto.createHash('sha256').update(buffer).digest('hex').toUpperCase();
    if (fs.existsSync(output)) { const existingHash = crypto.createHash('sha256').update(readStableBoundedFile(output, unmatchedColors.MAX_SOURCE_BYTES, `Existing reviewed palette source ${row.source.name}`)).digest('hex').toUpperCase(); if (existingHash !== outputHash) throw new Error(`A different reviewed palette result already occupies ${output}.`); }
    else writes.push([output, buffer]);
    replacements.set(row.sourceId, { output, outputHash, changedPixelCount: touched.size, issueIds: [...new Set(edits.map(edit => edit.issueId))].sort() });
  }
  if (writes.length) transactionalWriteSet(fs, writes, { label: 'sff-creator-reviewed-palette-decisions', allowExisting: false, backup: false, journal: false });
  const ready = plan.ready.map(row => { const replacement = replacements.get(row.sourceId); if (!replacement) return row; const source = sourceFromFile(replacement.output, { sourceIdentity: row.source.id, ownerId: row.source.ownerId, label: row.source.name, provenance: { kind: 'reviewed-palette-decisions', sourceIdentity: row.source.id, original: row.source.provenance || { sourceFile: row.source.path, sourceByteHash: row.source.byteHash }, masterFingerprint: binding.evidence.master.fingerprint, masterVersion: binding.evidence.master.version, changedPixelCount: replacement.changedPixelCount, issueIds: replacement.issueIds } }); source.id = row.source.id; return { ...row, source }; });
  const decisionHash = crypto.createHash('sha256').update(JSON.stringify(canonicalize({ scanHash: binding.scan.scanHash, masterFingerprint: binding.evidence.master.fingerprint, decisions: retained.resolved }))).digest('hex');
  return { plan: { ...plan, ready, rows: plan.rows.map(row => ready.find(item => item.sourceId === row.sourceId && item.identity === row.identity) || row) }, writes, decisionHash };
}

function prepareReviewedCropSources(packageRoot, plan) {
  const writes = [], ready = plan.ready.map(row => {
    if (!['before-axis', 'after-axis'].includes(row.cropMode)) return row;
    const sourceBytes = fs.readFileSync(row.source.path), observed = crypto.createHash('sha256').update(sourceBytes).digest('hex').toUpperCase();
    if (observed !== String(row.source.byteHash).toUpperCase()) throw new Error(`Source ${row.source.name} changed before its reviewed crop could be prepared.`);
    const cropped = cropIndexedPng8(sourceBytes), afterAxis = row.cropMode === 'after-axis', suffix = afterAxis ? 'after-axis' : 'before-axis';
    const axisDeltaX = afterAxis ? -cropped.bounds.x : 0, axisDeltaY = afterAxis ? -cropped.bounds.y : 0;
    const axisX = row.axisX + axisDeltaX, axisY = row.axisY + axisDeltaY;
    if (!Number.isSafeInteger(axisX) || !Number.isSafeInteger(axisY) || axisX < -32768 || axisX > 32767 || axisY < -32768 || axisY > 32767) throw new Error(`Cropping ${row.source.name} would move its stored axis outside the signed 16-bit SFF range.`);
    const target = path.join(packageRoot, 'prepared-sources', `${row.source.id}-${suffix}.png`);
    if (fs.existsSync(target)) {
      const existing = crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex').toUpperCase();
      if (existing !== cropped.outputByteHash) throw new Error(`A different reviewed crop already occupies ${target}.`);
    } else writes.push([target, cropped.buffer]);
    return { ...row, axisX, axisY, cropAxisDeltaX: axisDeltaX, cropAxisDeltaY: axisDeltaY, axisBeforeCrop: { x: row.axisX, y: row.axisY }, source: { ...row.source, path: target, name: path.basename(target), width: cropped.bounds.width, height: cropped.bounds.height, byteHash: cropped.outputByteHash, cropBounds: { empty: false, x: 0, y: 0, width: cropped.bounds.width, height: cropped.bounds.height, visiblePixels: cropped.bounds.visiblePixels }, cropChanged: false, provenance: { kind: `${suffix}-crop`, sourceIdentity: row.source.id, sourceFile: row.source.path, sourceByteHash: cropped.sourceByteHash, sourceRectangle: cropped.bounds, outputByteHash: cropped.outputByteHash, axisDeltaX, axisDeltaY, originalAxis: { x: row.axisX, y: row.axisY }, finalAxis: { x: axisX, y: axisY }, priorProvenance: row.source.provenance || null } } };
  });
  return { plan: { ...plan, ready, rows: plan.rows.map(row => ready.find(item => item.sourceId === row.sourceId && item.identity === row.identity) || row) }, writes };
}

async function createReviewedPackage(root, draft, chooseFolder = true, newArchivePath = '', packageParent = '') {
  const safe = safeDraft(draft);
  const retainedColorDecisions = safe.replacementRuleAcceptances.length || safe.workshopReturns.length || safe.paletteAdaptationAcceptances.length ? revalidateRetainedReplacementRuleAcceptance(root, safe) : null;
  draft = safe;
  const state = applyState(draft);
  if (!state.enabled) throw new Error(state.reason);
  let parent = packageParent ? path.resolve(packageParent) : root;
  if (chooseFolder) {
    const picked = await vscode.window.showOpenDialog({ title: 'Choose the parent folder for a new reviewed SFF Creator package', openLabel: 'Create Package Here', canSelectFiles: false, canSelectFolders: true, canSelectMany: false });
    if (!picked?.[0]) return { resolved: false, cancelled: true };
    parent = picked[0].fsPath;
  }
  const reviewedNewArchive = draft.target ? '' : (newArchivePath ? path.resolve(newArchivePath) : '');
  if (reviewedNewArchive && !/\.sff$/i.test(reviewedNewArchive)) throw new Error('A new archive destination must use the .sff extension.');
  if (reviewedNewArchive && fs.existsSync(reviewedNewArchive)) throw new Error('Create New Archive will not replace an existing file. Choose a new SFF filename or attach that archive as the reviewed target.');
  const colorDecisionEvidence = { replacementRuleAcceptances: draft.replacementRuleAcceptances.map(item => item.acceptanceHash), workshopReturns: draft.workshopReturns.map(item => item.returnHash), paletteAdaptationAcceptances: draft.paletteAdaptationAcceptances.map(item => item.acceptanceHash) };
  const semantic = crypto.createHash('sha256').update(JSON.stringify({ recipeVersion: 8, sources: draft.sources.map(item => [item.path, item.byteHash]), deletedSpriteIdentities: draft.deletedSpriteIdentities || [], replaceSpriteIdentities: draft.replaceSpriteIdentities || [], configuration: draft.configuration, existingIdentities: draft.existingIdentities, target: draft.target ? [draft.target.path, draft.target.expectedFingerprint] : null, newArchive: reviewedNewArchive || null, addedSpritePaletteId: draft.addedSpritePaletteId, colorDecisionEvidence })).digest('hex').slice(0, 16);
  const packageRoot = path.join(parent, `sff-creator-plan-${semantic}`), outputDirectory = path.join(packageRoot, 'build');
  fs.mkdirSync(packageRoot, { recursive: true });
  const palettePrepared = prepareReviewedPaletteDecisionSources(packageRoot, state.plan, retainedColorDecisions), prepared = prepareReviewedCropSources(packageRoot, palettePrepared.plan), executionPlan = prepared.plan;
  if (retainedColorDecisions) {
    const resolutionBody = { schema: 'ikemaker.sff-creator-reviewed-color-decisions', version: 1, target: retainedColorDecisions.binding.evidence.target, master: { physicalIndex: retainedColorDecisions.binding.evidence.master.physicalIndex, fingerprint: retainedColorDecisions.binding.evidence.master.fingerprint, version: retainedColorDecisions.binding.evidence.master.version }, scanHash: retainedColorDecisions.binding.scan.scanHash, decisionHash: palettePrepared.decisionHash, decisions: retainedColorDecisions.resolved, acceptanceHashes: colorDecisionEvidence }, resolutionContent = `${JSON.stringify(canonicalize(resolutionBody), null, 2)}\n`, resolutionPath = path.join(packageRoot, 'reviewed-color-decisions.json');
    if (fs.existsSync(resolutionPath) && fs.readFileSync(resolutionPath, 'utf8') !== resolutionContent) throw new Error(`Different reviewed color decisions already occupy ${resolutionPath}.`);
    if (!fs.existsSync(resolutionPath)) prepared.writes.push([resolutionPath, resolutionContent]);
  }
  const axisEvidenceArtifact = creatorAxisEvidenceArtifact(executionPlan);
  if (axisEvidenceArtifact) {
    const evidencePath = path.join(packageRoot, axisEvidenceArtifact.identity);
    if (fs.existsSync(evidencePath) && fs.readFileSync(evidencePath, 'utf8') !== axisEvidenceArtifact.content) throw new Error(`Different automatic-axis evidence already occupies ${evidencePath}.`);
    if (!fs.existsSync(evidencePath)) prepared.writes.push([evidencePath, axisEvidenceArtifact.content]);
  }
  const manifestPath = path.join(packageRoot, 'reviewed-sprite-manifest.csv');
  const content = stringifyCsv(manifestRows(executionPlan, draft.configuration, axisEvidenceArtifact));
  if (fs.existsSync(manifestPath) && fs.readFileSync(manifestPath, 'utf8') !== content) throw new Error(`A different package already occupies ${packageRoot}.`);
  if (!fs.existsSync(manifestPath)) prepared.writes.push([manifestPath, content]);
  if (prepared.writes.length) transactionalWriteSet(fs, prepared.writes, { label: 'sff-creator-reviewed-sources', allowExisting: false, backup: false, journal: false });
  const outputSff = draft.target ? draft.target.path : (reviewedNewArchive || path.join(packageRoot, 'candidate-output.sff'));
  const candidateOutputSff = draft.target || reviewedNewArchive ? path.join(packageRoot, 'candidate-output.sff') : undefined;
  const duplicatePolicies = new Set(executionPlan.ready.map(row => row.duplicatePolicy));
  const duplicatePolicy = duplicatePolicies.size === 1 ? [...duplicatePolicies][0] : 'preserve-separate';
  const autocropIdentities = executionPlan.ready.filter(row => ['autocrop', 'after-axis'].includes(row.cropMode)).map(row => row.identity), cropModesByIdentity = Object.fromEntries(executionPlan.ready.map(row => [row.identity, row.cropMode]));
  const build = await createBuildPackage({
    sourceRoot: packageRoot, manifestPath, outputDirectory, outputSff, candidateOutputSff,
    targetSnapshot: draft.target ? { filename: draft.target.path, exists: true, hash: draft.target.expectedFingerprint } : (reviewedNewArchive ? captureTarget(fs, reviewedNewArchive) : undefined),
    paletteSourceSff: draft.target?.path, preserveArchiveSprites: Boolean(draft.target),
    addedSpritePaletteId: (draft.target && draft.configuration.paletteMode === 'target') || draft.configuration.paletteMode === 'temporary' ? draft.addedSpritePaletteId : null,
    imagePaletteIntake: draft.target && draft.configuration.paletteMode === 'image' ? { group: draft.configuration.imagePaletteGroup, tableOrder: draft.configuration.imagePaletteTableOrder } : null,
    portablePaletteIntake: draft.configuration.importedPalettes || [],
    deletedSpriteIdentities: draft.deletedSpriteIdentities || [],
    sharedPalettePath: draft.configuration.paletteMode === 'temporary' ? draft.configuration.temporaryPalettePath : undefined,
    sharedPaletteId: draft.configuration.paletteMode === 'temporary' ? draft.configuration.temporaryPaletteId : undefined,
    sharedPaletteOrder: draft.configuration.paletteMode === 'temporary' ? draft.configuration.temporaryPaletteTableOrder : undefined,
    temporaryPaletteLifecycle: draft.configuration.paletteMode === 'temporary' ? { lifecycleId: draft.configuration.temporaryPaletteLifecycleId, paletteId: draft.configuration.temporaryPaletteId, note: draft.configuration.placeholderNote } : null,
    reviewedTemporaryPaletteCleanup: state.plan.temporaryPaletteCleanup?.sourceSffHash ? state.plan.temporaryPaletteCleanup : null,
    includeStagedPalettes: !draft.target,
    buildProfile: { ...DEFAULT_PROFILE, profileName: 'SFF Creator reviewed intake', png8Optimization: draft.configuration.png8Optimization || 'none', getHitIndexing: { ...DEFAULT_PROFILE.getHitIndexing, enabled: false } },
    duplicateHandling: { sprites: duplicatePolicy, palettes: 'preserve-separate' },
    autocrop: false, autocropIdentities, cropModesByIdentity,
    reviewEvidence: axisEvidenceArtifact ? { identity: axisEvidenceArtifact.identity, byteHash: axisEvidenceArtifact.byteHash } : null
  });
  return { resolved: true, packageRoot, manifestPath, build, plan: executionPlan };
}

async function buildCompactIntakeNow(reviewedDraft, options = {}) {
  const api = options.api || vscode, draft = safeDraft(reviewedDraft), targetPath = draft.target?.path && path.resolve(draft.target.path);
  if (!targetPath || !fs.existsSync(targetPath)) throw new Error('Quick Write requires the exact existing SFF target.');
  const state=applyState(draft);if(!state.enabled)throw new Error(state.reason);
  const selectedWriter = require('./sff_writer_preference').normalize(options.writerMode || draft.configuration.preferredWriter);
  const packaged=await createReviewedPackage(workspaceKey(),draft,false,'',require('./sff_private_storage').directory('builds'));
  const authority=require('./sff_quick_write_intent'),intent=authority.createQuickWriteIntent({build:packaged.build,draft,plan:packaged.plan,writerMode:selectedWriter});
  const assertCurrent=()=>{options.assertCurrent?.();authority.assertQuickWriteIntent(intent,{build:packaged.build,draft,plan:packaged.plan,writerMode:selectedWriter});if(writerPreference.snapshot().mode!==selectedWriter)throw new Error('The shared writer changed during Quick Write. Review the current writer before retrying.');const verifiedOriginals=new Set();for(const source of draft.sources)require('./sff_guided_intake').assertGuidedProvenance(source.provenance,verifiedOriginals);};
  assertCurrent();let execution;
  if(selectedWriter==='ikemaker')execution=await require('./sff_quick_native_write').executeQuickNativeWrite({build:packaged.build,draft,plan:packaged.plan,intent,assertCurrent,capabilityRequest:options.capabilityRequest||require('./sff_bundled_certification').resolveBundledSffCertification('sff-v2.1','ikemaker-builtin-sff-v21-png8-prerelease').capabilityRequest});
  else{
    const confirmAdoption=async()=>{assertCurrent();return true};
    execution=selectedWriter==='both'?await executeComparedSprMake2Build(packaged.build,{confirmAdoption}):await executeGeneratedBuild(packaged.build,{confirmAdoption});
  }
  if(execution.cancelled)throw new Error('Quick Write did not adopt an archive. The selected batch remains available.');
  const byteHash=execution.byteHash||execution.candidateHash||execution.comparison?.candidates?.sprMake2?.byteHash;
  if(!byteHash||crypto.createHash('sha256').update(fs.readFileSync(targetPath)).digest('hex')!==byteHash.toLowerCase())throw new Error('The target may have been written, but its final bytes could not be verified. Inspect the exact target before continuing.');
  return Object.freeze({...execution,written:true,verified:execution.verified??execution.recoveryCleanup?.verified??false,cancelled:false,targetPath,byteHash:byteHash.toLowerCase(),spriteCount:packaged.plan.ready.length,finalReady:packaged.plan.ready,specificationPath:packaged.build.specificationPath,packageRoot:packaged.packageRoot,intentHash:intent.intentHash,message:`Wrote ${path.basename(targetPath)} with ${selectedWriter==='both'?'Both (verified SprMake2 output)':selectedWriter==='ikemaker'?'IKEMaker':'SprMake2'}.`});
}

async function showDualTestBuildResult(testBuild, panel) {
  const builtInName = path.basename(testBuild.builtInCandidatePath);
  const sprMake2Name = path.basename(testBuild.sprMake2CandidatePath);
  const candidateFolder = path.dirname(testBuild.builtInCandidatePath);
  const action = await vscode.window.showInformationMessage(
    'Two SFF test candidates were created and independently validated.',
    {
      modal: true,
      detail: [
        'TEST BUILD ONLY · No active SFF was replaced.',
        '',
        `Candidate folder: ${candidateFolder}`,
        `IKEMaker: ${builtInName}`,
        `SprMake2: ${sprMake2Name}`,
        '',
        'The other files in the reviewed package are reproducible source snapshots and validation evidence.'
      ].join('\n')
    },
    'Review Comparison',
    'Open Candidate Folder',
    'Open IKEMaker SFF',
    'Open SprMake2 SFF'
  );
  if (action === 'Review Comparison') await panel?.webview.postMessage({ type: 'writerComparison', summary: readWriterComparisonReport(testBuild.comparisonReportPath) });
  if (action === 'Open Candidate Folder') await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(testBuild.builtInCandidatePath));
  if (action === 'Open IKEMaker SFF') await vscode.commands.executeCommand('sff.openViewer', vscode.Uri.file(testBuild.builtInCandidatePath));
  if (action === 'Open SprMake2 SFF') await vscode.commands.executeCommand('sff.openViewer', vscode.Uri.file(testBuild.sprMake2CandidatePath));
}

function publishDualTestBuild(testBuild, destination, targetName = 'SFF') {
  const folder = path.resolve(destination);
  const stat = fs.lstatSync(folder);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('The two-SFF destination must be a direct local folder.');
  const base = path.basename(String(targetName || 'SFF'), path.extname(String(targetName || 'SFF'))).replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'SFF';
  const builtInCandidatePath = path.join(folder, `${base}-IKEMaker-test.sff`);
  const sprMake2CandidatePath = path.join(folder, `${base}-SprMake2-test.sff`);
  const comparisonReportPath = path.join(folder, `${base}-writer-comparison.json`);
  const outputs = [builtInCandidatePath, sprMake2CandidatePath, comparisonReportPath];
  const occupied = outputs.filter(filename => fs.existsSync(filename));
  if (occupied.length) throw new Error(`The test destination already contains ${occupied.map(filename => path.basename(filename)).join(', ')}. Choose an empty folder so no prior result can be overwritten.`);
  const sources = [
    [testBuild.builtInCandidatePath, builtInCandidatePath, testBuild.builtInCandidateHash, 1024 * 1024 * 1024, 'IKEMaker test SFF'],
    [testBuild.sprMake2CandidatePath, sprMake2CandidatePath, testBuild.sprMake2CandidateHash, 1024 * 1024 * 1024, 'SprMake2 test SFF'],
    [testBuild.comparisonReportPath, comparisonReportPath, testBuild.comparisonReportHash, 8 * 1024 * 1024, 'writer comparison']
  ];
  const writes = sources.map(([source, output, expectedHash, maximumBytes, label]) => {
    if (!/^[a-f0-9]{64}$/i.test(String(expectedHash || ''))) throw new Error(`${label} is missing its validated publication hash.`);
    const bytes = readStableBoundedFile(source, maximumBytes, label);
    if (crypto.createHash('sha256').update(bytes).digest('hex') !== String(expectedHash).toLowerCase()) throw new Error(`${label} changed after validation; no test output was published.`);
    return [output, bytes];
  });
  transactionalWriteSet(fs, writes, { label: 'sff-creator-publish-two-test-candidates', allowExisting: false, backup: false, journal: false });
  try {
    for (const [filename, expected] of writes) {
      const reopened = readStableBoundedFile(filename, expected.length, `published ${path.basename(filename)}`);
      if (crypto.createHash('sha256').update(reopened).digest('hex') !== crypto.createHash('sha256').update(expected).digest('hex')) throw new Error(`final hash mismatch: ${path.basename(filename)}`);
    }
  } catch (error) {
    throw new Error(`The two test SFFs and comparison were created in ${folder}, but their final reopen check could not be completed (${error.message}). Keep these three files together and retry in a new empty folder before treating them as verified.`);
  }
  return { ...testBuild, builtInCandidatePath, sprMake2CandidatePath, comparisonReportPath };
}

function cleanupTemporaryTestPackage(folder, published = false, remove = target => fs.rmSync(target, { recursive: true, force: true }), warn = message => vscode.window.showWarningMessage(message)) {
  const resolved = path.resolve(folder), temporaryRoot = path.resolve(os.tmpdir());
  if (path.dirname(resolved) !== temporaryRoot || !path.basename(resolved).startsWith('ikemaker-two-sff-test-')) { warn(`IKEMaker did not remove an unrecognized temporary test path: ${resolved}`); return false; }
  try { remove(resolved); return true; }
  catch (error) { warn(published ? `The test SFFs were created, but IKEMaker could not remove its temporary build folder ${resolved}: ${error.message}` : `The test build did not publish output, and IKEMaker could not remove its temporary build folder ${resolved}: ${error.message}`); return false; }
}

const SOURCE_REVIEW_STYLE = '.source{grid-template-columns:24px minmax(180px,1fr) 75px 75px 75px 75px minmax(125px,auto) minmax(145px,auto) minmax(145px,auto)}';

function creatorSourceActionAvailability({ sourceIds = [], selectedIds = [], readyIds = [], staleIds = [], pageIds = [], page = 0, pageCount = 1 } = {}) {
  const sources = Array.isArray(sourceIds) ? sourceIds.map(String) : [];
  const selected = new Set((Array.isArray(selectedIds) ? selectedIds : []).map(String));
  const ready = new Set((Array.isArray(readyIds) ? readyIds : []).map(String));
  const stale = new Set((Array.isArray(staleIds) ? staleIds : []).map(String));
  const visible = (Array.isArray(pageIds) ? pageIds : []).map(String);
  const selectedInOrder = sources.filter(id => selected.has(id));
  const indexes = selectedInOrder.map(id => sources.indexOf(id));
  const selectedCount = selectedInOrder.length;
  const allSelectedReady = selectedCount > 0 && selectedInOrder.every(id => ready.has(id));
  const firstReady = selectedCount > 0 && ready.has(selectedInOrder[0]);
  const canMoveUp = indexes.some(index => index > 0 && !selected.has(sources[index - 1]));
  const canMoveDown = indexes.some(index => index >= 0 && index < sources.length - 1 && !selected.has(sources[index + 1]));
  const state = (enabled, reason) => Object.freeze({ disabled: !enabled, reason: enabled ? '' : reason });
  return Object.freeze({
    sourcePrev: state(Number(page) > 0, 'This is the first source page.'),
    sourceNext: state(Number(page) < Math.max(1, Number(pageCount) || 1) - 1, 'This is the last source page.'),
    markShown: state(visible.length > 0, 'No source rows are visible on this page.'),
    unmarkShown: state(visible.some(id => selected.has(id)), 'No marked source is visible on this page.'),
    clearSourceMarks: state(selectedCount > 0, 'Mark one or more sources before clearing the marks.'),
    up: state(canMoveUp, selectedCount ? 'The marked source block is already as high as it can move.' : 'Mark one or more sources before moving them.'),
    down: state(canMoveDown, selectedCount ? 'The marked source block is already as low as it can move.' : 'Mark one or more sources before moving them.'),
    relinkSource: state(selectedCount === 1 && stale.has(selectedInOrder[0]), selectedCount !== 1 ? 'Mark exactly one changed or unavailable source to relink.' : 'The marked source is current; only changed or unavailable sources need relinking.'),
    previewAxis: state(selectedCount === 1, 'Mark exactly one source to preview its axis, crop, and palette.'),
    suggestAxes: state(allSelectedReady, selectedCount ? 'Resolve every marked source conflict before reviewing automatic-axis suggestions.' : 'Mark one or more ready sources to review automatic-axis suggestions.'),
    copyAxis: state(selectedCount >= 2 && firstReady, selectedCount < 2 ? 'Mark at least two sources; the first marked ready source supplies the axis.' : 'The first marked source must be ready before its axis can be copied.'),
    remapSelected: state(selectedCount > 0, 'Mark one or more sources before applying a reviewed palette.'),
    remove: state(selectedCount > 0, 'Mark one or more sources before removing them from this draft.'),
    clear: state(sources.length > 0, 'No staged sources are available to clear.'),
    assignLogicalGroup: state(selectedCount > 0, 'Mark one or more sources before reviewing a logical-group assignment.'),
    auditionMarkedSources: state(selectedCount > 0, 'Mark one or more sources before auditioning a sequence.')
  });
}

function creatorNeedsPaletteHandoffAvailability({ paletteMode = '', targetPath = '', sourceCount = 0, targetStale = false } = {}) {
  const reason = paletteMode !== 'needs-palette'
    ? 'Choose Needs Palette under Palette use first.'
    : !targetPath
      ? 'Choose an existing reviewed SFF target first.'
      : sourceCount < 1
        ? 'Add at least one source first.'
        : targetStale
          ? 'The target changed after review; choose it again first.'
          : '';
  return Object.freeze({ enabled: !reason, disabled: Boolean(reason), reason });
}

function html(model) { return `<!doctype html><html><head><meta charset="utf-8"><style>${SOURCE_REVIEW_STYLE}
:root{color-scheme:light dark}*{box-sizing:border-box}body{margin:0;background:var(--vscode-editor-background);color:var(--vscode-foreground);font:13px var(--vscode-font-family)}.creator-actions{position:sticky;top:0;z-index:2;display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:9px 12px;background:var(--vscode-editor-background);border-bottom:1px solid var(--vscode-panel-border)}button,input,select,textarea{font:inherit}button{padding:5px 9px}button[aria-pressed=true]{outline:2px solid var(--vscode-focusBorder);outline-offset:-2px}main{padding:10px;max-width:1480px;margin:auto}.step{border:1px solid var(--vscode-panel-border);margin:8px 0;background:var(--vscode-sideBar-background)}.step>summary{padding:9px;font-weight:600;cursor:pointer}.body{padding:0 10px 10px}.row{display:flex;gap:9px;align-items:center;flex-wrap:wrap;margin:7px 0}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:8px}.field{display:grid;gap:3px}.sources{max-height:300px;overflow:auto;border:1px solid var(--vscode-panel-border)}.source{display:grid;gap:5px;align-items:center;padding:5px;border-bottom:1px solid var(--vscode-panel-border)}.source input{min-width:0;width:100%}.sources.contact-sheet{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:7px;padding:7px;max-height:520px}.source-card{position:relative;display:grid;grid-template-rows:104px auto;gap:5px;min-width:0;padding:7px;border:1px solid var(--vscode-panel-border);background:var(--vscode-editor-background);cursor:grab}.source-card:active{cursor:grabbing}.source-card.dragging{opacity:.55}.source-card.drop-before:before,.source-card.drop-after:after{content:'';position:absolute;left:-4px;right:-4px;height:4px;background:var(--vscode-focusBorder);z-index:3;pointer-events:none}.source-card.drop-before:before{top:-5px}.source-card.drop-after:after{bottom:-5px}.source-card input[data-select]{position:absolute;z-index:1;top:8px;left:8px}.source-card .thumb{display:grid;place-items:center;overflow:hidden;background:repeating-conic-gradient(#7772 0 25%,transparent 0 50%) 50%/12px 12px}.source-card img{max-width:96px;max-height:96px;image-rendering:pixelated}.source-card b,.source-card small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.source-card .thumb-error{padding:8px;text-align:center;color:var(--vscode-descriptionForeground);font-size:11px}.muted{color:var(--vscode-descriptionForeground)}.error{color:var(--vscode-errorForeground)}.ok{color:var(--vscode-testing-iconPassed)}pre{white-space:pre-wrap}.summary{border-left:3px solid var(--vscode-focusBorder);padding:8px}.review-row{padding:7px 0;border-bottom:1px solid var(--vscode-panel-border)}.review-row:last-child{border-bottom:0}.review-facts{display:flex;gap:5px 12px;flex-wrap:wrap;margin-top:3px;color:var(--vscode-descriptionForeground);font-size:12px}.review-facts span{white-space:nowrap}.primary{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:0}.danger{color:var(--vscode-errorForeground)}.saved-rules{margin:9px 0;border:1px solid var(--vscode-panel-border);background:var(--vscode-editor-background)}.saved-rules>summary{padding:8px;cursor:pointer;font-weight:600}.saved-rules-body{padding:0 8px 8px}.saved-rule-list{display:grid;gap:6px;margin-top:7px}.saved-rule-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 10px;padding:7px;border:1px solid var(--vscode-panel-border)}.saved-rule-row p{margin:2px 0;overflow-wrap:anywhere}.saved-rule-actions{display:flex;gap:5px;align-items:center;flex-wrap:wrap}.swatch{display:inline-block;width:14px;height:14px;border:1px solid var(--vscode-contrastBorder);vertical-align:-2px}.badge{font-weight:400;color:var(--vscode-descriptionForeground)}dialog{max-width:min(94vw,1100px);max-height:92vh;background:var(--vscode-editor-background);color:var(--vscode-foreground);border:1px solid var(--vscode-panel-border)}.comparison-grid{display:grid;grid-template-columns:repeat(2,minmax(240px,1fr));gap:10px}.comparison-card{border:1px solid var(--vscode-panel-border);padding:10px}.comparison-card p{overflow-wrap:anywhere}.comparison-result{font-size:16px;font-weight:700}#spritePreviewCanvas{display:block;max-width:88vw;max-height:72vh;image-rendering:pixelated;background:repeating-conic-gradient(#7772 0 25%,transparent 0 50%) 50%/12px 12px}@media(max-width:720px){.source{grid-template-columns:24px 1fr 60px 60px}.source .wide{grid-column:span 2}.sources.contact-sheet{grid-template-columns:repeat(auto-fill,minmax(125px,1fr))}.saved-rule-row{grid-template-columns:minmax(0,1fr)}.saved-rule-actions{display:grid;grid-template-columns:1fr}.saved-rule-actions button{width:100%}.comparison-grid{grid-template-columns:1fr}}
</style></head><body>${launchControlsHtml('sff', { sessionSurface: 'sff_creator', universalModel: creatorToolbarModel(model.draft), universalSurfaceId: CREATOR_SURFACE, includeLayout: false })}<header class="creator-actions"><b>SFF Creator · Add Sprites</b><span class="muted">Retained draft → reviewed backend-neutral package</span><label>Writer <select id="writerPreference"><option value="ikemaker">IKEMaker</option><option value="sprmake2">SprMake2</option><option value="both">Both writers</option></select></label><label>PNG8 compression <select id="png8Optimization"><option value="none">Unchanged</option><option value="zlib9-smaller-only">Try smaller-only lossless compression</option></select></label><button id="productionStart" class="primary" hidden>Start Reviewed IKEMaker Update…</button><button id="productionContinue" class="primary" hidden>Continue Review / Recovery…</button><span id="productionStatus" class="muted" role="status" aria-live="polite"></span><button id="buildSelected" class="primary">Build Using Selected Writer…</button><button id="saveTruecolorCopy" class="primary" hidden>Save Verified SFF Copy…</button><button id="openVerifiedCopy" hidden disabled>Open Saved SFF</button><button id="buildV21">Create 2 Test SFFs…</button><button id="openWriterComparison">Open Writer Comparison…</button><button id="build">Update Active SFF (Compare Writers)…</button><button id="buildV20">IKEMaker v2.0 · Single Writer Test…</button><button id="buildSprMake2">SprMake2 Only · Build & Apply…</button><button id="compareBoth">Compare Both · No Adoption…</button><button id="validateExisting">Validate Existing SprMake2 Output…</button><button id="apply">Create Package Only…</button><button id="exportPlan">Export Plan…</button><button id="importPlan">Import Plan…</button><button id="discard">Discard Draft</button><span id="status" role="status" aria-live="polite"></span></header><main><p id="verifiedCopyPath" class="muted" role="status" aria-live="polite" style="overflow-wrap:anywhere"></p>
<details class="step" open><summary>1 · Target Archive</summary><div class="body"><div class="row"><button id="chooseTarget">Choose Existing SFF…</button><button id="clearTarget">Create New Archive Instead</button><label id="newArchiveVersionField">New SFF version <select id="newArchiveVersion"><option value="2.1" selected>SFF 2.1 (recommended)</option><option value="2.0">SFF 2.0</option></select></label></div><div id="targetSummary" role="status" aria-live="polite"></div><div class="grid"><label class="field">Embedded display palette for added sprites<select id="targetPalette"></select></label><label class="field">Indexing / master palette<select id="masterPalette"><option value="">Choose the master palette…</option></select></label></div><div class="row"><label><input id="keepRecoveryBackup" type="checkbox"> Keep an additional backup (optional)</label><span class="muted">Default: temporary recovery in app storage; removed after independently verified completion. Failed or interrupted operations retain recovery.</span><button id="protectTargetMaster">Set Selected as Protected Master…</button><span id="creatorMasterStatus" class="muted" role="status" aria-live="polite"></span></div><p class="muted">The display palette controls in-game colors. The indexing/master palette controls how source pixels become stable palette indexes; they may intentionally be different. Existing sprites, axes, physical order, and palettes are retained.</p></div></details>
<details class="step" open><summary>2 · Sources</summary><div class="body"><div class="row"><button id="addFiles">Add PNG Files…</button><button id="addTrueColorFiles" aria-describedby="trueColorIntakeStatus">Add True Color PNG Files…</button><span id="trueColorIntakeStatus" class="muted" role="status" aria-live="polite"></span><button id="addFolder">Add PNG Folder…</button><button id="relinkSource">Relink Marked Source…</button><button id="importSprMake2Manifest">Import Portable SprMake2 Manifest / DEF…</button><button id="addSheet">Add Sprite Sheet…</button><button id="prepareSources">Prepare / Batch Rename…</button><button id="addGif">Add Animated GIF…</button><button id="addPsd">Add Photoshop PSD…</button><button id="rebuildPsdArchive">Reconstruct Archive from PSD Folder…</button><button id="up">Move Up</button><button id="down">Move Down</button><button id="previewAxis">Preview Marked Axis, Crop & Palette</button><button id="suggestAxes">Suggest Axes for Marked…</button><button id="copyAxis">Copy First Marked Axis to Marked</button><button id="reviewDuplicateGroups">Review Exact Duplicate Groups…</button><button id="remove">Remove Selected</button><button id="clear">Clear</button></div><div class="row"><input id="sourceSearch" type="search" placeholder="Search name, path, or group,index" aria-label="Search staged sprite sources"><select id="sourceFilter" aria-label="Filter staged sprite sources"><option value="all">All source rows</option><option value="ready">Ready only</option><option value="conflict">Conflicts only</option><option value="stale">Changed or unavailable sources only</option></select><button id="sourceListMode" aria-pressed="true">List</button><button id="sourceGridMode" aria-pressed="false">Contact Sheet</button><button id="sourcePrev" aria-label="Previous source page">Previous page</button><button id="sourceNext" aria-label="Next source page">Next page</button><button id="markShown">Mark Shown</button><button id="unmarkShown">Unmark Shown</button><button id="clearSourceMarks">Clear Marks</button><span id="sourceFilterStatus" class="muted" role="status" aria-live="polite"></span><span id="sourceSelectionStatus" class="muted" role="status" aria-live="polite"></span></div><p id="sourceViewHint" class="muted" hidden>Contact Sheet uses each sprite’s final assigned palette. Switch to List for exact group, index, axis, crop, stored-palette, and duplicate-data overrides.</p><div id="sources" class="sources"></div></div></details>
<details class="step"><summary>3 · Filename Detection</summary><div class="body"><p class="muted">Preview a reviewed regular expression. Capture 1 is group and capture 2 is index by default.</p><div class="grid"><label class="field">Pattern<input id="pattern" placeholder="(?:g|group)?(\\d+)[_,-](?:i|index)?(\\d+)"></label><label class="field">Group capture<input id="groupCapture" type="number" min="1" value="1"></label><label class="field">Index capture<input id="numberCapture" type="number" min="1" value="2"></label><label class="field">Confidence<select id="confidence"><option value="review">Needs review</option><option value="high">High</option></select></label></div><button id="setRule">Use / Preview Rule</button><pre id="detection" role="status" aria-live="polite"></pre></div></details>
<details class="step" open><summary>4 · Numbering & Collision Review</summary><div class="body"><div class="grid"><label class="field">Numbering<select id="numberingMode"><option value="consecutive">Consecutive 1,2,3…</option><option value="stepped">Stepped 10,20,30…</option><option value="next-free">Next free index</option><option value="detected">Detected from filename</option></select></label><label class="field">Group<input id="group" type="number"></label><label class="field">Starting index<input id="startIndex" type="number" min="0"></label><label class="field">Step<input id="step" type="number" min="1"></label><label class="field">Collision policy<select id="collisionPolicy"><option value="stop">Stop for review</option><option value="skip">Skip collisions</option><option value="next-free">Move to next free</option><option value="replace-staged">Replace staged only</option></select></label></div><div class="grid"><label class="field">Occupied identities (one group,index per line)<textarea id="existing" rows="4"></textarea></label><label class="field">Reserved ranges (group:start-end:label)<textarea id="reserved" rows="4"></textarea></label></div></div></details>
<details class="step" open><summary>5 · Axis & Crop</summary><div class="body"><div class="grid"><label class="field">Nine-point anchor<select id="anchor"><option>top-left</option><option>top-center</option><option>top-right</option><option>center-left</option><option selected>center</option><option>center-right</option><option>bottom-left</option><option>bottom-center</option><option>bottom-right</option></select></label><label class="field">Exact X offset<input id="offsetX" type="number"></label><label class="field">Exact Y offset<input id="offsetY" type="number"></label><label class="field">Crop policy<select id="cropMode"><option value="none">Do not crop</option><option value="before-axis">Crop source first, then calculate axis</option><option value="after-axis">Calculate axis first, then crop and preserve alignment</option><option value="autocrop">SprMake2 autocrop (legacy)</option></select></label></div><p class="muted">Before-axis creates a reviewed indexed PNG snapshot, then calculates the selected anchor on its cropped dimensions. After-axis calculates on the original canvas, creates the same sealed crop snapshot, and shifts the stored axis by the crop origin so both backends preserve the reviewed position. Legacy autocrop remains SprMake2-only. Originals are never modified.</p></div></details>
<details class="step" open><summary>6 · Palette, Placeholder & Sharing</summary><div class="body"><div class="grid"><label class="field">Palette use<select id="paletteMode"><option value="target">Use matching embedded palette (exact indexes)</option><option value="image">Use each image palette</option><option id="trueColorOption" value="true-color">True Color (SFF 2.1 only)</option><option value="needs-palette">Needs Palette</option><option value="temporary">Temporary placeholder palette</option></select></label><label class="field">Image palette handling<select id="paletteChoice"><option value="own-png-palette">Preserve reviewed indexed colors</option></select></label><label class="field">Append image palettes to group<input id="imagePaletteGroup" type="number" min="0" max="65535" value="1"></label><label class="field">Image palette order<select id="imagePaletteTableOrder"><option value="index">Index order (0 → 255)</option><option value="reversed">Reversed (Photoshop order)</option></select></label><label class="field">Needs Palette method<select id="tilingMethod"><option value="single-palette">Reduce deliberately to one 256-color palette</option><option value="automatic-tiles">Tile automatically to preserve colors</option><option value="reviewed-tiles">Choose and review tile boundaries</option></select></label><label class="field">Temporary palette source order<select id="temporaryPaletteTableOrder"><option value="index">Index order (0 → 255)</option><option value="reversed">Reversed (Photoshop order)</option></select></label><label class="field">Identical sprite data<select id="duplicatePolicy"><option value="preserve-separate">Keep independent</option><option value="share-identical">Share identical data</option></select></label><label class="field"><span><input id="placeholder" type="checkbox"> Mark this incoming batch as placeholders</span><input id="placeholderNote" placeholder="Replacement note, owner, or purpose"></label><label class="field">Temporary palette group,index<input id="temporaryPaletteId" placeholder="9,1"></label><label class="field">Lifecycle identity<input id="temporaryPaletteLifecycleId" readonly></label></div><div class="row"><button id="chooseTemporaryPalette">Choose Temporary ACT / PNG…</button><button id="remapSelected">Apply Selected Palette to Marked Sources…</button><button id="openNeedsPalette">Continue Needs Palette in Palette Workshop…</button><span id="temporaryPaletteStatus" class="muted" role="status" aria-live="polite"></span></div><p id="paletteModeStatus" class="muted" role="status" aria-live="polite"></p><p class="muted">Matching embedded palette mode requires the source indexes to already match the reviewed target palette; it does not silently remap colors. Image mode preserves each indexed PNG palette and its explicit table order. True Color is available for sealed 8-bit RGB and RGBA PNG sources in SFF 2.1. Indexed PNG8 builds continue to use the established writer path. Needs Palette carries the exact staged sources and selected reduction or tiling method into Palette Workshop.</p><p class="muted">Temporary ACT/PNG table order is explicit and becomes part of the reviewed palette interpretation. Changing it rechecks every source; apply the selected palette to marked rows when their indexed colors no longer match. Exact conversion is automatic after review; lossy remapping reports changed pixels and color distance before acceptance. A temporary palette is never reused merely because its colors match another table.</p><p class="muted">The selected writer is shared with SFF and Stage viewers. Explicit specialist build buttons remain available and always state which backend they use.</p></div></details>
<details class="step" open><summary>7 · Conflict / Final Review</summary><div class="body"><div class="row"><label><input id="conflictsOnly" type="checkbox"> Show conflicts only</label><button id="clearDeletions">Clear Reviewed Deletions</button></div><details id="savedColorRules" class="saved-rules"><summary>Saved color rules <span id="savedRuleBadge" class="badge">not reviewed</span></summary><div class="saved-rules-body"><p class="muted">Review exact saved replacements against this intake, its current source bytes, and the selected master palette. Nothing is applied automatically.</p><div class="row"><button id="reviewSavedRules">Review</button><button id="acceptAllSavedRules" class="primary" disabled>Accept all exact</button></div><div id="savedRuleStatus" class="muted" role="status" aria-live="polite">Open Review to check reusable exact-color rules.</div><div id="savedRuleRows" class="saved-rule-list"></div><div id="savedRuleStale" class="saved-rule-list" aria-label="Saved rules needing review"></div></div></details><details id="nearestColorSuggestions" class="saved-rules"><summary>Nearest color suggestions <span id="nearestColorBadge" class="badge">not reviewed</span></summary><div class="saved-rules-body"><p class="muted">Optional review aid for colors that have no exact saved rule. Suggestions require exact alpha, never use protected index 0, and never apply automatically.</p><div class="row"><button id="reviewNearestColors">Review suggestions</button><button id="applySelectedNearest" class="primary" disabled>Review &amp; Apply Selected</button></div><div id="nearestColorStatus" class="muted" role="status" aria-live="polite">Open Review suggestions after selecting the exact master palette.</div><div id="nearestColorRows" class="saved-rule-list"></div></div></details><div id="review" class="summary"></div><p class="muted">Final review identifies the exact Master / Stored-FX palette from target and preserves mixed per-group sharing choices: each row can remain independent or share only exact duplicate sprite data. Creating the package writes snapshots, a manifest, a canonical specification, and backend adapter files. It does not build, adopt, overwrite, or open an SFF.</p></div></details>
</main><dialog id="writerComparisonDialog" aria-labelledby="writerComparisonTitle"><div class="row"><b id="writerComparisonTitle">Writer Comparison</b><span class="spacer"></span><button id="writerComparisonClose">Close</button></div><div id="writerComparisonBody"></div><div class="row"><button id="writerComparisonRun" class="primary" aria-describedby="writerComparisonRunStatus">Run Test · P1 IKEMaker vs P2 SprMake2</button><button id="writerComparisonJson">Open JSON as Text</button><button id="writerComparisonBuiltIn">Open IKEMaker SFF</button><button id="writerComparisonSprMake2">Open SprMake2 SFF</button><button id="writerComparisonFolder">Reveal Folder</button></div><p id="writerComparisonRunStatus" class="muted" role="status" aria-live="polite"></p></dialog><dialog id="spritePreviewDialog" aria-labelledby="spritePreviewTitle"><div class="row"><b id="spritePreviewTitle">Axis & Crop Preview</b><span class="spacer"></span><button id="spritePreviewApprove" class="primary" hidden>Approve This Suggested Axis</button><button id="spritePreviewClose">Close Without Approval</button></div><canvas id="spritePreviewCanvas" aria-label="Proposed sprite axis and crop preview"></canvas><p id="spritePreviewCaption" class="muted" role="status" aria-live="polite"></p></dialog><script>
const vscode=acquireVsCodeApi(),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));let draft=${json(model.draft)},selected=new Set(),timer=0,busy=false,plan=${json(model.plan)},applyInfo=${json(model.applyState)},savedRuleReview=null,nearestColorReview=null,sourcePage=0,sourceViewMode='list',thumbnailRequestId=0,sourceDrag=null,writerMode=${json(model.writerPreference?.mode || 'ikemaker')};const SOURCE_LIST_PAGE_SIZE=100,SOURCE_GRID_PAGE_SIZE=48,thumbnailCache=new Map();writerPreference.value=writerMode;
${creatorSourceActionAvailability.toString()}
${creatorNeedsPaletteHandoffAvailability.toString()}
${creatorOperationSummary.toString()}
function setCreatorControlAvailability(id,state){const control=document.getElementById(id);if(!control||!state)return;if(!control.dataset.enabledTitle)control.dataset.enabledTitle=control.title||'';control.disabled=Boolean(state.disabled);control.title=state.disabled?state.reason:control.dataset.enabledTitle;if(state.disabled)control.setAttribute('aria-description',state.reason);else control.removeAttribute('aria-description')}
function refreshCreatorSourceAvailability(pageIds,pageCount){const state=creatorSourceActionAvailability({sourceIds:draft.sources.map(item=>item.id),selectedIds:[...selected],readyIds:(plan?.ready||[]).map(item=>item.sourceId),staleIds:draft.sources.filter(item=>item.stale||item.unavailable).map(item=>item.id),pageIds,page:sourcePage,pageCount});for(const[id,value]of Object.entries(state))setCreatorControlAvailability(id,value)}
function syncNeedsPaletteHandoff(){const state=creatorNeedsPaletteHandoffAvailability({paletteMode:draft.configuration.paletteMode,targetPath:draft.target?.path||'',sourceCount:draft.sources.length,targetStale:Boolean(draft.target?.stale)});setCreatorControlAvailability('openNeedsPalette',state);return state}
const writerComparisonDialog=document.getElementById('writerComparisonDialog'),writerComparisonBody=document.getElementById('writerComparisonBody'),writerComparisonClose=document.getElementById('writerComparisonClose'),writerComparisonRun=document.getElementById('writerComparisonRun'),writerComparisonJson=document.getElementById('writerComparisonJson'),writerComparisonBuiltIn=document.getElementById('writerComparisonBuiltIn'),writerComparisonSprMake2=document.getElementById('writerComparisonSprMake2'),writerComparisonFolder=document.getElementById('writerComparisonFolder'),writerComparisonRunStatus=document.getElementById('writerComparisonRunStatus');numberingMode.options[0].textContent='Consecutive (+1 from starting index)';numberingMode.options[1].textContent='Stepped (+Step from starting index)';
function comparisonValue(value,fallback='Not recorded'){return value===null||value===undefined||value===''?fallback:String(value)}
let writerComparisonCanRun=false,writerComparisonCanBind=false;function renderWriterComparison(summary){writerComparisonCanRun=summary.runAvailable===true;writerComparisonCanBind=summary.semanticEquivalent&&summary.independentlyValidated&&summary.builtInAvailable&&summary.sprMake2Available;const result=summary.semanticEquivalent&&summary.independentlyValidated?'Equivalent and independently validated':summary.semanticEquivalent?'Semantically equivalent; independent validation incomplete':'Differences found';const card=(title,item)=>'<section class="comparison-card"><b>'+esc(title)+'</b><p>'+esc(item.backendId)+'</p><p>'+esc(comparisonValue(item.sprites))+' sprites · '+esc(comparisonValue(item.palettes))+' palettes · '+esc(item.byteLength===null?'Size not recorded':Number(item.byteLength).toLocaleString()+' bytes')+'</p><p class="muted">SHA-256 '+esc(comparisonValue(item.byteHash))+'</p></section>';writerComparisonBody.innerHTML='<p class="comparison-result '+(summary.semanticEquivalent&&summary.independentlyValidated?'ok':'error')+'">'+esc(result)+'</p><p>'+esc(summary.purpose||'Two-writer SFF comparison')+'</p><p>Semantic content: <b>'+(summary.semanticEquivalent?'same':'different')+'</b> · File bytes: <b>'+(summary.byteEquivalent?'identical':'different (allowed when semantics match)')+'</b> · Independent validation: <b>'+(summary.independentlyValidated?'passed':'not confirmed')+'</b></p><div class="comparison-grid">'+card('IKEMaker writer',summary.builtIn)+card('SprMake2 writer',summary.sprMake2)+'</div><p><b>First difference:</b> '+esc(summary.firstDifference||'None reported')+'</p>'+(summary.validationProfile?'<p><b>Validation profile:</b> '+esc(summary.validationProfile)+'</p>':'')+(summary.specificationHash?'<p class="muted"><b>Specification SHA-256:</b> '+esc(summary.specificationHash)+'</p>':'')+(summary.logTail?'<details><summary>SprMake2 validation log</summary><pre>'+esc(summary.logTail)+'</pre></details>':'')+'<p class="muted">'+esc(summary.path)+'</p>';setCreatorControlAvailability('writerComparisonBuiltIn',{disabled:!summary.builtInAvailable,reason:'The reviewed IKEMaker candidate is unavailable for this comparison.'});setCreatorControlAvailability('writerComparisonSprMake2',{disabled:!summary.sprMake2Available,reason:'The reviewed SprMake2 candidate is unavailable for this comparison.'});setCreatorControlAvailability('writerComparisonRun',{disabled:!writerComparisonCanBind,reason:summary.runUnavailableReason||'Both exact candidates must be semantically equivalent and independently validated before a test run.'});writerComparisonRun.title=writerComparisonCanRun?'Launch one round with P1 using the IKEMaker candidate and P2 using the SprMake2 candidate. The normal character files stay unchanged.':writerComparisonRun.title;writerComparisonRunStatus.className=writerComparisonCanRun?'muted':'error';writerComparisonRunStatus.setAttribute('role',writerComparisonCanRun?'status':'alert');writerComparisonRunStatus.textContent=writerComparisonCanRun?'Ready. The normal DEF and SFF stay unchanged. Temporary P1/P2 aliases are removed after IKEMEN exits.':(summary.runUnavailableReason||'Run is unavailable for this comparison.')+(writerComparisonCanBind?' Select Run Test to review and bind these exact candidates to the current character for this test only.':'');writerComparisonDialog.showModal()}
const renderWriterComparisonWithEnabledTitle=renderWriterComparison;renderWriterComparison=function(summary){renderWriterComparisonWithEnabledTitle(summary);if(!writerComparisonRun.disabled)writerComparisonRun.title=writerComparisonCanRun?'Launch one round with P1 using the IKEMaker candidate and P2 using the SprMake2 candidate. The normal character files stay unchanged.':'Review and bind these exact validated candidates to the current character for this test only.'};
const ids=['numberingMode','group','startIndex','step','collisionPolicy','anchor','offsetX','offsetY','cropMode','paletteMode','paletteChoice','imagePaletteGroup','imagePaletteTableOrder','tilingMethod','temporaryPaletteTableOrder','duplicatePolicy','temporaryPaletteId','temporaryPaletteLifecycleId','newArchiveVersion','png8Optimization'];
function number(id,fallback=0){const n=Number(document.getElementById(id).value);return Number.isSafeInteger(n)?n:fallback}
function parseReserved(){return reserved.value.split(/\\r?\\n/).map(x=>x.trim()).filter(Boolean).map((line,i)=>{const m=/^(-?\\d+):(-?\\d+)-(-?\\d+)(?::(.*))?$/.exec(line);return m?{group:+m[1],start:+m[2],end:+m[3],label:(m[4]||'').trim()||('range '+(i+1))}:{group:NaN,start:NaN,end:NaN,label:'Invalid: '+line}})}
function pull(){const c=draft.configuration;for(const id of ids)c[id]=['group','startIndex','step','offsetX','offsetY','imagePaletteGroup'].includes(id)?number(id,id==='step'?10:id==='imagePaletteGroup'?1:0):document.getElementById(id).value;c.keepRecoveryBackup=keepRecoveryBackup.checked;c.placeholder=placeholder.checked;c.placeholderNote=placeholderNote.value.slice(0,500);c.masterPaletteId=masterPalette.value;c.reservedRanges=parseReserved();draft.existingIdentities=existing.value.split(/[\\r\\n;]+/).map(x=>x.trim()).filter(Boolean);draft.addedSpritePaletteId=c.paletteMode==='temporary'?c.temporaryPaletteId:(c.paletteMode==='target'&&draft.target?targetPalette.value:'');draft.reviewConflictsOnly=conflictsOnly.checked;const p=pattern.value.trim();c.filenameRules=p?[{id:'workspace-rule',pattern:p,groupCapture:number('groupCapture',1),numberCapture:number('numberCapture',2),confidence:confidence.value}]:[];document.querySelectorAll('[data-source]').forEach(el=>{const id=el.dataset.source;c.overrides[id]=c.overrides[id]||{};for(const key of ['group','number','axisX','axisY']){const input=el.querySelector('[data-override="'+key+'"]');if(input&&input.value!=='')c.overrides[id][key]=Number(input.value);else delete c.overrides[id][key]}for(const key of ['cropMode','duplicatePolicy','paletteId']){const input=el.querySelector('[data-override="'+key+'"]');if(input?.value)c.overrides[id][key]=input.value;else delete c.overrides[id][key]}const evidence=c.overrides[id].axisEvidence,effectiveCrop=c.overrides[id].cropMode||c.cropMode,expectedStage=effectiveCrop==='before-axis'?'after-reviewed-source-crop':'source-image';if(evidence&&(c.overrides[id].axisX!==evidence.proposedAxisX||c.overrides[id].axisY!==evidence.proposedAxisY||evidence.evidence?.sourceCoordinateBasis?.stage!==expectedStage))delete c.overrides[id].axisEvidence})}
function save(){pull();clearTimeout(timer);vscode.postMessage({type:'stage',draft})}
function fill(){const c=draft.configuration;for(const id of ids)document.getElementById(id).value=c[id];keepRecoveryBackup.checked=c.keepRecoveryBackup===true;placeholder.checked=!!c.placeholder;placeholderNote.value=c.placeholderNote||'';placeholderNote.disabled=!placeholder.checked;const temporary=c.paletteMode==='temporary',targetMode=c.paletteMode==='target',imageMode=c.paletteMode==='image';temporaryPaletteId.disabled=!temporary;temporaryPaletteLifecycleId.disabled=!temporary;temporaryPaletteTableOrder.disabled=!temporary;chooseTemporaryPalette.disabled=!temporary;imagePaletteGroup.disabled=!imageMode||!draft.target;const orderText=c.temporaryPaletteTableOrder==='reversed'?'Reversed Photoshop order (255 → 0)':'Index order (0 → 255)';temporaryPaletteStatus.textContent=temporary?(c.temporaryPalettePath?(c.temporaryPaletteStale?'Palette changed or unavailable · choose again':c.temporaryPalettePath+' · '+orderText):'Choose one ACT or indexed PNG palette.'):(imageMode?(draft.target?'Image palettes append after the selected group’s highest index.':'Image palettes retained for the new archive'):'Embedded display palette mode');existing.value=(draft.existingIdentities||[]).join('\\n');existing.disabled=!!draft.target;reserved.value=(c.reservedRanges||[]).map(x=>x.group+':'+x.start+'-'+x.end+(x.label?':'+x.label:'')).join('\\n');conflictsOnly.checked=!!draft.reviewConflictsOnly;const rule=(c.filenameRules||[])[0];pattern.value=rule?.pattern||'';groupCapture.value=rule?.groupCapture||1;numberCapture.value=rule?.numberCapture||2;confidence.value=rule?.confidence||'review';const repeated=draft.target?.duplicateSpriteIds?.length?' <span class="error">· '+draft.target.duplicateSpriteIds.length+' repeated sprite identity/identities require the future certified built-in route</span>':'';targetSummary.innerHTML=draft.target?'<b>'+esc(draft.target.name)+'</b> · '+draft.target.spriteCount+' sprites · '+draft.target.paletteCount+' palettes'+(draft.target.stale?' <span class="error">· changed or unavailable</span>':'')+repeated:'<span class="muted">New archive. Choose an existing SFF to safely add a small sprite batch.</span>';targetPalette.innerHTML=draft.target?(draft.target.palettes||[]).map(p=>'<option value="'+p.id+'" '+(p.id===draft.addedSpritePaletteId?'selected':'')+'>Display '+p.id+'</option>').join(''):'<option value="">Image palettes will be used</option>';masterPalette.innerHTML='<option value="">Choose the master palette…</option>'+(draft.target?(draft.target.palettes||[]).map(p=>'<option value="'+p.id+'" '+(p.id===c.masterPaletteId?'selected':'')+'>Index with '+p.id+'</option>').join(''):'');targetPalette.disabled=!draft.target||!targetMode;masterPalette.disabled=!draft.target;protectTargetMaster.disabled=!draft.target||!c.masterPaletteId;creatorMasterStatus.textContent=c.masterPaletteId?'Indexing authority: '+c.masterPaletteId:'No indexing/master palette selected. Choose one above.';clearTarget.disabled=!draft.target;render()}
const baseFill=fill;fill=function(){baseFill();const c=draft.configuration,version=draft.target?.sffVersion||c.newArchiveVersion||'2.1';trueColorOption.hidden=version!=='2.1';trueColorOption.disabled=version!=='2.1';const activeTrueColor=c.paletteMode==='true-color',needsPalette=c.paletteMode==='needs-palette',imageMode=c.paletteMode==='image',temporary=c.paletteMode==='temporary';cropMode.disabled=activeTrueColor;cropMode.title=activeTrueColor?'True Color currently preserves the complete source image; crop it before intake if needed.':'';imagePaletteTableOrder.disabled=!imageMode;tilingMethod.disabled=!needsPalette;openNeedsPalette.disabled=!needsPalette||!draft.target||!draft.sources.length;paletteModeStatus.className=(activeTrueColor||needsPalette)?'error':'muted';paletteModeStatus.textContent=activeTrueColor?'True Color SFF 2.1 build is ready for sealed RGB24 or RGBA32 PNG sources. The independent validator checks exact decoded pixels before use.':needsPalette?'Choose the reduction or tiling method, then continue to Palette Workshop. Building stays blocked until the images have a reviewed palette plan.':imageMode?'Image palette order: '+(c.imagePaletteTableOrder==='reversed'?'Reversed (Photoshop order)':'Index order'):(temporary?'Temporary palette order is reviewed separately.':'');};
function filteredSources(){const query=sourceSearch.value.trim().toLowerCase(),filter=sourceFilter.value,rowBySource=new Map((plan?.rows||[]).map(row=>[row.sourceId,row]));return draft.sources.map((source,index)=>({source,index,row:rowBySource.get(source.id)})).filter(({source,row})=>{if(query&&!([source.name,source.path,row?.identity].filter(Boolean).join(' ').toLowerCase().includes(query)))return false;if(filter==='ready'&&row?.status!=='ready')return false;if(filter==='conflict'&&row?.status!=='blocked')return false;if(filter==='stale'&&!source.stale)return false;return true})}
function sourcePageSize(){return sourceViewMode==='grid'?SOURCE_GRID_PAGE_SIZE:SOURCE_LIST_PAGE_SIZE}
masterPalette.onchange=save;protectTargetMaster.onclick=()=>{pull();vscode.postMessage({type:'protectTargetMaster',draft})};
function sourceCacheKey(source){const row=(plan?.rows||[]).find(item=>item.sourceId===source.id),mode=draft.configuration.paletteMode,id=row?.paletteId||(mode==='target'?draft.addedSpritePaletteId:mode==='temporary'?draft.configuration.temporaryPaletteId:''),palette=(draft.configuration.importedPalettes||[]).find(item=>item.id===id)||(draft.target?.palettes||[]).find(item=>item.id===id),colorHash=palette?.colorHash||(mode==='temporary'?draft.configuration.temporaryPaletteColorHash:'')||source.paletteColorHash||'';return source.id+':'+String(source.byteHash||'').toUpperCase()+':'+String(id||'')+':'+String(colorHash||'')}
function requestPageThumbnails(page){if(sourceViewMode!=='grid'||!page.length)return;const missing=page.filter(item=>!thumbnailCache.has(sourceCacheKey(item.source))).map(item=>item.source.id);if(!missing.length)return;const requestId=++thumbnailRequestId;vscode.postMessage({type:'requestSourceThumbnails',requestId,sourceIds:missing})}
function render(){const validIds=new Set(draft.sources.map(source=>source.id));for(const id of selected)if(!validIds.has(id))selected.delete(id);const visible=filteredSources(),pageSize=sourcePageSize(),pageCount=Math.max(1,Math.ceil(visible.length/pageSize));sourcePage=Math.max(0,Math.min(sourcePage,pageCount-1));const start=sourcePage*pageSize,page=visible.slice(start,start+pageSize),end=start+page.length;sourceFilterStatus.textContent=visible.length?(start+1)+'–'+end+' of '+visible.length+' matching · '+draft.sources.length+' total':'0 of '+draft.sources.length+' matching';sourceSelectionStatus.textContent=selected.size+' marked';sourceListMode.setAttribute('aria-pressed',String(sourceViewMode==='list'));sourceGridMode.setAttribute('aria-pressed',String(sourceViewMode==='grid'));sourceViewHint.hidden=sourceViewMode!=='grid';sources.classList.toggle('contact-sheet',sourceViewMode==='grid');const paletteValues=new Map();for(const p of draft.target?.palettes||[])if(!paletteValues.has(p.id))paletteValues.set(p.id,(p.id==='1,1'?'Master ':'Stored/FX ')+p.id);for(const p of draft.configuration.importedPalettes||[])paletteValues.set(p.id,'Imported '+p.id);const availablePalettes=[...paletteValues].map(([value,label])=>({value,label}));const listRow=({source:s,index:i})=>{const o=draft.configuration.overrides[s.id]||{},crop=o.cropMode||'',duplicates=o.duplicatePolicy||'',stored=o.paletteId||'',storedChoices=availablePalettes.map(p=>'<option value="'+esc(p.value)+'" '+(stored===p.value?'selected':'')+'>'+esc(p.label)+'</option>').join('');return '<div class="source" data-source="'+s.id+'"><input type="checkbox" data-select '+(selected.has(s.id)?'checked':'')+' aria-label="Mark '+esc(s.name)+'"><span title="'+esc(s.path)+'"><b>'+esc(s.name)+'</b><br><small class="'+(s.stale?'error':'')+'">'+s.width+'×'+s.height+' · #'+(i+1)+(s.stale?(s.unavailable?' · unavailable; add again to refresh':' · changed; add again to refresh'):'')+'</small></span><input title="Group override" aria-label="Group override for '+esc(s.name)+'" data-override="group" type="number" placeholder="group" value="'+(o.group??'')+'"><input title="Index override" aria-label="Index override for '+esc(s.name)+'" data-override="number" type="number" min="0" placeholder="index" value="'+(o.number??'')+'"><input class="wide" title="Exact axis X" aria-label="Exact axis X for '+esc(s.name)+'" data-override="axisX" type="number" placeholder="axis X" value="'+(o.axisX??'')+'"><input class="wide" title="Exact axis Y" aria-label="Exact axis Y for '+esc(s.name)+'" data-override="axisY" type="number" placeholder="axis Y" value="'+(o.axisY??'')+'"><select class="wide" title="Crop override for this sprite" aria-label="Crop override for '+esc(s.name)+'" data-override="cropMode"><option value="">Batch crop choice</option><option value="none" '+(crop==='none'?'selected':'')+'>No crop</option><option value="before-axis" '+(crop==='before-axis'?'selected':'')+'>Crop → axis</option><option value="after-axis" '+(crop==='after-axis'?'selected':'')+'>Axis → crop</option><option value="autocrop" '+(crop==='autocrop'?'selected':'')+'>Legacy autocrop</option></select><select class="wide" title="Stored palette override for this sprite. Preview uses this table without rewriting the PNG." aria-label="Stored palette override for '+esc(s.name)+'" data-override="paletteId"><option value="">Batch / image palette</option>'+storedChoices+'</select><select class="wide" title="Identical-data override for this sprite" aria-label="Identical-data override for '+esc(s.name)+'" data-override="duplicatePolicy"><option value="">Batch duplicate choice</option><option value="preserve-separate" '+(duplicates==='preserve-separate'?'selected':'')+'>Keep independent</option><option value="share-identical" '+(duplicates==='share-identical'?'selected':'')+'>Share exact data</option></select></div>'};const gridCard=({source:s,index:i,row})=>{const cached=thumbnailCache.get(sourceCacheKey(s)),image=cached?.dataUri?'<img src="'+cached.dataUri+'" alt="Thumbnail of '+esc(s.name)+' using '+esc(cached.paletteLabel||'its image palette')+'">':'<span class="thumb-error">'+esc(cached?.error||'Loading thumbnail…')+'</span>',state=row?.status==='blocked'?' · blocked':row?.status==='skipped'?' · skipped':'',palette=cached?.paletteId?' · pal '+cached.paletteId:'';return '<label class="source-card" data-source="'+s.id+'" title="'+esc(s.path)+'"><input type="checkbox" data-select '+(selected.has(s.id)?'checked':'')+' aria-label="Mark '+esc(s.name)+'"><span class="thumb">'+image+'</span><b>'+esc(s.name)+'</b><small class="'+(s.stale||row?.status==='blocked'?'error':'muted')+'">#'+(i+1)+' · '+s.width+'×'+s.height+(row?.identity?' · '+esc(row.identity):'')+palette+state+(s.unavailable?' · unavailable':'')+'</small></label>'};sources.innerHTML=draft.sources.length?(visible.length?page.map(sourceViewMode==='grid'?gridCard:listRow).join(''):'<p class="muted" style="padding:8px">No source rows match this filter.</p>'):'<p class="muted" style="padding:8px">No PNG sources staged.</p>';document.querySelectorAll('[data-select]').forEach(x=>x.onchange=()=>{const id=x.closest('[data-source]').dataset.source;x.checked?selected.add(id):selected.delete(id);sourceSelectionStatus.textContent=selected.size+' marked';refreshCreatorSourceAvailability(page.map(item=>item.source.id),pageCount)});document.querySelectorAll('[data-override]').forEach(x=>x.onchange=save);refreshCreatorSourceAvailability(page.map(item=>item.source.id),pageCount);const needsPaletteReason=draft.configuration.paletteMode!=='needs-palette'?'Choose Needs Palette under Palette use first.':!draft.target?.path?'Choose an existing reviewed SFF target first.':!draft.sources.length?'Add at least one source first.':draft.target?.stale?'The target changed after review; choose it again first.':'';setCreatorControlAvailability('openNeedsPalette',{enabled:!needsPaletteReason,reason:needsPaletteReason});requestPageThumbnails(page);renderReview();enforceBackendAvailability()}
const renderWithNeedsPaletteHandoff=render;render=function(){renderWithNeedsPaletteHandoff();syncNeedsPaletteHandoff()};
function bytes(value){const n=Number(value)||0;return n<1024?n+' B':n<1048576?(n/1024).toFixed(1)+' KiB':(n/1048576).toFixed(1)+' MiB'}
function renderSavedRuleStale(){const stale=savedRuleReview?.stale||[],limit=8,total=Number(savedRuleReview?.summary?.staleTotalCount??stale.length),shown=Math.min(limit,stale.length),omittedCount=Math.max(0,total-shown);savedRuleStale.textContent='';for(const item of stale.slice(0,limit)){const card=document.createElement('div');card.className='saved-rule-row';const facts=document.createElement('p');facts.textContent='Rule '+String(item.ruleId)+' needs review: '+(item.reasons||[]).join(', ');const actions=document.createElement('div');actions.className='saved-rule-actions';const manage=document.createElement('button');manage.textContent='Manage in Palette Workshop';manage.onclick=()=>vscode.postMessage({type:'manageSavedColorRules'});actions.append(manage);card.append(facts,actions);savedRuleStale.append(card)}if(omittedCount){const omitted=document.createElement('p');omitted.className='muted';omitted.textContent=omittedCount+' more stale match'+(omittedCount===1?' is':'es are')+' omitted. Open Palette Workshop to review all saved rules.';savedRuleStale.append(omitted)}}
function renderSavedRules(){const rows=savedRuleReview?.rows||[],summary=savedRuleReview?.summary||{},acceptAll=(savedRuleReview?.actions||[]).find(action=>action.kind==='accept-all');renderSavedRuleStale();savedRuleBadge.textContent=rows.length?rows.length+' exact match'+(rows.length===1?'':'es'):(savedRuleReview?'no exact matches':'not reviewed');setCreatorControlAvailability('acceptAllSavedRules',{enabled:!busy&&!!acceptAll,reason:busy?'Wait for the current saved-rule review action to finish.':'Review saved color rules first; Accept all exact is available only when an exact retained action exists.'});savedRuleRows.textContent='';if(!savedRuleReview)return;if(!rows.length){savedRuleStatus.textContent=summary.staleRuleCount?summary.staleRuleCount+' saved rule match'+(summary.staleRuleCount===1?' needs':'es need')+' review because its evidence changed.':'No saved rule exactly matches the current source bytes and master palette.';return}savedRuleStatus.textContent=summary.matchedIssueCount+' color issue'+(summary.matchedIssueCount===1?'':'s')+' across '+summary.matchedImageCount+' image'+(summary.matchedImageCount===1?'':'s')+' and '+summary.matchedPixelCount+' pixel'+(summary.matchedPixelCount===1?'':'s')+'. Review before applying.';for(const row of rows){const card=document.createElement('div');card.className='saved-rule-row';const facts=document.createElement('div'),source=document.createElement('span'),destination=document.createElement('span'),text=document.createElement('p');source.className='swatch';source.setAttribute('role','img');source.style.backgroundColor='rgba('+row.sourceRgba.map(Number).join(',')+')';source.setAttribute('aria-label','Saved rule source color '+row.sourceRgba.join(', '));destination.className='swatch';destination.setAttribute('role','img');destination.style.backgroundColor='rgba('+row.destinationRgba.map(Number).join(',')+')';destination.setAttribute('aria-label','Palette index '+row.destinationIndex+' color '+row.destinationRgba.join(', '));text.append(source,document.createTextNode(' → index '+row.destinationIndex+' '),destination,document.createTextNode(' · '+row.affectedImageCount+' image'+(row.affectedImageCount===1?'':'s')+' · '+row.affectedPixelCount+' pixel'+(row.affectedPixelCount===1?'':'s')));facts.append(text);const actions=document.createElement('div');actions.className='saved-rule-actions';const applyAction=(savedRuleReview.actions||[]).find(action=>action.kind==='accept-row'&&action.rowIds?.length===1&&action.rowIds[0]===row.rowId),ignoreAction=(savedRuleReview.actions||[]).find(action=>action.kind==='ignore-row'&&action.rowIds?.length===1&&action.rowIds[0]===row.rowId);for(const[label,kind,action]of[['Apply','acceptSavedRule',applyAction],['Ignore this intake','ignoreSavedRule',ignoreAction]]){const button=document.createElement('button');button.textContent=label;button.disabled=busy||!action;button.onclick=()=>{pull();busy=true;renderSavedRules();vscode.postMessage({type:kind,draft,reviewId:savedRuleReview.reviewId,actionId:action.actionId})};actions.append(button)}const workshop=document.createElement('button');workshop.textContent='Open in Palette Workshop';workshop.disabled=busy||!row.workshopActionId;workshop.onclick=()=>{pull();vscode.postMessage({type:'openSavedRuleInPaletteWorkshop',draft,reviewId:savedRuleReview.reviewId,actionId:row.workshopActionId})};actions.append(workshop);card.append(facts,actions);savedRuleRows.append(card)}}
function renderReview(){const conflicts=plan?.conflicts||[],ready=plan?.ready||[],skipped=plan?.skipped||[],deletions=draft.deletedSpriteIdentities||[],integrity=draft.integrityIssues||[],dupes=plan?.duplicateAnalysis,cleanup=plan?.temporaryPaletteCleanup||{eligible:[],blocked:[]},active=Number(draft.target?.spriteCount||0),operations=creatorOperationSummary(plan,draft),sprMake2Blocked=Boolean(draft.target?.duplicateSpriteIds?.length||draft.configuration.paletteMode==='true-color'&&draft.replaceSpriteIdentities?.length),sprMake2Reason=draft.target?.duplicateSpriteIds?.length?'SprMake2 cannot safely rebuild a table with repeated sprite identities. Package-only remains available; built-in adoption stays disabled pending physical certification.':draft.configuration.truecolorLinkedReplacement?'Linked truecolor dependents retain their physical link. SprMake2 cannot build the required mixed sharing policy. Use Save Verified SFF Copy to save and reopen a standalone candidate; active-archive adoption stays gated.':draft.configuration.paletteMode==='true-color'&&draft.replaceSpriteIdentities?.length?'The tested SprMake2 truecolor candidate fails independent strict canonical validation. Use Save Verified SFF Copy; active-archive adoption stays gated.':'';const shown=draft.reviewConflictsOnly?conflicts:[...conflicts,...skipped,...ready],imageAssignments=new Map((plan?.imagePaletteAllocation?.assignments||[]).map(item=>[item.sourceId,item.paletteId])),palette=draft.configuration.paletteMode==='temporary'?'Temporary '+draft.configuration.temporaryPaletteId+' · '+(draft.configuration.temporaryPaletteTableOrder==='reversed'?'reversed 255 → 0':'index 0 → 255'):(draft.configuration.paletteMode==='image'?'Image palette':((draft.addedSpritePaletteId==='1,1'?'Master ':'Stored/FX ')+draft.addedSpritePaletteId));const cropLabels={none:'no crop','before-axis':'crop before axis','after-axis':'axis before crop',autocrop:'legacy autocrop'},impact='<div class="review-facts"><span>active '+active+'</span><span>unchanged '+Math.max(0,active-operations.deletions-operations.replacements)+'</span><span>add '+operations.additions+'</span><span>replace '+operations.replacements+'</span><span>remove '+operations.deletions+'</span><span>planned total '+(active-operations.deletions+operations.additions)+'</span><span>skipped '+skipped.length+'</span><span>recovery blockers '+integrity.length+'</span><span>temporary palettes removed '+cleanup.eligible.length+'</span></div>',integritySummary=integrity.map(issue=>'<div class="review-row error"><b>Recovered draft blocked</b> — '+esc(issue.message||issue.code||'Unknown retained-draft integrity failure')+'</div>').join(''),deletionSummary=deletions.map(identity=>'<div class="review-row danger"><b>Delete sprite '+esc(identity)+'</b> — excluded from the private rebuild candidate; the active SFF changes only after validation and explicit adoption.</div>').join(''),cleanupSummary=[...(cleanup.eligible||[]).map(item=>'<div class="review-row danger"><b>Delete temporary palette '+esc(item.paletteId)+'</b> — its last reviewed placeholder owner(s) are being removed; sprite, palette, and lifecycle registry change atomically after validation.</div>'),...(cleanup.blocked||[]).map(item=>'<div class="review-row muted"><b>Keep temporary palette '+esc(item.paletteId||'unknown')+'</b> — '+esc((item.reasons||[]).join('; ')||'cleanup is not proven safe')+'.</div>')].join(''),backendWarning=sprMake2Blocked?'<div class="review-row error"><b>Backend limit</b> — '+esc(sprMake2Reason)+'</div>':'',duplicateSummary=dupes?'<div class="review-row"><b>Exact duplicate audit</b> — '+dupes.exactGroupCount+' group(s), '+dupes.linkCandidateCount+' possible link(s)'+(dupes.unclassifiedCount?' · '+dupes.unclassifiedCount+' source(s) lack decoded indexed evidence':'')+'<div class="review-facts"><span>independent staged PNG bytes '+bytes(dupes.independentSourceBytes)+'</span><span>shared-source estimate '+bytes(dupes.sharedSourceBytes)+'</span><span>possible source-byte reduction '+bytes(dupes.estimatedSourceBytesSaved)+'</span></div>'+(dupes.groups||[]).map(g=>'<div class="review-facts"><span>group '+g.groupNumber+': '+g.members.map(m=>esc(m.name)+' → '+esc(m.identity)).join(' · ')+'</span></div>').join('')+'<div class="muted">These are source-payload estimates, not promised final SFF sizes; compression and archive tables are backend-dependent.</div></div>':'';review.innerHTML=(ready.some(row=>Number(row.group)===65535)?'<p role="status">${require('./sff_runtime_group_warning').runtimeGroupWarning(65535)}</p>':'')+'<b>'+draft.sources.length+' source(s) · '+ready.length+' ready · '+deletions.length+' deletion(s) · '+conflicts.length+' blocked · '+skipped.length+' skipped</b>'+impact+integritySummary+backendWarning+deletionSummary+cleanupSummary+duplicateSummary+(shown.length?shown.map(r=>{const readyRow=r.status==='ready',skippedRow=r.status==='skipped',basis=r.axisBasis,source=r.source||draft.sources.find(s=>s.id===r.sourceId),bounds=source?.cropBounds,axisFact=r.cropMode==='after-axis'&&bounds&&!bounds.empty?'original axis '+r.axisX+','+r.axisY+' · stored after crop '+(r.axisX-bounds.x)+','+(r.axisY-bounds.y):'axis '+r.axisX+','+r.axisY+(basis?' from '+basis.width+'×'+basis.height:''),facts=readyRow?[axisFact,r.axisEvidence?'axis suggestion '+r.axisEvidence.method+' · '+Math.round(Number(r.axisEvidence.confidence||0)*100)+'% · '+(r.axisEvidence.visualReviewStatus==='approved'?'visually approved':'preview required'):null,cropLabels[r.cropMode]||r.cropMode,'palette '+(r.paletteId||imageAssignments.get(r.sourceId)||palette),r.duplicatePolicy==='share-identical'?'share identical data':'independent sprite data',source?(source.width+'×'+source.height+' source'):null].filter(Boolean):skippedRow?['excluded from this build']:[];return '<div class="review-row '+(readyRow?'ok':skippedRow?'muted':'error')+'"><b>'+esc(source?.name||r.sourceId)+'</b> — '+esc(r.identity||r.reason||r.status)+(r.reason?' · '+esc(r.reason):'')+(facts.length?'<div class="review-facts">'+facts.map(f=>'<span>'+esc(f)+'</span>').join('')+'</div>':'')+'</div>'}).join(''):'<span class="muted">No added sources.</span>');clearDeletions.disabled=busy||!deletions.length;apply.disabled=busy||!applyInfo.enabled;build.disabled=busy||!applyInfo.enabled||sprMake2Blocked;compareBoth.disabled=busy||!applyInfo.enabled||sprMake2Blocked;discard.disabled=busy||(!draft.sources.length&&!deletions.length&&!integrity.length);apply.title=applyInfo.reason||'Create immutable reviewed package';build.title=applyInfo.reason||sprMake2Reason||'Build a private candidate, validate it, then atomically adopt it';compareBoth.title=applyInfo.reason||sprMake2Reason||'Build and validate both private candidates without adoption';status.textContent=applyInfo.reason||'Draft is ready for package creation.';const copyButton=document.getElementById('saveTruecolorCopy');copyButton.hidden=!(draft.configuration.paletteMode==='true-color'&&draft.replaceSpriteIdentities?.length);copyButton.disabled=copyButton.hidden||busy||!applyInfo.enabled;copyButton.title=applyInfo.reason||'Save a strictly validated candidate as a new standalone SFF. The active archive and retained draft stay unchanged.';detection.textContent=(draft.sources||[]).map(s=>{const r=(plan?.rows||[]).find(x=>x.sourceId===s.id);return s.name+' → '+(r?.detection?.matched?(r.detection.identity||r.detection.error):'no match')}).join('\\n');renderSavedRules()}
function renderNearestColors(){const rows=nearestColorReview?.rows||[],summary=nearestColorReview?.summary||{},cssRgba=color=>'rgba('+color.slice(0,3).map(Number).join(',')+','+(Number(color[3])/255)+')';nearestColorRows.textContent='';nearestColorBadge.textContent=rows.length?rows.length+' to review':(nearestColorReview?'none available':'not reviewed');if(!nearestColorReview){applySelectedNearest.disabled=true;return}if(!rows.length){nearestColorStatus.textContent='No additional unmatched colors have safe alpha-compatible suggestions.';applySelectedNearest.disabled=true;return}nearestColorStatus.textContent='Nothing is selected or applied automatically. Choose a row, inspect one exact palette index, then use Review & Apply Selected.'+(summary.omittedRowCount?' '+summary.omittedRowCount+' additional issue'+(summary.omittedRowCount===1?' is':'s are')+' omitted by the safety limit.':'');for(const row of rows){const card=document.createElement('fieldset');card.className='saved-rule-row';card.dataset.nearestRow=row.rowId;const legend=document.createElement('legend'),include=document.createElement('input');include.type='checkbox';include.dataset.nearestInclude=row.rowId;include.setAttribute('aria-label','Include this unmatched color in the reviewed nearest-color decision');const source=document.createElement('span');source.className='swatch';source.setAttribute('role','img');source.style.backgroundColor=cssRgba(row.sourceRgba);source.setAttribute('aria-label','Unmatched source color '+row.sourceRgba.join(', '));legend.append(include,source,document.createTextNode(' '+row.affectedImageCount+' image'+(row.affectedImageCount===1?'':'s')+' · '+row.affectedPixelCount+' pixel'+(row.affectedPixelCount===1?'':'s')+(row.ambiguous?' · nearest distance is tied; choose deliberately':' · nearest suggestion; review required')));card.append(legend);if(!row.candidates.length){const unavailable=document.createElement('p');unavailable.className='muted';unavailable.textContent=row.reason==='fully-transparent-source'?'Transparent source colors require explicit handling; no nearest color is offered.':'No alpha-compatible unprotected palette color is available.';include.disabled=true;card.append(unavailable)}for(const candidate of row.candidates){const label=document.createElement('label'),radio=document.createElement('input'),swatch=document.createElement('span');label.className='row';radio.type='radio';radio.name='nearest-'+row.rowId;radio.value=candidate.candidateId;radio.dataset.nearestCandidate=row.rowId;if(row.suggestedCandidateId===candidate.candidateId&&!row.ambiguous)radio.checked=true;swatch.className='swatch';swatch.setAttribute('role','img');swatch.style.backgroundColor=cssRgba(candidate.rgba);swatch.setAttribute('aria-label','Palette index '+candidate.index+' color '+candidate.rgba.join(', '));label.append(radio,swatch,document.createTextNode(' index '+candidate.index+' · RGB distance² '+candidate.distanceSquared+' · largest channel change '+candidate.maxChannelDelta));card.append(label)}if(row.omittedCandidateCount){const omitted=document.createElement('p');omitted.className='muted';omitted.textContent=row.omittedCandidateCount+' more alpha-compatible palette indexes omitted; use Palette Workshop for a different destination.';card.append(omitted)}nearestColorRows.append(card)}nearestColorRows.querySelectorAll('input').forEach(input=>input.onchange=renderNearestApplyState);renderNearestApplyState()}
function nearestSelections(){const selections=[];for(const include of nearestColorRows.querySelectorAll('[data-nearest-include]:checked')){const rowId=include.dataset.nearestInclude,chosen=nearestColorRows.querySelector('[data-nearest-candidate="'+rowId+'"]:checked');if(chosen)selections.push({rowId,candidateId:chosen.value})}return selections}
function renderNearestApplyState(){const selectedRows=nearestColorRows.querySelectorAll('[data-nearest-include]:checked').length,selections=nearestSelections(),reason=!nearestColorReview?'Review nearest-color suggestions first.':!selectedRows?'Select one or more unmatched-color rows first.':selections.length!==selectedRows?'Choose one palette candidate for every selected row.':busy?'Wait for the current nearest-color review action to finish.':'';applySelectedNearest.disabled=!!reason;applySelectedNearest.title=reason||'Recheck these exact selections, then retain map-index decisions in this Creator draft.';applySelectedNearest.setAttribute('aria-description',applySelectedNearest.title)}
const capabilityHonestyFill=fill;fill=function(){capabilityHonestyFill();const heading=document.querySelector('.creator-actions > b');if(heading)heading.textContent='SFF Creator';const option=paletteMode.querySelector('option[value="needs-palette"]'),needsPalette=draft.configuration.paletteMode==='needs-palette';if(option){option.disabled=false;option.textContent='Needs Palette (review-only handoff)'}for(const item of tilingMethod.options){item.disabled=!needsPalette;item.textContent=item.value==='single-palette'?'Record preference: one 256-color palette (not performed)':item.value==='automatic-tiles'?'Record preference: automatic tiles (unavailable)': 'Record preference: reviewed tile boundaries (unavailable)'}openNeedsPalette.textContent='Open Review-Only Needs Palette Handoff…';if(needsPalette){paletteModeStatus.className='error';paletteModeStatus.textContent='Unsupported boundary: this Needs Palette handoff does not perform color reduction or tiling. It only verifies the exact target/sources and records this preference. Palette Workshop’s separate manual-reduction tools remain available for reviewed collective PNG working copies. Alternatives: use an already indexed PNG matching an embedded palette; choose Image palette for indexed artwork; choose True Color for SFF 2.1; or prepare indexed/tiled PNGs externally.'}syncNeedsPaletteHandoff()};
const baseRenderReview=renderReview;renderReview=function(){baseRenderReview();const c=draft.configuration,start=Number(c.startIndex)||0,step=c.numberingMode==='stepped'?Math.max(1,Number(c.step)||10):1,examples=[start,start+step,start+step*2].join(', '),writerLabel=writerMode==='sprmake2'?'SprMake2':writerMode==='both'?'Both writers':'IKEMaker',paletteLabel=c.paletteMode==='true-color'?(writerMode==='sprmake2'?'True Color · SFF 2.1 · SprMake2 true color':writerMode==='both'?'True Color · Both writers comparison blocked':'True Color · SFF 2.1 · IKEMaker native PNG24/PNG32'):c.paletteMode==='needs-palette'?'Needs Palette · Palette Workshop handoff required':c.paletteMode==='image'?'Image palette · '+(c.imagePaletteTableOrder==='reversed'?'Reversed (Photoshop order)':'Index order'):c.paletteMode;review.insertAdjacentHTML('afterbegin','<div class="review-row"><b>Batch contract</b><div class="review-facts"><span>writer '+esc(writerLabel)+'</span><span>numbering '+esc(examples)+'</span><span>'+esc(paletteLabel)+'</span><span>duplicates '+esc(c.duplicatePolicy)+'</span></div></div>');renderNearestColors()};
 let spritePreviewEpoch=0,currentPreview=null;function drawSpritePreview(data){const epoch=++spritePreviewEpoch;currentPreview=data;const image=new Image();image.onload=()=>{if(epoch!==spritePreviewEpoch)return;const canvas=spritePreviewCanvas,scale=Math.min(1,1000/image.width,700/image.height),width=Math.max(1,Math.round(image.width*scale)),height=Math.max(1,Math.round(image.height*scale));canvas.width=width;canvas.height=height;const context=canvas.getContext('2d');context.imageSmoothingEnabled=false;context.drawImage(image,0,0,width,height);const x=data.displayAxisX*scale,y=data.displayAxisY*scale;context.strokeStyle='#ff3b30';context.lineWidth=Math.max(1,2*scale);context.beginPath();context.moveTo(x-10,y);context.lineTo(x+10,y);context.moveTo(x,y-10);context.lineTo(x,y+10);context.stroke();if(data.cropBounds){const c=data.cropBounds;context.strokeStyle='#ffd60a';context.setLineDash([6,4]);context.strokeRect(c.x*scale,c.y*scale,c.width*scale,c.height*scale);context.setLineDash([])}spritePreviewTitle.textContent=data.name+' → '+data.identity;spritePreviewApprove.hidden=!data.requiresAxisReview;const axisText=data.cropMode==='after-axis'&&data.cropBounds?'Red cross: reviewed original-canvas axis '+data.axisX+','+data.axisY+' · stored after crop '+(data.axisX-data.cropBounds.x)+','+(data.axisY-data.cropBounds.y):'Red cross: final proposed axis '+data.axisX+','+data.axisY,paletteText=data.paletteLabel||'Image palette';spritePreviewCaption.textContent=axisText+' · '+data.cropLabel+' · '+paletteText+(data.cropBounds?' · yellow rectangle: reviewed visible crop bounds':'')+' · '+data.axisBasis.width+'×'+data.axisBasis.height+' axis basis. '+(data.requiresAxisReview?'Approve only after visually checking the sprite, crop, palette, and red cross.':'No SFF was changed.');spritePreviewDialog.showModal()};image.onerror=()=>{status.textContent='The selected source image could not be decoded for preview.';status.className='error'};image.src=data.dataUri}
function clearSourceDropMarkers(){for(const card of sources.querySelectorAll('.source-card'))card.classList.remove('drop-before','drop-after','dragging')}
function moveSourceBlockClient(draggedId,targetId,placement){const present=new Set(draft.sources.map(source=>source.id)),marked=selected.has(draggedId)?new Set([...selected].filter(id=>present.has(id))):new Set([draggedId]);if(!marked.size||marked.has(targetId)||!present.has(targetId))return false;const moved=draft.sources.filter(source=>marked.has(source.id)),remaining=draft.sources.filter(source=>!marked.has(source.id)),targetIndex=remaining.findIndex(source=>source.id===targetId);if(targetIndex<0)return false;remaining.splice(targetIndex+(placement==='after'?1:0),0,...moved);if(remaining.every((source,index)=>source===draft.sources[index]))return false;draft.sources=remaining;selected=new Set(moved.map(source=>source.id));return true}
function setupSourceDrag(){for(const card of sources.querySelectorAll('.source-card')){if(card.dataset.dragReady==='true')continue;card.dataset.dragReady='true';card.draggable=true;card.addEventListener('dragstart',event=>{if(event.target.closest('input,button,select,textarea')){event.preventDefault();return}const draggedId=card.dataset.source;if(!draggedId)return;sourceDrag={draggedId,placement:'before',targetId:''};card.classList.add('dragging');event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',draggedId)});card.addEventListener('dragover',event=>{if(!sourceDrag)return;event.preventDefault();event.dataTransfer.dropEffect='move';clearSourceDropMarkers();card.classList.add('dragging');const rect=card.getBoundingClientRect(),placement=event.clientY<rect.top+rect.height/2?'before':'after';sourceDrag.targetId=card.dataset.source;sourceDrag.placement=placement;card.classList.add(placement==='before'?'drop-before':'drop-after');const bounds=sources.getBoundingClientRect(),edge=40;if(event.clientY<bounds.top+edge)sources.scrollTop-=14;else if(event.clientY>bounds.bottom-edge)sources.scrollTop+=14});card.addEventListener('drop',event=>{if(!sourceDrag)return;event.preventDefault();const movedCount=selected.has(sourceDrag.draggedId)?selected.size:1,targetName=draft.sources.find(source=>source.id===card.dataset.source)?.name||'target',placement=sourceDrag.placement;const changed=moveSourceBlockClient(sourceDrag.draggedId,card.dataset.source,placement);sourceDrag=null;clearSourceDropMarkers();if(changed){render();sourceSelectionStatus.textContent='Moved '+movedCount+' marked source'+(movedCount===1?'':'s')+' '+placement+' '+targetName;save()}});card.addEventListener('dragend',()=>{sourceDrag=null;clearSourceDropMarkers()})}}
function localDropPaths(transfer){const paths=[...transfer.files].map(file=>file.path).filter(Boolean),uris=String(transfer.getData('text/uri-list')||'').split(/[\\r\\n]+/).map(value=>value.trim()).filter(value=>value.startsWith('file:///')).map(value=>{try{const decoded=decodeURIComponent(value.slice(8));return /^[A-Za-z]:\\//.test(decoded)?decoded.replace(/\\//g,'\\\\'):''}catch{return''}}).filter(Boolean);return [...new Set([...paths,...uris])]}
function installDesktopDrop(){const zone=document.createElement('div');zone.id='desktopDropZone';zone.tabIndex=0;zone.setAttribute('role','button');zone.setAttribute('aria-label','Drop supported sprite images or choose any equivalent reviewed source intake');zone.style.cssText='margin:7px 0;padding:12px;border:1px dashed var(--vscode-focusBorder);text-align:center';zone.textContent='Drop PNG/GIF/BMP/PCX/PSD sources or one PNG folder here · Enter opens every equivalent source option';const choose=()=>vscode.postMessage({type:'chooseDesktopIntake'});zone.onclick=choose;zone.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();choose()}};zone.ondragover=event=>{event.preventDefault();event.dataTransfer.dropEffect='copy';zone.style.background='var(--vscode-list-hoverBackground)'};zone.ondragleave=()=>zone.style.background='';zone.ondrop=event=>{event.preventDefault();zone.style.background='';const paths=localDropPaths(event.dataTransfer);if(!paths.length){status.textContent='Explorer did not expose local paths for this drop. Use the Add source buttons instead.';status.className='error';return}vscode.postMessage({type:'desktopDropPaths',paths})};sourceViewHint.insertAdjacentElement('afterend',zone)}
addEventListener('message',event=>{const message=event.data||{};if(message.type==='forwardedDesktopDrop'&&Array.isArray(message.paths))vscode.postMessage({type:'desktopDropPaths',paths:message.paths})});
function installLogicalGroupAssignment(){const button=document.createElement('button');button.id='assignLogicalGroup';button.textContent='Review Group Assignment…';button.title='Review exact group,index destinations, collisions, reserved ranges, duplicates, palettes, and AIR references before changing draft overrides';const lane=document.createElement('div');lane.id='logicalGroupDropLane';lane.style.cssText='display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin:7px 0;padding:9px;border:1px dashed var(--vscode-focusBorder)';lane.innerHTML='<b>Logical group target</b><label>Group <input id="logicalGroupTarget" type="number" min="0" max="65535" style="width:85px"></label><label>Start index <input id="logicalIndexTarget" type="number" min="0" max="65535" style="width:85px"></label><span class="muted">Drag a source card or marked block here, or use Review Group Assignment.</span>';sourceViewHint.insertAdjacentElement('beforebegin',lane);const groupInput=document.getElementById('logicalGroupTarget'),indexInput=document.getElementById('logicalIndexTarget');groupInput.value=String(draft.configuration.group||0);indexInput.value=String(draft.configuration.startIndex||0);const submit=ids=>{pull();if(!ids.length){status.textContent='Mark one or more sources before assigning a logical group.';status.className='error';return}vscode.postMessage({type:'assignLogicalGroup',draft,sourceIds:ids,targetGroup:Number(groupInput.value),targetIndex:Number(indexInput.value)})};button.onclick=()=>submit([...selected]);copyAxis.insertAdjacentElement('afterend',button);lane.ondragover=event=>{if(!sourceDrag)return;event.preventDefault();event.dataTransfer.dropEffect='move';lane.style.background='var(--vscode-list-hoverBackground)'};lane.ondragleave=()=>lane.style.background='';lane.ondrop=event=>{event.preventDefault();lane.style.background='';if(!sourceDrag)return;const dragged=sourceDrag.draggedId,ids=selected.has(dragged)?[...selected]:[dragged];sourceDrag=null;clearSourceDropMarkers();submit(ids)}}
let sourceAuditionFrames=[],sourceAuditionIndex=0,sourceAuditionTimer=0;function drawSourceAudition(){const canvas=document.getElementById('sourceAuditionCanvas'),context=canvas.getContext('2d'),frame=sourceAuditionFrames[sourceAuditionIndex];context.clearRect(0,0,canvas.width,canvas.height);context.strokeStyle='#4aa3ff55';context.beginPath();context.moveTo(canvas.width/2,0);context.lineTo(canvas.width/2,canvas.height);context.moveTo(0,canvas.height/2);context.lineTo(canvas.width,canvas.height/2);context.stroke();if(!frame)return;const draw=(item,alpha)=>{if(!item?.image?.complete)return;const scaleX=item.previewWidth/Math.max(1,item.width),scaleY=item.previewHeight/Math.max(1,item.height);context.globalAlpha=alpha;context.imageSmoothingEnabled=false;context.drawImage(item.image,Math.round(canvas.width/2-item.axisX*scaleX),Math.round(canvas.height/2-item.axisY*scaleY),item.previewWidth,item.previewHeight);context.globalAlpha=1};if(document.getElementById('sourceAuditionOnion').checked&&sourceAuditionFrames.length>1)draw(sourceAuditionFrames[(sourceAuditionIndex-1+sourceAuditionFrames.length)%sourceAuditionFrames.length],.28);draw(frame,1);document.getElementById('sourceAuditionStatus').textContent=(sourceAuditionIndex+1)+' / '+sourceAuditionFrames.length+' · '+frame.name+' → '+frame.identity+' · axis '+frame.axisX+','+frame.axisY+' · '+frame.paletteLabel+(frame.issues.length?' · REVIEW: '+frame.issues.join(' '):'')}
function stopSourceAudition(){clearTimeout(sourceAuditionTimer);sourceAuditionTimer=0;const play=document.getElementById('sourceAuditionPlay');if(play)play.textContent='Play'}function scheduleSourceAudition(){stopSourceAudition();document.getElementById('sourceAuditionPlay').textContent='Pause';const step=()=>{if(!sourceAuditionTimer)return;if(sourceAuditionIndex>=sourceAuditionFrames.length-1&&!document.getElementById('sourceAuditionLoop').checked){stopSourceAudition();return}sourceAuditionIndex=(sourceAuditionIndex+1)%sourceAuditionFrames.length;drawSourceAudition();sourceAuditionTimer=setTimeout(step,Math.max(16,Number(sourceAuditionFrames[sourceAuditionIndex]?.ticks||6)*1000/60))};sourceAuditionTimer=setTimeout(step,Math.max(16,Number(sourceAuditionFrames[sourceAuditionIndex]?.ticks||6)*1000/60))}
function installSourceAudition(){const button=document.createElement('button');button.id='auditionMarkedSources';button.textContent='Audition Marked Sequence…';button.title='Preview marked sources as one axis-aligned sequence with optional previous-frame onion skin; no AIR or SFF is changed';button.onclick=()=>{pull();if(!selected.size){status.textContent='Mark one or more sources to audition.';status.className='error';return}vscode.postMessage({type:'requestSourceAudition',draft,sourceIds:[...selected]})};document.getElementById('assignLogicalGroup').insertAdjacentElement('afterend',button);const dialog=document.createElement('dialog');dialog.id='sourceAuditionDialog';dialog.setAttribute('aria-labelledby','sourceAuditionTitle');dialog.innerHTML='<h2 id="sourceAuditionTitle">Creator Group & Alignment Audition</h2><canvas id="sourceAuditionCanvas" width="640" height="440" aria-label="Axis-aligned preview of the marked source sequence" style="max-width:88vw;background:repeating-conic-gradient(#7772 0 25%,transparent 0 50%) 50%/12px 12px;image-rendering:pixelated"></canvas><div class="row"><button id="sourceAuditionPrevious">Previous</button><button id="sourceAuditionPlay">Play</button><button id="sourceAuditionNext">Next</button><label><input id="sourceAuditionOnion" type="checkbox" checked> Previous-frame onion</label><label><input id="sourceAuditionLoop" type="checkbox" checked> Loop</label><button id="sourceAuditionClose">Close</button></div><p id="sourceAuditionStatus" class="muted" role="status" aria-live="polite"></p><p class="muted">Preview only. Frames use their reviewed axes and effective palettes; timing defaults to 6 ticks per staged source.</p>';document.body.append(dialog);document.getElementById('sourceAuditionPrevious').onclick=()=>{stopSourceAudition();sourceAuditionIndex=(sourceAuditionIndex-1+sourceAuditionFrames.length)%sourceAuditionFrames.length;drawSourceAudition()};document.getElementById('sourceAuditionNext').onclick=()=>{stopSourceAudition();sourceAuditionIndex=(sourceAuditionIndex+1)%sourceAuditionFrames.length;drawSourceAudition()};document.getElementById('sourceAuditionPlay').onclick=()=>sourceAuditionTimer?stopSourceAudition():scheduleSourceAudition();document.getElementById('sourceAuditionOnion').onchange=drawSourceAudition;document.getElementById('sourceAuditionClose').onclick=()=>{stopSourceAudition();dialog.close()};dialog.addEventListener('close',stopSourceAudition)}
addEventListener('message',event=>{const data=event.data||{};if(data.type!=='sourceAudition')return;stopSourceAudition();sourceAuditionFrames=(data.frames||[]).map(frame=>{const image=new Image();if(frame.dataUri)image.src=frame.dataUri;image.onload=drawSourceAudition;return{...frame,image}});sourceAuditionIndex=0;document.getElementById('sourceAuditionDialog').showModal();drawSourceAudition()});
new MutationObserver(setupSourceDrag).observe(sources,{childList:true});setupSourceDrag();installDesktopDrop();installLogicalGroupAssignment();installSourceAudition();
function move(delta){const indexes=draft.sources.map((s,i)=>selected.has(s.id)?i:-1).filter(i=>i>=0);if(!indexes.length)return;const order=delta<0?indexes:indexes.reverse();for(const i of order){const j=i+delta;if(j<0||j>=draft.sources.length||selected.has(draft.sources[j].id))continue;[draft.sources[i],draft.sources[j]]=[draft.sources[j],draft.sources[i]]}render();save()}
function copyMarkedAxis(){pull();const marked=draft.sources.filter(s=>selected.has(s.id)),source=marked[0],row=(plan?.ready||[]).find(item=>item.sourceId===source?.id);if(marked.length<2||!row){status.textContent='Mark at least two ready sources. The first marked source supplies the exact axis.';status.className='error';return}for(const item of marked.slice(1)){draft.configuration.overrides[item.id]=draft.configuration.overrides[item.id]||{};draft.configuration.overrides[item.id].axisX=row.axisX;draft.configuration.overrides[item.id].axisY=row.axisY;delete draft.configuration.overrides[item.id].axisEvidence}status.className='';render();save()}
chooseTarget.onclick=()=>vscode.postMessage({type:'chooseTarget'});clearTarget.onclick=()=>vscode.postMessage({type:'clearTarget'});targetPalette.onchange=save;addFiles.onclick=()=>vscode.postMessage({type:'addFiles'});addTrueColorFiles.onclick=()=>vscode.postMessage({type:'addTrueColorFiles'});addFolder.onclick=()=>vscode.postMessage({type:'addFolder'});relinkSource.onclick=()=>{pull();if(selected.size!==1){status.textContent='Mark exactly one changed or unavailable source to relink.';status.className='error';return}vscode.postMessage({type:'relinkSource',draft,sourceId:[...selected][0]})};importSprMake2Manifest.onclick=()=>vscode.postMessage({type:'importSprMake2Manifest'});addSheet.onclick=()=>vscode.postMessage({type:'addSheet'});prepareSources.onclick=()=>vscode.postMessage({type:'prepareSources'});addGif.onclick=()=>vscode.postMessage({type:'addGif'});addPsd.onclick=()=>vscode.postMessage({type:'addPsd'});rebuildPsdArchive.onclick=()=>vscode.postMessage({type:'rebuildPsdArchive'});chooseTemporaryPalette.onclick=()=>{pull();vscode.postMessage({type:'chooseTemporaryPalette',draft})};remapSelected.onclick=()=>{pull();vscode.postMessage({type:'remapSelected',draft,sourceIds:[...selected]})};openNeedsPalette.onclick=()=>{pull();vscode.postMessage({type:'openNeedsPalette',draft})};writerPreference.onchange=()=>vscode.postMessage({type:'sffWriterPreferenceChange',mode:writerPreference.value});up.onclick=()=>move(-1);down.onclick=()=>move(1);copyAxis.onclick=copyMarkedAxis;reviewDuplicateGroups.onclick=()=>{pull();vscode.postMessage({type:'reviewDuplicateGroups',draft})};reviewSavedRules.onclick=()=>{pull();busy=true;renderSavedRules();vscode.postMessage({type:'reviewSavedRules',draft})};acceptAllSavedRules.onclick=()=>{const action=(savedRuleReview?.actions||[]).find(item=>item.kind==='accept-all');if(!action)return;pull();busy=true;renderSavedRules();vscode.postMessage({type:'acceptSavedRule',draft,reviewId:savedRuleReview.reviewId,actionId:action.actionId})};remove.onclick=()=>{draft.sources=draft.sources.filter(s=>!selected.has(s.id));selected.clear();render();save()};clear.onclick=()=>{draft.sources=[];draft.configuration.overrides={};draft.configuration.importedPalettes=[];selected.clear();render();save()};clearDeletions.onclick=()=>{draft.deletedSpriteIdentities=[];render();save()};placeholder.onchange=()=>{placeholderNote.disabled=!placeholder.checked;save()};placeholderNote.onchange=save;keepRecoveryBackup.onchange=save;png8Optimization.onchange=save;paletteMode.onchange=()=>{if(paletteMode.value==='temporary')placeholder.checked=true;save()};setRule.onclick=save;discard.onclick=()=>vscode.postMessage({type:'discard'});apply.onclick=()=>{pull();busy=true;renderReview();vscode.postMessage({type:'apply',draft})};build.onclick=()=>{pull();busy=true;renderReview();vscode.postMessage({type:'build',draft})};for(const id of ids)document.getElementById(id).onchange=save;for(const id of ['pattern','groupCapture','numberCapture','confidence','existing','reserved','conflictsOnly'])document.getElementById(id).onchange=save;
reviewNearestColors.onclick=()=>{pull();busy=true;renderNearestColors();vscode.postMessage({type:'reviewNearestColors',draft})};applySelectedNearest.onclick=()=>{const selections=nearestSelections();if(!nearestColorReview||!selections.length)return;pull();busy=true;renderNearestColors();vscode.postMessage({type:'acceptNearestColors',draft,reviewId:nearestColorReview.reviewId,actionId:nearestColorReview.actionId,selections})};
 sourceSearch.oninput=()=>{sourcePage=0;render()};sourceFilter.onchange=()=>{sourcePage=0;render()};sourceListMode.onclick=()=>{sourceViewMode='list';sourcePage=0;render()};sourceGridMode.onclick=()=>{sourceViewMode='grid';sourcePage=0;render()};sourcePrev.onclick=()=>{if(sourcePage>0){sourcePage--;render()}};sourceNext.onclick=()=>{sourcePage++;render()};markShown.onclick=()=>{const size=sourcePageSize();for(const item of filteredSources().slice(sourcePage*size,(sourcePage+1)*size))selected.add(item.source.id);render()};unmarkShown.onclick=()=>{const size=sourcePageSize();for(const item of filteredSources().slice(sourcePage*size,(sourcePage+1)*size))selected.delete(item.source.id);render()};clearSourceMarks.onclick=()=>{selected.clear();render()};
 exportPlan.onclick=()=>{pull();vscode.postMessage({type:'exportPlan',draft})};importPlan.onclick=()=>vscode.postMessage({type:'importPlan'});openWriterComparison.onclick=()=>vscode.postMessage({type:'openWriterComparison'});writerComparisonClose.onclick=()=>writerComparisonDialog.close();writerComparisonRun.onclick=()=>{if(writerComparisonRun.disabled)return;writerComparisonRun.disabled=true;writerComparisonRunStatus.className='muted';writerComparisonRunStatus.setAttribute('role','status');writerComparisonRunStatus.textContent='Preparing the isolated P1/P2 comparison run…';vscode.postMessage({type:'writerComparisonAction',action:'run'})};writerComparisonJson.onclick=()=>vscode.postMessage({type:'writerComparisonAction',action:'json'});writerComparisonBuiltIn.onclick=()=>vscode.postMessage({type:'writerComparisonAction',action:'builtIn'});writerComparisonSprMake2.onclick=()=>vscode.postMessage({type:'writerComparisonAction',action:'sprMake2'});writerComparisonFolder.onclick=()=>vscode.postMessage({type:'writerComparisonAction',action:'folder'});compareBoth.onclick=()=>{pull();busy=true;renderReview();vscode.postMessage({type:'compareBoth',draft})};validateExisting.onclick=()=>{pull();busy=true;renderReview();vscode.postMessage({type:'validateExisting',draft})};previewAxis.onclick=()=>{pull();if(selected.size!==1){status.textContent='Mark exactly one source to preview its reviewed axis, crop order, and effective palette.';status.className='error';return}vscode.postMessage({type:'previewAxis',draft,sourceId:[...selected][0]})};suggestAxes.onclick=()=>{pull();if(!selected.size){status.textContent='Mark one or more ready sources to review automatic-axis suggestions.';status.className='error';return}vscode.postMessage({type:'suggestAxes',draft,sourceIds:[...selected]})};spritePreviewApprove.onclick=()=>{if(!currentPreview?.requiresAxisReview)return;pull();vscode.postMessage({type:'approveAxisReview',draft,sourceId:currentPreview.sourceId});spritePreviewEpoch++;spritePreviewDialog.close()};spritePreviewClose.onclick=()=>{spritePreviewEpoch++;spritePreviewDialog.close()};addEventListener('message',event=>{const data=event.data||{};if(data.type==='writerComparison')renderWriterComparison(data.summary);if(data.type==='writerComparisonRunState'){writerComparisonRun.disabled=Boolean(data.active)||!writerComparisonCanBind;writerComparisonRunStatus.className='muted';writerComparisonRunStatus.setAttribute('role','status');writerComparisonRunStatus.textContent=data.message||''}if(data.type==='spriteAxisPreview')drawSpritePreview(data);if(data.type==='sourceThumbnails'){if(data.requestId!==thumbnailRequestId)return;for(const item of data.items||[])thumbnailCache.set(item.cacheKey||item.sourceId+':'+String(item.byteHash||'').toUpperCase(),item);render()}});
let productionContinuationAvailable=false,productionContinuationDisabled=false,productionDrift=false;
const productionDetach=document.createElement('button');productionDetach.id='productionDetach';productionDetach.hidden=true;productionDetach.textContent='Detach Draft Lock (Keep Recovery Record)…';productionStatus.insertAdjacentElement('beforebegin',productionDetach);
 function enforceBackendAvailability(){const sprMake2Limitations=plan?.sprMake2Limitations||[],builtInLimitations=plan?.builtInLimitations||[],duplicate=Boolean(draft.target?.duplicateSpriteIds?.length),sprMake2Blocked=duplicate||Boolean(draft.configuration.paletteMode==='true-color'&&draft.replaceSpriteIdentities?.length)||sprMake2Limitations.length>0;for(const prior of review.querySelectorAll('[data-backend-limit]'))prior.remove();if(sprMake2Blocked){const reason=duplicate?'SprMake2 cannot safely rebuild a table with repeated sprite identities.':sprMake2Limitations.join(' ');build.disabled=true;compareBoth.disabled=true;build.title=reason+' Create Package Only remains available; built-in adoption is still disabled.';compareBoth.title=build.title;review.insertAdjacentHTML('afterbegin','<div class="review-row error" data-backend-limit><b>SprMake2 limit</b> — '+esc(build.title)+'</div>');return}if(builtInLimitations.length){const reason='Built-in comparison is unavailable: '+builtInLimitations.join(' ')+' SprMake2 Build and Create Package Only remain available.';compareBoth.disabled=true;compareBoth.title=reason;review.insertAdjacentHTML('afterbegin','<div class="review-row muted" data-backend-limit><b>Built-in comparison limit</b> — '+esc(reason)+'</div>')}}
enforceBackendAvailability=function(){const sprLimits=plan?.sprMake2Limitations||[],builtLimits=plan?.builtInLimitations||[],duplicate=Boolean(draft.target?.duplicateSpriteIds?.length),sprBlocked=duplicate||Boolean(draft.configuration.paletteMode==='true-color'&&draft.replaceSpriteIdentities?.length)||sprLimits.length>0,builtBlocked=builtLimits.length>0,base=busy||!applyInfo.enabled,testReason='TEST BUILD ONLY · No Adoption. Creates a separately named, strictly validated candidate inside the reviewed package and always retains this draft.';for(const prior of review.querySelectorAll('[data-backend-limit]'))prior.remove();build.disabled=base||sprBlocked||builtBlocked;buildV21.disabled=base||sprBlocked||builtBlocked;buildV20.disabled=base||builtBlocked;buildSprMake2.disabled=base||sprBlocked;compareBoth.disabled=base||sprBlocked||builtBlocked;build.title=applyInfo.reason||'Build both candidates, require semantic equivalence, retain the IKEMaker test SFF, then ask before SprMake2 updates the normal target';buildV21.title=applyInfo.reason||(sprBlocked?'Build Two Test Candidates requires the compatible SprMake2 route.':'TEST BUILD ONLY · No Adoption. Build and retain one IKEMaker v2.1 candidate and one SprMake2 v2.1 candidate from the same reviewed package, plus their comparison evidence.');buildV20.title=applyInfo.reason||'TEST BUILD ONLY · No Adoption · Single writer. SprMake2 v2.0 RAW8 is not claimed or dispatched.';buildSprMake2.title=applyInfo.reason||'Build only with the established SprMake2 route and ask before updating the normal target';compareBoth.title=applyInfo.reason||'Build and compare both candidates without adoption';if(sprBlocked){const reason=duplicate?'SprMake2 cannot safely rebuild a table with repeated sprite identities.':(draft.configuration.truecolorLinkedReplacement?'Save these edits as a new SFF. The copy keeps linked sprites connected.':draft.configuration.paletteMode==='true-color'&&draft.replaceSpriteIdentities?.length?'Save these edits as a new SFF. Open Saved SFF to continue.':sprLimits.join(' ')),detail=(draft.configuration.paletteMode==='true-color'&&draft.replaceSpriteIdentities?.length)?reason:reason+' The required dual comparison and SprMake2-only route are unavailable; Create Package Only remains available.';build.title=detail;buildV21.title=detail;buildSprMake2.title=detail;compareBoth.title=detail;review.insertAdjacentHTML('afterbegin','<div class="review-row error" data-backend-limit><b>SprMake2 comparison limit</b> — '+esc(detail)+'</div>')}if(builtBlocked){const detail='In-house writer test build is unavailable: '+builtLimits.join(' ')+' SprMake2 Only · Build & Apply and Create Package Only remain available.';build.title=detail;buildV21.title=detail;buildV20.title=detail;compareBoth.title=detail;review.insertAdjacentHTML('afterbegin','<div class="review-row muted" data-backend-limit><b>In-house writer limit</b> — '+esc(detail)+'</div>')}};
const enforceDualBuildAvailability=enforceBackendAvailability;enforceBackendAvailability=function(){enforceDualBuildAvailability();for(const row of review.querySelectorAll('.review-row.error'))if(row.textContent.includes('built-in adoption stays disabled'))row.remove();const sprBlocked=Boolean(draft.target?.duplicateSpriteIds?.length||draft.configuration.paletteMode==='true-color'&&draft.replaceSpriteIdentities?.length)||(plan?.sprMake2Limitations||[]).length>0,builtBlocked=(plan?.builtInLimitations||[]).length>0,base=busy||!applyInfo.enabled,productionSupported=Boolean(draft.target?.path)&&['2.0','2.1'].includes(String(draft.target?.sffVersion||''));buildSelected.disabled=base||(draft.configuration.paletteMode==='true-color'&&writerMode==='both')||(writerMode==='sprmake2'?sprBlocked:writerMode==='both'?sprBlocked||builtBlocked:builtBlocked||Boolean(draft.configuration.paletteMode==='true-color'&&draft.replaceSpriteIdentities?.length));buildSelected.textContent=writerMode==='sprmake2'?'Build with SprMake2…':writerMode==='both'?'Build with Both Writers…':productionSupported?'Build & Update Active SFF with IKEMaker…':'Create IKEMaker Test Candidate…';buildSelected.title=applyInfo.reason||(writerMode==='ikemaker'?(productionSupported?'Run the reviewed IKEMaker lifecycle, validate the candidate, and update the active SFF only after explicit approval.':'A new archive has no active SFF to replace; create a validated candidate for review.'):writerMode==='sprmake2'?'Build and apply with SprMake2 after validation.':'Compare both writers, then explicitly review adoption.');productionStart.hidden=productionContinuationAvailable||!productionSupported;productionStart.disabled=base||builtBlocked||Boolean(draft.configuration.paletteMode==='true-color'&&draft.replaceSpriteIdentities?.length);productionStart.title=productionSupported?(applyInfo.reason||'Run the explicit reviewed IKEMaker lifecycle. Every review and mutation boundary pauses and is durably resumable.'):'Reviewed IKEMaker updates require an existing SFF v2.0 or v2.1 target.';productionContinue.hidden=!productionContinuationAvailable;productionContinue.disabled=busy||productionContinuationDisabled;productionDetach.hidden=!productionDrift;if(draft.configuration.paletteMode==='true-color'){const comparisonReason='Both writers comparison cannot yet validate True Color safely. Use IKEMaker or SprMake2 separately.';for(const button of [build,compareBoth,buildV21]){button.disabled=true;button.title=comparisonReason}if(writerMode==='both')buildSelected.title=comparisonReason}if(draft.configuration.paletteMode==='true-color'&&draft.replaceSpriteIdentities?.length){const guidance='Direct replacement is unavailable for this truecolor edit. Use Save Verified SFF Copy.';buildSelected.disabled=true;buildSelected.title=guidance;productionStart.disabled=true;productionStart.title=guidance}};
const enforceBeforePng8Option=enforceBackendAvailability;enforceBackendAvailability=function(){enforceBeforePng8Option();const chosen=draft.configuration.png8Optimization||'none',version=draft.target?.sffVersion||draft.configuration.newArchiveVersion||'2.1';let reason='';if(chosen!=='none'&&(writerMode==='sprmake2'||version!=='2.1'||draft.configuration.paletteMode==='true-color'))reason='PNG8 lossless compression requires IKEMaker or Both with indexed SFF2.1 sources. Keep this choice or select Unchanged before using this unsupported writer/profile.';if(!['group','startIndex','step','offsetX','offsetY'].every(id=>String(document.getElementById(id).value).trim()!==''))reason='Enter whole-number group, index, step and axis values; blank fields are not zero.';if(reason){for(const id of ['buildSelected','productionStart','build','buildV21','buildV20','buildSprMake2','compareBoth'])setCreatorControlAvailability(id,{disabled:true,reason});review.insertAdjacentHTML('afterbegin','<div class="review-row error" data-backend-limit>'+esc(reason)+'</div>')}};
function beginBuild(type){pull();busy=true;renderReview();enforceBackendAvailability();vscode.postMessage({type,draft})}
addEventListener('message',event=>{if(event.data?.type!=='autoBuildSelected')return;enforceBackendAvailability();if(buildSelected.disabled){status.className='error';status.textContent=buildSelected.title||'The selected writer cannot build this reviewed intake yet.';return}beginBuild('buildSelected')});
build.onclick=()=>beginBuild('buildCompared');buildSprMake2.onclick=()=>beginBuild('build');
buildV21.onclick=()=>beginBuild('buildBuiltInV21');buildV20.onclick=()=>beginBuild('buildBuiltInV20');
buildSelected.onclick=()=>beginBuild('buildSelected');
document.getElementById('saveTruecolorCopy').onclick=()=>beginBuild('saveTruecolorCopy');
document.getElementById('openVerifiedCopy').onclick=()=>vscode.postMessage({type:'openVerifiedCopy'});
productionStart.onclick=()=>beginBuild('startProductionBuiltIn');productionContinue.onclick=()=>beginBuild('continueProductionBuiltIn');productionDetach.onclick=()=>vscode.postMessage({type:'detachProductionLifecycle'});
paletteMode.onchange=()=>{if(paletteMode.value==='temporary')placeholder.checked=true;save()};
 addEventListener('message',e=>{const m=e.data||{};if(m.type==='productionLifecycleState'){productionContinuationAvailable=Boolean(m.available);productionContinuationDisabled=Boolean(m.disabled);productionDrift=Boolean(m.drift);productionContinue.textContent=m.action||'Continue Review / Recovery…';productionStatus.textContent=m.message||'';productionStatus.className=m.error?'error':'muted';busy=false;renderReview();enforceBackendAvailability()}if(m.type==='sffWriterPreferenceState'){writerMode=m.mode;writerPreference.value=m.mode;renderReview();enforceBackendAvailability()}if(m.type==='state'){draft=m.draft;plan=m.plan;applyInfo=m.applyState;if(Object.prototype.hasOwnProperty.call(m,'savedRuleReview'))savedRuleReview=m.savedRuleReview;if(Object.prototype.hasOwnProperty.call(m,'nearestColorReview'))nearestColorReview=m.nearestColorReview;busy=false;status.className='';fill();enforceBackendAvailability();status.textContent=m.message||applyInfo.reason||'Draft retained.'}if(m.type==='savedRuleReview'){savedRuleReview=m.review||null;busy=false;savedRuleStatus.textContent=m.message||'Saved color rule review refreshed.';renderSavedRules()}if(m.type==='nearestColorReview'){nearestColorReview=m.review||null;busy=false;nearestColorStatus.textContent=m.message||'Nearest-color review refreshed.';renderNearestColors()}if(m.type==='error'){busy=false;renderReview();enforceBackendAvailability();writerComparisonRun.disabled=!writerComparisonCanBind;writerComparisonRunStatus.className='error';writerComparisonRunStatus.setAttribute('role','alert');writerComparisonRunStatus.textContent=m.message;status.textContent=m.message;status.className='error';savedRuleStatus.textContent=m.message;nearestColorStatus.textContent=m.message;nearestColorStatus.setAttribute('role','alert')}});fill();enforceBackendAvailability();renderSavedRules();renderNearestColors();vscode.postMessage({type:'sffWriterPreferenceReady'});
addEventListener('message',event=>{if(event.data?.type!=='verifiedCopy')return;busy=false;const saved=event.data;document.getElementById('openVerifiedCopy').hidden=false;document.getElementById('openVerifiedCopy').disabled=false;document.getElementById('verifiedCopyPath').textContent=saved.filename||'';renderReview();enforceBackendAvailability();status.className='muted';status.textContent='Verified standalone SFF saved. The active archive and retained draft are unchanged; open the copy to inspect it.'});
globalThis.ikemenIsBusy=()=>busy;globalThis.ikemenCanKeepDraft=()=>true;
${launchControlsClientScript()}${require('./viewer_close').clientScript()}
function syncArchiveVersionControls(){const version=draft.target?.sffVersion||newArchiveVersion.value||'2.1';const trueColorReason=version!=='2.1'?'True Color requires SFF 2.1; SFF 2.0 uses indexed PNG sources.':writerMode==='both'?'Both writers comparison cannot yet validate True Color. Choose IKEMaker or SprMake2 in the shared Writer control.':'Imports complete RGB24 / RGBA32 PNGs and selects True Color for this batch.';addTrueColorFiles.disabled=version!=='2.1'||writerMode==='both';addTrueColorFiles.title=trueColorReason;trueColorIntakeStatus.textContent=trueColorReason;newArchiveVersionField.hidden=!!draft.target;buildV21.hidden=version!=='2.1';buildV20.hidden=version!=='2.0'}newArchiveVersion.addEventListener('change',syncArchiveVersionControls);addEventListener('message',()=>setTimeout(syncArchiveVersionControls,0));syncArchiveVersionControls();</script></body></html>`; }

async function openCreator(uri, request = {}) {
  const root = workspaceKey(), key = draftKey(root);
  let recovered = safeDraft(drafts.read(key) || defaultDraft()), invocation = { draft: recovered, changed: false, blocked: false, message: '' }, cancelledReplacement = false;
  const requestedPath = uri?.fsPath && /\.sff$/i.test(uri.fsPath) ? uri.fsPath : '';
  if (requestedPath) {
    const target = targetFromFile(requestedPath);
    invocation = request?.adaptPhysicalIndices ? bindPaletteAdaptationInvocation(root, recovered, target, request.adaptPhysicalIndices, request.targetPaletteIndex, null, request.preservePhysicalIndices, request.adaptationBinding)
      : request?.deletePhysicalIndices ? bindDeletionInvocation(recovered, target, request.deletePhysicalIndices)
      : Number.isSafeInteger(Number(request?.duplicatePhysicalIndex)) ? bindDuplicateInvocation(root, recovered, target, Number(request.duplicatePhysicalIndex))
        : Number.isSafeInteger(Number(request?.replacePhysicalIndex)) ? await (async () => {
          const supplied = request?.replacementSourcePath ? path.resolve(request.replacementSourcePath) : '';
          if (supplied && (!fs.existsSync(supplied) || !/\.png$/i.test(supplied))) throw new Error('The reviewed sprite-edit working copy is missing or is not a PNG.');
          const picked = supplied ? [vscode.Uri.file(supplied)] : await vscode.window.showOpenDialog({ title: 'Choose a matching PNG replacement source', canSelectFiles: true, canSelectFolders: false, canSelectMany: false, filters: { 'PNG image': ['png'] } });
          if (!picked?.[0]) { cancelledReplacement = true; return { draft: recovered, changed: false, blocked: false, message: 'Replacement selection cancelled; the retained Creator draft was unchanged.' }; }
          return bindReplacementInvocation(recovered, target, Number(request.replacePhysicalIndex), picked[0].fsPath);
        })() : bindInvocationTarget(recovered, target);
  }
  recovered = invocation.draft;
  const existing = sessions.get(key);
  if (existing && request?.unmatchedResolution) {
    const active = replacementRuleSessions.get(key); if (!active?.resolveWorkshopReturn) throw new Error('The originating SFF Creator Palette Workshop handoff is no longer active. Reopen the saved-color review.');
    await active.resolveWorkshopReturn(request.unmatchedResolution); existing.reveal(undefined, false); return existing;
  }
  if (cancelledReplacement) { if (existing) existing.reveal(undefined, false); return existing || null; }
  if (existing) {
    if (request?.returnToViewerOnComplete) existing.returnToViewerOnComplete = true;
    if (request?.refreshDraft) {
      replacementRuleSessions.get(key)?.invalidate();
      const staged = await stageDraft(root, recovered);
      await existing.webview.postMessage({ type: 'state', draft: staged.draft, plan: staged.state.plan || { rows: [], ready: [], conflicts: [], skipped: [] }, applyState: { enabled: staged.state.enabled, reason: staged.state.reason }, savedRuleReview: null, nearestColorReview: null, message: 'Quick Add choices transferred to Advanced SFF Creator.' });
    } else if (invocation.changed) {
      replacementRuleSessions.get(key)?.invalidate();
      const staged = await stageDraft(root, recovered);
      await existing.webview.postMessage({ type: 'state', draft: staged.draft, plan: staged.state.plan || { rows: [], ready: [], conflicts: [], skipped: [] }, applyState: { enabled: staged.state.enabled, reason: staged.state.reason }, savedRuleReview: null, nearestColorReview: null, message: invocation.message });
    } else if (invocation.blocked) vscode.window.showWarningMessage(invocation.message);
    if (request?.autoBuildSelected) await existing.webview.postMessage({ type: 'autoBuildSelected' });
    existing.reveal(undefined, false); return existing;
  }
  if (invocation.changed) await drafts.stage(key, recovered);
  if (invocation.blocked) vscode.window.showWarningMessage(invocation.message);
  const state = applyState(recovered);
  if (recovered.sources.length || recovered.deletedSpriteIdentities.length) await pendingChanges.current().upsert(pendingSeed(root, recovered));
  const panel = trackViewerPanel(vscode.window.createWebviewPanel('ikemenSffCreator', 'SFF Creator', preferredViewerColumn(vscode.ViewColumn.Active), { enableScripts: true, retainContextWhenHidden: true }));
  sessions.set(key, panel); panel.returnToViewerOnComplete = request?.returnToViewerOnComplete === true; panel.webview.html = require('./webview_policy').protect(html({ draft: recovered, plan: state.plan || { rows: [], ready: [], conflicts: [], skipped: [], summary: {} }, applyState: { enabled: state.enabled, reason: state.reason }, writerPreference: writerPreference.snapshot() }), panel.webview.cspSource);
  const writerAttachment = writerPreference.attach(panel);
  require('./viewer_close').support(panel, { isBusy: () => false, keepDraft: () => drafts.flush() });
  const retainedBinding = recovered.replacementRuleAcceptances?.[0]?.provenance?.binding || recovered.workshopReturns?.[0]?.provenance?.binding || recovered.paletteAdaptationAcceptances?.[0]?.provenance?.binding, creatorGeneration = Number.isSafeInteger(Number(retainedBinding?.creatorGeneration)) ? Number(retainedBinding.creatorGeneration) : Date.now();
  let draftRevision = Number.isSafeInteger(Number(retainedBinding?.draftRevision)) ? Number(retainedBinding.draftRevision) : 0, retainedCoreFingerprint = replacementRuleCoreFingerprint(recovered), savedRuleReview = null, nearestColorReview = null;
  let activeWriterComparison = null, activeWriterRunBinding = null, comparisonRunActive = false, panelDisposed = false, desktopDropGeneration = 0, activeLifecyclePresentation = null, productionOperationBusy = false, autoBuildSelectedPending = request?.autoBuildSelected === true, lastSavedCopy = null;
  const samePath = sameResolvedPath;
  const dirtyDocument = filename => vscode.workspace.textDocuments.find(document => !document.isClosed && samePath(document.fileName, filename) && document.isDirty);
  const createWriterRunBinding = (summary, target) => {
    if (!summary.semanticEquivalent || !summary.independentlyValidated || !summary.builtInAvailable || !summary.sprMake2Available) throw new Error('Both validated test SFFs must still match the comparison report before Run Test can be enabled.');
    if (!target?.path) throw new Error('Attach the active character SFF in SFF Creator before running this comparison.');
    const targetPath = path.resolve(target.path), targetBytes = readStableBoundedFile(targetPath, 1024 * 1024 * 1024, 'active character SFF'), targetHash = crypto.createHash('sha256').update(targetBytes).digest('hex');
    const expectedTargetHash = String(target.expectedFingerprint || target.fingerprint || '').toLowerCase();
    if (!expectedTargetHash || targetHash !== expectedTargetHash) throw new Error('The attached character SFF changed. Reopen it in SFF Creator before binding this comparison.');
    const owner = require('./sff_writer_comparison_run').resolveOwnerDef(targetPath), gameRoot = require('./ikemen_hub').findGameRoot(owner.filename);
    if (!gameRoot) throw new Error('IKEMEN game root was not found for the comparison character.');
    if (dirtyDocument(owner.filename)) throw new Error(`Save ${path.basename(owner.filename)} before enabling the writer comparison run.`);
    return {
      version: 1, createdAt: new Date().toISOString(), workspace: runBindingKey(root), gameRoot: path.resolve(gameRoot), reportPath: summary.path, reportHash: summary.reportHash,
      builtInPath: summary.builtInPath, builtInHash: summary.builtIn.byteHash, builtInSize: summary.builtIn.byteLength,
      sprMake2Path: summary.sprMake2Path, sprMake2Hash: summary.sprMake2.byteHash, sprMake2Size: summary.sprMake2.byteLength,
      targetPath, targetHash, ownerDefPath: path.resolve(owner.filename), ownerDefHash: crypto.createHash('sha256').update(owner.bytes).digest('hex'), ownerSpriteAssignment: owner.assignment.literal
    };
  };
  const runStateFromBinding = (summary, target, binding = readRunBinding(root)) => {
    const unavailable = reason => ({ runAvailable: false, runUnavailableReason: reason });
    if (!binding || binding.version !== 1 || binding.workspace !== runBindingKey(root)) return unavailable('This comparison is not yet bound to the current character. Choose Run Test to verify and bind it.');
    try {
      if (!samePath(binding.reportPath, summary.path) || binding.reportHash !== summary.reportHash) return unavailable('The saved comparison binding belongs to a different or changed report. Choose Run Test to verify and bind this report.');
      if (!target?.path || !samePath(binding.targetPath, target.path)) return unavailable('The saved comparison binding belongs to a different character SFF.');
      const fresh = createWriterRunBinding(summary, target);
      if (!writerRunBindingMatches(binding, fresh)) return unavailable('The character, comparison, or one of its test SFFs changed. Choose Run Test to verify and bind the current files.');
      return { runAvailable: true, targetPath: fresh.targetPath, targetFingerprint: fresh.targetHash, verifiedBinding: fresh };
    } catch (error) { return unavailable(error.message); }
  };
  const ruleAuthority = new ReplacementRuleReviewAuthority(), paletteAdaptationAuthority = new PaletteAdaptationReviewAuthority(), invalidateSavedRules = (nextDraft = null) => { const nextFingerprint = nextDraft ? replacementRuleCoreFingerprint(nextDraft) : retainedCoreFingerprint; if (nextDraft && nextFingerprint !== retainedCoreFingerprint) { retainedCoreFingerprint = nextFingerprint; draftRevision += 1; } ruleAuthority.revoke(); paletteAdaptationAuthority.revoke(); savedRuleReview = null; nearestColorReview = null; };
  const postState = async (draft, message = '') => { const staged = await stageDraft(root, draft); invalidateSavedRules(staged.draft); await panel.webview.postMessage({ type: 'state', draft: staged.draft, plan: staged.state.plan || { rows: [], ready: [], conflicts: [], skipped: [] }, applyState: { enabled: staged.state.enabled, reason: staged.state.reason }, savedRuleReview: null, nearestColorReview: null, message }); };
  const resolveWorkshopReturn = async unmatchedResolution => {
    const current = safeDraft(drafts.read(key) || recovered), nextFingerprint = replacementRuleCoreFingerprint(current);
    if (nextFingerprint !== retainedCoreFingerprint) throw new Error('The Creator draft changed while Palette Workshop was open. Review the color issue again.');
    let sealed; try { sealed = ruleAuthority.workshopReturn(unmatchedResolution, replacementRuleBinding(root, current, creatorGeneration, draftRevision)); }
    catch (error) { ruleAuthority.revoke(); savedRuleReview = null; await panel.webview.postMessage({ type: 'savedRuleReview', review: null, message: `${error.message} No Palette Workshop decision was retained.` }); throw error; }
    current.workshopReturns = [...(current.workshopReturns || []), sealed]; current.replacementRuleDraftFingerprint = nextFingerprint; paletteAdaptationAuthority.revoke(); nearestColorReview = null;
    const staged = await stageDraft(root, current), retained = revalidateRetainedReplacementRuleAcceptance(root, staged.draft), binding = replacementRuleBinding(root, staged.draft, creatorGeneration, draftRevision);
    savedRuleReview = ruleAuthority.begin(binding, { excludeIssueIds: retained.excludedIssueIds });
    await panel.webview.postMessage({ type: 'state', draft: staged.draft, plan: staged.state.plan || { rows: [], ready: [], conflicts: [], skipped: [] }, applyState: { enabled: staged.state.enabled, reason: staged.state.reason }, savedRuleReview, nearestColorReview: null, message: 'Palette Workshop returned one exact color decision to the retained Creator resolution draft.' });
  };
  replacementRuleSessions.set(key, { invalidate: invalidateSavedRules, resolveWorkshopReturn });
  const lifecyclePresentation = async (continuation, message = '') => {
    activeLifecyclePresentation = continuation?.status === 'no-continuation' ? null : continuation;
    const drift = continuation?.status === 'draft-drift-review-required';
    const startupStatus = continuation?.startup?.status || continuation?.status || '';
    const recoveryStatus = require('./sff_creator_recovery_notice').recoveryNotice(continuation?.temporaryRecovery || continuation?.startup?.temporaryRecovery);
    if(recoveryStatus)message=[message,recoveryStatus].filter(Boolean).join(' ');
    const ambiguous = /manual|uncertain|restart-recovery-required/.test(startupStatus);
    await panel.webview.postMessage({ type: 'productionLifecycleState', available: Boolean(continuation && continuation.status !== 'no-continuation' && !drift), disabled: ambiguous, drift, action: drift ? 'Review Drift / Detach Lock' : productionLifecycleAction(startupStatus), message: message || (drift ? 'The draft changed after this operation was retained. Continuing is locked. Detach releases only this draft lock; the lifecycle recovery record and project files remain unchanged.' : continuation?.operationId ? `Retained IKEMaker operation ${continuation.operationId.slice(0, 12)}… · ${startupStatus}.` : ''), error: drift || ambiguous });
  };
  panel.webview.onDidReceiveMessage(message => Promise.resolve().then(async () => {
    if (message?.type === 'sffWriterPreferenceReady') {
      panel.creatorReady = true;
      const handled = await writerPreference.handle(message, vscode);
      if (panel.pendingDesktopDrop?.length) { const paths = panel.pendingDesktopDrop; panel.pendingDesktopDrop = null; await panel.webview.postMessage({ type: 'forwardedDesktopDrop', paths }); }
      if (activeLifecyclePresentation) await lifecyclePresentation(activeLifecyclePresentation);
      if (handled) { if (autoBuildSelectedPending) { autoBuildSelectedPending = false; await panel.webview.postMessage({ type: 'autoBuildSelected' }); } return; }
    } else if (message?.type === 'sffWriterPreferenceChange' && await writerPreference.handle(message, vscode)) return;
    if (message?.type === 'buildSelected') {
      const selected = await writerPreference.settledSnapshot(), reviewed = safeDraft(message.draft);
      if (reviewed.configuration.paletteMode === 'true-color') configureTrueColorIntake(reviewed, selected.mode);
      const version = reviewed.target?.sffVersion || reviewed.configuration.newArchiveVersion || '2.1';
      const productionSupported = Boolean(reviewed.target?.path) && ['2.0', '2.1'].includes(String(version));
      message = { ...message, type: selected.mode === 'sprmake2' ? 'build' : selected.mode === 'both' ? 'buildCompared' : productionSupported ? 'startProductionBuiltIn' : version === '2.0' ? 'buildBuiltInV20' : 'buildBuiltInV21Single' };
    }
    if (['buildCompared', 'compareBoth', 'buildBuiltInV21'].includes(message?.type) && safeDraft(message.draft).configuration.paletteMode === 'true-color') throw new Error('Both writers comparison cannot yet validate True Color safely. Use the selected IKEMaker or SprMake2 single-writer route instead.');
    if (['build', 'startProductionBuiltIn'].includes(message?.type)) { const reviewed = safeDraft(message.draft); if (reviewed.configuration.paletteMode === 'true-color' && reviewed.replaceSpriteIdentities.length) throw new Error('Active SFF adoption is unavailable for this truecolor replacement under the current writer certification. Use Save Verified SFF Copy to choose and inspect a new .sff file.'); }
    if (message?.type === 'startProductionBuiltIn') {
      if (productionOperationBusy) throw new Error('A reviewed IKEMaker lifecycle action is already open or running.');
      productionOperationBusy = true;
      try {
      if (!productionLifecycleStarter || !productionLifecycle || !lifecycleContinuations) throw new Error('The reviewed IKEMaker lifecycle is not installed. The draft was retained.');
      const staged = await stageDraft(root, message.draft);
      if (!staged.state.enabled) { await postState(staged.draft, staged.state.reason); return; }
      const prior = await lifecycleContinuations.resume({ draftKey: key, currentDraftRevision: lifecycleDraftRevision(staged.draft) });
      if (prior.status !== 'no-continuation') { await lifecyclePresentation(prior, 'A retained IKEMaker operation already owns this Creator draft. Continue or explicitly detach its lock; a second operation was not started.'); return; }
      const version = String(staged.draft.target?.sffVersion || ''), formatId = `sff-v${version}`, route = BUILT_IN_LIFECYCLE_ROUTES[formatId];
      if (!staged.draft.target?.path || !route) { await lifecyclePresentation(null, 'Reviewed IKEMaker updates require an existing SFF v2.0 or v2.1 target. SprMake2 and TEST BUILD routes remain available.'); return; }
      const reviewedRevision = lifecycleDraftRevision(staged.draft), targetSnapshot = captureTarget(fs, staged.draft.target.path);
      if (!targetSnapshot.exists) throw new Error('The reviewed active SFF is unavailable. The draft was retained.');
      const automaticPackageParent = panel.returnToViewerOnComplete ? require('./sff_private_storage').directory('builds') : '';
      const packaged = await createReviewedPackage(root, staged.draft, !automaticPackageParent, '', automaticPackageParent);
      if (!packaged.resolved) { await postState(staged.draft, 'Reviewed IKEMaker update cancelled before lifecycle start; the draft was retained.'); return; }
      const started = await productionLifecycleStarter.startCreatorBuiltInAdoption({ formatId, build: packaged.build, targetSnapshot, draftRevision: reviewedRevision, getCurrentDraft: () => safeDraft(drafts.read(key) || staged.draft), workspaceRoot: root, packageRoot: packaged.packageRoot, draftKey: key }, { confirm: async envelope => await vscode.window.showWarningMessage(`Start the reviewed ${formatId} IKEMaker lifecycle?`, { modal: true, detail: `This retains the exact reviewed specification, active archive hash, and route ${envelope.route.backendId}. It stops at target review before candidate build or active-file mutation. SprMake2 and TEST BUILD behavior is unchanged.` }, 'Start Reviewed IKEMaker Update') === 'Start Reviewed IKEMaker Update' });
      if (started.status === 'cancelled') { await postState(staged.draft, 'Reviewed IKEMaker lifecycle start cancelled; no candidate or active archive was changed.'); return; }
      const continuation = await lifecycleContinuations.resume({ draftKey: key, currentDraftRevision: reviewedRevision });
      await lifecyclePresentation(continuation); return;
      } finally { productionOperationBusy = false; }
    }
    if (message?.type === 'continueProductionBuiltIn') {
      if (productionOperationBusy) throw new Error('A reviewed IKEMaker lifecycle action is already open or running.');
      productionOperationBusy = true;
      try {
      if (!productionLifecycle || !lifecycleContinuations) throw new Error('The reviewed IKEMaker lifecycle is not installed.');
      const staged = await stageDraft(root, message.draft), currentDraftRevision = lifecycleDraftRevision(staged.draft);
      const continuation = await lifecycleContinuations.resume({ draftKey: key, currentDraftRevision });
      if (continuation.status === 'no-continuation' || continuation.status === 'draft-drift-review-required') { await lifecyclePresentation(continuation); return; }
      const targetPath = staged.draft.target?.path;
      if (!targetPath) throw new Error('The retained operation has no matching active SFF target. Recovery remains retained.');
      const result = await productionLifecycle.continueOperation({ draftKey: key, draftRevision: continuation.draftRevision, currentDraftRevision, binding: continuation.binding, continuationLocator: continuation.continuationLocator, activePath: targetPath, recoveryPolicy: (drafts.read(key) || recovered).configuration.keepRecoveryBackup === true ? 'keep' : 'temporary', backupBasename: `${path.basename(targetPath, path.extname(targetPath))}.ikemaker-backup.sff`, capabilityRequest: {} });
      if (result.draftCleared) {
        await require('./sff_creator_optional_air').reviewOptionalAirAfterBuild(vscode, staged.draft, { locator: result.continuationLocator || continuation.continuationLocator });
        recovered = defaultDraft(); invalidateSavedRules(recovered); activeLifecyclePresentation = null;
        await panel.webview.postMessage({ type: 'state', draft: recovered, plan: { rows: [], ready: [], conflicts: [], skipped: [] }, applyState: { enabled: false, reason: 'Choose at least one PNG source.' }, savedRuleReview: null, nearestColorReview: null, message: ['The reviewed IKEMaker operation reached independently verified Completed state. Only then was its Creator draft discarded.',require('./sff_creator_recovery_notice').recoveryNotice(result.temporaryRecovery)].filter(Boolean).join(' ') });
        await lifecyclePresentation(null);
        if (panel.returnToViewerOnComplete) {
          panel.returnToViewerOnComplete = false;
          panel.dispose();
          await vscode.commands.executeCommand('sff.openViewer', vscode.Uri.file(targetPath), undefined, undefined, { refresh: true });
        }
        return;
      }
      await lifecyclePresentation({ ...continuation, temporaryRecovery: result.temporaryRecovery, status: 'restart-review-required', startup: { ...(continuation.startup || {}), status: result.status }, continuationLocator: result.continuationLocator || continuation.continuationLocator, operationId: result.operationId || continuation.operationId }, result.status === 'review-deferred' || /deferred/.test(result.status) ? 'Review deferred. The exact operation and draft remain retained.' : 'One explicit lifecycle step completed and was retained. Continue when ready.'); return;
      } finally { productionOperationBusy = false; }
    }
    if (message?.type === 'detachProductionLifecycle') {
      const current = safeDraft(drafts.read(key) || recovered), currentDraftRevision = lifecycleDraftRevision(current), retained = activeLifecyclePresentation || await lifecycleContinuations.resume({ draftKey: key, currentDraftRevision });
      if (retained.status !== 'draft-drift-review-required') throw new Error('Detach is available only after exact draft drift is detected.');
      const answer = await vscode.window.showWarningMessage('Detach this operation from the current Creator draft?', { modal: true, detail: 'This releases only the retained draft ownership lock. It does not modify the Creator draft, active SFF, candidate, history, or lifecycle vault. The exact operation remains preserved as a recoverable record.' }, 'Detach Lock; Keep Recovery Record');
      if (answer !== 'Detach Lock; Keep Recovery Record') { await lifecyclePresentation(retained, 'Detach cancelled. The draft lock and recovery record remain retained.'); return; }
      await lifecycleContinuations.detach({ draftKey: key, expectedOperationId: retained.operationId, expectedRetainedDraftRevision: retained.draftRevision, currentDraftRevision, detachRequestId: crypto.randomBytes(32).toString('hex'), reason: 'User explicitly detached a drifted Creator draft lock while preserving lifecycle recovery evidence.', confirmation: DETACH_CONFIRMATION });
      activeLifecyclePresentation = null; await lifecyclePresentation(null, 'Draft lock detached. The lifecycle recovery record was preserved; no project, candidate, history, or draft content changed.'); return;
    }
    if (await handleLaunchMessage(message, safeDraft(drafts.read(key) || recovered).target?.path || root, 'sff', panel)) return;
    if (message.type === 'openWriterComparison') {
      const picked = await vscode.window.showOpenDialog({ title: 'Open an IKEMaker writer comparison', openLabel: 'Review Comparison', canSelectFiles: true, canSelectFolders: false, canSelectMany: false, filters: { 'IKEMaker writer comparison': ['json'] } });
      if (!picked?.[0]) return;
      const summary = readWriterComparisonReport(picked[0].fsPath), current = safeDraft(drafts.read(key) || recovered), restored = runStateFromBinding(summary, current.target);
      activeWriterRunBinding = restored.verifiedBinding || null;
      const { verifiedBinding: _verifiedBinding, ...runState } = restored;
      activeWriterComparison = { ...summary, ...runState };
      await panel.webview.postMessage({ type: 'writerComparison', summary: activeWriterComparison }); return;
    }
    if (message.type === 'writerComparisonAction') {
      if (!activeWriterComparison) throw new Error('Open a writer comparison before using its file actions.');
      if (message.action === 'json') { const document = await vscode.workspace.openTextDocument(vscode.Uri.file(activeWriterComparison.path)); await vscode.window.showTextDocument(document, { preview: false }); return; }
      if (message.action === 'folder') { await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(activeWriterComparison.path)); return; }
      const fresh = readWriterComparisonReport(activeWriterComparison.path);
      if (message.action === 'run') {
        if (comparisonRunActive) throw new Error('This writer comparison is already running. Other IKEMEN windows remain unaffected.');
        if (!activeWriterComparison.runAvailable) {
          const current = safeDraft(drafts.read(key) || recovered), binding = createWriterRunBinding(fresh, current.target);
          const answer = await vscode.window.showWarningMessage(`Use these exact candidates with the current character for this test only?`, { modal: true, detail: `Portable comparison reports do not identify their original character. You selected ${path.basename(binding.targetPath)} as the current test character. IKEMaker verified the comparison JSON, both candidate SFFs, this active SFF, and ${path.basename(binding.ownerDefPath)} by exact hash. This workspace-local test binding is revoked if any file changes and grants no write or adoption authority.` }, 'Bind & Run');
          if (answer !== 'Bind & Run') { await panel.webview.postMessage({ type: 'writerComparisonRunState', active: false, available: false, message: 'Run cancelled. No game or character files were changed.' }); return; }
          const confirmedBinding = createWriterRunBinding(readWriterComparisonReport(activeWriterComparison.path), safeDraft(drafts.read(key) || recovered).target);
          if (!writerRunBindingMatches(binding, confirmedBinding)) throw new Error('The character, owner DEF, or comparison changed during confirmation. Review and bind the current files again.');
          await writeRunBinding(root, confirmedBinding);
          activeWriterRunBinding = confirmedBinding;
          activeWriterComparison = { ...fresh, runAvailable: true, targetPath: confirmedBinding.targetPath, targetFingerprint: confirmedBinding.targetHash };
          await panel.webview.postMessage({ type: 'writerComparison', summary: activeWriterComparison });
        }
        const captured = activeWriterComparison, runner = require('./sff_writer_comparison_run'), targetPath = path.resolve(captured.targetPath || '');
        const authority = () => {
          if (panelDisposed || sessions.get(key) !== panel || activeWriterComparison !== captured) throw new Error('The originating SFF Creator or writer comparison changed while the run was being prepared.');
          if (!captured.runAvailable || !captured.targetPath) throw new Error(captured.runUnavailableReason || 'Run is not bound to the current character.');
          const report = readWriterComparisonReport(captured.path);
          if (!report.semanticEquivalent || !report.independentlyValidated || captured.reportHash !== report.reportHash || !report.builtInAvailable || !report.sprMake2Available) throw new Error('The comparison report or one of its candidates changed. Create two fresh test SFFs.');
          const current = safeDraft(drafts.read(key) || recovered), fingerprint = String(current.target?.expectedFingerprint || current.target?.fingerprint || '').toLowerCase();
          if (!current.target?.path || path.resolve(current.target.path) !== targetPath || fingerprint !== String(captured.targetFingerprint || '').toLowerCase()) throw new Error('The Creator target changed after the comparison was made. Create two fresh test SFFs.');
          const targetBytes = readStableBoundedFile(targetPath, 1024 * 1024 * 1024, 'active character SFF'), targetHash = crypto.createHash('sha256').update(targetBytes).digest('hex');
          if (targetHash !== String(captured.targetFingerprint || '').toLowerCase()) throw new Error('The active character SFF changed after the comparison was created.');
          const freshBinding = createWriterRunBinding(report, current.target);
          if (!writerRunBindingMatches(activeWriterRunBinding, freshBinding)) throw new Error('The character, owner DEF, game root, or comparison changed after Run Test was enabled. Review and bind the current files again.');
          const owner = runner.resolveOwnerDef(targetPath);
          return { report, owner, targetHash };
        };
        const initial = authority();
        const owner = initial.owner;
        const gameRoot = require('./ikemen_hub').findGameRoot(owner.filename);
        if (!gameRoot) throw new Error('IKEMEN game root was not found for the comparison character.');
        const executable = require('./engine_runtime').resolve(gameRoot, vscode.workspace.getConfiguration('ikemenZss').get('ikemenPath', ''));
        const answer = await vscode.window.showWarningMessage('Run P1 IKEMaker vs P2 SprMake2?', { modal: true, detail: `P1 will load ${path.basename(fresh.builtInPath)} and P2 will load ${path.basename(fresh.sprMake2Path)} for one round. IKEMaker uses temporary sibling character aliases; ${path.basename(owner.filename)} and ${path.basename(targetPath)} are never changed. Temporary files are removed after IKEMEN exits.` }, 'Choose Stage & Run');
        if (answer !== 'Choose Stage & Run') { await panel.webview.postMessage({ type: 'writerComparisonRunState', active: false, available: true, message: 'Comparison run cancelled. The normal character files were unchanged.' }); return; }
        const stage = await require('./launch_stage').chooseLaunchStage(gameRoot, vscode.workspace.getConfiguration('ikemenZss').get('defaultTrainingStage', 'stages/stage0.def'), (items, options) => vscode.window.showQuickPick(items, options));
        if (!stage) { await panel.webview.postMessage({ type: 'writerComparisonRunState', active: false, available: true, message: 'Stage selection cancelled. The normal character files were unchanged.' }); return; }
        let prepared = null;
        try {
          const checked = authority();
          prepared = runner.prepare({ targetSff: targetPath, targetHash: checked.targetHash, builtInPath: checked.report.builtInPath, builtInHash: checked.report.builtIn.byteHash, builtInSize: checked.report.builtIn.byteLength, sprMake2Path: checked.report.sprMake2Path, sprMake2Hash: checked.report.sprMake2.byteHash, sprMake2Size: checked.report.sprMake2.byteLength });
          authority();
          comparisonRunActive = true;
          const launched = await runner.launch(prepared, { gameRoot, executable, stage }, { warn: text => vscode.window.showWarningMessage(text), onExit: result => { comparisonRunActive = false; if (!panelDisposed) void panel.webview.postMessage({ type: 'writerComparisonRunState', active: false, available: activeWriterComparison === captured, message: result.cleaned ? 'Comparison run ended. Temporary P1/P2 files were removed; the normal character was never changed.' : 'Comparison run ended, but changed temporary files were retained for manual review.' }); } });
          prepared = null;
          if (!launched.isActive() || !comparisonRunActive) throw new Error('IKEMEN exited before the comparison run could be shown as active.');
          await panel.webview.postMessage({ type: 'writerComparisonRunState', active: true, available: true, message: `Running one round: P1 IKEMaker · P2 SprMake2 · ${stage}. Normal character files remain unchanged.` });
          vscode.window.showInformationMessage(`Writer comparison launched: P1 IKEMaker vs P2 SprMake2. Temporary aliases will be removed after IKEMEN process ${launched.pid} exits.`);
        } catch (error) { if (prepared) runner.cleanupPrepared(prepared, { warn: text => vscode.window.showWarningMessage(text) }); comparisonRunActive = false; throw error; }
        return;
      }
      const field = message.action === 'builtIn' ? 'builtInPath' : message.action === 'sprMake2' ? 'sprMake2Path' : '';
      const sameReport = activeWriterComparison.reportHash === fresh.reportHash;
      const available = message.action === 'builtIn' ? sameReport && activeWriterComparison.builtInAvailable && fresh.builtInAvailable : message.action === 'sprMake2' ? sameReport && activeWriterComparison.sprMake2Available && fresh.sprMake2Available : false;
      if (!field || !available) throw new Error('That comparison candidate is missing or no longer matches the report hash.');
      await vscode.commands.executeCommand('sff.openViewer', vscode.Uri.file(fresh[field])); return;
    }
    if (message.type === 'reviewSavedRules') {
      const staged = await stageDraft(root, message.draft), nextFingerprint = replacementRuleCoreFingerprint(staged.draft);
      if (nextFingerprint !== retainedCoreFingerprint) { retainedCoreFingerprint = nextFingerprint; draftRevision += 1; ruleAuthority.revoke(); savedRuleReview = null; }
      const retained = staged.draft.replacementRuleAcceptances.length || staged.draft.workshopReturns.length || staged.draft.paletteAdaptationAcceptances.length ? revalidateRetainedReplacementRuleAcceptance(root, staged.draft) : null;
      ruleAuthority.revoke(); savedRuleReview = null;
      const binding = replacementRuleBinding(root, staged.draft, creatorGeneration, draftRevision);
      savedRuleReview = ruleAuthority.begin(binding, { excludeIssueIds: retained?.excludedIssueIds || [] });
      await panel.webview.postMessage({ type: 'state', draft: staged.draft, plan: staged.state.plan || { rows: [], ready: [], conflicts: [], skipped: [] }, applyState: { enabled: staged.state.enabled, reason: staged.state.reason }, savedRuleReview, message: savedRuleReview.rows.length ? `Found ${savedRuleReview.rows.length} exact saved color rule match${savedRuleReview.rows.length === 1 ? '' : 'es'}. Nothing was applied.` : 'No additional saved color rules exactly match this intake.' }); return;
    }
    if (message.type === 'acceptSavedRule' || message.type === 'ignoreSavedRule') {
      const current = safeDraft(message.draft), nextFingerprint = replacementRuleCoreFingerprint(current);
      if (nextFingerprint !== retainedCoreFingerprint) { draftRevision += 1; retainedCoreFingerprint = nextFingerprint; }
      savedRuleReview = null;
      let acceptance;
      try { const binding = replacementRuleBinding(root, current, creatorGeneration, draftRevision); acceptance = ruleAuthority.accept({ reviewId: String(message.reviewId || ''), actionId: String(message.actionId || '') }, binding); }
      catch (error) { ruleAuthority.revoke(); await panel.webview.postMessage({ type: 'savedRuleReview', review: null, message: `${error.message} Nothing was applied.` }); throw error; }
      current.replacementRuleAcceptances = [...(current.replacementRuleAcceptances || []), acceptance];
      current.replacementRuleDraftFingerprint = nextFingerprint;
      const staged = await stageDraft(root, current), retained = revalidateRetainedReplacementRuleAcceptance(root, staged.draft), binding = replacementRuleBinding(root, staged.draft, creatorGeneration, draftRevision);
      savedRuleReview = ruleAuthority.begin(binding, { excludeIssueIds: retained.excludedIssueIds });
      const ignored = acceptance.provenance.actionKind.startsWith('ignore-'), affected = acceptance.resolutionPatch.acceptedIssueIds.length + acceptance.resolutionPatch.ignoredIssueIds.length;
      await panel.webview.postMessage({ type: 'state', draft: staged.draft, plan: staged.state.plan || { rows: [], ready: [], conflicts: [], skipped: [] }, applyState: { enabled: staged.state.enabled, reason: staged.state.reason }, savedRuleReview, message: ignored ? `Ignored ${affected} exact saved color rule match${affected === 1 ? '' : 'es'} for this intake. Manual resolution is still required.` : `Applied ${affected} exact saved color rule match${affected === 1 ? '' : 'es'} to the retained Creator resolution draft.` }); return;
    }
    if (message.type === 'reviewNearestColors') {
      const staged = await stageDraft(root, message.draft), nextFingerprint = replacementRuleCoreFingerprint(staged.draft);
      if (nextFingerprint !== retainedCoreFingerprint) { retainedCoreFingerprint = nextFingerprint; draftRevision += 1; ruleAuthority.revoke(); paletteAdaptationAuthority.revoke(); savedRuleReview = null; nearestColorReview = null; }
      const retained = staged.draft.replacementRuleAcceptances.length || staged.draft.workshopReturns.length || staged.draft.paletteAdaptationAcceptances.length ? revalidateRetainedReplacementRuleAcceptance(root, staged.draft) : null;
      paletteAdaptationAuthority.revoke(); nearestColorReview = null;
      const binding = replacementRuleBinding(root, staged.draft, creatorGeneration, draftRevision);
      nearestColorReview = paletteAdaptationAuthority.begin(binding, { excludeIssueIds: retained?.excludedIssueIds || [] });
      await panel.webview.postMessage({ type: 'state', draft: staged.draft, plan: staged.state.plan || { rows: [], ready: [], conflicts: [], skipped: [] }, applyState: { enabled: staged.state.enabled, reason: staged.state.reason }, savedRuleReview, nearestColorReview, message: nearestColorReview.rows.length ? `Found ${nearestColorReview.rows.length} unmatched color${nearestColorReview.rows.length === 1 ? '' : 's'} with reviewable palette candidates. Nothing was selected or applied.` : 'No additional unmatched colors have safe alpha-compatible suggestions.' }); return;
    }
    if (message.type === 'acceptNearestColors') {
      const current = safeDraft(message.draft), nextFingerprint = replacementRuleCoreFingerprint(current);
      if (nextFingerprint !== retainedCoreFingerprint) { draftRevision += 1; retainedCoreFingerprint = nextFingerprint; }
      nearestColorReview = null;
      let acceptance;
      try { const binding = replacementRuleBinding(root, current, creatorGeneration, draftRevision); acceptance = paletteAdaptationAuthority.accept({ reviewId: String(message.reviewId || ''), actionId: String(message.actionId || ''), selections: message.selections }, binding); }
      catch (error) { paletteAdaptationAuthority.revoke(); await panel.webview.postMessage({ type: 'nearestColorReview', review: null, message: `${error.message} Nothing was applied.` }); throw error; }
      current.paletteAdaptationAcceptances = [...(current.paletteAdaptationAcceptances || []), acceptance]; current.replacementRuleDraftFingerprint = nextFingerprint;
      const staged = await stageDraft(root, current), retained = revalidateRetainedReplacementRuleAcceptance(root, staged.draft), binding = replacementRuleBinding(root, staged.draft, creatorGeneration, draftRevision);
      nearestColorReview = paletteAdaptationAuthority.begin(binding, { excludeIssueIds: retained.excludedIssueIds });
      const affected = acceptance.resolutionPatch.acceptedIssueIds.length;
      await panel.webview.postMessage({ type: 'state', draft: staged.draft, plan: staged.state.plan || { rows: [], ready: [], conflicts: [], skipped: [] }, applyState: { enabled: staged.state.enabled, reason: staged.state.reason }, savedRuleReview, nearestColorReview, message: `Retained ${affected} reviewed nearest-color decision${affected === 1 ? '' : 's'} in this Creator draft. No file was written.` }); return;
    }
    if (message.type === 'manageSavedColorRules') {
      const current = safeDraft(drafts.read(key) || recovered); if (!current.target?.path) throw new Error('Choose the target SFF before managing its saved color rules.');
      await vscode.commands.executeCommand('ikemen.palette.openWorkspace', vscode.Uri.file(current.target.path), { section: 'index-migration' }); return;
    }
    if (message.type === 'openSavedRuleInPaletteWorkshop') {
      const current = safeDraft(message.draft), nextFingerprint = replacementRuleCoreFingerprint(current);
      if (nextFingerprint !== retainedCoreFingerprint) { draftRevision += 1; retainedCoreFingerprint = nextFingerprint; ruleAuthority.revoke(); savedRuleReview = null; await panel.webview.postMessage({ type: 'savedRuleReview', review: null, message: 'The Creator draft changed. Review saved color rules again before opening Palette Workshop.' }); return; }
      const workshopActionId = String(message.actionId || ''), workshopReviewId = String(message.reviewId || ''); let handoff, workshopBindingHash;
      try { const binding = replacementRuleBinding(root, current, creatorGeneration, draftRevision); workshopBindingHash = normalizeReplacementRuleBinding(binding).evidence.bindingHash; handoff = ruleAuthority.workshopHandoff({ reviewId: workshopReviewId, actionId: workshopActionId, reducedMotion: false, nonce: crypto.randomBytes(16).toString('hex') }, binding); }
      catch (error) { ruleAuthority.revoke(); savedRuleReview = null; await panel.webview.postMessage({ type: 'savedRuleReview', review: null, message: `${error.message} Review saved color rules again.` }); return; }
      const workshopRow = savedRuleReview?.rows?.find(row => row.workshopActionId === workshopActionId); if (workshopRow) workshopRow.workshopActionId = '';
      try {
        await openPaletteWorkshopAfterFreshCheck(
          () => panel.webview.postMessage({ type: 'savedRuleReview', review: savedRuleReview, message: 'Preparing the exact Palette Workshop handoff. This one-time route cannot be reused.' }),
          () => {
            if (sessions.get(key) !== panel || replacementRuleSessions.get(key)?.invalidate !== invalidateSavedRules || savedRuleReview?.reviewId !== workshopReviewId) throw new Error('The originating Creator session closed or changed before Palette Workshop could open.');
            const liveDraft = safeDraft(drafts.read(key) || current); if (replacementRuleCoreFingerprint(liveDraft) !== nextFingerprint) throw new Error('The Creator draft changed before Palette Workshop could open.');
            const freshBindingHash = normalizeReplacementRuleBinding(replacementRuleBinding(root, liveDraft, creatorGeneration, draftRevision)).evidence.bindingHash;
            if (freshBindingHash !== workshopBindingHash) throw new Error('The target, master palette, source pixels, or saved rules changed before Palette Workshop could open.');
          },
          () => vscode.commands.executeCommand('ikemen.palette.openWorkspace', vscode.Uri.file(current.target.path), { kind: 'sff-unmatched-color', handoff, returnCommand: 'sff.openCreator' })
        );
      } catch (error) { ruleAuthority.revoke(); savedRuleReview = null; await panel.webview.postMessage({ type: 'savedRuleReview', review: null, message: `${error.message} Review saved color rules again.` }); return; }
      return;
    }
    if (message.type === 'chooseTarget') {
      const picked = await vscode.window.showOpenDialog({ title: 'Choose the existing SFF to extend', canSelectFiles: true, canSelectFolders: false, canSelectMany: false, filters: { 'SFF archives': ['sff'] } });
      if (!picked?.[0]) return;
      const current = safeDraft(drafts.read(key) || recovered), target = targetFromFile(picked[0].fsPath);
      current.target = target; current.existingIdentities = target.identities;
      current.addedSpritePaletteId = target.palettes.find(item => item.id === '1,1')?.id || target.palettes[0]?.id || '';
      await postState(current, `Target reviewed: ${target.name} · ${target.spriteCount} sprites · ${target.paletteCount} palettes.`); return;
    }
    if (message.type === 'clearTarget') {
      const current = safeDraft(drafts.read(key) || recovered); current.target = null; current.existingIdentities = []; current.deletedSpriteIdentities = []; current.addedSpritePaletteId = '';
      await postState(current, 'Switched to new-archive creation.'); return;
    }
    if (message.type === 'protectTargetMaster') {
      const current = safeDraft(message.draft), paletteId = String(current.configuration.masterPaletteId || '');
      if (!current.target?.path) throw new Error('Choose an existing target SFF before setting its master palette.');
      const matching = current.target.palettes.filter(palette => palette.id === paletteId);
      if (matching.length !== 1) throw new Error('Choose one unambiguous embedded indexing/master palette first.');
      const archive = readSff(current.target.path), observed = crypto.createHash('sha256').update(archive.buffer).digest('hex').toLowerCase();
      if (observed !== String(current.target.expectedFingerprint || '').toLowerCase()) throw new Error('The target SFF changed before its master palette could be protected. Choose the target again.');
      const location = masterLocation(current.target.path, root), prior = readMasterSnapshot(location);
      if (prior && (prior.palette.group !== matching[0].group || prior.palette.number !== matching[0].number)) throw new Error(`This SFF already protects palette ${prior.palette.group},${prior.palette.number} as its immutable master. Open the master record before intentionally creating a new revision.`);
      const snapshot = createMasterSnapshot(archive, matching[0].physicalIndex, current.target.path), result = writeMasterSnapshot(location, snapshot);
      await postState(current, result.created ? `Set embedded palette ${paletteId} as the protected indexing master. Record: ${location.json}` : `Embedded palette ${paletteId} is already the protected indexing master. Record: ${location.json}`); return;
    }
    if (message.type === 'chooseTemporaryPalette') {
      const picked = await vscode.window.showOpenDialog({ title: 'Choose the temporary placeholder palette', canSelectFiles: true, canSelectFolders: false, canSelectMany: false, filters: { 'ACT or indexed PNG palette': ['act', 'png'] } });
      if (!picked?.[0]) return;
      const current = safeDraft(message.draft), info = paletteSourceInfo(picked[0].fsPath, current.configuration.temporaryPaletteTableOrder);
      current.configuration.paletteMode = 'temporary'; current.configuration.placeholder = true;
      current.configuration.temporaryPalettePath = info.path; current.configuration.temporaryPaletteByteHash = info.byteHash; current.configuration.temporaryPaletteColorHash = info.colorHash; current.configuration.temporaryPaletteTableOrder = info.tableOrder; current.configuration.temporaryPalettePartialAlphaCount = info.partialAlphaCount; current.configuration.temporaryPalettePartialAlphaIndexes = info.partialAlphaIndexes;
      current.configuration.temporaryPaletteStale = false; current.configuration.temporaryPaletteUnavailable = false;
      if (!current.configuration.temporaryPaletteLifecycleId) current.configuration.temporaryPaletteLifecycleId = crypto.randomUUID();
      current.addedSpritePaletteId = current.configuration.temporaryPaletteId;
      await postState(current, `Temporary palette reviewed: ${info.name} · ${current.configuration.temporaryPaletteId} · ${info.tableOrderLabel}. Apply it to any source rows whose indexes do not yet match.`); return;
    }
    if (message.type === 'remapSelected') {
      const current = safeDraft(message.draft), selectedIds = new Set((message.sourceIds || []).map(String));
      const temporaryMode = current.configuration.paletteMode === 'temporary';
      if (!temporaryMode && !current.target) throw new Error('Choose an existing target SFF and embedded palette before remapping sources.');
      if (temporaryMode && (!current.configuration.temporaryPalettePath || current.configuration.temporaryPaletteStale)) throw new Error('Choose the temporary ACT or indexed PNG palette again before remapping sources.');
      if (!selectedIds.size) throw new Error('Mark one or more source rows before applying a target palette.');
      const selected = current.sources.filter(source => selectedIds.has(source.id));
      if (!selected.length || selected.length !== selectedIds.size) throw new Error('The marked source selection changed. Mark the sources again.');
      let colors, paletteLabel, targetProvenance;
      if (temporaryMode) {
        const temporary = paletteSourceInfo(current.configuration.temporaryPalettePath, current.configuration.temporaryPaletteTableOrder); colors = temporary.colors; paletteLabel = current.configuration.temporaryPaletteId;
        targetProvenance = { temporaryPaletteSource: temporary.path, temporaryPaletteByteHash: temporary.byteHash, temporaryPaletteTableOrder: temporary.tableOrder, lifecycleId: current.configuration.temporaryPaletteLifecycleId };
      } else {
        const archive = readSff(current.target.path), matching = archive.palettes.filter(palette => `${palette.group},${palette.number}` === current.addedSpritePaletteId);
        if (matching.length !== 1) throw new Error(`Target palette ${current.addedSpritePaletteId} is missing or ambiguous. Choose the target again.`);
        colors = paletteRgba(archive, matching[0].index); paletteLabel = current.addedSpritePaletteId;
        targetProvenance = { targetArchive: current.target.path, targetFingerprint: current.target.expectedFingerprint };
      }
      const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-sff-palette-remap-'));
      const results = selected.map((source, ordinal) => ({ source, output: path.join(folder, `${String(ordinal).padStart(5, '0')}_${path.basename(source.path)}`), remap: remapPngToPalette(fs.readFileSync(source.path), colors) }));
      const changedPixels = results.reduce((sum, item) => sum + item.remap.changedPixels, 0), totalPixels = results.reduce((sum, item) => sum + item.remap.totalPixels, 0), changedColors = results.reduce((sum, item) => sum + item.remap.changedColorCount, 0), transparentChanged = results.reduce((sum, item) => sum + item.remap.transparentChanged, 0), maximumDistance = Math.max(0, ...results.map(item => item.remap.maximumDistance));
      if (transparentChanged) throw new Error(`Palette remap is blocked because ${transparentChanged} pixel(s) would change between transparent and visible. Choose another master/FX palette or fix its transparency slot.`);
      const lossless = changedPixels === 0, label = lossless ? 'Apply Exact Remap' : 'Accept Lossy Remap';
      const answer = await vscode.window.showWarningMessage(`${lossless ? 'Apply exact palette indexing' : 'Accept lossy palette remap'} for ${results.length} source(s)?`, { modal: true, detail: lossless ? `All ${totalPixels} pixels already exist exactly in palette ${paletteLabel}. Only indexed storage will change.` : `${changedPixels} of ${totalPixels} pixels across ${changedColors} source color occurrence(s) require nearest-color mapping. Maximum RGBA distance: ${maximumDistance.toFixed(2)}. Originals remain unchanged and the remap evidence is retained.` }, label);
      if (answer !== label) { await postState(current, 'Palette remap cancelled; source images were unchanged.'); return; }
      for (const item of results) {
        transactionalWrite(fs, item.output, item.remap.buffer, { label: 'sff-creator-palette-remap', allowExisting: false, backup: false, journal: false });
        const replacement = sourceFromFile(item.output, { sourceIdentity: item.source.id, ownerId: item.source.ownerId, label: item.source.name, provenance: { kind: temporaryMode ? 'temporary-palette-remap' : 'target-palette-remap', sourceIdentity: item.source.id, original: item.source.provenance || { sourceFile: item.source.path, sourceByteHash: item.source.byteHash }, ...targetProvenance, paletteId: paletteLabel, lossless: item.remap.lossless, changedPixels: item.remap.changedPixels, totalPixels: item.remap.totalPixels, changedColorCount: item.remap.changedColorCount, averageDistance: item.remap.averageDistance, maximumDistance: item.remap.maximumDistance } });
        replacement.id = item.source.id; current.sources[current.sources.findIndex(source => source.id === item.source.id)] = replacement;
      }
      await postState(current, `${lossless ? 'Exactly indexed' : 'Remapped'} ${results.length} source(s) to palette ${paletteLabel}.`); return;
    }
    if (message.type === 'openNeedsPalette') {
      const current=safeDraft(message.draft);if(current.configuration.paletteMode!=='needs-palette')throw new Error('Choose Needs Palette before opening its Palette Workshop route.');if(!current.target?.path)throw new Error('Needs Palette requires an existing reviewed SFF target.');if(!current.sources.length)throw new Error('Add at least one PNG source before opening Needs Palette.');const freshTarget=targetFromFile(current.target.path,current.target.expectedFingerprint);if(freshTarget.stale)throw new Error('The target SFF changed after review. Reopen it before continuing to Palette Workshop.');const handoff=needsPaletteHandoff.create({target:{path:freshTarget.path,hash:freshTarget.fingerprint,bytes:fs.statSync(freshTarget.path).size,version:freshTarget.sffVersion},sources:current.sources.map(source=>({path:source.path,hash:source.byteHash,bytes:source.byteLength,width:source.width,height:source.height,bitDepth:source.bitDepth,colorType:source.colorType})),tilingMethod:current.configuration.tilingMethod,returnContext:{command:COMMAND,targetPath:freshTarget.path}});await drafts.stage(key,current);await vscode.commands.executeCommand('ikemen.palette.openWorkspace',vscode.Uri.file(freshTarget.path),{kind:'sff-needs-palette',handoff});return;
    }
    if (message.type === 'assignLogicalGroup') {
      const current = safeDraft(message.draft), selectedIds = (message.sourceIds || []).map(String);
      if (!selectedIds.length || selectedIds.some(id => !current.sources.some(source => source.id === id))) throw new Error('The marked Creator source selection changed. Mark the sources again.');
      let destination = Number.isInteger(Number(message.targetGroup)) && Number.isInteger(Number(message.targetIndex)) ? `${Number(message.targetGroup)},${Number(message.targetIndex)}` : '';
      if (!destination) destination = await vscode.window.showInputBox({ title: `Assign ${selectedIds.length} marked source${selectedIds.length === 1 ? '' : 's'} to a logical group`, prompt: 'Enter group,start index. Source order is preserved and only draft overrides change.', value: `${current.configuration.group || 0},${current.configuration.startIndex || 0}`, validateInput: value => /^\d+\s*,\s*\d+$/.test(value) ? undefined : 'Enter group,start index.' });
      if (!destination) { await postState(current, 'Logical group assignment cancelled; the Creator draft was unchanged.'); return; }
      const [targetGroup, targetIndex] = destination.split(',').map(Number), air = current.target?.path ? scanAirSpriteReferences(current.target.path) : { status: 'unavailable', references: {}, files: [], skipped: [] };
      const paletteBySource = Object.fromEntries(current.sources.map(source => [source.id, current.configuration.overrides[source.id]?.paletteId || current.addedSpritePaletteId || (current.configuration.paletteMode === 'image' ? 'source image palette' : '')]));
      const assignment = planLogicalGroupAssignment({ sources: current.sources, overrides: current.configuration.overrides, selectedIds, targetGroup, targetIndex, existingIdentities: current.existingIdentities, reservedRanges: current.configuration.reservedRanges, airReferences: air.references, paletteBySource });
      const selectedSet = new Set(selectedIds), duplicateImpact = duplicateGroupAnalysis(draftToPlan(current), current).groups.filter(group => group.members.some(member => selectedSet.has(member.sourceId)));
      const detail = [
        ...assignment.rows.slice(0, 80).map(row => `${row.name} → ${row.target}${row.collision ? ' · OCCUPIED' : ''}${row.reserved ? ` · RESERVED: ${row.reserved}` : ''}${row.paletteId ? ` · palette ${row.paletteId}` : ''}${row.airReferences.length ? ` · AIR uses: ${row.airReferences.slice(0, 3).join(', ')}` : ''}`),
        ...(assignment.rows.length > 80 ? [`…and ${assignment.rows.length - 80} more`] : []), '',
        `AIR reference scan: folder-only/incomplete heuristic${air.files?.length ? ` · ${air.files.length} file(s)` : ''}${air.skipped?.length ? ` · ${air.skipped.length} skipped by safety bounds` : ''} · confirm against the character DEF assigned AIR files`,
        `Exact indexed-pixel duplicate groups touching this selection: ${duplicateImpact.length}${duplicateImpact.length ? ` · ${duplicateImpact.slice(0, 8).map(group => group.members.map(member => member.name).join(' = ')).join(' · ')}` : ''}`,
        assignment.review.mixedPalettes ? `Mixed effective palettes: ${assignment.review.paletteIds.join(', ')}` : `Effective palette: ${assignment.review.paletteIds[0] || 'not assigned'}`,
        'Occupied and reserved destinations are not approved here; they remain blocked for the Creator final collision review.',
        'This stages retained Creator group/index overrides only. It does not reorder or write the SFF.'
      ].join('\n');
      const action = 'Stage Destinations for Final Collision Review';
      const answer = await vscode.window.showWarningMessage(`Stage this logical group assignment for ${assignment.rows.length} source${assignment.rows.length === 1 ? '' : 's'}?`, { modal: true, detail }, action);
      if (answer !== action) { await postState(current, 'Logical group assignment review cancelled; the Creator draft was unchanged.'); return; }
      const applied = applyLogicalGroupAssignment({ plan: assignment, sources: current.sources, overrides: current.configuration.overrides, acceptReviewedRisks: true }); current.configuration.overrides = applied.overrides;
      await postState(current, `Staged ${assignment.rows.length} source destination${assignment.rows.length === 1 ? '' : 's'} in group ${targetGroup}, starting at ${targetIndex}. Occupied/reserved targets still require final collision review; the SFF is unchanged.`); return;
    }
    if (message.type === 'chooseDesktopIntake') {
      const choice = await vscode.window.showQuickPick([
        { label: 'Add PNG files…', type: 'addFiles' },
        { label: 'Add PNG folder…', type: 'addFolder' },
        { label: 'Add animated GIF…', type: 'addGif' },
        { label: 'Add Photoshop PSD…', type: 'addPsd' },
        { label: 'Prepare BMP / PCX / PNG sources…', type: 'prepareSources' },
        { label: 'Review a sprite sheet…', type: 'addSheet' }
      ], { title: 'Add sprite sources', placeHolder: 'Every route stages reviewed Creator sources; none writes the SFF on selection.' });
      if (!choice) return;
      message.type = choice.type;
    }
    if (message.type === 'desktopDropPaths') {
      const paths = Array.isArray(message.paths) ? message.paths.filter(value => typeof value === 'string').slice(0, 513) : [];
      if (!paths.length) throw new Error('No local Explorer paths were available from this drop. Use Add PNG Files or Add PNG Folder instead.');
      const prepared = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Reviewing ${paths.length} dropped image source${paths.length === 1 ? '' : 's'}`, cancellable: true }, async (progress, token) => {
        let prior = 0;
        return prepareDesktopDropAsync({ surface: DROP_SURFACES.SFF, generation: ++desktopDropGeneration, sessionNonce: crypto.randomUUID(), paths, inspectImage: inspectImageDimensions, isCancelled: () => token.isCancellationRequested, onProgress: state => { const percent = state.total ? Math.floor(state.completed / state.total * 100) : 0; progress.report({ increment: Math.max(0, percent - prior), message: state.path ? path.basename(state.path) : 'Validated' }); prior = percent; } });
      });
      if (prepared.admission.status === 'cancelled') { await postState(safeDraft(drafts.read(key) || recovered), 'Desktop drop intake cancelled; no Creator draft rows or files were changed.'); return; }
      if (prepared.admission.rejected.length) {
        const reasons = [...new Set(prepared.admission.rejected.flatMap(row => row.reasons))].join(', ');
        throw new Error(`Desktop drop was not admitted (${reasons}). No Creator draft rows were added.`);
      }
      const records = prepared.admission.candidate?.records || [];
      if (!records.length) throw new Error('The desktop drop did not contain an admitted image or folder.');
      if (records[0].kind === 'folder') {
        if (records.length !== 1) throw new Error('Drop one image folder at a time so its recursive scope can be reviewed.');
        const scope = await vscode.window.showQuickPick([
          { label: 'Selected folder only', description: 'Import PNG files directly inside this folder; subfolders remain untouched.', recursive: false },
          { label: 'Include subfolders', description: 'Import contained PNG files recursively in deterministic natural path order.', recursive: true }
        ], { title: 'Dropped PNG folder scope', placeHolder: 'Symbolic links and junctions inside the folder are never followed.' });
        if (!scope) { await postState(safeDraft(drafts.read(key) || recovered), 'Dropped folder intake cancelled; the Creator draft was unchanged.'); return; }
        const scan = scanPngFolder(records[0].canonicalPath, { recursive: scope.recursive });
        if (!scan.files.length) { await postState(safeDraft(drafts.read(key) || recovered), 'The dropped folder contains no PNG sources in the reviewed scope.'); return; }
        const retained = persistFolderSources(root, scan), current = safeDraft(drafts.read(key) || recovered); mergeCreatorSources(current, retained.additions);
        await postState(current, `Added ${retained.additions.length} PNG source(s) from the dropped folder in deterministic order. Immutable working copies were retained; no SFF was changed.`); return;
      }
      const formats = new Set(records.map(record => record.format));
      if (formats.size === 1 && formats.has('png')) {
        const current = safeDraft(drafts.read(key) || recovered), additions = records.map(record => sourceFromFile(record.canonicalPath)); mergeCreatorSources(current, additions);
        await postState(current, `Added ${additions.length} dropped PNG source(s) to the retained Creator draft. No SFF was changed.`); return;
      }
      if (formats.size === 1 && formats.has('gif') && records.length === 1) { message.type = 'addGif'; message.droppedPath = records[0].canonicalPath; }
      else if (formats.size === 1 && formats.has('psd') && records.length === 1) { message.type = 'addPsd'; message.droppedPath = records[0].canonicalPath; }
      else if ([...formats].every(format => format === 'bmp' || format === 'pcx')) { message.type = 'prepareSources'; message.droppedPaths = records.map(record => record.canonicalPath); }
      else throw new Error('Drop PNG files together, one GIF, one PSD, or a BMP/PCX preparation batch so the correct reviewed adapter is unambiguous. No draft rows were added.');
    }
    if (message.type === 'addFiles' || message.type === 'addTrueColorFiles') {
      const trueColor = message.type === 'addTrueColorFiles';
      if (trueColor) configureTrueColorIntake(drafts.read(key) || recovered, (await writerPreference.settledSnapshot()).mode);
      const picked = await vscode.window.showOpenDialog({ title: trueColor ? 'Add True Color PNG sprite sources (RGB24 / RGBA32)' : 'Add PNG sprite sources', canSelectFiles: true, canSelectFolders: false, canSelectMany: true, filters: { 'PNG sprites': ['png'] } });
      if (!picked?.length) return;
      const current = trueColor ? configureTrueColorIntake(drafts.read(key) || recovered, (await writerPreference.settledSnapshot()).mode) : safeDraft(drafts.read(key) || recovered), additions = picked.map(uri => sourceFromFile(uri.fsPath)); if (trueColor && additions.some(source => source.bitDepth !== 8 || ![2, 6].includes(source.colorType))) throw new Error('True Color intake accepts only 8-bit RGB24 or RGBA32 PNG files. Indexed, grayscale, and 16-bit PNGs were not added; the draft and palette mode are unchanged.'); mergeCreatorSources(current, additions); await postState(current, trueColor ? `Added ${additions.length} PNG source(s). True Color is selected for this batch (SFF 2.1, complete RGB24/RGBA32 images); review the sources before building.` : `Added ${additions.length} PNG source(s).`); return;
    }
    if (message.type === 'addFolder') {
      const picked = await vscode.window.showOpenDialog({ title: 'Add PNG sprite folder', canSelectFiles: false, canSelectFolders: true, canSelectMany: false }); if (!picked?.[0]) return;
      const scope = await vscode.window.showQuickPick([
        { label: 'Selected folder only', description: 'Import PNG files directly inside this folder; subfolders remain untouched.', recursive: false },
        { label: 'Include subfolders', description: 'Import contained PNG files recursively in deterministic natural path order.', recursive: true }
      ], { title: 'PNG folder scope', placeHolder: 'Symbolic links and junctions inside the folder are never followed.' });
      if (!scope) return;
      const scan = scanPngFolder(picked[0].fsPath, { recursive: scope.recursive });
      if (!scan.files.length) { await postState(safeDraft(drafts.read(key) || recovered), `No PNG sources were found in ${scope.recursive ? 'the selected folder or its contained subfolders' : 'the selected folder'}.`); return; }
      const retained = persistFolderSources(root, scan), current = safeDraft(drafts.read(key) || recovered);
      mergeCreatorSources(current, retained.additions);
      const skipped = scan.skippedSymlinks.length ? ` ${scan.skippedSymlinks.length} symbolic link or junction entr${scan.skippedSymlinks.length === 1 ? 'y was' : 'ies were'} skipped.` : '';
      const subfolders = !scan.recursive && scan.skippedSubfolders.length ? ` ${scan.skippedSubfolders.length} subfolder${scan.skippedSubfolders.length === 1 ? ' was' : 's were'} outside the selected scope.` : '';
      await postState(current, `Added ${retained.additions.length} PNG source(s) in deterministic natural path order. Immutable working copies were retained for restart recovery.${skipped}${subfolders}`); return;
    }
    if (message.type === 'relinkSource') {
      const current = safeDraft(message.draft), source = current.sources.find(item => item.id === String(message.sourceId || ''));
      if (!source) throw new Error('The marked Creator source no longer exists.');
      if (!source.stale) { await postState(current, `${source.name} is already available and still matches its reviewed bytes.`); return; }
      const picked = await vscode.window.showOpenDialog({ title: `Relink exact reviewed source · ${source.name}`, canSelectFiles: true, canSelectFolders: false, canSelectMany: false, filters: { 'Exact reviewed PNG': ['png'] }, openLabel: 'Relink Exact Source' });
      if (!picked?.[0]) { await postState(current, 'Source relink cancelled; the unavailable row and its overrides were retained.'); return; }
      const relinked = relinkCreatorSource(root, current, source.id, picked[0].fsPath);
      await postState(relinked.draft, `Relinked ${source.name} from exact reviewed bytes and retained its identity, ownership, destination, axis, crop, palette, and duplicate-data choices.`); return;
    }
    if (message.type === 'importSprMake2Manifest') {
      const picked = await vscode.window.showOpenDialog({ title: 'Import a portable SprMake2 CSV manifest or DEF package into Creator', canSelectFiles: true, canSelectFolders: false, canSelectMany: false, filters: { 'Portable SprMake2 recipe': ['csv', 'def'] } });
      if (!picked?.[0]) return;
      const imported = importSprMake2Recipe(drafts.read(key) || recovered, picked[0].fsPath), paletteSummary = imported.importedPaletteCount ? ` Imported ${imported.importedPaletteCount} stored palette table(s)${imported.ignoredPaletteRows ? `, including ${imported.ignoredPaletteRows} currently unused table(s)` : ''}; per-row assignments remain explicit.` : (imported.ignoredPaletteRows ? ` ${imported.ignoredPaletteRows} unused [Pal] row(s) were not required.` : '');
      await postState(imported.draft, `Imported ${imported.importedCount} reviewed sprite row(s) from SprMake2 ${imported.recipeKind} ${imported.recipe}. Source hashes, physical order, identities, axes, crop and duplicate settings remain in Creator review.${paletteSummary}`); return;
    }
    if (message.type === 'addSheet') {
      const picked = await vscode.window.showOpenDialog({ title: 'Choose an indexed PNG sprite sheet', canSelectFiles: true, canSelectFolders: false, canSelectMany: false, filters: { 'Indexed PNG sprite sheet': ['png'] } });
      if (!picked?.[0]) return;
      const filename = picked[0].fsPath, buffer = fs.readFileSync(filename), info = pngInfo(filename), sourceHash = sheetSha256(buffer);
      const currentBeforeReview = safeDraft(drafts.read(key) || recovered), prior = listStoredSessions(fs, root, { sourceHash }).filter(item => !item.invalid);
      let reviewed = null, resumedAttempt = false;
      if (prior.length) {
        const choice = await vscode.window.showQuickPick([
          ...prior.map(item => ({ label: `Resume ${item.state.cursor} / ${item.frameCount}`, description: `${item.state.phase.replace(/-/g, ' ')} · revision ${item.revision} · ${item.updatedAt}`, sessionId: item.sessionId })),
          { label: 'Start a New Sheet Review', description: 'Keep earlier sessions and review different grid settings.', sessionId: '' }
        ], { title: 'A saved review exists for these exact sprite-sheet bytes' });
        if (!choice) return;
        if (choice.sessionId) { resumedAttempt = true; reviewed = await resumeSpriteSheet(root, choice.sessionId); }
      }
      if (!reviewed && !resumedAttempt) {
        const setupMode = await vscode.window.showQuickPick([
          { label: 'Analyze Empty Gutters, Then Review', description: 'Choose the background rule explicitly; IKEMaker reports empty rows/columns and may prefill a regular tight grid.', mode: 'gutter' },
          { label: 'Enter Exact Grid', description: 'Enter cell geometry directly without analyzing pixels.', mode: 'grid' }
        ], { title: 'How should this sprite sheet be divided?' });
        if (!setupMode) return;
        let analysis = null, suggested = null, componentRule = null;
        if (setupMode.mode === 'gutter') {
          const background = await vscode.window.showQuickPick([
            { label: 'Transparent Palette Entries', description: 'Pixels whose palette alpha is zero are background.', mode: 'alpha' },
            { label: 'One Exact Palette Index…', description: 'Every pixel using the selected index is background, regardless of its displayed color.', mode: 'palette-index' }
          ], { title: 'Choose the sprite-sheet background rule' });
          if (!background) return;
          let backgroundIndex;
          if (background.mode === 'palette-index') {
            const value = await vscode.window.showInputBox({ title: 'Background palette index', value: '0', prompt: 'Enter the exact indexed-color slot to treat as background (0–255).', validateInput: text => /^\d+$/.test(String(text)) && Number(text) <= 255 ? undefined : 'Enter a whole number from 0 to 255.' });
            if (value === undefined) return; backgroundIndex = Number(value);
          }
          const noiseText = await vscode.window.showInputBox({ title: 'Maximum noise per empty line', value: '0', prompt: 'Zero is exact. A higher value treats a row or column with this many foreground pixels as a possible gutter, but reports the ignored pixels.', validateInput: text => /^\d+$/.test(String(text)) && Number(text) <= 10000 ? undefined : 'Enter a whole number from 0 to 10000.' });
          if (noiseText === undefined) return;
          componentRule = { mode: background.mode, backgroundIndex };
          analysis = analyzeIndexedGutters(buffer, { ...componentRule, maxNoisePerLine: Number(noiseText) }); suggested = analysis.suggestedGrid;
          const ranges = values => values.length ? values.slice(0, 12).map(run => run.start === run.end ? String(run.start) : `${run.start}–${run.end}`).join(', ') + (values.length > 12 ? ', …' : '') : 'none';
          const detail = `Empty column ranges: ${ranges(analysis.emptyColumns)}\nEmpty row ranges: ${ranges(analysis.emptyRows)}\nIgnored foreground pixels under the reviewed noise rule: ${analysis.ignoredForegroundPixels}.\n\n${suggested ? `Regular tight-run suggestion: ${suggested.columns}×${suggested.rows}, ${suggested.cellWidth}×${suggested.cellHeight} cells, offset ${suggested.offsetX},${suggested.offsetY}, gap ${suggested.gapX},${suggested.gapY}. Transparent padding outside each occupied run is not included.` : 'The occupied runs are irregular, so IKEMaker will not invent a grid. Enter the exact reviewed geometry next.'}`;
          const proceed = await vscode.window.showInformationMessage('Gutter analysis is ready for review.', { modal: true, detail }, 'Review Grid Values');
          if (proceed !== 'Review Grid Values') return;
        }
        const cellText = await vscode.window.showInputBox({ title: 'Sprite-sheet cell size', value: suggested ? `${suggested.cellWidth},${suggested.cellHeight}` : undefined, prompt: `Sheet: ${info.width}×${info.height}. Enter width,height for each exact rectangular cell.`, placeHolder: 'cell width, cell height', validateInput: value => { const parts = String(value).split(',').map(item => Number(item.trim())); return parts.length === 2 && parts.every(item => Number.isSafeInteger(item) && item > 0) ? undefined : 'Enter two positive whole numbers separated by a comma.'; } });
        if (cellText === undefined) return;
        const layoutText = await vscode.window.showInputBox({ title: 'Sprite-sheet spacing', value: suggested ? `${suggested.offsetX},${suggested.offsetY},${suggested.gapX},${suggested.gapY}` : '0,0,0,0', prompt: 'Enter left offset, top offset, horizontal gap, vertical gap. Unused sheet edges will be reported.', validateInput: value => { const parts = String(value).split(',').map(item => Number(item.trim())); return parts.length === 4 && parts.every(item => Number.isSafeInteger(item) && item >= 0) ? undefined : 'Enter four zero-or-positive whole numbers separated by commas.'; } });
        if (layoutText === undefined) return;
        const [cellWidth, cellHeight] = cellText.split(',').map(item => Number(item.trim())), [offsetX, offsetY, gapX, gapY] = layoutText.split(',').map(item => Number(item.trim()));
        const availableColumns = Math.floor((info.width - offsetX + gapX) / (cellWidth + gapX)), availableRows = Math.floor((info.height - offsetY + gapY) / (cellHeight + gapY));
        const countText = await vscode.window.showInputBox({ title: 'Sprite-sheet grid size', value: suggested ? `${suggested.columns},${suggested.rows}` : `${availableColumns},${availableRows}`, prompt: `Enter columns,rows. The current geometry can fit at most ${availableColumns}×${availableRows}.`, validateInput: value => { const parts = String(value).split(',').map(item => Number(item.trim())); return parts.length === 2 && parts.every(item => Number.isSafeInteger(item) && item > 0) && parts[0] <= availableColumns && parts[1] <= availableRows ? undefined : `Enter positive columns,rows within ${availableColumns}×${availableRows}.`; } });
        if (countText === undefined) return;
        const orderChoice = await vscode.window.showQuickPick([
          { label: 'Row-major', description: 'Left to right, then the next row.', order: 'row-major' },
          { label: 'Snake', description: 'Alternate left-to-right and right-to-left on each row.', order: 'snake' },
          { label: 'Column-major', description: 'Top to bottom, then the next column.', order: 'column-major' },
          { label: 'Custom Cell Order…', description: 'List every row-major cell number in the exact slideshow order.', order: 'custom' }
        ], { title: 'Sprite-sheet frame order' });
        if (!orderChoice) return;
        const [columns, rows] = countText.split(',').map(item => Number(item.trim()));
        let customOrder = null;
        if (orderChoice.order === 'custom') {
          const total = columns * rows, value = await vscode.window.showInputBox({ title: 'Custom sprite-sheet cell order', value: Array.from({ length: total }, (_, index) => index + 1).join(','), prompt: `Cells are numbered 1–${total} in row-major order. List each number exactly once in the desired slideshow and Creator order.`, validateInput: text => { const values = String(text).split(',').map(item => Number(item.trim())); return values.length === total && values.every(item => Number.isSafeInteger(item) && item >= 1 && item <= total) && new Set(values).size === total ? undefined : `List every number from 1 through ${total} exactly once, separated by commas.`; } });
          if (value === undefined) return; customOrder = value.split(',').map(item => Number(item.trim()));
        }
        const proposal = gridProposal({ width: info.width, height: info.height, sourceHash }, { cellWidth, cellHeight, offsetX, offsetY, gapX, gapY, columns, rows, order: orderChoice.order, customOrder });
        const auditChoice = await vscode.window.showQuickPick([
          { label: 'Audit Silhouettes Against These Cuts', description: 'Report connected foreground that crosses cells, remains in gutters, or falls below a reviewed area threshold.', audit: true },
          { label: 'Continue Without Component Audit', description: 'Use the exact reviewed rectangles only.', audit: false }
        ], { title: 'Optional component safety audit' });
        if (!auditChoice) return;
        let componentAudit = null;
        if (auditChoice.audit) {
          if (!componentRule) {
            const background = await vscode.window.showQuickPick([
              { label: 'Transparent Palette Entries', description: 'Pixels whose palette alpha is zero are background.', mode: 'alpha' },
              { label: 'One Exact Palette Index…', description: 'Every pixel using the selected index is background.', mode: 'palette-index' }
            ], { title: 'Choose the component-audit background rule' });
            if (!background) return;
            let backgroundIndex;
            if (background.mode === 'palette-index') {
              const value = await vscode.window.showInputBox({ title: 'Background palette index', value: '0', validateInput: text => /^\d+$/.test(String(text)) && Number(text) <= 255 ? undefined : 'Enter a whole number from 0 to 255.' });
              if (value === undefined) return; backgroundIndex = Number(value);
            }
            componentRule = { mode: background.mode, backgroundIndex };
          }
          const connectivityChoice = await vscode.window.showQuickPick([{ label: '8-way connectivity', description: 'Diagonal pixels may belong to one silhouette.', value: 8 }, { label: '4-way connectivity', description: 'Only edge-touching pixels belong to one silhouette.', value: 4 }], { title: 'Connected-pixel rule' });
          if (!connectivityChoice) return;
          const minimumText = await vscode.window.showInputBox({ title: 'Small-component review threshold', value: '1', prompt: 'Components smaller than this many pixels are reported, never deleted.', validateInput: text => /^\d+$/.test(String(text)) && Number(text) >= 1 && Number(text) <= 1000000 ? undefined : 'Enter a whole number from 1 to 1,000,000.' });
          if (minimumText === undefined) return;
          componentAudit = analyzeIndexedComponents(buffer, { ...componentRule, connectivity: connectivityChoice.value, minimumArea: Number(minimumText), proposal });
          const problemComponents = componentAudit.components.filter(component => component.crossesCuts || component.unassignedPixels || component.belowMinimumArea);
          const examples = problemComponents.slice(0, 8).map(component => `${component.componentId}: ${component.area}px at ${component.bounds.x},${component.bounds.y} ${component.bounds.width}×${component.bounds.height}${component.crossesCuts ? `; crosses ${component.frameIds.length} cells` : ''}${component.unassignedPixels ? `; ${component.unassignedPixels}px outside cells` : ''}${component.belowMinimumArea ? '; below threshold' : ''}`).join('\n');
          const detail = `${componentAudit.components.length} connected component(s); ${componentAudit.crossingComponentCount} cross reviewed cuts; ${componentAudit.unassignedForegroundPixels} foreground pixel(s) lie outside cells; ${componentAudit.smallComponentCount} component(s) are below the review threshold.\n\nOne component is not assumed to be one frame, and small components are not discarded.${examples ? `\n\nReview examples:\n${examples}` : ''}`;
          const proceed = await vscode.window.showWarningMessage(problemComponents.length ? 'The component audit found cuts that deserve review.' : 'The component audit found no crossing, unassigned, or small-component warnings.', { modal: true, detail }, 'Continue to Frame Review');
          if (proceed !== 'Continue to Frame Review') return;
        }
        const warningText = proposal.warnings.length ? `\n\nReview notes:\n${proposal.warnings.map(item => `• ${item}`).join('\n')}` : '';
        const confirmation = await vscode.window.showWarningMessage(`Extract ${proposal.frames.length} exact sprite-sheet cell(s)?`, { modal: true, detail: `${proposal.settings.columns} columns × ${proposal.settings.rows} rows · ${cellWidth}×${cellHeight} cells · ${orderChoice.label}.${analysis ? `\n\nThe gutter analysis was suggestion-only and used ${analysis.rule.mode === 'alpha' ? 'transparent palette entries' : `palette index ${analysis.rule.backgroundIndex}`} as the explicit background rule.` : ''}\n\nEvery extracted frame keeps the exact 256-color table and source pixel indexes. The source sheet and active SFF remain unchanged.${warningText}` }, 'Extract Reviewed Grid');
        if (confirmation !== 'Extract Reviewed Grid') return;
        const extracted = extractIndexedGrid(buffer, proposal);
        reviewed = await reviewSpriteSheet({ projectRoot: root, sourceFilename: filename, sourceBuffer: buffer, proposal, extractedFrames: extracted, firstNumericGroup: currentBeforeReview.configuration.group, intakeEvidence: { sourceHash, gutterAnalysis: analysis ? { evidenceRule: analysis.rule, maxNoisePerLine: analysis.maxNoisePerLine, ignoredForegroundPixels: analysis.ignoredForegroundPixels, emptyRows: analysis.emptyRows, emptyColumns: analysis.emptyColumns, suggestedGrid: analysis.suggestedGrid } : null, componentAudit } });
      }
      if (!reviewed) { await postState(currentBeforeReview, 'Sprite-sheet review was saved without changing the Creator draft.'); return; }
      const current = safeDraft(drafts.read(key) || recovered), byId = new Map(current.sources.map(item => [item.id, item])), frameById = new Map(reviewed.frames.map(item => [item.frameId, item]));
      reviewed.handoff.forEach(handoff => {
        const frame = frameById.get(handoff.frameId);
        if (!frame) throw new Error(`Reviewed sprite-sheet frame ${handoff.frameId} has no retained extracted snapshot.`);
        const sourceIdentity = `sprite-sheet:${sourceHash}:${frame.frameId}`;
        const item = sourceFromFile(frame.filename, { sourceIdentity, label: `${path.basename(filename, path.extname(filename))} · frame ${handoff.outputOrder + 1}`, provenance: { kind: 'sprite-sheet-grid-frame', sourceIdentity, sourceFile: filename, sourceByteHash: sourceHash, sourceRectangle: handoff.sourceRectangle, sourceOrdinal: handoff.outputOrder, extractionMethod: handoff.extractionMethod, extractedByteHash: frame.byteHash, decodedPixelHash: frame.decodedHash, paletteHash: frame.paletteHash, review: 'explicit-grid-confirmed' } });
        item.provenance.sheetSessionId = reviewed.session.sessionId; item.provenance.sheetRevision = reviewed.session.revision; item.provenance.sheetJournalHead = handoff.journalHead; item.provenance.logicalGroup = handoff.logicalGroup; item.provenance.numericGroupSuggestion = handoff.numericGroupSuggestion; item.provenance.componentAuditEvidenceHash = handoff.componentAuditEvidenceHash; item.provenance.componentIds = handoff.componentIds;
        current.configuration.overrides[item.id] = { ...(current.configuration.overrides[item.id] || {}), group: handoff.numericGroupSuggestion, ...(handoff.axisSuggestion ? { axisX: handoff.axisSuggestion.axisX, axisY: handoff.axisSuggestion.axisY } : {}) };
        byId.set(item.id, item);
      });
      mergeCreatorSources(current, [...byId.values()]); current.configuration.numberingMode = 'consecutive';
      await postState(current, `Added ${reviewed.handoff.length} included sprite-sheet frame(s)${reviewed.frames.length === reviewed.handoff.length ? '' : `; ${reviewed.frames.length - reviewed.handoff.length} reviewed cell(s) stayed excluded`}. Exact cuts, logical groups, journal, and source hashes are retained; final identities, palettes, and axes remain in Creator review.`); return;
    }
    if (message.type === 'prepareSources') {
      const picked = message.droppedPaths?.length ? message.droppedPaths.map(filename => vscode.Uri.file(filename)) : await vscode.window.showOpenDialog({ title: 'Choose PNG, BMP, or PCX sources to prepare and batch rename', canSelectFiles: true, canSelectFolders: false, canSelectMany: true, filters: { 'Sprite images': ['png', 'bmp', 'pcx'] } });
      if (!picked?.length) return;
      let ordering = 'selected';
      if (picked.length > 1) {
        const choice = await vscode.window.showQuickPick([
          { label: 'Keep selected order', description: 'Preserve the exact order returned by the file picker.', mode: 'selected' },
          { label: 'Natural filename order', description: 'Sort numeric runs naturally, such as frame 2 before frame 10.', mode: 'natural' }
        ], { title: 'Prepared sprite order', placeHolder: 'The final old-to-new map is shown before any files are written.' });
        if (!choice) return; ordering = choice.mode;
      }
      const ordered = orderedSources(picked.map(uri => uri.fsPath), ordering);
      const prefix = await vscode.window.showInputBox({ title: 'Prepared sprite filename prefix', value: path.basename(ordered[0], path.extname(ordered[0])).replace(/\d+$/, '').replace(/[_\s-]+$/, '') || 'sprite', validateInput: value => { try { safePrefix(value); return undefined; } catch (error) { return error.message; } } });
      if (prefix === undefined) return;
      const startText = await vscode.window.showInputBox({ title: 'First prepared filename number', value: '0', validateInput: value => /^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) ? undefined : 'Enter a safe zero or positive whole number.' });
      if (startText === undefined) return;
      const paddingText = await vscode.window.showInputBox({ title: 'Filename number padding', prompt: 'Number of digits in the prepared sequence (1–12).', value: '4', validateInput: value => /^\d+$/.test(String(value)) && Number(value) >= 1 && Number(value) <= 12 ? undefined : 'Enter a whole number from 1 through 12.' });
      if (paddingText === undefined) return;
      const destination = await vscode.window.showOpenDialog({ title: 'Choose a folder for renamed PNG copies', canSelectFiles: false, canSelectFolders: true, canSelectMany: false });
      if (!destination?.[0]) return;
      const plan = planPreparedSources(ordered, { prefix, start: Number(startText), padding: Number(paddingText) });
      const collisions = plan.filter(item => fs.existsSync(path.join(destination[0].fsPath, item.outputName)));
      if (collisions.length) throw new Error(`${collisions.length} prepared filename(s) already exist, beginning with ${collisions[0].outputName}. Choose another prefix, number, or folder.`);
      const shown = plan.slice(0, 80).map(item => `${item.sourceName}  →  ${item.outputName}${item.conversion === 'copy-png' ? '' : `  (${item.sourceExtension.slice(1).toUpperCase()} → PNG)`}`), hidden = plan.length - shown.length;
      const confirmation = await vscode.window.showWarningMessage(`Prepare ${plan.length} renamed PNG cop${plan.length === 1 ? 'y' : 'ies'}?`, { modal: true, detail: `${shown.join('\n')}${hidden > 0 ? `\n…and ${hidden} more` : ''}\n\nDestination: ${destination[0].fsPath}\nOriginal files will not be renamed, replaced, or deleted.` }, 'Prepare and Add');
      if (confirmation !== 'Prepare and Add') return;
      const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-sff-source-prep-'));
      let prepared;
      const imageMagick = vscode.workspace.getConfiguration('ikemenZss').get('imageMagickPath', 'magick');
      try { prepared = prepareSourceBuffers(plan, temporaryDirectory, imageMagick); }
      finally { fs.rmSync(temporaryDirectory, { recursive: true, force: true }); }
      const writes = prepared.map(item => [path.join(destination[0].fsPath, item.outputName), item.buffer]);
      transactionalWriteSet(fs, writes, { label: 'sff-creator-prepare-sources', allowExisting: false, backup: false, journal: false });
      const current = safeDraft(drafts.read(key) || recovered);
      mergeCreatorSources(current, prepared.map(item => { const filename = path.join(destination[0].fsPath, item.outputName), sourceIdentity = `prepared:${item.source}:${item.outputName}`; return sourceFromFile(filename, { sourceIdentity, provenance: { kind: 'prepared-image-copy', sourceIdentity, sourceFile: item.source, sourceName: item.sourceName, sourceByteHash: item.sourceByteHash, outputByteHash: item.outputByteHash, conversion: item.conversion, converter: item.converter, outputNumber: item.outputNumber, outputFormat: { width: item.width, height: item.height, bitDepth: item.bitDepth, colorType: item.colorType, indexed: item.indexed } } }); }));
      current.configuration.numberingMode = 'consecutive'; await postState(current, `Prepared and added ${prepared.length} renamed PNG copies. Original files were unchanged.`); return;
    }
    if (message.type === 'addGif') {
      const picked = message.droppedPath ? [vscode.Uri.file(message.droppedPath)] : await vscode.window.showOpenDialog({ title: 'Add an animated GIF as sequential SFF sprites', canSelectFiles: true, canSelectFolders: false, canSelectMany: false, filters: { 'Animated GIF': ['gif'] } });
      if (!picked?.[0]) return;
      const purpose = await vscode.window.showQuickPick([
        { label: 'Add frames to the SFF plan', description: 'Extract every frame and keep GIF timing only as provenance.', mode: 'sff' },
        { label: 'Add frames + review AIR timing', description: 'Add the sprites, then open the existing tick-aware GIF → AIR review.', mode: 'sff-air' },
        { label: 'Export PNG sequence only', description: 'Extract ordered PNG files and a provenance manifest without changing the SFF draft.', mode: 'export' }
      ], { title: 'How should this GIF be used?', placeHolder: 'The GIF is never modified.' });
      if (!purpose) return;
      const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-sff-gif-')), ffmpeg = vscode.workspace.getConfiguration('ikemenZss').get('ffmpegPath', 'ffmpeg');
      const sequence = extractGifSequence(picked[0].fsPath, folder, ffmpeg);
      if (purpose.mode === 'export') {
        await exportFrameSequence(sequence.frames, { kind: 'animated-gif', path: sequence.source, sha256: sequence.sourceByteHash }, path.basename(sequence.source, path.extname(sequence.source)), 'GIF');
        return;
      }
      const retainedFrames = persistCreatorFrames(root, sequence.frames, sequence.sourceByteHash, 'gif'), current = safeDraft(drafts.read(key) || recovered), byId = new Map(current.sources.map(item => [item.id, item])), gifSourceIds = [];
      retainedFrames.forEach(frame => {
        const sourceIdentity = `gif:${sequence.sourceByteHash}:${frame.ordinal}`;
        const item = sourceFromFile(frame.filename, { sourceIdentity, label: `${path.basename(sequence.source, path.extname(sequence.source))} · frame ${frame.ordinal + 1}`, provenance: { kind: 'animated-gif-frame', sourceIdentity, sourceFile: sequence.source, sourceByteHash: sequence.sourceByteHash, sourceOrdinal: frame.ordinal, sourceFrameCount: sequence.frameCount, delayMs: frame.delayMs } });
        gifSourceIds.push(item.id);
        byId.set(item.id, item);
      });
      mergeCreatorSources(current, [...byId.values()]); current.configuration.numberingMode = 'consecutive';
      const timing = sequence.delaysMs.length >= sequence.frameCount ? ' GIF delays retained as provenance only.' : ' Frame timing was unavailable; assign AIR timing separately.';
      await postState(current, `Added ${sequence.frameCount} GIF frames as sequential sprite sources.${timing}`);
      if (purpose.mode === 'sff-air') {
        const plan = draftToPlan(current), bySourceId = new Map(plan.ready.map(row => [row.source.id, row])), rows = gifSourceIds.map(id => bySourceId.get(id));
        if (rows.some(row => !row)) {
          await vscode.window.showWarningMessage('The GIF frames were added, but AIR timing review cannot start until every GIF frame has a conflict-free SFF identity. Resolve the highlighted Creator rows, then use GIF → AIR from the AIR workspace.');
          return;
        }
        await vscode.commands.executeCommand('air.importGifTimingHandoff', { gifPath: sequence.source, frameCount: sequence.frameCount, delaysMs: sequence.delaysMs, spriteRefs: rows.map(row => ({ group: row.group, index: row.number })), suggestedAction: rows[0].group });
      }
      return;
    }
    if (message.type === 'rebuildPsdArchive') {
      const current = safeDraft(drafts.read(key) || recovered);
      if (!current.target?.path) throw new Error('Attach the current SFF before reconstructing it from PSD files. The archive supplies the fallback identities, axes, and palette snapshots.');
      if (current.sources.length || current.deletedSpriteIdentities.length || current.replaceSpriteIdentities.length) throw new Error('Finish or discard the current Creator draft before starting a whole-archive PSD reconstruction.');
      const folderPick = await vscode.window.showOpenDialog({ title: 'Choose the flat folder of PSD sprite sources', canSelectFiles: false, canSelectFolders: true, canSelectMany: false });
      if (!folderPick?.[0]) return;
      const manifestPick = await vscode.window.showOpenDialog({ title: 'Choose the approved sprite mapping manifest', canSelectFiles: true, canSelectFolders: false, canSelectMany: false, filters: { 'Approved CSV manifest': ['csv'] } });
      if (!manifestPick?.[0]) return;
      const psdFiles = scanPsdFolder(folderPick[0].fsPath, { maximumFiles: Math.floor(MAX_SOURCES / 2) }), manifestBytes = fs.readFileSync(manifestPick[0].fsPath), manifestHash = crypto.createHash('sha256').update(manifestBytes).digest('hex').toUpperCase(), manifestRows = parseCsv(manifestBytes.toString('utf8')), manifestIndex = createManifestIndex(manifestRows);
      if (psdFiles.length * 2 > MAX_SOURCES) throw new Error(`Body plus Layer 1 would create ${psdFiles.length * 2} sources, above Creator's ${MAX_SOURCES}-source limit.`);
      const indexingPaletteId = String(current.configuration.masterPaletteId || ''), displayPaletteId = String(current.addedSpritePaletteId || '');
      if (!/^\d+,\d+$/.test(indexingPaletteId)) throw new Error('Choose the indexing/master palette in Target Archive before PSD reconstruction.');
      if (!/^\d+,\d+$/.test(displayPaletteId)) throw new Error('Choose the embedded display palette in Target Archive before PSD reconstruction.');
      const targetArchive = readSff(current.target.path), archiveHash = crypto.createHash('sha256').update(targetArchive.buffer).digest('hex').toUpperCase();
      if (archiveHash.toLowerCase() !== String(current.target.expectedFingerprint || '').toLowerCase()) throw new Error('The target SFF changed before PSD reconstruction. Attach it again; nothing was staged.');
      const [indexingGroup, indexingNumber] = indexingPaletteId.split(',').map(Number), [displayGroup, displayNumber] = displayPaletteId.split(',').map(Number), indexingRows = targetArchive.palettes.filter(palette => palette.group === indexingGroup && palette.number === indexingNumber), displayRows = targetArchive.palettes.filter(palette => palette.group === displayGroup && palette.number === displayNumber);
      if (indexingRows.length !== 1 || displayRows.length !== 1) throw new Error('The selected indexing/master and display palettes must each resolve to exactly one embedded palette.');
      const indexingColors = paletteRgba(targetArchive, indexingRows[0].index), displayColors = paletteRgba(targetArchive, displayRows[0].index);
      if (indexingColors.length !== 256 || displayColors.length !== 256 || indexingColors[0][3] !== 0 || displayColors[0][3] !== 0) throw new Error('The indexing/master and display palettes must each contain 256 colors with transparent index 0.');
      const protectedMaster = readMasterSnapshot(masterLocation(current.target.path, root));
      if (!protectedMaster) throw new Error(`Protect embedded palette ${indexingPaletteId} as the indexing master in Target Archive before reconstruction.`);
      if (`${protectedMaster.palette.group},${protectedMaster.palette.number}` !== indexingPaletteId || protectedMaster.palette.fingerprint !== paletteFingerprint(indexingColors)) throw new Error(`The selected indexing palette ${indexingPaletteId} does not match this SFF's protected master record. Select the protected palette or create an intentional master revision first.`);
      const indexingPaletteHash = crypto.createHash('sha256').update(JSON.stringify(indexingColors)).digest('hex'), displayPaletteHash = crypto.createHash('sha256').update(JSON.stringify(displayColors)).digest('hex');
      const confirmation = await vscode.window.showWarningMessage(`Stage ${psdFiles.length} PSD body sprites and eligible separate Layer 1 sprites?`, { modal: true, detail: `Body uses the approved manifest first, then unique exact decoded-index matches in ${current.target.name}. Active base groups below 10000 receive Layer 1 at base group +10000 with the same index and axis; archive-bank groups remain body-only. Both pages stay on the full PSD canvas with no crop. Pixels are indexed by ${indexingPaletteId} and rendered through ${displayPaletteId}. Nothing will replace the SFF until the ordinary dual-writer validation and final confirmation.` }, 'Stage PSD Reconstruction');
      if (confirmation !== 'Stage PSD Reconstruction') return;
      const archiveIndex = createArchiveIndex(targetArchive), cacheRoot = path.join(root, '.ikemen-tools', 'sff-creator', 'sources', current.target.fingerprint.toLowerCase(), `psd-reconstruction-${manifestHash.slice(0, 16).toLowerCase()}`), writes = [], staged = [], blocked = [], outputIdentities = new Set();
      const targetIdentityCounts = new Map(); for (const identity of current.target.identities || []) targetIdentityCounts.set(identity, (targetIdentityCounts.get(identity) || 0) + 1);
      const imageMagick = vscode.workspace.getConfiguration('ikemenZss').get('imageMagickPath', 'magick');
      await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Preparing ${psdFiles.length} PSD body/beard pairs`, cancellable: false }, async progress => {
        for (const [ordinal, psdFilename] of psdFiles.entries()) {
          const psdBytes = fs.readFileSync(psdFilename), psdHash = crypto.createHash('sha256').update(psdBytes).digest('hex').toUpperCase(), temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-psd-reconstruct-'));
          try {
            const inspection = inspectPsd(psdFilename, imageMagick), exportPlan = planPsdExports(inspection.records, 'base-and-optional-layer1'), bodyPlan = exportPlan.exports.find(item => item.role === 'base'), layerPlan = exportPlan.exports.find(item => item.role === 'layer-1');
            if (!bodyPlan || bodyPlan.pages.length !== 1 || (layerPlan && layerPlan.pages.length !== 1)) throw new Error('body and optional Layer 1 did not remain isolated');
            const bodyExport = exportPsdPlan(inspection, { ...exportPlan, exports: [bodyPlan] }, temporary)[0];
            let layerExport = null, layerExportFailure = null;
            if (layerPlan) {
              try { layerExport = exportPsdPlan(inspection, { ...exportPlan, exports: [layerPlan] }, temporary)[0]; }
              catch (error) { layerExportFailure = error.message; }
            }
            const bodyRemap = remapReconstructionPage(fs.readFileSync(bodyExport.filename), indexingColors, { paletteId: indexingPaletteId, pageLabel: 'PSD body' });
            const visible = bytes => [...readIndexedPng8(bytes).indices].some(index => indexingColors[index][3] !== 0);
            const mapping = resolvePsdBaseMapping(psdFilename, bodyRemap.buffer, manifestIndex, archiveIndex);
            if (mapping.status !== 'resolved') throw new Error(mapping.reason);
            const bodyExact = bodyRemap.visuallyLossless && !bodyRemap.transparentChanged && visible(bodyRemap.buffer), preserveBody = !bodyExact && mapping.replacesActive;
            if (!bodyExact && !preserveBody) throw new Error(`indexing palette ${indexingPaletteId} cannot exactly represent a new body sprite (${bodyRemap.visibleChangedPixels} changed, ${bodyRemap.transparentChanged} transparency changes)`);
            const proposedLayer = Number(mapping.group) < 10000 && layerExport ? layerOneMapping(mapping) : null, proposedLayerRemap = proposedLayer ? remapReconstructionPage(fs.readFileSync(layerExport.filename), indexingColors, { paletteId: indexingPaletteId, pageLabel: 'PSD Layer 1' }) : null, layerExact = Boolean(proposedLayer && proposedLayerRemap.visuallyLossless && !proposedLayerRemap.transparentChanged && visible(proposedLayerRemap.buffer)), layer = layerExact ? proposedLayer : null, layerRemap = layerExact ? proposedLayerRemap : null, baseIdentity = `${mapping.group},${mapping.number}`, layerIdentity = layer ? `${layer.group},${layer.number}` : null;
            if (outputIdentities.has(baseIdentity) || (layerIdentity && outputIdentities.has(layerIdentity))) throw new Error(`duplicate reconstruction identity ${outputIdentities.has(baseIdentity) ? baseIdentity : layerIdentity}`);
            if (layerIdentity && (targetIdentityCounts.get(layerIdentity) || 0) > 1) throw new Error(`Layer 1 destination ${layerIdentity} occurs more than once in the current SFF and is ambiguous.`);
            outputIdentities.add(baseIdentity); if (layerIdentity) outputIdentities.add(layerIdentity);
            const safeStem = safeLabel(path.basename(psdFilename, path.extname(psdFilename)), `psd_${ordinal}`), bodyTarget = path.join(cacheRoot, `${safeStem}.${psdHash.slice(0, 12)}.body.png`), layerTarget = path.join(cacheRoot, `${safeStem}.${psdHash.slice(0, 12)}.layer1.png`);
            for (const [target, bytes] of [...(!preserveBody ? [[bodyTarget, bodyRemap.buffer]] : []), ...(layer ? [[layerTarget, layerRemap.buffer]] : [])]) {
              if (fs.existsSync(target)) {
                if (!fs.readFileSync(target).equals(bytes)) throw new Error(`immutable Creator cache collision at ${path.basename(target)}`);
              } else writes.push([target, bytes]);
            }
            const activeBody = preserveBody ? targetArchive.sprites.find(sprite => sprite.group === mapping.group && sprite.number === mapping.number) : null;
            staged.push({ ordinal, psdFilename, psdHash, mapping, preserveBody, bodyReview: bodyExact ? null : { reason: 'indexing-palette-review-required', visibleChangedPixels: bodyRemap.visibleChangedPixels, transparentChanged: bodyRemap.transparentChanged, maximumDistance: bodyRemap.maximumDistance, preservedPhysicalIndex: activeBody?.index ?? null, preservedPngHash: activeBody ? crypto.createHash('sha256').update(spritePng(targetArchive, activeBody, null, true)).digest('hex').toUpperCase() : null }, layer, layerReplacesActive: Boolean(layerIdentity && targetIdentityCounts.get(layerIdentity) === 1), noLayerReason: layer ? null : Number(mapping.group) >= 10000 ? 'archive-bank-base' : layerExportFailure ? 'layer-extraction-failed' : !layerExport ? 'no-separate-layer-page' : 'layer-palette-review-required', layerReview: layerExportFailure ? { reason: 'layer-extraction-failed', error: layerExportFailure } : proposedLayer && !layerExact ? { reason: 'indexing-palette-review-required', visibleChangedPixels: proposedLayerRemap.visibleChangedPixels, transparentChanged: proposedLayerRemap.transparentChanged, maximumDistance: proposedLayerRemap.maximumDistance } : null, baseIdentity, layerIdentity, bodyTarget: preserveBody ? null : bodyTarget, layerTarget: layer ? layerTarget : null, bodyPage: bodyExport.pages[0], layerPage: layer ? layerExport.pages[0] : null, bodyPngHash: crypto.createHash('sha256').update(bodyRemap.buffer).digest('hex').toUpperCase(), layerPngHash: layer ? crypto.createHash('sha256').update(layerRemap.buffer).digest('hex').toUpperCase() : null });
          } catch (error) { blocked.push({ psd: path.basename(psdFilename), error: error.message }); }
          finally { fs.rmSync(temporary, { recursive: true, force: true }); }
          progress.report({ increment: 100 / psdFiles.length, message: `${ordinal + 1} / ${psdFiles.length}` });
        }
      });
      const layerCount = staged.filter(item => item.layer).length, bodyReplacementCount = staged.filter(item => !item.preserveBody).length, preservedBodyReviewCount = staged.length - bodyReplacementCount, archivedWithoutLayer = staged.filter(item => item.noLayerReason === 'archive-bank-base').length, missingLayerSource = staged.filter(item => item.noLayerReason === 'no-separate-layer-page').length, layerExtractionFailureCount = staged.filter(item => item.noLayerReason === 'layer-extraction-failed').length, layerPaletteReviewCount = staged.filter(item => item.noLayerReason === 'layer-palette-review-required').length;
      const evidence = { schema: 'ikemaker.psd-archive-reconstruction', version: 1, createdAt: new Date().toISOString(), target: { path: current.target.path, sha256: archiveHash }, manifest: { path: manifestPick[0].fsPath, sha256: manifestHash }, sourceFolder: folderPick[0].fsPath, policies: { body: 'PSD body page isolated on full canvas; preserve the reviewed current-SFF body when exact master indexing is not proven', layer1: 'Only a strictly recognised Beard/Cosmetic 1 page or the next sequential numbered Layer after the body is eligible; base group +10000; same index and numeric axis; active base bank only', sparseLayers: 'active frames without a separate, extractable, or exactly indexable Layer 1 page remain body-only and are reported', archivedAssets: 'base replacement only because groups 10000+ are outside the layer-bank source range', crop: 'none', indexingPalette: indexingPaletteId, assignedPalette: displayPaletteId }, palettes: { indexing: { id: indexingPaletteId, colorHash: indexingPaletteHash, protectedFingerprint: protectedMaster.palette.fingerprint }, assigned: { id: displayPaletteId, colorHash: displayPaletteHash } }, counts: { psd: psdFiles.length, resolved: staged.length, bodyReplacements: bodyReplacementCount, preservedBodiesNeedingPaletteReview: preservedBodyReviewCount, layer1: layerCount, archivedWithoutLayer, missingLayerSource, layerExtractionFailures: layerExtractionFailureCount, layerPaletteReviewRequired: layerPaletteReviewCount, blocked: blocked.length }, blocked, entries: staged.map(item => ({ psd: path.basename(item.psdFilename), psdHash: item.psdHash, mappingBasis: item.mapping.basis, body: { identity: item.baseIdentity, axis: [item.mapping.axisX, item.mapping.axisY], page: item.bodyPage, proposedPngHash: item.bodyPngHash, action: item.preserveBody ? 'preserve-current-sff' : 'replace-from-psd', review: item.bodyReview }, layer1: item.layer ? { identity: item.layerIdentity, axis: [item.layer.axisX, item.layer.axisY], page: item.layerPage, pngHash: item.layerPngHash, action: item.layerReplacesActive ? 'replace-current-sff' : 'add' } : null, noLayerReason: item.noLayerReason, layerReview: item.layerReview })) };
      const evidenceText = `${JSON.stringify(evidence, null, 2)}\n`, evidenceHash = crypto.createHash('sha256').update(evidenceText).digest('hex'), evidencePath = path.join(root, '.ikemen-tools', 'sff-creator', 'psd-reconstruction-reports', `psd-reconstruction.${evidenceHash.slice(0, 16)}.${blocked.length ? 'blocked' : 'reviewed'}.json`);
      if (!fs.existsSync(evidencePath)) transactionalWrite(fs, evidencePath, evidenceText, { label: 'sff-psd-reconstruction-evidence', allowExisting: false, backup: false, journal: false });
      if (blocked.length) throw new Error(`PSD reconstruction blocked ${blocked.length} file(s); no Creator sources were staged. First: ${blocked[0].psd} — ${blocked[0].error}. Review list: ${evidencePath}`);
      if (writes.length) transactionalWriteSet(fs, writes, { label: 'sff-psd-reconstruction-source-cache', allowExisting: false, backup: false, journal: false });
      const next = safeDraft(current); next.configuration.paletteMode = 'target'; next.configuration.masterPaletteId = indexingPaletteId; next.addedSpritePaletteId = displayPaletteId; next.configuration.cropMode = 'none'; next.configuration.duplicatePolicy = 'preserve-separate';
      for (const item of staged) {
        const common = { sourceFile: item.psdFilename, sourceByteHash: item.psdHash, manifest: manifestPick[0].fsPath, manifestHash, mappingBasis: item.mapping.basis, indexingPaletteId, indexingPaletteColorHash: indexingPaletteHash, assignedPaletteId: displayPaletteId, assignedPaletteColorHash: displayPaletteHash, crop: 'none', evidencePath };
        const bodyIdentity = item.preserveBody ? null : `psd-reconstruction:${item.psdHash}:page:${item.bodyPage.index}:body`, layerIdentity = item.layer ? `psd-reconstruction:${item.psdHash}:page:${item.layerPage.index}:layer1` : null;
        const body = item.preserveBody ? null : sourceFromFile(item.bodyTarget, { sourceIdentity: bodyIdentity, label: `${path.basename(item.psdFilename)} · body`, provenance: { kind: 'photoshop-psd-archive-reconstruction', creatorSourceIdentity: bodyIdentity, role: 'body', page: item.bodyPage, ...common } });
        const layer = item.layer ? sourceFromFile(item.layerTarget, { sourceIdentity: layerIdentity, label: `${path.basename(item.psdFilename)} · Layer 1`, provenance: { kind: 'photoshop-psd-archive-reconstruction', creatorSourceIdentity: layerIdentity, role: 'layer-1', page: item.layerPage, ...common } }) : null;
        if (body) next.sources.push(body); if (layer) next.sources.push(layer);
        if (body) next.configuration.overrides[body.id] = { group: item.mapping.group, number: item.mapping.number, axisX: item.mapping.axisX, axisY: item.mapping.axisY, cropMode: 'none', paletteId: displayPaletteId, indexingPaletteId, duplicatePolicy: 'preserve-separate' };
        if (layer) next.configuration.overrides[layer.id] = { group: item.layer.group, number: item.layer.number, axisX: item.layer.axisX, axisY: item.layer.axisY, cropMode: 'none', paletteId: displayPaletteId, indexingPaletteId, duplicatePolicy: 'preserve-separate' };
        if (body && item.mapping.replacesActive) next.replaceSpriteIdentities.push(item.baseIdentity);
        if (layer && item.layerReplacesActive) next.replaceSpriteIdentities.push(item.layerIdentity);
      }
      next.replaceSpriteIdentities = [...new Set(next.replaceSpriteIdentities)];
      await postState(next, `Staged ${bodyReplacementCount} exact PSD body replacements and ${layerCount} separate Layer 1 sprites${preservedBodyReviewCount ? `; ${preservedBodyReviewCount} current body sprite(s) were preserved pending palette review` : ''}${missingLayerSource ? `; ${missingLayerSource} active frame(s) have no recognised separate Layer 1 PSD page` : ''}${layerExtractionFailureCount ? `; ${layerExtractionFailureCount} Layer 1 page(s) could not be extracted and were omitted` : ''}${layerPaletteReviewCount ? `; ${layerPaletteReviewCount} Layer 1 page(s) need palette review and were omitted` : ''}${archivedWithoutLayer ? `; ${archivedWithoutLayer} archive-bank source(s) remain body-only` : ''}. Protected palette ${indexingPaletteId} indexes pixels; palette ${displayPaletteId} renders them. All unmatched archive entries remain preserved. Review report: ${evidencePath}`); return;
    }
    if (message.type === 'addPsd') {
      const picked = message.droppedPath ? [vscode.Uri.file(message.droppedPath)] : await vscode.window.showOpenDialog({ title: 'Add a Photoshop PSD as reviewed sprite sources', canSelectFiles: true, canSelectFolders: false, canSelectMany: false, filters: { 'Photoshop document': ['psd'] } });
      if (!picked?.[0]) return;
      const inspection = inspectPsd(picked[0].fsPath, vscode.workspace.getConfiguration('ikemenZss').get('imageMagickPath', 'magick')), analyzed = planPsdExports(inspection.records, 'composite');
      const choices = [
        { label: 'Flattened composite', description: 'One sprite exactly as the PSD composite appears.', mode: 'composite' },
        ...(inspection.records.length > 1 ? [
          { label: 'Base layer only', description: `One sprite from ${analyzed.base.name}.`, mode: 'base' },
          { label: 'Each authored layer', description: 'Sequential sprites on the original PSD canvas.', mode: 'layers' }
        ] : []),
        ...(analyzed.overlays.length ? [{ label: 'Base plus overlay variants', description: `Base plus ${analyzed.overlays.length} named overlay(s), including beard/FX-style layers.`, mode: 'base-with-overlays' }] : []),
        ...(analyzed.timeline.length ? [{ label: 'Named frame pages', description: `${analyzed.timeline.length} explicitly named frame page(s) in source order.`, mode: 'timeline' }] : []),
        { label: 'Photoshop animation timeline…', description: 'Open the PSD in your shared Photoshop editor, then import its rendered PNG image sequence in exact frame order.', mode: 'photoshop-timeline' }
      ];
      const choice = await vscode.window.showQuickPick(choices, { title: 'How should this PSD enter the SFF plan?', placeHolder: 'Exports are working snapshots; the PSD is never modified.' });
      if (!choice) return;
      const purpose = await vscode.window.showQuickPick([
        { label: 'Add extracted images to the SFF plan', description: 'Keep the reviewed PSD result as Creator sprite sources.', mode: 'sff' },
        { label: 'Export PNG sequence only', description: 'Write ordered PNG files and a provenance manifest without changing the SFF draft.', mode: 'export' }
      ], { title: `Use ${choice.label}`, placeHolder: 'The PSD is never modified.' });
      if (!purpose) return;
      const psdHash = crypto.createHash('sha256').update(fs.readFileSync(inspection.filename)).digest('hex');
      if (choice.mode === 'photoshop-timeline') {
        const selectedFolder = await vscode.window.showOpenDialog({ title: 'Choose where Photoshop should render the temporary PNG timeline sequence', canSelectFiles: false, canSelectFolders: true, canSelectMany: false });
        if (!selectedFolder?.[0]) return;
        const outputFolder = fs.mkdtempSync(path.join(selectedFolder[0].fsPath, `${safeLabel(path.basename(inspection.filename, path.extname(inspection.filename)), 'PSD')}_timeline_`));
        const configuration = vscode.workspace.getConfiguration('ikemenZss'), configuredEditor = String(configuration.get('imageEditorPath', '') || '').trim();
        let editor = configuredEditor;
        if (!editor || !fs.existsSync(editor) || !/photoshop/i.test(path.basename(editor))) {
          const pickedEditor = await vscode.window.showOpenDialog({ title: 'Choose Photoshop for PSD timeline rendering', canSelectFiles: true, canSelectFolders: false, canSelectMany: false, filters: { Applications: ['exe'] } });
          if (!pickedEditor?.[0]) return;
          editor = pickedEditor[0].fsPath;
          if (!/photoshop/i.test(path.basename(editor))) throw new Error('PSD timeline rendering requires Adobe Photoshop. Choose Photoshop.exe; the ordinary PSD layer modes remain available without it.');
          await configuration.update('imageEditorPath', editor, vscode.ConfigurationTarget.Global);
        }
        spawn(editor, [inspection.filename], { detached: true, stdio: 'ignore', windowsHide: false }).unref();
        const action = await vscode.window.showInformationMessage('Render the PSD timeline in Photoshop, then return to IKEMaker.', { modal: true, detail: `In Photoshop choose File → Export → Render Video. Choose Photoshop Image Sequence, PNG, All Frames, and export directly into:\n${outputFolder}\n\nKeep “Create New Subfolder” off. IKEMaker will natural-sort the rendered filenames and add them as sequential SFF indexes. The PSD remains unchanged.` }, 'Import Rendered PNG Frames');
        if (action !== 'Import Rendered PNG Frames') { await postState(safeDraft(drafts.read(key) || recovered), `Timeline handoff cancelled. The empty staging folder remains at ${outputFolder}.`); return; }
        const frames = collectTimelineSequence(outputFolder);
        if (purpose.mode === 'export') {
          await exportFrameSequence(frames, { kind: 'photoshop-timeline', path: inspection.filename, sha256: psdHash, mode: choice.mode }, path.basename(inspection.filename, path.extname(inspection.filename)), 'Photoshop timeline');
          return;
        }
        const retainedFrames = persistCreatorFrames(root, frames, psdHash, 'photoshop-timeline'), current = safeDraft(drafts.read(key) || recovered), byId = new Map(current.sources.map(item => [item.id, item]));
        retainedFrames.forEach(frame => {
          const sourceIdentity = `psd-timeline:${psdHash}:${frame.ordinal}`;
          const item = sourceFromFile(frame.filename, { sourceIdentity, label: `${path.basename(inspection.filename, path.extname(inspection.filename))} · timeline frame ${frame.ordinal + 1}`, provenance: { kind: 'photoshop-timeline-frame', sourceIdentity, sourceFile: inspection.filename, sourceByteHash: psdHash, sourceOrdinal: frame.ordinal, renderedFile: frame.name } });
          byId.set(item.id, item);
        });
        mergeCreatorSources(current, [...byId.values()]); current.configuration.numberingMode = 'consecutive';
        await postState(current, `Added ${frames.length} Photoshop timeline frame(s) in rendered filename order.`); return;
      }
      const plan = planPsdExports(inspection.records, choice.mode), folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-sff-psd-'));
      const outputs = exportPsdPlan(inspection, plan, folder);
      if (purpose.mode === 'export') {
        await exportFrameSequence(outputs, { kind: 'photoshop-psd', path: inspection.filename, sha256: psdHash, mode: choice.mode }, path.basename(inspection.filename, path.extname(inspection.filename)), 'PSD');
        return;
      }
      const retainedOutputs = persistCreatorFrames(root, outputs, psdHash, choice.mode);
      const current = safeDraft(drafts.read(key) || recovered), byId = new Map(current.sources.map(item => [item.id, item]));
      retainedOutputs.forEach((output, ordinal) => {
        const sourceIdentity = `psd:${psdHash}:${choice.mode}:${ordinal}`;
        const item = sourceFromFile(output.filename, { sourceIdentity, label: output.label, provenance: { kind: 'photoshop-psd', sourceIdentity, sourceFile: inspection.filename, sourceByteHash: psdHash, mode: choice.mode, role: output.role, sourceOrdinal: output.sourceOrdinal, pages: output.pages } });
        byId.set(item.id, item);
      });
      mergeCreatorSources(current, [...byId.values()]); current.configuration.numberingMode = 'consecutive';
      await postState(current, `Added ${retainedOutputs.length} reviewed PSD sprite source(s) using ${choice.label}.`); return;
    }
    if (message.type === 'reviewDuplicateGroups') {
      const current = safeDraft(message.draft), analysis = duplicateGroupAnalysis(draftToPlan(current), current);
      if (!analysis.groups.length) { await postState(current, 'No exact indexed-pixel duplicate groups were found in the current reviewed sources.'); return; }
      for (let index = 0; index < analysis.groups.length; index += 1) {
        const group = analysis.groups[index], memberSummary = group.members.map(member => `${member.name} → ${member.identity}`).join(' · ');
        const choice = await vscode.window.showQuickPick([
          { label: 'Share identical data for this group', description: 'Retain separate sprite identities while allowing these exact pixels to share stored data.', value: 'share-identical' },
          { label: 'Keep this group independent', description: 'Store every sprite image independently even though the reviewed pixels match.', value: 'preserve-separate' },
          { label: 'Use the batch duplicate choice', description: 'Remove per-sprite overrides and follow the batch setting in step 6.', value: 'batch' }
        ], { title: `Exact duplicate group ${index + 1} of ${analysis.groups.length}`, placeHolder: memberSummary.length > 180 ? `${memberSummary.slice(0, 177)}…` : memberSummary });
        if (!choice) return;
        for (const member of group.members) {
          const override = current.configuration.overrides[member.sourceId] = { ...(current.configuration.overrides[member.sourceId] || {}) };
          if (choice.value === 'batch') delete override.duplicatePolicy;
          else override.duplicatePolicy = choice.value;
          if (!Object.keys(override).length) delete current.configuration.overrides[member.sourceId];
        }
      }
      await postState(current, `Reviewed ${analysis.groups.length} exact duplicate group(s). Per-group choices are retained in Create Package Only; SprMake2 remains available only when one global setting represents the final plan.`); return;
    }
    if (message.type === 'suggestAxes') {
      const current = safeDraft(message.draft), selectedIds = [...new Set((message.sourceIds || []).map(String))], plan = draftToPlan(current);
      if (!selectedIds.length) throw new Error('Mark one or more ready sources to review automatic-axis suggestions.');
      const readyById = new Map(plan.ready.map(row => [String(row.sourceId), row]));
      for (const id of selectedIds) if (!readyById.has(id)) throw new Error('Automatic-axis review can only use marked sources that pass the current Creator review. Resolve blocked rows first.');
      const method = await vscode.window.showQuickPick([
        { label: 'Alpha anchor for each marked source', description: 'Place a selected silhouette anchor on the SFF axis.', mode: 'anchor' },
        { label: 'One marked trusted reference', description: 'Match each target silhouette to one reviewed reference axis.', mode: 'reference' },
        { label: 'Multiple marked trusted references', description: 'Use consensus across two or more reviewed reference axes.', mode: 'consensus' }
      ], { title: 'Suggest axes for marked Creator sources', placeHolder: 'Suggestions never apply until you review and accept them.' });
      if (!method) return;
      const anchorChoice = await vscode.window.showQuickPick([
        { label: 'Bottom center', value: 'bottom-center' }, { label: 'Bounds center', value: 'bounds-center' },
        { label: 'Top center', value: 'top-center' }, { label: 'Left center', value: 'left-center' }, { label: 'Right center', value: 'right-center' }
      ], { title: 'Choose the silhouette anchor', placeHolder: 'Bottom center is usually appropriate for grounded character sprites.' });
      if (!anchorChoice) return;
      let referenceIds = [], referenceSelections = [], targetReferenceArchive = null;
      if (method.mode !== 'anchor') {
        const referenceChoices = selectedIds.map(id => { const row = readyById.get(id), source = current.sources.find(item => String(item.id) === id); return { label: source?.name || id, description: `Incoming ${row.identity} · axis ${row.axisX},${row.axisY}`, kind: 'staged', id }; });
        if (current.target?.path) {
          targetReferenceArchive = readSff(current.target.path);
          const observedTargetHash = crypto.createHash('sha256').update(targetReferenceArchive.buffer).digest('hex').toLowerCase();
          if (observedTargetHash !== String(current.target.expectedFingerprint || '').toLowerCase()) throw new Error('The target SFF changed before reference selection. Choose it again before suggesting axes.');
          targetReferenceArchive.sprites.forEach((sprite, physicalIndex) => referenceChoices.push({ label: `${current.target.name} · ${sprite.group},${sprite.number}`, description: `Target physical #${physicalIndex} · axis ${sprite.axisX},${sprite.axisY} · ${sprite.width}×${sprite.height}`, kind: 'target', physicalIndex }));
        }
        const picked = await vscode.window.showQuickPick(referenceChoices, { title: method.mode === 'consensus' ? 'Choose trusted incoming or target-SFF references' : 'Choose one trusted incoming or target-SFF reference', placeHolder: 'Target-SFF references remain read-only and are bound to the exact archive fingerprint.', canPickMany: method.mode === 'consensus' });
        if (!picked || (Array.isArray(picked) && !picked.length)) return;
        referenceSelections = Array.isArray(picked) ? picked : [picked];
        referenceIds = referenceSelections.filter(item => item.kind === 'staged').map(item => item.id);
        if (method.mode === 'consensus' && referenceSelections.length < 2) throw new Error('Consensus axis review requires at least two trusted references.');
      }
      let maxOffset = 16;
      if (method.mode !== 'anchor') {
        const entered = await vscode.window.showInputBox({ title: 'Maximum silhouette search offset', prompt: 'How far may reference matching search in each direction? (0–64 pixels)', value: '16', validateInput: value => Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 64 ? undefined : 'Enter a whole number from 0 through 64.' });
        if (entered === undefined) return; maxOffset = Number(entered);
      }
      const deltaEntry = await vscode.window.showInputBox({ title: 'Maximum allowed axis change', prompt: 'Suggestions beyond this X or Y change are blocked from acceptance. (1–1024 pixels)', value: '128', validateInput: value => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 1024 ? undefined : 'Enter a whole number from 1 through 1024.' });
      if (deltaEntry === undefined) return;
      let referenceDirectory = '', proposalSources = current.sources, proposalRows = plan.ready, proposals;
      try {
        const targetSelections = referenceSelections.filter(item => item.kind === 'target');
        if (targetSelections.length) {
          referenceDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-sff-axis-reference-'));
          const extracted = targetSelections.map(item => targetAxisReference(current.target, targetReferenceArchive, item.physicalIndex, referenceDirectory));
          proposalSources = [...current.sources, ...extracted.map(item => item.source)]; proposalRows = [...plan.ready, ...extracted.map(item => item.row)]; referenceIds.push(...extracted.map(item => item.source.id));
        }
        proposals = proposeCreatorAxes(fs, proposalSources, proposalRows, selectedIds, { mode: method.mode, referenceIds, anchor: anchorChoice.value, maxOffset, maximumDelta: Number(deltaEntry) });
      } finally { if (referenceDirectory) fs.rmSync(referenceDirectory, { recursive: true, force: true }); }
      const available = proposals.filter(item => !item.blocked).map(item => ({ label: item.name || item.sourceId, description: `${item.currentAxisX},${item.currentAxisY} → ${item.proposedAxisX},${item.proposedAxisY} · ${item.confidenceLabel} confidence`, detail: `${item.method} · delta ${item.deltaX >= 0 ? '+' : ''}${item.deltaX}, ${item.deltaY >= 0 ? '+' : ''}${item.deltaY}${item.confidenceLabel === 'high' ? '' : ' · opt in only after preview/review'}`, proposal: item, picked: item.confidenceLabel === 'high' }));
      if (!available.length) { await postState(current, `All ${proposals.length} automatic-axis suggestion(s) exceeded the ${Number(deltaEntry)} pixel safety limit. No axes changed.`); return; }
      const accepted = await vscode.window.showQuickPick(available, { title: 'Review automatic-axis suggestions', placeHolder: 'Uncheck any suggestion that should keep its current axis.', canPickMany: true });
      if (!accepted?.length) { await postState(current, 'Automatic-axis review closed without accepting a suggestion.'); return; }
      for (const item of accepted) {
        const proposal = item.proposal, override = current.configuration.overrides[proposal.sourceId] || {};
        current.configuration.overrides[proposal.sourceId] = { ...override, axisX: proposal.proposedAxisX, axisY: proposal.proposedAxisY, axisEvidence: { method: proposal.method, confidence: proposal.confidence, confidenceLabel: proposal.confidenceLabel, currentAxisX: proposal.currentAxisX, currentAxisY: proposal.currentAxisY, proposedAxisX: proposal.proposedAxisX, proposedAxisY: proposal.proposedAxisY, visualReviewStatus: 'pending', evidence: proposal.evidence } };
      }
      const blocked = proposals.length - available.length;
      await postState(current, `Accepted ${accepted.length} automatic-axis suggestion(s) into review${blocked ? `; ${blocked} exceeded the safety limit and stayed unchanged` : ''}. Preview and approve each suggested axis before packaging.`); return;
    }
    if (message.type === 'approveAxisReview') {
      const current = safeDraft(message.draft), id = String(message.sourceId || ''), override = current.configuration.overrides[id], plan = draftToPlan(current), row = plan.ready.find(item => item.sourceId === id);
      if (!row || !override?.axisEvidence || override.axisEvidence.proposedAxisX !== row.axisX || override.axisEvidence.proposedAxisY !== row.axisY) throw new Error('This automatic-axis suggestion changed before visual approval. Run it again or enter the axis manually.');
      override.axisEvidence = { ...override.axisEvidence, visualReviewStatus: 'approved' };
      await postState(current, `Visually approved the suggested axis for ${row.source.name}.`); return;
    }
    if (message.type === 'requestSourceAudition') { const payload = sourceAuditionPayload(message.draft, message.sourceIds); await panel.webview.postMessage(payload); return; }
    if (message.type === 'requestSourceThumbnails') { const payload = sourceThumbnailPayload(drafts.read(key) || recovered, message.sourceIds); await panel.webview.postMessage({ ...payload, requestId: message.requestId }); return; }
    if (message.type === 'previewAxis') { await panel.webview.postMessage(spriteAxisPreviewPayload(message.draft, message.sourceId)); return; }
    if (message.type === 'exportPlan') {
      const current = safeDraft(message.draft), destination = await vscode.window.showSaveDialog({ title: 'Export reviewed SFF Creator plan', defaultUri: vscode.Uri.file(path.join(root, 'sff-creator-plan.json')), filters: { 'IKEMaker SFF Creator plan': ['json'] }, saveLabel: 'Export Plan' });
      if (!destination) { await postState(current, 'Plan export cancelled; the retained draft was unchanged.'); return; }
      const content = serializeCreatorPlan(root, current), expectedHash = fs.existsSync(destination.fsPath) ? crypto.createHash('sha256').update(fs.readFileSync(destination.fsPath)).digest('hex').toUpperCase() : undefined;
      transactionalWrite(fs, destination.fsPath, content, { label: 'sff-creator-plan-export', allowExisting: true, backup: true, expectedHash, journal: true });
      await postState(current, `Creator plan exported: ${destination.fsPath}`); return;
    }
    if (message.type === 'importPlan') {
      const picked = await vscode.window.showOpenDialog({ title: 'Import an SFF Creator plan', canSelectFiles: true, canSelectFolders: false, canSelectMany: false, filters: { 'IKEMaker SFF Creator plan': ['json'] } });
      if (!picked?.[0]) return;
      const imported = parseCreatorPlan(root, fs.readFileSync(picked[0].fsPath, 'utf8')), staged = await stageDraft(root, imported);
      const unavailableCount = staged.draft.sources.filter(source => source.unavailable).length, changedCount = staged.draft.sources.filter(source => source.stale && !source.unavailable).length;
      const issue = unavailableCount || changedCount ? `; ${unavailableCount ? `${unavailableCount} unavailable external source(s)` : ''}${unavailableCount && changedCount ? ' and ' : ''}${changedCount ? `${changedCount} changed source(s)` : ''} require explicit relinking or refresh` : '';
      await postState(staged.draft, `Creator plan imported and revalidated${issue}.`); return;
    }
    if (message.type === 'stage') { await postState(message.draft); return; }
    if (message.type === 'discard') { const current = safeDraft(drafts.read(key) || recovered), retained = lifecycleContinuations ? await lifecycleContinuations.resume({ draftKey: key, currentDraftRevision: lifecycleDraftRevision(current) }) : { status: 'no-continuation' }; if (retained.status !== 'no-continuation') { await lifecyclePresentation(retained, 'This draft is owned by a retained IKEMaker operation. Continue it or detach only its draft lock before discarding the draft; the recovery record remains preserved.'); return; } const entry = pendingSeed(root, current); await pendingChanges.current().execute(pendingChanges.identity(entry).id, 'undo'); return; }
    if (message.type === 'openVerifiedCopy') { if (!lastSavedCopy) throw new Error('Save a verified SFF copy first.'); const stat = fs.lstatSync(lastSavedCopy.filename), bytes = fs.readFileSync(lastSavedCopy.filename); if (!stat.isFile() || stat.isSymbolicLink() || crypto.createHash('sha256').update(bytes).digest('hex') !== lastSavedCopy.byteHash) throw new Error('The saved SFF copy changed. Open it explicitly from disk after reviewing it.'); await vscode.commands.executeCommand('sff.openViewer', vscode.Uri.file(lastSavedCopy.filename)); return; }
    if (message.type === 'saveTruecolorCopy') {
      const staged = await stageDraft(root, message.draft);
      if (!staged.state.enabled || staged.draft.configuration.paletteMode !== 'true-color' || !staged.draft.replaceSpriteIdentities.length || staged.draft.target?.sffVersion !== '2.1') throw new Error(staged.state.reason || 'Save Verified SFF Copy requires a reviewed SFF v2.1 truecolor replacement.');
      const stem = path.basename(staged.draft.target.path, '.sff'), destination = await vscode.window.showSaveDialog({ title: 'Save verified truecolor SFF copy', defaultUri: vscode.Uri.file(path.join(path.dirname(staged.draft.target.path), `${stem}-edited-copy.sff`)), filters: { 'SFF archive': ['sff'] }, saveLabel: 'Save Verified Copy' });
      if (!destination) { await postState(staged.draft, 'Verified copy destination cancelled; the retained draft and active SFF are unchanged.'); return; }
      if (fs.existsSync(destination.fsPath)) throw new Error('The verified copy destination already exists. Choose a new .sff filename; this route never overwrites an SFF.');
      lastSavedCopy = await createReviewedTruecolorCopy(root, staged.draft, destination.fsPath);
      await panel.webview.postMessage({ type: 'verifiedCopy', filename: lastSavedCopy.filename, byteHash: lastSavedCopy.byteHash, receiptPath: lastSavedCopy.receiptPath }); return;
    }
    if (message.type === 'compareBoth') {
      const staged = await stageDraft(root, message.draft);
      if (!staged.state.enabled) { await panel.webview.postMessage({ type: 'state', draft: staged.draft, plan: staged.state.plan || { rows: [], ready: [], conflicts: [], skipped: [] }, applyState: { enabled: false, reason: staged.state.reason }, message: staged.state.reason }); return; }
      const result = await createReviewedPackage(root, staged.draft, true); if (!result.resolved) { await postState(staged.draft, 'Comparison package folder selection cancelled; the draft was retained.'); return; }
      await compareGeneratedBuild(result.build);
      await panel.webview.postMessage({ type: 'state', draft: staged.draft, plan: staged.state.plan, applyState: { enabled: true, reason: '' }, message: 'Backend comparison finished or was cancelled. Neither candidate was adopted; the reviewed draft remains available.' }); return;
    }
    if (message.type === 'validateExisting') {
      const staged = await stageDraft(root, message.draft);
      if (!staged.state.enabled) { await panel.webview.postMessage({ type: 'state', draft: staged.draft, plan: staged.state.plan || { rows: [], ready: [], conflicts: [], skipped: [] }, applyState: { enabled: false, reason: staged.state.reason }, message: staged.state.reason }); return; }
      const candidate = await vscode.window.showOpenDialog({ title: 'Choose an existing SprMake2 SFF output to validate', canSelectFiles: true, canSelectFolders: false, canSelectMany: false, filters: { 'IKEMEN SFF archive': ['sff'] } });
      if (!candidate?.[0]) { await postState(staged.draft, 'Existing-output validation cancelled; the reviewed draft was retained.'); return; }
      const result = await createReviewedPackage(root, staged.draft, true);
      if (!result.resolved) { await postState(staged.draft, 'Validation package folder selection cancelled; the draft was retained.'); return; }
      const validation = validateExistingSprMake2Output(result.build, candidate[0].fsPath);
      const action = await vscode.window.showInformationMessage(`Existing SprMake2 output passed the reviewed SFF contract. Nothing was adopted.`, 'Open validation report');
      if (action === 'Open validation report') { const document = await vscode.workspace.openTextDocument(vscode.Uri.file(validation.reportPath)); await vscode.window.showTextDocument(document, { preview: false }); }
      await panel.webview.postMessage({ type: 'state', draft: staged.draft, plan: staged.state.plan, applyState: { enabled: true, reason: '' }, message: `Validated ${path.basename(candidate[0].fsPath)}; nothing was adopted. Report: ${validation.reportPath}` }); return;
    }
    if (message.type === 'buildBuiltInV20' || message.type === 'buildBuiltInV21' || message.type === 'buildBuiltInV21Single') {
      const staged = await stageDraft(root, message.draft), targetId = message.type === 'buildBuiltInV20' ? 'sff-v2.0' : 'sff-v2.1';
      if (!staged.state.enabled) { await postState(staged.draft, staged.state.reason); return; }
      const dual = message.type === 'buildBuiltInV21', actionLabel = dual ? 'Create 2 Test SFFs' : 'Create Single-Writer Test Candidate';
      const answer = await vscode.window.showWarningMessage(dual ? 'Create 2 Test SFFs · No Changes to Active SFF' : targetId+' Single Writer · TEST BUILD ONLY · No Adoption', { modal: true, detail: dual ? 'Create exactly two visible SFF files—one from IKEMaker and one from SprMake2—plus one comparison JSON file in the folder you choose. Temporary source snapshots and build evidence are removed after the candidates are validated. The active SFF and Creator draft stay unchanged.' : 'Create one separately named IKEMaker candidate plus its test receipt. SprMake2 is not dispatched on this single-writer route. This grants no adoption authority, never replaces the active SFF, and always retains the Creator draft.' }, actionLabel);
      if (answer !== actionLabel) { await postState(staged.draft, 'Test build cancelled; the reviewed draft was retained.'); return; }
      if (dual) {
        const picked = await vscode.window.showOpenDialog({ title: 'Choose an empty folder for the 2 test SFFs', openLabel: 'Create 2 Test SFFs Here', canSelectFiles: false, canSelectFolders: true, canSelectMany: false });
        if (!picked?.[0]) { await postState(staged.draft, 'Two-SFF test cancelled; the reviewed draft was retained.'); return; }
        const temporaryParent = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-two-sff-test-'));
        let published = false;
        try {
          const result = await createReviewedPackage(root, staged.draft, false, '', temporaryParent);
          const sealedBuild = { ...result.build, specificationArtifactByteHash: crypto.createHash('sha256').update(fs.readFileSync(result.build.specificationPath)).digest('hex') };
          const internal = await createCreatorDualV21TestBuild({ packageRoot: result.packageRoot, build: sealedBuild, targetId });
          const testBuild = publishDualTestBuild(internal, picked[0].fsPath, staged.draft.target?.name || 'SFF');
          published = true;
          const candidateFolder = path.dirname(testBuild.builtInCandidatePath);
          const summary = readWriterComparisonReport(testBuild.comparisonReportPath);
          let runState = { runAvailable: false, runUnavailableReason: 'Attach an existing character SFF to enable the P1/P2 test run.' };
          if (staged.draft.target?.path) {
            const binding = createWriterRunBinding(summary, staged.draft.target);
            await writeRunBinding(root, binding);
            activeWriterRunBinding = binding;
            runState = { runAvailable: true, targetPath: binding.targetPath, targetFingerprint: binding.targetHash };
          }
          activeWriterComparison = { ...summary, ...runState };
          await panel.webview.postMessage({ type: 'state', draft: staged.draft, plan: staged.state.plan, applyState: { enabled: true, reason: '' }, message: `${testBuild.purpose}: created ${path.basename(testBuild.builtInCandidatePath)}, ${path.basename(testBuild.sprMake2CandidatePath)}, and ${path.basename(testBuild.comparisonReportPath)} directly in ${candidateFolder}. The active SFF and reviewed draft were unchanged.` });
          await panel.webview.postMessage({ type: 'writerComparison', summary: activeWriterComparison });
          await showDualTestBuildResult(testBuild, panel); return;
        } finally { cleanupTemporaryTestPackage(temporaryParent, published); }
      }
      const result = await createReviewedPackage(root, staged.draft, true); if (!result.resolved) { await postState(staged.draft, 'Test-build package selection cancelled; the reviewed draft was retained.'); return; }
      const sealedBuild = { ...result.build, specificationArtifactByteHash: crypto.createHash('sha256').update(fs.readFileSync(result.build.specificationPath)).digest('hex') };
      const testBuild = createCreatorTestBuild({ packageRoot: result.packageRoot, build: sealedBuild, targetId });
      await panel.webview.postMessage({ type: 'state', draft: staged.draft, plan: staged.state.plan, applyState: { enabled: true, reason: '' }, message: `${testBuild.purpose}: ${testBuild.candidatePath}. The active SFF and reviewed draft were unchanged.` });
      vscode.window.showInformationMessage(`${targetId} single-writer TEST BUILD ONLY completed. No SFF was adopted. Candidate: ${testBuild.candidatePath}`); return;
    }
    if (message.type === 'buildCompared') {
      const staged = await stageDraft(root, message.draft), targetLabel = staged.draft.target ? staged.draft.target.name : 'a new SFF';
      let newArchivePath = '';
      if (!staged.state.enabled) { await panel.webview.postMessage({ type: 'state', draft: staged.draft, plan: staged.state.plan || { rows: [], ready: [], conflicts: [], skipped: [] }, applyState: { enabled: false, reason: staged.state.reason }, message: staged.state.reason }); return; }
      if (!staged.draft.target) {
        const destination = await vscode.window.showSaveDialog({ title: 'Create the new dual-verified SFF archive', defaultUri: vscode.Uri.file(path.join(root, 'new-character.sff')), filters: { 'IKEMEN SFF archive': ['sff'] }, saveLabel: 'Use This New SFF' });
        if (!destination) { await panel.webview.postMessage({ type: 'state', draft: staged.draft, plan: staged.state.plan, applyState: { enabled: staged.state.enabled, reason: staged.state.reason }, message: 'New SFF destination selection cancelled; the reviewed draft was retained.' }); return; }
        newArchivePath = destination.fsPath;
        if (fs.existsSync(newArchivePath)) { await panel.webview.postMessage({ type: 'error', message: 'Create New Archive will not overwrite an existing SFF. Attach that archive as the target or choose a new filename.' }); return; }
      }
      const operations = creatorOperationSummary(staged.state.plan, staged.draft);
      const answer = await vscode.window.showWarningMessage(`Build the IKEMaker test SFF first, repeat with SprMake2, and compare ${operations.label} for ${targetLabel}?`, { modal: true, detail: 'Both backends receive the same immutable reviewed specification. Each private candidate must pass independent validation and their rendered sprite/palette meaning must match. A mismatch, failure, or target change updates nothing. After equivalence is proven, IKEMaker retains its backend-labelled test SFF and shows one final impact review before SprMake2 can update the normal target.' }, 'Build, Compare & Review');
      if (answer !== 'Build, Compare & Review') { await panel.webview.postMessage({ type: 'state', draft: staged.draft, plan: staged.state.plan, applyState: { enabled: staged.state.enabled, reason: staged.state.reason }, message: 'Dual build cancelled; the reviewed draft was retained.' }); return; }
      const result = await createReviewedPackage(root, staged.draft, true, newArchivePath); if (!result.resolved) { await postState(staged.draft, 'Package folder selection cancelled; the reviewed draft was retained.'); return; }
      const execution = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Building IKEMaker test output, repeating with SprMake2, and comparing ${path.basename(result.build.outputSff)}` }, () => executeComparedSprMake2Build(result.build, { confirmAdoption: async ({ impact, comparison, comparisonReportPath, builtInTestPath, sprMake2TargetPath }) => {
        const sample = values => values.slice(0, 8).map(item => `${item.identity}${item.occurrence > 1 ? ` #${item.occurrence}` : ''}`).join(', ') || 'none';
        const detail = [
          `Comparison: ${comparison.semanticEquivalent ? 'semantic match' : 'MISMATCH'}${comparison.byteEquivalent ? ' · byte-identical' : ' · byte layout differs as expected'}`,
          `In-house: ${comparison.candidates.builtIn.byteHash.slice(0, 16)}… · ${comparison.candidates.builtIn.byteLength} bytes`,
          `SprMake2: ${comparison.candidates.sprMake2.byteHash.slice(0, 16)}… · ${comparison.candidates.sprMake2.byteLength} bytes`,
          `Active: ${impact.active.spriteCount} sprites, ${impact.active.paletteCount} palettes, ${impact.active.byteLength} bytes`,
          `SprMake2 candidate: ${impact.candidate.spriteCount} sprites, ${impact.candidate.paletteCount} palettes, ${impact.candidate.byteLength} bytes`,
          ...creatorCandidateImpactLines(impact),
          `Added examples: ${sample(impact.sprites.added)}`, `Header/PNG difference examples: ${sample(impact.sprites.changed)}`, `Removed examples: ${sample(impact.sprites.removed)}`,
          `IKEMaker test SFF: ${builtInTestPath}`,
          `SprMake2 target: ${sprMake2TargetPath}`,
          `Comparison report: ${comparisonReportPath}`, '', 'The IKEMaker test SFF remains in the reviewed package. Cancel keeps the reviewed draft and active archive unchanged.'
          , 'Transaction recovery uses app storage and is removed after the target and execution receipt are verified. A failed transaction retains its exact recovery location for inspection; no automatic sibling backup is created.'
        ].join('\n');
        return await vscode.window.showWarningMessage('Both private SFF candidates passed and are semantically equivalent. Update the normal target with the exact SprMake2 candidate?', { modal: true, detail }, 'Apply SprMake2 to Target') === 'Apply SprMake2 to Target';
      } }));
      if (execution.cancelled) { await panel.webview.postMessage({ type: 'state', draft: staged.draft, plan: staged.state.plan, applyState: { enabled: true, reason: '' }, message: `Compared SprMake2 update cancelled; the active SFF and retained draft were unchanged. The IKEMaker test SFF was retained: ${execution.builtInTestPath} · Report: ${execution.comparisonReportPath}` }); return; }
      await drafts.discard(key); await pendingChanges.current().remove(pendingChanges.identity(pendingSeed(root, staged.draft)).id);
      invalidateSavedRules(defaultDraft()); await panel.webview.postMessage({ type: 'state', draft: defaultDraft(), plan: { rows: [], ready: [], conflicts: [], skipped: [] }, applyState: { enabled: false, reason: 'Choose at least one PNG source.' }, savedRuleReview: null, nearestColorReview: null, message: `SprMake2 updated the normal SFF after dual-writer comparison: ${result.build.outputSff} · IKEMaker test: ${execution.builtInTestPath}` });
      await require('./sff_creator_optional_air').reviewOptionalAirAfterBuild(vscode, staged.draft, { cancelled: false, targetPath: result.build.outputSff, byteHash: execution.comparison.candidates.sprMake2.byteHash, finalReady: result.plan.ready });
      vscode.window.showInformationMessage(`SprMake2 updated ${result.build.outputSff}. The new-writer test archive remains available as ${execution.builtInTestPath}.`); return;
    }
    if (message.type === 'build') {
      const staged = await stageDraft(root, message.draft), targetLabel = staged.draft.target ? staged.draft.target.name : 'a new SFF';
      let newArchivePath = '';
      if (!staged.draft.target) {
        const destination = await vscode.window.showSaveDialog({ title: 'Create the new SFF archive', defaultUri: vscode.Uri.file(path.join(root, 'new-character.sff')), filters: { 'IKEMEN SFF archive': ['sff'] }, saveLabel: 'Use This New SFF' });
        if (!destination) { await panel.webview.postMessage({ type: 'state', draft: staged.draft, plan: staged.state.plan, applyState: { enabled: staged.state.enabled, reason: staged.state.reason }, message: 'New SFF destination selection cancelled; the reviewed draft was retained.' }); return; }
        newArchivePath = destination.fsPath;
        if (fs.existsSync(newArchivePath)) { await panel.webview.postMessage({ type: 'error', message: 'Create New Archive will not overwrite an existing SFF. Attach that archive as the target or choose a new filename.' }); return; }
      }
      const operations = creatorOperationSummary(staged.state.plan, staged.draft);
      const answer = await vscode.window.showWarningMessage(`Use SprMake2 alone to build and safely apply ${operations.label} to ${targetLabel}?`, { modal: true, detail: staged.draft.target ? 'This explicit route builds a private SprMake2 candidate without the new-writer comparison output. IKEMaker validates the complete archive and atomically replaces the reviewed target only after every check passes. The draft is retained if building, validation, or adoption fails.' : `This explicit route builds a private SprMake2 candidate without the new-writer comparison output. IKEMaker validates it completely, rechecks that ${newArchivePath} still does not exist, and only then creates that file atomically. The draft is retained if building, validation, or adoption fails.` }, 'SprMake2 Only · Build & Apply');
      if (answer !== 'SprMake2 Only · Build & Apply') { await panel.webview.postMessage({ type: 'state', draft: staged.draft, plan: staged.state.plan, applyState: { enabled: staged.state.enabled, reason: staged.state.reason }, message: 'SprMake2-only build cancelled; the reviewed draft was retained.' }); return; }
      const result = await createReviewedPackage(root, staged.draft, true, newArchivePath); if (!result.resolved) { await postState(staged.draft, 'Package folder selection cancelled; the draft was retained.'); return; }
      const execution = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Building and validating ${path.basename(result.build.outputSff)}` }, () => executeGeneratedBuild(result.build, { confirmAdoption: async ({ impact }) => {
        const sample = values => values.slice(0, 8).map(item => `${item.identity}${item.occurrence > 1 ? ` #${item.occurrence}` : ''}`).join(', ') || 'none';
        const detail = [
          `Active: ${impact.active.spriteCount} sprites, ${impact.active.paletteCount} palettes, ${impact.active.byteLength} bytes`,
          `Candidate: ${impact.candidate.spriteCount} sprites, ${impact.candidate.paletteCount} palettes, ${impact.candidate.byteLength} bytes`,
          ...creatorCandidateImpactLines(impact),
          `Added examples: ${sample(impact.sprites.added)}`, `Header/PNG difference examples: ${sample(impact.sprites.changed)}`, `Removed examples: ${sample(impact.sprites.removed)}`,
          '', 'The candidate has passed validation. Cancel keeps the draft and active archive unchanged.'
        ].join('\n');
        return await vscode.window.showWarningMessage('Private SFF candidate is validated. Adopt this exact candidate?', { modal: true, detail }, 'Adopt Validated Candidate') === 'Adopt Validated Candidate';
      } }));
      if (execution.cancelled) { await panel.webview.postMessage({ type: 'state', draft: staged.draft, plan: staged.state.plan, applyState: { enabled: true, reason: '' }, message: `Validated candidate adoption cancelled; the active SFF and retained draft were unchanged. Receipt: ${execution.executionReceiptPath}` }); return; }
      await drafts.discard(key); await pendingChanges.current().remove(pendingChanges.identity(pendingSeed(root, staged.draft)).id);
      invalidateSavedRules(defaultDraft()); await panel.webview.postMessage({ type: 'state', draft: defaultDraft(), plan: { rows: [], ready: [], conflicts: [], skipped: [] }, applyState: { enabled: false, reason: 'Choose at least one PNG source.' }, savedRuleReview: null, nearestColorReview: null, message: `SFF safely updated: ${result.build.outputSff}` });
      await require('./sff_creator_optional_air').reviewOptionalAirAfterBuild(vscode, staged.draft, { cancelled: false, targetPath: result.build.outputSff, byteHash: execution.candidateHash, finalReady: result.plan.ready });
      vscode.window.showInformationMessage(`SFF safely updated after candidate validation: ${result.build.outputSff}`); return;
    }
    if (message.type === 'apply') { const staged = await stageDraft(root, message.draft); const result = await pendingChanges.current().execute(staged.entry.id, 'apply'); if (result?.resolved) { invalidateSavedRules(defaultDraft()); await panel.webview.postMessage({ type: 'state', draft: defaultDraft(), plan: { rows: [], ready: [], conflicts: [], skipped: [] }, applyState: { enabled: false, reason: 'Choose at least one PNG source.' }, savedRuleReview: null, nearestColorReview: null, message: `Reviewed package ready: ${result.packageRoot}` }); } }
  }).catch(error => { vscode.window.showErrorMessage(error.message); return panel.webview.postMessage({ type: 'error', message: error.message }); }));
  panel.onDidDispose(() => { panelDisposed = true; writerAttachment.dispose(); ruleAuthority.revoke(); paletteAdaptationAuthority.revoke(); if (sessions.get(key) === panel) sessions.delete(key); if (replacementRuleSessions.get(key)?.invalidate === invalidateSavedRules) replacementRuleSessions.delete(key); });
  if (lifecycleContinuations) {
    try {
      const continuation = await lifecycleContinuations.resume({ draftKey: key, currentDraftRevision: lifecycleDraftRevision(recovered) });
      await lifecyclePresentation(continuation, continuation.status === 'restart-review-required' ? `Built-in operation ${continuation.operationId.slice(0, 12)}… is retained at ${continuation.startup.status}. Choose Continue; reopening never auto-advances a mutation stage.` : '');
    } catch (error) { await panel.webview.postMessage({ type: 'error', message: `Built-in lifecycle continuation could not be verified: ${error.message}` }); }
  }
  return panel;
}

async function forwardDesktopDrop(uri, paths) {
  const safePaths = Array.isArray(paths) ? paths.filter(value => typeof value === 'string').slice(0, 513) : [];
  if (!safePaths.length) return null;
  const panel = await openCreator(uri);
  if (!panel) return null;
  if (panel.creatorReady) await panel.webview.postMessage({ type: 'forwardedDesktopDrop', paths: safePaths });
  else panel.pendingDesktopDrop = [...(panel.pendingDesktopDrop || []), ...safePaths].slice(0, 513);
  return panel;
}

function configureTrueColorIntake(value, writerMode) {
  const current = safeDraft(value);
  if ((current.target?.sffVersion || current.configuration.newArchiveVersion || '2.1') !== '2.1') throw new Error('True Color PNG intake requires SFF 2.1. Choose a new SFF 2.1 archive or an existing SFF 2.1 target; SFF 2.0 requires indexed PNG sources.');
  if (writerMode === 'both') throw new Error('Both writers comparison cannot yet validate True Color safely. Select IKEMaker or SprMake2 in the shared Writer control. The writer was not changed.');
  current.configuration.paletteMode = 'true-color';
  current.configuration.cropMode = 'none';
  return current;
}

function register(context) {
  require('./sff_private_storage').register(context);
  const builtInLifecycleRuntime = installCreatorBuiltInLifecycleRuntime(context);
  drafts = new FormDrafts(context.workspaceState, DRAFT_STORE);
  writerRunState = context.workspaceState;
  lifecycleContinuations = createProductionCreatorWorkspaceContinuationHost(context, async key => {
    const retained = safeDraft(drafts.read(key) || defaultDraft()), root = workspaceKey();
    await drafts.discard(key); await pendingChanges.current().remove(pendingChanges.identity(pendingSeed(root, retained)).id);
  }, request => builtInLifecycleRuntime.resumeLifecycle(request.lifecycleVaultLocator));
  productionLifecycleStarter = createCreatorBuiltInLifecycleCoordinator({ captureTarget: builtInLifecycleRuntime.captureTarget, startLifecycle: builtInLifecycleRuntime.startLifecycle, verifyCompleted: builtInLifecycleRuntime.verifyCompleted, retainContinuation: value => lifecycleContinuations.retain(value) });
  productionLifecycle = createCreatorProductionWorkspaceCoordinator({
    runtime: builtInLifecycleRuntime,
    continuations: lifecycleContinuations,
    pickCertification: binding => pickCreatorCertificationEvidence(vscode, { targetId: binding.targetId, backendId: binding.backendId }),
    probeReplacement: probeCreatorReplacementCapability,
    ui: { target: createVscodeTargetReviewUi(vscode), adoption: createVscodeAdoptionReviewUi(vscode), layout: createVscodeLayoutReviewUi(vscode), execution: createVscodeExecutionStartUi(vscode), history: createVscodeHistoryReviewUi(vscode) }
  });
  const recoveredRuns = require('./sff_writer_comparison_run').recover({ warn: text => vscode.window.showWarningMessage(text) });
  context.subscriptions.push({ dispose() { for (const result of recoveredRuns) if (result?.timer) clearInterval(result.timer); } });
  const service = pendingChanges.current();
  const owner = service.registerOwner({
    id: OWNER, label: 'SFF Creator', focus: () => openCreator(),
    apply: async entry => {
      const root = vscode.Uri.parse(entry.resource).fsPath, key = draftKey(path.resolve(root)), draft = safeDraft(drafts.read(key) || defaultDraft());
      const result = await createReviewedPackage(root, draft, true); if (!result.resolved) return result;
      await drafts.discard(key); vscode.window.showInformationMessage(`Reviewed SFF Creator package ready: ${result.packageRoot}`); return result;
    },
    undo: async entry => {
      const root = vscode.Uri.parse(entry.resource).fsPath, key = draftKey(path.resolve(root)); await drafts.discard(key); replacementRuleSessions.get(key)?.invalidate(defaultDraft());
      const panel = sessions.get(key); if (panel) await panel.webview.postMessage({ type: 'state', draft: defaultDraft(), plan: { rows: [], ready: [], conflicts: [], skipped: [] }, applyState: { enabled: false, reason: 'Choose at least one PNG source.' }, savedRuleReview: null, nearestColorReview: null, message: 'Creator draft discarded.' });
      return { resolved: true };
    }
  });
  context.subscriptions.push(owner, vscode.commands.registerCommand('sff.openCreator', openCreator));
}

module.exports = { configureTrueColorIntake, COMMAND, OWNER, DRAFT_STORE, defaultDraft, safeDraft, creatorSourceActionAvailability, creatorNeedsPaletteHandoffAvailability, readStableBoundedFile, readWriterComparisonReport, writerRunBindingMatches, openPaletteWorkshopAfterFreshCheck, serializeCreatorPlan, parseCreatorPlan, importSprMake2Manifest, importSprMake2Definition, importSprMake2Recipe, scanPngFolder, persistFolderSources, mergeCreatorSources, relinkCreatorSource, draftToPlan, duplicateGroupAnalysis, imagePaletteAllocation, applyState, spriteAxisPreviewPayload, sourceThumbnailPayload, sourceAuditionPayload, targetAxisReference, targetAxisReferenceIssue, manifestRows, creatorAxisEvidenceArtifact, prepareReviewedPaletteDecisionSources, createReviewedPackage, buildCompactIntakeNow, publishDualTestBuild, cleanupTemporaryTestPackage, compactIntakeConfiguration, retainGuidedSources, stageCompactIntake, html, register, openCreator, forwardDesktopDrop, sourceFromFile, targetFromFile, bindInvocationTarget, bindDeletionInvocation, bindDuplicateInvocation, bindReplacementInvocation, saveVerifiedCreatorCopy, createReviewedTruecolorCopy, paletteAdaptationInvocationBinding, bindPaletteAdaptationInvocation };
