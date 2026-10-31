'use strict';

const {
  createTransferSession,
  setTransferSelection,
  swapTransferEndpoints,
  changeTransferEndpoint,
  createTransferRequest,
  stageTransferReview,
  cancelTransferReview,
  finalizeTransferApply,
  cancelTransferSession
} = require('./asset_transfer_session');

const MAX_HANDLE_ID_BYTES = 16384;
const EFFECTS = Object.freeze({ filesystem: false, persistence: false, sourceMutation: false, destinationMutation: false, autosave: false });

function plain(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${label} must be a plain object.`);
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (descriptor.enumerable && !Object.prototype.hasOwnProperty.call(descriptor, 'value')) throw new TypeError(`${label}.${key} cannot be an accessor.`);
  }
  return value;
}

function exactKeys(value, allowed, label) {
  plain(value, label); const expected = new Set(allowed);
  for (const key of Object.keys(value)) if (!expected.has(key)) throw new TypeError(`${label} contains unsupported field ${key}.`);
}

function boundedString(value, label, maximum = MAX_HANDLE_ID_BYTES, allowAuthoritySeparators = false) {
  if (typeof value !== 'string' || !value.length || Buffer.byteLength(value, 'utf8') > maximum || !allowAuthoritySeparators && value.includes('\0')) throw new TypeError(`${label} is invalid.`);
  return value;
}

function deepFreeze(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value); for (const item of Object.values(value)) deepFreeze(item, seen); return Object.freeze(value);
}

function endpointMatches(left, right) {
  return Boolean(left && right && left.kind === right.kind && left.entityIdentity === right.entityIdentity && left.fileIdentity === right.fileIdentity && left.fingerprint === String(right.fingerprint || '').toUpperCase());
}

function normalizeHandle(value, endpoint, role) {
  exactKeys(value, ['id', 'endpointIdentity', 'role'], `${role} endpoint handle`);
  const handle = { id: boundedString(value.id, `${role} endpoint handle identity`), endpointIdentity: boundedString(value.endpointIdentity, `${role} endpoint authority`, MAX_HANDLE_ID_BYTES, true), role: boundedString(value.role, `${role} endpoint handle role`, 16) };
  if (handle.endpointIdentity !== endpoint.identity || handle.role !== role) throw new Error(`The ${role} host handle does not match its exact pinned endpoint authority.`);
  return deepFreeze(handle);
}

function capabilityProjection(role, selectionCount = 0) {
  if (!['source', 'destination'].includes(role)) throw new TypeError('Transfer capability role must be source or destination.');
  const source = role === 'source';
  return deepFreeze({
    role, pinned: true, readOnly: source, canSelect: true, canCopySelected: source && selectionCount > 0,
    canAcceptReviewedCopy: !source, canMutateSource: false, canApplyTransfer: false,
    reason: source ? 'Transfer Copy keeps the source endpoint read-only.' : 'Destination changes require a later explicit reviewed Apply owner.', effects: EFFECTS
  });
}

function serviceFunction(services, name, optional = false) {
  const value = services?.[name];
  if (value === undefined && optional) return null;
  if (typeof value !== 'function') throw new TypeError(`SFF Transfer requires the injected ${name} service.`);
  return value;
}

class SffTransferMode {
  constructor(services) {
    plain(services, 'SFF Transfer services');
    this.services = services;
    this.kind = String(services.kind || 'sff').toLowerCase();
    if (!['sff','air','snd'].includes(this.kind)) throw new TypeError('Transfer mode kind must be sff, air, or snd.');
    this.label = this.kind.toUpperCase();
    for (const name of ['captureNormalContext', 'resolveEndpoint', 'revalidateEndpoint', 'openPinnedEndpoint', 'closePinnedEndpoints', 'guardClose', 'restoreNormalContext', 'updateEndpointRoles']) serviceFunction(services, name);
    this.active = null;
  }

  snapshot() {
    const record = this.active;
    if (!record) return deepFreeze({ active: false, effects: EFFECTS });
    return deepFreeze({
      active: true, session: record.session,
      handles: { source: record.handles.source?.ref || null, destination: record.handles.destination?.ref || null },
      capabilities: { source: capabilityProjection('source', record.session.selections.source.length), destination: capabilityProjection('destination', record.session.selections.destination.length) },
      normalContextRetained: record.normalContext !== undefined, degraded: record.degraded === true, effects: EFFECTS
    });
  }

  async open(input) {
    if (this.active) throw new Error('Only one SFF Transfer session can be active at a time.');
    exactKeys(input, ['source', 'destination', 'sessionId'], 'SFF Transfer open request');
    const normalContext = await this.services.captureNormalContext();
    const source = await this.services.resolveEndpoint(input.source, 'source');
    if (!source) return deepFreeze({ status: 'cancelled', reason: 'Source selection was cancelled.', effects: EFFECTS });
    const destination = await this.services.resolveEndpoint(input.destination, 'destination');
    if (!destination) return deepFreeze({ status: 'cancelled', reason: 'Destination selection was cancelled.', effects: EFFECTS });
    const session = createTransferSession({ kind: this.kind, sessionId: input.sessionId, source, destination });
    await this._revalidate(session.source, 'source'); await this._revalidate(session.destination, 'destination');
    const opened = [];
    try {
      const sourceOpened = await this._openHandle(session, session.source, 'source'); opened.push(sourceOpened);
      const destinationOpened = await this._openHandle(session, session.destination, 'destination'); opened.push(destinationOpened);
      const ids = new Set(opened.map(item => item.ref.id)); if (ids.size !== opened.length) throw new Error('The Transfer host returned the same handle for both pinned endpoints.');
      this.active = { session, normalContext, handles: { source: sourceOpened, destination: destinationOpened }, degraded: false, suppressClosed: new Set() };
      return deepFreeze({ status: 'opened', session: this.snapshot().session, handles: this.snapshot().handles, effects: EFFECTS });
    } catch (error) {
      if (opened.length) await this._closeRecords(opened, { reason: 'open-rollback', force: true }).catch(() => {});
      throw error;
    }
  }

  async _openHandle(session, endpoint, role) {
    let openedId = '';
    const callbacks = {
      selectionChanged: selection => {
        const currentRole = this._roleForHandle(openedId);
        return this.setSelection(currentRole, selection, openedId);
      },
      closed: handleId => this.endpointClosed(handleId || openedId)
    };
    const opaque = await this.services.openPinnedEndpoint(endpoint, deepFreeze({ sessionId: session.sessionId, generation: session.generation, role, capabilities: capabilityProjection(role, session.selections[role].length), callbacks }));
    if (!opaque) throw new Error(`The ${role} pinned ${this.label} endpoint did not open.`);
    const ref = normalizeHandle(opaque, endpoint, role);
    openedId = ref.id;
    return { opaque, ref };
  }

  async _revalidate(endpoint, role) {
    const current = await this.services.revalidateEndpoint(endpoint, role);
    if (!endpointMatches(endpoint, current)) throw new Error(`The exact ${role} ${this.label} endpoint changed or became unavailable.`);
    return current;
  }

  _requireActive() { if (!this.active) throw new Error('No SFF Transfer session is active.'); return this.active; }

  _roleForHandle(handleId) {
    const record = this._requireActive(), wanted = boundedString(handleId, 'Transfer handle identity');
    for (const role of ['source', 'destination']) if (record.handles[role]?.ref.id === wanted) return role;
    throw new Error('That handle does not belong to the active SFF Transfer session.');
  }

  setSelection(role, selection, handleId) {
    const record = this._requireActive();
    if (!['source', 'destination'].includes(role)) throw new TypeError('Transfer selection role must be source or destination.');
    if (handleId !== undefined && this._roleForHandle(handleId) !== role) throw new Error('Selection authority does not match the endpoint role.');
    record.session = setTransferSelection(record.session, role, selection);
    return this.snapshot();
  }

  async reviewSelection(method = 'copy-selected', input = {}) {
    const record = this._requireActive();
    exactKeys(input, ['selection', 'boundary'], 'SFF Transfer review request');
    await this._revalidate(record.session.source, 'source'); await this._revalidate(record.session.destination, 'destination');
    const request = createTransferRequest(record.session, { method, selection: input.selection, boundary: input.boundary });
    const builder = serviceFunction(this.services, 'buildReview', true);
    const review = builder ? await builder(deepFreeze({ session: record.session, request, effects: EFFECTS })) : { status: 'ready', reviewFingerprint: request.requestIdentity, summary: `${request.selection.length} exact sprite selection(s) are ready for destination conflict review.` };
    if (!review) return deepFreeze({ status: 'cancelled', session: record.session, effects: EFFECTS });
    await this._revalidate(record.session.source, 'source'); await this._revalidate(record.session.destination, 'destination');
    record.session = stageTransferReview(record.session, request, review);
    return deepFreeze({ status: review.status, request, review: record.session.pendingReview, effects: EFFECTS });
  }

  cancelReview() {
    const record = this._requireActive(); record.session = cancelTransferReview(record.session); return this.snapshot();
  }

  finalizeAssemblyResult(requestIdentity, details, destination, mappings) {
    const record = this._requireActive(), pending = record.session.pendingReview;
    if (!pending || pending.status !== 'ready' || pending.request.requestIdentity !== requestIdentity) throw new Error('The Assembly result does not belong to the current ready Transfer review.');
    record.session = finalizeTransferApply(record.session, pending.request, details, destination, mappings);
    return deepFreeze({ status: record.session.result.status, result: record.session.result, session: record.session, effects: EFFECTS });
  }

  async swapSides() {
    const record = this._requireActive();
    await this._revalidate(record.session.source, 'source'); await this._revalidate(record.session.destination, 'destination');
    const proposed = swapTransferEndpoints(record.session), changes = [
      { handle: record.handles.destination.ref, role: 'source', endpoint: proposed.source },
      { handle: record.handles.source.ref, role: 'destination', endpoint: proposed.destination }
    ];
    await this.services.updateEndpointRoles(deepFreeze(changes), deepFreeze({ sessionId: proposed.sessionId, generation: proposed.generation, effects: EFFECTS }));
    const oldSource = record.handles.source, oldDestination = record.handles.destination;
    record.handles = { source: { ...oldDestination, ref: deepFreeze({ ...oldDestination.ref, role: 'source' }) }, destination: { ...oldSource, ref: deepFreeze({ ...oldSource.ref, role: 'destination' }) } };
    record.session = proposed;
    return this.snapshot();
  }

  async changeEndpoint(role, candidate) {
    const record = this._requireActive();
    if (!['source', 'destination'].includes(role)) throw new TypeError('Transfer endpoint role must be source or destination.');
    const old = record.handles[role], allowed = await this.services.guardClose([old.opaque], deepFreeze({ reason: 'change-endpoint', role, effects: EFFECTS }));
    if (allowed !== true) return deepFreeze({ status: 'cancelled', reason: 'The current endpoint remained open.', effects: EFFECTS });
    const endpoint = await this.services.resolveEndpoint(candidate, role);
    if (!endpoint) return deepFreeze({ status: 'cancelled', reason: 'Endpoint selection was cancelled.', effects: EFFECTS });
    const proposed = changeTransferEndpoint(record.session, role, endpoint);
    await this._revalidate(proposed[role], role); await this._revalidate(proposed[role === 'source' ? 'destination' : 'source'], role === 'source' ? 'destination' : 'source');
    let opened;
    try {
      opened = await this._openHandle(proposed, proposed[role], role);
      if (opened.ref.id === record.handles[role === 'source' ? 'destination' : 'source'].ref.id) throw new Error('The replacement endpoint reused the other endpoint handle.');
      await this._closeRecords([old], { reason: 'change-endpoint', force: false });
    } catch (error) {
      if (opened) await this._closeRecords([opened], { reason: 'change-rollback', force: true }).catch(() => {});
      throw error;
    }
    record.handles[role] = opened; record.session = proposed;
    return deepFreeze({ status: 'changed', role, session: record.session, handle: opened.ref, effects: EFFECTS });
  }

  endpointClosed(handleId) {
    if (!this.active) return false;
    const wanted = boundedString(handleId, 'Closed Transfer handle identity');
    if (this.active.suppressClosed.has(wanted)) return false;
    let role = null; for (const candidate of ['source', 'destination']) if (this.active.handles[candidate]?.ref.id === wanted) role = candidate;
    if (!role) return false;
    this.active.handles[role] = null; this.active.degraded = true; this.active.session = cancelTransferSession(this.active.session); return true;
  }

  async continueInAssembly() {
    const record = this._requireActive(), callback = serviceFunction(this.services, 'continueAssembly', true);
    if (!callback) return deepFreeze({ status: 'unavailable', reason: 'No advanced Two-SFF Assembly continuation is registered.', effects: EFFECTS });
    if (record.session.pendingReview?.status !== 'ready') throw new Error('Review the current exact sprite selection before continuing to Advanced Two-SFF Assembly.');
    await this._revalidate(record.session.source, 'source'); await this._revalidate(record.session.destination, 'destination');
    const reference = deepFreeze({ source: record.session.source, destination: record.session.destination, request: record.session.pendingReview.request, reviewFingerprint: record.session.pendingReview.reviewFingerprint, session: record.session, effects: EFFECTS });
    const result = await callback(reference);
    return deepFreeze({ status: result?.status || 'continued', result: result || null, reference, effects: EFFECTS });
  }

  async exit() {
    const record = this._requireActive(), records = ['source', 'destination'].map(role => record.handles[role]).filter(Boolean);
    const allowed = await this.services.guardClose(records.map(item => item.opaque), deepFreeze({ reason: 'exit-transfer', effects: EFFECTS }));
    if (allowed !== true) return deepFreeze({ status: 'cancelled', reason: 'Transfer endpoints remained open.', effects: EFFECTS });
    await this._closeRecords(records, { reason: 'exit-transfer', force: false });
    const cancelled = cancelTransferSession(record.session); this.active = null;
    const restored = await this.services.restoreNormalContext(record.normalContext);
    return deepFreeze({ status: restored === false ? 'exited-unrestored' : 'exited', session: cancelled, normalContextRestored: restored !== false, effects: EFFECTS });
  }

  async _closeRecords(records, options) {
    const active = this.active;
    if (active) for (const item of records) active.suppressClosed.add(item.ref.id);
    try { await this.services.closePinnedEndpoints(records.map(item => item.opaque), deepFreeze({ ...options, effects: EFFECTS })); }
    finally { if (active) for (const item of records) active.suppressClosed.delete(item.ref.id); }
  }
}

function createSffTransferMode(services) { return new SffTransferMode(services); }
function createAssetTransferMode(kind, services) { return new SffTransferMode({ ...services, kind }); }

module.exports = { EFFECTS, capabilityProjection, createSffTransferMode, createAssetTransferMode, SffTransferMode };
