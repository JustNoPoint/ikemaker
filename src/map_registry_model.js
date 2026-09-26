'use strict';

const path = require('path');

const MAP_PATTERN = /\bmap\s*\(\s*([A-Za-z_][A-Za-z0-9_.]*)\s*\)/gi;

function cleanComment(line) {
  const match = /^\s*(?:#|;|\/\/)(.*)$/.exec(String(line || ''));
  return match ? match[1].trim() : null;
}

function sourceNotes(lines, line, name) {
  const notes = []; let start = line;
  for (let at = line - 1; at >= 0 && line - at <= 18; at--) {
    const comment = cleanComment(lines[at]);
    if (comment === null) {
      if (String(lines[at] || '').trim()) break;
      if (notes.length) break;
      continue;
    }
    if (comment) { notes.unshift(comment); start = at; }
  }
  const family = name.replace(/(?:[_\.])[^_.]+$/, '');
  const relevant = notes.some((note) => note.toLowerCase().includes(name.toLowerCase())
    || (family && note.toLowerCase().includes(family.toLowerCase())));
  return relevant ? [{ text: notes.join('\n'), start, end: line - 1 }] : [];
}

function classifyRest(rest) {
  if (/^\s*:=/.test(rest)) return 'write';
  if (/^\s*(?:\+=|-=|\*=|\/=)/.test(rest)) return 'read-write';
  return 'read';
}

function contractBlocks(lines) {
  const blocks = [];
  for (let at = 0; at < lines.length;) {
    const first = cleanComment(lines[at]);
    if (first === null) { at++; continue; }
    const start = at, notes = [];
    while (at < lines.length) {
      const comment = cleanComment(lines[at]);
      if (comment === null) break;
      if (comment) notes.push(comment);
      at++;
    }
    const text = notes.join('\n'), names = [...new Set(text.match(/\b[A-Za-z][A-Za-z0-9]*(?:[_.][A-Za-z0-9]+){2,}\b/g) || [])];
    if (text && names.length) blocks.push({ start, end: at - 1, text, names });
  }
  return blocks;
}

function maskedCode(raw, language) {
  const text = String(raw || ''), chars = [...text]; let quote = '', escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index], next = text[index + 1];
    if (quote) {
      chars[index] = ' ';
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") { quote = char; chars[index] = ' '; continue; }
    if (language === 'zss' && (char === '#' || (char === '/' && next === '/'))) { for (let at = index; at < chars.length; at += 1) chars[at] = ' '; break; }
    if (language !== 'zss' && char === ';') { for (let at = index; at < chars.length; at += 1) chars[at] = ' '; break; }
  }
  return chars.join('');
}

function observedValue(rest) {
  const match = /^\s*:=\s*([^;{}]+)/.exec(rest);
  return match ? match[1].trim() : '';
}

function occurrences(text, filename, language = 'zss') {
  const lines = String(text || '').split(/\r?\n/), result = [], contracts = contractBlocks(lines);
  const controllers = new Array(lines.length).fill('');
  if (language !== 'zss') {
    for (let start = 0; start < lines.length; start += 1) {
      if (!/^\s*\[/.test(maskedCode(lines[start], language))) continue;
      let end = start + 1; while (end < lines.length && !/^\s*\[/.test(maskedCode(lines[end], language))) end += 1;
      let controller = '';
      for (let at = start + 1; at < end; at += 1) { const type = /^\s*type\s*=\s*([A-Za-z0-9_]+)/i.exec(maskedCode(lines[at], language)); if (type) { controller = type[1].toLowerCase(); break; } }
      for (let at = start; at < end; at += 1) controllers[at] = controller;
      start = end - 1;
    }
  }
  lines.forEach((raw, line) => {
    const cnsController = controllers[line];
    const code = maskedCode(raw, language);
    let match;
    MAP_PATTERN.lastIndex = 0;
    while ((match = MAP_PATTERN.exec(code))) {
      const rest = code.slice(match.index + match[0].length);
      const actualMapParameter = !code.slice(0, match.index).trim() && /^\s*=/.test(rest);
      const cnsWrite = language !== 'zss' && actualMapParameter && /^(?:mapset|parentmapset|rootmapset|teammapset)$/.test(cnsController);
      const cnsReadWrite = language !== 'zss' && actualMapParameter && /^(?:mapadd|parentmapadd|rootmapadd|teammapadd)$/.test(cnsController);
      const access = cnsWrite ? 'write' : cnsReadWrite ? 'read-write' : classifyRest(rest);
      result.push({
        name: match[1], filename, language, line, character: match.index + match[0].indexOf(match[1]),
        access, observedValue: access === 'write' ? observedValue(rest) : '',
        source: raw.trim(), notes: sourceNotes(lines, line, match[1])
      });
    }
    if (language !== 'zss') {
      const named = /^\s*map\s*=\s*["']([A-Za-z_][A-Za-z0-9_.]*)["']/i.exec(raw);
      if (named && /^(?:mapset|parentmapset|rootmapset|teammapset|mapadd|parentmapadd|rootmapadd|teammapadd)$/.test(cnsController)) result.push({ name: named[1], filename, language, line, character: raw.indexOf(named[1]), access: cnsController.endsWith('add') ? 'read-write' : 'write', observedValue: '', source: raw.trim(), notes: sourceNotes(lines, line, named[1]) });
      const initializer = /^\s*map\.([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*(.+?)(?:\s*;.*)?$/i.exec(raw);
      if (initializer && cnsController === 'helper') result.push({ name: initializer[1], filename, language, line, character: raw.indexOf(initializer[1]), access: 'write', observedValue: initializer[2].trim(), source: raw.trim(), notes: sourceNotes(lines, line, initializer[1]) });
    }
  });
  for (const item of result) {
    for (const block of contracts) if (block.names.some((name) => name.toLowerCase() === item.name.toLowerCase()) && !item.notes.some((note) => note.text === block.text)) item.notes.push({ text: block.text, start: block.start, end: block.end });
  }
  return result;
}

function suggestedPath(name) {
  const parts = name.split(/[_.]+/).filter(Boolean);
  if (parts.length < 2) return ['Ungrouped'];
  return parts.slice(0, -1).map((part) => part);
}

function namespaceFor(name) {
  const parts = String(name || '').split(/[_.]+/).filter(Boolean), author = parts[0] || '';
  const known = { 'jnp\0dvs': 'DvS', 'jnp\0sf6': 'SF6', 'jnp\0ds4': 'DS4', 'teamz2\0hdbz': 'HDBZ' };
  const game = known[`${author.toLowerCase()}\0${String(parts[1] || '').toLowerCase()}`] || '';
  return { author, game, confirmed: Boolean(game) };
}

function familyName(name) {
  const parts = name.split(/[_.]+/).filter(Boolean);
  return parts.length > 1 ? parts.slice(0, -1).join(name.includes('.') ? '.' : '_') : 'Ungrouped';
}

function aggregate(items, options = {}) {
  const groups = new Map();
  for (const item of items || []) {
    const key = item.name.toLowerCase();
    if (!groups.has(key)) groups.set(key, { name: item.name, occurrences: [] });
    groups.get(key).occurrences.push(item);
  }
  return [...groups.values()].map((entry) => {
    const notes = [], seenNotes = new Set(), values = new Set();
    for (const occurrence of entry.occurrences) {
      for (const sourceNote of occurrence.notes || []) {
        const block = sourceNote.text.trim();
        if (block && !seenNotes.has(`${occurrence.filename}\0${sourceNote.start}\0${block}`)) { seenNotes.add(`${occurrence.filename}\0${sourceNote.start}\0${block}`); notes.push({ text: block, filename: occurrence.filename, line: sourceNote.start, endLine: sourceNote.end }); }
      }
      if (occurrence.observedValue) values.add(occurrence.observedValue);
    }
    const files = [...new Set(entry.occurrences.map((item) => item.filename))];
    const namespace = namespaceFor(entry.name);
    return {
      name: entry.name,
      leaf: entry.name.split(/[_.]+/).filter(Boolean).at(-1) || entry.name,
      family: familyName(entry.name),
      suggestedPath: suggestedPath(entry.name),
      hierarchySource: 'name-suggestion',
      occurrences: entry.occurrences,
      reads: entry.occurrences.filter((item) => item.access === 'read').length,
      writes: entry.occurrences.filter((item) => item.access === 'write').length,
      readWrites: entry.occurrences.filter((item) => item.access === 'read-write').length,
      displayReads: entry.occurrences.filter((item) => item.access === 'read' || item.access === 'read-write').length,
      displayWrites: entry.occurrences.filter((item) => item.access === 'write' || item.access === 'read-write').length,
      author: namespace.author, game: namespace.game, namespaceConfirmed: namespace.confirmed,
      files, notes, observedValues: [...values],
      ownership: options.ownership?.(files) || 'Unknown',
      runtimeReceiver: 'Unknown',
      applicability: options.applicability || 'Current indexed project'
    };
  }).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
}

function buildTree(entries) {
  const root = { label: 'All Maps', children: new Map(), entries: [] };
  for (const entry of entries || []) {
    let node = root;
    for (const label of entry.suggestedPath) {
      if (!node.children.has(label)) node.children.set(label, { label, children: new Map(), entries: [] });
      node = node.children.get(label);
    }
    node.entries.push(entry);
  }
  return root;
}

function search(entries, query) {
  const terms = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return entries || [];
  return (entries || []).filter((entry) => {
    const haystack = [entry.name, entry.family, entry.ownership, ...entry.notes.map((note) => note.text), ...entry.files.map((file) => path.basename(file))].join(' ').toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

function snippet(name, operation = 'read', value = '1', language = 'zss') {
  if (language !== 'zss' && language !== 'ikemen-cns') throw new Error(`Map insertion is not validated for ${language || 'this language'}.`);
  if (operation === 'name') return name;
  if (operation === 'tableEntry') return `${name} = ${value}`;
  if (operation === 'read') return `map(${name})`;
  if (operation === 'compare') return `map(${name}) = ${value}`;
  if (language === 'ikemen-cns') throw new Error('CNS assignment insertion requires a controller-specific adapter. Use a read or comparison here.');
  if (operation === 'set') return `map(${name}) := ${value};`;
  if (operation === 'add') return `map(${name}) := map(${name}) + ${value};`;
  if (operation === 'subtract') return `map(${name}) := map(${name}) - ${value};`;
  throw new Error(`Unsupported map insertion operation: ${operation}`);
}

module.exports = { occurrences, aggregate, buildTree, search, snippet, suggestedPath, namespaceFor, classifyRest, sourceNotes, contractBlocks };
