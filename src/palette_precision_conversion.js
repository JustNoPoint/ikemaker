'use strict';

const interaction = require('./palette_workshop_interaction_model');

function review(context) {
  const state = interaction.normalizeInteraction(context.interaction);
  const options = {
    palette: context.scopePalette,
    namedGroupAuthorities: context.named?.authorities || []
  };
  const source = context.colors;
  const quantized = interaction.quantize(source, state.precisionProfile);
  const members = interaction.scopeIndexes(state, options);
  const editable = interaction.editableIndexes(state, options);
  const colors = source.map(color => color.slice());
  for (const index of editable) {
    for (let channel = 0; channel < 3; channel++) {
      colors[index][channel] = quantized.colors[index][channel];
    }
  }
  const changedIndexes = editable.filter(index =>
    source[index].some((value, channel) => value !== colors[index][channel]));
  const selectionKey = interaction.digest([
    context.session.target?.filename, context.session.selection
  ]);
  const scopeLabel = state.scope === 'palette' ? 'whole palette'
    : state.scope === 'group'
      ? 'named group “' + interaction.resolveNamedGroup(state, context.scopePalette, options).name + '”'
      : 'index ' + state.activeIndex;
  let reason = '';
  if (state.precisionProfile === 'full') {
    reason = 'Choose RGB 4:4:4, 5:5:5 or 5:6:5 to preview a conversion.';
  } else if (!editable.length) {
    reason = 'This scope has no unlocked indexes.';
  } else if (!changedIndexes.length) {
    reason = 'The unlocked colors in this scope already match this precision.';
  } else if (context.session.stale || context.session.candidate?.stale) {
    reason = 'Refresh the exact current palette before converting.';
  }
  const token = interaction.digest([
    'palette-precision-conversion-v1', context.session.sessionId,
    context.session.revision, context.session.target, context.session.selection,
    interaction.paletteIdentity(context.scopePalette), state.scope,
    state.namedGroupRef, state.activeIndex, state.lockedIndexes,
    state.precisionProfile, interaction.digest(source), interaction.digest(colors)
  ]);
  return {
    token, selectionKey, profile: state.precisionProfile, scopeLabel,
    changedCount: changedIndexes.length,
    skippedLockedCount: members.length - editable.length,
    available: !reason, reason, colors
  };
}

function apply(context, token, now = '') {
  const reviewed = review(context);
  if (typeof token !== 'string' || token !== reviewed.token) {
    throw Error('The palette, selection, scope, locks or precision changed. Review the current preview before converting.');
  }
  if (!reviewed.available) throw Error(reviewed.reason);
  const candidate = Boolean(context.session.candidate?.active);
  const state = interaction.pushCheckpoint(
    context.interaction, context.colors, 'Before ' + reviewed.profile + ' conversion', now);
  const patch = {
    preview: {
      ...context.session.preview, dirty: true, stale: false,
      colors: reviewed.colors,
      label: 'Converted ' + reviewed.scopeLabel + ' to ' + reviewed.profile
    },
    interaction: interaction.normalizeInteraction({
      ...state,
      status: 'Converted ' + reviewed.changedCount + ' RGB entries in ' + reviewed.scopeLabel
        + '; skipped ' + reviewed.skippedLockedCount + ' locked/protected. '
        + 'Alpha and index identity preserved. Undo and normal Save/Replace remain available.'
    }),
    facts: { preview: candidate ? 'candidate' : 'draft' },
    applyAllowed: candidate ? Boolean(context.session.candidate.baseline.applyAllowed) : true
  };
  if (candidate) {
    patch.candidate = {
      ...context.session.candidate,
      status: 'RGB conversion retained in the candidate draft; library and SFF are unchanged.'
    };
  }
  return { review: reviewed, patch };
}

function publicReview(context) {
  const { colors, ...result } = review(context);
  return result;
}

module.exports = { review, publicReview, apply };
