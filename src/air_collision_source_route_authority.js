'use strict';

const crypto = require('crypto');
const path = require('path');

const SCHEMA = 'ikemaker.air-collision-source-route';
const VERSION = 1;
const MAX_ROUTES = 8194;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); return value;
}
function hash(value) { return crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value), 'utf8').digest('hex').toUpperCase(); }
function canonicalPath(value) { return path.resolve(String(value || '')).replace(/\\/g, '/').toLowerCase(); }
function routeToken(token) { const value = String(token ? token() : crypto.randomBytes(24).toString('hex')).toLowerCase(); if (!/^[0-9a-f]{48}$/.test(value)) throw new Error('AIR collision source route token must be 48 lowercase hexadecimal characters.'); return value; }
function uniqueRoute(token, authorities) {
  const attempts = token ? 1 : 8;
  for (let attempt = 0; attempt < attempts; attempt += 1) { const route = routeToken(token); if (!authorities.has(route)) return route; }
  throw new Error('AIR collision source route token collided with an existing route. Refresh the collision inspection and try again.');
}
function integer(value, label) { const number = Number(value); if (!Number.isSafeInteger(number) || number < 0) throw new Error(`${label} must be a non-negative safe integer.`); return number; }
function range(value) {
  const points = ['start', 'end'].map(key => ({ line: integer(value?.[key]?.line, `${key} line`), character: integer(value?.[key]?.character, `${key} character`) }));
  if (points[1].line < points[0].line || points[1].line === points[0].line && points[1].character < points[0].character) throw new Error('AIR collision source route range is reversed.');
  return { start: points[0], end: points[1] };
}
function inspectionContext(inspection, context = {}) {
  if (inspection?.schema !== 'ikemaker.air-collision-inspection' || inspection.version !== 1 || !/^[A-F0-9]{64}$/.test(String(inspection.inspectionHash || ''))) throw new Error('A current exact AIR collision inspection is required.');
  if (typeof context.airPath !== 'string' || !context.airPath.trim()) throw new Error('The current open AIR document path is required.');
  const airPath = canonicalPath(context.airPath), airVersion = integer(context.airVersion, 'AIR document version'), generation = integer(context.generation, 'AIR collision generation');
  const sourceFingerprint = String(context.sourceFingerprint || ''), capabilityFingerprint = String(context.capabilityFingerprint || '');
  if (!/^[A-F0-9]{64}$/.test(sourceFingerprint) || !/^[A-F0-9]{64}$/.test(capabilityFingerprint)) throw new Error('Explicit current AIR source and capability fingerprints are required.');
  if (sourceFingerprint !== inspection.sourceFingerprint || capabilityFingerprint !== inspection.capabilityFingerprint) throw new Error('AIR collision route context does not match the inspection.');
  return { airPath, airVersion, generation, sourceFingerprint: inspection.sourceFingerprint, capabilityFingerprint: inspection.capabilityFingerprint, inspectionHash: inspection.inspectionHash, allocationProfile: String(inspection.target?.allocation?.id || 'target-unresolved'), requestedAction: inspection.selection.requestedAction, actionOccurrence: inspection.selection.actionOccurrence, elementIndex: inspection.selection.elementIndex, authoritativeAction: inspection.selection.authoritativeAction };
}
function targetIdentity(kind, groupKey, authored, assignment = null) {
  const body = kind === 'block'
    ? { kind, groupKey, ownership: authored?.ownership, provenance: authored?.provenance, block: authored?.authored?.block }
    : { kind, groupKey, ownership: authored?.ownership, provenance: authored?.provenance, blockLine: authored?.authored?.block?.line, assignment };
  return hash(body);
}
function authority(base, route, kind, groupKey, group, target, recordIndex = null) {
  return deepFreeze({ schema: SCHEMA, version: VERSION, route, ...base, kind, group: group.group, groupKey, recordIndex, sourceRange: range(target.range), sourceLine: kind === 'block' ? target.line : target.line, targetIdentity: targetIdentity(kind, groupKey, group, kind === 'assignment' ? target : null) });
}
function buildAirCollisionSourceRoutes(input = {}) {
  const inspection = input.inspection, base = inspectionContext(inspection, input), authorities = new Map(), routes = [];
  if (!Number.isSafeInteger(inspection.selection?.authoritativeAction)) return { publicRoutes: deepFreeze(routes), authorities };
  for (const groupKey of ['clsn1', 'clsn2']) {
    const group = inspection.groups?.[groupKey], block = group?.authored?.block;
    if (!group?.authored?.available || !block) continue;
    const blockRoute = uniqueRoute(input.token, authorities), blockAuthority = authority(base, blockRoute, 'block', groupKey, group, block);
    authorities.set(blockRoute, blockAuthority); routes.push({ route: blockRoute, kind: 'block', group: group.group, recordIndex: null, line: block.line, range: blockAuthority.sourceRange, label: `${group.group} block header` });
    for (const [recordIndex, assignment] of (group.authored.assignments || []).entries()) {
      if (routes.length >= MAX_ROUTES) throw new Error(`AIR collision source routes exceed ${MAX_ROUTES}.`);
      const route = uniqueRoute(input.token, authorities), recordAuthority = authority(base, route, 'assignment', groupKey, group, assignment, recordIndex);
      authorities.set(route, recordAuthority); routes.push({ route, kind: 'assignment', group: group.group, recordIndex, line: assignment.line, range: recordAuthority.sourceRange, label: `${group.group} authored record ${recordIndex + 1}` });
    }
  }
  return { publicRoutes: deepFreeze(routes), authorities };
}
function currentTarget(inspection, authority) {
  const group = inspection.groups?.[authority.groupKey]; if (!group?.authored?.available) return null;
  const target = authority.kind === 'block' ? group.authored.block : group.authored.assignments?.[authority.recordIndex];
  if (!target) return null;
  return { group, target };
}
function validateAirCollisionSourceRoute(authority, inspection, context = {}) {
  try {
    if (authority?.schema !== SCHEMA || authority.version !== VERSION || !/^[0-9a-f]{48}$/.test(String(authority.route || ''))) return null;
    const current = inspectionContext(inspection, context);
    for (const key of ['airPath', 'airVersion', 'generation', 'sourceFingerprint', 'capabilityFingerprint', 'inspectionHash', 'allocationProfile', 'requestedAction', 'actionOccurrence', 'elementIndex', 'authoritativeAction']) if (current[key] !== authority[key]) return null;
    const selected = currentTarget(inspection, authority); if (!selected) return null;
    if (targetIdentity(authority.kind, authority.groupKey, selected.group, authority.kind === 'assignment' ? selected.target : null) !== authority.targetIdentity) return null;
    const currentRange = range(selected.target.range); if (JSON.stringify(currentRange) !== JSON.stringify(authority.sourceRange)) return null;
    return authority;
  } catch (_) { return null; }
}

module.exports = { SCHEMA, VERSION, MAX_ROUTES, buildAirCollisionSourceRoutes, validateAirCollisionSourceRoute };
