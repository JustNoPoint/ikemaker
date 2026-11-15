'use strict';
const vscode = require('vscode');
const model = require('./palette_merge_archive');

async function open({ archive, mode, apply, protectedMaster = false }) {
    const selected = await vscode.window.showQuickPick(archive.palettes.map(palette => ({ label: `${palette.group},${palette.number}`, description: palette.dataSize ? `${palette.colors} stored colors` : `Linked to physical palette ${palette.link}`, index: palette.index })), { canPickMany: true, title: mode === 'combine' ? 'Combine Into New: choose palettes' : 'Merge and Update Sprites: choose palettes' });
    if (!selected) return;
    if (selected.length < 2) throw new Error('Choose at least two palettes.');
    if (protectedMaster && mode !== 'combine' && selected.some(item => require('./sff_reader').usesFullCsMaster(archive,item.index)))
        throw new Error('Protected full-CS master or its aliases cannot be merged.');
    const target = await vscode.window.showQuickPick(selected.filter(item => archive.palettes[item.index].dataSize), { title: 'Choose the base palette: its indexes and mask win' });
    if (!target) return;
    const padding = await vscode.window.showQuickPick([{ label: 'Opaque black', color: [0, 0, 0, 255] }, ...selected.map(item => ({ label: `Trailing color of ${item.label}`, color: require('./sff_reader').paletteRgba(archive, item.index)[Math.min(255, archive.palettes[item.index].colors - 1)] }))], { title: 'Choose the fill for unused slots' });
    if (!padding) return;
    const indices = selected.map(item => item.index);
    const plan = mode === 'combine' ? model.prepare(archive, indices, target.index, { fill: padding.color, keepUsed: false, combine: true }) : model.planMerge(archive, indices, target.index, { fill: padding.color });
    const detail = `${plan.uniqueColors} distinct non-mask RGBA colors${plan.reduced ? ' reduced by frequency-weighted median cut to 255' : ''}. ${plan.excludedPadding} trailing duplicate slots treated as padding. Real used padding stays during embedded merge.\nBase ${target.label}; slot 0 retained. Partial alpha remains part of each RGBA color.\n` + (mode === 'combine' ? 'Creates a retained temporary palette; no sprites or SFF bytes change.' : `${plan.removed.length} selected palette rows removed. ${plan.changedPixels} stored pixel indices remapped; ${plan.changedRenderedPixels} rendered sprite pixels change. Existing build manifests stay unchanged.`);
    const answer = await vscode.window.showWarningMessage(mode === 'combine' ? 'Create combined temporary palette?' : 'Merge palettes and update their sprites?', { modal: true, detail }, mode === 'combine' ? 'Create Combined Palette' : 'Merge Palettes');
    if (!answer) return;
    if (mode === 'combine') {
        const controller = require('./palette_workspace_controller').paletteWorkspaceController();
        const colors = plan.colors.map(color => [...color]);
        const firstColor = [...colors[0]];
        colors[0] = [0, 0, 0, 0];
        while (colors.length < 256) colors.push([...padding.color]);
        const state = controller.scratchService.create({ name: 'Combined palette', colors, textSource: { count: plan.colors.length, firstColor } });
        controller.scratchService.status(state.document.draftId, 'Combined palette retained. Slot 0 is masked in the draft; text export retains the original base mask color.');
        return controller.openScratchWorkspace(null, { draftId: state.document.draftId });
    }
    return apply(plan);
}

module.exports = { open };
