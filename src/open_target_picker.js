'use strict';

const fs = require('fs');
const path = require('path');
const vscode = require('vscode');

function normalizedExtensions(filters = {}) {
  return [...new Set(Object.values(filters).flat().map((item) => String(item).replace(/^\./, '').toLowerCase()).filter(Boolean))];
}

function collectCandidateFiles(folder, options = {}) {
  const extensions = new Set((options.extensions || []).map((item) => String(item).replace(/^\./, '').toLowerCase()));
  const maxDepth = Number.isInteger(options.maxDepth) ? options.maxDepth : 3;
  const limit = Number.isInteger(options.limit) ? options.limit : 5000;
  const predicate = typeof options.predicate === 'function' ? options.predicate : () => true;
  const output = [];
  function visit(current, depth) {
    if (output.length >= limit || depth > maxDepth) return;
    let entries = [];
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch (_) { return; }
    entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    for (const entry of entries) {
      if (output.length >= limit) break;
      const filename = path.join(current, entry.name);
      if (entry.isDirectory()) { if (!['.git', 'node_modules'].includes(entry.name.toLowerCase())) visit(filename, depth + 1); continue; }
      if (!entry.isFile()) continue;
      const extension = path.extname(entry.name).slice(1).toLowerCase();
      if (extensions.size && !extensions.has(extension)) continue;
      try { if (predicate(filename)) output.push(path.resolve(filename)); } catch (_) {}
    }
  }
  if (folder && fs.existsSync(folder)) visit(path.resolve(folder), 0);
  return output;
}

async function chooseFromFolder(folder, options = {}) {
  const configured = options.includeAdditionalSourceExtensions ? (vscode.workspace.getConfiguration('ikemenZss').get('additionalSourceExtensions', []) || []) : [];
  const files = collectCandidateFiles(folder, {
    extensions: options.scanAllFiles ? [] : [...new Set([...(options.extensions || normalizedExtensions(options.filters)), ...configured])],
    maxDepth: options.maxDepth,
    limit: options.limit,
    predicate: options.predicate
  });
  if (!files.length) { await vscode.window.showWarningMessage(options.emptyMessage || `No compatible files were found in ${folder}.`); return ''; }
  if (files.length === 1) return files[0];
  const picked = await vscode.window.showQuickPick(files.map((filename) => ({
    label: path.basename(filename),
    description: path.relative(folder, filename) || filename,
    detail: filename,
    filename
  })), { title: options.resultTitle || options.title || 'Choose a file from this folder', placeHolder: `${files.length} compatible files found`, matchOnDescription: true, matchOnDetail: true });
  return picked?.filename || '';
}

async function chooseFileOrFolder(options = {}) {
  const choice = await vscode.window.showQuickPick(browseChoices(), { title: options.title || 'Open', placeHolder: options.placeHolder || 'Browse for a file or search inside a folder' });
  if (!choice) return '';
  if (choice.mode === 'file') {
    const filters = options.allowAllFiles ? { ...(options.filters || {}), 'All files': ['*'] } : options.filters;
    const picked = await vscode.window.showOpenDialog({ title: options.fileTitle || options.title || 'Choose a file', defaultUri: options.defaultUri, canSelectMany: false, canSelectFiles: true, canSelectFolders: false, filters });
    const filename = picked?.[0]?.fsPath || '';
    if (filename && options.predicate && !options.predicate(filename)) { await vscode.window.showWarningMessage(options.invalidMessage || 'That file is not valid for this workspace.'); return ''; }
    return filename;
  }
  const picked = await vscode.window.showOpenDialog({ title: options.folderTitle || 'Choose a folder to search', defaultUri: options.defaultUri, canSelectMany: false, canSelectFiles: false, canSelectFolders: true });
  return picked?.[0] ? chooseFromFolder(picked[0].fsPath, options) : '';
}

function browseChoices() {
  return [
    { label: '$(folder-opened) Browse folder…', description: 'Find compatible files inside a folder, then choose one.', mode: 'folder', alwaysShow: true },
    { label: '$(file) Browse for file…', description: 'Choose one compatible file.', mode: 'file', alwaysShow: true }
  ];
}

module.exports = { normalizedExtensions, collectCandidateFiles, chooseFromFolder, browseChoices, chooseFileOrFolder };
