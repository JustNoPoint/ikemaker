const path = require('path');

async function moveEditorColumn(api, source = '') {
  const groups = api.window.tabGroups;
  const current = () => groups?.activeTabGroup?.viewColumn ?? api.ViewColumn.Active;
  const all = groups?.all || [];
  const type = tab => String(tab.input?.viewType || '').replace(/^mainThreadWebview-/, '');
  if (all.some(group => group.tabs.some(tab => type(tab) === 'ikemenTextCompanion'))) {
    await api.commands.executeCommand('ikemen.textToolbar.suspendForVisualViewer');
    return current();
  }
  // Recover the old Move Lab + native attack-source split, retaining both tabs.
  // Other user-arranged editor groups keep their layout.
  if (source && all.length === 2) {
    const key = path.resolve(source).toLowerCase();
    const isSource = tab => !type(tab) && tab.input?.uri?.scheme === 'file' &&
      path.resolve(tab.input.uri.fsPath).toLowerCase() === key;
    const isLab = tab => ['ikemenMoveLab', 'ikemenMoveConstants', 'ikemenHitDefEditor'].includes(type(tab));
    const peer = all.find(group => group !== groups.activeTabGroup);
    if (peer?.tabs.some(isSource) && all.every(group => group.tabs.every(tab => isLab(tab) || isSource(tab)))) {
      await api.commands.executeCommand('workbench.action.joinAllGroups');
    }
  }
  return current();
}

module.exports = { moveEditorColumn };
