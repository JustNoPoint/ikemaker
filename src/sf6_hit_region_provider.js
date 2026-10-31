'use strict';

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function regionName(value) { return value === 1 ? 'Forced High' : value === 2 ? 'Forced Low' : value === 3 ? 'Default reaction' : ''; }
function immunityName(value) {
  const names = [];
  if (Math.floor(value / 1) % 2) names.push('airborne');
  if (Math.floor(value / 2) % 2) names.push('low');
  if (Math.floor(value / 4) % 2) names.push('helper projectile');
  if (Math.floor(value / 8) % 2) names.push('bypass');
  return `Immunity ${value}${names.length ? ` (${names.join(', ')})` : ''}`;
}

const SF6_HIT_REGION_PROVIDER = freeze({
  id: 'jnp-sf6-hit-regions',
  version: 1,
  groups: ['clsn2'],
  configurations: [
    { symbol: 'JNP_SF6_cfg_hit_region_high_clsn2_index', name: 'Configured High', value: 1 },
    { symbol: 'JNP_SF6_cfg_hit_region_low_clsn2_index', name: 'Configured Low', value: 2 }
  ],
  assignments: [
    { name: 'JNP_SF6_SetHitReactionRegion', kind: 'sf6-region-assignment', semantic: regionName, category: 'region' },
    { name: 'JNP_SF6_SetRegionImmunity', kind: 'sf6-immunity-assignment', semantic: immunityName, category: 'immunity' }
  ],
  managedRegionBegin: /#\s*IKEMEN ZSS Tools:\s*Hit Reaction Regions State\s+(\d+)\s+BEGIN/i,
  managedRegionEnd: /^\s*#\s*IKEMEN ZSS Tools:\s*Hit Reaction Regions State\s+\d+\s+END/i
});

module.exports = { SF6_HIT_REGION_PROVIDER, regionName, immunityName };
