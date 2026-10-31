'use strict';

const { enabledCapabilityIds } = require('./catalog_capability_filter');

function finding(line, start, length, severity, code, message, help) { return { line, start, length: Math.max(1, length), severity, code, message, help }; }

function withoutComment(line) {
  const source = String(line || ''); let quote = '';
  for (let index = 0; index < source.length; index += 1) {
    const value = source[index];
    if (quote) { if (value === quote && source[index - 1] !== '\\') quote = ''; continue; }
    if (value === '"' || value === "'") { quote = value; continue; }
    if (value === '#') return source.slice(0, index);
  }
  return source;
}

function withoutCommentsPreservingOffsets(text) { return String(text || '').split(/(\r?\n)/).map(part => /^\r?\n$/.test(part) ? part : withoutComment(part).padEnd(part.length, ' ')).join(''); }

function dynamicMapKeySites(text) {
  const lines = String(text || '').split(/\r?\n/), sites = [];
  for (let line = 0; line < lines.length; line += 1) {
    const source = withoutComment(lines[line]), pattern = /\bmap\s*\(/gi; let match;
    while ((match = pattern.exec(source))) {
      const open = match.index + match[0].lastIndexOf('('); let depth = 1, quote = '', close = -1;
      for (let index = open + 1; index < source.length; index += 1) {
        const value = source[index];
        if (quote) { if (value === quote && source[index - 1] !== '\\') quote = ''; continue; }
        if (value === '"' || value === "'") { quote = value; continue; }
        if (value === '(') depth += 1; else if (value === ')' && --depth === 0) { close = index; break; }
      }
      if (close < 0) continue;
      const key = source.slice(open + 1, close).trim();
      if (key && !/^[A-Za-z_][A-Za-z0-9_.]*$/.test(key)) {const start=open+1+source.slice(open+1,close).indexOf(key),rest=source.slice(close+1),mutation=/^\s*(:=|\+=)/.exec(rest),summary=/^\$[A-Za-z_][A-Za-z0-9_]*$/.test(key)?'scoped local key expression':/^"(?:\\.|[^"\\])*"$/.test(key)?`quoted key literal · ${Math.max(0,key.length-2)} source character(s)`: /^call\b/i.test(key)?'function-call key expression':/^ifelse\b/i.test(key)?'conditional key expression':'runtime key expression';sites.push({line,start,length:key.length,access:mutation?.[1]==='+='?'add':mutation?'write':'read',summary});}
      pattern.lastIndex = close + 1;
    }
  }
  return sites;
}

function dynamicMapKeyIssues(text, capabilities) {
  if (!capabilities || enabledCapabilityIds(capabilities).has('zss.dynamic-map-keys')) return [];
  const findings = [];
  for (const site of dynamicMapKeySites(text)) findings.push(finding(site.line, site.start, site.length, 'error', 'unsupported-dynamic-map-key', 'This map key is evaluated from a runtime string expression, but the selected engine target does not have verified dynamic map-key support.', 'Use a legacy bare map key for this target, or select an exact supporting Nightly build. IKEMaker will not guess the runtime key or change the project target.'));
  return findings;
}

function dynamicStateTypeIssues(text, capabilities) {
  if (!capabilities) return [];
  const supported = enabledCapabilityIds(capabilities).has('zss.dynamic-state-types'), sourceText=String(text || ''), lines = sourceText.split(/\r?\n/), findings = [];
  let inStateTypeSet = false, braceDepth = 0;
  const allowed = { type: new Set(['s','c','a','l','u']), statetype: new Set(['s','c','a','l','u']), movetype: new Set(['i','a','h','u']), physics: new Set(['s','c','a','n','u']) };
  const addField=(name,raw,line,start)=>{const literal = /^"([^"\\]*)"$/.exec(raw), conventional = /^[A-Za-z]$/.test(raw);if (literal && supported && !allowed[name].has(literal[1].toLowerCase())) findings.push(finding(line, start, raw.length, 'error', 'invalid-dynamic-state-type-value', `“${literal[1]}” is not a recognized ${name} value.`, `Use one of ${[...allowed[name]].map(value=>value.toUpperCase()).join(', ')}. IKEMaker will not rewrite the expression.`));else if (!conventional && !supported) findings.push(finding(line, start, raw.length, 'error', 'unsupported-dynamic-state-type', `${name} uses a runtime string expression, but the selected engine target does not have verified dynamic state-type support.`, 'Use the conventional literal form for this target, or select an exact supporting Nightly build. IKEMaker will not rewrite source or switch targets.'));};
  const lineAtOffset=offset=>{const before=sourceText.slice(0,offset),parts=before.split(/\r?\n/);return{line:parts.length-1,start:parts.at(-1).length};};
  const maskedText=withoutCommentsPreservingOffsets(sourceText),headerPattern=/\[\s*StateDef\b[\s\S]*?\]/gi;let headerMatch;
  while((headerMatch=headerPattern.exec(maskedText))){const field=/\b(type|statetype|movetype|physics)\s*:\s*([^;\]}]+)/gi;let match;while((match=field.exec(headerMatch[0]))){const name=match[1].toLowerCase(),raw=match[2].trim(),relative=match.index+match[0].lastIndexOf(match[2])+(match[2].length-match[2].trimStart().length),location=lineAtOffset(headerMatch.index+relative);addField(name,raw,location.line,location.start);}}
  for (let line = 0; line < lines.length; line += 1) {
    const source = withoutComment(lines[line]);
    if (/\bStateTypeSet\s*\{/i.test(source)) { inStateTypeSet = true; braceDepth = 0; }
    if (inStateTypeSet) { braceDepth += (source.match(/\{/g) || []).length - (source.match(/\}/g) || []).length; if (braceDepth <= 0 && source.includes('}')) inStateTypeSet = false; }
    const field = /\b(type|statetype|movetype|physics)\s*:\s*([^;\]}]+)/gi; let match;
    if (!inStateTypeSet && !/\bStateTypeSet\s*\{/i.test(source)) continue;
    while ((match = field.exec(source))) {
      const name = match[1].toLowerCase(), raw = match[2].trim(), start = match.index + match[0].lastIndexOf(match[2]) + (match[2].length - match[2].trimStart().length);addField(name,raw,line,start);
    }
  }
  return findings;
}

function runtimeStringSemanticsIssues(text, capabilities) {
  if (!capabilities || !enabledCapabilityIds(capabilities).has('zss.runtime-strings')) return [];
  const lines = String(text || '').split(/\r?\n/), findings = [], quoted = '"(?:\\\\.|[^"\\\\])*"';
  for (let line = 0; line < lines.length; line += 1) {
    const source = withoutComment(lines[line]); let match;
    const arithmetic = new RegExp(`(${quoted})\\s*(\\+|-|\\*|/|%|\\*\\*|<=?|>=?)|(?:\\+|-|\\*|/|%|\\*\\*|<=?|>=?)\\s*(${quoted})`, 'g');
    while ((match = arithmetic.exec(source))) findings.push(finding(line, match.index, match[0].length, 'warning', 'string-numeric-coercion', 'A runtime string used by arithmetic or ordering is converted to numeric zero; IKEMEN does not concatenate strings or perform lexical ordering.', 'Use an explicit numeric expression, or compare strings with = or !=. IKEMaker will not guess a conversion.'));
    const condition = new RegExp(`\\b(if|while)\\s+(${quoted})\\s*(?=\\{|$)`, 'g');
    while ((match = condition.exec(source))) findings.push(finding(line, match.index + match[0].indexOf(match[2]), match[2].length, 'warning', 'string-boolean-coercion', 'A runtime string used directly as a condition becomes false because strings coerce to numeric zero.', 'Use an explicit string comparison. String equality is case-insensitive on this engine target.'));
    const comparison = new RegExp(`(${quoted})\\s*(!=|==|=)\\s*(${quoted}|[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+))`, 'g');
    while ((match = comparison.exec(source))) {
      const mixed = !String(match[3]).startsWith('"');
      findings.push(finding(line, match.index, match[0].length, 'information', mixed ? 'string-numeric-comparison' : 'string-comparison-case-insensitive', mixed ? 'A string compared with a number is never equal; != is always true.' : 'Runtime string equality and inequality are case-insensitive.', mixed ? 'Compare values of the same kind when this is not intentional.' : 'No change is required when case-insensitive comparison is intended.'));
    }
  }
  return findings;
}

module.exports = { dynamicMapKeySites, dynamicMapKeyIssues, dynamicStateTypeIssues, runtimeStringSemanticsIssues };
