'use strict';
const assert = require('assert');
const clipboard = require('../src/storyboard_scene_clipboard');

const source = '; intro\r\n[SceneDef]\r\nspr = story.sff\r\n\r\n[Scene 2] ; keep header note\r\n; keep layer note\r\nlayer0.offset = 10,20 ; keep inline\r\nlayer0.spr = 1,2\r\n; interleaved scene note\r\nend.time = 90\r\n\r\n[Scene 9]\r\nlayer0.spr = 3,4\r\nend.time = 30\r\n';
const captured = clipboard.captureScene(source, 4);
assert.equal(captured.sourceNumber, 2);
assert(Object.isFrozen(captured));
assert.match(captured.lines.join('\n'), /; keep layer note/);
assert.match(captured.lines.join('\n'), /; keep inline/);
const pasted = clipboard.pasteScene(source, captured);
assert.equal(pasted.number, 10, 'paste allocates a collision-safe number after the current maximum');
assert.match(pasted.text, /\[Scene 10\] ; keep header note\r\n; keep layer note\r\nlayer0\.offset = 10,20 ; keep inline/);
assert(pasted.text.endsWith('\r\n'), 'source newline style is preserved');
assert.equal((pasted.text.match(/\[Scene 10\]/g) || []).length, 1);
assert.throws(() => clipboard.normalizeClipboard({...captured, lines: []}), /malformed/);
assert.throws(() => clipboard.normalizeClipboard({...captured, sourceNumber: 3}), /header/);
assert.throws(() => clipboard.normalizeClipboard({...captured, extra: true}), /invalid|copied/i);

const full = `[SceneDef]\nspr=x.sff\n[Scene ${clipboard.MAX_SCENE_NUMBER}]\nend.time=1\n`;
assert.equal(clipboard.pasteScene(full, clipboard.captureScene(full, 2)).number, 0, 'allocation safely wraps to the first free bounded number');
console.log('Storyboard scene clipboard tests passed');
