'use strict';

const path = require('path');
const { isDeepStrictEqual } = require('util');

function normalized(value) {
  return path.resolve(String(value || '.')).toLowerCase();
}

function contextIdentity(context = {}) {
  const type = String(context.kind || context.type || 'workspace');
  let seed = context.key || context.root || context.files?.[0] || '.';
  if (type === 'character') {
    const explicitOwner = typeof context.ownerDef === 'string' && path.extname(context.ownerDef).toLowerCase() === '.def' ? context.ownerDef : '';
    const keyedOwner = typeof seed === 'string' && path.extname(seed).toLowerCase() === '.def' ? seed : '';
    const owner = explicitOwner || keyedOwner;
    if (owner) {
      const projectId = typeof context.projectId === 'string' ? context.projectId.trim().toLocaleLowerCase('en-US') : '';
      const projectPath = !projectId && (context.projectRoot || context.workspaceRoot) ? normalized(context.projectRoot || context.workspaceRoot) : '';
      return `${type}\0${projectId || projectPath}\0${normalized(owner)}`;
    }
  }
  return `${type}\0${normalized(seed)}`;
}

function uniqueFiles(files = []) {
  const seen = new Set();
  const result = [];
  for (const value of files || []) {
    const filename = typeof value === 'string' ? value : value?.fsPath || value?.path || value?.filename;
    if (!filename) continue;
    const absolute = path.resolve(String(filename));
    const key = normalized(absolute);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(absolute);
  }
  return result;
}

function clone(value) {
  if (value === undefined || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(clone);
  const result = {};
  for (const [key, item] of Object.entries(value)) result[key] = clone(item);
  return result;
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) freeze(item);
  return Object.freeze(value);
}

class AuthoringContextModel {
  constructor(context = {}) {
    this._type = String(context.kind || context.type || 'workspace');
    this._key = normalized(context.key || context.root || context.files?.[0]);
    this._identity = contextIdentity({ ...context, type: this._type, key: context.key || context.root || context.files?.[0] });
    this._label = String(context.label || context.type || 'Authoring workspace');
    this._root = context.root ? path.resolve(String(context.root)) : '';
    this._files = uniqueFiles(context.files);
    this._selection = clone(context.selection ?? null);
    this._activeSurfaceId = String(context.activeSurfaceId || '');
    this._revision = 0;
    this._selectionRevision = 0;
    this._listeners = new Set();
    this._draftLease = null;
    this._disposed = false;
    this._snapshot = null;
  }

  get identity() { return this._identity; }
  get id() { return this._identity; }
  get kind() { return this._type; }
  get disposed() { return this._disposed; }

  snapshot() {
    if (this._snapshot) return this._snapshot;
    this._snapshot = freeze({
      id: this._identity,
      identity: this._identity,
      kind: this._type,
      type: this._type,
      key: this._key,
      label: this._label,
      root: this._root,
      files: [...this._files],
      connectedFiles: [...this._files],
      activeSurfaceId: this._activeSurfaceId,
      selection: clone(this._selection),
      revision: this._revision,
      selectionRevision: this._selectionRevision,
      draftLease: this._draftLease ? { owner: clone(this._draftLease.owner) } : null,
      disposed: this._disposed
    });
    return this._snapshot;
  }

  update(changes = {}) {
    this._assertActive();
    let changed = false;
    if (Object.prototype.hasOwnProperty.call(changes, 'label')) {
      const label = String(changes.label || this._type || 'Authoring workspace');
      if (label !== this._label) { this._label = label; changed = true; }
    }
    if (Object.prototype.hasOwnProperty.call(changes, 'root')) {
      const root = changes.root ? path.resolve(String(changes.root)) : '';
      if (root !== this._root) { this._root = root; changed = true; }
    }
    if (Object.prototype.hasOwnProperty.call(changes, 'files') || Object.prototype.hasOwnProperty.call(changes, 'connectedFiles')) {
      const files = uniqueFiles(changes.files ?? changes.connectedFiles);
      if (!isDeepStrictEqual(files, this._files)) { this._files = files; changed = true; }
    }
    if (Object.prototype.hasOwnProperty.call(changes, 'selection')) {
      const selection = clone(changes.selection ?? null);
      if (!isDeepStrictEqual(selection, this._selection)) {
        this._selection = selection;
        this._selectionRevision += 1;
        changed = true;
      }
    }
    if (Object.prototype.hasOwnProperty.call(changes, 'activeSurfaceId')) {
      const activeSurfaceId = String(changes.activeSurfaceId || '');
      if (activeSurfaceId !== this._activeSurfaceId) { this._activeSurfaceId = activeSurfaceId; changed = true; }
    }
    if (changed) this._publish();
    return this.snapshot();
  }

  setSelection(selection) { return this.update({ selection }); }
  setActiveSurface(activeSurfaceId) { return this.update({ activeSurfaceId }); }
  setConnectedFiles(files) { return this.update({ files }); }

  acquireDraftLease(owner) {
    this._assertActive();
    if (typeof owner !== 'string' || !owner.trim()) throw new TypeError('A draft lease owner requires a stable nonempty string ID.');
    owner = owner.trim();
    if (this._draftLease) return null;
    const token = Object.freeze({ identity: this._identity, id: Symbol('authoring-draft-lease') });
    this._draftLease = { owner, token };
    this._publish();
    return token;
  }

  releaseDraftLease(token) {
    if (!this._draftLease || token !== this._draftLease.token) return false;
    this._draftLease = null;
    this._publish();
    return true;
  }

  hasDraftLease(owner) {
    return Boolean(this._draftLease && (arguments.length === 0 || this._draftLease.owner === owner));
  }

  subscribe(listener) {
    this._assertActive();
    if (typeof listener !== 'function') throw new TypeError('An authoring context listener must be a function.');
    this._listeners.add(listener);
    let active = true;
    return { dispose: () => { if (active) { active = false; this._listeners.delete(listener); } } };
  }

  onDidChange(listener) { return this.subscribe(listener); }

  dispose() {
    if (this._disposed) return false;
    this._disposed = true;
    this._draftLease = null;
    this._revision += 1;
    this._snapshot = null;
    const finalSnapshot = this.snapshot();
    for (const listener of [...this._listeners]) {
      try { listener(finalSnapshot); } catch (_) {}
    }
    this._listeners.clear();
    return true;
  }

  cleanup() { return this.dispose(); }

  _publish() {
    this._revision += 1;
    this._snapshot = null;
    const snapshot = this.snapshot();
    for (const listener of [...this._listeners]) {
      try { listener(snapshot); } catch (_) {}
    }
  }

  _assertActive() {
    if (this._disposed) throw new Error('Authoring context has been disposed.');
  }
}

function createAuthoringContext(context) { return new AuthoringContextModel(context); }

module.exports = {
  AuthoringContextModel,
  createAuthoringContext,
  contextIdentity,
  normalized,
  uniqueFiles
};
