'use strict';
const assert = require('assert');
const { parseCollisionEligibilityReferences } = require('../src/collision_eligibility_reference_authority');

const cns = '[StateDef 200]\r\n[State 200, old]\r\ntype = HitBy\r\nvalue = S, NA ; exact\r\ntime = 4\r\ntrigger1 = time > 0\r\n[State 200, new]\r\ntype = NotHitBy\r\nattr = S, NP\r\nclsn.group = 2\r\nclsn.index = 3\r\n';
const cnsRows = parseCollisionEligibilityReferences(cns, 'cns');
assert.strictEqual(cnsRows.length, 2); assert.strictEqual(cnsRows[0].kind, 'hitby'); assert.strictEqual(cnsRows[0].fields.find(item => item.key === 'value').expression, 'S, NA'); assert.strictEqual(cnsRows[0].conditional, true); assert.strictEqual(cnsRows[1].category, 'eligibility-filtering'); assert.strictEqual(cnsRows[1].available, true);
const zss = '[StateDef 201; anim: 200]\nHitBy { attr: S, NA; time: 2; } NotHitBy { attr: S, NP; clsn.index: 1; }\n';
const zssRows = parseCollisionEligibilityReferences(zss, 'zss'); assert.strictEqual(zssRows.length, 2); assert.notStrictEqual(zssRows[0].controllerStart, zssRows[1].controllerStart); assert.strictEqual(zss.slice(zssRows[1].fields[0].start, zssRows[1].fields[0].end), 'S, NP');
assert.strictEqual(parseCollisionEligibilityReferences('# HitBy { attr: S, NA; }\n"NotHitBy { attr: S, NP; }"', 'zss').length, 0);
assert.match(parseCollisionEligibilityReferences('HitBy { value: S, NA; attr: S, NP; }', 'zss')[0].reason, /mixes old/i);
assert.match(parseCollisionEligibilityReferences('HitBy { time: 2; }', 'zss')[0].reason, /no eligibility selector/i);
assert.match(parseCollisionEligibilityReferences('HitBy { attr: S, NA;', 'zss')[0].reason, /structurally incomplete/i);
assert.match(parseCollisionEligibilityReferences('[State x]\ntype=HitBy\ntype=NotHitBy\nvalue=S,NA\n', 'cns')[0].reason, /duplicate or ambiguous type/i);
assert.strictEqual(parseCollisionEligibilityReferences('root, HitBy { attr: S, NA; }', 'zss')[0].redirect, true);
for (const [syntax, source] of [['zss', 'HitBy { playerno: 1; } NotHitBy { playerid: 2; }'], ['cns', '[State x]\ntype=HitBy\nplayerno=1\n[State y]\ntype=NotHitBy\nplayerid=2\n']]) assert(parseCollisionEligibilityReferences(source, syntax).every(item => item.available), `${syntax} player selectors are sufficient`);
for (const [syntax, source] of [['zss', 'HitBy { value: S, NA; redirectid: 7; }'], ['cns', '[State x]\ntype=HitBy\nvalue=S, NA\nredirectid=7\n']]) { const item=parseCollisionEligibilityReferences(source, syntax)[0]; assert.strictEqual(item.redirect, true); assert(!/mixes old/i.test(item.reason)); }
for (const literal of ['S, NA', 'SCA, NA, SP', 'A, HA']) assert.strictEqual(parseCollisionEligibilityReferences(`HitBy { attr: ${literal}; }`, 'zss')[0].dynamic, false);
for (const dynamic of ['garbage', 'foo.bar', '1', 'S, NA + 1']) assert.strictEqual(parseCollisionEligibilityReferences(`HitBy { attr: ${dynamic}; }`, 'zss')[0].dynamic, true);
assert.strictEqual(parseCollisionEligibilityReferences('HitBy { attr: S, NA; clsn.group: Clsn1; clsn.index: 0; }', 'zss')[0].dynamic, false, 'reviewed collision group labels are static eligibility literals');
assert.strictEqual(parseCollisionEligibilityReferences('[State x]\ntype=HitBy\nattr=S, NA\n', 'cns')[0].dynamic, false); assert.strictEqual(parseCollisionEligibilityReferences('[State x]\ntype=HitBy\nattr=foo.bar\n', 'cns')[0].dynamic, true);
console.log('collision eligibility reference authority tests passed');
