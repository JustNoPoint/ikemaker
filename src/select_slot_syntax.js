'use strict';

const { parseSelectDef } = require('./select_def_model');

function slotSyntaxForTarget(target, sourceText, section = 'characters', loaderSource = '') {
  const channel = String(target?.channel || '').toLowerCase();
  if (section === 'extrastages' && !supportsStageSlots(loaderSource)) return null;
  if (channel === 'stable' && target?.version === '1.0.0') return 'slot = {';
  if (loaderSource && channel !== 'stable') {
    const current = loaderSource.includes('slot%s*{%s*()'), legacy = loaderSource.includes('slot%s*=%s*{%s*()');
    return current !== legacy ? current ? 'slot {' : 'slot = {' : null;
  }
  if (channel === 'nightly') return null;
  const openers = parseSelectDef(sourceText).entries
    .filter(entry => entry.section === section && entry.kind === 'slot-start')
    .map(entry => /^slot\s*=/.test(entry.code.toLowerCase()) ? 'slot = {' : 'slot {');
  return openers.length && openers.every(opener => opener === openers[0]) ? openers[0] : null;
}

function supportsStageSlots(loaderSource) {
  return String(loaderSource).includes('t_stageSlots') && String(loaderSource).includes('f_addStageEntry');
}

module.exports = { slotSyntaxForTarget, supportsStageSlots };
