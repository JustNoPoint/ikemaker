'use strict';

const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { preferredViewerColumn, trackViewerPanel } = require('./viewer_group');
const contextRegistry = require('./authoring_context_registry');
const { AuthoringPresentationPreference, NATIVE, INTEGRATED, ASK } = require('./authoring_presentation_preference');
const { AuthoringViewState } = require('./authoring_view_state');
const { createNavigationState, reduceNavigation, projectNavigation } = require('./authoring_navigation_model');
const { createAuthoringShellModel, classifyDocument } = require('./authoring_shell_model');
const { openSourceDraft, activeSourceDraft, fingerprint } = require('./authoring_source_draft');
const { renderAuthoringShellHtml, validatedAuthoringShellMessage } = require('./authoring_shell_webview');
const { adapt } = require('./universal_toolbar_adapter');
const { MESSAGE_TYPE, createUniversalToolbarDispatcher } = require('./universal_toolbar_webview');
const { createBrowserRegistry, PROVIDER_IDS } = require('./authoring_browser_registry');
const { createAuthoringBrowserWorkspace } = require('./authoring_browser_workspace');
const { ExactSourceRegistry } = require('./exact_source_routes');
const viewerClose = require('./viewer_close');
const viewerToolbar = require('./viewer_toolbar');
const { AuthoringRecoveryStore } = require('./authoring_recovery_store');
const { sharedAuthoringCardHandsStore, reconcileCardHands, MAX_HANDS, MAX_LABEL_BYTES } = require('./authoring_card_hands');
const { createDestinationStatus, statusTokens, projectDestinationStatuses, countDiagnostics, CoalescedEventScheduler } = require('./authoring_destination_status');
const { buildAuthoringBrowserModel, aliasProjection, applyAliasDiscovery, flattenItems, opaque } = require('./authoring_browser_model');
const { buildAdaptationDraft, validReplacement } = require('./similar_code_draft');
const { onDidChangeProjectRegistry } = require('./project_registry_events');
const { onDidChangeEngineCapabilities } = require('./engine_capability_events');
const { buildProjectSymbolCatalog } = require('./project_symbol_catalog');
const { buildCurrentBlockExplanation, boundedCatalogMembership } = require('./current_block_explanation');
const glossaryMetadataApi=require('./identifier_glossary_metadata');
const personalExamplesApi=require('./personal_examples');
const {IdentifierGlossaryPersistence}=require('./identifier_glossary_persistence');
const resumeContextApi=require('./resume_context');
const { attachedTextLayout, attachedLayoutShape } = require('./text_editor_layout');
const { createMinimumWidthController } = require('./companion_browser_layout');
const codingAssistantActions=require('./coding_assistance_action_host');

const VIEW_TYPE = 'ikemenAuthoringWorkspace';
const STATE_KEY = 'ikemaker.authoringViewState.v1';
const DRAFT_STATE_KEY = 'ikemaker.authoringDraftRecovery.v1';
const CARD_HANDS_STATE_KEY = 'ikemaker.authoringCardHands.v1';
const GLOSSARY_METADATA_STATE_KEY='ikemaker.identifierGlossaryMetadata.v1';
const SERIALIZED_STATE_SCHEMA = 'ikemaker.code-viewer-state';
const SERIALIZED_STATE_VERSION = 1;
const ASSISTANCE_RESTORE_SCHEMA='ikemaker.coding-assistance-restore';
const ASSISTANCE_RESTORE_VERSION=1;
const MAX_ASSISTANCE_RESTORE_BYTES=256*1024;
const panels = new Map();
const groupedPanels = new Map();
const groupedFileOwners = new Map();
const codingSetQueues = new Map();
let api, extensionContext, preference, viewStates, browserPanel, browserWorkspace, browserBoundContext, browserMinimumWidth, sourceRegistry, recoveryStore, cardHandsStore, glossaryMetadataStore, glossaryPersistence, resumeContextPersistence, authoringBrowserProviders = Object.freeze({}), authoringBrowserCapabilityResolver = null, browserRefreshTimer = null, browserRefreshEpoch = 0, browserRefreshTail = Promise.resolve(), browserRefreshProviders = new Set();
const usedAdaptationDrafts=new Set();
const pendingAdaptationDrafts=new Set();

function key(filename) { return path.resolve(filename || '').toLowerCase(); }
function plainExact(value, keys) {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const actual = Object.keys(value).sort(), expected = [...keys].sort();
  return actual.length === expected.length && actual.every((item, index) => item === expected[index]);
}
function boundedString(value, max, allowEmpty = false) { return typeof value === 'string' && (allowEmpty || value.length > 0) && Buffer.byteLength(value, 'utf8') <= max; }
function serializedPanelState(uri, grouped) { return Object.freeze({ schema:SERIALIZED_STATE_SCHEMA, version:SERIALIZED_STATE_VERSION, uri:String(uri), grouped:Boolean(grouped) }); }
function parseSerializedPanelState(value) {
  if (plainExact(value, ['schema','version','uri','grouped']) && value.schema === SERIALIZED_STATE_SCHEMA && value.version === SERIALIZED_STATE_VERSION && boundedString(value.uri, 8192) && typeof value.grouped === 'boolean') return Object.freeze({ uri:value.uri, grouped:value.grouped, legacy:false });
  if (plainExact(value, ['uri']) && boundedString(value.uri, 8192)) return Object.freeze({ uri:value.uri, grouped:false, legacy:true });
  return null;
}
function serializedAssistanceState(value={}) {
  const files=boundedCodingPaths(value.files||value.connectedFiles).slice(0,256);
  if(!files.length)return null;
  const root=typeof value.root==='string'&&path.isAbsolute(value.root)?path.resolve(value.root):'';
  const candidateOwner=realFile(value.ownerDef),ownerDef=candidateOwner&&path.extname(candidateOwner).toLowerCase()==='.def'&&files.some(file=>key(file)===key(candidateOwner))?candidateOwner:'';
  const context={type:String(value.type||value.kind||'project').slice(0,64),key:String(value.key||value.identity||value.id||root||path.dirname(files[0])).slice(0,8192),label:String(value.label||path.basename(root||path.dirname(files[0]))).slice(0,256),root,ownerDef,files};
  const selected=value.selection;
  if(selected&&files.some(file=>key(file)===key(selected.filename||''))&&Number.isSafeInteger(selected.line)&&selected.line>=0)context.source={filename:path.resolve(selected.filename),line:selected.line};
  const state={schema:ASSISTANCE_RESTORE_SCHEMA,version:ASSISTANCE_RESTORE_VERSION,context};
  return Buffer.byteLength(JSON.stringify(state),'utf8')<=MAX_ASSISTANCE_RESTORE_BYTES?Object.freeze(state):null;
}
function parseAssistanceState(value) {
  if(!plainExact(value,['schema','version','context'])||value.schema!==ASSISTANCE_RESTORE_SCHEMA||value.version!==ASSISTANCE_RESTORE_VERSION||Buffer.byteLength(JSON.stringify(value),'utf8')>MAX_ASSISTANCE_RESTORE_BYTES)return null;
  const context=value.context,legacy=plainExact(context,['type','key','label','root','files']),current=plainExact(context,['type','key','label','root','ownerDef','files'])||plainExact(context,['type','key','label','root','ownerDef','files','source']);if((!legacy&&!current)||!boundedString(context.type,64)||!boundedString(context.key,8192)||!boundedString(context.label,256,true)||!boundedString(context.root,8192,true)||!Array.isArray(context.files)||!context.files.length||context.files.length>256||(context.root&&!path.isAbsolute(context.root)))return null;
  let root='';if(context.root){try{const lexical=path.resolve(context.root),real=fs.realpathSync.native?fs.realpathSync.native(lexical):fs.realpathSync(lexical);if(key(lexical)!==key(real)||!fs.statSync(real).isDirectory())return null;root=real;}catch(_){return null;}}
  const files=[],seen=new Set();for(const candidate of context.files){const file=realFile(candidate);if(!file||seen.has(key(file)))return null;seen.add(key(file));files.push(file);}
  let ownerDef='';if(current&&context.ownerDef){ownerDef=realFile(context.ownerDef);if(!ownerDef||path.extname(ownerDef).toLowerCase()!=='.def'||!seen.has(key(ownerDef)))return null;}
  let selection;
  if(context.source){if(!plainExact(context.source,['filename','line'])||typeof context.source.filename!=='string'||!seen.has(key(context.source.filename))||!Number.isSafeInteger(context.source.line)||context.source.line<0)return null;selection={filename:path.resolve(context.source.filename),line:context.source.line};}
  return Object.freeze({schema:value.schema,version:value.version,context:Object.freeze({...(selection?{selection,sourceBinding:ownerDef?'assigned-resource':'standalone-source'}:{}),type:context.type,key:context.key,label:context.label,root,ownerDef,files:Object.freeze(files),connectedFiles:Object.freeze([...files]),activeSurfaceId:'code.authoring-browser'})});
}
function realFile(filename) {
  if (!boundedString(filename, 4096) || !path.isAbsolute(filename)) return null;
  try {
    const lexical = path.resolve(filename), real = fs.realpathSync.native ? fs.realpathSync.native(lexical) : fs.realpathSync(lexical);
    if (key(lexical) !== key(real) || !fs.statSync(real).isFile()) return null;
    return real;
  } catch (_) { return null; }
}
function validateCharacterCodingDescriptor(value) {
  if (!plainExact(value, ['origin','taskId','sessionId','files','context']) || value.origin !== 'character-essentials' || !boundedString(value.taskId, 128) || !boundedString(value.sessionId, 4096) || !Array.isArray(value.files) || value.files.length > 512) return null;
  const context = value.context;
  if (!plainExact(context, ['type','key','label','root','files']) || context.type !== 'character' || !boundedString(context.key, 4096) || !boundedString(context.root, 4096) || !boundedString(context.label, 256, true) || !Array.isArray(context.files) || context.files.length !== value.files.length) return null;
  let root;
  try {
    const lexical = path.resolve(context.root), real = fs.realpathSync.native ? fs.realpathSync.native(lexical) : fs.realpathSync(lexical);
    if (key(lexical) !== key(real) || !fs.statSync(real).isDirectory()) return null;
    root = real;
  } catch (_) { return null; }
  if (key(context.key) !== key(root)) return null;
  const session = realFile(value.sessionId);
  if (!session || path.extname(session).toLowerCase() !== '.def' || key(path.dirname(session)) !== key(root)) return null;
  const files = [], seen = new Set();
  for (let index = 0; index < value.files.length; index += 1) {
    if (value.files[index] !== context.files[index]) return null;
    const file = realFile(value.files[index]); if (!file) return null;
    const identity = key(file); if (seen.has(identity)) return null;
    seen.add(identity); files.push(file);
  }
  if (!files.length) return null;
  return Object.freeze({ origin: value.origin, taskId: value.taskId, sessionId: session, files: Object.freeze(files), context: Object.freeze({ type:'character', key:root, label:context.label, root, ownerDef:session, files:Object.freeze([...files]) }), identity:`character\0${key(session)}` });
}
function nonce() { return crypto.randomBytes(16).toString('hex'); }
function explicitPreference() {
  const inspected = api.workspace.getConfiguration('ikemenZss').inspect?.('authoring.presentation') || {};
  return inspected.workspaceFolderValue ?? inspected.workspaceValue ?? inspected.globalValue;
}
function preferenceStorage() {
  return {
    get(name, fallback) { const configured = explicitPreference(); if (configured !== undefined) return configured; const legacy = extensionContext.globalState.get(name); return legacy === undefined ? fallback : legacy; },
    async update(_name, value) {
      const configured = api.workspace.getConfiguration('ikemenZss');
      // The former Settings property is absent in current packages. Keep remembered
      // explicit coding choices in the existing preference store instead of asking
      // VS Code to update an unregistered configuration key.
      if(!configured.inspect?.('authoring.presentation')){await extensionContext.globalState.update('ikemaker.authoringPresentationPreference',value===undefined?ASK:value);return;}
      try{await configured.update('authoring.presentation', value === undefined ? ASK : value, api.ConfigurationTarget?.Global ?? true);}
      catch(error){
        // Some VS Code hosts return an inspect object even for an unregistered key.
        const configuration=require('../package.json').contributes?.configuration,sections=Array.isArray(configuration)?configuration:[configuration];
        if(sections.some(section=>Object.prototype.hasOwnProperty.call(section?.properties||{},'ikemenZss.authoring.presentation')))throw error;
        await extensionContext.globalState.update('ikemaker.authoringPresentationPreference',value===undefined?ASK:value);return;
      }
      await extensionContext.globalState.update('ikemaker.authoringPresentationPreference', undefined);
    }
  };
}
async function askPresentation(items, details) {
  const picked = await api.window.showQuickPick(items.map((item) => ({ ...item, detail: details.preference === 'unset' ? 'This choice controls only explicit Open Coding Viewer actions. Ordinary text files still open normally.' : item.description })), {
    title: details.preference === ASK ? 'Coding viewer for this task' : 'How should IKEMaker open coding tools?',
    placeHolder: 'Coding tools keep the normal editor and add Navigation and Assistance tabs. Native-only opens no companion browsers. Esc keeps the requested native route.',
    ignoreFocusOut: true
  });
  return picked || null;
}

function seedUri(uri) { return uri?.fsPath ? uri : api.window.activeTextEditor?.document?.uri; }
async function sourceDocument(uri) { return api.workspace.openTextDocument(uri); }
function canonicalRegularFiles(values) {
  const result = [], seen = new Set();
  for (const value of Array.isArray(values) ? values.slice(0, 512) : []) {
    const filename = typeof value === 'string' ? value : value?.fsPath;
    if (typeof filename !== 'string' || !path.isAbsolute(filename)) continue;
    const resolved = path.resolve(filename), identity = key(resolved);
    if (seen.has(identity)) continue;
    try { if (!fs.statSync(resolved).isFile()) continue; } catch (_) { continue; }
    seen.add(identity); result.push(resolved);
  }
  return result;
}
function boundedCodingPaths(values) {
  const result = [], seen = new Set();
  for (const value of Array.isArray(values) ? values.slice(0, 512) : []) {
    const filename = typeof value === 'string' ? value : value?.fsPath;
    if (typeof filename !== 'string' || !path.isAbsolute(filename)) continue;
    const resolved = path.resolve(filename), identity = key(resolved);
    if (!seen.has(identity)) { seen.add(identity); result.push(resolved); }
  }
  return result;
}
function normalizedCodingContext(value, files) {
  if (!value || value.type !== 'character' || typeof value.root !== 'string' || !path.isAbsolute(value.root)) return null;
  const root = path.resolve(value.root), contextFiles = canonicalRegularFiles(files);
  const ownerDef=typeof value.ownerDef==='string'&&path.isAbsolute(value.ownerDef)&&path.extname(value.ownerDef).toLowerCase()==='.def'&&(value.files||[]).some(file=>typeof file==='string'&&key(file)===key(value.ownerDef))?path.resolve(value.ownerDef):'';
  return { type: 'character', key: root, label: String(value.label || path.basename(root)).slice(0, 256), root, ownerDef, files: contextFiles, activeSurfaceId: 'code.authoring-workspace' };
}
function serializeCodingSet(scope, operation) {
  const previous = codingSetQueues.get(scope) || Promise.resolve();
  const result = previous.then(operation, operation);
  const tail = result.then(() => undefined, () => undefined);
  codingSetQueues.set(scope, tail);
  return result.finally(() => { if (codingSetQueues.get(scope) === tail) codingSetQueues.delete(scope); });
}
function mapGroupedFile(filename, record) {
  const identity = key(filename), owners = groupedFileOwners.get(identity) || new Set(); owners.add(record); groupedFileOwners.set(identity, owners);
}
function unmapGroupedRecord(record) {
  for (const [identity, owners] of groupedFileOwners) { owners.delete(record); if (!owners.size) groupedFileOwners.delete(identity); }
}
function connectedDocuments(document) {
  const directory = path.dirname(document.fileName || document.uri.fsPath);
  const supported = [];
  for (const candidate of api.workspace.textDocuments || []) {
    if (path.dirname(candidate.fileName || candidate.uri?.fsPath || '') !== directory) continue;
    const classification = classifyDocument(candidate, { configuration: api.workspace.getConfiguration('ikemenZss', candidate.uri) });
    if (classification.supported) supported.push(candidate);
  }
  if (!supported.some((item) => key(item.fileName) === key(document.fileName))) supported.unshift(document);
  return supported;
}
function navigationFor(documents, current, cardHands, mode = cardHands?.mode || 'tabs', statuses = new Map()) {
  const items = projectDestinationStatuses(documents.map((document) => ({ id: key(document.fileName), title: path.basename(document.fileName), filename: document.fileName, kind: path.extname(document.fileName).slice(1).toLowerCase() })),statuses);
  const families = [
    { id: 'states-code', label: 'States & Code', kinds: ['zss','cns','st','lua','txt'] },
    { id: 'commands-input', label: 'Commands & Input', kinds: ['cmd','inp','jnp','dat'] },
    { id: 'visual-sources', label: 'Visual Sources', kinds: ['air','def'] }
  ];
  return createNavigationState({
    items,
    customGroups:(cardHands?.hands || []).map((hand) => ({ id:hand.id, label:hand.label, itemIds:hand.memberIds })),
    autoGroups: families.filter((family) => items.some((item) => family.kinds.includes(item.kind))).map((family) => ({ id: family.id, label: family.label, itemIds: items.filter((item) => family.kinds.includes(item.kind)).map((item) => item.id) })),
    order:cardHands?.fileOrder,
    collapsedHandIds:cardHands?.collapsedHandIds,
    currentId: key(current.fileName), mode
  });
}
function toolbarModel(seed='') {
  const command = (name) => ({ enabled: true, dispatch: `command:${name}` });
  const capabilities = {
    'universal.new': command('ikemen.text.createNew'), 'universal.close': { enabled: true, dispatch: 'internal:close' }, 'universal.open': command('workbench.action.files.openFile'),
    'universal.save': { enabled: true, dispatch: 'internal:save' }, 'universal.auto-save': { enabled:true, dispatch:'internal:auto-save' }, 'universal.save-as': { enabled:true, dispatch:'internal:save-as' },
    'universal.text-source': { enabled: true, dispatch: 'internal:open-full-text', capabilityId: 'implemented.authoring-source', resolverId: 'authoring-workspace.exact-source', routeKind: 'exact-document' },
    'universal.connected-resources': { enabled: true, dispatch: 'internal:connected-resources', routeKind: 'connected-resources' },
    'universal.backup': command('ikemen.mutations.openHistory'), 'universal.recovery': command('ikemen.mutations.openHistory'), 'universal.run': command('ikemen.launchGame'), 'universal.versus': command('ikemen.launchMirrorCurrent'), 'universal.training': command('ikemen.launchTrainingCurrent'),
    'universal.project': command('ikemen.projectManager.open'), 'universal.stage': command('ikemen.stage.openWorkspace'), 'universal.sprites': command('sff.openViewer'), 'universal.animations': command('air.openAnimationPreview'), 'universal.commands': command('ikemen.commandMovelist.openEditor'), 'universal.states': command('zss.openControllers'), 'universal.sounds': command('snd.openViewer'), 'universal.palettes': command('ikemen.palette.openWorkspace'), 'universal.code-structure': command('ikemen.codeStructure.openWorkspace'), 'universal.viewer-browser': { enabled: true, dispatch: 'internal:open-browser' },
    'universal.actions-search': command('ikemen.textActions.open'), 'universal.suite-switch': command('ikemen.switchSuite'), 'universal.help': command('ikemen.help.open'), 'universal.settings': command('ikemen.openExtensionSettings')
  };
  let textAutoSave=false;try{textAutoSave=require('./save_controls').textEnabled(seed);}catch(_){ }
  return adapt('code.authoring-workspace', capabilities, { resolverIds: ['authoring-workspace.exact-source'],autoSaveEnabled:textAutoSave,seed });
}
function exactRoute(document, context) {
  return { available: true, filename: document.fileName, identity: 'exact-document', fingerprint: fingerprint(document.getText()), version: String(document.version), label: path.basename(document.fileName), access: 'read-write', mutationOwner: 'native-text-editor', contextId: context.identity, selectionRevision: context.selectionRevision };
}
function draftRecoveryKey(document) { return String(document.uri); }
function conflictRecoveryKey(document, snapshot) { return `${draftRecoveryKey(document)}::conflict::${snapshot.fingerprint}:${snapshot.draftRevision}`; }
function retainDraft(document, draft, options = {}) {
  const snapshot = draft?.snapshot?.(), recordKey = draftRecoveryKey(document);
  if (snapshot && (snapshot.changed || options.force)) {
    const record = { uri:String(document.uri), filename:document.fileName, language:String(document.languageId || snapshot.parserIdentity || 'plaintext'), text:snapshot.text, fingerprint:snapshot.fingerprint, version:snapshot.documentVersion, appliedUnsaved:Boolean(options.appliedUnsaved), reason:String(options.reason || '') };
    const stale = Number(document.version) !== Number(snapshot.documentVersion) || fingerprint(document.getText()) !== snapshot.fingerprint;
    if (stale) return recoveryStore.set(conflictRecoveryKey(document, snapshot), { ...record, conflict:true, reason:record.reason || 'The source changed before this retained text could be applied.' }).then(() => recoveryStore.delete(recordKey));
    return recoveryStore.set(recordKey, record);
  }
  return recoveryStore.delete(recordKey);
}
function clearRetainedDraft(document) { return recoveryStore.delete(draftRecoveryKey(document)); }
function recoveryEntries(filenames) {
  const allowed = new Set((filenames || []).map(key));
  return Object.entries(recoveryStore.snapshot()).filter(([,record]) => record && typeof record.text === 'string' && typeof record.filename === 'string' && allowed.has(key(record.filename)))
    .map(([id,record]) => ({ id, ...record })).sort((left,right) => Number(right.revision || 0) - Number(left.revision || 0));
}
async function openRecoveryCopy(filenames) {
  const entries = recoveryEntries(filenames);
  if (!entries.length) return api.window.showInformationMessage('No retained Coding Viewer text is available for these connected files.');
  let selected = entries[0];
  if (entries.length > 1) {
    const picked = await api.window.showQuickPick(entries.map((entry) => ({ label:path.basename(entry.filename), description:entry.conflict ? 'Conflict recovery copy' : 'Retained unsaved copy', detail:entry.reason || `Recovery revision ${entry.revision}`, entry })), { title:'Open retained Coding Viewer text as a separate copy' });
    if (!picked) return null;
    selected = picked.entry;
  }
  const selectedIdentity = { id:selected.id, revision:Number(selected.revision), filename:selected.filename, fingerprint:selected.fingerprint, text:selected.text };
  const resolveReviewed = () => {
    const current = recoveryEntries(filenames).find((entry) => entry.id === selectedIdentity.id);
    return current && Number(current.revision) === selectedIdentity.revision && current.filename === selectedIdentity.filename && current.fingerprint === selectedIdentity.fingerprint && current.text === selectedIdentity.text ? current : null;
  };
  const changed = () => api.window.showWarningMessage('This recovery changed while the menu was open. Reopen Recovery to review the current copy.');
  const action = await api.window.showQuickPick([
    { label:'Open separate copy', description:'Open retained text as a new unsaved document.', value:'open' },
    { label:'Inspect recovery details', description:'Show file, reason, and recovery revision without exposing its text.', value:'inspect' },
    { label:'Compare with current source', description:'Show a read-only side-by-side difference.', value:'compare' },
    { label:'Copy retained text', description:'Copy the retained text to the clipboard.', value:'copy' },
    { label:'Remove retained copy', description:'Delete only this recovery record after confirmation.', value:'remove' }
  ], { title:`Recovery · ${path.basename(selected.filename)}` });
  if (!action) return null;
  let current = resolveReviewed(); if (!current) { changed(); return false; }
  if (action.value === 'inspect') { api.window.showInformationMessage(`${path.basename(current.filename)} · recovery revision ${current.revision || 0}${current.conflict ? ' · conflict copy' : ''}${current.reason ? ` · ${current.reason}` : ''}`); return true; }
  if (action.value === 'copy') { await api.env.clipboard.writeText(current.text); api.window.showInformationMessage(`Copied retained text for ${path.basename(current.filename)}. The source was not changed.`); return true; }
  if (action.value === 'remove') {
    const confirmed = await api.window.showWarningMessage(`Remove the retained Coding Viewer copy for ${path.basename(current.filename)}? The source file will not be changed.`, { modal:true }, 'Remove retained copy');
    if (confirmed !== 'Remove retained copy') return false;
    current = resolveReviewed(); if (!current) { changed(); return false; }
    if (!await recoveryStore.deleteIfRevision(current.id, current.revision)) { changed(); return false; }
    return true;
  }
  current = resolveReviewed(); if (!current) { changed(); return false; }
  const recovered = await api.workspace.openTextDocument({ content:current.text, language:current.language || 'plaintext' });
  if (action.value === 'compare') {
    await api.commands.executeCommand('vscode.diff', recovered.uri, api.Uri.file(current.filename), `Recovery ↔ Current · ${path.basename(current.filename)}`);
    return recovered;
  }
  await api.window.showTextDocument(recovered, { preview:false });
  api.window.showInformationMessage(`Opened retained text for ${path.basename(current.filename)} as a separate unsaved copy. The changed source was not overwritten.`);
  return recovered;
}
async function applyAndSaveDraft(document, draft, applyDraft = () => draft.apply()) {
  const changedBeforeSave = draft.snapshot().changed;
  const applied = await applyDraft();
  if (!applied.applied) { await retainDraft(document, draft, { force: true }); return { saved: false, reason: applied.reason }; }
  const saved = await draft.save();
  if (!saved.saved || saved.dirty) { await retainDraft(document, draft, { force: true, appliedUnsaved: true }); return { saved: false, reason: saved.reason || 'The native source remains dirty.' }; }
  const retained = recoveryStore.get(draftRecoveryKey(document));
  if (changedBeforeSave || (retained?.appliedUnsaved && retained.text === document.getText())) await clearRetainedDraft(document);
  return { saved: true };
}
async function openNative(document, line, authorize, viewColumn) {
  const editor = await api.window.showTextDocument(document, { preview: false, ...(Number.isInteger(viewColumn) && viewColumn > 0 ? { viewColumn } : {}) });
  if (!editor || editor.document !== document || (authorize && !authorize())) return null;
  if (Number.isInteger(line) && editor) { const point = new api.Position(Math.max(0, line), 0); editor.selection = new api.Selection(point, point); editor.revealRange(new api.Range(point, point)); }
  return editor;
}

async function attachedCodeColumns() {
  let current;
  try { current = await api.commands.executeCommand('vscode.getEditorLayout'); } catch (_) {}
  if (!attachedLayoutShape(current)) {
    try { await api.commands.executeCommand('vscode.setEditorLayout', attachedTextLayout()); } catch (_) {}
  }
  return { headerColumn: 1, editorColumn: 2 };
}
async function openExactNative(document, route, line, authorize) {
  const request = { ...route, selectionRevision: route.selectionRevision };
  const resolved = await sourceRegistry.resolve('authoring-workspace.exact-source', request);
  if (!resolved.available || (authorize && !authorize())) return resolved.available ? { available:false, reason:'Coding Viewer authority changed before the source could be opened.' } : resolved;
  const editor = await openNative(document, line, authorize);
  return editor ? resolved : { available:false, reason:'Coding Viewer authority or returned editor changed while opening the source.' };
}
async function attachPanel(panel, uri, restored = false, options = {}) {
  let document = await sourceDocument(uri), filename = document.fileName, classification = classifyDocument(document, { configuration: api.workspace.getConfiguration('ikemenZss', document.uri) });
  if (!classification.supported) { if (restored) panel.dispose(); else await openNative(document); return null; }
  let connected = Array.isArray(options.documents) && options.documents.length ? options.documents : connectedDocuments(document);
  connected = [...new Map([document, ...connected].map((item) => [key(item.fileName), item])).values()].slice(0,512);
  let files = connected.map((item) => item.fileName); const directory = path.dirname(filename), panelId = `code:${key(options.context?.root || directory)}`;
  const groupedIdentity = options.groupedIdentity || '';
  const existing = groupedIdentity ? null : connected.map((item) => panels.get(key(item.fileName))).find((record) => record?.panel && record.panel !== panel);
  if (existing && existing.panel !== panel) { panel.dispose(); existing.panel.reveal(); return existing.panel; }
  trackViewerPanel(panel);
  const panelRecord = { panel, uri: document.uri, mergeDocuments: null, groupedIdentity };
  if (groupedIdentity) { groupedPanels.set(groupedIdentity, panelRecord); for (const file of files) mapGroupedFile(file, panelRecord); }
  else for (const file of files) panels.set(key(file), panelRecord);
  let contextDescriptor = normalizedCodingContext(options.context, files) || { type: classification.role || 'project', key: directory, label: path.basename(directory), root: directory, files, activeSurfaceId: 'code.authoring-workspace' };
  const legacyContext = contextRegistry.registerAuthoringPanel(panel, contextDescriptor);
  require('./shared_workspace_header').attachObserver(panel,'code.authoring-workspace');
  const context = contextRegistry.getContextModel(legacyContext);
  if (!viewStates.has(context.identity, 'code.authoring-workspace')) {
    viewStates.set(context.identity, 'code.authoring-workspace', { mode:'source', focusedPane:'source' });
    await extensionContext.workspaceState.update(STATE_KEY, viewStates.serialize());
  }
  const initialCardHandsSnapshot=cardHandsStore.getWithRevision(context.identity);
  let cardHands = reconcileCardHands(context.identity, initialCardHandsSnapshot.record, connected.map((item) => key(item.fileName))), cardHandsRevision=initialCardHandsSnapshot.revision, destinationStatuses=new Map(), statusAnnouncement='';
  let navigation = navigationFor(connected, document, cardHands, undefined, destinationStatuses), draft = null, conflict = '', disposed = false, localMutationDepth = 0, actionQueue = Promise.resolve(), generation = 1, editRevision = 0;
  const sourceFocus = new Map();
  const enqueue = (operation) => {
    const result = actionQueue.then(operation, operation);
    actionQueue = result.then(() => undefined, () => undefined);
    return result;
  };
  const editableKind = () => ['zss','cns','st','lua','txt','cmd','inp','jnp','dat','air','def'].includes(classification.kind);
  const selectionFor = (current = document) => ({ surfaceId:'code.authoring-workspace', uri:String(current.uri) });
  const claim = () => {
    if (!groupedIdentity || disposed || !panel.active || groupedPanels.get(groupedIdentity) !== panelRecord) return false;
    context.setActiveSurface('code.authoring-workspace'); context.setSelection(selectionFor()); return true;
  };
  const ownerSnapshot = (requireSelection = true) => {
    const snapshot = context.snapshot();
    if (disposed || !panel.active || (groupedIdentity && groupedPanels.get(groupedIdentity) !== panelRecord)) return null;
    if (groupedIdentity && requireSelection && (snapshot.activeSurfaceId !== 'code.authoring-workspace' || JSON.stringify(snapshot.selection) !== JSON.stringify(selectionFor()))) return null;
    return { generation, contextId:snapshot.identity, revision:snapshot.revision, selectionRevision:snapshot.selectionRevision, selection:JSON.stringify(snapshot.selection), document, version:document.version, sha:fingerprint(document.getText()) };
  };
  const ownerCurrent = (capture, requireSelection = true) => {
    if (!capture || disposed || !panel.active || capture.generation !== generation || capture.document !== document || capture.version !== document.version || capture.sha !== fingerprint(document.getText())) return false;
    if (Array.isArray(api.workspace.textDocuments) && !api.workspace.textDocuments.includes(document)) return false;
    const snapshot = context.snapshot();
    return snapshot.identity === capture.contextId && snapshot.revision === capture.revision && snapshot.selectionRevision === capture.selectionRevision && (!requireSelection || (snapshot.activeSurfaceId === 'code.authoring-workspace' && JSON.stringify(snapshot.selection) === capture.selection));
  };
  const navigationCurrent = (capture) => {
    if (!capture || disposed || !panel.active || capture.generation !== generation || capture.document !== document || capture.version !== document.version || capture.sha !== fingerprint(document.getText()) || (groupedIdentity && groupedPanels.get(groupedIdentity) !== panelRecord)) return false;
    const snapshot=context.snapshot();
    return snapshot.identity===capture.contextId&&snapshot.activeSurfaceId==='code.authoring-workspace'&&JSON.stringify(snapshot.selection)===capture.selection;
  };
  const sessionCurrent = (capture, requireSelection = true) => {
    if (!capture || disposed || !panel.active || capture.generation !== generation || (groupedIdentity && groupedPanels.get(groupedIdentity) !== panelRecord)) return false;
    const snapshot = context.snapshot();
    return snapshot.identity === capture.contextId && snapshot.revision === capture.revision && snapshot.selectionRevision === capture.selectionRevision && (!requireSelection || (snapshot.activeSurfaceId === 'code.authoring-workspace' && JSON.stringify(snapshot.selection) === capture.selection));
  };
  const openDraftFor = async (targetDocument, targetClassification, initialText) => {
    if (!['zss','cns','st','lua','txt','cmd','inp','jnp','dat','air','def'].includes(targetClassification.kind)) return null;
    const current = activeSourceDraft(context);
    if (current && current.snapshot().uri === String(targetDocument.uri)) { current.attach(panelId); return current; }
    if (current) return null;
    try { return await openSourceDraft({ context, ownerId: 'code.authoring-workspace', uri: targetDocument.uri, panelId, vscode: api, parserIdentity: targetClassification.kind, ...(initialText===undefined?{}:{text:initialText}) }); } catch (_) { return null; }
  };
  const openDraftForCurrent = async () => openDraftFor(document,classification);
  draft = await openDraftForCurrent();
  panelRecord.mergeDocuments = (documents) => enqueue(async () => {
    if (disposed) return false;
    const incoming = [...new Map((documents || []).filter((item) => item?.fileName).map((item) => [key(item.fileName),item])).values()].slice(0,512);
    if (!groupedIdentity) {
      const additions=incoming.filter((item)=>!connected.some((current)=>key(current.fileName)===key(item.fileName)));
      if(!additions.length){panel.reveal();return true;}
      connected=[...connected,...additions].slice(0,512);files=connected.map((item)=>item.fileName);cardHands=reconcileCardHands(context.identity,cardHands,connected.map((item)=>key(item.fileName)));refreshDestinationStatuses(false);
      contextDescriptor={...contextDescriptor,files};contextRegistry.registerAuthoringPanel(panel,contextDescriptor);for(const item of additions)panels.set(key(item.fileName),panelRecord);generation+=1;statusScheduler.invalidate();panel.reveal();render();return true;
    }
    if (!incoming.length) return false;
    let capture,nextHands,currentSurvives,target,prepared,previousState,targetClassification,committed;
    for(let attempt=0;attempt<2;attempt+=1){
      capture=organizationCapture();nextHands=reconcileCardHands(context.identity,cardHands,incoming.map((item)=>key(item.fileName)));
      currentSurvives=incoming.find((item)=>key(item.fileName)===key(filename));target=currentSurvives||incoming.find((item)=>key(item.fileName)===nextHands.fileOrder[0])||incoming[0];
      prepared=draft;const previousDraft=draft;previousState=draft?.snapshot();targetClassification=classification;
      if(!currentSurvives){
        if(previousState?.changed)await retainDraft(document,draft,{force:true,reason:'The grouped Coding Viewer source set changed while this file had retained edits.'});
        if(!organizationCurrent(capture))return false;targetClassification=classifyDocument(target,{configuration:api.workspace.getConfiguration('ikemenZss',target.uri)});
        previousDraft?.discard();prepared=await openDraftFor(target,targetClassification);
        if(!prepared||!organizationCurrent(capture)){prepared?.discard();draft=previousState?await openDraftFor(document,classification,previousState.text):null;return false;}
      }
      try{committed=await cardHandsStore.set(context.identity,nextHands,()=>organizationCurrent(capture),{expectedRevision:capture.cardHandsRevision});break;}
      catch(error){
        if(!currentSurvives){prepared?.discard();draft=previousState?await openDraftFor(document,classification,previousState.text):null;}
        if(error?.code==='STALE_CARD_HANDS'&&attempt===0){refreshCardHandsFromStore();continue;}
        if(error?.code==='STALE_CARD_HANDS')refreshCardHandsFromStore();api.window.showWarningMessage?.(`Could not synchronize Coding Viewer tabs: ${error.message||error}`);return false;
      }
    }
    if(!committed)return false;
    if(!organizationCurrent(capture)){if(!currentSurvives){prepared?.discard();draft=previousState?await openDraftFor(document,classification,previousState.text):null;}return false;}
    unmapGroupedRecord(panelRecord);connected=incoming;files=connected.map((item)=>item.fileName);cardHands=nextHands;cardHandsRevision=committed.revision;
    if(!currentSurvives){draft=prepared;document=target;filename=target.fileName;classification=targetClassification;editRevision=0;conflict='';}
    contextDescriptor={...contextDescriptor,files};contextRegistry.registerAuthoringPanel(panel,contextDescriptor);for(const item of connected)mapGroupedFile(item.fileName,panelRecord);refreshDestinationStatuses(false);
    generation+=1;statusScheduler.invalidate();context.setSelection(selectionFor());panelRecord.uri=document.uri;panel.reveal();render({revealId:key(filename)});return true;
  });
  viewerClose.support(panel, { isBusy: () => false, keepDraft: () => draft ? retainDraft(document, draft) : Promise.resolve() });
  const render = (navigationPresentation = {}) => {
    const state = viewStates.get(context.identity, 'code.authoring-workspace');
    const model = createAuthoringShellModel({ context, surfaceId: 'code.authoring-workspace', document, classification, view: state, navigation, exactRoute: exactRoute(document, context.snapshot()), toolbarProjection: toolbarModel(filename) });
    panel.title = `IKEMaker Code · ${path.basename(filename)}`;
    const documentId = key(filename), sourceView = { ...viewStates.document(context.identity, 'code.authoring-workspace', documentId, document.getText().length), focused:sourceFocus.get(documentId) === true };
    panel.webview.html = require('./webview_policy').protect(renderAuthoringShellHtml({ ...model, viewMode: state.mode, conflict, documentDirty:Boolean(document.isDirty), editRevision, editGeneration:generation, draft: draft ? { ...draft.snapshot(), available: true } : { available: false } }, { nonce: nonce(), cspSource: panel.webview.cspSource, state: serializedPanelState(document.uri.toString(), Boolean(groupedIdentity)), documentId, sourceView, revealNavigationId:navigationPresentation.revealId, focusNavigationId:navigationPresentation.focusId, navigationAnnouncement:statusAnnouncement }), panel.webview.cspSource);
  };
  const fileAvailability = (target) => {
    try { const lexical=path.resolve(target),real=fs.realpathSync.native?fs.realpathSync.native(lexical):fs.realpathSync(lexical),stat=fs.statSync(real);return { available:stat.isFile()&&key(real)===key(lexical), real }; }
    catch(_){return {available:false,real:''};}
  };
  const recoveryFor = (targetDocument) => {
    try { const targetFile=key(targetDocument.fileName),targetUri=String(targetDocument.uri);return Object.values(recoveryStore.snapshot()).find((record)=>record&&record.uri&&record.filename&&String(record.uri)===targetUri&&key(record.filename)===targetFile)||null; }
    catch(_){return null;}
  };
  const statusFor = (targetDocument) => {
    const availability=fileAvailability(targetDocument.fileName),isCurrent=key(targetDocument.fileName)===key(filename);let targetClassification;
    try{targetClassification=classifyDocument(targetDocument,{configuration:api.workspace.getConfiguration('ikemenZss',targetDocument.uri)});}catch(_){targetClassification={supported:false};}
    let diagnostics;try{diagnostics=countDiagnostics(api.languages?.getDiagnostics?.(targetDocument.uri)||[]);}catch(_){diagnostics=countDiagnostics(null);}
    const recovery=recoveryFor(targetDocument);
    return createDestinationStatus({unavailable:!availability.available,closed:availability.available&&targetDocument.isClosed===true,nativeRequired:availability.available&&(!targetClassification.supported||Buffer.byteLength(String(targetDocument.getText?.()||''),'utf8')>4*1024*1024),unsaved:isCurrent?Boolean(document.isDirty||draft?.snapshot?.().changed):Boolean(targetDocument.isDirty),recovery:Boolean(recovery),conflict:isCurrent?Boolean(conflict):recovery?.conflict===true,diagnostics});
  };
  const refreshDestinationStatuses = (shouldRender=true,announce=false) => {
    const previous=destinationStatuses,next=new Map(),changes=[];for(const target of connected.slice(0,512)){const id=key(target.fileName),status=statusFor(target);next.set(id,status);if(announce&&previous.has(id)&&JSON.stringify(previous.get(id))!==JSON.stringify(status)){const tokens=statusTokens(status);changes.push(`${path.basename(target.fileName)}: ${tokens.length?tokens.join(', '):'Status cleared'}`);}}
    if(announce&&changes.length){const summary=changes.slice(0,3).join(' · ');statusAnnouncement=Buffer.byteLength(summary,'utf8')<=512?summary:'Connected file status changed.';}
    destinationStatuses=next;navigation=navigationFor(connected,document,cardHands,navigation.mode,destinationStatuses);if(shouldRender)render();return next;
  };
  const statusScheduler=new CoalescedEventScheduler(()=>{const scheduledGeneration=generation;enqueue(async()=>{if(disposed||scheduledGeneration!==generation)return;refreshDestinationStatuses(true,true);});});
  const applyDraft = async () => { localMutationDepth += 1; try { return await draft.apply(); } catch (error) { return { applied:false, reason:`The native document edit failed: ${error.message || error}` }; } finally { localMutationDepth -= 1; } };
  const stageSourceLine = (targetDocument,line) => {
    if(!Number.isInteger(line)||line<0)return false;
    const source=targetDocument.getText(),lines=source.split(/\r?\n/),wanted=Math.min(line,Math.max(0,lines.length-1));let offset=0;
    for(let index=0;index<wanted;index+=1)offset+=lines[index].length+(source.includes('\r\n')?2:1);
    const documentId=key(targetDocument.fileName),current=viewStates.document(context.identity,'code.authoring-workspace',documentId,source.length);
    viewStates.setDocument(context.identity,'code.authoring-workspace',documentId,{...current,selectionStart:offset,selectionEnd:offset,selectionDirection:'none'});sourceFocus.set(documentId,true);viewStates.set(context.identity,'code.authoring-workspace',{mode:'source',focusedPane:'source'});return true;
  };
  const persistViewState = () => Promise.resolve(extensionContext.workspaceState.update(STATE_KEY,viewStates.serialize())).catch(()=>{});
  const refreshCardHandsFromStore = () => {
    const snapshot=cardHandsStore.getWithRevision(context.identity);
    if(snapshot.revision!==cardHandsRevision){cardHands=reconcileCardHands(context.identity,snapshot.record,connected.map((item)=>key(item.fileName)));cardHandsRevision=snapshot.revision;navigation=navigationFor(connected,document,cardHands,undefined,destinationStatuses);render();}
    return snapshot;
  };
  const organizationCapture = () => { const snapshot=refreshCardHandsFromStore();return Object.freeze({ generation, contextId:context.identity, cardHandsRevision:snapshot.revision }); };
  const organizationCurrent = (capture) => Boolean(capture) && !disposed && capture.generation === generation && capture.contextId === context.identity && (!groupedIdentity || groupedPanels.get(groupedIdentity) === panelRecord);
  const indexedPick = async (values, title, capture) => {
    if (!organizationCurrent(capture)) return undefined;
    const picked = await api.window.showQuickPick(values.map((value,index) => ({ label:value.label, description:value.description || '', index })), { title, ignoreFocusOut:true });
    if (!organizationCurrent(capture) || !picked || !Number.isInteger(picked.index) || picked.index < 0 || picked.index >= values.length) return undefined;
    return picked.index;
  };
  const inputLabel = async (title, value, capture) => {
    if (!organizationCurrent(capture)) return undefined;
    const supplied = await api.window.showInputBox({ title, value:value || '', ignoreFocusOut:true, validateInput:(text) => Buffer.byteLength(String(text || ''),'utf8') > MAX_LABEL_BYTES ? 'Use 128 UTF-8 bytes or fewer.' : undefined });
    if (!organizationCurrent(capture) || supplied === undefined) return undefined;
    const label = String(supplied).trim();
    return label && Buffer.byteLength(label,'utf8') <= MAX_LABEL_BYTES && !/[\u0000-\u001f\u007f]/.test(label) ? label : undefined;
  };
  const editableCardHands = () => ({ contextId:cardHands.contextId, handOrder:[...cardHands.handOrder], hands:cardHands.hands.map((hand) => ({ id:hand.id, label:hand.label, memberIds:[...hand.memberIds] })), fileOrder:[...cardHands.fileOrder], collapsedHandIds:[...cardHands.collapsedHandIds], mode:cardHands.mode });
  const commitCardHands = async (candidate, capture) => {
    if (!organizationCurrent(capture)) return false;
    let reconciled;
    try { reconciled = reconcileCardHands(context.identity, candidate, connected.map((item) => key(item.fileName))); } catch (error) { api.window.showWarningMessage?.(`Could not organize Coding Viewer tabs: ${error.message || error}`); return false; }
    if (!organizationCurrent(capture)) return false;
    let committed;
    try { committed=await cardHandsStore.set(context.identity, reconciled, () => organizationCurrent(capture), { expectedRevision:capture.cardHandsRevision }); } catch (error) { if(error?.code==='STALE_CARD_HANDS')refreshCardHandsFromStore();api.window.showWarningMessage?.(`Could not save Coding Viewer tab organization: ${error.message || error}`); return false; }
    if (!organizationCurrent(capture)) return false;
    cardHands = reconciled; cardHandsRevision=committed.revision;
    navigation = navigationFor(connected, document, cardHands, cardHands.mode, destinationStatuses);
    render();
    return true;
  };
  const organizeNavigation = async () => {
    const capture = organizationCapture();
    const actions = ['Create hand','Rename hand','Delete hand','Assign file','Unassign file','Reorder hands','Reorder files','Collapse or expand hand'].map((label) => ({ label }));
    const action = await indexedPick(actions, 'Organize tabs…', capture);
    if (action === undefined) return false;
    const next = editableCardHands();
    const handChoices = () => next.handOrder.map((id) => next.hands.find((hand) => hand.id === id)).filter(Boolean).map((hand) => ({ label:hand.label, hand }));
    const fileNames = new Map(connected.map((item) => [key(item.fileName),path.basename(item.fileName)]));
    const fileChoices = (ids) => ids.map((id) => ({ label:fileNames.get(id) || id, description:id, id }));
    if (action === 0) {
      if (next.hands.length >= MAX_HANDS) return api.window.showWarningMessage?.('The Coding Viewer supports up to 64 card hands.');
      const label = await inputLabel('Create card hand', '', capture); if (label === undefined) return false;
      const id = `hand-${crypto.randomBytes(16).toString('hex')}`;
      next.hands.push({ id, label, memberIds:[] }); next.handOrder.push(id);
    } else if (action === 1) {
      const choices=handChoices(), at=await indexedPick(choices,'Rename card hand',capture); if(at===undefined)return false;
      const label=await inputLabel('Rename card hand',choices[at].hand.label,capture);if(label===undefined)return false;choices[at].hand.label=label;
    } else if (action === 2) {
      const choices=handChoices(), at=await indexedPick(choices,'Delete card hand (files remain available)',capture); if(at===undefined)return false;
      const id=choices[at].hand.id;next.hands=next.hands.filter((hand)=>hand.id!==id);next.handOrder=next.handOrder.filter((value)=>value!==id);next.collapsedHandIds=next.collapsedHandIds.filter((value)=>value!==id);
    } else if (action === 3) {
      const filesToAssign=fileChoices(next.fileOrder), fileAt=await indexedPick(filesToAssign,'Choose file to assign',capture);if(fileAt===undefined)return false;
      const hands=handChoices(),handAt=await indexedPick(hands,'Choose card hand',capture);if(handAt===undefined)return false;
      next.hands.forEach((hand)=>{hand.memberIds=hand.memberIds.filter((id)=>id!==filesToAssign[fileAt].id);});hands[handAt].hand.memberIds.push(filesToAssign[fileAt].id);
    } else if (action === 4) {
      const assigned=next.hands.flatMap((hand)=>hand.memberIds.map((id)=>({id,hand}))),choices=assigned.map((item)=>({label:fileNames.get(item.id)||item.id,description:item.hand.label,item}));
      const at=await indexedPick(choices,'Choose file to unassign',capture);if(at===undefined)return false;choices[at].item.hand.memberIds=choices[at].item.hand.memberIds.filter((id)=>id!==choices[at].item.id);
    } else if (action === 5) {
      const hands=handChoices(),at=await indexedPick(hands,'Choose hand to move',capture);if(at===undefined)return false;
      const directions=[{label:'Move earlier',offset:-1},{label:'Move later',offset:1}],direction=await indexedPick(directions,'Move card hand',capture);if(direction===undefined)return false;
      const from=next.handOrder.indexOf(hands[at].hand.id),to=from+directions[direction].offset;if(to<0||to>=next.handOrder.length)return false;[next.handOrder[from],next.handOrder[to]]=[next.handOrder[to],next.handOrder[from]];
    } else if (action === 6) {
      const filesToMove=fileChoices(next.fileOrder),at=await indexedPick(filesToMove,'Choose file to move',capture);if(at===undefined)return false;
      const directions=[{label:'Move earlier',offset:-1},{label:'Move later',offset:1}],direction=await indexedPick(directions,'Move file tab',capture);if(direction===undefined)return false;
      const from=next.fileOrder.indexOf(filesToMove[at].id),to=from+directions[direction].offset;if(to<0||to>=next.fileOrder.length)return false;[next.fileOrder[from],next.fileOrder[to]]=[next.fileOrder[to],next.fileOrder[from]];
    } else if (action === 7) {
      const hands=handChoices(),at=await indexedPick(hands,'Collapse or expand card hand',capture);if(at===undefined)return false;
      const id=hands[at].hand.id;next.collapsedHandIds=next.collapsedHandIds.includes(id)?next.collapsedHandIds.filter((value)=>value!==id):[...next.collapsedHandIds,id];
    }
    return commitCardHands(next,capture);
  };
  const selectDestination = async (action, authorize, targetLine, navigationPresentation = {}) => {
    if(authorize&&!authorize())return false;
    const capture = groupedIdentity ? ownerSnapshot() : true; if (groupedIdentity && !capture) return false;
    const next = reduceNavigation(navigation, action), selected = next.items.find((item) => item.id === next.currentId);
    if (!selected) return;
    const safety={generation,current:document,currentId:navigation.currentId,version:document.version,sha:fingerprint(document.getText())},safe=()=>!disposed&&generation===safety.generation&&document===safety.current&&navigation.currentId===safety.currentId&&document.version===safety.version&&fingerprint(document.getText())===safety.sha&&(!authorize||authorize());
    const authoritySafe=()=>safe()&&(!groupedIdentity||ownerCurrent(capture));
    const postNativeAuthoritySafe=()=>{
      if(disposed||generation!==safety.generation||document!==safety.current||navigation.currentId!==safety.currentId||document.version!==safety.version||fingerprint(document.getText())!==safety.sha)return false;
      if(authorize&&!authorize())return false;
      if(!groupedIdentity)return true;
      if(!capture||groupedPanels.get(groupedIdentity)!==panelRecord)return false;
      const snapshot=context.snapshot();
      return snapshot.identity===capture.contextId&&snapshot.revision===capture.revision&&snapshot.selectionRevision===capture.selectionRevision&&snapshot.activeSurfaceId==='code.authoring-workspace'&&JSON.stringify(snapshot.selection)===capture.selection;
    };
    const unavailable=()=>{statusAnnouncement=`${path.basename(selected.filename)} is unavailable. The current tab was not changed.`;api.window.showWarningMessage?.(statusAnnouncement);refreshDestinationStatuses(false);render();return false;};
    if(!fileAvailability(selected.filename).available)return unavailable();
    let selectedDocument=connected.find((item)=>key(item.fileName)===key(selected.filename));
    if(!selectedDocument)return unavailable();
    const expectedFilename=key(selectedDocument.fileName),expectedUri=String(selectedDocument.uri);
    const exactSelectedDocument=()=>Boolean(selectedDocument)&&key(selectedDocument.fileName)===expectedFilename&&String(selectedDocument.uri)===expectedUri;
    const wasClosed=selectedDocument.isClosed===true;
    if(wasClosed){try{selectedDocument=await sourceDocument(api.Uri.file(selected.filename));}catch(_){if(!authoritySafe())return false;return fileAvailability(selected.filename).available?false:unavailable();}}
    if(!authoritySafe())return false;
    if(!fileAvailability(selected.filename).available)return unavailable();
    if(!exactSelectedDocument())return false;
    let selectedClassification;try{selectedClassification=classifyDocument(selectedDocument,{configuration:api.workspace.getConfiguration('ikemenZss',selectedDocument.uri)});}catch(_){selectedClassification={supported:false};}
    if(!selectedClassification.supported||Buffer.byteLength(String(selectedDocument.getText?.()||''),'utf8')>4*1024*1024){
      const guarded=()=>postNativeAuthoritySafe()&&exactSelectedDocument()&&fileAvailability(selected.filename).available;
      const opened=await openNative(selectedDocument,undefined,guarded);
      if(opened&&guarded()){if(wasClosed)connected=connected.map((item)=>key(item.fileName)===key(selected.filename)?selectedDocument:item);statusAnnouncement=`${path.basename(selected.filename)} opened in the native editor.`;refreshDestinationStatuses();return true;}
      if(!postNativeAuthoritySafe())return false;
      if(!fileAvailability(selected.filename).available)return unavailable();
      return false;
    }
    if (key(selected.filename) === key(filename)&&selectedDocument===document) { if(!authoritySafe())return false; statusAnnouncement='';navigation = next;if(Number.isInteger(targetLine))stageSourceLine(document,targetLine);const activeId=projectNavigation(navigation).currentId;render({revealId:activeId,focusId:navigationPresentation.focus===true?activeId:''});persistViewState();return true; }
    if(!authoritySafe())return false;
    if(!fileAvailability(selected.filename).available)return unavailable();
    if (draft?.snapshot().changed) await retainDraft(document, draft);
    if(!authoritySafe())return false;
    if(!fileAvailability(selected.filename).available)return unavailable();
    const nextDocument = selectedDocument;
    if(!exactSelectedDocument())return false;
    const nextClassification=selectedClassification, previousDraft=draft, previousDraftState=previousDraft?.snapshot();
    previousDraft?.discard();
    const preparedDraft=nextClassification.supported?await openDraftFor(nextDocument,nextClassification):null;
    const preparedAuthoritySafe=()=>safe()&&(!groupedIdentity||navigationCurrent(capture));
    if(nextClassification.supported&&!preparedDraft||!preparedAuthoritySafe()||!fileAvailability(selected.filename).available||!exactSelectedDocument()){
      preparedDraft?.discard();
      draft=previousDraftState?await openDraftFor(document,classification,previousDraftState.text):null;
      if(!preparedAuthoritySafe())return false;
      return fileAvailability(selected.filename).available?false:unavailable();
    }
    if(Number.isInteger(targetLine))stageSourceLine(nextDocument,targetLine);
    draft=preparedDraft; navigation = next;connected=connected.map((item)=>key(item.fileName)===key(nextDocument.fileName)?nextDocument:item);
    document = nextDocument; filename = document.fileName; generation += 1;statusScheduler.invalidate();editRevision = 0;
    classification = nextClassification;
    if (!classification.supported) return openNative(document,undefined,authorize);
    conflict = '';statusAnnouncement='';refreshDestinationStatuses(false);
    context.setSelection({ filename, kind: classification.kind });
    if (groupedIdentity) context.setSelection(selectionFor());
    const activeId=projectNavigation(navigation).currentId;render({revealId:activeId,focusId:navigationPresentation.focus===true?activeId:''});persistViewState();return true;
  };
  panelRecord.selectFile = (target, line, authorize) => enqueue(async () => { if(authorize&&!authorize())return false;const selected=await selectDestination({ type:'select', id:key(target) },authorize,line); if(selected===false||key(filename)!==key(target)||authorize&&!authorize())return false; return true; });
  panelRecord.canReuse = (target) => !disposed && panel.active && groupedPanels.get(groupedIdentity) === panelRecord && files.some((file) => key(file) === key(target)) && Boolean(ownerSnapshot(true));
  panelRecord.isLive = () => !disposed && groupedPanels.get(groupedIdentity) === panelRecord;
  panelRecord.reclaimFile = async (target, line, authorize) => {
    if(authorize&&!authorize())return false;
    if (!panelRecord.isLive() || !files.some((file) => key(file) === key(target))) return false;
    try { panel.reveal(); } catch (_) { return false; }
    return enqueue(async () => {
      if (!claim()||authorize&&!authorize()) return false;
      const selected = await selectDestination({ type:'select', id:key(target) },authorize,line);
      if (selected === false || !panelRecord.canReuse(target)||authorize&&!authorize()) return false;
      const snapshot = context.snapshot();
      return (!authorize||authorize())&&snapshot.selection?.surfaceId === 'code.authoring-workspace' && String(snapshot.selection?.uri) === String(document.uri);
    });
  };
  const saveCurrent = async () => {
    const capture = groupedIdentity ? ownerSnapshot() : true; if (groupedIdentity && !capture) return false;
    if (!draft) { const saved = await document.save(); if ((groupedIdentity && !sessionCurrent(capture)) || !saved || document.isDirty) { if (groupedIdentity && !sessionCurrent(capture)) return false; api.window.showWarningMessage('VS Code did not save the source document.'); } return; }
    if (groupedIdentity && !ownerCurrent(capture)) return false;
    const saved = await applyAndSaveDraft(document, draft, applyDraft);
    if (!saved.saved) { conflict = saved.reason; api.window.showWarningMessage(`${saved.reason} The recovery draft was kept.`); } else conflict = '';
    return render();
  };
  const commandHandler = (command) => async () => api.commands.executeCommand(command, document.uri);
  const toolbarHandlers = {
    new: commandHandler('ikemen.text.createNew'), close: async () => { if (draft?.snapshot().changed) await retainDraft(document, draft); return panel.dispose(); },
    open: commandHandler('workbench.action.files.openFile'), save: saveCurrent,
    'save-as':async()=>require('./text_save_as').run({vscode:api,focused:document,documents:api.workspace.textDocuments}),
    'auto-save':async()=>{await require('./save_controls').toggleText(filename);return render();},
    'text-source': async () => { const capture = groupedIdentity ? ownerSnapshot() : true; if (groupedIdentity && !capture) return false; viewStates.set(context.identity, 'code.authoring-workspace', { mode:'source' }); await extensionContext.workspaceState.update(STATE_KEY, viewStates.serialize()); return render(); },
    'connected-resources': async () => api.window.showQuickPick(files.map((file) => ({ label:path.basename(file), description:file, file })), { title:'Connected source files' }).then((picked) => picked ? selectDestination({ type:'select', id:key(picked.file) }) : undefined),
    backup: commandHandler('ikemen.mutations.openHistory'), recovery: async () => openRecoveryCopy(files), run: commandHandler('ikemen.launchGame'),
    versus: commandHandler('ikemen.launchMirrorCurrent'), training: commandHandler('ikemen.launchTrainingCurrent'), project: commandHandler('ikemen.projectManager.open'),
    stage: commandHandler('ikemen.stage.openWorkspace'), sprites: commandHandler('sff.openViewer'), animations: commandHandler('air.openAnimationPreview'),
    commands: commandHandler('ikemen.commandMovelist.openEditor'), states: commandHandler('zss.openControllers'), sounds: commandHandler('snd.openViewer'),
    palettes: commandHandler('ikemen.palette.openWorkspace'), 'code-structure': commandHandler('ikemen.codeStructure.openWorkspace'),
    'viewer-browser': async () => openAuthoringBrowser(context.snapshot()), 'actions-search': commandHandler('ikemen.textActions.open'),
    'suite-switch': commandHandler('ikemen.switchSuite'), help: commandHandler('ikemen.help.open'), settings: commandHandler('ikemen.openExtensionSettings')
  };
  const toolbarDispatcher = createUniversalToolbarDispatcher({ handlersBySurface: { 'code.authoring-workspace': toolbarHandlers }, getToolbar: async () => toolbarModel(filename) });
  const handleMessage = async (message) => {
    if (!message || typeof message.type !== 'string') return;
    if (message.type === MESSAGE_TYPE) { if (groupedIdentity && !ownerSnapshot()) return; try { await toolbarDispatcher.dispatch('code.authoring-workspace', message); } catch (_) {} return; }
    if(require('./shared_workspace_header').isSharedMessage(message))return require('./shared_workspace_header').handle(message,{panel,filename,disposed},'code');
    if (await viewerToolbar.handleCommand(message, filename, panel)) return;
    if (await viewerToolbar.handle(message, panel)) return;
    const intent = validatedAuthoringShellMessage(message);
    if (!intent) return;
    if (groupedIdentity && !ownerSnapshot()) return;
    if (intent.type === 'set-view-mode') { viewStates.set(context.identity, 'code.authoring-workspace', { mode: intent.mode }); await extensionContext.workspaceState.update(STATE_KEY, viewStates.serialize()); return render(); }
    if (intent.type === 'set-navigation-mode') { const capture=organizationCapture(),next=editableCardHands();next.mode=intent.mode;return commitCardHands(next,capture); }
    if (intent.type === 'organize-navigation') return organizeNavigation();
    if (intent.type === 'toggle-navigation-hand') {
      if (navigation.mode !== 'cards' || !cardHands.handOrder.includes(intent.id)) return;
      const capture=organizationCapture(),next=editableCardHands();next.collapsedHandIds=next.collapsedHandIds.includes(intent.id)?next.collapsedHandIds.filter((id)=>id!==intent.id):[...next.collapsedHandIds,intent.id];return commitCardHands(next,capture);
    }
    if (intent.type === 'previous-navigation' || intent.type === 'next-navigation') return selectDestination({ type: intent.type === 'previous-navigation' ? 'previous' : 'next' });
    if (intent.type === 'select-navigation') { if (intent.id && !navigation.items.some((item) => item.id === intent.id)) return; return selectDestination(intent.id ? { type: 'select', id: intent.id } : { type: 'select-index', index: intent.index }); }
    if (intent.type === 'activate-navigation') { if (!navigation.items.some((item) => item.id === intent.id)) return; return selectDestination({ type:'select', id:intent.id },undefined,undefined,{focus:true}); }
    if (intent.type === 'open-full-text') { const capture = groupedIdentity ? ownerSnapshot() : true; if (groupedIdentity && !capture) return; return openExactNative(document, exactRoute(document, context.snapshot()), Number.isInteger(intent.line) ? intent.line : undefined, groupedIdentity ? () => ownerCurrent(capture) : undefined); }
    if (intent.type === 'remember-source-view') {
      const documentId = key(filename);
      if (intent.generation !== generation || intent.documentId !== documentId) return;
      viewStates.setDocument(context.identity, 'code.authoring-workspace', documentId, intent);
      sourceFocus.set(documentId, intent.focused);
      await extensionContext.workspaceState.update(STATE_KEY, viewStates.serialize()); return;
    }
    if (intent.type === 'edit-source' && draft) {
      if (intent.revision !== editRevision + 1 || intent.generation !== generation) return;
      const capture = ownerSnapshot(false);
      if (!capture) return;
      draft.edit(intent.text);
      await retainDraft(document, draft);
      if (!ownerCurrent(capture, false)) { await retainDraft(document, draft, { force:true, reason:'The Coding Viewer authority or native source changed before this typing revision could be applied.' }); conflict = 'The Coding Viewer authority or native source changed before this typing revision could be applied. The recovery text was kept.'; return render(); }
      const result = await applyDraft();
      if (!result.applied) { conflict = result.reason; api.window.showWarningMessage(result.reason); return render(); }
      editRevision = intent.revision; conflict = ''; await clearRetainedDraft(document); return;
    }
    if (intent.type === 'launch-visual') { if (key(intent.filename) !== key(filename)) return; return api.commands.executeCommand(intent.command, document.uri); }
  };
  panel.webview.onDidReceiveMessage((message) => enqueue(() => handleMessage(message)));
  const viewDisposable = panel.onDidChangeViewState?.((event) => { if (event.webviewPanel.active) enqueue(async () => { if (claim()) render(); }); });
  const changeDisposable = api.workspace.onDidChangeTextDocument?.((event) => {
    const changedKey=key(event?.document?.fileName);if(disposed||!connected.some((item)=>key(item.fileName)===changedKey))return;
    if(localMutationDepth||changedKey!==key(filename)){statusScheduler.schedule();return;}
    return enqueue(async () => {
      if (disposed || localMutationDepth) return;
      if (draft?.snapshot().changed) { await retainDraft(document, draft, { force:true, reason:'The native source changed while the Coding Viewer retained a local edit.' }); conflict = 'The native source changed while this integrated draft has unapplied edits. Open Recovery for a separate non-overwriting copy.'; refreshDestinationStatuses();return; }
      draft?.discard(); draft = null; conflict = ''; draft = await openDraftForCurrent();refreshDestinationStatuses();
    });
  });
  const saveDisposable=api.workspace.onDidSaveTextDocument?.((saved)=>{if(connected.some((item)=>key(item.fileName)===key(saved?.fileName)))statusScheduler.schedule();});
  const closeDisposable=api.workspace.onDidCloseTextDocument?.((closed)=>{if(connected.some((item)=>key(item.fileName)===key(closed?.fileName)))statusScheduler.schedule();});
  const diagnosticDisposable=api.languages?.onDidChangeDiagnostics?.((event)=>{const uris=event?.uris;if(!Array.isArray(uris)||uris.length>512)return;const connectedUris=new Set(connected.map((item)=>String(item.uri)));if(uris.some((uri)=>connectedUris.has(String(uri))))statusScheduler.schedule();});
  const recoveryDisposable=recoveryStore.onDidChange?.(()=>statusScheduler.schedule());
  panel.onDidDispose(() => { disposed = true; generation += 1; statusScheduler.dispose();changeDisposable?.dispose?.();saveDisposable?.dispose?.();closeDisposable?.dispose?.();diagnosticDisposable?.dispose?.();recoveryDisposable?.dispose?.();viewDisposable?.dispose?.(); if (groupedIdentity && groupedPanels.get(groupedIdentity) === panelRecord) groupedPanels.delete(groupedIdentity); if (groupedIdentity) unmapGroupedRecord(panelRecord); for (const [file, record] of panels) if (record.panel === panel) panels.delete(file); if (draft?.snapshot().changed) { retainDraft(document, draft); api.window.showInformationMessage(`Unsaved Coding Viewer draft preserved for ${path.basename(filename)}.`); } draft?.close(panelId); });
  if (groupedIdentity) claim();
  refreshDestinationStatuses(false);render(); return panel;
}

async function openCodingViewer(uri, options = {}) {
  const target = seedUri(uri);
  if (!target) return api.window.showInformationMessage('Open a supported IKEMEN text file first.');
  const document = await sourceDocument(target), classification = classifyDocument(document, { configuration: api.workspace.getConfiguration('ikemenZss', document.uri) });
  if (!classification.supported) return openNative(document,options.line);
  if(options.legacyIntegrated!==true){
    const columns=await attachedCodeColumns(),editor=await openNative(document,options.line,undefined,columns.editorColumn),documents=connectedDocuments(document),files=[...new Map([document,...documents].map(item=>[key(item.fileName),item.fileName])).values()],directory=path.dirname(document.fileName);
    const companion=await api.commands.executeCommand('ikemen.textToolbar.openCompanion',{files,viewColumn:columns.editorColumn,headerColumn:columns.headerColumn,context:{type:classification.role||'project',key:directory,label:path.basename(directory),root:directory,files}});
    if(companion&&typeof companion==='object')companion.assetViewColumn=columns.editorColumn;
    return companion||editor||null;
  }
  const presentation = options.forceIntegrated ? INTEGRATED : await preference.resolve({ requestedPresentation: NATIVE, taskId: 'open-coding-viewer', sessionId: document.uri.toString() });
  if (presentation !== INTEGRATED) return openNative(document,options.line);
  const found = panels.get(key(document.fileName)); if (found) { await found.selectFile?.(document.fileName,options.line); found.panel.reveal(); return found.panel; }
  const panel = trackViewerPanel(api.window.createWebviewPanel(VIEW_TYPE, `IKEMaker Code · ${path.basename(document.fileName)}`, preferredViewerColumn(api.ViewColumn.Active), { enableScripts: true, retainContextWhenHidden: true }));
  const attached=await attachPanel(panel, document.uri);
  if(attached&&Number.isInteger(options.line))await panels.get(key(document.fileName))?.selectFile?.(document.fileName,options.line);
  return attached;
}
async function openPublicCodingViewer(uri) {
  const target = seedUri(uri), filename = target?.fsPath;
  if (filename) {
    const all = [...(groupedFileOwners.get(key(filename)) || [])], live = all.filter((record) => record.isLive?.());
    for (const stale of all.filter((record) => !live.includes(record))) unmapGroupedRecord(stale);
    const owners = live.filter((record) => record.canReuse?.(filename));
    if (owners.length === 1) { await owners[0].selectFile(filename); owners[0].panel.reveal(); return owners[0].panel; }
    if (live.length === 1) {
      if (await live[0].reclaimFile?.(filename)) return live[0].panel;
      api.window.showWarningMessage('The mapped Character Coding Viewer could not reclaim exact source authority. No duplicate viewer was opened.'); return null;
    }
    if (live.length > 1) { api.window.showWarningMessage('This source belongs to more than one Character Coding Viewer. Activate the intended character viewer first.'); return null; }
  }
  return openCodingViewer(uri, { forceIntegrated:true });
}

async function openBrowserCodingSource(source, browserContext = {}, browserAuthority = {}, services = {}) {
  const hostApi=services.api||api,getWorkspace=()=>services.workspace||browserWorkspace,registry=services.sourceRegistry||sourceRegistry,readDocument=services.sourceDocument||sourceDocument,nativeOpen=services.openNative||openNative;
  if(!source||typeof source.filename!=='string'||!path.isAbsolute(source.filename)||typeof source.fingerprint!=='string'||!/^[a-f0-9]{64}$/i.test(source.fingerprint))return false;
  const filename=path.resolve(source.filename), allowed=new Set((browserContext.files||browserContext.connectedFiles||[]).filter(value=>typeof value==='string'&&path.isAbsolute(value)).map(value=>key(path.resolve(value))));
  if(!allowed.has(key(filename)))return false;
  const admission=require('./coding_source_admission').codingSourceDispatchGuard(hostApi,browserContext,filename,{extensionContext:services.extensionContext||extensionContext});let refused=false;const admitted=()=>{if(admission())return true;if(!refused){refused=true;hostApi.window.showInformationMessage('This Coding Assistance source is no longer assigned to its current owner. Refresh the browser before opening it.');}return false;};if(!admitted())return false;
  let current;
  try { current=await readDocument(hostApi.Uri.file(filename)); } catch (_) { return false; }
  const currentFingerprint=crypto.createHash('sha256').update(current.getText()).digest('hex');
  if(currentFingerprint!==source.fingerprint){hostApi.window.showInformationMessage('This Authoring Browser result is stale because its source changed. Refreshing without moving the Coding Viewer.');await getWorkspace()?.refresh?.();return false;}
  const lineCount=Number.isInteger(current.lineCount)?current.lineCount:current.getText().split(/\r?\n/).length;
  const line=Number.isInteger(source.line)&&source.line>=0&&source.line<lineCount?source.line:undefined;
  if(Number.isInteger(source.line)&&line===undefined){await getWorkspace()?.refresh?.();return false;}
  const captured={workspace:getWorkspace(),contextEpoch:browserAuthority.contextEpoch,document:current,version:current.version,fingerprint:currentFingerprint};
  const stillAuthorized=()=>{
    if(!admitted()||getWorkspace()!==captured.workspace||getWorkspace()?.snapshot?.().contextEpoch!==captured.contextEpoch)return false;
    const live=(hostApi.workspace.textDocuments||[]).find(item=>key(item.fileName)===key(filename));
    return live===captured.document&&live.version===captured.version&&crypto.createHash('sha256').update(live.getText()).digest('hex')===captured.fingerprint;
  };
  if(!stillAuthorized())return false;
  const route=await registry.resolve('authoring-browser.exact-source',{filename,line,fingerprint:source.fingerprint,contextId:String(browserContext.identity||browserContext.id||''),selectionRevision:Number(browserContext.selectionRevision||0)});
  if(!route.available||key(route.filename)!==key(filename)||!stillAuthorized())return false;
  const all=[...(groupedFileOwners.get(key(filename))||[])], live=all.filter(record=>record.isLive?.());
  for(const stale of all.filter(record=>!live.includes(record)))unmapGroupedRecord(stale);
  const owners=live.filter(record=>record.canReuse?.(filename));
  if(owners.length===1){if(!await owners[0].selectFile(filename,line,stillAuthorized)||!stillAuthorized())return false;owners[0].panel.reveal();return owners[0].panel;}
  if(live.length===1){if(await live[0].reclaimFile?.(filename,line,stillAuthorized)&&stillAuthorized())return live[0].panel;return false;}
  if(live.length>1){hostApi.window.showWarningMessage('This source belongs to more than one Character Coding Viewer. Activate the intended character viewer first.');return false;}
  const found=panels.get(key(filename));
  if(found?.panel){if(!await found.selectFile?.(filename,line,stillAuthorized)||!stillAuthorized())return false;found.panel.reveal();return found.panel;}
  const editor=await nativeOpen(current,line,stillAuthorized);return editor&&stillAuthorized()?editor:false;
}

async function openCodingSet(descriptor, behavior = {}) {
  const options = validateCharacterCodingDescriptor(descriptor);
  if (!options) return api.window.showWarningMessage('Character coding files could not be validated.');
  const uri = api.Uri.file(options.files[0]);
  const requested = boundedCodingPaths(options.files), target = seedUri(uri);
  if (target?.fsPath && !requested.some((file) => key(file) === key(target.fsPath))) requested.unshift(path.resolve(target.fsPath));
  if (!requested.length) return api.window.showWarningMessage('No available character source files were found.');
  const scope = options.sessionId.slice(0, 512);
  return serializeCodingSet(scope, async () => {
    const documents = [], nativeFallback = [], skipped = [];
    for (const filename of requested.slice(0, 512)) {
      try {
        if (!fs.statSync(filename).isFile()) { skipped.push(path.basename(filename)); continue; }
        const current = await sourceDocument(api.Uri.file(filename));
        let classification;
        try { classification = classifyDocument(current, { configuration: api.workspace.getConfiguration('ikemenZss', current.uri) }); } catch (_) { classification = null; }
        if (classification?.supported) documents.push(current); else nativeFallback.push(current);
      } catch (_) { skipped.push(path.basename(filename)); }
    }
    // Character startup uses one attached two-row coding surface: the compact
    // universal header above, and every native source/viewer tab below. Coding
    // Assistance remains an explicit browser action in the lower tab group.
    if (behavior.legacyIntegrated !== true) {
      const columns=await attachedCodeColumns(),nativeDocuments=[...documents,...nativeFallback];
      for (const current of nativeDocuments) await openNative(current,undefined,undefined,columns.editorColumn);
      if(documents[0])await openNative(documents[0],undefined,undefined,columns.editorColumn);
      const files=nativeDocuments.map(item=>item.fileName);
      const companion=await api.commands.executeCommand('ikemen.textToolbar.openCompanion',{files,viewColumn:columns.editorColumn,headerColumn:columns.headerColumn,context:options.context});
      if(companion&&typeof companion==='object')companion.assetViewColumn=columns.editorColumn;
      if (skipped.length) api.window.showWarningMessage(`Skipped ${skipped.length} unavailable character source file(s).`);
      return companion||api.window.activeTextEditor||null;
    }
    for (const current of nativeFallback) await openNative(current);
    if (!documents.length) {
      if (skipped.length) api.window.showWarningMessage(`Skipped ${skipped.length} unavailable character source file(s).`);
      return null;
    }
    const context = normalizedCodingContext(options.context, documents.map((item) => item.fileName));
    const found = groupedPanels.get(options.identity);
    if (found) { await found.mergeDocuments?.(documents); found.panel.reveal(); return found.panel; }
    const panel = trackViewerPanel(api.window.createWebviewPanel(VIEW_TYPE, `IKEMaker Code · ${path.basename(documents[0].fileName)}`, preferredViewerColumn(api.ViewColumn.Active), { enableScripts: true, retainContextWhenHidden: true }));
    const attached = await attachPanel(panel, documents[0].uri, false, { documents, context, groupedIdentity:options.identity });
    if (!attached) panel.dispose();
    if (skipped.length) api.window.showWarningMessage(`Skipped ${skipped.length} unavailable character source file(s).`);
    return attached;
  });
}
async function openCharacterCodingSet(descriptor, behavior = {}) { return openCodingSet(descriptor, behavior); }

async function choosePresentation() {
  const picked = await api.window.showQuickPick([{ label: 'Native editors only', value: NATIVE }, { label: 'Native editor + coding tools', value: INTEGRATED }, { label: 'Ask for each task', value: ASK }], { title: 'IKEMaker coding presentation' });
  if (picked) await preference.write(picked.value);
  return picked?.value;
}

function configuredIntentAliases(){try{return api.workspace.getConfiguration('ikemenZss').get('authoring.intentAliases',{});}catch(_){return {};}}
const PERSONAL_DISCOVERY_KEYS=new Set(['id','owner','filename','label','scope','kind','signature','startLine','endLine','text','fingerprint','createdAt','parameters']);
function boundedPersonalDiscoveryPin(value,owner){
  if(!value||Object.getPrototypeOf(value)!==Object.prototype)return null;let propertyCount=0;for(const property in value){if(!Object.prototype.hasOwnProperty.call(value,property))continue;if(++propertyCount>PERSONAL_DISCOVERY_KEYS.size||!PERSONAL_DISCOVERY_KEYS.has(property))return null;}
  const safe=(candidate,max)=>typeof candidate==='string'&&Buffer.byteLength(candidate,'utf8')<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(candidate),parameters=value.parameters??[];
  if(!safe(value.id,128)||!safe(value.owner,4096)||!safe(value.filename,4096)||!safe(value.label||'',512)||!safe(value.kind||'',128)||!safe(value.signature||'',1024)||!safe(value.text,128*1024)||!safe(value.fingerprint,128)||value.createdAt!==undefined&&!safe(value.createdAt,128)||!path.isAbsolute(value.owner)||key(value.owner)!==key(owner)||!path.isAbsolute(value.filename)||!Number.isSafeInteger(value.startLine)||value.startLine<0||!Number.isSafeInteger(value.endLine)||value.endLine<value.startLine||!/^[a-f0-9]{64}$/i.test(value.fingerprint)||!Array.isArray(parameters)||parameters.length>32)return null;
  let bytes=Buffer.byteLength(value.id,'utf8')+Buffer.byteLength(value.owner,'utf8')+Buffer.byteLength(value.filename,'utf8')+Buffer.byteLength(value.label||'','utf8')+Buffer.byteLength(value.kind||'','utf8')+Buffer.byteLength(value.signature||'','utf8')+Buffer.byteLength(value.text,'utf8')+Buffer.byteLength(value.fingerprint,'utf8');
  for(const parameter of parameters){if(!parameter||Object.getPrototypeOf(parameter)!==Object.prototype)return null;const keys=[];for(const property in parameter)if(Object.prototype.hasOwnProperty.call(parameter,property))keys.push(property);if(keys.length>5||keys.some(property=>!['id','kind','label','original','ranges'].includes(property))||!safe(parameter.id,128)||!safe(parameter.kind,128)||!safe(parameter.label,512)||!safe(parameter.original,4096)||!Array.isArray(parameter.ranges)||parameter.ranges.length>64)return null;bytes+=Buffer.byteLength(parameter.id,'utf8')+Buffer.byteLength(parameter.kind,'utf8')+Buffer.byteLength(parameter.label,'utf8')+Buffer.byteLength(parameter.original,'utf8');for(const range of parameter.ranges){if(!range||Object.getPrototypeOf(range)!==Object.prototype||!Number.isSafeInteger(range.start)||!Number.isSafeInteger(range.end)||range.start<0||range.end<=range.start)return null;bytes+=16;}}
  if(bytes>128*1024)return null;
  return{bytes,pin:{id:value.id,owner:path.resolve(value.owner),filename:path.resolve(value.filename),label:value.label||value.signature||path.basename(value.filename),scope:value.scope==='shared'?'shared':'character',kind:value.kind||'excerpt',signature:value.signature||'',startLine:value.startLine,endLine:value.endLine,text:value.text,fingerprint:value.fingerprint,parameters:[]}};
}
function codeNavigationColumn() {
  for (const group of api.window.tabGroups?.all || []) {
    const ownsNavigation = (group.tabs || []).some((tab) => tab?.input?.viewType === 'ikemenTextCompanion' || /^IKEMaker Code Navigation(?:\s|·|$)/i.test(String(tab?.label || '')));
    if (ownsNavigation && Number.isInteger(group.viewColumn) && group.viewColumn > 0) return group.viewColumn;
  }
  return undefined;
}
async function settledCodeNavigationColumn(preferredColumn) {
  if (Number.isInteger(preferredColumn) && preferredColumn > 0) return preferredColumn;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const column = codeNavigationColumn();
    if (column) return column;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return undefined;
}
function treeProvider(reader, options={}) { return { async refresh(context) { if (!reader) throw new Error('This provider is unavailable in the current host.'); const data=await reader(context);if(options.semanticAliases!==true||!data||!Array.isArray(data.items))return data;const projection=aliasProjection(configuredIntentAliases(),flattenItems(data.items));return {...data,items:applyAliasDiscovery(data.items,projection.aliases),aliasCollisions:projection.collisions}; } }; }
const canonicalBrowserBatches=new WeakMap();
function liveBrowserDocuments(context,hostApi=api,hostContext=extensionContext) {
  return require('./coding_source_admission').admitCodingAssistanceSources(hostApi,context,{extensionContext:hostContext});
}
function browserPersonalExamples(context){
  const candidates=(context?.files||context?.connectedFiles||[]).filter(value=>typeof value==='string'&&path.isAbsolute(value)).slice(0,256),owner=typeof context?.ownerDef==='string'&&path.isAbsolute(context.ownerDef)&&path.extname(context.ownerDef).toLowerCase()==='.def'?path.resolve(context.ownerDef):'';if(!owner||!candidates.some(value=>key(value)===key(owner))||!extensionContext?.workspaceState)return[];
  const allowed=candidates.filter(value=>['.zss','.cns','.st','.lua'].includes(path.extname(value).toLowerCase())),allowedKeys=new Set(allowed.map(key)),texts=new Map();let totalBytes=0;
  const readText=filename=>{const identity=key(filename);if(!allowedKeys.has(identity))throw new Error('Source is not assigned to this context.');if(texts.has(identity))return texts.get(identity);const open=(api.workspace.textDocuments||[]).find(item=>key(item.fileName)===identity),text=open&&!open.isClosed?open.getText():fs.readFileSync(filename,'utf8'),bytes=Buffer.byteLength(text,'utf8');if(bytes>4*1024*1024||totalBytes+bytes>16*1024*1024)throw new Error('Source exceeds the bounded example intake.');totalBytes+=bytes;texts.set(identity,text);return text;};
  const raw=extensionContext.workspaceState.get(personalExamplesApi.STORE_KEY,{}),ownerPins=raw&&Object.getPrototypeOf(raw)===Object.prototype&&raw.byOwner&&Object.getPrototypeOf(raw.byOwner)===Object.prototype&&Array.isArray(raw.byOwner[personalExamplesApi.key(owner)])?raw.byOwner[personalExamplesApi.key(owner)]:[];let pinBytes=0;
  const pins=[];for(let index=0;index<ownerPins.length&&index<64;index+=1){const projected=boundedPersonalDiscoveryPin(ownerPins[index],owner);if(!projected)continue;if(pinBytes+projected.bytes>2*1024*1024)break;pinBytes+=projected.bytes;pins.push(projected.pin);}
  return pins.map(pin=>{let resolved;try{resolved=personalExamplesApi.resolvePin(pin,{allowedFiles:allowed,readText});}catch(error){resolved={...pin,status:'missing',detail:`Source could not be admitted: ${error?.message||error}`};}const usable=['current','moved'].includes(resolved.status);let source,text;if(usable)try{text=readText(pin.filename);source={filename:path.resolve(pin.filename),line:resolved.resolvedStartLine??pin.startLine,endLine:resolved.resolvedEndLine??pin.endLine,fingerprint:crypto.createHash('sha256').update(text).digest('hex')};}catch(error){resolved={...resolved,status:'missing',detail:`Source could not be admitted: ${error?.message||error}`};}
    return{id:pin.id,label:pin.label,kind:pin.kind,status:resolved.status,detail:resolved.detail,filename:pin.filename,sourceLabel:path.basename(pin.filename),...(source?{source,text:pin.text}: {})};});
}
function resumeOwner(context){const owner=typeof context?.ownerDef==='string'&&path.isAbsolute(context.ownerDef)&&path.extname(context.ownerDef).toLowerCase()==='.def'?path.resolve(context.ownerDef):'';return owner&&(context.files||context.connectedFiles||[]).some(file=>typeof file==='string'&&key(file)===key(owner))?owner:'';}
function resolveResumeContext(context){
  const owner=resumeOwner(context);if(!owner||!resumeContextPersistence)return null;const marker=resumeContextApi.markerFor(resumeContextPersistence.snapshot(),owner);if(!marker)return null;const allowed=(context.files||context.connectedFiles||[]).filter(file=>typeof file==='string'&&path.isAbsolute(file)&&['.zss','.cns','.st','.lua'].includes(path.extname(file).toLowerCase())).slice(0,256),readText=filename=>{const open=(api.workspace.textDocuments||[]).find(document=>key(document.fileName)===key(filename));if(open&&!open.isClosed)return open.getText();return fs.readFileSync(filename,'utf8');},resolved=resumeContextApi.resolveMarker(marker,{owner,context,allowedFiles:allowed,readText});return Object.freeze({id:resolved.id||'',label:resolved.label||'Saved marker',status:resolved.status,detail:resolved.detail||'',...(resolved.source?{source:resolved.source}: {})});
}
function refreshResumeContext(context=browserBoundContext,expectedWorkspace=browserWorkspace){if(!expectedWorkspace||expectedWorkspace!==browserWorkspace)return false;return expectedWorkspace.setResumeContext(resolveResumeContext(context));}
async function markResumeContext(authority){
  if(!browserIntentCurrent(authority))return false;const context=authority.context||{},owner=resumeOwner(context),editor=api.window.activeTextEditor,filename=editor?.document?.fileName,admitted=new Set((context.files||context.connectedFiles||[]).filter(value=>typeof value==='string').map(key));if(!owner)return api.window.showInformationMessage('Resume in Context requires an exact owning character DEF.');if(!editor||typeof filename!=='string'||!path.isAbsolute(filename)||!admitted.has(key(filename))||!['.zss','.cns','.st','.lua'].includes(path.extname(filename).toLowerCase()))return api.window.showInformationMessage('Focus a connected ZSS, CNS/ST, or Lua block before marking it.');
  const sourceText=editor.document.getText(),sourceBytes=Buffer.byteLength(sourceText,'utf8');if(sourceBytes>resumeContextApi.MAX_SOURCE_BYTES)return api.window.showWarningMessage('The active source exceeds the 4 MiB Resume in Context limit.');const capture=Object.freeze({document:editor.document,uri:String(editor.document.uri),filename:path.resolve(filename),version:editor.document.version,line:Math.max(0,Number(editor.selection?.active?.line)||0),character:Math.max(0,Number(editor.selection?.active?.character)||0),fingerprint:crypto.createHash('sha256').update(sourceText).digest('hex')});
  let preliminary;try{preliminary=resumeContextApi.createMarker({owner,context,filename:capture.filename,text:sourceText,line:capture.line});}catch(error){return api.window.showWarningMessage(error?.message||String(error));}const label=await api.window.showInputBox({title:'Mark Resume in Context',prompt:'Optional workspace-local label for this exact code block.',value:preliminary.label,ignoreFocusOut:true,validateInput:value=>Buffer.byteLength(String(value||''),'utf8')>512?'Use 512 UTF-8 bytes or fewer.':/[\u0000-\u001f\u007f]/.test(String(value||''))?'Use plain text without control characters.':undefined});if(label===undefined||!browserIntentCurrent(authority))return false;
  const currentEditor=api.window.activeTextEditor,currentDocument=currentEditor?.document,currentLine=Math.max(0,Number(currentEditor?.selection?.active?.line)||0),currentCharacter=Math.max(0,Number(currentEditor?.selection?.active?.character)||0);let currentText='';if(currentDocument===capture.document&&!currentDocument.isClosed)currentText=currentDocument.getText();const captureCurrent=currentEditor===editor&&currentDocument===capture.document&&String(currentDocument?.uri)===capture.uri&&path.resolve(String(currentDocument?.fileName||''))===capture.filename&&currentDocument?.version===capture.version&&currentLine===capture.line&&currentCharacter===capture.character&&Buffer.byteLength(currentText,'utf8')<=resumeContextApi.MAX_SOURCE_BYTES&&crypto.createHash('sha256').update(currentText).digest('hex')===capture.fingerprint&&admitted.has(key(currentDocument?.fileName));if(!captureCurrent){api.window.showInformationMessage('The editor, source, or caret changed while the marker was being named. Mark the intended block again.');return false;}
  const marker=Object.freeze({...preliminary,label:String(label).trim()||preliminary.label});const result=await resumeContextPersistence.mutate(store=>resumeContextApi.putMarker(store,marker),()=>browserIntentCurrent(authority));if(!result.saved||!result.adopted)return false;refreshResumeContext(context);return api.window.showInformationMessage(`Marked ${marker.label} for Resume in Context. No source file was changed.`);
}
async function clearResumeContext(authority){if(!browserIntentCurrent(authority))return false;const context=authority.context||{},owner=resumeOwner(context);if(!owner)return false;const result=await resumeContextPersistence.mutate(store=>resumeContextApi.clearMarker(store,owner),()=>browserIntentCurrent(authority));if(!result.saved||!result.adopted)return false;refreshResumeContext(context);return true;}
async function resumeMarkedContext(authority){if(!browserIntentCurrent(authority))return false;const projection=resolveResumeContext(authority.context||{});if(!projection||!['current','moved'].includes(projection.status)||!projection.source){refreshResumeContext(authority.context||{});return api.window.showInformationMessage(projection?.detail||'No current Resume in Context marker is available.');}return openBrowserCodingSource(projection.source,authority.context||{},authority);}
async function browserCapability(context) {
  if(typeof authoringBrowserCapabilityResolver!=='function')return {nightlyStringsEnabled:false,target:null,enabledCapabilities:[]};
  try { const value=await authoringBrowserCapabilityResolver(context); return {...value,nightlyStringsEnabled:value?.nightlyStringsEnabled===true,target:value?.target||null,enabledCapabilities:Array.isArray(value?.enabledCapabilities)?value.enabledCapabilities:[]}; }
  catch (_) { return {nightlyStringsEnabled:false,target:null,enabledCapabilities:[]}; }
}
function canonicalBrowserProvider(providerId) {
  return { async refresh(context) {
    let batch=context&&typeof context==='object'?canonicalBrowserBatches.get(context):null;
    if(!batch){batch=(async()=>{const live=liveBrowserDocuments(context),capability=browserWorkspace?.capability||await browserCapability(context),aliases=configuredIntentAliases(),contextIdentity=[context?.type||context?.kind||'project',context?.identity||context?.id||context?.key||context?.root||''].join('\0'),personalExamples=browserPersonalExamples(context),ownerDef=resumeOwner(context);return buildAuthoringBrowserModel({...live,assignedFiles:context?.files||[],nightlyStringsEnabled:capability.nightlyStringsEnabled,capabilities:capability,aliases,personalExamples,glossaryMetadata:glossaryMetadataStore,contextIdentity,ownerDef});})();if(context&&typeof context==='object'){canonicalBrowserBatches.set(context,batch);queueMicrotask(()=>{if(canonicalBrowserBatches.get(context)===batch)canonicalBrowserBatches.delete(context);});}}
    return (await batch).providers[providerId];
  } };
}
function browserAuthorityFingerprints(context,capability){
  const { reviewedFiles, fingerprintFiles } = require('./authoring_browser_model');
  const live=liveBrowserDocuments(context),capabilityIds=[...(capability?.enabledCapabilities||[])].map(String).sort(),contextIdentity=[context?.type||context?.kind||'project',context?.identity||context?.id||context?.key||context?.root||''].join('\0');
  return{live,capabilityFingerprint:crypto.createHash('sha256').update(JSON.stringify(capabilityIds)).digest('hex'),catalogFingerprint:fingerprintFiles(reviewedFiles(live, path.resolve(context.root || '.'))),contextFingerprint:opaque(['authoring-context',contextIdentity])};
}
async function adaptationSelections(review,authority){
  const selections={};
  for(const row of review.rows||[]){
    if(row.status==='dynamic-unresolved'){await api.window.showWarningMessage('This reference contains a dynamic dependency. Review it manually before creating an adaptation draft.');return null;}
    if(row.status==='already-matched'&&row.selectedValue){selections[row.id]={value:row.selectedValue,source:'catalog'};continue;}
    if(!browserIntentCurrent(authority))return null;
    const alternatives=(row.alternatives||[]).map(value=>({label:String(value),description:`Current-project ${row.kind} value`,value:String(value),source:'catalog'})),custom={label:'$(edit) Enter an explicit value…',description:`Enter one bounded ${row.kind} literal; this does not add it to the project catalog.`,custom:true},picked=await api.window.showQuickPick([...alternatives,custom],{title:`Adapt ${row.kind}: ${row.referenceValue}`,placeHolder:'Choose an admitted current-project value or enter an explicit reviewed literal',ignoreFocusOut:true});
    if(!picked||!browserIntentCurrent(authority))return null;
    if(!picked.custom){selections[row.id]={value:picked.value,source:'catalog'};continue;}
    const value=await api.window.showInputBox({title:`Explicit ${row.kind} value`,prompt:'This value is classified only for this scratch draft and will not change project source.',ignoreFocusOut:true,validateInput:candidate=>validReplacement(row.kind,candidate)?undefined:`Enter one valid ${row.kind} literal without markup, control characters, or expressions.`});
    if(value===undefined||!browserIntentCurrent(authority))return null;selections[row.id]={value,source:'explicit'};
  }
  return selections;
}
async function createAdaptationScratch(intent,authority){
  if(!browserIntentCurrent(authority)||!intent?.review||!/^[a-f0-9]{64}$/i.test(String(intent.routeId||'')))return false;const review=intent.review,replayKey=intent.routeId.toLowerCase();if(usedAdaptationDrafts.has(replayKey)||pendingAdaptationDrafts.has(replayKey))return api.window.showWarningMessage('This reviewed adaptation handle was already used or is currently being reviewed. Refresh Similar Code before creating another scratch draft.');pendingAdaptationDrafts.add(replayKey);
  try{
  const context=authority.context||{},admitted=new Set((context.files||context.connectedFiles||[]).filter(value=>typeof value==='string').map(key));if(!admitted.has(key(review.current?.filename))||!admitted.has(key(review.reference?.filename)))return api.window.showWarningMessage('The current or reference source is no longer admitted to this coding context.');
  const selections=await adaptationSelections(review,authority);if(!selections||!browserIntentCurrent(authority))return false;
  const capability=await browserCapability(context);if(!browserIntentCurrent(authority))return false;const evidence=browserAuthorityFingerprints(context,capability);
  if(String(review.target?.channel||'').toLowerCase()!==String(capability?.target?.channel||(capability?.nightlyStringsEnabled?'nightly':'stable')).toLowerCase()||String(review.target?.version||'')!==String(capability?.target?.version||(capability?.nightlyStringsEnabled?'':'1.0')))return api.window.showWarningMessage('The selected engine target changed. Refresh Similar Code before creating a scratch draft.');
  const current=evidence.live.documents.find(document=>key(document.filename)===key(review.current.filename)),reference=evidence.live.documents.find(document=>key(document.filename)===key(review.reference.filename));if(!current||!reference)return api.window.showWarningMessage('The exact current or reference source is no longer available.');
  let draft;try{draft=buildAdaptationDraft({review,currentText:current.text,referenceText:reference.text,selections,capabilityFingerprint:evidence.capabilityFingerprint,catalogFingerprint:evidence.catalogFingerprint,contextFingerprint:evidence.contextFingerprint});}catch(error){return api.window.showWarningMessage(error?.message||String(error));}
  if(!browserIntentCurrent(authority))return false;usedAdaptationDrafts.add(replayKey);while(usedAdaptationDrafts.size>256)usedAdaptationDrafts.delete(usedAdaptationDrafts.values().next().value);
  const originalDocument=await api.workspace.openTextDocument({content:draft.original,language:draft.languageId}),adaptedDocument=await api.workspace.openTextDocument({content:draft.text,language:draft.languageId});if(!browserIntentCurrent(authority))return false;
  const title=`Adaptation review · ${String(intent.label||path.basename(review.reference.filename)).slice(0,128)} · ${draft.replacementCount} replacement${draft.replacementCount===1?'':'s'}`;
  try{await api.commands.executeCommand('vscode.diff',originalDocument.uri,adaptedDocument.uri,title,{preview:false});}catch(_){await api.window.showTextDocument(adaptedDocument,{preview:false});}
  return api.window.showInformationMessage(`Opened a native untitled adaptation draft and exact comparison. ${draft.replacementCount} literal replacement(s); ${draft.unchangedBytes} source bytes unchanged. No project file was edited or saved.`);
  }finally{pendingAdaptationDrafts.delete(replayKey);}
}
function scheduleBrowserRefresh(providerIds=PROVIDER_IDS,delay=180){
  for(const id of providerIds)if(PROVIDER_IDS.includes(id))browserRefreshProviders.add(id);
  const epoch=++browserRefreshEpoch;if(browserRefreshTimer)clearTimeout(browserRefreshTimer);
  browserRefreshTimer=setTimeout(()=>{browserRefreshTimer=null;const workspace=browserWorkspace,panel=browserPanel,ids=[...browserRefreshProviders];browserRefreshProviders.clear();if(!workspace||!panel||!ids.length)return;browserRefreshTail=browserRefreshTail.then(async()=>{if(epoch!==browserRefreshEpoch||workspace!==browserWorkspace||panel!==browserPanel)return;if(ids.some(id=>['code-navigator','project-data','recipes','similar-code'].includes(id)))workspace.setCapability(await browserCapability(browserBoundContext),false);await workspace.refreshProviders(ids);refreshResumeContext(browserBoundContext,workspace);}).catch(()=>{});},Math.max(0,Math.min(1000,Number(delay)||0)));
}
function diagnosticBrowserProvider() {
  return { async refresh(context) {
    const files=(context?.files||context?.connectedFiles||[]).filter(value=>typeof value==='string'&&path.isAbsolute(value)).slice(0,256),items=[];
    for(const filenameValue of files){
      const filename=path.resolve(filenameValue),document=(api.workspace.textDocuments||[]).find(item=>key(item.fileName)===key(filename));
      if(!document||document.isClosed)continue;
      let diagnostics=[];try{diagnostics=api.languages?.getDiagnostics?.(document.uri)||[];}catch{}
      const sourceFingerprint=crypto.createHash('sha256').update(document.getText()).digest('hex'),children=[];
      for(let index=0;index<diagnostics.length&&children.length<512&&items.reduce((sum,item)=>sum+(item.children?.length||0),0)<2048;index+=1){
        const diagnostic=diagnostics[index],line=Math.max(0,Number(diagnostic?.range?.start?.line)||0),severity=diagnostic?.severity===(api.DiagnosticSeverity?.Error??0)?'Error':diagnostic?.severity===(api.DiagnosticSeverity?.Warning??1)?'Warning':diagnostic?.severity===(api.DiagnosticSeverity?.Information??2)?'Information':'Hint',message=String(diagnostic?.message||'Diagnostic').slice(0,2048),origin=String(diagnostic?.source||'IKEMaker').slice(0,256);
        children.push({id:crypto.createHash('sha256').update(JSON.stringify([filename,line,index,severity,message])).digest('hex').slice(0,32),label:`${severity}: ${message}`,kind:'diagnostic',status:severity,description:`${path.basename(filename)}:${line+1} · ${origin}`,sourceLabel:path.basename(filename),source:{filename,line,endLine:line,fingerprint:sourceFingerprint}});
      }
      if(children.length)items.push({id:crypto.createHash('sha256').update(`problems\0${filename}`).digest('hex').slice(0,32),label:path.basename(filename),kind:'file',description:`${children.length} problem${children.length===1?'':'s'}`,children});
    }
    return{items,count:items.reduce((sum,item)=>sum+item.children.length,0),truncated:items.reduce((sum,item)=>sum+item.children.length,0)>=2048};
  }};
}
function diagnosticSeverity(value){return value===(api.DiagnosticSeverity?.Error??0)?'Error':value===(api.DiagnosticSeverity?.Warning??1)?'Warning':value===(api.DiagnosticSeverity?.Information??2)?'Information':'Hint';}
function explanationCatalogDocuments(context){
  const allowed=new Set(['.zss','.cns','.st','.cmd']),documents=[],expected=[],seen=new Set();let totalBytes=0,bounded=true;
  for(const candidate of (context?.files||context?.connectedFiles||[]).slice(0,256)){
    if(typeof candidate!=='string'||!path.isAbsolute(candidate)||!allowed.has(path.extname(candidate).toLowerCase()))continue;const filename=path.resolve(candidate),identity=key(filename);if(seen.has(identity))continue;seen.add(identity);expected.push(identity);
    const open=(api.workspace.textDocuments||[]).find(item=>key(item.fileName)===identity);if(open&&!open.isClosed){const text=open.getText(),bytes=Buffer.byteLength(text,'utf8');if(bytes<=4*1024*1024&&totalBytes+bytes<=16*1024*1024){totalBytes+=bytes;documents.push({filename,text});}else bounded=false;continue;}
    try{if(fs.statSync(filename).isFile()){const text=fs.readFileSync(filename,'utf8'),bytes=Buffer.byteLength(text,'utf8');if(bytes<=4*1024*1024&&totalBytes+bytes<=16*1024*1024){totalBytes+=bytes;documents.push({filename,text});}else bounded=false;}}catch(_){bounded=false;}
  }
  const catalog=buildProjectSymbolCatalog(documents,{assignedFiles:expected});
  return boundedCatalogMembership(catalog.entries,bounded&&documents.length===expected.length&&catalog.failures.length===0);
}
function capabilityIdentity(value){const ids=[...(value?.enabledCapabilities||[])].map(String).sort();return JSON.stringify({nightlyStringsEnabled:value?.nightlyStringsEnabled===true,target:value?.target||null,enabledCapabilities:ids});}
async function currentBlockExplanation(context=browserBoundContext){
  const editor=api.window.activeTextEditor,document=editor?.document,filename=document?.fileName,connected=new Set((context?.files||context?.connectedFiles||[]).filter(item=>typeof item==='string').map(key));
  if(!editor||typeof filename!=='string'||!connected.has(key(filename))||document.isClosed||!['.zss','.cns','.st','.lua'].includes(path.extname(filename).toLowerCase()))return{ok:false,reason:'Place the native editor caret inside a connected ZSS, CNS/ST, or Lua block.'};
  const text=document.getText(),version=Number.isSafeInteger(document.version)?document.version:-1,line=Math.max(0,Number(editor.selection?.active?.line)||0),sourceHash=crypto.createHash('sha256').update(text).digest('hex');if(Buffer.byteLength(text,'utf8')>4*1024*1024)return{ok:false,reason:'This source exceeds the 4 MiB explanation limit.'};
  const capability=await browserCapability(context),capabilityKey=capabilityIdentity(capability),allDiagnostics=api.languages?.getDiagnostics?.(document.uri)||[],diagnostics=allDiagnostics.slice(0,2048).map(value=>({startLine:value.range?.start?.line||0,endLine:value.range?.end?.line??value.range?.start?.line??0,severity:diagnosticSeverity(value.severity),code:typeof value.code==='object'?value.code?.value:value.code||'',message:value.message||'Diagnostic'}));
  const result=buildCurrentBlockExplanation({filename:path.resolve(filename),text,language:document.languageId,line,version,fingerprint:sourceHash,contextKey:glossaryContextKey(context),target:{...(capability.target||{}),capabilityFingerprint:crypto.createHash('sha256').update(capabilityKey).digest('hex')},nightlyStringsEnabled:capability.nightlyStringsEnabled,catalog:explanationCatalogDocuments(context),diagnostics,diagnosticsComplete:allDiagnostics.length<=2048,diagnosticsOmittedCount:Math.max(0,allDiagnostics.length-2048)});
  const currentEditor=api.window.activeTextEditor,currentCapability=await browserCapability(context);if(currentEditor!==editor||currentEditor?.document!==document||document.version!==version||Math.max(0,Number(currentEditor.selection?.active?.line)||0)!==line||crypto.createHash('sha256').update(document.getText()).digest('hex')!==sourceHash||capabilityIdentity(currentCapability)!==capabilityKey)return{ok:false,reason:'The source, caret, context, or engine target changed while the explanation was being built. Run it again.'};
  return result;
}
async function explainCurrentBlock(authority={context:browserBoundContext,contextEpoch:browserWorkspace?.contextEpoch,generation:browserWorkspace?.generation}){
  if(!browserIntentCurrent(authority))return false;const value=await currentBlockExplanation(authority.context);if(!browserIntentCurrent(authority))return false;
  if(value?.ok!==true){await api.window.showInformationMessage(value?.reason||'No supported current block was found.');return false;}
  return browserWorkspace.showBlockExplanation(value,authority);
}
async function handleAssistantAction(intent,authority){
  return codingAssistantActions.execute(api,intent,authority?.context||{},{isCurrent:()=>browserIntentCurrent(authority),focusSimilar:()=>browserPanel?.webview?.postMessage?.({type:'focus-provider',providerId:'similar-code'})||false});
}
async function refreshCurrentBlockExplanation(){
  if(!browserWorkspace?.blockExplanation||!browserPanel)return false;const authority={context:browserBoundContext,contextEpoch:browserWorkspace.contextEpoch,generation:browserWorkspace.generation};return explainCurrentBlock(authority);
}
// Bind the actual caller document before consulting ambient panel selection.
async function browserContextForSource(uri, hostApi=api) {
  if(!uri)return null;
  const document=await hostApi.workspace.openTextDocument(uri);
  if(document.isClosed||!path.isAbsolute(document.fileName))return null;
  const toolbar=require('./text_editor_toolbar'),classification=toolbar.classify(document,hostApi.workspace.getConfiguration('ikemenZss',document.uri));
  if(!classification.supported)return null;
  const descriptor=toolbar.contextDescriptor(document,classification);
  const files=[...new Set([document.fileName,...(descriptor.files||[])])];
  if(descriptor.ownerDef)try{for(const file of require('./related_work').resolveAssigned(descriptor.ownerDef).code||[])if(!files.includes(file))files.push(file);}catch{}
  const editor=hostApi.window.activeTextEditor,line=editor?.document===document?Math.max(0,Number(editor.selection?.active?.line)||0):0;
  return {...descriptor,root:descriptor.root||path.dirname(document.fileName),files,sourceUri:document.uri.toString(),sourceBinding:descriptor.ownerDef?'assigned-resource':'standalone-source',selection:{uri:document.uri.toString(),filename:document.fileName,line}};
}

async function openAuthoringBrowser(context = {}, restoredPanel = null, companionColumn = undefined, targetColumn = undefined) {
  browserRefreshEpoch+=1;browserRefreshProviders.clear();if(browserRefreshTimer){clearTimeout(browserRefreshTimer);browserRefreshTimer=null;}
  const capability=await browserCapability(context);
  const exactCompanionColumn=await settledCodeNavigationColumn(companionColumn);
  // Coding Assistance is a separate browser. The Code Navigation group is a
  // fixed header and must never accept auxiliary browser tabs.
  const assistanceColumn=Number.isInteger(targetColumn)&&targetColumn>0?targetColumn:preferredViewerColumn(api.ViewColumn.Beside,exactCompanionColumn);
  if (browserPanel) {
    if(restoredPanel&&restoredPanel!==browserPanel)restoredPanel.dispose();
    browserBoundContext=context;
    contextRegistry.registerAuthoringPanel(browserPanel, { type: context.type || context.kind || 'project', key: context.key || context.root, label: context.label, root: context.root, ownerDef: context.ownerDef || '', files: context.files || context.connectedFiles, activeSurfaceId: 'code.authoring-browser' });
    browserWorkspace.setCapability(capability,false);await browserWorkspace.open(context);refreshResumeContext(context); browserPanel.reveal(assistanceColumn); return browserPanel;
  }
  const providers = authoringBrowserProviders;
  const registry = createBrowserRegistry({
    'code-navigator': canonicalBrowserProvider('code-navigator'), 'project-data': canonicalBrowserProvider('project-data'), recipes: canonicalBrowserProvider('recipes'), 'similar-code':canonicalBrowserProvider('similar-code'), controllers: treeProvider(providers.controllers,{semanticAliases:true}), problems:diagnosticBrowserProvider()
  });
  const workspace = browserWorkspace = createAuthoringBrowserWorkspace({ registry, capability, onState: () => { if (browserPanel) browserPanel.webview.html = require('./webview_policy').protect(workspace.html({ nonce: nonce(),restore:serializedAssistanceState(browserBoundContext||{}) }), browserPanel.webview.cspSource); }, onIntent: (intent, authority) => {
    if (intent.type === 'open-source' && intent.source?.filename) return openBrowserCodingSource(intent.source,authority?.context||{},authority||{});
    if(intent.type==='explain-current-block')return explainCurrentBlock(authority);
    if(intent.type==='open-block-explanation-source')return openBrowserCodingSource(intent.source,authority?.context||{},authority||{});
    if(intent.type==='edit-glossary')return editGlossaryAnnotation(intent,authority);
    if(intent.type==='toggle-glossary-favorite')return toggleGlossaryFavorite(intent,authority);
    if(intent.type==='create-adaptation-draft')return createAdaptationScratch(intent,authority);
    if(intent.type==='assistant-action')return handleAssistantAction(intent,authority);
    if(intent.type==='mark-resume-context')return markResumeContext(authority);
    if(intent.type==='resume-context')return resumeMarkedContext(authority);
    if(intent.type==='clear-resume-context')return clearResumeContext(authority);
    if(intent.type==='refresh-resume-context')return refreshResumeContext(authority?.context,browserWorkspace);
    if(intent.type==='review-controller-change')return authoringBrowserProviders.controllers?.reviewController?.(intent.controller,authority?.context,intent.snapshotId,()=>browserIntentCurrent(authority));
    if(intent.type==='clear-controller-change-group')return authoringBrowserProviders.controllers?.clearGroup?.(intent.groupId,authority?.context,intent.snapshotId,()=>browserIntentCurrent(authority));
    if(intent.type==='open-engine-targets'){
      const candidate=(authority?.context?.files||authority?.context?.connectedFiles||[])[0]||authority?.context?.root||'';
      return api.commands.executeCommand('ikemen.engineRegistry.open',typeof candidate==='string'&&path.isAbsolute(candidate)?api.Uri.file(candidate):undefined);
    }
  } });
  browserBoundContext=context;
  browserPanel = trackViewerPanel(restoredPanel||api.window.createWebviewPanel('ikemenAuthoringBrowser', 'IKEMaker Coding Assistance', assistanceColumn, { enableScripts: true, retainContextWhenHidden: true }));
  browserMinimumWidth=createMinimumWidthController(browserPanel,api.commands);
  viewerClose.support(browserPanel,{readOnly:true});
  if (!restoredPanel) browserPanel.reveal(assistanceColumn);
  if (context?.identity || context?.id || context?.key) contextRegistry.registerAuthoringPanel(browserPanel, { type: context.type || context.kind || 'project', key: context.key || context.root, label: context.label, root: context.root, ownerDef: context.ownerDef || '', files: context.files || context.connectedFiles, activeSurfaceId: 'code.authoring-browser' });
  browserPanel.onDidDispose(() => { browserRefreshEpoch+=1;browserRefreshProviders.clear();if(browserRefreshTimer){clearTimeout(browserRefreshTimer);browserRefreshTimer=null;}browserPanel = null; browserWorkspace=null; browserBoundContext=null; browserMinimumWidth=null; workspace.close(); });
  browserPanel.webview.onDidReceiveMessage(async message => { if(message?.type==='ikemenBrowserShortcut')return require('./viewer_browser_shortcut').handleCompanion(message,'code','',browserPanel,{api,lookup:()=>browserPanel?{panel:browserPanel}:null});if(message?.type==='companionBrowserViewport')return browserMinimumWidth?.handle(message);return workspace.handleMessage(message); });
  await workspace.open(context);refreshResumeContext(context,workspace); return browserPanel;
}
function glossaryContextKey(value){return JSON.stringify([value?.type||value?.kind||'',value?.identity||value?.id||'',value?.key||'',value?.root||'']);}
function browserIntentCurrent(authority){return browserWorkspace&&browserPanel&&authority?.contextEpoch===browserWorkspace.contextEpoch&&authority?.generation===browserWorkspace.generation&&glossaryContextKey(authority?.context)===glossaryContextKey(browserBoundContext);}
function glossaryIntentCurrent(authority,allowGenerationChange=false){return browserWorkspace&&browserPanel&&authority?.contextEpoch===browserWorkspace.contextEpoch&&(allowGenerationChange||authority?.generation===browserWorkspace.generation)&&glossaryContextKey(authority?.context)===glossaryContextKey(browserBoundContext);}
async function persistGlossaryMutation(authority,mutate){
  const result=await glossaryPersistence.mutate(mutate,()=>glossaryIntentCurrent(authority));glossaryMetadataStore=glossaryPersistence.snapshot();if(!result.saved||!result.adopted)return false;
  try{await browserWorkspace.refreshProviders(['project-data']);}catch(error){await api.window.showWarningMessage(`Glossary metadata was saved, but Project Data could not refresh: ${error?.message||error}`);}return true;
}
async function editGlossaryAnnotation(intent,authority){
  if(!glossaryIntentCurrent(authority))return false;const current=glossaryMetadataApi.annotationFor(glossaryMetadataStore,intent.metadataId)||intent.annotation;
  const description=await api.window.showInputBox({title:`Glossary description — ${intent.label}`,prompt:'Workspace-local meaning. This does not rewrite source.',value:current.description||'',ignoreFocusOut:true,validateInput:value=>Buffer.byteLength(String(value||''),'utf8')>glossaryMetadataApi.LIMITS.descriptionBytes?'Description is too long.':/[<>\u0000-\u001f\u007f]/.test(String(value||''))?'Use plain text without markup or control characters.':undefined});if(description===undefined||!glossaryIntentCurrent(authority))return false;
  const aliasesText=await api.window.showInputBox({title:`Glossary aliases — ${intent.label}`,prompt:'Optional comma-separated local search terms.',value:(current.aliases||[]).join(', '),ignoreFocusOut:true,validateInput:value=>{const aliases=String(value||'').split(',').map(item=>item.trim()).filter(Boolean);if(aliases.length>glossaryMetadataApi.LIMITS.aliases)return `Use no more than ${glossaryMetadataApi.LIMITS.aliases} aliases.`;if(aliases.some(item=>Buffer.byteLength(item,'utf8')>glossaryMetadataApi.LIMITS.aliasBytes))return 'Each alias must use 256 UTF-8 bytes or fewer.';if(aliases.some(item=>/[<>\u0000-\u001f\u007f]/.test(item)))return 'Use plain alias text without markup or control characters.';return undefined;}});if(aliasesText===undefined||!glossaryIntentCurrent(authority))return false;
  const aliases=aliasesText.split(',').map(value=>value.trim()).filter(Boolean).slice(0,glossaryMetadataApi.LIMITS.aliases);return persistGlossaryMutation(authority,store=>{const latest=glossaryMetadataApi.annotationFor(store,intent.metadataId);return glossaryMetadataApi.putAnnotation(store,{id:intent.metadataId,description,aliases,favorite:latest?.favorite===true});});
}
async function toggleGlossaryFavorite(intent,authority){if(!glossaryIntentCurrent(authority))return false;return persistGlossaryMutation(authority,store=>glossaryMetadataApi.toggleFavorite(store,intent.metadataId));}
async function openNativeFile(source) {
  if (!source || typeof source.filename !== 'string' || !path.isAbsolute(source.filename)) return false;
  const document = await sourceDocument(api.Uri.file(path.resolve(source.filename)));
  return openNative(document, Number.isInteger(source.line) ? source.line : undefined);
}

function registerAuthoringWorkspace(vscode, context, browserProviders = {}) {
  api = vscode; extensionContext = context; authoringBrowserCapabilityResolver=typeof browserProviders.capabilities==='function'?browserProviders.capabilities:null; authoringBrowserProviders = Object.freeze(Object.fromEntries(Object.entries(browserProviders).filter(([key])=>key!=='capabilities')));
  preference = new AuthoringPresentationPreference({ storage: preferenceStorage(), prompt: askPresentation, fallback: NATIVE });
  viewStates = new AuthoringViewState(context.workspaceState.get(STATE_KEY));
  recoveryStore = new AuthoringRecoveryStore(context.workspaceState, DRAFT_STATE_KEY);
  cardHandsStore = sharedAuthoringCardHandsStore(context.workspaceState, CARD_HANDS_STATE_KEY);
  glossaryMetadataStore=glossaryMetadataApi.normalizeStore(context.workspaceState.get(GLOSSARY_METADATA_STATE_KEY));
  glossaryPersistence=new IdentifierGlossaryPersistence(context.workspaceState,GLOSSARY_METADATA_STATE_KEY,{onError:error=>api.window.showWarningMessage(`Glossary metadata was not saved: ${error?.message||error}`)});
  glossaryMetadataStore=glossaryPersistence.snapshot();
  resumeContextPersistence=new resumeContextApi.ResumeContextPersistence(context.workspaceState,resumeContextApi.STORE_KEY,{onError:error=>api.window.showWarningMessage(`Resume in Context was not saved: ${error?.message||error}`)});
  sourceRegistry = new ExactSourceRegistry();
  const unregisterSource = sourceRegistry.register({ id: 'authoring-workspace.exact-source', capabilityId: 'implemented.authoring-source', surfaceId: 'code.authoring-workspace', resolve: (request) => request });
  const unregisterBrowserSource = sourceRegistry.register({ id:'authoring-browser.exact-source', capabilityId:'implemented.authoring-browser-source', surfaceId:'code.authoring-browser', resolve:(request)=>({filename:request.filename,line:request.line,fingerprint:request.fingerprint,identity:'exact-document',access:'read-only',mutationOwner:'grouped-coding-viewer',contextId:request.contextId,selectionRevision:request.selectionRevision}) });
  context.subscriptions.push(
    vscode.commands.registerCommand('ikemen.authoringWorkspace.open', (uri) => openPublicCodingViewer(uri)),
    vscode.commands.registerCommand('ikemen.authoringWorkspace.resolvePresentation',(request)=>preference.resolve({requestedPresentation:NATIVE,taskId:'stage-code',sessionId:String(request?.sessionId||'')})),
    vscode.commands.registerCommand('ikemen.authoringWorkspace.choosePresentation', choosePresentation),
    vscode.commands.registerCommand('ikemen.authoringBrowser.open', async (uri) => {
      const current = contextRegistry.currentContext(), model = contextRegistry.getContextModel(current);
      const source=uri||(!model?api.window.activeTextEditor?.document?.uri:null);
      const exact=source?await browserContextForSource(source):null;
      if(exact)return openAuthoringBrowser(exact);
      const attachedColumn=current&&contextRegistry.matchingPanels(current).map(entry=>entry.panel?.assetViewColumn).find(value=>Number.isInteger(value)&&value>0);
      return openAuthoringBrowser(model?{...model.snapshot(),ownerDef:current?.ownerDef||''}:{},null,undefined,attachedColumn);
    }),
    vscode.commands.registerCommand('ikemen.authoring.explainCurrentBlock', async () => {
      const captured=api.window.activeTextEditor;if(!captured)return api.window.showInformationMessage('Open a connected ZSS, CNS/ST, or Lua source first.');
      if(!browserPanel){const model=contextRegistry.getContextModel(captured.document.uri);await openAuthoringBrowser(model?.snapshot?.()||{});}if(api.window.activeTextEditor!==captured){try{await api.window.showTextDocument(captured.document,{preview:false,preserveFocus:true,viewColumn:captured.viewColumn});}catch(_){return false;}}
      return explainCurrentBlock({context:browserBoundContext,contextEpoch:browserWorkspace?.contextEpoch,generation:browserWorkspace?.generation});
    }),
    vscode.window.registerWebviewPanelSerializer(VIEW_TYPE, { deserializeWebviewPanel(panel, state) {
      const restored = parseSerializedPanelState(state);
      if (!restored) { panel.dispose(); return; }
      if (restored.grouped) { panel.dispose(); return vscode.window.showInformationMessage('Reopen Character Essentials to restore its exact connected Coding Viewer file set. A partial one-file viewer was not restored.'); }
      if (restored.legacy) vscode.window.showInformationMessage('An older Coding Viewer session was restored as one source file. Reopen Character Essentials to restore a complete grouped character set.');
      return attachPanel(panel, vscode.Uri.parse(restored.uri), true);
    } }),
    vscode.window.registerWebviewPanelSerializer('ikemenAuthoringBrowser',{deserializeWebviewPanel(panel,state){
      const restored=parseAssistanceState(state?.restore);if(!restored){panel.dispose();return vscode.window.showInformationMessage('Coding Assistance could not safely restore. Reopen Character Essentials to rebuild its exact context.');}
      return openAuthoringBrowser(restored.context,panel);
    }}),
    api.workspace.onDidSaveTextDocument?.((saved)=>{
      const changed=saved?.fileName;
      if(!browserPanel||!browserWorkspace||!changed)return;
      const connected=(browserBoundContext?.files||browserBoundContext?.connectedFiles||[]).some(file=>typeof file==='string'&&key(file)===key(changed));
      const registrySave=path.basename(changed).toLowerCase()==='project-registry.json';
      if(connected||registrySave){scheduleBrowserRefresh(['code-navigator','project-data','recipes','similar-code'],60);if(connected)void refreshCurrentBlockExplanation();}
    })||{dispose(){}},
    onDidChangeProjectRegistry(()=>{
      if(browserPanel&&browserWorkspace){scheduleBrowserRefresh(['code-navigator','project-data','recipes','similar-code'],60);void refreshCurrentBlockExplanation();}
    }),
    onDidChangeEngineCapabilities(()=>{
      if(browserPanel&&browserWorkspace)scheduleBrowserRefresh(['code-navigator','project-data','recipes','similar-code'],60);
    }),
    api.languages?.onDidChangeDiagnostics?.((event)=>{
      if(!browserPanel||!browserWorkspace)return;
      const connected=new Set((browserBoundContext?.files||browserBoundContext?.connectedFiles||[]).filter(file=>typeof file==='string').map(file=>String(api.Uri.file(path.resolve(file)))));
      if((event?.uris||[]).some(uri=>connected.has(String(uri)))){scheduleBrowserRefresh(['problems']);void refreshCurrentBlockExplanation();}
    })||{dispose(){}},
    { dispose: unregisterSource }, { dispose:unregisterBrowserSource }
  );
}

module.exports = { browserContextForSource, openBrowserCodingSource, liveBrowserDocuments, VIEW_TYPE, SERIALIZED_STATE_SCHEMA, SERIALIZED_STATE_VERSION, ASSISTANCE_RESTORE_SCHEMA, ASSISTANCE_RESTORE_VERSION, registerAuthoringWorkspace, openCodingViewer, openCharacterCodingSet, openAuthoringBrowser, choosePresentation, toolbarModel, navigationFor, canonicalRegularFiles, normalizedCodingContext, validateCharacterCodingDescriptor, serializedPanelState, parseSerializedPanelState, serializedAssistanceState, parseAssistanceState, recoveryEntries, boundedPersonalDiscoveryPin, attachedLayoutShape, browserSnapshot:()=>browserPanel?{panel:browserPanel}:null };
