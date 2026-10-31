'use strict';

const PROFILES = Object.freeze({
  classic: Object.freeze({ id: 'classic', label: 'Classic 4:3 · 320 × 240', description: 'Traditional MUGEN/IKEMEN authoring space.', localcoord: [320, 240] }),
  hires: Object.freeze({ id: 'hires', label: 'High-resolution 4:3 · 640 × 480', description: 'Twice the classic coordinate space.', localcoord: [640, 480] }),
  widescreen: Object.freeze({ id: 'widescreen', label: 'HD widescreen · 1280 × 720', description: 'Native 16:9 layout for modern projects.', localcoord: [1280, 720] }),
  custom: Object.freeze({ id: 'custom', label: 'Custom canvas…', description: 'Enter a project-specific width and height.', localcoord: null })
});

function positiveInteger(value, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function parseLocalcoord(value, fallback = [320, 240]) {
  const pair = Array.isArray(value) ? value : String(value || '').split(/[x,]/i);
  if (pair.length < 2) return [...fallback];
  return [positiveInteger(pair[0], fallback[0]), positiveInteger(pair[1], fallback[1])];
}

function profileChoices() {
  return Object.values(PROFILES).map((profile) => ({
    label: profile.label,
    description: profile.description,
    value: profile.id,
    localcoord: profile.localcoord && [...profile.localcoord]
  }));
}

function profileOptions(profileId, customLocalcoord, extra = {}) {
  const profile = PROFILES[profileId] || PROFILES.classic;
  const localcoord = profile.localcoord ? [...profile.localcoord] : parseLocalcoord(customLocalcoord);
  return { ...extra, profile: profile.id, localcoord };
}

function scaled(value, source, target) { return Math.round(Number(value) * Number(target) / Number(source)); }

function canvasMetrics(localcoord) {
  const [width, height] = parseLocalcoord(localcoord);
  return {
    width,
    height,
    center: [Math.round(width / 2), Math.round(height / 2)],
    margin: [Math.max(15, scaled(20, 320, width)), Math.max(15, scaled(20, 240, height))],
    playerStart: Math.max(40, scaled(70, 320, width)),
    stageFloor: Math.max(1, scaled(220, 240, height))
  };
}

module.exports = { PROFILES, parseLocalcoord, profileChoices, profileOptions, canvasMetrics, scaled };
