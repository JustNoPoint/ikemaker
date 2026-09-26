'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

for (const name of fs.readdirSync(path.join(__dirname, '..', 'src')).filter((item) => /(?:viewer|workspace)\.js$/i.test(item))) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', name), 'utf8');
  const hiddenButtons = source.match(/<button[^>]*(?:display\s*:\s*none|aria-hidden=["']true["'])[^>]*>/gi) || [];
  const obsoleteButtons = source.match(/<button[^>]*>[^<]*(?:legacy|deprecated|obsolete)[^<]*<\/button>/gi) || [];
  assert.deepStrictEqual(hiddenButtons, [], `${name} must not ship hidden test buttons`);
  assert.deepStrictEqual(obsoleteButtons, [], `${name} must not ship obsolete controls`);
}

console.log('Viewer control-hygiene tests passed');
