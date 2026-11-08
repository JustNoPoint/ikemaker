'use strict';

const SOURCE_MESSAGE_TYPES = new Set([
  'sffRetainedState', 'sffSelection', 'viewerNavigationReady', 'quickSpritePosition',
  'palette', 'paletteLibrary', 'userPaletteLibrary', 'masterStatus', 'auditPalettes',
  'previewMaster', 'previewUserPalette', 'previewLibraryPalette', 'compareLibraryPalette',
  'importAct', 'compareAct', 'thumbnails', 'animationImages', 'sprite', 'spritePaletteColors'
]);
const SOURCE_COMMANDS = new Set([
  'sff.quickTransfer', 'sff.transfer.copySelected', 'sff.transfer.swapSides', 'sff.transfer.openBrowser',
  'sff.transfer.changeSource', 'sff.transfer.changeDestination',
  'sff.transfer.exit', 'sff.transfer.continueAssembly'
]);

function sourceMessageAllowed(message) {
  if (!message || typeof message !== 'object') return false;
  if (SOURCE_MESSAGE_TYPES.has(message.type)) return true;
  return message.type === 'command' && SOURCE_COMMANDS.has(message.command);
}

function transferMessageAllowed(owner, message) {
  return !owner?.transferPinned || owner.transferRole !== 'source' || sourceMessageAllowed(message);
}

module.exports = { SOURCE_MESSAGE_TYPES, SOURCE_COMMANDS, sourceMessageAllowed, transferMessageAllowed };
