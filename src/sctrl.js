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

function formatControllerSnippet(controller, experience = 'learning') {
  const name = zssControllerName(controller.name);
  const required = (Array.isArray(controller.params) ? controller.params : []).filter((parameter) => parameter.required);
  if (!required.length) return `${name}{}`;
  const lines = [`${name}{`];
  required.forEach((parameter, index) => lines.push(`\t${parameter.name}: \${${index + 1}:${snippetPlaceholder(parameter.placeholder)}};`));
  if (experience === 'learning') lines.push('\t# Add optional options here with editor completion.');
  lines.push('}');
  return lines.join('\n');
}

module.exports = { zssControllerName, formatController, formatControllerSnippet, safePlaceholder, snippetPlaceholder };
