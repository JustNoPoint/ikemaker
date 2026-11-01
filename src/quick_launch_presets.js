'use strict';

const path = require('path');

const MODES = Object.freeze(['versus', 'training']);
const TEAM_MODES = Object.freeze([
  Object.freeze({ label: 'Single', value: 0 }),
  Object.freeze({ label: 'Simul', value: 1 }),
  Object.freeze({ label: 'Turns', value: 2 }),
  Object.freeze({ label: 'Tag', value: 3 })
]);
const PLAYER_FIELDS = Object.freeze(['color', 'ai', 'input', 'life', 'lifeMax', 'power', 'dizzyPoints', 'guardPoints']);

function text(value, limit = 1024) { return String(value ?? '').trim().slice(0, limit); }
function integer(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}
function mode(value) { return MODES.includes(value) ? value : 'versus'; }
function normalizeRelative(value) { return text(value, 4096).replace(/\\/g, '/').replace(/^\.\//, ''); }
function member(value = {}) {
  const result = { character: normalizeRelative(value.character) };
  for (const field of PLAYER_FIELDS) {
    if (value[field] === '' || value[field] === undefined || value[field] === null) continue;
    const number = Number(value[field]);
    if (Number.isFinite(number)) result[field] = number;
  }
  return result;
}
function normalizeSide(value = {}) {
  const teamMode = integer(value.teamMode, 0, 0, 3), count = teamMode === 0 ? 1 : integer(value.count, 2, 2, 8);
  let members = Array.isArray(value.members) ? value.members.slice(0, 8).map(member) : [];
  if (!members.length) members = [member({ character: value.character })];
  while (members.length < count) members.push(member(members.at(-1)));
  return { teamMode, count, members: members.slice(0, count) };
}
function normalizePreset(value = {}, fallbackMode = 'versus') {
  const selectedMode = mode(value.mode || fallbackMode), runtime = value.runtime || {}, musicTest = value.musicTest || {};
  return {
    id: text(value.id, 80) || `preset-${Date.now().toString(36)}`,
    name: text(value.name, 80) || (selectedMode === 'training' ? 'Training setup' : 'Quick VS setup'),
    mode: selectedMode,
    stage: normalizeRelative(value.stage),
    music: normalizeRelative(value.music),
    musicTest: {
      volume: integer(musicTest.volume, 100, 0, 100),
      loopStart: integer(musicTest.loopStart, 0, 0, 2147483647),
      loopEnd: integer(musicTest.loopEnd, 0, 0, 2147483647)
    },
    p1: normalizeSide(value.p1), p2: normalizeSide(value.p2),
    time: integer(value.time, -1, -1, 9999), rounds: integer(value.rounds, -1, -1, 99), draws: integer(value.draws, -1, -1, 99),
    runtime: { speed: Number.isFinite(Number(runtime.speed)) ? Number(runtime.speed) : 1, windowed: runtime.windowed === true, noSound: runtime.noSound === true }
  };
}
function newPreset(selectedMode, currentCharacter = '', stage = 'stages/stage0.def') {
  const current = normalizeRelative(currentCharacter);
  return normalizePreset({ mode: selectedMode, stage, p1: { members: [{ character: current }] }, p2: { members: [{ character: current }] } }, selectedMode);
}
function resolveWithin(root, relative) {
  const resolved = path.resolve(root, relative);
  const prefix = path.resolve(root) + path.sep;
  return resolved === path.resolve(root) || resolved.toLowerCase().startsWith(prefix.toLowerCase()) ? resolved : '';
}
function canonicalAsset(root, value, kind) {
  const prefix = `${kind}/`; let relative = normalizeRelative(value);
  if (path.isAbsolute(relative)) {
    const full = resolveWithin(root, relative);
    relative = full ? path.relative(root, full).replace(/\\/g, '/') : relative;
  }
  if (!relative.toLowerCase().startsWith(prefix)) {
    if (kind === 'chars' && !relative.toLowerCase().endsWith('.def') && !relative.includes('/')) relative = `chars/${relative}/${relative}.def`;
    else relative = `${prefix}${relative}`;
  }
  if (!relative.toLowerCase().endsWith('.def')) relative += '.def';
  return relative;
}
function validatePreset(preset, root, exists) {
  const value = normalizePreset(preset, preset?.mode), errors = [];
  const check = (relative, prefix, label) => {
    if (!relative) return errors.push(`${label} is required.`);
    const full = resolveWithin(root, relative), allowedRoot = path.resolve(root, prefix.replace('/', '')), allowedPrefix = `${allowedRoot}${path.sep}`.toLowerCase();
    if (!full || !full.toLowerCase().startsWith(allowedPrefix) || !relative.toLowerCase().startsWith(prefix) || !relative.toLowerCase().endsWith('.def')) return errors.push(`${label} must be a ${prefix.replace('/', '')} DEF inside this game.`);
    if (!exists(full)) errors.push(`${label} was not found: ${relative}`);
  };
  value.stage = canonicalAsset(root, value.stage, 'stages');
  for (const side of ['p1', 'p2']) for (const entry of value[side].members) entry.character = canonicalAsset(root, entry.character, 'chars');
  check(value.stage, 'stages/', 'Stage');
  if (value.music) {
    const full = resolveWithin(root, value.music), supported = /\.(?:ogg|mp3|wav|flac|opus)$/i.test(value.music);
    if (!full || !supported) errors.push('Test music must be a supported audio file inside this game.');
    else if (/[\0\r\n,]/.test(value.music)) errors.push('Test music paths cannot contain commas or control characters.');
    else if (!exists(full)) errors.push(`Test music was not found: ${value.music}`);
  }
  for (const side of ['p1', 'p2']) value[side].members.forEach((entry, index) => check(entry.character, 'chars/', `${side.toUpperCase()} member ${index + 1}`));
  return { ok: errors.length === 0, errors, preset: value };
}
function buildArgs(preset) {
  const value = normalizePreset(preset, preset?.mode);
  const args = value.mode === 'training' ? require('./training_launch_args').buildTrainingArgs() : ['-loadmotif'];
  args.push('-time', String(value.time), '-rounds', String(value.rounds), '-draws', String(value.draws), '-tmode1', String(value.p1.teamMode), '-tmode2', String(value.p2.teamMode), '-s', value.stage);
  for (const [sideIndex, side] of [value.p1, value.p2].entries()) side.members.forEach((entry, memberIndex) => {
    const player = sideIndex + 1 + memberIndex * 2;
    args.push(`-p${player}`, entry.character);
    const flags = { color: 'color', ai: 'ai', input: 'input', life: 'life', lifeMax: 'lifeMax', power: 'power', dizzyPoints: 'dizzyPoints', guardPoints: 'guardPoints' };
    for (const [field, suffix] of Object.entries(flags)) if (entry[field] !== undefined) args.push(`-p${player}.${suffix}`, String(entry[field]));
  });
  return args;
}
function summary(preset) {
  const value = normalizePreset(preset, preset?.mode), first = side => path.basename(side.members[0]?.character || 'Not set', '.def');
  return `${first(value.p1)} vs ${first(value.p2)} · ${value.mode === 'training' ? 'Training' : 'Quick VS'} · ${path.basename(value.stage || 'No stage', '.def')} · ${TEAM_MODES.find(item => item.value === value.p1.teamMode)?.label || 'Single'}${value.music ? ` · music: ${path.basename(value.music)}` : ''}`;
}

module.exports = { MODES, TEAM_MODES, PLAYER_FIELDS, normalizePreset, newPreset, validatePreset, buildArgs, summary, normalizeRelative, canonicalAsset };
