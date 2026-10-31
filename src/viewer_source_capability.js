'use strict';

const { deepFreeze } = require('./viewer_toolbar_contract');

const STATUSES = Object.freeze(['implemented', 'planned', 'not-applicable']);
const IDENTITIES = Object.freeze(['exact-document', 'selected-block', 'manifest', 'connected-only', 'none']);
const ACCESS = Object.freeze(['external-editor', 'read-only', 'read-write', 'none']);

const CAPABILITIES = deepFreeze({
  'implemented.authoring-source': {
    id: 'implemented.authoring-source', status: 'implemented', identity: 'exact-document', resolverId: 'authoring-workspace.exact-source',
    access: 'read-write', mutationOwner: 'native-text-editor', presentations: ['source', 'split', 'native'], unavailableReason: ''
  },
  'implemented.authoring-browser-source': {
    id: 'implemented.authoring-browser-source', status: 'implemented', identity: 'exact-document', resolverId: 'authoring-browser.exact-source',
    access: 'read-only', mutationOwner: 'grouped-coding-viewer', presentations: ['source', 'split', 'native'], unavailableReason: ''
  },
  'implemented.pinned-source': {
    id: 'implemented.pinned-source', status: 'implemented', identity: 'exact-document', resolverId: 'pinned-sources.exact-source',
    access: 'external-editor', mutationOwner: 'native-text-editor', presentations: ['native'], unavailableReason: ''
  },
  'implemented.text-companion-source': {
    id: 'implemented.text-companion-source', status: 'implemented', identity: 'exact-document', resolverId: 'text-companion.exact-source',
    access: 'external-editor', mutationOwner: 'native-text-editor', presentations: ['native'], unavailableReason: ''
  },
  'implemented.move-constants-source': {
    id: 'implemented.move-constants-source', status: 'implemented', identity: 'selected-block', resolverId: 'move-constants.exact-source',
    access: 'external-editor', mutationOwner: 'native-text-editor', presentations: ['native'], unavailableReason: ''
  },
  'implemented.move-lab-source': {
    id: 'implemented.move-lab-source', status: 'implemented', identity: 'selected-block', resolverId: 'move-lab.exact-source',
    access: 'external-editor', mutationOwner: 'native-text-editor', presentations: ['native'], unavailableReason: ''
  },
  'implemented.code-structure-source': {
    id: 'implemented.code-structure-source', status: 'implemented', identity: 'selected-block', resolverId: 'code-structure.exact-source',
    access: 'external-editor', mutationOwner: 'native-text-editor', presentations: ['native'], unavailableReason: ''
  },
  'implemented.command-movelist-source': {
    id: 'implemented.command-movelist-source', status: 'implemented', identity: 'selected-block', resolverId: 'command-movelist.exact-source',
    access: 'external-editor', mutationOwner: 'native-text-editor', presentations: ['native'], unavailableReason: ''
  },
  'implemented.helper-source': {
    id: 'implemented.helper-source', status: 'implemented', identity: 'exact-document', resolverId: 'helper.exact-source',
    access: 'external-editor', mutationOwner: 'native-text-editor', presentations: ['native'], unavailableReason: ''
  },
  'implemented.hitdef-source': {
    id: 'implemented.hitdef-source', status: 'implemented', identity: 'selected-block', resolverId: 'hitdef.exact-source',
    access: 'external-editor', mutationOwner: 'native-text-editor', presentations: ['native'], unavailableReason: ''
  },
  'implemented.spatial-source': {
    id: 'implemented.spatial-source', status: 'implemented', identity: 'exact-document', resolverId: 'spatial-composer.exact-source',
    access: 'external-editor', mutationOwner: 'native-text-editor', presentations: ['native'], unavailableReason: ''
  },
  'implemented.trajectory-source': {
    id: 'implemented.trajectory-source', status: 'implemented', identity: 'exact-document', resolverId: 'trajectory.exact-cursor',
    access: 'external-editor', mutationOwner: 'native-text-editor', presentations: ['native'], unavailableReason: ''
  },
  'implemented.throw-air-source': {
    id: 'implemented.throw-air-source', status: 'implemented', identity: 'selected-block', resolverId: 'throw-creator.exact-air-source',
    access: 'external-editor', mutationOwner: 'native-text-editor', presentations: ['native'], unavailableReason: ''
  },
  'implemented.stage-source': {
    id: 'implemented.stage-source', status: 'implemented', identity: 'selected-block', resolverId: 'stage.exact-background-source',
    access: 'external-editor', mutationOwner: 'native-text-editor', presentations: ['native'], unavailableReason: ''
  },
  'implemented.screenpack-source': {
    id: 'implemented.screenpack-source', status: 'implemented', identity: 'selected-block', resolverId: 'screenpack.exact-element-source',
    access: 'external-editor', mutationOwner: 'native-text-editor', presentations: ['native'], unavailableReason: ''
  },
  'implemented.roster-source': {
    id: 'implemented.roster-source', status: 'implemented', identity: 'selected-block', resolverId: 'roster.exact-record-source',
    access: 'external-editor', mutationOwner: 'native-text-editor', presentations: ['native'], unavailableReason: ''
  },
  'implemented.menu-modes-source': {
    id: 'implemented.menu-modes-source', status: 'implemented', identity: 'selected-block', resolverId: 'menu-modes.exact-record-source',
    access: 'external-editor', mutationOwner: 'native-text-editor', presentations: ['native'], unavailableReason: ''
  },
  'implemented.cns-converter-source': {
    id: 'implemented.cns-converter-source', status: 'implemented', identity: 'exact-document', resolverId: 'cns-converter.exact-source',
    access: 'external-editor', mutationOwner: 'native-text-editor', presentations: ['native'], unavailableReason: ''
  },
  'implemented.character-dependency-source': {
    id: 'implemented.character-dependency-source', status: 'implemented', identity: 'selected-block', resolverId: 'character-dependency.exact-record-source',
    access: 'external-editor', mutationOwner: 'native-text-editor', presentations: ['native'], unavailableReason: ''
  },
  'implemented.character-health-source': {
    id: 'implemented.character-health-source', status: 'implemented', identity: 'selected-block', resolverId: 'character-health.exact-finding-source',
    access: 'external-editor', mutationOwner: 'native-text-editor', presentations: ['native'], unavailableReason: ''
  },
  'implemented.map-occurrence-source': {
    id: 'implemented.map-occurrence-source', status: 'implemented', identity: 'selected-block', resolverId: 'map-registry.exact-occurrence-source',
    access: 'external-editor', mutationOwner: 'native-text-editor', presentations: ['native'], unavailableReason: ''
  },
  'implemented.story-dialogue-source': {
    id: 'implemented.story-dialogue-source', status: 'implemented', identity: 'selected-block', resolverId: 'story-dialogue.exact-selected-source',
    access: 'external-editor', mutationOwner: 'native-text-editor', presentations: ['native'], unavailableReason: ''
  },
  'planned.exact-document': {
    id: 'planned.exact-document', status: 'planned', identity: 'exact-document', resolverId: '',
    access: 'external-editor', mutationOwner: 'native-text-editor', presentations: ['native'],
    unavailableReason: 'Exact source routing is planned for this viewer family but is not yet connected to the universal Text / Source slot.'
  },
  'planned.selected-block': {
    id: 'planned.selected-block', status: 'planned', identity: 'selected-block', resolverId: '',
    access: 'read-write', mutationOwner: 'registered-domain-owner', presentations: ['source', 'split', 'native'],
    unavailableReason: 'The selected-block adapter and guarded draft owner are planned but not yet migrated.'
  },
  'planned.manifest': {
    id: 'planned.manifest', status: 'planned', identity: 'manifest', resolverId: '',
    access: 'external-editor', mutationOwner: 'manifest-owner', presentations: ['native'],
    unavailableReason: 'A proven editable build manifest is not yet connected to the universal Text / Source slot.'
  },
  'planned.connected-only': {
    id: 'planned.connected-only', status: 'planned', identity: 'connected-only', resolverId: '',
    access: 'read-only', mutationOwner: 'none', presentations: ['native'],
    unavailableReason: 'This surface currently has connected resources but no exact selected-object source contract.'
  },
  'not-applicable.navigation': {
    id: 'not-applicable.navigation', status: 'not-applicable', identity: 'none', resolverId: '',
    access: 'none', mutationOwner: 'none', presentations: [],
    unavailableReason: 'This navigation surface is not an authoring document and does not own editable source.'
  },
  'not-applicable.transient': {
    id: 'not-applicable.transient', status: 'not-applicable', identity: 'none', resolverId: '',
    access: 'none', mutationOwner: 'none', presentations: [],
    unavailableReason: 'This transient surface is intentionally outside the persistent viewer shell.'
  },
  'not-applicable.frozen-snapshot': {
    id: 'not-applicable.frozen-snapshot', status: 'not-applicable', identity: 'none', resolverId: '',
    access: 'none', mutationOwner: 'none', presentations: [],
    unavailableReason: 'This comparison is a frozen, potentially multi-owner snapshot; it has no truthful single live source or connected-resource context.'
  }
});

function validateCapability(capability) {
  if (!capability || typeof capability !== 'object') throw new Error('Source capability must be an object.');
  if (!STATUSES.includes(capability.status)) throw new Error(`Unsupported source status: ${capability.status}`);
  if (!IDENTITIES.includes(capability.identity)) throw new Error(`Unsupported source identity: ${capability.identity}`);
  if (!ACCESS.includes(capability.access)) throw new Error(`Unsupported source access: ${capability.access}`);
  if (capability.status === 'implemented' && !capability.resolverId) throw new Error(`Implemented capability ${capability.id || ''} requires resolverId.`);
  if (capability.status !== 'implemented' && !capability.unavailableReason) throw new Error(`Non-implemented capability ${capability.id || ''} requires unavailableReason.`);
  if (capability.identity === 'connected-only' && capability.status === 'implemented') throw new Error('Connected Resources cannot satisfy implemented exact Text / Source capability.');
  return true;
}

for (const capability of Object.values(CAPABILITIES)) validateCapability(capability);

module.exports = { STATUSES, IDENTITIES, ACCESS, CAPABILITIES, validateCapability };
