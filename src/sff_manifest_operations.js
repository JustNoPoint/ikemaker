'use strict';

function coordinate(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0 || number > 65535) throw new Error(`${label} must be a whole number from 0 through 65535.`);
  return number;
}

function planSequentialAddition(existingIdentities, groupValue, startValue, countValue) {
  const group = coordinate(groupValue, 'Group'), start = coordinate(startValue, 'Starting index'), count = Number(countValue);
  if (!Number.isSafeInteger(count) || count < 1) throw new Error('Sprite batch must contain at least one source.');
  const end = start + count - 1;
  if (end > 65535) throw new Error(`The ${count}-sprite batch would end at index ${end}, beyond the SFF limit of 65535.`);
  const occupied = new Set((existingIdentities || []).map(String)), identities = Array.from({ length: count }, (_unused, offset) => `${group},${start + offset}`), collisions = identities.filter(identity => occupied.has(identity));
  return Object.freeze({ group, start, end, count, identities: Object.freeze(identities), collisions: Object.freeze(collisions) });
}

function requireUnusedIdentity(existingIdentities, groupValue, numberValue) {
  const group = coordinate(groupValue, 'Group'), number = coordinate(numberValue, 'Index'), identity = `${group},${number}`;
  if (new Set((existingIdentities || []).map(String)).has(identity)) throw new Error(`Manifest already contains sprite ${identity}. Choose an unused destination; no repeated identity was staged.`);
  return Object.freeze({ group, number, identity });
}

function parseIdentity(value, label) {
  const match = /^(\d+)\s*,\s*(\d+)$/.exec(String(value || ''));
  if (!match) throw new Error(`${label} must use group,index.`);
  const group = coordinate(match[1], `${label} group`), number = coordinate(match[2], `${label} index`);
  return `${group},${number}`;
}

function planIdentityInsertion(existingIdentities, incomingIdentities) {
  if (!Array.isArray(incomingIdentities) || !incomingIdentities.length) throw new Error('Sprite import must contain at least one identity.');
  const existing = new Set((existingIdentities || []).map((value, index) => parseIdentity(value, `Existing identity ${index + 1}`)));
  const seen = new Set(), identities = [], duplicates = [], collisions = [];
  for (const [index, value] of incomingIdentities.entries()) {
    const identity = parseIdentity(value, `Incoming identity ${index + 1}`);
    identities.push(identity);
    if (seen.has(identity) && !duplicates.includes(identity)) duplicates.push(identity);
    seen.add(identity);
    if (existing.has(identity) && !collisions.includes(identity)) collisions.push(identity);
  }
  return Object.freeze({
    identities: Object.freeze(identities),
    duplicates: Object.freeze(duplicates),
    collisions: Object.freeze(collisions)
  });
}

module.exports = { planSequentialAddition, requireUnusedIdentity, planIdentityInsertion };
