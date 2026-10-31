'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const view = fs.readFileSync(path.join(root, 'src', 'palette_workspace_view.js'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'src', 'palette_workspace_controller.js'), 'utf8');

assert.match(view, /Preview palette on an AIR animation/, 'Palette Workshop must expose AIR palette previews directly');
assert.match(view, /paletteAnimationSelect/, 'Palette Workshop must expose the full neighboring AIR action chooser');
assert.match(view, /paletteAnimationReplay/, 'Palette Workshop must replay an animation with the selected palette');
assert.match(view, /openPaletteAnimation/, 'Palette Workshop must open the chosen action in AIR Viewer');
assert.match(view, /openPaletteEffects/, 'Palette Workshop must provide a PalFX route beside palette animation tools');
assert.match(view, /does not write a palette assignment into the AIR file/, 'Preview-only AIR semantics must be visible to the user');
assert.match(view, /draw\(\);renderPaletteAnimationPreview\(host,selected\)/, 'Animation palette preview must live in Palette List & Thumbnails, not Palette Library');
assert.match(view, /message\.palette\?\.physicalIndex\)!==selectedPhysical/, 'Late frames from a stale palette must be rejected');
assert.match(view, /Math\.max\(1,Math\.min\(600/, 'Loop, infinite, and invalid times must not stall thumbnail animation');
assert.match(controller, /nearbyAirAnimations\(state\.filename\)/, 'Animation choices must be discovered without requiring SFF Browser to open first');
assert.match(controller, /matches\.length!==1/, 'Duplicate group,index sprite references must never be selected arbitrarily');
assert.match(controller, /type:'paletteWorkspaceAnimationFrames'/, 'The controller must return palette-rendered animation frames to Workshop');
assert.match(controller, /action==='openPaletteEffects'/, 'The Workshop controller must own the PalFX route');
assert.match(view, /if\(sectionNodes\.size&&sections\.querySelector\(':scope > \.palette-desk'\)\)return/, 'State refreshes must not rebuild and destroy the arranged Workshop sections');
assert.match(view, /target\.focus\(\{preventScroll:true\}\);libraryFocusPending=false/, 'Palette Library focus restoration must not move the viewport');
assert.match(view, /sectionDisclosureState=new Map\(\)/, 'Workshop must retain disclosure state for every collapsible section');
assert.match(view, /details\.addEventListener\('toggle',\(\)=>\{if\(details\.isConnected\)sectionDisclosureState\.set\(id,details\.open\)\}/, 'Only connected shared sections record user open and close actions');
assert.match(view, /sectionDisclosureState\.has\(id\)\?sectionDisclosureState\.get\(id\):id===preferredSection/, 'Workflow routing must not immediately undo a user section toggle');
assert.match(view, /if\(!shellReady\)\{sections\.textContent=''/, 'Host refreshes retain native disclosure targets instead of destroying them mid-click');
assert.match(view, /if\(!shellReady\)arrangeWorkspace\(\)/, 'Host refreshes do not re-run navigation or reopen collapsed sections');

console.log('Palette Workshop animation parity tests passed');
