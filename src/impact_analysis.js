'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_EXTENSIONS = new Set(['.zss', '.cns', '.inp', '.cmd', '.air', '.def', '.lua', '.json', '.md', '.txt']);
function escapeRegex(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function referencePattern(value) {
  const text = String(value || '').trim();
  if (!text) throw new Error('An identifier is required.');
  return new RegExp(`(^|[^A-Za-z0-9_])(${escapeRegex(text)})(?=$|[^A-Za-z0-9_])`, 'i');
}
function scanFiles(filenames, needle, options = {}) {
  const maximumFiles = Math.max(1, Number(options.maximumFiles) || 1500), maximumBytes = Math.max(1024, Number(options.maximumBytes) || 2 * 1024 * 1024), maximumMatches = Math.max(1, Number(options.maximumMatches) || 500);
  const pattern = referencePattern(needle), matches = [], skipped = [], files = [...new Set(filenames.map((item) => path.resolve(item)))].slice(0, maximumFiles);
  for (const filename of files) {
    if (matches.length >= maximumMatches) break;
    const ext = path.extname(filename).toLowerCase(); if (!DEFAULT_EXTENSIONS.has(ext)) continue;
    let stat; try { stat = fs.statSync(filename); } catch (_) { skipped.push({ filename, reason: 'unreadable' }); continue; }
    if (!stat.isFile() || stat.size > maximumBytes) { if (stat.size > maximumBytes) skipped.push({ filename, reason: 'budget' }); continue; }
    const lines = fs.readFileSync(filename, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => { if (matches.length < maximumMatches && pattern.test(line)) matches.push({ filename, line: index + 1, text: line.trim().slice(0, 240) }); });
  }
  return { needle: String(needle), matches, skipped, scannedFiles: files.length, truncated: filenames.length > maximumFiles || matches.length >= maximumMatches };
}
function replacementPreview(result, replacement = '') {
  return { ...result, replacement: String(replacement), filesAffected: new Set(result.matches.map((item) => item.filename)).size, occurrences: result.matches.length };
}

module.exports = { DEFAULT_EXTENSIONS, referencePattern, scanFiles, replacementPreview };
