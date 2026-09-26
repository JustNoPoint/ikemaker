'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { standardSet, resolveStandards, auditAnimationStandards } = require('../src/animation_standards');

const core = standardSet('ikemen-1.0-character-core');
assert.ok(core);
assert.strictEqual(core.scope, 'engine');
assert.ok(core.requiredAnimations.some((entry) => entry.action === 5000));

const resolved = resolveStandards(['ikemen-1.0-character-core', 'jnp-shared-gethit-axis-references']);
assert.deepStrictEqual(resolved.requiredAxisRoles.map((entry) => entry.role), ['feet', 'middle', 'head']);

const complete = core.requiredAnimations.map((entry) => `[Begin Action ${entry.action}]\n0, 0, 0, 0, 1`).join('\n');
assert.strictEqual(auditAnimationStandards(complete).missingAnimations.length, 0);
assert.deepStrictEqual(auditAnimationStandards('[Begin Action 0]').missingAnimations[0].action, 5);

const bridge = fs.readFileSync(path.join(__dirname, '..', 'data', 'authoring-bridge', 'ikemen_tools_authoring_bridge.zss'), 'utf8');
const mirrored = [...bridge.matchAll(/if !selfAnimExist\((-?\d+)\) \{ map\(IkTools_Audit_MissingCount\) :=/g)].map((match) => Number(match[1]));
assert.deepStrictEqual(mirrored, core.requiredAnimations.map((entry) => entry.action), 'runtime audit must mirror the registry exactly');
assert.ok(!/JNP_/i.test(bridge), 'neutral bridge must not use a JNP namespace');
assert.ok(/gameMode = "training"/.test(bridge));

console.log('animation standard tests passed');
