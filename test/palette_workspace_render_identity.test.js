'use strict';
const assert = require('assert');
const { paletteWorkspaceRenderIdentity } = require('../src/palette_workspace_view');
const session = {
  sessionId: 'source-session', revision: 42,
  context: { kind: 'collective-source', section: 'sources-preflight' },
  collective: { inventoryHash: '1502-image-inventory' }
};
// A large real image session has thousands of sources and color entries. The
// refresh identity must not enumerate/read either inventory at all.
Object.defineProperty(session, 'sources', { enumerable: true, get() { throw new Error('Traversed image inventory'); } });
Object.defineProperty(session.collective, 'colorIds', { enumerable: true, get() { throw new Error('Traversed color inventory'); } });
const first = paletteWorkspaceRenderIdentity(session, 'model-1');
for (let index = 0; index < 1502; index++) assert.strictEqual(paletteWorkspaceRenderIdentity(session, 'model-1'), first);
assert(first.length < 200, 'render identity remains bounded independently of image count');
session.revision++;
assert.notStrictEqual(paletteWorkspaceRenderIdentity(session, 'model-1'), first, 'semantic session mutations refresh');
assert.notStrictEqual(paletteWorkspaceRenderIdentity(session, 'model-1'), paletteWorkspaceRenderIdentity(session, 'model-2'), 'model-only changes refresh');
console.log('Palette Workshop bounded render identity: inventories are never traversed.');
