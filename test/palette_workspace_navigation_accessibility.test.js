'use strict';

const assert = require('assert');
const vm = require('vm');
const { sourceHtml } = require('../src/palette_workspace_view');

const html = sourceHtml({
  session: {
    context: { kind: 'existing-sff', section: 'embedded' },
    target: { filename: 'palette-navigation.sff' },
    sources: [],
    selection: { sprite: { physicalIndex: 0, group: 0, number: 0 }, palette: { physicalIndex: 0, group: 1, number: 1 } },
    facts: { preview: 'none', staged: 'none', embedded: 'saved', builtOutput: 'none', adoption: 'none' },
    stale: false,
    staleReasons: [],
    organizer: { semanticEntries: [] }
  },
  palettes: [{ physicalIndex: 0, group: 1, number: 1, colors: [[0, 0, 0, 0]] }]
});
const inline = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] || '';
assert.match(inline, /role','tablist'/, 'workflow steps expose a real tablist');
assert.match(inline, /role','tab'/, 'each workflow step is a tab');
assert.match(inline, /aria-selected/, 'workflow selection is programmatic');
assert.match(inline, /role','tabpanel'/, 'the selected workflow content is a named tabpanel');
assert.match(inline, /Already at the first step\./, 'Back exposes its boundary reason');
assert.match(inline, /This is the final step\./, 'the former no-op Done action exposes the real completion boundary');
assert.doesNotMatch(inline, />Done<\/button>/, 'an enabled-looking no-op Done control is not emitted');
assert.match(inline, /role="listbox" aria-multiselectable="true" aria-label="Exact 256-slot master palette layout"/, 'the multi-select index layout uses valid listbox semantics');
assert.match(inline, /setAttribute\('role','option'\)/, 'layout children are options rather than buttons nested directly in a grid');

function functionSource(name) {
  const start = inline.indexOf('function ' + name + '(');
  assert(start >= 0, 'missing generated client function ' + name);
  const brace = inline.indexOf('{', start);
  let depth = 0, quote = '', escaped = false;
  for (let index = brace; index < inline.length; index += 1) {
    const char = inline[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '{') depth += 1;
    else if (char === '}' && --depth === 0) return inline.slice(start, index + 1);
  }
  throw new Error('unterminated generated client function ' + name);
}

function selectable(name, step = name) {
  return {
    name, dataset: { step }, hidden: false, disabled: false, focused: 0, clicked: 0, isConnected: true,
    focus() { this.focused += 1; context.document.activeElement = this; },
    click() { this.clicked += 1; context.activateWorkflowStep(this.dataset.step, context.document.activeElement, 'paletteStep-' + this.dataset.step); }
  };
}
const body = { name: 'body' }, unrelated = { name: 'unrelated' };
let first = selectable('first'), second = selectable('second'), third = selectable('third'), liveById = new Map(), replaceWithUnrelatedFocus = false;
const tablist = { querySelectorAll() { return [first, second, third]; } };
const context = {
  activeStep: 'first',
  document: {
    activeElement: first,
    body,
    getElementById(id) { return liveById.get(id) || null; }
  },
  showWorkflow() {
    for (const node of [first, second, third]) node.isConnected = false;
    first = selectable('replacement-first', 'first'); second = selectable('replacement-second', 'second'); third = selectable('replacement-third', 'third');
    liveById = new Map([['paletteStep-first', first], ['paletteStep-second', second], ['paletteStep-third', third]]);
    if (replaceWithUnrelatedFocus) context.document.activeElement = unrelated;
  }
};
vm.createContext(context);
vm.runInContext([functionSource('restoreWorkflowFocus'), functionSource('activateWorkflowStep'), functionSource('handleWorkflowStepKey')].join('\n'), context);
let prevented = 0;
const detachedSecond = second;
context.handleWorkflowStepKey({ currentTarget: tablist, key: 'ArrowRight', preventDefault() { prevented += 1; } });
assert.strictEqual(detachedSecond.clicked, 1, 'ArrowRight activates the intended old tab exactly once');
assert.strictEqual(detachedSecond.focused, 0, 'the removed tab is never focused after its click rebuilds the tablist');
assert.strictEqual(second.focused, 1, 'ArrowRight requeries and focuses the live replacement tab');
context.handleWorkflowStepKey({ currentTarget: tablist, key: 'End', preventDefault() { prevented += 1; } });
assert.strictEqual(third.focused, 1, 'End activates and focuses the live final workflow step');
assert.strictEqual(prevented, 2);

const beforeUnrelated = first;
context.document.activeElement = beforeUnrelated;
replaceWithUnrelatedFocus = true;
context.activateWorkflowStep('second', beforeUnrelated, 'paletteStep-second');
assert.strictEqual(context.document.activeElement, unrelated, 'a rerender does not steal newer unrelated focus');
assert.strictEqual(second.focused, 0, 'the replacement tab remains unfocused when ownership changed');
replaceWithUnrelatedFocus = false;

const flowNext = selectable('flowNext'), flowBack = selectable('flowBack');
context.document.activeElement = flowNext;
context.showWorkflow = function() {
  flowNext.isConnected = false;
  const replacement = selectable('replacement-flowNext');
  liveById = new Map([['flowNext', replacement], ['paletteStep-second', selectable('fallback-second', 'second')]]);
};
context.activateWorkflowStep('second', flowNext, 'flowNext');
assert.strictEqual(liveById.get('flowNext').focused, 1, 'Next restores focus to its live enabled replacement');
context.document.activeElement = flowBack;
context.showWorkflow = function() {
  flowBack.isConnected = false;
  const disabledReplacement = selectable('replacement-flowBack'); disabledReplacement.disabled = true;
  liveById = new Map([['flowBack', disabledReplacement], ['paletteStep-first', selectable('fallback-first', 'first')]]);
};
context.activateWorkflowStep('first', flowBack, 'flowBack');
assert.strictEqual(liveById.get('flowBack').focused, 0, 'a disabled Back boundary is not focused');
assert.strictEqual(liveById.get('paletteStep-first').focused, 1, 'Back falls back to the live selected step at its boundary');

const optionA = selectable('a'), optionB = selectable('b'), optionC = selectable('c');
const listbox = { querySelectorAll() { return [optionA, optionB, optionC]; } };
context.document.activeElement = optionB;
vm.runInContext(functionSource('handleTopologyKey'), context);
context.handleTopologyKey({ currentTarget: listbox, key: 'Home', preventDefault() { prevented += 1; } });
assert.strictEqual(optionA.focused, 1, 'Home focuses the first selectable palette index');
context.handleTopologyKey({ currentTarget: listbox, key: 'End', preventDefault() { prevented += 1; } });
assert.strictEqual(optionC.focused, 1, 'End focuses the final selectable palette index');

console.log('Palette Workspace workflow tabs, boundary reasons, and index-layout keyboard semantics passed');
