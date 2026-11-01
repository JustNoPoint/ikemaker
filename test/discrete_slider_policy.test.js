'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = name => fs.readFileSync(path.join(__dirname, '..', 'src', name), 'utf8');
const sff = source('sff_quick_controls.js');
const viewer = source('sff_viewer.js');
const snd = source('snd_viewer.js');
const air = source('air_viewer.js');
const browser = source('air_docking_workspace.js');
const pinned = source('viewer_sources.js');

assert(sff.includes("sourceScroll.cloneNode(true);sourceScroll.remove();oldScroll.replaceWith(scroll)"), 'SFF position navigation must discard all legacy slider handlers');
assert(sff.includes("scroll.addEventListener('input',event=>showPosition") && sff.includes("scroll.addEventListener('change',event=>choosePosition"), 'SFF position input previews while change commits');
assert(!sff.includes('requestAnimationFrame(flushPosition)'), 'SFF dragging must not schedule intermediate full selections');
assert(viewer.includes("onionSpriteControl.oninput=e=>{onionIndex=Number(e.target.value);updateOnionReadout()}") && viewer.includes('onionSpriteControl.onchange=e=>'), 'SFF onion navigation must request only the released sprite');
assert(snd.includes('soundPosition.oninput=()=>showSoundPosition') && snd.includes('soundPosition.onchange=()=>'), 'SND archive navigation keeps the safe preview/commit contract');
assert(air.includes('compactActionScroll.oninput=event=>') && air.includes('compactActionScroll.onchange=event=>') && air.includes('compactFrameScroll.onchange=event=>'), 'AIR action and frame selection use the safe contract');
assert(browser.includes('collisionElementInput.oninput=()=>{const preview=') && browser.includes('collisionElementInput.onchange=()=>{collisionElement='), 'AIR collision frame navigation previews cheaply and commits once');
assert(browser.includes('transformAngle.oninput=()=>{transformAngleNumber.value=transformAngle.value};transformAngle.onchange=changedTransform'), 'AIR transform angle waits for release before requesting a host preview');
assert(pinned.includes('fileSlider.oninput=()=>previewFilePosition') && pinned.includes('fileSlider.onchange=()=>'), 'Pinned-source navigation previews cheaply and opens one final file');

console.log('discrete navigation sliders preview cheaply and commit once');
