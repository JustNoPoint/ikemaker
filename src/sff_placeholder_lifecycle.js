'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function safePart(value) { return String(value || '').replace(/[^a-z0-9._-]+/gi, '_').replace(/^_+|_+$/g, '') || 'archive'; }

function projectRoot(filename) {
  let current = path.dirname(path.resolve(filename));
  while (true) {
    if (fs.existsSync(path.join(current, 'Ikemen_GO.exe')) || fs.existsSync(path.join(current, 'external', 'script', 'main.lua'))) return current;
    const parent = path.dirname(current); if (parent === current) return path.dirname(path.resolve(filename)); current = parent;
  }
}

function lifecycleRegistryPath(sffPath) {
  const absolute = path.resolve(sffPath), root = projectRoot(absolute);
  let relative = path.relative(root, absolute);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) relative = path.basename(absolute);
  const parts = relative.split(/[\\/]+/).map(safePart);
  parts[parts.length - 1] = `${safePart(path.basename(parts.at(-1), path.extname(parts.at(-1))))}.json`;
  return path.join(root, '.ikemen-tools', 'sff-placeholder-lifecycles', ...parts);
}

function normalizeRecord(record) {
  const lifecycleId = String(record?.lifecycleId || '').trim(), paletteId = String(record?.paletteId || '').replace(/\s+/g, '');
  const ownerSpriteIds = [...new Set((record?.ownerSpriteIds || []).map(String).filter(Boolean))];
  if (!lifecycleId || !paletteId || !/^\d+,\d+$/.test(paletteId) || !ownerSpriteIds.length) throw new Error('Temporary palette records require a lifecycle ID, group,index palette ID, and at least one explicit placeholder sprite owner.');
  const owners = Array.isArray(record?.owners) ? record.owners.map((owner) => ({ ...owner, ownerId: String(owner?.ownerId || '').trim(), entryId: String(owner?.entryId || '') })) : [];
  if (owners.length && (owners.length !== ownerSpriteIds.length || owners.some((owner) => !owner.ownerId || !owner.entryId))) throw new Error('Every temporary palette owner requires a stable owner ID and sprite entry ID.');
  return { ...record, lifecycleId, paletteId, ownerSpriteIds, owners, note: String(record.note || '') };
}

function readLifecycleRegistry(sffPath) {
  const filename = lifecycleRegistryPath(sffPath);
  if (!fs.existsSync(filename)) return { filename, version: 1, sourceSff: path.resolve(sffPath), sourceSffHash: '', records: [] };
  const parsed = JSON.parse(fs.readFileSync(filename, 'utf8').replace(/^\uFEFF/, ''));
  if (parsed?.version !== 1 || !Array.isArray(parsed.records)) throw new Error('Temporary palette lifecycle registry has an unsupported format.');
  return { ...parsed, filename, sourceSff: path.resolve(sffPath), records: parsed.records.map(normalizeRecord) };
}

function mergeLifecycleRegistry(sffPath, additions = [], metadata = {}) {
  const current = readLifecycleRegistry(sffPath), records = new Map(current.records.map((record) => [record.lifecycleId, record]));
  for (const lifecycleId of metadata.removeLifecycleIds || []) records.delete(String(lifecycleId));
  for (const raw of additions) {
    const record = normalizeRecord(raw), conflict = [...records.values()].find((item) => item.lifecycleId !== record.lifecycleId && item.paletteId === record.paletteId);
    if (conflict) throw new Error(`Temporary palette ${record.paletteId} is already owned by lifecycle ${conflict.lifecycleId}.`);
    records.set(record.lifecycleId, record);
  }
  return {
    version: 1, sourceSff: path.resolve(sffPath), sourceSffHash: String(metadata.sourceSffHash || current.sourceSffHash || ''),
    specificationHash: String(metadata.specificationHash || ''), updatedAt: new Date().toISOString(), records: [...records.values()]
  };
}

function lifecycleRegistrySnapshot(sffPath) {
  const filename = lifecycleRegistryPath(sffPath), exists = fs.existsSync(filename), bytes = exists ? fs.readFileSync(filename) : Buffer.alloc(0);
  return { filename, exists, hash: crypto.createHash('sha256').update(bytes).digest('hex') };
}

function reviewTemporaryPaletteCleanup({ sprites = [], temporaryPalettes = [], removedSpriteIds = [], unresolvedReferences = [] } = {}) {
  const removed = new Set(removedSpriteIds.map(String)), spriteRows = sprites.map(sprite => ({ id: String(sprite.id), paletteId: String(sprite.paletteId || '').replace(/\s+/g, ''), placeholderLifecycleId: String(sprite.placeholderLifecycleId || '') }));
  const unresolved = new Set(unresolvedReferences.map(String)), seenLifecycle = new Set(), proposals = [];
  for (const raw of temporaryPalettes) {
    const record = normalizeRecord(raw);
    if (seenLifecycle.has(record.lifecycleId)) throw new Error(`Temporary palette lifecycle ${record.lifecycleId} occurs more than once.`);
    seenLifecycle.add(record.lifecycleId);
    const ownersRemaining = record.ownerSpriteIds.filter(id => !removed.has(id));
    const foreignReferences = spriteRows.filter(sprite => !removed.has(sprite.id) && sprite.paletteId === record.paletteId && !record.ownerSpriteIds.includes(sprite.id)).map(sprite => sprite.id);
    const mismatchedOwners = spriteRows.filter(sprite => record.ownerSpriteIds.includes(sprite.id) && sprite.placeholderLifecycleId !== record.lifecycleId).map(sprite => sprite.id);
    const reasons = [];
    if (ownersRemaining.length) reasons.push(`${ownersRemaining.length} owned placeholder sprite(s) remain`);
    if (foreignReferences.length) reasons.push(`${foreignReferences.length} unowned sprite reference(s) remain`);
    if (mismatchedOwners.length) reasons.push(`${mismatchedOwners.length} owner tag(s) do not match the lifecycle record`);
    if (unresolved.has(record.paletteId)) reasons.push('external or dynamic palette references are unresolved');
    proposals.push({ ...record, ownersRemaining, foreignReferences, mismatchedOwners, eligible: reasons.length === 0, reasons, action: reasons.length ? 'keep' : 'propose-delete' });
  }
  return { proposals, eligible: proposals.filter(item => item.eligible), blocked: proposals.filter(item => !item.eligible) };
}

function archiveTemporaryPaletteCleanupReview(sffPath, archive, removedSpriteIdentities = []) {
  const { auditPaletteReferences, referenceFiles } = require('./palette_reference_audit');
  const registry = readLifecycleRegistry(sffPath), snapshot = lifecycleRegistrySnapshot(sffPath), removed = new Set((removedSpriteIdentities || []).map(value => String(value).replace(/\s+/g, '')));
  const sourceSffHash = crypto.createHash('sha256').update(archive?.buffer || Buffer.alloc(0)).digest('hex');
  if (!registry.records.length) return { sourceSff: path.resolve(sffPath), sourceSffHash, lifecycleRegistryPath: snapshot.filename, lifecycleRegistryHash: snapshot.hash, referenceAuditHash: '', removedSpriteIdentities: [...removed].sort(), eligible: [], blocked: [] };
  const files = referenceFiles(projectRoot(sffPath)), audit = auditPaletteReferences(files);
  const referenceAuditHash = crypto.createHash('sha256').update(JSON.stringify(files.map(file => [path.resolve(file.filename), crypto.createHash('sha256').update(file.text).digest('hex')]).sort((a, b) => a[0].localeCompare(b[0])))).digest('hex');
  const eligible = [], blocked = [];
  for (const record of registry.records) {
    const reasons = [], paletteMatches = (archive?.palettes || []).filter(palette => `${palette.group},${palette.number}` === record.paletteId), palette = paletteMatches[0];
    if (paletteMatches.length !== 1) reasons.push(`temporary palette ${record.paletteId} resolves to ${paletteMatches.length} physical entries`);
    const ownerIdentities = (record.owners || []).map(owner => `${Number(owner.group)},${Number(owner.number)}`);
    if (!ownerIdentities.length || ownerIdentities.length !== record.ownerSpriteIds.length || ownerIdentities.some(identity => !/^\d+,\d+$/.test(identity))) reasons.push('lifecycle owner coordinates are incomplete');
    const ownersRemaining = ownerIdentities.filter(identity => !removed.has(identity));
    if (ownersRemaining.length) reasons.push(`${ownersRemaining.length} owned placeholder sprite(s) remain`);
    for (const identity of ownerIdentities) {
      const matches = (archive?.sprites || []).filter(sprite => `${sprite.group},${sprite.number}` === identity);
      if (matches.length !== 1) { reasons.push(`owner ${identity} resolves to ${matches.length} physical sprites`); continue; }
      if (palette && matches[0].paletteIndex !== palette.index) reasons.push(`owner ${identity} no longer uses temporary palette ${record.paletteId}`);
    }
    if (palette) {
      const foreignReferences = (archive?.sprites || []).filter(sprite => !removed.has(`${sprite.group},${sprite.number}`) && sprite.paletteIndex === palette.index && !ownerIdentities.includes(`${sprite.group},${sprite.number}`)).map(sprite => `${sprite.group},${sprite.number}`);
      if (foreignReferences.length) reasons.push(`${foreignReferences.length} unowned sprite reference(s) remain`);
      const linkDependents = (archive?.palettes || []).filter(entry => entry.dataSize === 0 && entry.link === palette.index && entry.index !== palette.index);
      if (linkDependents.length) reasons.push(`${linkDependents.length} linked palette dependent(s) remain`);
    }
    const literalReferences = audit.findings.filter(finding => finding.references.some(reference => reference.coordinate && `${reference.coordinate.group},${reference.coordinate.number}` === record.paletteId));
    if (literalReferences.length) reasons.push(`${literalReferences.length} authored palette reference(s) remain`);
    if (audit.unresolved.length) reasons.push(`${audit.unresolved.length} dynamic or unresolved palette reference(s) remain`);
    const item = { lifecycleId: record.lifecycleId, paletteId: record.paletteId, paletteIndex: palette?.index ?? -1, ownerSpriteIds: record.ownerSpriteIds, ownerIdentities, note: record.note, reasons, eligible: reasons.length === 0, action: reasons.length ? 'keep' : 'delete-with-last-owners' };
    (item.eligible ? eligible : blocked).push(item);
  }
  return { sourceSff: path.resolve(sffPath), sourceSffHash, lifecycleRegistryPath: snapshot.filename, lifecycleRegistryHash: snapshot.hash, referenceAuditHash, removedSpriteIdentities: [...removed].sort(), eligible, blocked };
}

module.exports = { normalizeRecord, reviewTemporaryPaletteCleanup, archiveTemporaryPaletteCleanupReview, lifecycleRegistryPath, readLifecycleRegistry, mergeLifecycleRegistry, lifecycleRegistrySnapshot };
