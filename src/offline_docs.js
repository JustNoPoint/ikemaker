'use strict';

const fs = require('fs');
const path = require('path');
const { fetchText } = require('./updater');
const { transactionalWrite } = require('./mutation_safety');

const OFFLINE_SOURCES = [
  { id: 'official-wiki-home', label: 'Official IKEMEN Wiki — Home', url: 'https://raw.githubusercontent.com/wiki/ikemen-engine/Ikemen-GO/Home.md', filename: 'official-wiki-home.md' },
  { id: 'official-wiki-lua', label: 'Official IKEMEN Wiki — Lua', url: 'https://raw.githubusercontent.com/wiki/ikemen-engine/Ikemen-GO/Lua.md', filename: 'official-wiki-lua.md' },
  { id: 'official-wiki-screenpack', label: 'Official IKEMEN Wiki — Screenpack features', url: 'https://raw.githubusercontent.com/wiki/ikemen-engine/Ikemen-GO/Screenpack-features.md', filename: 'official-wiki-screenpack.md' },
  { id: 'merged-sctrl', label: 'IKEMEN 1.0 documentation — State controllers', url: 'https://potsmugen.github.io/ikemen-merged-docs/sctrl', filename: 'merged-sctrl.html' },
  { id: 'merged-triggers', label: 'IKEMEN 1.0 documentation — Triggers', url: 'https://potsmugen.github.io/ikemen-merged-docs/triggers', filename: 'merged-triggers.html' },
  { id: 'merged-redirections', label: 'IKEMEN 1.0 documentation — Redirections', url: 'https://potsmugen.github.io/ikemen-merged-docs/redirections', filename: 'merged-redirections.html' }
];

function manifestPath(context) { return path.join(context.globalStorageUri.fsPath, 'offline-docs', 'manifest.json'); }
function readManifest(context) { try { return JSON.parse(fs.readFileSync(manifestPath(context), 'utf8')); } catch (_) { return { updatedAt: null, sources: {} }; } }
function bundledRoot(context) { return path.join(context.extensionUri.fsPath, 'data', 'offline-docs'); }

async function openOfflineLibrary(vscode, context) {
  const bundledIndex = path.join(bundledRoot(context), 'reference', 'index.html');
  const manifest = readManifest(context);
  if (fs.existsSync(bundledIndex) && !Object.values(manifest.sources || {}).some(item => item.ok)) return vscode.env.openExternal(vscode.Uri.file(bundledIndex));
  const lines = ['# IKEMEN Offline Documentation Library', '', 'Bundled guidance is always available. Downloaded snapshots are updated only when you request it.', '', '## Bundled guidance'];
  if (fs.existsSync(bundledIndex)) lines.push(`[Complete bundled reference library](${vscode.Uri.file(bundledIndex).toString()})`, '');
  for (const file of fs.readdirSync(bundledRoot(context)).filter((name) => name.endsWith('.md')).sort()) lines.push(`- [${file}](file:///${path.join(bundledRoot(context), file).replace(/\\/g, '/')})`);
  lines.push('', '## Downloaded upstream snapshots', manifest.updatedAt ? `Last updated: ${manifest.updatedAt}` : 'No downloaded snapshots yet.');
  for (const source of OFFLINE_SOURCES) {
    const item = manifest.sources[source.id], target = path.join(context.globalStorageUri.fsPath, 'offline-docs', source.filename);
    lines.push(item && item.ok ? `- [${source.label}](file:///${target.replace(/\\/g, '/')})${item.stale ? ' — last saved copy; latest update failed' : ''}` : `- ${source.label} — ${item && item.error ? `unavailable: ${item.error}` : 'not downloaded'}`);
  }
  lines.push('', 'Use **IKEMEN: Update Offline Documentation Library** to download reviewed upstream copies.');
  const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: lines.join('\n') });
  await vscode.window.showTextDocument(document, { preview: false });
}

async function updateOfflineLibrary(vscode, context) {
  const choice = await vscode.window.showInformationMessage('Download current official wiki and IKEMEN 1.0 documentation into VS Code offline storage? Existing downloaded copies will be replaced; project files are untouched.', { modal: true }, 'Update Library');
  if (choice !== 'Update Library') return;
  const directory = path.dirname(manifestPath(context)); await fs.promises.mkdir(directory, { recursive: true });
  const previous = readManifest(context);
  const manifest = { updatedAt: new Date().toISOString(), sources: {} };
  await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Updating IKEMEN offline documentation', cancellable: false }, async (progress) => {
    for (let index = 0; index < OFFLINE_SOURCES.length; index += 1) {
      const source = OFFLINE_SOURCES[index]; progress.report({ message: source.label, increment: 100 / OFFLINE_SOURCES.length });
      try { const text = await fetchText(source.url); transactionalWrite(fs, path.join(directory, source.filename), text, {label:'update-offline-document',backup:false,journal:false}); manifest.sources[source.id] = { ok: true, url: source.url, bytes: Buffer.byteLength(text), updatedAt:manifest.updatedAt }; }
      catch (error) { const last = previous.sources?.[source.id]; manifest.sources[source.id] = last?.ok && fs.existsSync(path.join(directory, source.filename)) ? {...last,stale:true,error:error.message,lastAttempt:manifest.updatedAt} : { ok: false, url: source.url, error: error.message }; }
    }
  });
  transactionalWrite(fs, manifestPath(context), `${JSON.stringify(manifest, null, 2)}\n`, {label:'update-offline-manifest',backup:false,journal:false});
  const successful = Object.values(manifest.sources).filter((item) => item.ok && !item.stale).length;
  vscode.window.showInformationMessage(`Offline documentation updated: ${successful}/${OFFLINE_SOURCES.length} sources downloaded.`);
  return openOfflineLibrary(vscode, context);
}

function registerOfflineDocs(vscode, context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('ikemen.docs.openOffline', () => openOfflineLibrary(vscode, context)),
    vscode.commands.registerCommand('ikemen.docs.updateOffline', () => updateOfflineLibrary(vscode, context))
  );
}

module.exports = { OFFLINE_SOURCES, readManifest, openOfflineLibrary, updateOfflineLibrary, registerOfflineDocs };
