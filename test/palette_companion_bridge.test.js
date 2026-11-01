'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');

const browser=fs.readFileSync(path.join(__dirname,'..','src','palette_workshop_browser.js'),'utf8');
const controller=fs.readFileSync(path.join(__dirname,'..','src','palette_workspace_controller.js'),'utf8');
const client=fs.readFileSync(path.join(__dirname,'..','src','palette_dual_bank_client.js'),'utf8');
const registration=fs.readFileSync(path.join(__dirname,'..','src','player_palette_workspace.js'),'utf8');

assert(browser.indexOf('class="image-tools"')<browser.indexOf('role="tablist" aria-label="Palette Workshop control panes"'),'companion pane tabs sit below the image tools');
for(const pane of ['banks','remap','layers','masks'])assert(browser.includes(`data-companion-pane=\\"${pane}\\"`)||browser.includes(`data-companion-pane="${pane}"`),`companion includes a ${pane} mirror pane`);
assert.match(browser,/type:'bridgeAction'/,'companion actions use the bridge instead of owning a second palette draft');
assert.match(browser,/pointerdown','pointermove','pointerup','pointercancel'/,'the mirrored rectangular color picker forwards complete pointer gestures');
assert.match(browser,/xRatio:.*yRatio:/,'canvas pointer coordinates are normalized before crossing webviews');
assert.match(client,/paletteCompanionBridgeSnapshot/,'the authoritative Palette Workshop serializes the mirrored panes');
assert.match(client,/item\.dataset\.paletteBridgeKey=pane\+'\:'\+\(\+\+sequence\)/,'every snapshot deterministically rekeys all live controls');
assert.match(client,/const selected=index===item\.selectedIndex;target\.options\[index\]\.selected=selected/,'selected options are serialized from live DOM properties');
assert.match(client,/target\.toggleAttribute\('checked',item\.checked\)/,'checkbox state is serialized from the live property');
assert.match(client,/eventName\.startsWith\('pointer'\).*target\.tagName==='CANVAS'/,'the owner executes canvas pointer gestures against the authoritative color picker');
assert.match(client,/requestAnimationFrame\(\(\)=>requestAnimationFrame\(publishPaletteCompanionBridge\)\)/,'the mirror snapshot waits through owner refresh scheduling');
assert.match(client,/eventName!==['"]input['"]/,'live slider input updates the owner without rebuilding the companion and snapping its scroll position');
assert.match(browser,/const pageX=scrollX,pageY=scrollY/,'companion snapshots preserve the current page scroll position');
assert.match(browser,/focus\(\{preventScroll:true\}\)/,'companion snapshots restore the active mirrored control without browser auto-scroll');
assert.match(controller,/paletteCompanionBridgeSnapshot.*deliverBridge/,'owner snapshots are relayed to the matching Palette companion');
assert.match(controller,/async invokeCompanionControl\(uri,action=\{\}\)/,'companion actions are sent to the single target panel');
assert.match(registration,/ikemen\.palette\.companionControl/,'the private owner-executed bridge command is registered');

console.log('Palette companion mirrors owner controls without creating a second mutable draft');
