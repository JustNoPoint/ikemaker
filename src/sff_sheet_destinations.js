'use strict';

function pageDestinations(identity, pageCount) {
  if (!Number.isSafeInteger(pageCount) || pageCount < 1 || pageCount > 4096 ||
      !identity || !Number.isSafeInteger(identity.group) || identity.group < 0 || identity.group > 65535 ||
      !Number.isSafeInteger(identity.index) || identity.index < 0 || identity.index + pageCount - 1 > 65535) {
    throw new Error('A reviewed sheet group/index range exceeds the 0–65535 destination limit.');
  }
  return Array.from({ length: pageCount }, (_, pageOrdinal) => ({ group: identity.group, index: identity.index + pageOrdinal }));
}

function assertDistinctCutDestinations(cuts, pageCount, written = {}) {
  const occupied = new Map();
  for (const cut of cuts) {
    const positions = [
      ...(cut.identity ? pageDestinations(cut.identity, pageCount) : []),
      ...(Array.isArray(written[cut.id]) ? written[cut.id] : [])
    ];
    for (const position of positions) {
      const [{group,index}] = pageDestinations(position, 1);
      const key = group + ',' + index;
      if (occupied.has(key) && occupied.get(key) !== cut.id) throw new Error('Approved sheet cuts contain conflicting sprite identities: more than one cut uses ' + key + '.');
      occupied.set(key, cut.id);
    }
  }
}

module.exports = { pageDestinations, assertDistinctCutDestinations };
