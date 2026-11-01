'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const filename = path.join(__dirname, '..', 'src', 'sff_creator_workspace.js');
const source = fs.readFileSync(filename, 'utf8');
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'vscode') return {
    workspace: { workspaceFolders: [], getConfiguration: () => ({ get: (_key, fallback) => fallback }) },
    window: {}, Uri: { file: fsPath => ({ fsPath, toString: () => `file://${fsPath}` }) }, ViewColumn: { Active: 1 }
  };
  return originalLoad.call(this, request, parent, isMain);
};

try {
  delete require.cache[filename];
  const workspace = require(filename);
  const page = workspace.html({ draft: workspace.defaultDraft(), plan: { rows: [], ready: [], conflicts: [], skipped: [] }, applyState: { enabled: false, reason: '' } });

  assert.match(page, /<details id="savedColorRules" class="saved-rules">/, 'saved color rules must be one collapsed card, not a new toolbar or always-open flow');
  assert.doesNotMatch(page, /<details id="savedColorRules"[^>]*\sopen(?:\s|>)/, 'saved color rules must remain collapsed by default');
  for (const label of ['Saved color rules', 'Review', 'Accept all exact', 'Apply', 'Ignore this intake', 'Open in Palette Workshop']) assert(page.includes(label), `missing compact saved-rule action: ${label}`);
  assert.match(page, /id="savedRuleStatus"[^>]*role="status"[^>]*aria-live="polite"/, 'saved-rule updates need an accessible live announcement');
  assert.match(page, /@media\(max-width:720px\)[\s\S]*\.saved-rule-row\{grid-template-columns:minmax\(0,1fr\)\}/, 'saved-rule rows must collapse to one narrow column');
  assert.match(page, /\.saved-rule-actions button\{width:100%\}/, 'narrow per-row actions must remain full-width and keyboard reachable');
  assert(page.includes('Nothing is applied automatically.'), 'the card must explain its opt-in behavior');
  assert(page.includes('id="savedRuleStale"'), 'stale saved rules need a bounded, visible review area');
  assert.match(page, /<details id="nearestColorSuggestions" class="saved-rules">/, 'nearest-color suggestions must be a sibling collapsed review card');
  assert.doesNotMatch(page, /<details id="nearestColorSuggestions"[^>]*\sopen(?:\s|>)/, 'nearest-color suggestions must remain collapsed by default');
  for (const label of ['Nearest color suggestions', 'Review suggestions', 'Review &amp; Apply Selected']) assert(page.includes(label), `missing nearest-color review action: ${label}`);
  assert.match(page, /id="nearestColorStatus"[^>]*role="status"[^>]*aria-live="polite"/, 'nearest-color updates need an accessible live announcement');
  assert(page.includes('never apply automatically'), 'nearest-color review must explain its opt-in behavior');

  const script = page.match(/<script>([\s\S]*)<\/script>/)?.[1];
  assert(script, 'Creator page must retain one parseable client script');
  new Function(script.replace('acquireVsCodeApi()', '({postMessage(){}})'));
  assert(script.includes("reviewId:savedRuleReview.reviewId,actionId:action.actionId"), 'accept and ignore must send only opaque review/action authority');
  assert(script.includes("reviewId:savedRuleReview.reviewId,actionId:row.workshopActionId"), 'Palette Workshop handoff must use only opaque, single-use review/action authority');
  assert(script.includes("stale.slice(0,limit)") && script.includes("limit=8") && script.includes("staleTotalCount") && script.includes("Manage in Palette Workshop"), 'stale rules must show a bounded reason list, exact omitted count, and canonical management route');
  assert(script.includes("source.setAttribute('role','img')") && script.includes("destination.setAttribute('role','img')"), 'color swatches must expose their image role and accessible labels');
  assert(script.includes("include.type='checkbox'") && script.includes("radio.type='radio'") && script.includes("swatch.setAttribute('role','img')"), 'nearest-color rows need explicit checkbox/radio controls and accessible swatches');
  assert(script.includes("reviewId:nearestColorReview.reviewId,actionId:nearestColorReview.actionId,selections"), 'nearest-color acceptance must send only opaque review/action/row/candidate authorities');
  assert(script.includes("Number(color[3])/255"), 'partial-alpha nearest-color swatches must convert byte alpha to truthful CSS alpha');
  assert(!/postMessage\([^\n]*issueId/.test(script), 'the webview must never choose an unmatched issue identity directly');

  for (const marker of [
    "new ReplacementRuleReviewAuthority()",
    'replacementRuleBinding(root, staged.draft, creatorGeneration, draftRevision)',
    'targetIdentity: path.resolve(safe.target.path)',
    'decodedPixelHash: source.decodedPixelHash',
    "ruleAuthority.accept({ reviewId: String(message.reviewId || ''), actionId: String(message.actionId || '') }",
    'ruleAuthority.workshopHandoff({ reviewId: workshopReviewId, actionId: workshopActionId',
    "executeCommand('ikemen.palette.openWorkspace'",
    "kind: 'sff-unmatched-color'",
    'request?.unmatchedResolution',
    'active.resolveWorkshopReturn(request.unmatchedResolution)',
    'ruleAuthority.workshopReturn(unmatchedResolution, replacementRuleBinding(root, current, creatorGeneration, draftRevision))',
    'ruleAuthority.revoke(); paletteAdaptationAuthority.revoke(); if (sessions.get(key) === panel)'
  ]) assert(source.includes(marker), `missing host-owned saved-rule boundary: ${marker}`);
  assert(source.includes('replacementRuleAcceptances = [...(current.replacementRuleAcceptances || []), acceptance]'), 'only the sealed host acceptance may update the retained resolution draft');
  assert(source.includes('workshopReturns = [...(current.workshopReturns || []), sealed]'), 'only the sealed host Workshop return may update the retained resolution draft');
  assert(source.includes('revalidateWorkshopReturn(workshopReturn, binding)') && source.includes('applyWorkshopReturnToDecisions(checked, binding, resolved)'), 'reopened Workshop decisions must revalidate against fresh evidence before use');
  assert(source.includes("workshopRow.workshopActionId = ''"), 'the host must visibly retire each single-use Palette Workshop action after authority accepts it');
  assert(source.includes('freshBindingHash !== workshopBindingHash') && source.indexOf('freshBindingHash !== workshopBindingHash') < source.indexOf("executeCommand('ikemen.palette.openWorkspace', vscode.Uri.file(current.target.path), { kind: 'sff-unmatched-color'"), 'the host must recheck exact live evidence immediately before opening Palette Workshop');
  assert(source.includes('revalidateRetainedReplacementRuleAcceptance(root, safe)'), 'staged and packaged drafts must revalidate persisted authority evidence');
  assert(source.includes('new PaletteAdaptationReviewAuthority()') && source.includes('paletteAdaptationAuthority.accept('), 'nearest-color choices need their own host-owned, single-use authority');
  assert(source.includes('paletteAdaptationAcceptances = [...(current.paletteAdaptationAcceptances || []), acceptance]'), 'only a sealed nearest-color acceptance may update the retained resolution draft');
  assert(source.includes('adaptationPayloadBytes > 8 * 1024 * 1024') && source.includes('adaptationOccurrenceCount > unmatchedColors.MAX_UNMATCHED_OCCURRENCES'), 'retained nearest-color decisions need aggregate byte and occurrence limits before verification');

  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-sff-rule-bounds-')), bounded = path.join(temporary, 'source.bin');
  fs.writeFileSync(bounded, Buffer.from('1234'));
  assert.throws(() => workspace.readStableBoundedFile(bounded, 3, 'Bounded source'), /no larger than 3 bytes/, 'pre-read stat rejects oversized files');
  const readFileSync = fs.readFileSync;
  fs.readFileSync = function(filename, ...args) { const bytes = readFileSync.call(fs, filename, ...args); if (path.resolve(filename) === path.resolve(bounded)) fs.appendFileSync(bounded, '5'); return bytes; };
  try { assert.throws(() => workspace.readStableBoundedFile(bounded, 8, 'Growing source'), /changed while it was being reviewed/, 'post-read stat rejects growth during read'); }
  finally { fs.readFileSync = readFileSync; fs.rmSync(temporary, { recursive: true, force: true }); }

  console.log('SFF Creator saved replacement-rule card, narrow accessibility, opaque authority, exact handoff, retention and invalidation tests passed');
} finally {
  Module._load = originalLoad;
}
