'use strict';

const ACTION = /^\s*\[\s*Begin\s+Action\s+(-?\d+)\s*\]/i;
const FRAME = /^\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)/;
const { resolveStandards } = require('./animation_standards');

function integer(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function identity(group, index) { return `${group},${index}`; }

function parseAirInventory(text) {
  const actions = new Map();
  let current = null;
  const lines = String(text || '').split(/\r?\n/);
  for (let line = 0; line < lines.length; line += 1) {
    const action = ACTION.exec(lines[line]);
    if (action) {
      current = { number: Number(action[1]), line: line + 1, frames: [] };
      actions.set(current.number, current);
      continue;
    }
    if (!current) continue;
    const frame = FRAME.exec(lines[line]);
    if (!frame) continue;
    current.frames.push({
      group: Number(frame[1]), index: Number(frame[2]), x: Number(frame[3]),
      y: Number(frame[4]), time: Number(frame[5]), line: line + 1
    });
  }
  return actions;
}

function normalizeProfile(profile = {}) {
  const standardSets = Array.isArray(profile.standardSets) ? profile.standardSets : [];
  const standards = resolveStandards(standardSets);
  return {
    version: Number(profile.version) || 1,
    profileName: String(profile.profileName || 'Character requirements'),
    requiredSprites: Array.isArray(profile.requiredSprites) ? profile.requiredSprites : [],
    standardSets,
    requiredAnimations: [...standards.requiredAnimations, ...(Array.isArray(profile.requiredAnimations) ? profile.requiredAnimations : [])]
      .filter((entry, index, values) => values.findIndex((item) => Number(item.action) === Number(entry.action)) === index),
    requiredAxisRoles: standards.requiredAxisRoles,
    axisCopies: Array.isArray(profile.axisCopies) ? profile.axisCopies : [],
    temporaryRanges: Array.isArray(profile.temporaryRanges) && profile.temporaryRanges.length
      ? profile.temporaryRanges : [{ start: 7000, end: 7999, label: 'Temporary / unassigned' }],
    intentionalOmissions: Array.isArray(profile.intentionalOmissions) ? profile.intentionalOmissions : []
  };
}

function isOmitted(profile, type, key) {
  return profile.intentionalOmissions.some((entry) => entry && entry.type === type && String(entry.key) === String(key));
}

function auditRequirements(rows, airText, rawProfile) {
  const profile = normalizeProfile(rawProfile);
  const sprites = new Map();
  for (const row of rows || []) {
    const group = integer(row.ComputedGroup);
    const index = integer(row.ImageIndex);
    if (group === null || index === null) continue;
    sprites.set(identity(group, index), row);
  }
  const actions = parseAirInventory(airText);
  const missingSprites = [];
  const missingAnimations = [];
  const emptyAnimations = [];
  const missingAirSprites = [];
  const unassignedSprites = [];
  const missingAxisCopies = [];
  const missingAxisRoleMappings = [];

  for (const required of profile.requiredSprites) {
    const group = integer(required.group);
    const index = integer(required.index);
    if (group === null || index === null) continue;
    const key = identity(group, index);
    if (!sprites.has(key) && !isOmitted(profile, 'sprite', key)) missingSprites.push({ ...required, group, index, key });
  }
  for (const required of profile.requiredAnimations) {
    const number = integer(required.action);
    if (number === null || isOmitted(profile, 'animation', number)) continue;
    const action = actions.get(number);
    if (!action) missingAnimations.push({ ...required, action: number });
    else if (!action.frames.length) emptyAnimations.push({ ...required, action: number, line: action.line });
  }
  for (const action of actions.values()) {
    for (const frame of action.frames) {
      const key = identity(frame.group, frame.index);
      if (frame.group >= 0 && frame.index >= 0 && !sprites.has(key)) {
        missingAirSprites.push({ action: action.number, ...frame, key });
      }
    }
  }
  for (const [key, row] of sprites) {
    const group = integer(row.ComputedGroup);
    const range = profile.temporaryRanges.find((entry) => group >= Number(entry.start) && group <= Number(entry.end));
    if (range) unassignedSprites.push({ key, group, index: integer(row.ImageIndex), row, range });
  }
  for (const copy of profile.axisCopies) {
    const sourceGroup = integer(copy.sourceGroup);
    const sourceIndex = integer(copy.sourceIndex);
    const targetGroup = integer(copy.targetGroup);
    const targetIndex = integer(copy.targetIndex);
    if ([sourceGroup, sourceIndex, targetGroup, targetIndex].some((value) => value === null)) continue;
    const targetKey = identity(targetGroup, targetIndex);
    if (sprites.has(identity(sourceGroup, sourceIndex)) && !sprites.has(targetKey) && !isOmitted(profile, 'sprite', targetKey)) {
      missingAxisCopies.push({ ...copy, sourceGroup, sourceIndex, targetGroup, targetIndex, targetKey });
    }
  }
  for (const required of profile.requiredAxisRoles) {
    if (!profile.axisCopies.some((copy) => String(copy.role || '').toLowerCase() === String(required.role).toLowerCase()
        && [copy.sourceGroup, copy.sourceIndex, copy.targetGroup, copy.targetIndex].every((value) => integer(value) !== null))) {
      missingAxisRoleMappings.push(required);
    }
  }
  return { profile, sprites, actions, missingSprites, missingAnimations, emptyAnimations, missingAirSprites, unassignedSprites, missingAxisCopies, missingAxisRoleMappings };
}

function requirementTemplate() {
  return {
    version: 1,
    profileName: 'Project character requirements',
    notes: [
      'Add only confirmed project requirements. Do not silently promote recommendations to requirements.',
      'Levels may be IKEMEN, project, recommended, optional, or character.'
    ],
    standardSets: ['ikemen-1.0-character-core', 'jnp-shared-gethit-axis-references'],
    requiredSprites: [],
    requiredAnimations: [],
    axisCopies: [
      { role: 'feet', label: 'Get-hit feet-axis reference', sourceGroup: null, sourceIndex: null, targetGroup: null, targetIndex: null },
      { role: 'middle', label: 'Get-hit middle-axis reference', sourceGroup: null, sourceIndex: null, targetGroup: null, targetIndex: null },
      { role: 'head', label: 'Get-hit head-axis reference', sourceGroup: null, sourceIndex: null, targetGroup: null, targetIndex: null }
    ],
    temporaryRanges: [{ start: 7000, end: 7999, label: 'Temporary / unassigned' }],
    intentionalOmissions: []
  };
}

function markdownReport(audit, sources = {}) {
  const section = (title, values, render) => [
    `## ${title} (${values.length})`, '', ...(values.length ? values.map(render) : ['None.']), ''
  ];
  return [
    '# IKEMEN Character Requirements Audit', '',
    `Profile: **${audit.profile.profileName}**`,
    sources.manifest ? `Manifest: \`${sources.manifest}\`` : '',
    sources.air ? `AIR: \`${sources.air}\`` : '', '',
    ...section('Missing required sprites', audit.missingSprites, (item) => `- ${item.key} — ${item.label || 'Required sprite'} [${item.level || 'project'}]`),
    ...section('Missing required animations', audit.missingAnimations, (item) => `- Action ${item.action} — ${item.label || 'Required animation'} [${item.level || 'project'}]`),
    ...section('Empty required animations', audit.emptyAnimations, (item) => `- Action ${item.action} at AIR line ${item.line}`),
    ...section('AIR references missing from manifest', audit.missingAirSprites, (item) => `- Action ${item.action}, AIR line ${item.line}: sprite ${item.key}`),
    ...section('Temporary or unassigned sprites', audit.unassignedSprites, (item) => `- ${item.key} — ${item.row.CanonicalSequenceKey || item.row.OriginalRelativePath || 'Unnamed'} (${item.range.label || 'temporary range'})`),
    ...section('Missing axis-reference copies', audit.missingAxisCopies, (item) => `- ${item.label || 'Axis copy'}: ${item.sourceGroup},${item.sourceIndex} → ${item.targetKey}`),
    ...section('Axis roles awaiting an exact mapping', audit.missingAxisRoleMappings, (item) => `- ${item.label} (${item.role}) — configure its exact source and target group/index in axisCopies; no mapping was invented.`),
    '## Summary', '',
    `- Manifest sprites: ${audit.sprites.size}`,
    `- AIR actions: ${audit.actions.size}`,
    `- Review items: ${audit.missingSprites.length + audit.missingAnimations.length + audit.emptyAnimations.length + audit.missingAirSprites.length + audit.unassignedSprites.length + audit.missingAxisCopies.length + audit.missingAxisRoleMappings.length}`,
    ''
  ].filter((line) => line !== '').join('\n');
}

module.exports = { parseAirInventory, normalizeProfile, auditRequirements, requirementTemplate, markdownReport };
