'use strict';

function defaultKey(value) { return String(value || '').trim().toLowerCase(); }

class PanelBindingRegistry {
  constructor(options = {}) {
    if (options && (typeof options !== 'object' || Array.isArray(options))) throw new TypeError('Panel binding options must be an object.');
    this.key = typeof options.key === 'function' ? options.key : defaultKey;
    this.byTarget = new Map();
    this.byPanel = new WeakMap();
  }

  claim(panel, target, options = {}) {
    if (!panel || (typeof panel !== 'object' && typeof panel !== 'function')) throw new TypeError('A panel object is required.');
    const key = this._key(target), occupied = this.byTarget.get(key);
    if (occupied && occupied !== panel && !options.multiple && this.byPanel.get(panel)!==key) return Object.freeze({ ok:false, reason:'target-occupied', panel:occupied, key });
    const previous = this.byPanel.get(panel) || '';
    if (previous && previous !== key) this.release(panel);
    this.byTarget.set(key, panel); this.byPanel.set(panel, key);
    if (!this.members) this.members = new Map();
    if (!this.members.has(key)) this.members.set(key,new Set());
    this.members.get(key).add(panel);
    return Object.freeze({ ok:true, key, previous });
  }

  release(panel) {
    const key = this.byPanel.get(panel);
    if (!key) return false;
    this.members?.get(key)?.delete(panel);
    if (this.byTarget.get(key) === panel) { const next=this.members?.get(key)?.values().next().value; if(next)this.byTarget.set(key,next);else this.byTarget.delete(key); }
    this.byPanel.delete(panel);
    return true;
  }

  get(target) { return this.byTarget.get(this._key(target)); }
  target(panel) { return this.byPanel.get(panel) || ''; }
  hasPanel(panel) { return this.byPanel.has(panel); }
  values() { return this.byTarget.values(); }
  entries() { return this.byTarget.entries(); }
  get size() { return this.byTarget.size; }

  _key(target) {
    const key = this.key(target);
    if (typeof key !== 'string' || !key) throw new TypeError('A panel target must produce a nonempty key.');
    return key;
  }
}

function createPanelBindingRegistry(options) { return new PanelBindingRegistry(options); }

module.exports = { PanelBindingRegistry, createPanelBindingRegistry };
