'use strict';

function stageAirLegacyToolbarIntent(message) {
  if (!message || typeof message !== 'object') return false;
  if (message.type === 'ikemenViewer' && message.target === 'air') return true;
  if (message.type !== 'viewerToolbarAction' || typeof message.actionId !== 'string') return false;
  return require('./viewer_toolbar').menuDefinitions('stage').flatMap(group => group.items).some(item => !item.separator && item.id === message.actionId && item.action === 'air');
}

module.exports = { stageAirLegacyToolbarIntent };
