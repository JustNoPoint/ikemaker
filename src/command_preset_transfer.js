'use strict';

const crypto = require('crypto');
const { decodeStrictJsonArtifact } = require('./sff_strict_json_artifact');
const { parseCommands, diagnosticsFor, nativeInputAtoms } = require('./command_movelist_model');
const { CUSTOM_PRESET_LIMITS, normalizeCustomPresets } = require('./command_presets');

const SCHEMA = 'ikemaker.command-presets';
const VERSION = 1;
const MAX_ARTIFACT_BYTES = 1024 * 1024;
const TARGET_ONLY_CODES = new Set(['unsupported-broad-direction']);

function sha(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function plain(value) { return Boolean(value && Object.getPrototypeOf(value) === Object.prototype); }
function exactKeys(value, allowed, label) {
  if (!plain(value)) throw new Error(`${label} must be a JSON object.`);
  const keys = Object.keys(value), expected = new Set(allowed);
  if (keys.some(key => !expected.has(key)) || allowed.some(key => !Object.hasOwn(value, key))) throw new Error(`${label} must contain exactly: ${allowed.join(', ')}.`);
}
function safeId(seed, occupied) {
  const base = `custom:import-${sha(seed).slice(0, 24)}`;
  let id = base, suffix = 2;
  while (occupied.has(id)) id = `${base}-${suffix++}`;
  occupied.add(id);
  return id;
}
function inspectPresetText(text, capabilities = {}) {
  const document = parseCommands(text, 'shared-command-preset.inp2');
  if (!document.commands.length) throw new Error('A shared preset contains no [Command] definitions.');
  if (document.commands.some(command => !command.name || !command.command)) throw new Error('Every shared preset definition needs both a name and a command sequence.');
  if (document.commands.some(command => !command.steps.length || command.steps.some(step => !nativeInputAtoms(step.raw).length))) throw new Error('A shared preset contains a command sequence that is not valid native input syntax.');
  const diagnostics = document.commands.flatMap(command => diagnosticsFor(command, document.commands, { capabilities }));
  const errors = diagnostics.filter(item => item.severity === 'error');
  const structural = errors.filter(item => !TARGET_ONLY_CODES.has(item.code));
  if (structural.length) throw new Error(`A shared preset is not structurally valid: ${structural[0].message}`);
  const unavailable = errors.some(item => item.code === 'unsupported-broad-direction');
  return {
    definitionCount: document.commands.length,
    compatibility: unavailable
      ? { status: 'unavailable', requiresNightly: true, reason: 'Requires a verified IKEMEN GO Nightly target with broad-direction command expressions.' }
      : { status: 'available', requiresNightly: false, reason: '' }
  };
}
function decodePresetArtifact(input, capabilities = {}) {
  const bytes = Buffer.isBuffer(input) ? Buffer.from(input) : Buffer.from(String(input ?? ''), 'utf8');
  if (!bytes.length || bytes.length > MAX_ARTIFACT_BYTES) throw new Error(`Command preset files must be between 1 byte and ${MAX_ARTIFACT_BYTES / 1024} KiB.`);
  const { parsed } = decodeStrictJsonArtifact(bytes, 'Command preset file');
  exactKeys(parsed, ['schema', 'version', 'presets'], 'Command preset file');
  if (parsed.schema !== SCHEMA || parsed.version !== VERSION) throw new Error('This is not a supported IKEMaker command preset file.');
  if (!Array.isArray(parsed.presets) || !parsed.presets.length || parsed.presets.length > CUSTOM_PRESET_LIMITS.count) throw new Error(`A command preset file must contain 1–${CUSTOM_PRESET_LIMITS.count} presets.`);
  const synthetic = parsed.presets.map((item, index) => {
    exactKeys(item, ['label', 'text'], `Preset ${index + 1}`);
    if (typeof item.label !== 'string' || typeof item.text !== 'string') throw new Error(`Preset ${index + 1} label and text must be strings.`);
    return { id: `custom:validation-${index + 1}`, label: item.label, text: item.text };
  });
  const normalized = normalizeCustomPresets(synthetic);
  return normalized.map((item, index) => ({
    index, label: item.label, text: item.text, ...inspectPresetText(item.text, capabilities),
    contentHash: sha(Buffer.from(item.text, 'utf8'))
  }));
}
function encodePresetArtifact(presets) {
  const normalized = normalizeCustomPresets(presets || []);
  if (!normalized.length) throw new Error('Choose at least one custom command preset to export.');
  const bytes = Buffer.from(`${JSON.stringify({ schema: SCHEMA, version: VERSION, presets: normalized.map(({ label, text }) => ({ label, text })) }, null, 2)}\n`, 'utf8');
  if (bytes.length > MAX_ARTIFACT_BYTES) throw new Error('The selected presets exceed the command preset file limit.');
  return bytes;
}
function importReview(candidates, existing) {
  const current = normalizeCustomPresets(existing || []), labels = new Map(current.map(item => [item.label.toLocaleLowerCase(), item]));
  return candidates.map(candidate => ({ ...candidate, collision: labels.has(candidate.label.toLocaleLowerCase()), existing: labels.get(candidate.label.toLocaleLowerCase()) || null }));
}
function defaultKeepBothLabel(label, occupiedLabels) {
  let candidate = `${label} (imported)`, suffix = 2;
  while (occupiedLabels.has(candidate.toLocaleLowerCase())) candidate = `${label} (imported ${suffix++})`;
  return candidate;
}
function buildImportPlan(candidates, existing, selections, decisions = {}) {
  const current = normalizeCustomPresets(existing || []), selected = new Set((selections || []).map(Number));
  if (!selected.size) throw new Error('Choose at least one command preset to import.');
  const occupiedIds = new Set(current.map(item => item.id)), occupiedLabels = new Set(current.map(item => item.label.toLocaleLowerCase()));
  const output = current.map(item => ({ ...item })), applied = [];
  for (const candidate of candidates) {
    if (!selected.has(candidate.index)) continue;
    const collisionAt = output.findIndex(item => item.label.toLocaleLowerCase() === candidate.label.toLocaleLowerCase());
    if (collisionAt >= 0) {
      const decision = decisions[candidate.index];
      if (!decision || !['skip', 'replace', 'keep-both'].includes(decision.action)) throw new Error(`Choose how to handle the existing preset “${candidate.label}”.`);
      if (decision.action === 'skip') { applied.push({ index: candidate.index, action: 'skip', label: candidate.label }); continue; }
      if (decision.action === 'replace') {
        output[collisionAt] = { id: output[collisionAt].id, label: candidate.label, text: candidate.text };
        applied.push({ index: candidate.index, action: 'replace', label: candidate.label }); continue;
      }
      const renamed = String(decision.label || '').trim();
      if (!renamed || occupiedLabels.has(renamed.toLocaleLowerCase())) throw new Error(`The keep-both name for “${candidate.label}” must be unique.`);
      const id = safeId(`${renamed}\0${candidate.text}`, occupiedIds);
      output.push({ id, label: renamed, text: candidate.text }); occupiedLabels.add(renamed.toLocaleLowerCase());
      applied.push({ index: candidate.index, action: 'keep-both', label: renamed }); continue;
    }
    if (occupiedLabels.has(candidate.label.toLocaleLowerCase())) throw new Error(`The preset name “${candidate.label}” is no longer unique.`);
    const id = safeId(`${candidate.label}\0${candidate.text}`, occupiedIds);
    output.push({ id, label: candidate.label, text: candidate.text }); occupiedLabels.add(candidate.label.toLocaleLowerCase());
    applied.push({ index: candidate.index, action: 'add', label: candidate.label });
  }
  const presets = normalizeCustomPresets(output);
  return { presets, applied, planHash: sha(JSON.stringify({ presets, applied })) };
}

module.exports = { SCHEMA, VERSION, MAX_ARTIFACT_BYTES, decodePresetArtifact, encodePresetArtifact, inspectPresetText, importReview, defaultKeepBothLabel, buildImportPlan };
