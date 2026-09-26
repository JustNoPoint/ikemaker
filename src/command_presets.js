'use strict';

const { commandBlock } = require('./command_movelist_model');

function native(name, command, time, steptime, bufferTime = 1) {
  return { name, command, time, steptime, autogreater: 1, bufferTime, bufferHitpause: 1, bufferPauseend: 1, bufferShared: 1 };
}
function paired(id, label, normal, release, explanation) {
  return { id, label, category: 'Simple Native', kind: 'native', explanation, blocks: [normal, release] };
}

const PRESETS = [
  paired('qcf-held-down', 'QCF with Held-Down Release Window', native('qcf_x', 'D, DF, F, x', 30, 10), native('qcf_x', '~D, DF, F, x', 15, 5), 'Two same-named IKEMEN 1.0 definitions. The release route handles a motion begun after down was already held; no maps are required.'),
  paired('qcb-held-down', 'QCB with Held-Down Release Window', native('qcb_x', 'D, DB, B, x', 30, 10), native('qcb_x', '~D, DB, B, x', 15, 5), 'Use exact ~D rather than ~$D when leaving cardinal down for a diagonal.'),
  paired('dp-held-forward', 'DP with Held-Forward Release Window', native('dp_x', 'F, D, DF, x', 30, 10), native('dp_x', '~F, D, DF, x', 15, 5), 'Supports DP after walking forward by giving the release-start route a shorter continuation window.'),
  paired('rdp-held-back', 'Reverse DP with Held-Back Release Window', native('rdp_x', 'B, D, DB, x', 30, 10), native('rdp_x', '~B, D, DB, x', 15, 5), 'Mirror of the held-forward DP route.'),
  { id: 'charge-capcom-bf', label: 'Capcom Charge B-F', category: 'Simple Native', kind: 'native', explanation: 'Recommended relative-facing IKEMEN 1.0 charge definition.', blocks: [native('charge_bf_x', '~45$B, F, x', 16, 16)] },
  { id: 'charge-down-up', label: 'Charge Down-Up', category: 'Simple Native', kind: 'native', explanation: 'IKEMEN 1.0 vertical charge. $D accepts either down diagonal during charge.', blocks: [native('charge_du_x', '~45$D, U, x', 16, 16)] },
  { id: 'hcf-optional-refresh', label: 'HCF/HCB with Independent Optional-Diagonal Refresh', category: 'Advanced Normalized', kind: 'mapped', explanation: 'Use only when optional ordered diagonals must refresh timing without becoming required. Duplicate static commands do not cover every mixture.', snippet: '# Advanced mapped recognition required.\n# Native direction events feed deterministic ZSS maps:\n# JNP_motion_hcf_step / timer / ready\n# JNP_motion_hcb_step / timer / ready\n# JNP_cfg_motion_step_time / result_buffer\n# Open the offline Native Command Timing guide and the HDBZ handoff before insertion.' },
  { id: 'circle-optional-refresh', label: '360/720 with Independent Optional-Diagonal Refresh', category: 'Advanced Normalized', kind: 'mapped', explanation: 'Tracks absolute world-space direction ring indices in deterministic ZSS. Optional diagonals refresh the candidate without advancing its cardinal count.', snippet: '# Advanced mapped 360/720 recognizer required.\n# Generate one-tick absolute L/DL/D/DR/R/UR/U/UL commands.\n# Use JNP_motion_circle_cw_* and JNP_motion_circle_ccw_* maps.\n# A cardinal starts a route; a diagonal never starts one.\n# Open the offline guide and HDBZ handoff for the complete reviewed skeleton.' },
  { id: 'held-start-deadline', label: 'Held-Start Deadline Map Skeleton', category: 'Advanced Normalized', kind: 'mapped', explanation: 'Only for behavior more complex than the paired native 10/5 definitions.', snippet: '# Reserve only for rules beyond paired native definitions:\n# JNP_motion_start_press_timer\n# JNP_motion_start_release_timer\n# JNP_motion_start_deadline\n# JNP_motion_start_source (1 fresh press, 2 held release)\n# The effective deadline is the later valid authored deadline, not a global leniency bonus.' }
];

function presetText(preset) { return preset.kind === 'native' ? preset.blocks.map(commandBlock).join('\n\n') : preset.snippet; }
function findPreset(id) { return PRESETS.find((preset) => preset.id === id); }
function upsertCustomPreset(existing, preset) {
  const clean = (existing || []).filter((item) => item && item.id && item.label && typeof item.text === 'string');
  const label = String(preset.label || '').trim();
  if (!label) throw new Error('A custom command preset needs a name.');
  const id = String(preset.id || '').trim();
  return [...clean.filter((item) => item.id !== id && item.label.toLowerCase() !== label.toLowerCase()), { id, label, text: String(preset.text || '') }];
}
function removeCustomPreset(existing, id) { return (existing || []).filter((item) => item && item.id !== id); }

module.exports = { PRESETS, presetText, findPreset, upsertCustomPreset, removeCustomPreset };
