'use strict';

function preserveFocus(api, filename, options = {}) {
  if (typeof options.preserveFocus === 'boolean') return options.preserveFocus;
  if (options.automatic === true) return true;
  return api.workspace.getConfiguration('ikemenZss', api.Uri.file(filename))
    .get('viewer.switchTabOnOpen', true) === false;
}

function placement(column, preserve) {
  return preserve ? {viewColumn:column, preserveFocus:true} : column;
}

function capture(api, preserve) {
  if (!preserve) return async () => {};
  const tracked = require('./viewer_group').trackedPanels;
  const panel = tracked().find(item => item.active);
  const editor = api.window.activeTextEditor;
  const group = api.window.tabGroups?.activeTabGroup, original = group?.activeTab;
  const tabsBefore = new Set((api.window.tabGroups?.all || []).flatMap(item => item.tabs));
  const preview = original?.isPreview === true;
  return async opened => {
    if (!original || !group.tabs.includes(original)) return;
    const active = api.window.tabGroups.activeTabGroup.activeTab;
    if (active === original && !opened?.active) return;
    const newlyOpened = !tabsBefore.has(active) && active?.label === opened?.title &&
      String(active.input?.viewType || '').endsWith(opened.viewType);
    const ownSelectedTab = active?.label === opened?.title &&
      String(active?.input?.viewType || '').endsWith(opened?.viewType);
    if (active !== original && !newlyOpened && !ownSelectedTab) return;
    if (panel) { if (tracked().includes(panel)) panel.reveal(panel.viewColumn, false); return; }
    if (editor && !editor.document.isClosed) await api.window.showTextDocument(editor.document, {
      viewColumn:editor.viewColumn,preserveFocus:false,preview
    });
    else if (api.window.tabGroups.activeTabGroup === group && api.commands?.executeCommand) {
      const index = group.tabs.indexOf(original);
      if (index >= 0) await api.commands.executeCommand('workbench.action.openEditorAtIndex',index);
    }
  };
}

module.exports = {preserveFocus, placement, capture};
