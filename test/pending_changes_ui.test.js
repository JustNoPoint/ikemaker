'use strict';

const assert = require('assert');
const ui = require('../src/pending_changes_ui');

const document = { uri: { scheme: 'file', toString: () => 'file:///C:/Game/chars/Ryu/ryu.zss' }, fileName: 'C:\\Game\\chars\\Ryu\\ryu.zss', languageId: 'zss', version: 7 };
const seed = ui.documentSeed(document);
assert.equal(seed.type, 'dirty'); assert.equal(seed.persistence, 'session'); assert.equal(seed.actions.apply.label, 'Save Document');
assert.equal(ui.documentSeed({ uri: { scheme: 'output' } }), null, 'virtual and output documents do not enter the source-change tray');
assert.deepEqual(ui.summary([seed]), { count: 1, text: '$(edit) 1 pending', tooltip: '1 pending change' });
assert.equal(ui.summary([seed, { type: 'conflict' }]).tooltip, '2 pending changes · 1 conflict');
console.log('Pending Changes status presentation keeps dirty source documents session-only and reports conflicts');
