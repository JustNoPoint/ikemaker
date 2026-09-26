'use strict';

const path = require('path');

const DIRECT_VISUAL_ROUTES = Object.freeze({
  '.sff': 'ikemen.sffWorkspace',
  '.snd': 'ikemen.sndWorkspace'
});

function routeForFilename(filename) {
  return DIRECT_VISUAL_ROUTES[path.extname(String(filename || '')).toLowerCase()] || null;
}

function registerDirectAssetOpening(vscode, context) {
  const pending = new Set();

  function sameFile(left, right) {
    if (!left?.fsPath || !right?.fsPath) return false;
    return path.resolve(left.fsPath).toLowerCase() === path.resolve(right.fsPath).toLowerCase();
  }

  async function closeRedundantTextTabs(uri, viewType) {
    const tabs = [];
    for (const group of vscode.window.tabGroups?.all || []) {
      for (const tab of group.tabs || []) {
        const input = tab.input || {};
        // A TabInputText exposes `uri` but no custom-editor viewType. Close only
        // that redundant source tab after the visual editor has opened. AIR is
        // never routed here and intentionally retains its text editor.
        if (sameFile(input.uri, uri) && !input.viewType) tabs.push(tab);
      }
    }
    if (tabs.length && vscode.window.tabGroups?.close) await vscode.window.tabGroups.close(tabs, true);
    return tabs.length;
  }

  async function openVisual(uri, viewColumn, currentViewType = '') {
    if (!uri || uri.scheme !== 'file') return false;
    const viewType = routeForFilename(uri.fsPath);
    if (!viewType || currentViewType === viewType) return false;
    const key = `${viewType}:${path.resolve(uri.fsPath).toLowerCase()}`;
    if (pending.has(key)) return false;
    pending.add(key);
    try {
      await vscode.commands.executeCommand('vscode.openWith', uri, viewType, { preview: false, viewColumn });
      await closeRedundantTextTabs(uri, viewType);
      return true;
    } catch (error) {
      vscode.window.showErrorMessage(`IKEMaker could not open ${path.basename(uri.fsPath)} in its visual workspace: ${error.message}`);
      return false;
    } finally {
      setTimeout(() => pending.delete(key), 500);
    }
  }

  function routeEditor(editor) {
    if (!editor || editor.document?.uri?.scheme !== 'file') return;
    openVisual(editor.document.uri, editor.viewColumn).catch(() => {});
  }

  function routeExistingTabs() {
    for (const group of vscode.window.tabGroups?.all || []) {
      for (const tab of group.tabs || []) {
        const input = tab.input || {};
        const uri = input.uri || input.modified || input.original;
        openVisual(uri, group.viewColumn, input.viewType || '').catch(() => {});
      }
    }
    routeEditor(vscode.window.activeTextEditor);
  }

  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(routeEditor));
  setTimeout(routeExistingTabs, 100);
  setTimeout(routeExistingTabs, 900);
}

module.exports = { DIRECT_VISUAL_ROUTES, routeForFilename, registerDirectAssetOpening };
