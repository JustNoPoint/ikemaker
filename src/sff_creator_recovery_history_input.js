'use strict';

const crypto = require('node:crypto');
const { hashCanonical } = require('./sff_capability_report');
const { decodeStrictJsonArtifact } = require('./sff_strict_json_artifact');

const INPUT = 'sff19-history-replay-input';
const SCHEMA = 'ikemaker.sff-creator-recovery-history-reconciliation-input';
const BYTE_KEY = '$sffRecoveryBytes';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function packHistoryInput(input) {
  if (input?.schema !== SCHEMA) throw Error('Expected a recovery history input.');
  const blobs = new Map();
  function encode(value) {
    if (Buffer.isBuffer(value)) {
      const hash = sha(value);
      if (!blobs.has(hash)) blobs.set(hash, {
        name: 'history-bytes-' + blobs.size, bytes: Buffer.from(value),
        expectedByteHash: hash, authorityHash: hash
      });
      return { [BYTE_KEY]: blobs.get(hash).name, hash };
    }
    if (Array.isArray(value)) return value.map(encode);
    if (value && typeof value === 'object') {
      if (Object.hasOwn(value,BYTE_KEY)) throw Error('Reserved history buffer marker.');
      return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,encode(item)]));
    }
    return value;
  }
  const record = {version:1, input:encode(input)};
  const bytes = Buffer.from(JSON.stringify(record)+'\n');
  return { artifact:{name:INPUT, bytes, expectedByteHash:sha(bytes), authorityHash:hashCanonical(record)}, binaries:[...blobs.values()] };
}

function restoreHistoryInput(snapshot) {
  const row=snapshot.authority.artifacts.find(item=>item.name===INPUT);
  if (!row) throw Error('Recovery history replay input is missing.');
  // Restore from one freshly verified artifact+binary observation. Reading
  // every referenced binary separately would replay the complete vault each
  // time. This inventory is local to this restore, never reused across actions.
  const inventory=snapshot.readRetainedInventoryBytes();
  const artifacts=new Map(inventory.artifacts.map(item=>[item.name,item.bytes]));
  const binaries=new Map(inventory.binaries.map(item=>[item.name,item.bytes]));
  const bytes=artifacts.get(INPUT);
  if (!Buffer.isBuffer(bytes) || sha(bytes)!==row.byteHash) throw Error('Recovery history replay input bytes changed.');
  const record=decodeStrictJsonArtifact(bytes,'recovery history replay input').parsed;
  if (record.version!==1 || record.input?.schema!==SCHEMA || hashCanonical(record)!==row.authorityHash)
    throw Error('Recovery history replay input authority changed.');
  const rows=new Map(snapshot.authority.binaries.map(item=>[item.name,item]));
  const cache=new Map();
  function decode(value) {
    if (Array.isArray(value)) return value.map(decode);
    if (!value || typeof value!=='object') return value;
    if (Object.hasOwn(value,BYTE_KEY)) {
      const name=value[BYTE_KEY], binary=rows.get(name);
      if (Object.keys(value).length!==2 || !/^history-bytes-\d+$/.test(name) || !binary ||
          binary.byteHash!==value.hash || binary.authorityHash!==value.hash)
        throw Error('Recovery history byte reference changed.');
      if (!cache.has(name)) {
        const content=binaries.get(name);
        if (!Buffer.isBuffer(content) || sha(content)!==value.hash || content.length!==binary.byteLength) throw Error('Recovery history binary changed.');
        cache.set(name,content);
      }
      return Buffer.from(cache.get(name));
    }
    return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,decode(item)]));
  }
  return decode(record.input);
}
const TERMINAL='builtin-runtime-recovery-terminal-manifest';
const PLAN='sff19-history-reconciliation-plan';
function readRecoveryTerminal(snapshot,locator){
  const a=snapshot.authority;
  const read=name=>{
    const row=a.artifacts.find(item=>item.name===name);
    const named=a.artifactAuthorities.find(item=>item.name===name);
    if(!row || !named || row.authorityHash!==named.hash)throw Error('Missing recovery history authority: '+name);
    const bytes=snapshot.readArtifactBytes(name);
    if(sha(bytes)!==row.byteHash || bytes.length!==row.byteLength)throw Error('Recovery history artifact changed: '+name);
    return {row,bytes,value:decodeStrictJsonArtifact(bytes,name).parsed};
  };
  const {row,value:manifest}=read(TERMINAL),{manifestHash,...core}=manifest;
  const plan=read(PLAN),terminal=read('sff19c-recovery-outcome-receipt');
  const review=a.artifacts.some(item=>item.name==='production-review-history-reconciliation-record');
  const parent=a.chain.at(review?-3:-2),classified=a.chain.at(review?-2:-1);
  if(!parent || !classified || classified.previousCheckpointHash!==parent.recordHash ||
     classified.lifecycleState!=='TerminalNeedsHistory' || a.lifecycleState!=='TerminalNeedsHistory' ||
     a.semanticHeadRecordHash!==locator.expectedLatestCheckpointHash || a.operationId!==locator.expectedOperationId ||
     row.byteHash!==locator.expectedManifestArtifactByteHash || row.authorityHash!==locator.expectedManifestAuthorityHash ||
     manifest.schema!=='ikemaker.sff-creator-builtin-runtime-recovery-terminal' || manifest.version!==1 ||
     manifestHash!==hashCanonical(core) || manifestHash!==locator.expectedManifestHash ||
     manifest.operationId!==a.operationId || manifest.parentHeadRecordHash!==parent.recordHash ||
     manifest.historyPlanArtifactName!==PLAN || manifest.historyPlanHash!==plan.value.planHash ||
     manifest.historyPlanArtifactByteHash!==plan.row.byteHash || manifest.executorOperationId!==plan.value.operationId ||
     manifest.recoveryReceiptArtifactName!==terminal.row.name || manifest.recoveryReceiptArtifactByteHash!==terminal.row.byteHash ||
     manifest.recoveryReceiptHash!==hashCanonical(terminal.value) || plan.value.terminalReceiptHash!==manifest.recoveryReceiptHash)
    throw Error('Recovery terminal manifest does not match its retained operation, plan and receipt.');
  const historyInput=restoreHistoryInput(snapshot);
  const fresh=require('./sff_creator_history_reconciliation_plan').createCreatorHistoryReconciliationPlan(historyInput);
  if(hashCanonical(fresh)!==hashCanonical(plan.value) || fresh.blockers?.length)throw Error('Recovery history plan changed or has blockers.');
  return {classification:'TerminalNeedsHistory',operationId:a.operationId,workspaceId:a.workspaceId,targetId:a.targetId,
    backendId:a.backendId,adapterId:a.adapterId,activePath:a.activePath,candidatePath:a.candidatePath,historyRoot:a.historyRoot,
    semanticHeadRecordHash:a.semanticHeadRecordHash,predecessorHeadRecordHash:parent.recordHash,
    classificationCheckpointHash:review?classified.recordHash:null,snapshotAuthorityHash:hashCanonical(a),
    manifestHash,manifestArtifactByteHash:row.byteHash,manifestAuthorityHash:row.authorityHash,
    classificationPlanHash:manifestHash,classificationPlan:{historyReconciliationPlan:plan.value,historyReconciliationPlanHash:fresh.planHash,
      outcomeClass:fresh.outcome,outcomeReceiptHash:fresh.terminalReceiptHash,journalChainHash:fresh.journalChainHash},
    auxiliaryPlanArtifactName:PLAN,auxiliaryPlanHash:fresh.planHash,auxiliaryPlan:plan.value,auxiliaryPlanArtifactByteHash:plan.row.byteHash,
    auxiliaryPlanAuthorityHash:plan.row.authorityHash};
}
module.exports={ INPUT, PLAN, TERMINAL, packHistoryInput, restoreHistoryInput, readRecoveryTerminal };
