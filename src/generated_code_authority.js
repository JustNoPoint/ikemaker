'use strict';

const crypto = require('crypto');

const CONTRACT = 'generated-code-v1';
const INVOKE_TYPE = 'ikemaker.generated-code.invoke';
const LIMITS = Object.freeze({
  artifacts: 128,
  artifactBytes: 1024 * 1024,
  totalTextBytes: 4 * 1024 * 1024,
  issues: 128,
  selections: 128,
  idLength: 128,
  targetIdLength: 256,
  issueMessageLength: 2048
});
const ISSUE_LEVELS = Object.freeze(['error', 'warning', 'suggestion', 'info']);
const ATOMICITIES = Object.freeze(['single', 'selection', 'all']);

function fail(message) { throw new Error(`Generated-code authority: ${message}`); }
function isPlain(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function plain(value, label) { if (!isPlain(value)) fail(`${label} must be a plain object.`); return value; }
function exactKeys(value, required, optional, label) {
  plain(value, label);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail(`${label} contains unknown field ${key}.`);
  for (const key of required) if (!Object.prototype.hasOwnProperty.call(value, key)) fail(`${label} is missing ${key}.`);
}
function text(value, label, maximum = LIMITS.idLength, allowEmpty = false) {
  if (typeof value !== 'string') fail(`${label} must be a string.`);
  if ((!allowEmpty && !value.length) || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) fail(`${label} is not a bounded stable identifier.`);
  return value;
}
function integer(value, label, minimum = Number.MIN_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < minimum) fail(`${label} must be a safe integer${minimum === 0 ? ' at least zero' : ''}.`);
  return value;
}
function boundedArray(value, label, maximum = LIMITS.selections, minimum = 0) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) fail(`${label} must contain ${minimum}..${maximum} entries.`);
  return value;
}
function uniqueStrings(value, label, maximumLength = LIMITS.idLength) {
  const result = boundedArray(value, label).map((entry, index) => text(entry, `${label}[${index}]`, maximumLength));
  if (new Set(result).size !== result.length) fail(`${label} contains duplicate values.`);
  return result;
}
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
function canonicalText(value) { return String(value).replace(/\r\n?/g, '\n'); }
function digest(value) { return crypto.createHash('sha256').update(value, 'utf8').digest('hex'); }
function digestObject(value) { return digest(JSON.stringify(value)); }
function digestString(value, label) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail(`${label} must be a SHA-256 digest.`);
  return value;
}

function normalizeIssue(issue, index) {
  exactKeys(issue, ['level', 'message'], ['code', 'artifactId'], `issues[${index}]`);
  if (!ISSUE_LEVELS.includes(issue.level)) fail(`issues[${index}].level is unknown.`);
  if (typeof issue.message !== 'string' || !issue.message.length || issue.message.length > LIMITS.issueMessageLength) fail(`issues[${index}].message is unbounded.`);
  const result = { level: issue.level, message: issue.message };
  if (Object.prototype.hasOwnProperty.call(issue, 'code')) result.code = text(issue.code, `issues[${index}].code`);
  if (Object.prototype.hasOwnProperty.call(issue, 'artifactId')) result.artifactId = text(issue.artifactId, `issues[${index}].artifactId`);
  return result;
}

function normalizeArtifact(artifact, index) {
  exactKeys(artifact, ['id', 'role', 'language', 'text'], [], `artifacts[${index}]`);
  const id = text(artifact.id, `artifacts[${index}].id`);
  const role = text(artifact.role, `artifacts[${index}].role`);
  const language = text(artifact.language, `artifacts[${index}].language`, 64);
  if (typeof artifact.text !== 'string') fail(`artifacts[${index}].text must be a string.`);
  const normalizedText = canonicalText(artifact.text);
  if (Buffer.byteLength(normalizedText, 'utf8') > LIMITS.artifactBytes) fail(`artifacts[${index}].text exceeds the byte limit.`);
  return { id, role, language, text: normalizedText, digest: digestObject({ id, role, language, text: normalizedText }) };
}

function createGeneratedCodeSnapshot(spec) {
  exactKeys(spec, ['surfaceId', 'generation', 'contextIdentity', 'contextRevision', 'valid', 'issues', 'artifacts'], [], 'snapshot specification');
  const surfaceId = text(spec.surfaceId, 'surfaceId');
  const generation = integer(spec.generation, 'generation', 0);
  const contextIdentity = text(spec.contextIdentity, 'contextIdentity', 256);
  const contextRevision = integer(spec.contextRevision, 'contextRevision');
  if (typeof spec.valid !== 'boolean') fail('valid must be a boolean.');
  const issues = boundedArray(spec.issues, 'issues', LIMITS.issues).map(normalizeIssue);
  const artifacts = boundedArray(spec.artifacts, 'artifacts', LIMITS.artifacts, 1).map(normalizeArtifact);
  const ids = artifacts.map((artifact) => artifact.id);
  if (new Set(ids).size !== ids.length) fail('artifact IDs must be unique.');
  const totalBytes = artifacts.reduce((sum, artifact) => sum + Buffer.byteLength(artifact.text, 'utf8'), 0);
  if (totalBytes > LIMITS.totalTextBytes) fail('artifact text exceeds the snapshot byte limit.');
  for (const issue of issues) if (issue.artifactId && !ids.includes(issue.artifactId)) fail(`issue references unknown artifact ${issue.artifactId}.`);
  const snapshotDigest = digestObject({
    contract: CONTRACT, surfaceId, contextIdentity, contextRevision, generation,
    artifacts: artifacts.map(({ id, digest: artifactDigest }) => ({ id, digest: artifactDigest })),
    valid: spec.valid,
    issues
  });
  return deepFreeze({ contract: CONTRACT, surfaceId, generation, contextIdentity, contextRevision, valid: spec.valid, issues, artifacts, snapshotDigest });
}

function requireSnapshot(snapshot) {
  exactKeys(snapshot, ['contract', 'surfaceId', 'generation', 'contextIdentity', 'contextRevision', 'valid', 'issues', 'artifacts', 'snapshotDigest'], [], 'currentSnapshot');
  if (snapshot.contract !== CONTRACT) fail('currentSnapshot is not a generated-code-v1 host snapshot.');
  digestString(snapshot.snapshotDigest, 'currentSnapshot.snapshotDigest');
  const rebuilt = createGeneratedCodeSnapshot({
    surfaceId: snapshot.surfaceId,
    generation: snapshot.generation,
    contextIdentity: snapshot.contextIdentity,
    contextRevision: snapshot.contextRevision,
    valid: snapshot.valid,
    issues: boundedArray(snapshot.issues, 'currentSnapshot.issues', LIMITS.issues).map((issue) => {
      const result = { level: issue.level, message: issue.message };
      if (Object.prototype.hasOwnProperty.call(issue, 'code')) result.code = issue.code;
      if (Object.prototype.hasOwnProperty.call(issue, 'artifactId')) result.artifactId = issue.artifactId;
      return result;
    }),
    artifacts: boundedArray(snapshot.artifacts, 'currentSnapshot.artifacts', LIMITS.artifacts, 1).map((artifact, index) => {
      exactKeys(artifact, ['id', 'role', 'language', 'text', 'digest'], [], `currentSnapshot.artifacts[${index}]`);
      digestString(artifact.digest, `currentSnapshot.artifacts[${index}].digest`);
      return { id: artifact.id, role: artifact.role, language: artifact.language, text: artifact.text };
    })
  });
  if (rebuilt.snapshotDigest !== snapshot.snapshotDigest) fail('currentSnapshot digest does not match its host contents.');
  for (let index = 0; index < rebuilt.artifacts.length; index += 1) if (rebuilt.artifacts[index].digest !== snapshot.artifacts[index].digest) fail(`currentSnapshot artifact ${snapshot.artifacts[index].id} digest does not match its host text.`);
  return snapshot;
}

function projectGeneratedCodeSnapshot(snapshot) {
  const current = requireSnapshot(snapshot);
  return deepFreeze({
    contract: current.contract,
    surfaceId: current.surfaceId,
    contextIdentity: current.contextIdentity,
    contextRevision: current.contextRevision,
    generation: current.generation,
    snapshotDigest: current.snapshotDigest,
    artifacts: current.artifacts.map(({ id, role, language, digest: artifactDigest }) => ({ id, role, language, digest: artifactDigest }))
  });
}

function validateGeneratedCodeIntent(message) {
  exactKeys(message, ['type', 'surfaceId', 'snapshotDigest', 'operationId', 'artifactIds', 'targetIds'], [], 'intent');
  if (message.type !== INVOKE_TYPE) fail('intent type is unknown.');
  const normalized = {
    type: INVOKE_TYPE,
    surfaceId: text(message.surfaceId, 'intent.surfaceId'),
    snapshotDigest: digestString(message.snapshotDigest, 'intent.snapshotDigest'),
    operationId: text(message.operationId, 'intent.operationId'),
    artifactIds: uniqueStrings(message.artifactIds, 'intent.artifactIds'),
    targetIds: uniqueStrings(message.targetIds, 'intent.targetIds', LIMITS.targetIdLength)
  };
  return deepFreeze(normalized);
}

function operationList(operations) {
  const list = Array.isArray(operations) ? operations : Object.values(plain(operations, 'operations'));
  boundedArray(list, 'operations', LIMITS.selections, 1);
  const normalized = list.map((operation, index) => {
    exactKeys(operation, ['id', 'artifactIds', 'targetPolicyId', 'mutationOwner', 'atomicity'], [], `operations[${index}]`);
    const entry = {
      id: text(operation.id, `operations[${index}].id`),
      artifactIds: uniqueStrings(operation.artifactIds, `operations[${index}].artifactIds`),
      targetPolicyId: text(operation.targetPolicyId, `operations[${index}].targetPolicyId`),
      mutationOwner: text(operation.mutationOwner, `operations[${index}].mutationOwner`),
      atomicity: operation.atomicity
    };
    if (!ATOMICITIES.includes(entry.atomicity)) fail(`operations[${index}].atomicity is unknown.`);
    return entry;
  });
  if (new Set(normalized.map((entry) => entry.id)).size !== normalized.length) fail('operation IDs must be unique.');
  return normalized;
}

function activeTargetPolicy(activeContext, policyId) {
  plain(activeContext, 'activeContext');
  exactKeys(activeContext, ['identity', 'revision', 'targetPolicies'], [], 'activeContext');
  text(activeContext.identity, 'activeContext.identity', 256);
  integer(activeContext.revision, 'activeContext.revision');
  plain(activeContext.targetPolicies, 'activeContext.targetPolicies');
  if (!Object.prototype.hasOwnProperty.call(activeContext.targetPolicies, policyId)) fail(`target policy ${policyId} is unavailable in the active context.`);
  return uniqueStrings(activeContext.targetPolicies[policyId], `activeContext.targetPolicies.${policyId}`, LIMITS.targetIdLength);
}

function authorizeGeneratedCodeIntent({ message, currentSnapshot, operations, activeContext } = {}) {
  const intent = validateGeneratedCodeIntent(message);
  const snapshot = requireSnapshot(currentSnapshot);
  if (intent.surfaceId !== snapshot.surfaceId) fail('intent surface does not match the current snapshot.');
  if (intent.snapshotDigest !== snapshot.snapshotDigest) fail('intent snapshot is stale.');
  const availableOperations = operationList(operations);
  const operation = availableOperations.find((entry) => entry.id === intent.operationId);
  if (!operation) fail(`operation ${intent.operationId} is not allowed.`);
  if (activeContext.identity !== snapshot.contextIdentity || activeContext.revision !== snapshot.contextRevision) fail('active context does not match the current snapshot.');
  if (!snapshot.valid || snapshot.issues.some((issue) => issue.level === 'error')) fail('current generated code is not valid for authorization.');
  const allowedTargets = activeTargetPolicy(activeContext, operation.targetPolicyId);
  if (allowedTargets.length && !intent.targetIds.length) fail(`operation ${operation.id} requires an explicit target selected from policy ${operation.targetPolicyId}.`);
  const snapshotArtifacts = new Map(snapshot.artifacts.map((artifact) => [artifact.id, artifact]));
  for (const id of operation.artifactIds) if (!snapshotArtifacts.has(id)) fail(`operation references unknown snapshot artifact ${id}.`);
  if (!intent.artifactIds.length) fail('intent must select at least one artifact.');
  for (const id of intent.artifactIds) if (!operation.artifactIds.includes(id)) fail(`artifact ${id} is not allowed for operation ${operation.id}.`);
  if (operation.atomicity === 'single' && intent.artifactIds.length !== 1) fail(`operation ${operation.id} requires one artifact.`);
  if (operation.atomicity === 'all' && (intent.artifactIds.length !== operation.artifactIds.length || operation.artifactIds.some((id) => !intent.artifactIds.includes(id)))) fail(`operation ${operation.id} requires its complete atomic artifact set.`);
  for (const id of intent.targetIds) if (!allowedTargets.includes(id)) fail(`target ${id} is not allowed by policy ${operation.targetPolicyId}.`);
  return deepFreeze({
    contract: CONTRACT,
    surfaceId: snapshot.surfaceId,
    contextIdentity: snapshot.contextIdentity,
    contextRevision: snapshot.contextRevision,
    generation: snapshot.generation,
    snapshotDigest: snapshot.snapshotDigest,
    operation,
    artifacts: intent.artifactIds.map((id) => snapshotArtifacts.get(id)),
    targetIds: [...intent.targetIds]
  });
}

module.exports = {
  CONTRACT, INVOKE_TYPE, LIMITS, ISSUE_LEVELS, ATOMICITIES,
  createGeneratedCodeSnapshot, projectGeneratedCodeSnapshot,
  validateGeneratedCodeIntent, authorizeGeneratedCodeIntent
};
