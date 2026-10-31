'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');

const controller=fs.readFileSync(path.join(__dirname,'..','src','palette_workspace_controller.js'),'utf8');
const view=fs.readFileSync(path.join(__dirname,'..','src','palette_workspace_view.js'),'utf8');

assert.match(controller,/return \{selected,required,byImage\}/,'template coverage retains the intake-derived color sets for reuse');
assert.match(controller,/coverageFor=imageId=>[\s\S]{0,700}safeToRemove:unique\.length===0/,'layout items receive exact shared/unique removal coverage without rescanning on right-click');
assert.match(controller,/coverage:coverageFor\(item\.imageId\)/,'coverage travels with each imported template layer');
assert.match(view,/Safe to remove: all [\s\S]{0,220}also appear in other template images/,'right-click explains safe removal before the user deletes');
assert.match(view,/Removal warning: [\s\S]{0,260}only in this image/,'right-click previews the warning condition without invoking deletion');
assert.match(view,/Remove from Template \(safe\)/,'safe layers receive an explicit menu label');

console.log('Template image context menu reuses retained coverage to distinguish safe and warning removals');
