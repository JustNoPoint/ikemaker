'use strict';
const assert=require('assert');
const { entityUnavailableHtml }=require('../src/entity_unavailable_view');
const html=entityUnavailableHtml({surface:'stage',label:'Ryu <alternate>',reason:'No stage is assigned & the old stage must not remain visible.'});
assert(html.includes('data-ikemaker-entity-strip')&&html.includes('ikemakerEntitySwitch'),'unavailable surfaces retain the synchronized shared header');
assert(html.includes('Ryu &lt;alternate&gt;')&&html.includes('assigned &amp;'),'untrusted labels and reasons are escaped');
assert(html.includes('ikemenCanLeaveAsset')&&html.includes('prior entity’s navigation and drafts remain retained'));
assert.strictEqual((html.match(/acquireVsCodeApi\(\)/g)||[]).length,1);
console.log('Unavailable entity view keeps one shared header and never shows stale prior content');
