'use strict';

const { parseDef } = require('./def_model');

function outline(text, filename = '') {
  const parsed = parseDef(text, filename), sections = parsed.sections.filter(section => section.name);
  return sections.map((section, index) => {
    const next = sections[index + 1], endLine = Math.max(section.line, (next ? next.line : parsed.lines.length) - 1);
    const children = section.entries.map(entry => ({
      label: entry.key,
      detail: entry.value,
      kind: section.normalized === 'map' ? 'map' : section.normalized === 'constants' ? 'constant' : section.normalized === 'files' ? 'file' : 'property',
      line: entry.line,
      start: Math.max(0, parsed.lines[entry.line].indexOf(entry.key)),
      length: entry.key.length
    }));
    return { label: `[${section.name}]`, detail: `${children.length} entr${children.length === 1 ? 'y' : 'ies'}`, kind:'section', startLine:section.line, endLine, children };
  });
}

function register(vscode, context) {
  const selector = [{ language:'ikemen-def', scheme:'file' }, { scheme:'file', pattern:'**/*.def' }];
  const range=(document,start,end)=>new vscode.Range(start,0,end,document.lineAt(end).text.length), selection=(document,line,start,length)=>new vscode.Range(line,start,line,start+length);
  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(selector,{provideDocumentSymbols(document){return outline(document.getText(),document.fileName).map(section=>{const line=document.lineAt(section.startLine).text,start=Math.max(0,line.indexOf('[')),symbol=new vscode.DocumentSymbol(section.label,section.detail,vscode.SymbolKind.Namespace,range(document,section.startLine,section.endLine),selection(document,section.startLine,start,section.label.length));symbol.children=section.children.map(entry=>new vscode.DocumentSymbol(entry.label,entry.detail,entry.kind==='map'?(vscode.SymbolKind.Key??vscode.SymbolKind.Variable):entry.kind==='constant'?(vscode.SymbolKind.Constant??vscode.SymbolKind.Variable):entry.kind==='file'?(vscode.SymbolKind.File??vscode.SymbolKind.Property):vscode.SymbolKind.Property,range(document,entry.line,entry.line),selection(document,entry.line,entry.start,entry.length)));return symbol;});}}),
    vscode.languages.registerFoldingRangeProvider(selector,{provideFoldingRanges(document){return outline(document.getText(),document.fileName).filter(section=>section.endLine>section.startLine).map(section=>new vscode.FoldingRange(section.startLine,section.endLine,vscode.FoldingRangeKind.Region));}})
  );
}

module.exports={outline,register};
