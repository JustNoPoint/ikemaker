'use strict';

function whole(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0 || number > 65535) throw new Error(`${label} must be a whole number from 0 through 65535.`);
  return number;
}

function analyzeGroupRename(entries, fromGroup, toGroup) {
  const from = whole(fromGroup, 'Source group'), to = whole(toGroup, 'Destination group');
  if (from === to) return Object.freeze({ from, to, affected: Object.freeze([]), destination: Object.freeze([]), collisions: Object.freeze([]) });
  const normalized = (entries || []).map((entry, physicalIndex) => Object.freeze({ physicalIndex: Number.isSafeInteger(Number(entry.physicalIndex)) ? Number(entry.physicalIndex) : physicalIndex, group: whole(entry.group, `Entry ${physicalIndex} group`), number: whole(entry.number, `Entry ${physicalIndex} index`) }));
  const affected = normalized.filter(entry => entry.group === from), destination = normalized.filter(entry => entry.group === to), sourceByNumber = new Map(), destinationByNumber = new Map();
  for (const entry of affected) { if (!sourceByNumber.has(entry.number)) sourceByNumber.set(entry.number, []); sourceByNumber.get(entry.number).push(entry.physicalIndex); }
  for (const entry of destination) { if (!destinationByNumber.has(entry.number)) destinationByNumber.set(entry.number, []); destinationByNumber.get(entry.number).push(entry.physicalIndex); }
  const collisions = [...sourceByNumber.keys()].filter(number => destinationByNumber.has(number)).sort((a, b) => a - b).map(number => Object.freeze({ number, sourcePhysicalIndices: Object.freeze(sourceByNumber.get(number)), destinationPhysicalIndices: Object.freeze(destinationByNumber.get(number)) }));
  return Object.freeze({ from, to, affected: Object.freeze(affected), destination: Object.freeze(destination), collisions: Object.freeze(collisions) });
}

module.exports = { analyzeGroupRename };
