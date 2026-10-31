'use strict';

const assert=require('assert');
const {ACTIONS,LANGUAGES,CATEGORIES,EVIDENCE,projectReferenceMatrix,referenceCapability}=require('../src/project_reference_context');
const languageProviders=require('../src/language_providers');
const browserModel=require('../src/authoring_browser_model');

const stable=projectReferenceMatrix({target:{channel:'stable',version:'1.0'},enabledCapabilities:[]});
assert.strictEqual(stable.length,LANGUAGES.length*CATEGORIES.length,'the audit has one bounded row for every supported-language/category pair');
assert.strictEqual(new Set(stable.map(row=>`${row.language}:${row.category}`)).size,stable.length,'reference cells are unique');
for(const row of stable){assert(Object.isFrozen(row)&&Object.isFrozen(row.actions)&&Object.isFrozen(row.evidence)&&Object.isFrozen(row.unsupportedReasons));assert.deepStrictEqual(Object.keys(row.actions),ACTIONS);for(const action of ACTIONS){assert.strictEqual(row.actions[action],Boolean(row.evidence[action]));if(!row.actions[action])assert(row.unsupportedReasons[action],'every unavailable action has its own visible fail-closed reason');}}
assert(ACTIONS.every(action=>referenceCapability('zss','maps',action).supported),'ZSS map references retain discovery, reveal, completion and native insertion parity');
assert(ACTIONS.every(action=>referenceCapability('ikemen-cns','maps',action).supported)&&ACTIONS.every(action=>referenceCapability('ikemen-cns','constants',action).supported),'legacy CNS/ST now has the same exact-owner map/constant name path');
assert(['helpers','explods','projectiles'].every(category=>ACTIONS.every(action=>referenceCapability('ikemen-cns',category,action).supported)),'legacy lifecycle references now share exact-owner discovery, reveal, completion, and native insertion');
assert(!referenceCapability('lua','states','complete').supported&&/not .*Lua syntax/.test(referenceCapability('lua','states','complete').reason),'unsupported Lua cells fail closed with a grammar reason');
assert(!stable.some(row=>row.nightlyStringDetail),'stable 1.0 exposes no Nightly string reference detail');
assert(!projectReferenceMatrix({target:{channel:'stable',version:'1.0'},nightlyStringsEnabled:true,enabledCapabilities:['zss.runtime-strings']}).some(row=>row.nightlyStringDetail),'an explicit Stable 1.0 target overrides contradictory booleans and capability lists');
assert(!projectReferenceMatrix({nightlyStringsEnabled:true,enabledCapabilities:['zss.runtime-strings']}).some(row=>row.nightlyStringDetail),'ownerless target hints cannot enable Nightly details');
const nightly=projectReferenceMatrix({target:{channel:'nightly',version:'develop'},enabledCapabilities:['zss.runtime-strings']});assert(nightly.filter(row=>row.nightlyStringDetail).every(row=>row.language==='zss'&&['maps','constants','functions'].includes(row.category)));assert(!nightly.find(row=>row.language==='ikemen-cns'&&row.category==='maps').nightlyStringDetail,'portable CNS name completion does not leak Nightly-only value evidence');
assert(!referenceCapability('unknown','maps','complete').supported&&!referenceCapability('zss','unknown','complete').supported&&!referenceCapability('zss','maps','overwrite').supported,'unknown matrix requests fail closed');
assert.strictEqual(typeof browserModel.projectDataProjection,'function');assert.strictEqual(typeof languageProviders.projectNameCompletionContext,'function');assert.strictEqual(typeof languageProviders.functionCallCompletions,'function');assert.strictEqual(typeof languageProviders.stateCompletions,'function');assert.strictEqual(typeof languageProviders.commandNameCompletions,'function');assert.strictEqual(typeof languageProviders.assetCompletions,'function');assert.strictEqual(typeof languageProviders.resourceIdCompletions,'function');
const usedEvidence=new Set(stable.flatMap(row=>ACTIONS.map(action=>row.evidence[action]).filter(Boolean))),declaredEvidence=new Set(Object.values(EVIDENCE));assert.deepStrictEqual([...usedEvidence].sort(),[...declaredEvidence].sort(),'every declared evidence ID is exercised by a real matrix cell and maps to an exported registered path');
console.log('Project reference parity matrix is bounded, explicit, Stable-safe, and gap-oriented');
