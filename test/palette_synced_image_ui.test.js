'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createPaletteWorkspaceSession } = require('../src/palette_workspace_session');
const { sourceHtml } = require('../src/palette_workspace_view');

const target = { filename: path.resolve('palette-images.sff'), byteHash: 'a'.repeat(64), byteLength: 1000 };
const session = createPaletteWorkspaceSession({ sessionId: 'palette-images-ui', target, plan: { filename: path.resolve('palette-images.palette-plan.json'), exists: false, byteHash: 'b'.repeat(64), byteLength: 0 } });
const html = sourceHtml({ session, palettes: [] });
const inline = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];

assert(inline);
assert.doesNotThrow(() => new vm.Script(inline, { filename: 'palette-synced-image-inline.js' }));
for (const label of ['Register & manage palette images', 'Register images…', 'Manage registrations…', 'Review metadata changes', 'Save registrations', 'Metadata only · SFF and image files unchanged', 'Palette images…']) assert.match(html, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
for (const action of ['familyPaletteImagesRegister', 'familyPaletteImagesManage', 'familyPaletteImagePatch', 'familyPaletteImageRelink', 'familyPaletteImagesReview', 'familyPaletteImagesApply', 'familyPaletteImagesDiscard']) assert.match(html, new RegExp(action));
assert.match(html, /committedStale/);
assert.match(html, /Reload required:/);
assert.match(html, /row\?\.kind!=='chosen'/, 'existing palette selection waits for an explicit Enable action');
assert.match(html, /row\.relinkPending\?'relink':'add'/, 'ambiguous relinks preserve their opaque target until an exact candidate is chosen');
assert.match(html, /synced-image-list\{display:grid;grid-template-columns:1fr/);
assert.match(html, /overflow-wrap:anywhere/);
assert.match(html, /@media\(max-width:520px\)/);
assert.match(html, /role=\\?"alert\\?"|role="alert"/);
assert.match(html, /role=\\?"status\\?"|role="status"/);
assert.doesNotMatch(html, /post\('familyPaletteImagePatch',[^\n]{0,300}(registrationId|physicalIndex|coordinate|displayPath)/, 'browser mutations stay opaque and do not submit authoritative file or palette identity');

const controller = fs.readFileSync(path.join(__dirname, '..', 'src', 'palette_workspace_controller.js'), 'utf8');
assert.match(controller, /new PaletteSyncedImageAuthoring\(\)/);
assert.match(controller, /picked\.length>256/);
assert.match(controller, /currentSyncedImageTemplate/);
assert.match(controller, /templateByteHash===authority\.byteHash/);
assert.match(controller, /indexPlaneHash===authority\.indexPlaneHash/);
assert.match(controller, /paletteHash===authority\.paletteHash/);
assert.match(controller, /familyPlanHash===plan\.planHash/);
assert.match(controller, /this\.syncedImageAuthoring\.dispose\(target\)/);
assert.match(controller, /error\.committed===true/);
assert.match(controller, /relinkTargets/);
assert.match(controller, /familyPaletteImagesDiscard[\s\S]{0,500}committedStale:Boolean\(state\.paletteImages\?\.committedStale\)/, 'discarding a draft cannot clear the reload-required committed warning');
assert.match(controller, /metadataOnly:true/);
assert.doesNotMatch(controller, /familyPaletteImages(?:Register|Manage|Review|Apply)[\s\S]{0,900}(transactionalWrite|writeFileSync)/, 'registration routes do not directly write SFF or image bytes');

console.log('Palette-image registration UI is guided, narrow, accessible, opaque, exact-template-bound, and metadata-only');
