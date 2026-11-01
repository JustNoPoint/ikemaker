'use strict';

const assert = require('assert');
const Module = require('module');
const vm = require('vm');

const original = Module._load;
Module._load = function (request, parent, main) {
  if (request === 'vscode') return { commands: {}, window: {}, ViewColumn: { Active: 1 } };
  return original.call(this, request, parent, main);
};

try {
  const { bridgedHtml } = require('../src/palette_workshop_browser');
  const page = bridgedHtml({
    filename: 'C:/chars/Ryu/Ryu.sff',
    selection: { sprite: { physicalIndex: 0 }, palette: { physicalIndex: 0 } },
    sprites: [{ physicalIndex: 0, group: 0, number: 0, width: 64, height: 96 }],
    palettes: [{ physicalIndex: 0, group: 1, number: 1, linked: false }],
    preview: 'data:image/png;base64,AA=='
  });

  assert.match(page, /role="tablist" aria-label="Palette Workshop browser sections"/);
  for (const tab of ['sprites', 'palettes', 'tools']) {
    assert.match(page, new RegExp(`role="tab" aria-controls="${tab}"[^>]*data-tab="${tab}"`));
  }
  assert.match(page, /aria-label="Find sprites or palettes by group,index" aria-describedby="status"/);
  assert.match(page, /id="status" role="status" aria-live="polite"/);
  assert.match(page, /role="group" aria-label="Sprite results"/);
  assert.match(page, /role="group" aria-label="Palette results"/);
  assert.match(page, /id="companionWaiting"[^>]*role="status" aria-live="polite"/);
  for (const pane of ['banks', 'remap', 'layers', 'masks']) {
    assert.match(page, new RegExp(`role="tab" aria-controls="companion-pane-${pane}"[^>]*data-pane="${pane}"`));
    assert.match(page, new RegExp(`id="companion-pane-${pane}" role="tabpanel"`));
  }
  assert.match(page, /aria-controls="companion-pane-banks" aria-selected="true" tabindex="0" data-pane="banks"/,
    'Banks is programmatically selected before the first bridge snapshot');
  for (const pane of ['remap', 'layers', 'masks']) assert.match(page,
    new RegExp(`aria-controls="companion-pane-${pane}" aria-selected="false" tabindex="-1" data-pane="${pane}"`));
  assert.match(page, /button\.setAttribute\('aria-pressed',String\(active\)\)/);
  assert.match(page, /No ['"]\+kind\+['"]s match this search/);
  assert.match(page, /visibleCount\+' \/ '\+total/);
  assert.match(page, /\['ArrowLeft','ArrowRight','Home','End'\]/,
    'both tablists expose conventional keyboard navigation');
  assert.match(page, /render=\(\)=>\{basePaletteBrowserRender\(\);updatePaletteBrowserAccessibility\(\)\}/,
    'every later tab, filter, and model render reapplies accessibility state');

  const start = page.indexOf('function bindPaletteTabKeyboard');
  const end = page.indexOf("document.querySelectorAll('[role=\"tablist\"]')", start);
  const sandbox = { bind: null };
  vm.createContext(sandbox);
  vm.runInContext(`${page.slice(start, end)};bind=bindPaletteTabKeyboard`, sandbox);
  for (const name of ['browser tabs', 'control-pane tabs']) {
    let listener, prevented = false, focused = -1, clicked = -1;
    const tabs = [0, 1, 2].map(index => ({
      getAttribute: key => key === 'role' ? 'tab' : null,
      focus: () => { focused = index; },
      click: () => { clicked = index; }
    }));
    const list = { addEventListener(type, fn) { assert.strictEqual(type, 'keydown'); listener = fn; }, querySelectorAll() { return tabs; } };
    sandbox.bind(list);
    listener({ target: tabs[0], key: 'ArrowRight', preventDefault() { prevented = true; } });
    assert(prevented, `${name} consumes its navigation key`);
    assert.strictEqual(focused, 1, `${name} moves focus to the next tab`);
    assert.strictEqual(clicked, 1, `${name} activates the next tab`);
  }

  console.log('Palette companion tabs, search, selection, result counts, and empty states expose stable accessibility semantics');
} finally {
  Module._load = original;
}
