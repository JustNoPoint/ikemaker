'use strict';

const path = require('node:path');
const { validComponentReference } = require('./move_lab_component_model');
const canonical = value => path.resolve(String(value || '')).toLowerCase();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const MAX_HISTORY = 32;

function creatorOf(helper, components, defPath) {
  if (helper?.kind !== 'helper' || !helper.owner) return null;
  const matches = components.filter(item => ['state', 'function'].includes(item.kind) && item.kind === helper.owner.kind && canonical(item.filename) === canonical(helper.filename) && item.sourceHash === helper.sourceHash && item.line === helper.owner.startLine && item.endLine === helper.owner.endLine && String(item.signature || '') === String(helper.owner.signature || '') && item.line <= helper.line && item.endLine >= helper.endLine && validComponentReference(item.reference, { components }, defPath));
  return matches.length === 1 ? matches[0] : null;
}

function startingState(authority, components, defPath) {
  if (!authority) return null;
  const matches = components.filter(item => item.kind === 'state' && canonical(item.filename) === canonical(authority.targetPath) && item.line === authority.targetLine && item.sourceHash === authority.targetHash && validComponentReference(item.reference, { components }, defPath));
  return matches.length === 1 ? matches[0] : null;
}

// Every return binds the actual creation site, not Helper ID or StateDef number.
// Multiple creation controllers can intentionally share one starting StateDef.
function createRouter(services) {
  async function reject(owner, reason) {
    if(owner&&!owner.disposed)await services.post(owner,{type:'helperNavigationRejected',reference:owner.displaySelection?.componentReference||null,reason});
    return services.warn(reason);
  }
  function snapshot(owner) {
    if (!services.active(owner)) return {unavailable:'Helper navigation requires the current active Move Lab view. Focus that view and try again.'};
    if (owner.busy) return {unavailable:'A Move Lab edit is still being reviewed. Try Helper navigation when it finishes.'};
    try { const value=services.snapshot(owner);return value?.binding&&Array.isArray(value.components)?value:{unavailable:value?.unavailable||'The complete assigned Helper source snapshot is unavailable. Refresh Move Lab.'}; }
    catch(error){return{unavailable:'Helper source snapshot failed: '+String(error.message||error).slice(0,300)};}
  }
  function current(owner, value) {
    return owner.displaySelection?.kind === 'direct' ? validComponentReference(owner.displaySelection.componentReference, value, owner.assets.defPath) : null;
  }
  async function commit(owner, value, origin, target, ticket = null) {
    const tickets = owner.helperNavigationTickets ||= new Map();
    const history = owner.helperNavigationPath ||= [];
    let navigation;
    if (ticket) { tickets.delete(ticket.token); history.pop(); navigation = { direction: 'return', token: ticket.token, origin: origin.reference, target: target.reference }; }
    else {
      if (history.length && !same(tickets.get(history.at(-1))?.target, origin.reference)) { history.length = 0; tickets.clear(); }
      const token = services.token();
      tickets.set(token, { token, binding: value.binding, origin: origin.reference, target: target.reference });
      history.push(token); if (history.length > MAX_HISTORY) history.shift();
      if (tickets.size > MAX_HISTORY) tickets.delete(tickets.keys().next().value);
      navigation = { direction: 'forward', token, origin: origin.reference, target: target.reference };
    }
    owner.displaySelection = { kind: 'direct', componentReference: target.reference };
    services.selected?.(owner, target);
    await services.post(owner, { type: 'directComponentSelect', reference: target.reference, helperNavigation: navigation });
    return { available: true, reference: target.reference, navigation };
  }
  async function navigateState(owner, route) {
    if (typeof route !== 'string' || !/^[0-9a-f]{48}$/.test(route) || owner.projectileConsumedRoutes?.has(route)) return reject(owner, 'That exact Helper starting-state route expired. Refresh Move Lab.');
    const record = owner.projectileRoutes?.get(route);
    if(record?.kind!=='helper-state')return reject(owner,'That Helper starting-state route expired after a model refresh or belongs to another selection. Refresh the current Helper view.');
    const value=snapshot(owner);if(value.unavailable)return reject(owner,value.unavailable);
    const origin = current(owner, value);
    if (!origin || origin.kind !== 'helper' || !same(origin.reference, record.reference) || services.hasDraft?.(owner, origin)) return reject(owner, 'Restore the exact authored Helper creation site before starting-state navigation.');
    const evidence = services.validateState(owner, record);
    const target = evidence && startingState(evidence.authority, value.components, owner.assets.defPath);
    if (!target || !services.active(owner)) return reject(owner, 'The Helper, assigned sources, or starting StateDef changed. Refresh Move Lab.');
    // This in-page read-only route is revalidated on every traversal. The
    // separate native-source action retains its existing one-use semantics.
    return commit(owner, value, origin, target);
  }
  async function navigateComponent(owner, message) {
    const value = snapshot(owner);if(value.unavailable)return reject(owner,value.unavailable);const origin=current(owner,value);
    if (!origin) return reject(owner, 'The selected Move Lab code changed. Refresh before navigating Helpers.');
    if (message.direction === 'return') {
      const ticket = owner.helperNavigationTickets?.get(message.token);
      if (!ticket || owner.helperNavigationPath?.at(-1) !== message.token || ticket.binding !== value.binding || !same(ticket.target, origin.reference)) return reject(owner, 'That exact Helper return path changed or expired. Choose a current creation site.');
      const target = validComponentReference(ticket.origin, value, owner.assets.defPath);
      if (!target) return reject(owner, 'The original Helper creation site changed. No matching ID was substituted.');
      return commit(owner, value, origin, target, ticket);
    }
    const target = validComponentReference(message.reference, value, owner.assets.defPath);
    const evidence = message.direction === 'origin' && target?.kind === 'helper' ? services.proveState?.(owner, target) : null;
    const related = message.direction === 'creator' ? creatorOf(origin, value.components, owner.assets.defPath) : message.direction === 'spawn' && target?.kind === 'helper' ? creatorOf(target, value.components, owner.assets.defPath) : evidence ? startingState(evidence, value.components, owner.assets.defPath) : null;
    if (!target || !related || (message.direction === 'creator' ? !same(related.reference, target.reference) : !same(related.reference, origin.reference))) return reject(owner, 'That exact creator/spawn relationship is unavailable. No runtime Helper identity was inferred.');
    return commit(owner, value, origin, target);
  }
  return { navigateState, navigateComponent };
}

module.exports = { MAX_HISTORY, creatorOf, startingState, createRouter };
