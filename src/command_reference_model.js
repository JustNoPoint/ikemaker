'use strict';

const fs = require('fs');
const path = require('path');
const { defContext } = require('./character_context');
const { parseDef, sections, unquote } = require('./def_model');
const { parseCommands } = require('./command_movelist_model');
const { adjacentDocumentation } = require('./analyzer');

function sameFile(left, right) {
  return path.resolve(String(left || '')).toLowerCase() === path.resolve(String(right || '')).toLowerCase();
}

function commandReferencesInLine(lineText, options = {}) {
  const source = String(lineText || ''), references = [];
  let quote = '', start = -1;
  const candidate = (end) => {
    const owner = /\b(selfcommand|command)\s*(?:!?=)\s*$/i.exec(source.slice(0, start));
    if (quote !== '"' || start < 0 || !owner) return;
    const trigger = owner[1].toLowerCase(), prefix = source.slice(0, owner.index), redirected = trigger === 'command' && /(?:\b(?:player|helper|target|enemy|enemynear|partner)\s*\([^)]*\)|\b(?:root|parent|helper|target|enemy|enemynear|partner))\s*,\s*$/i.test(prefix);
    references.push({ name: source.slice(start + 1, end), start: start + 1, end, trigger, redirected });
  };
  for (let index = 0; index < source.length; index += 1) {
    const value = source[index];
    if (quote) {
      if (value !== quote) continue;
      let slashes = 0;
      for (let at = index - 1; at >= 0 && source[at] === '\\'; at -= 1) slashes += 1;
      if (slashes % 2) continue;
      candidate(index);
      quote = ''; start = -1; continue;
    }
    if (value === '"' || value === "'") { quote = value; start = index; continue; }
    if (value === '#' || (options.semicolonComments && value === ';')) break;
  }
  return references;
}

function commandReferenceAtPosition(lineText, character, options = {}) {
  const source = String(lineText || ''), cursor = Math.max(0, Math.min(Number(character) || 0, source.length));
  let quote = '', start = -1;
  const candidate = end => {
    if (quote !== '"' || start < 0 || cursor < start + 1 || cursor > end) return null;
    const owner = /\b(selfcommand|command)\s*(?:!?=)\s*$/i.exec(source.slice(0, start));
    if (!owner) return null;
    const trigger = owner[1].toLowerCase(), prefix = source.slice(0, owner.index), redirected = trigger === 'command' && /(?:\b(?:player|helper|target|enemy|enemynear|partner)\s*\([^)]*\)|\b(?:root|parent|helper|target|enemy|enemynear|partner))\s*,\s*$/i.test(prefix);
    return { name: source.slice(start + 1, end), start: start + 1, end, trigger, redirected };
  };
  for (let index = 0; index < source.length; index += 1) {
    const value = source[index];
    if (quote) {
      if (value !== quote) continue;
      let slashes = 0; for (let at = index - 1; at >= 0 && source[at] === '\\'; at -= 1) slashes += 1;
      if (slashes % 2) continue;
      const found = candidate(index); if (found) return found;
      quote = ''; start = -1; continue;
    }
    if (value === '"' || value === "'") { quote = value; start = index; continue; }
    if (value === '#' || (options.semicolonComments && value === ';')) break;
  }
  return candidate(source.length);
}

function directlyAssigns(definition, target, io = fs) {
  try {
    const document = parseDef(io.readFileSync(definition, 'utf8'), definition);
    return sections(document, 'files').some(section => (section.entries || []).some(entry => {
      const value = unquote(String(entry.value || '').trim()).trim();
      if (!value || value.includes(',')) return false;
      return sameFile(path.resolve(path.dirname(definition), value.replace(/[\\/]/g, path.sep)), target);
    }));
  } catch (_) { return false; }
}

function nearestCommandContexts(filename, io = fs) {
  let directory = path.dirname(path.resolve(filename));
  while (true) {
    let entries = [];
    try { entries = io.readdirSync(directory, { withFileTypes: true }); } catch (_) {}
    const contexts = entries
      .filter(entry => entry.isFile() && /\.def$/i.test(entry.name))
      .map(entry => defContext(path.join(directory, entry.name)))
      .filter(context => context?.commandFile);
    if (contexts.length) {
      const direct = contexts.filter(context => directlyAssigns(context.filename, filename, io));
      return direct.length ? direct : contexts;
    }
    if (path.basename(directory).toLowerCase() === 'chars') return [];
    const parent = path.dirname(directory);
    if (parent === directory) return [];
    directory = parent;
  }
}

function resolveCommandCatalog(filename, options = {}) {
  const io = options.io || fs, contexts = nearestCommandContexts(filename, io);
  if (!contexts.length) return { resolved: false, complete: false, names: [], definitions: [], files: [], owners: [] };
  const files = [...new Set(contexts.map(context => path.resolve(context.commandFile)))], names = new Set(), definitions = [];
  let complete = true;
  for (const commandFile of files) {
    let text;
    const open = (options.openDocuments || []).find(document => sameFile(document.fileName, commandFile));
    try {
      if (open && typeof open.getText === 'function') text = open.getText();
      else if (io.existsSync(commandFile)) text = io.readFileSync(commandFile, 'utf8');
      else { complete = false; continue; }
      const parsed = parseCommands(text, commandFile);
      for (const command of parsed.commands) if (command.name) {
        names.add(command.name);
        const line = command.entries.name?.line ?? command.startLine;
        const raw = parsed.lines[line] || '', equals = raw.indexOf('='), found = raw.indexOf(command.name, Math.max(equals + 1, 0));
        const documentation=adjacentDocumentation(parsed.lines,command.startLine,{commentMarker:';'}).documentation;
        definitions.push({ name: command.name, file: commandFile, line, start: found >= 0 ? found : 0, length: command.name.length, command: command.command, time: command.time, stepTime: command.stepTime,documentation });
      }
    } catch (_) { complete = false; }
  }
  return { resolved: true, complete, names: [...names], definitions, files, owners: contexts.map(context => context.filename) };
}

module.exports = { sameFile, commandReferencesInLine, commandReferenceAtPosition, directlyAssigns, nearestCommandContexts, resolveCommandCatalog };
