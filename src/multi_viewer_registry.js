'use strict';

// File lookup selects one reusable viewer; each explicitly opened tab retains
// its own registration and remains live when another tab for that file closes.
class MultiViewerRegistry {
    constructor() { this.targets = new Map(); }
    set(key, value) {
        let values = this.targets.get(key);
        if (!values) this.targets.set(key, values = new Set());
        values.add(value);
        return this;
    }
    get(key) {
        const values = this.targets.get(key);
        if (!values) return undefined;
        for (const value of values) if (value.disposed || value.panel?.disposed) values.delete(value);
        if (!values.size) { this.targets.delete(key); return undefined; }
        return [...values].find(value => value.active || value.panel?.active) || values.values().next().value;
    }
    hasValue(key, value) { return this.targets.get(key)?.has(value) === true; }
    release(key, value) {
        const values = this.targets.get(key);
        if (!values) return false;
        const removed = values.delete(value);
        if (!values.size) this.targets.delete(key);
        return removed;
    }
    clear() { this.targets.clear(); }
    delete(key) { return this.targets.delete(key); }
    *values() { for (const values of this.targets.values()) yield* values; }
    *entries() { for (const [key, values] of this.targets) for (const value of values) yield [key, value]; }
    [Symbol.iterator]() { return this.entries(); }
    get size() { return [...this.values()].length; }
}
module.exports = { MultiViewerRegistry };
