'use strict';

const crypto = require('crypto');
const path = require('path');
const domainModel = require('./palette_domain_model');
const { hash } = require('./mutation_safety');
const { inventory } = require('./palette_matrix_model');

const SCHEMA = 'ikemaker.palette-domain-topology-review';
const VERSION = 1;
const LIMITS = Object.freeze({ reviews: 64, reviewAgeMs: 10 * 60 * 1000, draftBytes: 256 * 1024, palettes: 4096, spriteGroups: 4096, bindings: 4096, remapGroups: 512, remapRanges: domainModel.LIMITS.remapRanges, remapExpandedPairs: domainModel.LIMITS.remapExpandedPairs, unresolvedDetails: 256 });

function plain(value, label) { if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error(`${label} must be a plain object.`); return value; }
function boundedArray(value, maximum, label) { if (!Array.isArray(value) || value.length > maximum) throw new Error(`${label} must contain at most ${maximum} entries.`); return value; }
function canonical(value) { const resolved = path.resolve(String(value || '')); return process.platform === 'win32' ? resolved.toLowerCase() : resolved; }
function exactHash(value, label) { const text = String(value || '').toLowerCase(); if (!/^[0-9a-f]{64}$/.test(text)) throw new Error(`${label} is missing exact SHA-256 evidence.`); return text; }
function coordinateKey(value) { return `${value.group},${value.number}`; }
function exactInventory(archive) {
  if (!Buffer.isBuffer(archive?.buffer) || !Array.isArray(archive.palettes) || !Array.isArray(archive.sprites)) throw new Error('A live decoded SFF archive is required for domain review.');
  const observed = inventory(archive), paletteCounts = new Map(), spriteGroups = new Set();
  for (const palette of observed.palettes) { const key = coordinateKey(palette); paletteCounts.set(key, (paletteCounts.get(key) || 0) + 1); }
  for (const sprite of archive.sprites) { const group = Number(sprite.group); if (Number.isInteger(group) && group >= 0 && group <= 65535) spriteGroups.add(group); }
  return { observed, paletteCounts, spriteGroups, sffHash: hash(archive.buffer), sffByteLength: archive.buffer.length };
}
function requireExactPalette(value, live, label) { const exact = domainModel.coordinate(value, label), count = live.paletteCounts.get(coordinateKey(exact)) || 0; if (count !== 1) throw new Error(`${label} ${coordinateKey(exact)} must resolve to exactly one live embedded palette; found ${count}.`); return exact; }
function requireSpriteGroup(value, live, label) { const group = Number(value); if (!Number.isInteger(group) || group < 0 || group > 65535) throw new Error(`${label} must be an integer from 0 through 65535.`); if (!live.spriteGroups.has(group)) throw new Error(`${label} ${group} does not exist in the live SFF.`); return group; }
function stableId(value, prefix, randomBytes) { const text = String(value || '').trim(); return text || `${prefix}-${randomBytes(12).toString('hex')}`; }
function unique(values, label) { const result = [...new Set(values)]; if (result.length !== values.length) throw new Error(`${label} contains duplicate entries.`); return result; }
function registryEvidence(snapshot) { if (!snapshot || snapshot.readOnly || !snapshot.document) throw new Error(`Palette metadata is read-only${snapshot?.error ? `: ${snapshot.error}` : '.'}`); const revision = Number(snapshot.document.revision); if (!Number.isInteger(revision) || revision < 0 || !String(snapshot.archiveKey || '')) throw new Error('Palette metadata review evidence is incomplete.'); return { byteHash: exactHash(snapshot.byteHash, 'Palette metadata'), revision }; }
function has(object,key){return Object.prototype.hasOwnProperty.call(object,key);}

function preparePut(snapshot, archive, draft, randomBytes) {
  const live = exactInventory(archive), current = snapshot.archive || domainModel.emptyArchive(), raw = plain(draft.domain, 'Domain draft'), domainId = stableId(raw.id, 'domain', randomBytes);
  boundedArray(raw.paletteIds || [], LIMITS.palettes, 'Domain palette membership'); boundedArray(raw.spriteGroupIds || [], LIMITS.spriteGroups, 'Domain sprite groups'); boundedArray(raw.remapPalGroupIds || [], LIMITS.remapGroups, 'Domain RemapPal links');
  const paletteIds = unique((raw.paletteIds || []).map(value => requireExactPalette(value, live, 'Domain palette')), 'Domain palette membership');
  if (!paletteIds.length) throw new Error('A master domain requires at least one exact embedded palette.');
  const masterPalette = requireExactPalette(raw.masterPalette, live, 'Master palette');
  if (!paletteIds.some(item => coordinateKey(item) === coordinateKey(masterPalette))) throw new Error('The explicit master palette must be included in this domain’s palette membership.');
  const availableRemaps = new Set(current.remapPalGroups.map(item => item.id)), remapPalGroupIds = unique((raw.remapPalGroupIds || []).map(String), 'Domain RemapPal links');
  for (const id of remapPalGroupIds) if (!availableRemaps.has(id)) throw new Error(`Domain references unknown RemapPal group ${id}.`);
  const spriteGroupIds = unique((raw.spriteGroupIds || []).map(value => requireSpriteGroup(value, live, 'Domain sprite group')), 'Domain sprite groups').sort((a, b) => a - b);
  if (!spriteGroupIds.length) throw new Error('A master domain requires at least one exact live sprite group and explicit binding.');
  const rawBindings = boundedArray(draft.bindings || [], LIMITS.bindings, 'Domain bindings'), bindings = rawBindings.map((value, index) => {
    const item = plain(value, `Domain binding ${index + 1}`), spriteGroup = requireSpriteGroup(item.spriteGroup, live, 'Binding sprite group'), linked = item.remapPalGroupIds == null ? remapPalGroupIds : unique(boundedArray(item.remapPalGroupIds, LIMITS.remapGroups, 'Binding RemapPal links').map(String), 'Binding RemapPal links');
    for (const id of linked) if (!availableRemaps.has(id)) throw new Error(`Binding references unknown RemapPal group ${id}.`);
    return { spriteGroup, domainIds: [domainId], remapPalGroupIds: linked, note: String(item.note || '').slice(0, 512) };
  });
  if (new Set(bindings.map(item => item.spriteGroup)).size !== bindings.length) throw new Error('Only one reviewed binding may be supplied for each sprite group.');
  if (spriteGroupIds.length !== bindings.length || spriteGroupIds.some((group, index) => group !== [...bindings].map(item => item.spriteGroup).sort((a, b) => a - b)[index])) throw new Error('Domain sprite groups and reviewed binding rows must describe the same exact groups.');
  const domain = { id: domainId, name: raw.name, description: raw.description, color: raw.color, enabled: raw.enabled !== false, masterPalette, paletteIds, spriteGroupIds, remapPalGroupIds };
  const operation = { kind: 'putDomainTopology', value: { domain, bindings, reviewedInventoryHash: live.observed.inventoryHash } };
  const normalized = domainModel.applyOperation(snapshot.document, snapshot.archiveKey, operation).archives[snapshot.archiveKey];
  const saved = normalized.domains.find(item => item.id === domainId);
  return { live, operation, domain: saved, summary: { action: current.domains.some(item => item.id === domainId) ? 'update' : 'create', name: saved.name, masterPalette: saved.masterPalette, paletteCount: saved.paletteIds.length, spriteGroupCount: saved.spriteGroupIds.length, remapGroupCount: saved.remapPalGroupIds.length, cascadeReferences: [] } };
}
function prepareDelete(snapshot, archive, draft) {
  const live = exactInventory(archive), id = String(plain(draft.domain, 'Domain draft').id || ''), current = (snapshot.archive || domainModel.emptyArchive()).domains.find(item => item.id === id);
  if (!current) throw new Error('The selected master domain no longer exists.');
  const references = domainModel.cascadePreview(snapshot.archive, 'domain', id), operation = { kind: 'deleteDomain', id, confirmCascade: true };
  domainModel.applyOperation(snapshot.document, snapshot.archiveKey, operation);
  return { live, operation, domain: current, summary: { action: 'delete', name: current.name, masterPalette: current.masterPalette, paletteCount: current.paletteIds.length, spriteGroupCount: current.spriteGroupIds.length, remapGroupCount: current.remapPalGroupIds.length, cascadeReferences: references } };
}

function classifyRemapCoordinates(group, live, options={}) {
  const pairs=[],unresolved=[],ambiguous=[];
  group.rangeMappings.forEach((mapping,rangeIndex)=>domainModel.expandRemapPalRange(mapping).forEach((pair,pairOffset)=>{
    const item={rangeIndex,pairOffset,source:pair.source,destination:pair.destination},states={};
    for(const role of ['source','destination']){const coordinate=pair[role],count=live.paletteCounts.get(coordinateKey(coordinate))||0;states[role]={count};if(count===0)unresolved.push({role,coordinate:{...coordinate},rangeIndex,pairOffset,classification:'missing'});else if(count>1)ambiguous.push({role,coordinate:{...coordinate},rangeIndex,pairOffset,count,classification:'ambiguous'});}
    pairs.push({...item,resolved:states.source.count===1&&states.destination.count===1,sourceCount:states.source.count,destinationCount:states.destination.count});
  }));
  if(pairs.length>LIMITS.remapExpandedPairs)throw new Error(`RemapPal range mappings may expand to at most ${LIMITS.remapExpandedPairs} palette pairs.`);
  if(ambiguous.length&&options.rejectAmbiguous!==false){const first=ambiguous[0];throw new Error(`RemapPal ${first.role} ${coordinateKey(first.coordinate)} is ambiguous in the live SFF; found ${first.count} physical palettes.`);}
  return{pairs,unresolved,ambiguous,counts:{rangeCount:group.rangeMappings.length,expandedPairCount:pairs.length,resolvedCount:pairs.filter(item=>item.resolved).length,missingCount:unresolved.length,ambiguousCount:ambiguous.length}};
}
function prepareRemapPut(snapshot,archive,draft,randomBytes){
  const live=exactInventory(archive),current=snapshot.archive||domainModel.emptyArchive(),raw=plain(draft.group,'RemapPal group draft'),requestedId=String(raw.id||'').trim(),prior=requestedId?current.remapPalGroups.find(item=>item.id===requestedId):null;
  if(requestedId&&!prior)throw new Error('The selected RemapPal group no longer exists; new group IDs are issued by the host.');
  if(has(raw,'enabled')&&typeof raw.enabled!=='boolean')throw new Error('RemapPal enabled state must be an explicit boolean.');
  if(has(raw,'description')&&typeof raw.description!=='string')throw new Error('RemapPal description must be text.');
  const groupId=prior?.id||stableId('', 'remap', randomBytes),rawRanges=boundedArray(raw.rangeMappings,LIMITS.remapRanges,'RemapPal range mappings');
  if(!rawRanges.length)throw new Error('A named RemapPal group requires at least one explicit directed range.');
  const rangeMappings=rawRanges.map(domainModel.normalizeRemapPalRange),availableDomains=new Set(current.domains.map(item=>item.id)),domainIds=unique((has(raw,'domainIds')?boundedArray(raw.domainIds,LIMITS.remapGroups,'Linked master domains'):prior?.domainIds||[]).map(String),'Linked master domains');
  for(const id of domainIds)if(!availableDomains.has(id))throw new Error(`RemapPal group references unknown master domain ${id}.`);
  const group={id:groupId,name:has(raw,'name')?raw.name:prior?.name,description:has(raw,'description')?raw.description:prior?.description||'',enabled:has(raw,'enabled')?raw.enabled:prior?.enabled!==false,rangeMappings,legacyPaletteIds:[],reviewedInventoryHash:live.observed.inventoryHash,domainIds};
  const operation={kind:'putRemapPalTopology',value:{group,reviewedInventoryHash:live.observed.inventoryHash}},normalized=domainModel.applyOperation(snapshot.document,snapshot.archiveKey,operation),saved=normalized.archives[snapshot.archiveKey].remapPalGroups.find(item=>item.id===groupId),classification=classifyRemapCoordinates(saved,live),others=current.remapPalGroups.filter(item=>item.id!==groupId),diagnostics=domainModel.remapPalMappingDiagnostics([...others,saved]).filter(item=>(item.groupIds||[]).includes(groupId));
  const conflicts=diagnostics.filter(item=>item.severity==='error');if(conflicts.length)throw new Error(`RemapPal ranges conflict with reviewed mappings: ${conflicts[0].message}`);
  return{kind:'remapPal',live,operation,entity:saved,counts:classification.counts,unresolvedCoordinates:classification.unresolved.slice(0,LIMITS.unresolvedDetails),diagnostics,summary:{action:prior?'update':'create',id:saved.id,name:saved.name,linkedDomainIds:saved.domainIds,rangeCount:saved.rangeMappings.length,pairCount:classification.pairs.length,cascadeReferences:[]}};
}
function prepareRemapDelete(snapshot,archive,draft){
  const live=exactInventory(archive),current=snapshot.archive||domainModel.emptyArchive(),raw=plain(draft.group,'RemapPal group draft'),id=String(raw.id||''),group=current.remapPalGroups.find(item=>item.id===id);
  if(!group)throw new Error('The selected RemapPal group no longer exists.');
  const references=domainModel.cascadePreview(current,'remapPalGroup',id),operation={kind:'deleteRemapPalGroup',id,confirmCascade:true};domainModel.applyOperation(snapshot.document,snapshot.archiveKey,operation);const classification=classifyRemapCoordinates(group,live,{rejectAmbiguous:false});
  return{kind:'remapPal',live,operation,entity:group,counts:classification.counts,unresolvedCoordinates:classification.unresolved.slice(0,LIMITS.unresolvedDetails),diagnostics:[],summary:{action:'delete',id:group.id,name:group.name,linkedDomainIds:group.domainIds,rangeCount:group.rangeMappings.length,pairCount:classification.pairs.length,cascadeReferences:references}};
}

class PaletteDomainAuthoring {
  constructor(options = {}) { this.now = options.now || (() => Date.now()); this.randomBytes = options.randomBytes || crypto.randomBytes; this.reviews = new Map(); }
  prune() { const cutoff = this.now() - LIMITS.reviewAgeMs; for (const [token, item] of this.reviews) if (item.createdAt < cutoff) this.reviews.delete(token); while (this.reviews.size >= LIMITS.reviews) this.reviews.delete(this.reviews.keys().next().value); }
  revoke(filename = '') { const target = canonical(filename), tokens = [...this.reviews].filter(([, item]) => canonical(item.evidence.filename) === target).map(([token]) => token); for (const token of tokens) this.reviews.delete(token); return tokens.length; }
  issueToken() { for (let attempt = 0; attempt < 16; attempt++) { const token = this.randomBytes(24).toString('hex'); if (/^[0-9a-f]{48}$/.test(token) && !this.reviews.has(token)) return token; } throw new Error('A unique domain topology review token could not be issued. Try Preview again.'); }
  preview(input = {}) {
    this.revoke(input.filename);
    const serialized = JSON.stringify(input.draft ?? null); if (Buffer.byteLength(serialized || '', 'utf8') > LIMITS.draftBytes) throw new Error('Domain topology draft is too large to review safely.');
    const draft = plain(input.draft, 'Domain topology draft'), snapshot = input.registrySnapshot, registry = registryEvidence(snapshot), action = String(draft.operation || 'putDomainTopology'), prepared = action === 'deleteDomain' ? prepareDelete(snapshot, input.archive, draft) : action === 'putDomainTopology' ? preparePut(snapshot, input.archive, draft, this.randomBytes) : action === 'put' ? prepareRemapPut(snapshot,input.archive,draft,this.randomBytes) : action === 'delete' ? prepareRemapDelete(snapshot,input.archive,draft) : (() => { throw new Error(`Unsupported domain topology action: ${action}`); })();
    this.prune(); const reviewToken = this.issueToken(), createdAt = this.now(),draftHash=domainModel.semanticHash(prepared.operation),rangeDraftHash=prepared.kind==='remapPal'?domainModel.semanticHash(prepared.entity.rangeMappings):'',linkedDomainIdsHash=prepared.kind==='remapPal'?domainModel.semanticHash(prepared.entity.domainIds):'', evidence = { filename: path.resolve(input.filename), sffHash: prepared.live.sffHash, sffByteLength: prepared.live.sffByteLength, inventoryHash: prepared.live.observed.inventoryHash, registryByteHash: registry.byteHash, registryRevision: registry.revision, archiveKey: snapshot.archiveKey,draftHash,rangeDraftHash,linkedDomainIdsHash };
    this.reviews.set(reviewToken, { createdAt, evidence, operation: prepared.operation });
    const verb = prepared.summary.action === 'delete' ? 'Remove' : prepared.summary.action === 'create' ? 'Create' : 'Update', summary = prepared.kind==='remapPal'?`${verb} “${prepared.summary.name}” · ${prepared.summary.rangeCount} ordered range(s) · ${prepared.summary.pairCount} expanded palette pair(s) · ${prepared.summary.linkedDomainIds.length} linked master domain(s).`:`${verb} “${prepared.summary.name}” · master ${prepared.summary.masterPalette ? coordinateKey(prepared.summary.masterPalette) : 'not set'} · ${prepared.summary.paletteCount} palette(s) · ${prepared.summary.spriteGroupCount} sprite group(s) · ${prepared.summary.remapGroupCount} RemapPal link(s).`;
    const warnings=[];if(prepared.summary.cascadeReferences.length)warnings.push({code:'metadata-cascade',message:`Removal also clears ${prepared.summary.cascadeReferences.length} reviewed metadata reference(s); the SFF is unchanged.`});if(prepared.kind==='remapPal'&&prepared.counts.missingCount)warnings.push({code:'unresolved-live-coordinates',message:`${prepared.counts.missingCount} range endpoint occurrence(s) are not present in the live SFF. They remain explicit metadata-only mappings.`});if(prepared.kind==='remapPal'&&prepared.counts.ambiguousCount)warnings.push({code:'ambiguous-live-coordinates',message:`${prepared.counts.ambiguousCount} range endpoint occurrence(s) resolve to several physical palettes. Removal remains metadata-only; creating or updating such mappings is blocked.`});
    return { schema: SCHEMA, version: VERSION, reviewToken, expiresAt: new Date(createdAt + LIMITS.reviewAgeMs).toISOString(), canApply: true, blocked: false, blockers: [], warnings, metadataOnly: true, activeSffChanged: false, domain: prepared.domain, remapPalGroup:prepared.kind==='remapPal'?prepared.entity:undefined, summary,counts:prepared.counts||undefined, details: prepared.kind==='remapPal'?{...prepared.summary,diagnostics:prepared.diagnostics,unresolvedCoordinates:prepared.unresolvedCoordinates}:prepared.summary, evidence };
  }
  consume(reviewToken, input = {}) {
    const token = String(reviewToken || ''); if (!/^[0-9a-f]{48}$/.test(token)) throw new Error('A valid domain topology review token is required.');
    const retained = this.reviews.get(token); this.reviews.delete(token); if (!retained) throw new Error('This domain topology review was already used, expired, or is unavailable. Review the draft again.');
    if (this.now() - retained.createdAt > LIMITS.reviewAgeMs) throw new Error('This domain topology review expired. Review the draft again.');
    const snapshot = input.registrySnapshot, registry = registryEvidence(snapshot), live = exactInventory(input.archive), evidence = retained.evidence;
    if (canonical(input.filename) !== canonical(evidence.filename) || live.sffHash !== evidence.sffHash || live.sffByteLength !== evidence.sffByteLength || live.observed.inventoryHash !== evidence.inventoryHash) throw new Error('The SFF changed after domain topology review. Review the current archive again.');
    if (registry.byteHash !== evidence.registryByteHash || registry.revision !== evidence.registryRevision || snapshot.archiveKey !== evidence.archiveKey) throw new Error('Palette metadata changed after domain topology review. Review it again.');
    return { operation: retained.operation, expected: { byteHash: evidence.registryByteHash, revision: evidence.registryRevision }, evidence: { ...evidence } };
  }
}

module.exports = { SCHEMA, VERSION, LIMITS, PaletteDomainAuthoring, exactInventory };
