'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vscode = require('vscode');
const model = require('./snd_media_manifest');
const { hash } = require('./snd_audio_processing');

async function exportAll(archive) {
    const content = model.exportPackage(archive);
    const folder=await require('./snd_package_export').exportPackage(content,{vscode,sourcePath:archive.filename});
    if(!folder)return;
    void vscode.window.showInformationMessage(`Exported ${content.files.length} WAVs and manifest.txt to ${folder}.`);
}

async function importAll({ archive, apply, manifestPath, expectedPackage, voiceImport, entityId, assertDestination = () => {} }) {
    const picked = manifestPath ? [{fsPath:manifestPath}] : await vscode.window.showOpenDialog({ title: 'Import All Sounds From Manifest', canSelectMany: false, filters: { 'Sound manifests': ['txt','ini'] } });
    if (!picked?.[0]) return;
    const plan = await model.prepareImport(picked[0].fsPath, expectedPackage);
    if (voiceImport) {
        await voiceImport.validate();
        if (plan.sounds.length !== voiceImport.sounds.length || plan.sounds.some((sound, index) => {
            const cut = voiceImport.sounds[index];
            return sound.group !== cut.group || sound.index !== cut.index || hash(sound.bytes) !== cut.wavHash;
        })) throw Error('The exported package no longer matches its reviewed voice cut identities.');
    }
    const route = await vscode.window.showQuickPick([
        { label: 'Update the current SND', mode: 'merge', description: 'Replace matching IDs in place; append new IDs in manifest order.' },
        { label: 'Create a new SND', mode: 'new', description: 'Retain exact manifest order in a separate new archive.' }
    ], { title: 'Where should these manifest sounds go?' });
    if (!route) return;
    const result = route.mode === 'merge' ? model.mergeArchive(archive, plan.sounds) : { bytes: plan.bytes, replaced: 0, added: plan.sounds.length };
    const existing = new Map(route.mode === 'merge' ? archive.entries.map(entry => [entry.identity, entry.archiveIndex]) : []);
    const rows = plan.sounds.map(sound => {
        const id = `${sound.group},${sound.index}`;
        const action = existing.has(id) ? `Replace entry ${existing.get(id) + 1}` : 'Add';
        return `${action} · ${id} ← ${sound.file}`;
    });
    const answer = await vscode.window.showWarningMessage(`Import ${plan.sounds.length} sounds?`, { modal: true, detail: `${result.replaced} matching IDs replaced; ${result.added} new IDs added. WAV bytes are retained exactly.\n${route.mode === 'merge' ? 'Destination SND: '+archive.filename+'\nSource WAVs and SndMaker build manifest stay unchanged.' : 'A separate new SND will be created.'}\n\n${rows.join('\n')}` }, 'Import Sounds');
    if (answer !== 'Import Sounds') return;
    let target;
    if (route.mode === 'new') {
        target = await vscode.window.showSaveDialog({ title: 'Save imported sounds as a new SND', defaultUri: vscode.Uri.file(path.join(path.dirname(plan.filename), 'imported.snd')), filters: { SND: ['snd'] } });
        if (!target) return;
    }
    await model.assertUnchanged(plan);
    assertDestination();
    await voiceImport?.validate();
    const destination = route.mode === 'merge' ? archive.filename : path.resolve(target.fsPath);
    let ledger;
    if (voiceImport) {
        const reader = require('./snd_reader'), reopened = reader.parseSndBuffer(result.bytes);
        const placement = {
            destination, ...(route.mode === 'merge' && entityId ? {entityId} : {}),
            importId: require('node:crypto').randomUUID(), importedAt: new Date().toISOString(),
            entries: voiceImport.sounds.map(sound => ({clipId:sound.clipId, group:sound.group, index:sound.index,
                entryIndex:reopened.entries.find(entry => entry.group === sound.group && entry.index === sound.index).archiveIndex,
                wavHash:sound.wavHash}))
        };
        const previousHashes = new Map(route.mode === 'merge' ? archive.entries.map(entry => [entry.identity,hash(reader.soundBuffer(archive,entry))]) : []);
        ledger = await voiceImport.planPlacementWrites(placement, previousHashes);
        await model.assertUnchanged(plan);
        assertDestination(); await voiceImport.validate();
    }
    if (route.mode === 'merge') {
        await apply({ bytes: result.bytes, sourceHash: hash(archive.buffer), ...(ledger ? {writes:ledger.writes,expectedHashes:ledger.expectedHashes} : {}) });
        ledger?.onCommitted?.();
        return {destination:archive.filename, entityId:entityId||'', count:plan.sounds.length};
    }
    if (ledger) {
        const safety = require('./mutation_safety');
        safety.transactionalWriteSet(fs, [[destination,result.bytes],...ledger.writes], safety.optionsFromConfig(vscode,destination,'voice-package-new-snd',{
            expectedHashes:{...ledger.expectedHashes,[destination]:hash(Buffer.alloc(0))},
            allowExisting:filename => path.resolve(filename) !== destination, aggregateJournal:true
        }));
    } else await fs.promises.writeFile(target.fsPath, result.bytes, { flag: 'wx' });
    if (hash(await fs.promises.readFile(target.fsPath)) !== hash(result.bytes)) throw new Error('Saved import verification failed.');
    ledger?.onCommitted?.();
    void vscode.window.showInformationMessage(`Created ${target.fsPath} with ${plan.sounds.length} sounds.`);
    return {destination:target.fsPath, entityId:'', count:plan.sounds.length};
}

module.exports = { exportAll, importAll };
