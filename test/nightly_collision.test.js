'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { supportsDummyCollision, availabilityForFile } = require('../src/nightly_collision');

assert.strictEqual(supportsDummyCollision({ channel: 'stable', version: '1.0.0' }), false);
assert.strictEqual(supportsDummyCollision({ channel: 'nightly', version: 'nightly' }), true);
assert.strictEqual(supportsDummyCollision({ channel: 'custom', version: 'nightly' }), true, 'a pinned custom build derived from Nightly remains a Nightly target');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-nightly-clsn-'));
try {
  const air = path.join(root, 'chars', 'Hero', 'Hero.air');
  fs.mkdirSync(path.dirname(air), { recursive: true });
  fs.mkdirSync(path.join(root, '.ikemen'), { recursive: true });
  fs.writeFileSync(air, '[Begin Action 0]\n0,0,0,0,1\n');
  fs.writeFileSync(path.join(root, '.ikemen', 'project-registry.json'), JSON.stringify({
    schemaVersion: 4,
    projects: [{ id: 'game', name: 'Game', roots: ['.'], engineTarget: { buildId: 'pinned-nightly', channel: 'custom', version: 'nightly', commit: 'abc' } }],
    characters: [{ id: 'hero', name: 'Hero', projectId: 'game', def: 'chars/Hero/Hero.def' }]
  }));
  const available = availabilityForFile(air);
  assert.strictEqual(available.enabled, true);
  assert.strictEqual(available.projectId, 'game');
  const registry = JSON.parse(fs.readFileSync(path.join(root, '.ikemen', 'project-registry.json'), 'utf8'));
  registry.projects[0].engineTarget = { buildId: 'ikemen-go-1.0.0-windows-x64', channel: 'stable', version: '1.0.0' };
  fs.writeFileSync(path.join(root, '.ikemen', 'project-registry.json'), JSON.stringify(registry));
  assert.strictEqual(availabilityForFile(air).enabled, false, 'stable projects must not receive Nightly-only Dummy options');
} finally { fs.rmSync(root, { recursive: true, force: true }); }

console.log('Nightly Dummy collision availability stays project-targeted and optional');
