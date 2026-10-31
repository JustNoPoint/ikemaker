'use strict';

const assert = require('assert');
const path = require('path');
const { companionProbePath, parseProbeJson } = require('../src/sff_gif_intake');

assert.strictEqual(path.basename(companionProbePath(path.join('tools', 'ffmpeg.exe'))).toLowerCase(), 'ffprobe.exe');
assert.deepStrictEqual(parseProbeJson(JSON.stringify({ streams: [{ nb_frames: '3' }], frames: [{ pkt_duration_time: '0.016' }, { duration_time: '0.033' }, { pkt_duration_time: '0.05' }] })), { frameCount: 3, delaysMs: [16, 33, 50] });
assert.deepStrictEqual(parseProbeJson('not json'), { frameCount: 0, delaysMs: [] });
console.log('GIF SFF intake preserves source frame order and delay provenance');
