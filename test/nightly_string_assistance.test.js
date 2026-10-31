'use strict';

const assert = require('assert');
const { analyzeZss, collectRecords } = require('../src/analyzer');

const caps = enabledCapabilities => ({ enabledCapabilities });
const codes = (source, enabled) => analyzeZss(source, { capabilities: caps(enabled) }).issues.map(item => item.code);

assert.deepStrictEqual(codes('[StateDef 1]\nmap($slot) := 1;', ['zss.runtime-strings']).filter(code => code === 'unsupported-dynamic-map-key'), ['unsupported-dynamic-map-key'], 'an older string-capable Nightly does not silently gain dynamic map keys');
assert(!codes('[StateDef 1]\nmap($slot) := 1;', ['zss.runtime-strings', 'zss.dynamic-map-keys']).includes('unsupported-dynamic-map-key'), 'the exact supporting capability enables dynamic map keys');
assert(!codes('[StateDef 1]\nmap(Legacy.Key) := 1;', []).includes('unsupported-dynamic-map-key'), 'legacy bare map keys remain portable');
const dynamicRecord=collectRecords('[StateDef 1]\nmap(ifelse($air, "Air", "Ground")) := 1;').maps.find(record=>record.literal===false);assert(dynamicRecord&&dynamicRecord.metadata.kind==='dynamic map key'&&dynamicRecord.metadata['key evidence']==='conditional key expression','dynamic keys remain visible as unresolved evidence without inventing one static map identity');assert(!JSON.stringify(dynamicRecord).includes('Ground'),'dynamic map evidence does not retain expression contents');

const stateSource='[StateDef 200; type: ifelse(map(Air), "A", "S"); movetype: I; physics: S]\nStateTypeSet { statetype: call CurrentType(); movetype: "H"; physics: "N" }';
assert.strictEqual(codes(stateSource, ['zss.runtime-strings']).filter(code => code === 'unsupported-dynamic-state-type').length, 4, 'dynamic StateDef and StateTypeSet fields remain gated on older targets while conventional literals stay valid');
assert(!codes(stateSource, ['zss.runtime-strings', 'zss.dynamic-state-types']).includes('unsupported-dynamic-state-type'), 'the exact supporting capability enables dynamic state-type expressions');
assert(codes('StateTypeSet { statetype: "X" }', ['zss.runtime-strings', 'zss.dynamic-state-types']).includes('invalid-dynamic-state-type-value'), 'a statically invalid dynamic state-type value receives exact guidance');
const multilineState='[StateDef 210;\n  type: call CurrentType();\n  movetype: A;\n  physics: ifelse($air, "N", "S")\n]';assert.deepStrictEqual(analyzeZss(multilineState,{capabilities:caps(['zss.runtime-strings'])}).issues.filter(item=>item.code==='unsupported-dynamic-state-type').map(item=>item.line),[1,3],'multiline StateDef headers retain exact field locations and ignore conventional fields');assert(!codes(multilineState,['zss.runtime-strings','zss.dynamic-state-types']).includes('unsupported-dynamic-state-type'),'multiline fields use the same exact capability gate');

const semantics='if "Ready" = "ready" {}\nif "Ready" != 1 {}\nif "Ready" {}\nlet bad := "Ready" + 1;';
const semanticCodes=codes(semantics,['zss.runtime-strings']);
assert(semanticCodes.includes('string-comparison-case-insensitive'),'string comparison help explains case-insensitive equality');
assert(semanticCodes.includes('string-numeric-comparison'),'mixed string/number comparison semantics are explicit');
assert(semanticCodes.includes('string-boolean-coercion'),'direct string conditions explain false coercion');
assert(semanticCodes.includes('string-numeric-coercion'),'arithmetic explains zero coercion and lack of concatenation');
assert(!codes(semantics,[]).some(code=>code.startsWith('string-')&&code!=='unsupported-nightly-string'),'Nightly-only semantic help does not leak into an older exact target');

console.log('Nightly string semantics and exact capability diagnostics passed');
