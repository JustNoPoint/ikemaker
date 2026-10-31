'use strict';

const assert = require('assert');
const fs = require('fs');
const { snapshot, indicesForRequest, resolveScope, createWorkSet, sanitizeWorkSets } = require('../src/sff_batch_scope');

const archive = { buffer: Buffer.from('scope-fixture'), sprites: [
  { group: 0, number: 0 }, { group: 1, number: 0 }, { group: 1, number: 1 }, { group: 1, number: 2 }, { group: 2, number: 0 }
] };
const snap = snapshot(archive);

assert.deepStrictEqual(indicesForRequest(snap, { mode: 'current', currentIndex: 2 }), [2]);
assert.deepStrictEqual(indicesForRequest(snap, { mode: 'marked', markedIndices: [3, 1, 3] }), [1, 3]);
assert.deepStrictEqual(indicesForRequest(snap, { mode: 'visible', visibleIndices: [4, 2] }), [2, 4]);
assert.deepStrictEqual(indicesForRequest(snap, { mode: 'group', group: 1 }), [1, 2, 3]);
assert.deepStrictEqual(indicesForRequest(snap, { mode: 'range', first: 1, last: 3 }), [1, 2, 3]);
assert.deepStrictEqual(indicesForRequest(snap, { mode: 'all' }), [0, 1, 2, 3, 4]);

const set = createWorkSet(snap, 'Hit sprites', [3, 1]);
assert.deepStrictEqual(indicesForRequest(snap, { mode: 'work-set', workSetId: set.id }, [set]), [1, 3]);
assert.deepStrictEqual(set.entryIds, ['1,0', '1,2']);
assert.strictEqual(sanitizeWorkSets([set, set, { broken: true }]).length, 1);
const resolved = resolveScope(snap, { mode: 'group', group: 1 });
assert.deepStrictEqual(resolved.identities, ['1,0', '1,1', '1,2']);
assert.strictEqual(resolved.resolvedCount, 3);
assert.match(resolved.resolutionHash, /^[A-F0-9]{64}$/);

assert.throws(() => indicesForRequest(snap, { mode: 'range', first: 4, last: 2 }), /ordered|within/);
assert.throws(() => indicesForRequest(snap, { mode: 'visible', visibleIndices: [] }), /contains no sprites/);
assert.throws(() => indicesForRequest(snap, { mode: 'marked', markedIndices: [1, 99] }), /missing physical sprite index 99.*no partial subset was accepted/, 'stale marked scope fails whole instead of silently shrinking');
assert.throws(() => indicesForRequest(snap, { mode: 'visible', visibleIndices: [-1, 2] }), /missing physical sprite index -1/, 'stale visible scope fails whole instead of filtering unavailable rows');
assert.throws(() => indicesForRequest(snap, { mode: 'all', fingerprint: 'stale' }), /changed after/);
assert.throws(() => indicesForRequest(snapshot({ buffer: Buffer.from('changed'), sprites: archive.sprites }), { mode: 'work-set', workSetId: set.id }, [set]), /older version/);
const duplicates = snapshot({ buffer: Buffer.from('duplicates'), sprites: [{ group: 5, number: 1 }, { group: 5, number: 1 }] });
assert.throws(() => indicesForRequest(duplicates, { mode: 'all' }), /duplicate SFF identities/);
assert.deepStrictEqual(indicesForRequest(duplicates, { mode: 'all' }, [], { allowDuplicateIdentities: true }), [0, 1], 'read-only physical export scopes may retain repeated identities');
const duplicateExportScope = resolveScope(duplicates, { mode: 'all' }, [], { allowDuplicateIdentities: true });
assert.strictEqual(duplicateExportScope.schemaVersion, 2);
assert.deepStrictEqual(duplicateExportScope.physicalEntries, [{ archiveIndex: 0, identity: '5,1' }, { archiveIndex: 1, identity: '5,1' }]);
assert.notStrictEqual(resolveScope(duplicates, { mode: 'current', currentIndex: 0 }, [], { allowDuplicateIdentities: true }).resolutionHash, resolveScope(duplicates, { mode: 'current', currentIndex: 1 }, [], { allowDuplicateIdentities: true }).resolutionHash, 'physical-occurrence scope hashes must distinguish repeated identities');
assert.throws(() => createWorkSet(duplicates, 'unsafe', [0]), /ambiguous duplicate/);
assert.throws(() => createWorkSet(snap, 'stale set', [1, 99]), /missing physical sprite index 99.*Nothing was saved/, 'work-set creation cannot silently omit a stale selected occurrence');
const physicalSet = createWorkSet(duplicates, 'Repeated physical sprites', [1, 0], { allowDuplicateIdentities: true });
assert.strictEqual(physicalSet.version, 2);
assert.deepStrictEqual(physicalSet.physicalEntries, [{ archiveIndex: 0, identity: '5,1' }, { archiveIndex: 1, identity: '5,1' }]);
assert.deepStrictEqual(indicesForRequest(duplicates, { mode: 'work-set', workSetId: physicalSet.id }, [physicalSet], { allowDuplicateIdentities: true }), [0, 1]);
assert.strictEqual(sanitizeWorkSets([physicalSet])[0].version, 2);
assert.strictEqual(sanitizeWorkSets([{ ...physicalSet, entryIds: ['5,1@99', '5,1@1'] }]).length, 0, 'tampered physical work-set identities must be rejected');
assert.strictEqual(sanitizeWorkSets([{ ...set, entryIds: ['1,0', '1,0'] }]).length, 0, 'duplicate persisted work-set rows are rejected rather than silently collapsed');
assert.strictEqual(sanitizeWorkSets([{ ...set, entryIds: Array.from({ length: 100001 }, (_, index) => `1,${index}`) }]).length, 0, 'oversized persisted work sets are rejected rather than silently truncated');

const viewerSource = fs.readFileSync(require.resolve('../src/sff_viewer'), 'utf8');
assert(viewerSource.includes("chooseSffBatchScope(archive, message, 'Apply the same axis offset to which sprites?', { allowDuplicateIdentities: destination.mode === 'direct' })"), 'batch axis offsets must allow repeated physical entries only for the direct-header route');
assert(viewerSource.includes("chooseSffBatchScope(archive, message, 'Export which sprites as PNG images?', { allowDuplicateIdentities: true })"), 'read-only batch sprite export must use the shared physical-occurrence SFF scope resolver');
assert(viewerSource.includes('executeSpritePngExport(fs, currentArchive') && viewerSource.includes('export-sff-png-${scope.mode}-${scope.resolutionHash.slice(0, 12)}'), 'batch sprite export must be atomic and retain reviewed scope evidence');
for (const label of ['export-sff-${action}-${selection.scope.mode}', 'export-sff-aligned-${selection.scope.mode}', 'export-sff-channels-${selection.scope.mode}']) assert(viewerSource.includes(label), `non-destructive image batch must commit atomically with scope evidence: ${label}`);
assert((viewerSource.match(/allowDuplicateIdentities: true/g) || []).length >= 4, 'read-only image batches must preserve repeated physical identities');
assert((viewerSource.match(/fs\.rmSync\(temp, \{ recursive: true, force: true \}\)/g) || []).length >= 3, 'FFmpeg image batches must clean their private staging directories on success or failure');
for (const title of ['Image metadata — choose sprite scope', 'Aligned export — choose sprite scope', 'Split channels — choose sprite scope', '${action} — choose sprite scope', '— choose sprite scope`']) {
  assert(viewerSource.includes(title), `SFF viewer operation must use the shared scope resolver: ${title}`);
}
assert(viewerSource.includes('revalidatedSpriteScope(archive, selection)'), 'non-mutating image batches must recheck the exact archive before creating output');
assert((viewerSource.match(/scope\.sourceFingerprint/g) || []).length >= 5 && viewerSource.includes('scope.resolutionHash.slice(0, 12)'), 'mutating batch consumers must recheck the exact archive and retain the reviewed scope identity');
assert(viewerSource.includes('sff-palette-assignment-${selection.scope.mode}-${selection.scope.resolutionHash.slice(0, 12)}'), 'palette assignments must retain reviewed scope identity in the mutation record');
assert(viewerSource.includes('Assign palette ${palette.group},${palette.number} — choose sprite scope`, { allowDuplicateIdentities: true }'), 'direct palette assignment must address repeated sprites by reviewed physical index');
assert(viewerSource.includes("chooseSffBatchScope(source, { selectedIndex: 0, group: first.group }, 'Import which sprites from the source SFF?')"), 'cross-SFF import must use the shared reviewed scope resolver');
assert(viewerSource.includes('sffBatchScope.archiveFingerprint(currentSource) !== scope.sourceFingerprint'), 'cross-SFF import must recheck the exact source archive before creating output');
assert(viewerSource.includes('manifest-import-sff-${scope.mode}-${scope.resolutionHash.slice(0, 12)}'), 'cross-SFF import must retain reviewed scope identity in mutation evidence');
assert(viewerSource.includes("chooseSpriteScope(archive, message, 'Export which sprites as a reusable SFF project?')"), 'reusable project export must use the shared reviewed scope resolver');
assert(viewerSource.includes('SourceArchiveFingerprint: scope.sourceFingerprint'), 'reusable project manifests must retain the exact source and scope evidence');
const projectExportBody = viewerSource.slice(viewerSource.indexOf('async function exportSpriteProject'), viewerSource.indexOf('async function importSpriteProject'));
assert(projectExportBody.includes('transactionalWriteSet(fs, writes') && projectExportBody.includes('allowExisting: false'), 'reusable project export must be atomic and must not overwrite existing output');
assert(!projectExportBody.includes('fs.writeFileSync'), 'reusable project export must not use partial direct writes');
const legacyManifestBody = viewerSource.slice(viewerSource.indexOf('async function editSpriteManifest'), viewerSource.indexOf('function setCurrentSpriteAxis'));
assert(legacyManifestBody.includes('requireUnusedIdentity(rows.map(rowKey)') && legacyManifestBody.includes('planSequentialAddition(rows.map(rowKey)') && legacyManifestBody.includes('Legacy manifest add overlaps'), 'preserved legacy text workflows must use reviewed duplicate-destination, range and batch-collision planning');
assert(legacyManifestBody.includes('The SFF changed while the manifest operation was being reviewed'), 'legacy manifest operations must recheck the exact SFF that supplied their selection before commit');

console.log('SFF batch scope tests passed.');
