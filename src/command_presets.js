'use strict';

const { commandBlock } = require('./command_movelist_model');

const CUSTOM_PRESET_LIMITS = Object.freeze({ count: 100, labelCharacters: 80, labelBytes: 320, textBytes: 64 * 1024, aggregateBytes: 512 * 1024 });

function byteLength(value) { return Buffer.byteLength(String(value ?? ''), 'utf8'); }
function validPresetId(id) { return typeof id === 'string' && /^custom:[A-Za-z0-9._:-]{1,120}$/.test(id); }
function normalizeCustomPreset(preset) {
  if (!preset || Object.getPrototypeOf(preset) !== Object.prototype || Object.keys(preset).some(key => !['id', 'label', 'text'].includes(key))) throw new Error('A workspace command preset has unsupported fields.');
  const id = String(preset.id || '').trim(), label = String(preset.label || '').trim(), text = String(preset.text ?? '');
  if (!validPresetId(id)) throw new Error('A workspace command preset has an invalid identifier.');
  if (!label) throw new Error('A custom command preset needs a name.');
  if ([...label].length > CUSTOM_PRESET_LIMITS.labelCharacters || byteLength(label) > CUSTOM_PRESET_LIMITS.labelBytes) throw new Error(`Preset names are limited to ${CUSTOM_PRESET_LIMITS.labelCharacters} characters.`);
  if (/[\u0000-\u001f\u007f<>]/u.test(label)) throw new Error('Preset names cannot contain control characters or markup brackets.');
  if (!text || byteLength(text) > CUSTOM_PRESET_LIMITS.textBytes) throw new Error(`Each custom command preset is limited to ${CUSTOM_PRESET_LIMITS.textBytes / 1024} KiB.`);
  return { id, label, text };
}
function normalizeCustomPresets(existing) {
  if (!Array.isArray(existing)) throw new Error('Workspace command preset storage is not a list.');
  if (existing.length > CUSTOM_PRESET_LIMITS.count) throw new Error(`This workspace can store at most ${CUSTOM_PRESET_LIMITS.count} custom command presets.`);
  const result = existing.map(normalizeCustomPreset), ids = new Set(), labels = new Set();
  for (const item of result) {
    const labelKey = item.label.toLocaleLowerCase();
    if (ids.has(item.id) || labels.has(labelKey)) throw new Error('Workspace command presets contain duplicate identifiers or names.');
    ids.add(item.id); labels.add(labelKey);
  }
  if (result.reduce((total, item) => total + byteLength(item.id) + byteLength(item.label) + byteLength(item.text), 0) > CUSTOM_PRESET_LIMITS.aggregateBytes) throw new Error(`Workspace command presets are limited to ${CUSTOM_PRESET_LIMITS.aggregateBytes / 1024} KiB total.`);
  return result;
}

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
  const clean = normalizeCustomPresets(existing || []), candidate = normalizeCustomPreset(preset);
  return normalizeCustomPresets([...clean.filter((item) => item.id !== candidate.id && item.label.toLocaleLowerCase() !== candidate.label.toLocaleLowerCase()), candidate]);
}
function removeCustomPreset(existing, id) { return normalizeCustomPresets(existing || []).filter((item) => item.id !== id); }

module.exports = { PRESETS, CUSTOM_PRESET_LIMITS, presetText, findPreset, normalizeCustomPreset, normalizeCustomPresets, upsertCustomPreset, removeCustomPreset };
