'use strict';

const crypto = require('crypto');
const { wrapBlock, scanLinks, planUpdate } = require('./authoring_links');
const { parseCollisionReferences } = require('./collision_reference_authority');
const { maskSource } = require('./state_transfer_model');
const { formatNumber } = require('./sizebox');
const {
  INVOKE_TYPE, createGeneratedCodeSnapshot, projectGeneratedCodeSnapshot, authorizeGeneratedCodeIntent
} = require('./generated_code_authority');

const TOOL = 'ikemaker.pushbox';
const PROFILE_SCHEMA = 'ikemaker.pushbox-profile.v1';
const BINDING_SCHEMA = 'ikemaker.pushbox-binding.v1';
const ROLES = Object.freeze({ size: 'size-override', width: 'width', playerpush: 'playerpush' });
const CAPABILITIES = Object.freeze({ size: 'size', width: 'width', playerpush: 'playerPush' });
const CONTROLLERS = Object.freeze({ size: 'OverrideClsn', width: 'Width', playerpush: 'PlayerPush' });
const MAX_ELEMENTS = 128;
const MAX_SOURCE_BYTES = 4 * 1024 * 1024;
const MAX_BLOCK_BYTES = 32 * 1024;
const MAX_INTERACTIONS = 16;
const TOKEN = /^[a-z0-9_.:-]{1,128}$/i;
const INTEGER = /^[+-]?\d+$/;
const DECIMAL = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/;
const STATE_MIN = -2147483648;
const STATE_MAX = 2147483647;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

function requireText(value, label, limit = 2048) {
  if (typeof value !== 'string' || !value.trim() || value.length > limit || /[\x00-\x1f\x7f]/.test(value)) {
    throw new Error(`${label} is required.`);
  }
  return value;
}

function requireId(value, label) {
  if (typeof value !== 'string' || !TOKEN.test(value)) throw new Error(`${label} must be a stable identifier.`);
  return value;
}

function requireInt(value, label, minimum = STATE_MIN) {
  if (!Number.isInteger(value) || value < minimum || value > STATE_MAX) throw new Error(`${label} is outside the supported integer range.`);
  return value || 0;
}

function requireCoordinates(values, count, label) {
  if (!Array.isArray(values) || values.length !== count || Array.from(values).some(value => typeof value !== 'number' || !Number.isFinite(Math.fround(value)))) {
    throw new Error(`${label} requires ${count} finite coordinates.`);
  }
  return Object.freeze(values.map(value => value || 0));
}

function normalizeRecipe(recipe = {}) {
  const { kind } = recipe;
  if (kind === 'size') return Object.freeze({ kind, rect: requireCoordinates(recipe.rect, 4, 'Size') });
  if (kind === 'width') {
    const player = recipe.player === undefined ? undefined : requireCoordinates(recipe.player, 2, 'Player width');
    const edge = recipe.edge === undefined ? undefined : requireCoordinates(recipe.edge, 2, 'Edge width');
    if (!player && !edge) throw new Error('Width requires a player or screen-edge adjustment.');
    return Object.freeze({ kind, ...(player && { player }), ...(edge && { edge }) });
  }
  if (kind === 'playerpush') {
    const value = recipe.value === undefined ? undefined : requireInt(recipe.value, 'PlayerPush value', 0);
    if (value !== undefined && value > 1) throw new Error('PlayerPush value must be 0 or 1.');
    const priority = recipe.priority === undefined ? undefined : requireInt(recipe.priority, 'PlayerPush priority');
    const affectTeam = recipe.affectTeam === undefined ? undefined : String(recipe.affectTeam).toUpperCase();
    if (affectTeam !== undefined && !['E', 'F', 'B'].includes(affectTeam)) throw new Error('PlayerPush team must be E, F or B.');
    if (value === undefined && priority === undefined && affectTeam === undefined) throw new Error('PlayerPush requires a value, priority or affected team.');
    return Object.freeze({ kind, ...(value !== undefined && { value }), ...(priority !== undefined && { priority }), ...(affectTeam && { affectTeam }) });
  }
  throw new Error('Choose a Size, Width or PlayerPush recipe.');
}

function sizeRecipeRemovesBox(recipe) {
  return recipe?.kind === 'size' && Array.isArray(recipe.rect) && recipe.rect.length === 4
    && Array.from(recipe.rect).every(value => typeof value === 'number' && Math.fround(value) === 0);
}

function createPushboxProfile({ schema, profileId, name, recipe, poseHint, createdAt } = {}) {
  if (schema !== undefined && schema !== PROFILE_SCHEMA) throw new Error('The push-box profile format is unsupported.');
  if (poseHint !== undefined && !['stand', 'crouch', 'air', 'down'].includes(poseHint)) throw new Error('Unknown push-box pose.');
  return Object.freeze({
    schema: PROFILE_SCHEMA,
    profileId: requireId(profileId, 'Profile ID'),
    name: requireText(name, 'Profile name', 120),
    recipe: normalizeRecipe(recipe),
    ...(poseHint !== undefined && { poseHint }),
    ...(createdAt !== undefined && { createdAt: requireText(createdAt, 'Profile creation time', 64) })
  });
}

function placementLanguage(file, language) {
  return typeof file === 'string' && Boolean(file.trim()) && (language === 'cns' || language === 'zss');
}

function createPushboxBinding({ schema, installationId, profileId, character = {}, air = {}, placement = {}, target = {}, lastParsed } = {}) {
  if (schema !== undefined && schema !== BINDING_SCHEMA) throw new Error('The push-box binding format is unsupported.');
  if (placement.explicit !== true || !placementLanguage(placement.file, placement.language)) throw new Error('Select an explicit CNS or ZSS state source.');
  if (!Array.isArray(air.elements) || !air.elements.length || air.elements.length > MAX_ELEMENTS) throw new Error(`Select 1–${MAX_ELEMENTS} AIR elements.`);
  const elements = Array.from(air.elements, element => Object.freeze({
    index: requireInt(element?.index, 'AIR element', 1),
    anchor: requireText(element?.anchor, 'AIR element anchor', 256)
  })).sort((left, right) => left.index - right.index);
  if (new Set(elements.map(element => element.index)).size !== elements.length) throw new Error('AIR elements must be unique.');
  if (lastParsed !== undefined && (!lastParsed || !/^[a-f0-9]{64}$/.test(lastParsed.revisionDigest))) throw new Error('Invalid last-parsed source revision.');
  return Object.freeze({
    schema: BINDING_SCHEMA,
    installationId: requireId(installationId, 'Installation ID'),
    profileId: requireId(profileId, 'Profile ID'),
    character: Object.freeze({ defIdentity: requireText(character.defIdentity, 'Character DEF identity') }),
    air: Object.freeze({
      airIdentity: requireText(air.airIdentity, 'AIR identity'),
      action: requireInt(air.action, 'AIR action'),
      sourceFingerprint: requireText(air.sourceFingerprint, 'AIR source fingerprint', 256),
      elements: Object.freeze(elements)
    }),
    placement: Object.freeze({
      file: requireText(placement.file, 'State source identity'),
      language: placement.language,
      stateOrHook: requireInt(placement.stateOrHook, 'StateDef'),
      explicit: true
    }),
    target: Object.freeze({
      targetBuildId: requireText(target.targetBuildId, 'Target build', 256),
      capabilityFingerprint: requireText(target.capabilityFingerprint, 'Target capability fingerprint', 256)
    }),
    ...(lastParsed !== undefined && { lastParsed: Object.freeze({ revisionDigest: lastParsed.revisionDigest, status: requireText(lastParsed.status, 'Last-parsed status', 64) }) })
  });
}

function contextProblem(binding, context) {
  if (!context || context.ownerAmbiguous || context.ownerDef !== binding.character.defIdentity) {
    return { status: 'unresolved-owner', reason: 'Choose the binding’s character DEF owner.' };
  }
  if (context.airIdentity !== binding.air.airIdentity || context.sourceFingerprint !== binding.air.sourceFingerprint
      || typeof context.frameFingerprint !== 'function'
      || binding.air.elements.some(({ index, anchor }) => context.frameFingerprint(binding.air.action, index) !== anchor)) {
    return { status: 'needs-remap', reason: 'The AIR identity, revision or element anchors changed. Review and remap the selection.' };
  }
  if (context.targetBuildId !== binding.target.targetBuildId || context.capabilityFingerprint !== binding.target.capabilityFingerprint) {
    return { status: 'needs-review', reason: 'The target engine capability evidence changed. Review the binding for the current build.' };
  }
  return null;
}

function sourceProblem(binding, source) {
  if (!source || typeof source.text !== 'string') return { status: 'missing', reason: 'The linked source file is unavailable.' };
  if (source.file !== binding.placement.file) return { status: 'unresolved-placement', reason: 'The open source does not match the linked file.' };
  if (source.ownerAmbiguous || source.ownerDef !== binding.character.defIdentity) {
    return { status: 'unresolved-owner', reason: 'The state source needs a verified character DEF owner.' };
  }
  if (source.engineLanguage !== binding.placement.language) return { status: 'unresolved-placement', reason: 'The resolved engine syntax does not match the selected source language.' };
  if (Buffer.byteLength(source.text, 'utf8') > MAX_SOURCE_BYTES) return { status: 'unsupported', reason: 'The state source exceeds the bounded review size.' };
  if (/\r(?!\n)/.test(source.text)) return { status: 'unsupported', reason: 'The state source uses unsupported bare CR line breaks.' };
  return null;
}

function signedLiteral(text) {
  if (!INTEGER.test(text)) return undefined;
  const number = Number(text);
  return number >= STATE_MIN && number <= STATE_MAX ? number || 0 : undefined;
}

function stateSections(text, language) {
  const masked = maskSource(text, language);
  const headings = [], sections = [];
  const header = /^[ \t\uFEFF]*\[([^\]\r\n]*)\][ \t]*(?=\r?$)/gm;
  const cnsGrammar = language === 'cns';
  const wrongZss = !cnsGrammar && /^[ \t]*\[state /im.test(masked);
  for (const match of masked.matchAll(header)) {
    const name = match[1];
    if (cnsGrammar && /^state /i.test(name)) continue;
    const state = (cnsGrammar ? /^statedef ([+-]?\d+)\s*$/i : /^\s*statedef\s+([+-]?\d+)\s*(?:;.*)?$/i).exec(name);
    const stateToken = state?.[1];
    const number = stateToken === '+1' ? -10 : signedLiteral(stateToken || '');
    const stateLabel = stateToken === '+1' ? stateToken : String(number);
    headings.push({ start: match.index, bodyStart: match.index + match[0].length, number, stateLabel });
  }
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    if (heading.number === undefined) continue;
    const end = headings[index + 1]?.start ?? text.length;
    const body = masked.slice(heading.bodyStart, end);
    let depth = 0, valid = true;
    if (cnsGrammar) {
      valid = !/^[ \t]*(?!\[)[^\s\r\n][^\r\n]*[{}]|^[ \t]*#/m.test(body);
    } else {
      valid = !wrongZss && !/^[a-z_][a-z0-9_.]*[ \t]*=(?![=])/i.test(body.trimStart());
      for (const character of body) {
        if (character === '{') depth += 1;
        else if (character === '}' && --depth < 0) valid = false;
      }
    }
    sections.push({ ...heading, end, valid: valid && depth === 0 });
  }
  return { masked, sections };
}

function lineAt(text, offset) {
  let line = 1;
  for (let newline = text.indexOf('\n'); newline >= 0 && newline < offset; newline = text.indexOf('\n', newline + 1)) line += 1;
  return line;
}

function listPushboxPlacements({ file, text, language } = {}) {
  if (!placementLanguage(file, language) || typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_SOURCE_BYTES || /\r(?!\n)/.test(text)) return [];
  const { sections } = stateSections(text, language);
  const counts = new Map();
  for (const section of sections) counts.set(section.number, (counts.get(section.number) || 0) + 1);
  let line = 1, newline = text.indexOf('\n');
  return sections.filter(section => section.valid && counts.get(section.number) === 1).map(section => {
    while (newline >= 0 && newline < section.start) {
      line += 1;
      newline = text.indexOf('\n', newline + 1);
    }
    return { stateOrHook: section.number, stateLabel: section.stateLabel, line };
  });
}

function findPlacement(binding, parsed) {
  const choices = parsed.sections.filter(section => section.number === binding.placement.stateOrHook);
  if (choices.length !== 1 || !choices[0].valid) throw new Error('Select one complete, unambiguous StateDef in the explicit source file.');
  return choices[0];
}

function findLink(binding, source) {
  const links = scanLinks(source);
  const matches = links.filter(link => link.tool === TOOL && link.id === binding.installationId);
  let markerCount = 0, start = null;
  for (const marker of source.matchAll(/^[ \t]*(?:#|;|--) IKEMaker (link\b|end link\b)([^\r\n]*)/gm)) {
    const text = marker[2];
    const tokens = text.trim().split(/\s+/);
    let matching = marker[1] === 'end link' && tokens[0] === binding.installationId;
    if (marker[1] === 'link') {
      try {
        const meta = JSON.parse(text.trimStart().slice(3));
        matching = meta?.tool === TOOL && meta?.id === binding.installationId;
      } catch {
        matching = /"tool"\s*:\s*"ikemaker\.pushbox"/.test(text)
          && /"id"\s*:\s*"([^"\s,}]*)/.exec(text)?.[1] === binding.installationId;
      }
    }
    if (matching) {
      markerCount += 1;
      start ??= marker.index;
    }
  }
  if (matches.length > 1 || markerCount > 2) return { status: 'ambiguous', reason: 'Multiple source markers identify this installation.', start };
  if (!matches.length && !markerCount) return { status: 'missing', reason: 'The installation markers are missing.' };
  const link = matches[0];
  if (!link || markerCount !== 2 || link.status === 'incomplete' || link.comment !== (binding.placement.language === 'zss' ? '#' : ';')) {
    return { status: 'incomplete', reason: 'The installation markers are malformed, nested or incomplete.', start };
  }
  return { link };
}

function stripOuterParentheses(expression) {
  let result = expression.trim();
  while (result.startsWith('(') && result.endsWith(')')) {
    let depth = 0, outer = true;
    for (let index = 0; index < result.length - 1; index += 1) {
      if (result[index] === '(') depth += 1;
      if (result[index] === ')' && --depth === 0) { outer = false; break; }
    }
    if (!outer) break;
    result = result.slice(1, -1).trim();
  }
  return result;
}

function splitLogical(expression, operator) {
  const parts = [];
  let depth = 0, start = 0;
  for (let index = 0; index < expression.length; index += 1) {
    const character = expression[index];
    if ('(['.includes(character)) depth += 1;
    else if (')]'.includes(character)) depth -= 1;
    else if (depth === 0 && expression.startsWith(operator, index)) {
      parts.push(expression.slice(start, index));
      index += 1;
      start = index + 1;
    }
    if (depth < 0) throw new Error('The controller guard is malformed.');
  }
  if (depth) throw new Error('The controller guard is malformed.');
  return parts.concat(expression.slice(start));
}

function parseElementTerms(expression, allowInterval) {
  const elements = new Set();
  for (const raw of splitLogical(stripOuterParentheses(expression), '||')) {
    const term = stripOuterParentheses(raw);
    const match = /^animelemno\s*\(\s*0\s*\)\s*=\s*(?:(\d+)|\[\s*(\d+)\s*,\s*(\d+)\s*\])$/i.exec(term);
    if (!match) throw new Error('The guard uses an unsupported or dynamic AIR element condition.');
    if (!match[1] && !allowInterval) throw new Error('AIR element intervals are unverified for the target engine.');
    const start = signedLiteral(match[1] || match[2]), end = signedLiteral(match[1] || match[3]);
    if (start === undefined || end === undefined || start < 1 || end < start || end - start >= MAX_ELEMENTS) throw new Error('The AIR element range is invalid or too large.');
    for (let element = start; element <= end; element += 1) elements.add(element);
    if (elements.size > MAX_ELEMENTS) throw new Error('The AIR element range is too large.');
  }
  return [...elements].sort((left, right) => left - right);
}

function parseGuard(alternatives, allowInterval) {
  const actions = new Set(), elements = new Set();
  let wholeAction = false;
  for (const alternative of alternatives) {
    let action, selected;
    const terms = alternative.flatMap(text => {
      if (text.length > 8192) throw new Error('The controller guard exceeds the bounded review size.');
      const expression = stripOuterParentheses(text);
      const conjunction = splitLogical(expression, '&&');
      if (conjunction.length > 1 && splitLogical(expression, '||').length > 1) {
        throw new Error('The unparenthesized guard has competing animation or element conditions.');
      }
      return conjunction;
    });
    for (const raw of terms) {
      const term = stripOuterParentheses(raw);
      if (term === '1') continue;
      const anim = /^anim\s*=\s*(-?\d+)$/i.exec(term);
      if (anim && action === undefined) action = signedLiteral(anim[1]);
      else if (!anim && !selected) selected = parseElementTerms(term, allowInterval);
      else throw new Error('The controller guard has competing animation or element tests.');
    }
    if (action === undefined) throw new Error('The controller guard needs a literal animation test.');
    actions.add(action);
    if (selected) for (const element of selected) elements.add(element);
    else wholeAction = true;
  }
  if (actions.size !== 1 || elements.size > MAX_ELEMENTS) throw new Error('The controller guard has an ambiguous animation or element scope.');
  return { action: [...actions][0], elements: wholeAction ? null : [...elements].sort((left, right) => left - right) };
}

function readFields(lines, separator) {
  const fields = new Map();
  for (const line of lines) {
    if (!line.trim()) continue;
    const assignment = /^\s*([a-z][a-z0-9]*)\s*([:=])\s*(.+?)\s*$/is.exec(line);
    if (!assignment || assignment[2] !== separator) throw new Error('The linked controller contains unsupported or incomplete source.');
    const key = assignment[1].toLowerCase();
    if (!fields.has(key)) fields.set(key, []);
    fields.get(key).push(assignment[3]);
  }
  return fields;
}

function singleField(fields, key) {
  const entries = fields.get(key) || [];
  if (entries.length > 1) throw new Error(`The controller has duplicate ${key} fields.`);
  return entries[0];
}

function literalList(value, maximum, minimum = maximum) {
  const expressions = String(value ?? '').split(',').map(item => item.trim());
  if (expressions.length < minimum || expressions.length > maximum || expressions.some(item => !DECIMAL.test(item)
        || !Number.isFinite(Math.fround(Number(item))) || !item.includes('.') && Math.abs(Number(item)) > STATE_MAX)) {
    throw new Error('The controller needs finite literal coordinates in its supported range.');
  }
  return expressions.map(item => Number(item) || 0);
}

function readControllerRecipe(controller, fields, body, language) {
  const kind = Object.keys(CONTROLLERS).find(key => CONTROLLERS[key].toLowerCase() === controller.toLowerCase());
  if (!kind) throw new Error('The linked block is not a Size, Width or PlayerPush controller.');
  if (fields.has('redirectid')) throw new Error('The controller redirects to an unresolved character.');
  const allowed = { size: ['group', 'index', 'rect'], width: ['player', 'edge', 'value'], playerpush: ['value', 'priority', 'affectteam'] };
  if ([...fields.keys()].some(key => !allowed[kind].includes(key))) throw new Error('The controller contains unmodeled parameters.');
  if (kind === 'size') {
    const collision = parseCollisionReferences(body, language);
    if (collision.length !== 1 || collision[0].kind !== 'overrideclsn' || !collision[0].available) throw new Error('The Size controller structure is unresolved.');
    if (!/^size$/i.test(singleField(fields, 'group') || '') || !/^-?0+$/.test(singleField(fields, 'index') || '')) throw new Error('The controller must identify Size box index 0.');
    return normalizeRecipe({ kind, rect: literalList(singleField(fields, 'rect'), 4) });
  }
  if (kind === 'width') {
    const value = singleField(fields, 'value'), player = singleField(fields, 'player'), edge = singleField(fields, 'edge');
    if (value !== undefined && (player !== undefined || edge !== undefined)) throw new Error('Width mixes value with separate player or edge parameters.');
    const readWidth = expression => {
      if (expression === undefined) return undefined;
      const [front, back = 0] = literalList(expression, 2, 1);
      return [front, back];
    };
    return normalizeRecipe({ kind, player: readWidth(player ?? value), edge: readWidth(edge ?? value) });
  }
  const data = { kind };
  for (const key of ['value', 'priority']) {
    const expression = singleField(fields, key);
    if (expression === undefined) continue;
    if (expression.startsWith('+') || signedLiteral(expression) === undefined) throw new Error(`PlayerPush ${key} needs a supported literal.`);
    data[key] = signedLiteral(expression);
  }
  data.affectTeam = singleField(fields, 'affectteam');
  return normalizeRecipe(data);
}

function parseLinkedController(body, language, stateOrHook, allowInterval) {
  if (Buffer.byteLength(body, 'utf8') > MAX_BLOCK_BYTES) throw new Error('The linked source exceeds the bounded review size.');
  const comment = language === 'zss' ? '#' : ';';
  const trimmed = body.split(/\r?\n/).map(line => line.split(comment, 1)[0]).join('\n').trim();
  if (/["']/.test(trimmed)) throw new Error('The linked controller contains unsupported quoted source.');
  if (language === 'zss') {
    const match = /^(ignorehitpause\s+)?if\s+([^{}]+)\{\s*([a-z]+)\s*\{([^{}]*)\}\s*\}$/is.exec(trimmed);
    if (!match) throw new Error('The linked ZSS source must contain one complete guarded controller.');
    return {
      recipe: readControllerRecipe(match[3], readFields(match[4].split(';'), ':'), body, language),
      guard: parseGuard([[match[2]]], allowInterval), ignoreHitPause: Boolean(match[1])
    };
  }
  const [header, ...lines] = trimmed.split('\n');
  const state = /^\[state ([+-]?\d+)\s*,\s*[^\]\r\n]+\]\s*$/i.exec(header);
  if (!state || signedLiteral(state[1]) !== stateOrHook && !(state[1] === '+1' && stateOrHook === -10)) {
    throw new Error('The linked CNS controller header no longer matches its StateDef placement.');
  }
  const fields = readFields(lines, '=');
  const controller = singleField(fields, 'type');
  if (!controller) throw new Error('The linked CNS controller type is missing.');
  const pause = singleField(fields, 'ignorehitpause');
  if (pause !== undefined && !/^[01]$/.test(pause)) throw new Error('IgnoreHitPause needs a literal 0 or 1.');
  const common = fields.get('triggerall') || [], groups = new Map();
  for (const [key, entries] of fields) {
    if (/^trigger[1-9]\d*$/.test(key)) groups.set(Number(key.slice(7)), entries);
    if (key === 'triggerall' || /^trigger[1-9]\d*$/.test(key) || key === 'type' || key === 'ignorehitpause') fields.delete(key);
  }
  if (!groups.size || groups.size > MAX_ELEMENTS || Array.from({ length: groups.size }, (_, index) => index + 1).some(index => !groups.has(index))) throw new Error('The CNS trigger groups must be complete, consecutive and bounded.');
  return {
    recipe: readControllerRecipe(controller, fields, body, language),
    guard: parseGuard([...groups.values()].map(group => common.concat(group)), allowInterval), ignoreHitPause: pause === '1'
  };
}

function matchesAirScope(binding, guard, context) {
  if (guard.action !== binding.air.action) return false;
  const elements = binding.air.elements;
  if (!guard.elements) {
    return typeof context.frameCount === 'function' && context.frameCount(guard.action) === elements.length
      && elements.every((item, index) => item.index === index + 1);
  }
  return guard.elements.length === elements.length && elements.every((item, index) => item.index === guard.elements[index]);
}

function sourceLocation(text, start, end) {
  return Number.isInteger(start) ? { start, end: end ?? start, line: lineAt(text, start) } : {};
}

function linkedControllerOffset(body, language) {
  const masked = maskSource(body, language);
  const controller = language === 'cns' ? /^[ \t]*\[state /im : /\b(?:OverrideClsn|Width|PlayerPush)\s*\{/i;
  return controller.exec(masked)?.index ?? 0;
}

function animationScope(action) {
  return `This guard matches active Action ${action} from any AIR while the selected state runs, including animations borrowed through ChangeAnim2.`;
}

function sizeInteractions(text, language, section, link, kind) {
  if (kind === 'playerpush') return [];
  const stateSource = text.slice(section.bodyStart, section.end);
  if (Buffer.byteLength(stateSource, 'utf8') > MAX_BLOCK_BYTES) return [];
  const interactions = [];
  for (const record of parseCollisionReferences(stateSource, language)) {
    if (record.kind !== 'overrideclsn') continue;
    const start = section.bodyStart + record.controllerStart;
    if (link && start >= link.start && start < link.end) continue;
    const groupFields = record.fields.filter(field => field.key === 'group');
    if (groupFields.length > 1 || !record.sourceExact) continue;
    // An omitted group defaults to None in OverrideClsn.Run.
    const group = groupFields.length ? groupFields[0].expression.trim().toLowerCase() : 'none';
    if (!['size', 'none', 'all'].includes(group)) continue;
    interactions.push({ group, start, line: lineAt(text, start) });
    if (interactions.length >= MAX_INTERACTIONS) break;
  }
  return interactions;
}

function readPushboxInstallation({ binding: input, source, context } = {}) {
  const binding = createPushboxBinding(input);
  const { placement } = binding;
  const location = { file: placement.file, language: placement.language, stateOrHook: placement.stateOrHook, dirty: source?.dirty === true };
  const base = { installationId: binding.installationId, profileId: binding.profileId, source: location };
  const brokenSource = sourceProblem(binding, source);
  if (brokenSource) return { ...base, ...brokenSource };
  const revisionDigest = hash(source.text);
  const found = findLink(binding, source.text);
  if (!found.link) return { ...base, status: found.status, reason: found.reason, revisionDigest, source: { ...location, ...sourceLocation(source.text, found.start) } };
  const { link } = found;
  const body = source.text.slice(link.bodyStart, link.bodyEnd);
  const controllerStart = link.bodyStart + linkedControllerOffset(body, placement.language);
  const details = {
    ...base, revisionDigest, linkStatus: link.status, edited: link.status === 'edited',
    source: { ...location, ...sourceLocation(source.text, link.start, link.end), controllerStart, controllerLine: lineAt(source.text, controllerStart) }
  };
  let section;
  try {
    const parsed = stateSections(source.text, placement.language);
    section = findPlacement(binding, parsed);
    details.source.stateLabel = section.stateLabel;
    if (link.start <= section.bodyStart || link.end > section.end) throw new Error('The linked controller moved out of the selected StateDef.');
    const following = parsed.masked.slice(link.end, section.end);
    if (placement.language === 'zss') {
      const preceding = parsed.masked.slice(section.bodyStart, link.start);
      if ((preceding.match(/\{/g) || []).length !== (preceding.match(/\}/g) || []).length
          || /\belse\s*$/i.test(preceding) || /^\s*else\b/i.test(following)) {
        throw new Error('The linked controller is nested in another condition or has an external else branch.');
      }
    } else if (following.trim() && !/^\s*\[[^\]\r\n]+\][ \t]*(?:\r?\n|$)/.test(following)) {
      throw new Error('The CNS controller has source outside its installation markers.');
    }
  } catch (error) {
    return { ...details, status: 'unresolved-placement', reason: error.message };
  }
  const problem = contextProblem(binding, context);
  if (problem) return { ...details, ...problem };
  try {
    const { recipe, guard, ignoreHitPause } = parseLinkedController(body, placement.language,
      placement.stateOrHook, context.capabilities?.elementInterval === true);
    if (ROLES[recipe.kind] !== link.role) throw new Error('The controller family differs from the installation marker.');
    if (context.capabilities?.[CAPABILITIES[recipe.kind]] !== true) throw new Error('Controller compatibility is unverified for this target.');
    if (!matchesAirScope(binding, guard, context)) return { ...details, status: 'needs-remap', guard, reason: 'The literal guard differs from the selected AIR action or elements.' };
    const installed = {
      ...details, status: 'installed', guard, ignoreHitPause, recipe, animationScope: animationScope(guard.action),
      interactions: sizeInteractions(source.text, placement.language, section, link, recipe.kind)
    };
    if (recipe.kind !== 'size') return { ...installed, projection: recipe.kind === 'width' ? 'width-only' : 'push-behavior' };
    if (sizeRecipeRemovesBox(recipe)) return { ...installed, projection: 'size-removed' };
    const [x1, y1, x2, y2] = recipe.rect.map(Math.fround);
    const projectionRect = [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)];
    return { ...installed, projection: 'size-rectangle', projectionRect };
  } catch (error) {
    return { ...details, status: 'unsupported', reason: error.message };
  }
}

function floatLiteral(value) {
  const text = formatNumber(value);
  return Math.abs(value) > STATE_MAX && !text.includes('.') ? `${text}.0` : text;
}

function controllerFields(recipe) {
  if (recipe.kind === 'size') return { group: 'Size', index: 0, rect: recipe.rect.map(floatLiteral).join(', ') };
  if (recipe.kind === 'width') return Object.fromEntries(['player', 'edge'].filter(key => recipe[key]).map(key => [key, recipe[key].map(floatLiteral).join(', ')]));
  return Object.fromEntries([['value', recipe.value], ['priority', recipe.priority], ['affectteam', recipe.affectTeam]].filter(([, value]) => value !== undefined));
}

function buildController(profile, binding, capabilities, stateLabel) {
  const { air, placement } = binding;
  const { recipe } = profile, controller = CONTROLLERS[recipe.kind];
  const elements = air.elements.map(item => item.index), first = elements[0], last = elements.at(-1);
  const runs = elements.length > 1 && last - first + 1 === elements.length && capabilities.elementInterval === true;
  const terms = runs ? [`animElemNo(0) = [${first},${last}]`] : elements.map(element => `animElemNo(0) = ${element}`);
  const elementGuard = terms.length === 1 ? terms[0] : `(${terms.join(' || ')})`;
  const guard = `anim = ${air.action} && ${elementGuard}`;
  const fields = Object.entries(controllerFields(recipe));
  if (placement.language === 'cns') {
    return [`[State ${stateLabel}, IKEMaker ${binding.installationId}]`, `type = ${controller}`, `trigger1 = ${guard}`,
      ...fields.map(([key, value]) => `${key} = ${value}`), 'ignorehitpause = 1'].join('\n');
  }
  return `ignoreHitPause if ${guard} {\n\t${controller}{${fields.map(([key, value]) => `${key}: ${value}`).join('; ')}}\n}`;
}

const OPERATION = Object.freeze({ id: 'install', artifactIds: ['controller'], targetPolicyId: 'explicit-pushbox-placement', mutationOwner: 'air-pushbox-host', atomicity: 'single' });

function buildPushboxCodeReview({ profile: profileInput, binding: bindingInput, source, context, generation = 0 } = {}) {
  const profile = createPushboxProfile(profileInput), binding = createPushboxBinding(bindingInput);
  if (profile.profileId !== binding.profileId) throw new Error('The profile and installation identities differ.');
  const problem = sourceProblem(binding, source) || contextProblem(binding, context);
  if (problem) throw new Error(problem.reason);
  const { capabilities = {} } = context, { placement } = binding, { text } = source;
  if (capabilities[CAPABILITIES[profile.recipe.kind]] !== true) throw new Error('Controller compatibility is unverified for this target.');
  const parsed = stateSections(text, placement.language);
  const section = findPlacement(binding, parsed);
  const existing = findLink(binding, text);
  if (existing.link) {
    const readback = readPushboxInstallation({ binding, source, context });
    if (readback.status !== 'installed') throw new Error(readback.reason);
    if (existing.link.role !== ROLES[profile.recipe.kind]) throw new Error('This installation belongs to a different controller family. Create a separate binding.');
    if (existing.link.status !== 'clean') throw new Error('The installed source was edited or referenced. Review its source before replacing it.');
  } else if (existing.status !== 'missing') throw new Error(existing.reason);

  const artifact = wrapBlock(buildController(profile, binding, capabilities, section.stateLabel), {
    tool: TOOL, id: binding.installationId, role: ROLES[profile.recipe.kind], syntax: placement.language, label: profile.name, mode: 'managed'
  });
  const update = planUpdate(text, artifact);
  if (update.status === 'conflict') throw new Error(update.reason);
  let patch = update;
  if (update.status === 'new') {
    const start = section.end, eol = text.includes('\r\n') ? '\r\n' : '\n';
    const overlaps = scanLinks(text).some(link => link.start < start && (link.end > start
      || link.status === 'incomplete' && link.start >= section.start));
    if (overlaps) throw new Error('Another authoring link crosses or is incomplete near the insertion point. Review the source before installing.');
    const before = text.slice(0, start), after = text.slice(start);
    const linkedText = artifact.replace(/\n/g, eol);
    const prefix = before.endsWith(eol + eol) ? '' : before.endsWith(eol) ? eol : eol + eol;
    patch = { status: 'new', start, end: start, text: prefix + linkedText + (after ? eol + eol : before.endsWith('\n') ? eol : '') };
  }
  const targetId = hash(JSON.stringify([binding.character, placement]));
  const contextIdentity = hash(JSON.stringify({ profile, binding, targetId, sourceRevision: source.revision ?? null, dirty: source.dirty === true,
    sourceDigest: hash(text), patch, elementInterval: capabilities.elementInterval === true }));
  const hostSnapshot = createGeneratedCodeSnapshot({
    surfaceId: TOOL, generation, contextIdentity, contextRevision: 0, valid: true, issues: [],
    artifacts: [{ id: 'controller', role: ROLES[profile.recipe.kind], language: placement.language, text: patch.text }]
  });
  const snapshot = projectGeneratedCodeSnapshot(hostSnapshot);
  const intent = Object.freeze({ type: INVOKE_TYPE, surfaceId: TOOL, snapshotDigest: snapshot.snapshotDigest,
    operationId: OPERATION.id, artifactIds: Object.freeze(['controller']), targetIds: Object.freeze([targetId]) });
  const interactions = sizeInteractions(text, placement.language, section, existing.link, profile.recipe.kind).map(Object.freeze);
  return { hostSnapshot, review: Object.freeze({ snapshot, patch: Object.freeze(patch), intent, stateLabel: section.stateLabel,
    animationScope: animationScope(binding.air.action), interactions: Object.freeze(interactions) }) };
}

function createPushboxCodeReview(options) {
  return buildPushboxCodeReview(options).review;
}

function authorizePushboxCodeReview({ review, message, profile, binding, source, context } = {}) {
  if (!review?.snapshot) throw new Error('Review the generated source before applying it.');
  const { hostSnapshot, review: current } = buildPushboxCodeReview({ profile, binding, source, context, generation: review.snapshot.generation });
  if (current.snapshot.snapshotDigest !== review.snapshot.snapshotDigest) throw new Error('The source or binding changed since review. Review the current patch.');
  const projected = current.snapshot, targetIds = current.intent.targetIds;
  if (message?.targetIds?.length !== 1 || message.targetIds[0] !== targetIds[0]) throw new Error('Select the reviewed explicit source placement.');
  authorizeGeneratedCodeIntent({ message, currentSnapshot: hostSnapshot, operations: [OPERATION], activeContext: {
    identity: projected.contextIdentity, revision: projected.contextRevision, targetPolicies: { [OPERATION.targetPolicyId]: targetIds }
  } });
  return current.patch;
}

module.exports = { PROFILE_SCHEMA, BINDING_SCHEMA, createPushboxProfile, createPushboxBinding, sizeRecipeRemovesBox, listPushboxPlacements,
  readPushboxInstallation, createPushboxCodeReview, authorizePushboxCodeReview };
