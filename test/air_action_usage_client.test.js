'use strict';
const assert = require('assert'), vm = require('vm'), Module = require('module');
const original = Module._load; Module._load = function (request, parent, main) { if (request === 'vscode') return {}; return original.call(this, request, parent, main); };
const { viewerHtml } = require('../src/air_viewer'); Module._load = original;

const html = viewerHtml({ title: 'Hero.air', airPath: 'Hero.air', sffPath: '', palettes: [], sourceFiles: [], sourceFindings: [], referenceSummaries: { 200: { available: true, empty: false, exact: 1, unresolved: 0, animationOmitted: 0, sameState: 2, conditional: 1, collisionOmitted: 0, uncertainWholeCharacter: 1 } }, actions: [{ number: 200, line: 1, frames: [{ group: 0, index: 0, x: 0, y: 0, rawTime: 1, flags: '', line: 2, clsn1: [], clsn2: [] }] }] });
assert(html.includes('id="actionReferences"') && html.includes('id="exactUseSummary"') && html.includes('id="referenceCaveat"'));
assert(html.includes('id="openAnimationReferences"') && html.includes('id="openCollisionReferences"'));
assert(!html.includes('id="exactUses"'), 'the main AIR viewer no longer duplicates the full exact-use list from the shared References browser');
assert(html.indexOf('References') < html.indexOf('Additional collision hints (heuristic)'), 'exact References summary remains visibly separate from heuristic findings');
assert(html.includes("type:'openReferences',action:action?.number,referenceView:'animations'"));
assert(html.includes("type:'openReferences',action:action?.number,referenceView:'collision'"));
assert(!html.includes("type:'openExactActionUse',filename:"), 'the client cannot mint source identity');

const script = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)][0][1];
function functionSource(name) { const start = script.indexOf(`function ${name}(`), open = script.indexOf('{', start); let depth = 0; for (let at = open; at < script.length; at += 1) { if (script[at] === '{') depth += 1; if (script[at] === '}' && --depth === 0) return script.slice(start, at + 1); } throw new Error(`missing ${name}`); }
function element() { return { textContent: '', onclick: null }; }
const roots = new Map([['exactUseSummary', element()], ['referenceCaveat', element()], ['openAnimationReferences', element()], ['openCollisionReferences', element()], ['inspectCollisions', element()]]), messages = [];
const context = { model: { referenceSummaries: { 200: { available: true, empty: false, exact: 1, unresolved: 0, animationOmitted: 0, sameState: 2, conditional: 1, collisionOmitted: 0, uncertainWholeCharacter: 1 } } }, action: { number: 200 }, frameIndex: 0, indexedGroup: 'Clsn2', selectedIndexedRecord: () => null, document: { getElementById: id => roots.get(id) }, vscode: { postMessage: message => messages.push(message) } };
vm.createContext(context); vm.runInContext(functionSource('renderExactUses'), context); context.renderExactUses();
assert.match(roots.get('exactUseSummary').textContent, /animation 1 exact \/ 0 unresolved/);
assert.match(roots.get('exactUseSummary').textContent, /related collision 2 same-state \/ 1 conditional/);
assert.match(roots.get('referenceCaveat').textContent, /not proof/);
assert.match(roots.get('referenceCaveat').textContent, /1 uncertain whole-character/);

const routeStart = script.indexOf("document.getElementById('openAnimationReferences').onclick="), routeEnd = script.indexOf('function current()', routeStart);
assert(routeStart >= 0 && routeEnd > routeStart, 'compact References routes must be bound');
vm.runInContext(script.slice(routeStart, routeEnd), context);
roots.get('openAnimationReferences').onclick(); roots.get('openCollisionReferences').onclick();
assert.deepStrictEqual(JSON.parse(JSON.stringify(messages)), [
  { type: 'openReferences', action: 200, referenceView: 'animations' },
  { type: 'openReferences', action: 200, referenceView: 'collision' }
]);
console.log('air_action_usage_client compact References summary and shared-browser routes passed');
