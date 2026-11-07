'use strict';

function identity(sprite) { return `${sprite.group},${sprite.number}`; }
async function pick(vscode, items, options) { const value = await vscode.window.showQuickPick(items, options); return value || null; }
async function groupIndex(vscode, title, initial = '') { const value = await vscode.window.showInputBox({ title, value: initial, placeHolder: 'group,index', validateInput: text => /^\d+,\d+$/.test(String(text).trim()) ? null : 'Enter non-negative group,index.' }); if (value === undefined) return null; const [group, number] = value.trim().split(',').map(Number); return { group, number }; }

async function collectSffTransferDecisions(vscode, analysis, destinationArchive) {
  const decisions = { placement: null, items: [] };
  if (analysis.placementRequired) {
    const placements = [{ label: 'Append at end of physical table', description: `Physical position ${destinationArchive.sprites.length}`, value: { kind: 'append-end' } }];
    for (const sprite of destinationArchive.sprites) { placements.push({ label: `Before ${identity(sprite)} · physical ${sprite.index}`, value: { kind: 'between-sprites', targetPhysicalIndex: sprite.index, targetIdentity: identity(sprite), position: sprite.index } }, { label: `After ${identity(sprite)} · physical ${sprite.index}`, value: { kind: 'between-sprites', targetPhysicalIndex: sprite.index, targetIdentity: identity(sprite), position: sprite.index + 1 } }); }
    const placement = await pick(vscode, placements, { title: 'SFF Transfer — choose exact Destination placement', placeHolder: 'This does not write the SFF.' }); if (!placement) return null; decisions.placement = placement.value;
  }
  for (const item of analysis.items) {
    const decision = { id: item.id };
    if (item.collision.decisionRequired) {
      const chosen = await pick(vscode, [
        { label: 'Add at next free index', value: 'add-next-free' }, ...(item.collision.destinationPhysicalIndices.length ? [{ label: 'Replace existing sprite', value: 'replace-existing' }] : []), { label: 'Choose another group,index', value: 'manual-identity' }, { label: 'Skip this sprite', value: 'skip' }
      ], { title: `Identity conflict — ${item.id}`, placeHolder: item.collision.status === 'source-duplicate' ? `Two selected Source sprites use ${item.identity}. Choose where this one goes.` : `${item.identity} already exists in Destination.` }); if (!chosen) return null;
      decision.identity = { action: chosen.value };
      if (chosen.value === 'replace-existing' && item.collision.destinationPhysicalIndices.length > 1) { const occurrence = await pick(vscode, item.collision.destinationPhysicalIndices.map(index => ({ label: `${item.identity} · physical ${index}`, value: index })), { title: `Choose exact Destination occurrence — ${item.id}` }); if (!occurrence) return null; decision.identity.destinationPhysicalIndex = occurrence.value; }
      if (chosen.value === 'manual-identity') { const value = await groupIndex(vscode, `New Destination identity — ${item.id}`, item.identity); if (!value) return null; Object.assign(decision.identity, value); }
      if (chosen.value === 'skip') { decisions.items.push(decision); continue; }
      if (chosen.value === 'replace-existing') { const axis = await pick(vscode, [{ label: 'Use Source axis', value: 'source-axis' }, { label: 'Keep Destination axis', value: 'preserve-destination' }], { title: `Axis for replacement — ${item.id}` }); if (!axis) return null; decision.axis = { action: axis.value }; }
    }
    if (item.link.decisionRequired) { const link = await pick(vscode, item.link.choices.map(value => ({ label: ({ 'flatten-copy': 'Copy rendered pixels (flatten link)', skip: 'Skip this sprite' })[value] || value, value })), { title: `Linked sprite — ${item.id}`, placeHolder: item.link.targetIdentity ? `Its target ${item.link.targetIdentity} · physical ${item.link.targetPhysicalIndex} is not in this reviewed selection. Select both sprites to preserve the exact link.` : 'The link target is unavailable.' }); if (!link) return null; decision.link = { action: link.value }; if (link.value === 'skip') { decisions.items.push(decision); continue; } }
    if (item.palette.decisionRequired) {
      const palette = await pick(vscode, item.palette.choices.map(value => ({ label: ({ 'map-existing-palette': 'Map to an existing Destination palette', 'import-source-palette': 'Import Source palette under a new identity', 'convert-truecolor': 'Convert this sprite to truecolor', skip: 'Skip this sprite' })[value] || value, value })), { title: `Palette compatibility — ${item.id}`, placeHolder: item.palette.sourcePaletteIdentity ? `Source palette ${item.palette.sourcePaletteIdentity}` : 'Source palette is missing or invalid.' }); if (!palette) return null; decision.palette = { action: palette.value };
      if (palette.value === 'map-existing-palette') { const mapped = await pick(vscode, destinationArchive.palettes.map(entry => ({ label: `${entry.group},${entry.number} · physical ${entry.index}`, value: entry.index })), { title: `Destination palette — ${item.id}` }); if (!mapped) return null; decision.palette.destinationPaletteIndex = mapped.value; }
      if (palette.value === 'import-source-palette') { const value = await groupIndex(vscode, `New stored palette identity — ${item.id}`, item.palette.sourcePaletteIdentity || '1,1'); if (!value) return null; decision.palette.destinationPaletteGroup = value.group; decision.palette.destinationPaletteIndex = value.number; }
    } else if (item.palette.status === 'compatible' && item.palette.compatibleDestinations.length > 1) { const compatible = await pick(vscode, item.palette.compatibleDestinations.map(entry => ({ label: `${entry.identity} · physical ${entry.physicalIndex}`, value: entry.physicalIndex })), { title: `Compatible Destination palette — ${item.id}` }); if (!compatible) return null; decision.palette = { action: 'reuse-compatible', destinationPaletteIndex: compatible.value }; }
    decisions.items.push(decision);
  }
  return decisions;
}

module.exports = { collectSffTransferDecisions };
