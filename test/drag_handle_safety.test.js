'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = (name) => fs.readFileSync(path.join(__dirname, '..', 'src', name), 'utf8');

const constants = source('move_constants_workspace.js');
assert.match(constants, /valueX:spark\.x,valueY:spark\.y/);
assert.match(constants, /sparkX:spark\?\.valueX,sparkY:spark\?\.valueY/);
assert.doesNotMatch(constants, /sparkX:spark\?\.x,sparkY:spark\?\.y/);
assert.match(constants, /id='findSpark'/);
assert.match(constants, /canvas\.onlostpointercapture/);

const hitdef = source('hitdef_workspace.js');
assert.match(hitdef, /spark:spark\?\.values/);
assert.match(hitdef, /id='findSpark'/);
assert.match(hitdef, /canvas\.onlostpointercapture/);

const helper = source('helper_workspace.js');
assert.match(helper, /id="previewFind"/);
assert.match(helper, /canvas\.onlostpointercapture/);

const spatial = source('spatial_composer_workspace.js');
assert.match(spatial, /id="findMarker"/);
assert.match(spatial, /c\.onpointercancel=end;c\.onlostpointercapture=end/);

const throws = source('throw_creator_workspace.js');
assert.match(throws, /id='findP2'/);
assert.match(throws, /onlostpointercapture=endDrag/);

const air = source('air_viewer.js');
assert.match(air, /onlostpointercapture=end/);

const stage = source('stage_workspace.js');
assert.match(stage, /window\.onmousemove/);
assert.match(stage, /window\.onmouseup/);
assert.match(stage, /id="reset"/);

console.log('Drag handle coordinate and recovery safety tests passed');
