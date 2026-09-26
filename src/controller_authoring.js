'use strict';

const { zssControllerName } = require('./sctrl');

function normalizeValue(value) {
  return String(value == null ? '' : value).replace(/[\r\n]+/g, ' ').trim().replace(/;+\s*$/, '');
}

function controllerParameters(controller, optionalNames = []) {
  const selected = new Set((optionalNames || []).map((name) => String(name).toLowerCase()));
  return (controller.params || []).filter((parameter) => parameter.required || selected.has(parameter.name.toLowerCase()));
}

function controllerAuthoringPlan(controller, optionalNames = []) {
  if (!controller || !controller.name) throw new Error('Choose an IKEMEN state controller.');
  const parameters = controllerParameters(controller, optionalNames);
  return {
    controller,
    required: parameters.filter((parameter) => parameter.required),
    optional: parameters.filter((parameter) => !parameter.required),
    parameters
  };
}

function controllerAuthoringText(plan, values = {}, experience = 'learning') {
  if (!plan || !plan.controller) throw new Error('A controller authoring plan is required.');
  const lines = [];
  if (experience === 'learning') {
    lines.push(`# ${plan.controller.name} — ${String(plan.controller.description || 'IKEMEN 1.0 state controller').replace(/[\r\n]+/g, ' ')}`);
    const required = plan.required.map((parameter) => parameter.name).join(', ') || 'none';
    lines.push(`# Required options: ${required}. Add other options later with editor completion.`);
  }
  lines.push(`${zssControllerName(plan.controller.name)}{`);
  for (const parameter of plan.parameters) {
    const value = normalizeValue(values[parameter.name]);
    if (!value) throw new Error(`${parameter.name} needs a reviewed value.`);
    lines.push(`\t${parameter.name}: ${value};`);
  }
  lines.push('}');
  return `${lines.join('\n')}\n`;
}

function cnsControllerAuthoringText(plan, values = {}, experience = 'learning') {
  if (!plan || !plan.controller) throw new Error('A controller authoring plan is required.');
  const lines = [];
  if (experience === 'learning') {
    lines.push(`; ${plan.controller.name} — ${String(plan.controller.description || 'IKEMEN 1.0 state controller').replace(/[\r\n]+/g, ' ')}`);
    const required = plan.required.map((parameter) => parameter.name).join(', ') || 'none';
    lines.push(`; Required options: ${required}. Add other options later with editor completion.`);
  }
  lines.push(`[State IKEMEN Tools, ${plan.controller.name}]`);
  lines.push(`type = ${plan.controller.name}`);
  for (const parameter of plan.parameters) {
    const value = normalizeValue(values[parameter.name]);
    if (!value) throw new Error(`${parameter.name} needs a reviewed value.`);
    lines.push(`${parameter.name} = ${value}`);
  }
  return `${lines.join('\n')}\n`;
}

module.exports = { normalizeValue, controllerParameters, controllerAuthoringPlan, controllerAuthoringText, cnsControllerAuthoringText };
