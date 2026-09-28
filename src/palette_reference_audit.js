'use strict';

const fs = require('fs');
const path = require('path');

function coordinate(value) {
  const match = /^\s*(\d+)\s*,\s*(\d+)\s*$/.exec(String(value || ''));
  return match ? { group: Number(match[1]), number: Number(match[2]) } : null;
}

function scanPaletteReferenceText(filename, text) {
  const findings = [], source = String(text || ''), lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (!/\b(?:remappal|palno|pal\.defaults?)\b/i.test(lines[index])) continue;
    const window = lines.slice(index, Math.min(lines.length, index + 14)).join('\n');
    const pairs = [];
    for (const match of window.matchAll(/\b(source|dest(?:ination)?)\s*[:=]\s*([^;\r\n}]+)/gi)) pairs.push({ field: match[1].toLowerCase(), raw: match[2].trim(), coordinate: coordinate(match[2]) });
    if (!pairs.length) {
      const direct = /\b(?:remappal|palno|pal\.defaults?)\b[^\d\r\n]*([^;\r\n]+)/i.exec(lines[index]);
      if (direct) pairs.push({ field: 'value', raw: direct[1].trim(), coordinate: coordinate(direct[1]) });
    }
    findings.push({ filename, line: index + 1, text: lines[index].trim(), references: pairs, unresolved: !pairs.length || pairs.some((item) => !item.coordinate) });
  }
  return findings;
}

function auditPaletteReferences(files, shifted = []) {
  const moved = new Map((shifted || []).map((entry) => [`${entry.from.group},${entry.from.number}`, entry.to]));
  const findings = (files || []).flatMap((file) => scanPaletteReferenceText(file.filename, file.text));
  for (const finding of findings) for (const reference of finding.references) if (reference.coordinate) reference.shiftedTo = moved.get(`${reference.coordinate.group},${reference.coordinate.number}`) || null;
  return { findings, affected: findings.filter((finding) => finding.references.some((reference) => reference.shiftedTo)), unresolved: findings.filter((finding) => finding.unresolved) };
}

function referenceFiles(root, limit = 2000) {
  const output = [], queue = [path.resolve(root)], ignored = new Set(['.git', '.ikemen-tools', 'node_modules']);
  while (queue.length && output.length < limit) {
    const folder = queue.shift(); let entries; try { entries = fs.readdirSync(folder, { withFileTypes: true }); } catch (_) { continue; }
    for (const entry of entries) { if (ignored.has(entry.name)) continue; const filename = path.join(folder, entry.name); if (entry.isDirectory()) queue.push(filename); else if (/\.(?:zss|cns|st|cmd|def|lua)$/i.test(entry.name)) { try { output.push({ filename, text: fs.readFileSync(filename, 'utf8') }); } catch (_) {} if (output.length >= limit) break; } }
  }
  return output;
}

module.exports = { coordinate, scanPaletteReferenceText, auditPaletteReferences, referenceFiles };
