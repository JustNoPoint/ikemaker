'use strict';

const crypto = require('crypto');

const STORY_SOURCE_TYPE = 'story-dialogue-source-v1';
const STORY_SOURCE_ROLES = Object.freeze(['select-root', 'story-arc', 'story-route', 'inserted-dialogue']);

function sha256(value) { return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex'); }
function plain(value) { return !!value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype; }
function exact(value, keys) { return plain(value) && Object.keys(value).sort().join('|') === [...keys].sort().join('|'); }
function byteLength(value) { return Buffer.byteLength(String(value), 'utf8'); }
function normalizedId(value) { return String(value || '').trim().toLowerCase(); }
function normalizeLogicalRecord(value) { return String(value || '').replace(/\r\n?|\n/g, '\n'); }
function freeze(value, seen = new WeakSet()) { if (!value || typeof value !== 'object' || seen.has(value)) return value; seen.add(value); for (const child of Object.values(value)) if (plain(child) || Array.isArray(child)) freeze(child, seen); return Object.freeze(value); }
function validStorySourceReference(value) {
  return exact(value, ['type', 'role', 'uri', 'normalizedId', 'rawSignatureSha', 'occurrence', 'matchCount']) &&
    value.type === STORY_SOURCE_TYPE && STORY_SOURCE_ROLES.includes(value.role) && typeof value.uri === 'string' && value.uri.startsWith('file:') && byteLength(value.uri) >= 6 && byteLength(value.uri) <= 4096 &&
    typeof value.normalizedId === 'string' && value.normalizedId === normalizedId(value.normalizedId) && byteLength(value.normalizedId) <= 512 && (value.role === 'select-root' ? value.normalizedId === '' : byteLength(value.normalizedId) >= 1) && /^[0-9a-f]{64}$/.test(value.rawSignatureSha) &&
    Number.isInteger(value.occurrence) && value.occurrence >= 0 && value.occurrence <= 9999 && Number.isInteger(value.matchCount) && value.matchCount >= 1 && value.matchCount <= 10000 && value.occurrence < value.matchCount;
}
function storySourceReferences(records) {
  const projected = (records || []).map((record) => {
    const role = STORY_SOURCE_ROLES.includes(record.role) ? record.role : '';
    const id = normalizedId(record.id);
    const uri = String(record.uri || '');
    if (!role || (role === 'select-root' ? id !== '' : !id) || byteLength(id) > 512 || !uri.startsWith('file:') || byteLength(uri) > 4096) return null;
    const rawSignatureSha = sha256(JSON.stringify([STORY_SOURCE_TYPE, role, uri, id, normalizeLogicalRecord(record.logicalRecord)]));
    return { record, base: { type: STORY_SOURCE_TYPE, role, uri, normalizedId: id, rawSignatureSha } };
  }).filter(Boolean);
  const counts = new Map(); for (const item of projected) counts.set(item.base.rawSignatureSha, (counts.get(item.base.rawSignatureSha) || 0) + 1);
  const seen = new Map(); return projected.map((item) => { const occurrence = seen.get(item.base.rawSignatureSha) || 0; seen.set(item.base.rawSignatureSha, occurrence + 1); return freeze({ record: item.record, reference: { ...item.base, occurrence, matchCount: counts.get(item.base.rawSignatureSha) } }); });
}
function resolveStorySource(records, reference) { if (!validStorySourceReference(reference)) return null; const matches = storySourceReferences(records).filter((item) => item.reference.rawSignatureSha === reference.rawSignatureSha); if (matches.length !== reference.matchCount) return null; const found = matches[reference.occurrence]; return found && JSON.stringify(found.reference) === JSON.stringify(reference) ? found : null; }

function field(entry) {
  const first = entry && entry.params && entry.params[0];
  return first ? { key: String(first.name || '').toLowerCase(), value: String(first.value || '').trim(), line: entry.line } : null;
}

function storyArcs(selectModel) {
  const arcs = []; let current = null;
  for (const entry of selectModel.story || []) {
    const item = field(entry); if (!item) continue;
    if (item.key === 'name') { current = { name: item.value, displayname: item.value, path: '', unlock: 'true', line: item.line, fields: [] }; arcs.push(current); }
    if (!current) continue;
    current.fields.push(item); if (['displayname', 'path', 'unlock'].includes(item.key)) current[item.key] = item.value;
  }
  return arcs;
}

function luaString(value) { return `"${String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n')}"`; }
function luaList(values) { return `{${(values || []).filter(Boolean).map(luaString).join(', ')}}`; }

function launchFightBlock(fight, final = false) {
  const lines = ['if not launchFight{'];
  if (fight.p1char) lines.push(`\tp1char = ${luaList([fight.p1char])},`, '\tp1teammode = "single",', '\tp1numchars = 1,');
  if (fight.p2char) lines.push(`\tp2char = ${luaList([fight.p2char])},`); else lines.push(`\torder = ${Number(fight.order) || 1},`);
  if (fight.stage) lines.push(`\tstage = ${luaString(fight.stage)},`);
  if (fight.p2teammode && fight.p2teammode !== 'single') lines.push(`\tp2teammode = ${luaString(fight.p2teammode)},`, `\tp2numchars = ${Math.max(1, Number(fight.p2numchars) || 2)},`);
  if (fight.ai) lines.push(`\tai = ${Math.min(8, Math.max(1, Number(fight.ai)))},`);
  if (fight.time !== '' && fight.time !== undefined && fight.time !== null) lines.push(`\ttime = ${Number(fight.time)},`);
  if (fight.vsscreen) lines.push('\tvsscreen = true,');
  if (fight.victoryscreen) lines.push('\tvictoryscreen = true,');
  if (final) lines.push('\twinscreen = true,');
  lines.push('} then return end'); return lines.join('\n');
}

function linearStoryLua(options = {}) {
  const fights = options.fights && options.fights.length ? options.fights : [{ p1char: options.p1char || '', order: 1 }];
  const lines = ['-- IKEMEN 1.0 Story Mode arc', '-- Generated as a readable starting point. Advanced branching can be added in Creator Mode.', ''];
  if (options.intro) lines.push(`if matchNo() == 1 and not continued() then launchStoryboard(${luaString(options.intro)}) end`, '');
  fights.forEach((fight, index) => { lines.push(`if matchNo() == ${index + 1} then`, launchFightBlock({ ...fight, p1char: fight.p1char || options.p1char }, index === fights.length - 1).split('\n').map((x) => `\t${x}`).join('\n'), 'end', ''); });
  if (options.ending) lines.push(`launchStoryboard(${luaString(options.ending)})`, '');
  lines.push('setMatchNo(-1)', ''); return lines.join('\n');
}

function dialogueToken(line, defaults = {}) {
  const side = line.side === 'p2' ? 'p2' : 'p1', speaker = side === 'p2' ? (defaults.p2Redirect || 'enemy') : (defaults.p1Redirect || 'self');
  let out = `<${side}>`;
  if (line.portrait !== '' && line.portrait !== undefined && line.portrait !== null) out += `<${side}face=${speaker},${Number(line.group ?? defaults.group ?? 9100)},${Math.max(0, Number(line.portrait) || 0)}>`;
  if (line.soundGroup !== '' && line.soundIndex !== '' && line.soundGroup !== undefined && line.soundIndex !== undefined) out += `<sound=${speaker},${Number(line.soundGroup)},${Number(line.soundIndex)}>`;
  out += String(line.text || '');
  if (Number(line.wait) > 0) out += `<wait=${Math.floor(Number(line.wait))}>`;
  return out;
}

function quoteZss(value) { return `"${String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ')}"`; }
function dialogueController(options = {}) {
  const lines = (options.lines || []).slice(0, 20); if (!lines.length) throw new Error('At least one dialogue line is required.');
  const state = Number(options.state) || (options.phase === 'post' ? 180 : 191), trigger = options.trigger || (options.phase === 'post' ? 'Win' : 'RoundNo = 1');
  const out = [`[State ${state}, Dialogue: ${options.label || 'Story encounter'}]`, 'type = Dialogue', `trigger1 = ${trigger}`];
  if (options.enemy) out.push(`trigger1 = enemy, Name = ${quoteZss(options.enemy)}`);
  if (options.hidebars) out.push('hidebars = 1');
  lines.forEach((line, index) => out.push(`text${index + 1} = ${quoteZss(dialogueToken(line, options))}`));
  return `${out.join('\n')}\n`;
}

module.exports = { STORY_SOURCE_TYPE, STORY_SOURCE_ROLES, sha256, normalizedId, normalizeLogicalRecord, validStorySourceReference, storySourceReferences, resolveStorySource, storyArcs, luaString, luaList, launchFightBlock, linearStoryLua, dialogueToken, dialogueController };
