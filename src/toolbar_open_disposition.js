'use strict';

const VALUES = Object.freeze(['beside', 'window', 'close-tab', 'close-window']);

function valid(value) { return VALUES.includes(value); }

async function apply(vscode, disposition) {
  if (!valid(disposition)) return false;
  const command = {
    beside: 'workbench.action.moveEditorToRightGroup',
    window: 'workbench.action.moveEditorToNewWindow',
    'close-tab': 'workbench.action.closeActiveEditor',
    'close-window': 'workbench.action.closeWindow'
  }[disposition];
  await vscode.commands.executeCommand(command);
  return true;
}

function closes(value) { return value === 'close-tab' || value === 'close-window'; }

module.exports = { VALUES, valid, apply, closes };
