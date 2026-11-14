'use strict';
const path = require('path'), os = require('os'), crypto = require('crypto');
// Context-free tests and short sessions use an owned TEMP namespace; installed
// sessions use extension app storage. Neither default writes beside a character.
let root = path.join(os.tmpdir(), 'ikemaker-sff-private-' + crypto.randomUUID());
function register(context) { if (context?.globalStorageUri?.fsPath) root = path.join(path.resolve(context.globalStorageUri.fsPath), 'sff-private'); }
function directory(kind) { if (!['sources', 'builds', 'recovery'].includes(kind)) throw Error('Unknown private SFF storage purpose.'); return path.join(root, kind); }
module.exports = { register, directory };
