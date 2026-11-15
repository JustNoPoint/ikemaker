'use strict';
const vscode = require('vscode');
const reader = require('./sff_reader');
const operations = require('./palette_link_operations');

async function open({ archive, unlink = false, protectedMaster = false, apply }) {
    const label = index => { const palette = archive.palettes[index]; return `${palette.group},${palette.number} (#${index})`; };
    let selected, mode, plan;
    if (unlink) {
        selected = await vscode.window.showQuickPick(archive.palettes.filter(palette => !palette.dataSize).map(palette => ({ label: label(palette.index), description: `Shares colors with ${label(palette.link)}`, index: palette.index })), { canPickMany: true, title: 'Unlink palettes: retain IDs and store independent color copies' });
        if (!selected?.length) return;
        selected = selected.map(item => item.index);
        mode = 'unlink';
    } else {
        const groups = operations.duplicateGroups(archive);
        if (!groups.length) return vscode.window.showInformationMessage('No exact duplicate RGBA palettes with the same stored color count were found.');
        const picked = await vscode.window.showQuickPick(groups.map(group => ({ label: group.map(label).join(' = '), description: `${group.length} exact palettes including alpha; independent identities may be intentional`, group })), { canPickMany: true, title: 'Choose exact duplicate groups to review' });
        if (!picked?.length) return;
        const route = await vscode.window.showQuickPick([{ label: 'Link duplicate color tables', mode: 'link', description: 'Keep every palette ID and sprite assignment; share the first table.' }, { label: 'Merge duplicate palette rows', mode: 'merge', description: 'Remove later duplicate IDs and redirect their indexed sprite users.' }], { title: 'How should the selected duplicates be handled?' });
        if (!route) return;
        mode = route.mode; selected = picked.map(item => item.group);
    }
    const affected = mode === 'unlink' ? selected : selected.flat();
    if (protectedMaster && affected.some(index => reader.usesFullCsMaster(archive,index))) throw new Error('Protected full-CS palette and its aliases cannot be linked, merged or unlinked here.');
    plan = mode === 'unlink' ? operations.unlink(archive, selected) : operations.cleanup(archive, selected, mode);
    const detail = (mode === 'unlink' ? selected.map(label).join('\n') : selected.map(group => group.slice(1).map(index => `${label(index)} → ${label(group[0])}`).join('\n')).join('\n')) + '\n\nRendered sprite colors and image pixels verified unchanged. ' + (mode === 'merge' ? 'Later duplicate palette IDs are removed. Existing build manifests stay unchanged.' : 'Every palette ID and sprite assignment is retained.');
    const answer = await vscode.window.showWarningMessage(`${mode === 'unlink' ? 'Unlink' : mode === 'merge' ? 'Merge' : 'Link'} the reviewed palettes?`, { modal: true, detail }, 'Apply Palette Sharing');
    if (answer !== 'Apply Palette Sharing') return;
    return apply(plan);
}

module.exports = { open };
