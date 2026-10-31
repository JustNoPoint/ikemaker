'use strict';

const fs = require('fs');
const path = require('path');
const { hash, transactionalWriteSet } = require('./mutation_safety');
const { LIMITS, stable, sha, buildCollective, applyReplacement, encodeRgbaPng } = require('./palette_collective_model');
const { decodePng } = require('./palette_index_organizer_model');

function contained(root, candidate) { const relative = path.relative(path.resolve(root), path.resolve(candidate)); return relative && !relative.startsWith('..') && !path.isAbsolute(relative); }
function safeName(value) { return String(value || 'image.png').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '') || 'image.png'; }
function readExact(io, source, stage) { const unresolved=path.resolve(source.filename),link=io.lstatSync(unresolved);if(link.isSymbolicLink())throw new Error(`Collective source became a symbolic link ${stage}: ${source.filename}`);const real=io.realpathSync(unresolved),stat=io.statSync(real);if(!stat.isFile()||stat.size!==source.byteLength)throw new Error(`Collective source changed ${stage}: ${source.filename}`);const bytes=io.readFileSync(real); if (hash(bytes) !== source.byteHash || bytes.length !== source.byteLength) throw new Error(`Collective source changed ${stage}: ${source.filename}`); return bytes; }
function verifyReceipt(saved, expected) { const {receiptHash,...body}=saved||{},semantic=sha(Buffer.from(stable(body)));if(receiptHash!==semantic||receiptHash!==expected.receiptHash||stable(body)!==stable(Object.fromEntries(Object.entries(expected).filter(([key])=>key!=='receiptHash'))))throw new Error('Published palette copy receipt failed exact reopen verification.');return true; }
function verifyReceiptFile(filename, expectedHash = '', io = fs) { const receiptFile=path.resolve(filename),root=path.dirname(receiptFile),saved=JSON.parse(io.readFileSync(receiptFile,'utf8')),{receiptHash,...body}=saved||{};if(receiptHash!==sha(Buffer.from(stable(body)))||(expectedHash&&receiptHash!==expectedHash))throw new Error('Retained palette copy receipt failed semantic verification.');for(const output of body.outputs||[]){const target=path.resolve(root,String(output.relativeName||''));if(!contained(root,target))throw new Error('Retained palette copy receipt contains an escaped output path.');const bytes=io.readFileSync(target);if(hash(bytes)!==output.outputHash)throw new Error(`Retained palette copy output failed hash verification: ${target}`);}return saved; }

function writeCollectiveCopies(input = {}, dependencies = {}) {
  const io = dependencies.fs || fs, writeSet = dependencies.transactionalWriteSet || transactionalWriteSet, collective = input.collective, proposal = input.proposal, rawOutput=typeof input.outputRoot==='string'?input.outputRoot.trim():'',requestedOutput = rawOutput?path.resolve(rawOutput):'';let outputRoot=requestedOutput;
  if (!collective?.inventoryHash || proposal?.inventoryHash !== collective.inventoryHash) throw new Error('Copy proposal does not match the exact collective inventory.');
  if (!outputRoot) throw new Error('Choose a copy output folder.');
  if(io.existsSync(outputRoot)){const stat=io.lstatSync(outputRoot);if(stat.isSymbolicLink()||!stat.isDirectory())throw new Error('Copy output root must be a real directory.');outputRoot=io.realpathSync(outputRoot);if(io.readdirSync(outputRoot).length)throw new Error('Copy output root must be new or empty.');}else{const parent=path.dirname(outputRoot);if(!io.existsSync(parent)||io.lstatSync(parent).isSymbolicLink()||!io.statSync(io.realpathSync(parent)).isDirectory())throw new Error('Copy output parent must be an existing real directory.');outputRoot=path.join(io.realpathSync(parent),path.basename(outputRoot));}
  const selected = new Map(proposal.images.map(item => [item.imageId, item])), outputs = [];
  for (const image of collective.images.filter(item => selected.has(item.imageId))) {
    const saved = selected.get(image.imageId); if (saved.sourceHash !== image.byteHash) throw new Error('Copy proposal source authority changed.');
    const before = readExact(io,image,'before copy build');
    const decoded = decodePng(before, { maximumFileBytes: LIMITS.maximumFileBytes, maximumPixels: LIMITS.maximumPixels, maximumDimension: LIMITS.maximumDimension }), changed = applyReplacement(decoded, proposal.fromColorId, proposal.toColorId);
    if (changed.changed !== saved.pixelCount) throw new Error(`Replacement count changed for ${image.filename}.`);
    const bytes = encodeRgbaPng(changed.width, changed.height, changed.rgba), reopened = decodePng(bytes, { maximumFileBytes: LIMITS.maximumFileBytes, maximumPixels: LIMITS.maximumPixels, maximumDimension: LIMITS.maximumDimension });
    if (sha(reopened.rgba) !== changed.pixelHash) throw new Error(`Generated copy did not reopen exactly for ${image.filename}.`);
    const filename = path.join(outputRoot, `${String(image.order + 1).padStart(4, '0')}_${safeName(image.name)}`); if (!contained(outputRoot, filename)) throw new Error('Copy output escaped the selected output root.');
    outputs.push({ imageId: image.imageId, filename, relativeName: path.relative(outputRoot, filename).replace(/\\/g, '/'), sourceHash: image.byteHash, outputHash: hash(bytes), pixelHash: changed.pixelHash, changedPixels: changed.changed, bytes });
  }
  for (const image of collective.images.filter(item => selected.has(item.imageId))) readExact(io,image,'immediately before atomic publish');
  const receiptBody = { schema: 'ikemaker.palette-copy-receipt', version: 1, inventoryHash: collective.inventoryHash, proposalHash: proposal.proposalHash, fromColorId: proposal.fromColorId, toColorId: proposal.toColorId, outputs: outputs.map(({ imageId, relativeName, sourceHash, outputHash, pixelHash, changedPixels }) => ({ imageId, relativeName, sourceHash, outputHash, pixelHash, changedPixels })) }, receipt = { ...receiptBody, receiptHash: sha(Buffer.from(stable(receiptBody))) }, receiptBytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`), receiptFile = path.join(outputRoot, 'palette-copy-receipt.json');
  if(io.existsSync(outputRoot)){const seal=io.lstatSync(outputRoot);if(seal.isSymbolicLink()||io.realpathSync(outputRoot)!==outputRoot||io.readdirSync(outputRoot).length)throw new Error('Copy output root changed before atomic publish.');}
  const writes = [...outputs.map(item => [item.filename, item.bytes]), [receiptFile, receiptBytes]]; writeSet(io, writes, { label: 'palette-collective-copy-on-write', journalRoot: outputRoot, allowExisting: false, journal: true, aggregateJournal: true });
  for (const output of outputs) { const bytes = io.readFileSync(output.filename); if (hash(bytes) !== output.outputHash) throw new Error(`Published palette copy failed exact reopen verification: ${output.filename}`); }
  const savedReceipt = JSON.parse(io.readFileSync(receiptFile, 'utf8')); verifyReceipt(savedReceipt,receipt);
  return { status: 'copied', outputRoot, receiptFile, receipt, outputs: outputs.map(({ bytes, ...item }) => item) };
}

module.exports = { contained, safeName, verifyReceipt, verifyReceiptFile, writeCollectiveCopies };
