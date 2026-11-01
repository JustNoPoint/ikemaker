'use strict';

const crypto = require('crypto');
const ACTIONS = new Set(['resolve-to-index', 'replace', 'add-color', 'workshop', 'cancel']);
function stable(value) { if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`; if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`; return JSON.stringify(value); }
function sha(value) { return crypto.createHash('sha256').update(stable(value)).digest('hex'); }
function rgbaKey(value) { return Array.isArray(value) ? value.map(Number).join(',') : '';
}
function create(input = {}) {
  const occurrences = [];
  for (const conflict of input.conflicts || []) {
    const pixels = [...(conflict.pixels || [])].sort((a, b) => String(a.imageId || '').localeCompare(String(b.imageId || '')) || Number(a.y) - Number(b.y) || Number(a.x) - Number(b.x));
    for (const pixel of pixels) occurrences.push({ imageId: String(pixel.imageId || input.imageId || 'image:0'), imageLabel: String(pixel.imageLabel || input.imageLabel || 'Affected image'), x: Number(pixel.x), y: Number(pixel.y), rgba: conflict.rgba || null, hex: conflict.rgba ? `#${conflict.rgba.map(value => Number(value).toString(16).padStart(2, '0')).join('')}` : '', code: conflict.code, message: conflict.message });
  }
  occurrences.sort((a, b) => a.imageId.localeCompare(b.imageId) || a.y - b.y || a.x - b.x || String(a.code).localeCompare(String(b.code)));
  const imageIds = [...new Set(occurrences.map(item => item.imageId))], colors = new Set((input.conflicts || []).map(item => rgbaKey(item.rgba)).filter(Boolean)), body = { schema: 'ikemaker.palette-sync-conflict-review', version: 1, sourceHash: String(input.sourceHash || ''), reducedMotion: Boolean(input.reducedMotion), blinkEnabled: !input.reducedMotion, staticOutline: true, hatchFallback: true, checkerboard: true, axis: true, zoom: 1, occurrenceIndex: 0, occurrences, summary: { affectedImages: imageIds.length, affectedPixels: occurrences.length, affectedColors: colors.size }, resolutions: {}, cancelled: false, workshopHandoff: null };
  return { ...body, stateHash: sha(body) };
}
function verify(state) { const body = { ...state }; delete body.stateHash; if (state.schema !== 'ikemaker.palette-sync-conflict-review' || state.version !== 1 || state.stateHash !== sha(body)) throw new Error('Palette conflict review state changed outside its owner.'); return state; }
function update(state, command = {}) { verify(state); const next = JSON.parse(JSON.stringify(state)); delete next.stateHash; const kind = String(command.kind || '');
  if (kind === 'toggle-blink') next.blinkEnabled = command.enabled == null ? !next.blinkEnabled : Boolean(command.enabled);
  else if (kind === 'next') next.occurrenceIndex = next.occurrences.length ? (next.occurrenceIndex + 1) % next.occurrences.length : 0;
  else if (kind === 'previous') next.occurrenceIndex = next.occurrences.length ? (next.occurrenceIndex + next.occurrences.length - 1) % next.occurrences.length : 0;
  else if (kind === 'zoom') next.zoom = Math.max(0.25, Math.min(16, Number(command.value) || 1));
  else if (kind === 'resolve') { const action = String(command.action || ''); if (!ACTIONS.has(action)) throw new Error('Choose an explicit conflict action.'); if (action === 'cancel') next.cancelled = true; else if (action === 'workshop') next.workshopHandoff = { occurrenceIndex: next.occurrenceIndex, sourceHash: next.sourceHash }; else { const current = next.occurrences[next.occurrenceIndex]; if (!current) throw new Error('No conflict occurrence is selected.'); if (action === 'resolve-to-index' && (!Number.isInteger(Number(command.index)) || Number(command.index) < 0 || Number(command.index) > 255)) throw new Error('Resolve to an exact palette index from 0 through 255.'); if (['replace', 'add-color'].includes(action) && (!Array.isArray(command.rgba) || command.rgba.length !== 4)) throw new Error('Choose an exact RGBA color.'); if(action==='add-color'&&(!Number.isInteger(Number(command.index))||Number(command.index)<0||Number(command.index)>255))throw new Error('Adding a color requires an explicitly chosen free index from 0 through 255.'); next.resolutions[`${current.imageId}:${current.x},${current.y}:${current.code}`] = { action, ...(action === 'resolve-to-index' ? { index: Number(command.index) } : { rgba: command.rgba.map(Number),...(action==='add-color'?{index:Number(command.index),freeIndexConfirmed:Boolean(command.freeIndexConfirmed)}:{}) }) }; } }
  else throw new Error('Unsupported conflict review action.');
  next.stateHash = sha(next); return next;
}
function current(state) { verify(state); return state.occurrences[state.occurrenceIndex] || null; }
function fromUnmatchedColors(input={}) { const conflicts=(input.issues||[]).map(issue=>({code:'SFF_UNMATCHED_COLOR',rgba:(issue.rgba||issue.sourceColor||[]).map(Number),message:String(issue.message||'Source color is absent from the reviewed master palette.'),pixels:(issue.occurrences||issue.pixels||[]).map(pixel=>({imageId:String(pixel.imageId||pixel.filename||''),imageLabel:String(pixel.imageLabel||pixel.filename||'Affected sprite'),x:Number(pixel.x),y:Number(pixel.y)}))}));return create({conflicts,sourceHash:input.sourceHash,reducedMotion:input.reducedMotion}); }

module.exports = { ACTIONS, create, fromUnmatchedColors, verify, update, current };
