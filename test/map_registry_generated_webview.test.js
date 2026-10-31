'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'map_registry_ui.js'), 'utf8');
assert(!source.includes('legacyOpenBrowser') && !source.includes('legacyProgressiveBrowserHtml'), 'retired unsafe browser hosts are absent');
assert(!source.includes("message.type === 'use'") && !source.includes("message.type==='use'"), 'no client filename/line occurrence route remains');
assert(source.includes('entry.searchText.includes(term)'), 'generated browser uses the same host-projected search predicate');
assert(source.includes("send('mapFilter'"), 'filter changes use the generation-scoped host commit path');
console.log('Map Registry has one universal generated browser route and no retired occurrence host');
