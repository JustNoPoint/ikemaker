'use strict';

const assert = require('assert');
const crypto = require('crypto');
const { rgbaPng } = require('../src/sff_reader');
const { proposeCreatorAxes } = require('../src/sff_creator_auto_axis');

const images = new Map();
function source(id, points) { const rgba = Buffer.alloc(12 * 12 * 4); for (const [x,y] of points) rgba[(y*12+x)*4+3]=255; const bytes=rgbaPng(12,12,rgba), path=`/${id}.png`; images.set(path,bytes); return {id,name:`${id}.png`,path,byteHash:crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase()}; }
function rect(left,top,right,bottom){const points=[];for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++)points.push([x,y]);return points;}
const a=source('a',rect(2,3,4,7)),b=source('b',rect(4,4,6,8)),c=source('c',rect(4,4,6,8)),fs={readFileSync:path=>images.get(path)};
const rows=[{sourceId:'a',axisX:3,axisY:8},{sourceId:'b',axisX:0,axisY:0},{sourceId:'c',axisX:5,axisY:9}];
const anchor=proposeCreatorAxes(fs,[a,b,c],rows,['b'],{mode:'anchor',anchor:'bottom-center',maximumDelta:20});
assert.deepStrictEqual([anchor[0].proposedAxisX,anchor[0].proposedAxisY],[5,9]);
const croppedRows=[{sourceId:'a',axisX:1,axisY:5,cropMode:'before-axis',cropBounds:{x:2,y:3,width:3,height:5}},{sourceId:'b',axisX:0,axisY:0,cropMode:'none'}];
const croppedAnchor=proposeCreatorAxes(fs,[a,b],croppedRows,['a'],{mode:'anchor',anchor:'bottom-center',maximumDelta:20});
assert.deepStrictEqual([croppedAnchor[0].proposedAxisX,croppedAnchor[0].proposedAxisY],[1,5],'Crop before axis must analyze and return cropped-image coordinates');
assert.strictEqual(croppedAnchor[0].evidence.sourceCoordinateBasis.stage,'after-reviewed-source-crop');
const croppedReference=proposeCreatorAxes(fs,[a,b],croppedRows,['a','b'],{mode:'reference',referenceIds:['a'],maximumDelta:20,maxOffset:8});
assert.deepStrictEqual([croppedReference[0].proposedAxisX,croppedReference[0].proposedAxisY],[5,9],'references and targets may safely use different reviewed crop coordinate spaces');
assert.deepStrictEqual(croppedReference[0].evidence.references.map(item=>item.coordinateBasis.stage),['after-reviewed-source-crop']);
const referenced=proposeCreatorAxes(fs,[a,b,c],rows,['a','b'],{mode:'reference',referenceIds:['a'],maximumDelta:20,maxOffset:8});
assert.deepStrictEqual([referenced[0].proposedAxisX,referenced[0].proposedAxisY],[5,9]);
assert.strictEqual(referenced[0].evidence.references.length,1);
const externalReference=proposeCreatorAxes(fs,[a,b],rows,['b'],{mode:'reference',referenceIds:['a'],maximumDelta:20,maxOffset:8});
assert.deepStrictEqual([externalReference[0].proposedAxisX,externalReference[0].proposedAxisY],[5,9],'a trusted reference may come from the attached target archive instead of the incoming target set');
const zeroOffset=proposeCreatorAxes(fs,[a,b],rows,['a','b'],{mode:'reference',referenceIds:['a'],maximumDelta:20,maxOffset:0});
assert.deepStrictEqual(zeroOffset[0].evidence.analysis.initial,{x:5,y:9});
assert.strictEqual(zeroOffset[0].evidence.maxOffset,0,'an explicit zero search radius must not become the default');
const consensus=proposeCreatorAxes(fs,[a,b,c],rows,['a','b','c'],{mode:'consensus',referenceIds:['a','c'],maximumDelta:20,maxOffset:8});
assert.strictEqual(consensus.length,1);
assert.strictEqual(consensus[0].blocked,false);
assert.throws(()=>proposeCreatorAxes(fs,[a],rows,['missing'],{}),/missing or blocked/);
assert.throws(()=>proposeCreatorAxes(fs,[a],rows,['a'],{mode:'reference'}),/trusted marked reference/);
console.log('SFF Creator automatic-axis proposal tests passed');
