'use strict';

const DEFAULT_CYCLE_LENGTH = 120;

function isCycleLength(value) {
  return Number.isInteger(value) && value >= 1 && value <= 2147483647;
}

module.exports = { DEFAULT_CYCLE_LENGTH, isCycleLength };
