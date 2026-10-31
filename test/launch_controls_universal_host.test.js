'use strict';

const assert = require('assert');
const Module = require('module');
const { MESSAGE_TYPE } = require('../src/universal_toolbar_webview');
const originalLoad = Module._load;
const commands = [], connected = [], information = [];
const vscode = { Uri: { file: fsPath => ({ fsPath }) }, commands: { executeCommand: async (...args) => commands.push(args) }, window: { showInformationMessage: async message => information.push(message) } };
Module._load = function patched(request, parent, main) { if (request === 'vscode') return vscode; if(request === './viewer_navigation')return{openConnected:async(...args)=>connected.push(args),currentPoint:()=>({kind:'sff'})};return originalLoad.call(this, request, parent, main); };
const launch = require('../src/launch_controls');

(async () => {
  try {
    assert.strictEqual(await launch.handleLaunchMessage({ type: MESSAGE_TYPE, slotId: 'help', command: 'forged' }, 'C:/game/chars/Ryu/Ryu.sff', 'sff'), true);
    assert.deepStrictEqual(commands, [], 'extra client dispatch identity is rejected');
    await launch.handleLaunchMessage({ type: MESSAGE_TYPE, slotId: 'help' }, 'C:/game/chars/Ryu/Ryu.sff', 'sff');
    assert.strictEqual(commands.at(-1)[0], 'ikemen.help.open');
    await launch.handleLaunchMessage({ type: MESSAGE_TYPE, slotId: 'save' }, 'C:/game/chars/Ryu/Ryu.sff', 'sff');
    assert.strictEqual(commands.length, 1, 'disabled primary coordinates cannot become an alternate save route');
    await launch.handleLaunchMessage({ type: MESSAGE_TYPE, slotId: 'new' }, 'C:/game/chars/Ryu/Ryu.sff', 'sff');
    assert.strictEqual(commands.at(-1)[0], 'sff.createNew');
    await launch.handleLaunchMessage({ type: MESSAGE_TYPE, slotId: 'text-source' }, 'C:/game/chars/Ryu/Ryu.sff', 'sff');
    assert.strictEqual(connected.at(-1)[1], 'source', 'asset Text Editor Viewer resolves a connected source through the integrated source route');
    await launch.handleLaunchMessage({ type: MESSAGE_TYPE, slotId: 'viewer-browser' }, 'C:/game/chars/Ryu/Ryu.sff', 'sff');
    assert.strictEqual(commands.at(-1)[0], 'sff.browseLists', 'SFF Viewer Browser opens or focuses the SFF browser without toggling it closed');
    await launch.handleLaunchMessage({ type: MESSAGE_TYPE, slotId: 'viewer-browser' }, 'C:/game/chars/Ryu/Ryu.air', 'air');
    assert.strictEqual(commands.at(-1)[0], 'air.browseLists', 'AIR Viewer Browser opens or focuses the AIR browser without toggling it closed');
    await launch.handleLaunchMessage({ type: MESSAGE_TYPE, slotId: 'viewer-browser' }, 'C:/game/chars/Ryu/Ryu.sff', 'palette');
    assert.strictEqual(commands.at(-1)[0], 'ikemen.palette.openCompanion', 'SFF-backed Palette Workshop Viewer Browser opens its own companion instead of the generic SFF browser');
    const beforeStandalone=commands.length;await launch.handleLaunchMessage({ type: MESSAGE_TYPE, slotId: 'viewer-browser' }, '', 'palette');assert.strictEqual(commands.length,beforeStandalone,'untitled palette scratch does not open an unrelated SFF picker');assert.match(information.at(-1),/connected to an SFF archive/,'untitled palette scratch explains why sprite browsing is unavailable');
    await launch.handleLaunchMessage({ type: MESSAGE_TYPE, slotId: 'versus', setup: true }, 'C:/game/chars/Ryu/Ryu.air', 'air');
    assert.deepStrictEqual(commands.at(-1), ['ikemen.quickLaunch.openSetup', 'versus'], 'Quick VS right click opens setup without launching');
    await launch.handleLaunchMessage({ type: MESSAGE_TYPE, slotId: 'training', setup: true }, 'C:/game/chars/Ryu/Ryu.air', 'air');
    assert.deepStrictEqual(commands.at(-1), ['ikemen.quickLaunch.openSetup', 'training'], 'Training right click opens the matching setup');
    await launch.handleLaunchMessage({ type: MESSAGE_TYPE, slotId: 'updates' }, 'C:/game/chars/Ryu/Ryu.air', 'air');
    assert.deepStrictEqual(commands.at(-1), ['ikemen.updates.checkAll'], 'Updates left click checks both shared update sources from legacy asset headers');
    await launch.handleLaunchMessage({ type: MESSAGE_TYPE, slotId: 'updates', configure: true }, 'C:/game/chars/Ryu/Ryu.air', 'air');
    assert.deepStrictEqual(commands.at(-1), ['ikemen.updates.configureFrequency'], 'Updates right click opens the shared update policy chooser');
    await launch.handleLaunchMessage({ type: MESSAGE_TYPE, slotId: 'help', disposition: 'beside' }, 'C:/game/chars/Ryu/Ryu.sff', 'sff');
    assert.deepStrictEqual(commands.slice(-2).map(call=>call[0]), ['ikemen.help.open','workbench.action.moveEditorToRightGroup'], 'right click opens the destination first, then places it beside the current editor');
    await launch.handleLaunchMessage({ type: MESSAGE_TYPE, slotId: 'palettes', disposition: 'beside' }, 'C:/game/chars/Ryu/Ryu.sff', 'sff');
    assert.deepStrictEqual(commands.slice(-2).map(call=>call[0]), ['ikemen.palette.openWorkspace','workbench.action.moveEditorToRightGroup'], 'Palette Workshop still supports the explicit side-by-side placement after its safe visual-workspace startup');
    await launch.handleLaunchMessage({ type: MESSAGE_TYPE, slotId: 'palettes', disposition: 'window' }, 'C:/game/chars/Ryu/Ryu.sff', 'sff');
    assert.deepStrictEqual(commands.slice(-2).map(call=>call[0]), ['ikemen.palette.openWorkspace','workbench.action.moveEditorToNewWindow'], 'Palette Workshop still supports moving its newly focused tab into a new window');
    await launch.handleLaunchMessage({ type: MESSAGE_TYPE, slotId: 'help', disposition: 'close-window' }, 'C:/game/chars/Ryu/Ryu.sff', 'sff');
    assert.strictEqual(commands.at(-1)[0], 'workbench.action.closeWindow', 'close-window does not invoke the toolbar destination');
    console.log('Legacy launch consumers use the strict universal-v1 host envelope and closed routes');
  } finally { Module._load = originalLoad; }
})().catch(error => { Module._load = originalLoad; console.error(error); process.exitCode = 1; });
