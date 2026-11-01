'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..'),pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')),extension=fs.readFileSync(path.join(root,'src','extension.js'),'utf8'),toolbar=fs.readFileSync(path.join(root,'src','viewer_toolbar.js'),'utf8'),textToolbar=fs.readFileSync(path.join(root,'src','text_editor_toolbar.js'),'utf8'),spatial=fs.readFileSync(path.join(root,'src','spatial_composer_workspace.js'),'utf8'),helper=fs.readFileSync(path.join(root,'src','helper_workspace.js'),'utf8'),service=fs.readFileSync(path.join(root,'src','character_scale_review_service.js'),'utf8');
for(const command of ['ikemen.scaleReview.run','ikemen.scaleReview.toggleMonitoring','ikemen.scaleReview.configureConventions','ikemen.scaleReview.exportConventions','ikemen.scaleReview.importConventions']){
  assert(pkg.activationEvents.includes(`onCommand:${command}`));assert(pkg.contributes.commands.some(item=>item.command===command));
}
assert.strictEqual(pkg.contributes.configuration.properties['ikemenZss.scaleReview.monitoring'].default,false);
assert.match(pkg.contributes.configuration.properties['ikemenZss.scaleReview.monitoring'].description,/never edits or saves/i);
assert.match(extension,/registerCharacterScaleReview\(vscode, context\)/);
assert.match(toolbar,/Run Character Scale Review/);assert.match(toolbar,/Toggle Character Scale Monitoring/);
assert.match(textToolbar,/Run Character Scale Review/);assert.match(textToolbar,/Toggle Character Scale Monitoring/);
assert.match(spatial,/Character Scale Review · read-only preview/);assert.match(spatial,/This preview writes nothing/);assert.match(spatial,/does not replace the current Spatial Composer draft/);
assert.match(spatial,/Scale convention/);assert.match(spatial,/Empty disables the project convention/);assert.match(spatial,/scalePolicy/);
assert.match(helper,/Scale review preview/);assert.match(helper,/does not change the Helper draft or source files/);assert.match(service,/\['helper','projectile','modifyprojectile'\]/);console.log('Scale review commands, default-off settings, shared headers, activation, and read-only Spatial and Helper preview routes are wired');
