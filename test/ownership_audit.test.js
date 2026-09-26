'use strict';
const assert = require('assert');
const path = require('path');
const audit = require('../src/ownership_audit');
const refs = audit.defReferences('[Files]\nst = ../template/common.zss\nst2 = SF6template/system.zss\nsprite = Ryu.sff ; note\n', path.join('C:', 'game', 'chars', 'Ryu', 'Ryu.def'));
assert.deepStrictEqual(refs.map((item) => item.key), ['st', 'st2', 'sprite']);
const results = audit.auditEdges({ ownership: 'universal', project: { id: 'universal' } }, [{ context: { ownership: 'game', project: { id: 'sf6' } } }]); assert.strictEqual(results[0].allowed, false);
console.log('Ownership audit tests passed');
