'use strict';

const path = require('path');

function sourceState(document, label = '') {
  if (!document) return { available: false, dirty: false, label, filename: '', text: 'Source unavailable' };
  const filename = document.fileName || document.uri?.fsPath || '';
  const name = label || path.basename(filename) || 'Source';
  return {
    available: true,
    dirty: Boolean(document.isDirty),
    label: name,
    filename,
    text: document.isDirty ? `${name} has unsaved document changes.` : `${name} is saved to disk.`
  };
}

async function saveSourceDocument(document, label = '') {
  const before = sourceState(document, label);
  if (!document) return { ...before, ok: false, message: `${label || 'Source'} is unavailable and was not saved.` };
  if (!document.isDirty) return { ...before, ok: true, message: `${before.label} already matches the disk file.` };
  let accepted = false;
  try { accepted = await document.save(); }
  catch (error) { return { ...sourceState(document, label), ok: false, message: `${before.label} could not be saved: ${error.message}` }; }
  const after = sourceState(document, label);
  if (!accepted) return { ...after, ok: false, message: `${before.label} was not saved to disk.` };
  if (after.dirty) return { ...after, ok: false, message: `${before.label} was saved, but newer document changes remain unsaved.` };
  return { ...after, ok: true, message: `${before.label} saved to disk. Reload IKEMEN separately if it already loaded the older file.` };
}

module.exports = { sourceState, saveSourceDocument };
