'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..'), audit = JSON.parse(fs.readFileSync(path.join(root, 'data', 'Workflow-Stabilization-Completion-Audit.json')));
assert.strictEqual(audit.requirements.length, 12); assert.strictEqual(audit.extensionVersion, require('../package.json').version);
for (const requirement of audit.requirements) for (const evidence of requirement.evidence) assert.ok(fs.existsSync(path.resolve(root, evidence)), `${requirement.name} lacks evidence ${evidence}`);
assert.ok(audit.manualRyuGates.length); assert.notStrictEqual(audit.goalStatus, 'complete');
console.log('Workflow stabilization completion-audit tests passed');
