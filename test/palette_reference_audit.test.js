'use strict';

const assert = require('assert');
const { auditPaletteReferences } = require('../src/palette_reference_audit');

const audit = auditPaletteReferences([
  { filename: 'literal.zss', text: 'remappal {\n source: 1, 1;\n dest: 1, 2;\n}' },
  { filename: 'dynamic.zss', text: 'remappal {\n source: 1, map(JNP_palette);\n dest: 1, var(20);\n}' },
  { filename: 'other.zss', text: 'lifeadd { value: 20; }' }
], [{ from: { group: 1, number: 2 }, to: { group: 1, number: 32 } }]);

assert.strictEqual(audit.affected.length, 1);
assert.deepStrictEqual(audit.affected[0].references.find((item) => item.field.startsWith('dest')).shiftedTo, { group: 1, number: 32 });
assert.strictEqual(audit.unresolved.length, 1);
assert.strictEqual(audit.unresolved[0].filename, 'dynamic.zss');
assert.strictEqual(audit.findings.some((item) => item.filename === 'other.zss'), false);

console.log('palette external reference audit tests passed');
