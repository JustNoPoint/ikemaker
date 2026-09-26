'use strict';

const assert = require('assert');
const pkg = require('../package.json');

const expected = {
  '*.zss': 'zss', '*.air': 'ikemen-air', '*.cns': 'ikemen-cns',
  '*.inp': 'ikemen-cns', '*.cmd': 'ikemen-cns', '*.st': 'ikemen-cns', '*.jnp': 'ikemen-cns', '*.def': 'ikemen-def'
};
assert.deepStrictEqual(pkg.contributes.configurationDefaults['files.associations'], expected);
for (const language of ['zss', 'ikemen-air', 'ikemen-cns', 'ikemen-def']) {
  assert(pkg.activationEvents.includes(`onLanguage:${language}`), `${language} must activate automatically`);
  assert(pkg.contributes.grammars.some((grammar) => grammar.language === language), `${language} must have a bundled grammar`);
}
console.log('Default language association tests passed');
