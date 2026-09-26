'use strict';

const STATUSES = ['not-started', 'in-progress', 'ready-for-review', 'blocked', 'needs-testing', 'passed', 'intentionally-skipped', 'revisit-later'];
const TERMINAL = new Set(['passed', 'intentionally-skipped']);
const CURRENT_PROFILE_SCHEMA = 2;
const CURRENT_PROGRESS_SCHEMA = 2;

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function normalizeStep(step, phaseId) {
  if (!step || !String(step.id || '').trim()) throw new Error(`A workflow step in ${phaseId} has no stable id.`);
  return { id: String(step.id), label: String(step.label || step.id), description: String(step.description || ''), discipline: String(step.discipline || 'Unassigned'), action: String(step.action || ''), detect: String(step.detect || ''), optional: Boolean(step.optional), learning: String(step.learning || ''), acceptance: String(step.acceptance || ''), evidenceRequired: Boolean(step.evidenceRequired), gameSpecific: Boolean(step.gameSpecific), signoffRequired: Boolean(step.signoffRequired), validationLevel: String(step.validationLevel || 'warning'), dependsOn: Array.isArray(step.dependsOn) ? step.dependsOn.map(String) : [], lessonCapture: Boolean(step.lessonCapture) };
}
function migrateProfile(raw = {}) {
  const value = clone(raw || {}), schema = Number(value.schemaVersion) || 1;
  if (schema > CURRENT_PROFILE_SCHEMA) throw new Error(`Workflow profile schema ${schema} is newer than this extension supports (${CURRENT_PROFILE_SCHEMA}).`);
  if (schema < 2) {
    value.sourceAuthority = String(value.sourceAuthority || ''); value.completionModel = String(value.completionModel || '');
    value.ownershipScope = String(value.ownershipScope || ''); value.reopenTriggers = Array.isArray(value.reopenTriggers) ? value.reopenTriggers : [];
    value.schemaVersion = 2;
  }
  return value;
}
function normalizeProfile(raw = {}) {
  raw = migrateProfile(raw);
  if (!String(raw.id || '').trim()) throw new Error('Workflow profile id is required.');
  const phases = (raw.phases || []).map((phase) => ({ id: String(phase.id || ''), name: String(phase.name || phase.id || 'Phase'), summary: String(phase.summary || ''), steps: (phase.steps || []).map((step) => normalizeStep(step, phase.id)) }));
  const ids = phases.flatMap((phase) => phase.steps.map((step) => step.id)), duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicates.length) throw new Error(`Workflow step ids must be unique: ${[...new Set(duplicates)].join(', ')}`);
  return { schemaVersion: CURRENT_PROFILE_SCHEMA, id: String(raw.id), version: Number(raw.version) || 1, name: String(raw.name || raw.id), description: String(raw.description || ''), extends: String(raw.extends || ''), blocks: Array.isArray(raw.blocks) ? raw.blocks.map(String) : [], appliedBlocks: Array.isArray(raw.appliedBlocks) ? raw.appliedBlocks.map((entry) => ({ id: String(entry.id || ''), version: Number(entry.version) || 1, name: String(entry.name || entry.id || '') })) : [], statuses: Array.isArray(raw.statuses) && raw.statuses.length ? raw.statuses.map(String) : [...STATUSES], sourceAuthority: String(raw.sourceAuthority || ''), completionModel: String(raw.completionModel || ''), ownershipScope: String(raw.ownershipScope || ''), reopenTriggers: Array.isArray(raw.reopenTriggers) ? raw.reopenTriggers.map(String) : [], phases };
}
function mergeProfiles(baseRaw, childRaw) {
  const base = normalizeProfile(baseRaw), childMeta = normalizeProfile({ ...childRaw, phases: [] }), result = clone(base);
  Object.assign(result, { ...childMeta, phases: result.phases });
  for (const field of ['sourceAuthority', 'completionModel', 'ownershipScope', 'reopenTriggers']) if (childRaw[field] === undefined) result[field] = clone(base[field]);
  for (const rawPhase of childRaw.phases || []) {
    const phaseId = String(rawPhase.id || ''), target = result.phases.find((item) => item.id === phaseId);
    if (!target) { result.phases.push({ id: phaseId, name: String(rawPhase.name || phaseId || 'Phase'), summary: String(rawPhase.summary || ''), steps: (rawPhase.steps || []).map((step) => normalizeStep(step, phaseId)) }); continue; }
    if (rawPhase.name !== undefined) target.name = String(rawPhase.name); if (rawPhase.summary !== undefined) target.summary = String(rawPhase.summary);
    for (const rawStep of rawPhase.steps || []) {
      const current = target.steps.find((item) => item.id === String(rawStep.id));
      if (current) for (const [key, value] of Object.entries(rawStep)) { if (['optional', 'evidenceRequired', 'gameSpecific'].includes(key)) current[key] = Boolean(value); else if (value !== undefined) current[key] = String(value); }
      else target.steps.push(normalizeStep(rawStep, phaseId));
    }
  }
  return normalizeProfile(result);
}
function normalizeBlock(raw = {}) {
  if (!String(raw.id || '').trim()) throw new Error('Workflow block id is required.');
  const profile = normalizeProfile({ id: `block:${raw.id}`, version: raw.version, name: raw.name || raw.id, phases: raw.phases || [] });
  return { schemaVersion: Number(raw.schemaVersion) || 1, id: String(raw.id), version: Number(raw.version) || 1, name: String(raw.name || raw.id), description: String(raw.description || ''), category: String(raw.category || 'Reusable'), phases: profile.phases };
}
function applyBlock(profileRaw, blockRaw) {
  const profile = normalizeProfile(profileRaw), block = normalizeBlock(blockRaw);
  const merged = mergeProfiles(profile, { ...profile, phases: block.phases });
  merged.appliedBlocks = [...profile.appliedBlocks.filter((entry) => entry.id !== block.id), { id: block.id, version: block.version, name: block.name }];
  return normalizeProfile(merged);
}
function newProgress(profile, character = {}) { return { schemaVersion: CURRENT_PROGRESS_SCHEMA, characterId: String(character.id || character.name || 'character'), characterName: String(character.name || character.id || 'Character'), defPath: String(character.defPath || ''), profileId: profile.id, profileVersion: profile.version, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), items: {}, orphanedItems: {}, lessons: [] }; }
function normalizeItem(item = {}) { const status = STATUSES.includes(item.status) ? item.status : 'not-started'; return { status, note: String(item.note || ''), assignedTo: String(item.assignedTo || ''), evidence: Array.isArray(item.evidence) ? item.evidence.map((entry) => ({ label: String(entry.label || ''), value: String(entry.value || ''), time: String(entry.time || '') })) : [], updatedAt: String(item.updatedAt || ''), updatedBy: String(item.updatedBy || '') }; }
function reconcileProgress(profile, raw, character = {}) {
  const progress = raw && typeof raw === 'object' ? clone(raw) : newProgress(profile, character), valid = new Set(profile.phases.flatMap((phase) => phase.steps.map((step) => step.id)));
  progress.items = progress.items || {}; progress.orphanedItems = progress.orphanedItems || {};
  for (const [id, item] of Object.entries(progress.items)) if (!valid.has(id)) { progress.orphanedItems[id] = normalizeItem(item); delete progress.items[id]; }
  for (const id of valid) { if (!progress.items[id] && progress.orphanedItems[id]) { progress.items[id] = normalizeItem(progress.orphanedItems[id]); delete progress.orphanedItems[id]; } else progress.items[id] = normalizeItem(progress.items[id]); }
  progress.schemaVersion = CURRENT_PROGRESS_SCHEMA; progress.lessons = Array.isArray(progress.lessons) ? progress.lessons : [];
  progress.characterId = String(character.id || progress.characterId || character.name || 'character'); progress.characterName = String(character.name || progress.characterName || character.id || 'Character'); progress.defPath = String(character.defPath || progress.defPath || ''); progress.profileId = profile.id; progress.profileVersion = profile.version; progress.updatedAt = new Date().toISOString(); return progress;
}
function decorate(profile, progress, detections = {}) {
  return profile.phases.map((phase) => ({ ...phase, steps: phase.steps.map((step) => ({ ...step, progress: normalizeItem(progress.items[step.id]), detection: step.detect ? detections[step.detect] || { state: 'unknown', detail: 'Not checked.' } : null })) }));
}
function phaseSummary(phase) { const total = phase.steps.length, complete = phase.steps.filter((step) => TERMINAL.has(step.progress.status)).length; return { total, complete, percent: total ? Math.round(complete / total * 100) : 100 }; }
function nextTasks(phases, limit = 8) {
  const result = [];
  for (const phase of phases) {
    const blocking = phase.steps.filter((step) => step.progress.status === 'blocked');
    for (const step of blocking) result.push({ ...step, phaseId: phase.id, phaseName: phase.name, priority: 'blocked' });
    const next = phase.steps.find((step) => !TERMINAL.has(step.progress.status) && step.progress.status !== 'blocked');
    if (next) result.push({ ...next, phaseId: phase.id, phaseName: phase.name, priority: next.progress.status });
    if (result.length >= limit) break;
  }
  return result.slice(0, limit);
}
function teamBoard(phases) { const groups = new Map(); for (const phase of phases) for (const step of phase.steps) { if (!groups.has(step.discipline)) groups.set(step.discipline, []); groups.get(step.discipline).push({ ...step, phaseId: phase.id, phaseName: phase.name }); } return [...groups.entries()].map(([discipline, steps]) => ({ discipline, steps })); }
function setItem(progress, id, changes, actor = '') { const item = normalizeItem({ ...(progress.items[id] || {}), ...changes }); item.updatedAt = new Date().toISOString(); if (actor) item.updatedBy = actor; progress.items[id] = item; progress.updatedAt = item.updatedAt; return progress; }
function addEvidence(progress, id, evidence, actor = '') { const item = normalizeItem(progress.items[id]); item.evidence.push({ label: String(evidence.label || 'Evidence'), value: String(evidence.value || ''), time: new Date().toISOString() }); return setItem(progress, id, item, actor); }
function passEligibility(profile, progress, id) {
  const step = profile.phases.flatMap((phase) => phase.steps).find((item) => item.id === id);
  if (!step) return { allowed: false, reasons: ['Unknown workflow step.'] };
  const reasons = [];
  if (step.evidenceRequired && !normalizeItem(progress.items[id]).evidence.length) reasons.push('Evidence is required before this step can pass.');
  for (const dependency of step.dependsOn || []) if (!TERMINAL.has(normalizeItem(progress.items[dependency]).status)) reasons.push(`Dependency ${dependency} is not complete.`);
  if (step.signoffRequired && !normalizeItem(progress.items[id]).note.trim()) reasons.push('A named owner sign-off note is required.');
  return { allowed: !reasons.length, reasons, step };
}
function addLesson(progress, lesson = {}, actor = '') {
  progress.lessons = Array.isArray(progress.lessons) ? progress.lessons : [];
  progress.lessons.push({ rule: String(lesson.rule || ''), gameSpecificException: String(lesson.gameSpecificException || ''), testProcedure: String(lesson.testProcedure || ''), evidence: String(lesson.evidence || ''), knownLimitation: String(lesson.knownLimitation || ''), ownerSignoff: String(lesson.ownerSignoff || ''), actor: String(actor || ''), time: new Date().toISOString() });
  progress.updatedAt = new Date().toISOString(); return progress;
}

module.exports = { STATUSES, TERMINAL, CURRENT_PROFILE_SCHEMA, CURRENT_PROGRESS_SCHEMA, migrateProfile, normalizeProfile, normalizeBlock, mergeProfiles, applyBlock, newProgress, reconcileProgress, decorate, phaseSummary, nextTasks, teamBoard, setItem, addEvidence, passEligibility, addLesson };
