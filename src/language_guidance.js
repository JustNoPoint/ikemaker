'use strict';

const PATHS = Object.freeze({
  zss: {
    title: 'ZSS authoring path',
    steps: [
      ['Choose ownership first', 'Place behavior in the character StateDef or shared project function that actually owns it. Keep native common states until a reviewed project need replaces them.'],
      ['Write timing as visible conditions', 'Use if, else if, ignoreHitPause, and persistent deliberately. A controller block does not replace its surrounding timing condition.'],
      ['Insert native controllers', 'Use ZSS: Insert State Controller with Options to activate required fields, select only needed optional fields, and review every value before insertion.'],
      ['Audit and run', 'Use diagnostics and source navigation, then confirm behavior in the configured IKEMEN 1.0 runtime.']
    ]
  },
  cns: {
    title: 'CNS → ZSS concept bridge',
    steps: [
      ['Keep CNS sections visible', '[StateDef N] owns the state. Each [State N, label] section owns one controller selected by type = ControllerName.'],
      ['Read trigger groups correctly', 'triggerall lines apply to every numbered group. Lines sharing trigger1 are combined; trigger1 and trigger2 form alternative groups. Preserve that logic when translating.'],
      ['Map syntax, not intent', 'CNS type = ChangeState with value = 0 becomes a ZSS changeState{value: 0;} block. CNS trigger1 = AnimTime = 0 becomes the surrounding ZSS condition if animTime = 0.'],
      ['Translate in reviewed pieces', 'Move one controller and its trigger group at a time, compare the visual structure, and test before deleting the CNS source. The extension does not claim automatic semantic conversion.']
    ]
  },
  lua: {
    title: 'Lua ownership path',
    steps: [
      ['Classify execution timing', 'Use Lua for menus, screenpacks, selection, configuration, presentation, and other non-rollback ownership. Unknown timing requires review.'],
      ['Keep modules project-owned', 'Load project modules through supported hooks or motif configuration. Do not edit IKEMEN default Lua files for project behavior.'],
      ['Use bundled API intelligence', 'Completion and hover describe documented IKEMEN 1.0 Lua functions offline. Treat examples as frontend tools, not permission to own match simulation.'],
      ['Test both module paths', 'Verify the enabled module and the missing/disabled fallback. Gameplay input, state, movement, collision, damage, and meter remain deterministic native concerns.']
    ]
  }
});

function languageGuidance(language) {
  return PATHS[language] || PATHS.zss;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

function languageGuidanceHtml(language, experience = 'learning') {
  const guide = languageGuidance(language), open = experience === 'learning' ? ' open' : '';
  return `<details id="languagePath"${open}><summary>${escapeHtml(guide.title)}</summary><ol>${guide.steps.map(([title, detail]) => `<li><b>${escapeHtml(title)}</b><br><span class="muted">${escapeHtml(detail)}</span></li>`).join('')}</ol></details>`;
}

module.exports = { PATHS, languageGuidance, languageGuidanceHtml };
