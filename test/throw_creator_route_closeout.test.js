'use strict';

const assert = require('assert');
const { CONTROL_ROUTES, sourceControlInventory } = require('../tools/generate_all_screen_control_route_matrix');

const throwRoutes = CONTROL_ROUTES.filter(row => row.surface === 'code.throw');
const routeIds = throwRoutes.map(row => row.control);
assert.strictEqual(new Set(routeIds).size, routeIds.length, 'Throw Creator route rows do not duplicate stable control identities');

const inventory = sourceControlInventory();
const surface = inventory.bySurface.find(item => item.surface === 'code.throw');
assert(surface, 'Throw Creator remains a registered surface');
assert.deepStrictEqual({ discovered: surface.discovered, audited: surface.audited, pending: surface.pending }, { discovered: 76, audited: 76, pending: 0 });

const controls = inventory.controls.filter(item => item.surface === 'code.throw');
assert.strictEqual(controls.length, 76);
assert(controls.every(item => item.status === 'audited'), 'every discovered Throw Creator control has a traced or classified route');
assert(controls.every(item => item.handler && item.destination && item.context && item.availability && item.visibleReason && item.evidence), 'every Throw Creator candidate records complete route/state evidence');

for (const id of ['p1Action', 'p2Action', 'p1ActionList', 'p2ActionList', 'p1ActionSlider', 'p2ActionSlider']) {
  assert.strictEqual(controls.find(item => item.control === id)?.handler, 'throw_creator_workspace.js: action selector → changeActions/actionNavigate host route');
}
for (const id of ['character', 'planTitle', 'viewZoomValue', 'tickReadout']) {
  assert.strictEqual(controls.find(item => item.control === id)?.disposition, 'presentation-region');
}
assert.strictEqual(controls.find(item => item.control === 'canvas')?.disposition, 'pointer-interaction-review-pending');

console.log('Throw Creator route inventory truthfully closes all 76 discovered candidates with shared aliases and physical-QA boundaries intact');
