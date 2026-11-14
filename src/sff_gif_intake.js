'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function companionProbePath(ffmpeg) {
  const base = path.basename(String(ffmpeg || 'ffmpeg'));
  return base.toLowerCase().startsWith('ffmpeg') ? path.join(path.dirname(String(ffmpeg)), base.replace(/ffmpeg/i, 'ffprobe')) : 'ffprobe';
}

function parseProbeJson(text) {
  try {
    const data = JSON.parse(String(text || '{}'));
    const delaysMs = (data.frames || []).map(frame => Math.round(Number(frame.pkt_duration_time || frame.duration_time || 0) * 1000));
    return { frameCount: Number(data.streams?.[0]?.nb_frames) || delaysMs.length, delaysMs };
  } catch (_) { return { frameCount: 0, delaysMs: [] }; }
}

function extractGifSequence(filename, outputDirectory, ffmpeg = 'ffmpeg') {
  const absolute = path.resolve(filename);
  if (!fs.existsSync(absolute)) throw new Error(`GIF source is missing: ${absolute}`);
  fs.mkdirSync(outputDirectory, { recursive: true });
  if (fs.readdirSync(outputDirectory).some(name => /^frame_\d+\.png$/i.test(name))) throw new Error('GIF extraction requires a fresh frame directory. Existing frames were not changed.');
  const probe = spawnSync(companionProbePath(ffmpeg), ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=nb_frames:frame=pkt_duration_time,duration_time', '-of', 'json', absolute], { windowsHide: true, encoding: 'utf8' });
  const timing = probe.error || probe.status !== 0 ? { frameCount: 0, delaysMs: [] } : parseProbeJson(probe.stdout);
  const beforeTiming = ['-hide_banner', '-loglevel', 'error', '-y', '-i', absolute], output = path.join(outputDirectory, 'frame_%05d.png');
  // Modern FFmpeg removed -vsync. Older versions may lack its per-output
  // replacement; retry only that option-negotiation failure, never a decode error.
  let result = spawnSync(ffmpeg, [...beforeTiming, '-fps_mode', 'passthrough', output], { windowsHide: true, encoding: 'utf8' });
  if (!result.error && result.status !== 0 && /(?:unrecognized option\s+['"]?fps_mode\b|option\s+['"]?fps_mode['"]?\s+not found)/i.test(String(result.stderr || ''))) {
    result = spawnSync(ffmpeg, [...beforeTiming, '-vsync', '0', output], { windowsHide: true, encoding: 'utf8' });
  }
  if (result.error || result.status !== 0) throw result.error || new Error(result.stderr || `FFmpeg exited with ${result.status}.`);
  const frames = fs.readdirSync(outputDirectory).filter(name => /^frame_\d+\.png$/i.test(name)).sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  if (!frames.length) throw new Error('FFmpeg extracted no GIF frames.');
  if ((timing.frameCount && timing.frameCount !== frames.length) || (timing.delaysMs.length && timing.delaysMs.length !== frames.length)) throw new Error('GIF frame extraction and timing inspection disagree. No frames were admitted; inspect the source or export a new sequence.');
  const sourceByteHash = crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex');
  return {
    source: absolute, sourceByteHash, frameCount: frames.length, declaredFrameCount: timing.frameCount, delaysMs: timing.delaysMs,
    frames: frames.map((name, ordinal) => ({ filename: path.join(outputDirectory, name), ordinal, delayMs: timing.delaysMs[ordinal] || 0 }))
  };
}

module.exports = { companionProbePath, parseProbeJson, extractGifSequence };
