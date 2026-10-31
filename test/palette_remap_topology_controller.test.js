'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');

const source=fs.readFileSync(path.join(__dirname,'../src/palette_workspace_controller.js'),'utf8');
assert.match(source,/action === 'domainRemapReview'/,'RemapPal edits start at a dedicated reviewed route');
assert.match(source,/type:'paletteDomainRemapReview'/,'the host returns one bounded review payload');
assert.match(source,/action === 'domainRemapApply'/,'RemapPal metadata has a separate apply step');
assert.match(source,/domainTopologyAuthoring\.consume\(message\.reviewToken/,'apply consumes an opaque single-use host token');
assert.match(source,/\['putRemapPalTopology','deleteRemapPalGroup'\]\.includes\(authorized\.operation\.kind\)/,'a token for another topology kind cannot cross into RemapPal apply');
assert.match(source,/action === 'domainRemapRevoke'/,'Cancel explicitly revokes retained review authority');
assert.match(source,/assertSourceCurrent\('before'\)/,'the exact SFF is rechecked at the metadata publication boundary');
assert.match(source,/assertSourceCurrent\}\);/,'registry publication receives the before/after source drift guard');
assert.match(source,/type:'paletteDomainRemapCommittedStale'/,'post-commit SFF drift is reported truthfully as committed stale');
assert.match(source,/activeSffChangedByOperation:false/,'metadata apply never claims to mutate SFF bytes');
assert.match(source,/\['putDomain','putBinding','deleteBinding','deleteDomain','putDomainTopology','putRemapPalGroup','putRemapPalTopology','deleteRemapPalGroup'\]/,'legacy generic metadata route blocks every RemapPal topology mutation');
assert.match(source,/postDomainMatrix\(state,[\s\S]{0,150}domainTopologyAuthoring\.revoke\(state\.filename\)/,'refresh revokes stale range reviews');
assert.match(source,/dispose: \(\) => \{ this\.domainTopologyAuthoring\.revoke\(target\)/,'owner disposal revokes range reviews');

console.log('Palette RemapPal controller uses reviewed one-use CAS routes and truthful post-commit drift reporting');
