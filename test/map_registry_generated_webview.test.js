'use strict';

const assert = require('assert');
const { progressiveBrowserHtml } = require('../src/map_registry_ui');

const html = progressiveBrowserHtml({ root: 'C:/game', def: 'C:/game/Ryu.def', partial: false, defaultScope: 'assigned', scopes: [], entries: [], detail: '' }, null);
const match = html.match(/\.split\((\/[^\n]+?\/)\)\.filter\(Boolean\)/);
assert.ok(match, 'generated webview must contain the query tokenization expression');
const splitter = Function(`return ${match[1]}`)();
assert.deepStrictEqual('alpha beta'.split(splitter), ['alpha', 'beta'], 'multiword queries must split on whitespace');
assert.deepStrictEqual('assist'.split(splitter), ['assist'], 'names containing s must not be split into fragments');
assert.ok(html.includes('contexts?.[stateKey]'), 'browser preferences must be keyed by selected DEF/project context');

console.log('Map registry generated webview search and state tests passed');
