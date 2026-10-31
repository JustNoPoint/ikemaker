'use strict';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

const DIMENSIONS = deepFreeze({ width: 27, height: 27, unit: 'css-px', wrap: 'whole-groups', horizontalScroll: false });
const CONTRACT_ID = 'universal-v1';

const GROUPS = deepFreeze([
  {
    id: 'document',
    slots: [
      ['new', 'New', 'universal.new'], ['close', 'Close', 'universal.close'], ['open', 'Open', 'universal.open'],
      ['save', 'Save', 'universal.save'], ['auto-save', 'Auto Save', 'universal.auto-save'], ['save-as', 'Save As', 'universal.save-as'],
      ['text-source', 'Open / Focus Text Editor', 'universal.text-source'], ['connected-resources', 'Connected Resources', 'universal.connected-resources']
    ]
  },
  {
    id: 'safety-run',
    slots: [
      ['backup', 'Backup', 'universal.backup'], ['recovery', 'Recovery / History', 'universal.recovery'], ['run', 'Run Game', 'universal.run'],
      ['versus', 'Infinite Quick VS', 'universal.versus'], ['training', 'Training', 'universal.training'],
      ['restart', 'Restart IKEMEN / Apply Changes', 'universal.restart']
    ]
  },
  {
    id: 'workspaces',
    slots: [
      ['project', 'Project / Manager', 'universal.project'], ['stage', 'Stage', 'universal.stage'], ['sprites', 'Sprites / SFF', 'universal.sprites'],
      ['animations', 'Animations / AIR', 'universal.animations'], ['commands', 'Commands / Movelist', 'universal.commands'],
      ['states', 'States / Controllers', 'universal.states'], ['sounds', 'Sounds / SND', 'universal.sounds'], ['palettes', 'Palettes', 'universal.palettes'],
      ['code-structure', 'Code Structure / Navigator', 'universal.code-structure'], ['viewer-browser', 'Viewer Browser', 'universal.viewer-browser']
    ]
  },
  {
    id: 'suite',
    slots: [
      ['actions-search', 'Actions Search', 'universal.actions-search'], ['suite-switch', 'Switch Suite', 'universal.suite-switch'],
      ['updates', 'Check Elecbyte / IKEMEN and IKEMaker Updates', 'universal.updates'],
      ['help', 'Help', 'universal.help'], ['settings', 'Settings', 'universal.settings']
    ]
  }
].map((group) => ({ ...group, slots: group.slots.map(([id, label, actionId]) => ({ id, label, actionId })) })));

const SLOTS = deepFreeze(GROUPS.flatMap((group, groupIndex) => group.slots.map((slot, slotIndex) => ({
  ...slot,
  group: group.id,
  groupIndex,
  slotIndex
}))));

const SPECIALIST_ACTION_IDS = deepFreeze([
  'shared.back', 'shared.forward', 'shared.pinned', 'shared.compare',
  'snd.element.undoAsset', 'snd.element.redoAsset',
  'snd.element.add', 'snd.element.delete', 'snd.element.replace', 'snd.element.export',
  'snd.special.audio-play', 'snd.special.audio-loop', 'snd.special.audio-pause', 'snd.element.stop',
  'air.frame.previous', 'air.frame.next', 'air.play', 'air.element.prev', 'air.element.next', 'air.element.play',
  'sff.sprite.add', 'sff.sprite.delete', 'sff.selector.data.action.addSprites', 'sff.selector.data.action.deleteSprite',
  'palette.apply', 'stage.rig', 'screenpack.selection'
]);

function slotIds() { return SLOTS.map((slot) => slot.id); }
function slotCoordinates() { return SLOTS.map(({ id, group, groupIndex, slotIndex }) => deepFreeze({ id, group, groupIndex, slotIndex })); }

module.exports = { deepFreeze, CONTRACT_ID, DIMENSIONS, GROUPS, SLOTS, SPECIALIST_ACTION_IDS, slotIds, slotCoordinates };
