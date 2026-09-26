'use strict';
const assert = require('assert');
const { describeOption } = require('../src/controller_option_guidance');
assert.match(describeOption('damage', 'HitDef'), /damage/i);
assert.match(describeOption('custom.velocity', 'Example'), /velocity/i);
assert.match(describeOption('mystery', 'Example'), /mystery/i);
console.log('Controller option guidance tests passed');
