'use strict';

const assert = require('assert');
const { launchControlsHtml, launchControlsClientScript } = require('../src/launch_controls');
const { SLOTS } = require('../src/viewer_toolbar_contract');

const controls = launchControlsHtml();
const client = launchControlsClientScript();

assert(controls.includes('aria-label="Related work and IKEMEN launch shortcuts"'));
assert(controls.includes(':focus-visible'));
assert(controls.includes('prefers-reduced-motion'));
assert(controls.includes('forced-colors:active'));
assert(client.includes("querySelectorAll('button')"));
assert(client.includes("button.type='button'"));
assert(client.includes("setAttribute('aria-label'"));
assert(client.includes("querySelectorAll('input,select,textarea')"));
assert(client.includes("querySelectorAll('canvas')"));
assert(client.includes("querySelectorAll('img:not([alt])')"));

assert.strictEqual((controls.match(/data-universal-slot=/g)||[]).length,SLOTS.length);
assert(controls.includes('aria-disabled="true" aria-description='),'fixed unavailable slots expose an accessible reason');
assert(client.includes('universalToolbarBound'),'shared client binds the canonical strip once');

console.log('Webview accessibility foundation tests passed');
