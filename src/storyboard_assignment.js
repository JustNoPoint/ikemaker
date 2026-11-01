'use strict';

const fs = require('fs');
const path = require('path');
const def = require('./def_model');
const { transactionalWriteSet, hash } = require('./mutation_safety');

const MAX_OWNER_BYTES = 8 * 1024 * 1024;
const TARGETS = Object.freeze({
  opening: Object.freeze({ owner: 'character DEF', section: 'Arcade', key: 'intro.storyboard' }),
  ending: Object.freeze({ owner: 'character DEF', section: 'Arcade', key: 'ending.storyboard' }),
  logo: Object.freeze({ owner: 'system.def', section: 'Files', key: 'logo.storyboard' }),
  gameintro: Object.freeze({ owner: 'system.def', section: 'Files', key: 'intro.storyboard' }),
  loading: Object.freeze({ owner: 'system.def', section: 'VS Screen', key: 'loading.storyboard' }),
  gameover: Object.freeze({ owner: 'system.def', section: 'Game Over Screen', key: 'storyboard' }),
  credits: Object.freeze({ owner: 'system.def', section: 'End Credits', key: 'storyboard' })
});

function assignmentTarget(type) { return TARGETS[String(type || '').toLowerCase()] || null; }
function exactRegularFile(filename, io = fs) {
  const resolved = path.resolve(filename), stat = io.lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Choose one regular DEF file, not a folder or symbolic link.');
  if (stat.size > MAX_OWNER_BYTES) throw new Error('The assignment DEF exceeds the reviewed 8 MiB limit.');
  return resolved;
}
function relativeAssignment(ownerFilename, storyboardFilename) {
  const relative = path.relative(path.dirname(ownerFilename), path.resolve(storyboardFilename)).replace(/\\/g, '/');
  if (!relative || path.isAbsolute(relative)) throw new Error('The storyboard assignment path could not be expressed relative to its owner DEF.');
  return relative;
}
function createAssignmentPlan(input, io = fs) {
  const target = assignmentTarget(input?.type); if (!target) throw new Error('This storyboard type has no single automatic DEF assignment target.');
  const ownerFilename = exactRegularFile(input.ownerFilename, io), storyboardFilename = path.resolve(input.storyboardFilename);
  const before = io.readFileSync(ownerFilename); if (before.length > MAX_OWNER_BYTES) throw new Error('The assignment DEF exceeds the reviewed 8 MiB limit.');
  const bom = before.length >= 3 && before[0] === 0xef && before[1] === 0xbb && before[2] === 0xbf, text = before.subarray(bom ? 3 : 0).toString('utf8');
  if (Buffer.from(text, 'utf8').length !== before.length - (bom ? 3 : 0)) throw new Error('The assignment DEF is not valid UTF-8 text.');
  const document = def.parseDef(text, ownerFilename), matches = def.sections(document, target.section);
  if (matches.length !== 1) throw new Error(matches.length ? `The owner contains more than one [${target.section}] section; review it manually before assignment.` : `The owner has no [${target.section}] section required for ${target.key}.`);
  const value = relativeAssignment(ownerFilename, storyboardFilename), nextText = def.setSectionEntry(document, matches[0].line, target.key, value), payload = Buffer.concat([bom ? Buffer.from([0xef, 0xbb, 0xbf]) : Buffer.alloc(0), Buffer.from(nextText, 'utf8')]);
  return Object.freeze({ type: String(input.type).toLowerCase(), owner: target.owner, ownerFilename, storyboardFilename, section: target.section, key: target.key, value, beforeHash: hash(before), afterHash: hash(payload), changed: !before.equals(payload), payload });
}
function applyAssignment(plan, options = {}, io = fs) {
  if (!plan?.ownerFilename || !plan?.beforeHash || !Buffer.isBuffer(plan.payload)) throw new Error('Storyboard assignment plan is incomplete.');
  if (!plan.changed) return Object.freeze({ changed: false, ownerFilename: plan.ownerFilename, section: plan.section, key: plan.key, value: plan.value, journal: '' });
  const result = transactionalWriteSet(io, [[plan.ownerFilename, plan.payload]], { label: 'assign-storyboard', allowExisting: true, expectedHash: plan.beforeHash, journal: true, journalRoot: path.dirname(plan.ownerFilename), ...options });
  return Object.freeze({ changed: true, ownerFilename: plan.ownerFilename, section: plan.section, key: plan.key, value: plan.value, journal: result[0]?.journal || '' });
}

module.exports = { MAX_OWNER_BYTES, TARGETS, assignmentTarget, relativeAssignment, createAssignmentPlan, applyAssignment };
