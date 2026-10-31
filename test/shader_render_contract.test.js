'use strict';

const assert=require('assert');
const {createShaderProject}=require('../src/shader_workshop_model');
const {normalizeShaderPreview}=require('../src/shader_preview_model');
const {createShaderRenderContract,withGeneration,validateFrameRequest,MAX_PACKET_FRAMES}=require('../src/shader_render_contract');
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const preview=normalizeShaderPreview({sourceKind:'air',loopStart:1,frames:[0,1,2,3].map(index=>({id:String(index),dataUri:png,ticks:index+1}))}),project=createShaderProject({id:'render',now:1});
const contract=createShaderRenderContract(project,preview,3);
assert.strictEqual(contract.frames.length,MAX_PACKET_FRAMES);assert.deepStrictEqual(contract.frames.map(item=>item.index),[3,1]);assert.strictEqual(contract.claims.ikemenRuntimeEquivalent,false);
assert(!JSON.stringify(contract).includes('fetch(')&&!JSON.stringify(contract).includes('eval('));
const generated=withGeneration(contract,7);assert.strictEqual(validateFrameRequest({type:'shader.preview.frame',generation:7,index:2},generated),2);
assert.strictEqual(validateFrameRequest({type:'shader.preview.frame',generation:6,index:2},generated),false);assert.strictEqual(validateFrameRequest({type:'shader.preview.frame',generation:7,index:9},generated),false);assert.strictEqual(validateFrameRequest({type:'shader.preview.frame',generation:7,index:2,path:'forged'},generated),false);
console.log('Shader render contract carries only current/next frames and rejects stale or forged frame requests');
