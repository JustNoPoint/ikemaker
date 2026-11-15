'use strict';

const path = require('path');

function reviewedPathKey(filename) {
  const absolute = path.resolve(filename);
  // A Windows drive letter has no case. Keep every directory component exact.
  return process.platform === 'win32' ? absolute.replace(/^[A-Z](?=:)/, drive => drive.toLowerCase()) : absolute;
}

module.exports = { reviewedPathKey };
