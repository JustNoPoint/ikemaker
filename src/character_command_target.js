'use strict';
const path = require('path');
const { isCharacterDef, nearestCharacterDef } = require('./character_picker');
const { currentContext } = require('./authoring_context_registry');
const { resolveAssigned } = require('./related_work');

function commandCharacter(filename, preferredOwner = '') {
  if (filename && /\.def$/i.test(filename) && isCharacterDef(filename)) return path.resolve(filename);
  if (preferredOwner && isCharacterDef(preferredOwner) && filename) {
    const assigned = resolveAssigned(preferredOwner);
    if (Object.values(assigned).flat().some(file => typeof file === 'string' && file && path.resolve(file).toLowerCase() === path.resolve(filename).toLowerCase())) return preferredOwner;
  }
  const context = currentContext?.();
  if (context?.type === 'character') {
    const defs = (context.files || []).filter(file => /\.def$/i.test(file) && isCharacterDef(file));
    const owner = context.ownerDef || (defs.length === 1 ? defs[0] : '');
    if (owner && isCharacterDef(owner)) {
      if (!filename) return owner;
      const files = Object.values(resolveAssigned(owner)).flat().filter(value => typeof value === 'string');
      if (files.some(file => path.resolve(file).toLowerCase() === path.resolve(filename).toLowerCase())) return owner;
    }
  }
  if (!filename) return '';
  const defs = require('./viewer_navigation').associatedDefs(filename) || [];
  if (defs.length) return defs.length === 1 && !/^(?:template|sharedtemplate)$/i.test(path.basename(path.dirname(defs[0]))) ? defs[0] : '';
  const nearby = nearestCharacterDef(filename);
  if (!nearby || /^(?:template|sharedtemplate)$/i.test(path.basename(path.dirname(nearby)))) return '';
  // Proximity alone cannot attach an unassigned shared source to a template.
  const files = Object.values(resolveAssigned(nearby)).flat();
  return files.some(file => typeof file === 'string' && file && path.resolve(file).toLowerCase() === path.resolve(filename).toLowerCase()) ? nearby : '';
}

module.exports = { commandCharacter };
