'use strict';

const assert = require('assert');
const crypto = require('crypto');
const { ControllerChangeReviewStore, LIMITS } = require('../src/controller_change_review_store');

class Adapter {
  constructor(seed) { this.value = seed; this.writes = 0; this.fail = false; }
  get(_key, fallback) { return this.value === undefined ? fallback : JSON.parse(JSON.stringify(this.value)); }
  async update(_key, value) { this.writes += 1; if (this.fail) throw new Error('fixture failure'); this.value = JSON.parse(JSON.stringify(value)); }
}
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const record = (name, suffix) => ({ controller: name, contractHash: hash(`contract-${suffix}`), snapshotId: hash(`snapshot-${suffix}`) });

(async () => {
  const adapter = new Adapter(), first = new ControllerChangeReviewStore(adapter);
  await first.refresh();
  await Promise.all([first.acknowledge('workspace-a', [record('RunState', 'a')]), first.acknowledge('workspace-a', [record('ShaderSet', 'b')])]);
  assert.strictEqual(Object.keys(first.acknowledged('workspace-a')).length, 2, 'serialized mutations must merge from fresh durable state');
  const restarted = new ControllerChangeReviewStore(adapter); await restarted.refresh();
  assert.strictEqual(restarted.acknowledged('workspace-a').runstate.contractHash, record('RunState', 'a').contractHash, 'acknowledgement survives restart');
  const before = restarted.acknowledged('workspace-a'); adapter.fail = true;
  await assert.rejects(restarted.acknowledge('workspace-a', [record('Other', 'c')]), /was not stored/);
  assert.deepStrictEqual(restarted.acknowledged('workspace-a'), before, 'storage failure retains prior cached state');
  const unavailable = new ControllerChangeReviewStore(null);
  await assert.rejects(unavailable.acknowledge('workspace-a', [record('RunState', 'a')]), /unavailable/);
  await assert.rejects(first.acknowledge('workspace-a', Array.from({ length: LIMITS.controllersPerContext + 1 }, (_, index) => record(`C${index}`, String(index)))), /bounded limit/);
  console.log('controller change review store persists bounded contract acknowledgements and fails closed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
