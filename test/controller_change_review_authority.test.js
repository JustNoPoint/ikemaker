'use strict';

const assert = require('assert');
const catalog = require('../data/sctrl.json');
const { project } = require('../src/controller_change_markers');
const { ControllerChangeReviewAuthority } = require('../src/controller_change_review_authority');
const capabilities = { target: { channel: 'nightly', buildId: 'fixture-build' }, enabledCapabilities: ['zss.run-state', 'render.expanded-shaders', 'zss.runtime-strings', 'zss.expanded-string-expressions'] };
const review = project(catalog, capabilities), authority = new ControllerChangeReviewAuthority(Buffer.alloc(32, 7)), item = review.items[0];

const shown = authority.issueDetails('workspace-a', review, item.controller);
assert.strictEqual(shown.details.controller, item.controller);
assert(Array.isArray(shown.details.options), 'the exact effective option list is included before acknowledgement');
const accepted = authority.consume(shown.receipt, 'workspace-a', review);
assert.deepStrictEqual(accepted, [{ controller: item.controller, contractHash: item.contractHash, snapshotId: review.snapshotId }]);
assert.throws(() => authority.consume(shown.receipt, 'workspace-a', review), /already used/);
const forged = { ...authority.issueDetails('workspace-a', review, review.items[1].controller).receipt, contextHash: '0'.repeat(64) };
assert.throws(() => authority.consume(forged, 'workspace-a', review), /forged/);
const staleReceipt = authority.issueDetails('workspace-a', review, review.items[1].controller).receipt;
const later = project(catalog, { ...capabilities, target: { channel: 'nightly', buildId: 'later-build' } });
assert.throws(() => authority.consume(staleReceipt, 'workspace-a', later), /stale/);
const group = review.groups.find((candidate) => candidate.unreviewedCount > 0), groupReceipt = authority.issueGroup('workspace-a', review, group.id);
assert.strictEqual(authority.consume(groupReceipt, 'workspace-a', review).length, group.unreviewedCount);
const staleGroupReceipt = authority.issueGroup('workspace-a', review, group.id), oneAcknowledged = { [review.items.find((candidate) => group.controllerNames.includes(candidate.controller)).controller.toLowerCase()]: { contractHash: review.items.find((candidate) => group.controllerNames.includes(candidate.controller)).contractHash, snapshotId: review.snapshotId } }, reduced = project(catalog, capabilities, { acknowledged: oneAcknowledged });
assert.throws(() => authority.consume(staleGroupReceipt, 'workspace-a', reduced), /stale|descendants|no longer matches/);
assert.throws(() => authority.issueDetails('workspace-a', project(catalog, { target: { channel: 'stable', version: '1.0' } }), item.controller), /unavailable/);
console.log('controller review receipts require displayed exact details and reject forged, replayed, stale, and cross-context acknowledgement');
