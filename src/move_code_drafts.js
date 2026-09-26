'use strict';

function client() {
  const local = { ...(vscode.getState()?.moveCodeDrafts || {}) };
  let sequence = 0;
  const pending = new Map();
  const prefix = () => model.files.defPath.toLowerCase() + '#';
  const key = section => prefix() + section.stableId;
  const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const persist = () => vscode.setState({ ...vscode.getState(), moveCodeDrafts: local });
  function entry(section) {
    const id = key(section);
    if (!Object.prototype.hasOwnProperty.call(local, id) && model.codeDrafts?.[section.stableId]) local[id] = clone(model.codeDrafts[section.stableId]);
    return local[id];
  }
  function value(section) { return entry(section)?.value ?? section.text; }
  function conflict(section) {
    const draft = entry(section);
    return Boolean(draft && (draft.baseHash !== section.sourceHash || draft.baseText !== section.text));
  }
  function send(section, draft) {
    vscode.postMessage({ type: 'moveCodeDraft', defPath: model.files.defPath, sectionId: section.stableId, draft: clone(draft || {}) });
  }
  function stage(section, text) {
    const id = key(section), previous = entry(section);
    if (!previous && text === section.text) return;
    const next = previous ? { ...previous, value: text, revision: Number(previous.revision || 0) + 1 } : {
      sectionId: section.stableId, filename: section.filename, kind: section.kind, signature: section.signature,
      baseHash: section.sourceHash, baseText: section.text, baseStartLine: section.startLine, baseEndLine: section.endLine,
      value: text, revision: 1
    };
    if (next.value === next.baseText) { local[id] = null; persist(); send(section, {}); return; }
    local[id] = next; persist(); send(section, next);
  }
  function discard(section) { local[key(section)] = null; persist(); send(section, {}); }
  function discardId(sectionId) { const section = { stableId: sectionId }; local[prefix() + sectionId] = null; persist(); send(section, {}); }
  function rebase(section) {
    const previous = entry(section); if (!previous) return;
    const next = { ...previous, baseHash: section.sourceHash, baseText: section.text, baseStartLine: section.startLine, baseEndLine: section.endLine, revision: Number(previous.revision || 0) + 1 };
    local[key(section)] = next; persist(); send(section, next);
  }
  function apply(section) {
    const draft = entry(section); if (!draft || conflict(section)) return null;
    const requestId = ++sequence;
    pending.set(requestId, { key: key(section), sectionId: section.stableId, revision: draft.revision, value: draft.value });
    vscode.postMessage({ type: 'applyCodeSection', sourceId: move.id, id: section.stableId, baseHash: draft.baseHash, text: draft.value, requestId });
    return requestId;
  }
  function isPending(section) { const id = key(section); return [...pending.values()].some(request => request.key === id); }
  function actionState(section) {
    const draft = entry(section), changed = Boolean(draft), stale = conflict(section), applying = isPending(section);
    return { changed, conflict: stale, pending: applying, canApply: changed && !stale && !applying, canDiscard: changed && !applying };
  }
  function acknowledge(message) {
    const request = pending.get(message.requestId); if (!request) return false;
    pending.delete(message.requestId);
    const current = local[request.key];
    if (message.cleared && current && current.revision === request.revision && current.value === request.value) { local[request.key] = null; persist(); return true; }
    return false;
  }
  function failed(requestId) { pending.delete(requestId); }
  function hasDrafts() {
    const server = Object.fromEntries(Object.entries(model.codeDrafts || {}).map(([id, draft]) => [prefix() + id, draft]));
    return Object.entries({ ...server, ...local }).some(([id, draft]) => id.startsWith(prefix()) && draft && Object.keys(draft).length > 0);
  }
  function orphaned(sections) {
    const known = new Set((sections || []).map(section => section.stableId)), server = Object.fromEntries(Object.entries(model.codeDrafts || {}).map(([id, draft]) => [prefix() + id, draft]));
    return Object.entries({ ...server, ...local }).filter(([id, draft]) => id.startsWith(prefix()) && draft && Object.keys(draft).length && !known.has(id.slice(prefix().length))).map(([id, draft]) => ({ sectionId: id.slice(prefix().length), draft }));
  }
  const priorHas = globalThis.ikemenHasUnappliedForms, priorKeep = globalThis.ikemenCanKeepDraft;
  globalThis.ikemenHasUnappliedForms = () => Boolean(priorHas?.() || hasDrafts());
  globalThis.ikemenCanKeepDraft = () => Boolean(priorKeep?.() || hasDrafts());
  return { value, entry, conflict, stage, discard, discardId, rebase, apply, isPending, actionState, acknowledge, failed, hasDrafts, orphaned };
}

function applyConflict(section, stored, message, currentHash) {
  if (!stored || stored.value !== message.text || stored.baseHash !== message.baseHash) return 'draft-changed';
  if (message.baseHash !== section.sourceHash) return 'source-refreshed';
  if (currentHash !== message.baseHash) return 'source-changed';
  return '';
}

module.exports = { clientScript: () => `const codeDraftStore=(${client.toString()})();`, applyConflict };
