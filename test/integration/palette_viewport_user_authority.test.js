'use strict';
const assert = require('assert');
const { chromium } = require('playwright');
const { installPaletteWorkshopViewport } = require('../../src/palette_workshop_viewport');
(async () => {
  const browser = await chromium.launch({ channel: process.env.PALETTE_TEST_BROWSER || 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
    await page.setContent('<body><div class="palette-desk"><div id="header" style="height:300px"></div><div id="sections"><div data-bank-card="A" style="height:4000px">Bank A</div></div></div></body>');
    await page.evaluate('(() => { window.finish = (' + installPaletteWorkshopViewport.toString() + ')(); addEventListener("message", finish); window.calls=[]; const original=window.scrollTo; window.scrollTo=function(...args){calls.push(args); return original.apply(this,args);}; })()');
    await page.evaluate(() => window.scrollTo(0, 900));
    await page.waitForTimeout(300);
    await page.evaluate(() => { calls.length=0; document.querySelector('#header').style.height='100px'; });
    await page.waitForTimeout(300);
    assert.strictEqual(await page.evaluate(() => calls.length), 0, 'no update transaction: settled user viewport must not be policed by permanent observers');
    assert.strictEqual(await page.evaluate(() => scrollY), 900);
    await page.evaluate(() => { calls.length=0; for(let i=0;i<20;i++) dispatchEvent(new MessageEvent('message', { data: { type: 'paletteWorkspaceSession' } })); });
    await page.waitForTimeout(100);
    assert.strictEqual(await page.evaluate(() => calls.length), 0, 'unchanged update bursts must not cancel native scrolling with same-position scrollTo');
    await page.waitForTimeout(2100);
    await page.evaluate(() => { calls.length=0; document.querySelector('#header').style.height='80px'; });
    await page.waitForTimeout(100);
    assert.strictEqual(await page.evaluate(() => calls.length), 0, 'completed update transaction must release its anchor');
    assert.strictEqual(await page.evaluate(() => scrollY), 900);
    // Passive updates during native smooth scrolling must not reclaim its
    // starting position between input and the compositor scroll events.
    await page.evaluate(() => { window.scrollTo(0, 0); calls.length=0; window.updates=setInterval(()=>dispatchEvent(new MessageEvent('message',{data:{type:'paletteWorkspaceSession'}})),20); });
    await page.keyboard.press('PageDown');
    await page.keyboard.press('PageDown');
    await page.keyboard.press('PageDown');
    await page.waitForTimeout(600);
    await page.evaluate(() => clearInterval(updates));
    assert(await page.evaluate(() => scrollY) > 1000, 'rapid passive updates must permit native PageDown movement');
    assert.strictEqual(await page.evaluate(() => calls.filter(args=>args[1]===0).length), 0, 'updates may not return a native scroll gesture to its start');
    console.log('palette_viewport_user_authority: PASS');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
