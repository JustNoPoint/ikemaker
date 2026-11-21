'use strict';

const COMMON_HOOKS = new Set([-1, -2, -3, -4, -10]);
const MAX_REACHED_STATES = 64;
const MAX_CALL_DEPTH = 8;
const MAX_ROUTE_DETAILS = 8;

function endpointReason(row, endpoint) {
  if (!endpoint) return 'No sample was retained for this endpoint.';
  if (row.kind === 'helper' && row.field === 'presence') return 'This is the observed child. Its sample does not identify a creator.';
  if (row.ownerId !== row.rootId || endpoint.entityId !== row.rootId) return 'The sampled entity is outside the selected root context.';
  if (endpoint.stateOwnerSlot === null) return 'The sampled state source owner is unavailable.';
  if (row.slot === undefined) return 'The log has no configured root slot for comparison.';
  if (endpoint.stateOwnerSlot !== row.slot) return 'The sampled state has a different source owner slot. The selected DEF cannot establish its source.';
  return '';
}

function stateTrace(row, sources, scopeNotes = []) {
  if (!row.stateContext) return null;
  const definitions = new Map(), calls = new Map(), ranks = new Map(), routes = [], seenRoutes = new Set();
  let unresolvedRoutes = 0, limited = 0;
  for (const source of sources) {
    limited += source.states.omittedCalls;
    for (const declaration of source.states.declarations) {
      const id = declaration.stateNo;
      definitions.set(id, (definitions.get(id) || 0) + 1);
    }
    for (const call of source.states.calls) {
      if (!calls.has(call.caller)) calls.set(call.caller, []);
      calls.get(call.caller).push({ ...call, resource: source.resource });
    }
  }
  const endpointNotes = {};
  const unique = id => definitions.get(id) === 1;
  function noteRoute(call, reason) {
    const key = `${call.resource}:${call.line}`;
    if (seenRoutes.has(key)) return;
    seenRoutes.add(key);
    unresolvedRoutes++;
    if (routes.length < MAX_ROUTE_DETAILS) routes.push({ caller: call.caller, resource: call.resource, line: call.line, reason });
  }
  function applyRank(id, rank, rankReason, rankSources = []) {
    if (!ranks.has(id) || ranks.get(id).rank > rank) ranks.set(id, { rank, rankReason, rankSources });
  }
  for (const [name, rank] of [['current', 0], ['previous', 2]]) {
    const endpoint = row.stateContext[name];
    let reason = endpointReason(row, endpoint);
    if (!reason && !unique(endpoint.stateNo)) reason = definitions.has(endpoint.stateNo) ?
      'More than one local source declares this state. All matching definitions remain alternatives.' :
      'No declaration for this sampled state was found in the files searched.';
    endpointNotes[name] = reason;
    if (reason) continue;
    const { stateNo, stateOwnerSlot } = endpoint;
    const title = name === 'current' ? 'Current' : 'Previous';
    const owner = ['explod', 'projectile'].includes(row.kind) ? 'observed effect owner’s state' : 'sampled state';
    applyRank(stateNo, rank, `${title} ${owner} ${stateNo} · source owner slot ${stateOwnerSlot} matches the configured root in the selected scope.`);
    const visited = new Set([stateNo]);
    const pending = [{ id: stateNo, edges: [] }];
    for (let next = 0; next < pending.length; next++) {
      const { id, edges } = pending[next];
      for (const call of calls.get(id) || []) {
        if (call.reason || !unique(call.target)) {
          noteRoute(call, call.reason || (definitions.has(call.target) ?
            'More than one source declares the literal target.' : 'The literal target was not found in the files searched.'));
          continue;
        }
        if (visited.has(call.target)) continue;
        if (pending.length >= MAX_REACHED_STATES || edges.length >= MAX_CALL_DEPTH) { limited++; continue; }
        visited.add(call.target);
        const path = [...edges, call];
        const chain = [stateNo, ...path.map(edge => edge.target)].join(' → ');
        applyRank(call.target, rank + 1,
          `Static RunState route from ${name} state ${chain} · literal targets in the user-selected source scope.`,
          path.map(edge => ({ resource: edge.resource, line: edge.line })));
        pending.push({ id: call.target, edges: path });
      }
    }
  }
  return {
    review: { endpointNotes, routes, unresolvedRoutes, limited, scopeNotes },
    forSource(source) {
      return {
        rankAt(offset, uncertain) {
          const stateNo = source.states.stateAt(offset)?.stateNo ?? null;
          const common = source.role === 'stcommon' || source.role.startsWith('config:') || COMMON_HOOKS.has(stateNo);
          if (!uncertain && ranks.has(stateNo)) return { stateNo, ...ranks.get(stateNo) };
          const rankReason = common ? 'Common or global source in the selected scope.' : 'Other source assigned to the selected character.';
          return { stateNo, rank: common ? 4 : 5, rankReason };
        }
      };
    }
  };
}

module.exports = { stateTrace };
