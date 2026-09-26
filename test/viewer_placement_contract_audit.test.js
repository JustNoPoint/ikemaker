'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const directory = path.join(__dirname, '..', 'src');
const offenders = [];
for (const name of fs.readdirSync(directory).filter((item) => item.endsWith('.js'))) {
  if (name === 'interface_mode.js') continue; // IKEMaker Home is navigation, not an asset/editor viewer.
  const lines = fs.readFileSync(path.join(directory, name), 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    if (line.includes('createWebviewPanel(') && !line.includes('trackViewerPanel(')) offenders.push(`${name}:${index + 1}`);
  });
}

assert.deepStrictEqual(offenders, [], `Every visual webview must register with the shared viewer group: ${offenders.join(', ')}`);
console.log('Universal viewer placement contract audit passed');
