'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const directory = __dirname;
const tests = fs.readdirSync(directory)
  .filter((name) => name.endsWith('.test.js'))
  .sort();

for (const name of tests) {
  const result = spawnSync(process.execPath, [path.join(directory, name)], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log(`All ${tests.length} test files passed.`);
