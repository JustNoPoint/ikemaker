'use strict';

// Shared Move Lab / Command Maker route builder: turns a recognized timed command (catalog family)
// into a consumption condition and an optional ChangeState route, in CNS or ZSS.
//
// Recognition vs consumption:
// - Recognition belongs to the engine's native [Command] definitions (time, steptime, buffer.*), or
//   to the owner's input-parser ZSS when the family depends on it.
// - Consumption is this route: posture, control gate, and orientation policy.
//
// Orientation:
// - Grounded routes use `StateType != A` and the facing at recognition (a native command result is
//   facing-relative when it completes; later turns do not reinterpret it).
// - Airborne routes default to recognition-facing lock as well.
// - `live-p2-side` is an explicit opt-in that is only offered when the owner's input parser stores the
//   recognition-time world endpoint (map(JNP_input_request_absolute_end)). A buffered native command
//   result cannot know the world facing at recognition after a turn, so it is never approximated with
//   p2Dist alone. The live clause always requires StateType = A, so grounded consumption stays locked
//   even when the posture is "any". The resolution mirrors HDBZ input_parser.zss
//   JNP_HDBZ_InputResolvedMotion (stored end compared with sign(p2Dist x * facing); a tie is "not toward").
//
// All generated text uses IKEMEN GO v1.0.0 features (maps, ZSS let/call/if); Nightly-only command
// syntax is gated by the catalog definitions themselves.

const { findFamily, selectVariants, ownerSupport, variantOrigin } = require('./command_timed_catalog');
const ownerDependencies = family => family.dependencies.filter(item => item.origin !== 'reference' && family.origin !== 'reference');

const POSTURES = Object.freeze({ grounded: 'StateType != A', airborne: 'StateType = A', any: '' });
const GATES = Object.freeze({ ctrl: 'ctrl', 'ctrl-or-jumpstart': '(ctrl || StateNo = 40)', none: '' });
const AIR_POLICIES = Object.freeze(['recognition-facing', 'live-p2-side']);
const SOURCES = Object.freeze(['native', 'parser-request']);
const LANGUAGES = Object.freeze(['cns', 'zss']);
const BUTTON_ID = Object.freeze({ x: 1, y: 2, z: 3, a: 4, b: 5, c: 6 });
const REQUIRED = Object.freeze({ active: 'JNP_HDBZ_InputRequestActive', resolved: 'JNP_HDBZ_InputResolvedMotion', charge: 'JNP_HDBZ_InputClearAcceptedCharge' });

const quote = name => `command = "${name}"`;
const orJoin = parts => parts.length === 1 ? parts[0] : '(' + parts.join(' || ') + ')';
const andJoin = parts => parts.filter(Boolean).join(' && ');

function languageForFile(file) {
  return /\.zss$/i.test(String(file || '')) ? 'zss' : 'cns';
}

// Optional inclusive absolute horizontal P2 distance gate. Blank bounds mean "no gate" (the route is
// unchanged). Units: 'const240p' scales a 240p-reference value through Const240p; 'owner' compares the
// character's own coordinate units directly. numEnemy is guarded before P2Dist X is read, so the gate is
// false when no opponent exists.
const DISTANCE_UNITS = Object.freeze(['const240p', 'owner']);
function distanceGate(request) {
  const blank = value => value === undefined || value === null || String(value).trim() === '';
  const parse = (value, name) => {
    if (blank(value)) return null;
    const text = String(value).trim();
    if (!/^\d+$/.test(text)) throw new Error(`${name} distance must be a whole number of pixels, 0 or more.`);
    return Number(text);
  };
  const min = parse(request.minDistance, 'Minimum'), max = parse(request.maxDistance, 'Maximum');
  if (min === null && max === null) return null;
  const units = request.distanceUnits || 'const240p';
  if (!DISTANCE_UNITS.includes(units)) throw new Error('Choose 240p-reference (Const240p) or owner-unit distance.');
  if (min !== null && max !== null && min > max) throw new Error(`Minimum distance ${min} is greater than maximum distance ${max}; enter them in order.`);
  const scaled = value => units === 'const240p' ? `const240p(${value})` : String(value);
  const bounds = [min !== null ? `abs(p2Dist X) >= ${scaled(min)}` : '', max !== null ? `abs(p2Dist X) <= ${scaled(max)}` : ''].filter(Boolean);
  const label = `${min !== null ? min : 0}–${max !== null ? max : '∞'} ${units === 'const240p' ? 'px at 240p reference (Const240p)' : 'owner coordinate units'}`;
  return { expression: `(numEnemy && ${bounds.join(' && ')})`, min, max, units, label };
}

function validate(request) {
  const errors = [];
  if (!Object.hasOwn(POSTURES, request.posture)) errors.push('Choose grounded, airborne, or any posture.');
  if (!Object.hasOwn(GATES, request.gate)) errors.push('Choose a listed control gate.');
  if (!AIR_POLICIES.includes(request.airPolicy)) errors.push('Choose recognition-facing or live P2-side orientation.');
  if (!SOURCES.includes(request.source)) errors.push('Choose native command or parser request as the route source.');
  if (!LANGUAGES.includes(request.language)) errors.push('Choose CNS or ZSS output.');
  if (!['press', 'release', 'either'].includes(request.edge)) errors.push('Choose press, release, or either edge.');
  if (request.stateNo !== undefined && request.stateNo !== '' && !/^-?\d+$/.test(String(request.stateNo).trim())) errors.push('State number must be an integer.');
  return errors;
}

// The owner's parser publications for a family. Reference families never count: after a merge their
// motionIds describe the reference catalog's parser, not this owner's. A parser-recognized family (the
// owner's parser publishes it from its own state, e.g. a map-based charge) publishes every button.
function ownerPublication(family) {
  if (!family || family.origin === 'reference') return { motionIds: [], variants: [] };
  const variants = family.variants.filter(variant => variant.publish && variantOrigin(family, variant) !== 'reference');
  const motionIds = family.parserOnly || family.parserRecognized ? family.motionIds.slice() : [...new Set(variants.map(variant => variant.publish.motionId))];
  return { motionIds, variants };
}

// What the owner's verified parser can support. `parser` is the owner catalog's parser summary.
function parserCapabilities(parser) {
  const functions = new Set(parser?.functions || []);
  return {
    present: Boolean(parser),
    requestActive: functions.has(REQUIRED.active),
    resolvedMotion: functions.has(REQUIRED.resolved),
    chargeCleanup: functions.has(REQUIRED.charge),
    storesEndpoint: Boolean(parser?.storesEndpoint)
  };
}

// Choices the UI should offer for a family on this owner (unsupported ones are suppressed).
function routeChoices(catalog, familyId, { ownerHasParser = false } = {}) {
  const family = findFamily(catalog, familyId);
  if (!family) return null;
  const caps = parserCapabilities(ownerHasParser ? catalog.parser : null);
  const publication = ownerPublication(family);
  const published = caps.present && publication.motionIds.length === 1;
  const mirrorPublished = family.mirror ? ownerPublication(findFamily(catalog, family.mirror)).motionIds.length === 1 : false;
  const horizontal = Boolean(family.end && family.mirror && mirrorPublished);
  const charge = ownerDependencies(family).some(item => item.kind === 'charge-cleanup');
  const parserLanguages = !published ? [] : LANGUAGES.filter(language => language === 'zss' ? caps.requestActive && (!charge || caps.chargeCleanup) : !charge);
  return {
    sources: [...(family.parserOnly ? [] : ['native']), ...(parserLanguages.length ? ['parser-request'] : [])],
    parserLanguages,
    liveP2Side: published && horizontal && caps.storesEndpoint,
    reasons: {
      native: family.parserOnly ? 'Recognized only by an input-parser script; there is no native command result to read.' : '',
      parser: !caps.present ? 'This character has no input-parser script.' : !published ? 'This character\'s input parser does not publish this family (the built-in reference does not count).' : charge && !parserLanguages.length ? 'Charge routes need the parser\'s JNP_HDBZ_InputClearAcceptedCharge, which CNS cannot call; use ZSS output with a parser that defines it.' : '',
      live: !family.end ? 'This family has no horizontal endpoint, so live P2-side orientation does not apply.' : !mirrorPublished ? `Live P2-side needs this character's parser to publish the mirrored ${family.mirror || 'opposite-direction'} family too.` : !published || !caps.storesEndpoint ? 'Live P2-side needs the owner parser\'s stored recognition-time endpoint; a native command result cannot provide it after a turn.' : ''
    }
  };
}

// --- native source ------------------------------------------------------------------------------

function nativeCondition(family, request, notes, warnings, missingDefinitions) {
  const { variants, missing } = selectVariants(family, request);
  if (missing.length && request.edge !== 'either') throw new Error(`${family.id} has no authored variant for: ${missing.join(', ')}.`);
  if (!variants.length) throw new Error(`${family.id} has no authored variant for the chosen buttons and edge.`);
  // Exact command names: the owner's own variant is used when it exists; any reference-only variant is
  // not in this character's command file, and the engine rejects routes to undefined commands.
  for (const variant of variants) if (variantOrigin(family, variant) === 'reference') missingDefinitions.push(variant.name);
  // Not an obstacle for the user: Command Maker inserts these definitions itself ("Add definitions & copy
  // route"); the route only records which exact names will be added.
  if (missingDefinitions.length) notes.unshift(`Will be added to this character's command file when you use "Add definitions & copy route": ${missingDefinitions.join(', ')}.`);
  if (request.airPolicy === 'live-p2-side' && request.posture !== 'grounded') {
    if (family.end && family.mirror) throw new Error('Live P2-side routing needs the recognition-time world endpoint stored by an input parser (map(JNP_input_request_absolute_end)). A buffered native command result cannot know the world facing at recognition after a turn, and p2Dist alone is not a substitute. Use recognition facing, or route from the owner\'s parser request.');
    notes.push(`${family.id} has no horizontal endpoint, so live P2-side orientation does not change it.`);
  }
  return orJoin(variants.map(variant => quote(variant.name)));
}

// --- parser-request source ------------------------------------------------------------------------

function parserCondition(catalog, family, request, caps, notes) {
  const publication = ownerPublication(family);
  if (publication.motionIds.length !== 1) throw new Error(`This character's input parser does not publish ${family.id}${family.origin === 'reference' ? ' (only the built-in catalog lists it)' : ''}.`);
  const motionId = publication.motionIds[0];
  const charge = ownerDependencies(family).some(item => item.kind === 'charge-cleanup');
  if (charge && request.language === 'cns') throw new Error(`${family.id} is a charge route: after it succeeds the parser's JNP_HDBZ_InputClearAcceptedCharge(${motionId}) must clear the charge banks, and CNS cannot call it. Use ZSS output.`);
  if (charge && !caps.chargeCleanup) throw new Error(`${family.id} is a charge route, but the owner's parser does not define JNP_HDBZ_InputClearAcceptedCharge.`);
  if (request.language === 'zss' && !caps.requestActive) throw new Error('The owner\'s parser does not define JNP_HDBZ_InputRequestActive, which the ZSS route calls.');
  // Every requested button/edge must be a variant this owner's parser actually publishes.
  const edges = request.edge === 'either' ? [false, true] : [request.edge === 'release'];
  const buttons = family.buttons.length ? request.buttons.map(button => {
    if (!Object.hasOwn(BUTTON_ID, button)) throw new Error(`The parser publishes buttons x, y, z, a, b, c only; "${button}" is not published.`);
    if (!family.parserRecognized) for (const release of edges) if (!publication.variants.some(variant => variant.publish.button === button && variant.publish.release === release)) throw new Error(`This character's input parser does not publish ${family.id} ${button} ${release ? 'release' : 'press'}.`);
    return BUTTON_ID[button];
  }) : [];
  if (!family.buttons.length && !family.parserOnly && !family.parserRecognized) for (const release of edges) if (!publication.variants.some(variant => variant.publish.release === release)) throw new Error(`This character's input parser does not publish ${family.id} ${release ? 'release' : 'press'}.`);
  const buttonExpr = buttons.length ? orJoin(buttons.map(id => `map(JNP_input_request_button) = ${id}`)) : '';
  const edgeExpr = request.edge === 'press' ? 'map(JNP_input_request_release) = 0' : request.edge === 'release' ? 'map(JNP_input_request_release) = 1' : '';
  if (request.edge !== 'press') notes.push('Release (negative-edge) requests are published only while the player option map(JNP_cfg_negative_edge) is enabled.');
  const active = 'map(JNP_training_input_backend) = 1 && map(JNP_input_request_motion) != 0 && map(JNP_input_request_time) = GameTime';
  let cnsMotion = `map(JNP_input_request_motion) = ${motionId}`;
  let zssMotionSource = 'map(JNP_input_request_motion)';
  const live = request.posture !== 'grounded' && request.airPolicy === 'live-p2-side';
  if (live) {
    const mirrorIds = family.mirror ? ownerPublication(findFamily(catalog, family.mirror)).motionIds : [];
    const mirrorId = mirrorIds.length === 1 ? mirrorIds[0] : undefined;
    // A horizontal family without an owner-published opposite cannot be reinterpreted: refuse, never no-op.
    if (family.end && mirrorId === undefined) throw new Error(`Live P2-side needs this character's input parser to publish the mirrored ${family.mirror || 'opposite-direction'} family.`);
    if (!family.end || mirrorId === undefined) notes.push(`${family.id} has no published horizontal endpoint pair, so live P2-side orientation does not change it.`);
    else {
      if (!caps.storesEndpoint) throw new Error('The owner\'s parser does not store map(JNP_input_request_absolute_end), so live P2-side routing cannot be guaranteed.');
      if (request.language === 'zss' && !caps.resolvedMotion) throw new Error('The owner\'s parser does not define JNP_HDBZ_InputResolvedMotion, which the live ZSS route calls.');
      zssMotionSource = 'call JNP_HDBZ_InputResolvedMotion()';
      // StateType = A is part of the policy clause: grounded consumption always keeps the recognized motion.
      const policy = 'map(JNP_cfg_air_command_side_policy) = 1 && map(JNP_input_request_airborne) && StateType = A && numEnemy && map(JNP_input_request_absolute_end) != 0';
      const toward = 'map(JNP_input_request_absolute_end) * facing * p2Dist X > 0';
      cnsMotion = `((!(${policy}) && map(JNP_input_request_motion) = ${motionId}) || ((${policy}) && (map(JNP_input_request_motion) = ${motionId} || map(JNP_input_request_motion) = ${mirrorId}) && ${family.end === 'forward' ? '' : '!'}(${toward})))`;
      notes.push('Live P2-side uses the parser\'s stored recognition-time endpoint and follows each player\'s map(JNP_cfg_air_command_side_policy); grounded consumption and policy 0 keep the recognized motion.');
    }
  } else if (request.posture !== 'grounded') {
    notes.push('Recognition-facing lock: the stored request motion is used as recognized, regardless of the player\'s air-side policy map.');
  }
  return { cns: andJoin([active, cnsMotion, buttonExpr, edgeExpr]), zss: { motionSource: zssMotionSource, motion: `$motion = ${motionId}`, rest: andJoin([buttonExpr, edgeExpr]) }, motionId, charge };
}

// --- text -----------------------------------------------------------------------------------------

function cnsText({ label, stateNo, guards, trigger }) {
  const lines = [`[State -1, ${label}]`, 'type = ChangeState', `value = ${stateNo}`];
  for (const guard of guards) lines.push(`triggerall = ${guard}`);
  lines.push(`trigger1 = ${trigger}`);
  return lines.join('\n');
}

function buildCommandRoute(input = {}) {
  const request = {
    familyId: input.familyId, buttons: Array.isArray(input.buttons) ? input.buttons : input.buttons ? [input.buttons] : [],
    edge: input.edge || 'press', posture: input.posture || 'grounded', airPolicy: input.airPolicy || 'recognition-facing',
    source: input.source || 'native', gate: input.gate || 'ctrl', language: input.language || languageForFile(input.destination?.file),
    stateNo: input.stateNo ?? input.destination?.stateNo, label: String(input.label || input.destination?.label || '').replace(/[\]\r\n]/g, ' ').trim()
  };
  const errors = validate(request);
  if (errors.length) throw new Error(errors.join(' '));
  const catalog = input.catalog;
  const family = findFamily(catalog, request.familyId);
  if (!family) throw new Error(`The catalog has no command family "${request.familyId}".`);
  if (family.buttons.length && !request.buttons.length) throw new Error(`Choose at least one button for ${family.id}.`);
  const ownerHasParser = Boolean(input.ownerHasParser);
  const caps = parserCapabilities(ownerHasParser ? catalog.parser : null);
  const support = ownerSupport(family, { ownerHasParser, ownerFamilyIds: new Set(input.ownerFamilyIds || []) });
  const notes = [], warnings = [], missingDefinitions = [], dependencies = family.dependencies.map(item => ({ ...item }));
  const engine = { stable: family.engine.stable, nightly: family.engine.nightly, reasons: family.engine.reasons };
  if (input.nightly === false && !engine.stable) throw new Error(`${family.id}: ${engine.reasons.join(' ')}`);
  if (input.nightly === true && !engine.nightly) throw new Error(`${family.id}: ${engine.reasons.join(' ')}`);
  if (request.posture === 'grounded' && request.airPolicy === 'live-p2-side') notes.push('Grounded routes always use the facing at recognition; live P2-side applies only in the air.');

  let routeExpr, zssBody;
  const posture = POSTURES[request.posture], gate = GATES[request.gate];
  const distance = distanceGate(input), distanceExpr = distance ? distance.expression : '';
  if (distance) notes.push(`P2 distance gate: ${distance.label}, inclusive; the route is skipped when no opponent exists.`);
  if (request.source === 'parser-request') {
    if (!caps.present) throw new Error(`This character has no input-parser script, so ${family.id} cannot be routed from a parser request. ${support.guidance.join(' ')}`.trim());
    const parsed = parserCondition(catalog, family, request, caps, notes);
    routeExpr = parsed.cns;
    zssBody = { prelude: ['let requestActive = call JNP_HDBZ_InputRequestActive();', `let motion = ${parsed.zss.motionSource};`], condition: andJoin(['$requestActive', posture, gate, distanceExpr, parsed.zss.motion, parsed.zss.rest]), cleanup: parsed.charge ? `call JNP_HDBZ_InputClearAcceptedCharge(${parsed.motionId});` : '' };
    notes.push('Consumption reads the parser\'s published request for this tick; the native command buffer remains the only lifetime authority (no extra window is added).');
  } else {
    if (family.parserOnly) throw new Error(`${family.id} is recognized only by an input-parser script; it has no native command to route. ${support.guidance.join(' ')}`.trim());
    routeExpr = nativeCondition(family, request, notes, warnings, missingDefinitions);
    zssBody = { prelude: [], condition: andJoin([posture, gate, distanceExpr, routeExpr]), cleanup: '' };
    if (caps.present && support.parserDependent) warnings.push(`This character's input parser normally publishes ${family.id}; reading the native command directly bypasses its ${support.startGate ? `start-window gate (${support.startGate.requirement})` : 'publication rules'}${support.mappedOnly ? ' and its mapped optional-diagonal recognizer' : ''}. Use the parser-request source to keep them.`);
    // Without an HDBZ parser these are optional HDBZ timing details, never requirements: a plain native
    // command works on its own. They are informational notes, not warnings.
    else if (support.missingOnOwner) notes.push(...support.guidance.filter(item => !item.startsWith('Not defined in this character\'s command file')).map(item => `Optional (not required): ${item}`));
  }

  const condition = andJoin([posture, gate, distanceExpr, routeExpr]);
  const label = request.label || `${family.id}${request.buttons.length ? ' ' + request.buttons.join('/') : ''}`;
  let text = condition;
  if (request.stateNo !== undefined && request.stateNo !== '') {
    const stateNo = String(request.stateNo).trim();
    if (request.language === 'cns') text = cnsText({ label, stateNo, guards: [posture, gate, distanceExpr].filter(Boolean), trigger: routeExpr });
    else {
      // Clear accepted charge banks before the state change so the cleanup cannot be skipped.
      const body = [`# ${label}`, ...zssBody.prelude, `if ${zssBody.condition} {`];
      if (zssBody.cleanup) body.push(`\t${zssBody.cleanup}`);
      body.push(`\tchangeState{value: ${stateNo}}`, '}');
      text = body.join('\n');
    }
  } else if (request.language === 'zss' && zssBody.prelude.length) {
    if (zssBody.cleanup) throw new Error(`${family.id} needs its charge cleanup to run with the state change; enter a target state so the route can include it.`);
    text = [...zssBody.prelude, zssBody.condition].join('\n');
  }
  return {
    familyId: family.id, language: request.language, source: request.source, posture: request.posture, airPolicy: request.airPolicy, edge: request.edge, buttons: request.buttons,
    condition, text, notes, warnings, missingDefinitions, distance: distance ? { min: distance.min, max: distance.max, units: distance.units, label: distance.label } : null, dependencies, support, engine, timing: family.timing
  };
}

module.exports = { buildCommandRoute, routeChoices, parserCapabilities, languageForFile, POSTURES, GATES, AIR_POLICIES, SOURCES, LANGUAGES };
