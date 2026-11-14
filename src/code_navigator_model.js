'use strict';

// Pure model for the Code Navigator tree. It decides which documents are navigable
// (ZSS plus legacy CNS-family text) and turns their source into exact-line tree nodes.
// No vscode dependency, so it can be tested directly.

const path = require('path');
const { parseZss, displayName, cleanHeading } = require('./parser');

// Legacy CNS-family files. .mfg is an ordinary CMD text file that some characters
// (for example HDBZ GotenksZ2.def: cmd = files/gotenks.mfg) assign explicitly.
const LEGACY_EXTENSIONS = Object.freeze(['cns', 'cmd', 'st', 'inp', 'jnp', 'mfg']);
const NAVIGABLE_EXTENSIONS = Object.freeze(['zss', ...LEGACY_EXTENSIONS]);
const WORKSPACE_GLOB = `**/*.{${NAVIGABLE_EXTENSIONS.join(',')}}`;
const WORKSPACE_EXCLUDE = '**/{.git,node_modules}/**';
const SOURCE_SUMMARY = 'ZSS, CNS, CMD, ST, MFG';

function extensionOf(fileName) {
  return path.extname(String(fileName || '')).slice(1).toLowerCase();
}

// Returns 'zss', 'legacy', or null. The file extension wins over the language id
// so a .mfg/.st file opened as plain text is still navigated as legacy code.
function navigatorFormat(document) {
  if (!document) return null;
  const extension = extensionOf(document.fileName || document.uri?.fsPath || document.uri?.path || '');
  if (extension === 'zss') return 'zss';
  if (LEGACY_EXTENSIONS.includes(extension)) return 'legacy';
  if (document.languageId === 'zss') return 'zss';
  if (document.languageId === 'ikemen-cns') return 'legacy';
  return null;
}

// Save/change refresh gate. Navigable documents refresh even when opened as
// plaintext/bat; zss/ikemen-cns/.def keep refreshing exactly as before.
// isAssignedFile is an optional cache-only check for DEF-assigned code files
// (e.g. config.txt); it must not touch the disk because this runs per keystroke.
function navigatorRefreshNeeded(document, isAssignedFile) {
  if (!document) return false;
  if (navigatorFormat(document)) return true;
  if (typeof isAssignedFile === 'function' && document.fileName && isAssignedFile(document.fileName)) return true;
  return ['zss', 'ikemen-cns'].includes(document.languageId) || /\.def$/i.test(document.fileName || '');
}

function formatLabel(fileName) {
  const extension = extensionOf(fileName);
  return NAVIGABLE_EXTENSIONS.includes(extension) ? extension.toUpperCase() : '';
}

function zssNodes(text) {
  return parseZss(String(text || '')).map((symbol) => ({
    kind: symbol.type,
    label: displayName(symbol),
    description: symbol.type === 'state' ? symbol.id : 'function',
    line: symbol.startLine,
    contextValue: symbol.type === 'state' ? 'zssState' : 'zssFunction',
    icon: symbol.type === 'state' ? 'symbol-class' : 'symbol-function',
    children: []
  }));
}

// The engine strips everything after the first ';' (strings.SplitN(line, ";", 2)).
function stripLegacyComment(line) {
  const index = String(line).indexOf(';');
  return index < 0 ? String(line) : String(line).slice(0, index);
}

// Uses the top-most meaningful line of the comment block directly above a header,
// so "; Stand Light Punch" wins over a later "; CNS difficulty: easy" note.
function legacyHeadingBefore(lines, headerLine) {
  const block = [];
  for (let index = headerLine - 1; index >= Math.max(0, headerLine - 8); index -= 1) {
    const match = /^\s*;\s?(.*)$/.exec(lines[index]);
    if (!match) break;
    block.unshift(match[1]);
  }
  for (const text of block) {
    const heading = cleanHeading(`# ${text}`);
    if (heading) return heading;
  }
  return '';
}

function legacyHeader(line) {
  const code = stripLegacyComment(line);
  const match = /^\s*\[([^\]]*)\]/.exec(code);
  return match ? match[1].replace(/\s+/g, ' ').trim() : null;
}

function quotedValue(value) {
  const trimmed = String(value || '').trim();
  const quoted = /^"([^"]*)"/.exec(trimmed);
  return quoted ? quoted[1] : trimmed;
}

function blockFields(lines, start, end) {
  const fields = {};
  for (let index = start; index < end; index += 1) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*(.*)$/.exec(stripLegacyComment(lines[index]));
    if (match && !(match[1].toLowerCase() in fields)) fields[match[1].toLowerCase()] = match[2].trim();
  }
  return fields;
}

function legacyNodes(text) {
  const lines = String(text || '').split(/\r?\n/);
  const headers = [];
  for (let line = 0; line < lines.length; line += 1) {
    const header = legacyHeader(lines[line]);
    if (header !== null) headers.push({ line, header });
  }
  const nodes = [];
  let currentState = null;
  headers.forEach((entry, index) => {
    const end = index + 1 < headers.length ? headers[index + 1].line : lines.length;
    const header = entry.header;
    const stateDef = /^statedef\s+(.+)$/i.exec(header);
    const controller = !stateDef && /^state\s+(.+)$/i.exec(header);
    if (stateDef) {
      const id = stateDef[1].split(',', 1)[0].trim();
      const heading = legacyHeadingBefore(lines, entry.line);
      currentState = {
        kind: 'state', label: heading ? `State ${id} — ${heading}` : `State ${id}`, description: id,
        line: entry.line, contextValue: 'legacyStateDef', icon: 'symbol-class', tooltip: `[${header}]`, children: []
      };
      nodes.push(currentState);
      return;
    }
    if (controller) {
      const type = blockFields(lines, entry.line + 1, end).type || '';
      const node = {
        kind: 'controller', label: header, description: type, line: entry.line,
        contextValue: 'legacyStateController', icon: 'symbol-method', tooltip: `[${header}]${type ? ` · type = ${type}` : ''}`, children: []
      };
      if (currentState) currentState.children.push(node); else nodes.push(node);
      return;
    }
    currentState = null;
    if (/^command$/i.test(header)) {
      const name = quotedValue(blockFields(lines, entry.line + 1, end).name);
      nodes.push({
        kind: 'command', label: name ? `Command "${name}"` : 'Command (unnamed)', description: 'command',
        line: entry.line, contextValue: 'legacyCommand', icon: 'symbol-key', tooltip: `[${header}]${name ? ` · name = "${name}"` : ''}`, children: []
      });
      return;
    }
    nodes.push({
      kind: 'section', label: `[${header}]`, description: 'section', line: entry.line,
      contextValue: 'legacySection', icon: 'symbol-namespace', tooltip: `[${header}]`, children: []
    });
  });
  return nodes;
}

function navigatorNodes(text, format) {
  if (format === 'zss') return zssNodes(text);
  if (format === 'legacy') return legacyNodes(text);
  return [];
}

function emptyDocumentNotice(format, fileName) {
  const base = path.basename(String(fileName || '') || 'this file');
  if (format === 'legacy') {
    return {
      label: 'No [Statedef], [State], or [Command] headers found',
      description: 'Add a [Statedef] or [Command] header, save, then use Refresh.',
      tooltip: `No navigable legacy section header was parsed in ${base}.`
    };
  }
  return {
    label: 'No authored states or functions found',
    description: 'Add a StateDef or Function, save, then use Refresh.',
    tooltip: `No navigable StateDef or Function declaration was parsed in ${base}.`
  };
}

module.exports = {
  LEGACY_EXTENSIONS, NAVIGABLE_EXTENSIONS, WORKSPACE_GLOB, WORKSPACE_EXCLUDE, SOURCE_SUMMARY,
  emptyDocumentNotice, extensionOf, formatLabel, legacyNodes, navigatorFormat, navigatorNodes, navigatorRefreshNeeded, stripLegacyComment, zssNodes
};
