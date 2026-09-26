'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { audit } = require('../tools/baseline-rehearsal-audit');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemen-baseline-'));
try {
  const fixture = path.resolve(__dirname, 'fixtures', 'stabilization', 'Tiny.air'); fs.copyFileSync(fixture, path.join(root, 'Tiny.air'));
  fs.writeFileSync(path.join(root, 'Tiny.def'), '[Info]\nname=Tiny\n[Files]\nanim=Tiny.air\ncmd=missing.cmd\n');
  const result = audit(path.join(root, 'Tiny.def')); assert.strictEqual(result.air.actions, 2); assert.strictEqual(result.findings.length, 1); assert.ok(result.manualGates.some((item) => item.includes('sign-off')));
} finally { fs.rmSync(root, { recursive: true, force: true }); }
console.log('Baseline rehearsal audit tests passed');
