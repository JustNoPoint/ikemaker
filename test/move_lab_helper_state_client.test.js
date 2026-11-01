'use strict';

const assert=require('assert');
const {clientScript}=require('../src/move_lab_direct_component');

const source=clientScript();
assert(source.includes('data-helper-state-route'));
assert(source.includes("type:'openHelperStateRoute',route"));
assert(source.includes('Starting StateDef '));
assert(source.includes('Starting StateDef unresolved'));
assert(source.includes('button.disabled=true'),'the one-use Helper route disables immediately on dispatch');
console.log('Move Lab Helper state client exposes one compact exact-route control without an inferred fallback');
