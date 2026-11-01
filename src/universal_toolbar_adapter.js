'use strict';

const { CONTRACT_ID, DIMENSIONS, SLOTS, SPECIALIST_ACTION_IDS, deepFreeze } = require('./viewer_toolbar_contract');
const { SURFACES } = require('./viewer_surface_registry');
const { CAPABILITIES } = require('./viewer_source_capability');

const surfaceById = new Map(SURFACES.map((surface) => [surface.id, surface]));

function adapt(surfaceId, capabilities = {}, options = {}) {
  const surface = surfaceById.get(String(surfaceId));
  if (!surface) throw new Error(`Unknown viewer surface: ${surfaceId}`);
  if (surface.toolbarContractId !== CONTRACT_ID) throw new Error(`${surface.id} does not participate in ${CONTRACT_ID}.`);
  for (const [id, capability] of Object.entries(capabilities)) {
    const dispatch = typeof capability?.dispatch === 'string' ? capability.dispatch.trim() : '';
    if (SPECIALIST_ACTION_IDS.includes(id) || SPECIALIST_ACTION_IDS.includes(dispatch)) throw new Error(`Specialist action ${SPECIALIST_ACTION_IDS.includes(id) ? id : dispatch} belongs in the viewer body.`);
  }
  const sourceCapabilities = options.capabilities || CAPABILITIES;
  const resolverIds = new Set(options.resolverIds || []);
  const slots = SLOTS.map((slot) => {
    const capability = slot.id === 'restart'
      ? { enabled: true, dispatch: 'command:ikemen.restartRunning' }
      : slot.id === 'updates'
      ? { enabled: true, dispatch: 'command:ikemen.updates.checkAll' }
      : slot.id === 'auto-save' && !capabilities[slot.actionId] && !capabilities[slot.id]
      ? { enabled:false, reason:'Auto Save is not available for this window.' }
      : capabilities[slot.actionId] || capabilities[slot.id];
    const dispatch = typeof capability?.dispatch === 'string' ? capability.dispatch.trim() : '';
    let enabled = capability?.enabled === true && dispatch !== '';
    let reason = enabled ? '' : String(capability?.reason || `${slot.label} is not available in this viewer yet.`);
    if (slot.id === 'text-source' && enabled) {
      const source = sourceCapabilities[capability.capabilityId];
      const exact = source && source.status === 'implemented' && ['exact-document', 'selected-block', 'manifest'].includes(source.identity) && source.id === surface.sourceCapabilityId && source.resolverId && source.resolverId === capability.resolverId && resolverIds.has(source.resolverId) && capability.routeKind === source.identity;
      if (!exact) { enabled = false; reason = 'No implemented exact-source resolver is registered for this viewer selection.'; }
    }
    if (slot.id === 'connected-resources' && enabled && capability.routeKind !== 'connected-resources') { enabled = false; reason = 'Connected Resources requires an explicit connected-resources route.'; }
    let autoSave=options.autoSaveEnabled===true;try{if(typeof options.autoSaveEnabled!=='boolean')autoSave=require('./save_controls').enabled(options.seed||'');}catch(_){ }
    const manualSaveCapable=slot.id==='save'&&enabled;
    if(slot.id==='save'&&manualSaveCapable&&autoSave){enabled=false;reason='Save is unavailable because Auto Save is on.';}
    return {
      ...slot,
      enabled,
      reason: enabled ? '' : reason,
      dispatch: enabled ? dispatch : '',
      pressed:slot.id==='auto-save'?autoSave:undefined,
      manualSaveCapable:slot.id==='save'?manualSaveCapable:undefined,
      sourceCapabilityId: slot.id === 'text-source' ? surface.sourceCapabilityId : '',
      connectedResources: slot.id === 'connected-resources'
    };
  });
  return deepFreeze({ contractId: CONTRACT_ID, surfaceId: surface.id, dimensions: DIMENSIONS, slots });
}

module.exports = { adapt };
