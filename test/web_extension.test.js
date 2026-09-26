'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const source = fs.readFileSync(path.join(root, 'src', 'web_extension.js'), 'utf8');

assert.strictEqual(packageJson.browser, './src/web_extension.js');
const requires = [...source.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map((match) => match[1]);
assert.deepStrictEqual([...new Set(requires)], ['vscode'], 'web entry must not load Node modules');
for (const item of packageJson.contributes.commands || []) assert(source.includes(`'${item.command}'`), `web entry does not handle ${item.command}`);
for (const viewType of ['ikemen.sffWorkspace', 'ikemen.sndWorkspace']) assert(source.includes(`'${viewType}'`), `web entry does not register ${viewType}`);
for (const filename of ['mobile-platform-feature-matrix.md', 'mobile-platform-feature-matrix.txt']) assert(fs.existsSync(path.join(root, 'data', filename)), `missing ${filename}`);
assert(source.includes('Native desktop tools are intentionally not invoked or emulated.'));
for (const feature of ['WebControllerProvider', 'portableStructure', 'portableAudit', "readCatalog(context, 'triggers.json')", "readCatalog(context, 'lua-api.json')", 'registerCompletionItemProvider', 'registerHoverProvider']) assert(source.includes(feature), `missing portable browser feature: ${feature}`);
assert(source.includes('SFF archive parsing/workspace'));
assert(!source.includes('archive parsing and inspection'));
console.log('Web extension foundation tests passed');
