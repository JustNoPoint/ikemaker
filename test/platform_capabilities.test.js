'use strict';

const assert = require('assert');
const { detectCapabilities, capabilitySummary, missingCapabilityMessage } = require('../src/platform_capabilities');
const packageJson = require('../package.json');

const windows = detectCapabilities({ uiKind: 'desktop', platform: 'win32' });
assert.strictEqual(windows.nativeBuilders, true);
assert.strictEqual(windows.ikemenLaunch, true);

const androidLocal = detectCapabilities({ uiKind: 'desktop', platform: 'linux', environment: { ANDROID_ROOT: '/system' } });
assert.strictEqual(androidLocal.android, true);
assert.strictEqual(androidLocal.localFileSystem, true);
assert.strictEqual(androidLocal.nativeBuilders, false);
assert.strictEqual(androidLocal.ikemenLaunch, false);

const iphone = detectCapabilities({ uiKind: 'web', platform: 'unknown', userAgent: 'Mozilla/5.0 (iPhone)' });
assert.strictEqual(iphone.ios, true);
assert.strictEqual(iphone.processExecution, false);
assert.strictEqual(iphone.archiveParsing, false);
assert(capabilitySummary(iphone).unavailable.includes('SFF/SND archive parsing in this browser build'));
assert(capabilitySummary(iphone).unavailable.includes('IKEMEN launch from the extension'));
assert(missingCapabilityMessage('Training launch', iphone).includes('iPhone/iPad'));

const shortcuts = new Map(packageJson.contributes.keybindings.map((item) => [item.command, item.key]));
assert.strictEqual(shortcuts.get('ikemen.launchGame'), 'ctrl+alt+f5');
assert.strictEqual(shortcuts.get('ikemen.launchMirrorCurrent'), 'ctrl+alt+f6');
assert.strictEqual(shortcuts.get('ikemen.launchTrainingCurrent'), 'ctrl+alt+f7');
const visualMenus = packageJson.contributes.menus['webview/title'];
assert(visualMenus.some((item) => item.command === 'ikemen.launchGame' && item.when.includes('webviewId')));
assert(visualMenus.some((item) => item.command === 'ikemen.launchMirrorCurrent' && item.when.includes('webviewId')));
assert(visualMenus.some((item) => item.command === 'ikemen.launchTrainingCurrent' && item.when.includes('webviewId')));
const customEditorMenus = packageJson.contributes.menus['editor/title'];
for (const command of ['ikemen.launchGame', 'ikemen.launchMirrorCurrent', 'ikemen.launchTrainingCurrent']) {
  assert(customEditorMenus.some((item) => item.command === command && item.when.includes('ikemen.sffWorkspace') && item.when.includes('ikemen.sndWorkspace')));
}

console.log('Platform capability tests passed');
