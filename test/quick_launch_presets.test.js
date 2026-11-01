'use strict';

const assert = require('assert');
const path = require('path');
const model = require('../src/quick_launch_presets');

const root = path.resolve('C:/game');
const preset = model.normalizePreset({
  id: 'teams', name: 'Teams', mode: 'training', stage: 'stages/test.def', time: 99, rounds: 2, draws: 1,
  p1: { teamMode: 1, count: 2, members: [
    { character: 'chars/Ryu/Ryu.def', color: 2, input: 1, life: 1200, lifeMax: 1400 },
    { character: 'chars/Ken/Ken.def', ai: 5, power: 3000 }
  ] },
  p2: { teamMode: 3, count: 2, members: [{ character: 'chars/Chun/Chun.def', dizzyPoints: 900 }, { character: 'chars/Guile/Guile.def', guardPoints: 800 }] }
});
const args = model.buildArgs(preset);
assert.deepStrictEqual(args.slice(0, 2), ['-training', '1']);
assert(!args.includes('-loadmotif'));
assert(args.includes('-rounds') && args.includes('2'));
assert.deepStrictEqual(args.slice(args.indexOf('-p1'), args.indexOf('-p1') + 2), ['-p1', 'chars/Ryu/Ryu.def']);
assert.deepStrictEqual(args.slice(args.indexOf('-p3'), args.indexOf('-p3') + 2), ['-p3', 'chars/Ken/Ken.def']);
assert.deepStrictEqual(args.slice(args.indexOf('-p2'), args.indexOf('-p2') + 2), ['-p2', 'chars/Chun/Chun.def']);
assert.deepStrictEqual(args.slice(args.indexOf('-p4'), args.indexOf('-p4') + 2), ['-p4', 'chars/Guile/Guile.def']);
assert(args.includes('-p1.lifeMax') && args.includes('1400'));
assert(args.includes('-p3.ai') && args.includes('5'));
assert(args.includes('-p2.dizzyPoints') && args.includes('900'));
assert(args.includes('-p4.guardPoints') && args.includes('800'));

const versus = model.newPreset('versus', 'chars/Ryu/Ryu.def', 'stages/stage0.def');
assert.strictEqual(model.buildArgs(versus)[0], '-loadmotif');
assert(!model.buildArgs(versus).includes('-training'));
assert.strictEqual(model.summary(versus), 'Ryu vs Ryu · Quick VS · stage0 · Single');

const valid = new Set([
  path.resolve(root, 'chars/Ryu/Ryu.def').toLowerCase(),
  path.resolve(root, 'stages/stage0.def').toLowerCase()
]);
assert.strictEqual(model.validatePreset(versus, root, filename => valid.has(path.resolve(filename).toLowerCase())).ok, true);
const short = model.normalizePreset({ ...versus, stage: 'stage0', p1: { members: [{ character: 'Ryu' }] }, p2: { members: [{ character: 'Ryu' }] } });
assert.strictEqual(model.validatePreset(short, root, filename => valid.has(path.resolve(filename).toLowerCase())).ok, true);
const outside = model.normalizePreset({ ...versus, stage: '../outside.def' });
assert.strictEqual(model.validatePreset(outside, root, () => true).ok, false);

const music = model.normalizePreset({ ...versus, music: 'sound/stage/theme.ogg', musicTest: { volume: 82, loopStart: 44100, loopEnd: 176400 } });
assert.deepStrictEqual(music.musicTest, { volume: 82, loopStart: 44100, loopEnd: 176400 });
const musicFiles = new Set([...valid, path.resolve(root, 'sound/stage/theme.ogg').toLowerCase()]);
assert.strictEqual(model.validatePreset(music, root, filename => musicFiles.has(path.resolve(filename).toLowerCase())).ok, true);
assert(model.summary(music).includes('music: theme.ogg'));
assert.strictEqual(model.validatePreset({ ...music, music: '../theme.ogg' }, root, () => true).ok, false);

const runtime = require('../src/quick_launch_music_runtime');
const lua = runtime.runtimeLua();
assert(lua.includes("flags['-ikemaker.music-loopstart']"));
assert(lua.includes("flags['-ikemaker.music-loopend']"));
assert(lua.includes("for _ = 1, 1024"));
assert(!lua.includes('os.remove'));

console.log('Quick launch preset normalization, validation, interleaved teams and engine argument tests passed');
