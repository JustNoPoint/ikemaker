'use strict';

const assert = require('assert');
const manifest = require('../package.json');
const submenus = manifest.contributes.submenus || [], menus = manifest.contributes.menus || {};
assert(submenus.some(item => item.id === 'ikemen.text.context' && item.label === 'IKEMaker'), 'every supported editor uses one named IKEMaker root submenu');
for (const id of ['ikemen.text.navigate','ikemen.text.edit','ikemen.text.preview','ikemen.text.safety','ikemen.text.tools','ikemen.text.project']) assert(submenus.some(item => item.id === id), `missing cohesive text-editor category ${id}`);
const categoryCommands = ['ikemen.text.navigate','ikemen.text.edit','ikemen.text.preview','ikemen.text.safety','ikemen.text.tools','ikemen.text.project'].flatMap(id => (menus[id] || []).map(item => item.command).filter(Boolean));
for (const command of ['zss.contextualRecommendations', 'ikemen.maps.openBrowser', 'zssStructures.browse', 'zss.audit.currentFile', 'ikemen.textActions.open', 'ikemen.textToolbar.toggleCompanion']) assert(categoryCommands.includes(command), `${command} remains available inside the cohesive editor menus`);
assert(categoryCommands.includes('ikemen.air.openSelectedAnimationReference'), 'exact selected-expression AIR navigation is available through the cohesive Navigate menu');
const editor = menus['editor/context'] || [];
assert.deepStrictEqual(editor.map(item => item.submenu || item.command), ['ikemen.text.context'], 'supported text editors get one IKEMaker root menu instead of a wall of direct actions');
assert(editor[0].when.includes('ikemen.activeTextSupported') && editor[0].when.includes('textToolbar.contextMenus'), 'the root menu respects classification and user settings');
assert(!Object.keys(menus).some(key => /webview/i.test(key) && (menus[key] || []).some(item => item.command === 'ikemen.authoring.browseFunctions')), 'function browsing adds no viewer toolbar or context button');
assert(!Object.keys(menus).some(key => /webview/i.test(key) && (menus[key] || []).some(item => item.command === 'zss.contextualRecommendations')), 'contextual recommendations add no viewer control');
console.log('ZSS editor actions are consolidated without cluttering viewers');
