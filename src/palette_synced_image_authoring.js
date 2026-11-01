'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const domainModel = require('./palette_domain_model');
const { readIndexedPng } = require('./palette_indexed_png');
const { inventory } = require('./palette_matrix_model');
const { hash } = require('./mutation_safety');

const SCHEMA = 'ikemaker.palette-synced-image-review';
const VERSION = 1;
const LIMITS = Object.freeze({
  reviews: 64,
  reviewAgeMs: 10 * 60 * 1000,
  draftBytes: 256 * 1024,
  files: 256,
  fileBytes: 16 * 1024 * 1024,
  aggregateBytes: 64 * 1024 * 1024,
  maximumDimension: 8192,
  maximumPixels: 64_000_000,
  publicPayloadBytes: 512 * 1024
});
const ACTIONS = new Set(['add', 'relink', 'enable', 'disable', 'remove']);

function stable(value) { if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`; if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`; return JSON.stringify(value); }
function digest(value) { return crypto.createHash('sha256').update(Buffer.isBuffer(value) ? value : Buffer.from(stable(value))).digest('hex'); }
function plain(value, label) { if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error(`${label} must be a plain object.`); return value; }
function canonical(value) { const resolved = path.resolve(String(value || '')); return process.platform === 'win32' ? resolved.toLowerCase() : resolved; }
function exactHash(value, label) { const text = String(value || '').toLowerCase(); if (!/^[0-9a-f]{64}$/.test(text)) throw new Error(`${label} is missing exact SHA-256 evidence.`); return text; }
function colorHash(colors) { if (!Array.isArray(colors) || colors.length !== 256 || colors.some(color => !Array.isArray(color) || color.length !== 4 || color.some(channel => !Number.isInteger(channel) || channel < 0 || channel > 255))) throw new Error('A live embedded palette must expose exactly 256 RGBA colors.'); return hash(Buffer.from(colors.flat())); }
function coordinate(value, label) { return domainModel.coordinate(value, label); }
function has(value, key) { return Object.prototype.hasOwnProperty.call(value, key); }
function identity(record) { return { recordId: record.recordId, templateRecordId: record.templateRecordId, palettePhysicalIndex: record.palettePhysicalIndex, coordinate: record.coordinate, outputPath: record.outputPath, enabled: record.enabled }; }
function snapshotRegistry(snapshot) { if (!snapshot || snapshot.readOnly || !snapshot.document) throw new Error(`Palette metadata is read-only${snapshot?.error ? `: ${snapshot.error}` : '.'}`); const revision = Number(snapshot.document.revision); if (!Number.isInteger(revision) || revision < 0 || !String(snapshot.archiveKey || '')) throw new Error('Palette metadata review evidence is incomplete.'); return { byteHash: exactHash(snapshot.byteHash, 'Palette metadata'), revision, archiveKey: String(snapshot.archiveKey) }; }
function liveArchive(archive) { if (!Buffer.isBuffer(archive?.buffer) || !Array.isArray(archive.palettes) || !Array.isArray(archive.sprites)) throw new Error('A live decoded SFF archive is required for synchronized-image review.'); const observed = inventory(archive); return { observed, sffHash: hash(archive.buffer), sffByteLength: archive.buffer.length, palettes: observed.palettes.map(item => { if (item.unavailable) throw new Error(`Embedded palette ${item.physicalIndex} is unavailable: ${item.unavailable}`); return { physicalIndex: item.physicalIndex, coordinate: { group: item.group, number: item.number }, colors: item.swatches, colorHash: colorHash(item.swatches) }; }) }; }
function regularFile(filename, io, label) { if (!path.isAbsolute(String(filename || ''))) throw new Error(`${label} requires an exact absolute path chosen by the host.`); const resolved = path.resolve(String(filename || '')); if (!io.existsSync(resolved)) throw new Error(`${label} is missing: ${resolved}`); const link = io.lstatSync(resolved); if (link.isSymbolicLink() || !link.isFile()) throw new Error(`${label} must be a regular file and may not be a symbolic link: ${resolved}`); const physical = io.realpathSync(resolved); if (canonical(physical) !== canonical(resolved)) throw new Error(`${label} may not traverse a symbolic link or junction: ${resolved}`); return physical; }
function readPng(filename, io, aggregate) { const physical = regularFile(filename, io, 'Palette image'); const stat = io.statSync(physical); if (stat.size > LIMITS.fileBytes) throw new Error(`Palette image exceeds the ${LIMITS.fileBytes}-byte per-file limit: ${physical}`); aggregate.bytes += stat.size; if (aggregate.bytes > LIMITS.aggregateBytes) throw new Error(`Selected palette images exceed the ${LIMITS.aggregateBytes}-byte aggregate limit.`); const bytes = io.readFileSync(physical); if (!Buffer.isBuffer(bytes) || bytes.length !== stat.size) throw new Error(`Palette image changed while it was read: ${physical}`); const decoded = readIndexedPng(bytes, { maximumBytes: LIMITS.fileBytes, maximumDimension: LIMITS.maximumDimension, maximumPixels: LIMITS.maximumPixels, maximumInflated: LIMITS.maximumPixels + LIMITS.maximumDimension }); return { path: physical, byteLength: bytes.length, byteHash: hash(bytes), width: decoded.width, height: decoded.height, indexPlaneHash: decoded.indexPlaneHash, paletteHash: decoded.paletteHash }; }
function filenameCoordinate(filename) { const matches = [...path.basename(filename, path.extname(filename)).matchAll(/(?:^|[^0-9])(\d{1,5})\s*[,_.-]\s*(\d{1,5})(?=$|[^0-9])/g)]; if (matches.length !== 1) return null; const group = Number(matches[0][1]), number = Number(matches[0][2]); return group <= 65535 && number <= 65535 ? { group, number } : null; }
function templateEvidence(record, io) {
  if (!record) throw new Error('Choose an attached template record before registering palette images.');
  const filename = regularFile(record.filenameHint, io, 'Attached indexed template'), stat = io.statSync(filename);
  if (stat.size > LIMITS.fileBytes) throw new Error('The attached indexed template exceeds the file-size limit.');
  const bytes = io.readFileSync(filename), decoded = readIndexedPng(bytes, { maximumBytes: LIMITS.fileBytes, maximumDimension: LIMITS.maximumDimension, maximumPixels: LIMITS.maximumPixels, maximumInflated: LIMITS.maximumPixels + LIMITS.maximumDimension });
  if (hash(bytes) !== record.templateByteHash || decoded.indexPlaneHash !== record.indexPlaneHash || decoded.paletteHash !== record.paletteHash) throw new Error('The attached indexed template changed after its reviewed template record was saved.');
  const zoneTemplate = record.zoneDocument?.template || {};
  if (zoneTemplate.width != null && Number(zoneTemplate.width) !== decoded.width || zoneTemplate.height != null && Number(zoneTemplate.height) !== decoded.height || zoneTemplate.indexPlaneHash && zoneTemplate.indexPlaneHash !== decoded.indexPlaneHash) throw new Error('The attached template dimensions or index plane no longer match its reviewed zone record.');
  return { recordId: record.recordId, path: filename, byteLength: bytes.length, byteHash: hash(bytes), width: decoded.width, height: decoded.height, indexPlaneHash: decoded.indexPlaneHash, paletteHash: decoded.paletteHash, familyPlanHash: record.familyPlanHash, zoneHash: digest(record.zoneDocument || null) };
}
function selectedPalette(raw, image, live) {
  const byHash = live.palettes.filter(item => item.colorHash === image.paletteHash), supplied = raw.palette == null ? null : plain(raw.palette, 'Selected embedded palette');
  let selected;
  if (supplied) {
    const physicalIndex = Number(supplied.physicalIndex); selected = live.palettes[physicalIndex];
    if (!selected || selected.physicalIndex !== physicalIndex) throw new Error(`Selected physical palette ${supplied.physicalIndex} is unavailable.`);
    const exact = coordinate(supplied, 'Selected embedded palette'); if (exact.group !== selected.coordinate.group || exact.number !== selected.coordinate.number) throw new Error('The selected physical palette coordinate changed. Review the live SFF again.');
  } else if (byHash.length === 1) selected = byHash[0];
  else throw new Error(byHash.length ? 'The image palette matches several embedded palettes. Choose one exact physical palette.' : 'The image palette does not match any live embedded palette.');
  if (selected.colorHash !== image.paletteHash) throw new Error('The image palette does not exactly match the selected live embedded palette.');
  const named = filenameCoordinate(image.path), namedMatches = named ? live.palettes.filter(item => item.coordinate.group === named.group && item.coordinate.number === named.number) : [];
  return { selected, suggestion: { method: byHash.length === 1 ? 'unique-palette-hash' : 'explicit-physical-palette', authoritative: byHash.length === 1, paletteHashMatches: byHash.map(item => item.physicalIndex), filenameCoordinate: named, filenameCoordinateLabel: named ? 'Filename coordinate suggestion only; not authoritative.' : '', filenameCoordinateMatches: namedMatches.map(item => item.physicalIndex) } };
}
function prepare(input, options) {
  const io = options.fs, snapshot = input.registrySnapshot, registry = snapshotRegistry(snapshot), current = snapshot.archive || domainModel.emptyArchive(), live = liveArchive(input.archive), draft = plain(input.draft, 'Synchronized palette-image draft'), rows = draft.rows;
  if (!Array.isArray(rows) || !rows.length || rows.length > LIMITS.files) throw new Error(`Choose between 1 and ${LIMITS.files} synchronized-image changes for review.`);
  const templateRecordId = String(draft.templateRecordId || ''), templateRecord = current.templateRecords.find(item => item.recordId === templateRecordId), template = templateEvidence(templateRecord, io), byId = new Map(current.syncedPaletteImages.map(item => [item.recordId, { ...item }])), touched = new Set(), aggregate = { bytes: 0 }, files = [], publicRows = [], canonicalRows = [];
  for (let index = 0; index < rows.length; index++) {
    const raw = plain(rows[index], `Synchronized image row ${index + 1}`), action = String(raw.action || ''); if (!ACTIONS.has(action)) throw new Error(`Unsupported synchronized-image action: ${action}.`);
    let recordId = String(raw.recordId || '').trim(), prior = recordId ? byId.get(recordId) : null;
    if (action === 'add') { if (recordId && !options.issuedIds?.has(recordId)) throw new Error('New synchronized-image IDs are issued by the host.'); if (prior) throw new Error(`Synchronized palette-image ID already exists: ${recordId}.`); if (!recordId) recordId = options.issueId(); }
    else if (!prior) throw new Error(`The selected synchronized palette-image registration no longer exists: ${recordId}.`);
    if (touched.has(recordId)) throw new Error(`Registration ${recordId} is changed more than once in this review.`); touched.add(recordId);
    if (action === 'remove') { byId.delete(recordId); publicRows.push({ action, recordId, previous: identity(prior) }); canonicalRows.push({ action, recordId }); continue; }
    if (action === 'disable') { const next = { ...prior, enabled: false, updatedAt: options.now }; byId.set(recordId, next); publicRows.push({ action, registration: identity(next) }); canonicalRows.push({ action, recordId }); continue; }
    let outputPath = action === 'relink' ? String(raw.path || prior.outputPath) : action === 'enable' ? prior.outputPath : String(raw.path || ''), image = readPng(outputPath, io, aggregate);
    if (image.width !== template.width || image.height !== template.height || image.indexPlaneHash !== template.indexPlaneHash) throw new Error(`Palette image must exactly match the attached template dimensions and index plane: ${image.path}`);
    const paletteRequest = raw.palette == null && prior ? { physicalIndex: prior.palettePhysicalIndex, ...prior.coordinate } : raw.palette, resolved = selectedPalette({ palette: paletteRequest }, image, live), selected = resolved.selected, enabled = action === 'enable' ? true : action === 'relink' && !has(raw, 'enabled') ? prior.enabled !== false : raw.enabled !== false, next = { recordId, enabled, templateRecordId, palettePhysicalIndex: selected.physicalIndex, coordinate: selected.coordinate, outputPath: image.path, priorOutputHash: image.byteHash, colorHash: selected.colorHash, updatedAt: options.now };
    byId.set(recordId, next); files.push({ ...image, recordId, palettePhysicalIndex: selected.physicalIndex, coordinate: selected.coordinate, colorHash: selected.colorHash }); publicRows.push({ action, registration: identity(next), image: { path: image.path, byteLength: image.byteLength, byteHash: image.byteHash, width: image.width, height: image.height, indexPlaneHash: image.indexPlaneHash, paletteHash: image.paletteHash }, suggestion: resolved.suggestion }); canonicalRows.push({ action, recordId, path: image.path, palette: { physicalIndex: selected.physicalIndex, ...selected.coordinate }, enabled: next.enabled });
  }
  const records = [...byId.values()], pathOwners = new Map();
  for (const record of records) { const key = canonical(record.outputPath); if (pathOwners.has(key)) throw new Error(`Synchronized palette-image path is already registered by ${pathOwners.get(key)}: ${record.outputPath}`); pathOwners.set(key, record.recordId); }
  const operation = { kind: 'replaceSyncedPaletteImages', value: { records } }; domainModel.applyOperation(snapshot.document, snapshot.archiveKey, operation);
  const evidence = { filename: path.resolve(input.filename), sffHash: live.sffHash, sffByteLength: live.sffByteLength, inventoryHash: live.observed.inventoryHash, registryByteHash: registry.byteHash, registryRevision: registry.revision, archiveKey: registry.archiveKey, template, files: files.map(item => ({ ...item })), orderedRowsHash: digest(canonicalRows), operationHash: digest(operation), finalRecordsHash: digest(records) };
  return { operation, evidence, publicRows, canonicalDraft: { templateRecordId, rows: canonicalRows }, counts: { added: publicRows.filter(item => item.action === 'add').length, relinked: publicRows.filter(item => item.action === 'relink').length, enabled: publicRows.filter(item => item.action === 'enable').length, disabled: publicRows.filter(item => item.action === 'disable').length, removed: publicRows.filter(item => item.action === 'remove').length, files: files.length, aggregateBytes: aggregate.bytes, totalRegistrations: records.length } };
}

class PaletteSyncedImageAuthoring {
  constructor(options = {}) { this.fs = options.fs || fs; this.now = options.now || (() => Date.now()); this.randomBytes = options.randomBytes || crypto.randomBytes; this.readArchive = options.readArchive || require('./sff_reader').readSff; this.reviews = new Map(); this.intakes = new Map(); }
  issueToken() { for (let index = 0; index < 16; index++) { const token = this.randomBytes(24).toString('hex'); if (/^[0-9a-f]{48}$/.test(token) && !this.reviews.has(token) && !this.intakes.has(token)) return token; } throw new Error('A unique synchronized-image review token could not be issued.'); }
  issueId() { return `synced-${this.randomBytes(12).toString('hex')}`; }
  prune() { const cutoff = this.now() - LIMITS.reviewAgeMs; for (const collection of [this.reviews, this.intakes]) { for (const [token, item] of collection) if (item.createdAt < cutoff) collection.delete(token); while (collection.size >= LIMITS.reviews) collection.delete(collection.keys().next().value); } }
  revoke(filename = '') { const target = canonical(filename); let count = 0; for (const collection of [this.reviews, this.intakes]) { const tokens = [...collection].filter(([, item]) => canonical(item.evidence?.filename || item.filename) === target).map(([token]) => token); for (const token of tokens) { collection.delete(token); count++; } } return count; }
  dispose(filename = '') { return this.revoke(filename); }
  beginIntake(input = {}) {
    this.revoke(input.filename); this.prune(); const snapshot = input.registrySnapshot, registry = snapshotRegistry(snapshot), current = snapshot.archive || domainModel.emptyArchive(), live = liveArchive(input.archive), templateRecordId = String(input.templateRecordId || ''), template = templateEvidence(current.templateRecords.find(item => item.recordId === templateRecordId), this.fs), chosen = input.chosenPaths || [], requestedIds = input.registrationIds || [];
    if (!Array.isArray(chosen) || !Array.isArray(requestedIds) || chosen.length + requestedIds.length > LIMITS.files) throw new Error(`Palette-image intake may contain at most ${LIMITS.files} rows.`);
    const existing = new Map(current.syncedPaletteImages.map(item => [item.recordId, item])), aggregate = { bytes: 0 }, rows = [], retained = new Map(), usedPaths = new Set();
    const addProjection = (kind, filePath, registration = null) => {
      const rowId = this.randomBytes(18).toString('hex'), image = readPng(filePath, this.fs, aggregate), exactTemplate = image.width === template.width && image.height === template.height && image.indexPlaneHash === template.indexPlaneHash, matches = live.palettes.filter(item => item.colorHash === image.paletteHash), candidateMap = new Map(), candidates = matches.map(item => { const candidateId = this.randomBytes(18).toString('hex'); candidateMap.set(candidateId, item); return { candidateId, physicalIndex: item.physicalIndex, coordinate: item.coordinate, colorHash: item.colorHash }; }), suggested = matches.length === 1 ? candidates[0].candidateId : '', named = filenameCoordinate(image.path), row = { rowId, kind, registrationId: registration?.recordId || '', displayName: path.basename(image.path), displayPath: image.path, action: kind === 'chosen' ? 'add' : '', enabled: registration?.enabled !== false, evidence: { byteLength: image.byteLength, byteHash: image.byteHash, width: image.width, height: image.height, indexPlaneHash: image.indexPlaneHash, paletteHash: image.paletteHash }, status: !exactTemplate ? 'template-mismatch' : !matches.length ? 'unmatched-palette' : matches.length > 1 ? 'ambiguous-palette' : 'ready', exactTemplate, candidates, suggestedCandidateId: suggested, filenameCoordinate: named, filenameCoordinateLabel: named ? 'Filename coordinate suggestion only; not authoritative.' : '', reviewable: exactTemplate && matches.length === 1 };
      retained.set(rowId, { rowId, kind, path: image.path, registrationId: registration?.recordId || '', action: row.action, enabled: row.enabled, candidateMap, selectedCandidateId: suggested }); rows.push(row);
    };
    for (const value of chosen) { const filePath = regularFile(value, this.fs, 'Chosen palette image'), key = canonical(filePath); if (usedPaths.has(key)) throw new Error(`The same chosen palette image was supplied more than once: ${filePath}`); usedPaths.add(key); addProjection('chosen', filePath); }
    const ids = new Set(); for (const value of requestedIds) { const recordId = String(value || ''); if (ids.has(recordId)) throw new Error(`Registration ${recordId} was requested more than once.`); ids.add(recordId); const registration = existing.get(recordId); if (!registration) throw new Error(`Synchronized palette-image registration no longer exists: ${recordId}.`); try { addProjection('existing', registration.outputPath, registration); } catch (error) { const rowId = this.randomBytes(18).toString('hex'), row = { rowId, kind: 'existing', registrationId: recordId, displayName: path.basename(registration.outputPath), displayPath: registration.outputPath, action: '', enabled: registration.enabled !== false, evidence: null, status: 'unavailable', error: error.message, exactTemplate: false, candidates: [], suggestedCandidateId: '', filenameCoordinate: filenameCoordinate(registration.outputPath), filenameCoordinateLabel: 'Filename coordinate suggestion only; not authoritative.', reviewable: false }; retained.set(rowId, { rowId, kind: 'existing', path: registration.outputPath, registrationId: recordId, action: '', enabled: row.enabled, candidateMap: new Map(), selectedCandidateId: '' }); rows.push(row); } }
    const intakeToken = this.issueToken(), createdAt = this.now(), evidence = { filename: path.resolve(input.filename), sffHash: live.sffHash, sffByteLength: live.sffByteLength, inventoryHash: live.observed.inventoryHash, registryByteHash: registry.byteHash, registryRevision: registry.revision, archiveKey: registry.archiveKey, template };
    this.intakes.set(intakeToken, { createdAt, filename: evidence.filename, evidence, templateRecordId, rows: retained });
    const result = { schema: SCHEMA, version: VERSION, intakeToken, expiresAt: new Date(createdAt + LIMITS.reviewAgeMs).toISOString(), readOnly: true, template, rows, counts: { chosen: chosen.length, existing: requestedIds.length, aggregateBytes: aggregate.bytes } };
    if (Buffer.byteLength(JSON.stringify(result), 'utf8') > LIMITS.publicPayloadBytes) { this.intakes.delete(intakeToken); throw new Error('Palette-image intake exceeds the public payload limit. Choose fewer files.'); }
    return result;
  }
  patchIntake(intakeToken, patches = []) {
    const token = String(intakeToken || ''), intake = this.intakes.get(token); if (!intake) throw new Error('This palette-image intake is expired, revoked, or unavailable. Choose the files again.');
    if (!Array.isArray(patches) || patches.length > LIMITS.files) throw new Error(`Palette-image intake accepts at most ${LIMITS.files} row patches.`);
    for (const value of patches) {
      const patch = plain(value, 'Palette-image intake patch'); if ('path' in patch || 'outputPath' in patch || 'filename' in patch || 'palette' in patch || 'physicalIndex' in patch) throw new Error('Palette-image intake patches may not supply authoritative paths or palette indexes.');
      const row = intake.rows.get(String(patch.rowId || '')); if (!row) throw new Error('Palette-image intake row is stale or forged.'); const action = String(patch.action || row.action || '');
      if (!ACTIONS.has(action)) throw new Error(`Unsupported synchronized-image action: ${action}.`);
      if (row.kind === 'chosen' && !['add', 'relink'].includes(action)) throw new Error('A newly chosen file may only be added or relink an existing registration.');
      if (row.kind === 'existing' && !['enable', 'disable', 'remove'].includes(action)) throw new Error('An existing registration may be enabled, disabled, or removed in this intake.');
      let registrationId = row.registrationId;
      if (action === 'relink') { const target = intake.rows.get(String(patch.targetRowId || '')); if (!target || target.kind !== 'existing' || !target.registrationId) throw new Error('Relink requires an exact existing registration row from this intake.'); registrationId = target.registrationId; }
      let selectedCandidateId = String(patch.paletteCandidateId || row.selectedCandidateId || ''); if ((action === 'add' || action === 'relink' || action === 'enable') && !row.candidateMap.has(selectedCandidateId)) throw new Error('Choose an exact host-reviewed palette candidate for this row.');
      row.action = action; row.registrationId = registrationId; row.selectedCandidateId = selectedCandidateId; if ('enabled' in patch) { if (typeof patch.enabled !== 'boolean') throw new Error('Registration enabled state must be a boolean.'); row.enabled = patch.enabled; }
    }
    return this.intakeProjection(token);
  }
  intakeProjection(intakeToken) {
    const intake = this.intakes.get(String(intakeToken || '')); if (!intake) throw new Error('This palette-image intake is expired, revoked, or unavailable.');
    const rows = [...intake.rows.values()].map(row => ({ rowId: row.rowId, kind: row.kind, registrationId: row.registrationId, action: row.action, enabled: row.enabled, selectedCandidateId: row.selectedCandidateId, reviewable: Boolean(row.action && (['disable', 'remove'].includes(row.action) || row.candidateMap.has(row.selectedCandidateId))) }));
    return { intakeToken: String(intakeToken), readOnly: true, rows, canReview: rows.some(row => row.action) && rows.filter(row => row.action).every(row => row.reviewable) };
  }
  preview(input = {}) {
    if (input.draft || input.chosenPaths || input.rows) throw new Error('Browser payloads may not supply palette-image paths. Begin a host-retained intake and preview it by opaque token.');
    const token = String(input.intakeToken || ''), intake = this.intakes.get(token); this.intakes.delete(token); if (!intake) throw new Error('This palette-image intake is expired, revoked, or unavailable. Choose the files again.'); if (this.now() - intake.createdAt > LIMITS.reviewAgeMs) throw new Error('This palette-image intake expired. Choose the files again.');
    const rows = [...intake.rows.values()].filter(row => row.action).map(row => { const selected = row.candidateMap.get(row.selectedCandidateId), base = { action: row.action, recordId: row.registrationId || undefined }; if (row.action === 'add' || row.action === 'relink' || row.action === 'enable') { if (!selected) throw new Error('Choose an exact host-reviewed palette candidate for every active image row.'); base.path = row.path; base.palette = { physicalIndex: selected.physicalIndex, ...selected.coordinate }; base.enabled = row.enabled; } return base; });
    if (!rows.length) throw new Error('Choose at least one synchronized-image change to review.');
    return this._previewDraft({ filename: intake.filename, archive: input.archive, registrySnapshot: input.registrySnapshot, draft: { templateRecordId: intake.templateRecordId, rows } });
  }
  _previewDraft(input = {}) {
    const serialized = JSON.stringify(input.draft ?? null); if (Buffer.byteLength(serialized || '', 'utf8') > LIMITS.draftBytes) throw new Error('Synchronized palette-image draft is too large to review safely.');
    const now = new Date(this.now()).toISOString(), prepared = prepare(input, { fs: this.fs, now, issueId: () => this.issueId(), issuedIds: new Set() }); this.prune(); const reviewToken = this.issueToken(), createdAt = this.now();
    this.reviews.set(reviewToken, { createdAt, evidence: prepared.evidence, canonicalDraft: prepared.canonicalDraft });
    const result = { schema: SCHEMA, version: VERSION, reviewToken, expiresAt: new Date(createdAt + LIMITS.reviewAgeMs).toISOString(), canApply: true, blocked: false, metadataOnly: true, activeSffChanged: false, imageFilesChanged: false, summary: `Review ${prepared.publicRows.length} synchronized palette-image change(s); ${prepared.counts.files} exact indexed PNG file(s), ${prepared.counts.totalRegistrations} registration(s) after apply.`, counts: prepared.counts, rows: prepared.publicRows, template: prepared.evidence.template, evidence: { sffHash: prepared.evidence.sffHash, inventoryHash: prepared.evidence.inventoryHash, registryByteHash: prepared.evidence.registryByteHash, registryRevision: prepared.evidence.registryRevision, archiveKey: prepared.evidence.archiveKey, orderedRowsHash: prepared.evidence.orderedRowsHash, operationHash: prepared.evidence.operationHash } };
    if (Buffer.byteLength(JSON.stringify(result), 'utf8') > LIMITS.publicPayloadBytes) { this.reviews.delete(reviewToken); throw new Error('Synchronized palette-image review exceeds the public payload limit. Choose fewer files.'); }
    return result;
  }
  apply(reviewToken, input = {}) {
    const token = String(reviewToken || ''); if (!/^[0-9a-f]{48}$/.test(token)) throw new Error('A valid synchronized-image review token is required.'); const retained = this.reviews.get(token); this.reviews.delete(token); if (!retained) throw new Error('This synchronized-image review was already used, revoked, expired, or is unavailable. Review the files again.'); if (this.now() - retained.createdAt > LIMITS.reviewAgeMs) throw new Error('This synchronized-image review expired. Review the files again.');
    const filename = path.resolve(input.filename || retained.evidence.filename), registry = input.registry; if (!registry || typeof registry.snapshot !== 'function' || typeof registry.update !== 'function') throw new Error('A Palette Domain registry authority is required to apply synchronized-image metadata.');
    const archive = this.readArchive(filename), snapshot = registry.snapshot(filename), issuedIds = new Set(retained.canonicalDraft.rows.filter(item => item.action === 'add').map(item => item.recordId)), rebuilt = prepare({ filename, archive, registrySnapshot: snapshot, draft: retained.canonicalDraft }, { fs: this.fs, now: new Date(retained.createdAt).toISOString(), issueId: () => { throw new Error('Reviewed synchronized-image identity is missing.'); }, issuedIds }), expected = retained.evidence;
    if (canonical(filename) !== canonical(expected.filename) || rebuilt.evidence.sffHash !== expected.sffHash || rebuilt.evidence.sffByteLength !== expected.sffByteLength || rebuilt.evidence.inventoryHash !== expected.inventoryHash) throw new Error('The SFF changed after synchronized-image review. Review it again.');
    if (rebuilt.evidence.registryByteHash !== expected.registryByteHash || rebuilt.evidence.registryRevision !== expected.registryRevision || rebuilt.evidence.archiveKey !== expected.archiveKey) throw new Error('Palette metadata changed after synchronized-image review. Review it again.');
    for (const field of ['orderedRowsHash', 'operationHash', 'finalRecordsHash']) if (rebuilt.evidence[field] !== expected[field]) throw new Error('The synchronized-image registration plan changed after review. Review it again.');
    if (digest(rebuilt.evidence.template) !== digest(expected.template) || digest(rebuilt.evidence.files) !== digest(expected.files)) throw new Error('The attached template or selected indexed PNG files changed after review. Review them again.');
    const assertSourceCurrent = () => { const current = liveArchive(this.readArchive(filename)); if (current.sffHash !== expected.sffHash || current.sffByteLength !== expected.sffByteLength || current.observed.inventoryHash !== expected.inventoryHash) throw new Error('The SFF changed while synchronized-image metadata was being saved.'); };
    const result = registry.update(filename, { byteHash: expected.registryByteHash, revision: expected.registryRevision }, rebuilt.operation, { assertSourceCurrent });let reopened,saved;
    try { reopened=registry.snapshot(filename);saved=reopened.archive?.syncedPaletteImages||[];if(digest(saved)!==expected.finalRecordsHash)throw new Error('Synchronized palette-image metadata could not be independently verified after save.');templateEvidence((reopened.archive.templateRecords||[]).find(item=>item.recordId===expected.template.recordId),this.fs);for(const file of expected.files){const observed=readPng(file.path,this.fs,{bytes:0});if(observed.byteHash!==file.byteHash||observed.byteLength!==file.byteLength||observed.indexPlaneHash!==file.indexPlaneHash||observed.paletteHash!==file.paletteHash)throw new Error(`Palette image changed during metadata save: ${file.path}`);}}
    catch(cause){const error=new Error(`Palette-image metadata was saved, but post-save verification failed: ${cause.message} Reload and review before continuing.`);error.code='PALETTE_IMAGE_METADATA_COMMITTED_UNVERIFIED';error.committed=true;error.verified=false;error.cause=cause;throw error;}
    return { ...result, metadataOnly: true, activeSffChanged: false, imageFilesChanged: false, committedStale: result.sourceStatus === 'changed-after-commit', counts: rebuilt.counts, registrations: saved.map(identity), evidence: { operationHash: expected.operationHash, finalRecordsHash: expected.finalRecordsHash } };
  }
}

module.exports = { SCHEMA, VERSION, LIMITS, PaletteSyncedImageAuthoring, filenameCoordinate, liveArchive };
