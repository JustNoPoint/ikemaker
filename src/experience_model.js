'use strict';

const MODES = ['learning', 'advanced'];
const DOMAINS = [
  { id: 'zss', label: 'ZSS', defaultMode: 'learning' },
  { id: 'lua', label: 'Lua', defaultMode: 'learning' },
  { id: 'cns', label: 'CNS', defaultMode: 'learning' },
  { id: 'assets', label: 'SFF, AIR, SND, and palettes', defaultMode: 'learning' },
  { id: 'stageUi', label: 'Stages and screenpacks', defaultMode: 'learning' }
];

const PRESETS = {
  learning: Object.fromEntries(DOMAINS.map((domain) => [domain.id, 'learning'])),
  advanced: Object.fromEntries(DOMAINS.map((domain) => [domain.id, 'advanced'])),
  cnsVeteran: { zss: 'learning', lua: 'learning', cns: 'advanced', assets: 'advanced', stageUi: 'learning' }
};

const WORKSPACES = {
  sff: {
    domain: 'assets', label: 'SFF', title: 'Sprite archive',
    learning: 'Choose a sprite, inspect its group and axis, preview its palette, then use reviewed actions to classify, validate, or rebuild it.',
    advanced: 'Sprite, palette, layer, validation, and batch operations share the same archive safeguards.'
  },
  air: {
    domain: 'assets', label: 'AIR', title: 'Animation and collision data',
    learning: 'Choose an action and frame first. AIR owns animation timing and Clsn boxes; runtime push, guard-distance, and transformed collision belong in character code.',
    advanced: 'Frame, collision, push, runtime, source, rule, and layer inspectors remain available without changing AIR ownership.'
  },
  snd: {
    domain: 'assets', label: 'SND', title: 'Sound archive',
    learning: 'Preview and name sounds, assign the archive to a portable sound profile, validate prefixes, then rebuild through the reviewed manifest.',
    advanced: 'Archive organization, split-profile validation, controller examples, and manifest operations remain available.'
  },
  palette: {
    domain: 'assets', label: 'Palettes', title: 'Palette data',
    learning: 'Protect the full color-separation master before assigning player palettes. Preview choices do not modify the archive.',
    advanced: 'Master protection, comparison, assignment, library, and batch operations retain the same review boundaries.'
  },
  stage: {
    domain: 'stageUi', label: 'Stage', title: 'Stage definition',
    learning: 'Review local coordinates and camera behavior, place background layers, then validate parallax and referenced assets before applying changes.',
    advanced: 'Camera, layer, parallax, integration, and direct-save tools retain stale-file and backup protection.'
  },
  screenpack: {
    domain: 'stageUi', label: 'Screenpack / Fight UI', title: 'Screenpack definition',
    learning: 'Choose a screen and element, inspect whether its position is owned by pos or offset, preview the change, then apply the reviewed patch.',
    advanced: 'Element, layer, safe-area, sample-data, Lua-module, and direct-save tools remain available.'
  },
  commands: {
    domain: 'zss', label: 'Commands', title: 'Command and movelist data',
    learning: 'Filter generated primitives away, inspect each command step and timing rule, then edit the authored sequence without guessing native syntax.',
    advanced: 'Dense filtering, timing inspection, native presets, and normalized recognizers remain available.'
  }
};

function normalizeMode(value, fallback = 'learning') {
  return MODES.includes(value) ? value : fallback;
}

function normalizeProfile(value = {}) {
  return Object.fromEntries(DOMAINS.map((domain) => [domain.id, normalizeMode(value[domain.id], domain.defaultMode)]));
}

function summary(profile) {
  const normalized = normalizeProfile(profile);
  return DOMAINS.map((domain) => `${domain.label}: ${normalized[domain.id] === 'learning' ? 'Learning' : 'Advanced'}`).join(' · ');
}

function workspaceExperience(workspace, value) {
  const descriptor = WORKSPACES[workspace];
  if (!descriptor) throw new Error(`Unknown IKEMEN workspace experience: ${workspace}`);
  const mode = normalizeMode(value);
  return {
    workspace,
    domain: descriptor.domain,
    label: `${descriptor.label} · ${mode === 'learning' ? 'Learning' : 'Advanced'}`,
    title: descriptor.title,
    mode,
    guidance: descriptor[mode],
    guidanceOpen: mode === 'learning',
    compact: mode === 'advanced'
  };
}

module.exports = { MODES, DOMAINS, PRESETS, WORKSPACES, normalizeMode, normalizeProfile, summary, workspaceExperience };
