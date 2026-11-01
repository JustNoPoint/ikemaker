'use strict';

const { normalizeTrajectory, validateTrajectory } = require('./trajectory_model');

const SUPPORTED_LANGUAGES = Object.freeze(['zss', 'cns']);
const CHARACTER_CONTEXTS = new Set(['move', 'helper', 'explod', 'projectile', 'spatial']);
const MUTATION_CONTEXTS = new Set(['move', 'helper', 'explod', 'projectile', 'spatial']);
const MAX_SOURCE_BYTES = 128 * 1024;

function compact(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  if (Object.is(number, -0)) return '0';
  return Number.isInteger(number) ? String(number) : String(Number(number.toFixed(8)));
}

function issue(level, code, message) { return Object.freeze({ level, code, message }); }
function comment(language, text) { return `${language === 'cns' ? ';' : '#'} ${text}`; }
function expression(plan, tick = 'time') {
  const duration = Math.max(1, plan.durationTicks);
  const progress = `min(max(${tick}, 0), ${duration}) / ${duration}.0`;
  const radiansToDegrees = 180 / Math.PI;
  const theta = `(${compact(plan.phaseRadians * radiansToDegrees)} + ${compact(plan.directionSign * plan.sweepRadians * radiansToDegrees / duration)} * ${tick})`;
  const radiusX = plan.kind === 'spiral' ? `(${compact(plan.startRadius[0])} + ${compact(plan.endRadius[0] - plan.startRadius[0])} * ${progress})` : compact(plan.startRadius[0]);
  const radiusY = plan.kind === 'spiral' ? `(${compact(plan.startRadius[1])} + ${compact(plan.endRadius[1] - plan.startRadius[1])} * ${progress})` : compact(plan.startRadius[1]);
  const cosTilt = compact(Math.cos(plan.tiltRadians));
  const sinTilt = compact(Math.sin(plan.tiltRadians));
  const face = plan.facing < 0 ? '-1 * ' : '';
  const rawX = `${radiusX} * cos${theta} * ${cosTilt} - ${radiusY} * sin${theta} * ${sinTilt}`;
  const rawY = `${radiusX} * cos${theta} * ${sinTilt} + ${radiusY} * sin${theta} * ${cosTilt}`;
  return Object.freeze({
    progress,
    theta,
    x: `${compact(plan.anchor.position[0] + plan.centerOffset[0])} + ${face}(${rawX})`,
    y: `${compact(plan.anchor.position[1] + plan.centerOffset[1])} + (${rawY})`
  });
}

function commonIssues(plan, context = {}) {
  const checked = validateTrajectory(plan), issues = [...checked.issues];
  const kind = String(context.kind || 'spatial').toLowerCase();
  if (!SUPPORTED_LANGUAGES.includes(context.language)) issues.push(issue('error', 'language-unsupported', 'Choose CNS or ZSS before creating an Orbit Assist proposal.'));
  if (!CHARACTER_CONTEXTS.has(kind)) issues.push(issue('error', 'preview-only-context', `${kind || 'This'} context is preview-only until its distinct source and mutation contract is proven.`));
  if (context.mutationAllowed === false) issues.push(issue('error', 'mutation-authority-missing', 'This preview has no exact host-owned mutation route. Review it here, then open it from a specialist viewer with a proven source target before generating code.'));
  if (plan.kind === 'formula') issues.push(issue('error', 'formula-opaque', 'Authored formulas remain opaque. Orbit Assist never evaluates or rewrites them.'));
  if (plan.easing !== 'linear') issues.push(issue('error', 'easing-not-emitted', `${plan.easing} easing can be previewed, but the stable proposal emitter currently supports linear timing only.`));
  if (!['world', 'local'].includes(plan.coordinateSpace)) issues.push(issue('error', 'coordinate-conversion-unproven', `${plan.coordinateSpace} coordinates require an explicit host conversion and cannot be emitted by the portable character-controller adapter.`));
  if (plan.owner.kind !== 'self') issues.push(issue('error', 'owner-unproven', `${plan.owner.kind} ownership requires a host-proven redirect or binding contract before code can be emitted. Unredirected PosSet is emitted only for self.`));
  if (plan.owner.kind === 'expression' && !plan.owner.reviewed) issues.push(issue('error', 'owner-expression-unreviewed', 'Authored owner expressions must be explicitly reviewed before any proposal can be emitted.'));
  if (context.capabilityState && context.capabilityState !== 'stable') issues.push(issue('error', 'capability-uncertain', 'Unknown, conflicting, or unverified engine capability evidence blocks generated code.'));
  return issues;
}

function zssArtifact(plan, context) {
  const e = expression(plan);
  const name = context.name || 'Orbit Assist';
  return [
    comment('zss', name),
    comment('zss', `Preview contract: ${plan.kind}; ${plan.coordinateSpace}; ${plan.durationTicks} ticks; localcoord ${plan.localCoord.join(', ')}.`),
    comment('zss', 'Initialization: center, radii, phase, direction, tilt, and duration are embedded below.'),
    `if time >= 0 && time <= ${plan.durationTicks} {`,
    `  posSet{x: ${e.x}; y: ${e.y}}`,
    '}',
    comment('zss', 'Cleanup/owner loss remains controlled by the owning StateDef or controller block.'),
    comment('zss', 'Runtime timing, pause, hit-pause, camera, facing changes, and owner loss still require IKEMEN testing.')
  ].join('\n');
}

function cnsArtifact(plan, context) {
  const e = expression(plan);
  const name = String(context.name || 'Orbit Assist').replace(/[\r\n\[\]]/g, ' ').trim().slice(0, 80) || 'Orbit Assist';
  return [
    comment('cns', name),
    comment('cns', `Preview contract: ${plan.kind}; ${plan.coordinateSpace}; ${plan.durationTicks} ticks; localcoord ${plan.localCoord.join(', ')}.`),
    `[State ${name}, Orbit PosSet]`,
    'type = PosSet',
    'trigger1 = time >= 0',
    `trigger1 = time <= ${plan.durationTicks}`,
    `x = ${e.x}`,
    `y = ${e.y}`,
    comment('cns', 'Cleanup/owner loss remains controlled by the owning StateDef or controller block.'),
    comment('cns', 'Runtime timing, pause, hit-pause, camera, facing changes, and owner loss still require IKEMEN testing.')
  ].join('\n');
}

function createTrajectoryProposal(input, context = {}) {
  const language = String(context.language || '').trim().toLowerCase();
  const checked = validateTrajectory(input);
  if (!checked.valid || !checked.plan) return Object.freeze({
    contract: 'ikemaker-trajectory-proposal-v1', valid: false, previewOnly: true, plan: null, language,
    issues: Object.freeze(checked.issues.map(entry => issue('error', 'plan-invalid', entry.message))),
    artifacts: Object.freeze([]), sections: Object.freeze([])
  });
  const plan = checked.plan;
  const issues = commonIssues(plan, { ...context, language });
  const blocked = issues.some(entry => entry.level === 'error');
  const source = blocked ? '' : (language === 'cns' ? cnsArtifact(plan, context) : zssArtifact(plan, context));
  if (Buffer.byteLength(source, 'utf8') > MAX_SOURCE_BYTES) issues.push(issue('error', 'proposal-too-large', 'The generated proposal exceeds the bounded artifact size.'));
  const valid = !issues.some(entry => entry.level === 'error');
  return Object.freeze({
    contract: 'ikemaker-trajectory-proposal-v1',
    valid,
    previewOnly: !MUTATION_CONTEXTS.has(String(context.kind || '').toLowerCase()),
    plan,
    language,
    issues: Object.freeze(issues),
    artifacts: Object.freeze(valid ? [Object.freeze({ id: 'trajectory-controller', role: 'controller', language, text: source })] : []),
    sections: Object.freeze(['setup', 'initialization', 'per-tick-update', 'facing-and-coordinate-contract', 'cleanup-and-owner-loss'])
  });
}

module.exports = { SUPPORTED_LANGUAGES, CHARACTER_CONTEXTS, MUTATION_CONTEXTS, MAX_SOURCE_BYTES, createTrajectoryProposal, expression };
