'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '../src/move_constants_workspace.js'), 'utf8');
const body = source.slice(source.indexOf('function decorateProjectileModel('), source.indexOf('function currentProjectileRoute('));
let routeNumber = 0;
const sandbox = {
  Map, Set,
  currentTextSync: () => 'projectile { projanim: 600; }',
  projectProjectileProperties: () => ({ status: 'ready', fields: [{ name: 'projanim', animation: true }], groups: [{ id: 'animations', fields: [{ name: 'projanim' }] }], unknown: [], limitations: [] }),
  projectileAuthorityContext: () => ({}),
  projectileAuthoritySnapshot: () => ({}),
  buildProjectSymbolSnapshot: () => null,
  buildProjectileAirAuthorities: () => {
    const route = `route-${++routeNumber}`;
    return { authorities: new Map([[route, { route }]]), publicFields: { projanim: { available: true, route, action: 600 } } };
  },
  buildProjectileResourceAuthorities: () => ({ authorities: new Map(), publicFields: {} }),
  buildProjectileStateAuthorities: () => ({ authorities: new Map(), publicFields: {} }),
  createProjectileEditDraft: () => null,
  require
};
vm.runInNewContext(body, sandbox);

const component = { kind: 'projectile', stableId: 'shot', reference: { id: 'shot' } };
const owner = { projectileGeneration: 7, projectileRoutes: new Map([['hidden-old-route', {}]]), projectileConsumedRoutes: new Set(), projectileEditAuthorities: new Map([['edit-token', {}]]), projectileEditPreviews: new Map() };
const first = { specialistComponents: [component], overview: { specialists: [] } };
sandbox.decorateProjectileModel(owner, first, { renew: false });
assert.strictEqual(owner.projectileGeneration, 7, 'edit republish does not create a new component generation');
assert.deepStrictEqual([...owner.projectileRoutes.keys()], ['route-1']);
assert(owner.projectileEditAuthorities.has('edit-token'), 'AIR route rebuilding does not revoke the separate edit authority');

const second = { specialistComponents: [component], overview: { specialists: [] } };
sandbox.decorateProjectileModel(owner, second, { renew: false });
assert.deepStrictEqual([...owner.projectileRoutes.keys()], ['route-2'], 'each decoration replaces rather than appends AIR routes');
assert(!owner.projectileRoutes.has('route-1') && !owner.projectileRoutes.has('hidden-old-route'), 'hidden earlier AIR routes are revoked');
assert.strictEqual(owner.projectileRoutes.size, 1, 'repeated edit previews keep the route map bounded');

console.log('Move Lab Projectile decoration replaces hidden AIR routes while preserving separate edit authority');
