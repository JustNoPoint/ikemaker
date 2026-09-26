'use strict';

const assert = require('assert');
const { PATHS, languageGuidance, languageGuidanceHtml } = require('../src/language_guidance');

assert.strictEqual(Object.keys(PATHS).length, 3);
assert.ok(languageGuidance('cns').steps.some(([, detail]) => detail.includes('triggerall')));
assert.ok(languageGuidance('lua').steps.some(([, detail]) => detail.includes('default Lua files')));
assert.ok(languageGuidanceHtml('zss', 'learning').includes('id="languagePath" open'));
assert.ok(!languageGuidanceHtml('zss', 'advanced').includes('languagePath" open'));
assert.ok(languageGuidanceHtml('cns', 'learning').includes('CNS → ZSS concept bridge'));
assert.ok(languageGuidanceHtml('lua', 'learning').includes('non-rollback ownership'));

console.log('Language guidance tests passed');
