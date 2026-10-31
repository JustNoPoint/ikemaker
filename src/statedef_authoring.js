'use strict';

const { controllerAuthoringPlan, controllerAuthoringText } = require('./controller_authoring');
const { filterAvailable } = require('./catalog_capability_filter');
const { parseStateSource } = require('./state_transfer_model');

const STATE_TYPES = Object.freeze(['S', 'C', 'A', 'L', 'U']);
const MOVE_TYPES = Object.freeze(['I', 'A', 'H', 'U']);
const PHYSICS_TYPES = Object.freeze(['S', 'C', 'A', 'N', 'U']);
const HEADER_PRESETS = Object.freeze([
  Object.freeze({ id: 'minimal', label: 'Minimal / no header properties', stateType: '', moveType: '', physics: '' }),
  Object.freeze({ id: 'standing-idle', label: 'Standing / idle', stateType: 'S', moveType: 'I', physics: 'S' }),
  Object.freeze({ id: 'standing-attack', label: 'Standing attack', stateType: 'S', moveType: 'A', physics: 'S' }),
  Object.freeze({ id: 'crouching', label: 'Crouching', stateType: 'C', moveType: 'I', physics: 'C' }),
  Object.freeze({ id: 'airborne', label: 'Airborne', stateType: 'A', moveType: 'I', physics: 'A' }),
  Object.freeze({ id: 'unchanged', label: 'Leave state properties unchanged', stateType: 'U', moveType: 'U', physics: 'U' }),
  Object.freeze({ id: 'custom', label: 'Custom', stateType: '', moveType: '', physics: '' })
]);

function oneLine(value, label, limit = 512) {
  const text = String(value == null ? '' : value).replace(/[\r\n]+/g, ' ').trim();
  if (text.length > limit) throw new Error(`${label} is longer than ${limit} characters.`);
  return text;
}

function stateNumber(value) {
  const raw = String(value == null ? '' : value).trim();
  if (!/^[+-]?\d+$/.test(raw)) throw new Error('StateDef number must be a whole-number literal.');
  const number = Number(raw);
  if (!Number.isSafeInteger(number)) throw new Error('StateDef number must be a safe integer.');
  return number;
}

function enumValue(value, allowed, label) {
  const result = oneLine(value, label, 8).toUpperCase();
  if (result && !allowed.includes(result)) throw new Error(`${label} must be one of ${allowed.join(', ')}.`);
  return result;
}

function expression(value, label) {
  const result = oneLine(value, label, 1024).replace(/;+\s*$/, '').trim();
  if (/[{}\[\]]/.test(result)) throw new Error(`${label} cannot contain a block or section delimiter.`);
  return result;
}

function controllerChoices(catalog = [], capabilities = {}, query = '') {
  const needle = String(query || '').trim().toLowerCase();
  return filterAvailable(catalog, capabilities)
    .filter((entry) => !needle || `${entry.name} ${entry.description || ''}`.toLowerCase().includes(needle))
    .map((entry) => Object.freeze({
      id: String(entry.name).toLowerCase(),
      name: entry.name,
      description: entry.description || '',
      required: Object.freeze((entry.params || []).filter((item) => item.required).map((item) => item.name)),
      optional: Object.freeze((entry.params || []).filter((item) => !item.required).map((item) => item.name)),
      controller: entry
    }));
}

function findController(catalog, capabilities, name) {
  const wanted = String(name || '').trim().toLowerCase();
  if (!wanted) return null;
  const matches = filterAvailable(catalog, capabilities).filter((entry) => String(entry.name).toLowerCase() === wanted);
  if (matches.length !== 1) throw new Error(matches.length ? `Controller ${name} is ambiguous in the active catalog.` : `Controller ${name} is unavailable for the active engine target.`);
  return matches[0];
}

function existingStateDefs(sources, number) {
  const matches = [];
  for (const source of Array.isArray(sources) ? sources : []) {
    if (!source || source.available === false || typeof source.text !== 'string') continue;
    const filename = String(source.filename || '');
    const languageId = source.languageId || source.syntax || (/\.cns$/i.test(filename) ? 'ikemen-cns' : 'zss');
    const parsed = parseStateSource(source.text, filename, languageId);
    for (const declaration of parsed.declarations || []) {
      if (!declaration.dynamic && declaration.value === number) matches.push(Object.freeze({ filename, line: declaration.line, character: declaration.character, expression: declaration.expression }));
    }
  }
  return Object.freeze(matches);
}

function indent(text, prefix) {
  return String(text).replace(/\n$/, '').split('\n').map((line) => `${prefix}${line}`).join('\n');
}

function zssText(state, controllerPlan, values, condition, experience) {
  const fields = [];
  if (state.stateType) fields.push(`type: ${state.stateType}`);
  if (state.moveType) fields.push(`movetype: ${state.moveType}`);
  if (state.physics) fields.push(`physics: ${state.physics}`);
  if (state.anim) fields.push(`anim: ${state.anim}`);
  if (state.ctrl) fields.push(`ctrl: ${state.ctrl}`);
  const lines = [];
  if (state.name) lines.push(`# ${state.name}`);
  lines.push(`[StateDef ${state.number}${fields.length ? `; ${fields.join('; ')};` : ''}]`, '');
  if (controllerPlan) {
    const controller = controllerAuthoringText(controllerPlan, values, experience);
    if (condition) lines.push(`if ${condition} {`, indent(controller, '\t'), '}');
    else lines.push(controller.replace(/\n$/, ''));
  }
  return `${lines.join('\n').replace(/\n+$/, '')}\n`;
}

function cnsText(state, controllerPlan, values, condition, experience) {
  const lines = [];
  if (state.name) lines.push(`; ${state.name}`);
  lines.push(`[StateDef ${state.number}]`);
  if (state.stateType) lines.push(`type = ${state.stateType}`);
  if (state.moveType) lines.push(`movetype = ${state.moveType}`);
  if (state.physics) lines.push(`physics = ${state.physics}`);
  if (state.anim) lines.push(`anim = ${state.anim}`);
  if (state.ctrl) lines.push(`ctrl = ${state.ctrl}`);
  if (controllerPlan) {
    const description = String(controllerPlan.controller.description || 'IKEMEN 1.0 state controller').replace(/[\r\n]+/g, ' ');
    lines.push('');
    if (experience === 'learning') {
      lines.push(`; ${controllerPlan.controller.name} — ${description}`);
      lines.push(`; Required options: ${controllerPlan.required.map((item) => item.name).join(', ') || 'none'}. Add other options later with editor completion.`);
    }
    lines.push(`[State ${state.number}, ${controllerPlan.controller.name}]`, `type = ${controllerPlan.controller.name}`, `trigger1 = ${condition || '1'}`);
    for (const parameter of controllerPlan.parameters) {
      const value = expression(values[parameter.name], `${controllerPlan.controller.name}.${parameter.name}`);
      if (!value) throw new Error(`${parameter.name} needs a reviewed value.`);
      lines.push(`${parameter.name} = ${value}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function createStateDefPlan(input = {}, options = {}) {
  const language = input.language === 'ikemen-cns' || input.language === 'cns' ? 'cns' : input.language === 'zss' || !input.language ? 'zss' : '';
  if (!language) throw new Error('StateDef output must be ZSS or CNS.');
  const state = Object.freeze({
    number: stateNumber(input.number),
    name: oneLine(input.name, 'State name'),
    stateType: enumValue(input.stateType, STATE_TYPES, 'State type'),
    moveType: enumValue(input.moveType, MOVE_TYPES, 'Move type'),
    physics: enumValue(input.physics, PHYSICS_TYPES, 'Physics'),
    anim: expression(input.anim, 'Default animation'),
    ctrl: expression(input.ctrl, 'Control value')
  });
  const duplicates = existingStateDefs(options.sources, state.number);
  if (duplicates.length) {
    const where = duplicates.slice(0, 3).map((item) => `${item.filename || 'open source'}:${item.line + 1}`).join(', ');
    throw new Error(`StateDef ${state.number} already exists${where ? ` at ${where}` : ''}. Choose another number or open the existing state.`);
  }
  const controller = findController(options.catalog || [], options.capabilities || {}, input.controllerName);
  const controllerPlan = controller ? controllerAuthoringPlan(controller, input.optionalNames || []) : null;
  const reviewedValues = {};
  for (const parameter of controllerPlan?.parameters || []) {
    const value = expression((input.values || {})[parameter.name], `${controller.name}.${parameter.name}`);
    if (!value) throw new Error(`${parameter.name} needs a reviewed value.`);
    reviewedValues[parameter.name] = value;
  }
  const condition = expression(input.condition, 'First controller condition');
  const experience = input.experience === 'advanced' ? 'advanced' : 'learning';
  const text = language === 'cns'
    ? cnsText(state, controllerPlan, reviewedValues, condition, experience)
    : zssText(state, controllerPlan, reviewedValues, condition, experience);
  return Object.freeze({
    language,
    state,
    controller: controller ? Object.freeze({ name: controller.name, required: Object.freeze(controllerPlan.required.map((item) => item.name)), optional: Object.freeze(controllerPlan.optional.map((item) => item.name)) }) : null,
    condition: condition || '',
    duplicates,
    text,
    summary: `Create StateDef ${state.number}${controller ? ` with first ${controller.name} controller` : ' without a first controller'}`
  });
}

module.exports = {
  STATE_TYPES,
  MOVE_TYPES,
  PHYSICS_TYPES,
  HEADER_PRESETS,
  stateNumber,
  controllerChoices,
  existingStateDefs,
  createStateDefPlan
};
