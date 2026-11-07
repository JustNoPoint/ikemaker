'use strict';

// The same list drives the visual hint and the universal toolbar event handler.
const placementSlots = Object.freeze([
  'open', 'text-source', 'connected-resources', 'project', 'stage', 'sprites',
  'animations', 'commands', 'states', 'sounds', 'palettes', 'code-structure',
  'viewer-browser', 'actions-search', 'suite-switch', 'help', 'settings'
]);
const setupSlots = Object.freeze(['versus', 'training']);
const contextSlots = new Set([...placementSlots, ...setupSlots, 'updates']);
const hint = 'Right-click or Shift+F10 for options';
function attributes(slot) {
  return contextSlots.has(slot) ? ' data-header-context-options="true" aria-keyshortcuts="Shift+F10" data-context-hint="'+hint+'"' : '';
}
function style() {
  return `
button[data-header-context-options="true"]:enabled {
  border: 2px dashed var(--ikemaker-context-border, light-dark(#6843a5, #c7a8ff)) !important;
  box-sizing: border-box;
}
@media (forced-colors: active) {
  button[data-header-context-options="true"]:enabled { border-color: ButtonText !important; }
}
body.vscode-light { --ikemaker-context-border: #6843a5; }
body.vscode-dark { --ikemaker-context-border: #c7a8ff; }
`;
}
module.exports = { placementSlots, setupSlots, contextSlots, attributes, style, hint };
