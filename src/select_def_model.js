'use strict';

function splitComma(text) {
  const out = []; let current = '', quote = '', depth = 0;
  for (const char of String(text || '')) {
    if (quote) { current += char; if (char === quote) quote = ''; continue; }
    if (char === '"' || char === "'") { quote = char; current += char; continue; }
    if (char === '{') depth += 1; if (char === '}') depth = Math.max(0, depth - 1);
    if (char === ',' && depth === 0) { out.push(current.trim()); current = ''; } else current += char;
  }
  out.push(current.trim()); return out;
}

function parameter(piece) { const match = /^\s*([\w.]+)\s*=\s*([\s\S]*)$/.exec(piece); return match ? { name: match[1], value: match[2] } : null; }
function entryKind(section, code) {
  if (/^slot\s*=\s*\{/i.test(code)) return 'slot-start';
  if (/^\}$/i.test(code)) return 'slot-end';
  if (section === 'options') return 'option';
  if (section === 'storymode') return /^name\s*=/i.test(code) ? 'story-start' : 'story-field';
  if (section === 'extrastages') return 'stage';
  if (section === 'characters') return 'character';
  return 'raw';
}

function parseEntry(section, code, line, raw) {
  const kind = entryKind(section, code), parts = splitComma(code), params = [], positional = [];
  for (const piece of parts) { const parsed = parameter(piece); if (parsed) params.push(parsed); else if (piece) positional.push(piece); }
  const get = (name) => params.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value || '';
  let name = positional[0] || get('name') || code;
  if (kind === 'option' && params[0]) name = params[0].name;
  if (kind === 'story-start') name = get('name') || code;
  if (kind === 'story-field' && params[0]) name = `${params[0].name}: ${params[0].value}`;
  return { section, kind, line, raw, code, positional, params, name, stages: kind === 'character' ? positional.slice(1) : [], order: get('order'), hidden: get('hidden'), exclude: get('exclude'), bonus: get('bonus'), unlock: get('unlock') };
}

function parseSelectDef(text) {
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/), sections = [], entries = []; let section = null, slotDepth = 0;
  for (let line = 0; line < lines.length; line += 1) {
    const raw = lines[line], header = /^\s*\[\s*([^\]]+)\s*\]\s*(?:;.*)?$/.exec(raw);
    if (header) { section = header[1].trim().toLowerCase(); sections.push({ name: section, title: header[1].trim(), line, endLine: lines.length - 1 }); if (sections.length > 1) sections[sections.length - 2].endLine = line - 1; slotDepth = 0; continue; }
    const code = raw.replace(/;.*$/, '').trim(); if (!section || !code) continue;
    const entry = parseEntry(section, code, line, raw); entry.inSlot = slotDepth > 0;
    if (entry.kind === 'slot-start') slotDepth += 1; else if (entry.kind === 'slot-end') slotDepth = Math.max(0, slotDepth - 1);
    entries.push(entry);
  }
  const known = new Set(['characters', 'extrastages', 'options', 'storymode']);
  return { lines, sections, entries, characters: entries.filter((x) => x.section === 'characters' && x.kind === 'character'), stages: entries.filter((x) => x.section === 'extrastages' && x.kind === 'stage'), options: entries.filter((x) => x.section === 'options' && x.kind === 'option'), story: entries.filter((x) => x.section === 'storymode'), other: entries.filter((x) => !known.has(x.section)), unknownSections: sections.filter((x) => !known.has(x.name)) };
}

function insertionLine(model, sectionName) {
  const section = model.sections.find((item) => item.name === sectionName.toLowerCase());
  if (!section) return model.lines.length;
  let line = section.endLine + 1;
  while (line > section.line + 1 && !model.lines[line - 1].trim()) line -= 1;
  return line;
}

function orderGroups(model) {
  const groups = new Map();
  for (const item of model.characters) { const order = item.order || 'Unspecified'; if (!groups.has(order)) groups.set(order, []); groups.get(order).push(item); }
  return [...groups.entries()].sort((a, b) => Number(a[0]) - Number(b[0])).map(([order, entries]) => ({ order, entries }));
}

module.exports = { splitComma, parameter, parseSelectDef, insertionLine, orderGroups };
