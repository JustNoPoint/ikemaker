'use strict';

const assert = require('assert');
const domain = require('../src/palette_domain_model');
const { hash } = require('../src/mutation_safety');
const { PaletteDomainAuthoring, LIMITS } = require('../src/palette_domain_authoring');

const colors = seed => Array.from({ length: 256 }, (_, index) => [seed, index, 0, index ? 255 : 0]);
const makeArchive = (palettes, bytes = 'SFF-REMAP') => ({ buffer: Buffer.from(bytes), palettes: palettes.map((item,index)=>({index,link:index,colors:colors(index+1),...item})), sprites:[{index:0,group:0,number:0}] });
const live=makeArchive([{group:1,number:1},{group:1,number:2},{group:2,number:1},{group:2,number:2},{group:3,number:1}]);
const archiveKey='chars/hero/hero.sff',domainId='domain-01';
let document=domain.applyOperation(domain.emptyRegistry(),archiveKey,{kind:'putDomain',value:{id:domainId,name:'Character master',masterPalette:{group:1,number:1},paletteIds:[{group:1,number:1},{group:1,number:2}],spriteGroupIds:[0],remapPalGroupIds:[]}});
const snapshot=(doc=document,byte='a'.repeat(64))=>({readOnly:false,byteHash:byte,document:doc,archiveKey,archive:doc.archives[archiveKey]});
let tick=Date.parse('2026-10-22T16:00:00Z'),nonce=0;
const owner=new PaletteDomainAuthoring({now:()=>tick,randomBytes:size=>Buffer.alloc(size,++nonce)});
const putDraft={operation:'put',group:{name:'Costume banks',description:'Keep this description',enabled:true,domainIds:[domainId],rangeMappings:[
  {source:{group:1,startNumber:1,endNumber:2},destination:{group:2,startNumber:1,endNumber:2}},
  {source:{group:3,startNumber:1,endNumber:1},destination:{group:4,startNumber:1,endNumber:1}}
]}};

const beforeHash=hash(live.buffer),review=owner.preview({filename:'C:/game/hero.sff',archive:live,registrySnapshot:snapshot(),draft:putDraft});
assert.strictEqual(review.canApply,true);assert.strictEqual(review.blocked,false);assert.strictEqual(review.metadataOnly,true);assert.strictEqual(review.activeSffChanged,false);
assert.match(review.remapPalGroup.id,/^remap-/);assert.strictEqual(review.remapPalGroup.rangeMappings.length,2,'all ordered ranges survive review');
assert.deepStrictEqual(review.remapPalGroup.rangeMappings.map(item=>item.source.group),[1,3],'range order is retained exactly');
assert.deepStrictEqual(review.counts,{rangeCount:2,expandedPairCount:3,resolvedCount:2,missingCount:1,ambiguousCount:0});
assert.strictEqual(review.details.unresolvedCoordinates[0].role,'destination');assert.deepStrictEqual(review.details.unresolvedCoordinates[0].coordinate,{group:4,number:1});
assert(review.warnings.some(item=>item.code==='unresolved-live-coordinates'));assert.deepStrictEqual(review.details.linkedDomainIds,[domainId]);
for(const field of ['draftHash','rangeDraftHash','linkedDomainIdsHash','sffHash','inventoryHash','registryByteHash'])assert.match(review.evidence[field],/^[0-9a-f]{64}$/);
assert.strictEqual(hash(live.buffer),beforeHash,'review never changes SFF bytes');

const authorized=owner.consume(review.reviewToken,{filename:'C:/game/hero.sff',archive:live,registrySnapshot:snapshot()});
assert.strictEqual(authorized.operation.kind,'putRemapPalTopology');assert.throws(()=>owner.consume(review.reviewToken,{filename:'C:/game/hero.sff',archive:live,registrySnapshot:snapshot()}),/already used/);
document=domain.applyOperation(document,archiveKey,authorized.operation);let saved=document.archives[archiveKey],group=saved.remapPalGroups[0];
assert.strictEqual(group.rangeMappings.length,2);assert(saved.domains[0].remapPalGroupIds.includes(group.id),'atomic topology keeps linked domain relation symmetric');assert.strictEqual(saved.lastReviewedInventoryHash,review.evidence.inventoryHash);

document=domain.applyOperation(document,archiveKey,{kind:'putBinding',value:{spriteGroup:0,domainIds:[domainId],remapPalGroupIds:[group.id],note:'preserve me'}});saved=document.archives[archiveKey];
const updateDraft={operation:'put',group:{id:group.id,name:'Costume banks revised',rangeMappings:[
  {source:{group:1,startNumber:1,endNumber:1},destination:{group:2,startNumber:1,endNumber:1}},
  {source:{group:1,startNumber:2,endNumber:2},destination:{group:2,startNumber:2,endNumber:2}}
]}};
const update=owner.preview({filename:'C:/game/hero.sff',archive:live,registrySnapshot:snapshot(document,'b'.repeat(64)),draft:updateDraft});
assert.strictEqual(update.remapPalGroup.description,'Keep this description');assert.strictEqual(update.remapPalGroup.enabled,true);assert.deepStrictEqual(update.remapPalGroup.domainIds,[domainId],'omitted links are preserved rather than inferred');
const updateAuth=owner.consume(update.reviewToken,{filename:'C:/game/hero.sff',archive:live,registrySnapshot:snapshot(document,'b'.repeat(64))});document=domain.applyOperation(document,archiveKey,updateAuth.operation);saved=document.archives[archiveKey];
assert.strictEqual(saved.spriteGroupBindings[0].note,'preserve me');assert.deepStrictEqual(saved.spriteGroupBindings[0].remapPalGroupIds,[group.id],'range edits preserve existing bindings');

const forged={...updateDraft,group:{...updateDraft.group,id:'unknown-01'}};
assert.throws(()=>owner.preview({filename:'C:/game/hero.sff',archive:live,registrySnapshot:snapshot(document,'c'.repeat(64)),draft:forged}),/no longer exists|issued by the host/);
assert.throws(()=>owner.preview({filename:'C:/game/hero.sff',archive:live,registrySnapshot:snapshot(document,'c'.repeat(64)),draft:{operation:'put',group:{name:'Bad',rangeMappings:[{source:{group:1,startNumber:2,endNumber:1},destination:{group:2,startNumber:2,endNumber:1}}],domainIds:[]}}}),/ascending inclusive/);
assert.throws(()=>owner.preview({filename:'C:/game/hero.sff',archive:live,registrySnapshot:snapshot(document,'c'.repeat(64)),draft:{operation:'put',group:{name:'Too many',rangeMappings:Array(LIMITS.remapRanges+1).fill(updateDraft.group.rangeMappings[0]),domainIds:[]}}}),/at most/);
assert.throws(()=>owner.preview({filename:'C:/game/hero.sff',archive:live,registrySnapshot:snapshot(document,'c'.repeat(64)),draft:{operation:'put',group:{name:'Unknown domain',rangeMappings:updateDraft.group.rangeMappings,domainIds:['domain-unknown']}}}),/unknown master domain/);
assert.throws(()=>owner.preview({filename:'C:/game/hero.sff',archive:live,registrySnapshot:snapshot(document,'c'.repeat(64)),draft:{operation:'put',group:{name:'Bad enabled',enabled:'false',rangeMappings:updateDraft.group.rangeMappings,domainIds:[]}}}),/explicit boolean/);

let conflictDoc=domain.applyOperation(document,archiveKey,{kind:'putRemapPalGroup',value:{id:'remap-other',name:'Other',rangeMappings:[{source:{group:1,startNumber:1,endNumber:1},destination:{group:5,startNumber:1,endNumber:1}}],domainIds:[]}});
assert.throws(()=>owner.preview({filename:'C:/game/hero.sff',archive:live,registrySnapshot:snapshot(conflictDoc,'d'.repeat(64)),draft:updateDraft}),/conflict with reviewed mappings/,'conflicting source overlap is rejected');
const ambiguous=makeArchive([{group:1,number:1},{group:1,number:1},{group:2,number:1}]);
assert.throws(()=>owner.preview({filename:'C:/game/hero.sff',archive:ambiguous,registrySnapshot:snapshot(document,'c'.repeat(64)),draft:{operation:'put',group:{name:'Ambiguous',rangeMappings:[updateDraft.group.rangeMappings[0]],domainIds:[]}}}),/ambiguous.*found 2/);

const staleSff=owner.preview({filename:'C:/game/hero.sff',archive:live,registrySnapshot:snapshot(document,'c'.repeat(64)),draft:updateDraft});
assert.throws(()=>owner.consume(staleSff.reviewToken,{filename:'C:/game/hero.sff',archive:makeArchive(live.palettes.map(item=>({group:item.group,number:item.number})),'CHANGED'),registrySnapshot:snapshot(document,'c'.repeat(64))}),/SFF changed/);
const staleInventory=owner.preview({filename:'C:/game/hero.sff',archive:live,registrySnapshot:snapshot(document,'c'.repeat(64)),draft:updateDraft}),inventoryChanged={...live,palettes:live.palettes.slice(0,-1)};
assert.throws(()=>owner.consume(staleInventory.reviewToken,{filename:'C:/game/hero.sff',archive:inventoryChanged,registrySnapshot:snapshot(document,'c'.repeat(64))}),/SFF changed/,'inventory drift is bound even if supplied bytes are unchanged');
const staleRegistry=owner.preview({filename:'C:/game/hero.sff',archive:live,registrySnapshot:snapshot(document,'c'.repeat(64)),draft:updateDraft});
assert.throws(()=>owner.consume(staleRegistry.reviewToken,{filename:'C:/game/hero.sff',archive:live,registrySnapshot:snapshot(document,'e'.repeat(64))}),/metadata changed/);

const deletion=owner.preview({filename:'C:/game/hero.sff',archive:live,registrySnapshot:snapshot(document,'c'.repeat(64)),draft:{operation:'delete',group:{id:group.id}}});
assert.strictEqual(deletion.details.action,'delete');assert(deletion.details.cascadeReferences.some(item=>item.kind==='domain'));assert(deletion.details.cascadeReferences.some(item=>item.kind==='spriteGroupBinding'));assert(deletion.warnings.some(item=>item.code==='metadata-cascade'));
const deleteAuth=owner.consume(deletion.reviewToken,{filename:'C:/game/hero.sff',archive:live,registrySnapshot:snapshot(document,'c'.repeat(64))}),deleted=domain.applyOperation(document,archiveKey,deleteAuth.operation).archives[archiveKey];
assert.strictEqual(deleted.remapPalGroups.length,0);assert.deepStrictEqual(deleted.domains[0].remapPalGroupIds,[]);assert.deepStrictEqual(deleted.spriteGroupBindings[0].remapPalGroupIds,[]);assert.strictEqual(hash(live.buffer),beforeHash);

const older=owner.preview({filename:'C:/game/hero.sff',archive:live,registrySnapshot:snapshot(document,'c'.repeat(64)),draft:updateDraft}),newer=owner.preview({filename:'C:/game/hero.sff',archive:live,registrySnapshot:snapshot(document,'c'.repeat(64)),draft:{...updateDraft,group:{...updateDraft.group,name:'Newest review'}}});
assert.throws(()=>owner.consume(older.reviewToken,{filename:'C:/game/hero.sff',archive:live,registrySnapshot:snapshot(document,'c'.repeat(64))}),/already used|unavailable/,'a newer range review revokes older same-target authority');
assert.strictEqual(owner.revoke('C:/game/hero.sff'),1);assert.throws(()=>owner.consume(newer.reviewToken,{filename:'C:/game/hero.sff',archive:live,registrySnapshot:snapshot(document,'c'.repeat(64))}),/already used|unavailable/,'refresh or disposal revokes the retained range review');

console.log('Palette RemapPal multi-range review authority, CAS evidence, live classification, cascade, and byte invariants passed');
