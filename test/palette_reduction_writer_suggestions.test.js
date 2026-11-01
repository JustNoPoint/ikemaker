'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const collectiveModel = require('../src/palette_collective_model');
const source = require('../src/palette_reduction_source_authority');
const model = require('../src/palette_reduction_model');
const suggestions = require('../src/palette_reduction_suggestion_contract');
const writer = require('../src/palette_reduction_copy_writer');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-reduction-writer-'));
const png = path.join(root, 'source.png');
const rgba = Buffer.from([10,20,30,255, 10,20,30,255, 0,0,0,0, 40,50,60,128]);
fs.writeFileSync(png, collectiveModel.encodeRgbaPng(2, 2, rgba));
try {
  const collective = collectiveModel.buildCollective([{ filename: png, buffer: fs.readFileSync(png) }]);
  const authority = source.buildAuthority(collective), image = authority.images[0];
  const layer = model.blankLayer('layer-001', 'Paint', 2, 2);
  const state = { activeImageId: image.imageId, images: [{ imageId: image.imageId, activeLayerId: layer.id, layers: [layer] }] };
  const bundle = suggestions.validateBundle({
    schema: 'ikemaker.palette-reduction-suggestion-bundle', version: 1, sourceAuthorityHash: authority.authorityHash,
    provider: { id: 'local-review', version: '1', mode: 'offline' },
    proposals: [{ id: 'proposal-001', kind: 'color-pair', imageId: image.imageId, confidence: .75, provenance: 'local mask review', pairs: [{ from: [10,20,30,255], to: [90,80,70,255] }] }]
  }, authority);
  assert.strictEqual(bundle.proposals[0].status, 'pending');
  assert.strictEqual(state.images[0].layers[0].pixels.size, 0, 'importing a proposal may not mutate pixels');
  const approved = suggestions.approve(bundle, 'proposal-001', authority);
  assert.strictEqual(approved.operation.kind, 'mapping-preset');
  assert.strictEqual(approved.inbox.proposals[0].status, 'approved');
  assert.throws(() => suggestions.validateBundle({ schema:'ikemaker.palette-reduction-suggestion-bundle',version:1,sourceAuthorityHash:authority.authorityHash,provider:{id:'x',version:'1',mode:'online'},proposals:[] }, authority), /offline or user-supplied/);
  assert.throws(() => suggestions.validateBundle({ schema:'ikemaker.palette-reduction-suggestion-bundle',version:1,sourceAuthorityHash:authority.authorityHash,provider:{id:'x',version:'1',mode:'offline'},proposals:[{id:'proposal-002',kind:'shell',imageId:image.imageId,confidence:1,provenance:'x'}] }, authority), /not allowed/);
  assert.throws(() => suggestions.validateBundle({ schema:'ikemaker.palette-reduction-suggestion-bundle',version:1,sourceAuthorityHash:authority.authorityHash,provider:{id:'x',version:'1',mode:'offline'},proposals:[{id:'proposal-003',kind:'brush',imageId:image.imageId,confidence:1,provenance:'x',pairs:[{from:[1,2,3,4],to:[4,3,2,1]}],points:[{x:999,y:0}],brush:{width:1,height:1}}] }, authority), /outside exact image bounds/);
  const painted = model.paint({ base:rgba,width:2,height:2,layers:[layer],activeLayerId:layer.id,pairs:approved.operation.pairs,points:[{x:0,y:0}],brush:{width:1,height:1} });
  const edited = { ...state, images: [{ ...state.images[0], layers: painted.layers }] }, out = path.join(root, 'copies');
  const result = writer.writeCopies({ authority, state:edited, operationId:'reduction-0001', revision:2, headByteHash:'a'.repeat(64), outputRoot:out });
  assert.strictEqual(result.status, 'verified-copies'); assert.strictEqual(result.handoff.activeSffChanged, false); assert.strictEqual(result.handoff.adoption, false);
  assert(fs.readFileSync(png).equals(collective.images[0].buffer)); assert.strictEqual(writer.verifyReceiptFile(result.receiptFile).receiptHash, result.receipt.receiptHash);
  const receipt = JSON.parse(fs.readFileSync(result.receiptFile)); receipt.outputs[0].pixelHash = 'f'.repeat(64);
  const receiptBody = { ...receipt }; delete receiptBody.receiptHash; receipt.receiptHash = model.sha(Buffer.from(model.stable(receiptBody)));
  fs.writeFileSync(result.receiptFile, JSON.stringify(receipt)); assert.throws(() => writer.verifyReceiptFile(result.receiptFile), /exact receipt verification/);
  fs.writeFileSync(result.receiptFile, JSON.stringify(result.receipt)); fs.unlinkSync(result.receiptFile);
  assert.strictEqual(writer.recoverReceipt({ authority,state:edited,operationId:'reduction-0001',revision:2,headByteHash:'a'.repeat(64),outputRoot:out }).recovered, true);
  assert.throws(() => writer.writeCopies({ authority,state:edited,operationId:'reduction-0001',revision:2,headByteHash:'a'.repeat(64),outputRoot:out }), /empty/);
} finally { fs.rmSync(root, { recursive:true, force:true }); }
console.log('Palette reduction untrusted suggestion, per-item approval, verified copy, receipt tamper, recovery, and no-original-write tests passed');
