'use strict';

const soundBuild = require('./sound_build');
const { moveSelectedRows } = require('./view_list_move');

function moveManifestRowsPatch(text, selectedIdentities, position) {
  const source = String(text || ''), manifest = soundBuild.parse(source), entries = manifest.entries;
  if (!Array.isArray(selectedIdentities) || !selectedIdentities.length || selectedIdentities.some(id => typeof id !== 'string' || !/^\d+,\d+$/.test(id)) || new Set(selectedIdentities).size !== selectedIdentities.length) throw new Error('Choose distinct sound group,index identities from the current archive.');
  const identities = entries.map(entry => `${entry.group},${entry.index}`);
  const positions = new Map();
  identities.forEach((id, index) => { const found = positions.get(id) || []; found.push(index); positions.set(id, found); });
  const chosen = selectedIdentities.map(id => { const matches = positions.get(id) || []; if (matches.length !== 1) throw new Error(`Sound ${id} must occur exactly once in the SndMaker manifest; review its source first.`); return matches[0]; });
  const plan = moveSelectedRows(entries.map((_, index) => index), chosen, position);
  if (!plan.changed) throw new Error('The selected manifest sounds are already at that position.');
  const lines = [], pattern = /[^\r\n]*(?:\r\n|\r|\n|$)/g; let match;
  while ((match = pattern.exec(source)) && match[0]) lines.push({ start: match.index, end: pattern.lastIndex, text: match[0], value: match[0].replace(/(?:\r\n|\r|\n)$/, '') });
  const meaningful = lines.map((line, index) => ({ line, index })).filter(({ line }) => line.value.trim() && !/^[;#]/.test(line.value.trim()));
  if (meaningful.length !== 1 + 3 * entries.length) throw new Error('The SndMaker source changed or has ambiguous entry lines. Open its text before moving rows.');
  const blocks = entries.map((_, index) => { const rows = meaningful.slice(1 + index * 3, 4 + index * 3); if (rows[1].index !== rows[0].index + 1 || rows[2].index !== rows[1].index + 1) throw new Error(`SndMaker entry ${index + 1} has intervening comments or blank lines. Review that entry in source before moving it.`); return { start: rows[0].line.start, end: rows[2].line.end, text: source.slice(rows[0].line.start, rows[2].line.end) }; });
  const changed = plan.order.map((index, slot) => index === slot ? -1 : slot).filter(slot => slot >= 0), first = changed[0], last = changed[changed.length - 1];
  for (let slot = first; slot < last; slot += 1) { const gap = source.slice(blocks[slot].end, blocks[slot + 1].start); if (gap.trim()) throw new Error(`An unattached comment lies between SndMaker entries ${slot + 1} and ${slot + 2}. Review it in source before moving rows.`); }
  const ending = value => (/(\r\n|\r|\n)$/.exec(value) || [,''])[1];
  let replacement = '';
  for (let slot = first; slot <= last; slot += 1) { replacement += blocks[plan.order[slot]].text.replace(/(?:\r\n|\r|\n)$/, '') + ending(blocks[slot].text); if (slot < last) replacement += source.slice(blocks[slot].end, blocks[slot + 1].start); }
  const patch = { start: blocks[first].start, end: blocks[last].end, text: replacement }, updated = source.slice(0, patch.start) + patch.text + source.slice(patch.end), parsed = soundBuild.parse(updated);
  const expected = plan.order.map(index => entries[index]);
  if (parsed.output !== manifest.output || JSON.stringify(parsed.entries) !== JSON.stringify(expected)) throw new Error('The moved SndMaker source changed an entry or output path. Review it in source.');
  return { ...patch, count: plan.count, startPosition: plan.start, before: identities, after: plan.order.map(index => identities[index]) };
}

module.exports = { moveManifestRowsPatch };
