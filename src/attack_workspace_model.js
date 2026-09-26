'use strict';

const fs = require('fs');
const path = require('path');
const { parseCodeStructure, flatten } = require('./code_structure_model');
const { hash } = require('./mutation_safety');

function readCurrent(filename, openDocuments = []) {
  const resolved = path.resolve(filename).toLowerCase();
  const open = openDocuments.find(document => path.resolve(document.fileName || '').toLowerCase() === resolved);
  return open ? open.getText() : fs.readFileSync(filename, 'utf8');
}

function language(filename, text = '') {
  if (/\.zss$/i.test(filename) || /\bhitdef\s*\{/i.test(text)) return 'zss';
  return 'cns';
}

function fieldExplanation(field) {
  const direct = {
    moveID: 'The move identity used to connect this profile to its StateDef and AIR action. It is a number, not a duration.',
    firstActiveElement: 'The first AIR element treated as active. Elements are counted from 1; this is not a game tick.',
    idleElement: 'The first recovery or idle AIR element. Elements before this remain inside the authored attack window.',
    hitPauseAnimateStartElement: 'The first AIR element allowed to advance during hit pause. Zero disables the smear range.',
    hitPauseFreezeElement: 'The AIR element that holds after the hit-pause smear finishes.',
    hitPauseAnimateTicks: 'How many 60 Hz game ticks the authored smear range consumes before it freezes.',
    damage: 'Base damage before project-specific counter-hit, scaling, defense, or life rules are applied.',
    groundHitTime: 'Ground hitstun in 60 Hz game ticks. Project code may add or replace this value.',
    guardHitTime: 'Guard stun in 60 Hz game ticks. Project code may add or replace this value.',
    sparkX: 'Horizontal hit-spark offset relative to the defender/contact convention used by this project.',
    sparkY: 'Vertical hit-spark offset relative to the defender/contact convention used by this project.'
  };
  if (direct[field.suffix]) return direct[field.suffix];
  const groups = {
    Classification: 'Describes what kind of attack this is so shared project code can choose rules consistently.',
    Identity: 'Connects this profile to authored states, HitDefs, AIR actions, or multi-hit identities.',
    'Animation timing': 'Uses AIR element numbers and 60 Hz ticks. Element numbers and elapsed ticks are different units.',
    Damage: 'Feeds damage and scaling logic; the final runtime result may be modified by shared systems.',
    'Contact timing': 'Feeds hit or guard reaction timing in 60 Hz game ticks.',
    'Counter Hit': 'Applies only when the project identifies this contact as a counter hit.',
    'Punish Counter': 'Applies only when the project identifies this contact as a punish counter.',
    'Counter rules': 'Controls whether shared counter-hit additions are allowed for this move.',
    'Effect placement': 'Places visual contact effects; it does not change the collision box itself.',
    'Project-specific': 'A project-defined value. Search connected code to see exactly where it is read.'
  };
  return groups[field.category] || 'An authored move value. Connected code remains authoritative for how it is used.';
}

function timingProblems(move) {
  const problems = [], timeline = move?.timeline || {};
  const add = (level, title, detail, frameIndex = null, field = '') => problems.push({ id: `timing-${problems.length + 1}`, source: 'AIR timing', level, title, detail, frameIndex, field });
  if (timeline.state !== 'ready') {
    add('error', `AIR action ${timeline.actionNumber ?? move?.values?.moveID ?? '—'} is unavailable`, timeline.detail || 'The move profile does not resolve an authored AIR action.');
    return problems;
  }
  const frames = timeline.frames || [], first = Number(move.values.firstActiveElement), idle = Number(move.values.idleElement);
  if (!frames.length) { add('error', 'The linked AIR action has no elements', 'Add at least one AIR element before authoring attack timing.'); return problems; }
  if (Number.isFinite(first) && (first < 1 || first > frames.length)) add('error', 'First active element is outside the AIR action', `firstActiveElement is ${first}, but the action has ${frames.length} element(s).`, null, 'firstActiveElement');
  if (Number.isFinite(idle) && (idle < 1 || idle > frames.length + 1)) add('error', 'Recovery element is outside the AIR action', `idleElement is ${idle}, but the action has ${frames.length} element(s).`, null, 'idleElement');
  if (Number.isFinite(first) && Number.isFinite(idle) && idle <= first) add('error', 'Recovery begins before the active window can finish', `idleElement (${idle}) must come after firstActiveElement (${first}).`, null, 'idleElement');
  if (Number.isFinite(first) && Number.isFinite(idle) && first >= 1 && idle > first) {
    const end = Math.min(frames.length, idle - 1), missing = [];
    for (let index = first - 1; index < end; index += 1) if (!(frames[index].clsn1 || []).length) missing.push(index);
    if (missing.length) add('likely', 'Authored active window contains element(s) without Clsn1', `Elements ${missing.map(index => index + 1).join(', ')} are between firstActiveElement and idleElement but have no effective attack collision box. This can be intentional when code gates HitDef contact; review the state before changing AIR.`, missing[0]);
  }
  const firstCollision = frames.findIndex(frame => (frame.clsn1 || []).length);
  if (firstCollision >= 0 && Number.isFinite(first) && firstCollision + 1 !== first) add('likely', 'First attack box and authored active start differ', `The first effective Clsn1 is element ${firstCollision + 1}; firstActiveElement is ${first}. HitDef timing or conditional code may make this intentional.`, firstCollision, 'firstActiveElement');
  const smear = Number(move.values.hitPauseAnimateStartElement), freeze = Number(move.values.hitPauseFreezeElement);
  if ((smear > 0 || freeze > 0) && !(smear > 0 && freeze > smear && freeze <= frames.length)) add('error', 'Hit-pause smear range is incomplete', `The smear start (${smear || 0}) must be followed by a freeze element (${freeze || 0}) inside the AIR action.`, null, 'hitPauseAnimateStartElement');
  return problems;
}

function nodeText(lines, item) { return lines.slice(item.startLine, item.endLine + 1).join('\n'); }
function connectedCode(assets, move, openDocuments = []) {
  const stateNumber = Number(move?.values?.moveID), prefix = String(move?.prefix || '').toLowerCase(), all = [], functions = new Map();
  const characterFolder = assets.folder || (assets.defPath ? path.dirname(assets.defPath) : '');
  const isSharedSource = filename => {
    if (!characterFolder || !filename) return false;
    const relative = path.relative(path.resolve(characterFolder), path.resolve(filename));
    return relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
  };
  for (const filename of (assets.code || []).filter(file => file && fs.existsSync(file) && path.resolve(file).toLowerCase() !== path.resolve(assets.constants || '').toLowerCase())) {
    const text = readCurrent(filename, openDocuments), lines = text.split(/\r?\n/), lang = language(filename, text), tree = parseCodeStructure(text, lang, filename), nodes = flatten(tree);
    const record = { filename, fileLabel: path.basename(filename), text, lines, sourceHash: hash(text), language: lang, nodes };
    all.push(record);
    for (const item of nodes.filter(node => node.kind === 'function')) functions.set(String(item.signature || item.title).toLowerCase(), { record, item });
  }
  const sections = [], seen = new Set();
  const add = (record, item, kind, explanation, shared = false) => {
    const key = `${record.filename.toLowerCase()}:${item.startLine}:${item.endLine}`; if (seen.has(key)) return; seen.add(key);
    const text = nodeText(record.lines, item), controllers = item.children?.filter(child => child.kind === 'controller').map(child => child.title) || [];
    const signature = String(item.signature || item.title || '').trim(), stableId = `${record.filename.toLowerCase()}:${kind}:${signature.toLowerCase()}`;
    sections.push({ id: stableId, stableId, signature, filename: record.filename, fileLabel: record.fileLabel, startLine: item.startLine, endLine: item.endLine, sourceHash: record.sourceHash, language: record.language, kind, title: item.title, text, shared, controllers, explanation });
  };
  for (const record of all) {
    for (const item of record.nodes.filter(node => node.kind === 'state')) {
      const numeric = Number(String(item.signature || '').trim()), text = nodeText(record.lines, item);
      const shared = isSharedSource(record.filename);
      if (Number.isFinite(stateNumber) && numeric === stateNumber) add(record, item, 'move-state', shared ? 'This StateDef owns the move, but its source file is assigned from outside this character folder. Editing it can affect every character that uses the same shared template. HitDef creates contact; ChangeState commonly ends the move or opens a transition.' : 'This character-local StateDef owns the move. HitDef creates contact; ChangeState commonly ends the move or opens a transition; call expressions can move reusable logic into functions.', shared);
      else if (prefix && text.toLowerCase().includes(prefix)) add(record, item, 'connected-state', shared ? 'This shared state reads the selected modular move profile. Editing it can affect every character that uses the same assigned source.' : 'This character-local state reads the selected modular move profile. Editing it can affect setup, cancels, follow-ups, or routing for this character.', shared);
    }
  }
  const calls = new Set();
  for (const section of sections.filter(item => item.kind === 'move-state')) {
    const pattern = /\bcall\s+([A-Za-z_][A-Za-z0-9_.]*)\s*\(/gi; let match;
    while ((match = pattern.exec(section.text))) calls.add(match[1].toLowerCase());
  }
  for (const name of calls) {
    const found = functions.get(name); if (found) { const shared = isSharedSource(found.record.filename); add(found.record, found.item, 'function', shared ? 'This function is called by the move state from an assigned shared source. Changing it may affect every character and move that uses that source.' : 'This character-local function is called by the move state. Changing it may still affect every local caller, not only this attack.', shared); }
  }
  for (const record of all) for (const item of record.nodes.filter(node => node.kind === 'function')) {
    if (prefix && nodeText(record.lines, item).toLowerCase().includes(prefix)) { const shared = isSharedSource(record.filename); add(record, item, 'profile-reader', shared ? 'This assigned shared function reads the selected move profile. Review other characters and callers before changing it.' : 'This character-local function reads the selected move profile. Review other local callers before changing it.', shared); }
  }
  return sections.sort((a, b) => (a.kind === 'move-state' ? -1 : 1) - (b.kind === 'move-state' ? -1 : 1) || a.filename.localeCompare(b.filename) || a.startLine - b.startLine);
}

function diagnosticProblems(diagnostics = [], sections = []) {
  return diagnostics.map((diagnostic, index) => {
    const filename = diagnostic.filename || diagnostic.uri?.fsPath || '', line = diagnostic.line ?? diagnostic.range?.start?.line ?? 0;
    const section = sections.find(item => path.resolve(item.filename).toLowerCase() === path.resolve(filename || '.').toLowerCase() && line >= item.startLine && line <= item.endLine);
    const severity = diagnostic.severity;
    if (!section) return null;
    return { id: `lint-${index + 1}`, source: diagnostic.source || 'IKEMEN lint', level: severity === 0 ? 'error' : severity === 1 ? 'warning' : 'info', title: diagnostic.message || 'Source diagnostic', detail: `${path.basename(filename || 'source')}:${line + 1}`, filename, line, sectionId: section.id };
  }).filter(Boolean);
}

module.exports = { readCurrent, language, fieldExplanation, timingProblems, connectedCode, diagnosticProblems };
