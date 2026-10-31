'use strict';

const { hash } = require('./mutation_safety');

const MAX_SOURCE_BYTES = 256 * 1024;
const MAX_VALUE_BYTES = 4096;
const MAP_NAME = /^[A-Za-z_][A-Za-z0-9_.]*$/;

function bytes(value) { return Buffer.byteLength(String(value || ''), 'utf8'); }
function freeze(value, seen = new WeakSet()) { if (!value || typeof value !== 'object' || seen.has(value)) return value; seen.add(value); for (const child of Object.values(value)) freeze(child, seen); return Object.freeze(value); }
function clone(value, seen = new WeakMap()) {
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);
  const copy = Array.isArray(value) ? [] : {};
  seen.set(value, copy);
  for (const [key, child] of Object.entries(value)) copy[key] = clone(child, seen);
  return copy;
}
function cleanValue(value) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error('Enter an initializer expression.');
  if (bytes(text) > MAX_VALUE_BYTES) throw new Error(`The initializer exceeds the ${MAX_VALUE_BYTES}-byte review limit.`);
  if(/[\u0000-\u001f\u007f]/.test(text))throw new Error('The initializer must be one control-free source expression.');
  if(/["']/.test(text))throw new Error('String-bearing Helper map initializers require a separately verified Nightly authoring path.');
  if(/[{}\[\];#]/.test(text)||/\/\/|\/\*|\*\/|:=|(?<![!<>=])=(?!=)/.test(text))throw new Error('The initializer must be one bounded numeric expression without comments, assignments, properties, or block delimiters.');
  let depth=0,at=0,sawNumber=false,sawCall=false;
  const token=/\s+|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[A-Za-z_$][A-Za-z0-9_.$]*|(?:&&|\|\||==|!=|<=|>=|\*\*)|[()+\-*/%,!~<>&|^]/y;
  while(at<text.length){token.lastIndex=at;const match=token.exec(text);if(!match)throw new Error('The initializer contains syntax outside the bounded numeric-expression grammar.');const part=match[0];if(/^\d|^\.\d/.test(part))sawNumber=true;if(part==='('){depth++;const prefix=text.slice(0,at).trimEnd();if(/[A-Za-z0-9_.$]$/.test(prefix))sawCall=true;}else if(part===')'&&--depth<0)throw new Error('The initializer has unbalanced parentheses.');at=token.lastIndex;}
  if(depth!==0)throw new Error('The initializer has unbalanced parentheses.');
  if(!sawNumber&&!sawCall)throw new Error('Enter a numeric expression, not a bare source name.');
  return text;
}
function cleanName(name) { const value = String(name || '').trim(); if (!MAP_NAME.test(value) || bytes(value) > 256) throw new Error('Choose one exact existing map name.'); return value; }
function maskLine(line, language) {
  const chars = [...String(line || '')]; let quote = '', escaped = false;
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index], next = chars[index + 1];
    if (quote) { chars[index] = ' '; if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === quote) quote = ''; continue; }
    if (char === '"' || char === "'") { quote = char; chars[index] = ' '; continue; }
    if (language === 'zss' && (char === '#' || char === '/' && next === '/')) { for (let at = index; at < chars.length; at += 1) chars[at] = ' '; break; }
    if (language === 'cns' && char === ';') { for (let at = index; at < chars.length; at += 1) chars[at] = ' '; break; }
  }
  return chars.join('');
}
function lineOffsets(text) { const rows = []; let start = 0; for (const part of String(text).split(/(?<=\n)/)) { const raw = part.replace(/\r?\n$/, ''); rows.push({ raw, start, end: start + raw.length }); start += part.length; } return rows; }
function maskSource(text, language) { return String(text).split(/(\r\n|\n|\r)/).map((part,index)=>index%2?part:maskLine(part,language)).join(''); }
function existingBindings(text, language) {
  const found = [];
  for (const row of lineOffsets(text)) {
    const code = maskLine(row.raw, language), pattern = language === 'zss' ? /\bmap\.([A-Za-z_][A-Za-z0-9_.]*)\s*:\s*([^;}]+)/gi : /^\s*map\.([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*(.+?)\s*$/gi;
    let match; while ((match = pattern.exec(code))) {
      const name = match[1], valueStart = row.start + match.index + match[0].indexOf(match[2]), valueEnd = valueStart + match[2].trimEnd().length;
      found.push(freeze({ name, normalizedName: name.toLowerCase(), value: String(text).slice(valueStart, valueEnd).trim(), valueStart, valueEnd }));
    }
  }
  return freeze(found);
}
function zssBlock(text) {
  const masked = maskSource(text, 'zss'), helper = /\bhelper\s*\{/ig, matches = [...masked.matchAll(helper)];
  if (matches.length !== 1) throw new Error('The selected ZSS source does not isolate exactly one Helper creation controller.');
  const open = masked.indexOf('{', matches[0].index), stack = []; let close = -1, maxDepth = 0;
  for (let at = open; at < masked.length; at += 1) { if (masked[at] === '{') { stack.push(at); maxDepth=Math.max(maxDepth,stack.length); } else if (masked[at] === '}') { stack.pop(); if (!stack.length) { close = at; break; } } }
  if (close < 0 || maxDepth !== 1 || masked.slice(close + 1).trim()) throw new Error('The selected ZSS Helper controller is structurally ambiguous.');
  return { open, close };
}
function cnsBlock(text) {
  const rows = lineOffsets(text), types = [];
  for (const row of rows) { const match = /^\s*type\s*=\s*([A-Za-z0-9_]+)/i.exec(maskLine(row.raw, 'cns')); if (match) types.push(match[1].toLowerCase()); }
  if (types.length !== 1 || types[0] !== 'helper' || rows.filter(row => /^\s*\[/.test(maskLine(row.raw, 'cns'))).length !== 1) throw new Error('The selected CNS/ST source does not isolate exactly one Helper controller section.');
  return { rows };
}
function replaceValue(text, binding, value) { return text.slice(0, binding.valueStart) + value + text.slice(binding.valueEnd); }
function addZss(text, name, value, block) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n', before = text.slice(0, block.close), lineStart = before.lastIndexOf('\n') + 1, closePrefix = before.slice(lineStart), multiline = before.includes('\n');
  if (multiline && /^\s*$/.test(closePrefix)) {
    const prior = before.slice(0, lineStart).replace(/\r?\n$/, ''), priorLine = prior.slice(prior.lastIndexOf('\n') + 1), indent = (/^\s*/.exec(priorLine)?.[0] || '') || `${/^\s*/.exec(closePrefix)?.[0] || ''}\t`, separator = /[;{]\s*$/.test(prior) ? '' : ';';
    return before.slice(0, lineStart) + separator + (separator ? eol : '') + indent + `map.${name}: ${value};` + eol + closePrefix + text.slice(block.close);
  }
  const separator = /[;{]\s*$/.test(before) ? (/[{]\s*$/.test(before) ? '' : ' ') : '; ';
  return before + separator + `map.${name}: ${value}` + text.slice(block.close);
}
function addCns(text, name, value) { const eol = text.includes('\r\n') ? '\r\n' : '\n'; return text + (text && !text.endsWith('\n') ? eol : '') + `map.${name} = ${value}`; }

function planHelperMapInitializer(component, entry, request = {}) {
  if (!component || component.kind !== 'helper' || !['zss', 'cns'].includes(component.syntax)) throw new Error('Select one exact ZSS or CNS/ST Helper creation controller.');
  const before = String(component.sourceText ?? component.text ?? '');
  if (!before || bytes(before) > MAX_SOURCE_BYTES || component.rangeHash !== hash(before)) throw new Error('The selected Helper controller source is stale, empty, or exceeds the review limit.');
  if (!entry || entry.category !== 'maps' || entry.assigned !== true || entry.status === 'unresolved') throw new Error('Choose an existing map from the exact assigned character catalog.');
  const name = cleanName(entry.name), value = cleanValue(request.value), language = component.syntax, structure=language==='zss'?zssBlock(before):cnsBlock(before), bindings = existingBindings(before, language), same = bindings.filter(item => item.normalizedName === name.toLowerCase()), mode = String(request.mode || (same.length ? 'replace' : 'add'));
  if (same.length > 1) throw new Error(`The Helper controller contains duplicate case-insensitive map.${name} initializers; resolve them in source first.`);
  if (same.length && mode !== 'replace') throw new Error(`map.${same[0].name} already exists. Explicitly choose Replace to change only its value.`);
  if (!same.length && mode !== 'add') throw new Error(`map.${name} is not initialized by this Helper controller, so there is nothing to replace.`);
  let after;
  if (same.length) after = replaceValue(before, same[0], value);
  else if (language === 'zss') after = addZss(before, name, value, structure);
  else after = addCns(before, name, value);
  if (after === before || bytes(after) > MAX_SOURCE_BYTES) throw new Error('The reviewed Helper initializer replacement is empty or exceeds the source limit.');
  return freeze({ schema: 'ikemaker.helper-map-initializer-plan', version: 1, componentId: component.stableId || component.id, sourceHash: component.sourceHash, rangeHash: component.rangeHash, catalogEntryId: String(entry.id || ''), mapName: name, receiver: 'spawned Helper map', operation: same.length ? 'replace' : 'add', value, before, after, beforeHash: hash(before), afterHash: hash(after), bindingsBefore: bindings, bindingsAfter: existingBindings(after, language) });
}
function planHelperFormMap(plan,entry,request={}){
 if(!plan||typeof plan!=='object'||!Array.isArray(plan.maps)||plan.maps.length>256)throw new Error('The loaded Helper form has no bounded creation-map plan.');
 if(!entry||entry.category!=='maps'||entry.assigned!==true||entry.status==='unresolved')throw new Error('Choose an existing map from the exact assigned character catalog.');
 const owned=clone(plan),name=cleanName(entry.name),value=cleanValue(request.value),maps=owned.maps,same=maps.map((item,index)=>({item,index})).filter(({item})=>String(item.name||'').toLowerCase()===name.toLowerCase()),mode=String(request.mode||(same.length?'replace':'add'));
 if(same.length>1)throw new Error(`The Helper form contains duplicate case-insensitive map.${name} initializers; resolve them first.`);
 if(same.length&&mode!=='replace')throw new Error(`map.${same[0].item.name} already exists. Explicitly choose Replace.`);
 if(!same.length&&mode!=='add')throw new Error(`map.${name} is not present, so there is nothing to replace.`);
 if(same.length)maps[same[0].index]={...same[0].item,value};else maps.push({name,value,purpose:'',direction:'private'});
 return freeze({operation:same.length?'replace':'add',mapName:name,value,plan:{...owned,maps},before:clone(plan.maps),after:clone(maps)});
}

module.exports = { MAX_SOURCE_BYTES, MAX_VALUE_BYTES, MAP_NAME, cleanValue, existingBindings, planHelperMapInitializer, planHelperFormMap };
