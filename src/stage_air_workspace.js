'use strict';

const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { parseDef } = require('./def_model');
const { stageModel } = require('./stage_model');
const { readSff, spriteDataUri } = require('./sff_reader');
const { parseAir } = require('./air_preview_model');
const { sourceState, saveSourceDocument } = require('./source_document_save');
const { scanStageAir, blockIdentity, planStageAirEdit, planStageAirCreate, applyStageAirPlanToDocument } = require('./stage_air_source');
const { SLOTS } = require('./viewer_toolbar_contract');
const { adapt } = require('./universal_toolbar_adapter');
const { MESSAGE_TYPE, createUniversalToolbarDispatcher } = require('./universal_toolbar_webview');

const panels = new Map();
const fileKey = filename => path.resolve(filename).toLowerCase();
const digest = text => crypto.createHash('sha256').update(text).digest('hex');
const unavailable = reason => ({ available: false, reason, items: [], occurrences: [], issues: [] });

function stageAirAssets(filename, text, resolveAsset = (reference, owner) => path.resolve(path.dirname(owner), reference)) {
  const model = stageModel(parseDef(text, filename));
  const sffPath = model.sff ? path.resolve(resolveAsset(model.sff, filename)) : '';
  return { sffPath, sffReference: model.sff || '' };
}

function stageAirToolbarModel(session, document) {
  const capabilities = Object.fromEntries(SLOTS.map(slot => [slot.id, { enabled: false, reason: `${slot.label} is unavailable while editing an embedded Stage AIR Action.` }]));
  const enable = (id, reason = '') => { capabilities[id] = { enabled: true, dispatch: `internal:${id}`, ...(reason ? { reason } : {}) }; };
  for (const id of ['new','close','open','animations','stage','project','help','settings']) enable(id);
  if (scanStageAir(document?.getText?.() || '').blocks.filter(block => block.number === session.selectedAction).length === 1) capabilities['text-source'] = { enabled: true, dispatch: 'internal:text-source', capabilityId: 'implemented.stage-source', resolverId: 'stage.exact-background-source', routeKind: 'selected-block' };
  else capabilities['text-source'] = { enabled: false, reason: 'No unique Action is selected. Use Open Stage DEF in this editor to inspect or resolve the source.' };
  if (document?.isDirty) enable('save'); else capabilities.save = { enabled: false, reason: 'The Stage DEF has no unsaved source changes.' };
  if (session.sffPath && fs.existsSync(session.sffPath) && !session.sffError) { enable('sprites'); capabilities['connected-resources'] = { enabled: true, dispatch: 'internal:connected-resources', routeKind: 'connected-resources' }; }
  else for (const id of ['sprites','connected-resources']) capabilities[id] = { enabled: false, reason: 'Set BGDef spr to a readable Stage SFF to open its sprites.' };
  capabilities['viewer-browser'] = { enabled: true, dispatch: 'internal:viewer-browser' };
  capabilities['auto-save'] = { enabled: false, reason: 'Stage AIR edits use the open Stage DEF document and native Save.' };
  capabilities['save-as'] = { enabled: false, reason: 'Open the Stage DEF source and review resource paths before Save As.' };
  return adapt('stage.workspace', capabilities, { autoSaveEnabled: false, resolverIds: ['stage.exact-background-source'] });
}

function stageAirToolbarDispatcher(api, session) {
  const source = async () => {
    const document = await api.workspace.openTextDocument(api.Uri.file(session.filename));
    const block = scanStageAir(document.getText()).blocks.find(item => item.number === session.selectedAction && !item.shadowedDuplicate);
    const line = Math.max(0, (block?.line || 1) - 1);
    return require('./viewer_navigation').openViewerSource(session.filename, line, require('./viewer_navigation').currentPoint(session.filename, 'stage', {}, session.panel));
  };
  const sprites = async () => { if (!session.sffPath || !fs.existsSync(session.sffPath)) throw new Error('The exact Stage BGDef SFF is unavailable.'); return api.commands.executeCommand('sff.openViewer', api.Uri.file(session.sffPath)); };
  const handlers = {
    new: async () => session.panel.webview.postMessage({ type: 'stageAirOpenNewAction' }),
    close: async () => session.panel.dispose(),
    open: async () => api.commands.executeCommand('ikemen.stage.openWorkspace', undefined, { forcePicker: true }),
    save: async () => { const document = await api.workspace.openTextDocument(api.Uri.file(session.filename)); const result = await saveSourceDocument(document, path.basename(session.filename)); await session.panel.webview.postMessage({ type: 'sourceSaveStatus', state: sourceState(document, path.basename(session.filename)), message: result.message }); return result; },
    'text-source': source, 'connected-resources': sprites, sprites,
    animations: async () => session.panel.reveal(undefined, false),
    stage: async () => api.commands.executeCommand('ikemen.stage.openWorkspace', api.Uri.file(session.filename)),
    'viewer-browser': async () => session.panel.webview.postMessage({ type: 'stageAirFocusActions' }),
    project: async () => api.commands.executeCommand('ikemen.projectManager.open'),
    help: async () => api.commands.executeCommand('ikemen.help.open', { screen: 'stage' }),
    settings: async () => api.commands.executeCommand('ikemen.openExtensionSettings')
  };
  return createUniversalToolbarDispatcher({ handlersBySurface: { 'stage.workspace': handlers }, getToolbar: async () => { const document = await api.workspace.openTextDocument(api.Uri.file(session.filename)); return stageAirToolbarModel(session, document); } });
}

function stageAirModel(session, document) {
  const asset = stageAirAssets(session.filename, document.getText(), session.resolveAsset);
  const stamp = asset.sffPath && fs.existsSync(asset.sffPath) ? (() => { const stat = fs.statSync(asset.sffPath); return `${asset.sffPath}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`; })() : '';
  if (stamp !== session.assetStamp) {
    session.sffError = '';
    try { session.archive = stamp ? readSff(asset.sffPath) : { palettes: [], sprites: [] }; }
    catch (error) { session.archive = { palettes: [], sprites: [] }; session.sffError = error.message; }
    session.byKey = new Map(session.archive.sprites.map(sprite => [`${sprite.group},${sprite.number}`, sprite]));
    session.assetStamp = stamp;
  }
  session.sffPath = asset.sffPath; session.sffReference = asset.sffReference;
  const snapshot = scanStageAir(document.getText(), document.version, session.filename);
  if (session.collisionReview && session.collisionReview.snapshot.fingerprint !== snapshot.fingerprint) session.collisionReview = null;
  const parsed = parseAir(snapshot.projection), byLine = new Map(snapshot.blocks.map(block => [block.line, block]));
  const actions = parsed.map((action, sourceOrder) => {
    const block = byLine.get(action.line), shadowed = Boolean(block?.shadowedDuplicate || action.shadowedDuplicate);
    return { ...action, sourceOrder, category: 'Stage Actions', name: `Action ${action.number}`, systemName: '', authoredName: '',
      sourceText: block?.text || '', stageBlock: block ? blockIdentity(block) : null, shadowedDuplicate: shadowed,
      readOnly: shadowed || Boolean(action.readOnly),
      frames: action.frames.map(frame => ({ ...frame, spritePaletteIndex: session.byKey.get(`${frame.group},${frame.index}`)?.paletteIndex ?? null, spriteMissing: frame.group >= 0 && !session.byKey.has(`${frame.group},${frame.index}`) })) };
  });
  session.snapshot = snapshot;
  const selected = snapshot.blocks.find(block => block.number === session.selectedAction && !block.shadowedDuplicate) || snapshot.blocks[0];
  if (!Number.isSafeInteger(session.selectedAction) && selected && !selected.shadowedDuplicate) session.selectedAction = selected.number;
  const firstPalette = session.archive.palettes[0];
  const palettePreview = { assignedDefault: { index: firstPalette?.index ?? null, group: firstPalette?.group ?? 0, number: firstPalette?.number ?? 0, defPath: null }, screen: 'stage-air', screenPaletteIndex: session.paletteIndex ?? null, screenPaletteExplicit: Number.isInteger(session.paletteIndex), groupPaletteIndices: {}, explicitGroupPaletteIndices: { ...(session.groupPalettes || {}) } };
  const model = {
    sourceKind: 'stage', sourceContext: { defPath: session.filename, defLabel: path.basename(session.filename), line: selected?.line || null, sffPath: session.sffPath, sffLabel: session.sffPath ? path.basename(session.sffPath) : '', sffError: session.sffError || '' },
    capabilities: { save: true, saveAs: false, gifImport: false, actionLog: false, actionCreate: true, actionDuplicate: true, actionDelete: true, frameEdit: true, collisionEdit: true, source: true, palette: true, characterReferences: false, runtime: false, push: false, transfer: false },
    title: `${path.basename(session.filename)} · embedded AIR`, airPath: session.filename, sffPath: session.sffPath, sourceFingerprint: snapshot.fingerprint, sourceVersion: document.version, generation: document.version, toolbarModel: stageAirToolbarModel(session, document),
    sourceReturnContext: digest(session.filename + ':' + session.sffPath), sessionOwnerDefs: [], connectedAirBinding: null, connectedAirs: [],
    initialAction: session.selectedAction, initialFrame: session.selectedFrame || 0, initialMarkedActions: [], initialActionAnchor: null,
    actions, missingSpriteFrames: actions.reduce((sum, action) => sum + action.frames.filter(frame => frame.spriteMissing).length, 0),
    palettes: session.archive.palettes.map(p => ({ index: p.index, group: p.group, number: p.number })), palettePreview,
    pushboxes: {}, pushOverrides: [], runtimeDefaults: {}, runtimeEntries: [], runtimeDrafts: {}, dummyCollision: { enabled: false },
    collisionCapabilities: { indexed: false, status: 'unavailable', reason: 'Stage AIR source uses authored Clsn1 and Clsn2 boxes.' },
    sourceFiles: [], sourceFindings: [], exactActionUses: unavailable('Character state references do not apply to Stage AIR.'), collisionReferences: unavailable('Character collision references do not apply to Stage AIR.'), referenceSummaries: {},
    experience: { label: 'Stage AIR', title: 'Embedded Stage AIR', guidance: 'This Action is authored in the Stage DEF. Sprite previews use the Stage BGDef SFF.', guidanceOpen: true },
    sourceState: sourceState(document, path.basename(session.filename)), collisionAppearance: null, collisionAppearanceConfigured: false, transfer: null
  };
  return model;
}

function selectedBlock(session, document, action) {
  const snapshot = scanStageAir(document.getText(), document.version, session.filename);
  const number = Number(action), blocks = snapshot.blocks.filter(block => block.number === number);
  if (!Number.isSafeInteger(number) || blocks.length !== 1 || blocks[0].shadowedDuplicate) throw new Error(`Action ${action} is missing or duplicated. Resolve it in Stage source before visual editing.`);
  return { snapshot, identity: blockIdentity(blocks[0]) };
}

function assertLiveDocument(api, session, document, snapshot) {
  if (session.disposed || session.panel?.visible === false || !document || document.isClosed === true || fileKey(document.fileName) !== fileKey(session.filename)) throw new Error('The Stage AIR editor or exact Stage DEF document closed during review. Reopen and review the edit again.');
  if (Array.isArray(api.workspace.textDocuments) && !api.workspace.textDocuments.includes(document)) throw new Error('The exact Stage DEF document was closed or reopened during review. Reopen and review the edit again.');
  if (document.version !== snapshot.version || digest(document.getText()) !== snapshot.fingerprint) throw new Error('The Stage DEF changed during review. Refresh before editing.');
}

async function applyPlan(api, session, document, snapshot, plan) {
  assertLiveDocument(api, session, document, snapshot);
  const replacement = applyStageAirPlanToDocument(snapshot, document, plan), edit = new api.WorkspaceEdit();
  edit.replace(document.uri, new api.Range(document.positionAt(replacement.start), document.positionAt(replacement.end)), replacement.text);
  if (!await api.workspace.applyEdit(edit)) throw new Error('VS Code rejected the bounded Stage AIR edit.');
  if (digest(document.getText()) !== plan.afterFingerprint || !Number.isSafeInteger(document.version) || document.version <= snapshot.version || (Array.isArray(api.workspace.textDocuments) && !api.workspace.textDocuments.includes(document))) throw new Error('The Stage DEF edit could not be verified after VS Code applied it. Refresh the source before another edit.');
  await publishModel(session, document);
  return document;
}

async function publishModel(session, document) {
  const model = stageAirModel(session, document);
  await session.panel.webview.postMessage({ type: 'model', model });
  return model;
}

async function handleStageAirMessage(api, session, message) {
  if (!message || typeof message.type !== 'string' || session.disposed) return false;
  const post = value => session.panel.webview.postMessage(value), document = await api.workspace.openTextDocument(api.Uri.file(session.filename));
  if (fileKey(document.fileName) !== fileKey(session.filename)) throw new Error('The exact Stage DEF document is unavailable.');
  const snapshot = scanStageAir(document.getText(), document.version, session.filename);
  const mutation = new Set(['updateFrame','updateFrameDirectives','insertFrame','deleteFrame','moveFrame','createAction','duplicateAction','deleteActions','stageCollisionReview','stageCollisionApply']);
  if (mutation.has(message.type) && (message.sourceFingerprint !== snapshot.fingerprint || message.sourceVersion !== document.version || message.generation !== document.version)) throw new Error('The Stage DEF changed since this Action was displayed. Refresh the Stage AIR editor before editing.');
  if (mutation.has(message.type) && message.type !== 'createAction' && message.type !== 'deleteActions') {
    const action = Number(message.action ?? message.sourceAction), block = snapshot.blocks.find(item => item.number === action && item.ordinal === 0);
    if (!block || JSON.stringify(message.stageBlock) !== JSON.stringify(blockIdentity(block))) throw new Error('The selected embedded Stage Action changed. Refresh before editing.');
  }
  const editAction = (type, action, options) => { const selected = selectedBlock(session, document, action); return { snapshot: selected.snapshot, plan: planStageAirEdit(selected.snapshot, selected.identity, { ...options, type }) }; };
  if (message.type === MESSAGE_TYPE) { await session.toolbarDispatcher.dispatch('stage.workspace', message); return true; }
  if (await require('./asset_workspace').handle(message, session.panel)) return true;
  if (require('./stage_air_toolbar_intent').stageAirLegacyToolbarIntent(message)) {
    await session.toolbarDispatcher.dispatch('stage.workspace', { type: MESSAGE_TYPE, slotId: 'animations' });
    return true;
  }
  if (await require('./shared_workspace_header').handle(message, session, 'stage')) return true;
  switch (message.type) {
    case 'revokeCollisionEditReview': session.collisionReview = null; return true;
    case 'ikemakerEntityHeaderReady': case 'viewerToolbarActivityReady': case 'viewerLayoutReady': case 'viewerSelectionChanged': case 'viewerHistoryRestored': case 'ikemenViewer': return true;
    case 'stageOpenDef': {
      const selected = snapshot.blocks.filter(block => block.number === session.selectedAction);
      const line = selected.length === 1 ? selected[0].line - 1 : 0;
      await require('./viewer_navigation').openViewerSource(session.filename, line, require('./viewer_navigation').currentPoint(session.filename, 'stage', {}, session.panel)); return true;
    }
    case 'actionSelected': session.selectedAction = Number(message.action); session.selectedFrame = Number(message.frameIndex) || 0; return true;
    case 'tickOnionFrame': await post(require('./air_tick_onion').spriteReply(session, message, spriteDataUri)); return true;
    case 'frame': case 'thumbnails': case 'actionThumbnails': {
      let onionWarning = '';
      const candidates = message.type === 'frame' ? [{ slot: 0, group: Number(message.frame?.group), index: Number(message.frame?.index), order: 0 }] : message.type === 'thumbnails' ? (message.frames || []).map((frame, index) => ({ frame: index, group: Number(frame.group), index: Number(frame.index), paletteIndex: frame.paletteIndex })) : (message.actions || []).map(action => { const frame = (action.frames || []).find(candidate => session.byKey.has(`${candidate.group},${candidate.index}`)); return frame && { action: Number(action.number), group: frame.group, index: frame.index, paletteIndex: frame.paletteIndex }; }).filter(Boolean);
      if (message.type === 'frame' && message.onion) {
        try { const onion = require('./air_onion_skin_model').snapshot(snapshot.projection, message.onion); candidates.unshift(...onion.layers.map(frame => ({ slot: `onion:${frame.relative}`, group: frame.group, index: frame.index, order: -100 + frame.relative, onion: true, opacity: frame.opacity, relative: frame.relative, frame }))); }
        catch (error) { onionWarning = 'Element onion unavailable: ' + error.message; }
      }
      const items = candidates.map(candidate => { const sprite = session.byKey.get(`${candidate.group},${candidate.index}`); if (!sprite) return null; const palette = candidate.onion && message.followSpritePalette === true ? null : Number.isInteger(candidate.paletteIndex) ? candidate.paletteIndex : Number.isInteger(message.paletteIndex) ? message.paletteIndex : null; return { ...candidate, cacheKey: `${candidate.group},${candidate.index}:p${palette ?? 'sprite'}`, sprite: { axisX: sprite.axisX, axisY: sprite.axisY }, dataUri: spriteDataUri(session.archive, sprite, palette) }; }).filter(Boolean);
      await post({ type: message.type === 'frame' ? 'images' : message.type, paletteGeneration: message.paletteGeneration, actionNumber: message.actionNumber, ...(message.type === 'frame' ? { requestId: message.requestId, onionWarning } : {}), items }); return true;
    }
    case 'updateFrame': case 'updateFrameDirectives': case 'insertFrame': case 'deleteFrame': case 'moveFrame': {
      const types = { updateFrame: 'update-frame', updateFrameDirectives: 'update-directives', insertFrame: 'insert-frame', deleteFrame: 'delete-frame', moveFrame: 'move-frame' };
      const { snapshot: baseline, plan } = editAction(types[message.type], message.action, message);
      if (message.type === 'moveFrame') { const answer = await api.window.showWarningMessage(`Move Stage Action ${message.action} element ${Number(message.frameIndex) + 1} ${message.direction}?`, { modal: true, detail: 'The exact embedded Action block will change. One VS Code Undo restores it.' }, 'Move Frame'); if (answer !== 'Move Frame') { await post({ type: 'actionMutationCancelled', actionRequestId: message.actionRequestId }); return true; } }
      await applyPlan(api, session, document, baseline, plan);
      await post({ type: 'frameEditApplied', action: Number(message.action), frameIndex: message.type === 'insertFrame' ? Number(message.frameIndex) + 1 : message.type === 'deleteFrame' ? Math.max(0, Number(message.frameIndex) - 1) : Number(message.frameIndex), status: 'Stage DEF animation updated in the open document. VS Code Undo is available.' });
      if (message.type === 'moveFrame') await post({ type: 'actionMutationApplied', actionRequestId: message.actionRequestId, action: Number(message.action) });
      return true;
    }
    case 'createAction': {
      const draft = message.draft || {}, plan = planStageAirCreate(snapshot, { action: draft.number, group: draft.group, index: draft.index, x: draft.x, y: draft.y, time: draft.time, flags: draft.flags, comment: draft.comment, loopStart: draft.loopStart });
      const answer = await api.window.showWarningMessage(`Create Stage Action ${plan.action}?`, { modal: true, detail: 'Add one embedded AIR Action to the open Stage DEF. One VS Code Undo restores the source.' }, 'Create Action');
      if (answer !== 'Create Action') { await post({ type: 'actionMutationCancelled', actionRequestId: message.actionRequestId }); return true; }
      await applyPlan(api, session, document, snapshot, plan); session.selectedAction = plan.action;
      await post({ type: 'actionMutationApplied', actionRequestId: message.actionRequestId, action: plan.action }); await post({ type: 'selectAction', action: plan.action }); return true;
    }
    case 'duplicateAction': {
      const sourceAction = Number(message.sourceAction), suggested = Math.max(0, sourceAction + 1);
      const input = await api.window.showInputBox({ title: `Duplicate Stage Action ${sourceAction} as`, value: String(suggested), validateInput: value => Number.isSafeInteger(Number(value)) && !snapshot.blocks.some(block => block.number === Number(value)) ? undefined : 'Choose a unique whole Action number.' });
      if (input === undefined) { await post({ type: 'actionMutationCancelled', actionRequestId: message.actionRequestId }); return true; }
      const { snapshot: baseline, plan } = editAction('duplicate-action', sourceAction, { destination: Number(input) });
      const answer = await api.window.showWarningMessage(`Duplicate Stage Action ${sourceAction} as ${input}?`, { modal: true, detail: 'Only the exact embedded Action block is copied. One VS Code Undo restores the source.' }, 'Duplicate Action');
      if (answer !== 'Duplicate Action') { await post({ type: 'actionMutationCancelled', actionRequestId: message.actionRequestId }); return true; }
      await applyPlan(api, session, document, baseline, plan); session.selectedAction = Number(input);
      await post({ type: 'actionMutationApplied', actionRequestId: message.actionRequestId, action: Number(input) }); await post({ type: 'selectAction', action: Number(input) }); return true;
    }
    case 'deleteActions': {
      const actions = [...new Set((message.actions || []).map(Number))];
      if (!actions.length || actions.length > 128 || actions.some(number => !Number.isSafeInteger(number))) throw new Error('Select 1 to 128 exact Stage Actions to delete.');
      if (!Array.isArray(message.stageBlocks) || actions.some(action => { const block = snapshot.blocks.find(item => item.number === action && item.ordinal === 0); return !block || !message.stageBlocks.some(item => item.action === action && JSON.stringify(item.identity) === JSON.stringify(blockIdentity(block))); })) throw new Error('The marked Stage Actions changed. Refresh before deleting.');
      const plans = actions.map(action => editAction('delete-action', action, {}).plan).sort((a, b) => b.start - a.start);
      const answer = await api.window.showWarningMessage(`Delete ${actions.length} Stage Action${actions.length === 1 ? '' : 's'}?`, { modal: true, detail: 'Only selected embedded Action blocks are removed. Other Stage DEF sections and trailing comments remain. One VS Code Undo restores them.' }, 'Delete Animations');
      if (answer !== 'Delete Animations') { await post({ type: 'actionMutationCancelled', actionRequestId: message.actionRequestId }); return true; }
      const edit = new api.WorkspaceEdit(); assertLiveDocument(api, session, document, snapshot); applyStageAirPlanToDocument(snapshot, document, plans[0]);
      let expected = snapshot.source; for (const plan of plans) expected = expected.slice(0, plan.start) + expected.slice(plan.end);
      for (const plan of plans) edit.replace(document.uri, new api.Range(document.positionAt(plan.start), document.positionAt(plan.end)), '');
      if (!await api.workspace.applyEdit(edit)) throw new Error('VS Code rejected the Stage Action deletion.');
      if (document.getText() !== expected || !Number.isSafeInteger(document.version) || document.version <= snapshot.version || (Array.isArray(api.workspace.textDocuments) && !api.workspace.textDocuments.includes(document))) throw new Error('The Stage Action deletion could not be verified. Refresh the source.');
      session.selectedAction = null; await publishModel(session, document);
      await post({ type: 'actionMutationApplied', actionRequestId: message.actionRequestId, action: null }); return true;
    }
    case 'stageCollisionReview': {
      if (!Number.isSafeInteger(message.reviewRequestId) || message.reviewRequestId <= 0) throw new Error('Stage collision review requires a current positive request ID.');
      if (!['clsn1','clsn2'].includes(message.kind) || !['element','default'].includes(message.scope) || !Array.isArray(message.boxes) || message.boxes.length > 256 || message.boxes.some(box => !Array.isArray(box) || box.length !== 4 || box.some(value => !Number.isSafeInteger(Number(value)) || Math.abs(Number(value)) > 2147483647))) throw new Error('Stage AIR collision boxes require Clsn1/Clsn2 and up to 256 finite int32 rectangles.');
      const { snapshot: baseline, plan } = editAction('update-collision', message.action, { frameIndex: Number(message.frameIndex), kind: message.kind, scope: message.scope, boxes: message.boxes.map(box => box.map(Number)) });
      const token = crypto.randomBytes(24).toString('hex');
      session.collisionReview = { token, snapshot: baseline, plan, action: Number(message.action), frameIndex: Number(message.frameIndex), kind: message.kind, scope: message.scope };
      await post({ type: 'stageCollisionReviewReady', reviewRequestId: message.reviewRequestId, token, summary: `Stage Action ${message.action} · element ${Number(message.frameIndex) + 1} · ${message.kind} ${message.scope} · ${message.boxes.length} box(es)`, before: plan.before.slice(0, 4096), replacement: plan.replacement.slice(0, 4096), action: Number(message.action), frameIndex: Number(message.frameIndex), kind: message.kind, scope: message.scope }); return true;
    }
    case 'stageCollisionApply': {
      const review = session.collisionReview;
      if (!review || typeof message.token !== 'string' || message.token !== review.token || Number(message.action) !== review.action) throw new Error('The Stage collision review is missing or stale. Review the boxes again.');
      const answer = await api.window.showWarningMessage(`Apply reviewed ${review.kind} boxes to Stage Action ${review.action}?`, { modal: true, detail: 'Only the exact embedded Action block changes. One VS Code Undo restores the edit.' }, 'Apply Stage Collision');
      if (answer !== 'Apply Stage Collision') { session.collisionReview = null; await post({ type: 'stageCollisionApplied', action: review.action, frameIndex: review.frameIndex, status: 'cancelled' }); return true; }
      session.collisionReview = null;
      await applyPlan(api, session, document, review.snapshot, review.plan);
      await post({ type: 'stageCollisionApplied', action: review.action, frameIndex: review.frameIndex, status: 'applied' }); return true;
    }
    case 'saveAir': {
      const result = await saveSourceDocument(document, path.basename(session.filename));
      await post({ type: 'sourceSaveStatus', state: sourceState(document, path.basename(session.filename)), message: result.message }); return true;
    }
    case 'reveal': {
      const line = Math.max(0, Math.min(document.lineCount - 1, Number(message.line) - 1 || 0));
      await require('./viewer_navigation').openViewerSource(session.filename, line, require('./viewer_navigation').currentPoint(session.filename, 'stage', {}, session.panel)); return true;
    }
    case 'openSff': {
      if (!session.sffPath || session.sffError || !fs.existsSync(session.sffPath)) { await api.window.showInformationMessage(session.sffError ? `The Stage BGDef SFF could not be decoded: ${session.sffError}. Open the Stage DEF to correct BGDef spr.` : 'Stage BGDef does not resolve an SFF. Open the Stage DEF and set BGDef spr to the Stage sprite archive.'); return true; }
      await api.commands.executeCommand('sff.openViewer', api.Uri.file(session.sffPath), undefined, { group: Number(message.group), number: Number(message.number) }); return true;
    }
    case 'setPreviewPalette': {
      const value = message.paletteIndex;
      if (value !== null && (!Number.isInteger(value) || !session.archive.palettes.some(palette => palette.index === value))) throw new Error('Choose a palette from the Stage BGDef SFF.');
      if (message.scope === 'screen') session.paletteIndex = value;
      else if (message.scope === 'group' && Number.isSafeInteger(Number(message.group))) { session.groupPalettes ||= {}; if (value === null) delete session.groupPalettes[String(message.group)]; else session.groupPalettes[String(message.group)] = value; }
      else throw new Error('The Stage palette preview scope is invalid.');
      const model = stageAirModel(session, document); await post({ type: 'palettePreviewChanged', preferences: model.palettePreview }); return true;
    }
    case 'clearGroupPreviewPalette': {
      if (!Number.isSafeInteger(Number(message.group))) throw new Error('The Stage sprite group is invalid.');
      if (session.groupPalettes) delete session.groupPalettes[String(message.group)];
      const model = stageAirModel(session, document); await post({ type: 'palettePreviewChanged', preferences: model.palettePreview }); return true;
    }
    default: throw new Error(`This control is not available for embedded Stage AIR: ${message.type}.`);
  }
}

async function openStageAirWorkspace(api, filename, options = {}) {
  filename = path.resolve(filename); const key = fileKey(filename), document = await api.workspace.openTextDocument(api.Uri.file(filename));
  const asset = stageAirAssets(filename, document.getText(), options.resolveAsset);
  let session = panels.get(key);
  if (session && !session.disposed) { session.panel.reveal(options.viewColumn || session.panel.viewColumn, options.preserveFocus === true); session.resolveAsset = options.resolveAsset || session.resolveAsset; if (Number.isSafeInteger(options.action)) { session.selectedAction = options.action; session.selectedFrame = 0; } await publishModel(session, document); if (Number.isSafeInteger(options.action)) await session.panel.webview.postMessage({ type: 'selectAction', action: options.action }); return session; }
  const panel = require('./viewer_group').trackViewerPanel(api.window.createWebviewPanel('ikemenStageAirWorkspace', `${path.basename(filename)} · Stage AIR`, options.viewColumn || api.ViewColumn.Beside, { enableScripts: true, retainContextWhenHidden: true }));
  session = { filename, panel, archive: { palettes: [], sprites: [] }, sffPath: asset.sffPath, sffReference: asset.sffReference, resolveAsset: options.resolveAsset, byKey: new Map(), selectedAction: Number.isSafeInteger(options.action) ? options.action : null, selectedFrame: 0, disposed: false };
  session.toolbarDispatcher = stageAirToolbarDispatcher(api, session);
  panels.set(key, session); panel.onDidDispose(() => { session.disposed = true; if (panels.get(key) === session) panels.delete(key); });
  require('./viewer_navigation').registerSourcePanel(panel, filename);
  const model = stageAirModel(session, document); panel.webview.html = require('./webview_policy').protect(require('./asset_workspace').decorate(panel,filename,'stage',require('./air_viewer').viewerHtml(model),Number.isSafeInteger(options.action)),panel.webview.cspSource);
  session.queue = Promise.resolve();
  panel.webview.onDidReceiveMessage(message => { const execute = () => handleStageAirMessage(api, session, message); session.queue = session.queue.then(execute, execute).catch(error => { if (!session.disposed) panel.webview.postMessage({ type: 'error', message: error.message, operation: message?.type, ...(message?.type === 'stageCollisionReview' && Number.isSafeInteger(message.reviewRequestId) && message.reviewRequestId > 0 ? { reviewRequestId: message.reviewRequestId } : {}) }); api.window.showWarningMessage(error.message); }); });
  session.changeSubscription = api.workspace.onDidChangeTextDocument(event => { if (!session.disposed && fileKey(event.document.fileName) === key) publishModel(session, event.document).catch(() => {}); });
  panel.onDidDispose(() => session.changeSubscription.dispose());
  session.saveSubscription = api.workspace.onDidSaveTextDocument?.(saved => { if (!session.disposed && session.sffPath && fileKey(saved.fileName) === fileKey(session.sffPath)) api.workspace.openTextDocument(api.Uri.file(filename)).then(document => publishModel(session, document)).catch(() => {}); });
  if (session.saveSubscription) panel.onDidDispose(() => session.saveSubscription.dispose());
  session.viewSubscription = panel.onDidChangeViewState?.(event => { if (session.disposed || event.webviewPanel?.active !== true) return; api.workspace.openTextDocument(api.Uri.file(filename)).then(document => publishModel(session, document)).catch(() => {}); });
  if (session.viewSubscription) panel.onDidDispose(() => session.viewSubscription.dispose());
  panel.reveal(panel.viewColumn || options.viewColumn, options.preserveFocus === true);
  return session;
}

module.exports = { stageAirAssets, stageAirToolbarModel, stageAirToolbarDispatcher, stageAirModel, handleStageAirMessage, openStageAirWorkspace };
