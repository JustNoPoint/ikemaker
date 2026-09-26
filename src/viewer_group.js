'use strict';

// Visual workspaces open as tabs in one shared editor group by default. Users
// remain free to drag any tab into another group; the most recently activated
// viewer then becomes the destination for subsequently opened viewers.
let column = 0;
const tracked = new Set();

function valid(value) { return Number.isInteger(value) && value > 0; }
function preferredViewerColumn(fallback, avoidColumn = 0) {
  if (valid(column) && column !== avoidColumn) return column;
  // VS Code uses -1 for the active editor group and -2 for a group beside it.
  // A visual workspace must not silently join the active text-code group on its
  // first open. Once a viewer exists, its tracked (and user-movable) group wins.
  return fallback === -1 ? -2 : fallback;
}
function restoredAssetColumn(groups, avoidColumn = 0) {
  const types=new Set(['ikemenAirWorkspace','ikemenSffViewer','ikemenSndViewer','ikemen.sffWorkspace','ikemen.sndWorkspace']);
  const group=(groups||[]).find(group=>valid(group.viewColumn)&&group.viewColumn!==avoidColumn&&(group.tabs||[]).some(tab=>types.has(tab.input?.viewType)));
  return group?.viewColumn||0;
}

function trackViewerPanel(panel) {
  if (!panel || tracked.has(panel)) return panel;
  tracked.add(panel);
  require('./viewer_close').track(panel);
  // Restoring a background tab must not redirect subsequent viewer opens.
  if (valid(panel.viewColumn) && (panel.active || !valid(column))) column = panel.viewColumn;
  if (typeof panel.onDidChangeViewState === 'function') panel.onDidChangeViewState((event) => {
    const active = event && event.webviewPanel;
    if (active && active.active && valid(active.viewColumn)) {
      column = active.viewColumn;
      tracked.delete(panel); tracked.add(panel);
    }
  });
  if (typeof panel.onDidDispose === 'function') panel.onDidDispose(() => {
    tracked.delete(panel);
    if (![...tracked].some(item => item.viewColumn === column)) {
      column = [...tracked].reverse().map(item => item.viewColumn).find(valid) || 0;
    }
  });
  return panel;
}

function revealInViewerGroup(panel, preserveFocus = false, fallback = 1) {
  if (!panel || typeof panel.reveal !== 'function') return;
  const target = valid(panel.viewColumn) ? panel.viewColumn : preferredViewerColumn(fallback);
  panel.reveal(target, preserveFocus);
}

function resetViewerGroupForTests() { column = 0; tracked.clear(); }

module.exports = { trackedPanels:()=>[...tracked], preferredViewerColumn, trackViewerPanel, revealInViewerGroup, restoredAssetColumn, resetViewerGroupForTests };
