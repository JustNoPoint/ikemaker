'use strict';

const crypto = require('crypto');

function digest(value) { return crypto.createHash('sha256').update(String(value ?? '')).digest('hex'); }
function identity(value) { return JSON.stringify(value); }
class CommandPresetImportAuthority {
  constructor(options = {}) { this.records = new Map(); this.token = options.token || (() => crypto.randomBytes(24).toString('hex')); }
  issue(context) {
    const token = this.token();
    if (!/^[a-f0-9]{48}$/i.test(token) || this.records.has(token)) throw new Error('Could not issue a unique command preset import authority.');
    const record = Object.freeze({
      sessionId: String(context.sessionId || ''), generation: Number(context.generation), source: String(context.source || ''),
      fileHash: String(context.fileHash || ''), storeSnapshot: String(context.storeSnapshot || ''),
      capabilityHash: digest(identity(context.capabilities || {})), planHash: String(context.planHash || '')
    });
    if (!record.sessionId || !Number.isInteger(record.generation) || !record.source || !record.fileHash || !record.storeSnapshot || !record.planHash) throw new Error('Command preset import authority requires an exact reviewed context.');
    this.records.set(token, record); return token;
  }
  consume(token, current) {
    const record = this.records.get(token); this.records.delete(token);
    if (!record) throw new Error('The reviewed command preset import is missing, expired, or already used. Review it again.');
    const actual = {
      sessionId: String(current.sessionId || ''), generation: Number(current.generation), source: String(current.source || ''),
      fileHash: String(current.fileHash || ''), storeSnapshot: String(current.storeSnapshot || ''),
      capabilityHash: digest(identity(current.capabilities || {})), planHash: String(current.planHash || '')
    };
    for (const key of Object.keys(record)) if (record[key] !== actual[key]) throw new Error('The command preset file, target, selection, or workspace presets changed after review. Nothing was imported.');
    return record;
  }
  revoke(token) { return this.records.delete(token); }
  clear() { this.records.clear(); }
}

module.exports = { CommandPresetImportAuthority, digest };
