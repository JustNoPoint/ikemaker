'use strict';

const { SAFEGUARD_DEFINITIONS } = require('./shader_workshop_model');

const RULES = Object.freeze({
  preservePaletteColors:'changesRgb', preserveTransparentPixels:'addsVisiblePixels', preservePartialAlpha:'changesAlpha',
  preserveSpriteSilhouette:'changesSilhouette', preventColorBleeding:'neighborSampling', preserveIndexedPaletteBehavior:'breaksIndexedBehavior'
});
const HOST_ENFORCED = Object.freeze(new Set(['clampOutputColor','applyOnlySelectedTarget','keepReversibleBaseline']));

function classifySafeguards(project, effect) {
  if (!project?.safeguards || !effect?.capabilities) throw new Error('A Shader Workshop project and trusted effect are required.');
  return Object.freeze(SAFEGUARD_DEFINITIONS.map(definition => {
    const enabled = project.safeguards[definition.id] === true, capability = RULES[definition.id];
    let status = 'advisory', message = 'Disabled by the user; retained as an advisory review item.';
    if (enabled && HOST_ENFORCED.has(definition.id)) { status='enforced'; message='Enforced by the Shader Workshop host.'; }
    else if (enabled && capability && effect.capabilities[capability] === true) { status='blocked'; message=`${effect.label} cannot run while this safeguard is enabled.`; }
    else if (enabled && capability) { status='enforced'; message='The trusted effect contract and host wrapper preserve this property.'; }
    else if (enabled) { status='audited'; message='Checked by the offline pixel audit; runtime equivalence is not claimed.'; }
    return Object.freeze({ id:definition.id, label:definition.label, enabled, status, message });
  }));
}
function blockedSafeguards(project, effect) { return Object.freeze(classifySafeguards(project,effect).filter(item => item.status === 'blocked')); }
function requirePreviewAllowed(project, effect) {
  const blocked = blockedSafeguards(project,effect);
  if (blocked.length) throw new Error(`${effect.label} is blocked by: ${blocked.map(item=>item.label).join(', ')}. Disable each safeguard explicitly or choose a compatible effect.`);
  return classifySafeguards(project,effect);
}

module.exports = { RULES, HOST_ENFORCED, classifySafeguards, blockedSafeguards, requirePreviewAllowed };
