'use strict';

const assert = require('assert');
const clipboard = require('../src/stage_background_clipboard');

const crlf = '[Info]\r\nname = Test\r\n[BG Sky]\r\n; keep this note\r\ntype = normal\r\nspriteno = 0,0\r\n\r\n[BG Sky Copy]\r\ntype = normal\r\nspriteno = 0,1\r\n';
const payload = clipboard.capture(crlf, 2, { sourceFile: 'stage.def' });
assert.strictEqual(payload.sectionName, 'BG Sky');
assert(payload.source.includes('; keep this note\r\n'), 'copy preserves comments and original CRLF text');
assert(payload.source.endsWith('\r\n\r\n'), 'copy preserves the complete section boundary');

const after = clipboard.insert(crlf, 7, payload, 'after');
assert.strictEqual(after.identity, 'BG Sky 2', 'paste allocates a collision-safe BG name');
assert(after.text.indexOf('[BG Sky Copy]') < after.text.indexOf('[BG Sky 2]'));
assert(after.text.includes('[BG Sky 2]\r\n; keep this note\r\n'), 'paste changes only the section header');

const before = clipboard.insert(crlf, 7, payload, 'before');
assert(before.text.indexOf('[BG Sky 2]') < before.text.indexOf('[BG Sky Copy]'), 'before placement is native and exact');

const duplicated = clipboard.duplicate(crlf, 2);
assert.strictEqual(duplicated.identity, 'BG Sky Copy 2');
assert(duplicated.text.includes('[BG Sky Copy 2]\r\n; keep this note'));

const removed = clipboard.remove(crlf, 2);
assert(!removed.includes('; keep this note'));
assert(removed.includes('[BG Sky Copy]'), 'cut removes only the exact selected section');

const ordered='[Info]\nname=x\n[BG A]\n; a\ntype=normal\n[BG B]\n; b\ntype=normal\n[BG C]\n; c\ntype=normal\n[Begin Action 0]\n0,0,0,0,1\n';
const reordered=clipboard.reorder(ordered,[2,8],5,'before');
assert(reordered.indexOf('[BG A]')<reordered.indexOf('[BG C]')&&reordered.indexOf('[BG C]')<reordered.indexOf('[BG B]'),'multi-section order is retained at the reviewed drop target');
assert(reordered.includes('[BG A]\n; a')&&reordered.includes('[BG C]\n; c')&&reordered.endsWith('[Begin Action 0]\n0,0,0,0,1\n'),'reorder preserves exact section comments and unrelated sections');
assert.throws(()=>clipboard.reorder(ordered,[2],2,'after'),/different target/);

const store = new clipboard.StageBackgroundClipboard();
assert.strictEqual(store.get(), null);
store.set(payload); assert.strictEqual(store.get(), payload); store.clear(); assert.strictEqual(store.get(), null);
assert.throws(() => store.set({ kind: 'ikemaker-stage-bg', source: '[BG X]\n' }), /empty or invalid/);
assert.throws(() => clipboard.capture(`[BG Huge]\nvalue=${'x'.repeat(clipboard.MAX_SECTION_CHARS)}`, 0), /clipboard limit/);

console.log('Stage BG clipboard exact-text, bounds, collision naming, native placement, cut and duplicate passed');
