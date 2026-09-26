'use strict';

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

module.exports = { storyArcs, luaString, luaList, launchFightBlock, linearStoryLua, dialogueToken, dialogueController };
