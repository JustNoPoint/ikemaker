'use strict';

// This is the single projection boundary between the engine policy and live
// editor assistance. Keep exact-source Nightly capabilities here so adding a
// catalog entry cannot silently omit it from completion/hover diagnostics.
const RUNTIME_CAPABILITY_IDS = Object.freeze([
  'zss.runtime-strings', 'zss.expanded-string-expressions', 'zss.dynamic-map-keys', 'zss.dynamic-state-types', 'zss.animation-prefix-query', 'zss.run-state',
  'command.nightly-expressions', 'command.redirected-expression-fix', 'animation.loop-count-trigger', 'combat.hitdef-var-trigger',
  'collision.indexed-controls', 'collision.air-index-allocation', 'audio.sample-rate-query', 'def.auto-typed-maps',
  'stage.depth-camera', 'stage.modify-bg-palfx', 'storyboard.runtime-controls', 'render.expanded-shaders', 'launch.retry-load-on-error'
]);

module.exports = { RUNTIME_CAPABILITY_IDS };
