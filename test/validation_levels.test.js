'use strict';
const assert = require('assert');
const validation = require('../src/validation_levels');
assert.strictEqual(validation.normalizeLevel('information'), 'convention');
assert.strictEqual(validation.normalizeLevel('hint'), 'suggestion');
assert.strictEqual(validation.enabled({ level: 'convention', code: 'prefix' }, { enabledLevels: validation.LEVELS, disabledConventionRules: ['prefix'] }), false);
assert.strictEqual(validation.group([{ level: 'error' }, { severity: 'hint' }]).suggestion.length, 1);
console.log('Validation level tests passed');
