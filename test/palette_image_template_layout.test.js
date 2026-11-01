'use strict';

const assert = require('assert');
const layout = require('../src/palette_image_template_layout');

const images=[{imageId:'idle',width:200,height:263},{imageId:'kick',width:280,height:220},{imageId:'effect',width:360,height:140}];
let draft=layout.normalize({},images);
assert.deepStrictEqual(draft.items.map(item=>[item.imageId,item.x,item.y]),[['idle',0,0],['kick',205,0],['effect',0,268]],'new representative images are packed with the reviewed 5-pixel solid-art spacing onto an automatically growing canvas');
assert.deepStrictEqual(draft.canvas,{width:485,height:408});
const previousHash=draft.layoutHash;
draft=layout.move(draft,draft.layoutHash,'effect',{x:500,y:430},images);
assert.deepStrictEqual(draft.canvas,{width:860,height:570},'dragging an image beyond the current edge grows the canvas to contain it');
assert.throws(()=>layout.move(draft,previousHash,'idle',{x:10,y:10},images),/changed before this move/,'stale drag results cannot overwrite a newer layout');
const retained=layout.normalize(draft,[images[0],images[2],{imageId:'new-frame',width:90,height:120}]);
assert.deepStrictEqual(retained.items.slice(0,2).map(item=>[item.imageId,item.x,item.y]),[['idle',0,0],['effect',500,430]],'removing or adding frames preserves surviving manual placement');
assert.deepStrictEqual(retained.items[2],{imageId:'new-frame',width:90,height:120,x:0,y:575},'new artwork is packed below retained manual placement instead of overlapping it at the origin');
assert(retained.canvas.width>=860&&retained.canvas.height>=695,'the canvas never clips surviving placement or newly packed artwork');
assert.throws(()=>layout.move(retained,retained.layoutHash,'removed-frame',{x:1,y:1},[images[0],images[2],{imageId:'new-frame',width:90,height:120}]),/no longer included/,'a stale thumbnail or injected image identity cannot create a no-op layout revision');
assert.throws(()=>layout.move(retained,retained.layoutHash,'idle',{x:Number.MAX_SAFE_INTEGER+1,y:0},[images[0],images[2],{imageId:'new-frame',width:90,height:120}]),/safe integer/,'unbounded drag coordinates fail closed');

console.log('Palette image-template automatic canvas growth and retained placement tests passed');
