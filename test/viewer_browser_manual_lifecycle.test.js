'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const source=name=>fs.readFileSync(path.join(__dirname,'..','src',name),'utf8');
const airViewer=source('air_viewer.js'),sffViewer=source('sff_viewer.js'),airBrowser=source('air_docking_workspace.js'),sffBrowser=source('sff_browser.js'),sndBrowser=source('snd_browser.js');
assert(/docking\.open\(vscode\.Uri\.file\(session\.airPath\),\s*\{\s*autoFloat:\s*false/.test(airViewer),'AIR source-return setup must not automatically float the browser');
assert(/message\.type === 'openCollisionBrowser'[^\n]+autoFloat:\s*true/.test(airViewer),'explicit AIR viewer browser icons request the usable floating browser');
assert(!/sff\.openBrowser[^\n]+autoFloat\s*:\s*true/.test(sffViewer),'SFF viewer must not auto-open or auto-float its browser');
for(const [kind,text] of [['AIR',airBrowser],['SFF',sffBrowser]]){
  assert(text.includes('async function toggle('),`${kind} browser must expose one open/close toggle`);
  assert(text.includes(".panel.dispose()")||text.includes('panel.dispose()'),`${kind} browser toggle must close the existing owned panel`);
  assert(/return open\(uri,\s*\{\s*autoFloat:\s*true\s*\}\)/.test(text),`${kind} browser manual toolbar/viewer launch must open in float mode`);
  assert(text.includes('createMinimumWidthController')&&text.includes('companionBrowserViewport'),`${kind} browser must request the shared minimum usable opening width`);
}
assert(sndBrowser.includes('async function browseLists(')&&sndBrowser.includes('autoFloat: !existing'),'SND list browsing manually opens one floating companion and reuses its existing panel');
assert(airBrowser.includes("registerCommand('air.toggleBrowser'")&&sffBrowser.includes("registerCommand('sff.toggleBrowser'"),'both browser toggles must be registered commands');
for(const text of [airBrowser,sndBrowser])assert(text.includes('ikemaker.companionBrowserWidth.v2.')&&text.includes('resizeActiveAuxiliaryWindowBy'),'AIR and SND floating browsers retain their current width preference and native auxiliary-window adapter');
assert(sffBrowser.includes('ikemaker.companionBrowserWidth.v3.sff')&&sffBrowser.includes('resizeActiveAuxiliaryWindowBy'),'SFF resets the previously broken wide preference once, then remembers deliberate resizing through the native adapter');
assert(airBrowser.includes('waitForWorkbenchRestoreSettled(vscode)'),'a cold-restored AIR browser waits until the owning IKEMaker window topology is quiet');
for(const text of [sffBrowser,sndBrowser])assert(text.includes('createBrowserReadinessController')&&text.includes('record.readiness.wait()'),'manual browser float routes wait for their owning renderer and rehydrate after the move');
console.log('SFF and AIR browsers remain explicit character-bound tools; manual toolbar/viewer launches float and existing panels close');
