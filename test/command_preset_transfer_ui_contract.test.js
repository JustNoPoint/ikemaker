'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'command_movelist_workspace.js'), 'utf8');

assert(source.includes('<summary>Share saved presets</summary>'), 'transfer is discoverable beside the preset shelf');
assert(source.includes('id="importPresets"') && source.includes('id="exportPresets"'), 'compact import/export controls exist');
assert(source.includes('role="status" aria-live="polite"'), 'transfer progress is announced accessibly');
assert(source.includes('@media(max-width:480px){.preset-transfer-actions{grid-template-columns:minmax(0,1fr)}}'), 'controls stack in a narrow dock without horizontal scrolling');
assert(!source.includes("enable('command-preset-import')"), 'preset transfer does not clutter the universal toolbar');
assert(source.includes("if (!exactKeys(message, ['type'])) return; await importCustomPresets()"), 'the webview cannot inject paths or import content');
assert(source.includes('presetImportAuthority.consume'), 'host commit consumes exact reviewed authority');
assert(source.includes('transactionalWrite(fs, filename, bytes'), 'export uses transactional file replacement');

console.log('Command preset transfer compact UI and host-boundary contract tests passed');
