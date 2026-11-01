'use strict';

const assert = require('assert');
const path = require('path');
const { hash } = require('../src/mutation_safety');
const { projectProjectileProperties } = require('../src/projectile_property_projection');

function component(text, syntax = 'cns') {
  const eol = text.includes('\r\n') ? '\r\n' : '\n', lines = text.split(/\r?\n/), startLine = 1;
  let endLine = lines.length - 1;
  while (endLine > startLine && lines[endLine] === '') endLine -= 1;
  const sourceText = lines.slice(startLine, endLine + 1).join(eol);
  return { kind: 'projectile', filename: path.resolve(`contact-shot.${syntax}`), startLine, endLine, syntax, sourceText, sourceHash: hash(text), rangeHash: hash(sourceText) };
}

const cns = '[StateDef 200]\r\n[State 200, shot]\r\ntype = Projectile\r\nprojpriority = 7\r\nattr = S, SP ; exact contact\r\ndamage = 60, var(10)\r\npriority = 4, Hit\r\npriority = 5, Miss\r\nground.velocity = -5.25, 0\r\ncustom = "damage = 999"\r\n';
const cnsProjection = projectProjectileProperties(component(cns), cns);
assert.strictEqual(cnsProjection.fields.find(field => field.name === 'projpriority').expression, '7');
assert(!cnsProjection.contact.fields.some(field => field.name === 'projpriority'), 'Projectile priority never enters embedded HitDef priority');
assert.strictEqual(cnsProjection.contact.fields.find(field => field.name === 'attr').authoredName, 'attr');
assert.strictEqual(cnsProjection.contact.fields.find(field => field.name === 'damage').expression, '60, var(10)');
assert.strictEqual(cnsProjection.contact.fields.find(field => field.name === 'damage').status, 'dynamic');
const priority = cnsProjection.contact.fields.find(field => field.name === 'priority');
assert.strictEqual(priority.status, 'duplicate');
assert.deepStrictEqual(priority.occurrences.map(item => item.expression), ['4, Hit', '5, Miss']);
assert.strictEqual(cnsProjection.contact.fields.find(field => field.name === 'ground.velocity').expression, '-5.25, 0');
assert.deepStrictEqual(cnsProjection.unknown.map(field => field.name), ['custom'], 'strings and unknown source remain outside contact projection');
assert(Object.isFrozen(cnsProjection.contact) && Object.isFrozen(priority.occurrences));

const zss = '[StateDef 200]\nprojectile {\n  projpriority: 3;\n  Attr: S, NA; // preserve case\n  hitflag: MAF;\n  guardflag: ifelse(map(Guard), MA, M);\n  pausetime: 8, 9;\n  sparkno: "common", 2;\n  hitsound: 3, 4;\n  guardsound: "voice", 5, 6;\n  fall: 1;\n  fall.recovertime: 20;\n  down.recover: 1;\n  custom: "priority: 99";\n}\n';
const zssProjection = projectProjectileProperties(component(zss, 'zss'), zss);
assert.strictEqual(zssProjection.contact.fields.find(field => field.name === 'attr').authoredName, 'Attr');
assert.strictEqual(zssProjection.contact.fields.find(field => field.name === 'hitflag').compatibilityLabel, 'Classic MUGEN / IKEMEN');
assert.strictEqual(zssProjection.contact.unresolved.find(field => field.name === 'guardflag').capabilityId, 'zss.expanded-string-expressions');
assert.strictEqual(zssProjection.contact.unresolved.find(field => field.name === 'sparkno').capabilityId, 'zss.runtime-strings');
assert.strictEqual(zssProjection.contact.unresolved.find(field => field.name === 'guardsound').capabilityId, 'zss.runtime-strings');
assert.strictEqual(zssProjection.contact.fields.find(field => field.name === 'hitsound').expression, '3, 4');
assert(zssProjection.contact.groups.find(group => group.id === 'common').fields.some(field => field.name === 'pausetime'));
assert(zssProjection.contact.groups.find(group => group.id === 'fall').fields.some(field => field.name === 'fall.recovertime'));
assert.strictEqual(zssProjection.contact.fields.find(field => field.name === 'down.recover').compatibilityLabel, 'IKEMEN extension · Stable 1.0');
assert.strictEqual(zssProjection.contact.fields.find(field => field.name === 'down.recover').origin, 'ikemen-extension');
assert.strictEqual(zssProjection.unknown.length, 1);
const zssNightly = projectProjectileProperties(component(zss, 'zss'), zss, { capabilities: { enabledCapabilities: ['zss.runtime-strings', 'zss.expanded-string-expressions'] } });
for (const name of ['guardflag', 'sparkno', 'guardsound']) assert(zssNightly.contact.fields.some(field => field.name === name), `${name} appears only for the exact supporting capability`);
assert.strictEqual(zssNightly.contact.fields.find(field => field.name === 'guardflag').compatibilityLabel, 'Verified capability · zss.expanded-string-expressions');
assert.strictEqual(zssNightly.contact.fields.find(field => field.name === 'sparkno').compatibilityLabel, 'Verified capability · zss.runtime-strings');

const expanded = '[StateDef 200]\nprojectile {\n  attr: map(Hit.Attribute);\n  hitflag: $hitFlags;\n  guardflag: call GuardFlags();\n  sparkno: "fx", 700;\n  hitsound: "voice", 2, 3;\n}\n';
const expandedStable = projectProjectileProperties(component(expanded, 'zss'), expanded);
assert.deepStrictEqual(expandedStable.contact.unresolved.map(field => field.name), ['attr', 'hitflag', 'guardflag', 'sparkno', 'hitsound']);
const expandedNightly = projectProjectileProperties(component(expanded, 'zss'), expanded, { capabilities: { enabledCapabilities: ['zss.runtime-strings', 'zss.expanded-string-expressions'] } });
assert.deepStrictEqual(expandedNightly.contact.unresolved, []);
assert.deepStrictEqual(expandedNightly.contact.fields.map(field => field.name), ['attr', 'hitflag', 'guardflag', 'sparkno', 'hitsound']);

const capabilityCatalog = [{ name: 'HitDef', params: [
  { name: 'attr', required: true },
  { name: 'nightcontact', capabilityId: 'combat.test-contact', required: false }
] }];
const gated = '[StateDef 200]\nprojectile {\n  attr: S, NA;\n  nightcontact: map(ContactMode);\n}\n';
const stable = projectProjectileProperties(component(gated, 'zss'), gated, { catalog: capabilityCatalog, capabilities: { enabledCapabilities: [] } });
assert(!stable.contact.fields.some(field => field.name === 'nightcontact'), 'capability-bound contact detail is absent for Stable/unverified targets');
assert.strictEqual(stable.contact.unresolved.find(field => field.name === 'nightcontact').status, 'capability-unavailable');
assert.strictEqual(stable.unknown.length, 0, 'known but unavailable contact fields remain visibly unresolved rather than generic unknowns');
const nightly = projectProjectileProperties(component(gated, 'zss'), gated, { catalog: capabilityCatalog, capabilities: { enabledCapabilities: ['combat.test-contact'] } });
assert.strictEqual(nightly.contact.unresolved.length, 0);
assert.strictEqual(nightly.contact.fields.find(field => field.name === 'nightcontact').expression, 'map(ContactMode)');
assert.strictEqual(nightly.contact.fields.find(field => field.name === 'nightcontact').compatibilityLabel, 'Verified capability · combat.test-contact');

const longExpression = 'map(' + 'x'.repeat(5000) + ')', bounded = `[StateDef 200]\nprojectile {\n  damage: ${longExpression};\n}\n`;
const boundedProjection = projectProjectileProperties(component(bounded, 'zss'), bounded);
const boundedDamage = boundedProjection.contact.fields.find(field => field.name === 'damage');
assert.strictEqual(boundedDamage.status, 'oversized');
assert.strictEqual(boundedDamage.expression, '');
assert.strictEqual(boundedDamage.occurrences[0].expression, '', 'oversized contact source is never serialized to the webview projection');
assert(!boundedProjection.unknown.some(field => field.name.toLowerCase() === 'damage'), 'oversized recognized contact fields do not duplicate into generic unknowns');

const oversized = '[StateDef 200]\nprojectile {\n  attr: S, NA;\n}\n' + ' '.repeat(256 * 1024);
assert.strictEqual(projectProjectileProperties(component(oversized, 'zss'), oversized).status, 'unavailable');

console.log('Embedded Projectile contact projection reuses exact properties, HitDef grouping, capability gates, and zero-write raw source');
