'use strict';

const MAX_SOURCE_BYTES = 4 * 1024 * 1024;
const MAX_SYMBOLS = 8192;

function usefulComment(lines, line, marker) {
  for (let index = line - 1; index >= Math.max(0, line - 8); index -= 1) {
    const raw = String(lines[index] || '');
    if (!raw.trim()) continue;
    const match = marker.exec(raw);
    if (!match) break;
    const value = match[1].replace(/^[-=_#*|\s]+|[-=_#*|\s]+$/g, '').trim();
    if (value && !/^[-=_#*|]+$/.test(value)) return value;
  }
  return '';
}

function cnsOutline(text) {
  const source = String(text || ''); if (Buffer.byteLength(source, 'utf8') > MAX_SOURCE_BYTES) return [];
  const lines = source.split(/\r?\n/), sections = [];
  for (let line = 0; line < lines.length; line += 1) {
    const match = /^\s*\[\s*([^\]]+)\s*\]/.exec(lines[line].replace(/;.*/, ''));
    if (!match) continue;
    const body = match[1].trim(), stateDef = /^statedef\s+(.+)$/i.exec(body), state = /^state\s+([^,]+)(?:,\s*(.*))?$/i.exec(body);
    sections.push({
      line,
      endLine: lines.length - 1,
      body,
      kind: stateDef ? 'stateDef' : state ? 'controller' : 'section',
      id: String(stateDef?.[1] || state?.[1] || body).trim(),
      authoredLabel: String(state?.[2] || '').trim(),
      heading: usefulComment(lines, line, /^\s*;\s?(.*)$/)
    });
    if (sections.length >= MAX_SYMBOLS) break;
  }
  for (let index = 0; index < sections.length - 1; index += 1) sections[index].endLine = sections[index + 1].line - 1;
  const result = []; let currentOwner = null;
  for (const section of sections) {
    if (section.kind !== 'controller') {
      const label = section.kind === 'stateDef' ? `StateDef ${section.id}` : section.body;
      const symbol = { ...section, label: section.heading ? `${label} — ${section.heading}` : label, detail: section.kind === 'stateDef' ? 'State definition' : 'CNS section', children: [] };
      result.push(symbol);
      currentOwner = section.kind === 'stateDef' ? symbol : null;
      continue;
    }
    const source = lines.slice(section.line + 1, section.endLine + 1), type = source.map(value => /^\s*type\s*=\s*([A-Za-z_][A-Za-z0-9_]*)/i.exec(value.replace(/;.*/, ''))).find(Boolean)?.[1] || 'State controller';
    const suffix = section.authoredLabel || section.heading;
    const child = { ...section, label: suffix ? `${type} — ${suffix}` : `${type} (${section.id})`, detail: `[State ${section.id}]` };
    if (currentOwner) {
      currentOwner.children.push(child);
      currentOwner.endLine = Math.max(currentOwner.endLine, section.endLine);
    } else result.push({ ...child, children: [] });
  }
  return result;
}

function airOutline(text) {
  const source = String(text || ''); if (Buffer.byteLength(source, 'utf8') > MAX_SOURCE_BYTES) return [];
  const lines = source.split(/\r?\n/), actions = [];
  for (let line = 0; line < lines.length && actions.length < MAX_SYMBOLS; line += 1) { const match = /^\s*\[\s*Begin\s+Action\s+(-?\d+)\s*\]/i.exec(lines[line].replace(/;.*/, '')); if (match) actions.push({ number: Number(match[1]), line }); }
  return actions.map((action, index) => {
    const line = action.line, endLine = Math.max(line, index + 1 < actions.length ? actions[index + 1].line - 1 : lines.length - 1), heading = usefulComment(lines, line, /^\s*;\s?(.*)$/); let frames = 0;
    for (let cursor = line + 1; cursor <= endLine; cursor += 1) { const code = lines[cursor].replace(/;.*/, '').trim(), parts = code.split(',').map(value => value.trim()); if (parts.length >= 5 && parts.slice(0, 5).every(value => /^-?\d+$/.test(value))) frames += 1; }
    const base = `Action ${action.number}`;
    return { line, endLine, label: heading ? `${base} — ${heading}` : base, detail: `${frames} authored frame${frames === 1 ? '' : 's'}`, kind: 'action', children: [] };
  });
}

function range(vscode, document, startLine, endLine) {
  const start = Math.max(0, Math.min(startLine, document.lineCount - 1)), end = Math.max(start, Math.min(endLine, document.lineCount - 1));
  return new vscode.Range(start, 0, end, document.lineAt(end).text.length);
}

function selection(vscode, document, line) {
  const bounded = Math.max(0, Math.min(line, document.lineCount - 1));
  return new vscode.Range(bounded, 0, bounded, document.lineAt(bounded).text.length);
}

function registerNativeDocumentOutlines(vscode, context) {
  const provider = parser => ({ provideDocumentSymbols(document) {
    return parser(document.getText()).map(entry => {
      const kind = entry.kind === 'action' ? (vscode.SymbolKind.Array ?? vscode.SymbolKind.Namespace) : entry.kind === 'stateDef' ? vscode.SymbolKind.Class : vscode.SymbolKind.Namespace;
      const symbol = new vscode.DocumentSymbol(entry.label, entry.detail, kind, range(vscode, document, entry.line, entry.endLine), selection(vscode, document, entry.line));
      symbol.children = (entry.children || []).map(child => new vscode.DocumentSymbol(child.label, child.detail, vscode.SymbolKind.Method, range(vscode, document, child.line, child.endLine), selection(vscode, document, child.line)));
      return symbol;
    });
  } });
  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider({ language: 'ikemen-cns' }, provider(cnsOutline)),
    vscode.languages.registerDocumentSymbolProvider({ language: 'ikemen-air' }, provider(airOutline))
  );
}

module.exports = { airOutline, cnsOutline, registerNativeDocumentOutlines, usefulComment };
