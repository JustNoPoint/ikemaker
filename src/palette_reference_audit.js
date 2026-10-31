'use strict';

const fs = require('fs');
const path = require('path');

function coordinate(value) {
  const match = /^\s*(\d+)\s*,\s*(\d+)\s*$/.exec(String(value || ''));
  return match ? { group: Number(match[1]), number: Number(match[2]) } : null;
}

function scanPaletteReferenceText(filename, text, options = {}) {
  const findings = [], source = String(text || ''), lines = source.split(/\r?\n/), lineStarts=[],maxFindings=options.maxFindings===undefined?Number.MAX_SAFE_INTEGER:Math.max(0,Number(options.maxFindings)||0),maxOccurrences=options.maxOccurrences===undefined?Number.MAX_SAFE_INTEGER:Math.max(0,Number(options.maxOccurrences)||0);let cursor=0,occurrenceCount=0,incomplete=false;for(const line of lines){lineStarts.push(cursor);cursor+=line.length+(source.slice(cursor+line.length,cursor+line.length+2)==='\r\n'?2:1)}
  for (let index = 0; index < lines.length; index += 1) {
    if (!/\b(?:remappal|palno|pal\.defaults?)\b/i.test(lines[index])) continue;
    if(findings.length>=maxFindings||occurrenceCount>=maxOccurrences){incomplete=true;break}
    const window = lines.slice(index, Math.min(lines.length, index + 14)).join('\n');
    const pairs = [];
    for (const match of window.matchAll(/\b(source|dest(?:ination)?)\s*[:=]\s*([^;\r\n}]+)/gi)) {if(occurrenceCount+pairs.length>=maxOccurrences){incomplete=true;break}const raw=match[2],trimmed=raw.trim(),leading=raw.indexOf(trimmed),start=lineStarts[index]+match.index+match[0].indexOf(raw)+leading;pairs.push({ field: match[1].toLowerCase(), raw: trimmed, coordinate: coordinate(raw), start, end:start+trimmed.length });}
    if (!pairs.length) {
      const direct = /\b(?:remappal|palno|pal\.defaults?)\b[^\d\r\n]*([^;\r\n]+)/i.exec(lines[index]);
      if (direct) {if(occurrenceCount>=maxOccurrences){incomplete=true;break}const raw=direct[1],trimmed=raw.trim(),start=lineStarts[index]+direct.index+direct[0].indexOf(raw)+raw.indexOf(trimmed);pairs.push({ field: 'value', raw: trimmed, coordinate: coordinate(raw), start, end:start+trimmed.length });}
    }
    findings.push({ filename, line: index + 1, text: lines[index].trim(), references: pairs, unresolved: !pairs.length || pairs.some((item) => !item.coordinate) });
    occurrenceCount+=pairs.length;if(incomplete)break;
  }
  Object.defineProperty(findings,'summary',{value:{findingCount:findings.length,occurrenceCount,incomplete},enumerable:false});
  return findings;
}

function auditPaletteReferences(files, shifted = [], options = {}) {
  const moved = new Map((shifted || []).map((entry) => [`${entry.from.group},${entry.from.number}`, entry.to]));
  const maxFindings=Math.max(1,Number(options.maxFindings)||Number.MAX_SAFE_INTEGER),maxOccurrences=Math.max(1,Number(options.maxOccurrences)||Number.MAX_SAFE_INTEGER),findings=[];let occurrenceCount=0,incomplete=false;
  for(const file of files||[]){const scanned=scanPaletteReferenceText(file.filename,file.text,{maxFindings:maxFindings-findings.length,maxOccurrences:maxOccurrences-occurrenceCount});findings.push(...scanned);occurrenceCount+=scanned.summary.occurrenceCount;if(scanned.summary.incomplete){incomplete=true;break}}
  for (const finding of findings) for (const reference of finding.references) if (reference.coordinate) reference.shiftedTo = moved.get(`${reference.coordinate.group},${reference.coordinate.number}`) || null;
  return { findings, affected: findings.filter((finding) => finding.references.some((reference) => reference.shiftedTo)), unresolved: findings.filter((finding) => finding.unresolved), incomplete, findingCount:findings.length, occurrenceCount };
}

function referenceFiles(root, limit = 2000, options = {}) {
  const output = [], queue = [path.resolve(root)], ignored = new Set(['.git', '.ikemen-tools', 'node_modules']), maxFileBytes=Math.max(1,Number(options.maxFileBytes)||2*1024*1024),maxTotalBytes=Math.max(maxFileBytes,Number(options.maxTotalBytes)||32*1024*1024);let totalBytes=0,skippedLarge=0,skippedUnsafe=0,limitReached=false;
  while (queue.length && output.length < limit) {
    const folder = queue.shift(); let entries; try { entries = fs.readdirSync(folder, { withFileTypes: true }); } catch (_) { skippedUnsafe++; continue; }
    for (const entry of entries) { if (ignored.has(entry.name)) continue; const filename = path.join(folder, entry.name); if(entry.isSymbolicLink()){skippedUnsafe++;continue}if (entry.isDirectory()) queue.push(filename); else if (/\.(?:zss|cns|st|cmd|def|lua)$/i.test(entry.name)) { try { const before=fs.lstatSync(filename);if(!before.isFile()||before.isSymbolicLink()){skippedUnsafe++;continue}if(before.size>maxFileBytes||totalBytes+before.size>maxTotalBytes){skippedLarge++;continue}const bytes=fs.readFileSync(filename),after=fs.lstatSync(filename);if(!after.isFile()||after.isSymbolicLink()||before.size!==after.size||before.mtimeMs!==after.mtimeMs){skippedUnsafe++;continue}totalBytes+=bytes.length;output.push({ filename, text: bytes.toString('utf8') }); } catch (_) { skippedUnsafe++; } if (output.length >= limit) {limitReached=true;break;} } }
  }
  Object.defineProperty(output,'summary',{value:{scannedFileCount:output.length,totalBytes,maxFileBytes,maxTotalBytes,limit,limitReached:limitReached||queue.length>0,skippedLarge,skippedUnsafe,incomplete:limitReached||queue.length>0||skippedLarge>0||skippedUnsafe>0},enumerable:false});
  return output;
}

module.exports = { coordinate, scanPaletteReferenceText, auditPaletteReferences, referenceFiles };
