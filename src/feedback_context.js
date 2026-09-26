'use strict';
const { parseDef, sections, value, unquote } = require('./def_model');
const ITEM_TYPES = ['Character', 'Stage', 'Screenpack/Motif', 'Opening', 'Ending', 'Storyboard', 'Game Project', 'Team Project', 'Universal tool/viewer', 'Other'];
function definitionContext(text, filename = '', itemType = 'Other') {
  const doc = parseDef(text, filename), info = sections(doc, 'Info')[0], scene = sections(doc, 'SceneDef')[0];
  if (itemType === 'Other') itemType = sections(doc, 'StageInfo').length ? 'Stage' : sections(doc, 'Title Info').length ? 'Screenpack/Motif' : scene ? 'Storyboard' : sections(doc, 'Files').length ? 'Character' : 'Other';
  const get = key => unquote(value(info, key, '') || value(scene, key, ''));
  const version = get('version') || get('versionnumber'), date = get('versiondate');
  return { itemType, itemName: get('displayname') || get('name') || 'Unknown', contentVersion: version || (date ? `Version date: ${date}` : 'Unknown') };
}
function reportContext(state, toolVersion = 'Unknown') {
  return { toolVersion, itemType: 'Character', itemName: state.character?.name || 'Unknown', contentVersion: state.character?.contentVersion || 'Unknown', profile: state.profile?.name || 'Unknown', screen: 'Production Workflow', useCase: '' };
}
module.exports = { ITEM_TYPES, definitionContext, reportContext };
