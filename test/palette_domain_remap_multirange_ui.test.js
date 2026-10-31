'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { sourceHtml } = require('../src/palette_workspace_view');

const source = fs.readFileSync(path.join(__dirname, '../src/palette_workspace_view.js'), 'utf8');
const html = sourceHtml({
  session: {
    context: { kind: 'existing-sff', section: 'index-migration' },
    target: { filename: 'Ryu.sff' },
    sources: [],
    selection: {
      sprite: { physicalIndex: 0, group: 0, number: 0 },
      palette: { physicalIndex: 0, group: 1, number: 1 },
    },
    facts: { preview: 'none', staged: 'none', embedded: 'saved', builtOutput: 'none', adoption: 'none' },
    stale: false,
    staleReasons: [],
    organizer: { semanticEntries: [] },
  },
  palettes: [{ physicalIndex: 0, group: 1, number: 1, colors: [[0, 0, 0, 0]] }],
});

const inline = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert(inline, 'Palette Workspace emits its client script');
assert.doesNotThrow(() => new vm.Script(inline, { filename: 'palette-remap-multirange-inline.js' }));

for (const marker of [
  'Named RemapPal ranges',
  'Add named group…',
  'Named group',
  'Description',
  'Enabled for reviewed palette-family tools',
  'Ordered palette ranges',
  'Linked master domains',
  'Affected sprite bindings:',
  'Review Changes',
  'Apply Reviewed Metadata',
]) assert(html.includes(marker), `missing reviewed multi-range control: ${marker}`);

for (const marker of [
  'Source group',
  'First number',
  'Last number',
  'Destination group',
  'Add range',
  'Move range ',
  'Remove range ',
]) assert(html.includes(marker), `missing accessible retained-range control: ${marker}`);

assert.match(html, /rangeMappings:\[\.\.\.form\.querySelectorAll\('\[data-remap-row\]'\)\]\.map/,
  'review payload is rebuilt from every ordered retained row');
assert.match(html, /domainRemapDraft\.rangeMappings\.splice\(at,0,item\)/,
  'move controls preserve and reorder the complete range array');
assert.match(html, /domainRemapDraft\.rangeMappings\.splice\(index,1\)/,
  'remove acts on the selected retained row');
assert.match(html, /id:domainRemapDraft\.id\|\|undefined/,
  'new named groups leave identity blank so the host issues it');

for (const action of ['domainRemapReview', 'domainRemapApply', 'domainRemapRevoke']) {
  assert(html.includes(`post('${action}'`), `${action} must use the dedicated reviewed host route`);
}
for (const event of ['paletteDomainRemapReview', 'paletteDomainRemapCommittedStale']) {
  assert(html.includes(event), `${event} must have an explicit client event handler`);
}
assert.doesNotMatch(source, /post\('domainMetadata',[^\n]*putRemapPalGroup/,
  'the retired single-range direct-save client route must not remain reachable');

for (const label of ['Ranges', 'Expanded pairs', 'Resolved', 'Missing', 'Ambiguous']) {
  assert(html.includes(`<dt>${label}</dt>`), `review must expose ${label.toLowerCase()} count`);
}
for (const marker of ['Overlap and conflict diagnostics', 'Missing coordinates · ', 'Exact delete cascade · ']) {
  assert(html.includes(marker), `review must expose ${marker}`);
}
assert.match(html, /item\.role\|\|'palette'\)[^\n]+coordinate\.group\+'[,]'\+coordinate\.number/,
  'unresolved coordinates are formatted as useful palette coordinates rather than object strings');
assert.match(html, /domainRemapApplying=false[^\n]+paletteDomainRemapReview/,
  'a host review response clears the applying state, including blocked apply failures');

assert.match(html, /@media\(max-width:520px\)\{\.remap-heading\{display:grid;grid-template-columns:1fr\}/,
  'the RemapPal editor collapses to one column in narrow browser docks');
assert.match(html, /\.remap-range-row\{grid-template-columns:1fr\}/,
  'each retained range collapses without horizontal page scrolling');
assert.match(html, /\.remap-workspace,\.remap-workspace \*\{box-sizing:border-box\}/,
  'nested native controls remain within dock width');
assert.match(html, /\.remap-workspace li,\.remap-workspace p\{overflow-wrap:anywhere\}/,
  'diagnostics and cascade references wrap in narrow docks');

assert(html.includes("modify:{tier:'advanced'"), 'RemapPal authoring remains Advanced only');
assert(html.includes("label:'3 Arrange & Remap'"), 'the editor remains on the approved Arrange & Remap step');
assert(html.includes("sections:['topology-layout','domains-matrix','index-migration']"),
  'Arrange & Remap retains all related tools without changing Standard workflows');
assert.match(html, /the SFF is never written here/i,
  'the editor truthfully identifies metadata-only review');

console.log('Palette Workshop reviewed multi-range RemapPal UI contract tests passed');
