'use strict';

const crypto = require('crypto');

const sharedSessions = new WeakMap();

function fingerprint(text) { return crypto.createHash('sha256').update(String(text)).digest('hex'); }
function uriKey(uri) { return String((uri?.toString?.() ?? uri) || ''); }
function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}

function checkedRange(range, length) {
  const start = Number(range?.start ?? 0), end = Number(range?.end ?? length);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > length) throw new Error('Source draft range requires valid document offsets.');
  return { start, end };
}

function workspaceApi(options) {
  const vscode = options.vscode || {}, workspace = options.workspace || vscode.workspace;
  if (!workspace || typeof workspace.openTextDocument !== 'function' || typeof workspace.applyEdit !== 'function') throw new TypeError('Source drafts require injected openTextDocument and applyEdit APIs.');
  const createEdit = options.createWorkspaceEdit || (() => {
    if (typeof vscode.WorkspaceEdit !== 'function') throw new TypeError('Source drafts require an injected WorkspaceEdit factory.');
    return new vscode.WorkspaceEdit();
  });
  const createRange = options.createRange || ((document, start, end) => {
    const first = document.positionAt(start), last = document.positionAt(end);
    return typeof vscode.Range === 'function' ? new vscode.Range(first, last) : { start: first, end: last };
  });
  return { workspace, createEdit, createRange };
}

class AuthoringSourceDraft {
  constructor(secret, options, document, lease, api) {
    if (secret !== AuthoringSourceDraft) throw new Error('Use AuthoringSourceDraft.open().');
    this.context = options.context;
    this.ownerId = String(options.ownerId || options.owner || '').trim();
    this.uri = options.uri;
    this.uriIdentity = uriKey(options.uri);
    this.document = document;
    this.api = api;
    this.lease = lease;
    this.parserIdentity = String(options.parserIdentity || '');
    this.baselineText = String(document.getText());
    this.range = checkedRange(options.range, this.baselineText.length);
    this.baselineVersion = Number(document.version);
    this.baselineFingerprint = fingerprint(this.baselineText);
    this.draftText = options.text === undefined ? this.baselineText.slice(this.range.start, this.range.end) : String(options.text);
    this.draftRevision = 0;
    this.panels = new Set();
    this.disposed = false;
    if (options.panelId) this.panels.add(String(options.panelId));
  }

  static async open(options = {}) {
    if (!options.context || typeof options.context.acquireDraftLease !== 'function') throw new TypeError('Source drafts require a shared Authoring Context.');
    const ownerId = String(options.ownerId || options.owner || '').trim();
    if (!ownerId) throw new TypeError('Source drafts require a stable ownerId.');
    if (!uriKey(options.uri)) throw new TypeError('Source drafts require an exact URI.');
    const existing = sharedSessions.get(options.context);
    if (existing && !existing.disposed) {
      if (existing.ownerId !== ownerId || existing.uriIdentity !== uriKey(options.uri)) throw new Error('This Authoring Context already has an editable source draft.');
      if (options.panelId) existing.attach(options.panelId);
      return existing;
    }
    const api = workspaceApi(options), document = await api.workspace.openTextDocument(options.uri);
    if (uriKey(document.uri) !== uriKey(options.uri)) throw new Error('The document API returned a different URI.');
    const lease = options.context.acquireDraftLease(ownerId);
    if (!lease) throw new Error('This Authoring Context already has an editable draft owner.');
    try {
      const draft = new AuthoringSourceDraft(AuthoringSourceDraft, options, document, lease, api);
      sharedSessions.set(options.context, draft);
      return draft;
    } catch (error) {
      options.context.releaseDraftLease(lease);
      throw error;
    }
  }

  attach(panelId) { this._active(); if (panelId !== undefined && panelId !== null) this.panels.add(String(panelId)); return this.snapshot(); }
  close(panelId) { if (panelId !== undefined && panelId !== null) this.panels.delete(String(panelId)); return this.snapshot(); }
  cancel(panelId) { return this.close(panelId); }

  edit(text) { this._active(); this.draftText = String(text); this.draftRevision += 1; return this.snapshot(); }

  snapshot() {
    return freeze({
      uri: this.uriIdentity, ownerId: this.ownerId, parserIdentity: this.parserIdentity,
      documentVersion: this.baselineVersion, fingerprint: this.baselineFingerprint,
      range: { ...this.range }, text: this.draftText, draftRevision: this.draftRevision,
      changed: this.draftText !== this.baselineText.slice(this.range.start, this.range.end),
      panelCount: this.panels.size, disposed: this.disposed
    });
  }

  async validate() {
    this._active();
    const document = await this.api.workspace.openTextDocument(this.uri);
    if (uriKey(document.uri) !== this.uriIdentity) return freeze({ valid: false, reason: 'The exact source URI changed.' });
    const text = String(document.getText());
    if (Number(document.version) !== this.baselineVersion || fingerprint(text) !== this.baselineFingerprint) return freeze({ valid: false, reason: 'The source changed after this draft began.' });
    return { valid: true, document, text };
  }

  async apply() {
    const validation = await this.validate();
    if (!validation.valid) return freeze({ applied: false, stale: true, reason: validation.reason, state: this.snapshot() });
    if (this.draftText === validation.text.slice(this.range.start, this.range.end)) return freeze({ applied: true, changed: false, saved: false, state: this.snapshot() });
    const expectedText = validation.text.slice(0, this.range.start) + this.draftText + validation.text.slice(this.range.end);
    const edit = this.api.createEdit(), range = this.api.createRange(validation.document, this.range.start, this.range.end);
    if (!edit || typeof edit.replace !== 'function') throw new TypeError('WorkspaceEdit factory must return an object with replace().');
    edit.replace(this.uri, range, this.draftText);
    const applied = await this.api.workspace.applyEdit(edit);
    if (!applied) return freeze({ applied: false, stale: false, reason: 'VS Code rejected the workspace edit.', state: this.snapshot() });
    const document = await this.api.workspace.openTextDocument(this.uri), text = String(document.getText());
    if (text !== expectedText || Number(document.version) === this.baselineVersion) return freeze({ applied: false, stale: true, reason: 'VS Code reported success, but the native document did not reach the exact requested revision.', state: this.snapshot() });
    this.baselineText = text;
    this.range = { start: this.range.start, end: this.range.start + this.draftText.length };
    this.baselineVersion = Number(document.version);
    this.baselineFingerprint = fingerprint(text);
    return freeze({ applied: true, changed: true, saved: false, dirty: Boolean(document.isDirty), state: this.snapshot() });
  }

  async save() {
    const validation = await this.validate();
    if (!validation.valid) return freeze({ saved: false, stale: true, reason: validation.reason });
    const document = validation.document;
    if (typeof document.save !== 'function') throw new TypeError('The injected TextDocument does not support explicit save().');
    const saved = await document.save();
    if (!saved || document.isDirty) return freeze({ saved: false, dirty: Boolean(document.isDirty), reason: !saved ? 'VS Code did not save the source document.' : 'The source document remains dirty after save.' });
    return freeze({ saved: true, dirty: false });
  }

  discard() {
    if (this.disposed) return false;
    this.disposed = true;
    this.panels.clear();
    if (sharedSessions.get(this.context) === this) sharedSessions.delete(this.context);
    this.context.releaseDraftLease(this.lease);
    return true;
  }

  dispose() { return this.discard(); }
  _active() { if (this.disposed) throw new Error('Source draft has been discarded.'); }
}

async function openSourceDraft(options) { return AuthoringSourceDraft.open(options); }
function activeSourceDraft(context) { const draft = sharedSessions.get(context); return draft && !draft.disposed ? draft : null; }

module.exports = { AuthoringSourceDraft, openSourceDraft, createSourceDraft: openSourceDraft, activeSourceDraft, fingerprint };
