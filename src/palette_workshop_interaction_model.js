'use strict';

const crypto = require('crypto');
const { normalizeColors } = require('./palette_editor');

const VERSION = 1;
const MAX_CHECKPOINTS = 32;
const SCOPES = new Set(['index', 'group', 'palette']);
const HASH = /^[0-9a-f]{64}$/i;
const FOCUS_MODES = new Set(['off', 'dim']);
const PRECISION_PROFILES = Object.freeze({
  full: Object.freeze({ id: 'full', label: 'Full RGBA preview', bits: [8, 8, 8, 8] }),
  rgb444: Object.freeze({ id: 'rgb444', label: 'RGB 4:4:4 preview', bits: [4, 4, 4, 8] }),
  rgb555: Object.freeze({ id: 'rgb555', label: 'RGB 5:5:5 preview', bits: [5, 5, 5, 8] }),
  rgb565: Object.freeze({ id: 'rgb565', label: 'RGB 5:6:5 preview', bits: [5, 6, 5, 8] })
});

function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
function digest(value) { return crypto.createHash('sha256').update(Buffer.from(JSON.stringify(value))).digest('hex'); }
function integer(value, fallback = 0) { const number = Number(value); return Number.isInteger(number) && number >= 0 && number < 256 ? number : fallback; }
function uniqueIndexes(values) { return [...new Set((values || []).map(Number).filter(value => Number.isInteger(value) && value >= 0 && value < 256))].sort((a, b) => a - b); }
function paletteIdentity(value) { const physicalIndex=value?.physicalIndex??value?.index;return value && Number.isInteger(Number(physicalIndex)) && Number.isInteger(Number(value.group)) && Number.isInteger(Number(value.number)) ? `${Number(value.group)},${Number(value.number)}@${Number(physicalIndex)}` : ''; }
function paletteFromIdentity(value) { const match=/^(\d+),(\d+)@(\d+)$/.exec(String(value||''));return match?{group:Number(match[1]),number:Number(match[2]),physicalIndex:Number(match[3])}:null; }
function exactIndexes(values, label = 'Named index group') {
  if (!Array.isArray(values) || !values.length || values.length > 256) throw new Error(`${label} must contain 1 through 256 exact palette indexes.`);
  const indexes = values.map(Number);
  if (indexes.some(value => !Number.isInteger(value) || value < 0 || value > 255)) throw new Error(`${label} contains an out-of-range palette index.`);
  if (new Set(indexes).size !== indexes.length) throw new Error(`${label} contains duplicate palette indexes.`);
  return indexes.slice().sort((a, b) => a - b);
}
function namedGroupRef(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = String(value.id || ''), authorityHash = String(value.authorityHash || '').toLowerCase(), membershipHash = String(value.membershipHash || '').toLowerCase();
  if (!id || id.length > 256 || /[\u0000-\u001f\u007f]/.test(id) || !HASH.test(authorityHash) || !HASH.test(membershipHash)) return null;
  return { id, authorityHash, membershipHash };
}
function namedGroupAuthority(value, palette) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('A trusted named index-group authority is required.');
  const ref = namedGroupRef(value.ref || value), sourcePaletteIdentity = String(value.sourcePaletteIdentity || ''), expectedPaletteIdentity = paletteIdentity(palette), indexes = exactIndexes(value.indexes, 'Named index group');
  if (!ref || !paletteFromIdentity(sourcePaletteIdentity) || (expectedPaletteIdentity && sourcePaletteIdentity !== expectedPaletteIdentity)) throw new Error('Named index-group authority does not match the exact source palette.');
  const membershipHash = digest(['named-index-group', ref.authorityHash, ref.id, indexes]);
  if (membershipHash !== ref.membershipHash) throw new Error('Named index-group membership evidence changed.');
  return { ref, id: ref.id, name: String(value.name || ref.id).slice(0, 256), authorityHash: ref.authorityHash, membershipHash, sourcePaletteIdentity, indexes };
}
function createNamedGroupAuthority(input, palette) {
  const sourcePaletteIdentity = paletteIdentity(palette), id = String(input?.id || ''), authorityHash = String(input?.authorityHash || '').toLowerCase(), indexes = exactIndexes(input?.indexes ?? input?.memberIndexes, 'Named index group');
  if (!sourcePaletteIdentity) throw new Error('Named index groups require an exact source palette identity.');
  if (!id || id.length > 256 || /[\u0000-\u001f\u007f]/.test(id) || !HASH.test(authorityHash)) throw new Error('Named index-group identity or authority hash is invalid.');
  const membershipHash = digest(['named-index-group', authorityHash, id, indexes]);
  return namedGroupAuthority({ ref: { id, authorityHash, membershipHash }, name: input.name, sourcePaletteIdentity, indexes }, palette);
}
function publicNamedGroup(value, palette) { const group = namedGroupAuthority(value, palette); return { ...group.ref, name: group.name, count: group.indexes.length }; }
function authorityList(options = {}) {
  const values = options.namedGroupAuthorities;
  if (!Array.isArray(values) || values.length > 256) throw new Error('Named index-group authority is unavailable or exceeds the bounded group limit.');
  return values;
}
function resolveNamedGroup(interaction, palette, options = {}) {
  const state = normalizeInteraction(interaction), ref = state.namedGroupRef;
  if (state.scope !== 'group' || !ref) throw new Error('Choose a reviewed named index group first.');
  if (!paletteIdentity(palette)) throw new Error('Named index-group resolution requires the exact current palette identity.');
  const groups = authorityList(options).map(value => namedGroupAuthority(value, palette));
  if (new Set(groups.map(group=>group.id)).size !== groups.length) throw new Error('Named index-group authority contains duplicate group identities.');
  const matches = groups.filter(group => group.id === ref.id);
  if (matches.length !== 1) throw new Error(matches.length ? 'Named index-group identity is ambiguous.' : 'The selected named index group is no longer available.');
  const group = matches[0];
  if (group.authorityHash !== ref.authorityHash || group.membershipHash !== ref.membershipHash) throw new Error('Named index-group authority or membership changed. Review the current group again.');
  return group;
}
function selectNamedGroup(interaction, groupRef, palette, options = {}) {
  const ref = namedGroupRef(groupRef); if (!ref) throw new Error('Choose a valid reviewed named index group.');
  const state = normalizeInteraction({ ...interaction, scope: 'group', namedGroupRef: ref }), group = resolveNamedGroup(state, palette, options);
  return normalizeInteraction({ ...state, namedGroupRef: group.ref, randomArmed: false, status: `Selected named group “${group.name}” · ${group.indexes.length} exact index${group.indexes.length === 1 ? '' : 'es'}.` });
}
function colorsOrNull(value) { try { return normalizeColors(value); } catch (_) { return null; } }
function colorOrNull(value) {
  if (!Array.isArray(value) || value.length < 3 || value.length > 4) return null;
  const color = value.length === 3 ? [...value, 255] : [...value];
  if (color.some(channel => !Number.isFinite(Number(channel)))) return null;
  return color.map(channel => Math.max(0, Math.min(255, Math.trunc(Number(channel)))));
}
function checkpoint(value) { const colors = colorsOrNull(value?.colors); if (!colors) return null; return { label: String(value.label || 'Palette edit').slice(0, 80), colors, colorsHash: digest(colors), createdAt: String(value.createdAt || '') }; }
function clipboard(value) {
  if (!value || value.version !== VERSION || !['color', 'colors', 'group', 'palette'].includes(value.scope)) return null;
  const colors = Array.isArray(value.colors) ? value.colors.map(colorOrNull).filter(Boolean) : [];
  if (!colors.length || colors.length > 256) return null;
  const indexes = uniqueIndexes(value.indexes);
  if (value.scope === 'color' && (colors.length !== 1 || indexes.length !== 1)) return null;
  if (value.scope === 'colors' && indexes.length !== colors.length) return null;
  if (value.scope === 'group' && indexes.length) return null;
  if (value.scope === 'palette' && colors.length !== 256) return null;
  const sourcePaletteIdentity = String(value.sourcePaletteIdentity || ''), sourceDomainIds = [...new Set((value.sourceDomainIds || []).map(String))].slice(0, 64), sourceNamedGroupRef = value.scope === 'group' ? namedGroupRef(value.sourceNamedGroupRef) : null;
  if (value.scope === 'group' && (!sourceNamedGroupRef || !sourcePaletteIdentity)) return null;
  const payloadHash = digest([value.scope, indexes, colors, sourcePaletteIdentity, sourceDomainIds, sourceNamedGroupRef]);
  if (value.payloadHash && value.payloadHash !== payloadHash) return null;
  return { version: VERSION, scope: value.scope, indexes, colors, sourcePaletteIdentity, sourceDomainIds, sourceNamedGroupRef, payloadHash };
}

function normalizeInteraction(value = {}) {
  const checkpoints = (value.checkpoints || []).map(checkpoint).filter(Boolean).slice(-MAX_CHECKPOINTS);
  const scope = SCOPES.has(value.scope) ? value.scope : 'index';
  // Older retained sessions stored `dim` because it was the implicit default.  There
  // is no way to distinguish that value from a deliberate choice, so require the
  // explicit marker before restoring it.  A healthy palette must open at full
  // brightness; focus is an inspection aid, never a default state.
  const focusExplicit = value.focusExplicit === true;
  const focusMode = focusExplicit && FOCUS_MODES.has(value.focusMode) ? value.focusMode : 'off';
  const precisionProfile = PRECISION_PROFILES[value.precisionProfile] ? value.precisionProfile : 'full';
  return {
    version: VERSION,
    activeIndex: integer(value.activeIndex),
    scope,
    namedGroupRef: namedGroupRef(value.namedGroupRef),
    selectedIndexes: [],
    lockedIndexes: uniqueIndexes(value.lockedIndexes == null ? [0] : value.lockedIndexes).slice(0, 256),
    focusMode,
    focusExplicit,
    preserveAlpha: value.preserveAlpha !== false,
    clipboard: clipboard(value.clipboard),
    checkpoints,
    randomArmed: Boolean(value.randomArmed),
    precisionProfile,
    candidateBaseline: null,
    status: String(value.status || '').slice(0, 240)
  };
}

function scopeIndexes(interaction, options = {}) {
  const state = normalizeInteraction(interaction);
  if (state.scope === 'palette') return Array.from({ length: 256 }, (_, index) => index);
  if (state.scope === 'group') return resolveNamedGroup(state, options.palette, options).indexes.slice();
  return [state.activeIndex];
}

function editableIndexes(interaction, options = {}) { const state=normalizeInteraction(interaction),locked = new Set(state.lockedIndexes); return scopeIndexes(state, options).filter(index => !locked.has(index) && (state.scope !== 'group' || index !== 0)); }
function requireEditableIndexes(interaction, options = {}) { const indexes = editableIndexes(interaction, options); if (!indexes.length) throw new Error('The current scope contains no unlocked palette indexes. Unlock an index or choose another scope.'); return indexes; }
function operationSummary(interaction, options, appliedIndexes) { const scoped=scopeIndexes(interaction,options),applied=new Set(appliedIndexes);return{scopeCount:scoped.length,appliedCount:applied.size,skippedLockedCount:scoped.filter(index=>!applied.has(index)).length}; }
function statusWithSummary(verb, summary) { return `${verb} ${summary.appliedCount} exact color${summary.appliedCount === 1 ? '' : 's'}; skipped ${summary.skippedLockedCount} locked/protected.`; }
function pushCheckpoint(interaction, colors, label, now = '') { const state = normalizeInteraction(interaction), record = checkpoint({ colors, label, createdAt: now }); return normalizeInteraction({ ...state, randomArmed: false, checkpoints: [...state.checkpoints, record].slice(-MAX_CHECKPOINTS) }); }

function copyScope(colors, interaction, palette, options = {}) {
  const source = normalizeColors(colors), state = normalizeInteraction(interaction), indexes = scopeIndexes(state, { ...options, palette }), copied = indexes.map(index => source[index].slice()), group = state.scope === 'group' ? resolveNamedGroup(state, palette, options) : null, scope = group ? 'group' : state.scope === 'palette' ? 'palette' : copied.length === 1 ? 'color' : 'colors';
  const payload = clipboard({ version: VERSION, scope, indexes: ['palette','group'].includes(scope) ? [] : indexes, colors: copied, sourcePaletteIdentity: paletteIdentity(palette), sourceDomainIds: options.domainIds || [], sourceNamedGroupRef: group?.ref || null });
  return normalizeInteraction({ ...state, clipboard: payload, randomArmed: false, status: `Copied ${copied.length} exact color${copied.length === 1 ? '' : 's'}.` });
}

function pasteScope(colors, interaction, palette, options = {}) {
  const source = normalizeColors(colors), state = normalizeInteraction(interaction), payload = clipboard(state.clipboard);
  if (!payload) throw new Error('Copy a compatible Palette Workshop color scope first.');
  const targetIdentity = paletteIdentity(palette);
  if (payload.sourcePaletteIdentity && payload.sourcePaletteIdentity !== targetIdentity && options.allowCrossPalette !== true) throw new Error('The copied colors belong to another exact palette. Review a cross-palette paste explicitly before applying it.');
  let targets = requireEditableIndexes(state, { ...options, palette }), incoming;
  if (payload.scope === 'group') {
    const group = resolveNamedGroup(state, palette, options);
    if (!payload.sourceNamedGroupRef || JSON.stringify(payload.sourceNamedGroupRef) !== JSON.stringify(group.ref)) throw new Error('The copied named group differs from the current exact group or its reviewed membership changed.');
    const sourcePalette = paletteFromIdentity(payload.sourcePaletteIdentity), sourceGroup = options.sourceNamedGroupAuthority ? namedGroupAuthority(options.sourceNamedGroupAuthority, sourcePalette) : null;
    if (sourceGroup && JSON.stringify(sourceGroup.ref) !== JSON.stringify(payload.sourceNamedGroupRef)) throw new Error('The copied named-group source authority changed.');
    const editable = new Set(targets); incoming = payload.colors.filter((_, offset) => editable.has(group.indexes[offset]));
  } else incoming = payload.scope === 'palette' ? payload.colors.filter((_, index) => !new Set(state.lockedIndexes).has(index)) : payload.colors;
  if (targets.length !== incoming.length) throw new Error(`The copied scope has ${incoming.length} color(s), but the current editable scope has ${targets.length}.`);
  const before = pushCheckpoint(state, source, 'Before paste', options.now), output = source.map(color => color.slice());
  targets.forEach((index, offset) => { const next = incoming[offset].slice(); if (before.preserveAlpha) next[3] = output[index][3]; output[index] = next; });
  const summary=operationSummary(state,{...options,palette},targets);
  return { colors: output, interaction: normalizeInteraction({ ...before, status: state.scope==='group'?statusWithSummary('Pasted',summary):`Pasted ${targets.length} exact color${targets.length === 1 ? '' : 's'} into the retained draft.` }), summary };
}

function restoreScope(colors, originalColors, interaction, options = {}) {
  const source = normalizeColors(colors), original = normalizeColors(originalColors), state = normalizeInteraction(interaction), targets = requireEditableIndexes(state, options), before = pushCheckpoint(state, source, 'Before restore', options.now), output = source.map(color => color.slice());
  for (const index of targets) output[index] = original[index].slice();
  const summary=operationSummary(state,options,targets);
  return { colors: output, interaction: normalizeInteraction({ ...before, status: state.scope==='group'?statusWithSummary('Restored',summary):`Restored ${targets.length} color${targets.length === 1 ? '' : 's'} from the exact embedded palette.` }), summary };
}
function resetScope(colors, originalColors, interaction, options = {}) { const result=restoreScope(colors,originalColors,interaction,options),state=normalizeInteraction(interaction);return{...result,interaction:normalizeInteraction({...result.interaction,status:state.scope==='group'?statusWithSummary('Reset',result.summary):result.interaction.status})}; }

function revertExactIndexes(colors, baselineColors, interaction, indexes, baseline = 'retained', options = {}) {
  const source = normalizeColors(colors), original = normalizeColors(baselineColors), state = normalizeInteraction(interaction), targets = uniqueIndexes(indexes);
  if (!targets.length) throw new Error('Choose at least one exact palette index to revert.');
  const locked=targets.filter(index=>state.lockedIndexes.includes(index));if(locked.length)throw new Error(`Palette index${locked.length===1?'':'es'} ${locked.join(', ')} ${locked.length===1?'is':'are'} locked. Unlock before reverting.`);
  if (!['retained', 'embedded'].includes(baseline)) throw new Error('Choose the retained-draft or embedded baseline before reverting.');
  const before = pushCheckpoint(state, source, `Before ${targets.length} index revert to ${baseline}`, options.now), output = source.map(color => color.slice());
  for(const index of targets)output[index]=original[index].slice();
  return { colors: output, interaction: normalizeInteraction({ ...before, activeIndex: targets[0], status: `Reverted ${targets.length} exact index${targets.length===1?'':'es'} to the ${baseline === 'embedded' ? 'embedded palette' : 'prior retained draft'}.` }), indexes:targets, baseline };
}
function revertExactIndex(colors, baselineColors, interaction, index, baseline = 'retained', options = {}) {const result=revertExactIndexes(colors,baselineColors,interaction,[index],baseline,options);return{...result,index:result.indexes[0]};}

function randomize(colors, interaction, randomByte, options = {}) {
  const source = normalizeColors(colors), state = normalizeInteraction(interaction);
  if (!state.randomArmed) return { colors: source, interaction: normalizeInteraction({ ...state, randomArmed: true, status: 'Randomize armed. Activate it again to replace the current editable scope; Undo will remain available.' }), armedOnly: true };
  if (typeof randomByte !== 'function') throw new Error('Random palette generation requires an injected bounded random source.');
  const targets = requireEditableIndexes(state, options), before = pushCheckpoint(state, source, 'Before randomize', options.now), output = source.map(color => color.slice());
  for (const index of targets) { for (let channel = 0; channel < 3; channel += 1) output[index][channel] = Math.max(0, Math.min(255, Math.trunc(Number(randomByte(index, channel))))); if (!before.preserveAlpha) output[index][3] = Math.max(0, Math.min(255, Math.trunc(Number(randomByte(index, 3))))); }
  const summary=operationSummary(state,options,targets);
  return { colors: output, interaction: normalizeInteraction({ ...before, randomArmed: false, status: state.scope==='group'?statusWithSummary('Randomized',summary):`Randomized ${targets.length} unlocked color${targets.length === 1 ? '' : 's'} in the retained draft.` }), armedOnly: false, summary };
}

function undo(colors, interaction) {
  normalizeColors(colors); const state = normalizeInteraction(interaction), record = state.checkpoints.at(-1);
  if (!record) throw new Error('There is no retained Palette Workshop edit to undo.');
  return { colors: normalizeColors(record.colors), interaction: normalizeInteraction({ ...state, checkpoints: state.checkpoints.slice(0, -1), randomArmed: false, status: `Undid: ${record.label}.` }) };
}

function quantizeChannel(value, bits) { if (bits >= 8) return value; const levels = (1 << bits) - 1; return Math.round(Math.round(value * levels / 255) * 255 / levels); }
function quantize(colors, profileId) { const source = normalizeColors(colors), profile = PRECISION_PROFILES[profileId] || PRECISION_PROFILES.full, result = source.map(color => color.map((value, channel) => quantizeChannel(value, profile.bits[channel]))), changedIndices = source.map((color, index) => color.some((value, channel) => value !== result[index][channel]) ? index : -1).filter(index => index >= 0); return { profile, colors: result, changedIndices, changedCount: changedIndices.length, sourceHash: digest(source), resultHash: digest(result) }; }
function focusPalette(colors, activeIndex, mode = 'off', options = {}) { const source = normalizeColors(colors), selected = integer(activeIndex), focus = FOCUS_MODES.has(mode) ? mode : 'off'; if (focus === 'off') return source; const focused=options.interaction?.scope==='group'?new Set(scopeIndexes(options.interaction,{...options,palette:options.palette})):new Set([selected]);return source.map((color, index) => focused.has(index) ? color.slice() : [Math.round(color[0] * 0.16), Math.round(color[1] * 0.16), Math.round(color[2] * 0.16), color[3]]); }

module.exports = { VERSION, MAX_CHECKPOINTS, PRECISION_PROFILES, normalizeInteraction, paletteIdentity, namedGroupRef, createNamedGroupAuthority, namedGroupAuthority, publicNamedGroup, resolveNamedGroup, selectNamedGroup, scopeIndexes, editableIndexes, requireEditableIndexes, pushCheckpoint, copyScope, pasteScope, restoreScope, resetScope, revertExactIndexes, revertExactIndex, randomize, undo, quantize, focusPalette, digest };
