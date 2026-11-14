'use strict';

// Timed command catalog.
//
// Recognition data comes from authored native [Command] definitions. Publication / consumption
// dependencies come from the owning input-parser ZSS when one exists. A portable, source-derived
// HDBZ reference (command_timed_catalog_hdbz.js) is built in so plain characters such as KFM can use
// the catalog without TemplateZ2 on disk.
//
// Engine facts (IKEMEN GO v1.0.0 src and Nightly fb269c9 src, identical unless noted):
// - compiler.go: `steptime <= 0` falls back to `time`; `buffer.time` is clamped to >= 1;
//   autogreater / buffer.hitpause / buffer.pauseend / buffer.shared are booleans.
// - input.go Command.Step: a completed result stays active for buffer.time ticks; buffer.hitpause and
//   buffer.pauseend freeze that countdown during hitpause and Pause/SuperPause.
// - input.go CommandList.ClearName: buffer.shared clears in-progress same-named definitions when one
//   completes (their buffer time is kept).
// - input.go: hold-only commands force buffer.time to 1.
// - input.go ReadCommandSymbols: the '*' broad-direction modifier exists only in Nightly (1.0.0 rejects
//   it); Nightly rejects '$' combined with '*'.
// Nothing here invents timing: every number is authored or the engine's documented fallback.

const crypto = require('crypto');
const { parseCommands, splitSteps, nativeInputAtoms } = require('./command_movelist_model');

const DIRECTION_RE = /(?:DB|DF|UB|UF|DL|DR|UL|UR|[BDFULRN])$/;
const BUTTON_RE = /^[xyzabcswdm]$/;
const BUTTON_IDS = Object.freeze({ 1: 'x', 2: 'y', 3: 'z', 4: 'a', 5: 'b', 6: 'c' });
const HORIZONTAL_MIRROR = { F: 'B', B: 'F', L: 'R', R: 'L', DF: 'DB', DB: 'DF', UF: 'UB', UB: 'UF', DL: 'DR', DR: 'DL', UL: 'UR', UR: 'UL' };
const ENGINE_SOURCES = Object.freeze({
  stable: 'IKEMEN GO v1.0.0 (src/compiler.go, src/input.go)',
  nightly: 'IKEMEN GO Nightly fb269c9 (2026-11-05; src/compiler.go, src/input.go)'
});

const hash = text => crypto.createHash('sha256').update(String(text || '')).digest('hex');
const atomCore = atom => (String(atom).match(/(?:DB|DF|UB|UF|DL|DR|UL|UR|[BDFULRNxyzabcswdm])$/) || [''])[0];
const isDirection = core => DIRECTION_RE.test(core) && !BUTTON_RE.test(core);

function stepAtoms(step) {
  return nativeInputAtoms(step).map(atom => ({ raw: atom, core: atomCore(atom), modifiers: atom.slice(0, atom.length - atomCore(atom).length) }));
}

function engineGate(steps, unparsed) {
  const reasons = []; let stable = true, nightly = true;
  const atoms = steps.flat();
  if (atoms.some(atom => atom.modifiers.includes('*'))) {
    stable = false;
    reasons.push("Uses the '*' broad-direction modifier: Nightly fb269c9 accepts it, IKEMEN GO v1.0.0 rejects it.");
    if (atoms.some(atom => atom.modifiers.includes('*') && atom.modifiers.includes('$'))) { nightly = false; reasons.push("Nightly rejects '$' and '*' on the same input."); }
  }
  if (unparsed) { stable = false; nightly = false; reasons.push('A step is not native command syntax that this catalog can verify.'); }
  return { stable, nightly, reasons };
}

function routeKind(steps) {
  const first = steps[0] || [];
  if (!first.length) return 'unknown';
  if (first.every(atom => /^~\d+/.test(atom.raw))) return 'charge';
  if (first.some(atom => isDirection(atom.core) && /^~(?!\d)/.test(atom.modifiers))) return 'release-start';
  return 'press-start';
}

function classify(steps) {
  const directions = steps.map(step => step.some(atom => isDirection(atom.core)));
  const buttons = steps.map(step => step.some(atom => BUTTON_RE.test(atom.core)));
  if (steps.length === 1) return steps[0].every(atom => atom.modifiers.includes('/')) ? 'hold' : buttons[0] ? 'button' : 'direction';
  if (buttons.slice(0, -1).some(Boolean)) return 'ordered-sequence';
  if (directions.some(Boolean) && buttons[buttons.length - 1]) return 'motion-button';
  if (directions.some(Boolean)) return 'movement';
  return 'button-sequence';
}

function orientation(steps) {
  const cores = steps.flat().map(atom => atom.core).filter(isDirection);
  const relative = cores.some(core => /[FB]/.test(core)), absolute = cores.some(core => /[LR]/.test(core));
  return relative && absolute ? 'mixed' : relative ? 'facing-relative' : absolute ? 'absolute' : 'neutral';
}

function horizontalEnd(steps) {
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const core = steps[index].map(atom => atom.core).find(item => isDirection(item) && /[FBLR]/.test(item));
    if (core) return /F/.test(core) ? 'forward' : /B/.test(core) ? 'back' : /R/.test(core) ? 'right' : 'left';
  }
  return null;
}

function directionSignature(steps, mirror = false) {
  return steps.map(step => step.filter(atom => isDirection(atom.core))
    .map(atom => atom.modifiers.replace(/\d+/g, '') + (mirror ? HORIZONTAL_MIRROR[atom.core] || atom.core : atom.core)).join('+')).filter(Boolean).join(',');
}

function nameParts(name, steps, kind) {
  const last = steps[steps.length - 1] || [];
  const buttons = last.filter(atom => BUTTON_RE.test(atom.core));
  const release = buttons.length > 0 && buttons.every(atom => atom.modifiers.includes('~'));
  let stem = name;
  if (release && stem.endsWith('_release')) stem = stem.slice(0, -'_release'.length);
  const suffix = buttons.length ? '_' + buttons.map(atom => atom.core).join('_') : '';
  // Ordered sequences carry their buttons as part of the physical identity (e.g. seq_x_z_f_c_s).
  const separable = kind === 'motion-button' && suffix && stem.toLowerCase().endsWith(suffix.toLowerCase()) && stem.length > suffix.length;
  if (separable) stem = stem.slice(0, -suffix.length);
  return { stem, buttons: separable ? [buttons.map(atom => atom.core).join('_')] : [], edge: buttons.length ? (release ? 'release' : 'press') : null };
}

function definitionModel(document, command) {
  const entries = command.entries || {};
  const rawSteps = splitSteps(command.command), steps = rawSteps.map(stepAtoms);
  const unparsed = rawSteps.some((step, index) => !steps[index].length);
  const authored = key => Object.prototype.hasOwnProperty.call(entries, key);
  const declaredStep = authored('steptime') ? Number.parseInt(entries.steptime.value, 10) : document.defaults.stepTime;
  const holdOnly = steps.length > 0 && steps.every(step => step.length && step.every(atom => atom.modifiers.includes('/')));
  return {
    name: command.name, command: command.command, line: command.startLine,
    text: document.lines.slice(command.startLine, command.endLine).join(document.text.match(/\r\n|\r|\n/)?.[0] || '\n').trimEnd(),
    time: command.time,
    stepTime: Number.isFinite(declaredStep) && declaredStep > 0 ? declaredStep : command.time,
    stepTimeSource: authored('steptime') && declaredStep > 0 ? 'authored' : Number.isFinite(declaredStep) && declaredStep > 0 ? 'defaults' : 'engine fallback to time',
    bufferTime: holdOnly ? 1 : Math.max(1, command.bufferTime),
    bufferTimeSource: holdOnly ? 'engine forces 1 for hold-only commands' : authored('buffer.time') ? 'authored' : 'defaults',
    autoGreater: Boolean(command.autoGreater), bufferHitpause: Boolean(command.bufferHitpause), bufferPauseend: Boolean(command.bufferPauseend), bufferShared: Boolean(command.bufferShared),
    route: routeKind(steps), engine: engineGate(steps, unparsed),
    _steps: steps
  };
}

// ---- input parser (ZSS) analysis ------------------------------------------------------------

function functionBody(lines, name) {
  const start = lines.findIndex(line => new RegExp(`^\\s*\\[Function\\s+${name}\\b`, 'i').test(line));
  if (start < 0) return null;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) if (/^\s*\[/.test(lines[index])) { end = index; break; }
  return { start, end, text: lines.slice(start + 1, end).map(line => line.replace(/#.*$/, '')).join(' ').replace(/\s+/g, ' ') };
}

function motionList(text, variable) {
  const match = new RegExp(`let\\s+${variable}\\s*=\\s*([^;]+);`).exec(text || '');
  return match ? [...match[1].matchAll(/\$motion\s*=\s*(\d+)/g)].map(item => +item[1]) : [];
}

function analyzeInputParser(text, filename = '') {
  if (!text || !/JNP_HDBZ_InputPublish/.test(text)) return null;
  const lines = String(text).split(/\r\n|\r|\n/);
  const publish = new Map(), references = new Map(), recognizers = new Map(), names = new Map(), consumedCalls = new Set();
  lines.forEach((raw, line) => {
    const code = raw.replace(/#.*$/, '');
    if (consumedCalls.has(line)) return;
    for (const match of code.matchAll(/command\s*=\s*"([^"]+)"/gi)) { if (!references.has(match[1])) references.set(match[1], []); references.get(match[1]).push(line); }
    // `[} else ]if command = "name" [&& map(JNP_cfg_negative_edge)] {` directly followed by a literal publish call.
    const negativeEdgeGated = /&&\s*map\(JNP_cfg_negative_edge\)/i.test(code);
    const header = /^\s*(?:\}\s*else\s+)?if\s+command\s*=\s*"([^"]+)"\s*\{\s*$/i.exec(code.replace(/\s*&&\s*map\(JNP_cfg_negative_edge\)/i, ''));
    if (header) {
      let next = line + 1;
      while (next < lines.length && !lines[next].replace(/#.*$/, '').trim()) next += 1;
      const call = /^\s*call\s+JNP_HDBZ_InputPublish\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)\s*;?\s*$/i.exec((lines[next] || '').replace(/#.*$/, ''));
      if (call) { consumedCalls.add(next); if (!publish.has(header[1])) publish.set(header[1], { name: header[1], motionId: +call[1], buttonId: +call[2], release: call[3] === '1', line, negativeEdgeGated }); }
      return;
    }
    const charged = /JNP_input_charge_(?:final|multi)_motion\)\s*:=\s*(\d+)/.exec(code);
    if (charged && +charged[1] > 0) { const id = +charged[1]; if (!recognizers.has(id)) recognizers.set(id, { motionId: id, kind: 'charge-recognizer', line }); }
    const mapped = /JNP_HDBZ_InputPublishMappedButtons\s*\(\s*(\d+)\s*\)/.exec(code);
    if (mapped) { const id = +mapped[1]; if (!recognizers.has(id)) recognizers.set(id, { motionId: id, kind: 'mapped-recognizer', line }); }
    const literal = /JNP_HDBZ_InputPublish\s*\(\s*(\d+)\s*,/.exec(code);
    if (literal) { const id = +literal[1]; if (!recognizers.has(id)) recognizers.set(id, { motionId: id, kind: 'zss-recognizer', line }); }
  });
  // Header comment names such as "# 1 qcf, 2 qcb" and "# 26 charge_b_f" and "`konami_code`".
  for (const raw of lines.slice(0, 40)) {
    if (!/^\s*#/.test(raw)) continue;
    for (const match of raw.matchAll(/\b(\d+)\s+([a-z][a-z0-9_]*)(?=[,.]|\s*$)/g)) if (!names.has(+match[1])) names.set(+match[1], match[2]);
    const quoted = /\b(\d+)\b[^`]*`([a-z][a-z0-9_]*)`/.exec(raw); if (quoted && !names.has(+quoted[1])) names.set(+quoted[1], quoted[2]);
  }
  const startWindow = new Map();
  const allows = functionBody(lines, 'JNP_HDBZ_InputStartWindowAllows');
  if (allows) for (const match of allows.text.matchAll(/cond\(\s*((?:\$motion\s*=\s*\d+\s*(?:\|\|\s*)?)+),\s*(.+?)\s*,\s*(?=cond\(|1\s*\))/g)) {
    for (const id of [...match[1].matchAll(/\d+/g)].map(item => +item[0])) if (!startWindow.has(id)) startWindow.set(id, { motionId: id, requirement: match[2].trim(), mappedOnly: match[2].trim() === '0', line: allows.start });
  }
  const publishBody = functionBody(lines, 'JNP_HDBZ_InputPublish');
  const forward = new Set(motionList(publishBody?.text, 'forwardFamily')), back = new Set(motionList(publishBody?.text, 'backFamily'));
  const charge = new Set(); const clear = functionBody(lines, 'JNP_HDBZ_InputClearAcceptedCharge');
  if (clear) for (const match of clear.text.matchAll(/\$motion\s*=\s*(\d+)/g)) charge.add(+match[1]);
  // Multi-stage charge results are assigned through a variable; the accepted-charge cleanup list is
  // the parser's own authority for which charge motion IDs exist.
  for (const id of charge) if (!recognizers.has(id)) recognizers.set(id, { motionId: id, kind: 'charge-recognizer', line: clear.start });
  const functions = ['JNP_HDBZ_InputRequestActive', 'JNP_HDBZ_InputResolvedMotion', 'JNP_HDBZ_InputClearAcceptedCharge', 'JNP_HDBZ_InputStartWindowAllows'].filter(name => functionBody(lines, name));
  // Authored start deadlines: a fresh cardinal press opens N ticks, releasing a held start opens M ticks
  // (`if command = "down" { map(..._window) := N; }` / `if command = "rlsdown" { ... max(..., M) }`).
  const press = /if\s+command\s*=\s*"down"\s*\{\s*map\(JNP_input_start_down_window\)\s*:=\s*(\d+)\s*;/i.exec(text);
  const release = /if\s+command\s*=\s*"rlsdown"\s*\{\s*map\(JNP_input_start_down_window\)\s*:=\s*max\([^,]+,\s*(\d+)\)/i.exec(text);
  const startDeadlines = press && release ? { press: +press[1], release: +release[1] } : null;
  // Live P2-side routing is only guaranteed when the publisher stores the recognition-time world endpoint.
  const storesEndpoint = Boolean(publishBody && /map\(JNP_input_request_absolute_end\)\s*:=/.test(publishBody.text));
  return { filename, hash: hash(text), publish, references, recognizers, names, startWindow, forward, back, chargeMotions: charge, functions, storesEndpoint, startDeadlines };
}

// ---- Native charge commands -------------------------------------------------------------------
// Every charge motion the input parser recognizes with maps has a plain native IKEMEN equivalent:
// `~N$B, F, x` means "hold back (diagonals count) for N ticks, release, then forward, then x".
// N (charge threshold), the grace after leaving the charge, and the multi-stage step window are the
// parser's own authored values; each motion's direction steps are verified against the parser source.
const CHARGE_MOTIONS = Object.freeze([
  { motionId: 26, id: 'charge_b_f', charge: '$B', steps: ['F'], verify: /\$backGrace > 0 && command = "fwd" \{ map\(JNP_input_charge_final_motion\) := 26;/ },
  { motionId: 27, id: 'charge_f_b', charge: '$F', steps: ['B'], verify: /\$forwardGrace > 0 && command = "back" \{ map\(JNP_input_charge_final_motion\) := 27;/ },
  { motionId: 28, id: 'charge_d_u', charge: '$D', steps: ['$U'], verify: /map\(JNP_input_charge_down_grace\) > 0 && \(command = "up" \|\| command = "ufwd" \|\| command = "uback"\) \{ map\(JNP_input_charge_final_motion\) := 28;/ },
  { motionId: 43, id: 'charge_b_f_b_f', charge: '$B', steps: ['F', 'B', 'F'], multi: true, verify: /\$multi = 43 && \(\(\$step = 1 && command = "back"\) \|\| \(\$step = 2 && command = "fwd"\)\)[\s\S]*\$backGrace > 0 && command = "fwd" \{ map\(JNP_input_charge_multi_motion\) := 43;/ },
  { motionId: 44, id: 'charge_f_b_f_b', charge: '$F', steps: ['B', 'F', 'B'], multi: true, verify: /\$multi = 44 && \(\(\$step = 1 && command = "fwd"\) \|\| \(\$step = 2 && command = "back"\)\)[\s\S]*\$forwardGrace > 0 && command = "back" \{ map\(JNP_input_charge_multi_motion\) := 44;/ },
  // Down-back / down-forward charges hold both banks; the native form charges the exact diagonal.
  { motionId: 45, id: 'charge_db_df_db_uf', charge: 'DB', steps: ['DF', 'DB', 'UF'], multi: true, diagonal: true, verify: /\$multi = 45 && \(\(\$step = 1 && command = "dback"\) \|\| \(\$step = 2 && command = "ufwd"\)\)[\s\S]*\$backGrace > 0 && map\(JNP_input_charge_down_grace\) > 0 && command = "dfwd" \{ map\(JNP_input_charge_multi_motion\) := 45;/ },
  { motionId: 46, id: 'charge_df_db_df_ub', charge: 'DF', steps: ['DB', 'DF', 'UB'], multi: true, diagonal: true, verify: /\$multi = 46 && \(\(\$step = 1 && command = "dfwd"\) \|\| \(\$step = 2 && command = "uback"\)\)[\s\S]*\$forwardGrace > 0 && map\(JNP_input_charge_down_grace\) > 0 && command = "dback" \{ map\(JNP_input_charge_multi_motion\) := 46;/ }
]);
const CHARGE_BUTTONS = ['x', 'y', 'z', 'a', 'b', 'c'];

function nativeChargeCommands(parserText, commandText) {
  const text = String(parserText || '').replace(/#[^\n]*/g, '').replace(/\s+/g, ' ');
  const number = re => { const match = re.exec(text); return match ? Number(match[1]) : null; };
  const threshold = number(/map\(JNP_cfg_charge_ticks\) := (\d+);/);
  const policy = number(/map\(JNP_cfg_charge_policy\) := (\d+);/);
  const graceMatch = /let graceMax = cond\(\$policy = 1, (\d+), (\d+)\);/.exec(text);
  const window = number(/map\(JNP_input_charge_multi_timer\) := ([1-9]\d*);/); // skip the reset-to-0 assignments
  if (!threshold || policy === null || !graceMatch || !window) return null;
  const grace = policy === 1 ? Number(graceMatch[1]) : Number(graceMatch[2]);
  // Buffer settings follow the source's own native motion definitions (taken from its qcf_x block).
  const qcf = /\[Command\][^[]*?name\s*=\s*"qcf_x"[^[]*/i.exec(String(commandText || ''));
  const field = key => { const match = qcf && new RegExp(`^\\s*${key.replace('.', '\\.')}\\s*=\\s*(\\d+)`, 'im').exec(qcf[0]); return match ? Number(match[1]) : null; };
  const buffer = ['autogreater', 'buffer.time', 'buffer.hitpause', 'buffer.pauseend'].map(key => [key, field(key)]).filter(([, value]) => value !== null);
  const blocks = [], publish = new Map(), derived = new Map(), verified = [];
  for (const motion of CHARGE_MOTIONS) {
    if (!motion.verify.test(text)) throw new Error(`Native charge synthesis: the parser no longer matches the expected ${motion.id} steps.`);
    verified.push(motion.id);
    // Single-direction charges: release, direction and button all inside the grace (the parser hands the
    // remaining grace to the button). Multi-stage: grace to the first direction, then one window per step.
    const time = motion.multi ? grace + window * motion.steps.length : grace;
    const stepTime = motion.multi ? Math.max(grace, window) : grace;
    const note = motion.multi
      ? `Native charge: hold ${motion.diagonal ? motion.charge : motion.charge.replace('$', '')} ${threshold} ticks, release, then ${motion.steps.map(step => step.replace('$', '')).join(', ')} and a button (native limit ${stepTime} ticks per step, ${time} total; mapped limit ${grace} then ${window}).`
      : `Native charge: hold ${motion.charge.replace('$', '')} ${threshold} ticks, release, then ${motion.steps[0].replace('$', '')} and a button within ${grace} ticks.`;
    CHARGE_BUTTONS.forEach((button, index) => {
      for (const release of [false, true]) {
        const name = `${motion.id}_${button}${release ? '_release' : ''}`;
        blocks.push(['[Command]', `name = "${name}"`, `command = ~${threshold}${motion.charge}, ${motion.steps.join(', ')}, ${release ? '~' : ''}${button}`, `time = ${time}`, `steptime = ${stepTime}`, ...buffer.map(([key, value]) => `${key} = ${value}`)].join('\n'));
        publish.set(name, { name, motionId: motion.motionId, buttonId: index + 1, release, line: 0, negativeEdgeGated: release });
        derived.set(name, note);
      }
    });
  }
  return { text: blocks.join('\n\n'), publish, derived, values: { threshold, grace, window, policy }, verified };
}

// ---- catalog --------------------------------------------------------------------------------

function buildTimedCommandCatalog({ commandText = '', commandFile = '', parserText = '', parserFile = '', origin = 'owner' } = {}) {
  const parser = analyzeInputParser(parserText, parserFile);
  // Reference catalogs gain native charge commands derived from the parser; an owner's own catalog only
  // ever describes what its files really contain.
  let sourceText = commandText, charges = null;
  if (parser && origin !== 'owner') {
    charges = nativeChargeCommands(parserText, commandText);
    if (charges) {
      sourceText = String(commandText).replace(/\s*$/, '') + '\n\n' + charges.text + '\n';
      for (const [name, entry] of charges.publish) if (!parser.publish.has(name)) parser.publish.set(name, entry);
    }
  }
  const document = parseCommands(sourceText, commandFile);
  const families = new Map();
  for (const command of document.commands) {
    if (!command.name || !command.command) continue;
    const definition = definitionModel(document, command);
    const parts = nameParts(command.name, definition._steps, classify(definition._steps));
    if (!families.has(parts.stem)) families.set(parts.stem, { id: parts.stem, variants: new Map(), line: definition.line });
    const family = families.get(parts.stem);
    if (!family.variants.has(command.name)) family.variants.set(command.name, { name: command.name, buttons: parts.buttons, edge: parts.edge, definitions: [] });
    family.variants.get(command.name).definitions.push(definition);
  }
  const list = [...families.values()].map(family => familyModel(family, parser));
  // Parser-only recognizers (no native definition publishes them).
  if (parser) {
    const covered = new Set(list.flatMap(family => family.motionIds));
    for (const recognizer of parser.recognizers.values()) {
      if (covered.has(recognizer.motionId)) {
        const family = list.find(item => item.motionIds.includes(recognizer.motionId));
        family.dependencies.push({ kind: recognizer.kind, motionId: recognizer.motionId, line: recognizer.line });
        continue;
      }
      const id = parser.names.get(recognizer.motionId) || `motion_${recognizer.motionId}`;
      list.push({
        id, kind: 'parser-recognizer', orientation: 'neutral', end: endFromParser(parser, recognizer.motionId), mirror: null, buttons: [], edges: [], routes: [], line: recognizer.line,
        variants: [], motionIds: [recognizer.motionId], parserOnly: true, parserRecognized: true, timing: summarizeTiming([]), engine: { stable: true, nightly: true, reasons: [] },
        dependencies: [{ kind: recognizer.kind, motionId: recognizer.motionId, line: recognizer.line }, ...(parser.chargeMotions.has(recognizer.motionId) ? [{ kind: 'charge-cleanup', motionId: recognizer.motionId, function: 'JNP_HDBZ_InputClearAcceptedCharge' }] : [])]
      });
    }
  }
  linkMirrors(list);
  // Explain derived native charge definitions where they appear.
  if (charges) for (const family of list) for (const variant of family.variants) if (charges.derived.has(variant.name)) {
    family.derived = charges.derived.get(variant.name);
    for (const definition of variant.definitions) definition.derived = family.derived;
  }
  const issues = [];
  const defined = new Set(document.commands.map(command => command.name));
  if (parser) for (const [name, lines] of parser.references) if (!defined.has(name)) issues.push({ severity: 'error', code: 'parser-missing-command', name, line: lines[0], message: `The input parser reads command "${name}", but the command file defines no command with that name.` });
  return {
    origin, source: { file: commandFile, hash: hash(commandText), defaults: document.defaults },
    parser: parser ? { file: parser.filename, hash: parser.hash, functions: parser.functions, storesEndpoint: parser.storesEndpoint, startDeadlines: parser.startDeadlines, publishedNames: parser.publish.size, startWindowMotions: parser.startWindow.size } : null,
    // Every family records whose sources produced it; parser routing trusts only 'owner' families.
    families: list.sort((a, b) => a.line - b.line).map(stripSteps).map(family => ({ ...family, origin: origin === 'owner' ? 'owner' : 'reference' })), issues, engineSources: ENGINE_SOURCES
  };
}

function endFromParser(parser, motionId) {
  if (parser.forward.has(motionId)) return 'forward';
  if (parser.back.has(motionId)) return 'back';
  return null;
}

function familyModel(family, parser) {
  const variants = [...family.variants.values()];
  const all = variants.flatMap(variant => variant.definitions);
  const reference = all.find(definition => definition.route === 'press-start') || all[0];
  const kind = classify(reference._steps);
  const dependencies = [];
  if (parser) for (const variant of variants) {
    const published = parser.publish.get(variant.name);
    if (published) {
      variant.publish = { motionId: published.motionId, buttonId: published.buttonId, button: BUTTON_IDS[published.buttonId] || null, release: published.release, negativeEdgeGated: published.negativeEdgeGated, line: published.line };
      dependencies.push({ kind: 'parser-publish', name: variant.name, motionId: published.motionId, buttonId: published.buttonId, release: published.release, negativeEdgeGated: published.negativeEdgeGated, line: published.line });
      const gate = parser.startWindow.get(published.motionId);
      if (gate && !dependencies.some(item => item.kind === 'start-window' && item.motionId === gate.motionId)) dependencies.push({ kind: 'start-window', motionId: gate.motionId, requirement: gate.requirement, mappedOnly: gate.mappedOnly, line: gate.line });
      if (parser.chargeMotions.has(published.motionId) && !dependencies.some(item => item.kind === 'charge-cleanup' && item.motionId === published.motionId)) dependencies.push({ kind: 'charge-cleanup', motionId: published.motionId, function: 'JNP_HDBZ_InputClearAcceptedCharge' });
    } else if (parser.references.has(variant.name)) {
      dependencies.push({ kind: 'parser-reference', name: variant.name, line: parser.references.get(variant.name)[0] });
    }
  }
  const motionIds = [...new Set(variants.map(variant => variant.publish?.motionId).filter(id => id !== undefined))];
  // The parser's forwardFamily/backFamily lists are the authority for a horizontal endpoint; motions
  // in neither list (e.g. circles) are orientation-neutral at consumption.
  const end = parser && motionIds.length ? endFromParser(parser, motionIds[0]) : horizontalEnd(reference._steps);
  return {
    id: family.id, kind, orientation: orientation(reference._steps), end, mirror: null, line: family.line,
    buttons: [...new Set(variants.flatMap(variant => variant.buttons))], edges: [...new Set(variants.map(variant => variant.edge).filter(Boolean))],
    routes: [...new Set(all.map(definition => definition.route))], variants, motionIds, parserOnly: false,
    timing: summarizeTiming(all), dependencies,
    engine: { stable: all.every(item => item.engine.stable), nightly: all.every(item => item.engine.nightly), reasons: [...new Set(all.flatMap(item => item.engine.reasons))] },
    _signature: directionSignature(reference._steps), _mirrorSignature: directionSignature(reference._steps, true)
  };
}

function linkMirrors(list) {
  const bySignature = new Map();
  for (const family of list) if (family._signature) { if (!bySignature.has(family._signature)) bySignature.set(family._signature, []); bySignature.get(family._signature).push(family); }
  for (const family of list) {
    if (!family.end || !family._mirrorSignature || family._mirrorSignature === family._signature) continue;
    const other = (bySignature.get(family._mirrorSignature) || []).find(item => item.id !== family.id && item.kind === family.kind && item.end && item.end !== family.end);
    if (other) family.mirror = other.id;
  }
}

function stripSteps(family) {
  const { _signature, _mirrorSignature, ...rest } = family;
  rest.variants = rest.variants.map(variant => ({ ...variant, definitions: variant.definitions.map(({ _steps, ...definition }) => definition) }));
  return rest;
}

function summarizeTiming(definitions) {
  const unique = key => [...new Set(definitions.map(definition => definition[key]))];
  return { time: unique('time'), stepTime: unique('stepTime'), bufferTime: unique('bufferTime'), bufferHitpause: unique('bufferHitpause'), bufferPauseend: unique('bufferPauseend'), bufferShared: unique('bufferShared'), autoGreater: unique('autoGreater'), definitions: definitions.length };
}

// ---- owner context, reference merge and lookups -----------------------------------------------

const variantOrigin = (family, variant) => variant.origin || family.origin || 'owner';
const sameSlot = (a, b) => (a.buttons[0] || '') === (b.buttons[0] || '') && a.edge === b.edge;

// Combine an owner's own catalog with a reference catalog.
// - Family identity is reconciled case-insensitively (KFM "QCF" <-> reference "qcf"), but command names
//   stay exact: the owner's own variant (e.g. QCF_x) always wins its button/edge slot, and reference
//   variants are attached only for slots the owner does not define (they keep their reference names and
//   are marked origin 'reference', i.e. "not in this character's command file").
// - Distinct-case owner families are never merged with each other. A reference family attaches to the
//   exact-case owner family, else to the single case-insensitive match; if several owner families differ
//   only by case it stays separate and is flagged ambiguous.
// - Reference dependencies are kept separately (origin 'reference') so they inform guidance for owners
//   without a parser but never count as the owner's own parser publications.
function mergeCatalogs(owner, reference) {
  if (!reference) return owner;
  if (!owner) return reference;
  const ownerFamilies = owner.families.map(family => ({ ...family, origin: 'owner', variants: family.variants.map(variant => ({ ...variant, origin: 'owner' })), dependencies: family.dependencies.map(item => ({ ...item, origin: item.origin || 'owner' })) }));
  const byLower = new Map();
  for (const family of ownerFamilies) { const key = family.id.toLowerCase(); if (!byLower.has(key)) byLower.set(key, []); byLower.get(key).push(family); }
  const extras = [];
  for (const source of reference.families) {
    const referenceFamily = { ...source, origin: 'reference', variants: source.variants.map(variant => ({ ...variant, origin: 'reference' })), dependencies: source.dependencies.map(item => ({ ...item, origin: 'reference' })) };
    const candidates = byLower.get(source.id.toLowerCase()) || [];
    const target = candidates.find(family => family.id === source.id) || (candidates.length === 1 ? candidates[0] : null);
    if (!target || referenceFamily.parserOnly) {
      if (candidates.length > 1 && !target) referenceFamily.ambiguousOwnerCase = candidates.map(family => family.id);
      extras.push(referenceFamily);
      continue;
    }
    // An owner family its parser recognizes without native commands (e.g. a map-based charge) gains the
    // reference's native definitions; it keeps its parser route (parserRecognized + motionIds).
    if (target.parserOnly) {
      Object.assign(target, { parserOnly: false, kind: source.kind, orientation: source.orientation, end: target.end || source.end, timing: source.timing, routes: source.routes, derived: source.derived });
    }
    target.reference = { id: source.id, timing: source.timing, routes: source.routes, provenance: reference.provenance || null };
    for (const variant of referenceFamily.variants) if (!target.variants.some(own => sameSlot(own, variant))) target.variants.push(variant);
    target.buttons = [...new Set([...target.buttons, ...source.buttons])];
    target.edges = [...new Set([...target.edges, ...source.edges])];
    if (!target.end) target.end = source.end;
    if (!target.mirror && source.mirror) target.mirror = source.mirror;
    target.dependencies = [...target.dependencies, ...referenceFamily.dependencies];
  }
  return { ...owner, reference: { origin: reference.origin, provenance: reference.provenance || null, parser: reference.parser ? { startDeadlines: reference.parser.startDeadlines || null } : null }, families: [...ownerFamilies, ...extras] };
}

// How usable a family is for one owner. With an owner parser only the owner's own dependencies count;
// without one, the reference's parser dependencies describe what this owner is missing.
function ownerSupport(family, { ownerHasParser = false, ownerFamilyIds = new Set() } = {}) {
  const dependencies = family.dependencies.filter(item => !ownerHasParser || item.origin !== 'reference');
  const parserDependent = dependencies.some(item => ['parser-publish', 'start-window', 'mapped-recognizer', 'zss-recognizer', 'charge-cleanup'].includes(item.kind));
  const mappedOnly = dependencies.some(item => item.mappedOnly || item.kind === 'mapped-recognizer');
  const startGate = dependencies.find(item => item.kind === 'start-window' && !item.mappedOnly);
  const present = ownerFamilyIds.has(family.id);
  const guidance = [];
  let nativeUsable = !family.parserOnly && family.variants.length > 0;
  let parserRoute = ownerHasParser && parserDependent;
  if (family.parserOnly) {
    guidance.push(ownerHasParser
      ? 'Recognized only by the owner\'s input parser ZSS; route it through the published request.'
      : 'Recognized only by an input-parser script (it keeps state in maps), and this character has none. There is no native [Command] form of it to add or route here.');
    nativeUsable = false;
  } else if (parserDependent && !ownerHasParser) {
    if (mappedOnly) guidance.push('The native definitions work on their own and accept the authored cardinal and diagonal paths. An input-parser script can additionally let each correctly ordered optional diagonal refresh the step window; that refinement is optional.');
    if (startGate) guidance.push(`The native definitions work on their own. An input-parser script can additionally separate a fresh-press start from a held-release start (start-window map ${startGate.requirement}); that refinement is optional, and the native held-start pair reproduces it without maps.`);
  }
  const missingVariants = family.variants.filter(variant => variantOrigin(family, variant) === 'reference').map(variant => variant.name);
  if (missingVariants.length && !family.parserOnly) guidance.push(`Not defined in this character's command file yet: ${missingVariants.length > 6 ? missingVariants.slice(0, 6).join(', ') + ', …' : missingVariants.join(', ')}. Add the authored native definitions before routing them.`);
  return { present, nativeUsable, parserRoute, parserDependent, mappedOnly, startGate: startGate || null, missingOnOwner: parserDependent && !ownerHasParser, guidance };
}

// Exact id first; otherwise the single family whose id matches case-insensitively.
function findFamily(catalog, id) {
  const families = catalog?.families || [];
  const exact = families.find(family => family.id === id);
  if (exact || typeof id !== 'string') return exact || null;
  const loose = families.filter(family => family.id.toLowerCase() === id.toLowerCase());
  return loose.length === 1 ? loose[0] : null;
}

function selectVariants(family, { buttons = [], edge = 'press' } = {}) {
  const wanted = edge === 'either' ? ['press', 'release'] : [edge];
  if (!family.buttons.length) return { variants: family.variants.filter(variant => variant.edge === null || wanted.includes(variant.edge)), missing: [] };
  const variants = family.variants.filter(variant => variant.buttons.length && buttons.includes(variant.buttons[0]) && wanted.includes(variant.edge));
  const missing = [];
  for (const button of buttons) for (const want of wanted) if (!family.variants.some(variant => variant.buttons[0] === button && variant.edge === want)) missing.push(`${button} ${want}`);
  return { variants, missing };
}

// Map-free reproduction of HDBZ's start deadlines with two same-named native definitions (the pattern the
// engine supports directly): a fresh-press route (first direction pressed, press deadline as steptime) and
// a held-release route (first direction released, release deadline as steptime). Deadlines are the
// authored parser values; a native steptime applies to every step, not only the first transition.
function heldStartPairText(text, deadlines) {
  const command = /^(\s*command\s*=\s*)(.*)$/im.exec(text);
  if (!command || !/^~(?!\d)(?:DB|DF|UB|UF|[BDFU])\b/.test(command[2].trim())) return null;
  const withStep = (source, value) => /^\s*steptime\s*=.*$/im.test(source) ? source.replace(/^(\s*steptime\s*=\s*).*$/im, `$1${value}`) : source.replace(/^(\s*command\s*=.*)$/im, `$1\nsteptime = ${value}`);
  const press = withStep(text.replace(command[0], command[1] + command[2].trim().replace(/^~/, '')), deadlines.press);
  const release = withStep(text, deadlines.release);
  return `; Fresh-press start (${deadlines.press}-tick start window)\n${press}\n\n; Held-start release route (${deadlines.release}-tick start window)\n${release}`;
}

function heldStartDeadlines(catalog) {
  return catalog?.parser?.startDeadlines || catalog?.reference?.parser?.startDeadlines || null;
}

// Exact authored [Command] text for chosen variants; same-named route definitions stay together.
// heldStartPair: emit the native fresh-press / held-release pair for start-window families (no maps).
function catalogDefinitionsText(catalog, { familyId, buttons = [], edge = 'press', nightly = false, existingNames = [], heldStartPair = false } = {}) {
  const family = findFamily(catalog, familyId);
  if (!family) throw new Error(`The catalog has no command family "${familyId}".`);
  if (family.parserOnly) throw new Error(`${family.id} is recognized only by an input-parser script; there is no native [Command] definition to insert.`);
  const { variants, missing } = selectVariants(family, { buttons, edge });
  if (missing.length && edge !== 'either') throw new Error(`The authored catalog has no definition for: ${missing.join(', ')}.`);
  if (!variants.length) throw new Error('Choose at least one authored variant.');
  // Only reference definitions are insertable; the owner's own variants are already in its file.
  // In a merged (owner + reference) catalog only reference variants are new; a standalone catalog is
  // itself the insertion source.
  const insertable = catalog.reference ? variants.filter(variant => variantOrigin(family, variant) === 'reference') : variants;
  if (!insertable.length) throw new Error(`${variants.map(variant => variant.name).join(', ')} already come from this character's command file.`);
  const definitions = insertable.flatMap(variant => variant.definitions);
  if (definitions.some(definition => typeof definition.text !== 'string')) throw new Error('These definitions are not available as authored text.');
  const blocked = definitions.find(definition => !(nightly ? definition.engine.nightly : definition.engine.stable));
  if (blocked) throw new Error(`${blocked.name}: ${blocked.engine.reasons.join(' ')}`);
  // Command names are case-sensitive in the engine: only an exact match is already present.
  const existing = new Set(existingNames.map(String));
  const duplicates = insertable.map(variant => variant.name).filter(name => existing.has(name));
  let blocks = definitions.map(definition => definition.text), paired = false;
  if (heldStartPair) {
    const deadlines = heldStartDeadlines(catalog);
    const gated = family.dependencies.some(item => item.kind === 'start-window' && !item.mappedOnly);
    if (!deadlines || !gated) throw new Error(`${family.id} has no authored held-start deadlines to reproduce natively.`);
    const pairs = blocks.map(text => heldStartPairText(text, deadlines));
    if (pairs.some(item => !item)) throw new Error(`${family.id}: a definition does not start from a released direction, so no held-start pair applies.`);
    blocks = pairs; paired = true;
  }
  return { text: blocks.join('\n\n') + '\n', names: insertable.map(variant => variant.name), definitions: definitions.length * (paired ? 2 : 1), duplicates, paired, skippedOwner: variants.filter(variant => !insertable.includes(variant)).map(variant => variant.name) };
}

function catalogSummary(catalog) {
  if (!catalog) return null;
  return {
    origin: catalog.origin, source: catalog.source, parser: catalog.parser, reference: catalog.reference || null, provenance: catalog.provenance || null, issues: catalog.issues || [], engineSources: catalog.engineSources,
    families: catalog.families.map(family => ({
      id: family.id, origin: family.origin || catalog.origin, derived: family.derived || null, parserRecognized: Boolean(family.parserRecognized), kind: family.kind, orientation: family.orientation, end: family.end, mirror: family.mirror, parserOnly: Boolean(family.parserOnly),
      buttons: family.buttons, edges: family.edges, routes: family.routes, motionIds: family.motionIds, line: family.line, engine: family.engine, timing: family.timing,
      dependencies: family.dependencies, support: family.support || null,
      reference: family.reference ? { id: family.reference.id, timing: family.reference.timing } : null, ambiguousOwnerCase: family.ambiguousOwnerCase || null,
      variants: family.variants.map(variant => ({ name: variant.name, origin: variantOrigin(family, variant), buttons: variant.buttons, edge: variant.edge, publish: variant.publish || null, definitions: variant.definitions.map(({ text, ...definition }) => definition) }))
    }))
  };
}

// Compare reference timings shown in Command Maker against parsed authored data.
function verifyKnownTimings(catalog, known = []) {
  return known.map(item => {
    const family = findFamily(catalog, item.familyId);
    if (!family || !family.timing.definitions) return { ...item, status: 'not-in-source' };
    const values = family.timing.stepTime;
    return { ...item, authored: values, status: values.length === 1 && values[0] === item.stepTime ? 'matches' : values.includes(item.stepTime) ? 'partial' : 'differs' };
  });
}

// ---- Owner naming convention ----------------------------------------------------------------------
// The owner's style is learned only from families that exist in both the owner file and the reference
// (e.g. KFM "QCF" <-> reference "qcf"). Reference-only variants are renamed to match before they are
// routed or inserted; the engine compares names case-sensitively, so a name is used exactly once chosen.
function detectNamingConvention(catalog) {
  const votes = { upper: 0, lower: 0, other: 0 }, evidence = [];
  for (const family of catalog?.families || []) {
    // Only motion/sequence families vote: single buttons and directions are lowercase engine tokens in
    // every convention, and names identical in both catalogs carry no style signal.
    if (family.origin !== 'owner' || !family.reference || family.parserOnly || !['motion-button', 'ordered-sequence', 'movement'].includes(family.kind)) continue;
    const own = family.id, ref = family.reference.id;
    if (own === ref && ref.toUpperCase() === ref.toLowerCase()) continue;
    const style = own === ref.toUpperCase() && own !== ref.toLowerCase() ? 'upper' : own === ref.toLowerCase() && own !== ref.toUpperCase() ? 'lower' : 'other';
    votes[style] += 1; if (evidence.length < 6) evidence.push(`${own} ↔ ${ref}`);
  }
  const total = votes.upper + votes.lower + votes.other;
  const stemCase = !total ? 'reference' : votes.upper > votes.lower && votes.upper >= votes.other ? 'upper' : votes.lower >= votes.upper && votes.lower >= votes.other ? 'lower' : 'reference';
  return { stemCase, votes, evidence };
}

function renameDefinitionText(text, from, to) {
  return String(text).replace(/^(\s*name\s*=\s*")([^"]*)(")/im, (match, open, name, close) => name === from ? open + to + close : match);
}

// Returns a catalog copy whose reference-only variants carry owner-style names (variant.referenceName keeps
// the original). Owner variants are never renamed. mode: 'owner' (default) | 'reference'.
function applyNamingConvention(catalog, mode = 'owner') {
  if (!catalog || mode === 'reference' || !catalog.reference) return catalog;
  const convention = detectNamingConvention(catalog);
  const owned = new Set((catalog.families || []).filter(family => family.origin === 'owner').flatMap(family => family.variants.filter(variant => variantOrigin(family, variant) === 'owner').map(variant => variant.name)));
  // Only abbreviation stems (qcf, dp, hcb …) follow the detected case; word stems such as charge_b_f keep
  // their spelling (KFM itself writes QCF_x but upper_x).
  const caseStem = stem => !/^[a-z]{1,4}$/i.test(stem) ? stem : convention.stemCase === 'upper' ? stem.toUpperCase() : convention.stemCase === 'lower' ? stem.toLowerCase() : stem;
  const families = catalog.families.map(family => {
    const stem = family.origin === 'owner' ? family.id : caseStem(family.id);
    const referenceStem = family.reference ? family.reference.id : family.id;
    if (family.parserOnly) return family;
    const variants = family.variants.map(variant => {
      if (variantOrigin(family, variant) !== 'reference' || !variant.name.startsWith(referenceStem)) return variant;
      const name = stem + variant.name.slice(referenceStem.length);
      if (name === variant.name || owned.has(name)) return variant; // never collide with an owner command
      return { ...variant, name, referenceName: variant.name, definitions: variant.definitions.map(definition => ({ ...definition, name, text: typeof definition.text === 'string' ? renameDefinitionText(definition.text, variant.name, name) : definition.text })) };
    });
    return { ...family, variants };
  });
  return { ...catalog, naming: { mode: 'owner', ...convention }, families };
}

// Portable reference: the same catalog shape with machine paths replaced by provenance-relative names.
function serializeReference(catalog, provenance) {
  const relative = { [catalog.source.file]: provenance.commandFile, [catalog.parser?.file || '']: provenance.parserFile };
  return {
    origin: 'hdbz-reference', provenance,
    source: { ...catalog.source, file: relative[catalog.source.file] || provenance.commandFile },
    parser: catalog.parser ? { ...catalog.parser, file: provenance.parserFile } : null,
    families: catalog.families, issues: catalog.issues.map(issue => ({ ...issue })), engineSources: catalog.engineSources
  };
}

function builtInReference() {
  const data = require('./command_timed_catalog_hdbz');
  return { ...data, families: data.families.map(family => ({ ...family, origin: 'reference' })) };
}

module.exports = { detectNamingConvention, applyNamingConvention, variantOrigin, buildTimedCommandCatalog, analyzeInputParser, serializeReference, builtInReference, mergeCatalogs, ownerSupport, catalogDefinitionsText, catalogSummary, findFamily, selectVariants, verifyKnownTimings, ENGINE_SOURCES, BUTTON_IDS };
