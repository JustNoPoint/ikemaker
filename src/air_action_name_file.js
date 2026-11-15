'use strict';

function parseActionNames(text) {
  const names = {};
  for (const [index, line] of text.replace(/^\uFEFF/, '').split(/\r\n?|\n/).entries()) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const equal = line.indexOf('=');
    const key = line.slice(0, equal).trim(), id = Number(key), label = line.slice(equal + 1).trim();
    if (equal < 1 || !/^[+-]?\d+$/.test(key) || !Number.isInteger(id) || id < -2147483648 || id > 2147483647 ||
        !label || label.length > 200 || label.includes('\0')) throw Error('Invalid action name on line '+(index+1)+'. Expected number=name.');
    names[id] = label;
  }
  return names;
}

function writeActionNames(names) {
  const lines = Object.entries(names).sort(([a],[b])=>Number(a)-Number(b)).map(([id,label])=>id+'='+label);
  return ['# Suggested AIR action names', ...lines, ''].join('\n');
}

module.exports = {parseActionNames,writeActionNames};
