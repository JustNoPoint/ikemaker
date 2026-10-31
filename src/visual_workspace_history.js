'use strict';

const { hash } = require('./mutation_safety');

const MAX_ENTRIES = 30;
const MAX_SNAPSHOT_CHARS = 8 * 1024 * 1024;
const MAX_RETAINED_CHARS = 32 * 1024 * 1024;
const MESSAGE_TYPE = 'visualWorkspaceHistory';
const STATE_TYPE = 'visualWorkspaceHistoryState';

function boundedLabel(value) {
  const label = String(value || '').trim();
  if (!label || label.length > 160) throw new Error('Visual workspace history needs a bounded mutation label.');
  return label;
}

function snapshotText(value) {
  if (typeof value !== 'string') throw new Error('Visual workspace history snapshots must be source text.');
  if (value.length > MAX_SNAPSHOT_CHARS) throw new Error('This source is too large for in-session visual workspace Undo/Redo. Recovery history remains available.');
  return value;
}

function validMessage(message, generation) {
  return Boolean(message && Object.getPrototypeOf(message) === Object.prototype &&
    Object.keys(message).sort().join('\0') === ['action', 'generation', 'type'].sort().join('\0') &&
    message.type === MESSAGE_TYPE && message.generation === generation &&
    (message.action === 'undo' || message.action === 'redo'));
}

class VisualWorkspaceHistory {
  constructor(options = {}) {
    this.maxEntries = Math.max(1, Math.min(MAX_ENTRIES, Number(options.maxEntries) || MAX_ENTRIES));
    this.undoStack = [];
    this.redoStack = [];
    this.replaying = false;
  }

  state(busy = false) {
    return Object.freeze({
      canUndo: !busy && !this.replaying && this.undoStack.length > 0,
      canRedo: !busy && !this.replaying && this.redoStack.length > 0,
      busy: Boolean(busy || this.replaying),
      undoLabel: this.undoStack.at(-1)?.label || '',
      redoLabel: this.redoStack.at(-1)?.label || ''
    });
  }

  prepare(beforeValue, afterValue, labelValue) {
    if (this.replaying) return null;
    return Object.freeze({ before: snapshotText(beforeValue), after: snapshotText(afterValue), label: boundedLabel(labelValue) });
  }

  record(beforeValue, afterValue, labelValue) {
    if (this.replaying) return false;
    const {before,after,label}=this.prepare(beforeValue,afterValue,labelValue);
    if (before === after) return false;
    this.undoStack.push(Object.freeze({ before, after, beforeHash: hash(before), afterHash: hash(after), label }));
    this.redoStack.length = 0;
    while (this.undoStack.length > this.maxEntries || this._retainedChars() > MAX_RETAINED_CHARS) this.undoStack.shift();
    return true;
  }

  _retainedChars() {
    return [...this.undoStack, ...this.redoStack].reduce((sum, entry) => sum + entry.before.length + entry.after.length, 0);
  }

  async apply(action, operations) {
    if (!['undo', 'redo'].includes(action)) throw new Error('Choose Undo or Redo.');
    if (this.replaying) throw new Error('Visual workspace history is already applying a change.');
    const source = action === 'undo' ? this.undoStack : this.redoStack;
    const destination = action === 'undo' ? this.redoStack : this.undoStack;
    const entry = source.at(-1);
    if (!entry) throw new Error(`There is no visual workspace change to ${action}.`);
    if (!operations || typeof operations.read !== 'function' || typeof operations.write !== 'function' || typeof operations.isActive !== 'function') throw new Error('Visual workspace history has no authoritative owner.');
    if (!operations.isActive()) throw new Error('This visual workspace no longer owns the active source.');
    const expectedHash = action === 'undo' ? entry.afterHash : entry.beforeHash;
    const target = action === 'undo' ? entry.before : entry.after;
    const targetHash = action === 'undo' ? entry.beforeHash : entry.afterHash;
    if (hash(await operations.read()) !== expectedHash) throw new Error('The source changed after this history entry. Refresh or use Recovery / History; nothing was changed.');
    this.replaying = true;
    let applied;
    try {
      if (!operations.isActive()) throw new Error('This visual workspace lost source authority before history could be applied.');
      await operations.write(target, `${action}-${entry.label}`);
      if (!operations.isActive()) throw new Error('This visual workspace lost source authority while history was applied.');
      if (hash(await operations.read()) !== targetHash) throw new Error('The owning editor did not apply the exact history snapshot.');
      source.pop();
      destination.push(entry);
      if (typeof operations.refresh === 'function') await operations.refresh();
      applied = Object.freeze({ action, label: entry.label });
    } finally {
      this.replaying = false;
    }
    return Object.freeze({ ...applied, state: this.state(false) });
  }
}

function controlsHtml(state = {}) {
  const disabledUndo = state.canUndo ? '' : ' disabled';
  const disabledRedo = state.canRedo ? '' : ' disabled';
  return `<span class="visual-workspace-history" role="group" aria-label="Committed workspace history"><button id="visualWorkspaceUndo" type="button" title="Undo the last committed workspace mutation" aria-label="Undo committed workspace mutation"${disabledUndo}>↶ Undo</button><button id="visualWorkspaceRedo" type="button" title="Redo the last undone workspace mutation" aria-label="Redo committed workspace mutation"${disabledRedo}>↷ Redo</button></span>`;
}

function controlsClientScript(generationExpression = 'data.generation') {
  return `(()=>{const undo=document.getElementById('visualWorkspaceUndo'),redo=document.getElementById('visualWorkspaceRedo');if(!undo||!redo)return;const update=state=>{undo.disabled=!state?.canUndo;redo.disabled=!state?.canRedo;undo.title=state?.undoLabel?'Undo '+state.undoLabel:'Undo the last committed workspace mutation';redo.title=state?.redoLabel?'Redo '+state.redoLabel:'Redo the last undone workspace mutation'};const send=action=>{undo.disabled=true;redo.disabled=true;vscode.postMessage({type:'${MESSAGE_TYPE}',generation:${generationExpression},action})};undo.onclick=()=>send('undo');redo.onclick=()=>send('redo');addEventListener('message',event=>{const message=event.data;if(message?.type==='${STATE_TYPE}'&&message.generation===${generationExpression})update(message.state)})})();`;
}

function stateMessage(history, generation, busy = false) {
  return { type: STATE_TYPE, generation, state: history.state(busy) };
}

module.exports = { MAX_ENTRIES, MAX_SNAPSHOT_CHARS, MESSAGE_TYPE, STATE_TYPE, VisualWorkspaceHistory, validMessage, controlsHtml, controlsClientScript, stateMessage };
