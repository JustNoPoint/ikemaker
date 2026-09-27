'use strict';

const fs = require('fs');
const path = require('path');
const { parseDef, sections, value, unquote } = require('./def_model');

function exists(filename) { return Boolean(filename && fs.existsSync(filename) && fs.statSync(filename).isFile()); }

function gameRoot(start) {
  let current = path.resolve(start || process.cwd());
  if (exists(current)) current = path.dirname(current);
  while (true) {
    if (fs.existsSync(path.join(current, 'Ikemen_GO.exe')) || fs.existsSync(path.join(current, 'external', 'script', 'main.lua'))) return current;
    const parent = path.dirname(current); if (parent === current) return ''; current = parent;
  }
}

function defContext(filename) {
  if (!exists(filename) || path.extname(filename).toLowerCase() !== '.def') return null;
  try {
    const document = parseDef(fs.readFileSync(filename, 'utf8'), filename), files = sections(document, 'files')[0];
    if (!files) return null;
    const resolve = (entry) => entry ? path.resolve(path.dirname(filename), unquote(entry)) : '';
    const movelist = value(files, 'movelist', '');
    return { filename, commandFile: resolve(value(files, 'cmd', '')), movelistFile: resolve(movelist), hasMovelist: Boolean(movelist) };
  } catch (_) { return null; }
}

const IGNORED_CHARACTER_DIRECTORIES = new Set([
  '.git', '.ikemen-tools', '.pnpm-store', 'node_modules',
  'archive', 'backup', 'backups', '_backup',
  'development', '_development', 'reference',
  'test', 'test-fixtures', 'offline',
  'system.management.automation.internal.host.internalhost'
]);

function ignoredCharacterDirectory(name) {
  const normalized = String(name || '').trim().toLowerCase();
  return !normalized || IGNORED_CHARACTER_DIRECTORIES.has(normalized)
    || normalized.startsWith('_backup_')
    || normalized.startsWith('backup_')
    || normalized.startsWith('archive_')
    || normalized.startsWith('.ikemaker-accidental-copy-quarantine');
}

function characterDefs(root) {
  const base = root && path.join(root, 'chars'); if (!base || !fs.existsSync(base)) return [];
  const result = [], visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!ignoredCharacterDirectory(entry.name)) visit(full);
      } else if (entry.isFile() && /\.def$/i.test(entry.name)) result.push(full);
    }
  };
  visit(base); return result;
}

function owningCharacterDefs(seed, preferred = '') {
  const root = gameRoot(seed), extension = path.extname(seed || '').toLowerCase(), initial = extension === '.def' ? defContext(seed) : null;
  if (initial && (initial.commandFile || initial.movelistFile)) return [initial.filename];
  if (!root) return [];
  const configured = preferred ? path.resolve(root, preferred) : '';
  const configuredContext = defContext(configured);
  const targetFile = extension !== '.def' && fs.existsSync(seed) && fs.statSync(seed).isFile() ? path.resolve(seed) : initial && initial.commandFile;
  const contexts = characterDefs(root).map(defContext).filter((item) => item && (item.commandFile || item.movelistFile));
  const owners = targetFile ? contexts.filter((item) => {
    const assigned = extension === '.dat' ? item.movelistFile : item.commandFile;
    return assigned && path.resolve(assigned).toLowerCase() === path.resolve(targetFile).toLowerCase();
  }) : [];
  if (owners.length) return owners.map((item) => item.filename).sort((a, b) => a.localeCompare(b));
  if (['.cmd', '.inp', '.jnp', '.dat'].includes(extension)) return [];
  if (configuredContext && (configuredContext.commandFile || configuredContext.movelistFile)) return [configuredContext.filename];
  return contexts.map((item) => item.filename).sort((a, b) => a.localeCompare(b));
}

module.exports = { gameRoot, defContext, ignoredCharacterDirectory, characterDefs, owningCharacterDefs };
