'use strict';

const { requirePreviewAllowed } = require('./shader_safeguard_policy');

const EFFECTS = Object.freeze([
  effect('passthrough','Unmodified',{},{}),
  effect('palette-tint','Palette Tint',{tint:color([0.2,0.55,1,1]),amount:number(0.35,0,1)},{changesRgb:true,breaksIndexedBehavior:true}),
  effect('grayscale','Grayscale',{amount:number(1,0,1)},{changesRgb:true,breaksIndexedBehavior:true}),
  effect('hit-flash','Hit Flash',{color:color([1,1,1,1]),amount:number(0.8,0,1)},{changesRgb:true,breaksIndexedBehavior:true}),
  // Pixelation preserves the palette's set of colors, but deliberately changes
  // which RGB value occupies an output pixel. It cannot claim the stronger
  // per-pixel palette-color safeguard.
  effect('pixelate','Pixelate',{pixelSize:number(4,1,64)},{changesRgb:true})
]);
const BY_ID = new Map(EFFECTS.map(item=>[item.id,item]));
function number(defaultValue,min,max){return Object.freeze({kind:'number',defaultValue,min,max});}
function color(defaultValue){return Object.freeze({kind:'color',defaultValue:Object.freeze(defaultValue)});}
function effect(id,label,parameters,capabilities){return Object.freeze({id,label,trusted:true,parameters:Object.freeze(parameters),capabilities:Object.freeze({changesRgb:false,addsVisiblePixels:false,changesAlpha:false,changesSilhouette:false,neighborSampling:false,breaksIndexedBehavior:false,...capabilities})});}
function finite(value,fallback,min,max){const number=Number(value);return Number.isFinite(number)?Math.max(min,Math.min(max,number)):fallback;}
function normalizeParameters(effect,values={}){
  const result={};
  for(const [id,schema] of Object.entries(effect.parameters)){
    if(schema.kind==='number')result[id]=finite(values[id],schema.defaultValue,schema.min,schema.max);
    else result[id]=Object.freeze(schema.defaultValue.map((fallback,index)=>finite(Array.isArray(values[id])?values[id][index]:undefined,fallback,0,1)));
  }
  return Object.freeze(result);
}
function float(value){const text=Number(value).toFixed(6).replace(/0+$/,'').replace(/\.$/,'');return text.includes('.')?text:`${text}.0`;}
function vec4(value){return `vec4(${value.map(float).join(', ')})`;}
function body(effect,parameters){
  if(effect.id==='palette-tint')return `color.rgb = mix(color.rgb, ${vec4(parameters.tint)}.rgb, ${float(parameters.amount)});`;
  if(effect.id==='grayscale')return `float luminance = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));\n  color.rgb = mix(color.rgb, vec3(luminance), ${float(parameters.amount)});`;
  if(effect.id==='hit-flash')return `color.rgb = mix(color.rgb, ${vec4(parameters.color)}.rgb, ${float(parameters.amount)});`;
  if(effect.id==='pixelate')return `vec2 safeSize = max(uTextureSize, vec2(1.0));\n  vec2 cell = vec2(${float(parameters.pixelSize)}) / safeSize;\n  sampleUv = (floor(vUv / cell) + vec2(0.5)) * cell;\n  color = texture(uTexture, clamp(sampleUv, vec2(0.0), vec2(1.0)));`;
  return '';
}
function compileTrustedEffect(project, effectId=project?.presetId, values={}){
  if(project?.mode!=='preset')throw new Error('Only trusted preset effects can execute in the initial Shader Workshop renderer.');
  const effect=BY_ID.get(effectId);if(!effect)throw new Error('Unknown or untrusted shader effect.');
  const policy=requirePreviewAllowed(project,effect),parameters=normalizeParameters(effect,values),effectBody=body(effect,parameters);
  const vertex='#version 300 es\nprecision highp float;\nin vec2 aPosition;\nin vec2 aUv;\nout vec2 vUv;\nvoid main(){vUv=aUv;gl_Position=vec4(aPosition,0.0,1.0);}';
  const fragment=`#version 300 es\nprecision highp float;\nuniform sampler2D uTexture;\nuniform vec2 uTextureSize;\nin vec2 vUv;\nout vec4 outColor;\nvoid main(){\n  vec2 sampleUv = vUv;\n  vec4 sourceColor = texture(uTexture, clamp(vUv, vec2(0.0), vec2(1.0)));\n  vec4 color = sourceColor;${effectBody?`\n  ${effectBody}`:''}\n  if (sourceColor.a <= 0.0) color = vec4(0.0);\n  color.a = sourceColor.a;\n  outColor = clamp(color, 0.0, 1.0);\n}`;
  const fallbackBody=effectBody.replaceAll('texture(','texture2D('),fallback=Object.freeze({vertex:'precision highp float;\nattribute vec2 aPosition;\nattribute vec2 aUv;\nvarying vec2 vUv;\nvoid main(){vUv=aUv;gl_Position=vec4(aPosition,0.0,1.0);}',fragment:`precision highp float;\nuniform sampler2D uTexture;\nuniform vec2 uTextureSize;\nvarying vec2 vUv;\nvoid main(){\n  vec2 sampleUv = vUv;\n  vec4 sourceColor = texture2D(uTexture, clamp(vUv, vec2(0.0), vec2(1.0)));\n  vec4 color = sourceColor;${fallbackBody?`\n  ${fallbackBody}`:''}\n  if (sourceColor.a <= 0.0) color = vec4(0.0);\n  color.a = sourceColor.a;\n  gl_FragColor = clamp(color, 0.0, 1.0);\n}`});
  return Object.freeze({schema:'ikemaker.trusted-shader/v1',effectId:effect.id,label:effect.label,parameters,policy,vertex,fragment,fallback,sampler:Object.freeze({min:'nearest',mag:'nearest',wrapS:'clamp-to-edge',wrapT:'clamp-to-edge'})});
}

module.exports={EFFECTS,BY_ID,normalizeParameters,compileTrustedEffect};
