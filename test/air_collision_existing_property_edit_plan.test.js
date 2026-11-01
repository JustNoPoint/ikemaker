'use strict';

const assert = require('assert');
const crypto = require('crypto');
const path = require('path');
const { createAirCollisionInspection } = require('../src/air_collision_inspection_model');
const { createAirCollisionPropertyDraft } = require('../src/air_collision_property_draft_model');
const { parseCollisionEligibilityReferences } = require('../src/collision_eligibility_reference_authority');
const { parseCollisionContactReferences } = require('../src/collision_contact_reference_authority');
const { parseStateSource } = require('../src/state_transfer_model');
const { EXISTING_EDIT_SCHEMA, createAirCollisionExistingPropertyEditPlan, deepFreeze, fieldAuthorityHash } = require('../src/air_collision_destination_plan');

const sha = value => crypto.createHash('sha256').update(String(value), 'utf8').digest('hex').toUpperCase();
const filename = path.resolve('/char/main.zss'), fingerprint = 'A'.repeat(64), target = { channel: 'nightly', buildId: 'verified' };
const airText = '[Begin Action 200]\nClsn1: 1\nClsn1[0] = -4,-5,6,7\nClsn2: 1\nClsn2[0] = -8,-9,12,13\n0,0,0,0,1\n';
const inspection = createAirCollisionInspection({ text: airText, action: 200, elementIndex: 0, target, capabilityFingerprint: fingerprint, allocationDecision: { capabilityId: 'collision.air-index-allocation', enabled: true, status: 'supported', capabilityFingerprint: fingerprint } });
const base = { inspection, capabilityFingerprint: fingerprint, target, indexedDecision: { capabilityId: 'collision.indexed-controls', enabled: true, status: 'supported', capabilityFingerprint: fingerprint }, dummyDecision: { capabilityId: 'collision.dummy-group', enabled: true, status: 'supported', capabilityFingerprint: fingerprint }, group: 'Clsn1', index: 0 };

function fixture(text, draft, fieldKey, action, options = {}) {
  const projection = createAirCollisionPropertyDraft({ ...base, draft }), family = projection.recipe.family, records = family === 'eligibility' ? parseCollisionEligibilityReferences(text, 'zss') : parseCollisionContactReferences(text, 'zss'), record = records[options.recordIndex || 0], field = record.fields.find(item => item.key === fieldKey), sourceHash = sha(text), version = 7, declaration = parseStateSource(text, filename, 'zss').declarations.find(item => item.value === 200);
  const destination = deepFreeze({ sourcePath: filename, sourceHash, sourceVersion: version, stateNumber: 200, stateLine: declaration?.line ?? 0, stateCharacter: declaration?.character ?? 10, stateExpression: declaration?.expression ?? '200', controller: { kind: projection.recipe.kind, start: record.controllerStart, end: record.controllerEnd, controllerHash: sha(text.slice(record.controllerStart, record.controllerEnd)) } });
  const snapshot = deepFreeze({ inventoryComplete: true, clean: true, assignedSources: [filename], sources: [{ filename, text, sourceHash, syntax: 'zss', available: true, dirty: false, version }], targetBinding: { draftHash: projection.draftHash, inspectionHash: projection.selection.inspectionHash, target: projection.target } });
  const edit = deepFreeze({ action, field: { key: field.key, start: field.start, end: field.end, expression: field.expression, expressionHash: fieldAuthorityHash(field) }, ...(action === 'replace' ? { replacement: options.replacement } : {}) });
  return { projection, snapshot, destination, edit, text };
}
const plan = item => createAirCollisionExistingPropertyEditPlan({ projection: item.projection, snapshot: item.snapshot, destination: item.destination, edit: item.edit });
const apply = (text, result) => result.insertion ? text.slice(0, result.insertion.start) + result.insertion.text + text.slice(result.insertion.end) : text;

const eligibilitySource = '[StateDef 200]\nhitBy{\n\tattr: SCA, NA;\n\ttime: 2;\n\tclsn.group: Clsn1;\n\tclsn.index: 0;\n}\n';
const eligibility = fixture(eligibilitySource, { family: 'eligibility', kind: 'HitBy', attr: 'SCA, AP', time: 2 }, 'attr', 'replace', { replacement: 'SCA, AP' }), eligibilityBefore = JSON.stringify(eligibility), eligibilityPlan = plan(eligibility), eligibilityAfter = apply(eligibilitySource, eligibilityPlan);
assert.strictEqual(eligibilityPlan.status, 'ready', eligibilityPlan.limitations.join(' | '));
assert.strictEqual(eligibilityPlan.schema, EXISTING_EDIT_SCHEMA);
assert.strictEqual(eligibilityPlan.operation.kind, 'replace-existing-field');
assert.strictEqual(eligibilityPlan.insertion.text, 'SCA, AP');
assert.match(eligibilityAfter, /attr: SCA, AP;/);
assert.strictEqual(eligibilityPlan.preview.after, eligibilityAfter, 'bounded preview represents replacement rather than insertion-before-old-value');
assert.strictEqual(sha(eligibilityAfter), eligibilityPlan.hashes.after);
assert.strictEqual(JSON.stringify(eligibility), eligibilityBefore, 'pure planning preserves accepted caller evidence');
assert(Object.isFrozen(eligibilityPlan) && Object.isFrozen(eligibilityPlan.insertion) && Object.isFrozen(eligibilityPlan.effects));
assert.deepStrictEqual(eligibilityPlan.effects, { filesystem: false, editor: false, clipboard: false, command: false, route: false, mutationAuthority: false });

const noOp = plan(fixture(eligibilitySource, { family: 'eligibility', kind: 'HitBy', attr: 'SCA, NA', time: 2 }, 'attr', 'replace', { replacement: 'SCA, NA' }));
assert.strictEqual(noOp.status, 'no-op'); assert.strictEqual(noOp.insertion, null); assert.strictEqual(noOp.hashes.before, noOp.hashes.after);

const optionalSource = '[StateDef 200]\nhitBy{\n\tattr: SCA, NA;\n\ttime: 2;\n\tclsn.group: Clsn1;\n\tclsn.index: 0;\n\tplayerno: 2; # keep this explanation\n}\n';
const optional = fixture(optionalSource, { family: 'eligibility', kind: 'HitBy', attr: 'SCA, NA', time: 2 }, 'playerno', 'remove'), optionalPlan = plan(optional), optionalAfter = apply(optionalSource, optionalPlan);
assert.strictEqual(optionalPlan.status, 'ready', optionalPlan.limitations.join(' | '));
assert.strictEqual(optionalPlan.operation.kind, 'remove-existing-field');
assert(!/playerno\s*:/.test(optionalAfter)); assert.match(optionalAfter, /# keep this explanation/, 'field removal preserves its neighboring comment');

const requiredRemoval = plan(fixture(eligibilitySource, { family: 'eligibility', kind: 'HitBy', attr: 'SCA, NA', time: 2 }, 'time', 'remove'));
assert.notStrictEqual(requiredRemoval.status, 'ready'); assert.match(requiredRemoval.limitations.join(' '), /present|required/i);
const arbitraryValue = plan(fixture(eligibilitySource, { family: 'eligibility', kind: 'HitBy', attr: 'SCA, AP', time: 2 }, 'attr', 'replace', { replacement: 'SCA, HA' }));
assert.notStrictEqual(arbitraryValue.status, 'ready'); assert.match(arbitraryValue.limitations.join(' '), /does not match.*C10/i);

const contactSource = '[StateDef 200]\nhitDef{\n\tattr: S, NA;\n\tp2clsncheck: Clsn1;\n\tp2clsnrequire: Size;\n}\n';
const contact = fixture(contactSource, { family: 'contact', kind: 'HitDef', attr: 'S, NA', p2clsncheck: 'Clsn2', p2clsnrequire: 'None' }, 'p2clsncheck', 'replace', { replacement: 'Clsn2' }), contactPlan = plan(contact), contactAfter = apply(contactSource, contactPlan);
assert.strictEqual(contactPlan.status, 'ready'); assert.match(contactAfter, /p2clsncheck: Clsn2;/);
const contactAttr = plan(fixture(contactSource, { family: 'contact', kind: 'HitDef', attr: 'S, SA', p2clsncheck: 'Clsn1', p2clsnrequire: 'Size' }, 'attr', 'replace', { replacement: 'S, SA' }));
assert.strictEqual(contactAttr.status, 'ready');
const contactRequire = plan(fixture(contactSource, { family: 'contact', kind: 'HitDef', attr: 'S, NA', p2clsncheck: 'Clsn1', p2clsnrequire: 'Dummy' }, 'p2clsnrequire', 'replace', { replacement: 'Dummy' }));
assert.strictEqual(contactRequire.status, 'ready');
const removeContact = plan(fixture(contactSource, { family: 'contact', kind: 'HitDef', attr: 'S, NA', p2clsncheck: 'Clsn1', p2clsnrequire: 'None' }, 'p2clsnrequire', 'remove'));
assert.strictEqual(removeContact.status, 'ready'); assert(!/p2clsnrequire/.test(apply(contactSource, removeContact)));
const requiredContact = plan(fixture(contactSource, { family: 'contact', kind: 'HitDef', p2clsncheck: 'Clsn1', p2clsnrequire: 'None' }, 'attr', 'remove'));
assert.notStrictEqual(requiredContact.status, 'ready');
const modifySource = '[StateDef 200]\nmodifyHitDef{\n\tattr: S, NA;\n\tp2clsncheck: Clsn1;\n}\n', modifyRemoval = plan(fixture(modifySource, { family: 'contact', kind: 'ModifyHitDef', p2clsncheck: 'Clsn1', p2clsnrequire: 'None' }, 'attr', 'remove'));
assert.strictEqual(modifyRemoval.status, 'ready', 'an optional Modify* attr omitted by the reviewed recipe may be removed'); assert(!/attr\s*:/.test(apply(modifySource, modifyRemoval)));
const inlineFirstModify = '[StateDef 200]\nmodifyHitDef{attr: S, NA; p2clsncheck: Clsn1;}\n', inlineFirstRemoval = plan(fixture(inlineFirstModify, { family: 'contact', kind: 'ModifyHitDef', p2clsncheck: 'Clsn1', p2clsnrequire: 'None' }, 'attr', 'remove'));
assert.strictEqual(inlineFirstRemoval.status, 'ready', 'the first same-line optional field has an exact opening-brace boundary'); assert.match(apply(inlineFirstModify, inlineFirstRemoval), /modifyHitDef\{ p2clsncheck/);

const duplicateKindSource = '[StateDef 200]\nhitBy{attr: SCA, NA; time: 2; clsn.group: Clsn1; clsn.index: 0;}\nhitBy{attr: SCA, NA; time: 2; clsn.group: Clsn1; clsn.index: 0;}\n';
const second = fixture(duplicateKindSource, { family: 'eligibility', kind: 'HitBy', attr: 'SCA, AP', time: 2 }, 'attr', 'replace', { replacement: 'SCA, AP', recordIndex: 1 }), secondPlan = plan(second), secondAfter = apply(duplicateKindSource, secondPlan);
assert.strictEqual(secondPlan.status, 'ready', 'exact occurrence remains editable when another same-kind controller exists');
assert.strictEqual((secondAfter.match(/attr: SCA, AP/g) || []).length, 1);

const conditionalSource = '[StateDef 200]\nif anim = 200 {\n\thitBy{attr: SCA, NA; time: 2; clsn.group: Clsn1; clsn.index: 0;}\n}\n';
const conditional = plan(fixture(conditionalSource, { family: 'eligibility', kind: 'HitBy', attr: 'SCA, AP', time: 2 }, 'attr', 'replace', { replacement: 'SCA, AP' }));
assert.strictEqual(conditional.status, 'ready'); assert.match(conditional.limitations.join(' '), /conditional or Modify.*does not claim runtime ownership/i);

const dynamicSource = '[StateDef 200]\nhitBy{attr: map(filter); time: 2; clsn.group: Clsn1; clsn.index: 0;}\n', dynamic = fixture(dynamicSource, { family: 'eligibility', kind: 'HitBy', attr: 'SCA, AP', time: 2 }, 'attr', 'replace', { replacement: 'SCA, AP' });
assert.notStrictEqual(plan(dynamic).status, 'ready'); assert.match(plan(dynamic).limitations.join(' '), /dynamic|malformed/i);
const stale = fixture(eligibilitySource, { family: 'eligibility', kind: 'HitBy', attr: 'SCA, AP', time: 2 }, 'attr', 'replace', { replacement: 'SCA, AP' }); stale.edit = deepFreeze({ ...stale.edit, field: { ...stale.edit.field, expressionHash: 'B'.repeat(64) } });
assert.notStrictEqual(plan(stale).status, 'ready'); assert.match(plan(stale).limitations.join(' '), /stale|exact source/i);

const eligibilityFieldsSource = '[StateDef 200]\nnotHitBy{attr: SCA, NA; time: 2; clsn.group: Clsn2; clsn.index: 7; playerno: 2; playerid: 3; slot: 1; stack: 0;}\n';
const eligibilityFieldsDraft = { family: 'eligibility', kind: 'NotHitBy', attr: 'SCA, AP', time: 4, playerno: '5', playerid: '6', slot: 2, stack: true };
for (const [key, replacement] of [['attr', 'SCA, AP'], ['time', '4'], ['clsn.group', 'Clsn1'], ['clsn.index', '0'], ['playerno', '5'], ['playerid', '6'], ['slot', '2'], ['stack', 'true']]) {
  const result = plan(fixture(eligibilityFieldsSource, eligibilityFieldsDraft, key, 'replace', { replacement }));
  assert.strictEqual(result.status, 'ready', `NotHitBy ${key}: ${result.limitations.join(' | ')}`);
  assert.strictEqual(result.fieldAuthority.key, key);
}

for (const kind of ['HitDef', 'ModifyHitDef', 'Projectile', 'ModifyProjectile', 'ReversalDef', 'ModifyReversalDef']) {
  const rendered = kind[0].toLowerCase() + kind.slice(1), reversal = kind.includes('Reversal'), modify = kind.startsWith('Modify'), selector = reversal ? 'reversal.attr' : 'attr', selectorLine = modify ? '' : `${selector}: ${reversal ? 'SCA, AA' : 'S, NA'}; `, source = `[StateDef 200]\n${rendered}{${selectorLine}p2clsncheck: Clsn1; p2clsnrequire: Size;}\n`, draft = { family: 'contact', kind, ...(modify ? {} : reversal ? { reversalAttr: 'SCA, AA' } : { attr: 'S, NA' }), p2clsncheck: 'Clsn2', p2clsnrequire: 'Size' };
  const result = plan(fixture(source, draft, 'p2clsncheck', 'replace', { replacement: 'Clsn2' }));
  assert.strictEqual(result.status, 'ready', `${kind}: ${result.limitations.join(' | ')}`);
  if (modify) assert.match(result.limitations.join(' '), /conditional or Modify/i);
}

const reversalAttrSource = '[StateDef 200]\nreversalDef{reversal.attr: SCA, NA; p2clsncheck: Clsn1;}\n', reversalAttr = plan(fixture(reversalAttrSource, { family: 'contact', kind: 'ReversalDef', reversalAttr: 'SCA, AA', p2clsncheck: 'Clsn1', p2clsnrequire: 'None' }, 'reversal.attr', 'replace', { replacement: 'SCA, AA' }));
assert.strictEqual(reversalAttr.status, 'ready');
const attrCaseNoopSource = '[StateDef 200]\nhitDef{attr: s, na; p2clsncheck: clsn1;}\n', attrCaseNoop = plan(fixture(attrCaseNoopSource, { family: 'contact', kind: 'HitDef', attr: 'S, NA', p2clsncheck: 'Clsn1', p2clsnrequire: 'None' }, 'attr', 'replace', { replacement: 'S, NA' }));
assert.strictEqual(attrCaseNoop.status, 'no-op'); assert.strictEqual(attrCaseNoop.hashes.before, attrCaseNoop.hashes.after);

for (const [label, source] of [
  ['LF', '[StateDef 200]\nhitBy{\n\tattr: SCA, NA;\n\ttime: 2;\n\tclsn.group: Clsn1;\n\tclsn.index: 0;\n\tplayerno: 2;\n}\n'],
  ['CRLF', '[StateDef 200]\r\nhitBy{\r\n\tattr: SCA, NA;\r\n\ttime: 2;\r\n\tclsn.group: Clsn1;\r\n\tclsn.index: 0;\r\n\tplayerno: 2;\r\n}\r\n'],
  ['same-line', '[StateDef 200]\nhitBy{attr: SCA, NA; time: 2; clsn.group: Clsn1; clsn.index: 0; playerno: 2; slot: 1;}'],
  ['comment', '[StateDef 200]\nhitBy{attr: SCA, NA; time: 2; clsn.group: Clsn1; clsn.index: 0; playerno: 2; # retained\n}'],
  ['final-before-brace', '[StateDef 200]\nhitBy{attr: SCA, NA; time: 2; clsn.group: Clsn1; clsn.index: 0; playerno: 2;}']
]) {
  const item = fixture(source, { family: 'eligibility', kind: 'HitBy', attr: 'SCA, NA', time: 2 }, 'playerno', 'remove'), result = plan(item), after = apply(source, result);
  assert.strictEqual(result.status, 'ready', `${label}: ${result.limitations.join(' | ')}`);
  assert.strictEqual(after.slice(0, result.insertion.start) + source.slice(result.insertion.start, result.insertion.end) + after.slice(result.insertion.start), source, `${label} preserves all bytes outside patch`);
  if (label === 'CRLF') assert.strictEqual((after.match(/\r\n/g) || []).length, (source.match(/\r\n/g) || []).length, 'removal preserves CRLF bytes');
  if (label === 'comment') assert.match(after, /# retained/);
}
const missingTerminatorSource = '[StateDef 200]\nhitBy{\n\tattr: SCA, NA;\n\ttime: 2;\n\tclsn.group: Clsn1;\n\tclsn.index: 0;\n\tplayerno: 2\n\tslot: 1;\n}\n', missingTerminator = plan(fixture(missingTerminatorSource, { family: 'eligibility', kind: 'HitBy', attr: 'SCA, NA', time: 2, slot: 1 }, 'playerno', 'remove'));
assert.strictEqual(missingTerminator.status, 'conflict'); assert.match(missingTerminator.limitations.join(' '), /statement-bounded|terminator/i);

const customStateSource = '[StateDef 200]\n@customstate\nhitBy{attr: SCA, NA; time: 2; clsn.group: Clsn1; clsn.index: 0;}\n', customState = plan(fixture(customStateSource, { family: 'eligibility', kind: 'HitBy', attr: 'SCA, AP', time: 2 }, 'attr', 'replace', { replacement: 'SCA, AP' }));
assert.strictEqual(customState.status, 'conflict'); assert.match(customState.limitations.join(' '), /customstate/i);
const harmlessCustomTextSource = '[StateDef 200]\n# @customstate\ntext := "@customstate";\nhitBy{attr: SCA, NA; time: 2; clsn.group: Clsn1; clsn.index: 0;}\n', harmlessCustom = plan(fixture(harmlessCustomTextSource, { family: 'eligibility', kind: 'HitBy', attr: 'SCA, AP', time: 2 }, 'attr', 'replace', { replacement: 'SCA, AP' }));
assert.strictEqual(harmlessCustom.status, 'ready');

for (const mutation of [
  item => deepFreeze({ ...item, extra: true }),
  item => deepFreeze({ ...item, replacement: 4 }),
  item => deepFreeze({ ...item, field: { ...item.field, start: String(item.field.start) } }),
  item => deepFreeze({ ...item, field: { ...item.field, expressionHash: item.field.expressionHash.toLowerCase() } }),
  item => deepFreeze({ ...item, field: { ...item.field, extra: true } })
]) {
  const exact = fixture(eligibilitySource, { family: 'eligibility', kind: 'HitBy', attr: 'SCA, AP', time: 2 }, 'attr', 'replace', { replacement: 'SCA, AP' }); exact.edit = mutation(exact.edit); assert.notStrictEqual(plan(exact).status, 'ready');
}
const duplicateFieldSource = '[StateDef 200]\nhitBy{attr: SCA, NA; attr: SCA, NA; time: 2; clsn.group: Clsn1; clsn.index: 0;}\n';
assert.strictEqual(plan(fixture(duplicateFieldSource, { family: 'eligibility', kind: 'HitBy', attr: 'SCA, AP', time: 2 }, 'attr', 'replace', { replacement: 'SCA, AP' })).status, 'conflict');
const redirectedSource = '[StateDef 200]\nroot, hitBy{attr: SCA, NA; time: 2; clsn.group: Clsn1; clsn.index: 0;}\n';
assert.strictEqual(plan(fixture(redirectedSource, { family: 'eligibility', kind: 'HitBy', attr: 'SCA, AP', time: 2 }, 'attr', 'replace', { replacement: 'SCA, AP' })).status, 'conflict');
const incompleteSource = '[StateDef 200]\nhitBy{attr: SCA, NA; time: 2; clsn.group: Clsn1; clsn.index: 0;\n';
assert.notStrictEqual(plan(fixture(incompleteSource, { family: 'eligibility', kind: 'HitBy', attr: 'SCA, AP', time: 2 }, 'attr', 'replace', { replacement: 'SCA, AP' })).status, 'ready');
const malformedContactSource = '[StateDef 200]\nhitDef{attr: S, BAD, VALUE; p2clsncheck: Clsn1;}\n';
assert.strictEqual(plan(fixture(malformedContactSource, { family: 'contact', kind: 'HitDef', attr: 'S, NA', p2clsncheck: 'Clsn1', p2clsnrequire: 'None' }, 'attr', 'replace', { replacement: 'S, NA' })).status, 'conflict');
const functionSource = '[Function Shared()]\nhitBy{attr: SCA, NA; time: 2; clsn.group: Clsn1; clsn.index: 0;}\n', functionResult = plan(fixture(functionSource, { family: 'eligibility', kind: 'HitBy', attr: 'SCA, AP', time: 2 }, 'attr', 'replace', { replacement: 'SCA, AP' }));
assert.notStrictEqual(functionResult.status, 'ready'); assert.match(functionResult.limitations.join(' '), /StateDef/i);

for (const [sourceValue, recipeValue, replacement] of [['002', 2, '2'], ['TRUE', true, 'true']]) {
  const key = sourceValue === '002' ? 'time' : 'stack', source = `[StateDef 200]\nhitBy{attr: SCA, NA; time: ${key === 'time' ? sourceValue : '2'}; clsn.group: Clsn1; clsn.index: 0;${key === 'stack' ? ` stack: ${sourceValue};` : ''}}\n`, draft = { family: 'eligibility', kind: 'HitBy', attr: 'SCA, NA', time: key === 'time' ? recipeValue : 2, ...(key === 'stack' ? { stack: recipeValue } : {}) }, result = plan(fixture(source, draft, key, 'replace', { replacement }));
  assert.strictEqual(result.status, 'no-op', `${key} canonical equivalence does not churn source formatting`);
}

const wrongTarget = fixture(eligibilitySource, { family: 'eligibility', kind: 'HitBy', attr: 'SCA, AP', time: 2 }, 'attr', 'replace', { replacement: 'SCA, AP' }); wrongTarget.snapshot = deepFreeze({ ...wrongTarget.snapshot, targetBinding: { ...wrongTarget.snapshot.targetBinding, target: { channel: 'stable', version: '1.0' } } });
assert.notStrictEqual(plan(wrongTarget).status, 'ready'); assert.match(plan(wrongTarget).limitations.join(' '), /different.*target/i);
const badDestination = fixture(eligibilitySource, { family: 'eligibility', kind: 'HitBy', attr: 'SCA, AP', time: 2 }, 'attr', 'replace', { replacement: 'SCA, AP' }); badDestination.destination = deepFreeze({ ...badDestination.destination, controller: { ...badDestination.destination.controller, start: String(badDestination.destination.controller.start) } });
assert.notStrictEqual(plan(badDestination).status, 'ready'); assert.match(plan(badDestination).limitations.join(' '), /exact.*destination/i);
const cnsPath = path.resolve('/char/main.cns'), cnsText = '[StateDef 200]\n[State 200, Filter]\ntype = HitBy\nattr = SCA, NA\ntime = 2\n', cnsHash = sha(cnsText), cns = createAirCollisionExistingPropertyEditPlan({ projection: eligibility.projection, snapshot: deepFreeze({ inventoryComplete: true, clean: true, assignedSources: [cnsPath], sources: [{ filename: cnsPath, text: cnsText, sourceHash: cnsHash, syntax: 'cns', available: true, dirty: false, version: 1 }], targetBinding: { draftHash: eligibility.projection.draftHash, inspectionHash: eligibility.projection.selection.inspectionHash, target: eligibility.projection.target } }), destination: deepFreeze({ sourcePath: cnsPath, sourceHash: cnsHash, sourceVersion: 1, stateNumber: 200, stateLine: 0, stateCharacter: 10, stateExpression: '200', controller: { kind: 'HitBy', start: 15, end: cnsText.length, controllerHash: sha(cnsText.slice(15)) } }), edit: eligibility.edit });
assert.strictEqual(cns.status, 'unresolved'); assert.match(cns.limitations.join(' '), /CNS rendering is not yet reviewed/i);
const queryProjection = createAirCollisionPropertyDraft({ ...base, draft: { family: 'queries', kind: 'ClsnOverlap', target: 'Clsn2', player: 'p2, ID' } }), query = createAirCollisionExistingPropertyEditPlan({ projection: queryProjection, snapshot: eligibility.snapshot, destination: eligibility.destination, edit: eligibility.edit });
assert.strictEqual(query.status, 'unresolved'); assert.strictEqual(query.schema, EXISTING_EDIT_SCHEMA);
assert.throws(() => createAirCollisionExistingPropertyEditPlan({ projection: eligibility.projection, snapshot: eligibility.snapshot, destination: eligibility.destination, edit: eligibility.edit, extra: true }), /only the exact/i);
let getterRuns = 0; const accessorInput = { projection: eligibility.projection, snapshot: eligibility.snapshot, destination: eligibility.destination }; Object.defineProperty(accessorInput, 'edit', { enumerable: true, get() { getterRuns += 1; return eligibility.edit; } });
assert.throws(() => createAirCollisionExistingPropertyEditPlan(accessorInput), /canonical|exact/i); assert.strictEqual(getterRuns, 0, 'accessor evidence is rejected without execution');

const hostile = Object.create({ polluted: true }); hostile.projection = eligibility.projection; hostile.snapshot = eligibility.snapshot; hostile.destination = eligibility.destination; hostile.edit = eligibility.edit;
assert.throws(() => createAirCollisionExistingPropertyEditPlan(hostile), /canonical.*planner evidence/i);
assert(!Object.prototype.hasOwnProperty.call(eligibilityPlan, 'routeToken') && !Object.prototype.hasOwnProperty.call(eligibilityPlan, 'commandId') && !Object.prototype.hasOwnProperty.call(eligibilityPlan, 'apply'), 'C14A emits no mutation authority');

console.log('AIR existing collision-property edit plans remain exact, recipe-bound, bounded, ZSS-only, and non-writing');
