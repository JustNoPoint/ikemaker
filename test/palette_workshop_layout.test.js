'use strict';

const assert = require('assert');
const { definition, mainClientScript, styles } = require('../src/palette_workshop_layout');

const layout = definition();
assert.deepStrictEqual(layout.sections.map(section => section.id), [
  'start', 'sources', 'plan', 'embedded', 'references', 'user', 'integrity', 'advanced', 'preview-defaults'
], 'task choice must precede the normal source-to-build workflow and specialist palette tools');
assert.strictEqual(layout.labels.stageLibraryPalette, 'Stage Selected Palettes…');
assert.strictEqual(layout.labels.reviewStagedPalettes, 'Review Staged Palette Plan…');
assert.strictEqual(layout.labels.finishPaletteBuild, 'Build & Verify Reviewed Plan…');
assert.strictEqual(layout.labels.replacePalette, 'Replace Selected Embedded Palette from ACT…');
assert(layout.directWriteActions.includes('savePaletteEdits'));
assert(layout.directWriteActions.includes('replacePalette'));
assert(!layout.advancedActions.some(action => layout.directWriteActions.includes(action)), 'direct writes and advanced tools must not share a group');

const client = mainClientScript();
for (const section of layout.sections) assert(client.includes(section.id), `main layout omits ${section.id}`);
assert(client.indexOf("makeSection('sources'") < client.indexOf("makeSection('embedded'"), 'build sources must render before embedded editing');
assert(client.includes('flow.append(startSection.details,sourceSection.details,planSection.details,embeddedSection.details)'), 'focus order must begin with task choice, then sources, plan, and embedded inspector');
assert(client.includes('Direct Changes to Embedded SFF'));
assert(client.includes('active SFF unchanged') || client.includes('choose one or more build sources'));
assert(client.includes('panel.hidden=true'), 'the main SFF viewer must retain only a hidden authoritative palette owner');
assert(client.includes("command:'ikemen.palette.openWorkspace'"), 'the main palette entry must route to the dedicated Palette Workshop');
assert(client.includes("document.getElementById('right1')"), 'the duplicated main SFF inspector rail must be collapsed');
assert(client.includes("visibility.right1=false"), 'the hidden inspector must release its main-viewer width');
assert(client.includes("document.getElementById('right2')"), 'the remaining main SFF guidance rail must be collapsed');
assert(client.includes("visibility.right2=false"), 'the hidden guidance rail must release its main-viewer width');
for (const control of ['Sprite Controls','Name or comment','Group','Index','X axis','Y axis','Show transparency color','Onion skin','Reference sprite']) assert(client.includes(control), `compact SFF rail omits ${control}`);
assert(styles().includes('@media(min-width:900px)'), 'wide/floating layout needs a responsive two-column flow');
assert(styles().includes('.compact-icon-bar>button{box-sizing:border-box;width:28px!important;height:28px!important'), 'SFF compact controls must be sized in the nonce-authorized shared stylesheet');
assert(mainClientScript().includes("paletteTab.textContent='Open Palette Workshop'")&&mainClientScript().includes("command:'ikemen.palette.openWorkspace'"),'the SFF palette shortcut must open the dedicated Palette Workshop, not the comparison browser');

console.log('Palette Workshop shared hierarchy tests passed');
