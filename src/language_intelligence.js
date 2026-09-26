'use strict';

const { zssControllerName, formatControllerSnippet } = require('./sctrl');

function catalogMap(entries, aliases = () => []) {
  const map = new Map();
  for (const entry of entries || []) {
    map.set(String(entry.name).toLowerCase(), entry);
    for (const alias of aliases(entry)) map.set(String(alias).toLowerCase(), entry);
  }
  return map;
}

function controllerMap(entries) {
  return catalogMap(entries, (entry) => [zssControllerName(entry.name)]);
}

function linesThrough(text, line) {
  return String(text || '').split(/\r?\n/).slice(0, Math.max(0, line) + 1);
}

function zssControllerContext(text, line, controllers) {
  const lines = linesThrough(text, line);
  let depth = 0;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const value = lines[index].replace(/#.*$/, '');
    depth += (value.match(/}/g) || []).length;
    const openings = (value.match(/{/g) || []).length;
    const declaration = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*\{/.exec(value);
    if (declaration && depth <= openings - 1) {
      const controller = controllers.get(declaration[1].toLowerCase());
      return controller ? { controller, startLine: index, endLine: line } : null;
    }
    depth -= openings;
    if (depth < 0) break;
  }
  return null;
}

function cnsControllerContext(text, line, controllers) {
  const all = String(text || '').split(/\r?\n/);
  let startLine = line;
  while (startLine >= 0 && !/^\s*\[/.test(all[startLine] || '')) startLine -= 1;
  if (startLine < 0 || !/^\s*\[\s*state\b/i.test(all[startLine])) return null;
  let endLine = startLine + 1;
  while (endLine < all.length && !/^\s*\[/.test(all[endLine])) endLine += 1;
  const section = all.slice(startLine, endLine).join('\n');
  const type = /^\s*type\s*=\s*([A-Za-z_][A-Za-z0-9_]*)/im.exec(section);
  if (!type) return null;
  const controller = controllers.get(type[1].toLowerCase());
  return controller ? { controller, startLine, endLine: endLine - 1 } : null;
}

function controllerContext(text, line, languageId, controllers) {
  return languageId === 'ikemen-cns'
    ? cnsControllerContext(text, line, controllers)
    : zssControllerContext(text, line, controllers);
}

function assignedParameters(text, context, languageId) {
  if (!context) return new Set();
  const lines = String(text || '').split(/\r?\n/).slice(context.startLine, context.endLine + 1);
  const separator = languageId === 'ikemen-cns' ? '=' : ':';
  const expression = new RegExp(`^\\s*([A-Za-z_][A-Za-z0-9_.]*)\\s*${separator}`);
  return new Set(lines.map((line) => expression.exec(line.replace(/#.*$|;.*$/g, '')))
    .filter(Boolean).map((match) => match[1].toLowerCase()));
}

function snippetPlaceholder(value) {
  return String(value || 'value').replace(/[}$\\]/g, '\\$&').replace(/[\r\n]+/g, ' ');
}

function parameterCompletion(parameter, languageId) {
  const separator = languageId === 'ikemen-cns' ? ' = ' : ': ';
  const suffix = languageId === 'ikemen-cns' ? '' : ';';
  return {
    kind: 'parameter',
    label: parameter.name,
    detail: `${parameter.required ? 'Required' : 'Optional'} IKEMEN 1.0 controller option`,
    documentation: `${parameter.name} expects ${parameter.placeholder || 'a value'}.`,
    insertText: `${parameter.name}${separator}\${1:${snippetPlaceholder(parameter.placeholder)}}${suffix}`
  };
}

function triggerInsert(entry) {
  const signature = String(entry.signature || entry.name).trim();
  if (!signature.includes('(')) return entry.name;
  const argumentsText = signature.slice(signature.indexOf('(') + 1, signature.lastIndexOf(')')).trim();
  if (!argumentsText || /^none$/i.test(argumentsText)) return `${entry.name}()`;
  return `${entry.name}(\${1:${snippetPlaceholder(argumentsText)}})`;
}

function callableInsert(entry) {
  const signature = String(entry.signature || entry.name).trim();
  if (entry.kind === 'hook') return entry.name;
  const open = signature.indexOf('(');
  const close = signature.lastIndexOf(')');
  if (open < 0 || close < open) return entry.name;
  const values = signature.slice(open + 1, close).split(',').map((item) => item.trim()).filter(Boolean);
  const args = values.map((value, index) => `\${${index + 1}:${snippetPlaceholder(value.replace(/\*$/, ''))}}`).join(', ');
  return `${entry.name}(${args})`;
}

function luaCompletionModels({ linePrefix = '', experience = 'learning', api = [] }) {
  if (!/(?:^|[=,(]|\breturn\s+|\bthen\s+|\band\s+|\bor\s+|\bnot\s+|\.)\s*[A-Za-z0-9_.]*$/i.test(linePrefix)) return [];
  return api.filter((entry) => entry.kind !== 'hook').map((entry) => ({
    kind: 'luaFunction', label: entry.name, detail: `IKEMEN 1.0 Lua · ${entry.category}`,
    documentation: entry.description, insertText: callableInsert(entry), experience
  }));
}

function luaHoverModel({ word, experience = 'learning', api = [] }) {
  const entry = catalogMap(api).get(String(word || '').toLowerCase());
  if (!entry) return null;
  return {
    kind: entry.kind, title: entry.signature || entry.name, summary: entry.description,
    explanation: experience === 'learning'
      ? `Parameters: ${entry.parameters || 'none documented'}. Returns: ${entry.returns || 'none documented'}. Category: ${entry.category}.`
      : '',
    url: entry.url
  };
}

function completionModels({ text, line, linePrefix = '', languageId = 'zss', experience = 'learning', controllers = [], triggers = [] }) {
  const controllerIndex = controllerMap(controllers);
  const context = controllerContext(text, line, languageId, controllerIndex);
  const assigned = assignedParameters(text, context, languageId);
  const items = [];

  if (context) {
    for (const parameter of context.controller.params || []) {
      if (!assigned.has(parameter.name.toLowerCase())) items.push(parameterCompletion(parameter, languageId));
    }
  } else if (languageId === 'ikemen-cns' && /^\s*type\s*=\s*[A-Za-z0-9_]*$/i.test(linePrefix)) {
    for (const controller of controllers) items.push({
      kind: 'controller', label: controller.name,
      detail: 'IKEMEN 1.0 state controller', documentation: controller.description,
      insertText: controller.name
    });
  } else if (languageId === 'zss' && /^\s*[A-Za-z0-9_]*$/.test(linePrefix)) {
    for (const controller of controllers) items.push({
      kind: 'controller', label: zssControllerName(controller.name),
      detail: 'IKEMEN 1.0 state controller', documentation: controller.description,
      insertText: formatControllerSnippet(controller, experience)
    });
  }

  const expressionLikely = /(?:\b(?:if|else\s+if)\s+|\btrigger\w*\s*=|[=:(,]|&&|\|\|)\s*[A-Za-z0-9_.]*$/i.test(linePrefix);
  if (expressionLikely) {
    for (const trigger of triggers) items.push({
      kind: trigger.kind || 'trigger', label: trigger.name,
      detail: `${trigger.status === 'changed' ? 'Expanded' : 'Native'} IKEMEN 1.0 ${trigger.kind || 'trigger'}`,
      documentation: trigger.description,
      insertText: triggerInsert(trigger), experience
    });
  }
  return items;
}

function hoverModel({ word, text, line, languageId = 'zss', experience = 'learning', controllers = [], triggers = [] }) {
  const normalized = String(word || '').toLowerCase();
  if (!normalized) return null;
  const controllerIndex = controllerMap(controllers);
  const context = controllerContext(text, line, languageId, controllerIndex);
  if (context) {
    const parameter = (context.controller.params || []).find((item) => item.name.toLowerCase() === normalized);
    if (parameter) return {
      kind: 'parameter', title: `${context.controller.name}.${parameter.name}`,
      summary: `${parameter.required ? 'Required' : 'Optional'}; expects ${parameter.placeholder || 'a value'}.`,
      explanation: experience === 'learning'
        ? `This option belongs to ${context.controller.name}. Add it only inside that controller and review the generated value before running the character.`
        : '',
      url: context.controller.url
    };
  }
  const controller = controllerIndex.get(normalized);
  if (controller) return {
    kind: 'controller', title: controller.name, summary: controller.description,
    explanation: experience === 'learning'
      ? `This is an IKEMEN 1.0 state controller. In ZSS it uses a named block; in CNS it is selected with type = ${controller.name}.`
      : '',
    url: controller.url
  };
  const trigger = catalogMap(triggers).get(normalized);
  if (trigger) return {
    kind: trigger.kind || 'trigger', title: trigger.signature || trigger.name,
    summary: trigger.description,
    explanation: experience === 'learning'
      ? `Return type: ${trigger.returnType || 'see the bundled reference'}. Arguments: ${trigger.arguments || 'see the signature or bundled reference'}.`
      : '',
    url: trigger.url
  };
  return null;
}

module.exports = {
  controllerMap,
  zssControllerContext,
  cnsControllerContext,
  controllerContext,
  assignedParameters,
  completionModels,
  hoverModel,
  triggerInsert,
  callableInsert,
  luaCompletionModels,
  luaHoverModel
};
