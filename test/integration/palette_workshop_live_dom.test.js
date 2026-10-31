'use strict';
// Run with Playwright available via NODE_PATH; uses an installed Chromium browser.
const assert = require('assert');
const { chromium } = require('playwright');
const { sourceHtml } = require('../../src/palette_workspace_view');
const { protect } = require('../../src/webview_policy');
const session = {
  context: { kind: 'existing-sff', section: 'embedded' },
  target: { filename: 'live-dom.sff' }, sources: [],
  selection: { sprite: { physicalIndex: 0, group: 0, number: 0 }, palette: { physicalIndex: 0, group: 1, number: 1 } },
  facts: { preview: 'none', staged: 'none', embedded: 'saved', builtOutput: 'none', adoption: 'none' },
  stale: false, staleReasons: [], organizer: { semanticEntries: [] }
};
(async () => {
  const browser = await chromium.launch({ channel: process.env.PALETTE_TEST_BROWSER || 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.sent = [];
      window.acquireVsCodeApi = () => ({ getState: () => ({}), setState() {}, postMessage(message) { window.sent.push(message); } });
    });
    const html = protect(sourceHtml({ session, palettes: [{ physicalIndex: 0, group: 1, number: 1, colors: [[0, 0, 0, 0]] }] }));
    await page.route('http://workshop.test/', route => route.fulfill({ contentType: 'text/html', body: html }));
    await page.goto('http://workshop.test/');
    const advanced = page.locator('[data-tier="advanced"]');
    const box = await advanced.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.evaluate(session => window.dispatchEvent(new MessageEvent('message', { data: { type: 'paletteWorkspaceSession', session: { ...session, revision: 1 } } })), session);
    await page.mouse.up();
    assert.strictEqual(await page.locator('[data-tier="advanced"]').getAttribute('aria-pressed'), 'true');
    // Neither a model refresh nor bulk-gallery replay may detach disclosure
    // targets between the two halves of a real mouse gesture.
    for (const type of ['paletteWorkspaceModel', 'paletteBulkGallery']) {
      const details = page.locator('[data-section="sources-preflight"]');
      const wasOpen = await details.evaluate(node => node.open);
      const summary = details.locator(':scope > summary');
      const rect = await summary.boundingBox();
      await page.mouse.move(rect.x + 40, rect.y + rect.height / 2);
      await page.mouse.down();
      await page.evaluate(type => window.dispatchEvent(new MessageEvent('message', { data: { type, buildPlan: { ready: false, count: 0, items: [], target: { basename: 'test' } } } })), type);
      await page.mouse.up();
      assert.strictEqual(await details.evaluate(node => node.open), !wasOpen, type + ' must not swallow the disclosure click');
    }
    // Real step navigation and an open fallback catalog survive host updates.
    await page.locator('.tool-index > summary').click();
    await page.locator('[data-mode="template"]').click();
    await page.locator('#paletteStep-colors').click();
    await page.evaluate(session => {
      window.retainedTier = document.querySelector('[data-tier="advanced"]');
      window.retainedDisclosure = document.querySelector('[data-section="sources-preflight"]');
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'paletteWorkspaceSession', session: { ...session, revision: 2 } } }));
    }, session);
    assert.strictEqual(await page.locator('.tool-index').evaluate(node => node.open), true);
    assert.strictEqual(await page.locator('#paletteStep-colors').getAttribute('aria-selected'), 'true');
    assert.strictEqual(await page.evaluate(() => retainedTier === document.querySelector('[data-tier="advanced"]') && retainedDisclosure === document.querySelector('[data-section="sources-preflight"]')), true);
    const tallSession = { ...session, revision: 3, organizer: { semanticEntries: Array.from({ length: 100 }, (_, index) => ({ id: 'color-' + index, category: 'Keep', label: 'Color ' + index })) } };
    await page.evaluate(session => window.dispatchEvent(new MessageEvent('message', { data: { type: 'paletteWorkspaceSession', session } })), tallSession);
    await page.locator('[data-mode="create"]').click();
    await page.locator('#paletteStep-colors').click();
    await page.locator('[data-section="organize"]').evaluate(node => { node.open = true; });
    await page.evaluate(() => window.scrollTo(0, 900));
    const beforeScroll = await page.evaluate(() => window.scrollY);
    assert(beforeScroll > 0, 'fixture must have genuine scrollable workflow content');
    const changedSession = { ...tallSession, revision: 4, facts: { ...session.facts, preview: 'changed' } };
    await page.evaluate(session => window.dispatchEvent(new MessageEvent('message', { data: { type: 'paletteWorkspaceSession', session } })), changedSession);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.strictEqual(await page.evaluate(() => window.scrollY), beforeScroll, 'background refresh must not jump the outer viewport');
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight - innerHeight - 10));
    const deepScroll = await page.evaluate(() => window.scrollY);
    for (let revision = 5; revision < 10; revision++) {
      await page.evaluate(session => window.dispatchEvent(new MessageEvent('message', { data: { type: 'paletteWorkspaceSession', session } })), { ...changedSession, revision });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.strictEqual(await page.evaluate(() => window.scrollY), deepScroll, 'deep host refresh ' + revision);
    }
    await page.evaluate(session => window.dispatchEvent(new MessageEvent('message', { data: { type: 'paletteWorkspaceSession', session } })), changedSession);
    // An unchanged echo must not replace local forms or erase unsubmitted text.
    await page.locator('.semantic input').first().fill('Unsubmitted category');
    await page.evaluate(session => {
      window.retainedInput = document.querySelector('.semantic input');
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'paletteWorkspaceSession', session } }));
      window.scrollTo(0, 600);
    }, changedSession);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.strictEqual(await page.locator('.semantic input').first().inputValue(), 'Unsubmitted category');
    assert.strictEqual(await page.evaluate(() => retainedInput === document.querySelector('.semantic input')), true);
    assert.strictEqual(await page.evaluate(() => window.scrollY), 600, 'no queued restoration may override later scrolling');
    await page.evaluate(() => {
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'paletteWorkspaceModel', palettes: JSON.parse(JSON.stringify(data.palettes)), animations: JSON.parse(JSON.stringify(data.animations || [])), buildPlan: JSON.parse(JSON.stringify(data.buildPlan)) } }));
    });
    // Establish and repeat the exact model payload, whose arrays are newly
    // deserialized objects each time, without changing semantic content.
    await page.evaluate(() => {
      window.modelEchoInput = document.querySelector('.semantic input');
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'paletteWorkspaceModel', palettes: JSON.parse(JSON.stringify(data.palettes)), animations: JSON.parse(JSON.stringify(data.animations || [])), buildPlan: JSON.parse(JSON.stringify(data.buildPlan)) } }));
    });
    assert.strictEqual(await page.evaluate(() => modelEchoInput === document.querySelector('.semantic input')), true, 'identical newly deserialized models keep local controls mounted');
    // Real nested disclosure in Review & Build: replacing its body used to
    // close it, shorten the document, and clamp the deeply scrolled viewport.
    const plan = { ready: true, count: 100, target: { basename: 'live-dom.sff' }, items: Array.from({ length: 100 }, (_, i) => ({ kind: 'add', label: 'Reviewed palette ' + i })) };
    await page.evaluate(plan => {
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'paletteWorkspaceModel', buildPlan: plan } }));
      activeTier = 'advanced'; activeMode = 'modify'; activeStep = 'finish'; chooseExperience('advanced');
    }, plan);
    await page.locator('[data-section="plan-build"]').evaluate(node => { node.open = true; });
    await page.locator('[data-body="plan-build"] details').evaluate(node => { node.open = true; });
    await page.waitForTimeout(550);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight - innerHeight - 20));
    const nestedTop = await page.evaluate(() => window.scrollY);
    assert(nestedTop > 1000, 'review fixture must scroll genuinely deep');
    for (const type of ['paletteWorkspaceSession', 'paletteWorkspaceModel', 'paletteBulkGallery', 'paletteLibraryList', 'paletteLiveInteraction']) {
      await page.evaluate(({ type, session, plan }) => window.dispatchEvent(new MessageEvent('message', { data: { type, session, buildPlan: plan, model: null, items: [] } })), { type, session: { ...changedSession, revision: 100 }, plan: { ...plan, additions: 100 } });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.strictEqual(await page.locator('[data-body="plan-build"] details').evaluate(node => node.open), true, type + ' preserves nested disclosure');
      assert.strictEqual(await page.evaluate(() => window.scrollY), nestedTop, type + ' preserves deep scroll');
    }
    await page.evaluate(session => {
      for (let revision = 101; revision < 115; revision++) window.dispatchEvent(new MessageEvent('message', { data: { type: 'paletteWorkspaceSession', session: { ...session, revision } } }));
    }, changedSession);
    await page.waitForTimeout(650);
    assert.strictEqual(await page.evaluate(() => window.scrollY), nestedTop, 'rapid replay and delayed settlement preserve exact scroll');
    // A user gesture during stabilization cancels all outstanding restoration.
    await page.evaluate(session => window.dispatchEvent(new MessageEvent('message', { data: { type: 'paletteWorkspaceSession', session: { ...session, revision: 116 } } })), changedSession);
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(650);
    assert((await page.evaluate(() => window.scrollY)) < nestedTop, 'wheel scrolling wins over pending stabilization');
    // Exercise the real populated editor/list, not just their loading placeholders.
    await page.evaluate(() => {
      const palettes = Array.from({ length: 80 }, (_, i) => ({ physicalIndex: i, group: 1, number: i + 1, colors: [[0, 0, 0, 0]] }));
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'paletteWorkspaceModel', palettes } }));
      const colors = Array.from({ length: 256 }, (_, i) => [i, i, i, i ? 255 : 0]);
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'paletteLiveInteraction', model: { available: true, palette: palettes[0], colors, paletteBanks: [{ ...palettes[0], colors }], indexPlane: 'AQIDBA==', pixelPickToken: 'fixture', sprite: { group: 0, number: 0, width: 2, height: 2 }, interaction: { scope: 'index' } } } }));
      document.querySelector('.palette-desk').hidden = false;
      document.querySelector('[data-section="embedded"]').open = true;
      document.querySelector('[data-section="live-edit"]').open = true;
    });
    await page.waitForTimeout(550);
    assert.strictEqual(await page.locator('#spriteCanvas').count(), 1, 'real asynchronous sprite editor is attached');
    assert.strictEqual(await page.locator('.bank-editor').count(), 1, 'real asynchronous dual bank editor is attached');
    await page.evaluate(() => {
      document.querySelector('#embeddedPaletteFilter').focus({ preventScroll: true });
      document.querySelector('#embeddedPaletteList').scrollTop = 200;
      window.scrollTo(0, document.documentElement.scrollHeight - innerHeight - 25);
    });
    const populated = await page.evaluate(() => ({ top: scrollY, list: document.querySelector('#embeddedPaletteList').scrollTop }));
    assert(populated.list > 0, 'embedded list fixture must really scroll');
    for (let revision = 120; revision < 124; revision++) {
      await page.evaluate(session => window.dispatchEvent(new MessageEvent('message', { data: { type: 'paletteWorkspaceSession', session } })), { ...changedSession, revision });
      await page.waitForTimeout(30);
      assert.strictEqual(await page.evaluate(() => scrollY), populated.top, 'populated editor exact outer scroll');
      assert.strictEqual(await page.locator('#embeddedPaletteList').evaluate(node => node.scrollTop), populated.list, 'internal palette list scroll survives replacement');
      assert.strictEqual(await page.evaluate(() => document.activeElement.id), 'embeddedPaletteFilter', 'focus restored without scrolling');
    }
    // Delayed image decode and animation thumbnail changes must not move the
    // viewport while layout settles after an update.
    await page.evaluate(() => {
      const image = document.querySelector('#embeddedPaletteSprite');
      setTimeout(() => { image.hidden = false; image.src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="360"><rect width="64" height="360" fill="red"/></svg>'); }, 40);
    });
    await page.waitForTimeout(650);
    assert.strictEqual(await page.evaluate(() => scrollY), populated.top, 'delayed image layout preserves scroll');
    // PageDown followed by late toolbar/editor layout was the live 0.79.395
    // regression: numeric scrollY remained unchanged but visible content moved.
    await page.evaluate(() => { document.activeElement.blur(); window.scrollTo(0, 0); });
    for (let i = 0; i < 3; i++) await page.keyboard.press('PageDown');
    await page.waitForTimeout(750);
    await page.evaluate(session => dispatchEvent(new MessageEvent('message', { data: { type: 'paletteWorkspaceSession', session } })), changedSession);
    await page.waitForTimeout(600);
    const beforeLate = await page.locator('#embeddedPaletteTitle').evaluate(node => ({ y: node.getBoundingClientRect().top, scroll: scrollY }));
    assert(beforeLate.scroll > 0, 'PageDown must scroll the real workshop');
    await page.evaluate(() => {
      const late = document.createElement('div');
      late.dataset.lateToolbar = 'true'; late.style.height = '280px'; late.textContent = 'Deferred toolbar layout fixture';
      document.body.prepend(late);
    });
    await page.waitForTimeout(700);
    const afterLate = await page.locator('#embeddedPaletteTitle').evaluate(node => ({ y: node.getBoundingClientRect().top, scroll: scrollY }));
    assert.strictEqual(afterLate.y, beforeLate.y, 'late post-500ms layout preserves the visible content anchor');
    assert.strictEqual(afterLate.scroll, beforeLate.scroll + 280, 'scroll offset compensates for late content inserted above');
    await page.evaluate(() => document.querySelector('.step-tabs button')?.focus());
    await page.waitForTimeout(700);
    assert.strictEqual(await page.locator('#embeddedPaletteTitle').evaluate(node => node.getBoundingClientRect().top), beforeLate.y, 'late background focus must not move the content anchor');
    await page.keyboard.press('PageUp');
    await page.waitForTimeout(700);
    const afterPageUp = await page.evaluate(() => scrollY);
    assert(afterPageUp < afterLate.scroll, 'user PageUp still owns viewport');
    await page.waitForTimeout(700);
    assert.strictEqual(await page.evaluate(() => scrollY), afterPageUp, 'settled PageUp is not replayed to an older position');
    // Real deep Bank A viewport: no workflow heading is visible and the right
    // preview is sticky. A center-point/nth-child fallback anchors the wrong
    // column and cannot survive bank editor replacement.
    await page.evaluate(() => {
      document.activeElement.blur();
      const bank = document.querySelector('[data-bank-card="A"]');
      window.scrollTo(0, scrollY + bank.getBoundingClientRect().top - 120);
    });
    await page.waitForTimeout(750);
    await page.evaluate(session => dispatchEvent(new MessageEvent('message', { data: { type: 'paletteWorkspaceSession', session } })), changedSession);
    const deepBank = await page.locator('[data-bank-card="A"]').evaluate(node => ({ y: node.getBoundingClientRect().top, scroll: scrollY }));
    assert.strictEqual(deepBank.y, 120, 'Bank A must be at the actual visible top');
    assert.strictEqual(await page.locator('.live-preview').evaluate(node => getComputedStyle(node).position), 'sticky', 'fixture contains the misleading sticky preview');
    await page.evaluate(() => {
      window.oldBankEditor = document.querySelector('.bank-editor');
      enhanceRefresh();
      const extra = document.createElement('div'); extra.style.height = '280px'; extra.textContent = 'Late layout above deep bank editor';
      document.body.prepend(extra);
    });
    await page.waitForTimeout(1500);
    assert.strictEqual(await page.evaluate(() => oldBankEditor.isConnected), false, 'real bank editor replacement occurred');
    assert.strictEqual(await page.locator('[data-bank-card="A"]').evaluate(node => node.getBoundingClientRect().top), deepBank.y, 'replaced Bank A remains at the same visible offset');
    assert.strictEqual(await page.evaluate(() => scrollY), deepBank.scroll + 280, 'deep editor compensates for inserted header');
    await page.evaluate(session => {
      for (let revision = 200; revision < 205; revision++) window.dispatchEvent(new MessageEvent('message', { data: { type: 'paletteWorkspaceSession', session: { ...session, revision } } }));
    }, changedSession);
    await page.waitForTimeout(1500);
    assert.strictEqual(await page.locator('[data-bank-card="A"]').evaluate(node => node.getBoundingClientRect().top), deepBank.y, 'deep Bank A survives rapid host rebuilds and delayed enhancements');
    // Real AIR choices used to auto-request on every live projection. The host
    // preview then refreshed session projections and recursively restarted it.
    await page.evaluate(() => {
      data.animations=[{id:'idle',file:'fixture.air',number:0,frames:[{group:0,number:0,time:10}]}];
      sent.length=0;renderEmbeddedPalettes();
      for(let i=0;i<10;i++)renderEmbeddedPalettes();
    });
    assert.strictEqual(await page.evaluate(() => sent.filter(item=>item.action==='paletteAnimationPreview').length),1,'unchanged live rerenders request AIR preview only once');
    await page.evaluate(() => document.querySelector('#paletteAnimationReplay').click());
    assert.strictEqual(await page.evaluate(() => sent.filter(item=>item.action==='paletteAnimationPreview').length),2,'explicit Replay forces a fresh AIR preview');
    await page.evaluate(() => { session.target={...session.target,hash:'new-authority'};renderEmbeddedPalettes(); });
    assert.strictEqual(await page.evaluate(() => sent.filter(item=>item.action==='paletteAnimationPreview').length),3,'changed SFF evidence invalidates preview request cache');
    console.log('Palette Workshop live DOM: pointer races, disclosures, workflow navigation, scroll stability, AIR preview deduplication and replay-local-input preservation passed.');
    assert.deepStrictEqual(errors, []);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
