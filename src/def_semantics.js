'use strict';

const path = require('path');

const FILE_VALUE = /(?:^|[\\/])[^;]+\.(?:sff|snd|air|cns|zss|cmd|def|lua|ogg|mp3|wav|flac|fnt|ttf|otf|png|pcx|spr)(?:\s*$|\s*,)/i;
const DEFAULT_COMMON_MARKERS = ['common', 'shared', 'template', 'universal', 'external'];

function inside(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function cleanValue(value) { return String(value || '').trim().replace(/^['"]|['"]$/g, ''); }

function classifyReference(defFilename, key, rawValue, markers = DEFAULT_COMMON_MARKERS) {
  const value = cleanValue(rawValue), normalized = value.replace(/\\/g, '/').toLowerCase();
  if (!value || !FILE_VALUE.test(value)) return null;
  if (/^(?:stcommon|common|commonstates?)$/i.test(String(key || '').trim())) return { ownership: 'common', reason: `${key} is a shared/common assignment` };
  const marker = (markers || []).map((item) => String(item).trim().toLowerCase()).filter(Boolean).find((item) => normalized.split('/').includes(item));
  if (marker) return { ownership: 'common', reason: `path contains the shared marker “${marker}”` };
  const directory = path.dirname(defFilename), resolved = path.resolve(directory, value);
  if (!inside(directory, resolved)) return { ownership: 'common', reason: 'reference resolves outside this DEF folder' };
  return { ownership: 'character', reason: 'reference resolves inside this DEF folder' };
}

function references(text, filename, markers = DEFAULT_COMMON_MARKERS) {
  const output = [], lines = String(text || '').split(/\r?\n/); let section = '';
  for (let line = 0; line < lines.length; line += 1) {
    const source = lines[line], heading = /^\s*\[([^\]]+)\]/.exec(source); if (heading) { section = heading[1].trim(); continue; }
    if (!/^(?:files|music|bgdef|info|storymode|characters|stages)$/i.test(section)) continue;
    const assignment = /^(\s*)([^;=#]+?)(\s*=\s*)([^;]*?)(\s*)(?:;.*)?$/.exec(source); if (!assignment) continue;
    const key = assignment[2].trim(), raw = assignment[4], value = raw.trim(), classification = classifyReference(filename, key, value, markers); if (!classification) continue;
    const start = assignment[1].length + assignment[2].length + assignment[3].length + raw.indexOf(value);
    output.push({ line, start, length: value.length, key, value, ...classification });
  }
  return output;
}

function registerDefSemanticHighlighting(vscode, context) {
  const legend = new vscode.SemanticTokensLegend(['ikemenCharacterReference', 'ikemenCommonReference']);
  const selector = { language: 'ikemen-def', scheme: 'file' };
  context.subscriptions.push(
    vscode.languages.registerDocumentSemanticTokensProvider(selector, {
      provideDocumentSemanticTokens(document) {
        const markers = vscode.workspace.getConfiguration('ikemenZss', document.uri).get('defCommonPathMarkers', DEFAULT_COMMON_MARKERS);
        const builder = new vscode.SemanticTokensBuilder(legend);
        for (const item of references(document.getText(), document.uri.fsPath, markers)) builder.push(item.line, item.start, item.length, item.ownership === 'common' ? 1 : 0, 0);
        return builder.build();
      }
    }, legend),
    vscode.languages.registerHoverProvider(selector, {
      provideHover(document, position) {
        const markers = vscode.workspace.getConfiguration('ikemenZss', document.uri).get('defCommonPathMarkers', DEFAULT_COMMON_MARKERS);
        const item = references(document.getText(), document.uri.fsPath, markers).find((entry) => entry.line === position.line && position.character >= entry.start && position.character < entry.start + entry.length);
        if (!item) return undefined;
        const label = item.ownership === 'common' ? 'Shared / common reference' : 'Character-local reference';
        return new vscode.Hover(new vscode.MarkdownString(`**${label}**\n\n${item.reason}.`), new vscode.Range(item.line, item.start, item.line, item.start + item.length));
      }
    })
  );
}

module.exports = { DEFAULT_COMMON_MARKERS, classifyReference, references, registerDefSemanticHighlighting };
