'use strict';

function assertSafeTrainingArgs(args) {
  if (!Array.isArray(args)) throw new Error('Training launch arguments must be an array.');
  if (args.includes('-loadmotif')) throw new Error('Training cannot be launched with -loadmotif; this IKEMEN build crashes in menu.lua.');
  if (!args.includes('-training')) throw new Error('Training launch arguments must include -training.');
  return args;
}

function buildTrainingArgs(...rest) {
  return assertSafeTrainingArgs(['-training', '1', ...rest]);
}

module.exports = { assertSafeTrainingArgs, buildTrainingArgs };
