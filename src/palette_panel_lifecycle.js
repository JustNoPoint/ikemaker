'use strict';

function disposeOtherPalettePanels(panelMaps, keep = null) {
  const panels = new Set((panelMaps || []).flatMap((map) => [...(map?.values?.() || [])]));
  for (const panel of panels) if (panel !== keep) panel.dispose();
  return panels.size - (keep && panels.has(keep) ? 1 : 0);
}

function singleFlight(opening, key, task) {
  const retained = opening.get(key);
  if (retained) return retained;
  let operation;
  operation = Promise.resolve().then(task).finally(() => {
    if (opening.get(key) === operation) opening.delete(key);
  });
  opening.set(key, operation);
  return operation;
}

module.exports = { disposeOtherPalettePanels, singleFlight };
