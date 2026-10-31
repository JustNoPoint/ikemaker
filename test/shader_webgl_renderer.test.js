'use strict';

const assert=require('assert');
const {createProgramResources,configureTexture,releaseTextureCache,rendererClientScript}=require('../src/shader_webgl_renderer');
const {createShaderProject}=require('../src/shader_workshop_model');
const {normalizeShaderPreview}=require('../src/shader_preview_model');
const {createShaderRenderContract}=require('../src/shader_render_contract');
const calls=[],gl={VERTEX_SHADER:1,FRAGMENT_SHADER:2,COMPILE_STATUS:3,LINK_STATUS:4,TEXTURE_2D:5,TEXTURE_MIN_FILTER:6,TEXTURE_MAG_FILTER:7,TEXTURE_WRAP_S:8,TEXTURE_WRAP_T:9,NEAREST:10,CLAMP_TO_EDGE:11,createShader:type=>({type}),shaderSource:(...v)=>calls.push(['source',...v]),compileShader:value=>calls.push(['compile',value]),getShaderParameter:()=>true,getShaderInfoLog:()=>'',deleteShader:value=>calls.push(['deleteShader',value]),createProgram:()=>({program:true}),attachShader:()=>{},linkProgram:()=>{},getProgramParameter:()=>true,getProgramInfoLog:()=>'',deleteProgram:value=>calls.push(['deleteProgram',value]),bindTexture:()=>{},texParameteri:(...v)=>calls.push(['parameter',...v]),deleteTexture:value=>calls.push(['deleteTexture',value])};
const resources=createProgramResources(gl,{vertex:'void main(){}',fragment:'void main(){}'});resources.dispose();resources.dispose();assert.strictEqual(calls.filter(item=>item[0]==='deleteProgram').length,1,'program cleanup is idempotent');
configureTexture(gl,{});assert.deepStrictEqual(calls.filter(item=>item[0]==='parameter').map(item=>item.at(-1)),[10,10,11,11]);
const cache=new Map([[1,{id:1}],[2,{id:2}]]);releaseTextureCache(gl,cache);assert.strictEqual(cache.size,0);assert.strictEqual(calls.filter(item=>item[0]==='deleteTexture').length,2);
const failed={...gl,getShaderParameter:()=>false,getShaderInfoLog:()=>'<script>driver detail</script>'};assert.throws(()=>createProgramResources(failed,{vertex:'bad',fragment:'bad'}),/script/);
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',preview=normalizeShaderPreview({sourceKind:'sff',frames:[{dataUri:png}]});
const contract=createShaderRenderContract(createShaderProject({id:'renderer',now:1}),preview),script=rendererClientScript(contract);assert(script.includes("getContext('webgl2'")&&script.includes("getContext('webgl'")&&script.includes('textures.size>2')&&script.includes('webglcontextlost')&&script.includes('visibilitychange')&&script.includes('ikemakerShaderRenderFrame'));assert(!script.includes('fetch(')&&!script.includes('eval('));
assert.throws(()=>rendererClientScript({...contract,shader:{...contract.shader,schema:'forged',fragment:'void main(){}'}}),/trusted Shader Workshop render contract/);
console.log('Shader WebGL renderer bounds compilation, sampler state, texture cache, and cleanup');
