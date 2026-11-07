'use strict';

const crypto = require('crypto');
const { types: utilTypes } = require('util');
const { actionSourceRanges } = require('./air_preview_model');
const { MAX_TEXT_BYTES } = require('./air_transfer_model');

const SCHEMA = 'ikemaker.air-transfer-resolution';
const VERSION = 1;
const MAX_DECISIONS = 1024;
const MAX_PATCH_BYTES = 1024 * 1024;
const SHA256 = /^[A-F0-9]{64}$/;
const EFFECTS = Object.freeze({ filesystem: false, persistence: false, sourceMutation: false, destinationMutation: false, autosave: false });

function sha(value) { return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex').toUpperCase(); }
function canonical(value) { if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`; if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`; return JSON.stringify(value); }
function deepFreeze(value, seen = new Set()) { if (!value || typeof value !== 'object' || seen.has(value)) return value; seen.add(value); for (const item of Object.values(value)) deepFreeze(item, seen); return Object.freeze(value); }
function deeplyFrozen(value, seen = new Set()) { if (!value || typeof value !== 'object' || seen.has(value)) return true; if (!Object.isFrozen(value)) return false; seen.add(value); return Object.values(value).every(item => deeplyFrozen(item, seen)); }
function safeTree(value, label, seen = new Set()) {
  if (value === null || ['string', 'boolean'].includes(typeof value) || typeof value === 'number' && Number.isFinite(value)) return;
  if (!value || typeof value !== 'object' || utilTypes.isProxy(value) || seen.has(value)) throw new TypeError(`${label} must contain only acyclic plain data.`);
  seen.add(value); const prototype = Object.getPrototypeOf(value), array = Array.isArray(value);
  if (array ? prototype !== Array.prototype : ![Object.prototype, null].includes(prototype)) throw new TypeError(`${label} must contain only plain data.`);
  const descriptors = Object.getOwnPropertyDescriptors(value), enumerable = Object.keys(descriptors).filter(key => descriptors[key].enumerable);
  if (Reflect.ownKeys(value).filter(key => !(array && key === 'length')).length !== enumerable.length || enumerable.some(key => !Object.prototype.hasOwnProperty.call(descriptors[key], 'value'))) throw new TypeError(`${label} cannot contain accessors or hidden fields.`);
  if (array) for (let index = 0; index < value.length; index += 1) if (!descriptors[String(index)] || !Object.prototype.hasOwnProperty.call(descriptors[String(index)], 'value')) throw new TypeError(`${label} arrays must be dense.`);
  for (const key of enumerable) safeTree(descriptors[key].value, `${label}.${key}`, seen);
  seen.delete(value);
}
function dataObject(value, label, allowed, required = []) {
  safeTree(value, label); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be a plain object.`);
  const keys = Object.keys(value), permitted = new Set(allowed); for (const key of keys) if (!permitted.has(key)) throw new TypeError(`${label} contains unsupported field ${key}.`); for (const key of required) if (!Object.prototype.hasOwnProperty.call(value, key)) throw new TypeError(`${label} is missing ${key}.`); return value;
}
function boundedText(value, label) { if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > MAX_TEXT_BYTES) throw new TypeError(`${label} must be a bounded string.`); return value; }
function integer(value, label) { if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${label} must be a non-negative safe integer.`); return value; }
function sourceRows(text) { return actionSourceRanges(text).map((range, physicalIndex) => ({ ...range, physicalIndex, id: `action:${range.number}@${physicalIndex}` })); }
function nextFree(occupied, start = 0) { let value = Math.max(0, Number(start) || 0); while (occupied.has(value)) value += 1; return value; }
function eolOf(text) { return (/\r\n|\r|\n/.exec(String(text)) || ['\n'])[0]; }
function rewriteHeader(block, action) { return block.replace(/(^[ \t]*\[[ \t]*begin[ \t]+action[ \t]+)-?\d+([ \t]*\])/im, `$1${action}$2`); }
function rewriteCopyTarget(block, action) {
  let changed = false;
  const output = String(block).replace(/^([ \t]*copy[ \t]+action[ \t]+)-?\d+([ \t]*(?:;.*)?)$/im, (_all, prefix, suffix) => { changed = true; return `${prefix}${action}${suffix}`; });
  if (!changed) throw new Error('The exact Copy Action directive could not be rewritten.');
  return output;
}
function remapFrames(block, mappings) {
  if (!mappings.size) return block;
  return String(block).split(/(\r\n|\r|\n)/).map(part => {
    if (/^(?:\r\n|\r|\n)$/.test(part)) return part;
    const semicolon = part.indexOf(';'), code = semicolon >= 0 ? part.slice(0, semicolon) : part, comment = semicolon >= 0 ? part.slice(semicolon) : '';
    const match = /^(\s*)(-?\d+)(\s*,\s*)(-?\d+)(\s*,\s*-?\d+\s*,\s*-?\d+\s*,\s*-?\d+.*)$/.exec(code);
    if (!match || Number(match[2]) === -1 || Number(match[4]) === -1) return part;
    const mapped = mappings.get(`${Number(match[2])},${Number(match[4])}`);
    return mapped ? `${match[1]}${mapped.group}${match[3]}${mapped.index}${match[5]}${comment}` : part;
  }).join('');
}
function applyPatches(text, patches) { let output = String(text); for (const patch of [...patches].sort((a, b) => b.start - a.start || ((b.end>b.start)-(a.end>a.start)) || (b.sequence ?? 0) - (a.sequence ?? 0))) output = output.slice(0, patch.start) + patch.text + output.slice(patch.end); return output; }

function validateReview(review, sourceText, destinationText) {
  safeTree(review, 'AIR Transfer review');
  if (!review || review.schema !== 'ikemaker.air-transfer-review' || review.version !== 1 || !Array.isArray(review.items) || !Array.isArray(review.copyClosureItems) || !Array.isArray(review.spriteDependencies) || !SHA256.test(String(review.analysisIdentity || ''))) throw new TypeError('AIR Transfer review authority is invalid.');
  if (!deeplyFrozen(review)) throw new TypeError('AIR Transfer review authority must be deeply immutable.');
  const projection = { sourceFingerprint: review.sourceFingerprint, destinationFingerprint: review.destinationFingerprint, dependencyMode: review.dependencyMode, items: review.items, copyClosureItems: review.copyClosureItems, spriteDependencies: review.spriteDependencies };
  if (sha(canonical(projection)) !== review.analysisIdentity) throw new Error('The AIR Transfer review identity is inconsistent.');
  if (!SHA256.test(String(review.sourceFingerprint || '')) || sha(sourceText) !== review.sourceFingerprint) throw new Error('The AIR Transfer source changed after review. Nothing was applied.');
  if (!SHA256.test(String(review.destinationFingerprint || '')) || sha(destinationText) !== review.destinationFingerprint) throw new Error('The AIR Transfer destination changed after review. Nothing was applied.');
  return review;
}

function decisionMap(values, allowedIds) {
  safeTree(values, 'AIR Transfer decisions');
  if (!Array.isArray(values) || values.length > MAX_DECISIONS) throw new TypeError(`AIR Transfer decisions must contain at most ${MAX_DECISIONS} items.`);
  const result = new Map();
  for (const [index, value] of values.entries()) {
    dataObject(value, `AIR Transfer decision ${index + 1}`, ['id', 'identity', 'manualAction', 'destinationPhysicalIndex', 'copyDependency'], ['id', 'identity']);
    if (typeof value.id !== 'string' || !allowedIds.has(value.id) || result.has(value.id)) throw new Error('AIR Transfer decisions require unique current reviewed item identities.');
    result.set(value.id, value);
  }
  return result;
}

function normalizeCopyMode(value) {
  const aliases = { preserve: 'preserve-copy', 'include-reference': 'include-copy-targets', materialize: 'materialize-copy' }, normalized = aliases[value] || value;
  return normalized || 'preserve-copy';
}

function normalizeSpriteMappings(values) {
  if (values === undefined) return new Map();
  safeTree(values, 'AIR sprite mappings'); if (!Array.isArray(values) || values.length > MAX_DECISIONS) throw new TypeError('AIR sprite mappings must be a bounded array.');
  const map = new Map();
  for (const [index, value] of values.entries()) {
    dataObject(value, `AIR sprite mapping ${index + 1}`, ['sourceId', 'destinationGroup', 'destinationIndex', 'verified'], ['sourceId', 'destinationGroup', 'destinationIndex', 'verified']);
    if (typeof value.sourceId !== 'string' || !/^-?\d+,-?\d+$/.test(value.sourceId) || map.has(value.sourceId)) throw new Error('AIR sprite mappings require unique group,index source identities.');
    if (value.verified !== true) throw new Error(`AIR sprite mapping ${value.sourceId} is not a verified SFF Transfer result.`);
    map.set(value.sourceId, { group: integer(value.destinationGroup, 'Destination sprite group'), index: integer(value.destinationIndex, 'Destination sprite index') });
  }
  return map;
}

function resolveAirTransfer(input) {
  dataObject(input, 'AIR Transfer resolution input', ['review', 'sourceText', 'destinationText', 'decisions', 'spriteMappings', 'placement'], ['review', 'sourceText', 'destinationText', 'decisions']);
  const sourceText = boundedText(input.sourceText, 'AIR Transfer source text'), destinationText = boundedText(input.destinationText, 'AIR Transfer destination text'), review = validateReview(input.review, sourceText, destinationText);
  const source = sourceRows(sourceText), byId = new Map(source.map(row => [row.id, row])), projections = new Map([...review.items, ...review.copyClosureItems].map(item => [item.id, item])), choices = decisionMap(input.decisions, new Set(projections.keys())), mappings = normalizeSpriteMappings(input.spriteMappings);
  const activeIds = new Set(review.items.map(item => item.id)), unresolved = [];
  for (const item of review.items) {
    if (!item.copyDependency) continue;
    const decision = choices.get(item.id), mode = normalizeCopyMode(decision?.copyDependency);
    if (mode === 'include-copy-targets') for (const id of item.copyDependency.chainIds || []) activeIds.add(id);
  }
  const active = [...activeIds].map(id => ({ row: byId.get(id), projection: projections.get(id), decision: choices.get(id) })).sort((a, b) => (a.row?.physicalIndex ?? Number.MAX_SAFE_INTEGER) - (b.row?.physicalIndex ?? Number.MAX_SAFE_INTEGER));
  const destination = actionSourceRanges(destinationText), destinationByNumber = new Map(); for (const row of destination) { if (!destinationByNumber.has(row.number)) destinationByNumber.set(row.number, []); destinationByNumber.get(row.number).push(row); }
  let insertionPhysicalIndex=destination.length,insertionOffset=destinationText.length;
  if(input.placement!==undefined&&input.placement!==null){const placement=dataObject(input.placement,'AIR Transfer placement',['kind','targetPhysicalIndex','targetId','position'],['kind','targetPhysicalIndex','targetId','position']),physical=integer(placement.targetPhysicalIndex,'AIR Transfer placement physical index'),target=destination[physical],position=integer(placement.position,'AIR Transfer placement position');if(placement.kind!=='between-actions'||!target||placement.targetId!==`action:${target.number}@${physical}`||![physical,physical+1].includes(position))throw new Error('The AIR Transfer insertion boundary is stale or invalid.');insertionPhysicalIndex=position;insertionOffset=position===destination.length?destinationText.length:destination[position].start;}
  const reserved = new Set(destination.map(row => row.number)), replacements = new Set(), allocations = new Map(), outcomes = [];
  for (const entry of active) {
    const { row, projection, decision } = entry;
    if (!row || !projection || !decision) { unresolved.push(`${projection?.id || row?.id || 'Copy dependency'} needs an explicit decision.`); continue; }
    const identity = String(decision.identity || '');
    if (!['preserve-action', 'add-next-free', 'replace-existing', 'manual-action', 'skip'].includes(identity)) { unresolved.push(`${projection.id} has no valid action-ID decision.`); continue; }
    if (identity === 'skip') { allocations.set(projection.id, null); outcomes.push({ id: projection.id, status: 'skipped', sourceAction: row.number, destinationAction: null }); continue; }
    let target = row.number, destinationPhysicalIndex = null;
    if (identity === 'add-next-free') target = nextFree(reserved, row.number);
    else if (identity === 'manual-action') {
      if (!Number.isSafeInteger(decision.manualAction) || decision.manualAction < 0) { unresolved.push(`${projection.id} needs one non-negative manual Action ID.`); continue; }
      target = decision.manualAction;
    }
    if (identity === 'replace-existing') {
      if (!Number.isSafeInteger(decision.destinationPhysicalIndex) || decision.destinationPhysicalIndex < 0) { unresolved.push(`${projection.id} needs one exact Destination physical occurrence to replace.`); continue; }
      destinationPhysicalIndex = decision.destinationPhysicalIndex; const candidate = destination[destinationPhysicalIndex];
      if (!candidate || candidate.number !== target || replacements.has(destinationPhysicalIndex)) { unresolved.push(`${projection.id} requires one unused exact Destination physical occurrence of Action ${target}.`); continue; }
      replacements.add(destinationPhysicalIndex);
    } else if (reserved.has(target)) { unresolved.push(`${projection.id} targets Action ${target}, which is already occupied or reserved.`); continue; }
    else reserved.add(target);
    allocations.set(projection.id, { action: target, identity, destinationPhysicalIndex });
    outcomes.push({ id: projection.id, status: identity === 'replace-existing' ? 'replaced' : 'added', sourceAction: row.number, destinationAction: target });
  }
  if (review.includeSprites) {
    for (const dependency of review.spriteDependencies) {
      if (dependency.status !== 'exact') unresolved.push(`Sprite ${dependency.id} has no unique exact Source SFF occurrence.`);
      if (!mappings.has(dependency.id)) unresolved.push(`Sprite ${dependency.id} needs a verified SFF Transfer mapping.`);
    }
  }
  const patches = [], materialized = new Set();
  for (const entry of active) {
    const allocation = allocations.get(entry.projection?.id); if (!allocation) continue;
    const { row, projection, decision } = entry; let block;
    if (projection.copyDependency) {
      const copy = projection.copyDependency, mode = normalizeCopyMode(decision.copyDependency);
      if (copy.status !== 'available') { unresolved.push(`${projection.id} has an unresolved Copy Action authority: ${copy.error || copy.status}.`); continue; }
      if (!['preserve-copy', 'include-copy-targets', 'materialize-copy'].includes(mode)) { unresolved.push(`${projection.id} has no valid Copy Action decision.`); continue; }
      if (mode === 'materialize-copy') {
        const authority = byId.get(copy.authorityId); if (!authority) { unresolved.push(`${projection.id} lost its exact materialization authority.`); continue; }
        block = rewriteHeader(authority.text, allocation.action);
      } else {
        const targetAllocation = allocations.get(copy.directTargetId);
        if (!targetAllocation) { unresolved.push(`${projection.id} cannot preserve Copy Action because ${copy.directTargetId || `Action ${copy.targetNumber}`} is not included and mapped.`); continue; }
        block = rewriteCopyTarget(rewriteHeader(row.text, allocation.action), targetAllocation.action);
      }
    } else block = rewriteHeader(row.text, allocation.action);
    block = remapFrames(block, mappings);
    if (Buffer.byteLength(block, 'utf8') > MAX_PATCH_BYTES) { unresolved.push(`${projection.id} exceeds the AIR Transfer patch byte limit.`); continue; }
    materialized.add(projection.id);
    if (allocation.identity === 'replace-existing') { const target = destination[allocation.destinationPhysicalIndex]; patches.push({ start: target.start, end: target.end, text: block, sequence: patches.length }); }
    else { const eol = eolOf(destinationText),atEnd=insertionOffset===destinationText.length,prefix=atEnd?(!destinationText?'':/(?:\r\n|\r|\n)$/.test(destinationText)?eol:eol+eol):'',suffix=atEnd?'':/(?:\r\n|\r|\n)$/.test(block)?eol:eol+eol; patches.push({ start: insertionOffset, end: insertionOffset, text: prefix + block + suffix, sequence: patches.length }); }
  }
  const patchBytes = patches.reduce((total, patch) => total + Buffer.byteLength(patch.text, 'utf8'), 0); if (patchBytes > MAX_PATCH_BYTES) unresolved.push('The AIR Transfer patch set exceeds its total byte limit.');
  const status = unresolved.length ? 'blocked' : 'ready', readyPatches = status === 'ready' ? patches : [], outputText = status === 'ready' ? applyPatches(destinationText, readyPatches) : destinationText;
  let exactOutcomes=outcomes;
  if(status==='ready'){
    const replacementByPhysical=new Map();for(const entry of active){const allocation=allocations.get(entry.projection?.id);if(allocation?.identity==='replace-existing'&&materialized.has(entry.projection.id))replacementByPhysical.set(allocation.destinationPhysicalIndex,{id:entry.projection.id,action:allocation.action});}
    const logical=destination.map((row,index)=>replacementByPhysical.get(index)||{id:null,action:row.number}),added=[];
    for(const entry of active){const allocation=allocations.get(entry.projection?.id);if(allocation&&allocation.identity!=='replace-existing'&&materialized.has(entry.projection.id))added.push({id:entry.projection.id,action:allocation.action});}
    logical.splice(insertionPhysicalIndex,0,...added);const finalPhysical=new Map();logical.forEach((item,index)=>{if(item.id)finalPhysical.set(item.id,index)});
    exactOutcomes=outcomes.map(item=>item.status==='added'||item.status==='replaced'?{...item,destinationPhysicalIndex:finalPhysical.get(item.id)}:item);
    const parsed=actionSourceRanges(outputText);for(const item of exactOutcomes)if((item.status==='added'||item.status==='replaced')&&(!Number.isSafeInteger(item.destinationPhysicalIndex)||parsed[item.destinationPhysicalIndex]?.number!==item.destinationAction))throw new Error(`AIR Transfer could not prove the exact Destination occurrence for ${item.id}.`);
  }
  const projection = { analysisIdentity: review.analysisIdentity, sourceFingerprint: review.sourceFingerprint, destinationFingerprint: review.destinationFingerprint, dependencyMode: review.dependencyMode, placement:{insertionPhysicalIndex}, outcomes:exactOutcomes, unresolved, patches: readyPatches, outputFingerprint: sha(outputText) };
  return deepFreeze({ schema: SCHEMA, version: VERSION, status, ...projection, planIdentity: sha(canonical(projection)), outputText, effects: EFFECTS });
}

module.exports = { SCHEMA, VERSION, MAX_PATCH_BYTES, resolveAirTransfer, applyPatches };
