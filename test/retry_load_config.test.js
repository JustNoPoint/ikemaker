'use strict';
const assert = require('assert');
const { inspectRetryLoadOnError, planRetryLoadOnError } = require('../src/retry_load_config');

assert.strictEqual(inspectRetryLoadOnError('[Debug]\nRetryLoadOnError = 1\n').state, 'enabled');
assert.strictEqual(inspectRetryLoadOnError('[Debug]\r\nRetryLoadOnError = false ; local choice\r\n').state, 'disabled');
assert.strictEqual(inspectRetryLoadOnError('[Options]\nRetryLoadOnError = 1\n').state, 'unset', 'same key outside Debug is ignored');
let plan = planRetryLoadOnError('[Debug]\r\nKeepSpritesOnReload = 1\r\n[Video]\r\n', true);
assert(plan.ok && plan.text === '[Debug]\r\nKeepSpritesOnReload = 1\r\nRetryLoadOnError = 1\r\n[Video]\r\n', 'setting is inserted in Debug while preserving CRLF');
plan = planRetryLoadOnError('[Debug]\n  RetryLoadOnError = nope # review\n', false);
assert(plan.ok && plan.text.includes('  RetryLoadOnError = 0 # review'), 'explicit review repairs one invalid value without deleting its comment');
plan = planRetryLoadOnError('[Options]\nDifficulty = 4', true);
assert(plan.ok && plan.text.endsWith('\n[Debug]\nRetryLoadOnError = 1\n'), 'a missing Debug section is appended cleanly');
plan = planRetryLoadOnError('[Debug]\nRetryLoadOnError = 0\nRetryLoadOnError = 1\n', false);
assert.strictEqual(plan.ok, false, 'ambiguous duplicate settings are never rewritten automatically');
console.log('Retry-load config planning is explicit, loss-minimizing, and duplicate-safe');
