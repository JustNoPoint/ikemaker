'use strict';

// Guided QA report model: scenario guidance, honest evidence kinds and a
// completeness review shared by the report form and the Report Intake cards.
// Pure module (no vscode, no filesystem writes). Evidence is never uploaded,
// copied or fetched; it only records what the reporter referenced.

const path = require('path');

const LIMITS = Object.freeze({ evidence: 32, ref: 1024, label: 200, note: 2000, collector: 128 });
const FREQUENCIES = Object.freeze(['Unknown', 'Always', 'Often', 'Sometimes', 'Once']);
const EVIDENCE_KINDS = Object.freeze(['local-reference', 'link', 'note', 'collected']);
const EVIDENCE_LABELS = Object.freeze({
  'local-reference': 'Local file reference (not copied or uploaded; reviewers need access to the same file)',
  link: 'Link (not fetched or verified by IKEMaker)',
  note: 'Written note',
  collected: 'Collected by a tool (hash recorded at collection)',
  legacy: 'Earlier attachment reference (kind not recorded)'
});

const SCENARIOS = Object.freeze([
  scenario('move', 'A move or state behaves wrongly', 'Name the move or command, the state number if you know it, the opponent, stage and distance. Say whether it happens every time.',
    ['Start a match with: (character, opponent, stage)', 'Position: (distance, facing, corner or midscreen)', 'Input: (command or button sequence)', 'Watch: (what to look at)'],
    'What the move should do (damage, recovery, cancel, guard behaviour…).', 'What it did instead, as precisely as you can see it.',
    ['Recording or screenshot of the moment', 'Debug-mode screenshot showing state and animation numbers']),
  scenario('collision', 'Hit, hurt or push box problem', 'Give the action and frame if known, which box family looked wrong (hit, hurt, push/size) and in which pose. A box shown in an IKEMaker preview is an authoring aid, not proof of what the game used at runtime; say whether you saw it in game or in a preview.',
    ['Open or play: (character and move)', 'Pause or step to: (action / frame, or the visible moment)', 'Compare against: (opponent or reference box)'],
    'Which contact or spacing you expected.', 'What actually touched, whiffed or pushed.',
    ['In-game Clsn display screenshot (Ctrl+C debug view)', 'IKEMaker AIR viewer screenshot of the same frame']),
  scenario('visual', 'Sprite, animation or palette looks wrong', 'Name the action, frame and palette. Say whether it shows in game, in an IKEMaker viewer, or both.',
    ['Open or play: (character, palette)', 'Reach: (action or move)', 'Look at: (frame or body part)'],
    'How it should look (reference image or description).', 'How it looks instead.',
    ['Screenshot', 'Reference art or palette file reference']),
  scenario('sound', 'Sound or voice problem', 'Name the move or event, the sound group and number if known, and whether it is missing, wrong, cut off or too loud.',
    ['Play: (character and move)', 'Listen at: (moment)'],
    'Which sound should play.', 'What played instead (nothing, wrong clip, cut off…).',
    ['Recording with audio', 'SND file reference']),
  scenario('crash', 'Crash, freeze or error message', 'Copy the exact error text. Say what you did just before it and whether it repeats. Logs are referenced here, not attached or uploaded.',
    ['Start from: (menu, mode, characters)', 'Do: (last actions before the problem)', 'Result: (crash, freeze, error box)'],
    'The game or tool should keep running.', 'Exact error text, or what froze.',
    ['Log file reference (for example save/logs)', 'Screenshot of the error']),
  scenario('tool', 'IKEMaker tool or viewer problem', 'Name the IKEMaker screen, the file you had open and the button or command you used.',
    ['Open: (IKEMaker screen and file)', 'Do: (button, command or edit)', 'See: (result)'],
    'What the tool should have done.', 'What it did instead, including any message text.',
    ['Screenshot of the screen', 'The file you were editing (reference)']),
  scenario('feedback', 'Suggestion or new use case', 'Describe the goal you were trying to reach and why the current behaviour gets in the way.',
    ['Goal: (what you wanted to make or check)', 'Current way: (steps you take today)'],
    'What would help.', 'What happens today (optional).',
    ['Mockup or sketch', 'Example from another tool or game']),
  scenario('other', 'Something else', 'Describe what happened, what you expected and how someone else can see it too.', [], '', '', [])
]);

function scenario(id, label, guidance, steps, expectedHint, actualHint, evidenceHints) {
  return Object.freeze({ id, label, guidance, stepsTemplate: steps.map((step, index) => `${index + 1}. ${step}`).join('\n'), expectedHint, actualHint, evidenceHints: Object.freeze([...evidenceHints]), recommendSteps: id !== 'feedback' && id !== 'other', recommendResults: id !== 'feedback' });
}
function clean(value, maximum = 100000) { return String(value == null ? '' : value).replace(/\r\n?/g, '\n').trim().slice(0, maximum); }
function oneLine(value, maximum) { return clean(value, maximum).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim(); }
function scenarioFor(id) { return SCENARIOS.find((item) => item.id === id) || null; }
function scenarioId(id) { return scenarioFor(id) ? id : ''; }
function frequency(value) { return FREQUENCIES.includes(value) ? value : 'Unknown'; }

function isLink(text) { return /^(?:https?|ftp):\/\/\S+$/i.test(text); }
function looksLikePath(text) { return /^(?:[A-Za-z]:[\\/]|\\\\|\/|\.{1,2}[\\/]|~[\\/])/.test(text) || (/[\\/]/.test(text) && !/\s{2,}/.test(text)) || /^[^\s\\/]+\.[A-Za-z0-9]{1,8}$/.test(text); }

// Classify one reporter-entered evidence line. options.root relativizes paths
// inside the game; options.exists(absolutePath) records whether the file was
// present on the reporter's machine at submission (never read or copied).
function classifyEvidenceLine(line, options = {}) {
  const text = oneLine(line, LIMITS.ref);
  if (!text) return null;
  if (isLink(text)) return { kind: 'link', ref: text };
  if (!looksLikePath(text)) return { kind: 'note', ref: clean(line, LIMITS.note) };
  const unquoted = text.replace(/^["']|["']$/g, '');
  const root = options.root ? path.resolve(options.root) : '';
  const absolute = root ? path.resolve(root, unquoted) : (path.isAbsolute(unquoted) ? path.resolve(unquoted) : '');
  let ref = unquoted.replace(/\\/g, '/'), scope = 'unknown';
  if (root && absolute) {
    const relative = path.relative(root, absolute);
    if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) { ref = relative.replace(/\\/g, '/'); scope = 'project'; }
    else scope = 'outside-project';
  }
  const entry = { kind: 'local-reference', ref, scope };
  if (absolute && typeof options.exists === 'function') { try { entry.existedAtSubmit = Boolean(options.exists(absolute)); } catch (_) { entry.existedAtSubmit = false; } }
  return entry;
}

function evidenceFromText(text, options = {}) {
  return String(text || '').split(/\r?\n/).filter((line) => !NOT_APPLICABLE_TEXT.test(line.trim())).map((line) => classifyEvidenceLine(line, options)).filter(Boolean).slice(0, LIMITS.evidence);
}

// Normalize stored evidence. Unknown kinds are dropped; "collected" entries are
// accepted only with full collector provenance, so nothing typed by a reporter
// can masquerade as tool-collected debug data.
function normalizeEvidence(list) {
  if (!Array.isArray(list)) return [];
  const output = [];
  for (const item of list) {
    if (!item || typeof item !== 'object' || !EVIDENCE_KINDS.includes(item.kind)) continue;
    const ref = item.kind === 'note' ? clean(item.ref, LIMITS.note) : oneLine(item.ref, LIMITS.ref);
    if (!ref) continue;
    const entry = { kind: item.kind, ref };
    if (item.label) entry.label = oneLine(item.label, LIMITS.label);
    if (item.kind === 'local-reference') {
      entry.scope = ['project', 'outside-project', 'unknown'].includes(item.scope) ? item.scope : 'unknown';
      if (typeof item.existedAtSubmit === 'boolean') entry.existedAtSubmit = item.existedAtSubmit;
    }
    if (item.kind === 'collected') {
      const collector = oneLine(item.collector, LIMITS.collector), sha256 = String(item.sha256 || '').toLowerCase(), bytes = Number(item.bytes), collectedAt = oneLine(item.collectedAt, 64);
      if (!collector || !/^[a-f0-9]{64}$/.test(sha256) || !Number.isSafeInteger(bytes) || bytes < 0 || !collectedAt || Number.isNaN(Date.parse(collectedAt))) continue;
      Object.assign(entry, { collector, sha256, bytes, collectedAt });
    }
    output.push(entry);
    if (output.length >= LIMITS.evidence) break;
  }
  return output;
}

// Records from before evidence kinds existed only have attachment strings.
function evidenceView(record = {}) {
  const evidence = normalizeEvidence(record.evidence);
  if (evidence.length) return evidence;
  return (Array.isArray(record.attachments) ? record.attachments : []).map((ref) => oneLine(ref, LIMITS.ref)).filter(Boolean).slice(0, LIMITS.evidence).map((ref) => ({ kind: 'legacy', ref }));
}
function attachmentsFromEvidence(evidence) { return normalizeEvidence(evidence).filter((item) => item.kind !== 'note').map((item) => item.ref); }

function stepsWereEdited(steps, template) {
  const value = clean(steps);
  if (!value) return false;
  if (!template) return true;
  // A template line still containing its "(placeholder)" text counts as unedited.
  const lines = value.split('\n').map((line) => line.trim()).filter(Boolean), templateLines = new Set(template.split('\n').map((line) => line.trim()));
  return lines.some((line) => !templateLines.has(line));
}

// Every guided question accepts an intentional "not applicable" answer, either
// by the N/A button (saved in notApplicable) or by typing N/A, NA, n.a. or
// "not applicable" (trimmed, any case). Title and "what happened" also accept
// N/A; they are then stored as the text "N/A" because a report needs a title.
const NOT_APPLICABLE_FIELDS = Object.freeze(['title', 'body', 'scenario', 'steps', 'expected', 'actual', 'frequency', 'context', 'useCase', 'evidence']);
const NOT_APPLICABLE_PATTERN = '^(?:n\\s*/\\s*a|n\\.?\\s*a\\.?|not\\s+applicable)$';
const NOT_APPLICABLE_TEXT = new RegExp(NOT_APPLICABLE_PATTERN, 'i');
const TEXT_QUESTIONS = Object.freeze({ title: 'title', body: 'body', steps: 'steps', expected: 'expected', actual: 'actual', useCase: 'useCase', evidence: 'attachments' });
const QUESTION_LABELS = Object.freeze({ title: 'Title', body: 'What happened', scenario: 'Scenario', steps: 'Steps to reproduce', expected: 'Expected result', actual: 'Actual result', context: 'Item and version', frequency: 'How often it happens', useCase: 'New use case', evidence: 'Evidence references', images: 'Images you added', notes: 'Extra notes' });
const STATE_WORDS = Object.freeze({ done: 'Answered', 'not-applicable': 'Marked not applicable', optional: 'Not provided (optional)', 'missing-recommended': 'Missing (recommended)', 'missing-required': 'Missing (required)' });
function qaMode(value) { return value === 'freeform' ? 'freeform' : 'guided'; }
function isNotApplicableText(value) { return NOT_APPLICABLE_TEXT.test(String(value == null ? '' : value).trim()); }
function notApplicableList(value) {
  const list = (Array.isArray(value) ? value : String(value || '').split(',')).map((item) => String(item).trim());
  return NOT_APPLICABLE_FIELDS.filter((id) => list.includes(id));
}
function fieldText(value) { return Array.isArray(value) ? value.map((item) => clean(item && typeof item === 'object' ? item.ref : item)).filter(Boolean).join('\n') : clean(value); }

// Which questions are not applicable right now. Typed N/A always counts. A
// saved N/A mark counts while the question has no substantive answer; once a
// real answer is entered the mark is stale and is dropped.
function resolveNotApplicable(input = {}) {
  const marked = new Set(notApplicableList(input.notApplicable)), result = new Set();
  for (const [id, field] of Object.entries(TEXT_QUESTIONS)) {
    const value = id === 'evidence' && Array.isArray(input.evidence) && input.evidence.length ? fieldText(input.evidence) : fieldText(input[field]);
    if (isNotApplicableText(value) || (!value && marked.has(id))) result.add(id);
  }
  if (marked.has('scenario') && !scenarioFor(input.scenario)) result.add('scenario');
  if (marked.has('frequency') && frequency(input.frequency) === 'Unknown') result.add('frequency');
  const context = ['itemName', 'contentVersion'].map((key) => clean(input[key]));
  const substantive = context.filter((value) => value && value !== 'Unknown' && !isNotApplicableText(value)).length;
  if (context.every(isNotApplicableText) || (marked.has('context') && substantive === 0)) result.add('context');
  return NOT_APPLICABLE_FIELDS.filter((id) => result.has(id));
}

// Completeness review. Required items block saving; recommended gaps are
// listed and may be saved deliberately (recorded in qaReview.gaps). An item
// marked not applicable is an answer, never a gap. In free-form mode guided
// questions are not asked, so unanswered ones are optional.
function reviewQaReport(input = {}) {
  const chosen = scenarioFor(input.scenario), mode = qaMode(input.qaMode), na = new Set(resolveNotApplicable(input)), items = [];
  const add = (id, state, detail = '') => items.push({ id, label: QUESTION_LABELS[id], state, detail });
  const ask = (id, answered, recommended, detail = '') => {
    if (na.has(id)) return add(id, 'not-applicable');
    if (answered) return add(id, 'done', detail);
    if (mode === 'freeform') return add(id, 'optional', 'Free-form report: not asked.');
    return add(id, recommended ? 'missing-recommended' : 'optional', detail);
  };
  add('title', na.has('title') ? 'not-applicable' : clean(input.title) ? 'done' : 'missing-required');
  add('body', na.has('body') ? 'not-applicable' : clean(input.body) ? 'done' : 'missing-required');
  ask('scenario', Boolean(chosen), false, chosen ? chosen.label : '');
  const stepsNeeded = chosen ? chosen.recommendSteps : true, resultsNeeded = chosen ? chosen.recommendResults : true;
  const steps = clean(input.steps), edited = stepsWereEdited(steps, chosen?.stepsTemplate || '');
  ask('steps', edited, stepsNeeded, steps && !edited ? 'Steps still match the scenario template; replace the (placeholders) or mark not applicable.' : '');
  const expected = clean(input.expected), actual = clean(input.actual), same = expected && actual && expected.toLowerCase() === actual.toLowerCase();
  ask('expected', Boolean(expected), resultsNeeded);
  ask('actual', Boolean(actual) && !same, resultsNeeded || same, same ? 'Expected and actual are identical.' : '');
  const contextKnown = ['itemName', 'contentVersion'].filter((key) => clean(input[key]) && clean(input[key]) !== 'Unknown').length;
  ask('context', contextKnown === 2, true, contextKnown === 2 ? '' : 'Item name or version is Unknown.');
  ask('frequency', frequency(input.frequency) !== 'Unknown', false);
  ask('useCase', Boolean(clean(input.useCase)), false);
  const evidence = na.has('evidence') ? [] : evidenceView(input), local = evidence.filter((item) => item.kind === 'local-reference');
  const missingFiles = local.filter((item) => item.existedAtSubmit === false).length, outside = local.filter((item) => item.scope === 'outside-project').length;
  const detail = [evidence.length ? `${evidence.length} reference(s); nothing is uploaded or copied.` : '', missingFiles ? `${missingFiles} referenced file(s) were not found when submitted.` : '', outside ? `${outside} reference(s) are outside the game folder; reviewers may not have them.` : ''].filter(Boolean).join(' ');
  const images = Array.isArray(input.images) ? input.images.length : 0, missingImages = Number(input.missingImages) || 0;
  if (na.has('evidence')) add('evidence', 'not-applicable');
  else if (missingFiles) add('evidence', mode === 'freeform' ? 'optional' : 'missing-recommended', detail);
  else ask('evidence', evidence.length > 0 || images > 0, chosen?.id === 'crash', evidence.length ? detail : images ? 'Images were added; no references.' : '');
  add('images', missingImages ? 'missing-recommended' : images ? 'done' : 'optional', [images ? `${images} image(s), stored in the game folder; not uploaded.` : '', missingImages ? `${missingImages} image(s) are no longer in the attachments folder and were left out.` : ''].filter(Boolean).join(' '));
  add('notes', clean(input.notes) ? 'done' : 'optional');
  const required = items.filter((item) => item.state === 'missing-required').map((item) => item.id), gaps = items.filter((item) => item.state === 'missing-recommended').map((item) => item.id);
  const review = { mode, canSave: required.length === 0, complete: required.length === 0 && gaps.length === 0, required, gaps, notApplicable: [...na], items };
  review.summary = summarizeReview(review);
  return review;
}

// Accurate completion wording: lists what was answered, marked not applicable,
// left out (optional) and missing. Never claims more than the items show.
function summarizeReview(review) {
  const groups = Object.keys(STATE_WORDS).map((state) => [state, review.items.filter((item) => item.state === state).map((item) => item.label)]).filter(([, labels]) => labels.length);
  return groups.map(([state, labels]) => `${STATE_WORDS[state]}: ${labels.join(', ')}.`).join(' ');
}

// Builds the stored issue fields from webview form input. Pure: the caller
// supplies context, an optional existence probe and already verified images.
// A not-applicable question is stored in notApplicable with its text cleared;
// title and body keep the text "N/A". Notes and images are independent of
// every N/A answer and are always kept.
function issueInputFromForm(input = {}, options = {}) {
  const na = new Set(resolveNotApplicable(input)), mode = qaMode(input.qaMode);
  const text = (id) => na.has(id) ? '' : clean(input[id]);
  const evidence = na.has('evidence') ? [] : evidenceFromText(input.attachments, { root: options.root, exists: options.exists });
  const images = Array.isArray(options.images) ? options.images : [];
  const review = reviewQaReport({ ...input, qaMode: mode, notApplicable: [...na], evidence, images, missingImages: options.missingImages || 0 });
  return {
    review,
    title: na.has('title') ? 'N/A' : clean(input.title), body: na.has('body') ? 'N/A' : clean(input.body),
    fields: {
      qaMode: mode, scenario: na.has('scenario') ? '' : scenarioId(input.scenario), frequency: na.has('frequency') ? 'Unknown' : frequency(input.frequency), notApplicable: [...na],
      steps: text('steps'), expected: text('expected'), actual: text('actual'), useCase: text('useCase'), build: clean(input.build), notes: clean(input.notes, LIMITS.note * 5),
      evidence, attachments: attachmentsFromEvidence(evidence), images,
      qaReview: { gaps: review.gaps, savedWithGaps: review.gaps.length > 0, reviewedAt: options.now || new Date().toISOString() }
    }
  };
}

function normalizeQaReview(value) {
  if (!value || typeof value !== 'object') return null;
  const gaps = Array.isArray(value.gaps) ? [...new Set(value.gaps.map((item) => oneLine(item, 32)).filter((item) => /^[A-Za-z]+$/.test(item)))].slice(0, 16) : [];
  return { gaps, savedWithGaps: gaps.length > 0, reviewedAt: oneLine(value.reviewedAt, 64) };
}

// Data the webview needs to render guidance (plain JSON, no functions).
function clientScenarioData() {
  return { scenarios: SCENARIOS.map(({ id, label, guidance, stepsTemplate, expectedHint, actualHint, evidenceHints }) => ({ id, label, guidance, stepsTemplate, expectedHint, actualHint, evidenceHints: [...evidenceHints] })), frequencies: [...FREQUENCIES], evidenceLabels: { ...EVIDENCE_LABELS }, notApplicableFields: [...NOT_APPLICABLE_FIELDS], notApplicablePattern: NOT_APPLICABLE_PATTERN, questionLabels: { ...QUESTION_LABELS } };
}

module.exports = { LIMITS, FREQUENCIES, EVIDENCE_KINDS, EVIDENCE_LABELS, NOT_APPLICABLE_FIELDS, NOT_APPLICABLE_PATTERN, QUESTION_LABELS, SCENARIOS, scenarioFor, scenarioId, frequency, qaMode, isNotApplicableText, notApplicableList, resolveNotApplicable, classifyEvidenceLine, evidenceFromText, normalizeEvidence, evidenceView, attachmentsFromEvidence, stepsWereEdited, reviewQaReport, summarizeReview, issueInputFromForm, normalizeQaReview, clientScenarioData };
