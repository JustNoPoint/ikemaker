'use strict';

const assert = require('assert');
const { MAX_ROWS, createVisualAuthoringBrowser } = require('../src/visual_authoring_browser_model');

const browser=createVisualAuthoringBrowser([
  {identity:'line:10:bg:floor',label:'Floor',description:'normal · layer 0 · sprite 1,0',kind:'sprite',thumbnailKey:'1,0',source:{line:10},actions:[{id:'open-source',label:'Open source'},{id:'duplicate',label:'Duplicate',mutating:true}]},
  {identity:'line:20:bg:clouds',label:'Clouds',description:'anim · layer 1 · Action 50',kind:'animation',source:{line:20},actions:[{id:'open-source',label:'Open source'},{id:'open-action',label:'Open action'}]}
],{binding:'D:/stage.def#HASH'});
const all=browser.snapshot({view:'thumbnails'});
assert.strictEqual(all.view,'thumbnails');
assert.deepStrictEqual(all.kinds,['animation','sprite']);
assert.deepStrictEqual(browser.snapshot({query:'action 50'}).rows.map(row=>row.label),['Clouds']);
assert.deepStrictEqual(browser.snapshot({kind:'sprite'}).rows.map(row=>row.label),['Floor']);
const floor=all.rows.find(row=>row.label==='Floor'),resolved=browser.resolve({type:'visualBrowserAction',binding:all.binding,rowId:floor.id,actionId:'duplicate'});
assert.deepStrictEqual(resolved.source,{line:10});
assert.strictEqual(resolved.row.actions.find(action=>action.id==='duplicate').mutating,true);
assert.strictEqual(browser.resolve({type:'visualBrowserAction',binding:all.binding,rowId:floor.id,actionId:'forged'}),null);
assert.strictEqual(browser.resolve({type:'visualBrowserAction',binding:all.binding,rowId:floor.id,actionId:'open-source',source:{line:999}}),null,'context messages cannot inject source DTOs');
const capped=createVisualAuthoringBrowser(Array.from({length:MAX_ROWS+2},(_,index)=>({identity:String(index),label:String(index)}))).snapshot();
assert.strictEqual(capped.rows.length,MAX_ROWS);assert.strictEqual(capped.truncated,true);
console.log('Shared visual authoring browser projection and contextual action contract tests passed');
