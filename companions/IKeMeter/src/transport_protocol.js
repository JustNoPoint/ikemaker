'use strict';

const crypto = require('node:crypto');

const ALLOWED_OPCODES = new Set(['pause', 'resume', 'step', 'disconnect']);
const ALLOWED_DIRECTIONS = new Set(['command', 'telemetry', 'ack']);

function requireInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} must be a positive safe integer`);
}

function deriveOfferName(key, offer) {
  if (!Buffer.isBuffer(key) || key.length < 32) throw new Error('session key must contain at least 32 bytes');
  requireInteger(offer.epoch, 'epoch');
  requireInteger(offer.sequence, 'sequence');
  if (!ALLOWED_DIRECTIONS.has(offer.direction)) throw new Error('direction is not allowlisted');
  if (offer.direction === 'command' && !ALLOWED_OPCODES.has(offer.opcode)) throw new Error('opcode is not allowlisted');
  const material = JSON.stringify({
    v: 1,
    epoch: offer.epoch,
    sequence: offer.sequence,
    direction: offer.direction,
    opcode: offer.opcode || '',
  });
  const capability = crypto.createHmac('sha256', key).update(material).digest('base64url');
  return `\\\\.\\pipe\\ikemeter-${capability}`;
}

class SessionAuthority {
  constructor(options = {}) {
    this.key = options.key || crypto.randomBytes(32);
    this.epoch = options.epoch || 1;
    this.active = true;
    this.nextSequence = 1;
    this.offers = new Map();
    this.retired = new Set();
    this.retiredOrder = [];
    this.maxOutstanding = options.maxOutstanding || 1;
    this.maxRetired = options.maxRetired || 128;
  }

  offer(direction, opcode = '') {
    if (!this.active) throw new Error('session is disconnected');
    let outstanding = 0;
    for (const value of this.offers.values()) {
      if (!value.acknowledged) outstanding += 1;
    }
    if (outstanding >= this.maxOutstanding) throw new Error('one-credit capacity exhausted');
    const offer = { epoch: this.epoch, sequence: this.nextSequence++, direction, opcode };
    const name = deriveOfferName(this.key, offer);
    this.offers.set(name, { ...offer, consumed: false });
    return { ...offer, name };
  }

  consume(name, observedEpoch) {
    if (!this.active) return { accepted: false, reason: 'disconnected' };
    if (observedEpoch !== this.epoch) return { accepted: false, reason: 'stale-epoch' };
    if (this.retired.has(name)) return { accepted: false, reason: 'retired-capability' };
    const offer = this.offers.get(name);
    if (!offer) return { accepted: false, reason: 'unknown-capability' };
    if (offer.epoch !== this.epoch) return { accepted: false, reason: 'stale-epoch' };
    if (offer.consumed) return { accepted: false, reason: 'already-consumed' };
    offer.consumed = true;
    return { accepted: true, offer: { ...offer } };
  }

  acknowledge(name, result) {
    if (!this.active) throw new Error('cannot acknowledge while disconnected');
    const offer = this.offers.get(name);
    if (!offer || offer.epoch !== this.epoch || !offer.consumed || offer.acknowledged || offer.direction !== 'command') {
      throw new Error('cannot acknowledge an unissued, unconsumed, stale, duplicate, or non-command offer');
    }
    if (!['applied', 'rejected', 'unavailable'].includes(result.status)) throw new Error('invalid result status');
    if (result.status === 'applied' && !Number.isSafeInteger(result.observedTick)) {
      throw new Error('applied result requires an observed tick');
    }
    offer.acknowledged = true;
    const ack = {
      epoch: this.epoch,
      requestSequence: offer.sequence,
      opcode: offer.opcode,
      status: result.status,
      observedTick: result.observedTick ?? null,
      reason: result.reason || '',
    };
    this.#retire(name);
    return ack;
  }

  retire(name) {
    const offer = this.offers.get(name);
    if (!offer || !offer.consumed) throw new Error('only a consumed offer can retire');
    this.#retire(name);
  }

  #retire(name) {
    this.offers.delete(name);
    this.retired.add(name);
    this.retiredOrder.push(name);
    while (this.retiredOrder.length > this.maxRetired) {
      this.retired.delete(this.retiredOrder.shift());
    }
  }

  reconnect() {
    this.active = true;
    this.epoch += 1;
    this.key = crypto.randomBytes(32);
    this.nextSequence = 1;
    this.offers.clear();
    this.retired.clear();
    this.retiredOrder.length = 0;
    return this.epoch;
  }

  disconnect() {
    this.active = false;
    this.offers.clear();
    this.retired.clear();
    this.retiredOrder.length = 0;
  }
}

module.exports = { ALLOWED_OPCODES, SessionAuthority, deriveOfferName };
