'use strict';

const crypto = require('crypto');
const { MAX_MARKERS } = require('./controller_change_markers');
function hmac(secret, payload) { return crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex'); }
function itemFor(review, name) { return review?.items?.find((item) => String(item.controller).toLowerCase() === String(name).toLowerCase()) || null; }

class ControllerChangeReviewAuthority {
  constructor(secret = crypto.randomBytes(32)) {
    if (!Buffer.isBuffer(secret) || secret.length < 32) throw new TypeError('Controller review authority requires a 32-byte secret.');
    this.secret = secret;
    this.used = new Set();
  }
  issueDetails(contextIdentity, review, controllerName) {
    if (!review?.visible || !review.authorityReady) throw new Error('Controller change review is unavailable for this engine target.');
    const item = itemFor(review, controllerName);
    if (!item?.marked) throw new Error('This controller has no unreviewed change marker.');
    const receipt = this.#issue('controller', contextIdentity, review, [{ controller: item.controller, contractHash: item.contractHash }]);
    return Object.freeze({
      details: Object.freeze({ controller: item.controller, description: item.contract.description, status: item.contract.status, options: Object.freeze(item.contract.params.map((parameter) => Object.freeze({ ...parameter }))), markerText: item.changeMarker.text, target: review.target }),
      receipt
    });
  }
  issueGroup(contextIdentity, review, groupId) {
    if (!review?.visible || !review.authorityReady) throw new Error('Controller change review is unavailable for this engine target.');
    const group = review.groups?.find((item) => item.id === groupId), names = new Set(group?.controllerNames || []), items = (review.items || []).filter((item) => item.marked && names.has(item.controller));
    if (!items.length || items.length > MAX_MARKERS) throw new Error('This group has no bounded unreviewed controller selection.');
    return this.#issue('group', contextIdentity, review, items.map((item) => ({ controller: item.controller, contractHash: item.contractHash })), groupId);
  }
  #issue(kind, contextIdentity, review, items, groupId = '') {
    const body = { kind, contextHash: crypto.createHash('sha256').update(String(contextIdentity || '')).digest('hex'), snapshotId: review.snapshotId, groupId, items: items.map((item) => ({ controller: item.controller, contractHash: item.contractHash })), nonce: crypto.randomBytes(16).toString('hex') };
    return Object.freeze({ ...body, token: hmac(this.secret, body) });
  }
  consume(receipt, contextIdentity, currentReview) {
    if (!receipt || !currentReview?.visible || !currentReview.authorityReady) throw new Error('Controller review acknowledgement authority is unavailable.');
    const { token, ...body } = receipt, expectedContext = crypto.createHash('sha256').update(String(contextIdentity || '')).digest('hex');
    if (!/^[0-9a-f]{64}$/i.test(String(token || '')) || hmac(this.secret, body) !== token || body.contextHash !== expectedContext) throw new Error('Controller review receipt is forged or belongs to another context.');
    if (this.used.has(token)) throw new Error('Controller review receipt was already used.');
    if (body.snapshotId !== currentReview.snapshotId || !Array.isArray(body.items) || !body.items.length || body.items.length > MAX_MARKERS) throw new Error('Controller review receipt is stale for the current knowledge snapshot.');
    const current = body.items.map((record) => {
      const item = itemFor(currentReview, record.controller);
      if (!item?.marked || item.contractHash !== record.contractHash) throw new Error('Controller review receipt no longer matches the current marked contract.');
      return Object.freeze({ controller: item.controller, contractHash: item.contractHash, snapshotId: currentReview.snapshotId });
    });
    if (body.kind === 'group') {
      const group = currentReview.groups?.find((item) => item.id === body.groupId), exact = (group?.controllerNames || []).filter((name) => itemFor(currentReview, name)?.marked).sort();
      if (exact.length !== current.length || exact.some((name, index) => name !== current.map((item) => item.controller).sort()[index])) throw new Error('Controller group review plan is stale; review the current descendants again.');
    } else if (body.kind !== 'controller' || current.length !== 1) throw new Error('Controller review receipt kind is invalid.');
    this.used.add(token);
    if (this.used.size > 1024) this.used.delete(this.used.values().next().value);
    return Object.freeze(current);
  }
}

module.exports = { ControllerChangeReviewAuthority };
