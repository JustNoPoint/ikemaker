'use strict';

// ZSS structures are kept separate from state controllers because they shape
// execution rather than perform one engine action. The catalog is deliberately
// complete and grouped: authors can discover syntax when they need it without
// having to begin from a blank editor.
const GROUPS = [
  { id: 'conditions', label: 'Conditions', icon: 'symbol-boolean' },
  { id: 'selection', label: 'Selection', icon: 'list-tree' },
  { id: 'loops', label: 'Loops', icon: 'sync' },
  { id: 'functions', label: 'Functions', icon: 'symbol-function' },
  { id: 'values', label: 'Values & Assignments', icon: 'symbol-variable' },
  { id: 'states', label: 'State Structure', icon: 'symbol-class' },
  { id: 'safe', label: 'Safe Patterns', icon: 'shield' }
];

const STRUCTURES = [
  { id: 'if', group: 'conditions', label: 'if', detail: 'Run a block when one condition is true.', wrap: true, snippet: 'if ${1:condition} {\n\t${2}\n}\n${0}' },
  { id: 'ifElse', group: 'conditions', label: 'if / else', detail: 'Choose between a true branch and a fallback.', wrap: true, snippet: 'if ${1:condition} {\n\t${2}\n} else {\n\t${3}\n}\n${0}' },
  { id: 'ifElseIf', group: 'conditions', label: 'if / else if', detail: 'Try a second condition only when the first is false.', wrap: true, snippet: 'if ${1:firstCondition} {\n\t${2}\n} else if ${3:secondCondition} {\n\t${4}\n}\n${0}' },
  { id: 'ifElseIfElse', group: 'conditions', label: 'if / else if / else', detail: 'A complete ordered conditional chain with a fallback.', wrap: true, snippet: 'if ${1:firstCondition} {\n\t${2}\n} else if ${3:secondCondition} {\n\t${4}\n} else {\n\t${5}\n}\n${0}' },
  { id: 'ignoreHitPauseIf', group: 'conditions', label: 'ignoreHitPause if', detail: 'Evaluate a conditional block during hit pause.', wrap: true, snippet: 'ignoreHitPause if ${1:condition} {\n\t${2}\n}\n${0}' },
  { id: 'twoIndependentIfs', group: 'conditions', label: 'Two independent if blocks', detail: 'Evaluate both conditions independently instead of choosing one branch.', snippet: 'if ${1:firstCondition} {\n\t${2}\n}\n\nif ${3:secondCondition} {\n\t${4}\n}\n${0}' },
  { id: 'nestedIf', group: 'conditions', label: 'Nested if', detail: 'Require an outer condition before checking an inner condition.', wrap: true, snippet: 'if ${1:outerCondition} {\n\tif ${2:innerCondition} {\n\t\t${3}\n\t}\n}\n${0}' },

  { id: 'switch', group: 'selection', label: 'switch / case / default', detail: 'Choose one branch according to a single expression.', snippet: 'switch ${1:expression} {\ncase ${2:value}:\n\t${3}\ndefault:\n\t${4}\n}\n${0}' },
  { id: 'switchTwoCases', group: 'selection', label: 'switch with two cases', detail: 'Choose between two named values and a fallback.', snippet: 'switch ${1:expression} {\ncase ${2:firstValue}:\n\t${3}\ncase ${4:secondValue}:\n\t${5}\ndefault:\n\t${6}\n}\n${0}' },

  { id: 'for', group: 'loops', label: 'for range', detail: 'Repeat using ZSS start, end and step values.', wrap: true, snippet: 'for ${1:i} = ${2:0}; ${3:end}; ${4:1} {\n\t${5}\n}\n${0}' },
  { id: 'forBreak', group: 'loops', label: 'for with conditional break', detail: 'Repeat until a condition ends the loop early.', wrap: true, snippet: 'for ${1:i} = ${2:0}; ${3:end}; ${4:1} {\n\t${5}\n\tif ${6:stopCondition} {\n\t\tbreak;\n\t}\n}\n${0}' },

  { id: 'functionNoParameters', group: 'functions', label: 'Function — no parameters', detail: 'Declare a side-effect function. Its body continues until the next Function or StateDef.', snippet: '[Function ${1:FunctionName}()]\n${2}\n${0}' },
  { id: 'functionParameters', group: 'functions', label: 'Function — parameters', detail: 'Declare a function that receives named parameters.', snippet: '[Function ${1:FunctionName}(${2:parameter})]\n${3}\n${0}' },
  { id: 'functionReturn', group: 'functions', label: 'Function — return value', detail: 'Declare a function with a named return local.', snippet: '[Function ${1:FunctionName}(${2:parameter}) ${3:ret}]\nlet ${3:ret} = ${4:0};\n${5}\n${0}' },
  { id: 'functionCall', group: 'functions', label: 'Call function', detail: 'Call a function for its side effects.', snippet: 'call ${1:FunctionName}(${2});${0}' },
  { id: 'functionCallLet', group: 'functions', label: 'Call function into let', detail: 'Store a returned value in a local.', snippet: 'let ${1:value} = call ${2:FunctionName}(${3});${0}' },
  { id: 'functionCallMap', group: 'functions', label: 'Call function into map', detail: 'Store a returned value in a named map.', snippet: 'map(${1:MapName}) := call ${2:FunctionName}(${3});${0}' },

  { id: 'let', group: 'values', label: 'Local let', detail: 'Declare a local value for the current execution scope.', snippet: 'let ${1:name} = ${2:value};${0}' },
  { id: 'mapAssign', group: 'values', label: 'Map assignment', detail: 'Assign a persistent named map value.', snippet: 'map(${1:MapName}) := ${2:value};${0}' },
  { id: 'mapIncrement', group: 'values', label: 'Increment map', detail: 'Increase a map by an authored amount.', snippet: 'map(${1:MapName}) := map(${1:MapName}) + ${2:1};${0}' },
  { id: 'mapDecrement', group: 'values', label: 'Decrement map', detail: 'Decrease a map by an authored amount.', snippet: 'map(${1:MapName}) := map(${1:MapName}) - ${2:1};${0}' },
  { id: 'ifElseExpression', group: 'values', label: 'Inline ifElse value', detail: 'Choose one of two values inside an expression or parameter.', snippet: 'ifElse(${1:condition}, ${2:trueValue}, ${3:falseValue})${0}' },
  { id: 'booleanAnd', group: 'values', label: 'AND condition', detail: 'Require both expressions to be true.', snippet: '(${1:firstCondition}) && (${2:secondCondition})${0}' },
  { id: 'booleanOr', group: 'values', label: 'OR condition', detail: 'Accept either expression as true.', snippet: '(${1:firstCondition}) || (${2:secondCondition})${0}' },
  { id: 'booleanNot', group: 'values', label: 'NOT condition', detail: 'Invert the truth of one expression.', snippet: '!(${1:condition})${0}' },

  { id: 'stateDef', group: 'states', label: 'StateDef', detail: 'Declare a numbered ZSS state and its common attributes.', snippet: '# ${2:State name}\n[StateDef ${1:0}; type: ${3:S}; moveType: ${4:I}; physics: ${5:S}]\n\n${0}' },
  { id: 'negativeState', group: 'states', label: 'Negative StateDef', detail: 'Declare a negative state container.', snippet: '[StateDef -${1:1}]\n\n${0}' },

  { id: 'countdown', group: 'safe', label: 'Countdown map', detail: 'Run while positive and reduce the map once per eligible tick.', snippet: 'if map(${1:CountdownMap}) > 0 {\n\t${2}\n\tmap(${1:CountdownMap}) := map(${1:CountdownMap}) - 1;\n}\n${0}' },
  { id: 'ignoreHitPauseCountdown', group: 'safe', label: 'Hit-pause countdown map', detail: 'Continue a countdown while the player is in hit pause.', snippet: 'ignoreHitPause if map(${1:CountdownMap}) > 0 {\n\t${2}\n\tmap(${1:CountdownMap}) := map(${1:CountdownMap}) - 1;\n}\n${0}' },
  { id: 'oneTimeLatch', group: 'safe', label: 'One-time map latch', detail: 'Run once while a condition is true, then record that it was consumed.', snippet: 'if ${1:condition} && !map(${2:ConsumedMap}) {\n\tmap(${2:ConsumedMap}) := 1;\n\t${3}\n}\n${0}' },
  { id: 'targetGuard', group: 'safe', label: 'Check target before target access', detail: 'Do not evaluate target redirects unless a target exists.', wrap: true, snippet: 'if numTarget {\n\t${1}\n}\n${0}' },
  { id: 'helperGuard', group: 'safe', label: 'Check helper before helper access', detail: 'Do not redirect to a helper family unless one exists.', wrap: true, snippet: 'if numHelper(${1:helperID}) {\n\t${2}\n}\n${0}' },
  { id: 'playerGuard', group: 'safe', label: 'Check player before player access', detail: 'Confirm a player slot exists before reading it.', wrap: true, snippet: 'if playerNoExist(${1:playerNumber}) {\n\t${2}\n}\n${0}' }
];

function structureById(id) { return STRUCTURES.find((item) => item.id === id); }
function structuresForGroup(group, query = '') {
  const needle = String(query || '').trim().toLowerCase();
  return STRUCTURES.filter((item) => item.group === group && (!needle || `${item.label} ${item.detail} ${item.id}`.toLowerCase().includes(needle)));
}
function escapeSnippetText(value) { return String(value || '').replace(/([\\$}])/g, '\\$1'); }
function indentSelection(text, indentUnit, eol) {
  return String(text || '').split(/\r?\n/).map((line) => line ? `${indentUnit}${line}` : line).join(eol);
}
function wrapSnippet(structure, selectedText, options = {}) {
  const eol = options.eol || '\n', indentUnit = options.indentUnit || '\t';
  const selected = escapeSnippetText(indentSelection(selectedText, indentUnit, eol));
  switch (structure.id) {
    case 'if': return `if \${1:condition} {${eol}${selected}${eol}}${eol}\${0}`;
    case 'ifElse': return `if \${1:condition} {${eol}${selected}${eol}} else {${eol}${indentUnit}\${2}${eol}}${eol}\${0}`;
    case 'ifElseIf': return `if \${1:firstCondition} {${eol}${selected}${eol}} else if \${2:secondCondition} {${eol}${indentUnit}\${3}${eol}}${eol}\${0}`;
    case 'ifElseIfElse': return `if \${1:firstCondition} {${eol}${selected}${eol}} else if \${2:secondCondition} {${eol}${indentUnit}\${3}${eol}} else {${eol}${indentUnit}\${4}${eol}}${eol}\${0}`;
    case 'ignoreHitPauseIf': return `ignoreHitPause if \${1:condition} {${eol}${selected}${eol}}${eol}\${0}`;
    case 'nestedIf': return `if \${1:outerCondition} {${eol}${indentUnit}if \${2:innerCondition} {${eol}${indentUnit}${selected}${eol}${indentUnit}}${eol}}${eol}\${0}`;
    case 'for': return `for \${1:i} = \${2:0}; \${3:end}; \${4:1} {${eol}${selected}${eol}}${eol}\${0}`;
    case 'forBreak': return `for \${1:i} = \${2:0}; \${3:end}; \${4:1} {${eol}${selected}${eol}${indentUnit}if \${5:stopCondition} {${eol}${indentUnit}${indentUnit}break;${eol}${indentUnit}}${eol}}${eol}\${0}`;
    case 'targetGuard': return `if numTarget {${eol}${selected}${eol}}${eol}\${0}`;
    case 'helperGuard': return `if numHelper(\${1:helperID}) {${eol}${selected}${eol}}${eol}\${0}`;
    case 'playerGuard': return `if playerNoExist(\${1:playerNumber}) {${eol}${selected}${eol}}${eol}\${0}`;
    default: return structure.snippet;
  }
}

module.exports = { GROUPS, STRUCTURES, structureById, structuresForGroup, escapeSnippetText, indentSelection, wrapSnippet };
