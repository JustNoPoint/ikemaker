'use strict';

function zssControllerName(name) {
  const normalized = name
    .replace(/BG/g, 'Bg')
    .replace(/FX/g, 'Fx')
    .replace(/ID/g, 'Id');
  return normalized.charAt(0).toLowerCase() + normalized.slice(1);
}

function safePlaceholder(value) {
  const placeholder = String(value || 'value')
    .replace(/[\r\n]+/g, ' ')
    .replace(/;/g, ',')
    .trim();
  return placeholder || 'value';
}

function formatController(controller) {
  const name = zssControllerName(controller.name);
  const params = Array.isArray(controller.params) ? controller.params : [];
  if (!params.length) return `${name}{}`;

  const lines = [`${name}{`];
  for (const parameter of params) {
    const suffix = parameter.required ? ' # required' : '';
    lines.push(`\t# ${parameter.name}: ${safePlaceholder(parameter.placeholder)};${suffix}`);
  }
  lines.push('}');
  return lines.join('\n');
}

function snippetPlaceholder(value) {
  return safePlaceholder(value).replace(/[\\$}]/g, '\\$&');
}

function formatControllerSnippet(controller, experience = 'learning', mode = 'required') {
  const name = zssControllerName(controller.name);
  const params = (Array.isArray(controller.params) ? controller.params : []).slice(0, 128);
  const required = params.filter((parameter) => parameter.required);
  if (!params.length) return `${name}{}`;
  const lines = [`${name}{`];
  required.forEach((parameter, index) => lines.push(`\t${parameter.name}: \${${index + 1}:${snippetPlaceholder(parameter.placeholder)}};`));
  if (mode === 'all') {
    params.filter(parameter => !parameter.required).forEach(parameter => lines.push(`\t# ${parameter.name}: ${safePlaceholder(parameter.placeholder)};`));
  } else if (experience === 'learning') lines.push('\t# Add optional options here with editor completion.');
  lines.push('}');
  return lines.join('\n');
}

function formatCnsControllerSnippet(controller, mode = 'required') {
  const params = (Array.isArray(controller.params) ? controller.params : []).slice(0, 128), required = params.filter(parameter => parameter.required), lines = [controller.name, 'trigger1 = ${1:condition}'];
  required.forEach((parameter, index) => lines.push(`${parameter.name} = \${${index + 2}:${snippetPlaceholder(parameter.placeholder)}}`));
  if (mode === 'all') params.filter(parameter => !parameter.required).forEach(parameter => lines.push(`; ${parameter.name} = ${safePlaceholder(parameter.placeholder)}`));
  return lines.join('\n');
}

module.exports = { zssControllerName, formatController, formatControllerSnippet, formatCnsControllerSnippet, safePlaceholder, snippetPlaceholder };
